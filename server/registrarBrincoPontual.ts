/**
 * Troca pontual de brinco ou RFID no MySQL.
 * Sem o índice da proposta 0071, a troca do brinco ativo é recusada.
 * O arquivo local não grava.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { animais, historicoBrincos } from "../drizzle/schema";
import { buildBrincoAtivoConflitoMessage } from "../shared/brincoAtivo";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db as dbPadrao } from "./db";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";

export const MSG_MANEJO_SEM_INDICE =
  "O banco ainda não garante o brinco único nesta fazenda. Nada foi alterado.";
export const MSG_MANEJO_SEM_MYSQL =
  "O manejo precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_MANEJO_SEM_PERMISSAO = "Sem permissão para registrar o manejo.";
export const MSG_MANEJO_NAO_ENCONTRADO = "Animal não encontrado.";

export type SessaoManejo = {
  executorId: number;
  sessionVersionDaSessao: number | null;
};

export type HistoricoBrincoPontual = {
  brincoAnterior: string | null;
  brincoNovo: string;
  motivo: "perda" | "danificado" | "reidentificacao" | "erro_cadastro" | "outro";
  observacoes: string | null;
  dataAlteracao: string;
};

type Banco = typeof dbPadrao;
type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
let bancoManejo: Banco = dbPadrao;

export function definirBancoManejo(banco: Banco | null) {
  bancoManejo = banco ?? dbPadrao;
}

function textoErro(erro: unknown) {
  return erro instanceof Error
    ? `${erro.message} ${String((erro as { code?: string }).code ?? "")} ${String((erro as { errno?: number }).errno ?? "")}`
    : String(erro);
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_MANEJO_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_MANEJO_NAO_ENCONTRADO });
  }
}

export async function registrarBrincoPontual(
  sessao: SessaoManejo,
  entrada: {
    fazendaId: number;
    animalId: number;
    alteraBrinco: boolean;
    alteraRfid: boolean;
    novoBrinco: string | null;
    novoRfid: string | null;
    historico: HistoricoBrincoPontual;
  },
) {
  try {
    return await bancoManejo.transaction(async (tx) => {
      const deciso = await autorizarOperacaoPersistida(consultaEstoqueNaTransacao(tx), {
        executorId: sessao.executorId,
        sessionVersionDaSessao: sessao.sessionVersionDaSessao,
        permissaoId: "manejo.criar",
        fazendaId: entrada.fazendaId,
      });
      if (!deciso.ok) recusar(deciso.motivo);
      const titular = deciso.contexto.titularUserId;
      const [animal] = await tx
        .select({ id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId })
        .from(animais)
        .where(eq(animais.id, entrada.animalId))
        .for("update")
        .limit(1);
      if (!animal || animal.userId !== titular || animal.fazendaId !== entrada.fazendaId) recusar("outro_titular");
      if (entrada.alteraBrinco) {
        const indice = await tx.execute(sql`SHOW INDEX FROM animais WHERE Key_name = 'animais_brinco_ativo_fazenda_uq'`);
        const pacote = indice as unknown as [unknown[], unknown];
        const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
        if (linhas.length === 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANEJO_SEM_INDICE });
        }
      }
      const dados: Record<string, unknown> = {};
      if (entrada.alteraBrinco) dados.brinco = entrada.novoBrinco;
      if (entrada.alteraRfid) dados.brincoEletronico = entrada.novoRfid;
      const usuario = await consultaEstoqueNaTransacao(tx).usuario(sessao.executorId);
      await tx.update(animais).set(dados).where(and(
        eq(animais.id, entrada.animalId),
        eq(animais.userId, titular),
        eq(animais.fazendaId, entrada.fazendaId),
      ));
      await tx.insert(historicoBrincos).values({
        userId: titular,
        animalId: entrada.animalId,
        brincoAnterior: entrada.historico.brincoAnterior,
        brincoNovo: entrada.historico.brincoNovo,
        motivo: entrada.historico.motivo,
        observacoes: entrada.historico.observacoes,
        dataAlteracao: entrada.historico.dataAlteracao,
        usuarioNome: usuario?.name ?? null,
      });
      return { success: true as const, titularUserId: titular };
    }, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    recusarSeDeadlockEstoque(erro);
    if (/Duplicate entry|ER_DUP_ENTRY|\b1062\b/.test(textoErro(erro))) {
      throw new TRPCError({
        code: "CONFLICT",
        message: buildBrincoAtivoConflitoMessage(entrada.novoBrinco ?? ""),
      });
    }
    if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(textoErro(erro))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANEJO_SEM_MYSQL });
    }
    throw erro;
  }
}
