import React, { useState, useEffect, useMemo } from 'react';
import { LayoutGrid, Search, Users, Database, Menu, UploadCloud, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { parseFile } from './lib/parser';
import { detectRole, mergeByNote, buildRecord, associateCases, invalidDateCountFor, norm } from './lib/logic';
import { OSRecord, DiagnosticInfo } from './types';
import { Storytelling } from './components/Storytelling';
import { DonutChart, BarChart } from './components/Charts';

type ViewType = 'overview' | 'auditoria' | 'equipes' | 'dados';

export default function App() {
  const [view, setView] = useState<ViewType>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Pronto');
  const [toast, setToast] = useState('');
  
  const [selectedRecord, setSelectedRecord] = useState<OSRecord | null>(null);

  const [base1, setBase1] = useState<any[]>([]);
  const [base2, setBase2] = useState<any[]>([]);
  const [base1Name, setBase1Name] = useState('');
  const [base2Name, setBase2Name] = useState('');

  const [records, setRecords] = useState<OSRecord[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [filters, setFilters] = useState({
    q: '',
    status: '',
    equipe: '',
    tipo: '',
    dateFrom: '',
    dateTo: '',
    dateField: 'due'
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      showToast('Erro: Arquivo excede o limite seguro de 25MB para processamento local.');
      return;
    }

    setLoading(true);
    setStatusText(`Analisando ${file.name}...`);
    try {
      const rows = await parseFile(file);
      if (!rows.length) throw new Error('EMPTY_OR_CORRUPTED');

      if (slot === 'A') {
        setBase1(rows);
        setBase1Name(file.name);
      } else {
        setBase2(rows);
        setBase2Name(file.name);
      }
      showToast(`${rows.length.toLocaleString('pt-BR')} registros extraídos com sucesso.`);
    } catch (err) {
      console.error(err);
      showToast('Falha crítica na leitura. Estrutura inconsistente ou corrompida.');
    } finally {
      setLoading(false);
      setStatusText('Pronto');
    }
  };

  const injectMockData = () => {
    const mockOp = [];
    const mockExec = [];
    const baseDate = new Date();
    
    for (let i = 1; i <= 200; i++) {
      const nota = `OS-${1000 + i}`;
      const pastDate = new Date(baseDate.getTime() - (Math.random() * 10 * 86400000));
      
      mockOp.push({
        'Nota': nota,
        'Equipe': i % 3 === 0 ? 'Equipe Alpha' : 'Equipe Beta',
        'Serviço': 'Manutenção Preventiva',
        'Criação': pastDate.toISOString(),
        'Vencimento': new Date(pastDate.getTime() + 86400000 * 2).toISOString(),
      });
  
      if (i % 20 !== 0) {
        mockExec.push({
          'Nota': nota,
          'StatusRetorno': i % 5 === 0 ? 'VNRE' : 'VREL',
          'DataExecFim': new Date(pastDate.getTime() + (Math.random() * 4 * 86400000)).toISOString(),
          'Tentativa': i % 15 === 0 ? '2' : '1'
        });
      }
    }
  
    // Injetando anomalia coletiva: Duplicata
    mockOp.push(mockOp[0]);
  
    setBase1(mockOp);
    setBase2(mockExec);
    setBase1Name("dados_sinteticos_op.csv");
    setBase2Name("dados_sinteticos_exec.csv");
    showToast("Dados sintéticos gerados com sucesso.");
  };

  useEffect(() => {
    if (base1.length && base2.length) {
      const r1 = base1;
      const r2 = base2;
      let role1 = detectRole(r1);
      let role2 = detectRole(r2);

      if (role1 === 'unknown' && role2 !== 'unknown') role1 = role2 === 'exec' ? 'op' : 'exec';
      if (role2 === 'unknown' && role1 !== 'unknown') role2 = role1 === 'exec' ? 'op' : 'exec';

      let sourceExec = r1, sourceOp = r2;
      if (role1 === 'exec' && role2 === 'op') { sourceExec = r1; sourceOp = r2; }
      else if (role2 === 'exec' && role1 === 'op') { sourceExec = r2; sourceOp = r1; }

      const execMap = mergeByNote(sourceExec);
      const opMap = mergeByNote(sourceOp);
      const notes = Array.from(new Set([...execMap.keys(), ...opMap.keys()]));

      const recs = notes.map(n => buildRecord(n, execMap.get(n) || [], opMap.get(n) || []));
      const reworkCount = associateCases(recs);

      // Calculando FTFR após associar casos de retrabalho
      recs.forEach(r => {
        r.isFirstTimeFix = r.status.code === 'VREL' && (!r.tentativa || r.tentativa === '1') && !r.retrabalho;
      });

      setRecords(recs);
      setDiagnostic({
        execRows: sourceExec.length,
        opRows: sourceOp.length,
        uniqueOS: recs.length,
        matched: recs.filter(r => r.sourceA && r.sourceB).length,
        onlyExec: recs.filter(r => r.sourceA && !r.sourceB).length,
        onlyOp: recs.filter(r => !r.sourceA && r.sourceB).length,
        duplicateNotes: recs.filter(r => r.duplicateA || r.duplicateB).length,
        invalidDates: recs.reduce((n, r) => n + invalidDateCountFor(r), 0),
        rework: reworkCount.reworkOS,
        reworkCases: reworkCount.reworkCases,
        reworkPairs: reworkCount.reworkPairs
      });
      setStatusText(`${recs.length.toLocaleString('pt-BR')} OS analisadas`);
    }
  }, [base1, base2]);

  const filtered = useMemo(() => {
    const q = norm(filters.q);
    return records.filter(r => {
      if (filters.status && r.status.code !== filters.status) return false;
      if (filters.equipe && r.equipe !== filters.equipe) return false;
      if (filters.tipo && r.tipo !== filters.tipo) return false;
      if (q) {
        const searchString = norm([r.nota, r.status.label, r.cliente, r.endereco, r.cidade, r.equipe, r.tipo, r.instalacao].join(' '));
        if (!searchString.includes(q)) return false;
      }

      let d = filters.dateField === 'created' ? r.created : filters.dateField === 'ended' ? r.ended : r.due;
      const from = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00') : null;
      const to = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59.999') : null;
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;

      return true;
    });
  }, [records, filters]);

  const dateFmt = (d: Date | null) => d ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d) : '—';

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ['Nota','Status','CodigoStatus','Prazo','Servico','Equipe','Cliente','Instalacao','Endereco','Cidade','Criacao','Vencimento','Execucao','Prioridade','Tentativa','Retrabalho','Caso','EmRisco','Origem'];
    const lines = [headers.join(';')];
    for (const r of filtered) {
      const vals = [r.nota, r.status.label, r.status.code, r.prazo, r.tipo, r.equipe, r.cliente, r.instalacao, r.endereco, r.cidade, dateFmt(r.created), dateFmt(r.due), dateFmt(r.ended), r.prioridade, r.tentativa, r.retrabalho ? 'Sim' : 'Não', r.caso || '', r.risk ? 'Sim' : 'Não', r.sourceA && r.sourceB ? '2 bases' : r.sourceA ? 'Execução' : 'Operacional'];
      lines.push(vals.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';'));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'auditoria_os_exportacao.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('Exportação concluída.');
  };

  const clearAll = () => {
    setBase1([]); setBase2([]);
    setBase1Name(''); setBase2Name('');
    setRecords([]); setDiagnostic(null);
    setFilters({ q: '', status: '', equipe: '', tipo: '', dateFrom: '', dateTo: '', dateField: 'due' });
    setPage(1);
    showToast('Dados removidos da sessão.');
    setStatusText('Pronto');
  };

  const statusPill = (s: OSRecord['status']) => {
    const colors: Record<string, string> = {
      VREL: 'bg-[#078C281e] text-[#86df9e] border-[#078C2840]',
      VNRE: 'bg-[#efb84f1a] text-[#ffd37f] border-[#efb84f38]',
      NVIS: 'bg-[#ef6a741a] text-[#ff929a] border-[#ef6a7438]',
      CANC: 'bg-[#10212a] text-[#b4c3c9] border-[#1b3744]',
      PEND: 'bg-[#049DD91a] text-[#79dcff] border-[#049DD93d]',
      OUT: 'bg-[#049DD91a] text-[#79dcff] border-[#049DD93d]',
    };
    return <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${colors[s.code] || colors.PEND}`}>{s.label}</span>;
  };

  const prazoPill = (s: string) => {
    const colors: Record<string, string> = {
      'No prazo': 'bg-[#078C281e] text-[#86df9e] border-[#078C2840]',
      'Fora do prazo': 'bg-[#ef6a741a] text-[#ff929a] border-[#ef6a7438]',
      'Atrasada': 'bg-[#ef6a741a] text-[#ff929a] border-[#ef6a7438]',
      'Pendente': 'bg-[#efb84f1a] text-[#ffd37f] border-[#efb84f38]',
    };
    const color = colors[s] || 'bg-[#10212a] text-[#b4c3c9] border-[#1b3744]';
    return <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${color}`}>{s}</span>;
  };

  const navItems = [
    { id: 'overview', icon: LayoutGrid, label: 'Visão Geral' },
    { id: 'auditoria', icon: Search, label: 'Auditoria' },
    { id: 'equipes', icon: Users, label: 'Equipes' },
    { id: 'dados', icon: Database, label: 'Dados' }
  ];

  const filterBarHTML = (
    <div className="sticky top-0 z-10 bg-[#071017f2] backdrop-blur-md border-b border-[#1d3642] -mx-5 -mt-5 mb-4 p-4 flex gap-3 items-end flex-wrap">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[#9fb0b8] uppercase tracking-wider">Pesquisar</label>
        <input 
          className="bg-[#0b1921] text-white border border-[#1d3642] rounded-md px-3 py-2 text-sm outline-none focus:border-cyan-500 w-full md:min-w-[250px]"
          placeholder="Nota, cliente, endereço..."
          value={filters.q}
          onChange={e => { setFilters({ ...filters, q: e.target.value }); setPage(1); }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[#9fb0b8] uppercase tracking-wider">Status</label>
        <select 
          className="bg-[#0b1921] text-white border border-[#1d3642] rounded-md px-3 py-2 text-sm outline-none focus:border-cyan-500"
          value={filters.status} onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
        >
          <option value="">Todos</option>
          <option value="VREL">Realizada</option>
          <option value="VNRE">Visitada / não realizada</option>
          <option value="NVIS">Não visitada</option>
          <option value="PEND">Pendente</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[#9fb0b8] uppercase tracking-wider">Equipe</label>
        <select 
          className="bg-[#0b1921] text-white border border-[#1d3642] rounded-md px-3 py-2 text-sm outline-none focus:border-cyan-500"
          value={filters.equipe} onChange={e => { setFilters({ ...filters, equipe: e.target.value }); setPage(1); }}
        >
          <option value="">Todas</option>
          {Array.from(new Set(records.map(r => r.equipe))).filter(Boolean).sort().map(eq => (
            <option key={eq} value={eq}>{eq}</option>
          ))}
        </select>
      </div>
      <button 
        className="px-3 py-2 rounded-md border border-[#1d3642] text-white hover:bg-[#122833] text-sm cursor-pointer transition-colors"
        onClick={() => setFilters({ q: '', status: '', equipe: '', tipo: '', dateFrom: '', dateTo: '', dateField: 'due' })}
      >
        Limpar Filtros
      </button>
    </div>
  );

  const renderEquipesView = () => {
    if (!records.length) return null;
    const m = new Map();
    filtered.forEach(r => {
      const o = m.get(r.equipe) || { total: 0, visit: 0, vrel: 0, vnre: 0, nvis: 0, ok: 0, fora: 0, pend: 0, risk: 0 };
      o.total++;
      if (r.visited) o.visit++;
      if (r.realized) o.vrel++;
      if (r.status.code === 'VNRE') o.vnre++;
      if (r.status.code === 'NVIS') o.nvis++;
      if (r.prazo === 'No prazo') o.ok++;
      if (r.prazo === 'Fora do prazo') o.fora++;
      if (r.pending || r.prazo === 'Pendente' || r.prazo === 'Atrasada') o.pend++;
      if (r.risk) o.risk++;
      m.set(r.equipe, o);
    });
    
    const rows = [...m.entries()].sort((a, b) => b[1].total - a[1].total);
    const best = [...rows].filter(x => x[1].ok + x[1].fora).sort((a, b) => (b[1].ok / (b[1].ok + b[1].fora)) - (a[1].ok / (a[1].ok + a[1].fora)))[0];
    const risk = [...rows].sort((a, b) => b[1].risk - a[1].risk)[0];

    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {filterBarHTML}
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-[#0c1a22] border border-[#17313c] rounded-xl p-4">
            <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Equipes Ativas</div>
            <div className="text-2xl font-black text-white mt-1">{rows.length}</div>
            <div className="text-xs text-[#9fb0b8] mt-1">no recorte atual</div>
          </div>
          <div className="bg-[#0c1a22] border border-[#17313c] rounded-xl p-4">
            <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Maior Volume</div>
            <div className="text-xl font-bold text-cyan-400 mt-1 truncate">{rows[0]?.[0] || '—'}</div>
            <div className="text-xs text-[#9fb0b8] mt-1">{rows[0] ? `${rows[0][1].total} OS` : '—'}</div>
          </div>
          <div className="bg-[#0c1a22] border border-[#17313c] rounded-xl p-4">
            <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Maior Risco</div>
            <div className="text-xl font-bold text-red-400 mt-1 truncate">{risk?.[0] || '—'}</div>
            <div className="text-xs text-[#9fb0b8] mt-1">{risk?.[1].risk ? `${risk[1].risk} críticas` : 'Sem risco'}</div>
          </div>
          <div className="bg-[#0c1a22] border border-[#17313c] rounded-xl p-4">
            <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Melhor Prazo</div>
            <div className="text-xl font-bold text-lime-400 mt-1 truncate">{best?.[0] || '—'}</div>
            <div className="text-xs text-[#9fb0b8] mt-1">{best ? 'maior taxa de sucesso' : '—'}</div>
          </div>
        </div>

        <div className="bg-[#0c1820] border border-[#1d3642] rounded-xl overflow-hidden shadow-xl mt-4">
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-left border-collapse text-sm whitespace-nowrap tabular-nums">
              <thead className="bg-[#0d1c24] text-[#9fb0b8] text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3 border-b border-[#16303b]">Equipe</th>
                  <th className="p-3 border-b border-[#16303b]">Total</th>
                  <th className="p-3 border-b border-[#16303b]">Visitas</th>
                  <th className="p-3 border-b border-[#16303b]">VREL</th>
                  <th className="p-3 border-b border-[#16303b]">VNRE</th>
                  <th className="p-3 border-b border-[#16303b]">NVIS</th>
                  <th className="p-3 border-b border-[#16303b]">No prazo</th>
                  <th className="p-3 border-b border-[#16303b]">Fora</th>
                  <th className="p-3 border-b border-[#16303b]">Pend.</th>
                  <th className="p-3 border-b border-[#16303b]">Risco</th>
                  <th className="p-3 border-b border-[#16303b]">Taxa prazo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#16303b]">
                {rows.map(([name, d], i) => (
                  <tr key={i} className="hover:bg-cyan-500/5 transition-colors">
                    <td className="p-3 font-bold">{name}</td>
                    <td className="p-3">{d.total}</td>
                    <td className="p-3">{d.visit}</td>
                    <td className="p-3 text-lime-400">{d.vrel}</td>
                    <td className="p-3 text-amber-400">{d.vnre}</td>
                    <td className="p-3 text-red-400">{d.nvis}</td>
                    <td className="p-3 text-white">{d.ok}</td>
                    <td className="p-3 text-red-400">{d.fora}</td>
                    <td className="p-3 text-amber-400">{d.pend}</td>
                    <td className="p-3 text-red-400">{d.risk}</td>
                    <td className="p-3 font-bold">
                      {d.ok + d.fora > 0 ? Math.round((d.ok / (d.ok + d.fora)) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div className="flex h-screen bg-[#071017] text-[#F2F2F2] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`flex-none flex flex-col bg-gradient-to-b from-[#081219] to-[#071017] border-r border-[#1d3642] transition-all duration-300 z-20 ${sidebarCollapsed ? 'w-[76px]' : 'w-[248px]'}`}>
        <div className="h-[58px] flex items-center gap-3 px-3 mx-2 mb-3 border-b border-[#1d3642]">
          <div className="w-9 h-9 flex-none rounded-xl flex items-center justify-center bg-gradient-to-br from-cyan-500 to-lime-500 text-[#041019] font-black shadow-lg shadow-cyan-500/20 text-lg">⚡</div>
          {!sidebarCollapsed && (
            <div className="font-extrabold whitespace-nowrap tracking-wide">
              Auditoria OS
              <div className="text-[10px] text-[#9fb0b8] mt-0.5 font-normal">Painel operacional inteligente</div>
            </div>
          )}
        </div>
        <nav className="flex flex-col gap-1.5 px-3">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setView(item.id as ViewType); setPage(1); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border-none cursor-pointer transition-colors ${view === item.id ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-500/5 text-white shadow-[inset_3px_0_0_#049DD9]' : 'text-[#9fb0b8] bg-transparent hover:bg-[#0d1e27] hover:text-white'} ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <item.icon className="w-5 h-5 flex-none" />
              {!sidebarCollapsed && <span className="whitespace-nowrap font-medium text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-3">
          <button 
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[#1d3642] bg-[#0b1820] text-[#9fb0b8] hover:text-white hover:bg-[#122833] cursor-pointer"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu className="w-4 h-4" />
            {!sidebarCollapsed && <span className="text-sm">Recolher menu</span>}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex-none h-[74px] px-6 border-b border-[#1d3642] flex items-center justify-between bg-[#071017d1] backdrop-blur-xl z-10">
          <div>
            <div className="text-xl font-extrabold tracking-tight capitalize">{view.replace('-', ' ')}</div>
            <div className="text-xs text-[#9fb0b8] mt-1">Resumo executivo da execução operacional</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#9fb0b8] text-sm flex items-center gap-2 mr-2">
              <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-lime-400'}`}></span>
              {statusText}
            </span>
            <button 
              onClick={exportCSV} 
              disabled={!records.length}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/50 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
            <button 
              onClick={injectMockData}
              className="px-3 py-2 rounded-xl border border-amber-500/50 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-sm font-semibold cursor-pointer transition-colors"
            >
              Mock Data
            </button>
            <button onClick={() => setView('dados')} className="px-4 py-2 rounded-xl border border-[#1d3642] text-white bg-[#0e1f28] hover:bg-[#122833] text-sm font-semibold cursor-pointer">
              Importar bases
            </button>
            {records.length > 0 && (
              <button onClick={clearAll} className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-sm font-semibold cursor-pointer">
                Limpar
              </button>
            )}
          </div>
        </header>

        <section className="flex-1 overflow-auto p-5 relative">
          {records.length === 0 && view !== 'dados' ? (
            <div className="bg-gradient-to-b from-[#10212b] to-[#0a171f] border border-[#1d3642] rounded-2xl p-12 text-center max-w-2xl mx-auto mt-10 shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-[#10242f] flex items-center justify-center text-cyan-400 mx-auto mb-4">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-white">Seu painel começa aqui</h3>
              <p className="text-[#9fb0b8] mb-6 leading-relaxed">
                Carregue as duas planilhas. O sistema detecta automaticamente qual é a base operacional e qual é a base de execução, cruza pela Nota e audita 100% no navegador (sem envio para servidores).
              </p>
              <button onClick={() => setView('dados')} className="px-6 py-3 rounded-xl bg-gradient-to-br from-cyan-500 to-[#0879a3] text-white font-bold cursor-pointer hover:opacity-90 transition-opacity">
                Carregar bases
              </button>
            </div>
          ) : view === 'overview' ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {filterBarHTML}
              <Storytelling records={filtered} />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <div className="bg-gradient-to-b from-[#10212bf0] to-[#0a171ff0] border border-[#1d3642] rounded-xl p-4 shadow-lg overflow-hidden relative">
                  <div className="text-[10px] text-[#9fb0b8] uppercase tracking-wider font-bold">OS no recorte</div>
                  <div className="text-3xl font-black mt-2 text-white tracking-tight">{filtered.length}</div>
                </div>
                <div className="bg-gradient-to-b from-[#10212bf0] to-[#0a171ff0] border border-[#1d3642] rounded-xl p-4 shadow-lg overflow-hidden relative">
                  <div className="text-[10px] text-[#9fb0b8] uppercase tracking-wider font-bold">Com visita</div>
                  <div className="text-3xl font-black mt-2 text-lime-400 tracking-tight">{filtered.filter(x => x.visited).length}</div>
                </div>
                <div className="bg-gradient-to-b from-[#10212bf0] to-[#0a171ff0] border border-[#1d3642] rounded-xl p-4 shadow-lg overflow-hidden relative">
                  <div className="text-[10px] text-[#9fb0b8] uppercase tracking-wider font-bold">No prazo</div>
                  <div className="text-3xl font-black mt-2 text-cyan-400 tracking-tight">{filtered.filter(x => x.prazo === 'No prazo').length}</div>
                </div>
                <div className="bg-gradient-to-b from-[#10212bf0] to-[#0a171ff0] border border-[#1d3642] rounded-xl p-4 shadow-lg overflow-hidden relative">
                  <div className="text-[10px] text-[#9fb0b8] uppercase tracking-wider font-bold">Fora do prazo</div>
                  <div className="text-3xl font-black mt-2 text-red-400 tracking-tight">{filtered.filter(x => x.prazo === 'Fora do prazo').length}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-[#0c1820] border border-[#1d3642] rounded-xl p-5 shadow-xl">
                  <div className="mb-4">
                    <div className="font-extrabold text-white">Resultado das OS</div>
                    <div className="text-xs text-[#9fb0b8]">Leitura rápida do status operacional</div>
                  </div>
                  <BarChart filtered={filtered} />
                </div>
                <div className="bg-[#0c1820] border border-[#1d3642] rounded-xl p-5 shadow-xl">
                  <div className="mb-4">
                    <div className="font-extrabold text-white">Composição do recorte</div>
                    <div className="text-xs text-[#9fb0b8]">Proporção de status</div>
                  </div>
                  <DonutChart filtered={filtered} />
                </div>
              </div>
            </div>
          ) : view === 'auditoria' ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col h-full">
              {filterBarHTML}
              <div className="bg-[#0c1820] border border-[#1d3642] rounded-xl overflow-hidden shadow-xl flex flex-col flex-1 min-h-[400px]">
                <div className="p-4 border-b border-[#16303b] bg-[#0a151c] flex-none">
                  <div className="font-extrabold text-lg">Tabela de Auditoria</div>
                  <div className="text-xs text-[#9fb0b8]">Clique em uma OS para ver o detalhamento completo.</div>
                </div>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left border-collapse text-sm whitespace-nowrap tabular-nums">
                    <thead className="bg-[#0d1c24] text-[#9fb0b8] text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-3 border-b border-[#16303b]">Nota</th>
                        <th className="p-3 border-b border-[#16303b]">Status</th>
                        <th className="p-3 border-b border-[#16303b]">Prazo</th>
                        <th className="p-3 border-b border-[#16303b]">Serviço</th>
                        <th className="p-3 border-b border-[#16303b]">Equipe</th>
                        <th className="p-3 border-b border-[#16303b]">SLA (Horas)</th>
                        <th className="p-3 border-b border-[#16303b]">Anomalias</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#16303b]">
                      {filtered.slice((page - 1) * pageSize, page * pageSize).map((r, i) => (
                        <tr key={i} className="hover:bg-cyan-500/10 transition-colors cursor-pointer" onClick={() => setSelectedRecord(r)}>
                          <td className="p-3 font-bold">{r.nota}</td>
                          <td className="p-3">{statusPill(r.status)}</td>
                          <td className="p-3">{prazoPill(r.prazo)}</td>
                          <td className="p-3 truncate max-w-[200px]">{r.tipo}</td>
                          <td className="p-3 truncate max-w-[150px]">{r.equipe}</td>
                          <td className="p-3">{r.slaHoras !== null ? r.slaHoras.toFixed(1) : '—'}</td>
                          <td className="p-3">
                            {r.anomaliaCount > 0 ? (
                              <span className="text-red-400 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {r.anomaliaCount} alertas</span>
                            ) : (
                              <span className="text-lime-400 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Íntegro</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex-none flex justify-between items-center p-3 border-t border-[#16303b] bg-[#0a151c]">
                  <span className="text-[#9fb0b8] text-xs">Página {page} de {pageCount} ({filtered.length} registros no filtro)</span>
                  <div className="flex gap-2">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-[#1d3642] text-white hover:bg-[#122833] disabled:opacity-50 text-xs cursor-pointer transition-colors">Anterior</button>
                    <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-[#1d3642] text-white hover:bg-[#122833] disabled:opacity-50 text-xs cursor-pointer transition-colors">Próxima</button>
                  </div>
                </div>
              </div>
            </div>
          ) : view === 'equipes' ? (
            renderEquipesView()
          ) : view === 'dados' ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto space-y-6 mt-4">
              <div className="bg-[#0c1820] border border-[#1d3642] rounded-2xl p-6 shadow-xl">
                <div className="mb-6 flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white m-0">Carregar Planilhas</h3>
                    <p className="text-sm text-[#9fb0b8] mt-1">O sistema mapeia automaticamente os campos de execução e planejamento a partir da chave "Nota".</p>
                  </div>
                  <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold rounded-full border border-cyan-500/20">Client-Side Only</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { slot: 'A' as const, name: base1Name, title: 'Fonte A (Execução ou Operacional)' },
                    { slot: 'B' as const, name: base2Name, title: 'Fonte B (Execução ou Operacional)' }
                  ].map(f => (
                    <label key={f.slot} className="relative block p-6 border border-dashed border-[#315464] rounded-xl bg-[#09161d] hover:bg-[#0b1b24] hover:border-cyan-500 transition-all cursor-pointer group">
                      <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={(e) => handleFileUpload(e, f.slot)} />
                      <div className="flex items-center gap-4 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-[#0f2a35] text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{f.title}</div>
                          <div className="text-xs text-[#9fb0b8] mt-0.5">XLSX, CSV ou TSV</div>
                        </div>
                      </div>
                      <div className={`p-2 rounded-lg text-xs font-semibold truncate ${f.name ? 'bg-cyan-500/10 text-cyan-400' : 'bg-[#0a161d] text-[#9fb0b8]'}`}>
                        {f.name ? `✓ ${f.name}` : 'Clique ou arraste o arquivo aqui'}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              {diagnostic && (
                <div className="bg-[#0c1820] border border-[#1d3642] rounded-2xl p-6 shadow-xl">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white m-0">Diagnóstico da Carga</h3>
                      <p className="text-sm text-[#9fb0b8] mt-1">Resultados da validação de integridade e cruzamento.</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-lime-500/10 text-lime-400 text-xs font-bold border border-lime-500/20">
                      {diagnostic.uniqueOS.toLocaleString()} OS Únicas
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-[#0a161d] rounded-xl border border-[#17313c]">
                      <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Nas 2 Bases</div>
                      <div className="text-2xl font-black text-white mt-1">{diagnostic.matched}</div>
                    </div>
                    <div className="p-4 bg-[#0a161d] rounded-xl border border-[#17313c]">
                      <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Duplicidade (Notas)</div>
                      <div className="text-2xl font-black text-red-400 mt-1">{diagnostic.duplicateNotes}</div>
                    </div>
                    <div className="p-4 bg-[#0a161d] rounded-xl border border-[#17313c]">
                      <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Datas Inválidas</div>
                      <div className="text-2xl font-black text-amber-400 mt-1">{diagnostic.invalidDates}</div>
                    </div>
                    <div className="p-4 bg-[#0a161d] rounded-xl border border-[#17313c]">
                      <div className="text-[10px] uppercase text-[#9fb0b8] font-bold">Possível Retrabalho</div>
                      <div className="text-2xl font-black text-cyan-400 mt-1">{diagnostic.rework}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </main>

      {/* Record Detail Modal */}
      {selectedRecord && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" 
          onClick={() => setSelectedRecord(null)}
        >
          <div 
            className="bg-[#0a171f] border border-[#1d3642] rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.6)] w-full max-w-4xl max-h-[86vh] overflow-hidden flex flex-col scale-in-95 animate-in duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#1d3642] flex justify-between items-center bg-[#0a171f] z-10 flex-none">
              <div>
                <b className="text-lg text-white">Detalhe da OS {selectedRecord.nota}</b>
                <div className="text-xs text-[#9fb0b8] mt-1">{selectedRecord.tipo} · {selectedRecord.equipe} · {selectedRecord.status.label}</div>
              </div>
              <button 
                onClick={() => setSelectedRecord(null)} 
                className="px-4 py-2 rounded-xl border border-[#1d3642] text-white bg-[#0e1f28] hover:bg-[#122833] text-sm font-semibold cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1 bg-[#0a171f]">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {[
                  ['Status', selectedRecord.status.label],
                  ['Prazo', selectedRecord.prazo],
                  ['Nota', selectedRecord.nota],
                  ['Serviço', selectedRecord.tipo],
                  ['Equipe', selectedRecord.equipe],
                  ['Cliente', selectedRecord.cliente || '—'],
                  ['Instalação', selectedRecord.instalacao || '—'],
                  ['Endereço', selectedRecord.endereco || '—'],
                  ['Cidade', selectedRecord.cidade || '—'],
                  ['Criação', dateFmt(selectedRecord.created)],
                  ['Vencimento', dateFmt(selectedRecord.due)],
                  ['Execução', dateFmt(selectedRecord.ended)],
                  ['Prioridade', selectedRecord.prioridade || '—'],
                  ['Tentativa', selectedRecord.tentativa || '—'],
                  ['Retrabalho (Análise)', selectedRecord.retrabalho ? 'Sim' : 'Não'],
                  ['SLA (Horas)', selectedRecord.slaHoras !== null ? selectedRecord.slaHoras.toFixed(1) + 'h' : '—']
                ].map(([k, v], i) => (
                  <div key={i} className="p-3 border border-[#17313c] rounded-xl bg-[#0c1a22]">
                    <label className="block text-[9px] text-[#9fb0b8] uppercase tracking-wider">{k}</label>
                    <b className="block mt-1.5 text-white break-words text-sm">{v}</b>
                  </div>
                ))}
              </div>
              
              {selectedRecord.anomalias.length > 0 && (
                <div className="mt-4 p-4 border border-red-500/30 rounded-xl bg-red-500/5">
                  <b className="block text-sm text-red-400 mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Alertas de Integridade</b>
                  <ul className="m-0 pl-5 text-sm text-white list-disc space-y-1">
                    {selectedRecord.anomalias.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-4 p-4 border border-[#17313c] rounded-xl bg-[#08141a]">
                <b className="block text-sm text-white mb-1">Rastreamento dos dados brutos</b>
                <div className="text-xs text-[#9fb0b8] mb-3">Os registros abaixo são somente leitura direto da planilha original. O painel não altera a fonte.</div>
                <pre className="whitespace-pre-wrap break-words max-h-[270px] overflow-auto text-[10px] text-[#bdd1d9]">
                  {JSON.stringify({ execucao: selectedRecord.A, operacional: selectedRecord.B }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl bg-[#0c1c24] border border-[#315464] text-white shadow-2xl transition-all duration-300 z-50 ${toast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
        {toast}
      </div>
    </div>
  );
}
