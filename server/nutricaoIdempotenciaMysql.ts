import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  MSG_NUTRICAO_CHAVE_ANDAMENTO,
  MSG_NUTRICAO_CHAVE_DIFERENTE,
  MSG_NUTRICAO_CHAVE_INVALIDA,
  MSG_NUTRICAO_SEM_IDEMPOTENCIA,
  chaveNutricaoValida,
  type TipoChaveNutricao,
} from "../shared/nutricaoIdempotencia";
import { MSG_NUTRICAO_SEM_MYSQL } from "./nutricaoOperacaoAutorizada";

export type TabelaIdempotente = "nutricao_fornecimentos" | "nutricao_batidas";
export type ConfirmacaoGravada = { id: number; conteudoHash: string; status: string };
export type ChavePreparada = { chave: string; hash: string };

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

function linhas(result: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(result)) return [];
  const lista = Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((row) => {
    if (!row || typeof row !== "object" || "affectedRows" in (row as object)) return [];
    const saida: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(row as Record<string, unknown>)) {
      saida[chave.toLowerCase()] = valor;
    }
    return [saida];
  });
}

export function hashConteudoNutricao(tipo: TipoChaveNutricao, canonico: string): string {
  return createHash("sha256").update(`${tipo}\n${canonico}`).digest("hex");
}

export function prepararChaveNutricao(
  tipo: TipoChaveNutricao,
  chave: string | null | undefined,
  canonico: string,
): ChavePreparada {
  const valor = String(chave ?? "").trim();
  if (!chaveNutricaoValida(tipo, valor)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_NUTRICAO_CHAVE_INVALIDA });
  }
  return { chave: valor.toLowerCase(), hash: hashConteudoNutricao(tipo, canonico) };
}

export async function exigirEstruturaIdempotente(tx: Executor, tabela: TabelaIdempotente): Promise<void> {
  const colunas = linhas(await tx.execute(sql`
    SELECT COLUMN_NAME AS nome, DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS tamanho, IS_NULLABLE AS nulo
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tabela}
      AND COLUMN_NAME IN ('chaveOperacao', 'conteudoHash')
  `));
  const porNome = new Map(colunas.map((coluna) => [String(coluna.nome), coluna]));
  const chave = porNome.get("chaveOperacao");
  const hash = porNome.get("conteudoHash");
  const chaveOk = Boolean(
    chave && String(chave.tipo) === "varchar" && Number(chave.tamanho) >= 80 && String(chave.nulo) === "YES",
  );
  const hashOk = Boolean(
    hash && String(hash.tipo) === "varchar" && Number(hash.tamanho) >= 64 && String(hash.nulo) === "YES",
  );
  const indice = linhas(await tx.execute(sql`
    SELECT INDEX_NAME AS indice, COLUMN_NAME AS nome
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tabela} AND NON_UNIQUE = 0
  `));
  const grupos = new Map<string, Set<string>>();
  for (const item of indice) {
    const nome = String(item.indice);
    const cols = grupos.get(nome) ?? new Set<string>();
    cols.add(String(item.nome).toLowerCase());
    grupos.set(nome, cols);
  }
  const unico = [...grupos.values()].some((cols) => cols.has("userid") && cols.has("chaveoperacao"));
  if (!chaveOk || !hashOk || !unico) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_IDEMPOTENCIA });
  }
}

export async function gravarChaveNutricao(
  tx: Executor,
  tabela: TabelaIdempotente,
  id: number,
  userId: number,
  chave: string,
  hash: string,
): Promise<void> {
  if (tabela === "nutricao_fornecimentos") {
    await tx.execute(sql`
      UPDATE nutricao_fornecimentos
      SET chaveOperacao = ${chave}, conteudoHash = ${hash}
      WHERE id = ${id} AND userId = ${userId}
    `);
  } else {
    await tx.execute(sql`
      UPDATE nutricao_batidas
      SET chaveOperacao = ${chave}, conteudoHash = ${hash}
      WHERE id = ${id} AND userId = ${userId}
    `);
  }
  const consulta = tabela === "nutricao_fornecimentos"
    ? sql`SELECT id FROM nutricao_fornecimentos WHERE id = ${id} AND userId = ${userId} AND chaveOperacao = ${chave} AND conteudoHash = ${hash} LIMIT 1`
    : sql`SELECT id FROM nutricao_batidas WHERE id = ${id} AND userId = ${userId} AND chaveOperacao = ${chave} AND conteudoHash = ${hash} LIMIT 1`;
  const gravada = linhas(await tx.execute(consulta));
  if (!gravada.length) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_IDEMPOTENCIA });
  }
}

export async function buscarConfirmacaoPorChave(
  banco: Executor,
  tabela: TabelaIdempotente,
  userId: number,
  chave: string,
): Promise<ConfirmacaoGravada | null> {
  const consulta = tabela === "nutricao_fornecimentos"
    ? sql`SELECT id, conteudoHash, status FROM nutricao_fornecimentos WHERE userId = ${userId} AND chaveOperacao = ${chave} LIMIT 1`
    : sql`SELECT id, conteudoHash, status FROM nutricao_batidas WHERE userId = ${userId} AND chaveOperacao = ${chave} LIMIT 1`;
  const rows = linhas(await banco.execute(consulta));
  const row = rows[0];
  if (!row) return null;
  return { id: Number(row.id), conteudoHash: String(row.conteudohash ?? ""), status: String(row.status) };
}

export function ehChaveDuplicada(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; code?: string; cause?: unknown; message?: string };
    if (item.errno === 1062 || item.code === "ER_DUP_ENTRY") return true;
    if (/Duplicate entry/i.test(String(item.message ?? ""))) return true;
    atual = item.cause;
  }
  return false;
}

export function responderConfirmacaoRepetida(ja: ConfirmacaoGravada, hash: string) {
  if (ja.conteudoHash !== hash) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_NUTRICAO_CHAVE_DIFERENTE });
  }
  return { success: true as const, id: ja.id, repetido: true as const, status: ja.status };
}

export function confirmarEmAndamento(): never {
  throw new TRPCError({ code: "CONFLICT", message: MSG_NUTRICAO_CHAVE_ANDAMENTO });
}

export async function exigirIdempotenciaOuRecusar(banco: Executor, tabela: TabelaIdempotente): Promise<void> {
  try {
    await exigirEstruturaIdempotente(banco, tabela);
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
  }
}
