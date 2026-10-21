/**
 * Cancelamento comercial de venda + título V2 na mesma transação.
 * Serviço isolado: nenhuma rota ativa deve chamar este módulo nesta fase.
 */
import { TRPCError } from "@trpc/server";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  MSG_FIN_CANCELAR_COM_LIQUIDACAO,
} from "../shared/financeiroNucleo";
import {
  MSG_VENDA_CANCELAR_ANIMAL_ALTERADO,
  MSG_VENDA_CANCELAR_BAIXA_AUSENTE,
  MSG_VENDA_CANCELAR_JA_CANCELADA,
  MSG_VENDA_CANCELAR_MOTIVO,
  MSG_VENDA_CANCELAR_NAO_CONCLUIDA,
  MSG_VENDA_CANCELAR_NAO_ENCONTRADA,
  MSG_VENDA_CANCELAR_SEM_ITENS,
} from "./cancelarVenda";
import {
  cancelarTituloNoTx,
  listarTitulosPorOrigemNoTx,
  tituloTemLiquidacaoEfetiva,
  type FinanceiroNucleoTx,
  type FinTituloRow,
} from "./financeiroNucleo";

export const MSG_VENDA_CANCELAR_COM_RECEBIMENTO =
  "Esta venda não pode ser cancelada porque já tem recebimento efetivo.";

export type CancelarVendaFinanceiroInput = {
  vendaId: number;
  motivo: string;
  canceladoPorUserId: number;
  canceladoPorNome?: string | null;
};

export type CancelarVendaFinanceiroResultado = {
  success: true;
  vendaId: number;
  tituloId: number | null;
  quantidade: number;
  tituloCancelado: boolean;
  vendaAntigaSemTitulo: boolean;
};

export type VendaCancelamentoRow = {
  id: number;
  userId: number;
  status: string | null;
  idempotencyKey?: string | null;
};

export type CancelarVendaFinanceiroTx = {
  fin: FinanceiroNucleoTx;
  lockVenda(userId: number, vendaId: number): Promise<VendaCancelamentoRow | null>;
  listItensAnimalIds(userId: number, vendaId: number): Promise<number[]>;
  listAnimais(userId: number, ids: number[]): Promise<Array<{ id: number; brinco: string | null; status: string | null }>>;
  listBaixasAtivasDaVenda(
    userId: number,
    vendaId: number,
    animalIds: number[],
  ): Promise<Array<{ id: number; animalId: number }>>;
  estornarBaixas(userId: number, vendaId: number, baixaIds: number[]): Promise<number>;
  restaurarAnimais(userId: number, ids: number[]): Promise<number>;
  marcarVendaCancelada(input: {
    userId: number;
    vendaId: number;
    motivo: string;
    canceladoPorUserId: number;
    canceladoPorNome: string | null;
    canceladoEm: Date;
  }): Promise<number>;
};

export type CancelarVendaFinanceiroStore = {
  transaction<T>(fn: (tx: CancelarVendaFinanceiroTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function identificacao(animal: { brinco?: string | null; id: number }): string {
  const brinco = String(animal.brinco ?? "").trim();
  return brinco || `#${animal.id}`;
}

function tituloPrincipalDaVenda(titulos: FinTituloRow[]): FinTituloRow | null {
  const principais = titulos.filter(t => (t.origemItemChave ?? "") === FINANCEIRO_ORIGEM_ITEM_PRINCIPAL);
  if (principais.length > 1) toTrpc("Há mais de um título financeiro para esta venda.");
  return principais[0] ?? null;
}

async function cancelarVendaFinanceiroNoTx(
  tx: CancelarVendaFinanceiroTx,
  userId: number,
  input: CancelarVendaFinanceiroInput,
): Promise<CancelarVendaFinanceiroResultado> {
  const vendaId = input.vendaId;
  const motivo = String(input.motivo ?? "").trim();
  if (!Number.isInteger(vendaId) || vendaId <= 0) {
    toTrpc(MSG_VENDA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
  }
  if (!motivo) toTrpc(MSG_VENDA_CANCELAR_MOTIVO);

  const venda = await tx.lockVenda(userId, vendaId);
  if (!venda) toTrpc(MSG_VENDA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
  if (venda.status === "cancelado") toTrpc(MSG_VENDA_CANCELAR_JA_CANCELADA);
  if (venda.status !== "concluido") toTrpc(MSG_VENDA_CANCELAR_NAO_CONCLUIDA);

  const animalIds = [...new Set(await tx.listItensAnimalIds(userId, vendaId))];
  if (!animalIds.length) toTrpc(MSG_VENDA_CANCELAR_SEM_ITENS);

  const titulos = await listarTitulosPorOrigemNoTx(
    tx.fin,
    userId,
    FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
    vendaId,
  );
  const titulo = tituloPrincipalDaVenda(titulos);
  let tituloCancelado = false;
  if (titulo) {
    const locked = await tx.fin.lockTitulos(userId, [titulo.id]);
    const atual = locked[0] ?? null;
    if (!atual) toTrpc(MSG_VENDA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
    if (atual.estado !== "cancelado") {
      if (await tituloTemLiquidacaoEfetiva(tx.fin, userId, atual.id, true)) {
        toTrpc(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
      }
      try {
        await cancelarTituloNoTx(tx.fin, userId, atual.id, motivo);
      } catch (error) {
        if (error instanceof TRPCError && error.message === MSG_FIN_CANCELAR_COM_LIQUIDACAO) {
          toTrpc(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
        }
        throw error;
      }
      tituloCancelado = true;
    }
  }

  const animaisRows = await tx.listAnimais(userId, animalIds);
  if (animaisRows.length !== animalIds.length) toTrpc(MSG_VENDA_CANCELAR_ANIMAL_ALTERADO);
  const naoVendidos = animaisRows.filter(animal => animal.status !== "vendido");
  if (naoVendidos.length) {
    toTrpc(`${MSG_VENDA_CANCELAR_ANIMAL_ALTERADO} (${naoVendidos.map(identificacao).join(", ")})`);
  }

  const baixas = await tx.listBaixasAtivasDaVenda(userId, vendaId, animalIds);
  const baixaIds: number[] = [];
  for (const animalId of animalIds) {
    const baixa = baixas.find(row => row.animalId === animalId);
    if (!baixa) toTrpc(MSG_VENDA_CANCELAR_BAIXA_AUSENTE);
    baixaIds.push(baixa.id);
  }
  if (baixas.length !== animalIds.length) toTrpc(MSG_VENDA_CANCELAR_BAIXA_AUSENTE);

  const estornadas = await tx.estornarBaixas(userId, vendaId, baixaIds);
  if (estornadas !== baixaIds.length) toTrpc(MSG_VENDA_CANCELAR_BAIXA_AUSENTE);

  const restaurados = await tx.restaurarAnimais(userId, animalIds);
  if (restaurados !== animalIds.length) toTrpc(MSG_VENDA_CANCELAR_ANIMAL_ALTERADO);

  const atualizada = await tx.marcarVendaCancelada({
    userId,
    vendaId,
    motivo,
    canceladoPorUserId: input.canceladoPorUserId,
    canceladoPorNome: String(input.canceladoPorNome ?? "").trim() || null,
    canceladoEm: new Date(),
  });
  if (atualizada !== 1) toTrpc(MSG_VENDA_CANCELAR_JA_CANCELADA);

  return {
    success: true,
    vendaId,
    tituloId: titulo?.id ?? null,
    quantidade: animalIds.length,
    tituloCancelado,
    vendaAntigaSemTitulo: titulo == null,
  };
}

export async function cancelarVendaFinanceiroAtomico(
  store: CancelarVendaFinanceiroStore,
  userId: number,
  input: CancelarVendaFinanceiroInput,
): Promise<CancelarVendaFinanceiroResultado> {
  return store.transaction(tx => cancelarVendaFinanceiroNoTx(tx, userId, input));
}

export function createCancelarVendaFinanceiroService(store: CancelarVendaFinanceiroStore) {
  return {
    cancelar(userId: number, input: CancelarVendaFinanceiroInput) {
      return cancelarVendaFinanceiroAtomico(store, userId, input);
    },
  };
}
