import { TRPCError } from "@trpc/server";
import {
  MSG_ESTORNO_RECEBIMENTO_FALHOU,
  MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO,
  normalizarEstornoRecebimentoCompraInput,
  verificarElegibilidadeEstornoRecebimento,
  type AnimalEstornoSnap,
  type MotivoEstornoRecebimentoCompra,
  type RecebimentoEstornoSnap,
  type VinculoEstornoRef,
} from "../shared/compraRecebimentoEstorno";

export type DesfazerRecebimentoCompraInput = {
  recebimentoId: number;
  motivo: MotivoEstornoRecebimentoCompra | string;
  observacao?: string | null;
};

export type DesfazerRecebimentoCompraTx = {
  lockRecebimento(userId: number, recebimentoId: number): Promise<RecebimentoEstornoSnap | null>;
  lockAnimal(userId: number, animalId: number): Promise<AnimalEstornoSnap | null>;
  lockGrupo(userId: number, compraId: number, grupoId: number): Promise<{ id: number } | null>;
  getCompra(
    userId: number,
    compraId: number,
  ): Promise<{ id: number; userId: number; status: string | null } | null>;
  listPesagens(userId: number, animalId: number): Promise<VinculoEstornoRef[]>;
  listMovimentacoes(userId: number, animalId: number): Promise<VinculoEstornoRef[]>;
  temHistoricoBrincos(userId: number, animalId: number): Promise<boolean>;
  temSaude(userId: number, animalId: number): Promise<boolean>;
  temReproducaoFemea(userId: number, animalId: number): Promise<boolean>;
  temReproducaoMacho(userId: number, animalId: number): Promise<boolean>;
  temFilhoComoMae(userId: number, animalId: number): Promise<boolean>;
  temFilhoComoPai(userId: number, animalId: number): Promise<boolean>;
  temPartoCria(userId: number, animalId: number): Promise<boolean>;
  temSemenPartida(userId: number, animalId: number): Promise<boolean>;
  temBaixa(userId: number, animalId: number): Promise<boolean>;
  temVendaItem(userId: number, animalId: number): Promise<boolean>;
  deletePesagensDoRecebimento(userId: number, recebimentoId: number, animalId: number): Promise<void>;
  deleteMovimentacoesDoRecebimento(
    userId: number,
    recebimentoId: number,
    animalId: number,
  ): Promise<void>;
  deleteAnimal(userId: number, animalId: number): Promise<void>;
  marcarRecebimentoEstornado(row: {
    recebimentoId: number;
    userId: number;
    motivo: MotivoEstornoRecebimentoCompra;
    observacao: string | null;
    estornadoPorUserId: number;
    estornadoEm: Date;
  }): Promise<void>;
};

export type DesfazerRecebimentoCompraStore = {
  transaction<T>(fn: (tx: DesfazerRecebimentoCompraTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

export function createDesfazerRecebimentoCompraService(store: DesfazerRecebimentoCompraStore) {
  return async function desfazerRecebimentoCompra(
    userId: number,
    input: DesfazerRecebimentoCompraInput,
    opts?: { estornadoPorUserId?: number },
  ) {
    const parsed = normalizarEstornoRecebimentoCompraInput(input);
    if (!parsed.ok) toTrpc(parsed.message);

    const estornadoPorUserId = opts?.estornadoPorUserId ?? userId;
    const estornadoEm = new Date();

    return store.transaction(async tx => {
      const recebimento = await tx.lockRecebimento(userId, parsed.recebimentoId);
      if (!recebimento || recebimento.userId !== userId) {
        toTrpc(MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO, "NOT_FOUND");
      }

      const compra = await tx.getCompra(userId, recebimento.compraId);
      if (!compra || compra.userId !== userId) {
        toTrpc(MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO, "NOT_FOUND");
      }

      const animal = await tx.lockAnimal(userId, recebimento.animalId);
      const grupo = await tx.lockGrupo(userId, recebimento.compraId, recebimento.compraGrupoId);
      if (!grupo) toTrpc(MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO, "NOT_FOUND");

      const fatos = {
        userId,
        recebimento,
        animal,
        compraUserId: compra.userId,
        pesagens: animal ? await tx.listPesagens(userId, animal.id) : [],
        movimentacoes: animal ? await tx.listMovimentacoes(userId, animal.id) : [],
        temHistoricoBrincos: animal ? await tx.temHistoricoBrincos(userId, animal.id) : false,
        temSaude: animal ? await tx.temSaude(userId, animal.id) : false,
        temReproducaoFemea: animal ? await tx.temReproducaoFemea(userId, animal.id) : false,
        temReproducaoMacho: animal ? await tx.temReproducaoMacho(userId, animal.id) : false,
        temFilhoComoMae: animal ? await tx.temFilhoComoMae(userId, animal.id) : false,
        temFilhoComoPai: animal ? await tx.temFilhoComoPai(userId, animal.id) : false,
        temPartoCria: animal ? await tx.temPartoCria(userId, animal.id) : false,
        temSemenPartida: animal ? await tx.temSemenPartida(userId, animal.id) : false,
        temBaixa: animal ? await tx.temBaixa(userId, animal.id) : false,
        temVendaItem: animal ? await tx.temVendaItem(userId, animal.id) : false,
      };

      const elegivel = verificarElegibilidadeEstornoRecebimento(fatos);
      if (!elegivel.ok) toTrpc(elegivel.message);

      if (!animal) toTrpc(MSG_ESTORNO_RECEBIMENTO_FALHOU);

      await tx.deletePesagensDoRecebimento(userId, recebimento.id, animal.id);
      await tx.deleteMovimentacoesDoRecebimento(userId, recebimento.id, animal.id);
      await tx.deleteAnimal(userId, animal.id);
      await tx.marcarRecebimentoEstornado({
        recebimentoId: recebimento.id,
        userId,
        motivo: parsed.motivo,
        observacao: parsed.observacao,
        estornadoPorUserId,
        estornadoEm,
      });

      return {
        success: true as const,
        recebimentoId: recebimento.id,
        animalId: animal.id,
        compraId: recebimento.compraId,
        compraGrupoId: recebimento.compraGrupoId,
        status: "estornado" as const,
        motivo: parsed.motivo,
        observacao: parsed.observacao,
        estornadoEm: estornadoEm.toISOString(),
      };
    });
  };
}
