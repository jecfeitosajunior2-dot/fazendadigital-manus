import { describe, expect, it } from "vitest";
import { montarRelatorioFinanceiroV2 } from "./financeiroRelatoriosV2";
import {
  avisoRegistrosSemFazendaPainel,
  emptyPainelFinanceiro,
  haRegistrosSemFazendaNoRelatorioV2,
  indicadoresFinanceirosDoRelatorioV2,
  MSG_PAINEL_SEM_ATRIBUICAO_FILTRO,
  MSG_PAINEL_SEM_ATRIBUICAO_TODAS,
  periodoMesCorrentePainel,
  ROTULO_RESULTADO_MES_ATUAL,
} from "./painelControle";

const periodoOutubro = { de: "2026-10-01", ate: "2026-10-31", hojeISO: "2026-10-15" };

function tituloReceber(parcial: {
  id: number;
  fazendaOrigemId: number | null;
  valor: number;
  liquidado?: number;
}) {
  return {
    id: parcial.id,
    userId: 1,
    tipo: "receber" as const,
    estado: "ativo" as const,
    condicaoStatus: "definida" as const,
    pessoaId: 1,
    contraparteNomeSnapshot: "Cliente",
    fazendaOrigemId: parcial.fazendaOrigemId,
    origemTipo: "manual",
    origemId: 1,
    descricao: "Receita",
    valorOriginal: parcial.valor,
    parcelas: [{
      id: parcial.id * 10,
      numero: 1,
      vencimento: "2026-10-20",
      valorOriginal: parcial.valor,
      alocacoes: parcial.liquidado
        ? [{ tipoLiquidacao: "recebimento" as const, principalLiquidado: parcial.liquidado }]
        : [],
    }],
  };
}

function tituloPagar(parcial: {
  id: number;
  fazendaOrigemId: number | null;
  valor: number;
  liquidado?: number;
}) {
  return {
    ...tituloReceber(parcial),
    id: parcial.id,
    tipo: "pagar" as const,
    descricao: "Despesa",
  };
}

function mov(parcial: {
  id: number;
  data: string;
  direcao: "entrada" | "saida";
  natureza: "recebimento" | "pagamento" | "transferencia_saida" | "transferencia_entrada";
  valor: number;
  fazendaOrigemId: number | null;
  transferenciaId?: number | null;
}) {
  return {
    id: parcial.id,
    contaId: 1,
    contaNome: "Caixa",
    dataMovimento: parcial.data,
    direcao: parcial.direcao,
    natureza: parcial.natureza,
    valor: parcial.valor,
    descricao: parcial.natureza,
    liquidacaoId: parcial.transferenciaId ? null : parcial.id,
    transferenciaId: parcial.transferenciaId ?? null,
    fazendaOrigemId: parcial.fazendaOrigemId,
  };
}

describe("período do Resultado — mês corrente", () => {
  it("outubro de 2026 vai de 01/10 a 31/10", () => {
    const p = periodoMesCorrentePainel(new Date(2026, 9, 29, 15, 0, 0));
    expect(p).toEqual({ de: "2026-10-01", ate: "2026-10-31", hojeISO: "2026-10-29" });
  });

  it("vira o mês e o ano no calendário civil local", () => {
    expect(periodoMesCorrentePainel(new Date(2026, 10, 1, 8, 0, 0))).toEqual({
      de: "2026-11-01",
      ate: "2026-11-30",
      hojeISO: "2026-11-01",
    });
    expect(periodoMesCorrentePainel(new Date(2026, 11, 31, 23, 30, 0))).toEqual({
      de: "2026-12-01",
      ate: "2026-12-31",
      hojeISO: "2026-12-31",
    });
    expect(periodoMesCorrentePainel(new Date(2027, 0, 1, 0, 10, 0))).toEqual({
      de: "2027-01-01",
      ate: "2027-01-31",
      hojeISO: "2027-01-01",
    });
  });
});

describe("indicadores do Painel = Relatório V2 no mesmo recorte", () => {
  it("mês sem movimento zera o resultado e mantém posição atual", () => {
    const rel = montarRelatorioFinanceiroV2({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 320 }],
      titulos: [tituloReceber({ id: 1, fazendaOrigemId: 3, valor: 90 })],
      movimentos: [
        mov({
          id: 9, data: "2026-09-30", direcao: "entrada", natureza: "recebimento",
          valor: 40, fazendaOrigemId: 3,
        }),
      ],
      filtro: periodoOutubro,
    });
    const painel = indicadoresFinanceirosDoRelatorioV2(rel.visao, {
      fazendaSelecionadaId: null,
      periodo: periodoOutubro,
    });
    expect(rel.visao.saldoCaixaBancos).toBe(320);
    expect(rel.visao.totalAReceber).toBe(90);
    expect(rel.visao.resultadoRealizado).toBe(0);
    expect(painel.saldoCaixaBancos).toBe(rel.visao.saldoCaixaBancos);
    expect(painel.totalAReceber).toBe(rel.visao.totalAReceber);
    expect(painel.resultadoRealizado).toBe(rel.visao.resultadoRealizado);
    expect(painel.rotuloResultado).toBe(ROTULO_RESULTADO_MES_ATUAL);
  });

  it("recebimento parcial entra no realizado do mês e deixa o saldo pendente atual", () => {
    const rel = montarRelatorioFinanceiroV2({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 1500 }],
      titulos: [tituloReceber({ id: 1, fazendaOrigemId: 3, valor: 3000, liquidado: 1000 })],
      movimentos: [
        mov({
          id: 1, data: "2026-10-08", direcao: "entrada", natureza: "recebimento",
          valor: 1000, fazendaOrigemId: 3,
        }),
      ],
      filtro: periodoOutubro,
    });
    const painel = indicadoresFinanceirosDoRelatorioV2(rel.visao, {
      fazendaSelecionadaId: 3,
      periodo: periodoOutubro,
    });
    expect(rel.visao.totalAReceber).toBe(2000);
    expect(rel.visao.resultadoRealizado).toBe(1000);
    expect(painel.totalAReceber).toBe(2000);
    expect(painel.resultadoRealizado).toBe(1000);
  });

  it("pagamento parcial e transferência interna não viram receita nem despesa", () => {
    const rel = montarRelatorioFinanceiroV2({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 400 }],
      titulos: [tituloPagar({ id: 2, fazendaOrigemId: 3, valor: 800, liquidado: 200 })],
      movimentos: [
        mov({
          id: 1, data: "2026-10-09", direcao: "saida", natureza: "pagamento",
          valor: 200, fazendaOrigemId: 3,
        }),
        mov({
          id: 2, data: "2026-10-09", direcao: "saida", natureza: "transferencia_saida",
          valor: 50, fazendaOrigemId: null, transferenciaId: 7,
        }),
        mov({
          id: 3, data: "2026-10-09", direcao: "entrada", natureza: "transferencia_entrada",
          valor: 50, fazendaOrigemId: null, transferenciaId: 7,
        }),
      ],
      filtro: periodoOutubro,
    });
    const painel = indicadoresFinanceirosDoRelatorioV2(rel.visao, {
      fazendaSelecionadaId: null,
      periodo: periodoOutubro,
    });
    expect(rel.visao.totalAPagar).toBe(600);
    expect(rel.visao.resultadoRealizado).toBe(-200);
    expect(painel.totalAPagar).toBe(600);
    expect(painel.resultadoRealizado).toBe(-200);
    expect(painel.avisoResultado).toMatch(/[Tt]ransferência/);
  });

  it("fazenda específica e Todas usam o mesmo filtro oficial do relatório", () => {
    const entrada = {
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 90 }],
      titulos: [
        tituloReceber({ id: 1, fazendaOrigemId: 3, valor: 40 }),
        tituloReceber({ id: 2, fazendaOrigemId: 9, valor: 50 }),
        tituloReceber({ id: 3, fazendaOrigemId: null, valor: 25 }),
      ],
      movimentos: [
        mov({
          id: 1, data: "2026-10-05", direcao: "entrada", natureza: "recebimento",
          valor: 10, fazendaOrigemId: 3,
        }),
        mov({
          id: 2, data: "2026-10-05", direcao: "entrada", natureza: "recebimento",
          valor: 15, fazendaOrigemId: 9,
        }),
        mov({
          id: 3, data: "2026-10-06", direcao: "entrada", natureza: "recebimento",
          valor: 8, fazendaOrigemId: null,
        }),
      ],
    };
    const todas = montarRelatorioFinanceiroV2({ ...entrada, filtro: periodoOutubro });
    const sede = montarRelatorioFinanceiroV2({
      ...entrada,
      filtro: { ...periodoOutubro, fazendaId: 3 },
    });
    const painelTodas = indicadoresFinanceirosDoRelatorioV2(todas.visao, {
      fazendaSelecionadaId: null,
      periodo: periodoOutubro,
      temRegistrosSemFazenda: haRegistrosSemFazendaNoRelatorioV2(todas),
    });
    const painelSede = indicadoresFinanceirosDoRelatorioV2(sede.visao, {
      fazendaSelecionadaId: 3,
      periodo: periodoOutubro,
      temRegistrosSemFazenda: haRegistrosSemFazendaNoRelatorioV2(todas),
    });

    expect(painelTodas.totalAReceber).toBe(todas.visao.totalAReceber);
    expect(painelTodas.resultadoRealizado).toBe(todas.visao.resultadoRealizado);
    expect(painelTodas.saldoCaixaBancos).toBe(90);
    expect(painelSede.totalAReceber).toBe(40);
    expect(painelSede.resultadoRealizado).toBe(10);
    expect(painelSede.saldoCaixaBancos).toBe(90);
    expect(painelSede.saldoCaixaConsolidado).toBe(true);
    expect(sede.receber.linhas.every(l => l.fazendaOrigemId === 3)).toBe(true);
    expect(haRegistrosSemFazendaNoRelatorioV2(todas)).toBe(true);
    expect(haRegistrosSemFazendaNoRelatorioV2(sede)).toBe(false);
    expect(painelSede.avisoSemAtribuicao).toBe(MSG_PAINEL_SEM_ATRIBUICAO_FILTRO);
    expect(painelTodas.avisoSemAtribuicao).toBe(MSG_PAINEL_SEM_ATRIBUICAO_TODAS);
  });

  it("movimento sem origem não some em silêncio quando a fazenda está filtrada", () => {
    const consolidado = montarRelatorioFinanceiroV2({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 1 }],
      titulos: [],
      movimentos: [
        mov({
          id: 1, data: "2026-10-12", direcao: "entrada", natureza: "recebimento",
          valor: 30, fazendaOrigemId: null,
        }),
      ],
      filtro: periodoOutubro,
    });
    expect(haRegistrosSemFazendaNoRelatorioV2(consolidado)).toBe(true);
    expect(avisoRegistrosSemFazendaPainel(true, true)).toBe(MSG_PAINEL_SEM_ATRIBUICAO_FILTRO);
    expect(avisoRegistrosSemFazendaPainel(false, false)).toBeNull();
  });

  it("falha financeira não apresenta zero como saldo confirmado", () => {
    const falha = emptyPainelFinanceiro(new Date(2026, 9, 15));
    expect(falha.disponivel).toBe(false);
    expect(falha.rotuloResultado).toBe(ROTULO_RESULTADO_MES_ATUAL);
    expect(falha.periodoDe).toBe("2026-10-01");
    expect(falha.periodoAte).toBe("2026-10-31");
  });
});
