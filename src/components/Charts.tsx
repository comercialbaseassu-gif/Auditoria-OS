import React from 'react';
import { OSRecord } from '../types';

interface ChartProps {
  filtered: OSRecord[];
}

export function DonutChart({ filtered }: ChartProps) {
  const c = { VREL: 0, VNRE: 0, NVIS: 0, PEND: 0, CANC: 0, OUT: 0 };
  filtered.forEach(r => {
    if (r.status.code in c) {
      c[r.status.code as keyof typeof c]++;
    }
  });

  const total = filtered.length || 1;
  const colors: Record<string, string> = {
    VREL: '#98BF0B', // lime
    VNRE: '#efb84f', // amber
    NVIS: '#ef6a74', // red
    PEND: '#6f828b', // muted blue/gray
    CANC: '#50636d',
    OUT: '#049DD9', // blue
  };

  const labels = [
    ['VREL', 'Realizadas'],
    ['VNRE', 'Visitadas / não realizadas'],
    ['NVIS', 'Não visitadas'],
    ['PEND', 'Pendentes'],
    ['CANC', 'Canceladas'],
    ['OUT', 'Outros']
  ];

  let start = 0;
  const seg: string[] = [];
  Object.entries(c).forEach(([k, v]) => {
    if (!v) return;
    const end = start + (v / total) * 100;
    seg.push(`${colors[k]} ${start}% ${end}%`);
    start = end;
  });

  const bg = seg.length ? `conic-gradient(${seg.join(',')})` : '#162731';

  return (
    <div className="flex items-center gap-5 h-[225px]">
      <div
        className="w-[160px] h-[160px] flex-none rounded-full relative"
        style={{
          background: bg,
          animation: 'spinIn 0.7s ease both'
        }}
      >
        <div className="absolute inset-[28px] bg-[#0c1820] border border-[#1d3642] rounded-full z-0" />
        <div className="absolute inset-0 flex items-center justify-center font-black text-2xl z-10 text-white">
          {filtered.length}
        </div>
      </div>
      
      <div className="flex flex-col gap-3 min-w-[180px]">
        {labels.filter(x => c[x[0] as keyof typeof c] > 0).map(x => (
          <div key={x[0]} className="flex justify-between gap-5 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <i className="w-2 h-2 rounded-full inline-block" style={{ background: colors[x[0]] }} />
              {x[1]}
            </div>
            <b className="text-white">{c[x[0] as keyof typeof c]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ filtered }: ChartProps) {
  const c = { VREL: 0, VNRE: 0, NVIS: 0, PEND: 0 };
  filtered.forEach(r => {
    if (r.status.code in c) {
      c[r.status.code as keyof typeof c]++;
    }
  });

  const items = [
    { label: 'Realizadas', val: c.VREL, colorClass: 'from-[#98BF0B] to-[#98BF0B3a]' },
    { label: 'VNRE', val: c.VNRE, colorClass: 'from-[#efb84f] to-[#efb84f3a]' },
    { label: 'NVIS', val: c.NVIS, colorClass: 'from-[#ef6a74] to-[#ef6a743a]' },
    { label: 'Pendentes', val: c.PEND, colorClass: 'from-[#049DD9] to-[#049DD940]' }
  ];

  const max = Math.max(1, ...items.map(x => x.val));

  return (
    <div className="flex items-end gap-3 p-2 h-[210px]">
      {items.map((x, i) => {
        const h = Math.max(14, (x.val / max) * 170);
        return (
          <div key={x.label} className="flex-1 min-w-[70px] flex flex-col items-center justify-end gap-1.5">
            <div className="text-[10px] text-white font-bold">{x.val}</div>
            <div
              className={`w-full max-w-[54px] rounded-t-[3px] rounded-b-[10px] bg-gradient-to-b origin-bottom ${x.colorClass}`}
              style={{
                height: `${h}px`,
                animation: 'grow 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) both',
                animationDelay: `${i * 0.08}s`
              }}
            />
            <div className="text-[10px] text-[#9fb0b8] max-w-[92px] whitespace-nowrap overflow-hidden text-ellipsis">
              {x.label}
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes spinIn {
          from { transform: scale(0.78) rotate(-70deg); opacity: 0; }
          to { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes grow {
          from { transform: scaleY(0.05); opacity: 0.2; }
          to { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
