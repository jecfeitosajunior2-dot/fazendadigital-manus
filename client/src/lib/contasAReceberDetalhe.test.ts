import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FINANCEIRO_ORIGEM_MANUAL } from "@shared/financeiroNucleo";
import {
  FILTRO_VENCIDAS,
  TEXTO_A_DEFINIR,
  contasAReceberDetalhePath,
  contasAReceberListagemPath,
  contasAReceberVoltarPath,
  filtrosContasAReceberVazios,
  idTituloContasAReceber,
  type TituloV2DetalheOficial,
} from "./contasAReceberListagem";
import {
  MSG_ACESSO_NEGADO,
  MSG_HISTORICO_RECEBIMENTOS_CARREGANDO,
  MSG_HISTORICO_RECEBIMENTOS_ERRO,
  MSG_NAO_E_CONTA_A_RECEBER,
  MSG_NENHUM_RECEBIMENTO_REGISTRADO,
  MSG_PARCELAS_AINDA_NAO_DEFINIDAS,
  MSG_TITULO_NAO_ENCONTRADO,
  deveMostrarHistoricoVazio,
  detalheReceberVisivelParaUsuario,
  eventoRecebimentoEfetivo,
  identificacaoTitulo,
  mensagemErroHistoricoRecebimentos,
  montarEventosHistoricoRecebimentos,
  resumoOficialContasAReceber,
  rotuloCondicaoPagamento,
  rotuloSituacaoEventoRecebimento,
  rotuloSituacaoParcelaReceber,
  tituloEhContaAReceber,
  type EventoHistoricoPagamentoOficial,
} from "./contasAReceberDetalhe";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAReceberDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAReceberPage.tsx"), "utf8");
const pagarDetalhe = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");
const legado = readFileSync(resolve(here, "../pages/FinancialManagementPage.tsx"), "utf8");
const dashboard = readFileSync(resolve(here, "../pages/DashboardPage.tsx"), "utf8");

const HOJE = "2026-10-20";

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 80,
    userId: 1,
    tipo: "receber",
    estado: "ativo",
    condicaoStatus: "definida",
    pessoaId: 18,
    contraparteNomeSnapshot: "Frigorífico Norte",
    fazendaOrigemId: 1,
    origemTipo: FINANCEIRO_ORIGEM_MANUAL,
    origemId: null,
    origemItemChave: null,
    descricao: "Venda de bezerros",
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

function eventoRecebimento(parcial: Partial<EventoHistoricoPagamentoOficial> = {}): EventoHistoricoPagamentoOficial {
  return {
    liquidacaoId: 11,
    tipo: "recebimento",
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

describe("contasAReceberDetalhe — título e saldos oficiais", () => {
  it("aceita título a receber válido e recusa a pagar", () => {
    expect(tituloEhContaAReceber(titulo())).toBe(true);
    expect(tituloEhContaAReceber(titulo({ tipo: "pagar" }))).toBe(false);
    expect(detalheReceberVisivelParaUsuario(titulo(), 1)).toEqual({ ok: true });
    expect(detalheReceberVisivelParaUsuario(titulo({ tipo: "pagar" }), 1)).toEqual({
      ok: false,
      motivo: "nao_receber",
    });
    expect(MSG_NAO_E_CONTA_A_RECEBER).toBe("Este registro não é uma conta a receber.");
  });

  it("isola pelo usuário autenticado", () => {
    expect(detalheReceberVisivelParaUsuario(titulo({ userId: 99 }), 1)).toEqual({
      ok: false,
      motivo: "acesso",
    });
    expect(detalheReceberVisivelParaUsuario(titulo({ userId: 1 }), 1)).toEqual({ ok: true });
    expect(idTituloContasAReceber("abc")).toBeNull();
    expect(idTituloContasAReceber("84")).toBe(84);
  });

  it("título sem parcelas não inventa vencimento nem saldo", () => {
    const detalhe = titulo({ condicaoStatus: "a_definir", parcelas: [], situacao: "em_aberto" });
    const resumo = resumoOficialContasAReceber(detalhe);
    expect(resumo.valorOriginal).toBe("300.00");
    expect(resumo.totalPago).toBeNull();
    expect(resumo.saldoAberto).toBeNull();
    expect(resumo.situacaoExibida).toBe("Em aberto");
    expect(rotuloCondicaoPagamento(detalhe)).toBe(TEXTO_A_DEFINIR);
    expect(MSG_PARCELAS_AINDA_NAO_DEFINIDAS).toBe("Parcelas ainda não definidas.");
  });

  it("uma parcela à vista usa os campos oficiais", () => {
    const detalhe = titulo({
      parcelas: [parcela(1, 1, "2026-11-01", "300.00", 0, 300)],
    });
    const resumo = resumoOficialContasAReceber(detalhe);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.saldoAberto).toBe(300);
    expect(rotuloCondicaoPagamento(detalhe)).toBe("À vista");
    expect(rotuloSituacaoParcelaReceber(detalhe.parcelas[0]!, detalhe, HOJE)).toBe("Em aberto");
  });

  it("várias parcelas somam só os campos oficiais do núcleo", () => {
    const detalhe = titulo({
      parcelas: [
        parcela(1, 1, "2026-10-10", "100.00", 0, 100),
        parcela(2, 2, "2026-11-10", "100.00", 0, 100),
        parcela(3, 3, "2026-12-10", "100.00", 0, 100),
      ],
    });
    const resumo = resumoOficialContasAReceber(detalhe);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.saldoAberto).toBe(300);
    expect(rotuloCondicaoPagamento(detalhe)).toBe("3 parcelas");
    expect(rotuloSituacaoParcelaReceber(detalhe.parcelas[0]!, detalhe, HOJE)).toBe("Vencida");
    expect(rotuloSituacaoParcelaReceber(detalhe.parcelas[1]!, detalhe, HOJE)).toBe("Em aberto");
  });

  it("recebimento parcial e título integralmente recebido", () => {
    const parcial = titulo({
      situacao: "parcial",
      parcelas: [
        parcela(1, 1, "2026-09-01", "150.00", 150, 0, true),
        parcela(2, 2, "2026-11-01", "150.00", 50, 100),
      ],
    });
    expect(resumoOficialContasAReceber(parcial)).toMatchObject({
      totalPago: 200,
      saldoAberto: 100,
      situacaoExibida: "Parcial",
    });
    expect(rotuloSituacaoParcelaReceber(parcial.parcelas[0]!, parcial, HOJE)).toBe("Recebida");
    expect(rotuloSituacaoParcelaReceber(parcial.parcelas[1]!, parcial, HOJE)).toBe("Parcial");

    const liquidado = titulo({
      situacao: "liquidado",
      parcelas: [parcela(1, 1, "2026-10-01", "300.00", 300, 0, true)],
    });
    expect(resumoOficialContasAReceber(liquidado)).toMatchObject({
      totalPago: 300,
      saldoAberto: 0,
      situacaoExibida: "Liquidado",
    });
    expect(rotuloSituacaoParcelaReceber(liquidado.parcelas[0]!, liquidado, HOJE)).toBe("Recebida");
  });
});

describe("contasAReceberDetalhe — histórico de recebimentos", () => {
  it("histórico vazio só depois da consulta oficial", () => {
    expect(deveMostrarHistoricoVazio({ carregando: true, erro: false, eventos: [] })).toBe(false);
    expect(deveMostrarHistoricoVazio({ carregando: false, erro: false, eventos: [] })).toBe(true);
    expect(MSG_NENHUM_RECEBIMENTO_REGISTRADO).toBe("Nenhum recebimento registrado.");
    expect(MSG_HISTORICO_RECEBIMENTOS_CARREGANDO).toMatch(/Carregando/);
  });

  it("recebimento efetivo preserva data, conta, valor e parcela", () => {
    const [linha] = montarEventosHistoricoRecebimentos([eventoRecebimento()]);
    expect(linha).toMatchObject({
      dataLiquidacao: "2026-03-02",
      contaNome: "Caixa",
      valorNesteTitulo: 10000,
      parcelasTexto: "Parcela 1",
      situacao: "Recebimento",
      efetivo: true,
    });
    expect(eventoRecebimentoEfetivo(eventoRecebimento())).toBe(true);
  });

  it("recebimento estornado e o estorno ficam no histórico, sem contar como efetivo", () => {
    const original = eventoRecebimento({
      liquidacaoId: 11,
      estornadaPorLiquidacaoId: 12,
    });
    const estorno = eventoRecebimento({
      liquidacaoId: 12,
      tipo: "estorno_recebimento",
      dataLiquidacao: "2026-03-08",
      liquidacaoOriginalId: 11,
      estornadaPorLiquidacaoId: null,
    });
    const linhas = montarEventosHistoricoRecebimentos([original, estorno]);
    expect(linhas).toHaveLength(2);
    expect(rotuloSituacaoEventoRecebimento(original)).toBe("Recebimento estornado");
    expect(rotuloSituacaoEventoRecebimento(estorno)).toBe("Estorno de recebimento");
    expect(linhas[0]).toMatchObject({ situacao: "Recebimento estornado", efetivo: false });
    expect(linhas[1]).toMatchObject({ situacao: "Estorno de recebimento", efetivo: false });
    expect(linhas.some(l => l.efetivo)).toBe(false);
    expect(eventoRecebimentoEfetivo(original)).toBe(false);
    expect(resumoOficialContasAReceber(titulo({
      situacao: "em_aberto",
      parcelas: [parcela(1, 1, "2026-11-01", "300.00", 0, 300)],
    })).totalPago).toBe(0);
  });

  it("não chama recebimento de pagamento", () => {
    const [linha] = montarEventosHistoricoRecebimentos([eventoRecebimento()]);
    expect(linha.situacao).not.toContain("Pagamento");
    expect(rotuloSituacaoEventoRecebimento(eventoRecebimento({ tipo: "pagamento" }))).toBe("Recebimento");
    expect(page).not.toContain("Estorno de pagamento");
    expect(page).not.toContain("Pagamento estornado");
    expect(page).not.toContain("Nenhum pagamento registrado");
    expect(page).toContain("Recebimento");
    expect(page).toContain("Recebimento estornado");
    expect(page).toContain("Estorno de recebimento");
  });

  it("erro de consulta e isolamento não mostram histórico de outro usuário", () => {
    expect(mensagemErroHistoricoRecebimentos("FORBIDDEN")).toBe(MSG_ACESSO_NEGADO);
    expect(mensagemErroHistoricoRecebimentos("NOT_FOUND")).toBe(MSG_TITULO_NAO_ENCONTRADO);
    expect(mensagemErroHistoricoRecebimentos("INTERNAL_SERVER_ERROR")).toBe(MSG_HISTORICO_RECEBIMENTOS_ERRO);
  });
});

describe("contasAReceberDetalhe — navegação, tela e restrições", () => {
  it("lista abre o detalhe e o detalhe volta preservando filtros", () => {
    const hoje = "2026-10-20";
    const filtros = {
      ...filtrosContasAReceberVazios(hoje),
      situacao: FILTRO_VENCIDAS,
      fornecedorId: "18",
      pesquisa: "bezerros",
      periodo: { tipo: "todas" as const },
    };
    expect(contasAReceberDetalhePath(84, filtros)).toBe(
      "/financeiro/contas-a-receber/84?situacao=vencido&cliente=18&mes=todas&q=bezerros",
    );
    expect(contasAReceberVoltarPath("situacao=vencido&cliente=18&mes=todas&q=bezerros", hoje)).toBe(
      contasAReceberListagemPath(filtros),
    );
    expect(identificacaoTitulo(titulo())).toBe("Venda de bezerros");
    expect(lista).toContain("contasAReceberDetalhePath");
    expect(lista).toContain("abrirDetalhe");
    expect(page).toContain("Voltar para Contas a Receber");
  });

  it("rota de detalhe fica antes da listagem e usa só as consultas oficiais", () => {
    expect(app).toContain("ContasAReceberDetalhePage");
    expect(app.indexOf('path={`${FINANCEIRO_CONTAS_A_RECEBER_PATH}/:id`}')).toBeLessThan(
      app.indexOf("path={FINANCEIRO_CONTAS_A_RECEBER_PATH} component={ContasAReceberPage}"),
    );
    expect(app).toContain("ContasAPagarDetalhePage");
    expect(page).toContain("financeiroV2.titulosGet");
    expect(page).toContain("financeiroV2.tituloHistoricoPagamentos");
    expect(page).toContain("financeiroV2.titulosDefinirParcelas");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).toContain("liquidacaoReceber");
    expect(page).toContain("liquidacaoEstornar");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).toContain("lg:hidden");
    expect(page).toContain("hidden lg:block");
    expect(page).toContain("Valor recebido");
    expect(page).toContain("Saldo a receber");
    expect(page).toContain("MSG_PARCELAS_AINDA_NAO_DEFINIDAS");
    expect(pagarDetalhe).toContain("Voltar para Contas a Pagar");
    expect(v2Router).toContain("tituloHistoricoPagamentos: protectedProcedure");
    expect(nucleo).toContain("assertUser(titulo.userId, userId)");
    expect(legado).not.toContain("ContasAReceberDetalhePage");
    expect(dashboard).not.toContain("ContasAReceberDetalhePage");
  });
});
