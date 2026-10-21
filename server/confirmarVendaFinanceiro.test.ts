import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  MSG_VENDA_CONFLITO_IDEMPOTENCIA,
  MSG_VENDA_IDEMPOTENCY,
} from "../shared/vendaFinanceiro";
import { MSG_VENDA_ANIMAL_OUTRA_FAZENDA } from "../shared/vendaComercial";
import {
  createConfirmarVendaFinanceiroService,
  type ConfirmarVendaFinanceiroInput,
  type ConfirmarVendaFinanceiroStore,
  type ConfirmarVendaFinanceiroTx,
  type VendaFinanceiroRow,
  type VendaItemFinanceiroRow,
} from "./confirmarVendaFinanceiro";
import type { FinParcelaRow, FinTituloRow, FinanceiroNucleoTx } from "./financeiroNucleo";

const raiz = dirname(fileURLToPath(import.meta.url));

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(opts?: {
  falharFinanceiro?: boolean;
  simularCorridaIdempotencia?: boolean;
}) {
  const state = {
    pessoas: [
      { id: 2, userId: 10, nome: "Frigorífico Boa Vista", tipo: "cliente", ativo: true },
      { id: 3, userId: 10, nome: "Inativo", tipo: "cliente", ativo: false },
      { id: 4, userId: 99, nome: "Cliente de outro usuário", tipo: "cliente", ativo: true },
    ],
    fazendas: [
      { id: 1, userId: 10, nome: "Sede" },
      { id: 8, userId: 99, nome: "Outra" },
    ],
    animais: [
      { id: 10, userId: 10, brinco: "100", status: "ativo", fazendaId: 1, loteId: 5 },
      { id: 11, userId: 10, brinco: "101", status: "ativo", fazendaId: 1, loteId: 5 },
      { id: 12, userId: 10, brinco: "102", status: "ativo", fazendaId: 9, loteId: null },
      { id: 13, userId: 10, brinco: "103", status: "vendido", fazendaId: 1, loteId: 5 },
      { id: 20, userId: 99, brinco: "200", status: "ativo", fazendaId: 8, loteId: null },
    ],
    lotes: [{ id: 5, nome: "Desmama", fazendaId: 1 }],
    baixas: [] as Array<{ animalId: number; status: string; vendaId: number }>,
    vendas: [] as VendaFinanceiroRow[],
    itens: [] as Array<VendaItemFinanceiroRow & { userId: number; vendaId: number }>,
    titulos: [] as FinTituloRow[],
    parcelas: [] as FinParcelaRow[],
    movimentos: [] as Array<{ id: number }>,
    liquidacoes: [] as Array<{ id: number }>,
    next: 1,
    ocultarProximaBuscaIdem: Boolean(opts?.simularCorridaIdempotencia),
  };
  const id = () => state.next++;

  const makeTx = (): ConfirmarVendaFinanceiroTx => {
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
          t.userId === userId
          && t.origemTipo === origemTipo
          && t.origemId === origemId
          && t.origemItemChave === chave,
        ) ?? null;
      },
      async listTitulosPorOrigem(userId: number, origemTipo: string, origemId: number) {
        return state.titulos.filter(t =>
          t.userId === userId && t.origemTipo === origemTipo && t.origemId === origemId,
        );
      },
      async insertTitulo(row: FinTituloRow) {
        if (opts?.falharFinanceiro) throw new Error("falha financeira forçada");
        const created = { ...row, id: id() };
        state.titulos.push(created);
        return created.id;
      },
      async insertParcela(row: FinParcelaRow) {
        const created = { ...row, id: id() };
        state.parcelas.push(created);
        return created.id;
      },
      async listParcelasTitulo(userId: number, tituloId: number) {
        return state.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
      },
    } as unknown as FinanceiroNucleoTx;

    return {
      fin,
      loteFazendaById: new Map(state.lotes.map(l => [l.id, l.fazendaId])),
      async findFazenda(userId, fazendaId) {
        return state.fazendas.find(f => f.id === fazendaId && f.userId === userId) ?? null;
      },
      async findPessoa(userId, pessoaId) {
        return state.pessoas.find(p => p.id === pessoaId && p.userId === userId) ?? null;
      },
      async findVendaPorIdempotency(userId, key) {
        if (state.ocultarProximaBuscaIdem) {
          state.ocultarProximaBuscaIdem = false;
          return null;
        }
        return state.vendas.find(v => v.userId === userId && v.idempotencyKey === key) ?? null;
      },
      async listVendaItens(userId, vendaId) {
        return state.itens.filter(i => i.userId === userId && i.vendaId === vendaId);
      },
      async listAnimais(userId, ids) {
        return state.animais.filter(a => a.userId === userId && ids.includes(a.id));
      },
      async listBaixasAtivas(animalIds) {
        return state.baixas.filter(b => b.status === "ativa" && animalIds.includes(b.animalId));
      },
      async listLotes(ids) {
        return state.lotes.filter(l => ids.includes(l.id));
      },
      async insertVenda(row) {
        if (state.vendas.some(v => v.userId === row.userId && v.idempotencyKey && v.idempotencyKey === row.idempotencyKey)) {
          const err = new Error("Duplicate entry vendas_idem_uq");
          (err as { errno?: number; code?: string }).errno = 1062;
          (err as { code?: string }).code = "ER_DUP_ENTRY";
          throw err;
        }
        const created = { ...row, id: id() };
        state.vendas.push(created);
        return created.id;
      },
      async insertItens(vendaId, userId, itens) {
        for (const item of itens) {
          state.itens.push({ ...item, userId, vendaId });
        }
      },
      async insertBaixas(rows) {
        for (const row of rows) {
          if (state.baixas.some(b => b.animalId === row.animalId && b.status === "ativa")) {
            const err = new Error("Duplicate entry animal_baixas_animal_ativa_uq");
            (err as { errno?: number; code?: string }).errno = 1062;
            (err as { code?: string }).code = "ER_DUP_ENTRY";
            throw err;
          }
          state.baixas.push({ animalId: row.animalId, status: "ativa", vendaId: row.vendaId });
        }
      },
      async marcarAnimaisVendidos(userId, ids) {
        let n = 0;
        for (const animal of state.animais) {
          if (animal.userId === userId && ids.includes(animal.id) && animal.status === "ativo") {
            animal.status = "vendido";
            n += 1;
          }
        }
        return n;
      },
    };
  };

  const store: ConfirmarVendaFinanceiroStore & { state: typeof state } = {
    state,
    async transaction(fn) {
      const snap = clone(state);
      try {
        return await fn(makeTx());
      } catch (error) {
        state.pessoas = snap.pessoas;
        state.fazendas = snap.fazendas;
        state.animais = snap.animais;
        state.lotes = snap.lotes;
        state.baixas = snap.baixas;
        state.vendas = snap.vendas;
        state.itens = snap.itens;
        state.titulos = snap.titulos;
        state.parcelas = snap.parcelas;
        state.movimentos = snap.movimentos;
        state.liquidacoes = snap.liquidacoes;
        state.next = snap.next;
        throw error;
      }
    },
  };
  return store;
}

const baseKg: ConfirmarVendaFinanceiroInput = {
  idempotencyKey: "ven-teste01",
  fazendaId: 1,
  data: "2026-10-21",
  compradorId: 2,
  formaPrecificacao: "kg",
  precoPadrao: 20,
  observacoes: "Lote de desmama",
  itens: [
    { animalId: 10, pesoVenda: 300, precoUnitario: 20 },
    { animalId: 11, pesoVenda: 250, precoUnitario: 20 },
  ],
  condicao: "a_vista",
};

describe("confirmarVendaFinanceiro — condições", () => {
  it("venda à vista cria título receber com uma parcela na data da venda", async () => {
    const store = criarStore();
    const r = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(r).toMatchObject({
      success: true,
      idempotente: false,
      quantidade: 2,
      valorTotal: 11000,
    });
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.titulos[0]).toMatchObject({
      tipo: "receber",
      origemTipo: FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
      origemId: r.vendaId,
      origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
      pessoaId: 2,
      fazendaOrigemId: 1,
      valorOriginal: persistirValor(11000),
      condicaoStatus: "definida",
      observacoes: "condicaoRecebimento=a_vista",
    });
    expect(store.state.parcelas).toHaveLength(1);
    expect(store.state.parcelas[0]?.vencimento).toBe("2026-10-21");
    expect(store.state.parcelas[0]?.valorOriginal).toBe(persistirValor(11000));
    expect(r.tituloId).toBe(store.state.titulos[0]?.id);
  });

  it("venda a prazo cria uma parcela com vencimento informado", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      idempotencyKey: "ven-prazo01",
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 11000 }],
    });
    expect(store.state.titulos[0]?.condicaoStatus).toBe("definida");
    expect(store.state.parcelas[0]?.vencimento).toBe("2026-11-21");
  });

  it("venda parcelada cria duas parcelas que somam o total comercial", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      idempotencyKey: "ven-parc01",
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5000 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6000 },
      ],
    });
    expect(store.state.parcelas).toHaveLength(2);
    const soma = store.state.parcelas.reduce((acc, p) => acc + Number(p.valorOriginal), 0);
    expect(soma).toBe(11000);
    expect(store.state.titulos[0]?.valorOriginal).toBe(persistirValor(11000));
  });

  it("definir depois cria título sem parcelas", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      idempotencyKey: "ven-depois1",
      condicao: "definir_depois",
      parcelas: [],
    });
    expect(store.state.titulos[0]?.condicaoStatus).toBe("a_definir");
    expect(store.state.parcelas).toHaveLength(0);
  });
});

describe("confirmarVendaFinanceiro — origem, isolamento e caixa", () => {
  it("não cria movimento de caixa nem liquidação", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(store.state.movimentos).toHaveLength(0);
    expect(store.state.liquidacoes).toHaveLength(0);
  });

  it("baixa os animais e grava itens da venda", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(store.state.animais.filter(a => a.id === 10 || a.id === 11).every(a => a.status === "vendido")).toBe(true);
    expect(store.state.baixas).toHaveLength(2);
    expect(store.state.itens).toHaveLength(2);
    expect(store.state.vendas[0]?.idempotencyKey).toBe("ven-teste01");
  });

  it("isola a chave por usuário", async () => {
    const store = criarStore();
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const b = await createConfirmarVendaFinanceiroService(store).confirmar(99, {
      idempotencyKey: "ven-teste01",
      fazendaId: 8,
      data: "2026-10-21",
      compradorId: 4,
      formaPrecificacao: "cabeca",
      itens: [{ animalId: 20, precoUnitario: 1500 }],
      condicao: "definir_depois",
    });
    expect(a.vendaId).not.toBe(b.vendaId);
    expect(store.state.vendas).toHaveLength(2);
    expect(store.state.titulos).toHaveLength(2);
  });
});

describe("confirmarVendaFinanceiro — falhas e rollback", () => {
  it("falha ao criar título desfaz venda, itens, baixas e status dos animais", async () => {
    const store = criarStore({ falharFinanceiro: true });
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg)).rejects.toThrow(
      "falha financeira forçada",
    );
    expect(store.state.vendas).toHaveLength(0);
    expect(store.state.itens).toHaveLength(0);
    expect(store.state.baixas).toHaveLength(0);
    expect(store.state.titulos).toHaveLength(0);
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("ativo");
  });

  it("recusa animal de outra fazenda sem gravar nada", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [{ animalId: 12, pesoVenda: 300, precoUnitario: 20 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_OUTRA_FAZENDA });
    expect(store.state.vendas).toHaveLength(0);
  });

  it("recusa animal já vendido", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [{ animalId: 13, pesoVenda: 300, precoUnitario: 20 }],
    })).rejects.toMatchObject({
      message: expect.stringMatching(/não está mais disponível para Venda/),
    });
  });

  it("segunda chave no mesmo animal não grava segunda venda", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    await expect(svc.confirmar(10, {
      ...baseKg,
      idempotencyKey: "ven-outro01",
    })).rejects.toBeInstanceOf(TRPCError);
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });
});

describe("confirmarVendaFinanceiro — idempotência", () => {
  it("retry com a mesma chave e o mesmo pedido devolve os mesmos ids", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    const a = await svc.confirmar(10, baseKg);
    const b = await svc.confirmar(10, baseKg);
    expect(b).toEqual({ ...a, idempotente: true });
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.baixas).toHaveLength(2);
  });

  it("retry com a mesma chave e pedido diferente conflita", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    await expect(svc.confirmar(10, {
      ...baseKg,
      condicao: "definir_depois",
    })).rejects.toMatchObject({ message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });

  it("duas tentativas com a mesma chave: UNIQUE dispara e a recuperação usa transação nova", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    const a = await svc.confirmar(10, baseKg);
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    const b = await createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg);
    expect(b.vendaId).toBe(a.vendaId);
    expect(b.tituloId).toBe(a.tituloId);
    expect(b.idempotente).toBe(true);
    expect(corrida.state.vendas).toHaveLength(1);
  });

  it("recusa chave sem prefixo ven-", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      idempotencyKey: "compra-teste-aaaa",
    })).rejects.toMatchObject({ message: MSG_VENDA_IDEMPOTENCY });
  });
});

describe("confirmarVendaFinanceiro — isolamento da aplicação", () => {
  it("nenhuma rota ativa importa o serviço integrado", () => {
    const router = readFileSync(join(raiz, "routers.ts"), "utf8");
    const financeiroRouter = readFileSync(join(raiz, "financeiroV2Router.ts"), "utf8");
    const confirmar = readFileSync(join(raiz, "confirmarVenda.ts"), "utf8");
    const novaVenda = readFileSync(join(raiz, "../client/src/pages/NovaVendaPage.tsx"), "utf8");
    expect(router).not.toContain("confirmarVendaFinanceiro");
    expect(router).not.toContain("confirmarVendaFinanceiroMysql");
    expect(financeiroRouter).not.toContain("confirmarVendaFinanceiro");
    expect(confirmar).not.toContain("confirmarVendaFinanceiro");
    expect(novaVenda).not.toContain("confirmarVendaFinanceiro");
    expect(confirmar).not.toContain("criarTituloNoTx");
  });

  it("não usa criação manual de título nem liquidação", () => {
    const svc = readFileSync(join(raiz, "confirmarVendaFinanceiro.ts"), "utf8");
    expect(svc).toContain("criarTituloNoTx");
    expect(svc).toContain("createFinanceiroNucleoTxFromDrizzle");
    expect(svc).not.toContain("titulosCreateManual");
    expect(svc).not.toContain("liquidacaoReceber");
    expect(svc).toContain("ConflitoIdempotenciaVendaError");
    expect(svc).toContain("isDuplicateKeyMysql");
    expect(svc).toContain("store.transaction(tx => recuperarAposConflitoNoTx");
  });
});
