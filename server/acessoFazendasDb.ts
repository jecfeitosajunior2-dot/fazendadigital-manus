import { eq } from "drizzle-orm";
import { fazendas, usuarioFazendas } from "../drizzle/schema";
import { db } from "./db";
import { carregarIdentidade } from "./_core/carregarIdentidade";
import {
  avaliarAcessoFazenda,
  montarAcesso,
  type AcessoResolvido,
  type DecisaoFazenda,
  type FazendaConhecida,
} from "./acessoFazendas";

function tabelaAusente(error: unknown): boolean {
  const item = error as { errno?: number; code?: string; message?: string; cause?: unknown };
  const texto = `${item.code || ""} ${item.errno || ""} ${item.message || ""} ${item.cause || ""}`;
  return texto.includes("ER_NO_SUCH_TABLE") || texto.includes("1146") || texto.includes("doesn't exist");
}

async function fazendasDoTitular(titularUserId: number): Promise<FazendaConhecida[]> {
  const rows = await db
    .select({ id: fazendas.id, userId: fazendas.userId })
    .from(fazendas)
    .where(eq(fazendas.userId, titularUserId));
  return rows.filter(row => row.id > 0);
}

async function vinculosDoExecutor(executorUserId: number) {
  try {
    const rows = await db
      .select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
      .from(usuarioFazendas)
      .where(eq(usuarioFazendas.userId, executorUserId));
    return rows;
  } catch (error) {
    if (tabelaAusente(error)) return [];
    throw error;
  }
}

export async function carregarAcessoPorExecutor(executorUserId: number): Promise<AcessoResolvido | null> {
  const identidade = await carregarIdentidade(executorUserId);
  if (!identidade) return null;
  const doTitular = await fazendasDoTitular(identidade.titularUserId);
  const vinculos = identidade.papel === "principal" ? [] : await vinculosDoExecutor(identidade.id);
  return montarAcesso({ identidade, fazendasDoTitular: doTitular, vinculos });
}

export async function decidirAcessoAFazenda(
  executorUserId: number,
  fazendaId: number,
): Promise<DecisaoFazenda> {
  const acesso = await carregarAcessoPorExecutor(executorUserId);
  if (!acesso) return "sem_identidade";
  const [row] = await db
    .select({ id: fazendas.id, userId: fazendas.userId })
    .from(fazendas)
    .where(eq(fazendas.id, fazendaId))
    .limit(1);
  return avaliarAcessoFazenda(acesso, row ?? null);
}
