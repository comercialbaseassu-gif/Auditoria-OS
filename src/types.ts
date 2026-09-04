export interface StatusInfo {
  code: string;
  label: string;
}

export interface OSRecord {
  nota: string;
  A: any;
  B: any;
  status: StatusInfo;
  prazo: string;
  equipe: string;
  tipo: string;
  cidade: string;
  cliente: string;
  endereco: string;
  instalacao: string;
  prioridade: string;
  tentativa: string;
  created: Date | null;
  due: Date | null;
  ended: Date | null;
  visited: boolean;
  realized: boolean;
  pending: boolean;
  overdue: boolean;
  risk: boolean;
  sourceA: boolean;
  sourceB: boolean;
  duplicateA: boolean;
  duplicateB: boolean;
  retrabalho?: boolean;
  caso?: string;
  slaHoras: number | null;
  anomalias: string[];
  anomaliaCount: number;
  isFirstTimeFix: boolean;
}

export interface DiagnosticInfo {
  execRows: number;
  opRows: number;
  uniqueOS: number;
  matched: number;
  onlyExec: number;
  onlyOp: number;
  duplicateNotes: number;
  invalidDates: number;
  rework: number;
  reworkCases: number;
  reworkPairs: number;
}
