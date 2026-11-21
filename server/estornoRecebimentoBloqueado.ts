/**
 * O estorno que apaga o animal não tem como ser seguro hoje.
 * Pesagem, sanidade, reprodução e movimentação gravam histórico
 * sem a mesma ordem de bloqueio. A rota recusa antes de alterar qualquer linha.
 */
import { TRPCError } from "@trpc/server";
import {
  MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL,
  MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO,
  normalizarEstornoRecebimentoCompraInput,
} from "../shared/compraRecebimentoEstorno";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

export const PERMISSAO_DESFAZER_RECEBIMENTO = "compras.desfazer_recebimento";
export const MSG_SEM_PERMISSAO_ESTORNO_RECEBIMENTO =
  "Você não tem permissão para desfazer o recebimento de um animal.";

export type RecebimentoEstornoLinha = {
  id: number;
  userId: number;
  compraId: number;
  animalId: number;
  status: string;
};

export type CompraEstornoLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  status: string | null;
};

export type AnimalEstornoDono = {
  id: number;
  userId: number;
};

export type ConsultaEstornoRecebimento = ConsultaAutorizacaoPersistida & {
  espiarRecebimento(id: number): Promise<RecebimentoEstornoLinha | null>;
  espiarCompra(id: number): Promise<CompraEstornoLinha | null>;
  espiarAnimal(id: number): Promise<AnimalEstornoDono | null>;
  aposAutorizacao?(): Promise<void>;
};

export type IoEstornoRecebimento = {
  emTransacao<T>(fn: (tx: ConsultaEstornoRecebimento) => Promise<T>): Promise<T>;
};

export type PedidoEstornoRecebimento = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  recebimentoId: number;
  motivo: string;
  observacao?: string | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type RecusaEstornoRecebimento = {
  ok: false;
  motivo: MotivoOperacional | "invalido" | "nao_encontrado" | "indisponivel";
  mensagem?: string;
};

function recusa(
  motivo: RecusaEstornoRecebimento["motivo"],
  mensagem?: string,
): RecusaEstornoRecebimento {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

export async function recusarEstornoRecebimentoAutorizado(
  io: IoEstornoRecebimento,
  pedido: PedidoEstornoRecebimento,
): Promise<RecusaEstornoRecebimento> {
  const entrada = normalizarEstornoRecebimentoCompraInput({
    recebimentoId: pedido.recebimentoId,
    motivo: pedido.motivo,
    observacao: pedido.observacao,
  });
  if (!entrada.ok) return recusa("invalido", entrada.message);

  return io.emTransacao(async (tx) => {
    const recebimento = await tx.espiarRecebimento(entrada.recebimentoId);
    if (!recebimento) return recusa("nao_encontrado", MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO);

    const compra = await tx.espiarCompra(recebimento.compraId);
    if (!compra || compra.userId !== recebimento.userId) {
      return recusa("nao_encontrado", MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO);
    }

    const autorizacao: PedidoAutorizacaoPersistida = {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_DESFAZER_RECEBIMENTO,
      fazendaId: compra.fazendaId,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    };
    const decisao = await autorizarOperacaoPersistida(tx, autorizacao);
    if (!decisao.ok) {
      if (decisao.motivo === "sem_fazenda") return recusa(decisao.motivo, MSG_SEM_FAZENDA_MANEJO);
      if (decisao.motivo === "fazenda_ausente") {
        return recusa("indisponivel", MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL);
      }
      return recusa(decisao.motivo);
    }
    if (recebimento.userId !== decisao.contexto.titularUserId) {
      return recusa("outro_titular", MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO);
    }

    const animal = await tx.espiarAnimal(recebimento.animalId);
    if (animal && animal.userId !== decisao.contexto.titularUserId) {
      return recusa("outro_titular", MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO);
    }

    await tx.aposAutorizacao?.();
    return recusa("indisponivel", MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL);
  });
}

export function erroEstornoRecebimento(resultado: RecusaEstornoRecebimento): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_ESTORNO_RECEBIMENTO });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO });
    case "indisponivel":
      return new TRPCError({
        code: "PRECONDITION_FAILED",
        message: resultado.mensagem ?? MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL,
      });
    default:
      return new TRPCError({
        code: "BAD_REQUEST",
        message: resultado.mensagem ?? MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO,
      });
  }
}
