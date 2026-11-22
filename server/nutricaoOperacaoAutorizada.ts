import { TRPCError } from "@trpc/server";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db } from "./db";

/** Quem clicou e qual permissão já catalogada vale nesta operação. */
export type SessaoNutricao = {
  executorId: number;
  sessionVersionDaSessao: number | null;
  permissaoId:
    | "nutricao.visualizar"
    | "nutricao.criar"
    | "nutricao.editar"
    | "nutricao.inativar"
    | "nutricao.confirmar"
    | "nutricao.estornar";
};

export type AcessoNutricao = {
  titularUserId: number;
  executorUserId: number;
};

export const MSG_NUTRICAO_SEM_SESSAO = "A operação de nutrição precisa da sessão autorizada.";
export const MSG_NUTRICAO_SEM_PERMISSAO = "Sem permissão para esta operação de nutrição.";
export const MSG_NUTRICAO_FAZENDA = "Você não tem acesso a esta Fazenda.";
export const MSG_NUTRICAO_PRODUTO_FAZENDA = "O produto não pertence à fazenda do lançamento.";
export const MSG_NUTRICAO_SEM_MYSQL = "A nutrição precisa do banco oficial. Nada foi gravado no arquivo local.";

type Transacao = MySqlTransaction<any, any, any, any>;
type BancoComTransacao = { transaction: typeof db.transaction };

export function recusarNutricao(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_NUTRICAO_FAZENDA });
    case "outro_titular":
    case "fazenda_inexistente":
    case "fazenda_ausente":
      throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
    default:
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
  }
}

/** O saldo só sai se o produto estiver na mesma fazenda do lançamento. */
export function exigirProdutoDaFazenda(
  fazendaDoProduto: number | null | undefined,
  fazendaDaOperacao: number | null | undefined,
): void {
  if (fazendaDaOperacao == null) return;
  if (Number(fazendaDoProduto) !== Number(fazendaDaOperacao)) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_NUTRICAO_PRODUTO_FAZENDA });
  }
}

export async function autorizarNutricaoNaTransacao(
  tx: Transacao,
  sessao: SessaoNutricao,
  fazendaId: number,
): Promise<AcessoNutricao> {
  const deciso = await autorizarOperacaoPersistida(consultaEstoqueNaTransacao(tx), {
    executorId: sessao.executorId,
    sessionVersionDaSessao: sessao.sessionVersionDaSessao,
    permissaoId: sessao.permissaoId,
    fazendaId,
    titularInformadoPeloCliente: null,
    papelInformadoPeloCliente: null,
    permissoesInformadasPeloCliente: null,
    fazendasInformadasPeloCliente: null,
  });
  if (!deciso.ok) recusarNutricao(deciso.motivo);
  return {
    titularUserId: deciso.contexto.titularUserId,
    executorUserId: deciso.contexto.executorUserId,
  };
}

export async function autorizarNutricaoNoBanco(
  sessao: SessaoNutricao,
  fazendaId: number,
  banco: BancoComTransacao = db,
): Promise<AcessoNutricao> {
  try {
    return await banco.transaction(
      async (tx) => autorizarNutricaoNaTransacao(tx, sessao, fazendaId),
      { isolationLevel: "read committed" },
    );
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
  }
}

/** Com sessão, o dono é o titular gravado. Sem sessão, os testes de cálculo seguem o userId informado. */
export async function resolverDonoNutricao(
  userId: number,
  fazendaId: number,
  sessao: SessaoNutricao | undefined,
  banco: BancoComTransacao,
): Promise<{ dono: number; executor: number }> {
  if (!sessao) return { dono: userId, executor: userId };
  if (sessao.executorId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_NUTRICAO_SEM_PERMISSAO });
  }
  const acesso = await autorizarNutricaoNoBanco(sessao, fazendaId, banco);
  return { dono: acesso.titularUserId, executor: acesso.executorUserId };
}
