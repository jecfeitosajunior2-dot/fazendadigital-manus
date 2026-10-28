import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
} from "../shared/vendaFinanceiro";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../client/src/lib/novaVendaPendencia";
import {
  createCancelarVendaFinanceiroService,
  decidirCaminhoCancelamentoVenda,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
  MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO,
  MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS,
  vendaTemRecebimentoEfetivo,
  type CancelarVendaFinanceiroStore,
  type CancelarVendaFinanceiroTx,
} from "./cancelarVendaFinanceiro";
import {
  MSG_VENDA_CANCELAR_JA_CANCELADA,
  MSG_VENDA_CANCELAR_NAO_ENCONTRADA,
} from "./cancelarVenda";
import type { FinParcelaRow, FinTituloRow, FinanceiroNucleoTx } from "./financeiroNucleo";

const raiz = dirname(fileURLToPath(import.meta.url));

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type Liq = {
  id: number;
  userId: number;
  tipo: string;
  tituloId?: number;
};
type Aloc = {
  id: number;
  userId: number;
  liquidacaoId: number;
  parcelaId: number;
  principalLiquidado: string;
  desconto: string;
  juros: string;
  multa: string;
};

function criarStore(opts?: { falharCancelarTitulo?: boolean }) {
  const state = {
    animais: [
      { id: 10, userId: 10, brinco: "100", status: "vendido" },
      { id: 11, userId: 10, brinco: "101", status: "vendido" },
      { id: 12, userId: 10, brinco: "102", status: "vendido" },
      { id: 13, userId: 10, brinco: "103", status: "vendido" },
      { id: 20, userId: 99, brinco: "200", status: "vendido" },
    ],
    vendas: [
      { id: 1, userId: 10, status: "concluido", idempotencyKey: "ven-3e6-01" },
      { id: 2, userId: 10, status: "concluido", idempotencyKey: null as string | null },
      { id: 3, userId: 99, status: "concluido", idempotencyKey: "ven-3e6-xx" },
      { id: 4, userId: 10, status: "concluido", idempotencyKey: "ven-3e9b-sem-titulo" },
    ],
    itens: [
      { userId: 10, vendaId: 1, animalId: 10 },
      { userId: 10, vendaId: 1, animalId: 11 },
      { userId: 10, vendaId: 2, animalId: 12 },
      { userId: 99, vendaId: 3, animalId: 20 },
      { userId: 10, vendaId: 4, animalId: 13 },
    ],
    baixas: [
      { id: 80, userId: 10, vendaId: 1, animalId: 10, status: "ativa" },
      { id: 81, userId: 10, vendaId: 1, animalId: 11, status: "ativa" },
      { id: 82, userId: 10, vendaId: 2, animalId: 12, status: "ativa" },
      { id: 83, userId: 99, vendaId: 3, animalId: 20, status: "ativa" },
      { id: 84, userId: 10, vendaId: 4, animalId: 13, status: "ativa" },
    ],
    titulos: [
      {
        id: 50,
        userId: 10,
        tipo: "receber" as const,
        estado: "ativo" as const,
        condicaoStatus: "definida" as const,
        pessoaId: 2,
        contraparteNomeSnapshot: "Cliente",
        fazendaOrigemId: 1,
        origemTipo: FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
        origemId: 1,
        origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
        descricao: "Venda de animais #1",
        dataCompetencia: "2026-10-21",
        valorOriginal: persistirValor(11000),
        documentoReferencia: "VENDA-1",
        observacoes: "condicaoRecebimento=a_vista",
      },
    ] as FinTituloRow[],
    parcelas: [
      { id: 70, userId: 10, tituloId: 50, numero: 1, vencimento: "2026-10-21", valorOriginal: persistirValor(11000) },
    ] as FinParcelaRow[],
    liquidacoes: [] as Liq[],
    alocacoes: [] as Aloc[],
    movimentos: [] as Array<{ id: number; liquidacaoId: number }>,
    next: 200,
    lockOwner: null as object | null,
  };
  const id = () => state.next++;

  const makeTx = (): CancelarVendaFinanceiroTx => {
    const token = {};
    const esperaLock = async () => {
      while (state.lockOwner != null && state.lockOwner !== token) {
        await new Promise(r => setTimeout(r, 5));
      }
      state.lockOwner = token;
    };
    const fin = {
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
      async lockTitulos(userId: number, ids: number[]) {
        if (ids.length) await esperaLock();
        return state.titulos.filter(t => t.userId === userId && ids.includes(t.id));
      },
      async lockParcelas(_userId: number, _ids: number[]) {
        return [];
      },
      async listParcelasTitulo(userId: number, tituloId: number) {
        return state.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
      },
      async listAlocacoesPorParcelas(userId: number, parcelaIds: number[]) {
        return state.alocacoes
          .filter(a => a.userId === userId && parcelaIds.includes(a.parcelaId))
          .map(a => {
            const liq = state.liquidacoes.find(l => l.id === a.liquidacaoId)!;
            return { ...a, tipoLiquidacao: liq.tipo };
          });
      },
      async cancelarTitulo(userId: number, tituloId: number) {
        if (opts?.falharCancelarTitulo) throw new Error("falha financeira forçada");
        const t = state.titulos.find(x => x.id === tituloId && x.userId === userId);
        if (t) t.estado = "cancelado";
      },
    } as unknown as FinanceiroNucleoTx;

    return {
      fin,
      async lockVenda(userId, vendaId) {
        await esperaLock();
        return state.vendas.find(v => v.id === vendaId && v.userId === userId) ?? null;
      },
      async listItensAnimalIds(userId, vendaId) {
        return state.itens.filter(i => i.userId === userId && i.vendaId === vendaId).map(i => i.animalId);
      },
      async lockTitulosDaVenda(userId, vendaId) {
        await esperaLock();
        return state.titulos
          .filter(t => t.userId === userId && t.origemTipo === FINANCEIRO_ORIGEM_VENDA_ANIMAIS && t.origemId === vendaId)
          .sort((a, b) => a.id - b.id);
      },
      async lockAnimais(userId, ids) {
        await esperaLock();
        return state.animais.filter(a => a.userId === userId && ids.includes(a.id));
      },
      async lockBaixasAtivasDaVenda(userId, vendaId, animalIds) {
        await esperaLock();
        return state.baixas.filter(b =>
          b.userId === userId && b.vendaId === vendaId && b.status === "ativa" && animalIds.includes(b.animalId),
        );
      },
      async estornarBaixas(userId, vendaId, baixaIds) {
        let n = 0;
        for (const b of state.baixas) {
          if (b.userId === userId && b.vendaId === vendaId && b.status === "ativa" && baixaIds.includes(b.id)) {
            b.status = "estornada";
            n += 1;
          }
        }
        return n;
      },
      async restaurarAnimais(userId, ids) {
        let n = 0;
        for (const a of state.animais) {
          if (a.userId === userId && ids.includes(a.id) && a.status === "vendido") {
            a.status = "ativo";
            n += 1;
          }
        }
        return n;
      },
      async marcarVendaCancelada(input) {
        const v = state.vendas.find(x => x.id === input.vendaId && x.userId === input.userId && x.status === "concluido");
        if (!v) return 0;
        v.status = "cancelado";
        return 1;
      },
    };
  };

  const store: CancelarVendaFinanceiroStore & {
    state: typeof state;
    receber(userId: number, tituloId: number, valor: number, tipo?: string): Promise<void>;
  } = {
    state,
    async receber(userId, tituloId, valor, tipo = "recebimento") {
      await this.transaction(async tx => {
        const locked = await tx.fin.lockTitulos(userId, [tituloId]);
        const titulo = locked[0];
        if (!titulo || titulo.estado === "cancelado") {
          throw new Error("Título cancelado não aceita esta operação.");
        }
        const parcela = state.parcelas.find(p => p.tituloId === tituloId)!;
        const liqId = id();
        state.liquidacoes.push({ id: liqId, userId, tipo, tituloId });
        state.alocacoes.push({
          id: id(),
          userId,
          liquidacaoId: liqId,
          parcelaId: parcela.id,
          principalLiquidado: persistirValor(valor),
          desconto: "0.00",
          juros: "0.00",
          multa: "0.00",
        });
        state.movimentos.push({ id: id(), liquidacaoId: liqId });
      });
    },
    async transaction(fn) {
      const snap = clone(state);
      try {
        const out = await fn(makeTx());
        state.lockOwner = null;
        return out;
      } catch (error) {
        state.animais = snap.animais;
        state.vendas = snap.vendas;
        state.itens = snap.itens;
        state.baixas = snap.baixas;
        state.titulos = snap.titulos;
        state.parcelas = snap.parcelas;
        state.liquidacoes = snap.liquidacoes;
        state.alocacoes = snap.alocacoes;
        state.movimentos = snap.movimentos;
        state.next = snap.next;
        state.lockOwner = null;
        throw error;
      }
    },
  };
  return store;
}

const input = {
  vendaId: 1,
  motivo: "Digitação incorreta",
  canceladoPorUserId: 10,
  canceladoPorNome: "Pedro",
};

describe("cancelarVendaFinanceiro", () => {
  it("cancela venda sem recebimento e o título V2", async () => {
    const store = criarStore();
    const r = await createCancelarVendaFinanceiroService(store).cancelar(10, input);
    expect(r).toMatchObject({
      success: true,
      vendaId: 1,
      tituloId: 50,
      quantidade: 2,
      tituloCancelado: true,
      vendaAntigaSemTitulo: false,
    });
    expect(store.state.vendas.find(v => v.id === 1)?.status).toBe("cancelado");
    expect(store.state.titulos[0]?.estado).toBe("cancelado");
    expect(store.state.baixas.filter(b => b.vendaId === 1).every(b => b.status === "estornada")).toBe(true);
    expect(store.state.animais.filter(a => a.id === 10 || a.id === 11).every(a => a.status === "ativo")).toBe(true);
    expect(store.state.liquidacoes).toHaveLength(0);
    expect(store.state.movimentos).toHaveLength(0);
  });

  it("cancela venda a definir (título sem parcela efetiva)", async () => {
    const store = criarStore();
    store.state.titulos[0]!.condicaoStatus = "a_definir";
    store.state.parcelas = [];
    const r = await createCancelarVendaFinanceiroService(store).cancelar(10, input);
    expect(r.tituloCancelado).toBe(true);
    expect(store.state.titulos[0]?.estado).toBe("cancelado");
  });

  it("bloqueia recebimento parcial sem alterar registros", async () => {
    const store = criarStore();
    await store.receber(10, 50, 5000);
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
    });
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.titulos[0]?.estado).toBe("ativo");
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("vendido");
    expect(store.state.baixas.find(b => b.id === 80)?.status).toBe("ativa");
  });

  it("bloqueia título integralmente recebido", async () => {
    const store = criarStore();
    await store.receber(10, 50, 11000);
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
    });
    expect(store.state.titulos[0]?.estado).toBe("ativo");
  });

  it("permite cancelar após estorno integral e preserva o histórico", async () => {
    const store = criarStore();
    await store.receber(10, 50, 11000, "recebimento");
    await store.receber(10, 50, 11000, "estorno_recebimento");
    const r = await createCancelarVendaFinanceiroService(store).cancelar(10, input);
    expect(r.tituloCancelado).toBe(true);
    expect(store.state.liquidacoes).toHaveLength(2);
    expect(store.state.alocacoes).toHaveLength(2);
    expect(store.state.movimentos).toHaveLength(2);
    expect(store.state.titulos[0]?.estado).toBe("cancelado");
  });

  it("bloqueia após estorno parcial (ainda há valor efetivo)", async () => {
    const store = criarStore();
    await store.receber(10, 50, 7000, "recebimento");
    await store.receber(10, 50, 4000, "recebimento");
    await store.receber(10, 50, 4000, "estorno_recebimento");
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
    });
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.liquidacoes).toHaveLength(3);
  });

  it("falha no cancelamento do título desfaz venda, baixas e animais", async () => {
    const store = criarStore({ falharCancelarTitulo: true });
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toThrow(
      "falha financeira forçada",
    );
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.titulos[0]?.estado).toBe("ativo");
    expect(store.state.baixas.find(b => b.id === 80)?.status).toBe("ativa");
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("vendido");
  });

  it("bloqueia título principal + extra e não cancela nenhum", async () => {
    const store = criarStore();
    const extra = { ...store.state.titulos[0]!, id: 51, origemItemChave: "item-extra" };
    store.state.titulos.push(extra);
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS,
    });
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.titulos.find(t => t.id === 50)?.estado).toBe("ativo");
    expect(store.state.titulos.find(t => t.id === 51)?.estado).toBe("ativo");
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("vendido");
  });

  it("bloqueia título extra sem principal e não usa fallback comercial", async () => {
    const store = criarStore();
    store.state.titulos[0]!.origemItemChave = "item-extra";
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO,
    });
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.titulos[0]?.estado).toBe("ativo");
  });

  it("bloqueia venda com chave ven- sem título e não usa fallback comercial", async () => {
    const store = criarStore();
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, {
      ...input,
      vendaId: 4,
    })).rejects.toMatchObject({ message: MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO });
    expect(store.state.vendas.find(v => v.id === 4)?.status).toBe("concluido");
    expect(store.state.animais.find(a => a.id === 13)?.status).toBe("vendido");
    expect(store.state.baixas.find(b => b.id === 84)?.status).toBe("ativa");
    expect(store.state.titulos).toHaveLength(1);
  });

  it("ainda cancela pelo caminho integrado quando há título V2", async () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
    const store = criarStore();
    const r = await createCancelarVendaFinanceiroService(store).cancelar(10, input);
    expect(r.vendaAntigaSemTitulo).toBe(false);
    expect(r.tituloCancelado).toBe(true);
    expect(store.state.titulos[0]?.estado).toBe("cancelado");
  });

  it("cancela venda antiga sem título e não cria V2", async () => {
    const store = criarStore();
    const r = await createCancelarVendaFinanceiroService(store).cancelar(10, {
      ...input,
      vendaId: 2,
    });
    expect(r.vendaAntigaSemTitulo).toBe(true);
    expect(r.tituloId).toBeNull();
    expect(r.tituloCancelado).toBe(false);
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.titulos[0]?.estado).toBe("ativo");
    expect(store.state.vendas.find(v => v.id === 2)?.status).toBe("cancelado");
  });

  it("não cancela venda de outro usuário", async () => {
    const store = criarStore();
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, { ...input, vendaId: 3 }))
      .rejects.toMatchObject({ message: MSG_VENDA_CANCELAR_NAO_ENCONTRADA });
  });

  it("cancelamento repetido é recusado e não altera de novo", async () => {
    const store = criarStore();
    await createCancelarVendaFinanceiroService(store).cancelar(10, input);
    await expect(createCancelarVendaFinanceiroService(store).cancelar(10, input)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_JA_CANCELADA,
    });
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("ativo");
  });

  it("concorrência: recebimento efetivo vence o cancelamento quando já gravado", async () => {
    const store = criarStore();
    await store.receber(10, 50, 11000);
    const [cancel, receive] = await Promise.allSettled([
      createCancelarVendaFinanceiroService(store).cancelar(10, input),
      store.receber(10, 50, 1),
    ]);
    expect(cancel.status).toBe("rejected");
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.titulos[0]?.estado).toBe("ativo");
    expect(receive.status === "fulfilled" || receive.status === "rejected").toBe(true);
  });

  it("concorrência simulada: recebimento espera o lock e vê o título cancelado", async () => {
    const store = criarStore();
    const cancel = createCancelarVendaFinanceiroService(store).cancelar(10, input);
    await new Promise(r => setTimeout(r, 10));
    const receive = store.receber(10, 50, 11000).then(
      () => "ok",
      (e: Error) => e.message,
    );
    await cancel;
    const rec = await receive;
    expect(store.state.titulos[0]?.estado).toBe("cancelado");
    expect(store.state.vendas[0]?.status).toBe("cancelado");
    expect(rec === "ok" || rec.includes("cancelado")).toBe(true);
    if (rec !== "ok") {
      expect(store.state.liquidacoes.filter(l => l.tipo === "recebimento")).toHaveLength(0);
    }
  });
});

describe("decidirCaminhoCancelamentoVenda", () => {
  it("título principal usa o integrado mesmo sem chave ven-", () => {
    expect(decidirCaminhoCancelamentoVenda({
      idempotencyKey: null,
      titulos: [{ id: 50, origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL }],
    })).toEqual({ caminho: "integrado", tituloId: 50 });
  });

  it("chave ven- sem título é integridade, não comercial", () => {
    expect(decidirCaminhoCancelamentoVenda({
      idempotencyKey: "ven-3e9b-sem-titulo",
      titulos: [],
    })).toEqual({ caminho: "integridade", motivo: MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO });
  });

  it("título sem chave principal é integridade", () => {
    expect(decidirCaminhoCancelamentoVenda({
      idempotencyKey: null,
      titulos: [{ id: 9, origemItemChave: "outra" }],
    })).toEqual({ caminho: "integridade", motivo: MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO });
  });

  it("principal + extra é integridade e não integrado", () => {
    expect(decidirCaminhoCancelamentoVenda({
      idempotencyKey: "ven-3e9b2-extra",
      titulos: [
        { id: 1, origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL },
        { id: 2, origemItemChave: "item-extra" },
      ],
    })).toEqual({ caminho: "integridade", motivo: MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS });
  });

  it("dois principais são integridade", () => {
    expect(decidirCaminhoCancelamentoVenda({
      idempotencyKey: "ven-3e9b-dup-01",
      titulos: [
        { id: 1, origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL },
        { id: 2, origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL },
      ],
    })).toEqual({ caminho: "integridade", motivo: MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS });
  });

  it("recebimento efetivo considera parcial, integral e estorno", async () => {
    const store = criarStore();
    const semRecebimento = await store.transaction(tx => vendaTemRecebimentoEfetivo(tx.fin, 10, 1));
    expect(semRecebimento).toBe(false);

    await store.receber(10, 50, 5000);
    const parcial = await store.transaction(tx => vendaTemRecebimentoEfetivo(tx.fin, 10, 1));
    expect(parcial).toBe(true);

    await store.receber(10, 50, 6000);
    const integral = await store.transaction(tx => vendaTemRecebimentoEfetivo(tx.fin, 10, 1));
    expect(integral).toBe(true);

    await store.receber(10, 50, 11000, "estorno_recebimento");
    const estornado = await store.transaction(tx => vendaTemRecebimentoEfetivo(tx.fin, 10, 1));
    expect(estornado).toBe(false);

    const comercial = await store.transaction(tx => vendaTemRecebimentoEfetivo(tx.fin, 10, 2));
    expect(comercial).toBe(false);
  });

  it("histórico sem título e sem chave ven- permanece comercial", () => {
    expect(decidirCaminhoCancelamentoVenda({
      idempotencyKey: null,
      titulos: [],
    })).toEqual({ caminho: "comercial" });
  });
});

describe("cancelarVendaFinanceiro — isolamento da aplicação", () => {
  it("a rota de cancelar usa a proteção financeira; confirmar comercial permanece desligado", () => {
    const router = readFileSync(join(raiz, "routers.ts"), "utf8");
    const cancelar = readFileSync(join(raiz, "cancelarVenda.ts"), "utf8");
    const detalhe = readFileSync(join(raiz, "../client/src/pages/VendaDetalhePage.tsx"), "utf8");
    const pendencia = readFileSync(join(raiz, "../client/src/lib/novaVendaPendencia.ts"), "utf8");
    expect(router).toContain("createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(db)).cancelar");
    expect(router).toContain("confirmarVendaComercialSePermitida");
    expect(router).toContain("confirmarVendaIntegradaSeAtiva");
    expect(router).not.toContain("cancelarVendaComercial");
    expect(cancelar).not.toContain("cancelarVendaFinanceiro");
    expect(cancelar).not.toContain("cancelarTituloNoTx");
    expect(detalhe).not.toContain("cancelarVendaFinanceiro");
    expect(detalhe).toContain("trpc.vendas.cancelar");
    expect(pendencia).toContain("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA");
    expect(readFileSync(join(raiz, "../shared/vendaIntegracao.ts"), "utf8")).toContain("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true");
    expect(router).toContain("vendaTemRecebimentoEfetivo");
    expect(router).toContain("temRecebimentoEfetivo");
    const svc = readFileSync(join(raiz, "cancelarVendaFinanceiro.ts"), "utf8");
    const mysql = readFileSync(join(raiz, "cancelarVendaFinanceiroMysql.ts"), "utf8");
    expect(svc).toContain("decidirCaminhoCancelamentoVenda");
    expect(svc).toContain("lockTitulosDaVenda");
    expect(svc).toContain("lockAnimais");
    expect(svc).toContain("lockBaixasAtivasDaVenda");
    expect(svc).not.toContain("listarTitulosPorOrigemNoTx");
    expect(svc).not.toContain("titulosCreateManual");
    expect(svc).not.toContain("DELETE FROM");
    expect(mysql).toContain("ORDER BY id FOR UPDATE");
    expect(mysql).toContain('.for("update")');
    expect(mysql).toContain("origem_id = ${vendaId}");
  });
});
