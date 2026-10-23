import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  COMPRA_INSUMOS_CHAVE_FRETE,
  COMPRA_INSUMOS_CHAVE_MERCADORIAS,
  COMPRA_INSUMOS_CHAVE_PRINCIPAL,
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  MSG_COMPRA_ESTORNO_COM_PAGAMENTO,
  MSG_COMPRA_FORNECEDOR_OBRIGATORIO,
  MSG_COMPRA_FRETE_CREDOR,
} from "../shared/compraInsumos";
import {
  createCompraInsumosService,
  type CompraInsumosStore,
  type CompraInsumosTx,
  type EstoqueOperacaoRow,
} from "./compraInsumos";
import type { FinApropriacaoRow, FinParcelaRow, FinTituloRow, FinanceiroNucleoTx } from "./financeiroNucleo";
import { persistirValor } from "../shared/financeiroNucleo";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(opts?: { falharNoItem?: number; falharFinanceiro?: boolean; falharEstoque?: boolean }) {
  const state = {
    pessoas: [
      { id: 1, userId: 10, nome: "Premix", ativo: true, tipo: "fornecedor" },
      { id: 2, userId: 10, nome: "Transportes X", ativo: true, tipo: "fornecedor" },
      { id: 3, userId: 99, nome: "Outro user", ativo: true, tipo: "fornecedor" },
    ],
    fazendas: [{ id: 7, userId: 10 }],
    estoques: [
      { id: 11, fazendaId: 7, quantidade: "100", controlarSaldo: true, valorUnitario: "10", nome: "Sal" },
      { id: 12, fazendaId: 7, quantidade: "0", controlarSaldo: false, valorUnitario: null, nome: "Uso imediato" },
      { id: 13, fazendaId: 7, quantidade: "50", controlarSaldo: true, valorUnitario: "5", nome: "Diesel" },
    ],
    operacoes: [] as EstoqueOperacaoRow[],
    movs: [] as Array<{
      id: number;
      operacaoId: number | null;
      estoqueId: number;
      quantidade: string;
      valor: string | null;
      frete: string | null;
      status: string;
      grupoId?: string | null;
      userId: number;
    }>,
    titulos: [] as FinTituloRow[],
    apropriacoes: [] as FinApropriacaoRow[],
    parcelas: [] as FinParcelaRow[],
    alocacoes: [] as Array<{ id: number; userId: number; liquidacaoId: number; parcelaId: number; principalLiquidado: string; desconto: string; juros: string; multa: string }>,
    next: 1,
    insertsMov: 0,
  };
  const id = () => state.next++;

  const makeTx = (): CompraInsumosTx => {
    const fin = {
      async findPessoa(userId: number, pessoaId: number) {
        return state.pessoas.find(p => p.id === pessoaId && p.userId === userId) ?? null;
      },
      async findFazenda(userId: number, fazendaId: number) {
        return state.fazendas.find(f => f.id === fazendaId && f.userId === userId) ?? null;
      },
      async findTitulo(userId: number, tituloId: number) {
        return state.titulos.find(t => t.id === tituloId && t.userId === userId) ?? null;
      },
      async findTituloPorOrigem(userId: number, origemTipo: string, origemId: number, chave: string) {
        return state.titulos.find(t =>
          t.userId === userId && t.origemTipo === origemTipo && t.origemId === origemId && t.origemItemChave === chave,
        ) ?? null;
      },
      async listTitulosPorOrigem(userId: number, origemTipo: string, origemId: number) {
        return state.titulos.filter(t => t.userId === userId && t.origemTipo === origemTipo && t.origemId === origemId);
      },
      async insertTitulo(row: FinTituloRow) {
        if (opts?.falharFinanceiro) throw new Error("falha financeira forçada");
        const created = { ...row, id: id() };
        state.titulos.push(created);
        return created.id;
      },
      async lockTitulos(userId: number, ids: number[]) {
        return state.titulos
          .filter(t => t.userId === userId && ids.includes(t.id))
          .sort((a, b) => a.id - b.id);
      },
      async lockParcelas(userId: number, ids: number[]) {
        return state.parcelas
          .filter(p => p.userId === userId && ids.includes(p.id))
          .sort((a, b) => a.id - b.id);
      },
      async cancelarTitulo(userId: number, tituloId: number) {
        const t = state.titulos.find(x => x.id === tituloId && x.userId === userId);
        if (t) t.estado = "cancelado";
      },
      async listParcelasTitulo(userId: number, tituloId: number) {
        return state.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
      },
      async listAlocacoesPorParcelas(userId: number, parcelaIds: number[]) {
        return state.alocacoes
          .filter(a => a.userId === userId && parcelaIds.includes(a.parcelaId))
          .map(a => ({ ...a, tipoLiquidacao: "pagamento" as const }));
      },
      async insertApropriacao(row: FinApropriacaoRow) {
        const created = { ...row, id: id() };
        state.apropriacoes.push(created);
        return created.id;
      },
      async deleteApropriacoes(userId: number, tituloId: number) {
        state.apropriacoes = state.apropriacoes.filter(a => !(a.userId === userId && a.tituloId === tituloId));
      },
      async listApropriacoes(userId: number, tituloId: number) {
        return state.apropriacoes.filter(a => a.userId === userId && a.tituloId === tituloId);
      },
    } as unknown as FinanceiroNucleoTx;

    return {
      fin,
      async findFazenda(userId, fazendaId) {
        return state.fazendas.find(f => f.id === fazendaId && f.userId === userId) ?? null;
      },
      async findPessoa(userId, pessoaId) {
        return state.pessoas.find(p => p.id === pessoaId && p.userId === userId) ?? null;
      },
      async findEstoque(estoqueId) {
        return state.estoques.find(e => e.id === estoqueId) ?? null;
      },
      async findOperacaoPorIdempotency(userId, key) {
        return state.operacoes.find(o => o.userId === userId && o.idempotencyKey === key) ?? null;
      },
      async findOperacao(userId, operacaoId) {
        return state.operacoes.find(o => o.userId === userId && o.id === operacaoId) ?? null;
      },
      async lockOperacao(userId, operacaoId) {
        return this.findOperacao(userId, operacaoId);
      },
      async insertOperacao(row) {
        if (state.operacoes.some(o => o.userId === row.userId && o.idempotencyKey === row.idempotencyKey)) {
          const err = new Error("Duplicate");
          (err as { errno?: number }).errno = 1062;
          throw err;
        }
        const created: EstoqueOperacaoRow = {
          ...row,
          id: id(),
          estornadaEm: null,
          motivoEstorno: null,
        };
        state.operacoes.push(created);
        return created.id;
      },
      async updateOperacaoEstornada(userId, operacaoId, motivo, em) {
        const o = state.operacoes.find(x => x.id === operacaoId && x.userId === userId);
        if (o) {
          o.status = "estornada";
          o.motivoEstorno = motivo;
          o.estornadaEm = em;
        }
      },
      async listMovimentacoesOperacao(operacaoId) {
        return state.movs.filter(m => m.operacaoId === operacaoId);
      },
      async insertMovimentacao(values) {
        state.insertsMov += 1;
        if (opts?.falharNoItem && state.insertsMov === opts.falharNoItem) {
          throw new Error("falha no segundo item");
        }
        const created = {
          id: id(),
          operacaoId: values.operacaoId ?? null,
          estoqueId: values.estoqueId,
          quantidade: values.quantidade,
          valor: values.valor ?? null,
          frete: values.frete ?? null,
          status: values.status,
          grupoId: values.grupoId,
          userId: values.userId,
        };
        state.movs.push(created);
        return created.id;
      },
      async updateEstoque(estoqueId, patch) {
        if (opts?.falharEstoque) throw new Error("falha no estoque");
        const item = state.estoques.find(e => e.id === estoqueId);
        if (item) {
          item.quantidade = patch.quantidade;
          if (patch.valorUnitario) item.valorUnitario = patch.valorUnitario;
        }
      },
      async updateMovimentacaoEstornada(movId, _motivo) {
        const m = state.movs.find(x => x.id === movId);
        if (m) m.status = "estornada";
      },
    };
  };

  const store: CompraInsumosStore & { state: typeof state } = {
    state,
    async transaction(fn) {
      const snap = clone(state);
      try {
        return await fn(makeTx());
      } catch (error) {
        state.operacoes = snap.operacoes;
        state.movs = snap.movs;
        state.titulos = snap.titulos;
        state.apropriacoes = snap.apropriacoes;
        state.parcelas = snap.parcelas;
        state.alocacoes = snap.alocacoes;
        state.estoques = snap.estoques;
        state.next = snap.next;
        state.insertsMov = snap.insertsMov;
        throw error;
      }
    },
  };
  return store;
}

const baseInput = {
  idempotencyKey: "compra-teste-aaaa",
  fazendaId: 7,
  dataOperacao: "2026-10-09",
  fornecedorId: 1,
  valorFrete: 0,
  itens: [{ estoqueId: 11, quantidade: "10", valorMercadoria: 10000 }],
};

describe("confirmarCompraInsumos", () => {
  it("CASO A — um título 10.000, apropriação, a_definir, zero parcela/movimento", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    const r = await svc.confirmarCompraInsumos(10, "Pedro", baseInput);
    expect(r.tituloIds).toHaveLength(1);
    expect(store.state.titulos[0]?.valorOriginal).toBe(persistirValor(10000));
    expect(store.state.titulos[0]?.condicaoStatus).toBe("a_definir");
    expect(store.state.titulos[0]?.origemTipo).toBe(FINANCEIRO_ORIGEM_COMPRA_INSUMOS);
    expect(store.state.titulos[0]?.origemItemChave).toBe(COMPRA_INSUMOS_CHAVE_PRINCIPAL);
    expect(store.state.apropriacoes[0]?.valor).toBe(persistirValor(10000));
    expect(store.state.apropriacoes[0]?.categoriaId).toBeNull();
    expect(store.state.parcelas).toHaveLength(0);
  });

  it("CASO B / Y — frete mesmo credor = 1 título 11.000", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await svc.confirmarCompraInsumos(10, "Pedro", {
      ...baseInput,
      valorFrete: 1000,
      freteCredorId: 1,
    });
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.titulos[0]?.valorOriginal).toBe(persistirValor(11000));
  });

  it("CASO C / Z — frete outro credor = 2 títulos mesma origem", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    const r = await svc.confirmarCompraInsumos(10, "Pedro", {
      ...baseInput,
      valorFrete: 1000,
      freteCredorId: 2,
    });
    expect(store.state.titulos).toHaveLength(2);
    expect(store.state.titulos.map(t => t.origemItemChave).sort()).toEqual([
      COMPRA_INSUMOS_CHAVE_FRETE,
      COMPRA_INSUMOS_CHAVE_MERCADORIAS,
    ]);
    expect(new Set(store.state.titulos.map(t => t.origemId))).toEqual(new Set([r.operacaoId]));
  });

  it("CASO D / AD — retry da mesma chave não duplica", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    const a = await svc.confirmarCompraInsumos(10, "Pedro", baseInput);
    const b = await svc.confirmarCompraInsumos(10, "Pedro", baseInput);
    expect(b.idempotente).toBe(true);
    expect(b.operacaoId).toBe(a.operacaoId);
    expect(store.state.operacoes).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.apropriacoes).toHaveLength(1);
  });

  it("CASO E — estocável + uso imediato = financeiro 10.000; saldo só no estocável", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await svc.confirmarCompraInsumos(10, "Pedro", {
      ...baseInput,
      itens: [
        { estoqueId: 11, quantidade: "8", valorMercadoria: 8000 },
        { estoqueId: 12, quantidade: "2", valorMercadoria: 2000 },
      ],
    });
    expect(store.state.titulos[0]?.valorOriginal).toBe(persistirValor(10000));
    expect(store.state.estoques.find(e => e.id === 11)?.quantidade).toBe("108.00");
    expect(store.state.estoques.find(e => e.id === 12)?.quantidade).toBe("0.00");
  });

  it("CASO G — sem fornecedor_id falha antes do commit", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", { ...baseInput, fornecedorId: 0 }))
      .rejects.toMatchObject({ message: MSG_COMPRA_FORNECEDOR_OBRIGATORIO });
    expect(store.state.operacoes).toHaveLength(0);
  });

  it("CASO H — frete sem credor não confirma", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", { ...baseInput, valorFrete: 1000 }))
      .rejects.toMatchObject({ message: MSG_COMPRA_FRETE_CREDOR });
    expect(store.state.operacoes).toHaveLength(0);
  });

  it("CASO I — fornecedor de outro usuário é rejeitado", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", { ...baseInput, fornecedorId: 3 }))
      .rejects.toBeInstanceOf(TRPCError);
    expect(store.state.operacoes).toHaveLength(0);
  });

  it("CASO J — credor do frete de outro usuário é rejeitado", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", {
      ...baseInput,
      valorFrete: 100,
      freteCredorId: 3,
    })).rejects.toBeInstanceOf(TRPCError);
    expect(store.state.operacoes).toHaveLength(0);
  });

  it("CASO K — falha no financeiro faz rollback da compra", async () => {
    const store = criarStore({ falharFinanceiro: true });
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", baseInput)).rejects.toThrow(/falha financeira/);
    expect(store.state.operacoes).toHaveLength(0);
    expect(store.state.movs).toHaveLength(0);
    expect(store.state.titulos).toHaveLength(0);
    expect(store.state.estoques.find(e => e.id === 11)?.quantidade).toBe("100");
  });

  it("CASO L — falha no estoque não deixa título", async () => {
    const store = criarStore({ falharEstoque: true });
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", baseInput)).rejects.toThrow(/falha no estoque/);
    expect(store.state.titulos).toHaveLength(0);
    expect(store.state.operacoes).toHaveLength(0);
  });

  it("CASO S / AA–AC — 3 itens, 1 operação, totais fecham", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    const r = await svc.confirmarCompraInsumos(10, "Pedro", {
      ...baseInput,
      valorFrete: 300,
      freteCredorId: 1,
      itens: [
        { estoqueId: 11, quantidade: "1", valorMercadoria: 4000 },
        { estoqueId: 12, quantidade: "1", valorMercadoria: 3000 },
        { estoqueId: 13, quantidade: "1", valorMercadoria: 3000 },
      ],
    });
    expect(store.state.operacoes).toHaveLength(1);
    expect(store.state.movs.filter(m => m.operacaoId === r.operacaoId && m.status === "ativa")).toHaveLength(3);
    const op = store.state.operacoes[0]!;
    const somaValor = store.state.movs.reduce((s, m) => s + Number(m.valor ?? 0), 0);
    const somaFrete = store.state.movs.reduce((s, m) => s + Number(m.frete ?? 0), 0);
    expect(somaValor).toBe(Number(op.valorTotal));
    expect(somaFrete).toBe(Number(op.valorFrete));
    expect(somaValor - somaFrete).toBe(Number(op.valorMercadorias));
  });

  it("CASO T — falha no segundo item zera tudo", async () => {
    const store = criarStore({ falharNoItem: 2 });
    const svc = createCompraInsumosService(store);
    await expect(svc.confirmarCompraInsumos(10, "Pedro", {
      ...baseInput,
      itens: [
        { estoqueId: 11, quantidade: "1", valorMercadoria: 4000 },
        { estoqueId: 12, quantidade: "1", valorMercadoria: 3000 },
      ],
    })).rejects.toThrow(/segundo item/);
    expect(store.state.operacoes).toHaveLength(0);
    expect(store.state.movs).toHaveLength(0);
    expect(store.state.titulos).toHaveLength(0);
    expect(store.state.apropriacoes).toHaveLength(0);
    expect(store.state.estoques.find(e => e.id === 11)?.quantidade).toBe("100");
  });

  it("CASO M / W — estorno sem liquidação cancela títulos e reverte estoque", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    const r = await svc.confirmarCompraInsumos(10, "Pedro", baseInput);
    expect(store.state.estoques.find(e => e.id === 11)?.quantidade).toBe("110.00");
    await svc.estornarOperacao(10, r.operacaoId, "Digitação", "Pedro");
    expect(store.state.titulos.every(t => t.estado === "cancelado")).toBe(true);
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.operacoes[0]?.status).toBe("estornada");
    expect(store.state.estoques.find(e => e.id === 11)?.quantidade).toBe("100.00");
    expect(store.state.movs.some(m => m.status === "estorno")).toBe(true);
  });

  it("CASO N — estorno com liquidação efetiva é bloqueado", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    const r = await svc.confirmarCompraInsumos(10, "Pedro", baseInput);
    const titulo = store.state.titulos[0]!;
    const parcelaId = 900;
    store.state.parcelas.push({
      id: parcelaId,
      userId: 10,
      tituloId: titulo.id,
      numero: 1,
      vencimento: "2026-11-01",
      valorOriginal: titulo.valorOriginal,
    });
    store.state.alocacoes.push({
      id: 901,
      userId: 10,
      liquidacaoId: 1,
      parcelaId,
      principalLiquidado: titulo.valorOriginal,
      desconto: "0",
      juros: "0",
      multa: "0",
    });
    await expect(svc.estornarOperacao(10, r.operacaoId, "Erro", "Pedro"))
      .rejects.toMatchObject({ message: MSG_COMPRA_ESTORNO_COM_PAGAMENTO });
    expect(store.state.titulos[0]?.estado).toBe("ativo");
    expect(store.state.estoques.find(e => e.id === 11)?.quantidade).toBe("110.00");
    expect(store.state.operacoes[0]?.status).toBe("confirmada");
  });

  it("CASO O/P/Q — serviço só cria origem compra_insumos (outros tipos não passam por aqui)", async () => {
    const store = criarStore();
    const svc = createCompraInsumosService(store);
    await svc.confirmarCompraInsumos(10, "Pedro", baseInput);
    expect(store.state.operacoes[0]?.motivo).toBe("Compra");
    expect(store.state.operacoes[0]?.tipo).toBe("Entrada");
    expect(store.state.titulos.every(t => t.origemTipo === FINANCEIRO_ORIGEM_COMPRA_INSUMOS)).toBe(true);
  });
});
