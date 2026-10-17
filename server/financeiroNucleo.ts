import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  financeiroApropriacoes,
  financeiroCategorias,
  financeiroCentrosCusto,
  financeiroContas,
  financeiroLiquidacaoAlocacoes,
  financeiroLiquidacoes,
  financeiroMovimentos,
  financeiroParcelas,
  financeiroTitulos,
  financeiroTransferencias,
  fazendas,
  pessoas,
} from "../drizzle/schema";
import {
  calcularSaldoConta,
  caixaDaAlocacao,
  derivarSaldoParcela,
  derivarSituacaoTitulo,
  somarDinheiro,
  direcaoDaLiquidacao,
  dinheiroPositivo,
  FINANCEIRO_ORIGEM_MANUAL,
  isFinanceiroContaTipo,
  isFinanceiroNatureza,
  MSG_FIN_APROPRIACAO_SOMA,
  MSG_FIN_CANCELAR_COM_LIQUIDACAO,
  MSG_FIN_CATEGORIA_DUPLICADA,
  MSG_FIN_CATEGORIA_TIPO,
  MSG_FIN_CENTRO_FAZENDA,
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_CONTA_NAO_ENCONTRADA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_ESCOPO,
  MSG_FIN_FAZENDA_INVALIDA,
  MSG_FIN_FORMULA_CAIXA,
  MSG_FIN_IDEMPOTENCY,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
  MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA,
  MSG_FIN_MOVIMENTO_LIQUIDACAO,
  MSG_FIN_ORIGEM_DUPLICADA,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_PARCELA_NAO_ENCONTRADA,
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_PESSOA_INVALIDA,
  MSG_FIN_PESSOAS_MISTURADAS,
  MSG_FIN_TIPO_LIQUIDACAO,
  MSG_FIN_TIPOS_MISTURADOS,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_TITULO_COM_LIQUIDACAO,
  MSG_FIN_TITULO_NAO_ENCONTRADO,
  MSG_FIN_TRANSFERENCIA_JA_ESTORNADA,
  MSG_FIN_TRANSFERENCIA_MESMA_CONTA,
  MSG_FIN_TRANSFERENCIA_PERNAS,
  MSG_FIN_VALOR_POSITIVO,
  naturezaDaLiquidacao,
  persistirValor,
  toCentavos,
  validarComponentesAlocacao,
  validarOrigemTitulo,
  validarPernasTransferencia,
  validarSomaParcelas,
  categoriaCompativelComTitulo,
  centroCompativelComFazenda,
  derivarApropriacao,
  movimentoAnteriorAAbertura,
  type FinanceiroCondicaoStatus,
  type FinanceiroContaTipo,
  type FinanceiroDirecao,
  type FinanceiroLiquidacaoTipo,
  type FinanceiroNatureza,
  type FinanceiroTituloTipo,
  type FinanceiroTransferenciaEstado,
} from "../shared/financeiroNucleo";
import { db } from "./db";

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function hojeISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type FinContaRow = {
  id: number;
  userId: number;
  nome: string;
  tipo: string;
  banco: string | null;
  agencia: string | null;
  numeroConta: string | null;
  saldoAbertura: string;
  dataSaldoAbertura: string;
  ativa: boolean;
  inativadaEm: Date | null;
  motivoInativacao: string | null;
};

export type FinTituloRow = {
  id: number;
  userId: number;
  tipo: FinanceiroTituloTipo;
  estado: "ativo" | "cancelado";
  condicaoStatus: FinanceiroCondicaoStatus;
  pessoaId: number;
  contraparteNomeSnapshot: string;
  fazendaOrigemId: number | null;
  origemTipo: string;
  origemId: number | null;
  origemItemChave: string | null;
  descricao: string;
  dataCompetencia: string;
  valorOriginal: string;
  documentoReferencia: string | null;
  observacoes: string | null;
};

export type FinParcelaRow = {
  id: number;
  userId: number;
  tituloId: number;
  numero: number;
  vencimento: string;
  valorOriginal: string;
};

export type FinAlocacaoRow = {
  id: number;
  userId: number;
  liquidacaoId: number;
  parcelaId: number;
  principalLiquidado: string;
  desconto: string;
  juros: string;
  multa: string;
};

export type FinLiquidacaoRow = {
  id: number;
  userId: number;
  tipo: FinanceiroLiquidacaoTipo;
  contaId: number;
  dataLiquidacao: string;
  valorMovimentado: string;
  formaPagamento: string | null;
  referencia: string | null;
  observacoes: string | null;
  liquidacaoOriginalId: number | null;
  idempotencyKey: string;
};

export type FinMovimentoRow = {
  id: number;
  userId: number;
  contaId: number;
  dataMovimento: string;
  direcao: FinanceiroDirecao;
  natureza: FinanceiroNatureza;
  valor: string;
  liquidacaoId: number | null;
  transferenciaId: number | null;
  contrapartePessoaId: number | null;
  descricao: string;
  referencia: string | null;
  movimentoOriginalId: number | null;
};

export type FinTransferenciaRow = {
  id: number;
  userId: number;
  contaOrigemId: number;
  contaDestinoId: number;
  dataTransferencia: string;
  valor: string;
  descricao: string | null;
  referencia: string | null;
  observacoes: string | null;
  estado: FinanceiroTransferenciaEstado;
  transferenciaOriginalId: number | null;
  idempotencyKey: string;
};

export type FinApropriacaoRow = {
  id: number;
  userId: number;
  tituloId: number;
  fazendaId: number | null;
  categoriaId: number | null;
  centroCustoId: number | null;
  valor: string;
  origemDetalheTipo: string | null;
  origemDetalheId: number | null;
  observacoes: string | null;
};

export type FinCategoriaRow = {
  id: number;
  userId: number;
  nome: string;
  tipo: string;
  categoriaPaiId: number | null;
  chaveSistema: string | null;
  ativa: boolean;
};

export type FinCentroRow = {
  id: number;
  userId: number;
  nome: string;
  fazendaId: number | null;
  ativo: boolean;
};

export type AlocacaoInput = {
  parcelaId: number;
  principalLiquidado: number;
  desconto?: number;
  juros?: number;
  multa?: number;
};

export type LiquidacaoCmd = {
  tipo: "pagamento" | "recebimento";
  contaId: number;
  dataLiquidacao: string;
  valorMovimentado: number;
  idempotencyKey: string;
  formaPagamento?: string | null;
  referencia?: string | null;
  observacoes?: string | null;
  alocacoes: AlocacaoInput[];
};

export type FinanceiroNucleoTx = {
  findConta(userId: number, id: number): Promise<FinContaRow | null>;
  lockContas(userId: number, ids: number[]): Promise<FinContaRow[]>;
  lockTitulos(userId: number, ids: number[]): Promise<FinTituloRow[]>;
  lockParcelas(userId: number, ids: number[]): Promise<FinParcelaRow[]>;
  lockLiquidacao(userId: number, id: number): Promise<FinLiquidacaoRow | null>;
  lockTransferencia(userId: number, id: number): Promise<FinTransferenciaRow | null>;
  insertConta(row: Omit<FinContaRow, "id" | "inativadaEm" | "motivoInativacao">): Promise<number>;
  updateContaInativa(userId: number, id: number, motivo: string | null, em: Date): Promise<void>;
  listContas(userId: number): Promise<FinContaRow[]>;
  listContasPorIds(userId: number, ids: number[]): Promise<FinContaRow[]>;
  countMovimentosConta(userId: number, contaId: number): Promise<number>;
  listMovimentosConta(userId: number, contaId: number): Promise<FinMovimentoRow[]>;

  findPessoa(userId: number, id: number): Promise<{ id: number; nome: string; ativo: boolean; tipo: string } | null>;
  listTitulosPorOrigem(userId: number, origemTipo: string, origemId: number): Promise<FinTituloRow[]>;
  findFazenda(userId: number, id: number): Promise<{ id: number } | null>;

  findTitulo(userId: number, id: number): Promise<FinTituloRow | null>;
  findTituloPorOrigem(
    userId: number,
    origemTipo: string,
    origemId: number,
    origemItemChave: string,
  ): Promise<FinTituloRow | null>;
  insertTitulo(row: Omit<FinTituloRow, "id">): Promise<number>;
  updateTituloCondicao(userId: number, id: number, condicao: FinanceiroCondicaoStatus): Promise<void>;
  cancelarTitulo(userId: number, id: number, motivo: string, em: Date): Promise<void>;
  listTitulos(userId: number): Promise<FinTituloRow[]>;

  listParcelasTitulo(userId: number, tituloId: number): Promise<FinParcelaRow[]>;
  listParcelasPorIds(userId: number, ids: number[]): Promise<FinParcelaRow[]>;
  insertParcela(row: Omit<FinParcelaRow, "id">): Promise<number>;
  deleteParcelasTitulo(userId: number, tituloId: number): Promise<void>;

  findLiquidacao(userId: number, id: number): Promise<FinLiquidacaoRow | null>;
  listLiquidacoesPorIds(userId: number, ids: number[]): Promise<FinLiquidacaoRow[]>;
  findLiquidacaoPorIdem(userId: number, key: string): Promise<FinLiquidacaoRow | null>;
  findEstornoDe(userId: number, originalId: number, forUpdate?: boolean): Promise<FinLiquidacaoRow | null>;
  insertLiquidacao(row: Omit<FinLiquidacaoRow, "id">): Promise<number>;
  insertAlocacao(row: Omit<FinAlocacaoRow, "id">): Promise<number>;
  listAlocacoesPorParcelas(userId: number, parcelaIds: number[], forUpdate?: boolean): Promise<Array<FinAlocacaoRow & { tipoLiquidacao: FinanceiroLiquidacaoTipo }>>;
  listAlocacoesLiquidacao(userId: number, liquidacaoId: number): Promise<FinAlocacaoRow[]>;

  insertMovimento(row: Omit<FinMovimentoRow, "id">): Promise<number>;
  findMovimentoPorLiquidacao(userId: number, liquidacaoId: number): Promise<FinMovimentoRow | null>;
  listMovimentosPorTransferencia(userId: number, transferenciaId: number): Promise<FinMovimentoRow[]>;
  listMovimentosFiltro(userId: number, contaId: number, de?: string, ate?: string): Promise<FinMovimentoRow[]>;

  findTransferencia(userId: number, id: number): Promise<FinTransferenciaRow | null>;
  findTransferenciaPorIdem(userId: number, key: string): Promise<FinTransferenciaRow | null>;
  findEstornoTransferencia(userId: number, originalId: number): Promise<FinTransferenciaRow | null>;
  insertTransferencia(row: Omit<FinTransferenciaRow, "id">): Promise<number>;
  marcarTransferenciaEstornada(userId: number, id: number): Promise<void>;

  listApropriacoes(userId: number, tituloId: number): Promise<FinApropriacaoRow[]>;
  deleteApropriacoes(userId: number, tituloId: number): Promise<void>;
  insertApropriacao(row: Omit<FinApropriacaoRow, "id">): Promise<number>;
  findCategoria(userId: number, id: number): Promise<FinCategoriaRow | null>;
  findCategoriaPorChave(userId: number, chave: string): Promise<FinCategoriaRow | null>;
  insertCategoria(row: Omit<FinCategoriaRow, "id">): Promise<number>;
  updateCategoria(userId: number, id: number, patch: Partial<Pick<FinCategoriaRow, "nome" | "tipo" | "categoriaPaiId" | "ativa">>): Promise<void>;
  listCategorias(userId: number): Promise<FinCategoriaRow[]>;
  findCentro(userId: number, id: number): Promise<FinCentroRow | null>;
  insertCentro(row: Omit<FinCentroRow, "id">): Promise<number>;
  updateCentro(userId: number, id: number, patch: Partial<Pick<FinCentroRow, "nome" | "fazendaId" | "ativo">>): Promise<void>;
  listCentros(userId: number): Promise<FinCentroRow[]>;
};

export type FinanceiroNucleoStore = {
  transaction<T>(fn: (tx: FinanceiroNucleoTx) => Promise<T>): Promise<T>;
};

function assertUser(rowUserId: number, userId: number): void {
  if (rowUserId !== userId) toTrpc(MSG_FIN_ESCOPO, "FORBIDDEN");
}

function assertValorPositivo(valor: number | string): void {
  if (!dinheiroPositivo(valor)) toTrpc(MSG_FIN_VALOR_POSITIVO);
}

function assertDataAposAbertura(dataMovimento: string, conta: FinContaRow): void {
  if (movimentoAnteriorAAbertura(dataMovimento, conta.dataSaldoAbertura)) {
    toTrpc(MSG_FIN_DATA_ANTES_ABERTURA);
  }
}

function idsUnicosOrdenados(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

export type HistoricoPagamentoAlocacaoTitulo = {
  parcelaId: number;
  parcelaNumero: number;
  vencimento: string;
  principalLiquidado: string;
  desconto: string;
  juros: string;
  multa: string;
  valorCaixaAlocado: number;
};

export type HistoricoPagamentoEvento = {
  liquidacaoId: number;
  tipo: FinanceiroLiquidacaoTipo;
  dataLiquidacao: string;
  contaId: number;
  contaNome: string;
  valorMovimentado: string;
  valorAlocadoNesteTitulo: number;
  liquidacaoOriginalId: number | null;
  estornadaPorLiquidacaoId: number | null;
  referencia: string | null;
  observacoes: string | null;
  formaPagamento: string | null;
  alocacoesDesteTitulo: HistoricoPagamentoAlocacaoTitulo[];
};

export type HistoricoPagamentosTitulo = {
  tituloId: number;
  eventos: HistoricoPagamentoEvento[];
  parcelas: Array<FinParcelaRow & ReturnType<typeof derivarSaldoParcela>>;
};

export type CriarTituloInput = {
  tipo: FinanceiroTituloTipo;
  pessoaId: number;
  descricao: string;
  dataCompetencia: string;
  valorOriginal: number;
  documentoReferencia?: string | null;
  observacoes?: string | null;
  fazendaOrigemId?: number | null;
  origemTipo?: string;
  origemId?: number | null;
  origemItemChave?: string | null;
  parcelas?: Array<{ numero: number; vencimento: string; valorOriginal: number }>;
};

export type ApropriarItemInput = {
  valor: number;
  fazendaId?: number | null;
  categoriaId?: number | null;
  centroCustoId?: number | null;
  origemDetalheTipo?: string | null;
  origemDetalheId?: number | null;
  observacoes?: string | null;
};

export async function tituloTemLiquidacaoEfetiva(tx: FinanceiroNucleoTx, userId: number, tituloId: number) {
  const parcelas = await tx.listParcelasTitulo(userId, tituloId);
  if (parcelas.length === 0) return false;
  const alocs = await tx.listAlocacoesPorParcelas(userId, parcelas.map(p => p.id));
  return parcelas.some(p => {
    const saldo = derivarSaldoParcela(
      p.valorOriginal,
      alocs.filter(a => a.parcelaId === p.id),
    );
    return toCentavos(saldo.principalLiquidado) > 0;
  });
}

export async function criarTituloNoTx(tx: FinanceiroNucleoTx, userId: number, input: CriarTituloInput) {
  assertValorPositivo(input.valorOriginal);
  const origem = validarOrigemTitulo({
    origemTipo: input.origemTipo ?? FINANCEIRO_ORIGEM_MANUAL,
    origemId: input.origemId,
    origemItemChave: input.origemItemChave,
  });
  if (!origem.ok) toTrpc(origem.message);
  const pessoa = await tx.findPessoa(userId, input.pessoaId);
  if (!pessoa || !pessoa.ativo) toTrpc(MSG_FIN_PESSOA_INVALIDA, "NOT_FOUND");
  if (input.fazendaOrigemId) {
    const fazenda = await tx.findFazenda(userId, input.fazendaOrigemId);
    if (!fazenda) toTrpc(MSG_FIN_FAZENDA_INVALIDA, "FORBIDDEN");
  }
  if (origem.origemId != null && origem.origemItemChave) {
    const dup = await tx.findTituloPorOrigem(userId, origem.origemTipo, origem.origemId, origem.origemItemChave);
    if (dup) toTrpc(MSG_FIN_ORIGEM_DUPLICADA);
  }
  const parcelas = input.parcelas ?? [];
  const condicao: FinanceiroCondicaoStatus = parcelas.length > 0 ? "definida" : "a_definir";
  if (condicao === "definida" && !validarSomaParcelas(input.valorOriginal, parcelas)) {
    toTrpc(MSG_FIN_PARCELAS_SOMA);
  }
  const id = await tx.insertTitulo({
    userId,
    tipo: input.tipo,
    estado: "ativo",
    condicaoStatus: condicao,
    pessoaId: pessoa.id,
    contraparteNomeSnapshot: pessoa.nome,
    fazendaOrigemId: input.fazendaOrigemId ?? null,
    origemTipo: origem.origemTipo,
    origemId: origem.origemId,
    origemItemChave: origem.origemItemChave,
    descricao: input.descricao.trim(),
    dataCompetencia: input.dataCompetencia,
    valorOriginal: persistirValor(input.valorOriginal),
    documentoReferencia: input.documentoReferencia?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
  });
  for (const p of parcelas) {
    assertValorPositivo(p.valorOriginal);
    await tx.insertParcela({
      userId,
      tituloId: id,
      numero: p.numero,
      vencimento: p.vencimento,
      valorOriginal: persistirValor(p.valorOriginal),
    });
  }
  return { id };
}

export async function apropriarNoTx(
  tx: FinanceiroNucleoTx,
  userId: number,
  tituloId: number,
  itens: ApropriarItemInput[],
) {
  const titulo = await tx.findTitulo(userId, tituloId);
  if (!titulo) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
  assertUser(titulo.userId, userId);
  let soma = 0;
  for (const item of itens) {
    assertValorPositivo(item.valor);
    soma += toCentavos(item.valor);
    if (item.fazendaId) {
      const fazenda = await tx.findFazenda(userId, item.fazendaId);
      if (!fazenda) toTrpc(MSG_FIN_FAZENDA_INVALIDA, "FORBIDDEN");
    }
    if (item.categoriaId) {
      const cat = await tx.findCategoria(userId, item.categoriaId);
      if (!cat) toTrpc("Categoria financeira não encontrada.", "NOT_FOUND");
      if (!categoriaCompativelComTitulo(titulo.tipo, cat.tipo)) toTrpc(MSG_FIN_CATEGORIA_TIPO);
    }
    if (item.centroCustoId) {
      const centro = await tx.findCentro(userId, item.centroCustoId);
      if (!centro) toTrpc("Centro de custo não encontrado.", "NOT_FOUND");
      if (!centroCompativelComFazenda(centro.fazendaId, item.fazendaId ?? null)) {
        toTrpc(MSG_FIN_CENTRO_FAZENDA);
      }
    }
  }
  if (soma > toCentavos(titulo.valorOriginal)) toTrpc(MSG_FIN_APROPRIACAO_SOMA);
  await tx.deleteApropriacoes(userId, tituloId);
  const ids: number[] = [];
  for (const item of itens) {
    ids.push(await tx.insertApropriacao({
      userId,
      tituloId,
      fazendaId: item.fazendaId ?? null,
      categoriaId: item.categoriaId ?? null,
      centroCustoId: item.centroCustoId ?? null,
      valor: persistirValor(item.valor),
      origemDetalheTipo: item.origemDetalheTipo ?? null,
      origemDetalheId: item.origemDetalheId ?? null,
      observacoes: item.observacoes ?? null,
    }));
  }
  const derivada = derivarApropriacao(titulo.valorOriginal, itens);
  return { ids, ...derivada, completa: derivada.apropriacaoCompleta };
}

export async function cancelarTituloNoTx(tx: FinanceiroNucleoTx, userId: number, tituloId: number, motivo: string) {
  const titulo = await tx.findTitulo(userId, tituloId);
  if (!titulo) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
  if (await tituloTemLiquidacaoEfetiva(tx, userId, tituloId)) toTrpc(MSG_FIN_CANCELAR_COM_LIQUIDACAO);
  await tx.cancelarTitulo(userId, tituloId, motivo.trim() || "Cancelado", new Date());
  return { success: true };
}

export async function listarTitulosPorOrigemNoTx(
  tx: FinanceiroNucleoTx,
  userId: number,
  origemTipo: string,
  origemId: number,
) {
  return tx.listTitulosPorOrigem(userId, origemTipo, origemId);
}

export function createFinanceiroNucleoService(store: FinanceiroNucleoStore) {
  async function saldoContaTx(tx: FinanceiroNucleoTx, userId: number, conta: FinContaRow) {
    const movimentos = await tx.listMovimentosConta(userId, conta.id);
    return calcularSaldoConta({ saldoAbertura: conta.saldoAbertura, movimentos });
  }

  async function saldoParcelaTx(tx: FinanceiroNucleoTx, userId: number, parcela: FinParcelaRow, forUpdate = false) {
    const alocs = await tx.listAlocacoesPorParcelas(userId, [parcela.id], forUpdate);
    return derivarSaldoParcela(parcela.valorOriginal, alocs);
  }

  async function tituloTemLiquidacao(tx: FinanceiroNucleoTx, userId: number, tituloId: number) {
    return tituloTemLiquidacaoEfetiva(tx, userId, tituloId);
  }

  return {
    async criarContaFinanceira(userId: number, input: {
      nome: string;
      tipo: FinanceiroContaTipo;
      banco?: string | null;
      agencia?: string | null;
      numeroConta?: string | null;
      saldoAbertura: number;
      dataSaldoAbertura: string;
    }) {
      if (!isFinanceiroContaTipo(input.tipo)) toTrpc("Tipo de conta inválido.");
      if (toCentavos(input.saldoAbertura) < 0) toTrpc(MSG_FIN_VALOR_POSITIVO);
      const nome = input.nome.trim();
      if (!nome) toTrpc("Informe o nome da conta.");
      return store.transaction(async tx => {
        const id = await tx.insertConta({
          userId,
          nome,
          tipo: input.tipo,
          banco: input.banco?.trim() || null,
          agencia: input.agencia?.trim() || null,
          numeroConta: input.numeroConta?.trim() || null,
          saldoAbertura: persistirValor(input.saldoAbertura),
          dataSaldoAbertura: input.dataSaldoAbertura,
          ativa: true,
        });
        return { id };
      });
    },

    async listarContas(userId: number) {
      return store.transaction(async tx => {
        const contas = await tx.listContas(userId);
        const out = [];
        for (const c of contas) {
          out.push({ ...c, saldoAtual: await saldoContaTx(tx, userId, c) });
        }
        return out;
      });
    },

    async obterConta(userId: number, id: number) {
      return store.transaction(async tx => {
        const conta = await tx.findConta(userId, id);
        if (!conta) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        assertUser(conta.userId, userId);
        return { ...conta, saldoAtual: await saldoContaTx(tx, userId, conta) };
      });
    },

    async calcularSaldoConta(userId: number, id: number) {
      const conta = await this.obterConta(userId, id);
      return conta.saldoAtual;
    },

    async inativarConta(userId: number, id: number, motivo?: string | null) {
      return store.transaction(async tx => {
        const conta = await tx.findConta(userId, id);
        if (!conta) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        assertUser(conta.userId, userId);
        await tx.updateContaInativa(userId, id, motivo?.trim() || null, new Date());
        return { success: true };
      });
    },

    async criarTitulo(userId: number, input: {
      tipo: FinanceiroTituloTipo;
      pessoaId: number;
      descricao: string;
      dataCompetencia: string;
      valorOriginal: number;
      documentoReferencia?: string | null;
      observacoes?: string | null;
      fazendaOrigemId?: number | null;
      origemTipo?: string;
      origemId?: number | null;
      origemItemChave?: string | null;
      parcelas?: Array<{ numero: number; vencimento: string; valorOriginal: number }>;
    }) {
      return store.transaction(async tx => criarTituloNoTx(tx, userId, input));
    },

    async definirParcelas(userId: number, tituloId: number, parcelas: Array<{ numero: number; vencimento: string; valorOriginal: number }>) {
      return store.transaction(async tx => {
        const lockedTitulos = await tx.lockTitulos(userId, [tituloId]);
        const titulo = lockedTitulos[0] ?? null;
        if (!titulo) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
        assertUser(titulo.userId, userId);
        if (titulo.estado === "cancelado") toTrpc(MSG_FIN_TITULO_CANCELADO);
        const atuais = await tx.listParcelasTitulo(userId, tituloId);
        if (atuais.length) await tx.lockParcelas(userId, atuais.map(p => p.id));
        if (await tituloTemLiquidacao(tx, userId, tituloId)) toTrpc(MSG_FIN_TITULO_COM_LIQUIDACAO);
        if (!validarSomaParcelas(titulo.valorOriginal, parcelas)) toTrpc(MSG_FIN_PARCELAS_SOMA);
        await tx.deleteParcelasTitulo(userId, tituloId);
        for (const p of parcelas) {
          assertValorPositivo(p.valorOriginal);
          await tx.insertParcela({
            userId,
            tituloId,
            numero: p.numero,
            vencimento: p.vencimento,
            valorOriginal: persistirValor(p.valorOriginal),
          });
        }
        await tx.updateTituloCondicao(userId, tituloId, "definida");
        return { success: true };
      });
    },

    async validarIntegridadeTitulo(userId: number, tituloId: number) {
      return store.transaction(async tx => {
        const titulo = await tx.findTitulo(userId, tituloId);
        if (!titulo) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
        const parcelas = await tx.listParcelasTitulo(userId, tituloId);
        if (titulo.condicaoStatus === "definida" && !validarSomaParcelas(titulo.valorOriginal, parcelas)) {
          return { ok: false as const, message: MSG_FIN_PARCELAS_SOMA };
        }
        return { ok: true as const };
      });
    },

    async detalheTitulo(userId: number, tituloId: number) {
      return store.transaction(async tx => {
        const titulo = await tx.findTitulo(userId, tituloId);
        if (!titulo) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
        assertUser(titulo.userId, userId);
        const parcelas = await tx.listParcelasTitulo(userId, tituloId);
        const alocs = parcelas.length
          ? await tx.listAlocacoesPorParcelas(userId, parcelas.map(p => p.id))
          : [];
        const parcelasDetalhe = parcelas.map(p => {
          const saldo = derivarSaldoParcela(
            p.valorOriginal,
            alocs.filter(a => a.parcelaId === p.id),
          );
          return { ...p, ...saldo };
        });
        const apropriacoes = await tx.listApropriacoes(userId, tituloId);
        const situacao = derivarSituacaoTitulo({
          estado: titulo.estado,
          tipo: titulo.tipo,
          condicaoStatus: titulo.condicaoStatus,
          parcelas: parcelasDetalhe,
          hojeISO: hojeISO(),
        });
        return {
          ...titulo,
          situacao,
          parcelas: parcelasDetalhe,
          apropriacoes,
          ...derivarApropriacao(titulo.valorOriginal, apropriacoes),
        };
      });
    },

    async historicoPagamentosTitulo(userId: number, tituloId: number): Promise<HistoricoPagamentosTitulo> {
      return store.transaction(async tx => {
        const titulo = await tx.findTitulo(userId, tituloId);
        if (!titulo) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
        assertUser(titulo.userId, userId);

        const parcelas = await tx.listParcelasTitulo(userId, tituloId);
        const alocs = parcelas.length
          ? await tx.listAlocacoesPorParcelas(userId, parcelas.map(p => p.id))
          : [];

        const parcelaPorId = new Map(parcelas.map(p => [p.id, p]));
        const liquidacaoIds = idsUnicosOrdenados(alocs.map(a => a.liquidacaoId));
        const liquidacoes = liquidacaoIds.length
          ? await tx.listLiquidacoesPorIds(userId, liquidacaoIds)
          : [];
        const liquidacaoPorId = new Map(liquidacoes.map(l => [l.id, l]));

        const contaIds = idsUnicosOrdenados(liquidacoes.map(l => l.contaId));
        const contas = contaIds.length
          ? await tx.listContasPorIds(userId, contaIds)
          : [];
        const contaPorId = new Map(contas.map(c => [c.id, c]));

        const estornoPorOriginal = new Map<number, number>();
        for (const liquidacao of liquidacoes) {
          if (liquidacao.liquidacaoOriginalId != null) {
            estornoPorOriginal.set(liquidacao.liquidacaoOriginalId, liquidacao.id);
          }
        }

        const alocsPorLiquidacao = new Map<number, typeof alocs>();
        for (const aloc of alocs) {
          const lista = alocsPorLiquidacao.get(aloc.liquidacaoId) ?? [];
          lista.push(aloc);
          alocsPorLiquidacao.set(aloc.liquidacaoId, lista);
        }

        const eventos: HistoricoPagamentoEvento[] = [];
        for (const liquidacaoId of liquidacaoIds) {
          const liquidacao = liquidacaoPorId.get(liquidacaoId);
          if (!liquidacao) continue;

          const alocacoesDesteTitulo = (alocsPorLiquidacao.get(liquidacaoId) ?? [])
            .flatMap(aloc => {
              const parcela = parcelaPorId.get(aloc.parcelaId);
              if (!parcela) return [];
              return [{
                parcelaId: aloc.parcelaId,
                parcelaNumero: parcela.numero,
                vencimento: parcela.vencimento,
                principalLiquidado: aloc.principalLiquidado,
                desconto: aloc.desconto,
                juros: aloc.juros,
                multa: aloc.multa,
                valorCaixaAlocado: caixaDaAlocacao(aloc),
              }];
            })
            .sort((a, b) => a.parcelaNumero - b.parcelaNumero || a.parcelaId - b.parcelaId);

          eventos.push({
            liquidacaoId: liquidacao.id,
            tipo: liquidacao.tipo,
            dataLiquidacao: liquidacao.dataLiquidacao,
            contaId: liquidacao.contaId,
            contaNome: contaPorId.get(liquidacao.contaId)?.nome ?? "",
            valorMovimentado: liquidacao.valorMovimentado,
            valorAlocadoNesteTitulo: somarDinheiro(
              ...alocacoesDesteTitulo.map(aloc => aloc.valorCaixaAlocado),
            ),
            liquidacaoOriginalId: liquidacao.liquidacaoOriginalId,
            estornadaPorLiquidacaoId: estornoPorOriginal.get(liquidacao.id) ?? null,
            referencia: liquidacao.referencia,
            observacoes: liquidacao.observacoes,
            formaPagamento: liquidacao.formaPagamento,
            alocacoesDesteTitulo,
          });
        }

        eventos.sort((a, b) => {
          if (a.dataLiquidacao !== b.dataLiquidacao) {
            return a.dataLiquidacao.localeCompare(b.dataLiquidacao);
          }
          return a.liquidacaoId - b.liquidacaoId;
        });

        const parcelasComSaldo = parcelas.map(parcela => ({
          ...parcela,
          ...derivarSaldoParcela(
            parcela.valorOriginal,
            alocs.filter(aloc => aloc.parcelaId === parcela.id),
          ),
        }));

        return {
          tituloId: titulo.id,
          eventos,
          parcelas: parcelasComSaldo,
        };
      });
    },

    async listarTitulos(userId: number) {
      return store.transaction(async tx => tx.listTitulos(userId));
    },

    async apropriar(userId: number, tituloId: number, itens: Array<{
      valor: number;
      fazendaId?: number | null;
      categoriaId?: number | null;
      centroCustoId?: number | null;
      origemDetalheTipo?: string | null;
      origemDetalheId?: number | null;
      observacoes?: string | null;
    }>) {
      return store.transaction(async tx => apropriarNoTx(tx, userId, tituloId, itens));
    },

    async registrarLiquidacao(userId: number, input: {
      tipo: "pagamento" | "recebimento";
      contaId: number;
      dataLiquidacao: string;
      valorMovimentado: number;
      idempotencyKey: string;
      formaPagamento?: string | null;
      referencia?: string | null;
      observacoes?: string | null;
      alocacoes: AlocacaoInput[];
    }) {
      if (!input.idempotencyKey.trim()) toTrpc(MSG_FIN_IDEMPOTENCY);
      assertValorPositivo(input.valorMovimentado);
      if (!input.alocacoes.length) toTrpc("Informe ao menos uma parcela.");
      return store.transaction(async tx => {
        const existente = await tx.findLiquidacaoPorIdem(userId, input.idempotencyKey);
        if (existente) {
          const movimento = await tx.findMovimentoPorLiquidacao(userId, existente.id);
          return { id: existente.id, movimentoId: movimento?.id ?? null, idempotente: true };
        }
        const contas = await tx.lockContas(userId, [input.contaId]);
        const conta = contas[0] ?? null;
        if (!conta) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        assertUser(conta.userId, userId);
        if (!conta.ativa) toTrpc(MSG_FIN_CONTA_INATIVA);
        assertDataAposAbertura(input.dataLiquidacao, conta);
        const parcelaIds = idsUnicosOrdenados(input.alocacoes.map(a => a.parcelaId));
        if (parcelaIds.length !== input.alocacoes.length) toTrpc("A mesma parcela não pode aparecer duas vezes na liquidação.");
        const parcelasPreview = await tx.listParcelasPorIds(userId, parcelaIds);
        if (parcelasPreview.length !== parcelaIds.length) toTrpc(MSG_FIN_PARCELA_NAO_ENCONTRADA, "NOT_FOUND");
        const tituloIds = idsUnicosOrdenados(parcelasPreview.map(p => p.tituloId));
        const titulos = await tx.lockTitulos(userId, tituloIds);
        if (titulos.length !== tituloIds.length) toTrpc(MSG_FIN_TITULO_NAO_ENCONTRADO, "NOT_FOUND");
        const parcelas = await tx.lockParcelas(userId, parcelaIds);
        if (parcelas.length !== parcelaIds.length) toTrpc(MSG_FIN_PARCELA_NAO_ENCONTRADA, "NOT_FOUND");
        for (const p of parcelas) assertUser(p.userId, userId);
        for (const titulo of titulos) {
          assertUser(titulo.userId, userId);
          if (titulo.estado === "cancelado") toTrpc(MSG_FIN_TITULO_CANCELADO);
        }
        const tipoEsperado = input.tipo === "pagamento" ? "pagar" : "receber";
        if (titulos.some(t => t.tipo !== tipoEsperado)) toTrpc(MSG_FIN_TIPO_LIQUIDACAO);
        if (new Set(titulos.map(t => t.tipo)).size > 1) toTrpc(MSG_FIN_TIPOS_MISTURADOS);
        if (new Set(titulos.map(t => t.pessoaId)).size > 1) toTrpc(MSG_FIN_PESSOAS_MISTURADAS);
        const pessoaId = titulos[0]!.pessoaId;

        const caixas: number[] = [];
        for (const alloc of input.alocacoes) {
          const parcela = parcelas.find(p => p.id === alloc.parcelaId)!;
          const comps = validarComponentesAlocacao(alloc);
          if (!comps.ok) toTrpc(comps.message);
          const saldo = await saldoParcelaTx(tx, userId, parcela, true);
          if (toCentavos(alloc.principalLiquidado) > toCentavos(saldo.saldoPrincipal)) {
            toTrpc(MSG_FIN_OVERPAYMENT);
          }
          caixas.push(comps.caixa);
        }
        const somaCaixa = caixas.reduce((a, b) => a + toCentavos(b), 0);
        if (somaCaixa !== toCentavos(input.valorMovimentado)) toTrpc(MSG_FIN_FORMULA_CAIXA);

        const liquidacaoId = await tx.insertLiquidacao({
          userId,
          tipo: input.tipo,
          contaId: conta.id,
          dataLiquidacao: input.dataLiquidacao,
          valorMovimentado: persistirValor(input.valorMovimentado),
          formaPagamento: input.formaPagamento ?? null,
          referencia: input.referencia ?? null,
          observacoes: input.observacoes ?? null,
          liquidacaoOriginalId: null,
          idempotencyKey: input.idempotencyKey,
        });
        for (const alloc of input.alocacoes) {
          await tx.insertAlocacao({
            userId,
            liquidacaoId,
            parcelaId: alloc.parcelaId,
            principalLiquidado: persistirValor(alloc.principalLiquidado),
            desconto: persistirValor(alloc.desconto ?? 0),
            juros: persistirValor(alloc.juros ?? 0),
            multa: persistirValor(alloc.multa ?? 0),
          });
        }
        const direcao = direcaoDaLiquidacao(input.tipo);
        const valor = persistirValor(input.valorMovimentado);
        const movimentoId = await tx.insertMovimento({
          userId,
          contaId: conta.id,
          dataMovimento: input.dataLiquidacao,
          direcao,
          natureza: naturezaDaLiquidacao(input.tipo),
          valor,
          liquidacaoId,
          transferenciaId: null,
          contrapartePessoaId: pessoaId,
          descricao: input.tipo === "pagamento" ? "Pagamento" : "Recebimento",
          referencia: input.referencia ?? null,
          movimentoOriginalId: null,
        });
        const movimento = await tx.findMovimentoPorLiquidacao(userId, liquidacaoId);
        if (
          !movimento
          || movimento.contaId !== conta.id
          || movimento.direcao !== direcao
          || toCentavos(movimento.valor) !== toCentavos(valor)
        ) {
          toTrpc(MSG_FIN_MOVIMENTO_LIQUIDACAO);
        }
        return { id: liquidacaoId, movimentoId, idempotente: false };
      });
    },

    criarPagamento(userId: number, input: Omit<LiquidacaoCmd, "tipo">) {
      return this.registrarLiquidacao(userId, { ...input, tipo: "pagamento" });
    },

    criarRecebimento(userId: number, input: Omit<LiquidacaoCmd, "tipo">) {
      return this.registrarLiquidacao(userId, { ...input, tipo: "recebimento" });
    },

    async estornarLiquidacao(userId: number, input: { liquidacaoId: number; idempotencyKey: string; dataLiquidacao: string }) {
      if (!input.idempotencyKey.trim()) toTrpc(MSG_FIN_IDEMPOTENCY);
      return store.transaction(async tx => {
        const existente = await tx.findLiquidacaoPorIdem(userId, input.idempotencyKey);
        if (existente) {
          const movimento = await tx.findMovimentoPorLiquidacao(userId, existente.id);
          return { id: existente.id, movimentoId: movimento?.id ?? null, idempotente: true };
        }
        const original = await tx.lockLiquidacao(userId, input.liquidacaoId);
        if (!original) toTrpc(MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA, "NOT_FOUND");
        assertUser(original.userId, userId);
        if (original.tipo.startsWith("estorno_")) toTrpc("Não é possível estornar um estorno.");
        const ja = await tx.findEstornoDe(userId, original.id, true);
        if (ja) toTrpc(MSG_FIN_LIQUIDACAO_JA_ESTORNADA);
        const contas = await tx.lockContas(userId, [original.contaId]);
        const conta = contas[0] ?? null;
        if (!conta) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        if (!conta.ativa) toTrpc(MSG_FIN_CONTA_INATIVA);
        assertDataAposAbertura(input.dataLiquidacao, conta);
        const alocs = await tx.listAlocacoesLiquidacao(userId, original.id);
        if (alocs.length) await tx.lockParcelas(userId, idsUnicosOrdenados(alocs.map(a => a.parcelaId)));
        const tipoEstorno: FinanceiroLiquidacaoTipo = original.tipo === "pagamento"
          ? "estorno_pagamento"
          : "estorno_recebimento";
        const estornoId = await tx.insertLiquidacao({
          userId,
          tipo: tipoEstorno,
          contaId: original.contaId,
          dataLiquidacao: input.dataLiquidacao,
          valorMovimentado: original.valorMovimentado,
          formaPagamento: original.formaPagamento,
          referencia: original.referencia,
          observacoes: original.observacoes,
          liquidacaoOriginalId: original.id,
          idempotencyKey: input.idempotencyKey,
        });
        for (const a of alocs) {
          await tx.insertAlocacao({
            userId,
            liquidacaoId: estornoId,
            parcelaId: a.parcelaId,
            principalLiquidado: a.principalLiquidado,
            desconto: a.desconto,
            juros: a.juros,
            multa: a.multa,
          });
        }
        const originalMov = await tx.findMovimentoPorLiquidacao(userId, original.id);
        const movimentoId = await tx.insertMovimento({
          userId,
          contaId: original.contaId,
          dataMovimento: input.dataLiquidacao,
          direcao: direcaoDaLiquidacao(tipoEstorno),
          natureza: naturezaDaLiquidacao(tipoEstorno),
          valor: original.valorMovimentado,
          liquidacaoId: estornoId,
          transferenciaId: null,
          contrapartePessoaId: originalMov?.contrapartePessoaId ?? null,
          descricao: "Estorno de liquidação",
          referencia: original.referencia,
          movimentoOriginalId: originalMov?.id ?? null,
        });
        return { id: estornoId, movimentoId, idempotente: false };
      });
    },

    async criarTransferencia(userId: number, input: {
      contaOrigemId: number;
      contaDestinoId: number;
      dataTransferencia: string;
      valor: number;
      idempotencyKey: string;
      descricao?: string | null;
      referencia?: string | null;
      observacoes?: string | null;
    }) {
      if (!input.idempotencyKey.trim()) toTrpc(MSG_FIN_IDEMPOTENCY);
      assertValorPositivo(input.valor);
      if (input.contaOrigemId === input.contaDestinoId) toTrpc(MSG_FIN_TRANSFERENCIA_MESMA_CONTA);
      return store.transaction(async tx => {
        const existente = await tx.findTransferenciaPorIdem(userId, input.idempotencyKey);
        if (existente) return { id: existente.id, idempotente: true };
        const contas = await tx.lockContas(userId, [input.contaOrigemId, input.contaDestinoId]);
        const origem = contas.find(c => c.id === input.contaOrigemId) ?? null;
        const destino = contas.find(c => c.id === input.contaDestinoId) ?? null;
        if (!origem || !destino) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        assertUser(origem.userId, userId);
        assertUser(destino.userId, userId);
        if (!origem.ativa || !destino.ativa) toTrpc(MSG_FIN_CONTA_INATIVA);
        assertDataAposAbertura(input.dataTransferencia, origem);
        assertDataAposAbertura(input.dataTransferencia, destino);
        const id = await tx.insertTransferencia({
          userId,
          contaOrigemId: origem.id,
          contaDestinoId: destino.id,
          dataTransferencia: input.dataTransferencia,
          valor: persistirValor(input.valor),
          descricao: input.descricao ?? null,
          referencia: input.referencia ?? null,
          observacoes: input.observacoes ?? null,
          estado: "confirmada",
          transferenciaOriginalId: null,
          idempotencyKey: input.idempotencyKey,
        });
        const valor = persistirValor(input.valor);
        await tx.insertMovimento({
          userId,
          contaId: origem.id,
          dataMovimento: input.dataTransferencia,
          direcao: "saida",
          natureza: "transferencia_saida",
          valor,
          liquidacaoId: null,
          transferenciaId: id,
          contrapartePessoaId: null,
          descricao: input.descricao?.trim() || "Transferência",
          referencia: input.referencia ?? null,
          movimentoOriginalId: null,
        });
        await tx.insertMovimento({
          userId,
          contaId: destino.id,
          dataMovimento: input.dataTransferencia,
          direcao: "entrada",
          natureza: "transferencia_entrada",
          valor,
          liquidacaoId: null,
          transferenciaId: id,
          contrapartePessoaId: null,
          descricao: input.descricao?.trim() || "Transferência",
          referencia: input.referencia ?? null,
          movimentoOriginalId: null,
        });
        const pernas = await tx.listMovimentosPorTransferencia(userId, id);
        const okPernas = validarPernasTransferencia({
          contaOrigemId: origem.id,
          contaDestinoId: destino.id,
          valor,
          movimentos: pernas,
        });
        if (!okPernas.ok) toTrpc(MSG_FIN_TRANSFERENCIA_PERNAS);
        return { id, idempotente: false };
      });
    },

    async estornarTransferencia(userId: number, input: {
      transferenciaId: number;
      idempotencyKey: string;
      dataTransferencia: string;
    }) {
      if (!input.idempotencyKey.trim()) toTrpc(MSG_FIN_IDEMPOTENCY);
      return store.transaction(async tx => {
        const existente = await tx.findTransferenciaPorIdem(userId, input.idempotencyKey);
        if (existente) return { id: existente.id, idempotente: true };
        const original = await tx.lockTransferencia(userId, input.transferenciaId);
        if (!original) toTrpc("Transferência não encontrada.", "NOT_FOUND");
        assertUser(original.userId, userId);
        if (original.estado === "estornada") toTrpc(MSG_FIN_TRANSFERENCIA_JA_ESTORNADA);
        const ja = await tx.findEstornoTransferencia(userId, original.id);
        if (ja) toTrpc(MSG_FIN_TRANSFERENCIA_JA_ESTORNADA);
        const contas = await tx.lockContas(userId, [original.contaDestinoId, original.contaOrigemId]);
        const origem = contas.find(c => c.id === original.contaDestinoId) ?? null;
        const destino = contas.find(c => c.id === original.contaOrigemId) ?? null;
        if (!origem || !destino) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        if (!origem.ativa || !destino.ativa) toTrpc(MSG_FIN_CONTA_INATIVA);
        assertDataAposAbertura(input.dataTransferencia, origem);
        assertDataAposAbertura(input.dataTransferencia, destino);
        const id = await tx.insertTransferencia({
          userId,
          contaOrigemId: original.contaDestinoId,
          contaDestinoId: original.contaOrigemId,
          dataTransferencia: input.dataTransferencia,
          valor: original.valor,
          descricao: "Estorno de transferência",
          referencia: original.referencia,
          observacoes: original.observacoes,
          estado: "confirmada",
          transferenciaOriginalId: original.id,
          idempotencyKey: input.idempotencyKey,
        });
        await tx.insertMovimento({
          userId,
          contaId: original.contaDestinoId,
          dataMovimento: input.dataTransferencia,
          direcao: "saida",
          natureza: "transferencia_saida",
          valor: original.valor,
          liquidacaoId: null,
          transferenciaId: id,
          contrapartePessoaId: null,
          descricao: "Estorno de transferência",
          referencia: original.referencia,
          movimentoOriginalId: null,
        });
        await tx.insertMovimento({
          userId,
          contaId: original.contaOrigemId,
          dataMovimento: input.dataTransferencia,
          direcao: "entrada",
          natureza: "transferencia_entrada",
          valor: original.valor,
          liquidacaoId: null,
          transferenciaId: id,
          contrapartePessoaId: null,
          descricao: "Estorno de transferência",
          referencia: original.referencia,
          movimentoOriginalId: null,
        });
        await tx.marcarTransferenciaEstornada(userId, original.id);
        const pernas = await tx.listMovimentosPorTransferencia(userId, id);
        const okPernas = validarPernasTransferencia({
          contaOrigemId: original.contaDestinoId,
          contaDestinoId: original.contaOrigemId,
          valor: original.valor,
          movimentos: pernas,
        });
        if (!okPernas.ok) toTrpc(MSG_FIN_TRANSFERENCIA_PERNAS);
        return { id, idempotente: false };
      });
    },

    async extrato(userId: number, contaId: number, de?: string, ate?: string) {
      return store.transaction(async tx => {
        const conta = await tx.findConta(userId, contaId);
        if (!conta) toTrpc(MSG_FIN_CONTA_NAO_ENCONTRADA, "NOT_FOUND");
        assertUser(conta.userId, userId);
        const movimentos = await tx.listMovimentosFiltro(userId, contaId, de, ate);
        return {
          conta,
          saldoAtual: await saldoContaTx(tx, userId, conta),
          movimentos: movimentos.filter(m => isFinanceiroNatureza(m.natureza)),
        };
      });
    },

    async criarCategoria(userId: number, input: {
      nome: string;
      tipo: "entrada" | "saida";
      categoriaPaiId?: number | null;
      chaveSistema?: string | null;
    }) {
      const nome = input.nome.trim();
      if (!nome) toTrpc("Informe o nome da categoria.");
      return store.transaction(async tx => {
        const chave = input.chaveSistema?.trim() || null;
        if (chave) {
          const dup = await tx.findCategoriaPorChave(userId, chave);
          if (dup) toTrpc(MSG_FIN_CATEGORIA_DUPLICADA);
        }
        if (input.categoriaPaiId) {
          const pai = await tx.findCategoria(userId, input.categoriaPaiId);
          if (!pai) toTrpc("Categoria pai não encontrada.", "NOT_FOUND");
          if (pai.categoriaPaiId) toTrpc("A hierarquia de categoria fica em pai + filho nesta fase.");
        }
        const id = await tx.insertCategoria({
          userId,
          nome,
          tipo: input.tipo,
          categoriaPaiId: input.categoriaPaiId ?? null,
          chaveSistema: chave,
          ativa: true,
        });
        return { id };
      });
    },

    async listarCategorias(userId: number) {
      return store.transaction(async tx => tx.listCategorias(userId));
    },

    async inativarCategoria(userId: number, id: number) {
      return store.transaction(async tx => {
        const cat = await tx.findCategoria(userId, id);
        if (!cat) toTrpc("Categoria financeira não encontrada.", "NOT_FOUND");
        await tx.updateCategoria(userId, id, { ativa: false });
        return { success: true };
      });
    },

    async criarCentroCusto(userId: number, input: { nome: string; fazendaId?: number | null }) {
      const nome = input.nome.trim();
      if (!nome) toTrpc("Informe o nome do centro de custo.");
      return store.transaction(async tx => {
        if (input.fazendaId) {
          const fazenda = await tx.findFazenda(userId, input.fazendaId);
          if (!fazenda) toTrpc(MSG_FIN_FAZENDA_INVALIDA, "FORBIDDEN");
        }
        const id = await tx.insertCentro({
          userId,
          nome,
          fazendaId: input.fazendaId ?? null,
          ativo: true,
        });
        return { id };
      });
    },

    async listarCentrosCusto(userId: number) {
      return store.transaction(async tx => tx.listCentros(userId));
    },

    async inativarCentroCusto(userId: number, id: number) {
      return store.transaction(async tx => {
        const centro = await tx.findCentro(userId, id);
        if (!centro) toTrpc("Centro de custo não encontrado.", "NOT_FOUND");
        await tx.updateCentro(userId, id, { ativo: false });
        return { success: true };
      });
    },

    async validarIntegridadeLiquidacao(userId: number, liquidacaoId: number) {
      return store.transaction(async tx => {
        const liq = await tx.findLiquidacao(userId, liquidacaoId);
        if (!liq) toTrpc(MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA, "NOT_FOUND");
        const alocs = await tx.listAlocacoesLiquidacao(userId, liquidacaoId);
        const soma = alocs.reduce<number>((acc, a) => acc + toCentavos(caixaDaAlocacao(a)), 0);
        if (soma !== toCentavos(liq.valorMovimentado)) {
          return { ok: false as const, message: MSG_FIN_FORMULA_CAIXA };
        }
        const mov = await tx.findMovimentoPorLiquidacao(userId, liquidacaoId);
        if (!mov) return { ok: false as const, message: "Liquidação sem movimento de conta." };
        if (
          mov.contaId !== liq.contaId
          || mov.direcao !== direcaoDaLiquidacao(liq.tipo)
          || toCentavos(mov.valor) !== toCentavos(liq.valorMovimentado)
        ) {
          return { ok: false as const, message: MSG_FIN_MOVIMENTO_LIQUIDACAO };
        }
        return { ok: true as const };
      });
    },

    async cancelarTitulo(userId: number, tituloId: number, motivo: string) {
      return store.transaction(async tx => cancelarTituloNoTx(tx, userId, tituloId, motivo));
    },
  };
}

export type FinanceiroNucleoService = ReturnType<typeof createFinanceiroNucleoService>;

function mapConta(row: typeof financeiroContas.$inferSelect): FinContaRow {
  return {
    id: row.id,
    userId: row.userId,
    nome: row.nome,
    tipo: row.tipo,
    banco: row.banco,
    agencia: row.agencia,
    numeroConta: row.numeroConta,
    saldoAbertura: String(row.saldoAbertura ?? "0"),
    dataSaldoAbertura: String(row.dataSaldoAbertura),
    ativa: Boolean(row.ativa),
    inativadaEm: row.inativadaEm ?? null,
    motivoInativacao: row.motivoInativacao,
  };
}

export type FinanceiroDrizzleTx = {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
  delete: typeof db.delete;
  execute: typeof db.execute;
};

export function createFinanceiroNucleoTxFromDrizzle(drizzleTx: FinanceiroDrizzleTx): FinanceiroNucleoTx {
  const tx: FinanceiroNucleoTx = {
        async findConta(userId, id) {
          const [row] = await drizzleTx.select().from(financeiroContas)
            .where(and(eq(financeiroContas.id, id), eq(financeiroContas.userId, userId))).limit(1);
          return row ? mapConta(row) : null;
        },
        async lockContas(userId, ids) {
          const unique = idsUnicosOrdenados(ids);
          if (!unique.length) return [];
          await drizzleTx.execute(sql`
            SELECT id FROM financeiro_contas
            WHERE user_id = ${userId}
              AND id IN (${sql.join(unique.map(id => sql`${id}`), sql`, `)})
            ORDER BY id FOR UPDATE
          `);
          const rows = await drizzleTx.select().from(financeiroContas)
            .where(and(eq(financeiroContas.userId, userId), inArray(financeiroContas.id, unique)))
            .orderBy(financeiroContas.id);
          return rows.map(mapConta);
        },
        async lockTitulos(userId, ids) {
          const unique = idsUnicosOrdenados(ids);
          if (!unique.length) return [];
          await drizzleTx.execute(sql`
            SELECT id FROM financeiro_titulos
            WHERE user_id = ${userId}
              AND id IN (${sql.join(unique.map(id => sql`${id}`), sql`, `)})
            ORDER BY id FOR UPDATE
          `);
          const rows = await drizzleTx.select().from(financeiroTitulos)
            .where(and(eq(financeiroTitulos.userId, userId), inArray(financeiroTitulos.id, unique)))
            .orderBy(financeiroTitulos.id);
          return rows.map(mapTitulo);
        },
        async lockParcelas(userId, ids) {
          const unique = idsUnicosOrdenados(ids);
          if (!unique.length) return [];
          await drizzleTx.execute(sql`
            SELECT id FROM financeiro_parcelas
            WHERE user_id = ${userId}
              AND id IN (${sql.join(unique.map(id => sql`${id}`), sql`, `)})
            ORDER BY id FOR UPDATE
          `);
          await drizzleTx.execute(sql`
            SELECT id FROM financeiro_liquidacao_alocacoes
            WHERE user_id = ${userId}
              AND parcela_id IN (${sql.join(unique.map(id => sql`${id}`), sql`, `)})
            FOR UPDATE
          `);
          const rows = await drizzleTx.select().from(financeiroParcelas)
            .where(and(eq(financeiroParcelas.userId, userId), inArray(financeiroParcelas.id, unique)))
            .orderBy(financeiroParcelas.id);
          return rows.map(mapParcela);
        },
        async lockLiquidacao(userId, id) {
          await drizzleTx.execute(sql`
            SELECT id FROM financeiro_liquidacoes
            WHERE id = ${id} AND user_id = ${userId}
            FOR UPDATE
          `);
          const [row] = await drizzleTx.select().from(financeiroLiquidacoes)
            .where(and(eq(financeiroLiquidacoes.id, id), eq(financeiroLiquidacoes.userId, userId)))
            .limit(1);
          return row ? mapLiq(row) : null;
        },
        async lockTransferencia(userId, id) {
          await drizzleTx.execute(sql`
            SELECT id FROM financeiro_transferencias
            WHERE id = ${id} AND user_id = ${userId}
            FOR UPDATE
          `);
          const [row] = await drizzleTx.select().from(financeiroTransferencias)
            .where(and(eq(financeiroTransferencias.id, id), eq(financeiroTransferencias.userId, userId)))
            .limit(1);
          return row ? mapTransf(row) : null;
        },
        async insertConta(row) {
          const result = await drizzleTx.insert(financeiroContas).values({
            userId: row.userId,
            nome: row.nome,
            tipo: row.tipo,
            banco: row.banco,
            agencia: row.agencia,
            numeroConta: row.numeroConta,
            saldoAbertura: row.saldoAbertura,
            dataSaldoAbertura: row.dataSaldoAbertura,
            ativa: row.ativa,
          });
          return insertIdOf(result);
        },
        async updateContaInativa(userId, id, motivo, em) {
          await drizzleTx.update(financeiroContas)
            .set({ ativa: false, motivoInativacao: motivo, inativadaEm: em })
            .where(and(eq(financeiroContas.id, id), eq(financeiroContas.userId, userId)));
        },
        async listContas(userId) {
          const rows = await drizzleTx.select().from(financeiroContas)
            .where(eq(financeiroContas.userId, userId))
            .orderBy(desc(financeiroContas.createdAt));
          return rows.map(mapConta);
        },
        async listContasPorIds(userId, ids) {
          if (!ids.length) return [];
          const unique = idsUnicosOrdenados(ids);
          const rows = await drizzleTx.select().from(financeiroContas)
            .where(and(eq(financeiroContas.userId, userId), inArray(financeiroContas.id, unique)));
          return rows.map(mapConta);
        },
        async countMovimentosConta(userId, contaId) {
          const [row] = await drizzleTx.select({ n: sql<number>`COUNT(*)` }).from(financeiroMovimentos)
            .where(and(eq(financeiroMovimentos.userId, userId), eq(financeiroMovimentos.contaId, contaId)));
          return Number(row?.n ?? 0);
        },
        async listMovimentosConta(userId, contaId) {
          const rows = await drizzleTx.select().from(financeiroMovimentos)
            .where(and(eq(financeiroMovimentos.userId, userId), eq(financeiroMovimentos.contaId, contaId)));
          return rows.map(mapMov);
        },
        async findPessoa(userId, id) {
          const [row] = await drizzleTx.select({
            id: pessoas.id,
            nome: pessoas.nome,
            ativo: pessoas.ativo,
            tipo: pessoas.tipo,
          })
            .from(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).limit(1);
          return row ? { id: row.id, nome: row.nome, ativo: Boolean(row.ativo), tipo: row.tipo } : null;
        },
        async listTitulosPorOrigem(userId, origemTipo, origemId) {
          const rows = await drizzleTx.select().from(financeiroTitulos).where(and(
            eq(financeiroTitulos.userId, userId),
            eq(financeiroTitulos.origemTipo, origemTipo),
            eq(financeiroTitulos.origemId, origemId),
          ));
          return rows.map(mapTitulo);
        },
        async findFazenda(userId, id) {
          const [row] = await drizzleTx.select({ id: fazendas.id }).from(fazendas)
            .where(and(eq(fazendas.id, id), eq(fazendas.userId, userId))).limit(1);
          return row ?? null;
        },
        async findTitulo(userId, id) {
          const [row] = await drizzleTx.select().from(financeiroTitulos)
            .where(and(eq(financeiroTitulos.id, id), eq(financeiroTitulos.userId, userId))).limit(1);
          return row ? mapTitulo(row) : null;
        },
        async findTituloPorOrigem(userId, origemTipo, origemId, origemItemChave) {
          const [row] = await drizzleTx.select().from(financeiroTitulos).where(and(
            eq(financeiroTitulos.userId, userId),
            eq(financeiroTitulos.origemTipo, origemTipo),
            eq(financeiroTitulos.origemId, origemId),
            eq(financeiroTitulos.origemItemChave, origemItemChave),
          )).limit(1);
          return row ? mapTitulo(row) : null;
        },
        async insertTitulo(row) {
          const result = await drizzleTx.insert(financeiroTitulos).values({
            userId: row.userId,
            tipo: row.tipo,
            estado: row.estado,
            condicaoStatus: row.condicaoStatus,
            pessoaId: row.pessoaId,
            contraparteNomeSnapshot: row.contraparteNomeSnapshot,
            fazendaOrigemId: row.fazendaOrigemId,
            origemTipo: row.origemTipo,
            origemId: row.origemId,
            origemItemChave: row.origemItemChave,
            descricao: row.descricao,
            dataCompetencia: row.dataCompetencia,
            valorOriginal: row.valorOriginal,
            documentoReferencia: row.documentoReferencia,
            observacoes: row.observacoes,
          });
          return insertIdOf(result);
        },
        async updateTituloCondicao(userId, id, condicao) {
          await drizzleTx.update(financeiroTitulos).set({ condicaoStatus: condicao })
            .where(and(eq(financeiroTitulos.id, id), eq(financeiroTitulos.userId, userId)));
        },
        async cancelarTitulo(userId, id, motivo, em) {
          await drizzleTx.update(financeiroTitulos)
            .set({ estado: "cancelado", motivoCancelamento: motivo, canceladoEm: em })
            .where(and(eq(financeiroTitulos.id, id), eq(financeiroTitulos.userId, userId)));
        },
        async listTitulos(userId) {
          const rows = await drizzleTx.select().from(financeiroTitulos)
            .where(eq(financeiroTitulos.userId, userId))
            .orderBy(desc(financeiroTitulos.createdAt));
          return rows.map(mapTitulo);
        },
        async listParcelasTitulo(userId, tituloId) {
          const rows = await drizzleTx.select().from(financeiroParcelas)
            .where(and(eq(financeiroParcelas.userId, userId), eq(financeiroParcelas.tituloId, tituloId)));
          return rows.map(mapParcela);
        },
        async listParcelasPorIds(userId, ids) {
          if (!ids.length) return [];
          const rows = await drizzleTx.select().from(financeiroParcelas)
            .where(and(eq(financeiroParcelas.userId, userId), inArray(financeiroParcelas.id, ids)));
          return rows.map(mapParcela);
        },
        async insertParcela(row) {
          const result = await drizzleTx.insert(financeiroParcelas).values({
            userId: row.userId,
            tituloId: row.tituloId,
            numero: row.numero,
            vencimento: row.vencimento,
            valorOriginal: row.valorOriginal,
          });
          return insertIdOf(result);
        },
        async deleteParcelasTitulo(userId, tituloId) {
          await drizzleTx.delete(financeiroParcelas)
            .where(and(eq(financeiroParcelas.userId, userId), eq(financeiroParcelas.tituloId, tituloId)));
        },
        async findLiquidacao(userId, id) {
          const [row] = await drizzleTx.select().from(financeiroLiquidacoes)
            .where(and(eq(financeiroLiquidacoes.id, id), eq(financeiroLiquidacoes.userId, userId))).limit(1);
          return row ? mapLiq(row) : null;
        },
        async listLiquidacoesPorIds(userId, ids) {
          if (!ids.length) return [];
          const unique = idsUnicosOrdenados(ids);
          const rows = await drizzleTx.select().from(financeiroLiquidacoes)
            .where(and(eq(financeiroLiquidacoes.userId, userId), inArray(financeiroLiquidacoes.id, unique)));
          return rows.map(mapLiq);
        },
        async findLiquidacaoPorIdem(userId, key) {
          const [row] = await drizzleTx.select().from(financeiroLiquidacoes)
            .where(and(eq(financeiroLiquidacoes.userId, userId), eq(financeiroLiquidacoes.idempotencyKey, key))).limit(1);
          return row ? mapLiq(row) : null;
        },
        async findEstornoDe(userId, originalId, forUpdate) {
          if (forUpdate) {
            const result = await drizzleTx.execute(sql`
              SELECT id FROM financeiro_liquidacoes
              WHERE user_id = ${userId} AND liquidacao_original_id = ${originalId}
              FOR UPDATE
            `);
            const raw = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
            const linhas = (Array.isArray(raw) ? raw : []) as Array<{ id?: number }>;
            const id = Number(linhas[0]?.id ?? 0);
            if (!id) return null;
            const [row] = await drizzleTx.select().from(financeiroLiquidacoes)
              .where(and(eq(financeiroLiquidacoes.id, id), eq(financeiroLiquidacoes.userId, userId))).limit(1);
            return row ? mapLiq(row) : null;
          }
          const [row] = await drizzleTx.select().from(financeiroLiquidacoes)
            .where(and(eq(financeiroLiquidacoes.userId, userId), eq(financeiroLiquidacoes.liquidacaoOriginalId, originalId))).limit(1);
          return row ? mapLiq(row) : null;
        },
        async insertLiquidacao(row) {
          const result = await drizzleTx.insert(financeiroLiquidacoes).values({
            userId: row.userId,
            tipo: row.tipo,
            contaId: row.contaId,
            dataLiquidacao: row.dataLiquidacao,
            valorMovimentado: row.valorMovimentado,
            formaPagamento: row.formaPagamento,
            referencia: row.referencia,
            observacoes: row.observacoes,
            liquidacaoOriginalId: row.liquidacaoOriginalId,
            idempotencyKey: row.idempotencyKey,
          });
          return insertIdOf(result);
        },
        async insertAlocacao(row) {
          const result = await drizzleTx.insert(financeiroLiquidacaoAlocacoes).values({
            userId: row.userId,
            liquidacaoId: row.liquidacaoId,
            parcelaId: row.parcelaId,
            principalLiquidado: row.principalLiquidado,
            desconto: row.desconto,
            juros: row.juros,
            multa: row.multa,
          });
          return insertIdOf(result);
        },
        async listAlocacoesPorParcelas(userId, parcelaIds, forUpdate) {
          if (!parcelaIds.length) return [];
          if (forUpdate) {
            const result = await drizzleTx.execute(sql`
              SELECT a.id, a.user_id, a.liquidacao_id, a.parcela_id, a.principal_liquidado, a.desconto, a.juros, a.multa, l.tipo
              FROM financeiro_liquidacao_alocacoes a
              INNER JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
              WHERE a.user_id = ${userId}
                AND a.parcela_id IN (${sql.join(parcelaIds.map(id => sql`${id}`), sql`, `)})
              FOR UPDATE
            `);
            const raw = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
            const linhas = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
            return linhas.map(r => ({
              id: Number(r.id),
              userId: Number(r.user_id),
              liquidacaoId: Number(r.liquidacao_id),
              parcelaId: Number(r.parcela_id),
              principalLiquidado: String(r.principal_liquidado),
              desconto: String(r.desconto ?? "0"),
              juros: String(r.juros ?? "0"),
              multa: String(r.multa ?? "0"),
              tipoLiquidacao: String(r.tipo) as FinanceiroLiquidacaoTipo,
            }));
          }
          const rows = await drizzleTx
            .select({
              aloc: financeiroLiquidacaoAlocacoes,
              tipo: financeiroLiquidacoes.tipo,
            })
            .from(financeiroLiquidacaoAlocacoes)
            .innerJoin(financeiroLiquidacoes, eq(financeiroLiquidacoes.id, financeiroLiquidacaoAlocacoes.liquidacaoId))
            .where(and(
              eq(financeiroLiquidacaoAlocacoes.userId, userId),
              inArray(financeiroLiquidacaoAlocacoes.parcelaId, parcelaIds),
            ));
          return rows.map(r => ({ ...mapAloc(r.aloc), tipoLiquidacao: r.tipo as FinanceiroLiquidacaoTipo }));
        },
        async listAlocacoesLiquidacao(userId, liquidacaoId) {
          const rows = await drizzleTx.select().from(financeiroLiquidacaoAlocacoes)
            .where(and(eq(financeiroLiquidacaoAlocacoes.userId, userId), eq(financeiroLiquidacaoAlocacoes.liquidacaoId, liquidacaoId)));
          return rows.map(mapAloc);
        },
        async insertMovimento(row) {
          const result = await drizzleTx.insert(financeiroMovimentos).values({
            userId: row.userId,
            contaId: row.contaId,
            dataMovimento: row.dataMovimento,
            direcao: row.direcao,
            natureza: row.natureza,
            valor: row.valor,
            liquidacaoId: row.liquidacaoId,
            transferenciaId: row.transferenciaId,
            contrapartePessoaId: row.contrapartePessoaId,
            descricao: row.descricao,
            referencia: row.referencia,
            movimentoOriginalId: row.movimentoOriginalId,
          });
          return insertIdOf(result);
        },
        async findMovimentoPorLiquidacao(userId, liquidacaoId) {
          const [row] = await drizzleTx.select().from(financeiroMovimentos)
            .where(and(eq(financeiroMovimentos.userId, userId), eq(financeiroMovimentos.liquidacaoId, liquidacaoId))).limit(1);
          return row ? mapMov(row) : null;
        },
        async listMovimentosPorTransferencia(userId, transferenciaId) {
          const rows = await drizzleTx.select().from(financeiroMovimentos)
            .where(and(eq(financeiroMovimentos.userId, userId), eq(financeiroMovimentos.transferenciaId, transferenciaId)));
          return rows.map(mapMov);
        },
        async listMovimentosFiltro(userId, contaId, de, ate) {
          const conds = [
            eq(financeiroMovimentos.userId, userId),
            eq(financeiroMovimentos.contaId, contaId),
          ];
          if (de) conds.push(gte(financeiroMovimentos.dataMovimento, de));
          if (ate) conds.push(lte(financeiroMovimentos.dataMovimento, ate));
          const rows = await drizzleTx.select().from(financeiroMovimentos)
            .where(and(...conds))
            .orderBy(financeiroMovimentos.dataMovimento, financeiroMovimentos.id);
          return rows.map(mapMov);
        },
        async findTransferencia(userId, id) {
          const [row] = await drizzleTx.select().from(financeiroTransferencias)
            .where(and(eq(financeiroTransferencias.id, id), eq(financeiroTransferencias.userId, userId))).limit(1);
          return row ? mapTransf(row) : null;
        },
        async findTransferenciaPorIdem(userId, key) {
          const [row] = await drizzleTx.select().from(financeiroTransferencias)
            .where(and(eq(financeiroTransferencias.userId, userId), eq(financeiroTransferencias.idempotencyKey, key))).limit(1);
          return row ? mapTransf(row) : null;
        },
        async findEstornoTransferencia(userId, originalId) {
          const [row] = await drizzleTx.select().from(financeiroTransferencias)
            .where(and(eq(financeiroTransferencias.userId, userId), eq(financeiroTransferencias.transferenciaOriginalId, originalId))).limit(1);
          return row ? mapTransf(row) : null;
        },
        async insertTransferencia(row) {
          const result = await drizzleTx.insert(financeiroTransferencias).values({
            userId: row.userId,
            contaOrigemId: row.contaOrigemId,
            contaDestinoId: row.contaDestinoId,
            dataTransferencia: row.dataTransferencia,
            valor: row.valor,
            descricao: row.descricao,
            referencia: row.referencia,
            observacoes: row.observacoes,
            estado: row.estado,
            transferenciaOriginalId: row.transferenciaOriginalId,
            idempotencyKey: row.idempotencyKey,
          });
          return insertIdOf(result);
        },
        async marcarTransferenciaEstornada(userId, id) {
          await drizzleTx.update(financeiroTransferencias).set({ estado: "estornada" })
            .where(and(eq(financeiroTransferencias.id, id), eq(financeiroTransferencias.userId, userId)));
        },
        async listApropriacoes(userId, tituloId) {
          const rows = await drizzleTx.select().from(financeiroApropriacoes)
            .where(and(eq(financeiroApropriacoes.userId, userId), eq(financeiroApropriacoes.tituloId, tituloId)));
          return rows.map(mapApr);
        },
        async deleteApropriacoes(userId, tituloId) {
          await drizzleTx.delete(financeiroApropriacoes)
            .where(and(eq(financeiroApropriacoes.userId, userId), eq(financeiroApropriacoes.tituloId, tituloId)));
        },
        async insertApropriacao(row) {
          const result = await drizzleTx.insert(financeiroApropriacoes).values({
            userId: row.userId,
            tituloId: row.tituloId,
            fazendaId: row.fazendaId,
            categoriaId: row.categoriaId,
            centroCustoId: row.centroCustoId,
            valor: row.valor,
            origemDetalheTipo: row.origemDetalheTipo,
            origemDetalheId: row.origemDetalheId,
            observacoes: row.observacoes,
          });
          return insertIdOf(result);
        },
        async findCategoria(userId, id) {
          const [row] = await drizzleTx.select().from(financeiroCategorias)
            .where(and(eq(financeiroCategorias.id, id), eq(financeiroCategorias.userId, userId))).limit(1);
          return row ? mapCat(row) : null;
        },
        async findCategoriaPorChave(userId, chave) {
          const [row] = await drizzleTx.select().from(financeiroCategorias)
            .where(and(eq(financeiroCategorias.userId, userId), eq(financeiroCategorias.chaveSistema, chave))).limit(1);
          return row ? mapCat(row) : null;
        },
        async insertCategoria(row) {
          const result = await drizzleTx.insert(financeiroCategorias).values({
            userId: row.userId,
            nome: row.nome,
            tipo: row.tipo,
            categoriaPaiId: row.categoriaPaiId,
            chaveSistema: row.chaveSistema,
            ativa: row.ativa,
          });
          return insertIdOf(result);
        },
        async updateCategoria(userId, id, patch) {
          await drizzleTx.update(financeiroCategorias).set(patch)
            .where(and(eq(financeiroCategorias.id, id), eq(financeiroCategorias.userId, userId)));
        },
        async listCategorias(userId) {
          const rows = await drizzleTx.select().from(financeiroCategorias)
            .where(eq(financeiroCategorias.userId, userId));
          return rows.map(mapCat);
        },
        async findCentro(userId, id) {
          const [row] = await drizzleTx.select().from(financeiroCentrosCusto)
            .where(and(eq(financeiroCentrosCusto.id, id), eq(financeiroCentrosCusto.userId, userId))).limit(1);
          return row ? mapCentro(row) : null;
        },
        async insertCentro(row) {
          const result = await drizzleTx.insert(financeiroCentrosCusto).values({
            userId: row.userId,
            nome: row.nome,
            fazendaId: row.fazendaId,
            ativo: row.ativo,
          });
          return insertIdOf(result);
        },
        async updateCentro(userId, id, patch) {
          await drizzleTx.update(financeiroCentrosCusto).set(patch)
            .where(and(eq(financeiroCentrosCusto.id, id), eq(financeiroCentrosCusto.userId, userId)));
        },
        async listCentros(userId) {
          const rows = await drizzleTx.select().from(financeiroCentrosCusto)
            .where(eq(financeiroCentrosCusto.userId, userId));
          return rows.map(mapCentro);
        },
  };
  return tx;
}

export function createFinanceiroNucleoMysqlStore(drizzleDb: { transaction: typeof db.transaction }): FinanceiroNucleoStore {
  return {
    transaction(fn) {
      return drizzleDb.transaction(async drizzleTx => fn(createFinanceiroNucleoTxFromDrizzle(drizzleTx)));
    },
  };
}

export const financeiroNucleoMysqlStore = createFinanceiroNucleoMysqlStore(db);

function mapTitulo(row: typeof financeiroTitulos.$inferSelect): FinTituloRow {
  return {
    id: row.id,
    userId: row.userId,
    tipo: row.tipo as FinanceiroTituloTipo,
    estado: row.estado as "ativo" | "cancelado",
    condicaoStatus: row.condicaoStatus as FinanceiroCondicaoStatus,
    pessoaId: row.pessoaId,
    contraparteNomeSnapshot: row.contraparteNomeSnapshot,
    fazendaOrigemId: row.fazendaOrigemId,
    origemTipo: row.origemTipo,
    origemId: row.origemId,
    origemItemChave: row.origemItemChave,
    descricao: row.descricao,
    dataCompetencia: String(row.dataCompetencia),
    valorOriginal: String(row.valorOriginal),
    documentoReferencia: row.documentoReferencia,
    observacoes: row.observacoes,
  };
}

function mapParcela(row: typeof financeiroParcelas.$inferSelect): FinParcelaRow {
  return {
    id: row.id,
    userId: row.userId,
    tituloId: row.tituloId,
    numero: row.numero,
    vencimento: String(row.vencimento),
    valorOriginal: String(row.valorOriginal),
  };
}

function mapLiq(row: typeof financeiroLiquidacoes.$inferSelect): FinLiquidacaoRow {
  return {
    id: row.id,
    userId: row.userId,
    tipo: row.tipo as FinanceiroLiquidacaoTipo,
    contaId: row.contaId,
    dataLiquidacao: String(row.dataLiquidacao),
    valorMovimentado: String(row.valorMovimentado),
    formaPagamento: row.formaPagamento,
    referencia: row.referencia,
    observacoes: row.observacoes,
    liquidacaoOriginalId: row.liquidacaoOriginalId,
    idempotencyKey: row.idempotencyKey,
  };
}

function mapAloc(row: typeof financeiroLiquidacaoAlocacoes.$inferSelect): FinAlocacaoRow {
  return {
    id: row.id,
    userId: row.userId,
    liquidacaoId: row.liquidacaoId,
    parcelaId: row.parcelaId,
    principalLiquidado: String(row.principalLiquidado),
    desconto: String(row.desconto),
    juros: String(row.juros),
    multa: String(row.multa),
  };
}

function mapMov(row: typeof financeiroMovimentos.$inferSelect): FinMovimentoRow {
  return {
    id: row.id,
    userId: row.userId,
    contaId: row.contaId,
    dataMovimento: String(row.dataMovimento),
    direcao: row.direcao as FinanceiroDirecao,
    natureza: row.natureza as FinanceiroNatureza,
    valor: String(row.valor),
    liquidacaoId: row.liquidacaoId,
    transferenciaId: row.transferenciaId,
    contrapartePessoaId: row.contrapartePessoaId,
    descricao: row.descricao,
    referencia: row.referencia,
    movimentoOriginalId: row.movimentoOriginalId,
  };
}

function mapTransf(row: typeof financeiroTransferencias.$inferSelect): FinTransferenciaRow {
  return {
    id: row.id,
    userId: row.userId,
    contaOrigemId: row.contaOrigemId,
    contaDestinoId: row.contaDestinoId,
    dataTransferencia: String(row.dataTransferencia),
    valor: String(row.valor),
    descricao: row.descricao,
    referencia: row.referencia,
    observacoes: row.observacoes,
    estado: row.estado as FinanceiroTransferenciaEstado,
    transferenciaOriginalId: row.transferenciaOriginalId,
    idempotencyKey: row.idempotencyKey,
  };
}

function mapApr(row: typeof financeiroApropriacoes.$inferSelect): FinApropriacaoRow {
  return {
    id: row.id,
    userId: row.userId,
    tituloId: row.tituloId,
    fazendaId: row.fazendaId,
    categoriaId: row.categoriaId,
    centroCustoId: row.centroCustoId,
    valor: String(row.valor),
    origemDetalheTipo: row.origemDetalheTipo,
    origemDetalheId: row.origemDetalheId,
    observacoes: row.observacoes,
  };
}

function mapCat(row: typeof financeiroCategorias.$inferSelect): FinCategoriaRow {
  return {
    id: row.id,
    userId: row.userId,
    nome: row.nome,
    tipo: row.tipo,
    categoriaPaiId: row.categoriaPaiId,
    chaveSistema: row.chaveSistema,
    ativa: Boolean(row.ativa),
  };
}

function mapCentro(row: typeof financeiroCentrosCusto.$inferSelect): FinCentroRow {
  return {
    id: row.id,
    userId: row.userId,
    nome: row.nome,
    fazendaId: row.fazendaId,
    ativo: Boolean(row.ativo),
  };
}

export const financeiroNucleoService = createFinanceiroNucleoService(financeiroNucleoMysqlStore);
