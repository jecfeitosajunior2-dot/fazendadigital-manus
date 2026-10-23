/**
 * Confirmação comercial de venda + título V2 na mesma transação.
 * Serviço isolado: nenhuma rota ativa deve chamar este módulo nesta fase.
 */
import { TRPCError } from "@trpc/server";
import { isMysqlDuplicateKey } from "../shared/compraInsumos";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  MSG_VENDA_CONFLITO_IDEMPOTENCIA,
  MSG_VENDA_RECUPERACAO_FALHOU,
  observacaoCondicaoTituloVenda,
  origemFinanceiraVendaAnimais,
  lerCondicaoTituloVenda,
  retryConfirmacaoVendaBateComPedido,
  validarChaveIdempotenciaVenda,
  validarCondicaoRecebimentoVenda,
  type CondicaoRecebimentoVenda,
  type IntencaoConfirmacaoVendaFinanceiro,
  type ParcelaRecebimentoVenda,
} from "../shared/vendaFinanceiro";
import {
  mensagemAnimaisIndisponiveis,
  MSG_VENDA_ANIMAL_INDISPONIVEL,
  MSG_VENDA_ANIMAL_OUTRA_FAZENDA,
  MSG_VENDA_SEM_COMPRADOR,
  MSG_VENDA_SEM_FAZENDA,
  resumirItensVenda,
} from "../shared/vendaComercial";
import { animalPertenceFazenda } from "./animaisPorFazenda";
import {
  createFinanceiroNucleoTxFromDrizzle,
  criarTituloNoTx,
  type FinanceiroDrizzleTx,
  type FinanceiroNucleoTx,
  type FinParcelaRow,
  type FinTituloRow,
} from "./financeiroNucleo";

export type ConfirmarVendaFinanceiroItemInput = {
  animalId: number;
  pesoVenda?: number | null;
  precoUnitario: number;
};

export type ConfirmarVendaFinanceiroInput = {
  idempotencyKey: string;
  fazendaId: number;
  data: string;
  compradorId: number;
  formaPrecificacao: string;
  precoPadrao?: number | null;
  observacoes?: string | null;
  itens: ConfirmarVendaFinanceiroItemInput[];
  condicao: CondicaoRecebimentoVenda | string;
  parcelas?: ParcelaRecebimentoVenda[] | null;
  usuarioNome?: string | null;
};

export type ConfirmarVendaFinanceiroResultado = {
  success: true;
  vendaId: number;
  tituloId: number;
  quantidade: number;
  valorTotal: number;
  idempotente: boolean;
};

export type VendaFinanceiroRow = {
  id: number;
  userId: number;
  fazendaId: number | null;
  compradorId: number | null;
  comprador: string | null;
  data: string;
  formaPrecificacao: string | null;
  precoPadrao: string | number | null;
  quantidadeAnimais: number | null;
  pesoTotal: string | number | null;
  valorTotal: string | number | null;
  observacoes: string | null;
  status: string | null;
  idempotencyKey: string | null;
};

export type VendaItemFinanceiroRow = {
  animalId: number;
  pesoVenda: string | number | null;
  precoUnitario: string | number;
  valorItem: string | number;
  formaPrecificacao?: "kg" | "cabeca";
  brincoSnapshot?: string | null;
  loteNomeSnapshot?: string | null;
};

export type AnimalVendaRow = {
  id: number;
  brinco: string | null;
  status: string | null;
  fazendaId: number | null;
  loteId: number | null;
};

export type ConfirmarVendaFinanceiroTx = {
  fin: FinanceiroNucleoTx;
  loteFazendaById: Map<number, number | null>;
  findFazenda(userId: number, id: number): Promise<{ id: number; nome: string } | null>;
  findPessoa(
    userId: number,
    id: number,
  ): Promise<{ id: number; nome: string; tipo: string; ativo: boolean } | null>;
  findVendaPorIdempotency(userId: number, key: string): Promise<VendaFinanceiroRow | null>;
  listVendaItens(userId: number, vendaId: number): Promise<VendaItemFinanceiroRow[]>;
  lockTituloPrincipalDaVenda(userId: number, vendaId: number): Promise<FinTituloRow | null>;
  lockParcelasDoTitulo(userId: number, tituloId: number): Promise<FinParcelaRow[]>;
  listAnimais(userId: number, ids: number[]): Promise<AnimalVendaRow[]>;
  listBaixasAtivas(animalIds: number[]): Promise<Array<{ animalId: number }>>;
  listLotes(ids: number[]): Promise<Array<{ id: number; nome: string }>>;
  insertVenda(row: Omit<VendaFinanceiroRow, "id">): Promise<number>;
  insertItens(vendaId: number, userId: number, itens: VendaItemFinanceiroRow[]): Promise<void>;
  insertBaixas(rows: Array<{
    userId: number;
    animalId: number;
    fazendaId: number;
    dataBaixa: string;
    destino: string;
    motivo: string;
    usuarioNome: string | null;
    vendaId: number;
  }>): Promise<void>;
  marcarAnimaisVendidos(userId: number, ids: number[]): Promise<number>;
};

export type ConfirmarVendaFinanceiroStore = {
  transaction<T>(fn: (tx: ConfirmarVendaFinanceiroTx) => Promise<T>): Promise<T>;
};

export class ConflitoIdempotenciaVendaError extends Error {
  readonly userId: number;
  readonly idempotencyKey: string;

  constructor(userId: number, idempotencyKey: string, causa?: unknown) {
    super(MSG_VENDA_CONFLITO_IDEMPOTENCIA, causa !== undefined ? { cause: causa } : undefined);
    this.name = "ConflitoIdempotenciaVendaError";
    this.userId = userId;
    this.idempotencyKey = idempotencyKey;
  }
}

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function cadeiasErro(error: unknown): unknown[] {
  const lista: unknown[] = [];
  let atual: unknown = error;
  for (let i = 0; i < 8 && atual; i++) {
    lista.push(atual);
    if (typeof atual !== "object" || atual == null) break;
    atual = (atual as { cause?: unknown; original?: unknown }).cause
      ?? (atual as { original?: unknown }).original;
  }
  return lista;
}

function mysqlErrno(error: unknown): number | null {
  for (const item of cadeiasErro(error)) {
    if (typeof item !== "object" || item == null) continue;
    const n = Number((item as { errno?: number }).errno);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function textoErro(error: unknown): string {
  return cadeiasErro(error)
    .map(item => String((item as { message?: string })?.message ?? item ?? ""))
    .join(" ");
}

/** Drizzle envolve o 1062 em Failed query; o UNIQUE real fica em cause. */
function isDuplicateKeyMysql(error: unknown): boolean {
  if (mysqlErrno(error) === 1062) return true;
  return cadeiasErro(error).some(item => isMysqlDuplicateKey(item)
    || /ER_DUP_ENTRY|Duplicate entry/i.test(String((item as { message?: string })?.message ?? "")));
}

/** Somente a UNIQUE da chave ven- (user_id, idempotency_key). Outros 1062 não são retry de idempotência. */
export function isDuplicateChaveIdempotenciaVenda(error: unknown): boolean {
  if (!isDuplicateKeyMysql(error)) return false;
  return /vendas_idem_uq/i.test(textoErro(error));
}

export function isDuplicateOrigemTituloVenda(error: unknown): boolean {
  if (!isDuplicateKeyMysql(error)) return false;
  return /financeiro_titulos_origem_uq/i.test(textoErro(error));
}

function isDuplicateBaixaAnimal(error: unknown): boolean {
  if (!isDuplicateKeyMysql(error)) return false;
  return /animal_baixas/i.test(textoErro(error));
}

function isDeadlockMysql(error: unknown): boolean {
  if (mysqlErrno(error) === 1213) return true;
  return cadeiasErro(error).some(item => {
    const obj = item as { code?: string; message?: string };
    return obj?.code === "ER_LOCK_DEADLOCK" || /deadlock/i.test(String(obj?.message ?? ""));
  });
}

function isLockWaitTimeoutMysql(error: unknown): boolean {
  if (mysqlErrno(error) === 1205) return true;
  return cadeiasErro(error).some(item => {
    const obj = item as { code?: string; message?: string };
    return obj?.code === "ER_LOCK_WAIT_TIMEOUT" || /lock wait timeout/i.test(String(obj?.message ?? ""));
  });
}

function identificacao(animal: { brinco?: string | null; id: number }): string {
  const brinco = String(animal.brinco ?? "").trim();
  return brinco || `#${animal.id}`;
}

function numeroOpcional(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function intencaoDoPedido(input: ConfirmarVendaFinanceiroInput): IntencaoConfirmacaoVendaFinanceiro {
  return {
    fazendaId: input.fazendaId,
    data: input.data,
    compradorId: input.compradorId,
    formaPrecificacao: input.formaPrecificacao,
    precoPadrao: input.precoPadrao,
    observacoes: input.observacoes,
    itens: input.itens,
    condicao: input.condicao,
    parcelas: input.parcelas,
  };
}

function intencaoPersistida(
  venda: VendaFinanceiroRow,
  itens: VendaItemFinanceiroRow[],
  titulo: FinTituloRow,
  parcelas: FinParcelaRow[],
): IntencaoConfirmacaoVendaFinanceiro | null {
  const condicao = lerCondicaoTituloVenda(titulo.observacoes);
  if (!condicao || venda.fazendaId == null || venda.compradorId == null) return null;
  return {
    fazendaId: venda.fazendaId,
    data: venda.data,
    compradorId: venda.compradorId,
    formaPrecificacao: venda.formaPrecificacao ?? "",
    precoPadrao: numeroOpcional(venda.precoPadrao),
    observacoes: venda.observacoes,
    itens: itens.map(item => ({
      animalId: item.animalId,
      pesoVenda: numeroOpcional(item.pesoVenda),
      precoUnitario: numeroOpcional(item.precoUnitario) ?? 0,
    })),
    condicao,
    parcelas: parcelas.map(parcela => ({
      numero: parcela.numero,
      vencimento: parcela.vencimento,
      valorOriginal: numeroOpcional(parcela.valorOriginal) ?? 0,
    })),
  };
}

async function resultadoDaVendaExistente(
  tx: ConfirmarVendaFinanceiroTx,
  userId: number,
  venda: VendaFinanceiroRow,
  pedido: IntencaoConfirmacaoVendaFinanceiro,
): Promise<ConfirmarVendaFinanceiroResultado> {
  const itens = await tx.listVendaItens(userId, venda.id);
  const titulo = await tx.lockTituloPrincipalDaVenda(userId, venda.id);
  if (!titulo) toTrpc(MSG_VENDA_RECUPERACAO_FALHOU);
  const parcelas = await tx.lockParcelasDoTitulo(userId, titulo.id);
  const persistida = intencaoPersistida(venda, itens, titulo, parcelas);
  if (!persistida || !retryConfirmacaoVendaBateComPedido(persistida, pedido)) {
    toTrpc(MSG_VENDA_CONFLITO_IDEMPOTENCIA, "CONFLICT");
  }
  const valorTotal = numeroOpcional(venda.valorTotal);
  if (valorTotal == null) toTrpc(MSG_VENDA_RECUPERACAO_FALHOU);
  return {
    success: true,
    vendaId: venda.id,
    tituloId: titulo.id,
    quantidade: venda.quantidadeAnimais ?? itens.length,
    valorTotal,
    idempotente: true,
  };
}

async function confirmarVendaFinanceiroNoTx(
  tx: ConfirmarVendaFinanceiroTx,
  userId: number,
  input: ConfirmarVendaFinanceiroInput,
  chave: string,
): Promise<ConfirmarVendaFinanceiroResultado> {
  const pedido = intencaoDoPedido(input);
  const existente = await tx.findVendaPorIdempotency(userId, chave);
  if (existente) return resultadoDaVendaExistente(tx, userId, existente, pedido);

  const validado = validarCondicaoRecebimentoVenda(pedido);
  if (!validado.ok) toTrpc(validado.message);

  const fazenda = await tx.findFazenda(userId, input.fazendaId);
  if (!fazenda) toTrpc(MSG_VENDA_SEM_FAZENDA, "NOT_FOUND");

  const comprador = await tx.findPessoa(userId, input.compradorId);
  if (!comprador || comprador.tipo !== "cliente" || comprador.ativo === false) {
    toTrpc(MSG_VENDA_SEM_COMPRADOR);
  }
  const compradorNome = comprador.nome.trim();

  const animalIds = validado.itens.map(item => item.animalId);
  const animalIdsOrdenados = [...new Set(animalIds)].sort((a, b) => a - b);
  // Ordem de locks da confirmação (3E.8D):
  // 1. venda por idempotencyKey (FOR UPDATE), se já existir — recuperação sem reler animais.
  // 2. animais da intenção, por id crescente (FOR UPDATE) — estado desta leitura.
  // 3. insert venda + itens + baixas.
  // 4. marcar vendido só se status=ativo.
  // 5. criar título receber (insert; sem lock de título alheio).
  // Cancelamento integrado: venda → título → parcela → animais.
  // Animais antes do título na confirmação evita inverter o cancelamento.
  const animaisRows = await tx.listAnimais(userId, animalIdsOrdenados);
  const animalMap = new Map(animaisRows.map(animal => [animal.id, animal]));
  const indisponiveis: string[] = [];
  const outraFazenda: string[] = [];
  for (const id of animalIds) {
    const animal = animalMap.get(id);
    if (!animal) {
      indisponiveis.push(`#${id}`);
      continue;
    }
    if (animal.status !== "ativo") indisponiveis.push(identificacao(animal));
    if (!animalPertenceFazenda(animal, input.fazendaId, tx.loteFazendaById)) {
      outraFazenda.push(identificacao(animal));
    }
  }
  if (outraFazenda.length) {
    toTrpc(
      outraFazenda.length === 1
        ? MSG_VENDA_ANIMAL_OUTRA_FAZENDA
        : `${MSG_VENDA_ANIMAL_OUTRA_FAZENDA} (${outraFazenda.join(", ")})`,
    );
  }
  const baixas = await tx.listBaixasAtivas(animalIds);
  for (const baixa of baixas) {
    const animal = animalMap.get(baixa.animalId);
    indisponiveis.push(animal ? identificacao(animal) : `#${baixa.animalId}`);
  }
  if (indisponiveis.length) toTrpc(mensagemAnimaisIndisponiveis([...new Set(indisponiveis)]));

  const loteIds = [...new Set(animaisRows.map(a => a.loteId).filter((id): id is number => id != null))];
  const loteNomeMap = new Map<number, string>();
  if (loteIds.length) {
    for (const lote of await tx.listLotes(loteIds)) loteNomeMap.set(lote.id, lote.nome);
  }

  const forma = input.formaPrecificacao === "cabeca" ? "cabeca" : "kg";
  const totais = resumirItensVenda(validado.itens, { forma });

  let vendaId: number;
  try {
    vendaId = await tx.insertVenda({
      userId,
      fazendaId: input.fazendaId,
      compradorId: input.compradorId,
      comprador: compradorNome,
      data: input.data.trim().slice(0, 10),
      formaPrecificacao: forma,
      precoPadrao: input.precoPadrao != null ? persistirValor(input.precoPadrao) : null,
      quantidadeAnimais: totais.quantidade,
      pesoTotal: totais.pesoTotal != null ? String(totais.pesoTotal) : null,
      valorTotal: persistirValor(validado.valorTotal),
      observacoes: input.observacoes?.trim() || null,
      status: "concluido",
      idempotencyKey: chave,
    });
  } catch (error) {
    if (isDuplicateChaveIdempotenciaVenda(error)) {
      throw new ConflitoIdempotenciaVendaError(userId, chave, error);
    }
    throw error;
  }
  if (!vendaId) toTrpc("Não foi possível gravar a venda.");

  await tx.insertItens(vendaId, userId, validado.itens.map(item => {
    const animal = animalMap.get(item.animalId)!;
    return {
      animalId: item.animalId,
      pesoVenda: item.pesoVenda != null ? String(item.pesoVenda) : null,
      precoUnitario: persistirValor(item.precoUnitario),
      valorItem: persistirValor(item.valorItem),
      formaPrecificacao: forma,
      brincoSnapshot: animal.brinco?.trim() || null,
      loteNomeSnapshot: animal.loteId ? loteNomeMap.get(animal.loteId) ?? null : null,
    };
  }));

  await tx.insertBaixas(animalIdsOrdenados.map(animalId => ({
    userId,
    animalId,
    fazendaId: input.fazendaId,
    dataBaixa: input.data.trim().slice(0, 10),
    destino: compradorNome,
    motivo: `Venda #${vendaId}`,
    usuarioNome: input.usuarioNome?.trim() || null,
    vendaId,
  })));

  const atualizados = await tx.marcarAnimaisVendidos(userId, animalIdsOrdenados);
  if (atualizados !== animalIds.length) {
    toTrpc(mensagemAnimaisIndisponiveis(animalIds.map(id => {
      const animal = animalMap.get(id);
      return animal ? identificacao(animal) : `#${id}`;
    })));
  }

  const origemVenda = origemFinanceiraVendaAnimais(vendaId);
  if (!origemVenda.ok) toTrpc(origemVenda.message);

  const titulo = await criarTituloNoTx(tx.fin, userId, {
    tipo: "receber",
    pessoaId: input.compradorId,
    descricao: `Venda de animais #${vendaId}`,
    dataCompetencia: input.data.trim().slice(0, 10),
    valorOriginal: validado.valorTotal,
    documentoReferencia: `VENDA-${vendaId}`,
    observacoes: observacaoCondicaoTituloVenda(validado.condicao),
    fazendaOrigemId: input.fazendaId,
    origemTipo: origemVenda.origemTipo,
    origemId: origemVenda.origemId ?? vendaId,
    origemItemChave: origemVenda.origemItemChave ?? FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
    parcelas: validado.parcelas.length ? validado.parcelas : undefined,
  });

  return {
    success: true,
    vendaId,
    tituloId: titulo.id,
    quantidade: totais.quantidade,
    valorTotal: validado.valorTotal,
    idempotente: false,
  };
}

async function recuperarAposConflitoNoTx(
  tx: ConfirmarVendaFinanceiroTx,
  userId: number,
  input: ConfirmarVendaFinanceiroInput,
  chave: string,
): Promise<ConfirmarVendaFinanceiroResultado> {
  const venda = await tx.findVendaPorIdempotency(userId, chave);
  if (!venda) toTrpc(MSG_VENDA_RECUPERACAO_FALHOU);
  return resultadoDaVendaExistente(tx, userId, venda, intencaoDoPedido(input));
}

async function recuperarAposConflitoComRetry(
  store: ConfirmarVendaFinanceiroStore,
  userId: number,
  input: ConfirmarVendaFinanceiroInput,
  chave: string,
): Promise<ConfirmarVendaFinanceiroResultado> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    try {
      return await store.transaction(tx => recuperarAposConflitoNoTx(tx, userId, input, chave));
    } catch (error) {
      ultimo = error;
      const mensagem = error instanceof TRPCError ? error.message : String(error);
      if (mensagem !== MSG_VENDA_RECUPERACAO_FALHOU || tentativa === 7) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * (tentativa + 1)));
    }
  }
  throw ultimo;
}

export async function confirmarVendaFinanceiroAtomico(
  store: ConfirmarVendaFinanceiroStore,
  userId: number,
  input: ConfirmarVendaFinanceiroInput,
): Promise<ConfirmarVendaFinanceiroResultado> {
  const chave = validarChaveIdempotenciaVenda(input.idempotencyKey);
  if (!chave.ok) toTrpc(chave.message);
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    try {
      return await store.transaction(tx => confirmarVendaFinanceiroNoTx(tx, userId, input, chave.key));
    } catch (error) {
      ultimo = error;
      if (error instanceof TRPCError) throw error;
      if (error instanceof ConflitoIdempotenciaVendaError) {
        return recuperarAposConflitoComRetry(store, userId, input, chave.key);
      }
      if ((isDeadlockMysql(error) || isLockWaitTimeoutMysql(error)) && tentativa < 5) {
        await new Promise(resolve => setTimeout(resolve, 30 * (tentativa + 1)));
        continue;
      }
      if (isDuplicateBaixaAnimal(error)) toTrpc(MSG_VENDA_ANIMAL_INDISPONIVEL);
      throw error;
    }
  }
  throw ultimo;
}

export function createConfirmarVendaFinanceiroService(store: ConfirmarVendaFinanceiroStore) {
  return {
    confirmar(userId: number, input: ConfirmarVendaFinanceiroInput) {
      return confirmarVendaFinanceiroAtomico(store, userId, input);
    },
  };
}

/** Mesmo padrão da compra de insumos. Não abre transação própria. Sem rota nesta fase. */
export function anexarNucleoFinanceiroNaVenda(
  drizzleTx: FinanceiroDrizzleTx,
  comercial: Omit<ConfirmarVendaFinanceiroTx, "fin">,
): ConfirmarVendaFinanceiroTx {
  return {
    ...comercial,
    fin: createFinanceiroNucleoTxFromDrizzle(drizzleTx),
  };
}
