import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  FIN_USER_A,
  FIN_USER_B,
  fazendaIdDe,
  legadoIntacto,
  openFinanceiroMysqlHarness,
  pessoaIdDe,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { createFinanceiroNucleoService, type FinanceiroNucleoStore, type FinanceiroNucleoTx } from "./financeiroNucleo";
import {
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
  MSG_FIN_OVERPAYMENT,
} from "../shared/financeiroNucleo";

const harness = await openFinanceiroMysqlHarness();

describe.skipIf(!harness)("financeiroNucleo — MySQL isolado", () => {
  const h = () => harness!;
  let pessoaA: number;
  let pessoaB: number;
  let fazendaA1: number;
  let fazendaB: number;

  beforeAll(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    pessoaA = await pessoaIdDe(h(), FIN_USER_A, "Fornecedor A");
    pessoaB = await pessoaIdDe(h(), FIN_USER_B, "Fornecedor B");
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    fazendaB = await fazendaIdDe(h(), FIN_USER_B, "Fazenda B");
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    pessoaA = await pessoaIdDe(h(), FIN_USER_A, "Fornecedor A");
    pessoaB = await pessoaIdDe(h(), FIN_USER_B, "Fornecedor B");
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    fazendaB = await fazendaIdDe(h(), FIN_USER_B, "Fazenda B");
  });

  afterAll(async () => {
    if (harness) {
      await resetFinanceiroMysqlHarness(harness);
      const legado = await legadoIntacto(harness);
      expect(legado.contas).toBe(3);
      expect(legado.movs).toBe(8);
      await harness.close();
    }
  });

  async function contaCaixa(saldo = 50000, data = "2026-10-01") {
    return h().service.criarContaFinanceira(FIN_USER_A, {
      nome: "Caixa teste",
      tipo: "caixa",
      saldoAbertura: saldo,
      dataSaldoAbertura: data,
    });
  }

  async function tituloPagar(valor: number, parcelas: Array<{ numero: number; vencimento: string; valorOriginal: number }>) {
    return h().service.criarTitulo(FIN_USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Título teste",
      dataCompetencia: "2026-10-02",
      valorOriginal: valor,
      parcelas,
    });
  }

  it("A — cria conta financeira", async () => {
    const conta = await contaCaixa();
    const detalhe = await h().service.obterConta(FIN_USER_A, conta.id);
    expect(detalhe.saldoAtual).toBe(50000);
    expect(detalhe.nome).toBe("Caixa teste");
  });

  it("B — cria título + parcelas", async () => {
    const titulo = await tituloPagar(30000, [
      { numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 },
      { numero: 2, vencimento: "2026-12-01", valorOriginal: 10000 },
      { numero: 3, vencimento: "2027-01-01", valorOriginal: 10000 },
    ]);
    expect(await h().service.validarIntegridadeTitulo(FIN_USER_A, titulo.id)).toEqual({ ok: true });
  });

  it("C — pagamento cria liquidação + alocação + 1 movimento", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const pag = await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 10000,
      idempotencyKey: "mysql-c",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    expect(pag.idempotente).toBe(false);
    expect(await h().service.validarIntegridadeLiquidacao(FIN_USER_A, pag.id)).toEqual({ ok: true });
    const movs = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_movimentos WHERE user_id = ? AND liquidacao_id = ?`,
      [FIN_USER_A, pag.id],
    );
    expect(Number(movs[0]?.n)).toBe(1);
    const dir = await h().query<{ direcao: string; valor: string }[]>(
      `SELECT direcao, valor FROM financeiro_movimentos WHERE liquidacao_id = ?`,
      [pag.id],
    );
    expect(dir[0]?.direcao).toBe("saida");
    expect(Number(dir[0]?.valor)).toBe(10000);
  });

  it("D — rollback não deixa registro parcial", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const wrapped: FinanceiroNucleoStore = {
      transaction(fn) {
        return h().store.transaction(async tx => {
          const sabotado: FinanceiroNucleoTx = {
            ...tx,
            async insertMovimento() {
              throw new Error("falha forçada após alocação");
            },
          };
          return fn(sabotado);
        });
      },
    };
    const svc = createFinanceiroNucleoService(wrapped);
    await expect(svc.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 10000,
      idempotencyKey: "mysql-d",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000 }],
    })).rejects.toThrow(/falha forçada/);
    const counts = await h().query<{ l: number; a: number; m: number }[]>(
      `SELECT
        (SELECT COUNT(*) FROM financeiro_liquidacoes WHERE user_id = ?) l,
        (SELECT COUNT(*) FROM financeiro_liquidacao_alocacoes WHERE user_id = ?) a,
        (SELECT COUNT(*) FROM financeiro_movimentos WHERE user_id = ?) m`,
      [FIN_USER_A, FIN_USER_A, FIN_USER_A],
    );
    expect(Number(counts[0]?.l)).toBe(0);
    expect(Number(counts[0]?.a)).toBe(0);
    expect(Number(counts[0]?.m)).toBe(0);
  });

  it("E — pagamento parcial", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 4000,
      idempotencyKey: "mysql-e",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const depois = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    expect(depois.parcelas[0]!.saldoPrincipal).toBe(6000);
  });

  it("F — pagamento com desconto", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 9800,
      idempotencyKey: "mysql-f",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000, desconto: 200 }],
    });
    const depois = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    expect(depois.parcelas[0]!.quitada).toBe(true);
  });

  it("G — pagamento com juros gera saída 10.200", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const pag = await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 10200,
      idempotencyKey: "mysql-g",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000, juros: 200 }],
    });
    const mov = await h().query<{ valor: string; direcao: string }[]>(
      `SELECT valor, direcao FROM financeiro_movimentos WHERE liquidacao_id = ?`,
      [pag.id],
    );
    expect(Number(mov[0]?.valor)).toBe(10200);
    expect(mov[0]?.direcao).toBe("saida");
  });

  it("H — um pagamento quita várias parcelas", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(25000, [
      { numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 },
      { numero: 2, vencimento: "2026-12-01", valorOriginal: 15000 },
    ]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const pag = await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 25000,
      idempotencyKey: "mysql-h",
      alocacoes: [
        { parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000 },
        { parcelaId: d.parcelas[1]!.id, principalLiquidado: 15000 },
      ],
    });
    const movs = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_movimentos WHERE liquidacao_id = ?`,
      [pag.id],
    );
    expect(Number(movs[0]?.n)).toBe(1);
  });

  it("I — retry com mesma idempotency_key", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(4000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 4000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const cmd = {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 4000,
      idempotencyKey: "mysql-i",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 4000 }],
    };
    const a = await h().service.criarPagamento(FIN_USER_A, cmd);
    const b = await h().service.criarPagamento(FIN_USER_A, cmd);
    expect(a.id).toBe(b.id);
    expect(b.idempotente).toBe(true);
    const n = await h().query<{ n: number }[]>(`SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE user_id = ?`, [FIN_USER_A]);
    expect(Number(n[0]?.n)).toBe(1);
  });

  it("J — overpayment falha", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    await expect(h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 11000,
      idempotencyKey: "mysql-j",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 11000 }],
    })).rejects.toMatchObject({ message: MSG_FIN_OVERPAYMENT });
  });

  it("K — transferência cria exatamente 2 movimentos", async () => {
    const a = await contaCaixa(8000);
    const b = await h().service.criarContaFinanceira(FIN_USER_A, {
      nome: "Banco",
      tipo: "conta_corrente",
      saldoAbertura: 0,
      dataSaldoAbertura: "2026-10-01",
    });
    const tr = await h().service.criarTransferencia(FIN_USER_A, {
      contaOrigemId: a.id,
      contaDestinoId: b.id,
      dataTransferencia: "2026-10-20",
      valor: 3000,
      idempotencyKey: "mysql-k",
    });
    const movs = await h().query<{ direcao: string; natureza: string; valor: string }[]>(
      `SELECT direcao, natureza, valor FROM financeiro_movimentos WHERE transferencia_id = ? ORDER BY direcao`,
      [tr.id],
    );
    expect(movs).toHaveLength(2);
    expect(movs.map(m => m.natureza).sort()).toEqual(["transferencia_entrada", "transferencia_saida"]);
    expect(movs.every(m => Number(m.valor) === 3000)).toBe(true);
  });

  it("L — retry de transferência", async () => {
    const a = await contaCaixa(8000);
    const b = await h().service.criarContaFinanceira(FIN_USER_A, {
      nome: "Banco",
      tipo: "conta_corrente",
      saldoAbertura: 0,
      dataSaldoAbertura: "2026-10-01",
    });
    const cmd = {
      contaOrigemId: a.id,
      contaDestinoId: b.id,
      dataTransferencia: "2026-10-20",
      valor: 1000,
      idempotencyKey: "mysql-l",
    };
    await h().service.criarTransferencia(FIN_USER_A, cmd);
    await h().service.criarTransferencia(FIN_USER_A, cmd);
    const n = await h().query<{ n: number }[]>(`SELECT COUNT(*) n FROM financeiro_transferencias WHERE user_id = ?`, [FIN_USER_A]);
    expect(Number(n[0]?.n)).toBe(1);
  });

  it("M — estorno integral de pagamento com juros", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const pag = await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 10200,
      idempotencyKey: "mysql-m-pag",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000, juros: 200 }],
    });
    const est = await h().service.estornarLiquidacao(FIN_USER_A, {
      liquidacaoId: pag.id,
      idempotencyKey: "mysql-m-est",
      dataLiquidacao: "2026-10-16",
    });
    const orig = await h().query<{ id: number }[]>(`SELECT id FROM financeiro_liquidacoes WHERE id = ?`, [pag.id]);
    expect(orig).toHaveLength(1);
    const estorno = await h().query<{ liquidacao_original_id: number; tipo: string }[]>(
      `SELECT liquidacao_original_id, tipo FROM financeiro_liquidacoes WHERE id = ?`,
      [est.id],
    );
    expect(estorno[0]?.liquidacao_original_id).toBe(pag.id);
    expect(estorno[0]?.tipo).toBe("estorno_pagamento");
    const movs = await h().query<{ direcao: string; natureza: string; valor: string }[]>(
      `SELECT direcao, natureza, valor FROM financeiro_movimentos WHERE user_id = ? ORDER BY id`,
      [FIN_USER_A],
    );
    expect(movs).toHaveLength(2);
    expect(movs[0]?.direcao).toBe("saida");
    expect(movs[1]?.direcao).toBe("entrada");
    expect(Number(movs[1]?.valor)).toBe(10200);
    const depois = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    expect(depois.parcelas[0]!.saldoPrincipal).toBe(10000);
  });

  it("N — segundo estorno integral falha", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(1000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 1000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const pag = await h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-15",
      valorMovimentado: 1000,
      idempotencyKey: "mysql-n-pag",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 1000 }],
    });
    await h().service.estornarLiquidacao(FIN_USER_A, {
      liquidacaoId: pag.id,
      idempotencyKey: "mysql-n-est1",
      dataLiquidacao: "2026-10-16",
    });
    await expect(h().service.estornarLiquidacao(FIN_USER_A, {
      liquidacaoId: pag.id,
      idempotencyKey: "mysql-n-est2",
      dataLiquidacao: "2026-10-17",
    })).rejects.toMatchObject({ message: MSG_FIN_LIQUIDACAO_JA_ESTORNADA });
  });

  it("O — estorno de transferência", async () => {
    const a = await contaCaixa(8000);
    const b = await h().service.criarContaFinanceira(FIN_USER_A, {
      nome: "Banco",
      tipo: "conta_corrente",
      saldoAbertura: 0,
      dataSaldoAbertura: "2026-10-01",
    });
    const tr = await h().service.criarTransferencia(FIN_USER_A, {
      contaOrigemId: a.id,
      contaDestinoId: b.id,
      dataTransferencia: "2026-10-20",
      valor: 2000,
      idempotencyKey: "mysql-o",
    });
    await h().service.estornarTransferencia(FIN_USER_A, {
      transferenciaId: tr.id,
      idempotencyKey: "mysql-o-est",
      dataTransferencia: "2026-10-21",
    });
    expect(await h().service.calcularSaldoConta(FIN_USER_A, a.id)).toBe(8000);
    expect(await h().service.calcularSaldoConta(FIN_USER_A, b.id)).toBe(0);
    const orig = await h().query<{ estado: string }[]>(`SELECT estado FROM financeiro_transferencias WHERE id = ?`, [tr.id]);
    expect(orig[0]?.estado).toBe("estornada");
  });

  it("P — isolamento entre usuários", async () => {
    const conta = await contaCaixa();
    await expect(h().service.obterConta(FIN_USER_B, conta.id)).rejects.toBeInstanceOf(TRPCError);
    await expect(h().service.criarTitulo(FIN_USER_A, {
      tipo: "pagar",
      pessoaId: pessoaB,
      descricao: "Pessoa de B",
      dataCompetencia: "2026-10-02",
      valorOriginal: 10,
    })).rejects.toBeInstanceOf(TRPCError);
    await expect(h().service.criarCentroCusto(FIN_USER_A, {
      nome: "Centro B",
      fazendaId: fazendaB,
    })).rejects.toBeInstanceOf(TRPCError);
    const catB = await h().service.criarCategoria(FIN_USER_B, { nome: "Saída B", tipo: "saida" });
    const titulo = await tituloPagar(50, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 50 }]);
    await expect(h().service.apropriar(FIN_USER_A, titulo.id, [
      { valor: 50, categoriaId: catB.id, fazendaId: fazendaA1 },
    ])).rejects.toBeInstanceOf(TRPCError);
  });

  it("Q — FK rejeita pessoa inexistente", async () => {
    await expect(h().pool.query(
      `INSERT INTO financeiro_titulos
        (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, origem_tipo, descricao, data_competencia, valor_original)
       VALUES (?, 'pagar', 'ativo', 'a_definir', 999999001, 'X', 'manual', 'FK', '2026-10-01', 10)`,
      [FIN_USER_A],
    )).rejects.toThrow();
  });

  it("R — UNIQUE de origem e idempotência no MySQL", async () => {
    await h().service.criarTitulo(FIN_USER_A, {
      tipo: "pagar", pessoaId: pessoaA, descricao: "Manual 1", dataCompetencia: "2026-10-01", valorOriginal: 10,
    });
    await h().service.criarTitulo(FIN_USER_A, {
      tipo: "pagar", pessoaId: pessoaA, descricao: "Manual 2", dataCompetencia: "2026-10-01", valorOriginal: 20,
    });
    await h().service.criarTitulo(FIN_USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Auto 1",
      dataCompetencia: "2026-10-01",
      valorOriginal: 30,
      origemTipo: "compra_animais",
      origemId: 15,
      origemItemChave: "animais",
    });
    await expect(h().service.criarTitulo(FIN_USER_A, {
      tipo: "pagar",
      pessoaId: pessoaA,
      descricao: "Auto 2",
      dataCompetencia: "2026-10-01",
      valorOriginal: 30,
      origemTipo: "compra_animais",
      origemId: 15,
      origemItemChave: "animais",
    })).rejects.toBeInstanceOf(TRPCError);

    await expect(h().pool.query(
      `INSERT INTO financeiro_titulos
        (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, origem_tipo, origem_id, origem_item_chave, descricao, data_competencia, valor_original)
       VALUES (?, 'pagar', 'ativo', 'a_definir', ?, 'X', 'compra_insumos', 82, NULL, 'NULL chave 1', '2026-10-01', 1),
              (?, 'pagar', 'ativo', 'a_definir', ?, 'X', 'compra_insumos', 82, NULL, 'NULL chave 2', '2026-10-01', 1)`,
      [FIN_USER_A, pessoaA, FIN_USER_A, pessoaA],
    )).resolves.toBeTruthy();
  });

  it("data anterior à abertura é recusada no MySQL", async () => {
    const conta = await contaCaixa(50000, "2026-10-01");
    const titulo = await tituloPagar(1000, [{ numero: 1, vencimento: "2026-09-30", valorOriginal: 1000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    await expect(h().service.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-09-30",
      valorMovimentado: 1000,
      idempotencyKey: "mysql-data",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 1000 }],
    })).rejects.toMatchObject({ message: MSG_FIN_DATA_ANTES_ABERTURA });
  });

  it("parcelas 33,33 + 33,33 + 33,34 fecham no DECIMAL", async () => {
    const titulo = await tituloPagar(100, [
      { numero: 1, vencimento: "2026-11-01", valorOriginal: 33.33 },
      { numero: 2, vencimento: "2026-12-01", valorOriginal: 33.33 },
      { numero: 3, vencimento: "2027-01-01", valorOriginal: 33.34 },
    ]);
    expect(await h().service.validarIntegridadeTitulo(FIN_USER_A, titulo.id)).toEqual({ ok: true });
  });

  it("concorrência: duas liquidações de 10.000 na mesma parcela", async () => {
    const conta = await contaCaixa();
    const titulo = await tituloPagar(10000, [{ numero: 1, vencimento: "2026-11-01", valorOriginal: 10000 }]);
    const d = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    const parcelaId = d.parcelas[0]!.id;
    const resultados = await Promise.allSettled([
      h().service.criarPagamento(FIN_USER_A, {
        contaId: conta.id,
        dataLiquidacao: "2026-10-15",
        valorMovimentado: 10000,
        idempotencyKey: "mysql-conc-a",
        alocacoes: [{ parcelaId, principalLiquidado: 10000 }],
      }),
      h().service.criarPagamento(FIN_USER_A, {
        contaId: conta.id,
        dataLiquidacao: "2026-10-15",
        valorMovimentado: 10000,
        idempotencyKey: "mysql-conc-b",
        alocacoes: [{ parcelaId, principalLiquidado: 10000 }],
      }),
    ]);
    const ok = resultados.filter(r => r.status === "fulfilled");
    const fail = resultados.filter(r => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    if (fail[0]?.status === "rejected") {
      expect(String((fail[0].reason as Error).message)).toMatch(/ultrapassar o saldo|Deadlock|lock/i);
    }
    const liqs = await h().query<{ n: number }[]>(`SELECT COUNT(*) n FROM financeiro_liquidacoes WHERE user_id = ?`, [FIN_USER_A]);
    const alocs = await h().query<{ n: number }[]>(`SELECT COUNT(*) n FROM financeiro_liquidacao_alocacoes WHERE user_id = ?`, [FIN_USER_A]);
    const movs = await h().query<{ n: number }[]>(`SELECT COUNT(*) n FROM financeiro_movimentos WHERE user_id = ?`, [FIN_USER_A]);
    expect(Number(liqs[0]?.n)).toBe(1);
    expect(Number(alocs[0]?.n)).toBe(1);
    expect(Number(movs[0]?.n)).toBe(1);
    const depois = await h().service.detalheTitulo(FIN_USER_A, titulo.id);
    expect(depois.parcelas[0]!.saldoPrincipal).toBe(0);
  });
});

if (!harness) {
  describe("financeiroNucleo — MySQL isolado", () => {
    it("ambiente MySQL de teste indisponível — suíte isolada não executada", () => {
      expect(harness).toBeNull();
    });
  });
}
