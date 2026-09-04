import React from 'react';
import { Lightbulb, AlertTriangle } from 'lucide-react';
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
        Eficiência crítica: A taxa de sucesso na primeira visita está em <span className="text-red-400 font-bold">{metricas.ftfrPct}%</span>. A equipe operacional está sofrendo com alto índice de retorno aos clientes (Retrabalho / Tentativas sucessivas).
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
        O Tempo Médio de Atendimento (SLA) geral é de <span className="font-bold text-white">{metricas.slaMedio} horas</span> desde a criação até a execução final.
      </span>
    );
  }

  // Regra 3: Z-Score e Causa-Raiz (Desvio Padrão)
  if (totalForaPrazo > 0) {
    const equipesAtraso: Record<string, number> = {};
    foraPrazo.forEach(r => {
      if (r.equipe && r.equipe !== 'Não informada') {
        equipesAtraso[r.equipe] = (equipesAtraso[r.equipe] || 0) + 1;
      }
    });

    const equipesArr = Object.entries(equipesAtraso);
    if (equipesArr.length > 0) {
      const valores = equipesArr.map(e => e[1]);
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      const variancia = valores.reduce((a, b) => a + Math.pow(b - media, 2), 0) / valores.length;
      const desvioPadrao = Math.sqrt(variancia);

      // Encontrar a pior equipe
      const piorEquipe = equipesArr.sort((a, b) => b[1] - a[1])[0];
      const representacao = Math.round((piorEquipe[1] / totalForaPrazo) * 100);
      
      // Z-Score calculation (Quantos desvios padrões acima da média)
      const zScore = desvioPadrao > 0 ? (piorEquipe[1] - media) / desvioPadrao : 0;

      if (zScore > 1.5) {
        narrativa.push(
          <span key="causa">
            <span className="text-yellow-400 font-bold">Anomalia Estatística (Z-Score &gt; 1.5):</span> A equipe <span className="text-red-400 font-bold">{piorEquipe[0]}</span> concentra {representacao}% dos atrasos, superando drasticamente o desvio padrão da operação.
          </span>
        );
      } else {
        narrativa.push(
          <span key="causa">
            Causa-Raiz de Atrasos: A equipe <span className="text-orange-400 font-bold">{piorEquipe[0]}</span> possui a maior incidência de atrasos, concentrando {representacao}% das falhas de SLA no recorte atual.
          </span>
        );
      }
    }
  }

  // Regra 4: Saúde dos Dados
  if (totalAnomalias > (records.length * 0.1)) {
    narrativa.push(
      <span key="dados">
        <span className="text-red-400 font-bold">Alerta de Integridade de Dados:</span> Mais de 10% da base contém anomalias lógicas severas (datas futuras, orfandade estrutural ou duplicatas completas). Recomenda-se forte auditoria no processo de extração.
      </span>
    );
  }

  return (
    <div className="bg-[#0b1a24] border-l-4 border-cyan-500 p-5 rounded-lg mb-4 shadow-xl">
      <h3 className="m-0 mb-3 text-[15px] flex items-center gap-2 text-white font-bold tracking-tight">
        <Lightbulb className="w-5 h-5 text-cyan-400" />
        Auditoria Cognitiva & Insight Estatístico
      </h3>
      <ul className="m-0 pl-6 text-sm leading-relaxed text-[#c6d6de] list-disc flex flex-col gap-2.5">
        {narrativa.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
