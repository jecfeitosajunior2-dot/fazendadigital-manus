import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { reproducaoRegistros } from "../drizzle/schema";
import {
  anularReproObservacoesPersistidas,
  findRegistroEspelhoDuplicadoAtivoId,
} from "../shared/reproEspelhoSubstituicao";
import type { ReproEspelhoDuplicataRegistroRef } from "../shared/reproEspelhoDuplicata";
import { isDatabaseUnavailable, updateLocalReproducaoRegistro } from "./localFallbackStore";

export type AnularEspelhosMatrizInput = {
  userId: number;
  matrizIds: readonly number[];
  touroId: number;
  tipoEspelho: "Cobertura" | "Exposição à monta";
  dataCobertura: string;
  registroOrigemSubstitutoId: number;
  anuladoEmISO?: string;
};

async function persistirAnulacaoRegistro(
  userId: number,
  registroId: number,
  observacoes: string,
  row: ReproEspelhoDuplicataRegistroRef & { tipo?: string | null; dataCobertura?: string | Date | null; resultado?: string | null },
): Promise<void> {
  const dataISO =
    typeof row.dataCobertura === "string"
      ? row.dataCobertura.slice(0, 10)
      : row.dataCobertura instanceof Date
        ? row.dataCobertura.toISOString().slice(0, 10)
        : String(row.dataCobertura ?? "").slice(0, 10);

  try {
    await db
      .update(reproducaoRegistros)
      .set({ observacoes })
      .where(and(eq(reproducaoRegistros.id, registroId), eq(reproducaoRegistros.userId, userId)));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await updateLocalReproducaoRegistro(userId, registroId, {
      tipo: (row.tipo ?? "").trim() || "Exposição à monta",
      dataCobertura: dataISO,
      resultado: row.resultado ?? "Realizado",
      observacoes,
    });
  }
}

/** Anula espelhos ativos das matrizes antes de registrar substituto (sem excluir). */
export async function anularEspelhosMatrizAtivos(
  input: AnularEspelhosMatrizInput,
  registros: readonly ReproEspelhoDuplicataRegistroRef[],
): Promise<number[]> {
  const anuladoEmISO = input.anuladoEmISO ?? new Date().toISOString().slice(0, 10);
  const anulados: number[] = [];
  const seen = new Set<number>();

  for (const matrizId of input.matrizIds) {
    if (!Number.isFinite(matrizId) || matrizId <= 0 || seen.has(matrizId)) continue;
    seen.add(matrizId);

    const registroId = findRegistroEspelhoDuplicadoAtivoId(
      registros,
      matrizId,
      input.touroId,
      input.tipoEspelho,
      input.dataCobertura,
    );
    if (registroId == null) continue;

    const row = registros.find(r => r.id === registroId);
    const observacoes = anularReproObservacoesPersistidas(row?.observacoes, {
      substituidoPorRegistroId: input.registroOrigemSubstitutoId,
      anuladoEmISO,
    });

    await persistirAnulacaoRegistro(input.userId, registroId, observacoes, row ?? {});
    anulados.push(registroId);
  }

  return anulados;
}
