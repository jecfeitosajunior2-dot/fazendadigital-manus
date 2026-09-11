import { eq } from "drizzle-orm";
import { db } from "./db";
import { reproducaoRegistros } from "../drizzle/schema";
import { packReproObservacoes } from "../shared/reproRegistroMeta";
import {
  filterMatrizesSemEspelhoDuplicado,
  type ReproEspelhoDuplicataRegistroRef,
} from "../shared/reproEspelhoDuplicata";
import { createLocalReproducaoRegistro, isDatabaseUnavailable, listLocalReproducaoRegistros } from "./localFallbackStore";

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

export type EspelharRegistrosMatrizResult = {
  ids: number[];
  ignoradas: number[];
};

export async function listRegistrosReproDuplicataUsuario(
  userId: number,
): Promise<ReproEspelhoDuplicataRegistroRef[]> {
  try {
    const rows = await db
      .select({
        id: reproducaoRegistros.id,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        tipo: reproducaoRegistros.tipo,
        dataCobertura: reproducaoRegistros.dataCobertura,
        observacoes: reproducaoRegistros.observacoes,
        resultado: reproducaoRegistros.resultado,
      })
      .from(reproducaoRegistros)
      .where(eq(reproducaoRegistros.userId, userId));
    if (rows.length > 0) return rows;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  const localRows = await listLocalReproducaoRegistros(userId);
  return localRows.map(r => ({
    id: r.id,
    femeaId: r.femeaId,
    machoId: r.machoId,
    tipo: r.tipo,
    dataCobertura: r.dataCobertura,
    observacoes: r.observacoes,
    resultado: r.resultado,
  }));
}

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
  registrosExistentes?: readonly ReproEspelhoDuplicataRegistroRef[],
): Promise<EspelharRegistrosMatrizResult> {
  const existentes = registrosExistentes ?? (await listRegistrosReproDuplicataUsuario(input.userId));
  const { elegiveis, ignoradas } = filterMatrizesSemEspelhoDuplicado(
    existentes,
    input.matrizIds,
    input.touroId,
    input.tipoEspelho,
    input.dataCobertura,
  );

  const ids: number[] = [];
  for (const matrizId of elegiveis) {
    const id = await inserirEspelhoMatriz(input.userId, input, matrizId);
    if (id > 0) ids.push(id);
  }

  return { ids, ignoradas };
}

export function resolveTipoEspelhoMatriz(tipoOrigemMacho: string): "Cobertura" | "Exposição à monta" | null {
  const t = tipoOrigemMacho.trim();
  if (t === "Cobertura realizada") return "Cobertura";
  if (t === "Estação de monta") return "Exposição à monta";
  return null;
}
