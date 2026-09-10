import { db } from "./db";
import { reproducaoRegistros } from "../drizzle/schema";
import { packReproObservacoes } from "../shared/reproRegistroMeta";
import { createLocalReproducaoRegistro, isDatabaseUnavailable } from "./localFallbackStore";

export type EspelharRegistrosMatrizInput = {
  userId: number;
  registroOrigemId: number;
  tipoEspelho: "Cobertura" | "Exposição à monta";
  touroId: number;
  matrizIds: readonly number[];
  dataCobertura: string;
  touroLabel?: string;
  resultadoEspelho?: string;
};

async function inserirEspelhoMatriz(
  userId: number,
  input: EspelharRegistrosMatrizInput,
  matrizId: number,
): Promise<number> {
  const observacoes = packReproObservacoes(
    undefined,
    input.touroLabel,
    undefined,
    undefined,
    undefined,
    {
      registroOrigemId: input.registroOrigemId,
      espelhoAutomatico: true,
    },
  );

  const payload = {
    userId,
    femeaId: matrizId,
    machoId: input.touroId,
    tipo: input.tipoEspelho,
    resultado: input.resultadoEspelho ?? "Realizado",
    observacoes: observacoes ?? null,
    dataCobertura: new Date(input.dataCobertura),
    dataPrevistoParto: null as Date | null,
  };

  try {
    const result = await db.insert(reproducaoRegistros).values(payload);
    return (result as { insertId?: number }[])[0]?.insertId ?? 0;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await createLocalReproducaoRegistro(userId, {
      femeaId: matrizId,
      machoId: input.touroId,
      tipo: input.tipoEspelho,
      dataCobertura: input.dataCobertura,
      resultado: input.resultadoEspelho ?? "Realizado",
      observacoes: observacoes ?? undefined,
    });
    return local.id;
  }
}

/** Cria registros espelho na ficha de cada matriz (Cobertura ou Exposição à monta). */
export async function espelharRegistrosReproNaMatriz(
  input: EspelharRegistrosMatrizInput,
): Promise<number[]> {
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const matrizId of input.matrizIds) {
    if (!Number.isFinite(matrizId) || matrizId <= 0 || seen.has(matrizId)) continue;
    seen.add(matrizId);
    if (matrizId === input.touroId) continue;
    const id = await inserirEspelhoMatriz(input.userId, input, matrizId);
    if (id > 0) ids.push(id);
  }

  return ids;
}

export function resolveTipoEspelhoMatriz(tipoOrigemMacho: string): "Cobertura" | "Exposição à monta" | null {
  const t = tipoOrigemMacho.trim();
  if (t === "Cobertura realizada") return "Cobertura";
  if (t === "Estação de monta") return "Exposição à monta";
  return null;
}
