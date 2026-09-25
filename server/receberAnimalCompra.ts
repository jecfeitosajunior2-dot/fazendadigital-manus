import { TRPCError } from "@trpc/server";
import {
  buildBrincoAtivoConflitoMessage,
  normalizeBrincoKey,
} from "../shared/brincoAtivo";
import {
  MSG_RECEBIMENTO_COMPRA_CANCELADA,
  MSG_RECEBIMENTO_COMPRA_NAO_CONCLUIDA,
  MSG_RECEBIMENTO_COMPRA_NAO_ENCONTRADA,
  MSG_RECEBIMENTO_FALHOU,
  MSG_RECEBIMENTO_GRUPO_ESGOTADO,
  MSG_RECEBIMENTO_GRUPO_NAO_ENCONTRADO,
  MSG_RECEBIMENTO_LOTE_FAZENDA,
  MSG_RECEBIMENTO_LOTE_INATIVO,
  MSG_RECEBIMENTO_LOTE_NAO_ENCONTRADO,
  MSG_RECEBIMENTO_PASTO_FAZENDA,
  MSG_RECEBIMENTO_PASTO_NAO_ENCONTRADO,
  MSG_RECEBIMENTO_SEM_FAZENDA,
  montarSnapshotRecebimentoCompra,
  normalizarRecebimentoAnimalInput,
  observacaoRecebimentoCompra,
} from "../shared/compraRecebimento";
import { grupoCompraAceitaNovoVinculo, labelSexoCompra } from "../shared/compraIdentificacao";
import { buildRfidConflitoMessage, normalizeRfidKey } from "../shared/rfidUnicidade";

export type ReceberAnimalCompraInput = {
  compraId: number;
  compraGrupoId: number;
  brincoVisual: string;
  rfid?: string | null;
  pesoEntrada?: string | null;
  loteId?: number | null;
  pastoId?: number | null;
  raca?: string | null;
  observacoes?: string | null;
  dataRecebimento: string;
};

export type ReceberAnimalCompraCompra = {
  id: number;
  userId: number;
  fazendaId: number | null;
  status: string | null;
  pesoTotal?: unknown;
};

export type ReceberAnimalCompraGrupo = {
  id: number;
  userId: number;
  compraId: number;
  categoria: string;
  sexo: "macho" | "femea";
  quantidade: number;
};

export type ReceberAnimalCompraLote = {
  id: number;
  userId: number;
  fazendaId: number | null;
  nome: string;
  ativo: boolean | null;
  pastoAtualId: number | null;
};

export type ReceberAnimalCompraPasto = {
  id: number;
  userId: number;
  fazendaId: number | null;
  nome: string;
};

export type ReceberAnimalInsertRow = {
  userId: number;
  fazendaId: number;
  sexo: "macho" | "femea";
  categoria: string;
  brinco: string;
  nome: string;
  brincoEletronico: string | null;
  raca: string | null;
  status: "ativo";
  dataEntrada: string;
  observacoes: string | null;
  compraId: number;
  compraGrupoId: number;
  loteId: number | null;
  pastoId: number | null;
  pesoAtual: string | null;
};

export type ReceberAnimalCompraTx = {
  getCompra(userId: number, compraId: number): Promise<ReceberAnimalCompraCompra | null>;
  lockGrupo(
    userId: number,
    compraId: number,
    grupoId: number,
  ): Promise<ReceberAnimalCompraGrupo | null>;
  countIdentificadosNoGrupo(userId: number, compraId: number, grupoId: number): Promise<number>;
  findBrincoAtivoConflito(
    userId: number,
    brinco: string,
    fazendaId: number,
  ): Promise<{ id: number } | null>;
  findRfidConflito(userId: number, rfid: string): Promise<{ id: number; status: string | null } | null>;
  findLote(userId: number, loteId: number): Promise<ReceberAnimalCompraLote | null>;
  findPasto(userId: number, pastoId: number): Promise<ReceberAnimalCompraPasto | null>;
  insertAnimal(row: ReceberAnimalInsertRow): Promise<number>;
  insertRecebimento(row: {
    userId: number;
    compraId: number;
    compraGrupoId: number;
    animalId: number;
    brincoVisual: string;
    rfid: string | null;
    sexo: "macho" | "femea";
    categoria: string;
    pesoRecebimento: string | null;
    loteDestinoId: number | null;
    pastoDestinoId: number | null;
    status: "confirmado";
    recebidoPorUserId: number;
    recebidoEm: Date;
  }): Promise<number>;
  insertPesagem(row: {
    userId: number;
    animalId: number;
    peso: string;
    data: string;
    observacoes: string;
    compraRecebimentoId: number;
  }): Promise<number>;
  insertMovimentacao(row: {
    userId: number;
    animalId: number;
    loteOrigemId: null;
    loteDestinoId: number;
    pastoOrigemId: null;
    pastoDestinoId: number | null;
    fazendaId: number;
    dataMovimentacao: string;
    usuarioNome: string;
    observacoes: string;
    compraRecebimentoId: number;
  }): Promise<number>;
};

export type ReceberAnimalCompraStore = {
  transaction<T>(fn: (tx: ReceberAnimalCompraTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function pesoTexto(pesoKg: number): string {
  return Number.isInteger(pesoKg) ? String(pesoKg) : pesoKg.toFixed(2);
}

export function createReceberAnimalCompraService(store: ReceberAnimalCompraStore) {
  return async function receberAnimalCompra(
    userId: number,
    input: ReceberAnimalCompraInput,
    opts?: { usuarioNome?: string | null },
  ) {
    const parsed = normalizarRecebimentoAnimalInput(input);
    if (!parsed.ok) toTrpc(parsed.message);

    const usuarioNome = String(opts?.usuarioNome ?? "").trim() || "Usuário";
    const obsHistorico = observacaoRecebimentoCompra(parsed.compraId);

    return store.transaction(async tx => {
      const compra = await tx.getCompra(userId, parsed.compraId);
      if (!compra || compra.userId !== userId) {
        toTrpc(MSG_RECEBIMENTO_COMPRA_NAO_ENCONTRADA, "NOT_FOUND");
      }
      if (compra.status === "cancelado") toTrpc(MSG_RECEBIMENTO_COMPRA_CANCELADA);
      if (compra.status !== "concluido") toTrpc(MSG_RECEBIMENTO_COMPRA_NAO_CONCLUIDA);
      if (compra.fazendaId == null || compra.fazendaId <= 0) {
        toTrpc(MSG_RECEBIMENTO_SEM_FAZENDA);
      }
      const fazendaId = Number(compra.fazendaId);

      const grupo = await tx.lockGrupo(userId, parsed.compraId, parsed.compraGrupoId);
      if (!grupo || grupo.userId !== userId || grupo.compraId !== parsed.compraId) {
        toTrpc(MSG_RECEBIMENTO_GRUPO_NAO_ENCONTRADO, "NOT_FOUND");
      }

      const identificados = await tx.countIdentificadosNoGrupo(
        userId,
        parsed.compraId,
        grupo.id,
      );
      if (!grupoCompraAceitaNovoVinculo(grupo.quantidade, identificados)) {
        toTrpc(MSG_RECEBIMENTO_GRUPO_ESGOTADO);
      }

      const brincoConflito = await tx.findBrincoAtivoConflito(userId, parsed.brinco, fazendaId);
      if (brincoConflito) toTrpc(buildBrincoAtivoConflitoMessage(parsed.brinco, brincoConflito));

      if (parsed.rfid) {
        const rfidKey = normalizeRfidKey(parsed.rfid);
        const rfidConflito = await tx.findRfidConflito(userId, rfidKey);
        if (rfidConflito) toTrpc(buildRfidConflitoMessage(rfidConflito));
      }

      let lote: ReceberAnimalCompraLote | null = null;
      if (parsed.loteId != null) {
        lote = await tx.findLote(userId, parsed.loteId);
        if (!lote) toTrpc(MSG_RECEBIMENTO_LOTE_NAO_ENCONTRADO, "NOT_FOUND");
        if (lote.ativo === false) toTrpc(MSG_RECEBIMENTO_LOTE_INATIVO);
        if (lote.fazendaId == null || Number(lote.fazendaId) !== fazendaId) {
          toTrpc(MSG_RECEBIMENTO_LOTE_FAZENDA);
        }
      }

      let pasto: ReceberAnimalCompraPasto | null = null;
      const pastoIdInformado = parsed.pastoId;
      const pastoIdEfetivo = pastoIdInformado ?? lote?.pastoAtualId ?? null;
      if (pastoIdEfetivo != null) {
        pasto = await tx.findPasto(userId, pastoIdEfetivo);
        if (!pasto) toTrpc(MSG_RECEBIMENTO_PASTO_NAO_ENCONTRADO, "NOT_FOUND");
        if (pasto.fazendaId == null || Number(pasto.fazendaId) !== fazendaId) {
          toTrpc(MSG_RECEBIMENTO_PASTO_FAZENDA);
        }
      }

      const pesoTextoValor = parsed.pesoKg != null ? pesoTexto(parsed.pesoKg) : null;
      const animalId = await tx.insertAnimal({
        userId,
        fazendaId,
        sexo: grupo.sexo,
        categoria: grupo.categoria,
        brinco: parsed.brinco,
        nome: parsed.brinco,
        brincoEletronico: parsed.rfid,
        raca: parsed.raca,
        status: "ativo",
        dataEntrada: parsed.dataRecebimento,
        observacoes: parsed.observacoes,
        compraId: parsed.compraId,
        compraGrupoId: grupo.id,
        loteId: lote?.id ?? null,
        pastoId: pasto?.id ?? null,
        pesoAtual: pesoTextoValor,
      });
      if (!Number.isFinite(animalId) || animalId <= 0) toTrpc(MSG_RECEBIMENTO_FALHOU);

      const recebidoEm = new Date();
      const snapshot = montarSnapshotRecebimentoCompra({
        userId,
        compraId: parsed.compraId,
        compraGrupoId: grupo.id,
        animalId,
        brincoVisual: parsed.brinco,
        rfid: parsed.rfid,
        sexo: grupo.sexo,
        categoria: grupo.categoria,
        pesoTexto: pesoTextoValor,
        loteDestinoId: lote?.id ?? null,
        pastoDestinoId: pasto?.id ?? null,
        recebidoPorUserId: userId,
      });
      const recebimentoId = await tx.insertRecebimento({
        ...snapshot,
        recebidoEm,
      });
      if (!Number.isFinite(recebimentoId) || recebimentoId <= 0) toTrpc(MSG_RECEBIMENTO_FALHOU);

      if (pesoTextoValor) {
        const pesagemId = await tx.insertPesagem({
          userId,
          animalId,
          peso: pesoTextoValor,
          data: parsed.dataRecebimento,
          observacoes: obsHistorico,
          compraRecebimentoId: recebimentoId,
        });
        if (!Number.isFinite(pesagemId) || pesagemId <= 0) toTrpc(MSG_RECEBIMENTO_FALHOU);
      }

      if (lote) {
        const movId = await tx.insertMovimentacao({
          userId,
          animalId,
          loteOrigemId: null,
          loteDestinoId: lote.id,
          pastoOrigemId: null,
          pastoDestinoId: pasto?.id ?? null,
          fazendaId,
          dataMovimentacao: parsed.dataRecebimento,
          usuarioNome,
          observacoes: obsHistorico,
          compraRecebimentoId: recebimentoId,
        });
        if (!Number.isFinite(movId) || movId <= 0) toTrpc(MSG_RECEBIMENTO_FALHOU);
      }

      return {
        success: true as const,
        animalId,
        recebimentoId,
        brinco: parsed.brinco,
        sexo: grupo.sexo,
        sexoLabel: labelSexoCompra(grupo.sexo),
        categoria: grupo.categoria,
        pesoKg: parsed.pesoKg,
        loteNome: lote?.nome ?? null,
        pastoNome: pasto?.nome ?? null,
        recebidoEm: recebidoEm.toISOString(),
        dataEntrada: parsed.dataRecebimento,
        compraId: parsed.compraId,
        compraGrupoId: grupo.id,
        fazendaId,
        userId,
        statusCompra: compra.status,
      };
    });
  };
}
