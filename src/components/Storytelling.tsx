import React from 'react';
import { Lightbulb } from 'lucide-react';
import { OSRecord } from '../types';
import { calcularMetricasAvancadas } from '../lib/logic';

interface Props {
  records: OSRecord[];
}

export function Storytelling({ records }: Props) {
  if (records.length === 0) return null;

  const metricas = calcularMetricasAvancadas(records);
  const totalAnomalias = records.reduce((acc, r) => acc + r.anomaliaCount, 0);
  const foraPrazo = records.filter(r => r.prazo === 'Fora do prazo');
  const totalForaPrazo = foraPrazo.length;

  const narrativa: React.ReactNode[] = [];

  // Regra 1: Análise de FTFR
  if (metricas.ftfrPct < 70) {
    narrativa.push(
      <span key="ftfr">
        Eficiência crítica: A taxa de sucesso na primeira visita está em <span className="text-red-400 font-bold">{metricas.ftfrPct}%</span>. A equipe operacional está sofrendo com alto índice de retorno aos clientes.
      </span>
    );
  } else {
    narrativa.push(
      <span key="ftfr">
        Eficiência operacional saudável: Taxa de sucesso na primeira visita (FTFR) de <span className="text-lime-400 font-bold">{metricas.ftfrPct}%</span>.
      </span>
    );
  }

  // Regra 2: Análise de SLA
  if (metricas.slaMedio !== 'N/A') {
    narrativa.push(
      <span key="sla">
        O Tempo Médio de Atendimento (SLA) geral é de <span className="font-bold text-white">{metricas.slaMedio} horas</span> desde a criação até a execução.
      </span>
    );
  }

  // Regra 3: Causa-Raiz de Atrasos
  if (totalForaPrazo > 0) {
    const equipesAtraso: Record<string, number> = {};
    foraPrazo.forEach(r => {
      equipesAtraso[r.equipe] = (equipesAtraso[r.equipe] || 0) + 1;
    });
    const piorEquipe = Object.entries(equipesAtraso).sort((a, b) => b[1] - a[1])[0];

    narrativa.push(
      <span key="causa">
        Causa-Raiz de Atrasos: A equipe <span className="text-red-400 font-bold">{piorEquipe[0]}</span> concentra {Math.round((piorEquipe[1] / totalForaPrazo) * 100)}% das Ordens de Serviço estouradas no recorte atual.
      </span>
    );
  }

  // Regra 4: Saúde dos Dados
  if (totalAnomalias > (records.length * 0.1)) {
    narrativa.push(
      <span key="dados">
        Alerta de Integridade de Dados: Mais de 10% da base contém anomalias lógicas (datas futuras, orfandade ou duplicatas). Recomenda-se auditoria nas fontes originais.
      </span>
    );
  }

  return (
    <div className="bg-[#0b1a24] border-l-4 border-cyan-500 p-4 rounded-lg mb-4 shadow-md">
      <h3 className="m-0 mb-3 text-sm flex items-center gap-2 text-white font-bold">
        <Lightbulb className="w-5 h-5 text-cyan-400" />
        Síntese Executiva Gerada por IA
      </h3>
      <ul className="m-0 pl-5 text-[13px] leading-relaxed text-slate-300 list-disc flex flex-col gap-1.5">
        {narrativa.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
