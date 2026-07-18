import {
  calcDiasNoPastoISO,
  formatDiasNoPastoLabel,
  isEntradaPastoFutura,
  normalizarDataISO,
} from "./entradaPastoDisplay";

export type StatusMovimentacaoLote = "atual" | "encerrada" | "agendada";

export type HistoricoMovimentacaoLoteInput = {
  dataEntrada: string;
  dataSaida?: string | null;
  diasNoPasto?: number | null;
  pastoOrigemId?: number | null;
  pastoOrigemNome?: string | null;
};

export function statusMovimentacaoLote(
  row: HistoricoMovimentacaoLoteInput,
  hojeISO: string,
): StatusMovimentacaoLote {
  if (row.dataSaida) return "encerrada";
  if (isEntradaPastoFutura(row.dataEntrada, hojeISO)) return "agendada";
  return "atual";
}

export function temOrigemHistoricoLote(
  pastoOrigemId?: number | null,
  pastoOrigemNome?: string | null,
): boolean {
  return pastoOrigemId != null || !!pastoOrigemNome?.trim();
}

export function calcDiasEntreISO(inicioISO: string, fimISO: string): number | null {
  const inicio = normalizarDataISO(inicioISO);
  const fim = normalizarDataISO(fimISO);
  if (!inicio || !fim || inicio > fim) return null;

  const [y1, m1, d1] = inicio.split("-").map(Number);
  const [y2, m2, d2] = fim.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

export function calcDiasMovimentacaoLote(
  row: HistoricoMovimentacaoLoteInput,
  hojeISO: string,
): number | null {
  if (statusMovimentacaoLote(row, hojeISO) === "agendada") return null;
  if (row.diasNoPasto != null && row.diasNoPasto >= 0) return row.diasNoPasto;

  const entrada = normalizarDataISO(row.dataEntrada);
  if (!entrada) return null;

  if (!row.dataSaida) {
    return calcDiasNoPastoISO(entrada, hojeISO);
  }

  const saida = normalizarDataISO(row.dataSaida);
  if (!saida) return null;
  return calcDiasEntreISO(entrada, saida);
}

export function labelEntradaMovimentacaoLote(
  row: HistoricoMovimentacaoLoteInput,
  hojeISO: string,
): "Entrada" | "Entrada prevista" {
  if (statusMovimentacaoLote(row, hojeISO) === "agendada") return "Entrada prevista";
  return "Entrada";
}

export type SaidaMovimentacaoLoteDisplay =
  | { tipo: "data"; dataISO: string }
  | { tipo: "em_andamento" }
  | { tipo: "vazio" };

export function displaySaidaMovimentacaoLote(
  row: HistoricoMovimentacaoLoteInput,
  hojeISO: string,
): SaidaMovimentacaoLoteDisplay {
  if (statusMovimentacaoLote(row, hojeISO) === "agendada") return { tipo: "vazio" };
  if (!row.dataSaida) return { tipo: "em_andamento" };
  const saida = normalizarDataISO(row.dataSaida);
  if (!saida) return { tipo: "vazio" };
  return { tipo: "data", dataISO: saida };
}

export function formatTempoNoPastoMovimentacaoLote(
  row: HistoricoMovimentacaoLoteInput,
  hojeISO: string,
): string | null {
  if (statusMovimentacaoLote(row, hojeISO) === "agendada") return null;
  const dias = calcDiasMovimentacaoLote(row, hojeISO);
  if (dias === null) return !row.dataSaida ? "Em andamento" : null;
  return formatDiasNoPastoLabel(dias);
}

export function tituloRegistroHistoricoLote(
  row: HistoricoMovimentacaoLoteInput & { pastoDestinoNome?: string | null },
): string | null {
  if (temOrigemHistoricoLote(row.pastoOrigemId, row.pastoOrigemNome)) return null;
  const destino = row.pastoDestinoNome?.trim() || "—";
  return `Registro inicial no ${destino}`;
}

const STATUS_ORDEM: Record<StatusMovimentacaoLote, number> = {
  atual: 0,
  agendada: 1,
  encerrada: 2,
};

export function ordenarHistoricoMovimentacaoLote<T extends HistoricoMovimentacaoLoteInput>(
  rows: T[],
  hojeISO: string,
): T[] {
  return [...rows].sort((a, b) => {
    const sa = statusMovimentacaoLote(a, hojeISO);
    const sb = statusMovimentacaoLote(b, hojeISO);
    if (STATUS_ORDEM[sa] !== STATUS_ORDEM[sb]) {
      return STATUS_ORDEM[sa] - STATUS_ORDEM[sb];
    }
    return (b.dataEntrada ?? "").localeCompare(a.dataEntrada ?? "");
  });
}

export function isMovimentacaoLoteAtiva(
  row: HistoricoMovimentacaoLoteInput,
  hojeISO: string,
): boolean {
  return statusMovimentacaoLote(row, hojeISO) === "atual";
}

export const STATUS_MOVIMENTACAO_LOTE_VISUAL = {
  atual: {
    dot: "#16a34a",
    dotRing: "#dcfce7",
    cardBorder: "#bbf7d0",
    cardBg: "#f0fdf4",
    badgeColor: "#15803d",
    badgeBg: "#dcfce7",
    badgeBorder: "#86efac",
    label: "Atual",
  },
  agendada: {
    dot: "#d97706",
    dotRing: "#fef3c7",
    cardBorder: "#fde68a",
    cardBg: "#fffbeb",
    badgeColor: "#b45309",
    badgeBg: "#fef3c7",
    badgeBorder: "#fcd34d",
    label: "Agendada",
  },
  encerrada: {
    dot: "#6b7280",
    dotRing: "transparent",
    cardBorder: "#e5e7eb",
    cardBg: "#fff",
    badgeColor: "#4b5563",
    badgeBg: "#f3f4f6",
    badgeBorder: "#d1d5db",
    label: "Encerrada",
  },
} as const;
