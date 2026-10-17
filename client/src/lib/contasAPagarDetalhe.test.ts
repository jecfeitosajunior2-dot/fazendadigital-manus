import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  FINANCEIRO_ORIGEM_MANUAL,
  FINANCEIRO_ORIGEM_MANUTENCAO,
} from "@shared/financeiroNucleo";
import {
  FILTRO_ATIVOS,
  FILTRO_VENCIDAS,
  FINANCEIRO_CONTAS_A_PAGAR_PATH,
  TEXTO_A_DEFINIR,
  contasAPagarDetalhePath,
  contasAPagarListagemPath,
  contasAPagarVoltarPath,
  filtrosContasAPagarDaQuery,
  filtrosContasAPagarVazios,
  idTituloContasAPagar,
  type TituloV2DetalheOficial,
} from "./contasAPagarListagem";
import {
  MSG_ACESSO_NEGADO,
  MSG_CONDICAO_PAGAMENTO_A_DEFINIR,
  MSG_HISTORICO_PAGAMENTOS_CARREGANDO,
  MSG_HISTORICO_PAGAMENTOS_ERRO,
  MSG_NENHUM_PAGAMENTO_REGISTRADO,
  MSG_TITULO_NAO_ENCONTRADO,
  deveMostrarHistoricoVazio,
  detalheVisivelParaUsuario,
  identificacaoTitulo,
  linkOrigemContasAPagar,
  mensagemErroHistoricoPagamentos,
  montarEventosHistoricoPagamentos,
  resumoOficialContasAPagar,
  rotuloCondicaoPagamento,
  rotuloEstadoTitulo,
  rotuloParcelasHistorico,
  rotuloSituacaoEventoPagamento,
  rotuloSituacaoParcela,
  tituloEhContaAPagar,
  type EventoHistoricoPagamentoOficial,
} from "./contasAPagarDetalhe";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");

const HOJE = "2026-10-17";

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 80,
    userId: 1,
    tipo: "pagar",
    estado: "ativo",
    condicaoStatus: "definida",
    pessoaId: 18,
    contraparteNomeSnapshot: "Premix",
    fazendaOrigemId: 1,
    origemTipo: FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
    origemId: 8,
    origemItemChave: "principal",
    descricao: "Compra de insumos — Premix",
    dataCompetencia: "2026-10-09",
    valorOriginal: "300.00",
    documentoReferencia: "NF-12",
    situacao: "em_aberto",
    parcelas: [],
    ...parcial,
  };
}

function parcela(
  id: number,
  numero: number,
  vencimento: string,
  valor: string,
  pago: number,
  saldo: number,
  quitada = false,
) {
  return {
    id,
    tituloId: 80,
    numero,
    vencimento,
    valorOriginal: valor,
    principalLiquidado: pago,
    saldoPrincipal: saldo,
    quitada,
  };
}

describe("contasAPagarDetalhe — resumo oficial", () => {
  it("ativo sem parcelas não inventa saldo nem total pago", () => {
    const detalhe = titulo({ condicaoStatus: "a_definir", parcelas: [], situacao: "em_aberto" });
    const resumo = resumoOficialContasAPagar(detalhe);
    expect(resumo.valorOriginal).toBe("300.00");
    expect(resumo.totalPago).toBeNull();
    expect(resumo.saldoAberto).toBeNull();
    expect(resumo.pendente).toBe(true);
    expect(resumo.situacaoExibida).toBe("Em aberto");
    expect(rotuloCondicaoPagamento(detalhe)).toBe(TEXTO_A_DEFINIR);
    expect(MSG_CONDICAO_PAGAMENTO_A_DEFINIR).toBe("Condição de pagamento ainda não definida.");
  });

  it("cancelado sem parcelas não é pendência", () => {
    const detalhe = titulo({ estado: "cancelado", situacao: "em_aberto", parcelas: [] });
    const resumo = resumoOficialContasAPagar(detalhe);
    expect(resumo.pendente).toBe(false);
    expect(resumo.saldoAberto).toBeNull();
    expect(resumo.situacaoExibida).toBe("Cancelado");
    expect(rotuloEstadoTitulo(detalhe.estado)).toBe("Cancelado");
  });

  it("ativo com várias parcelas soma só os campos oficiais, sem repetir o total", () => {
    const detalhe = titulo({
      situacao: "em_aberto",
      parcelas: [
        parcela(1, 1, "2026-10-10", "100.00", 0, 100),
        parcela(2, 2, "2026-11-10", "100.00", 0, 100),
        parcela(3, 3, "2026-12-10", "100.00", 0, 100),
      ],
    });
    const resumo = resumoOficialContasAPagar(detalhe);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.saldoAberto).toBe(300);
    expect(resumo.pendente).toBe(true);
    expect(detalhe.parcelas.every(p => String(p.valorOriginal) !== "300.00")).toBe(true);
    expect(rotuloCondicaoPagamento(detalhe)).toBe("3 parcelas");
  });

  it("parcialmente pago usa principalLiquidado e saldoPrincipal oficiais", () => {
    const detalhe = titulo({
      situacao: "parcial",
      parcelas: [
        parcela(1, 1, "2026-09-01", "150.00", 150, 0, true),
        parcela(2, 2, "2026-11-01", "150.00", 50, 100),
      ],
    });
    const resumo = resumoOficialContasAPagar(detalhe);
    expect(resumo.totalPago).toBe(200);
    expect(resumo.saldoAberto).toBe(100);
    expect(resumo.situacaoExibida).toBe("Parcial");
    expect(rotuloSituacaoParcela(detalhe.parcelas[0]!, detalhe, HOJE)).toBe("Liquidada");
    expect(rotuloSituacaoParcela(detalhe.parcelas[1]!, detalhe, HOJE)).toBe("Em aberto");
  });

  it("liquidado e cancelado com parcelas", () => {
    const liquidado = titulo({
      situacao: "liquidado",
      parcelas: [parcela(1, 1, "2026-10-01", "300.00", 300, 0, true)],
    });
    expect(resumoOficialContasAPagar(liquidado)).toMatchObject({
      totalPago: 300,
      saldoAberto: 0,
      situacaoExibida: "Liquidado",
      pendente: true,
    });
    expect(rotuloSituacaoParcela(liquidado.parcelas[0]!, liquidado, HOJE)).toBe("Liquidada");

    const cancelado = titulo({
      estado: "cancelado",
      situacao: "parcial",
      parcelas: [parcela(1, 1, "2026-09-01", "300.00", 80, 220)],
    });
    const resumo = resumoOficialContasAPagar(cancelado);
    expect(resumo.totalPago).toBe(80);
    expect(resumo.saldoAberto).toBeNull();
    expect(resumo.pendente).toBe(false);
    expect(resumo.situacaoExibida).toBe("Cancelado");
    expect(rotuloSituacaoParcela(cancelado.parcelas[0]!, cancelado, HOJE)).toBe("Cancelado");
  });
});

describe("contasAPagarDetalhe — origem, isolamento e navegação", () => {
  it("só cria link para rotas existentes de Compra e Manutenção", () => {
    expect(linkOrigemContasAPagar(FINANCEIRO_ORIGEM_COMPRA_INSUMOS, 27)).toEqual({
      href: "/compra-venda/compras/27",
      label: "Abrir compra",
    });
    expect(linkOrigemContasAPagar(FINANCEIRO_ORIGEM_MANUTENCAO, 54)).toEqual({
      href: "/maquinas/manutencao/cadastro?id=54",
      label: "Abrir manutenção",
    });
    expect(linkOrigemContasAPagar(FINANCEIRO_ORIGEM_MANUAL, null)).toBeNull();
    expect(linkOrigemContasAPagar("origem_desconhecida", 9)).toBeNull();
    expect(linkOrigemContasAPagar(FINANCEIRO_ORIGEM_COMPRA_INSUMOS, 0)).toBeNull();
  });

  it("bloqueia receber e título de outro usuário", () => {
    expect(tituloEhContaAPagar(titulo({ tipo: "receber" }))).toBe(false);
    expect(detalheVisivelParaUsuario(titulo({ tipo: "receber" }), 1)).toEqual({ ok: false, motivo: "nao_pagar" });
    expect(detalheVisivelParaUsuario(titulo({ userId: 99 }), 1)).toEqual({ ok: false, motivo: "acesso" });
    expect(detalheVisivelParaUsuario(titulo({ userId: 1 }), 1)).toEqual({ ok: true });
    expect(idTituloContasAPagar("abc")).toBeNull();
    expect(idTituloContasAPagar("0")).toBeNull();
    expect(idTituloContasAPagar("84")).toBe(84);
  });

  it("preserva filtros da listagem no vai-e-volta", () => {
    const hoje = "2026-10-17";
    const filtros = {
      ...filtrosContasAPagarVazios(hoje),
      situacao: FILTRO_VENCIDAS,
      fornecedorId: "18",
      pesquisa: "premix",
      periodo: { tipo: "todas" as const },
    };
    expect(contasAPagarDetalhePath(84, filtros)).toBe(
      "/financeiro/contas-a-pagar/84?situacao=vencido&fornecedor=18&mes=todas&q=premix",
    );
    expect(contasAPagarVoltarPath("situacao=vencido&fornecedor=18&mes=todas&q=premix", hoje)).toBe(
      contasAPagarListagemPath(filtros),
    );
    expect(filtrosContasAPagarDaQuery("", hoje).situacao).toBe(FILTRO_ATIVOS);
    expect(filtrosContasAPagarDaQuery("", hoje).periodo).toEqual({ tipo: "mes", anoMes: "2026-10" });
    expect(identificacaoTitulo(titulo())).toBe("Compra de insumos — Premix");
    expect(identificacaoTitulo(titulo({ descricao: "   " }))).toBe("Título 80");
    expect(identificacaoTitulo(titulo({ descricao: "   " }))).not.toContain("#");
  });
});

function eventoPagamento(parcial: Partial<EventoHistoricoPagamentoOficial> = {}): EventoHistoricoPagamentoOficial {
  return {
    liquidacaoId: 11,
    tipo: "pagamento",
    dataLiquidacao: "2026-03-02",
    contaId: 3,
    contaNome: "Caixa",
    valorMovimentado: "10000.00",
    valorAlocadoNesteTitulo: 10000,
    liquidacaoOriginalId: null,
    estornadaPorLiquidacaoId: null,
    referencia: "NF-1",
    observacoes: null,
    alocacoesDesteTitulo: [{
      parcelaId: 21,
      parcelaNumero: 1,
      vencimento: "2026-03-01",
      principalLiquidado: "10000.00",
      desconto: "0.00",
      juros: "0.00",
      multa: "0.00",
      valorCaixaAlocado: 10000,
    }],
    ...parcial,
  };
}

describe("contasAPagarDetalhe — histórico de pagamentos", () => {
  it("histórico vazio só aparece depois da consulta oficial confirmar", () => {
    expect(deveMostrarHistoricoVazio({ carregando: true, erro: false, eventos: [] })).toBe(false);
    expect(deveMostrarHistoricoVazio({ carregando: false, erro: true, eventos: [] })).toBe(false);
    expect(deveMostrarHistoricoVazio({ carregando: false, erro: false, eventos: undefined })).toBe(false);
    expect(deveMostrarHistoricoVazio({ carregando: false, erro: false, eventos: [eventoPagamento()] })).toBe(false);
    expect(deveMostrarHistoricoVazio({ carregando: false, erro: false, eventos: [] })).toBe(true);
    expect(MSG_NENHUM_PAGAMENTO_REGISTRADO).toBe("Nenhum pagamento registrado.");
    expect(MSG_HISTORICO_PAGAMENTOS_CARREGANDO).toMatch(/Carregando/);
  });

  it("pagamento integral preserva data, conta e valores oficiais", () => {
    const [linha] = montarEventosHistoricoPagamentos([eventoPagamento()]);
    expect(linha).toMatchObject({
      dataLiquidacao: "2026-03-02",
      contaNome: "Caixa",
      valorMovimentado: "10000.00",
      valorNesteTitulo: 10000,
      mostrarTotalLiquidacao: false,
      parcelasTexto: "Parcela 1",
      referencia: "NF-1",
      situacao: "Pagamento",
      efetivo: true,
    });
  });

  it("pagamento parcial e vários pagamentos ficam em eventos distintos", () => {
    const parcial = eventoPagamento({
      liquidacaoId: 1,
      valorMovimentado: "4000.00",
      valorAlocadoNesteTitulo: 4000,
      referencia: null,
      alocacoesDesteTitulo: [{
        parcelaId: 21,
        parcelaNumero: 1,
        vencimento: "2026-03-01",
        principalLiquidado: "4000.00",
        desconto: "0.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 4000,
      }],
    });
    const resto = eventoPagamento({
      liquidacaoId: 2,
      dataLiquidacao: "2026-03-10",
      valorMovimentado: "6000.00",
      valorAlocadoNesteTitulo: 6000,
      referencia: null,
      alocacoesDesteTitulo: [{
        parcelaId: 21,
        parcelaNumero: 1,
        vencimento: "2026-03-01",
        principalLiquidado: "6000.00",
        desconto: "0.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 6000,
      }],
    });
    const linhas = montarEventosHistoricoPagamentos([parcial, resto]);
    expect(linhas).toHaveLength(2);
    expect(linhas.map(l => l.liquidacaoId)).toEqual([1, 2]);
    expect(linhas.map(l => l.valorNesteTitulo)).toEqual([4000, 6000]);
    expect(new Set(linhas.map(l => l.liquidacaoId)).size).toBe(2);
    expect(linhas.every(l => l.parcelasTexto === "Parcela 1")).toBe(true);
  });

  it("liquidação em vários títulos não atribui o total ao título consultado", () => {
    const compartilhada = eventoPagamento({
      valorMovimentado: "15000.00",
      valorAlocadoNesteTitulo: 10000,
    });
    const [linha] = montarEventosHistoricoPagamentos([compartilhada]);
    expect(linha.valorNesteTitulo).toBe(10000);
    expect(linha.valorMovimentado).toBe("15000.00");
    expect(linha.mostrarTotalLiquidacao).toBe(true);
    expect(linha.valorNesteTitulo).not.toBe(15000);
  });

  it("desconto, juros e multa usam os componentes oficiais da alocação", () => {
    const desconto = eventoPagamento({
      valorMovimentado: "9800.00",
      valorAlocadoNesteTitulo: 9800,
      alocacoesDesteTitulo: [{
        parcelaId: 21,
        parcelaNumero: 1,
        vencimento: "2026-03-01",
        principalLiquidado: "10000.00",
        desconto: "200.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 9800,
      }],
    });
    const acrescimos = eventoPagamento({
      liquidacaoId: 12,
      valorMovimentado: "10250.00",
      valorAlocadoNesteTitulo: 10250,
      alocacoesDesteTitulo: [{
        parcelaId: 21,
        parcelaNumero: 1,
        vencimento: "2026-03-01",
        principalLiquidado: "10000.00",
        desconto: "0.00",
        juros: "200.00",
        multa: "50.00",
        valorCaixaAlocado: 10250,
      }],
    });
    const [comDesconto] = montarEventosHistoricoPagamentos([desconto]);
    const [comJuros] = montarEventosHistoricoPagamentos([acrescimos]);
    expect(comDesconto.alocacoes[0]).toMatchObject({
      principalLiquidado: "10000.00",
      desconto: "200.00",
      mostrarComponentes: true,
      valorCaixaAlocado: 9800,
    });
    expect(comJuros.alocacoes[0]).toMatchObject({
      principalLiquidado: "10000.00",
      juros: "200.00",
      multa: "50.00",
      mostrarComponentes: true,
      valorCaixaAlocado: 10250,
    });
    expect(rotuloParcelasHistorico([
      { parcelaNumero: 1 },
      { parcelaNumero: 3 },
      { parcelaNumero: 2 },
    ])).toBe("Parcelas 1, 2 e 3");
  });

  it("pagamento estornado e estorno ficam no histórico, sem parecer pagamento atual", () => {
    const original = eventoPagamento({
      liquidacaoId: 11,
      estornadaPorLiquidacaoId: 12,
    });
    const estorno = eventoPagamento({
      liquidacaoId: 12,
      tipo: "estorno_pagamento",
      dataLiquidacao: "2026-03-08",
      liquidacaoOriginalId: 11,
      estornadaPorLiquidacaoId: null,
      referencia: "NF-1",
    });
    const linhas = montarEventosHistoricoPagamentos([original, estorno]);
    expect(linhas).toHaveLength(2);
    expect(rotuloSituacaoEventoPagamento(original)).toBe("Pagamento estornado");
    expect(rotuloSituacaoEventoPagamento(estorno)).toBe("Estorno de pagamento");
    expect(linhas[0]).toMatchObject({
      situacao: "Pagamento estornado",
      efetivo: false,
      dataLiquidacao: "2026-03-02",
    });
    expect(linhas[1]).toMatchObject({
      situacao: "Estorno de pagamento",
      efetivo: false,
      dataLiquidacao: "2026-03-08",
    });
    expect(linhas.some(l => l.situacao === "Pagamento" && l.efetivo)).toBe(false);
  });

  it("título cancelado e título sem parcelas não inventam evento de pagamento", () => {
    const cancelado = titulo({ estado: "cancelado", parcelas: [] });
    expect(resumoOficialContasAPagar(cancelado).situacaoExibida).toBe("Cancelado");
    expect(montarEventosHistoricoPagamentos([])).toEqual([]);
    expect(deveMostrarHistoricoVazio({ carregando: false, erro: false, eventos: [] })).toBe(true);
    expect(rotuloCondicaoPagamento(titulo({ condicaoStatus: "a_definir", parcelas: [] }))).toBe(TEXTO_A_DEFINIR);
  });

  it("erro de consulta e isolamento não mostram histórico de outro usuário", () => {
    expect(mensagemErroHistoricoPagamentos("FORBIDDEN")).toBe(MSG_ACESSO_NEGADO);
    expect(mensagemErroHistoricoPagamentos("NOT_FOUND")).toBe(MSG_TITULO_NAO_ENCONTRADO);
    expect(mensagemErroHistoricoPagamentos("INTERNAL_SERVER_ERROR")).toBe(MSG_HISTORICO_PAGAMENTOS_ERRO);
    expect(detalheVisivelParaUsuario(titulo({ userId: 99 }), 1)).toEqual({ ok: false, motivo: "acesso" });
    expect(detalheVisivelParaUsuario(titulo({ userId: 1 }), 1)).toEqual({ ok: true });
  });
});

describe("contasAPagarDetalhe — tela e compatibilidade", () => {
  it("rota de detalhe fica antes da listagem e usa titulosGet", () => {
    expect(app).toContain("ContasAPagarDetalhePage");
    expect(app.indexOf('path={`${FINANCEIRO_CONTAS_A_PAGAR_PATH}/:id`}')).toBeLessThan(
      app.indexOf("path={FINANCEIRO_CONTAS_A_PAGAR_PATH} component={ContasAPagarPage}"),
    );
    expect(page).toContain("financeiroV2.titulosGet");
    expect(page).toContain("Voltar para Contas a Pagar");
    expect(page).toContain("MSG_CONDICAO_PAGAMENTO_A_DEFINIR");
    expect(page).toContain("MSG_NENHUM_PAGAMENTO_REGISTRADO");
    expect(page).toContain("tituloHistoricoPagamentos");
    expect(page).toContain("financeiroV2.titulosDefinirParcelas");
    expect(page).toContain("NOT_FOUND");
    expect(page).toContain("FORBIDDEN");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).not.toContain("liquidacaoEstornar");
    expect(page).not.toContain("titulosCreateManual");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("Título #");
    expect(lista).toContain("contasAPagarDetalhePath");
  });

  it("usa a consulta oficial de histórico sem reconstruir pelo extrato nem gravar", () => {
    expect(v2Router).toContain("titulosGet: protectedProcedure");
    expect(v2Router).toContain("detalheTitulo(ctx.user.id, input.id)");
    expect(v2Router).toContain("tituloHistoricoPagamentos: protectedProcedure");
    expect(nucleo).toContain("async detalheTitulo(userId: number, tituloId: number)");
    expect(nucleo).toContain("assertUser(titulo.userId, userId)");
    expect(page).toContain("financeiroV2.tituloHistoricoPagamentos");
    expect(page).toContain("financeiroV2.titulosGet");
    expect(page).toContain("financeiroV2.contasList");
    expect(page).toContain("financeiroV2.titulosDefinirParcelas");
    expect(page).toContain("FINANCEIRO_CONTAS_V2_PATH");
    expect(page).not.toContain("movimentosExtrato");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).toContain("lg:hidden");
    expect(page).toContain("hidden lg:block");
    expect(page).toContain("MobileCard");
    expect(MSG_NENHUM_PAGAMENTO_REGISTRADO).toBe("Nenhum pagamento registrado.");
    expect(MSG_CONDICAO_PAGAMENTO_A_DEFINIR).toBe("Condição de pagamento ainda não definida.");
  });
});
