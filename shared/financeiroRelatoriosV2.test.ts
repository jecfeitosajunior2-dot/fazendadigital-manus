import { describe, expect, it } from "vitest";
import { montarRelatorioFinanceiroV2 } from "./financeiroRelatoriosV2";

const filtro = {
  de: "2026-03-01",
  ate: "2026-03-31",
  hojeISO: "2026-03-15",
};

function relatorio(parcial: Parameters<typeof montarRelatorioFinanceiroV2>[0]) {
  return montarRelatorioFinanceiroV2(parcial);
}

describe("financeiroRelatoriosV2", () => {
  it("visão geral: saldo, pendências, realizado sem transferência", () => {
    const out = relatorio({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 5000 }],
      titulos: [
        {
          id: 10, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "João", fazendaOrigemId: 3, origemTipo: "manual",
          origemId: 1, descricao: "Aluguel", valorOriginal: 3000,
          parcelas: [{
            id: 21, numero: 1, vencimento: "2026-03-31", valorOriginal: 3000,
            alocacoes: [{ tipoLiquidacao: "recebimento", principalLiquidado: 1000 }],
          }],
        },
        {
          id: 11, userId: 1, tipo: "pagar", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "Agro", fazendaOrigemId: 3, origemTipo: "manual",
          origemId: 1, descricao: "Frete", valorOriginal: 800,
          parcelas: [{
            id: 22, numero: 1, vencimento: "2026-03-10", valorOriginal: 800,
            alocacoes: [],
          }],
        },
      ],
      movimentos: [
        {
          id: 92, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-05",
          direcao: "entrada", natureza: "recebimento", valor: 3000, descricao: "Recebimento",
          liquidacaoId: 1, transferenciaId: null, fazendaOrigemId: 3,
        },
        {
          id: 93, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-08",
          direcao: "entrada", natureza: "recebimento", valor: 1000, descricao: "Recebimento",
          liquidacaoId: 2, transferenciaId: null, fazendaOrigemId: 3,
        },
        {
          id: 94, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-08",
          direcao: "entrada", natureza: "recebimento", valor: 1000, descricao: "Recebimento",
          liquidacaoId: 3, transferenciaId: null, fazendaOrigemId: 3,
        },
        {
          id: 95, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-09",
          direcao: "saida", natureza: "transferencia_saida", valor: 200, descricao: "Transferência",
          liquidacaoId: null, transferenciaId: 7, fazendaOrigemId: null,
        },
        {
          id: 96, contaId: 2, contaNome: "Banco", dataMovimento: "2026-03-09",
          direcao: "entrada", natureza: "transferencia_entrada", valor: 200, descricao: "Transferência",
          liquidacaoId: null, transferenciaId: 7, fazendaOrigemId: null,
        },
      ],
      filtro,
    });
    expect(out.visao.saldoCaixaBancos).toBe(5000);
    expect(out.visao.totalAReceber).toBe(2000);
    expect(out.visao.totalAPagar).toBe(800);
    expect(out.visao.recebimentosPeriodo).toBe(5000);
    expect(out.visao.pagamentosPeriodo).toBe(0);
    expect(out.visao.resultadoRealizado).toBe(5000);
    expect(out.fluxoRealizado.linhas.filter(l => l.tipo === "transferencia")).toHaveLength(1);
    expect(out.fluxoRealizado.entradas).toBe(5000);
  });

  it("previsto usa saldo pendente; quitada e cancelado ficam de fora; a definir separado", () => {
    const out = relatorio({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 0 }],
      titulos: [
        {
          id: 1, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "A", fazendaOrigemId: null, origemTipo: "manual",
          origemId: 1, descricao: "Parcial", valorOriginal: 100,
          parcelas: [{
            id: 1, numero: 1, vencimento: "2026-03-20", valorOriginal: 100,
            alocacoes: [{ tipoLiquidacao: "recebimento", principalLiquidado: 40 }],
          }],
        },
        {
          id: 2, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "B", fazendaOrigemId: null, origemTipo: "manual",
          origemId: 1, descricao: "Quitada", valorOriginal: 50,
          parcelas: [{
            id: 2, numero: 1, vencimento: "2026-03-20", valorOriginal: 50,
            alocacoes: [{ tipoLiquidacao: "recebimento", principalLiquidado: 50 }],
          }],
        },
        {
          id: 3, userId: 1, tipo: "receber", estado: "cancelado", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "C", fazendaOrigemId: null, origemTipo: "manual",
          origemId: 1, descricao: "Cancelada", valorOriginal: 90,
          parcelas: [{
            id: 3, numero: 1, vencimento: "2026-03-20", valorOriginal: 90, alocacoes: [],
          }],
        },
        {
          id: 4, userId: 1, tipo: "pagar", estado: "ativo", condicaoStatus: "a_definir",
          pessoaId: 1, contraparteNomeSnapshot: "D", fazendaOrigemId: null, origemTipo: "manual",
          origemId: 1, descricao: "Sem vencimento", valorOriginal: 70, parcelas: [],
        },
        {
          id: 5, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "E", fazendaOrigemId: null, origemTipo: "manual",
          origemId: 1, descricao: "Vencida", valorOriginal: 30,
          parcelas: [{ id: 5, numero: 1, vencimento: "2026-03-01", valorOriginal: 30, alocacoes: [] }],
        },
      ],
      movimentos: [],
      filtro,
    });
    expect(out.fluxoPrevisto.recebimentos).toBe(90);
    expect(out.fluxoPrevisto.pagamentos).toBe(0);
    expect(out.fluxoPrevisto.semVencimentoPagar).toBe(70);
    expect(out.fluxoPrevisto.semVencimentoReceber).toBe(0);
    expect(out.receber.totalVencido).toBe(30);
    expect(out.receber.aVencer).toBe(60);
    expect(out.receber.quantidadeParcelasPendentes).toBe(2);
    expect(out.pagar.semVencimento).toBe(70);
    expect(out.receber.linhas.find(l => l.descricao === "Cancelada")?.saldoPendente).toBe(0);
  });

  it("estorno de recebimento entra como saída e devolve o pendente", () => {
    const out = relatorio({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 0 }],
      titulos: [{
        id: 1, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
        pessoaId: 1, contraparteNomeSnapshot: "A", fazendaOrigemId: null, origemTipo: "manual",
        origemId: 1, descricao: "Aluguel", valorOriginal: 80,
        parcelas: [{
          id: 1, numero: 1, vencimento: "2026-03-10", valorOriginal: 80,
          alocacoes: [
            { tipoLiquidacao: "recebimento", principalLiquidado: 80 },
            { tipoLiquidacao: "estorno_recebimento", principalLiquidado: 80 },
          ],
        }],
      }],
      movimentos: [
        {
          id: 1, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-10",
          direcao: "entrada", natureza: "recebimento", valor: 80, descricao: "Recebimento",
          liquidacaoId: 1, transferenciaId: null, fazendaOrigemId: null,
        },
        {
          id: 2, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-12",
          direcao: "saida", natureza: "estorno_recebimento", valor: 80, descricao: "Estorno",
          liquidacaoId: 2, transferenciaId: null, fazendaOrigemId: null,
        },
      ],
      filtro,
    });
    expect(out.visao.resultadoRealizado).toBe(0);
    expect(out.receber.totalPendente).toBe(80);
    expect(out.fluxoRealizado.saidas).toBe(80);
  });

  it("filtro de fazenda não usa a conta e isola o usuário pelos títulos recebidos", () => {
    const out = relatorio({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 90 }],
      titulos: [
        {
          id: 1, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "A", fazendaOrigemId: 3, origemTipo: "manual",
          origemId: 1, descricao: "Sede", valorOriginal: 40,
          parcelas: [{ id: 1, numero: 1, vencimento: "2026-03-20", valorOriginal: 40, alocacoes: [] }],
        },
        {
          id: 2, userId: 1, tipo: "receber", estado: "ativo", condicaoStatus: "definida",
          pessoaId: 1, contraparteNomeSnapshot: "B", fazendaOrigemId: 9, origemTipo: "manual",
          origemId: 1, descricao: "Outra", valorOriginal: 50,
          parcelas: [{ id: 2, numero: 1, vencimento: "2026-03-20", valorOriginal: 50, alocacoes: [] }],
        },
      ],
      movimentos: [
        {
          id: 1, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-05",
          direcao: "entrada", natureza: "recebimento", valor: 10, descricao: "Sede",
          liquidacaoId: 1, transferenciaId: null, fazendaOrigemId: 3,
        },
        {
          id: 2, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-05",
          direcao: "entrada", natureza: "recebimento", valor: 15, descricao: "Outra",
          liquidacaoId: 2, transferenciaId: null, fazendaOrigemId: 9,
        },
      ],
      filtro: { ...filtro, fazendaId: 3 },
    });
    expect(out.receber.totalPendente).toBe(40);
    expect(out.visao.recebimentosPeriodo).toBe(10);
    expect(out.visao.saldoCaixaBancos).toBe(90);
    expect(out.visao.saldoConsolidadoSemFazenda).toBe(true);
    expect(out.fluxoPrevisto.saldoProjetado).toBeNull();
  });

  it("filtro de período e conta exclui movimento fora", () => {
    const out = relatorio({
      contas: [
        { id: 1, nome: "Caixa", ativa: true, saldoAtual: 10 },
        { id: 2, nome: "Banco", ativa: true, saldoAtual: 20 },
      ],
      titulos: [],
      movimentos: [
        {
          id: 1, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-02-28",
          direcao: "entrada", natureza: "recebimento", valor: 99, descricao: "Fora",
          liquidacaoId: 1, transferenciaId: null, fazendaOrigemId: null,
        },
        {
          id: 2, contaId: 2, contaNome: "Banco", dataMovimento: "2026-03-10",
          direcao: "entrada", natureza: "recebimento", valor: 7, descricao: "Outra conta",
          liquidacaoId: 2, transferenciaId: null, fazendaOrigemId: null,
        },
        {
          id: 3, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-03-10",
          direcao: "entrada", natureza: "recebimento", valor: 5, descricao: "Dentro",
          liquidacaoId: 3, transferenciaId: null, fazendaOrigemId: null,
        },
      ],
      filtro: { ...filtro, contaId: 1 },
    });
    expect(out.visao.saldoCaixaBancos).toBe(10);
    expect(out.visao.recebimentosPeriodo).toBe(5);
    expect(out.fluxoRealizado.linhas).toHaveLength(1);
  });
});
