import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createFinanceiroNucleoService } from "./financeiroNucleo";
import { cenarioBase, criarStore } from "./financeiroNucleoMemoria";
import { MSG_FIN_TITULO_NAO_ENCONTRADO } from "../shared/financeiroNucleo";

const raiz = join(dirname(fileURLToPath(import.meta.url)));
const nucleoSrc = readFileSync(join(raiz, "financeiroNucleo.ts"), "utf8");
const routerSrc = readFileSync(join(raiz, "financeiroV2Router.ts"), "utf8");
const detalhePage = readFileSync(join(raiz, "../client/src/pages/ContasAPagarDetalhePage.tsx"), "utf8");

function idsUnicos(ids: number[]) {
  return new Set(ids).size === ids.length;
}

describe("financeiroV2.tituloHistoricoPagamentos — Fase 3C.3.1", () => {
  it("contrato oficial: procedure de leitura com tituloId e isolamento por usuário", () => {
    expect(routerSrc).toContain("tituloHistoricoPagamentos: protectedProcedure");
    expect(routerSrc).toContain("historicoPagamentosTitulo(ctx.user.id, input.tituloId)");
    expect(routerSrc).toContain("titulosGet: protectedProcedure");
    expect(routerSrc).toContain("detalheTitulo(ctx.user.id, input.id)");
    expect(routerSrc).toMatch(
      /titulosGet: protectedProcedure\s*\.input\(z\.object\(\{ id: z\.number\(\)\.int\(\)\.positive\(\) \}\)\)\s*\.query\(\(\{ ctx, input \}\) => financeiroNucleoService\.detalheTitulo\(ctx\.user\.id, input\.id\)\)/,
    );
    expect(routerSrc).toContain("tituloHistoricoPagamentos: protectedProcedure");
    expect(nucleoSrc).toContain("async historicoPagamentosTitulo(userId: number, tituloId: number)");
    expect(nucleoSrc).toContain("listAlocacoesPorParcelas");
    expect(nucleoSrc).toContain("listAlocacoesLiquidacao");
    expect(nucleoSrc).toContain("titulosNaLiquidacao");
    expect(nucleoSrc).toContain("listLiquidacoesPorIds");
    expect(nucleoSrc).toContain("listContasPorIds");
    expect(nucleoSrc).toContain("derivarSaldoParcela");
    expect(nucleoSrc).toContain("caixaDaAlocacao");
    expect(nucleoSrc).toContain("valorAlocadoNesteTitulo");
    expect(nucleoSrc).toContain("MSG_FIN_TITULO_NAO_ENCONTRADO");
    expect(nucleoSrc).not.toMatch(/async historicoPagamentosTitulo[\s\S]{0,2500}insertLiquidacao/);
    expect(nucleoSrc).not.toMatch(/async historicoPagamentosTitulo[\s\S]{0,2500}insertMovimento/);
    expect(nucleoSrc).not.toMatch(/async historicoPagamentosTitulo[\s\S]{0,2500}extrato\(/);
    expect(detalhePage).toContain("tituloHistoricoPagamentos");
    expect(detalhePage).toContain("liquidacaoPagar");
  });

  it("título sem pagamentos devolve histórico vazio", async () => {
    const { svc, tituloId, store } = await cenarioBase();
    const antes = {
      liquidacoes: store.liquidacoes.length,
      alocacoes: store.alocacoes.length,
      movimentos: store.movimentos.length,
    };
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    expect(hist.tituloId).toBe(tituloId);
    expect(hist.eventos).toEqual([]);
    expect(hist.parcelas).toHaveLength(3);
    expect(hist.parcelas.every(p => p.saldoPrincipal === Number(p.valorOriginal))).toBe(true);
    expect(store.liquidacoes).toHaveLength(antes.liquidacoes);
    expect(store.alocacoes).toHaveLength(antes.alocacoes);
    expect(store.movimentos).toHaveLength(antes.movimentos);
  });

  it("pagamento integral vira um evento com valores oficiais", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 10000,
      idempotencyKey: "hist-integral",
      referencia: "NF-1",
      observacoes: "Quitação da primeira",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000 }],
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    expect(hist.eventos).toHaveLength(1);
    expect(idsUnicos(hist.eventos.map(e => e.liquidacaoId))).toBe(true);
    const ev = hist.eventos[0]!;
    expect(ev.liquidacaoId).toBe(pag.id);
    expect(ev.tipo).toBe("pagamento");
    expect(ev.dataLiquidacao).toBe("2026-03-02");
    expect(ev.contaId).toBe(contaId);
    expect(ev.contaNome).toBe("Caixa");
    expect(ev.valorMovimentado).toBe("10000.00");
    expect(ev.valorAlocadoNesteTitulo).toBe(10000);
    expect(ev.liquidacaoOriginalId).toBeNull();
    expect(ev.estornadaPorLiquidacaoId).toBeNull();
    expect(ev.referencia).toBe("NF-1");
    expect(ev.observacoes).toBe("Quitação da primeira");
    expect(ev.alocacoesDesteTitulo).toEqual([
      expect.objectContaining({
        parcelaId: parcelas[0]!.id,
        parcelaNumero: 1,
        principalLiquidado: "10000.00",
        desconto: "0.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 10000,
      }),
    ]);
    expect(hist.parcelas[0]!.quitada).toBe(true);
    expect(hist.parcelas[0]!.saldoPrincipal).toBe(0);
  });

  it("pagamento parcial reduz o saldo oficial da parcela", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "hist-parcial",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    expect(hist.eventos).toHaveLength(1);
    expect(hist.eventos[0]!.valorMovimentado).toBe("4000.00");
    expect(hist.eventos[0]!.valorAlocadoNesteTitulo).toBe(4000);
    expect(hist.eventos[0]!.alocacoesDesteTitulo[0]!.principalLiquidado).toBe("4000.00");
    expect(hist.parcelas[0]!.saldoPrincipal).toBe(6000);
    expect(hist.parcelas[0]!.quitada).toBe(false);
  });

  it("vários pagamentos na mesma parcela aparecem como eventos distintos", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    const a = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "hist-parcela-1",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const b = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-10",
      valorMovimentado: 6000,
      idempotencyKey: "hist-parcela-2",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 6000 }],
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    expect(hist.eventos).toHaveLength(2);
    expect(hist.eventos.map(e => e.liquidacaoId)).toEqual([a.id, b.id]);
    expect(idsUnicos(hist.eventos.map(e => e.liquidacaoId))).toBe(true);
    expect(hist.eventos.every(e => e.alocacoesDesteTitulo[0]!.parcelaId === parcelas[0]!.id)).toBe(true);
    expect(hist.parcelas[0]!.quitada).toBe(true);
    expect(hist.parcelas[0]!.saldoPrincipal).toBe(0);
  });

  it("uma liquidação em várias parcelas deste título não duplica o movimento", async () => {
    const { svc, contaId, parcelas, tituloId, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 25000,
      idempotencyKey: "hist-lote",
      alocacoes: [
        { parcelaId: parcelas[0]!.id, principalLiquidado: 10000 },
        { parcelaId: parcelas[1]!.id, principalLiquidado: 10000 },
        { parcelaId: parcelas[2]!.id, principalLiquidado: 5000 },
      ],
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    expect(store.movimentos).toHaveLength(1);
    expect(hist.eventos).toHaveLength(1);
    expect(hist.eventos[0]!.liquidacaoId).toBe(pag.id);
    expect(hist.eventos[0]!.valorMovimentado).toBe("25000.00");
    expect(hist.eventos[0]!.valorAlocadoNesteTitulo).toBe(25000);
    expect(hist.eventos[0]!.alocacoesDesteTitulo).toHaveLength(3);
    expect(hist.eventos[0]!.alocacoesDesteTitulo.map(a => a.parcelaNumero)).toEqual([1, 2, 3]);
  });

  it("liquidação que abrange vários títulos não atribui o caixa total ao título consultado", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, {
      nome: "Caixa",
      tipo: "caixa",
      saldoAbertura: 50000,
      dataSaldoAbertura: "2026-01-01",
    });
    const t1 = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Título A",
      dataCompetencia: "2026-02-01",
      valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 }],
    });
    const t2 = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Título B",
      dataCompetencia: "2026-02-01",
      valorOriginal: 5000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 5000 }],
    });
    const d1 = await svc.detalheTitulo(10, t1.id);
    const d2 = await svc.detalheTitulo(10, t2.id);
    const pag = await svc.criarPagamento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-03-05",
      valorMovimentado: 15000,
      idempotencyKey: "hist-multi-titulo",
      alocacoes: [
        { parcelaId: d1.parcelas[0]!.id, principalLiquidado: 10000 },
        { parcelaId: d2.parcelas[0]!.id, principalLiquidado: 5000 },
      ],
    });

    const hist1 = await svc.historicoPagamentosTitulo(10, t1.id);
    const hist2 = await svc.historicoPagamentosTitulo(10, t2.id);
    expect(hist1.eventos).toHaveLength(1);
    expect(hist2.eventos).toHaveLength(1);
    expect(hist1.eventos[0]!.liquidacaoId).toBe(pag.id);
    expect(hist2.eventos[0]!.liquidacaoId).toBe(pag.id);
    expect(hist1.eventos[0]!.valorMovimentado).toBe("15000.00");
    expect(hist2.eventos[0]!.valorMovimentado).toBe("15000.00");
    expect(hist1.eventos[0]!.valorAlocadoNesteTitulo).toBe(10000);
    expect(hist2.eventos[0]!.valorAlocadoNesteTitulo).toBe(5000);
    expect(hist1.eventos[0]!.alocacoesDesteTitulo).toHaveLength(1);
    expect(hist1.eventos[0]!.alocacoesDesteTitulo[0]!.parcelaId).toBe(d1.parcelas[0]!.id);
    expect(hist2.eventos[0]!.alocacoesDesteTitulo).toHaveLength(1);
    expect(hist2.eventos[0]!.alocacoesDesteTitulo[0]!.parcelaId).toBe(d2.parcelas[0]!.id);
    expect(hist1.eventos[0]!.alcanceCompleto).toBe(true);
    expect(hist1.eventos[0]!.quantidadeTitulosNaLiquidacao).toBe(2);
    expect(hist1.eventos[0]!.titulosNaLiquidacao).toEqual([
      { tituloId: t1.id, descricao: "Título A", valorAlocado: 10000 },
      { tituloId: t2.id, descricao: "Título B", valorAlocado: 5000 },
    ]);
    expect(hist2.eventos[0]!.titulosNaLiquidacao).toEqual(hist1.eventos[0]!.titulosNaLiquidacao);
    expect(store.movimentos).toHaveLength(1);
  });

  it("pagamento com desconto preserva principal, desconto e caixa oficiais", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 9800,
      idempotencyKey: "hist-desc",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, desconto: 200 }],
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    const ev = hist.eventos[0]!;
    expect(ev.valorMovimentado).toBe("9800.00");
    expect(ev.valorAlocadoNesteTitulo).toBe(9800);
    expect(ev.alocacoesDesteTitulo[0]).toMatchObject({
      principalLiquidado: "10000.00",
      desconto: "200.00",
      juros: "0.00",
      multa: "0.00",
      valorCaixaAlocado: 9800,
    });
    expect(hist.parcelas[0]!.quitada).toBe(true);
  });

  it("pagamento com juros e multa preserva os acréscimos oficiais", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 10250,
      idempotencyKey: "hist-juros",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, juros: 200, multa: 50 }],
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    const ev = hist.eventos[0]!;
    expect(ev.valorMovimentado).toBe("10250.00");
    expect(ev.valorAlocadoNesteTitulo).toBe(10250);
    expect(ev.alocacoesDesteTitulo[0]).toMatchObject({
      principalLiquidado: "10000.00",
      desconto: "0.00",
      juros: "200.00",
      multa: "50.00",
      valorCaixaAlocado: 10250,
    });
  });

  it("pagamento estornado permanece no histórico com vínculo oficial", async () => {
    const { svc, contaId, parcelas, tituloId, store } = await cenarioBase();
    const pag = await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "hist-est-pag",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const est = await svc.estornarLiquidacao(10, {
      liquidacaoId: pag.id,
      idempotencyKey: "hist-est-1",
      dataLiquidacao: "2026-03-08",
    });
    const hist = await svc.historicoPagamentosTitulo(10, tituloId);
    expect(hist.eventos).toHaveLength(2);
    expect(idsUnicos(hist.eventos.map(e => e.liquidacaoId))).toBe(true);
    const original = hist.eventos.find(e => e.liquidacaoId === pag.id)!;
    const estorno = hist.eventos.find(e => e.liquidacaoId === est.id)!;
    expect(original.tipo).toBe("pagamento");
    expect(original.dataLiquidacao).toBe("2026-03-02");
    expect(original.valorMovimentado).toBe("4000.00");
    expect(original.valorAlocadoNesteTitulo).toBe(4000);
    expect(original.liquidacaoOriginalId).toBeNull();
    expect(original.estornadaPorLiquidacaoId).toBe(est.id);
    expect(estorno.tipo).toBe("estorno_pagamento");
    expect(estorno.dataLiquidacao).toBe("2026-03-08");
    expect(estorno.valorMovimentado).toBe("4000.00");
    expect(estorno.liquidacaoOriginalId).toBe(pag.id);
    expect(estorno.estornadaPorLiquidacaoId).toBeNull();
    expect(hist.parcelas[0]!.saldoPrincipal).toBe(10000);
    expect(store.liquidacoes).toHaveLength(2);
    expect(store.movimentos).toHaveLength(2);
  });

  it("título de outro usuário e título inexistente seguem NOT_FOUND do V2", async () => {
    const { svc, tituloId } = await cenarioBase();
    await expect(svc.historicoPagamentosTitulo(99, tituloId)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_FIN_TITULO_NAO_ENCONTRADO,
    });
    await expect(svc.historicoPagamentosTitulo(10, 9_999_999)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_FIN_TITULO_NAO_ENCONTRADO,
    });
    await expect(svc.historicoPagamentosTitulo(99, tituloId)).rejects.toBeInstanceOf(TRPCError);
  });

  it("a consulta não grava liquidação, alocação nem movimento", async () => {
    const { svc, contaId, parcelas, tituloId, store } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "hist-readonly",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const foto = JSON.stringify({
      liquidacoes: store.liquidacoes,
      alocacoes: store.alocacoes,
      movimentos: store.movimentos,
      parcelas: store.parcelas,
      titulos: store.titulos,
    });
    await svc.historicoPagamentosTitulo(10, tituloId);
    await svc.historicoPagamentosTitulo(10, tituloId);
    expect(JSON.stringify({
      liquidacoes: store.liquidacoes,
      alocacoes: store.alocacoes,
      movimentos: store.movimentos,
      parcelas: store.parcelas,
      titulos: store.titulos,
    })).toBe(foto);
  });

  it("F — liquidação de um único título declara alcance exclusivo", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      idempotencyKey: "hist-f-unico",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 4000 }],
    });
    const ev = (await svc.historicoPagamentosTitulo(10, tituloId)).eventos[0]!;
    expect(ev.alcanceCompleto).toBe(true);
    expect(ev.quantidadeTitulosNaLiquidacao).toBe(1);
    expect(ev.titulosNaLiquidacao).toEqual([{ tituloId, descricao: "Compra teste", valorAlocado: 4000 }]);
    expect(ev.valorAlocadoNesteTitulo).toBe(4000);
    expect(ev.valorMovimentado).toBe("4000.00");
  });

  it("H — outro título com caixa zero por desconto integral entra no alcance", async () => {
    const store = criarStore();
    const svc = createFinanceiroNucleoService(store);
    const conta = await svc.criarContaFinanceira(10, {
      nome: "Caixa",
      tipo: "caixa",
      saldoAbertura: 50000,
      dataSaldoAbertura: "2026-01-01",
    });
    const t1 = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Título visível",
      dataCompetencia: "2026-02-01",
      valorOriginal: 10000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 }],
    });
    const t2 = await svc.criarTitulo(10, {
      tipo: "pagar",
      pessoaId: 1,
      descricao: "Título desconto integral",
      dataCompetencia: "2026-02-01",
      valorOriginal: 5000,
      parcelas: [{ numero: 1, vencimento: "2026-03-01", valorOriginal: 5000 }],
    });
    const d1 = await svc.detalheTitulo(10, t1.id);
    const d2 = await svc.detalheTitulo(10, t2.id);
    await svc.criarPagamento(10, {
      contaId: conta.id,
      dataLiquidacao: "2026-03-05",
      valorMovimentado: 10000,
      idempotencyKey: "hist-h-zero",
      alocacoes: [
        { parcelaId: d1.parcelas[0]!.id, principalLiquidado: 10000 },
        { parcelaId: d2.parcelas[0]!.id, principalLiquidado: 5000, desconto: 5000 },
      ],
    });
    const hist = await svc.historicoPagamentosTitulo(10, t1.id);
    const ev = hist.eventos[0]!;
    expect(ev.valorMovimentado).toBe("10000.00");
    expect(ev.valorAlocadoNesteTitulo).toBe(10000);
    expect(ev.alcanceCompleto).toBe(true);
    expect(ev.quantidadeTitulosNaLiquidacao).toBe(2);
    expect(ev.titulosNaLiquidacao).toEqual([
      { tituloId: t1.id, descricao: "Título visível", valorAlocado: 10000 },
      { tituloId: t2.id, descricao: "Título desconto integral", valorAlocado: 0 },
    ]);
  });

  it("J — várias parcelas do mesmo título continuam um único título no alcance", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 25000,
      idempotencyKey: "hist-j-parcelas",
      alocacoes: [
        { parcelaId: parcelas[0]!.id, principalLiquidado: 10000 },
        { parcelaId: parcelas[1]!.id, principalLiquidado: 10000 },
        { parcelaId: parcelas[2]!.id, principalLiquidado: 5000 },
      ],
    });
    const ev = (await svc.historicoPagamentosTitulo(10, tituloId)).eventos[0]!;
    expect(ev.alocacoesDesteTitulo).toHaveLength(3);
    expect(ev.quantidadeTitulosNaLiquidacao).toBe(1);
    expect(ev.titulosNaLiquidacao[0]).toEqual({ tituloId, descricao: "Compra teste", valorAlocado: 25000 });
  });

  it("I/M — juros, multa e histórico existente preservam campos antigos e o alcance", async () => {
    const { svc, contaId, parcelas, tituloId } = await cenarioBase();
    await svc.criarPagamento(10, {
      contaId,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 10250,
      idempotencyKey: "hist-i-juros",
      alocacoes: [{ parcelaId: parcelas[0]!.id, principalLiquidado: 10000, juros: 200, multa: 50 }],
    });
    const ev = (await svc.historicoPagamentosTitulo(10, tituloId)).eventos[0]!;
    expect(ev.valorMovimentado).toBe("10250.00");
    expect(ev.valorAlocadoNesteTitulo).toBe(10250);
    expect(ev.alocacoesDesteTitulo[0]).toMatchObject({ juros: "200.00", multa: "50.00" });
    expect(ev.formaPagamento).toBeNull();
    expect(ev.alcanceCompleto).toBe(true);
    expect(ev.quantidadeTitulosNaLiquidacao).toBe(1);
    expect(ev.titulosNaLiquidacao[0]!.valorAlocado).toBe(10250);
  });
});
