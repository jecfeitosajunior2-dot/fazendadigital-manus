/**
 * Histórico de brinco no MySQL.
 * Esta rota não troca o brinco ativo do animal. A unicidade 0071 fica para o manejo.
 * O histórico não é apagado.
 */
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { animais, historicoBrincos } from "../drizzle/schema";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db as dbPadrao } from "./db";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";

export const MSG_BRINCO_SEM_MYSQL =
  "O histórico do brinco precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_BRINCO_SEM_PERMISSAO = "Sem permissão para esta operação de brinco.";
export const MSG_BRINCO_NAO_ENCONTRADO = "Animal não encontrado.";
export const MSG_BRINCO_HISTORICO =
  "O histórico do brinco não é apagado.";

export type SessaoBrinco = {
  executorId: number;
  sessionVersionDaSessao: number | null;
};

export type RegistroBrinco = {
  animalId: number;
  brincoAnterior?: string | null;
  brincoNovo: string;
  motivo: "perda" | "danificado" | "reidentificacao" | "erro_cadastro" | "outro";
  observacoes?: string | null;
  dataAlteracao: string;
};

type Banco = typeof dbPadrao;
type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
let bancoBrincos: Banco = dbPadrao;

export function definirBancoBrincos(banco: Banco | null) {
  bancoBrincos = banco ?? dbPadrao;
}

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_BRINCO_SEM_MYSQL });
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_BRINCO_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_BRINCO_NAO_ENCONTRADO });
  }
}

function textoErro(erro: unknown) {
  return erro instanceof Error
    ? `${erro.message} ${String((erro as { code?: string }).code ?? "")}`
    : String(erro);
}

async function correr<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await bancoBrincos.transaction(fn, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    recusarSeDeadlockEstoque(erro);
    if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(textoErro(erro))) {
      semMysql();
    }
    throw erro;
  }
}

async function animalDaConta(tx: Tx, sessao: SessaoBrinco, animalId: number, permissaoId: string) {
  const [visto] = await tx
    .select({ id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId })
    .from(animais)
    .where(eq(animais.id, animalId))
    .limit(1);
  if (!visto || visto.fazendaId == null) recusar("fazenda_inexistente");
  const deciso = await autorizarOperacaoPersistida(consultaEstoqueNaTransacao(tx), {
    executorId: sessao.executorId,
    sessionVersionDaSessao: sessao.sessionVersionDaSessao,
    permissaoId,
    fazendaId: visto.fazendaId,
  });
  if (!deciso.ok) recusar(deciso.motivo);
  const [animal] = await tx
    .select({ id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId, brinco: animais.brinco })
    .from(animais)
    .where(eq(animais.id, animalId))
    .for("update")
    .limit(1);
  if (!animal || animal.userId !== deciso.contexto.titularUserId || animal.fazendaId !== visto.fazendaId) {
    recusar("outro_titular");
  }
  const usuario = await consultaEstoqueNaTransacao(tx).usuario(sessao.executorId);
  return { animal, titular: deciso.contexto.titularUserId, nome: usuario?.name ?? null };
}

export const brincosOperacao = {
  async listar(sessao: SessaoBrinco, animalId: number) {
    return correr(async (tx) => {
      await animalDaConta(tx, sessao, animalId, "brincos.visualizar");
      return tx
        .select()
        .from(historicoBrincos)
        .where(eq(historicoBrincos.animalId, animalId))
        .orderBy(desc(historicoBrincos.createdAt));
    });
  },

  async registrar(sessao: SessaoBrinco, entrada: RegistroBrinco) {
    return correr(async (tx) => {
      const atual = await animalDaConta(tx, sessao, entrada.animalId, "brincos.criar");
      const brincoNovo = entrada.brincoNovo.trim();
      if (!brincoNovo) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o brinco." });
      const result = await tx.insert(historicoBrincos).values({
        userId: atual.titular,
        animalId: entrada.animalId,
        brincoAnterior: entrada.brincoAnterior ?? null,
        brincoNovo,
        motivo: entrada.motivo,
        observacoes: entrada.observacoes ?? null,
        dataAlteracao: entrada.dataAlteracao,
        usuarioNome: atual.nome,
      });
      const id = Number((result as unknown as [{ insertId?: number }])[0]?.insertId ?? 0);
      return { success: true as const, id };
    });
  },

  async recusarExclusao(sessao: SessaoBrinco, id: number): Promise<never> {
    return correr(async (tx) => {
      const [linha] = await tx
        .select({ id: historicoBrincos.id, animalId: historicoBrincos.animalId })
        .from(historicoBrincos)
        .where(eq(historicoBrincos.id, id))
        .limit(1);
      if (!linha) recusar("fazenda_inexistente");
      await animalDaConta(tx, sessao, linha.animalId, "brincos.inativar");
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_BRINCO_HISTORICO });
    });
  },
};
