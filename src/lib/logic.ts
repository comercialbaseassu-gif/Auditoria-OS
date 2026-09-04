import { OSRecord, StatusInfo } from '../types';

export const norm = (s: string | undefined | null) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

export function val(o: any, keys: string[]): string {
  for (const k of keys) {
    const nk = norm(k);
    const key = Object.keys(o).find(x => norm(x) === nk);
    if (key !== undefined && o[key] !== undefined && o[key] !== null && String(o[key]).trim() !== '') {
      return o[key];
    }
  }
  return '';
}

export function nonEmpty(v: any): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

export function parseDate(v: any): Date | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + v * 86400000);
  }
  let s = String(v).trim();
  if (/^\d+(?:[\.,]\d+)?$/.test(s)) {
    const n = Number(s.replace(',', '.'));
    if (n > 20000 && n < 80000) {
      const base = new Date(Date.UTC(1899, 11, 30));
      return new Date(base.getTime() + n * 86400000);
    }
  }
  s = s.replace(/\s+/g, ' ');
  let m = s.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})(?:\s+(\d{1,2}):?(\d{2})?(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{4})[\-](\d{2})[\-](\d{2})(?:[ T](\d{1,2}):?(\d{2})?(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function combineDate(dateVal: any, timeVal: any): Date | null {
  if (!nonEmpty(dateVal)) return null;
  const d = parseDate(dateVal);
  if (!d) return null;
  if (nonEmpty(timeVal)) {
    const m = String(timeVal).match(/(\d{1,2}):?(\d{2})(?::(\d{2}))?/);
    if (m) d.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0);
  }
  return d;
}

export function detectRole(rows: any[]): 'exec' | 'op' | 'unknown' {
  const cols = new Set(rows.flatMap(r => Object.keys(r)).map(norm));
  const exec = ['statusretorno', 'dataexecfim', 'horaexecfim', 'latitudeexec', 'longitudeexec', 'tentativa', 'noprazo', 'statusuar', 'statusuario', 'encerram'];
  const op = ['vencimento', 'equipe', 'servico', 'nome', 'endereco', 'prioridade', 'atribuicao'];
  const scoreExec = exec.reduce((n, x) => n + (cols.has(norm(x)) ? 1 : 0), 0);
  const scoreOp = op.reduce((n, x) => n + (cols.has(norm(x)) ? 1 : 0), 0);
  return scoreExec > scoreOp ? 'exec' : scoreOp > scoreExec ? 'op' : 'unknown';
}

export function mergeByNote(rows: any[]) {
  const m = new Map<string, any[]>();
  for (const r of rows) {
    const nota = String(val(r, ['Nota', 'Nº do pedido', 'Nº do ped', 'Numero do ped'])).trim();
    if (!nota) continue;
    if (!m.has(nota)) m.set(nota, []);
    m.get(nota)!.push(r);
  }
  return m;
}

function statusInfo(A: any, B: any): StatusInfo {
  const raw = [val(B, ['StatusRetorno']), val(A, ['StatUsuár.', 'StatUsuario']), val(B, ['Tentativa']), val(A, ['StatSist']), val(A, ['Concl.desj'])].filter(nonEmpty).join(' ').toUpperCase();
  if (/\bVREL\b/.test(raw)) return { code: 'VREL', label: 'Realizada' };
  if (/\bVNRE\b/.test(raw)) return { code: 'VNRE', label: 'Visitada / não realizada' };
  if (/\bNVIS\b/.test(raw)) return { code: 'NVIS', label: 'Não visitada' };
  if (/\bCANC|ANUL\b/.test(raw)) return { code: 'CANC', label: 'Cancelada' };
  if (/\bRETI|REDI|CRRE|CRIA|RLIB|OBRA\b/.test(raw)) return { code: 'OUT', label: 'Outro status' };
  return { code: 'PEND', label: 'Pendente' };
}

function getExecDate(A: any, B: any) {
  return combineDate(val(B, ['DataExecFim']), val(B, ['HoraExecFim'])) || combineDate(val(A, ['Encerram.', 'Encerramento']), null) || combineDate(val(A, ['DataExecFim', 'DataExecFim']), val(A, ['HoraExecFim']));
}

function getCreateDate(A: any, B: any) {
  return parseDate(val(B, ['Criação', 'Criacao'])) || parseDate(val(A, ['Dt.criação', 'Dt.criacao']));
}

function getDueDate(A: any, B: any) {
  return parseDate(val(B, ['Vencimento'])) || parseDate(val(A, ['Concl.desj'])) || parseDate(val(A, ['Data']));
}

function explicitDeadline(A: any, B: any) {
  const v = val(B, ['NoPrazo']) || val(A, ['NoPrazo']);
  if (!nonEmpty(v)) return null;
  const n = norm(v);
  if (['sim', 's', 'yes'].includes(n)) return 'No prazo';
  if (['nao', 'n', 'no'].includes(n)) return 'Fora do prazo';
  return null;
}

export function buildRecord(n: string, Aarr: any[], Barr: any[]): OSRecord {
  const A = Aarr[Aarr.length - 1] || {};
  const B = Barr[Barr.length - 1] || {};
  
  const status = statusInfo(A, B);
  const created = getCreateDate(A, B);
  const due = getDueDate(A, B);
  const ended = getExecDate(A, B);
  const deadline = explicitDeadline(A, B);
  
  let prazo = 'Sem informação';
  if (deadline) prazo = deadline;
  else if (ended && due) prazo = ended <= due ? 'No prazo' : 'Fora do prazo';
  else if (!ended && due) {
    const now = new Date();
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    prazo = due < endToday ? 'Atrasada' : 'Pendente';
  }
  
  const equipe = String(val(B, ['Equipe', 'Atribuição', 'Atribuicao']) || val(A, ['Equipe', 'Depto.Resp', 'Depto.Res'])).trim() || 'Não informado';
  const tipo = String(val(B, ['Serviço', 'Servico']) || val(A, ['Texto grupo codific.', 'Texto grupo codific', 'Texto code codific.', 'Tp.'])).trim() || 'Não informado';
  const cidade = String(val(B, ['Cidade', 'Local']) || val(A, ['Local'])).trim() || 'Não informado';
  const cliente = String(val(B, ['Nome']) || val(A, ['Nome'])).trim();
  const endereco = String(val(B, ['Endereço', 'Endereco', 'Rua']) || val(A, ['Rua', 'Endereço'])).trim();
  const instalacao = String(val(B, ['Instalação', 'Instalacao']) || val(A, ['Instalacao'])).trim();
  const prioridade = String(val(B, ['Prioridade']) || val(A, ['Prioridade'])).trim();
  const tentativa = String(val(B, ['Tentativa']) || val(A, ['Tentativa'])).trim();
  
  const visited = status.code === 'VREL' || status.code === 'VNRE';
  const realized = status.code === 'VREL';
  const pending = !visited && status.code === 'PEND';
  const overdue = prazo === 'Atrasada';
  const risk = pending && (overdue || (due && ((due.getTime() - new Date().getTime()) <= 24 * 3600 * 1000)));

  // SLA
  let slaHoras = null;
  if (created && ended && ended.getTime() >= created.getTime()) {
    slaHoras = (ended.getTime() - created.getTime()) / (1000 * 60 * 60);
  }

  // Anomalias
  const anomalias: string[] = [];
  if (Aarr.length > 1 || Barr.length > 1) anomalias.push("Colisão de IDs (Nota Duplicada)");
  if (!Aarr.length || !Barr.length) anomalias.push("Registro Órfão (Falta cruzamento)");
  if (ended && created && ended.getTime() < created.getTime()) anomalias.push("Anomalia Temporal (Execução antes da criação)");
  if (ended && ended.getTime() > new Date().getTime()) anomalias.push("Anomalia Temporal (Data no futuro)");
  if (equipe === 'Não informado') anomalias.push("Schema Drift (Equipe não preenchida)");

  return {
    nota: n,
    A,
    B,
    status,
    prazo,
    equipe,
    tipo,
    cidade,
    cliente,
    endereco,
    instalacao,
    prioridade,
    tentativa,
    created,
    due,
    ended,
    visited,
    realized,
    pending,
    overdue,
    risk,
    sourceA: Aarr.length > 0,
    sourceB: Barr.length > 0,
    duplicateA: Aarr.length > 1,
    duplicateB: Barr.length > 1,
    slaHoras,
    anomalias,
    anomaliaCount: anomalias.length,
    isFirstTimeFix: false // Will be set after case association
  };
}

export function associateCases(recs: OSRecord[]) {
  const groups = new Map<string, OSRecord[]>();
  for (const r of recs) {
    const key = [r.instalacao || r.cliente || r.endereco, norm(r.tipo), norm(r.cidade)].join('|');
    if (!key.replace(/\|/g, '')) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  let caseNo = 1, reworkPairs = 0;
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.created?.getTime() || 0) - (b.created?.getTime() || 0));
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1], cur = arr[i];
      if (prev.created && cur.created && (cur.created.getTime() - prev.created.getTime()) <= 30 * 86400000) {
        const prevFailed = ['VNRE', 'NVIS'].includes(prev.status.code) || prev.status.code === 'OUT';
        const laterAttempt = /^[2-9]/.test(cur.tentativa);
        if (prevFailed || laterAttempt) {
          const caseId = prev.caso || `CASO-${String(caseNo++).padStart(4, '0')}`;
          prev.caso = caseId;
          cur.caso = caseId;
          prev.retrabalho = true;
          cur.retrabalho = true;
          reworkPairs++;
        }
      }
    }
  }
  const reworkOS = new Set(recs.filter(r => r.retrabalho).map(r => r.nota));
  const reworkCases = new Set(recs.filter(r => r.retrabalho && r.caso).map(r => r.caso));
  return { reworkOS: reworkOS.size, reworkCases: reworkCases.size, reworkPairs };
}

export function invalidDateCountFor(r: OSRecord) {
  let n = 0;
  const pairs = [
    [val(r.A, ['Dt.criação', 'Dt.criacao']), true],
    [val(r.A, ['Data']), true],
    [val(r.A, ['Encerram.', 'Encerramento']), false],
    [val(r.B, ['Criação', 'Criacao']), true],
    [val(r.B, ['Vencimento']), true],
    [val(r.B, ['DataExecFim']), true]
  ];
  for (const [v] of pairs) {
    if (nonEmpty(v) && !parseDate(v)) n++;
  }
  return n;
}

export function calcularMetricasAvancadas(records: OSRecord[]) {
  let totalSLA = 0, countSLA = 0;
  let totalFTFR = 0, countEncerradas = 0;

  records.forEach(r => {
    if (r.slaHoras !== null) {
      totalSLA += r.slaHoras;
      countSLA++;
    }
    if (r.visited) {
      countEncerradas++;
      if (r.isFirstTimeFix) totalFTFR++;
    }
  });

  const slaMedio = countSLA > 0 ? (totalSLA / countSLA).toFixed(1) : 'N/A';
  const ftfrPct = countEncerradas > 0 ? Math.round((totalFTFR / countEncerradas) * 100) : 0;

  return { slaMedio, ftfrPct };
}
