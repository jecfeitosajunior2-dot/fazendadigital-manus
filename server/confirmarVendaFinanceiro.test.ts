import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  MSG_VENDA_CONFIRMACAO_INTEGRIDADE_TITULO,
  MSG_VENDA_CONFIRMACAO_JA_CANCELADA,
  MSG_VENDA_CONFLITO_IDEMPOTENCIA,
  MSG_VENDA_IDEMPOTENCY,
  MSG_VENDA_RECUPERACAO_FALHOU,
} from "../shared/vendaFinanceiro";
import { MSG_VENDA_ANIMAL_DUPLICADO, MSG_VENDA_ANIMAL_OUTRA_FAZENDA } from "../shared/vendaComercial";
import {
  createConfirmarVendaFinanceiroService,
  isDuplicateChaveIdempotenciaVenda,
  isDuplicateOrigemTituloVenda,
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
  falharBaixa?: boolean;
  deadlocksRestantes?: number;
  simularCorridaIdempotencia?: boolean;
  duplicarConstraint?: string;
  omitirTituloNaRecuperacao?: boolean;
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
      { id: 14, userId: 10, brinco: "104", status: "morto", fazendaId: 1, loteId: 5 },
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
    lastListAnimaisIds: [] as number[],
  };
  let deadlocksRestantes = Number(opts?.deadlocksRestantes ?? 0);
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
        // Snapshot antigo em REPEATABLE READ: leitura desbloqueada não vê o título.
        if (opts?.simularCorridaIdempotencia) return [];
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
      async lockTituloPrincipalDaVenda(userId, vendaId) {
        if (opts?.omitirTituloNaRecuperacao) return null;
        const titulos = state.titulos.filter(t =>
          t.userId === userId
          && t.origemTipo === FINANCEIRO_ORIGEM_VENDA_ANIMAIS
          && t.origemId === vendaId
          && t.origemItemChave === FINANCEIRO_ORIGEM_ITEM_PRINCIPAL
        );
        return titulos.length === 1 ? titulos[0]! : null;
      },
      async lockParcelasDoTitulo(userId, tituloId) {
        return state.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
      },
      async listAnimais(userId, ids) {
        if (deadlocksRestantes > 0) {
          deadlocksRestantes -= 1;
          const err = new Error("Deadlock found when trying to get lock");
          (err as { errno?: number; code?: string }).errno = 1213;
          (err as { code?: string }).code = "ER_LOCK_DEADLOCK";
          throw err;
        }
        const unique = [...new Set(ids)].sort((a, b) => a - b);
        state.lastListAnimaisIds = unique;
        return state.animais
          .filter(a => a.userId === userId && unique.includes(a.id))
          .sort((a, b) => a.id - b.id);
      },
      async listBaixasAtivas(animalIds) {
        return state.baixas.filter(b => b.status === "ativa" && animalIds.includes(b.animalId));
      },
      async listLotes(ids) {
        return state.lotes.filter(l => ids.includes(l.id));
      },
      async insertVenda(row) {
        if (opts?.duplicarConstraint) {
          const err = new Error(`Failed query: insert into vendas`);
          const cause = new Error(`Duplicate entry 'x' for key '${opts.duplicarConstraint}'`);
          (cause as { errno?: number; code?: string }).errno = 1062;
          (cause as { code?: string }).code = "ER_DUP_ENTRY";
          (err as { cause?: unknown }).cause = cause;
          throw err;
        }
        if (state.vendas.some(v => v.userId === row.userId && v.idempotencyKey && v.idempotencyKey === row.idempotencyKey)) {
          const cause = new Error("Duplicate entry '10-ven-teste01' for key 'vendas.vendas_idem_uq'");
          (cause as { errno?: number; code?: string }).errno = 1062;
          (cause as { code?: string }).code = "ER_DUP_ENTRY";
          const err = new Error("Failed query: insert into `vendas`");
          (err as { cause?: unknown }).cause = cause;
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
        if (opts?.falharBaixa) return 0;
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

  const store: ConfirmarVendaFinanceiroStore & { state: typeof state; transacoes: number } = {
    state,
    transacoes: 0,
    async transaction(fn) {
      store.transacoes += 1;
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
    expect(router).toContain("confirmarVendaIntegradaSeAtiva");
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

describe("confirmarVendaFinanceiro — segurança concorrente 3E.8D", () => {
  it("A — confirmação normal grava venda, itens, baixa e um título", async () => {
    const store = criarStore();
    const r = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(r.idempotente).toBe(false);
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.itens).toHaveLength(2);
    expect(store.state.baixas).toHaveLength(2);
    expect(store.state.titulos).toHaveLength(1);
    expect(store.state.animais.filter(a => a.id === 10 || a.id === 11).every(a => a.status === "vendido")).toBe(true);
  });

  it("B — mesmo animal em duas vendas com chaves diferentes é recusado", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    await expect(svc.confirmar(10, { ...baseKg, idempotencyKey: "ven-outro01" })).rejects.toBeInstanceOf(TRPCError);
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });

  it("C — mesma chave e mesmo payload devolve os mesmos IDs", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    const a = await svc.confirmar(10, baseKg);
    const b = await svc.confirmar(10, baseKg);
    expect(b).toEqual({ ...a, idempotente: true });
    expect(store.state.vendas).toHaveLength(1);
  });

  it("D — mesma chave e payload diferente conflita sem gravar segunda venda", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    await expect(svc.confirmar(10, { ...baseKg, condicao: "definir_depois" }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
    expect(store.state.vendas).toHaveLength(1);
  });

  it("E — animais de outra fazenda não gravam venda", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [{ animalId: 12, pesoVenda: 300, precoUnitario: 20 }],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_OUTRA_FAZENDA });
    expect(store.state.vendas).toHaveLength(0);
  });

  it("F — animais de outro usuário não entram na venda", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [{ animalId: 20, pesoVenda: 300, precoUnitario: 20 }],
    })).rejects.toMatchObject({
      message: expect.stringMatching(/não está mais disponível para Venda/),
    });
    expect(store.state.vendas).toHaveLength(0);
    expect(store.state.animais.find(a => a.id === 20)?.status).toBe("ativo");
  });

  it("G — animal inativo é recusado", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [{ animalId: 14, pesoVenda: 300, precoUnitario: 20 }],
    })).rejects.toMatchObject({
      message: expect.stringMatching(/não está mais disponível para Venda/),
    });
    expect(store.state.vendas).toHaveLength(0);
  });

  it("H — animal já vendido é recusado", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [{ animalId: 13, pesoVenda: 300, precoUnitario: 20 }],
    })).rejects.toMatchObject({
      message: expect.stringMatching(/não está mais disponível para Venda/),
    });
  });

  it("I — animal duplicado no payload é recusado antes de gravar", async () => {
    const store = criarStore();
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      itens: [
        { animalId: 10, pesoVenda: 300, precoUnitario: 20 },
        { animalId: 10, pesoVenda: 250, precoUnitario: 20 },
      ],
    })).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_DUPLICADO });
    expect(store.state.vendas).toHaveLength(0);
    expect(store.state.lastListAnimaisIds).toEqual([]);
  });

  it("J — falha na criação do título faz rollback completo", async () => {
    const store = criarStore({ falharFinanceiro: true });
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg))
      .rejects.toThrow("falha financeira forçada");
    expect(store.state.vendas).toHaveLength(0);
    expect(store.state.itens).toHaveLength(0);
    expect(store.state.baixas).toHaveLength(0);
    expect(store.state.titulos).toHaveLength(0);
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("ativo");
  });

  it("K — falha na baixa dos animais faz rollback completo", async () => {
    const store = criarStore({ falharBaixa: true });
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg)).rejects.toBeInstanceOf(TRPCError);
    expect(store.state.vendas).toHaveLength(0);
    expect(store.state.baixas).toHaveLength(0);
    expect(store.state.titulos).toHaveLength(0);
    expect(store.state.animais.find(a => a.id === 10)?.status).toBe("ativo");
  });

  it("L — deadlock 1213 é retentado e a venda fecha", async () => {
    const store = criarStore({ deadlocksRestantes: 1 });
    const r = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(r.idempotente).toBe(false);
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });

  it("M — recuperação após resposta perdida (UNIQUE) devolve os mesmos IDs", async () => {
    const store = criarStore();
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
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
  });

  it("N — ids fora de ordem são travados em ordem crescente", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      idempotencyKey: "ven-ordem01",
      itens: [
        { animalId: 11, pesoVenda: 250, precoUnitario: 20 },
        { animalId: 10, pesoVenda: 300, precoUnitario: 20 },
      ],
    });
    expect(store.state.lastListAnimaisIds).toEqual([10, 11]);
    expect(store.state.vendas).toHaveLength(1);
  });

  it("O — valores e parcelas da intenção são preservados em centavos", async () => {
    const store = criarStore();
    const r = await createConfirmarVendaFinanceiroService(store).confirmar(10, {
      ...baseKg,
      idempotencyKey: "ven-parc02",
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5000 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6000 },
      ],
    });
    expect(r.valorTotal).toBe(11000);
    expect(store.state.titulos[0]?.valorOriginal).toBe(persistirValor(11000));
    expect(store.state.parcelas.map(p => Number(p.valorOriginal))).toEqual([5000, 6000]);
    expect(store.state.itens.map(i => Number(i.valorItem)).sort((a, b) => a - b)).toEqual([5000, 6000]);
  });

  it("leitura bloqueante usa FOR UPDATE na ordem de id e não reconstruí snapshot", () => {
    const mysql = readFileSync(join(raiz, "confirmarVendaFinanceiroMysql.ts"), "utf8");
    const listAnimais = mysql.slice(mysql.indexOf("async listAnimais"), mysql.indexOf("async listBaixasAtivas"));
    expect(listAnimais).toContain('.for("update")');
    expect(listAnimais).toContain("orderBy");
    expect(listAnimais).toContain("animais.userId");
    expect(listAnimais).not.toMatch(/for\("update"\)[\s\S]*select\(\)/);
    const svc = readFileSync(join(raiz, "confirmarVendaFinanceiro.ts"), "utf8");
    expect(svc).toContain("animalIdsOrdenados");
    expect(svc).not.toContain("eq(animais.status, \"ativo\")");
    expect(mysql).toContain("eq(animais.status, \"ativo\")");
    expect(readFileSync(join(raiz, "../client/src/pages/NovaVendaPage.tsx"), "utf8")).not.toContain("confirmarVendaFinanceiro");
  });
});

describe("confirmarVendaFinanceiro — recuperação idempotente 3E.8F", () => {
  it("A — mesma chave e mesmo payload devolve os mesmos IDs", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    const a = await svc.confirmar(10, baseKg);
    const b = await svc.confirmar(10, baseKg);
    expect(b).toEqual({ ...a, idempotente: true });
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });

  it("B — mesma chave e payload diferente conflita", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    await expect(svc.confirmar(10, { ...baseKg, condicao: "definir_depois" }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
  });

  it("C — duas confirmações simultâneas com UNIQUE recuperam os mesmos IDs", async () => {
    const store = criarStore();
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    const transacoesAntes = corrida.transacoes;
    const b = await createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg);
    expect(b.vendaId).toBe(a.vendaId);
    expect(b.tituloId).toBe(a.tituloId);
    expect(b.idempotente).toBe(true);
    expect(corrida.transacoes).toBeGreaterThan(transacoesAntes + 1);
  });

  it("D — resposta perdida após COMMIT: retry devolve os mesmos IDs", async () => {
    const store = criarStore();
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const b = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(b.vendaId).toBe(a.vendaId);
    expect(b.tituloId).toBe(a.tituloId);
    expect(store.state.vendas).toHaveLength(1);
  });

  it("E/F — recuperação abre transação nova e não reusa a transação perdedora", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    await createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg);
    expect(corrida.transacoes).toBe(2);
  });

  it("G — snapshot antigo na leitura desbloqueada não impede a recuperação com lock", async () => {
    const store = criarStore();
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    const b = await createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg);
    expect(b.tituloId).toBe(a.tituloId);
    const mysql = readFileSync(join(raiz, "confirmarVendaFinanceiroMysql.ts"), "utf8");
    expect(mysql).toContain("lockTituloPrincipalDaVenda");
    expect(mysql).toContain("FROM financeiro_titulos");
    expect(mysql).toContain("FOR UPDATE");
    expect(mysql).toContain("Sem SELECT desbloqueado no início");
  });

  it("H — título principal ausente não devolve sucesso nem cria título fora da transação", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const corrida = criarStore({ simularCorridaIdempotencia: true, omitirTituloNaRecuperacao: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = [];
    corrida.state.parcelas = [];
    corrida.state.next = store.state.next;
    await expect(createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg))
      .rejects.toMatchObject({ message: MSG_VENDA_RECUPERACAO_FALHOU });
    expect(corrida.state.titulos).toHaveLength(0);
    expect(corrida.state.vendas).toHaveLength(1);
  });

  it("I — 1062 de outra constraint não é tratado como conflito da chave ven-", async () => {
    const store = criarStore({ duplicarConstraint: "financeiro_titulos.financeiro_titulos_origem_uq" });
    await expect(createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg)).rejects.toThrow(/Duplicate entry|Failed query/);
    expect(store.state.vendas).toHaveLength(0);
    expect(store.state.titulos).toHaveLength(0);
  });

  it("J — 1062 encapsulado no cause do Drizzle recupera a venda vencedora", async () => {
    const store = criarStore();
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    const b = await createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg);
    expect(b.vendaId).toBe(a.vendaId);
    expect(b.tituloId).toBe(a.tituloId);
  });

  it("K — deadlock 1213 é retentado na confirmação", async () => {
    const store = criarStore({ deadlocksRestantes: 1 });
    const r = await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    expect(r.idempotente).toBe(false);
    expect(store.state.vendas).toHaveLength(1);
  });

  it("L — chaves diferentes para o mesmo animal: só uma venda vence", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    await expect(svc.confirmar(10, { ...baseKg, idempotencyKey: "ven-outro01" })).rejects.toBeInstanceOf(TRPCError);
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });

  it("M — a mesma chave isolada por usuário gera vendas distintas", async () => {
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
  });

  it("N — valores comerciais e do título são preservados na recuperação", async () => {
    const store = criarStore();
    const pedido = {
      ...baseKg,
      idempotencyKey: "ven-parc8f",
      condicao: "parcelado" as const,
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5000 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6000 },
      ],
    };
    const a = await createConfirmarVendaFinanceiroService(store).confirmar(10, pedido);
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    const b = await createConfirmarVendaFinanceiroService(corrida).confirmar(10, pedido);
    expect(b.valorTotal).toBe(11000);
    expect(b.vendaId).toBe(a.vendaId);
    expect(b.tituloId).toBe(a.tituloId);
    expect(corrida.state.titulos[0]?.valorOriginal).toBe(persistirValor(11000));
    expect(corrida.state.parcelas.map(p => Number(p.valorOriginal))).toEqual([5000, 6000]);
  });

  it("distingue 1062 da chave ven- do 1062 da origem do título, inclusive via cause", () => {
    const ven = new Error("Failed query");
    const venCause = new Error("Duplicate entry '1-ven-x' for key 'vendas.vendas_idem_uq'");
    (venCause as { errno?: number }).errno = 1062;
    (ven as { cause?: unknown }).cause = venCause;
    expect(isDuplicateChaveIdempotenciaVenda(ven)).toBe(true);
    expect(isDuplicateOrigemTituloVenda(ven)).toBe(false);

    const origem = new Error("Failed query");
    const origemCause = new Error("Duplicate entry '1' for key 'financeiro_titulos.financeiro_titulos_origem_uq'");
    (origemCause as { errno?: number }).errno = 1062;
    (origem as { cause?: unknown }).cause = origemCause;
    expect(isDuplicateChaveIdempotenciaVenda(origem)).toBe(false);
    expect(isDuplicateOrigemTituloVenda(origem)).toBe(true);
  });
});

describe("confirmarVendaFinanceiro — idempotência após cancelamento 3E.9F", () => {
  it("B — venda cancelada com o mesmo payload recusa e não cria outra venda", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    const a = await svc.confirmar(10, baseKg);
    store.state.vendas[0]!.status = "cancelado";
    store.state.titulos[0]!.estado = "cancelado";
    const vendas = store.state.vendas.length;
    const titulos = store.state.titulos.length;
    const baixas = store.state.baixas.length;
    await expect(svc.confirmar(10, baseKg)).rejects.toMatchObject({
      message: MSG_VENDA_CONFIRMACAO_JA_CANCELADA,
      code: "BAD_REQUEST",
    });
    expect(store.state.vendas).toHaveLength(vendas);
    expect(store.state.titulos).toHaveLength(titulos);
    expect(store.state.baixas).toHaveLength(baixas);
    expect(store.state.vendas[0]?.id).toBe(a.vendaId);
    expect(store.state.vendas[0]?.status).toBe("cancelado");
    expect(store.state.titulos[0]?.estado).toBe("cancelado");
  });

  it("E — venda cancelada com payload diferente continua conflito de idempotência", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    store.state.vendas[0]!.status = "cancelado";
    store.state.titulos[0]!.estado = "cancelado";
    await expect(svc.confirmar(10, { ...baseKg, condicao: "definir_depois" }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFLITO_IDEMPOTENCIA, code: "CONFLICT" });
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(1);
  });

  it("C — venda concluída sem título principal é integridade, sem sucesso", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    store.state.titulos = [];
    store.state.parcelas = [];
    await expect(svc.confirmar(10, baseKg)).rejects.toMatchObject({ message: MSG_VENDA_RECUPERACAO_FALHOU });
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.titulos).toHaveLength(0);
  });

  it("D — título cancelado com venda ainda concluída é integridade", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    await svc.confirmar(10, baseKg);
    store.state.titulos[0]!.estado = "cancelado";
    expect(store.state.vendas[0]?.status).toBe("concluido");
    await expect(svc.confirmar(10, baseKg)).rejects.toMatchObject({
      message: MSG_VENDA_CONFIRMACAO_INTEGRIDADE_TITULO,
    });
    expect(store.state.vendas).toHaveLength(1);
    expect(store.state.vendas[0]?.status).toBe("concluido");
    expect(store.state.titulos).toHaveLength(1);
  });

  it("A — venda concluída com título válido segue idempotente", async () => {
    const store = criarStore();
    const svc = createConfirmarVendaFinanceiroService(store);
    const a = await svc.confirmar(10, baseKg);
    const b = await svc.confirmar(10, baseKg);
    expect(b).toEqual({ ...a, idempotente: true });
  });

  it("recuperação após UNIQUE também recusa venda cancelada", async () => {
    const store = criarStore();
    await createConfirmarVendaFinanceiroService(store).confirmar(10, baseKg);
    store.state.vendas[0]!.status = "cancelado";
    store.state.titulos[0]!.estado = "cancelado";
    const corrida = criarStore({ simularCorridaIdempotencia: true });
    corrida.state.vendas = clone(store.state.vendas);
    corrida.state.itens = clone(store.state.itens);
    corrida.state.titulos = clone(store.state.titulos);
    corrida.state.parcelas = clone(store.state.parcelas);
    corrida.state.next = store.state.next;
    await expect(createConfirmarVendaFinanceiroService(corrida).confirmar(10, baseKg))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_JA_CANCELADA });
    expect(corrida.state.vendas).toHaveLength(1);
    expect(corrida.state.titulos).toHaveLength(1);
  });
});

