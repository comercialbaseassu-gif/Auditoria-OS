// @ts-nocheck
// Pure client-side parsing without external libraries.
// Respects the strict isolation requirement.

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

async function unzipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);
  
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP_EOCD_NOT_FOUND');
  
  const count = u16(eocd + 10);
  const cdOffset = u32(eocd + 16);
  let p = cdOffset;
  const entries = new Map();
  
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) throw new Error('ZIP_CENTRAL_DIR_INVALID');
    const method = u16(p + 10);
    const csize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const localOffset = u32(p + 42);
    
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    entries.set(name, { method, csize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  
  async function read(name: string) {
    const e = entries.get(name);
    if (!e) return null;
    let lp = e.localOffset;
    if (u32(lp) !== 0x04034b50) throw new Error('ZIP_LOCAL_INVALID');
    
    const nl = u16(lp + 26);
    const el = u16(lp + 28);
    const start = lp + 30 + nl + el;
    const data = bytes.slice(start, start + e.csize);
    
    if (e.method === 0) return data;
    if (e.method === 8) {
      // Use native decompression stream available in modern browsers
      const ds = new (window as any).DecompressionStream('deflate-raw');
      const ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(ab);
    }
    throw new Error('ZIP_COMPRESSION_UNSUPPORTED');
  }
  
  return { entries, read };
}

function xlsxCellValue(c: Element, shared: string[]) {
  const t = c.getAttribute('t');
  const v = c.querySelector(':scope > v');
  
  if (t === 'inlineStr') {
    return [...c.querySelectorAll('is t')].map(n => n.textContent).join('');
  }
  if (!v) return '';
  const raw = v.textContent || '';
  if (t === 's') return shared[Number(raw)] ?? '';
  if (t === 'b') return raw === '1' ? '1' : '0';
  return raw;
}

function colIndex(ref: string | null) {
  if (!ref) return 0;
  const m = ref.match(/([A-Z]+)\d+/i);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1].toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

async function parseXlsx(bytes: Uint8Array) {
  const z = await unzipEntries(bytes);
  
  const wbXml = await z.read('xl/workbook.xml');
  const relsXml = await z.read('xl/_rels/workbook.xml.rels');
  if (!wbXml || !relsXml) throw new Error('XLSX_INVALID_FORMAT');
  
  const wb = new DOMParser().parseFromString(new TextDecoder().decode(wbXml), 'application/xml');
  const relDoc = new DOMParser().parseFromString(new TextDecoder().decode(relsXml), 'application/xml');
  
  const relMap: Record<string, string> = {};
  [...relDoc.getElementsByTagNameNS('*', 'Relationship')].forEach(x => {
    relMap[x.getAttribute('Id') || ''] = x.getAttribute('Target') || '';
  });
  
  let shared: string[] = [];
  const sst = await z.read('xl/sharedStrings.xml');
  if (sst) {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(sst), 'application/xml');
    shared = [...doc.getElementsByTagNameNS('*', 'si')].map(si => 
      [...si.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('')
    );
  }
  
  let best: any[] = [];
  const sheets = [...wb.getElementsByTagNameNS('*', 'sheet')];
  
  for (const sh of sheets) {
    const target = relMap[sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id') || ''];
    if (!target) continue;
    
    const path = target.startsWith('/') ? target.slice(1) : ('xl/' + target.replace(/^\/+/, ''));
    const xml = await z.read(path);
    if (!xml) continue;
    
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
    const rows: any[] = [];
    let headers: string[] = [];
    
    for (const row of [...doc.getElementsByTagNameNS('*', 'row')]) {
      const cells = [...row.children].filter(x => x.localName === 'c');
      const obj: Record<number, string> = {};
      
      cells.forEach(c => {
        const ref = c.getAttribute('r');
        const idx = colIndex(ref);
        obj[idx] = xlsxCellValue(c, shared);
      });
      
      if (!headers.length) {
        const max = Math.max(-1, ...cells.map(c => colIndex(c.getAttribute('r'))));
        headers = Array.from({ length: max + 1 }, (_, i) => obj[i] ?? '');
        continue;
      }
      
      const out: Record<string, string> = {};
      let any = false;
      Object.entries(obj).forEach(([idx, v]) => {
        const h = headers[Number(idx)];
        if (h) {
          out[h] = v;
          if (v && v.trim() !== '') any = true;
        }
      });
      if (any) rows.push(out);
    }
    
    if (rows.length > best.length) best = rows;
  }
  
  if (!best.length) throw new Error('XLSX_EMPTY');
  return best;
}

function parseDelimitedText(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let headerIndex = -1;
  let delimiter = '\t';
  
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    for (const d of ['\t', '; ', ';', ',']) {
      if (line.includes(d) && /\bNota\b/i.test(line)) {
        headerIndex = i;
        delimiter = d.trim() === ';' ? ';' : d.trim() || '\t';
        break;
      }
    }
    if (headerIndex >= 0) break;
  }
  
  if (headerIndex < 0) {
    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      if (/(?:^|[\t;])Nota(?:[\t;]|$)/i.test(lines[i])) {
        headerIndex = i;
        delimiter = '\t';
        break;
      }
    }
  }
  
  if (headerIndex < 0) throw new Error('TEXT_HEADER_NOT_FOUND');
  
  const split = (s: string) => s.split(delimiter);
  const headers = split(lines[headerIndex]).map(x => x.trim().replace(/^"|"$/g, ''));
  const rows: any[] = [];
  
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = split(lines[i]);
    const o: Record<string, string> = {};
    headers.forEach((h, j) => {
      o[h] = String(parts[j] ?? '').trim().replace(/^"|"$/g, '');
    });
    if (Object.values(o).some(v => v && v.trim() !== '')) {
      rows.push(o);
    }
  }
  
  return rows;
}

export async function parseFile(file: File) {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isUtf16 = bytes.length > 1 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF));
  
  if (name.endsWith('.xlsx') && !isUtf16) {
    return await parseXlsx(bytes);
  }
  
  const text = new TextDecoder(isUtf16 ? (bytes[0] === 0xFF ? 'utf-16le' : 'utf-16be') : 'utf-8').decode(bytes);
  if (isUtf16 || name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.xls')) {
    try {
      return parseDelimitedText(text);
    } catch (e) {
      if (name.endsWith('.xlsx')) return await parseXlsx(bytes);
      throw e;
    }
  }
  
  return await parseXlsx(bytes);
}
