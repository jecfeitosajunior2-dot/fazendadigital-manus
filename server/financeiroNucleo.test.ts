import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createFinanceiroNucleoService } from "./financeiroNucleo";
import { cenarioBase, criarStore } from "./financeiroNucleoMemoria";
import {
  MSG_FIN_CATEGORIA_TIPO,
  MSG_FIN_CENTRO_FAZENDA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_IDEMPOTENCIA_CONFLITO,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
  MSG_FIN_ORIGEM_AUTOMATICA,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_PESSOAS_MISTURADAS,
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
