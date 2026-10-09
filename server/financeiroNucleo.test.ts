import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  createFinanceiroNucleoService,
  type FinAlocacaoRow,
  type FinApropriacaoRow,
  type FinCategoriaRow,
  type FinCentroRow,
  type FinContaRow,
  type FinLiquidacaoRow,
  type FinMovimentoRow,
  type FinParcelaRow,
  type FinTituloRow,
  type FinTransferenciaRow,
  type FinanceiroNucleoStore,
  type FinanceiroNucleoTx,
} from "./financeiroNucleo";
import {
  MSG_FIN_CATEGORIA_TIPO,
  MSG_FIN_CENTRO_FAZENDA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_ORIGEM_AUTOMATICA,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_PESSOAS_MISTURADAS,
} from "../shared/financeiroNucleo";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(): FinanceiroNucleoStore & {
  contas: FinContaRow[];
  titulos: FinTituloRow[];
  parcelas: FinParcelaRow[];
  liquidacoes: FinLiquidacaoRow[];
  alocacoes: FinAlocacaoRow[];
  movimentos: FinMovimentoRow[];
  transferencias: FinTransferenciaRow[];
  apropriacoes: FinApropriacaoRow[];
  categorias: FinCategoriaRow[];
  centros: FinCentroRow[];
} {
  const state = {
    pessoas: [
      { id: 1, userId: 10, nome: "Fornecedor A", ativo: true, tipo: "fornecedor" },
      { id: 2, userId: 10, nome: "Fornecedor B", ativo: true, tipo: "fornecedor" },
      { id: 3, userId: 99, nome: "Outro usuário", ativo: true, tipo: "fornecedor" },
    ],
    fazendas: [
      { id: 1, userId: 10 },
      { id: 2, userId: 10 },
    ],
    contas: [] as FinContaRow[],
    titulos: [] as FinTituloRow[],
    parcelas: [] as FinParcelaRow[],
    liquidacoes: [] as FinLiquidacaoRow[],
    alocacoes: [] as FinAlocacaoRow[],
    movimentos: [] as FinMovimentoRow[],
    transferencias: [] as FinTransferenciaRow[],
    apropriacoes: [] as FinApropriacaoRow[],
    categorias: [] as FinCategoriaRow[],
    centros: [] as FinCentroRow[],
    next: 1,
  };

  const id = () => state.next++;

  const makeTx = (): FinanceiroNucleoTx => ({
    async findConta(userId, contaId) {
      return state.contas.find(c => c.id === contaId && c.userId === userId) ?? null;
    },
    async lockContas(userId, ids) {
      return state.contas.filter(c => c.userId === userId && ids.includes(c.id));
    },
    async lockTitulos(userId, ids) {
      return state.titulos.filter(t => t.userId === userId && ids.includes(t.id));
    },
    async lockParcelas(userId, ids) {
      return state.parcelas.filter(p => p.userId === userId && ids.includes(p.id));
    },
    async lockLiquidacao(userId, liquidacaoId) {
      return state.liquidacoes.find(l => l.id === liquidacaoId && l.userId === userId) ?? null;
    },
    async lockTransferencia(userId, transfId) {
      return state.transferencias.find(t => t.id === transfId && t.userId === userId) ?? null;
    },
    async insertConta(row) {
      const created: FinContaRow = { ...row, id: id(), inativadaEm: null, motivoInativacao: null };
      state.contas.push(created);
      return created.id;
    },
    async updateContaInativa(userId, contaId, motivo, em) {
      const c = state.contas.find(x => x.id === contaId && x.userId === userId);
      if (c) {
        c.ativa = false;
        c.motivoInativacao = motivo;
        c.inativadaEm = em;
      }
    },
    async listContas(userId) {
      return state.contas.filter(c => c.userId === userId);
    },
    async countMovimentosConta(userId, contaId) {
      return state.movimentos.filter(m => m.userId === userId && m.contaId === contaId).length;
    },
    async listMovimentosConta(userId, contaId) {
      return state.movimentos.filter(m => m.userId === userId && m.contaId === contaId);
    },
    async findPessoa(userId, pessoaId) {
      return state.pessoas.find(p => p.id === pessoaId && p.userId === userId) ?? null;
    },
    async findFazenda(userId, fazendaId) {
      return state.fazendas.find(f => f.id === fazendaId && f.userId === userId) ?? null;
    },
    async findTitulo(userId, tituloId) {
      return state.titulos.find(t => t.id === tituloId && t.userId === userId) ?? null;
    },
    async findTituloPorOrigem(userId, origemTipo, origemId, origemItemChave) {
      return state.titulos.find(t =>
        t.userId === userId
        && t.origemTipo === origemTipo
        && t.origemId === origemId
        && t.origemItemChave === origemItemChave,
      ) ?? null;
    },
    async listTitulosPorOrigem(userId, origemTipo, origemId) {
      return state.titulos.filter(t =>
        t.userId === userId && t.origemTipo === origemTipo && t.origemId === origemId,
      );
    },
    async insertTitulo(row) {
      const created = { ...row, id: id() };
      state.titulos.push(created);
      return created.id;
    },
    async updateTituloCondicao(userId, tituloId, condicao) {
      const t = state.titulos.find(x => x.id === tituloId && x.userId === userId);
      if (t) t.condicaoStatus = condicao;
    },
    async cancelarTitulo(userId, tituloId, _motivo, _em) {
      const t = state.titulos.find(x => x.id === tituloId && x.userId === userId);
      if (t) t.estado = "cancelado";
    },
    async listTitulos(userId) {
      return state.titulos.filter(t => t.userId === userId);
    },
    async listParcelasTitulo(userId, tituloId) {
      return state.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
    },
    async listParcelasPorIds(userId, ids) {
      return state.parcelas.filter(p => p.userId === userId && ids.includes(p.id));
    },
    async insertParcela(row) {
      const created = { ...row, id: id() };
      state.parcelas.push(created);
      return created.id;
    },
    async deleteParcelasTitulo(userId, tituloId) {
      state.parcelas = state.parcelas.filter(p => !(p.userId === userId && p.tituloId === tituloId));
    },
    async findLiquidacao(userId, liquidacaoId) {
      return state.liquidacoes.find(l => l.id === liquidacaoId && l.userId === userId) ?? null;
    },
    async findLiquidacaoPorIdem(userId, key) {
      return state.liquidacoes.find(l => l.userId === userId && l.idempotencyKey === key) ?? null;
    },
    async findEstornoDe(userId, originalId) {
      return state.liquidacoes.find(l => l.userId === userId && l.liquidacaoOriginalId === originalId) ?? null;
    },
    async insertLiquidacao(row) {
      const created = { ...row, id: id() };
      state.liquidacoes.push(created);
      return created.id;
    },
    async insertAlocacao(row) {
      const created = { ...row, id: id() };
      state.alocacoes.push(created);
      return created.id;
    },
    async listAlocacoesPorParcelas(userId, parcelaIds) {
      return state.alocacoes
        .filter(a => a.userId === userId && parcelaIds.includes(a.parcelaId))
        .map(a => {
          const liq = state.liquidacoes.find(l => l.id === a.liquidacaoId)!;
          return { ...a, tipoLiquidacao: liq.tipo };
        });
    },
    async listAlocacoesLiquidacao(userId, liquidacaoId) {
      return state.alocacoes.filter(a => a.userId === userId && a.liquidacaoId === liquidacaoId);
    },
    async insertMovimento(row) {
      const created = { ...row, id: id() };
      state.movimentos.push(created);
      return created.id;
    },
    async findMovimentoPorLiquidacao(userId, liquidacaoId) {
      return state.movimentos.find(m => m.userId === userId && m.liquidacaoId === liquidacaoId) ?? null;
    },
    async listMovimentosPorTransferencia(userId, transferenciaId) {
      return state.movimentos.filter(m => m.userId === userId && m.transferenciaId === transferenciaId);
    },
    async listMovimentosFiltro(userId, contaId, de, ate) {
      return state.movimentos.filter(m => {
        if (m.userId !== userId || m.contaId !== contaId) return false;
        if (de && m.dataMovimento < de) return false;
        if (ate && m.dataMovimento > ate) return false;
        return true;
      });
    },
    async findTransferencia(userId, transfId) {
      return state.transferencias.find(t => t.id === transfId && t.userId === userId) ?? null;
    },
    async findTransferenciaPorIdem(userId, key) {
      return state.transferencias.find(t => t.userId === userId && t.idempotencyKey === key) ?? null;
    },
    async findEstornoTransferencia(userId, originalId) {
      return state.transferencias.find(t => t.userId === userId && t.transferenciaOriginalId === originalId) ?? null;
    },
    async insertTransferencia(row) {
      const created = { ...row, id: id() };
      state.transferencias.push(created);
      return created.id;
    },
    async marcarTransferenciaEstornada(userId, transfId) {
      const t = state.transferencias.find(x => x.id === transfId && x.userId === userId);
      if (t) t.estado = "estornada";
    },
    async listApropriacoes(userId, tituloId) {
      return state.apropriacoes.filter(a => a.userId === userId && a.tituloId === tituloId);
    },
    async deleteApropriacoes(userId, tituloId) {
      state.apropriacoes = state.apropriacoes.filter(a => !(a.userId === userId && a.tituloId === tituloId));
    },
    async insertApropriacao(row) {
      const created = { ...row, id: id() };
      state.apropriacoes.push(created);
      return created.id;
    },
    async findCategoria(userId, catId) {
      return state.categorias.find(c => c.id === catId && c.userId === userId) ?? null;
    },
    async findCategoriaPorChave(userId, chave) {
      return state.categorias.find(c => c.userId === userId && c.chaveSistema === chave) ?? null;
    },
    async insertCategoria(row) {
      const created = { ...row, id: id() };
      state.categorias.push(created);
      return created.id;
    },
    async updateCategoria(userId, catId, patch) {
      const c = state.categorias.find(x => x.id === catId && x.userId === userId);
      if (c) Object.assign(c, patch);
    },
    async listCategorias(userId) {
      return state.categorias.filter(c => c.userId === userId);
    },
    async findCentro(userId, centroId) {
      return state.centros.find(c => c.id === centroId && c.userId === userId) ?? null;
    },
    async insertCentro(row) {
      const created = { ...row, id: id() };
      state.centros.push(created);
      return created.id;
    },
    async updateCentro(userId, centroId, patch) {
      const c = state.centros.find(x => x.id === centroId && x.userId === userId);
      if (c) Object.assign(c, patch);
    },
    async listCentros(userId) {
      return state.centros.filter(c => c.userId === userId);
    },
  });

  return {
    get contas() { return state.contas; },
    get titulos() { return state.titulos; },
    get parcelas() { return state.parcelas; },
    get liquidacoes() { return state.liquidacoes; },
    get alocacoes() { return state.alocacoes; },
    get movimentos() { return state.movimentos; },
    get transferencias() { return state.transferencias; },
    get apropriacoes() { return state.apropriacoes; },
    get categorias() { return state.categorias; },
    get centros() { return state.centros; },
    async transaction(fn) {
      const snap = clone(state);
      try {
        return await fn(makeTx());
      } catch (error) {
        state.contas = snap.contas;
        state.titulos = snap.titulos;
        state.parcelas = snap.parcelas;
        state.liquidacoes = snap.liquidacoes;
        state.alocacoes = snap.alocacoes;
        state.movimentos = snap.movimentos;
        state.transferencias = snap.transferencias;
        state.apropriacoes = snap.apropriacoes;
        state.categorias = snap.categorias;
        state.centros = snap.centros;
        state.next = snap.next;
        throw error;
      }
    },
  };
}

async function cenarioBase() {
  const store = criarStore();
  const svc = createFinanceiroNucleoService(store);
  const conta = await svc.criarContaFinanceira(10, {
    nome: "Caixa",
    tipo: "caixa",
    saldoAbertura: 50000,
    dataSaldoAbertura: "2026-01-01",
  });
  const titulo = await svc.criarTitulo(10, {
    tipo: "pagar",
    pessoaId: 1,
    descricao: "Compra teste",
    dataCompetencia: "2026-02-01",
    valorOriginal: 30000,
    parcelas: [
      { numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 },
      { numero: 2, vencimento: "2026-04-01", valorOriginal: 10000 },
      { numero: 3, vencimento: "2026-05-01", valorOriginal: 10000 },
    ],
  });
  const detalhe = await svc.detalheTitulo(10, titulo.id);
  return { store, svc, contaId: conta.id, tituloId: titulo.id, parcelas: detalhe.parcelas };
}

describe("financeiroNucleo — Fase 1", () => {
  it("CASO A — 3 parcelas de 10.000 fecham 30.000", async () => {
    const { svc, tituloId } = await cenarioBase();
    const ok = await svc.validarIntegridadeTitulo(10, tituloId);
    expect(ok).toEqual({ ok: true });
    const d = await svc.detalheTitulo(10, tituloId);
    expect(d.parcelas).toHaveLength(3);
    expect(d.parcelas.reduce((a, p) => a + Number(p.valorOriginal), 0)).toBe(30000);
  });

  it("CASO B — pagamento parcial 4.000 deixa saldo 6.000", async () => {
    const { svc, contaId, parcelas } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-parcial",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const d = await svc.detalheTitulo(10, parcelas[0]!.tituloId);
    expect(d.parcelas[0]!.saldoPrincipal).toBe(6000);
    expect(d.parcelas[0]!.quitada).toBe(false);
  });

  it("CASO C — principal 10.000 + juros 200 gera saída 10.200", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 10200,
      idempotencyKey: "pag-juros",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, juros: 200 }],
    });
    expect(store.movimentos).toHaveLength(1);
    expect(store.movimentos[0]!.direcao).toBe("saida");
    expect(store.movimentos[0]!.valor).toBe("10200.00");
    expect(store.movimentos[0]!.natureza).toBe("pagamento");
  });

  it("CASO D — desconto 200 quita parcela com saída 9.800", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 9800,
      idempotencyKey: "pag-desc",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, desconto: 200 }],
    });
    const d = await svc.detalheTitulo(10, parcelas[0]!.tituloId);
    expect(d.parcelas[0]!.quitada).toBe(true);
    expect(store.movimentos[0]!.valor).toBe("9800.00");
  });

  it("CASO E — um pagamento quita duas parcelas e gera 1 movimento", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 25000,
      idempotencyKey: "pag-lote",
      alocacoes: [
        { parcelaId: parcelas[0]!.id, principalLiquidado: 10000 },
        { parcelaId: parcelas[1]!.id, principalLiquidado: 10000 },
        { parcelaId: parcelas[2]!.id, principalLiquidado: 5000 },
      ],
    });
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.alocacoes).toHaveLength(3);
    expect(store.movimentos).toHaveLength(1);
    expect(store.movimentos[0]!.valor).toBe("25000.00");
  });

  it("CASO F — mesma idempotency_key não duplica liquidação", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const cmd = {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-retry",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    };
    const a = await svc.criarPagamento(10, cmd);
    const b = await svc.criarPagamento(10, cmd);
    expect(a.id).toBe(b.id);
    expect(b.idempotente).toBe(true);
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.alocacoes).toHaveLength(1);
    expect(store.movimentos).toHaveLength(1);
  });

  it("CASO G — transferência cria exatamente 2 pernas", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const a = await svc.criarContaFinanceira(10, { nome: "A", tipo: "caixa", saldoAbertura: 10000, dataSaldoAbertura: "2026-01-01" });
    const b = await svc.criarContaFinanceira(10, { nome: "B", tipo: "conta_corrente", saldoAbertura: 0, dataSaldoAbertura: "2026-01-01" });
    await svc.criarTransferencia(10, {
      contaOrigemId: a.id,
      contaDestinoId: b.id,
      dataTransferencia: "2026-03-01",
      valor: 5000,
      idempotencyKey: "tr-1",
    });
    expect(store.movimentos).toHaveLength(2);
    expect(store.movimentos.map(m => m.natureza).sort()).toEqual(["transferencia_entrada", "transferencia_saida"]);
    expect(store.movimentos.every(m => m.valor === "5000.00")).toBe(true);
    expect(new Set(store.movimentos.map(m => m.transferenciaId)).size).toBe(1);
  });

  it("CASO H — retry de transferência não duplica", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const a = await svc.criarContaFinanceira(10, { nome: "A", tipo: "caixa", saldoAbertura: 10000, dataSaldoAbertura: "2026-01-01" });
    const b = await svc.criarContaFinanceira(10, { nome: "B", tipo: "caixa", saldoAbertura: 0, dataSaldoAbertura: "2026-01-01" });
    const cmd = {
      contaOrigemId: a.id,
      contaDestinoId: b.id,
      dataTransferencia: "2026-03-01",
      valor: 5000,
      idempotencyKey: "tr-retry",
    };
    await svc.criarTransferencia(10, cmd);
    await svc.criarTransferencia(10, cmd);
    expect(store.transferencias).toHaveLength(1);
    expect(store.movimentos).toHaveLength(2);
  });

  it("CASO I — estorno restaura saldo e cria movimento inverso", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-est",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const movOriginal = store.movimentos[0]!;
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "est-1",
      dataLiquidacao: "2026-03-03",
    });
    expect(store.movimentos).toHaveLength(2);
    expect(store.movimentos.find(m => m.id === movOriginal.id)).toBeTruthy();
    const inverso = store.movimentos.find(m => m.natureza === "estorno_pagamento");
    expect(inverso?.direcao).toBe("entrada");
    expect(inverso?.valor).toBe("4000.00");
    const d = await svc.detalheTitulo(10, parcelas[0]!.tituloId);
    expect(d.parcelas[0]!.saldoPrincipal).toBe(10000);
  });

  it("CASO J — overpayment falha", async () => {
    const { svc, contaId, parcelas } = await cenarioBase();
    await expect(svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 11000,
      idempotencyKey: "pag-over",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 11000 }],
    })).rejects.toMatchObject({ message: MSG_FIN_OVERPAYMENT });
  });

  it("CASO K — misturar pessoas falha", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, { nome: "Caixa", tipo: "caixa", saldoAbertura: 0, dataSaldoAbertura: "2026-01-01" });
    const t1 = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "A", dataCompetencia: "2026-01-01", valorOriginal: 1000,
      parcelas: [{ numero: 1, vencimento: "2026-02-01", valorOriginal: 1000 }],
    });
    const t2 = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 2, descricao: "B", dataCompetencia: "2026-01-01", valorOriginal: 1000,
      parcelas: [{ numero: 1, vencimento: "2026-02-01", valorOriginal: 1000 }],
    });
    const d1 = await svc.detalheTitulo(10, t1.id);
    const d2 = await svc.detalheTitulo(10, t2.id);
    await expect(svc.criarPagamento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-03-01",
      valorMovimentado: 2000,
      idempotencyKey: "mix",
      alocacoes: [
        { parcelaId: d1.parcelas[0]!.id, principalLiquidado: 1000 },
        { parcelaId: d2.parcelas[0]!.id, principalLiquidado: 1000 },
      ],
    })).rejects.toMatchObject({ message: MSG_FIN_PESSOAS_MISTURADAS });
  });

  it("CASO L — cruzar usuário falha", async () => {
    const { svc, contaId, parcelas } = await cenarioBase();
    await expect(svc.obterConta(99, contaId)).rejects.toBeInstanceOf(TRPCError);
    await expect(svc.criarPagamento(99, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 1000,
      idempotencyKey: "xuser",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 1000 }],
    })).rejects.toBeInstanceOf(TRPCError);
    await expect(svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 3,
      descricao: "Pessoa de outro usuário",
      dataCompetencia: "2026-01-01",
      valorOriginal: 50,
    })).rejects.toBeInstanceOf(TRPCError);
  });

  it("CASO M — saldo 50.000 + 10.000 - 7.000 = 53.000", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, {
      nome: "Caixa",
      tipo: "caixa",
      saldoAbertura: 50000,
      dataSaldoAbertura: "2026-01-01",
    });
    const receber = await svc.criarTitulo(10, {
      tipo: "receber",
      pessoaId: 1,
      descricao: "Venda",
      dataCompetencia: "2026-02-01",
      valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-02-10", valorOriginal: 10000 }],
    });
    const pagar = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Despesa",
      dataCompetencia: "2026-02-01",
      valorOriginal: 7000,
      parcelas: [{ numero: 1, vencimento: "2026-02-10", valorOriginal: 7000 }],
    });
    const r = await svc.detalheTitulo(10, receber.id);
    const p = await svc.detalheTitulo(10, pagar.id);
    await svc.criarRecebimento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-02-10",
      valorMovimentado: 10000,
      idempotencyKey: "rec",
      alocacoes: [{ parcelaId: r.parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    await svc.criarPagamento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-02-11",
      valorMovimentado: 7000,
      idempotencyKey: "pag",
      alocacoes: [{ parcelaId: p.parcelas[0]!.id, principalLiquidado: 7000 }],
    });
    expect(await svc.calcularSaldoConta(10, conta.id)).toBe(53000);
  });

  it("CASO N — transferência não é receita nem despesa", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const a = await svc.criarContaFinanceira(10, { nome: "A", tipo: "caixa", saldoAbertura: 8000, dataSaldoAbertura: "2026-01-01" });
    const b = await svc.criarContaFinanceira(10, { nome: "B", tipo: "caixa", saldoAbertura: 0, dataSaldoAbertura: "2026-01-01" });
    await svc.criarTransferencia(10, {
      contaOrigemId: a.id,
      contaDestinoId: b.id,
      dataTransferencia: "2026-03-01",
      valor: 3000,
      idempotencyKey: "tr-n",
    });
    const natures = store.movimentos.map(m => m.natureza);
    expect(natures.every(n => n === "transferencia_saida" || n === "transferencia_entrada")).toBe(true);
    expect(natures).not.toContain("recebimento");
    expect(natures).not.toContain("pagamento");
    expect(await svc.calcularSaldoConta(10, a.id)).toBe(5000);
    expect(await svc.calcularSaldoConta(10, b.id)).toBe(3000);
  });

  it("CASO O — vários títulos manuais não conflitam", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const a = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Manual 1", dataCompetencia: "2026-01-01", valorOriginal: 100,
    });
    const b = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Manual 2", dataCompetencia: "2026-01-02", valorOriginal: 200,
    });
    expect(a.id).not.toBe(b.id);
    expect(store.titulos.every(t => t.origemTipo === "manual" && t.origemId == null)).toBe(true);
  });

  it("origem automática sem chave do item é recusada", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    await expect(svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Compra incompleta",
      dataCompetencia: "2026-01-01",
      valorOriginal: 100,
      origemTipo: "compra_animais",
      origemId: 15,
      origemItemChave: null,
    })).rejects.toMatchObject({ message: MSG_FIN_ORIGEM_AUTOMATICA });
  });

  it("movimento anterior à data de abertura é recusado", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, {
      nome: "Caixa",
      tipo: "caixa",
      saldoAbertura: 50000,
      dataSaldoAbertura: "2026-10-01",
    });
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Antes da abertura",
      dataCompetencia: "2026-09-01",
      valorOriginal: 1000,
      parcelas: [{ numero: 1, vencimento: "2026-09-30", valorOriginal: 1000 }],
    });
    const d = await svc.detalheTitulo(10, titulo.id);
    await expect(svc.criarPagamento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-09-30",
      valorMovimentado: 1000,
      idempotencyKey: "antes",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 1000 }],
    })).rejects.toMatchObject({ message: MSG_FIN_DATA_ANTES_ABERTURA });
    expect(store.movimentos).toHaveLength(0);
    expect(store.liquidacoes).toHaveLength(0);
  });

  it("parcelas 33,33 + 33,33 + 33,34 fecham 100,00", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Centavos",
      dataCompetencia: "2026-01-01",
      valorOriginal: 100,
      parcelas: [
        { numero: 1, vencimento: "2026-02-01", valorOriginal: 33.33 },
        { numero: 2, vencimento: "2026-03-01", valorOriginal: 33.33 },
        { numero: 3, vencimento: "2026-04-01", valorOriginal: 33.34 },
      ],
    });
    expect(await svc.validarIntegridadeTitulo(10, titulo.id)).toEqual({ ok: true });
  });

  it("categoria incompatível com o tipo do título é recusada", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Energia", dataCompetencia: "2026-01-01", valorOriginal: 100,
    });
    const cat = await svc.criarCategoria(10, { nome: "Receita", tipo: "entrada" });
    await expect(svc.apropriar(10, titulo.id, [
      { valor: 100, categoriaId: cat.id },
    ])).rejects.toMatchObject({ message: MSG_FIN_CATEGORIA_TIPO });
  });

  it("centro de custo de outra fazenda é recusado", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Energia", dataCompetencia: "2026-01-01", valorOriginal: 100,
    });
    const centro = await svc.criarCentroCusto(10, { nome: "Sede J", fazendaId: 1 });
    await expect(svc.apropriar(10, titulo.id, [
      { valor: 100, fazendaId: 2, centroCustoId: centro.id },
    ])).rejects.toMatchObject({ message: MSG_FIN_CENTRO_FAZENDA });
  });

  it("origem automática duplicada é bloqueada", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Compra 15",
      dataCompetencia: "2026-01-01",
      valorOriginal: 100,
      origemTipo: "compra_animais",
      origemId: 15,
      origemItemChave: "animais",
    });
    await expect(svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Compra 15 de novo",
      dataCompetencia: "2026-01-01",
      valorOriginal: 100,
      origemTipo: "compra_animais",
      origemId: 15,
      origemItemChave: "animais",
    })).rejects.toBeInstanceOf(TRPCError);
  });
});
