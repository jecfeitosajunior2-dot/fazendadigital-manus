import { TRPCError } from "@trpc/server";
import { autorizarOperacaoPersistida, type PedidoAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import {
  autorizarEstoqueNaFazenda,
  erroEstoque,
  type IoEstoque,
  type RecusaEstoque,
} from "./consultaEstoqueAutorizada";

export const PERMISSAO_VISUALIZAR_VENDAS = "vendas.visualizar";
export const PERMISSAO_CRIAR_VENDAS = "vendas.criar";
export const PERMISSAO_INATIVAR_VENDAS = "vendas.inativar";

export const MSG_SEM_PERMISSAO_VER_VENDAS = "Sem permissão para consultar vendas.";
export const MSG_SEM_PERMISSAO_CRIAR_VENDAS = "Sem permissão para registrar venda.";
export const MSG_SEM_PERMISSAO_EXCLUIR_VENDAS = "Sem permissão para excluir esta venda.";
export const MSG_CADASTRO_VENDA_SEM_FAZENDA =
  "O cadastro antigo de venda não informa a fazenda. Nada foi gravado. Use a confirmação da venda.";
export const MSG_VENDA_EXCLUIR_COM_EFEITO =
  "Esta venda já tem animais, título ou status comercial. Nada foi apagado.";

export function recusarVendaSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhuma venda foi consultada ou alterada.",
  });
}

export function erroVendaConsulta(resultado: RecusaEstoque, semPermissao = MSG_SEM_PERMISSAO_VER_VENDAS): TRPCError {
  return erroEstoque(resultado, semPermissao);
}

export type EscopoConsultaVenda = {
  titularUserId: number;
  fazendaIds: number[];
  papel: string;
};

export function vendaVisivelNoEscopo(
  fazendaId: number | null | undefined,
  escopo: EscopoConsultaVenda,
): boolean {
  if (fazendaId == null) return escopo.papel === "principal";
  return escopo.fazendaIds.includes(fazendaId);
}

type PedidoVenda = Omit<PedidoAutorizacaoPersistida, "permissaoId"> & { permissaoId: string };

export async function autorizarVendaNaFazenda(
  io: IoEstoque,
  pedido: PedidoVenda & { fazendaId: number },
  semPermissao: string,
) {
  return autorizarEstoqueNaFazenda(io, pedido, semPermissao);
}

export async function fazendasDaConsultaVenda(
  io: IoEstoque,
  pedido: Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId">,
): Promise<{ ok: true; titularUserId: number; fazendaIds: number[]; papel: string } | RecusaEstoque> {
  return io.emTransacao(async (tx) => {
    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo" || !usuario.papel) {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    if (
      pedido.sessionVersionDaSessao != null
      && pedido.sessionVersionDaSessao !== usuario.sessionVersion
    ) {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    const fazendas = [...await tx.fazendasDoTitular(usuario.titularUserId)].sort((a, b) => a.id - b.id);
    const autorizadas: number[] = [];
    for (const fazenda of fazendas) {
      const decisao = await autorizarOperacaoPersistida(tx, {
        ...pedido,
        permissaoId: PERMISSAO_VISUALIZAR_VENDAS,
        fazendaId: fazenda.id,
      });
      if (!decisao.ok) {
        if (decisao.motivo === "sem_identidade" || decisao.motivo === "sem_permissao") {
          return {
            ok: false,
            motivo: decisao.motivo,
            mensagem: decisao.motivo === "sem_permissao" ? MSG_SEM_PERMISSAO_VER_VENDAS : "Sessão inválida.",
          };
        }
        continue;
      }
      autorizadas.push(fazenda.id);
    }
    return {
      ok: true,
      titularUserId: usuario.titularUserId,
      fazendaIds: autorizadas,
      papel: usuario.papel,
    };
  });
}
