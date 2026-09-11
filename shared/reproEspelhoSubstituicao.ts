import {
  packReproObservacoes,
  reproDataToInputISO,
  unpackReproObservacoes,
  type ReproObservacoesExtras,
} from "./reproRegistroMeta";
import type { ReproEspelhoDuplicataRegistroRef } from "./reproEspelhoDuplicata";

export function isReproRegistroAnulado(
  observacoes: string | null | undefined,
): boolean {
  return unpackReproObservacoes(observacoes).anulado === true;
}

export function anularReproObservacoesPersistidas(
  observacoes: string | null | undefined,
  patch: {
    substituidoPorRegistroId?: number | null;
    anuladoEmISO: string;
  },
): string {
  const meta = unpackReproObservacoes(observacoes);
  const extras: ReproObservacoesExtras = {
    partidaSemen: meta.partidaSemen,
    inseminador: meta.inseminador,
    ecc: meta.ecc ?? undefined,
    semenPartidaId: meta.semenPartidaId ?? undefined,
    custoDoseSemen: meta.custoDoseSemen ?? undefined,
    centralOrigem: meta.centralOrigem,
    registroOrigemId: meta.registroOrigemId ?? undefined,
    espelhoAutomatico: meta.espelhoAutomatico || undefined,
    anulado: true,
    anuladoEmISO: patch.anuladoEmISO,
    substituidoPorRegistroId: patch.substituidoPorRegistroId ?? undefined,
  };
  return (
    packReproObservacoes(
      meta.observacoes,
      meta.reprodutorSemen ?? undefined,
      meta.responsavel ?? undefined,
      meta.descricaoResultadoOutro ?? undefined,
      meta.coberturaAlvo,
      extras,
    ) ?? ""
  );
}

export function findRegistroEspelhoDuplicadoAtivoId(
  registros: readonly ReproEspelhoDuplicataRegistroRef[],
  matrizId: number,
  touroId: number,
  tipoEspelho: "Cobertura" | "Exposição à monta",
  dataISO: string,
): number | null {
  for (const reg of registros) {
    if (reg.femeaId !== matrizId) continue;
    if (reg.machoId !== touroId) continue;
    if ((reg.tipo ?? "").trim() !== tipoEspelho) continue;
    if (reproDataToInputISO(reg.dataCobertura) !== dataISO) continue;
    if (isReproRegistroAnulado(reg.observacoes)) continue;
    return reg.id ?? null;
  }
  return null;
}

export function listMatrizesComEspelhoDuplicadoAtivo(
  registros: readonly ReproEspelhoDuplicataRegistroRef[],
  matrizIds: readonly number[],
  touroId: number,
  tipoEspelho: "Cobertura" | "Exposição à monta",
  dataISO: string,
): number[] {
  return matrizIds.filter(
    id => findRegistroEspelhoDuplicadoAtivoId(registros, id, touroId, tipoEspelho, dataISO) != null,
  );
}

export function getSubstituirEspelhoCurralDialogCopy(tipoEspelho: "Cobertura" | "Exposição à monta"): {
  title: string;
  description: string;
  confirmText: string;
} {
  const evento =
    tipoEspelho === "Exposição à monta" ? "exposição à monta" : "cobertura";
  return {
    title: "Substituir registro de hoje?",
    description: `Esta matriz já tem ${evento} registrada neste touro na mesma data. O registro anterior será anulado (mantido no histórico) e o novo passará a valer.`,
    confirmText: "Substituir registro",
  };
}
