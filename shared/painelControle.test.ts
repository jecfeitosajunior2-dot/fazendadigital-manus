import { describe, expect, it } from "vitest";
import {
  agregarAlertasPainel,
  agregarEstoquePainel,
  agregarRebanhoPainel,
  animalNasFazendasPainel,
  CONSULTAS_PAINEL_SUBSTITUIDAS,
  avisoRegistrosSemFazendaPainel,
  emptyPainelFinanceiro,
  haRegistrosSemFazendaNoRelatorioV2,
  indicadoresFinanceirosDoRelatorioV2,
  MSG_PAINEL_SEM_ATRIBUICAO_FILTRO,
  operacaoComercialVisivelPainel,
  periodoMesCorrentePainel,
  ROTULO_RESULTADO_MES_ATUAL,
  estadoBlocoPainel,
  montarPainelOverview,
  MSG_PAINEL_FAZENDA_NEGADA,
  normalizarFazendaPainelPersistida,
  pesoAtualRebanho,
  resolverEscopoFazendasPainel,
  statusOperacaoPainel,
} from "./painelControle";

const fazendas = [
  { id: 1, nome: "Boa Vista", area: 100 },
  { id: 2, nome: "Santa Fé", area: 50 },
];

describe("filtro por fazenda do Painel", () => {
  it("uma fazenda devolve só o id autorizado", () => {
    const escopo = resolverEscopoFazendasPainel({ fazendaId: 1, fazendasAutorizadas: fazendas });
    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.fazendaIds).toEqual([1]);
    expect(escopo.fazendas).toHaveLength(2);
    expect(escopo.fazendaSelecionadaId).toBe(1);
  });

  it("várias fazendas em Todas consolida os ids autorizados", () => {
    const escopo = resolverEscopoFazendasPainel({ fazendasAutorizadas: fazendas });
    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.fazendaIds).toEqual([1, 2]);
    expect(escopo.fazendaSelecionadaId).toBeNull();
  });

  it("usuário sem fazendas fica com consolidado vazio", () => {
    const escopo = resolverEscopoFazendasPainel({ fazendasAutorizadas: [] });
    expect(escopo.ok).toBe(true);
    if (!escopo.ok) return;
    expect(escopo.fazendaIds).toEqual([]);
    const painel = montarPainelOverview({
      escopo,
      totalLotes: 0,
      totalPastos: 0,
      rebanho: agregarRebanhoPainel([]),
      estoque: { valorTotal: 0, totalProdutos: 0, baixo: [] },
      alertas: agregarAlertasPainel({
        estoqueBaixo: [],
        movimentacoes: [],
        saude: [],
        partos: [],
        manutencoes: [],
      }),
      ocupacao: [],
      saudeRecente: [],
    });
    expect(painel.rebanho.total).toBe(0);
    expect(painel.estoque.totalProdutos).toBe(0);
    expect(painel.fazendas).toEqual([]);
  });

  it("recusa fazenda de outro usuário", () => {
    const escopo = resolverEscopoFazendasPainel({ fazendaId: 99, fazendasAutorizadas: fazendas });
    expect(escopo).toEqual({ ok: false, motivo: "nao_autorizada" });
    expect(MSG_PAINEL_FAZENDA_NEGADA).toMatch(/não tem acesso/i);
    expect(normalizarFazendaPainelPersistida("99", fazendas)).toBeNull();
    expect(normalizarFazendaPainelPersistida("1", fazendas)).toBe(1);
  });
});

describe("indicadores reais do rebanho", () => {
  it("conta só animais ativos e ignora vendido", () => {
    const rebanho = agregarRebanhoPainel([
      { sexo: "macho", categoria: "Boi", pesoAtual: "400", dataNascimento: "2022-01-01" },
      { sexo: "femea", categoria: "Vaca", pesoAtual: "380", dataNascimento: "2023-06-01" },
    ]);
    expect(rebanho.total).toBe(2);
    expect(rebanho.machos).toBe(1);
    expect(rebanho.femeas).toBe(1);
  });

  it("peso usa só valor positivo gravado, sem inventar", () => {
    expect(pesoAtualRebanho("450")).toBe(450);
    expect(pesoAtualRebanho(0)).toBeNull();
    expect(pesoAtualRebanho(null)).toBeNull();
    expect(pesoAtualRebanho("abc")).toBeNull();
    const rebanho = agregarRebanhoPainel([
      { sexo: "macho", pesoAtual: "200" },
      { sexo: "femea", pesoAtual: null },
      { sexo: "macho", pesoAtual: "0" },
    ]);
    expect(rebanho.comPeso).toBe(1);
    expect(rebanho.pesoTotal).toBe(200);
    expect(rebanho.pesoMedio).toBe(200);
  });

  it("animal de outra fazenda não entra no consolidado", () => {
    const loteFazenda = new Map<number, number | null>([[10, 1], [20, 2]]);
    expect(animalNasFazendasPainel({ fazendaId: 1 }, [1], loteFazenda)).toBe(true);
    expect(animalNasFazendasPainel({ fazendaId: 2, loteId: 20 }, [1], loteFazenda)).toBe(false);
    expect(animalNasFazendasPainel({ fazendaId: null, loteId: 10 }, [1], loteFazenda)).toBe(true);
    expect(animalNasFazendasPainel({ fazendaId: null, loteId: null }, [1], loteFazenda)).toBe(false);
  });
});

describe("alertas e estados", () => {
  it("filtra alertas pelo recorte já autorizado", () => {
    const hoje = new Date("2026-10-29T12:00:00");
    const alertas = agregarAlertasPainel({
      hoje,
      estoqueBaixo: [{ texto: "Sal mineral", detalhe: "2/10 kg" }],
      movimentacoes: [
        { nome: "Vacina A", dataValidade: "2026-11-10" },
        { nome: "Vacina B", dataValidade: "2027-01-01" },
      ],
      saude: [
        { tipo: "Vermífugo", medicamento: "Ivomec", proximaData: "2026-11-05" },
        { tipo: "Aftosa", proximaData: "2027-03-01" },
      ],
      partos: [
        { femeaId: 8, dataPrevistoParto: "2026-11-20", dataPartoReal: null, femea: { brinco: "58" } },
        { femeaId: 9, dataPrevistoParto: "2027-06-01", dataPartoReal: null },
      ],
      manutencoes: [
        { tipo: "Troca de óleo", status: "agendada", proximaManutencao: "2026-11-15" },
        { tipo: "Revisão", status: "concluida", proximaManutencao: "2026-11-02" },
      ],
    });
    expect(alertas.estoqueBaixo).toHaveLength(1);
    expect(alertas.validade.map(v => v.texto)).toEqual(["Vacina A"]);
    expect(alertas.sanidade).toHaveLength(1);
    expect(alertas.partos[0]?.texto).toBe("Fêmea 58");
    expect(alertas.manut).toHaveLength(1);
    expect(alertas.total).toBe(5);
  });

  it("não declara Tudo em ordem enquanto carrega ou falha", () => {
    expect(estadoBlocoPainel(true, false, false)).toBe("carregando");
    expect(estadoBlocoPainel(false, true, false)).toBe("erro");
    expect(estadoBlocoPainel(false, false, false)).toBe("vazio");
    expect(statusOperacaoPainel("carregando", { total: 0, estoqueBaixo: [] }).label).toBe("Carregando");
    expect(statusOperacaoPainel("erro", { total: 0, estoqueBaixo: [] }).label).toBe("Falha na consulta");
    expect(statusOperacaoPainel("pronto", { total: 0, estoqueBaixo: [] }).label).toBe("Tudo em ordem");
  });
});

describe("estoque do painel", () => {
  it("soma patrimônio só dos produtos que controlam saldo", () => {
    const estoque = agregarEstoquePainel([
      { nome: "Ração", quantidade: 10, valorUnitario: 5, controlarSaldo: true, monitorarEstoque: true, quantidadeMinima: 20, unidade: "kg" },
      { nome: "Serviço", quantidade: 1, valorUnitario: 999, controlarSaldo: false },
    ]);
    expect(estoque.totalProdutos).toBe(2);
    expect(estoque.valorTotal).toBe(50);
    expect(estoque.baixo).toHaveLength(1);
  });
});

describe("financeiro e comercial do painel", () => {
  it("reusa os totais do V2 e nunca atribui o caixa à fazenda", () => {
    const periodo = { de: "2026-10-01", ate: "2026-10-31" };
    const todas = indicadoresFinanceirosDoRelatorioV2({
      saldoCaixaBancos: 5000,
      totalAReceber: 2000,
      totalAPagar: 800,
      resultadoRealizado: 1200,
    }, { fazendaSelecionadaId: null, periodo });
    expect(todas.disponivel).toBe(true);
    expect(todas.saldoCaixaConsolidado).toBe(true);
    expect(todas.avisoCaixa).toMatch(/não têm fazenda|consolidado/i);
    expect(todas.titulosFiltradosPorFazenda).toBe(false);
    expect(todas.resultadoFiltradoPorFazenda).toBe(false);
    expect(todas.rotuloResultado).toBe(ROTULO_RESULTADO_MES_ATUAL);

    const uma = indicadoresFinanceirosDoRelatorioV2({
      saldoCaixaBancos: 5000,
      totalAReceber: 400,
      totalAPagar: 100,
      resultadoRealizado: 50,
    }, { fazendaSelecionadaId: 1, periodo, temRegistrosSemFazenda: true });
    expect(uma.saldoCaixaBancos).toBe(5000);
    expect(uma.saldoCaixaConsolidado).toBe(true);
    expect(uma.titulosFiltradosPorFazenda).toBe(true);
    expect(uma.resultadoFiltradoPorFazenda).toBe(true);
    expect(uma.totalAReceber).toBe(400);
    expect(uma.avisoSemAtribuicao).toBe(MSG_PAINEL_SEM_ATRIBUICAO_FILTRO);
  });

  it("compra e venda só entram no recorte quando a origem tem a fazenda", () => {
    expect(operacaoComercialVisivelPainel({ fazendaId: 1, status: "concluido" }, null)).toBe(true);
    expect(operacaoComercialVisivelPainel({ fazendaId: 1, status: "concluido" }, 1)).toBe(true);
    expect(operacaoComercialVisivelPainel({ fazendaId: 2, status: "concluido" }, 1)).toBe(false);
    expect(operacaoComercialVisivelPainel({ fazendaId: null, status: "concluido" }, 1)).toBe(false);
    expect(operacaoComercialVisivelPainel({ fazendaId: 1, status: "cancelado" }, 1)).toBe(false);
  });
});

describe("consultas do painel", () => {
  it("lista as consultas completas que o painel não deve mais disparar", () => {
    expect(CONSULTAS_PAINEL_SUBSTITUIDAS).toContain("trpc.animais.list");
    expect(CONSULTAS_PAINEL_SUBSTITUIDAS).toContain("trpc.pastos.listWithDetails");
    expect(CONSULTAS_PAINEL_SUBSTITUIDAS).toContain("trpc.dashboard.stats");
  });
});
