/**
 * Cancelamento comercial de venda + título V2 na mesma transação.
 * A flag de integração controla só a criação de vendas novas.
 * Venda com vínculo V2 nunca cai no cancelamento comercial antigo.
 */
import { TRPCError } from "@trpc/server";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  MSG_FIN_CANCELAR_COM_LIQUIDACAO,
} from "../shared/financeiroNucleo";
import { validarChaveIdempotenciaVenda } from "../shared/vendaFinanceiro";
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
  isDeadlockMysql,
  isLockWaitTimeoutMysql,
  tituloTemLiquidacaoEfetiva,
  type FinanceiroNucleoTx,
  type FinTituloRow,
} from "./financeiroNucleo";

export const MSG_VENDA_CANCELAR_COM_RECEBIMENTO =
  "Esta venda não pode ser cancelada porque já tem recebimento efetivo.";
export const MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO =
  "Esta venda tem vínculo financeiro incompleto e não pode ser cancelada por aqui. O título esperado não foi encontrado.";
export const MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS =
  "Há mais de um título financeiro para esta venda.";

export type CaminhoCancelamentoVenda =
  | { caminho: "integrado"; tituloId: number }
  | { caminho: "comercial" }
  | { caminho: "integridade"; motivo: string };

export function vendaTemChaveIntegrada(idempotencyKey?: string | null): boolean {
  return validarChaveIdempotenciaVenda(idempotencyKey).ok;
}

export function decidirCaminhoCancelamentoVenda(input: {
  idempotencyKey?: string | null;
  titulos: ReadonlyArray<Pick<FinTituloRow, "id" | "origemItemChave">>;
}): CaminhoCancelamentoVenda {
  const titulos = [...input.titulos];
  const principais = titulos.filter(t => (t.origemItemChave ?? "") === FINANCEIRO_ORIGEM_ITEM_PRINCIPAL);
  if (principais.length > 1 || titulos.length > 1) {
    return { caminho: "integridade", motivo: MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS };
  }
  if (principais.length === 1) return { caminho: "integrado", tituloId: principais[0]!.id };
  if (titulos.length > 0) return { caminho: "integridade", motivo: MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO };
  if (vendaTemChaveIntegrada(input.idempotencyKey)) {
    return { caminho: "integridade", motivo: MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO };
  }
  return { caminho: "comercial" };
}

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
  lockTitulosDaVenda(userId: number, vendaId: number): Promise<FinTituloRow[]>;
  lockAnimais(userId: number, ids: number[]): Promise<Array<{ id: number; brinco: string | null; status: string | null }>>;
  lockBaixasAtivasDaVenda(
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

  const animalIds = [...new Set(await tx.listItensAnimalIds(userId, vendaId))].sort((a, b) => a - b);
  if (!animalIds.length) toTrpc(MSG_VENDA_CANCELAR_SEM_ITENS);

  // Ordem de locks do cancelamento (3E.9B.2), alinhada a 3E.8D:
  // 1. venda FOR UPDATE
  // 2. títulos da origem FOR UPDATE (ORDER BY id) — leitura atual, sem snapshot stale
  // 3. parcelas do título principal (recebimento efetivo)
  // 4. animais FOR UPDATE (ORDER BY id)
  // 5. baixas ativas FOR UPDATE (ORDER BY id)
  // Recebimento: conta → título → parcela. Estorno: liquidação → conta → título → parcela.
  const titulos = await tx.lockTitulosDaVenda(userId, vendaId);

  const decisao = decidirCaminhoCancelamentoVenda({
    idempotencyKey: venda.idempotencyKey,
    titulos,
  });
  if (decisao.caminho === "integridade") toTrpc(decisao.motivo);

  let titulo: FinTituloRow | null = null;
  let tituloCancelado = false;
  if (decisao.caminho === "integrado") {
    titulo = titulos.find(t => t.id === decisao.tituloId) ?? null;
    if (!titulo) toTrpc(MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO);
    if (titulo.estado !== "cancelado") {
      if (await tituloTemLiquidacaoEfetiva(tx.fin, userId, titulo.id, true)) {
        toTrpc(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
      }
      try {
        await cancelarTituloNoTx(tx.fin, userId, titulo.id, motivo);
      } catch (error) {
        if (error instanceof TRPCError && error.message === MSG_FIN_CANCELAR_COM_LIQUIDACAO) {
          toTrpc(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
        }
        throw error;
      }
      tituloCancelado = true;
    }
  }

  const animaisRows = await tx.lockAnimais(userId, animalIds);
  if (animaisRows.length !== animalIds.length) toTrpc(MSG_VENDA_CANCELAR_ANIMAL_ALTERADO);
  const naoVendidos = animaisRows.filter(animal => animal.status !== "vendido");
  if (naoVendidos.length) {
    toTrpc(`${MSG_VENDA_CANCELAR_ANIMAL_ALTERADO} (${naoVendidos.map(identificacao).join(", ")})`);
  }

  const baixas = await tx.lockBaixasAtivasDaVenda(userId, vendaId, animalIds);
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
    vendaAntigaSemTitulo: decisao.caminho === "comercial",
  };
}

export async function cancelarVendaFinanceiroAtomico(
  store: CancelarVendaFinanceiroStore,
  userId: number,
  input: CancelarVendaFinanceiroInput,
): Promise<CancelarVendaFinanceiroResultado> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    try {
      return await store.transaction(tx => cancelarVendaFinanceiroNoTx(tx, userId, input));
    } catch (error) {
      ultimo = error;
      if (error instanceof TRPCError) throw error;
      if ((isDeadlockMysql(error) || isLockWaitTimeoutMysql(error)) && tentativa < 5) {
        await new Promise(resolve => setTimeout(resolve, 30 * (tentativa + 1)));
        continue;
      }
      throw error;
    }
  }
  throw ultimo;
}

export function createCancelarVendaFinanceiroService(store: CancelarVendaFinanceiroStore) {
  return {
    cancelar(userId: number, input: CancelarVendaFinanceiroInput) {
      return cancelarVendaFinanceiroAtomico(store, userId, input);
    },
  };
}
