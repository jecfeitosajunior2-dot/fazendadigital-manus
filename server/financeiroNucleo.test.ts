import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  createFinanceiroNucleoService,
  isDeadlockMysql,
  isDuplicateChaveIdempotenciaLiquidacao,
  isDuplicateOrigemLiquidacao,
} from "./financeiroNucleo";
import { cenarioBase, criarStore } from "./financeiroNucleoMemoria";
import {
  MSG_FIN_CANCELAR_COM_LIQUIDACAO,
  MSG_FIN_CATEGORIA_TIPO,
  MSG_FIN_CENTRO_FAZENDA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_IDEMPOTENCIA_CONFLITO,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
  MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA,
  MSG_FIN_MOVIMENTO_LIQUIDACAO,
  MSG_FIN_ORIGEM_AUTOMATICA,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_PESSOAS_MISTURADAS,
  MSG_FIN_TITULO_CANCELADO,
} from "../shared/financeiroNucleo";

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

describe("financeiroNucleo — idempotência segura 3C.5.4", () => {
  it("A — retry legítimo do mesmo estorno não duplica", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-est-retry",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "est-pag-retry", dataLiquidacao: "2026-03-08" };
    const a = await svc.estornarLiquidacao(10, cmd);
    const b = await svc.estornarLiquidacao(10, cmd);
    expect(a.id).toBe(b.id);
    expect(b.idempotente).toBe(true);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
    expect(store.alocacoes).toHaveLength(2);
  });

  it("B — chave de pagamento não serve como sucesso de estorno", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-usada-no-estorno",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await expect(svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "pag-usada-no-estorno",
      dataLiquidacao: "2026-03-08",
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_FIN_IDEMPOTENCIA_CONFLITO });
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.movimentos).toHaveLength(1);
    expect(store.alocacoes).toHaveLength(1);
  });

  it("C — chave de outro estorno não estorna liquidação diferente", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag1 = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-1",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const pag2 = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 5000,
      idempotencyKey: "pag-2",
      alocacoes: [{ parcelaId: parcelas[1]!.id, principalLiquidado: 5000 }],
    });
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag1.id,
      idempotencyKey: "est-pag-1",
      dataLiquidacao: "2026-03-08",
    });
    await expect(svc.estornarLiquidacao(10, {
      liquidacaoId: pag2.id,
      idempotencyKey: "est-pag-1",
      dataLiquidacao: "2026-03-08",
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_FIN_IDEMPOTENCIA_CONFLITO });
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.liquidacoes.find(l => l.liquidacaoOriginalId === pag2.id)).toBeUndefined();
  });

  it("D — retry legítimo de pagamento não duplica", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const cmd = {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-retry-id",
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

  it("E — mesma chave de pagamento com parâmetros diferentes é recusada", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-params",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await expect(svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-03",
      valorMovimentado: 5000,
      idempotencyKey: "pag-params",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 5000 }],
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_FIN_IDEMPOTENCIA_CONFLITO });
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.alocacoes).toHaveLength(1);
    expect(store.movimentos).toHaveLength(1);
    expect(store.liquidacoes[0]!.valorMovimentado).toBe("4000.00");
  });

  it("L — segundo estorno da mesma liquidação continua JA_ESTORNADA e não duplica", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-ja-est",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "est-pag-ja",
      dataLiquidacao: "2026-03-08",
    });
    await expect(svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "est-pag-outra",
      dataLiquidacao: "2026-03-09",
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_FIN_LIQUIDACAO_JA_ESTORNADA });
    expect(store.liquidacoes).toHaveLength(2);
    expect(store.movimentos).toHaveLength(2);
    expect(store.alocacoes).toHaveLength(2);
  });

  it("retry paralelo da mesma chave não duplica movimento nem alocação", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-conc-est",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "est-pag-conc", dataLiquidacao: "2026-03-08" };
    const primeiro = await svc.estornarLiquidacao(10, cmd);
    const paralelos = await Promise.all([
      svc.estornarLiquidacao(10, cmd),
      svc.estornarLiquidacao(10, cmd),
    ]);
    expect(paralelos.every(r => r.id === primeiro.id && r.idempotente === true)).toBe(true);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
    expect(store.alocacoes.filter(a => a.liquidacaoId === primeiro.id)).toHaveLength(1);
    expect(store.movimentos).toHaveLength(2);
  });

  it("duas chaves novas em paralelo contra liquidação já estornada não criam segundo estorno", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "pag-conc-novo",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "est-pag-oficial",
      dataLiquidacao: "2026-03-08",
    });
    const tentativas = await Promise.allSettled([
      svc.estornarLiquidacao(10, {
        liquidacaoId: pag.id,
        idempotencyKey: "est-pag-novo-a",
        dataLiquidacao: "2026-03-09",
      }),
      svc.estornarLiquidacao(10, {
        liquidacaoId: pag.id,
        idempotencyKey: "est-pag-novo-b",
        dataLiquidacao: "2026-03-09",
      }),
    ]);
    expect(tentativas.every(r => r.status === "rejected")).toBe(true);
    expect(tentativas.map(r => r.status === "rejected" ? r.reason.message : null)).toEqual([
      MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
      MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
    ]);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
  });
});

describe("financeiroNucleo — segurança transacional 3E.8B", () => {
  it("A — recebimento normal quita a parcela a receber", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, {
      nome: "Caixa", tipo: "caixa", saldoAbertura: 50000, dataSaldoAbertura: "2026-01-01",
    });
    const titulo = await svc.criarTitulo(10, {
      tipo: "receber", pessoaId: 1, descricao: "Venda", dataCompetencia: "2026-02-01",
      valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-02-10", valorOriginal: 10000 }],
    });
    const d = await svc.detalheTitulo(10, titulo.id);
    const rec = await svc.criarRecebimento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-02-10",
      valorMovimentado: 10000,
      idempotencyKey: "3e8b-rec",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    const depois = await svc.detalheTitulo(10, titulo.id);
    expect(depois.parcelas[0]!.quitada).toBe(true);
    expect(depois.parcelas[0]!.saldoPrincipal).toBe(0);
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.liquidacoes[0]!.tipo).toBe("recebimento");
    expect(store.movimentos[0]!.direcao).toBe("entrada");
    expect(rec.idempotente).toBe(false);
    expect(await svc.calcularSaldoConta(10, conta.id)).toBe(60000);
  });

  it("B — pagamento normal quita a parcela a pagar", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 10000,
      idempotencyKey: "3e8b-pag",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    const d = await svc.detalheTitulo(10, parcelas[0]!.tituloId);
    expect(d.parcelas[0]!.quitada).toBe(true);
    expect(store.liquidacoes[0]!.tipo).toBe("pagamento");
    expect(store.movimentos[0]!.direcao).toBe("saida");
    expect(await svc.calcularSaldoConta(10, contaId)).toBe(40000);
  });

  it("C — estorno de recebimento preserva original, alocações e movimentos", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, {
      nome: "Caixa", tipo: "caixa", saldoAbertura: 50000, dataSaldoAbertura: "2026-01-01",
    });
    const titulo = await svc.criarTitulo(10, {
      tipo: "receber", pessoaId: 1, descricao: "Venda", dataCompetencia: "2026-02-01",
      valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-02-10", valorOriginal: 10000 }],
    });
    const d = await svc.detalheTitulo(10, titulo.id);
    const rec = await svc.criarRecebimento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-02-10",
      valorMovimentado: 10000,
      idempotencyKey: "3e8b-rec-est",
      alocacoes: [{ parcelaId: d.parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    const original = store.liquidacoes.find(l => l.id === rec.id)!;
    await svc.estornarLiquidacao(10, {
      liquidacaoId: rec.id,
      idempotencyKey: "3e8b-est-rec",
      dataLiquidacao: "2026-02-11",
    });
    expect(store.liquidacoes).toHaveLength(2);
    expect(store.liquidacoes.find(l => l.id === rec.id)).toMatchObject({
      tipo: "recebimento",
      valorMovimentado: original.valorMovimentado,
      contaId: original.contaId,
    });
    const estorno = store.liquidacoes.find(l => l.tipo === "estorno_recebimento")!;
    expect(estorno.liquidacaoOriginalId).toBe(rec.id);
    expect(estorno.valorMovimentado).toBe(original.valorMovimentado);
    expect(estorno.contaId).toBe(original.contaId);
    expect(store.alocacoes).toHaveLength(2);
    expect(store.movimentos).toHaveLength(2);
    expect(store.movimentos.find(m => m.natureza === "estorno_recebimento")!.movimentoOriginalId)
      .toBe(store.movimentos.find(m => m.liquidacaoId === rec.id)!.id);
    const depois = await svc.detalheTitulo(10, titulo.id);
    expect(depois.parcelas[0]!.saldoPrincipal).toBe(10000);
    expect(await svc.calcularSaldoConta(10, conta.id)).toBe(50000);
  });

  it("D — estorno de pagamento preserva histórico e devolve o saldo", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-est",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "3e8b-est-pag",
      dataLiquidacao: "2026-03-08",
    });
    expect(store.liquidacoes.map(l => l.tipo)).toEqual(["pagamento", "estorno_pagamento"]);
    expect(store.liquidacoes[1]!.valorMovimentado).toBe(store.liquidacoes[0]!.valorMovimentado);
    expect(store.alocacoes).toHaveLength(2);
    expect(store.movimentos).toHaveLength(2);
    const d = await svc.detalheTitulo(10, parcelas[0]!.tituloId);
    expect(d.parcelas[0]!.saldoPrincipal).toBe(10000);
    expect(await svc.calcularSaldoConta(10, contaId)).toBe(50000);
  });

  it("E — segundo estorno é recusado e não duplica registros", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-2est",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-1", dataLiquidacao: "2026-03-08",
    });
    await expect(svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-2", dataLiquidacao: "2026-03-09",
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_FIN_LIQUIDACAO_JA_ESTORNADA });
    expect(store.liquidacoes.filter(l => l.tipo.startsWith("estorno_"))).toHaveLength(1);
    expect(store.movimentos).toHaveLength(2);
    expect(store.alocacoes).toHaveLength(2);
  });

  it("F — estorno histórico permanece permitido com título já cancelado", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-canc",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const titulo = store.titulos.find(t => t.id === parcelas[0]!.tituloId)!;
    titulo.estado = "cancelado";
    await expect(svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-03",
      valorMovimentado: 1000,
      idempotencyKey: "3e8b-pag-novo-canc",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 1000 }],
    })).rejects.toMatchObject({ message: MSG_FIN_TITULO_CANCELADO });
    const estorno = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-canc", dataLiquidacao: "2026-03-08",
    });
    expect(estorno.idempotente).toBe(false);
    expect(store.liquidacoes).toHaveLength(2);
    expect(store.liquidacoes.find(l => l.id === pag.id)!.tipo).toBe("pagamento");
    expect(store.titulos.find(t => t.id === titulo.id)!.estado).toBe("cancelado");
    expect(await svc.calcularSaldoConta(10, contaId)).toBe(50000);
  });

  it("G — cancelamento sem liquidação efetiva é permitido", async () => {
    const { svc, tituloId, store } = await cenarioBase();
    await svc.cancelarTitulo(10, tituloId, "sem liquidação");
    expect(store.titulos.find(t => t.id === tituloId)!.estado).toBe("cancelado");
  });

  it("H — cancelamento com liquidação efetiva é recusado", async () => {
    const { svc, contaId, parcelas, tituloId, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-canc-liq",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await expect(svc.cancelarTitulo(10, tituloId, "com liquidação"))
      .rejects.toMatchObject({ message: MSG_FIN_CANCELAR_COM_LIQUIDACAO });
    expect(store.titulos.find(t => t.id === tituloId)!.estado).toBe("ativo");
    expect(store.liquidacoes).toHaveLength(1);
  });

  it("I — cancelamento após estorno é permitido porque não há liquidação efetiva", async () => {
    const { svc, contaId, parcelas, tituloId, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-apos-est",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-apos", dataLiquidacao: "2026-03-08",
    });
    await svc.cancelarTitulo(10, tituloId, "após estorno");
    expect(store.titulos.find(t => t.id === tituloId)!.estado).toBe("cancelado");
    expect(store.liquidacoes).toHaveLength(2);
    expect(store.movimentos).toHaveLength(2);
  });

  it("J — falha no estorno faz rollback e não deixa rastro", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-roll",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const failing = createFinanceiroNucleoService({
      transaction(fn) {
        return store.transaction(async tx => fn({
          ...tx,
          insertMovimento: async row => {
            if (String(row.natureza).startsWith("estorno_")) {
              throw new Error("falha estorno forçada");
            }
            return tx.insertMovimento(row);
          },
        }));
      },
    });
    await expect(failing.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-roll", dataLiquidacao: "2026-03-08",
    })).rejects.toThrow("falha estorno forçada");
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.liquidacoes[0]!.id).toBe(pag.id);
    expect(store.alocacoes).toHaveLength(1);
    expect(store.movimentos).toHaveLength(1);
    expect(store.movimentos[0]!.natureza).toBe("pagamento");
  });

  it("K — retry da mesma chave de estorno é idempotente", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-idemp",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "3e8b-est-idemp", dataLiquidacao: "2026-03-08" };
    const a = await svc.estornarLiquidacao(10, cmd);
    const b = await svc.estornarLiquidacao(10, cmd);
    expect(b.id).toBe(a.id);
    expect(b.idempotente).toBe(true);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
  });

  it("L — isolamento por usuário: outro userId não enxerga a liquidação", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-iso",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await expect(svc.estornarLiquidacao(99, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-iso", dataLiquidacao: "2026-03-08",
    })).rejects.toMatchObject({ code: "NOT_FOUND", message: MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA });
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.movimentos).toHaveLength(1);
  });

  it("M — movimentos originais e de estorno ficam preservados", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8b-pag-mov",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const originalMov = { ...store.movimentos[0]! };
    await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8b-est-mov", dataLiquidacao: "2026-03-08",
    });
    expect(store.movimentos).toHaveLength(2);
    expect(store.movimentos[0]).toMatchObject({
      id: originalMov.id,
      valor: originalMov.valor,
      direcao: "saida",
      natureza: "pagamento",
      liquidacaoId: pag.id,
    });
    expect(store.movimentos[1]!.movimentoOriginalId).toBe(originalMov.id);
    expect(store.movimentos[1]!.valor).toBe(originalMov.valor);
    expect(store.movimentos[1]!.direcao).toBe("entrada");
  });

  it("N — precisão dos valores do estorno copia o original em centavos", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 10200,
      idempotencyKey: "3e8b-pag-prec",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, juros: 200 }],
    });
    const original = store.liquidacoes[0]!;
    await svc.estornarLiquidacao(10, {
      liquidacaoId: original.id, idempotencyKey: "3e8b-est-prec", dataLiquidacao: "2026-03-08",
    });
    const estorno = store.liquidacoes.find(l => l.tipo === "estorno_pagamento")!;
    expect(original.valorMovimentado).toBe("10200.00");
    expect(estorno.valorMovimentado).toBe("10200.00");
    expect(store.alocacoes[1]!.principalLiquidado).toBe(store.alocacoes[0]!.principalLiquidado);
    expect(store.alocacoes[1]!.juros).toBe(store.alocacoes[0]!.juros);
    expect(await svc.calcularSaldoConta(10, contaId)).toBe(50000);
  });
});

describe("financeiroNucleo — recuperação de deadlock 3E.8G", () => {
  it("A — deadlock 1213 direto é retentado em transação nova", async () => {
    const store = criarStore({ deadlocksRestantes: 1 });
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, { nome: "Caixa", tipo: "caixa", saldoAbertura: 50000, dataSaldoAbertura: "2026-01-01" });
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Compra", dataCompetencia: "2026-02-01", valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 }],
    });
    const detalhe = await svc.detalheTitulo(10, titulo.id);
    const antes = store.transacoes;
    const pag = await svc.criarPagamento(10, {
      contaId: conta.id, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-dl-a",
      alocacoes: [{ parcelaId: detalhe.parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    expect(pag.idempotente).toBe(false);
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.transacoes).toBeGreaterThan(antes + 1);
  });

  it("B — deadlock encapsulado no cause do Drizzle também retenta", async () => {
    const { store, contaId, parcelas } = await cenarioBase();
    let rest = 1;
    const orig = store.transaction.bind(store);
    const wrapped = {
      transaction<T>(fn: Parameters<typeof orig>[0]): Promise<T> {
        if (rest > 0) {
          rest -= 1;
          const cause = Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213, code: "ER_LOCK_DEADLOCK" });
          throw Object.assign(new Error("Failed query: SELECT ... FOR UPDATE"), { cause });
        }
        return orig(fn) as Promise<T>;
      },
    };
    const svc = createFinanceiroNucleoService(wrapped);
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-dl-b",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    expect(pag.id).toBeGreaterThan(0);
    expect(store.liquidacoes).toHaveLength(1);
  });

  it("C/D — rollback ocorre antes do retry e a chave de idempotência se preserva", async () => {
    const store = criarStore({ deadlocksRestantes: 1 });
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, { nome: "Caixa", tipo: "caixa", saldoAbertura: 50000, dataSaldoAbertura: "2026-01-01" });
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Compra", dataCompetencia: "2026-02-01", valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 }],
    });
    const detalhe = await svc.detalheTitulo(10, titulo.id);
    expect(store.liquidacoes).toHaveLength(0);
    await svc.criarPagamento(10, {
      contaId: conta.id, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-dl-cd",
      alocacoes: [{ parcelaId: detalhe.parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    expect(store.liquidacoes).toHaveLength(1);
    expect(store.liquidacoes[0]!.idempotencyKey).toBe("pag-dl-cd");
  });

  it("E — retry do estorno preserva a mesma chave", async () => {
    const { store, contaId, parcelas } = await cenarioBase();
    const baseSvc = createFinanceiroNucleoService(store);
    const pag = await baseSvc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-dl-e",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    let rest = 1;
    const orig = store.transaction.bind(store);
    const wrapped = {
      transaction<T>(fn: Parameters<typeof orig>[0]): Promise<T> {
        if (rest > 0) {
          rest -= 1;
          throw Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213, code: "ER_LOCK_DEADLOCK" });
        }
        return orig(fn) as Promise<T>;
      },
    };
    const svc = createFinanceiroNucleoService(wrapped);
    const est = await svc.estornarLiquidacao(10, { liquidacaoId: pag.id, idempotencyKey: "est-dl-e", dataLiquidacao: "2026-03-08" });
    expect(est.idempotente).toBe(false);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.liquidacoes.find(l => l.tipo === "estorno_pagamento")!.idempotencyKey).toBe("est-dl-e");
  });

  it("F — estoura o limite de tentativas e não grava", async () => {
    const store = criarStore({ deadlocksRestantes: 8 });
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, { nome: "Caixa", tipo: "caixa", saldoAbertura: 50000, dataSaldoAbertura: "2026-01-01" });
    const titulo = await svc.criarTitulo(10, {
      tipo: "pagar", pessoaId: 1, descricao: "Compra", dataCompetencia: "2026-02-01", valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 }],
    });
    const detalhe = await svc.detalheTitulo(10, titulo.id);
    await expect(svc.criarPagamento(10, {
      contaId: conta.id, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-dl-f",
      alocacoes: [{ parcelaId: detalhe.parcelas[0]!.id, principalLiquidado: 4000 }],
    })).rejects.toMatchObject({ errno: 1213 });
    expect(store.liquidacoes).toHaveLength(0);
  });

  it("G — erro não recuperável não entra em loop", async () => {
    const { store, contaId, parcelas } = await cenarioBase();
    const wrapped = {
      transaction<T>(fn: Parameters<typeof store.transaction>[0]): Promise<T> {
        return store.transaction(async tx => fn({
          ...tx,
          insertLiquidacao: async () => {
            throw new Error("falha permanente");
          },
        })) as Promise<T>;
      },
    };
    const svc = createFinanceiroNucleoService(wrapped);
    await expect(svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-dl-g",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    })).rejects.toThrow("falha permanente");
    expect(store.liquidacoes).toHaveLength(0);
  });

  it("H — mesmo estorno, mesma chave devolve o mesmo id", async () => {
    const { svc, store, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-h2",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "est-h2", dataLiquidacao: "2026-03-08" };
    const a = await svc.estornarLiquidacao(10, cmd);
    const b = await svc.estornarLiquidacao(10, cmd);
    expect(b.id).toBe(a.id);
    expect(b.idempotente).toBe(true);
    expect(store.liquidacoes.filter(l => String(l.tipo).startsWith("estorno_"))).toHaveLength(1);
    expect(store.movimentos).toHaveLength(2);
  });

  it("I — mesmo estorno, chave diferente continua JA_ESTORNADA", async () => {
    const { svc, store, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-h2b",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, { liquidacaoId: pag.id, idempotencyKey: "est-h2b-1", dataLiquidacao: "2026-03-08" });
    await expect(svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "est-h2b-2", dataLiquidacao: "2026-03-08",
    })).rejects.toMatchObject({ message: MSG_FIN_LIQUIDACAO_JA_ESTORNADA });
    expect(store.liquidacoes.filter(l => String(l.tipo).startsWith("estorno_"))).toHaveLength(1);
  });

  it("J — estorno × cancelamento: título cancelado só sem liquidação efetiva", async () => {
    const { svc, store, contaId, tituloId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-jx",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const r = await Promise.allSettled([
      svc.estornarLiquidacao(10, { liquidacaoId: pag.id, idempotencyKey: "est-jx", dataLiquidacao: "2026-03-08" }),
      svc.cancelarTitulo(10, tituloId, "corrida 3E.8G"),
    ]);
    const tit = store.titulos.find(t => t.id === tituloId)!;
    const efetiva = store.liquidacoes.some(l => l.id === pag.id && !store.liquidacoes.some(e => e.liquidacaoOriginalId === pag.id));
    expect(!(tit.estado === "cancelado" && efetiva)).toBe(true);
    expect(r.some(x => x.status === "fulfilled")).toBe(true);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
  });

  it("K — estorno × recebimento não duplica movimento", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, { nome: "Caixa", tipo: "caixa", saldoAbertura: 50000, dataSaldoAbertura: "2026-01-01" });
    const titulo = await svc.criarTitulo(10, {
      tipo: "receber", pessoaId: 1, descricao: "Venda", dataCompetencia: "2026-02-01", valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 }],
    });
    const detalhe = await svc.detalheTitulo(10, titulo.id);
    const rec = await svc.criarRecebimento(10, {
      contaId: conta.id, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "rec-k",
      alocacoes: [{ parcelaId: detalhe.parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const r = await Promise.allSettled([
      svc.estornarLiquidacao(10, { liquidacaoId: rec.id, idempotencyKey: "est-k", dataLiquidacao: "2026-03-08" }),
      svc.criarRecebimento(10, {
        contaId: conta.id, dataLiquidacao: "2026-03-02", valorMovimentado: 5000, idempotencyKey: "rec-k2",
        alocacoes: [{ parcelaId: detalhe.parcelas[0]!.id, principalLiquidado: 5000 }],
      }),
    ]);
    expect(r.some(x => x.status === "fulfilled")).toBe(true);
    const idsMov = store.movimentos.map(m => m.id);
    expect(new Set(idsMov).size).toBe(idsMov.length);
    const saldo = await svc.calcularSaldoConta(10, conta.id);
    expect(Number.isInteger(saldo)).toBe(true);
  });

  it("L — pagamento e estorno preservam o original", async () => {
    const { svc, store, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-l",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await svc.estornarLiquidacao(10, { liquidacaoId: pag.id, idempotencyKey: "est-l", dataLiquidacao: "2026-03-08" });
    expect(store.liquidacoes.find(l => l.id === pag.id)!.tipo).toBe("pagamento");
    expect(store.movimentos.filter(m => m.liquidacaoId === pag.id)).toHaveLength(1);
  });

  it("M — isolamento por usuário", async () => {
    const { svc, store, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-m",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await expect(svc.estornarLiquidacao(99, {
      liquidacaoId: pag.id, idempotencyKey: "est-m", dataLiquidacao: "2026-03-08",
    })).rejects.toBeInstanceOf(TRPCError);
    expect(store.liquidacoes).toHaveLength(1);
  });

  it("N — precisão monetária do estorno", async () => {
    const { svc, store, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 10200, idempotencyKey: "pag-n",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, juros: 200 }],
    });
    await svc.estornarLiquidacao(10, { liquidacaoId: pag.id, idempotencyKey: "est-n", dataLiquidacao: "2026-03-08" });
    expect(store.liquidacoes.find(l => l.tipo === "estorno_pagamento")!.valorMovimentado).toBe("10200.00");
    expect(await svc.calcularSaldoConta(10, contaId)).toBe(50000);
  });

  it("O — movimentos não duplicam no retry da mesma chave", async () => {
    const { svc, store, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId, dataLiquidacao: "2026-03-02", valorMovimentado: 4000, idempotencyKey: "pag-o",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "est-o", dataLiquidacao: "2026-03-08" };
    await svc.estornarLiquidacao(10, cmd);
    await svc.estornarLiquidacao(10, cmd);
    expect(store.movimentos).toHaveLength(2);
    expect(store.alocacoes).toHaveLength(2);
  });

  it("reconhece 1213 e 1062 encapsulados pelo Drizzle", () => {
    const dl = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213, code: "ER_LOCK_DEADLOCK" }),
    });
    expect(isDeadlockMysql(dl)).toBe(true);
    const idem = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("Duplicate entry for key 'financeiro_liquidacoes.financeiro_liquidacoes_idem_uq'"), { errno: 1062 }),
    });
    const orig = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("Duplicate entry for key 'financeiro_liquidacoes.financeiro_liquidacoes_original_uq'"), { errno: 1062 }),
    });
    expect(isDuplicateChaveIdempotenciaLiquidacao(idem)).toBe(true);
    expect(isDuplicateOrigemLiquidacao(orig)).toBe(true);
    expect(isDuplicateChaveIdempotenciaLiquidacao(orig)).toBe(false);
  });
});

describe("financeiroNucleo — recuperação de estorno 3E.8I", () => {
  it("A — estorno normal devolve movimentoId do inverso", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-a",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const est = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8i-est-a", dataLiquidacao: "2026-03-08",
    });
    const inverso = store.movimentos.find(m => m.liquidacaoId === est.id);
    expect(est.movimentoId).toBe(inverso?.id);
    expect(est.movimentoId).toBeGreaterThan(0);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
  });

  it("B — retry da mesma chave devolve os mesmos IDs", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-b",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "3e8i-est-b", dataLiquidacao: "2026-03-08" };
    const a = await svc.estornarLiquidacao(10, cmd);
    const b = await svc.estornarLiquidacao(10, cmd);
    expect(b.idempotente).toBe(true);
    expect(b.id).toBe(a.id);
    expect(b.movimentoId).toBe(a.movimentoId);
    expect(b.movimentoId).not.toBeNull();
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
  });

  it("C — duas chamadas simultâneas com a mesma chave", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-c",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "3e8i-est-c", dataLiquidacao: "2026-03-08" };
    const primeiro = await svc.estornarLiquidacao(10, cmd);
    const [x, y] = await Promise.all([
      svc.estornarLiquidacao(10, cmd),
      svc.estornarLiquidacao(10, cmd),
    ]);
    expect(x.id).toBe(primeiro.id);
    expect(y.id).toBe(primeiro.id);
    expect(x.movimentoId).toBe(primeiro.movimentoId);
    expect(y.movimentoId).toBe(primeiro.movimentoId);
    expect(x.movimentoId).toBeGreaterThan(0);
    expect(x.idempotente).toBe(true);
    expect(y.idempotente).toBe(true);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
  });

  it("D — chaves diferentes geram estornos distintos", async () => {
    const { svc, contaId, parcelas } = await cenarioBase();
    const pag1 = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-d1",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const pag2 = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-d2",
      alocacoes: [{ parcelaId: parcelas[1]!.id, principalLiquidado: 4000 }],
    });
    const e1 = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag1.id, idempotencyKey: "3e8i-est-d1", dataLiquidacao: "2026-03-08",
    });
    const e2 = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag2.id, idempotencyKey: "3e8i-est-d2", dataLiquidacao: "2026-03-08",
    });
    expect(e1.id).not.toBe(e2.id);
    expect(e1.movimentoId).not.toBe(e2.movimentoId);
  });

  it("E — movimento inverso existente na recuperação", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-e",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const a = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8i-est-e", dataLiquidacao: "2026-03-08",
    });
    const inverso = store.movimentos.find(m => m.liquidacaoId === a.id)!;
    const b = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8i-est-e", dataLiquidacao: "2026-03-08",
    });
    expect(b.movimentoId).toBe(inverso.id);
    expect(store.movimentos.filter(m => m.liquidacaoId === a.id)).toHaveLength(1);
  });

  it("F — movimento inverso ausente vira erro de integridade", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-f",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const est = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8i-est-f", dataLiquidacao: "2026-03-08",
    });
    const antes = store.movimentos.length;
    for (let i = store.movimentos.length - 1; i >= 0; i--) {
      if (store.movimentos[i]!.liquidacaoId === est.id) store.movimentos.splice(i, 1);
    }
    await expect(svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id, idempotencyKey: "3e8i-est-f", dataLiquidacao: "2026-03-08",
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_FIN_MOVIMENTO_LIQUIDACAO });
    expect(store.movimentos).toHaveLength(antes - 1);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
  });

  it("G — deadlock encapsulado continua reconhecido na recuperação", async () => {
    expect(isDeadlockMysql(Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213 }),
    }))).toBe(true);
  });

  it("H — precisão monetária do inverso se mantém no retry", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000.13,
      idempotencyKey: "3e8i-pag-h",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000.13 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "3e8i-est-h", dataLiquidacao: "2026-03-08" };
    const a = await svc.estornarLiquidacao(10, cmd);
    const b = await svc.estornarLiquidacao(10, cmd);
    const inverso = store.movimentos.find(m => m.id === b.movimentoId);
    expect(inverso?.valor).toBe(store.movimentos.find(m => m.liquidacaoId === pag.id)?.valor);
    expect(b.movimentoId).toBe(a.movimentoId);
  });

  it("I — isolamento por usuário", async () => {
    const { svc, contaId, parcelas } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-i",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    await expect(svc.estornarLiquidacao(99, {
      liquidacaoId: pag.id, idempotencyKey: "3e8i-est-i", dataLiquidacao: "2026-03-08",
    })).rejects.toMatchObject({ code: "NOT_FOUND", message: MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA });
  });

  it("J — nenhuma duplicação no retry", async () => {
    const { svc, contaId, parcelas, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "3e8i-pag-j",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const cmd = { liquidacaoId: pag.id, idempotencyKey: "3e8i-est-j", dataLiquidacao: "2026-03-08" };
    await svc.estornarLiquidacao(10, cmd);
    await svc.estornarLiquidacao(10, cmd);
    expect(store.liquidacoes.filter(l => l.tipo === "estorno_pagamento")).toHaveLength(1);
    expect(store.movimentos.filter(m => m.natureza === "estorno_pagamento")).toHaveLength(1);
  });
});
