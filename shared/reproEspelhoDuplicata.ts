import { isReproRegistroAnulado } from "./reproEspelhoSubstituicao";
import { reproDataToInputISO } from "./reproRegistroMeta";

export function formatMsgMatrizJaRegistradaNesteTouro(brinco: string): string {
  return `Matriz ${brinco} já foi registrada neste touro hoje.`;
}

export function formatMsgMatrizesIgnoradasEspelhoDuplicado(qtd: number): string {
  if (qtd <= 0) return "";
  if (qtd === 1) return "1 matriz já tinha registro hoje e foi ignorada.";
  return `${qtd} matrizes já tinham registro hoje e foram ignoradas.`;
}

export type ReproEspelhoDuplicataRegistroRef = {
  id?: number;
  femeaId?: number | null;
  machoId?: number | null;
  tipo?: string | null;
  dataCobertura: Date | string | null;
  observacoes?: string | null;
};

/** Matriz já tem registro espelhável (mesmo touro, tipo e data). */
export function matrizTemEspelhoReproDuplicado(
  registros: readonly ReproEspelhoDuplicataRegistroRef[],
  matrizId: number,
  touroId: number,
  tipoEspelho: "Cobertura" | "Exposição à monta",
  dataISO: string,
): boolean {
  for (const reg of registros) {
    if (reg.femeaId !== matrizId) continue;
    if (reg.machoId !== touroId) continue;
    if ((reg.tipo ?? "").trim() !== tipoEspelho) continue;
    if (reproDataToInputISO(reg.dataCobertura) !== dataISO) continue;
    if (isReproRegistroAnulado(reg.observacoes)) continue;
    return true;
  }
  return false;
}

export function filterMatrizesSemEspelhoDuplicado(
  registros: readonly ReproEspelhoDuplicataRegistroRef[],
  matrizIds: readonly number[],
  touroId: number,
  tipoEspelho: "Cobertura" | "Exposição à monta",
  dataISO: string,
): { elegiveis: number[]; ignoradas: number[] } {
  const elegiveis: number[] = [];
  const ignoradas: number[] = [];
  const seen = new Set<number>();

  for (const matrizId of matrizIds) {
    if (!Number.isFinite(matrizId) || matrizId <= 0 || seen.has(matrizId)) continue;
    seen.add(matrizId);
    if (matrizId === touroId) continue;
    if (matrizTemEspelhoReproDuplicado(registros, matrizId, touroId, tipoEspelho, dataISO)) {
      ignoradas.push(matrizId);
    } else {
      elegiveis.push(matrizId);
    }
  }

  return { elegiveis, ignoradas };
}
