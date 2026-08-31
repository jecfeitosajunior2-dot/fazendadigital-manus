/**
 * Autoridade de consistência de Sexo no animais.update.
 * Consulta existência (limit 1 / linhas do próprio animal), sem criar Manejo.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { animais, reproducaoRegistros, saudeRegistros } from "../drizzle/schema";
import {
  coletarEvidenciasAlteracaoSexo,
  normalizarSexoAnimal,
  precisaValidarAlteracaoSexo,
  SEXO_FEMEA,
  SEXO_MACHO,
  validarAlteracaoSexoAnimal,
  type ReproEvidenciaRow,
} from "../shared/validarAlteracaoSexoAnimal";
import { db } from "./db";
import {
  listLocalAnimais,
  listLocalReproducaoRegistros,
  listLocalSaudeRegistros,
} from "./localFallbackStore";

export function assertResultadoAlteracaoSexo(
  resultado: ReturnType<typeof validarAlteracaoSexoAnimal>,
): void {
  if (!resultado.permitido) {
    throw new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem });
  }
}

async function carregarEvidenciasDb(
  userId: number,
  animalId: number,
  castradoAtual: unknown,
  incluirCoberturaAlvo: boolean,
) {
  const reproFiltro = incluirCoberturaAlvo
    ? or(
        eq(reproducaoRegistros.femeaId, animalId),
        eq(reproducaoRegistros.machoId, animalId),
        eq(reproducaoRegistros.tipo, "Cobertura realizada"),
      )
    : or(eq(reproducaoRegistros.femeaId, animalId), eq(reproducaoRegistros.machoId, animalId));

  const [saudeRows, paiRows, maeRows, reproRows] = await Promise.all([
    db
      .select({ tipo: saudeRegistros.tipo })
      .from(saudeRegistros)
      .where(and(eq(saudeRegistros.userId, userId), eq(saudeRegistros.animalId, animalId))),
    db
      .select({ id: animais.id })
      .from(animais)
      .where(and(eq(animais.userId, userId), eq(animais.paiId, animalId)))
      .limit(1),
    db
      .select({ id: animais.id })
      .from(animais)
      .where(and(eq(animais.userId, userId), eq(animais.maeId, animalId)))
      .limit(1),
    db
      .select({
        tipo: reproducaoRegistros.tipo,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        observacoes: reproducaoRegistros.observacoes,
      })
      .from(reproducaoRegistros)
      .where(and(eq(reproducaoRegistros.userId, userId), reproFiltro)),
  ]);

  return coletarEvidenciasAlteracaoSexo({
    animalId,
    castradoAtual: castradoAtual as boolean | number | null,
    saudeTipos: saudeRows.map(r => r.tipo),
    descendentes: [
      ...(paiRows.length > 0 ? [{ paiId: animalId }] : []),
      ...(maeRows.length > 0 ? [{ maeId: animalId }] : []),
    ],
    reproRegistros: reproRows as ReproEvidenciaRow[],
  });
}

async function carregarEvidenciasLocal(userId: number, animalId: number, castradoAtual: unknown) {
  const [saude, repro, lista] = await Promise.all([
    listLocalSaudeRegistros(userId, animalId),
    listLocalReproducaoRegistros(userId),
    listLocalAnimais(userId),
  ]);

  return coletarEvidenciasAlteracaoSexo({
    animalId,
    castradoAtual: castradoAtual as boolean | number | null,
    saudeTipos: saude.map(r => r.tipo),
    descendentes: lista.map(a => ({ paiId: a.paiId, maeId: a.maeId })),
    reproRegistros: repro,
  });
}

export async function assertAlteracaoSexoAnimal(input: {
  userId: number;
  animalId: number;
  sexoAtual?: string | null;
  novoSexo?: string | null;
  castradoAtual?: boolean | number | null;
  source: "db" | "local";
}): Promise<void> {
  if (!precisaValidarAlteracaoSexo(input.sexoAtual, input.novoSexo)) return;

  const incluirCoberturaAlvo =
    normalizarSexoAnimal(input.sexoAtual) === SEXO_FEMEA &&
    normalizarSexoAnimal(input.novoSexo) === SEXO_MACHO;

  const evidencias =
    input.source === "local"
      ? await carregarEvidenciasLocal(input.userId, input.animalId, input.castradoAtual)
      : await carregarEvidenciasDb(
          input.userId,
          input.animalId,
          input.castradoAtual,
          incluirCoberturaAlvo,
        );

  assertResultadoAlteracaoSexo(
    validarAlteracaoSexoAnimal({
      sexoAtual: input.sexoAtual,
      novoSexo: input.novoSexo,
      evidencias,
    }),
  );
}
