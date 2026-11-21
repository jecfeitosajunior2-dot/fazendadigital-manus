import { TRPCError } from "@trpc/server";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/** Consulta de partidas, saldos, histórico e catálogo. */
export const PERMISSAO_CONSULTAR_SEMEN = "semen.visualizar";
/** Catálogo externo novo. A entrada de doses continua em semen.criar no serviço já homologado. */
export const PERMISSAO_CATALOGO_SEMEN_CRIAR = "semen.criar";
/** Alterar o catálogo externo. Correção e ajuste continuam em semen.editar. */
export const PERMISSAO_CATALOGO_SEMEN_EDITAR = "semen.editar";

export const MSG_SEM_PERMISSAO_CONSULTA_SEMEN = "Sem permissão para consultar o sêmen.";
export const MSG_SEM_PERMISSAO_CATALOGO_SEMEN = "Sem permissão para alterar o catálogo de sêmen.";
export const MSG_SEM_FAZENDA_SEMEN = "Você não tem acesso a esta fazenda.";

export function recusarSemenSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhum dado de sêmen foi consultado ou alterado.",
  });
}

export type IoSemen = {
  emTransacao<T>(fn: (tx: ConsultaAutorizacaoPersistida) => Promise<T>): Promise<T>;
};

export type PedidoSemen = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  permissaoId: string;
  fazendaId: number;
};

export type RecusaSemen = {
  ok: false;
  motivo: MotivoOperacional | "sem_permissao";
  mensagem?: string;
};

export type AcessoSemen = { ok: true; titularUserId: number; executorUserId: number };

export function erroSemen(resultado: RecusaSemen, semPermissao = MSG_SEM_PERMISSAO_CONSULTA_SEMEN): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_SEMEN });
    default:
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? "Registro de sêmen não encontrado." });
  }
}

export async function autorizarSemenNaFazenda(io: IoSemen, pedido: PedidoSemen): Promise<AcessoSemen | RecusaSemen> {
  return io.emTransacao(async (tx) => {
    const decisao = await autorizarOperacaoPersistida(tx, pedido);
    if (!decisao.ok) {
      if (decisao.motivo === "sem_permissao") {
        return {
          ok: false,
          motivo: "sem_permissao",
          mensagem: pedido.permissaoId === PERMISSAO_CONSULTAR_SEMEN
            ? MSG_SEM_PERMISSAO_CONSULTA_SEMEN
            : MSG_SEM_PERMISSAO_CATALOGO_SEMEN,
        };
      }
      if (decisao.motivo === "sem_fazenda") {
        return { ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_SEMEN };
      }
      if (decisao.motivo === "sem_identidade") {
        return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
      }
      return { ok: false, motivo: decisao.motivo };
    }
    return {
      ok: true,
      titularUserId: decisao.contexto.titularUserId,
      executorUserId: decisao.contexto.executorUserId,
    };
  });
}

/** Confere sessão e permissão de consulta antes de saber a fazenda do registro. */
export async function identificarLeitorSemen(
  io: IoSemen,
  pedido: Omit<PedidoSemen, "permissaoId" | "fazendaId">,
): Promise<{ ok: true; titularUserId: number } | RecusaSemen> {
  return io.emTransacao(async (tx) => {
    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo") {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    if (
      pedido.sessionVersionDaSessao != null
      && pedido.sessionVersionDaSessao !== usuario.sessionVersion
    ) {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    if (usuario.papel !== "principal") {
      const permissoes = await tx.permissoes(usuario.id, usuario.titularUserId);
      if (!permissoes.includes(PERMISSAO_CONSULTAR_SEMEN)) {
        return { ok: false, motivo: "sem_permissao", mensagem: MSG_SEM_PERMISSAO_CONSULTA_SEMEN };
      }
    }
    return { ok: true, titularUserId: usuario.titularUserId };
  });
}
