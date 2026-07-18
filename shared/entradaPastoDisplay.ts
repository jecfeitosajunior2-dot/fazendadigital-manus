export type LegendaEntradaPastoLote =
  | { tipo: "sem_historico" }
  | { tipo: "entrada_futura"; dataISO: string }
  | { tipo: "dias_no_pasto"; dataISO: string; dias: number };

export function normalizarDataISO(value: string | null | undefined): string | null {
  if (!value) return null;
  const data = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

export function isEntradaPastoFutura(dataEntradaPasto: string, hojeISO: string): boolean {
  const entrada = normalizarDataISO(dataEntradaPasto);
  const hoje = normalizarDataISO(hojeISO);
  if (!entrada || !hoje) return false;
  return entrada > hoje;
}

export function calcDiasNoPastoISO(
  dataEntradaPasto: string | null | undefined,
  hojeISO: string,
): number | null {
  const entrada = normalizarDataISO(dataEntradaPasto);
  const hoje = normalizarDataISO(hojeISO);
  if (!entrada || !hoje) return null;
  if (entrada > hoje) return null;

  const [y1, m1, d1] = entrada.split("-").map(Number);
  const [y2, m2, d2] = hoje.split("-").map(Number);
  const inicio = new Date(y1, m1 - 1, d1);
  const fim = new Date(y2, m2 - 1, d2);
  const dias = Math.floor((fim.getTime() - inicio.getTime()) / 86400000);
  return Math.max(0, dias);
}

export function legendaEntradaPastoLote(
  dataEntradaPasto: string | null | undefined,
  hojeISO: string,
): LegendaEntradaPastoLote {
  const dataISO = normalizarDataISO(dataEntradaPasto);
  if (!dataISO) return { tipo: "sem_historico" };
  if (isEntradaPastoFutura(dataISO, hojeISO)) {
    return { tipo: "entrada_futura", dataISO };
  }
  const dias = calcDiasNoPastoISO(dataISO, hojeISO);
  if (dias === null) return { tipo: "sem_historico" };
  return { tipo: "dias_no_pasto", dataISO, dias };
}

export function formatDiasNoPastoLabel(dias: number): string {
  return `${dias} dia${dias !== 1 ? "s" : ""} no pasto`;
}
