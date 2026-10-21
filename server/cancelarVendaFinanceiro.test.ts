import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
} from "../shared/vendaFinanceiro";
import {
  createCancelarVendaFinanceiroService,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
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
      { id: 20, userId: 99, brinco: "200", status: "vendido" },
    ],
    vendas: [
      { id: 1, userId: 10, status: "concluido", idempotencyKey: "ven-3e6-01" },
      { id: 2, userId: 10, status: "concluido", idempotencyKey: null as string | null },
      { id: 3, userId: 99, status: "concluido", idempotencyKey: "ven-3e6-xx" },
    ],
    itens: [
      { userId: 10, vendaId: 1, animalId: 10 },
      { userId: 10, vendaId: 1, animalId: 11 },
      { userId: 10, vendaId: 2, animalId: 12 },
      { userId: 99, vendaId: 3, animalId: 20 },
    ],
    baixas: [
      { id: 80, userId: 10, vendaId: 1, animalId: 10, status: "ativa" },
      { id: 81, userId: 10, vendaId: 1, animalId: 11, status: "ativa" },
      { id: 82, userId: 10, vendaId: 2, animalId: 12, status: "ativa" },
      { id: 83, userId: 99, vendaId: 3, animalId: 20, status: "ativa" },
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
        return state.vendas.find(v => v.id === vendaId && v.userId === userId) ?? null;
      },
      async listItensAnimalIds(userId, vendaId) {
        return state.itens.filter(i => i.userId === userId && i.vendaId === vendaId).map(i => i.animalId);
      },
      async listAnimais(userId, ids) {
        return state.animais.filter(a => a.userId === userId && ids.includes(a.id));
      },
      async listBaixasAtivasDaVenda(userId, vendaId, animalIds) {
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

describe("cancelarVendaFinanceiro — isolamento da aplicação", () => {
  it("nenhuma rota ativa importa o serviço integrado", () => {
    const router = readFileSync(join(raiz, "routers.ts"), "utf8");
    const cancelar = readFileSync(join(raiz, "cancelarVenda.ts"), "utf8");
    const detalhe = readFileSync(join(raiz, "../client/src/pages/VendaDetalhePage.tsx"), "utf8");
    expect(router).not.toContain("cancelarVendaFinanceiro");
    expect(cancelar).not.toContain("cancelarVendaFinanceiro");
    expect(cancelar).not.toContain("cancelarTituloNoTx");
    expect(detalhe).not.toContain("cancelarVendaFinanceiro");
    const svc = readFileSync(join(raiz, "cancelarVendaFinanceiro.ts"), "utf8");
    expect(svc).toContain("cancelarTituloNoTx");
    expect(svc).toContain("tituloTemLiquidacaoEfetiva");
    expect(svc).toContain("lockTitulos");
    expect(svc).not.toContain("titulosCreateManual");
    expect(svc).not.toContain("DELETE FROM");
  });
});
