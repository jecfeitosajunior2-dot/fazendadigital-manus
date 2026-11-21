import { TRPCError } from "@trpc/server";
import { autorizarOperacaoPersistida, type PedidoAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import {
  autorizarEstoqueNaFazenda,
  erroEstoque,
  type IoEstoque,
  type RecusaEstoque,
} from "./consultaEstoqueAutorizada";

export const PERMISSAO_VISUALIZAR_COMPRAS = "compras.visualizar";
export const PERMISSAO_CRIAR_COMPRAS = "compras.criar";
export const PERMISSAO_CONFIRMAR_COMPRAS = "compras.confirmar";
export const PERMISSAO_CANCELAR_COMPRAS = "compras.cancelar";
export const PERMISSAO_INATIVAR_COMPRAS = "compras.inativar";

export const MSG_SEM_PERMISSAO_VER_COMPRAS = "Sem permissão para consultar compras.";
export const MSG_SEM_PERMISSAO_CRIAR_COMPRAS = "Sem permissão para registrar compra.";
export const MSG_SEM_PERMISSAO_CONFIRMAR_COMPRAS = "Sem permissão para confirmar ou receber esta compra.";
export const MSG_SEM_PERMISSAO_CANCELAR_COMPRAS = "Sem permissão para cancelar esta compra.";
export const MSG_SEM_PERMISSAO_EXCLUIR_COMPRAS = "Sem permissão para excluir esta compra.";
export const MSG_CADASTRO_COMPRA_SEM_FAZENDA =
  "O cadastro antigo de compra não informa a fazenda. Nada foi gravado. Use a confirmação da compra.";

export function recusarCompraSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhuma compra foi consultada ou alterada.",
  });
}

export function erroCompra(resultado: RecusaEstoque, semPermissao = MSG_SEM_PERMISSAO_VER_COMPRAS): TRPCError {
  return erroEstoque(resultado, semPermissao);
}

export type EscopoConsultaCompra = {
  titularUserId: number;
  fazendaIds: number[];
  papel: string;
};

export type SessaoExecutorCompra = {
  executorId: number;
  sessionVersionDaSessao: number | null;
};

export function compraVisivelNoEscopo(
  fazendaId: number | null | undefined,
  escopo: EscopoConsultaCompra,
): boolean {
  if (fazendaId == null) return escopo.papel === "principal";
  return escopo.fazendaIds.includes(fazendaId);
}

type PedidoCompra = Omit<PedidoAutorizacaoPersistida, "permissaoId"> & { permissaoId: string };

export async function autorizarCompraNaFazenda(
  io: IoEstoque,
  pedido: PedidoCompra & { fazendaId: number },
  semPermissao: string,
) {
  return autorizarEstoqueNaFazenda(io, pedido, semPermissao);
}

export async function fazendasDaConsultaCompra(
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
        permissaoId: PERMISSAO_VISUALIZAR_COMPRAS,
        fazendaId: fazenda.id,
      });
      if (!decisao.ok) {
        if (decisao.motivo === "sem_identidade" || decisao.motivo === "sem_permissao") {
          return {
            ok: false,
            motivo: decisao.motivo,
            mensagem: decisao.motivo === "sem_permissao" ? MSG_SEM_PERMISSAO_VER_COMPRAS : "Sessão inválida.",
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
