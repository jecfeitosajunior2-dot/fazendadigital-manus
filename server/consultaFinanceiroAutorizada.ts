import { TRPCError } from "@trpc/server";
import { autorizarOperacaoPersistida, type ConsultaAutorizacaoPersistida, type PedidoAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import { erroEstoque, type IoEstoque, type RecusaEstoque } from "./consultaEstoqueAutorizada";

export const PERMISSAO_VER_FINANCEIRO = "financeiro.visualizar";
export const PERMISSAO_CRIAR_FINANCEIRO = "financeiro.criar";
export const PERMISSAO_EDITAR_FINANCEIRO = "financeiro.editar";
export const PERMISSAO_INATIVAR_FINANCEIRO = "financeiro.inativar";
export const PERMISSAO_CONFIRMAR_FINANCEIRO = "financeiro.confirmar";
export const PERMISSAO_ESTORNAR_FINANCEIRO = "financeiro.estornar";

export const MSG_SEM_PERMISSAO_VER_FINANCEIRO = "Sem permissão para consultar o financeiro.";
export const MSG_SEM_PERMISSAO_CRIAR_FINANCEIRO = "Sem permissão para registrar no financeiro.";
export const MSG_SEM_PERMISSAO_EDITAR_FINANCEIRO = "Sem permissão para alterar o financeiro.";
export const MSG_SEM_PERMISSAO_INATIVAR_FINANCEIRO = "Sem permissão para inativar no financeiro.";
export const MSG_SEM_PERMISSAO_CONFIRMAR_FINANCEIRO = "Sem permissão para liquidar pagamento ou recebimento.";
export const MSG_SEM_PERMISSAO_ESTORNAR_FINANCEIRO = "Sem permissão para estornar.";
export const MSG_EXTRATO_SO_PRINCIPAL =
  "O extrato e o saldo da conta reúnem todas as fazendas. Só o responsável da conta pode abri-los.";
export const MSG_CAIXA_SO_PRINCIPAL =
  "Conta, transferência e saldo geral ficam com o responsável da conta.";

export function recusarFinanceiroSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhum valor foi consultado ou alterado.",
  });
}

export function erroFinanceiro(resultado: RecusaEstoque, semPermissao = MSG_SEM_PERMISSAO_VER_FINANCEIRO): TRPCError {
  return erroEstoque(resultado, semPermissao);
}

export type AcessoFinanceiro = {
  titularUserId: number;
  papel: string;
  fazendaIds: number[];
};

export type SessaoFinanceiro = {
  executorId: number;
  sessionVersionDaSessao: number | null;
  permissaoId: string;
  exigirPrincipal?: boolean;
};

export type LinhaApropriacaoFinanceira = { fazendaId?: number | null };

export function documentoFinanceiroVisivel(
  fazendaOrigemId: number | null | undefined,
  apropriacoes: readonly LinhaApropriacaoFinanceira[],
  acesso: AcessoFinanceiro,
): boolean {
  if (acesso.papel === "principal") return true;
  const fazendas = new Set<number>();
  if (fazendaOrigemId != null) fazendas.add(fazendaOrigemId);
  for (const linha of apropriacoes) {
    if (linha.fazendaId != null) fazendas.add(linha.fazendaId);
  }
  if (fazendas.size === 0) return false;
  for (const id of fazendas) {
    if (!acesso.fazendaIds.includes(id)) return false;
  }
  return true;
}

export function conferirFazendasDaSessao(
  acesso: AcessoFinanceiro,
  fazendas: readonly (number | null | undefined)[],
  exigirPrincipal = false,
): void {
  if (exigirPrincipal && acesso.papel !== "principal") {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_CAIXA_SO_PRINCIPAL });
  }
  if (acesso.papel !== "principal" && acesso.fazendaIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_VER_FINANCEIRO });
  }
  for (const fazendaId of fazendas) {
    if (fazendaId == null) {
      if (acesso.papel !== "principal") {
        throw new TRPCError({ code: "FORBIDDEN", message: MSG_CAIXA_SO_PRINCIPAL });
      }
      continue;
    }
    if (!acesso.fazendaIds.includes(fazendaId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta fazenda." });
    }
  }
}

export async function acessoDaSessaoFinanceiro(
  tx: ConsultaAutorizacaoPersistida,
  sessao: SessaoFinanceiro,
): Promise<AcessoFinanceiro> {
  const usuario = await tx.usuario(sessao.executorId);
  if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo" || !usuario.papel) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }
  if (
    sessao.sessionVersionDaSessao != null
    && sessao.sessionVersionDaSessao !== usuario.sessionVersion
  ) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }
  if (sessao.exigirPrincipal && usuario.papel !== "principal") {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_CAIXA_SO_PRINCIPAL });
  }
  const fazendas = [...await tx.fazendasDoTitular(usuario.titularUserId)].sort((a, b) => a.id - b.id);
  const autorizadas: number[] = [];
  for (const fazenda of fazendas) {
    const decisao = await autorizarOperacaoPersistida(tx, {
      executorId: sessao.executorId,
      sessionVersionDaSessao: sessao.sessionVersionDaSessao,
      permissaoId: sessao.permissaoId,
      fazendaId: fazenda.id,
    });
    if (!decisao.ok) {
      if (decisao.motivo === "sem_identidade") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      if (decisao.motivo === "sem_permissao") {
        throw new TRPCError({ code: "FORBIDDEN", message: mensagemDaPermissao(sessao.permissaoId) });
      }
      continue;
    }
    autorizadas.push(fazenda.id);
  }
  if (usuario.papel !== "principal" && autorizadas.length === 0 && !sessao.exigirPrincipal) {
    throw new TRPCError({ code: "FORBIDDEN", message: mensagemDaPermissao(sessao.permissaoId) });
  }
  return { titularUserId: usuario.titularUserId, papel: usuario.papel, fazendaIds: autorizadas };
}

export function mensagemDaPermissao(permissaoId: string): string {
  switch (permissaoId) {
    case PERMISSAO_CRIAR_FINANCEIRO: return MSG_SEM_PERMISSAO_CRIAR_FINANCEIRO;
    case PERMISSAO_EDITAR_FINANCEIRO: return MSG_SEM_PERMISSAO_EDITAR_FINANCEIRO;
    case PERMISSAO_INATIVAR_FINANCEIRO: return MSG_SEM_PERMISSAO_INATIVAR_FINANCEIRO;
    case PERMISSAO_CONFIRMAR_FINANCEIRO: return MSG_SEM_PERMISSAO_CONFIRMAR_FINANCEIRO;
    case PERMISSAO_ESTORNAR_FINANCEIRO: return MSG_SEM_PERMISSAO_ESTORNAR_FINANCEIRO;
    default: return MSG_SEM_PERMISSAO_VER_FINANCEIRO;
  }
}

type PedidoConsulta = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId">;

export async function fazendasDaConsultaFinanceiro(
  io: IoEstoque,
  pedido: PedidoConsulta,
): Promise<{ ok: true; titularUserId: number; fazendaIds: number[]; papel: string } | RecusaEstoque> {
  try {
    const acesso = await io.emTransacao((tx) => acessoDaSessaoFinanceiro(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao ?? null,
      permissaoId: PERMISSAO_VER_FINANCEIRO,
    }));
    return { ok: true, ...acesso };
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      return { ok: false, motivo: "sem_permissao", mensagem: error.message };
    }
    throw error;
  }
}
