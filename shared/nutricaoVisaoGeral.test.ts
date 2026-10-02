import { describe, expect, it } from "vitest";
import { arredondarKg } from "./nutricaoDietas";
import {
  animalDiaLote,
  agregarCustoFornecimentos,
  chaveFonteLote,
  consolidarPlanejadoFornecido,
  consumoAparenteDoPainel,
  custoPorKgFornecido,
  dataReferenciaPeriodo,
  enumerarDiasCivis,
  fornsConfirmados,
  formatarIndicadorNumero,
  formatarMoedaIndicador,
  intersecaoPeriodo,
  invarianteFornecidoSemDuplicar,
  montarPainelNutricao,
  MSG_VG_CONSUMO_APARENTE,
  MSG_VG_FORNECIDO_CAB_DIA,
  MSG_VG_METAS_VARIAVEIS,
  MSG_VG_NAO_REAL,
  MSG_VG_PLANEJADO_ACUMULADO,
  MSG_VG_PLANEJADO_PERIODO,
  MSG_VG_SEM_MOVIMENTO,
  rotuloCoberturaFornecidoCabDia,
  periodoRapido,
  periodoRealizadoAteReferencia,
  planejadoNoPeriodo,
  planejamentoAplicaNoDia,
  populacaoEstavelLote,
  type VgForn,
  type VgLeitura,
  type VgPlan,
} from "./nutricaoVisaoGeral";

const PER = { de: "2026-10-01", ate: "2026-10-10" };
const HOJE = "2026-10-10";

function forn(over: Partial<VgForn> = {}): VgForn {
  return {
    id: 1,
    fazendaId: 1,
    loteId: 1,
    planejamentoId: 1,
    cochoId: 1,
    cochoNomeSnapshot: "C01",
    tipoOrigem: "produto",
    produtoId: 10,
    dietaId: null,
    origemOperacional: "direta",
    batidaId: null,
    data: "2026-10-01",
    hora: "08:00",
    quantidadeFornecidaKg: 100,
    populacaoSnapshot: 50,
    origemNomeSnapshot: "Milho",
    custoTotalSnapshot: 200,
    custoPorKgSnapshot: 2,
    custoCompleto: true,
    status: "confirmado",
    planejamentoMetaSnapshot: "2 kg/cab/dia",
    ...over,
  };
}

function plan(over: Partial<VgPlan> = {}): VgPlan {
  return {
    id: 1,
    fazendaId: 1,
    loteId: 1,
    tipoOrigem: "produto",
    produtoId: 10,
    dietaId: null,
    modalidadeMeta: "kg_cab_dia",
    valorMeta: 2,
    frequencia: "diaria",
    tratosPorDia: 2,
    frequenciaIntervaloDias: null,
    frequenciaDiasSemana: [],
    dataInicio: "2026-10-01",
    dataFim: "2026-10-31",
    status: "ativo",
    origemNome: "Milho",
    ...over,
  };
}

function leitura(over: Partial<VgLeitura> = {}): VgLeitura {
  return {
    id: 10,
    fazendaId: 1,
    cochoId: 1,
    loteId: 1,
    fornecimentoId: 1,
    data: "2026-10-01",
    hora: "17:00",
    sobraKg: 20,
    status: "ativa",
    cochoNomeSnapshot: "C01",
    loteNomeSnapshot: "B01",
    escore: null,
    ...over,
  };
}

function painel(over: Partial<Parameters<typeof montarPainelNutricao>[0]> = {}) {
  return montarPainelNutricao({
    periodo: PER,
    hojeISO: HOJE,
    fornecimentos: [],
    planejamentos: [],
    leituras: [],
    batidas: [],
    lotes: [{ id: 1, nome: "B01", fazendaId: 1 }, { id: 2, nome: "B02", fazendaId: 1 }],
    produtos: [{
      produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "2", quantidade: "500",
      controlarSaldo: true, vinculadoFazenda: true,
    }],
    dietas: [],
    animaisPorLote: new Map([[1, Array.from({ length: 50 }, (_, i) => i + 1)]]),
    pesagens: [],
    ...over,
  });
}

describe("nutricaoVisaoGeral — custo", () => {
  it("1: fornecimento direto entra uma vez", () => {
    const c = agregarCustoFornecimentos([forn({ custoTotalSnapshot: 200, origemOperacional: "direta" })]);
    expect(c.custoConhecido).toBe(200);
    expect(c.completo).toBe(true);
  });

  it("2/3: batida usa custo alocado do fornecimento, não o custo integral da batida", () => {
    const c = agregarCustoFornecimentos([
      forn({ origemOperacional: "batida", batidaId: 7, custoTotalSnapshot: 80, quantidadeFornecidaKg: 40 }),
    ]);
    expect(c.custoConhecido).toBe(80);
    expect(c.custoConhecido).not.toBe(320);
  });

  it("4/45: custo incompleto não vira zero", () => {
    const c = agregarCustoFornecimentos([forn({ custoCompleto: false, custoTotalSnapshot: null })]);
    expect(c.completo).toBe(false);
    expect(custoPorKgFornecido(c)).toBeNull();
    const p = painel({ fornecimentos: [forn({ custoCompleto: false, custoTotalSnapshot: null })] });
    expect(p.cards.custoConhecido).toBeNull();
    expect(p.cards.custoIncompleto).toBe(true);
    expect(formatarMoedaIndicador(p.cards.custoConhecido)).toBe("—");
  });

  it("5: estornado não entra", () => {
    const p = painel({
      fornecimentos: [
        forn({ id: 1, custoTotalSnapshot: 200 }),
        forn({ id: 2, status: "estornado", custoTotalSnapshot: 999, quantidadeFornecidaKg: 999 }),
      ],
    });
    expect(p.cards.custoConhecido).toBe(200);
    expect(p.cards.kgFornecido).toBe(100);
  });

  it("6: custo/kg correto quando completo", () => {
    expect(custoPorKgFornecido(agregarCustoFornecimentos([
      forn({ quantidadeFornecidaKg: 100, custoTotalSnapshot: 200 }),
    ]))).toBe(2);
  });

  it("7/32: custo/cab/dia só com denominador válido", () => {
    const ok = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-01" },
      fornecimentos: [forn({ data: "2026-10-01", populacaoSnapshot: 50, quantidadeFornecidaKg: 100, custoTotalSnapshot: 200 })],
    });
    expect(ok.cards.custoCabDia).toBe(4);
    const instavel = painel({
      fornecimentos: [
        forn({ id: 1, data: "2026-10-01", populacaoSnapshot: 50 }),
        forn({ id: 2, data: "2026-10-02", populacaoSnapshot: 80 }),
      ],
    });
    expect(instavel.cards.custoCabDia).toBeNull();
  });
});

describe("nutricaoVisaoGeral — quantidade", () => {
  it("8/44: confirmados somam; ausência real = 0 kg", () => {
    expect(painel({ fornecimentos: [forn(), forn({ id: 2, quantidadeFornecidaKg: 50 })] }).cards.kgFornecido).toBe(150);
    expect(painel().cards.kgFornecido).toBe(0);
  });

  it("9: estornados excluídos", () => {
    expect(fornsConfirmados([forn({ status: "estornado" })], PER)).toHaveLength(0);
  });

  it("10/12: batida preparada não é quantidade fornecida; saldo não distribuído não entra", () => {
    const p = painel({
      batidas: [{ id: 7, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Dieta 90", data: "2026-10-01", quantidadePreparadaKg: 200, status: "confirmado" }],
    });
    expect(p.cards.kgFornecido).toBe(0);
    expect(p.batidasSaldo[0]?.saldoKg).toBe(200);
  });

  it("11: fornecimento de batida entra como quantidade", () => {
    const p = painel({
      fornecimentos: [forn({ origemOperacional: "batida", batidaId: 7, quantidadeFornecidaKg: 40 })],
      batidas: [{ id: 7, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "D", data: "2026-10-01", quantidadePreparadaKg: 200, status: "confirmado" }],
    });
    expect(p.cards.kgFornecido).toBe(40);
    expect(p.batidasSaldo[0]?.saldoKg).toBe(160);
  });
});

describe("nutricaoVisaoGeral — planejamento", () => {
  it("13/19: planejado respeita validade e interseção parcial", () => {
    const calc = planejadoNoPeriodo({
      plan: plan({ dataInicio: "2026-10-10", dataFim: "2026-10-30" }),
      periodo: { de: "2026-10-01", ate: "2026-10-15" },
      populacao: 50,
      todosPlanos: [plan({ dataInicio: "2026-10-10", dataFim: "2026-10-30" })],
    });
    expect(calc.diasAplicaveis).toBe(6);
    expect(calc.planejadoKg).toBe(600);
  });

  it("14: respeita dias da semana", () => {
    const p = plan({ frequencia: "dias_semana", frequenciaDiasSemana: [3] });
    expect(planejamentoAplicaNoDia(p, "2026-10-07")).toBe(true);
    expect(planejamentoAplicaNoDia(p, "2026-10-08")).toBe(false);
  });

  it("15: respeita intervalo a cada X dias", () => {
    const p = plan({ frequencia: "a_cada_x_dias", frequenciaIntervaloDias: 2, dataInicio: "2026-10-01" });
    expect(planejamentoAplicaNoDia(p, "2026-10-01")).toBe(true);
    expect(planejamentoAplicaNoDia(p, "2026-10-02")).toBe(false);
    expect(planejamentoAplicaNoDia(p, "2026-10-03")).toBe(true);
  });

  it("16: tratos/dia não multiplica a meta diária", () => {
    const calc = planejadoNoPeriodo({
      plan: plan({ tratosPorDia: 4, valorMeta: 2 }),
      periodo: { de: "2026-10-01", ate: "2026-10-01" },
      populacao: 50,
      todosPlanos: [plan({ tratosPorDia: 4, valorMeta: 2 })],
    });
    expect(calc.planejadoKg).toBe(100);
  });

  it("17/36: ad libitum e conforme necessidade não geram quantidade falsa", () => {
    expect(planejadoNoPeriodo({
      plan: plan({ modalidadeMeta: "ad_libitum", valorMeta: null }),
      periodo: PER, populacao: 50, todosPlanos: [plan({ modalidadeMeta: "ad_libitum", valorMeta: null })],
    }).planejadoKg).toBeNull();
    expect(planejadoNoPeriodo({
      plan: plan({ frequencia: "conforme_necessidade" }),
      periodo: PER, populacao: 50, todosPlanos: [plan({ frequencia: "conforme_necessidade" })],
    }).planejadoKg).toBeNull();
  });

  it("18: substituição não duplica meta no mesmo dia", () => {
    const a = plan({ id: 1, dataInicio: "2026-10-01", dataFim: "2026-10-05" });
    const b = plan({ id: 2, dataInicio: "2026-10-05", dataFim: "2026-10-10" });
    const painelOut = painel({
      periodo: { de: "2026-10-05", ate: "2026-10-05" },
      planejamentos: [a, b],
      fornecimentos: [forn({ data: "2026-10-05", populacaoSnapshot: 50, quantidadeFornecidaKg: 100 })],
    });
    expect(painelOut.planejado).toHaveLength(1);
    const soma = painelOut.planejado.reduce((s, l) => s + (l.planejadoPeriodoKg ?? 0), 0);
    expect(soma).toBe(100);
    expect(painelOut.planejado[0]!.planejadoAteReferenciaKg).toBe(100);
  });
});

describe("nutricaoVisaoGeral — consumo aparente", () => {
  it("20/21/26/27: usa motor da Etapa 6 e não chama de real", () => {
    const fornRef = {
      id: 1, userId: 10, fazendaId: 1, cochoId: 1, loteId: 1, tipoOrigem: "produto",
      produtoId: 10, dietaId: null, origemNomeSnapshot: "Milho", quantidadeFornecidaKg: 100,
      status: "confirmado", data: "2026-10-01", hora: "08:00", populacaoSnapshot: 50,
      batidaId: null, planejamentoId: 1,
    };
    const out = consumoAparenteDoPainel({
      leiturasPeriodo: [leitura()],
      leiturasCocho: [leitura()],
      fornecimentosCocho: [fornRef],
    });
    expect(out.linhas[0]?.consumoAparenteKg).toBe(80);
    expect(out.ciclosCalculaveis).toBe(1);
    expect(out.ciclosQuantitativos).toBe(1);
    expect(out.coberturaTexto).toMatch(/1 de 1/);
    const p = painel({
      fornecimentos: [forn()],
      leituras: [leitura()],
    });
    expect(p.consumo.rotulo).toBe(MSG_VG_CONSUMO_APARENTE);
    expect(p.consumo.rotulo).not.toMatch(/consumo real/i);
    expect(p.consumo.aviso).toBe(MSG_VG_NAO_REAL);
  });

  it("22/47: ciclo inválido não vira zero", () => {
    const p = painel({ leituras: [leitura({ sobraKg: 20, fornecimentoId: null })] });
    expect(p.consumo.totalAparenteKg).toBeNull();
    expect(p.consumo.linhas[0]?.consumoAparenteKg).toBeNull();
    expect(formatarIndicadorNumero(p.consumo.totalAparenteKg)).toBe("—");
  });

  it("23: troca de lote continua inválida", () => {
    const p = painel({
      fornecimentos: [
        forn({ id: 1, hora: "08:00", loteId: 1 }),
        forn({ id: 2, hora: "12:00", loteId: 2, quantidadeFornecidaKg: 50 }),
      ],
      leituras: [
        leitura({ id: 9, hora: "07:00", sobraKg: 10, loteId: 1, fornecimentoId: null }),
        leitura({ id: 10, hora: "17:00", sobraKg: 20, loteId: 2, fornecimentoId: null }),
      ],
    });
    const atual = p.consumo.linhas.find(l => l.leituraId === 10);
    expect(atual?.calculavel).toBe(false);
    expect(atual?.motivo).toMatch(/lote/i);
  });

  it("24: troca de alimento continua inválida", () => {
    const p = painel({
      fornecimentos: [
        forn({ id: 1, hora: "08:00" }),
        forn({ id: 2, hora: "12:00", tipoOrigem: "dieta", dietaId: 5, produtoId: null, origemNomeSnapshot: "Dieta" }),
      ],
      leituras: [
        leitura({ id: 9, hora: "07:00", sobraKg: 10, fornecimentoId: null }),
        leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      ],
    });
    expect(p.consumo.linhas.find(l => l.leituraId === 10)?.calculavel).toBe(false);
  });

  it("25: escore sem kg não vira consumo", () => {
    const p = painel({
      fornecimentos: [forn()],
      leituras: [leitura({ sobraKg: null, escore: "1", fornecimentoId: 1 })],
    });
    expect(p.consumo.linhas[0]?.consumoAparenteKg).toBeNull();
    expect(p.consumo.ciclosQuantitativos).toBe(0);
  });
});

describe("nutricaoVisaoGeral — população e animal-dia", () => {
  it("28: não soma snapshots como animais únicos", () => {
    const forns = [
      forn({ id: 1, data: "2026-10-01", populacaoSnapshot: 100 }),
      forn({ id: 2, data: "2026-10-02", populacaoSnapshot: 100 }),
    ];
    expect(populacaoEstavelLote(forns).populacao).toBe(100);
    const p = painel({ fornecimentos: forns });
    expect(p.cards.populacaoObservada).toBe(100);
    expect(p.cards.populacaoObservada).not.toBe(200);
  });

  it("29/30/31/46: população atual não substitui histórico; /cab/dia some sem denominador", () => {
    const instavel = [
      forn({ id: 1, data: "2026-10-01", populacaoSnapshot: 50 }),
      forn({ id: 2, data: "2026-10-02", populacaoSnapshot: 80 }),
    ];
    expect(animalDiaLote(instavel).animalDia).toBeNull();
    const p = painel({
      fornecimentos: instavel,
      animaisPorLote: new Map([[1, Array.from({ length: 999 }, (_, i) => i + 1)]]),
    });
    expect(p.cards.fornecidoCabDia).toBeNull();
    expect(p.cards.populacaoObservada).toBeNull();
    expect(p.cards.populacaoIncompleta).toBe(true);
    expect(p.cards.coberturaAnimalDia).toBeNull();
  });

  it("explica fornecido/cab/dia sem jargão de animal-dia", () => {
    expect(rotuloCoberturaFornecidoCabDia(1, 1, true)).toBe(MSG_VG_FORNECIDO_CAB_DIA);
    expect(rotuloCoberturaFornecidoCabDia(0, 1, true)).toBe(
      "Média calculada nos dias com fornecimento registrado · 0 de 1 lote com dados válidos.",
    );
    expect(rotuloCoberturaFornecidoCabDia(1, 2, true)).toBe(
      "Média calculada nos dias com fornecimento registrado · 1 de 2 lotes com dados válidos.",
    );
    expect(rotuloCoberturaFornecidoCabDia(1, 1, false)).toBeNull();
    const p = painel({
      fornecimentos: [forn({ id: 1, data: "2026-10-01", populacaoSnapshot: 6, quantidadeFornecidaKg: 46.2 })],
    });
    expect(p.cards.fornecidoCabDia).toBe(7.7);
    expect(p.cards.coberturaAnimalDia).toBe(MSG_VG_FORNECIDO_CAB_DIA);
    expect(p.cards.coberturaAnimalDia).not.toMatch(/animal-dia/);
  });
});

describe("nutricaoVisaoGeral — autonomia e estoque", () => {
  it("33/34/35/37/38: autonomia usa planejamento vigente e não inventa zero", () => {
    const p = painel({
      planejamentos: [plan()],
      produtos: [{
        produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "2", quantidade: "500",
        controlarSaldo: true, vinculadoFazenda: true,
      }],
      animaisPorLote: new Map([[1, Array.from({ length: 50 }, (_, i) => i + 1)]]),
    });
    expect(p.cards.menorAutonomiaDias).toBe(5);
    expect(p.estoqueAutonomia[0]?.necessidadeKgDia).toBe(100);
    expect(p.estoqueAutonomia[0]?.saldoKg).toBe(500);

    const adlib = painel({
      planejamentos: [plan({ modalidadeMeta: "ad_libitum", valorMeta: null })],
    });
    expect(adlib.cards.menorAutonomiaDias).toBeNull();
    expect(formatarIndicadorNumero(adlib.cards.menorAutonomiaDias, { sufixo: "dias" })).toBe("—");
    expect(adlib.estoqueAutonomia).toHaveLength(0);
  });

  it("35: dieta decompõe necessidade em ingredientes", () => {
    const p = painel({
      planejamentos: [plan({ tipoOrigem: "dieta", dietaId: 5, produtoId: null, origemNome: "Dieta 90" })],
      dietas: [{
        id: 5, userId: 10, fazendaId: 1, nome: "Dieta 90", status: "ativa",
        dataInicio: null, dataFim: null, baseQuantidade: 100,
        ingredientes: [
          { produtoId: 10, quantidadeKg: 60 },
          { produtoId: 11, quantidadeKg: 40 },
        ],
      }],
      produtos: [
        { produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "2", quantidade: "600", controlarSaldo: true, vinculadoFazenda: true },
        { produtoId: 11, nome: "Farelo", unidade: "kg", valorUnitario: "3", quantidade: "200", controlarSaldo: true, vinculadoFazenda: true },
      ],
    });
    expect(p.estoqueAutonomia.find(e => e.produtoId === 10)?.necessidadeKgDia).toBe(60);
    expect(p.estoqueAutonomia.find(e => e.produtoId === 11)?.necessidadeKgDia).toBe(40);
  });
});

describe("nutricaoVisaoGeral — multi-fazenda e zero", () => {
  it("39-43: fatos de outra fazenda não entram se o service filtrar; domínio só vê o que recebe", () => {
    const p = painel({
      fornecimentos: [forn({ fazendaId: 1 })],
      planejamentos: [plan({ fazendaId: 1 })],
    });
    expect(p.cards.lotesAtendidos).toBe(1);
    expect(p.cards.kgFornecido).toBe(100);
  });

  it("44: sem fornecimento = 0 kg, não —", () => {
    expect(painel().cards.kgFornecido).toBe(0);
    expect(formatarIndicadorNumero(0, { sufixo: "kg" })).toBe("0 kg");
  });
});

describe("datas civis", () => {
  it("não inventa UTC ao enumerar dias", () => {
    expect(enumerarDiasCivis("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(intersecaoPeriodo({ de: "2026-10-01", ate: "2026-10-15" }, { de: "2026-10-10", ate: "2026-10-30" }))
      .toEqual({ de: "2026-10-10", ate: "2026-10-15" });
    expect(periodoRapido("hoje", "2026-10-10")).toEqual({ de: "2026-10-10", ate: "2026-10-10" });
    expect(periodoRapido("7d", "2026-10-10")).toEqual({ de: "2026-10-04", ate: "2026-10-10" });
    expect(periodoRapido("mes", "2026-10-02")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
  });
});

describe("estado vazio e rótulos", () => {
  it("54: vazio útil sem zeros enganosos de custo/consumo", () => {
    const p = painel();
    expect(p.vazio).toBe(true);
    expect(p.mensagemVazio).toBe(MSG_VG_SEM_MOVIMENTO);
    expect(p.cards.kgFornecido).toBe(0);
    expect(p.cards.custoConhecido).toBe(0);
    expect(p.consumo.totalAparenteKg).toBeNull();
  });
});

describe("nutricaoVisaoGeral — vigência histórica", () => {
  it("A: encerrado 01/10–05/10 entra só nesses dias", () => {
    const calc = planejadoNoPeriodo({
      plan: plan({ status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-05", valorMeta: 2 }),
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      populacao: 50,
      todosPlanos: [plan({ status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-05", valorMeta: 2 })],
    });
    expect(calc.diasAplicaveis).toBe(5);
    expect(calc.planejadoKg).toBe(500);
  });

  it("B: cancelado futuro não gera histórico planejado", () => {
    const calc = planejadoNoPeriodo({
      plan: plan({ status: "cancelado", dataInicio: "2026-10-10", dataFim: null }),
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      populacao: 50,
      todosPlanos: [plan({ status: "cancelado", dataInicio: "2026-10-10", dataFim: null })],
    });
    expect(calc.planejadoKg).toBeNull();
    expect(calc.diasAplicaveis).toBe(0);
  });

  it("C: ativo a partir de 06/10 não projeta antes", () => {
    const calc = planejadoNoPeriodo({
      plan: plan({ dataInicio: "2026-10-06", dataFim: "2026-10-10", valorMeta: 2 }),
      periodo: { de: "2026-10-01", ate: "2026-10-10" },
      populacao: 50,
      todosPlanos: [plan({ dataInicio: "2026-10-06", dataFim: "2026-10-10", valorMeta: 2 })],
    });
    expect(calc.diasAplicaveis).toBe(5);
    expect(calc.planejadoKg).toBe(500);
  });

  it("D: cancelado legado com fornecimento carrega sem corrigir dados", () => {
    const p = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [plan({ id: 1, status: "cancelado", dataInicio: "2026-10-01", dataFim: null, tratosPorDia: 2 })],
      fornecimentos: [
        forn({ id: 1, planejamentoId: 1, data: "2026-10-01", quantidadeFornecidaKg: 0.6, populacaoSnapshot: 6 }),
        forn({ id: 2, planejamentoId: 1, data: "2026-10-02", quantidadeFornecidaKg: 0.6, populacaoSnapshot: 6 }),
      ],
    });
    expect(p.planejado).toHaveLength(1);
    expect(p.planejado[0]!.planejamentoIds).toEqual([]);
    expect(p.planejado[0]!.planejadoAteReferenciaKg).toBeNull();
    expect(p.planejado[0]!.planejadoPeriodoKg).toBeNull();
    expect(p.planejado[0]!.fornecidoKg).toBe(1.2);
    expect(p.planejado[0]!.desvioAteReferenciaKg).toBeNull();
    expect(p.planejado[0]!.desvioAteReferenciaPercentual).toBeNull();
    expect(p.planejado[0]!.meta).toBe("—");
    expect(p.cards.kgFornecido).toBe(1.2);
    expect(p.vazio).toBe(false);
  });

  it("substituição 01–04 + 05 em diante não duplica dia nem multiplica trato", () => {
    const antigo = plan({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-04", valorMeta: 2, tratosPorDia: 2 });
    const novo = plan({ id: 2, dataInicio: "2026-10-05", dataFim: "2026-10-05", valorMeta: 2, tratosPorDia: 2 });
    const periodo = { de: "2026-10-01", ate: "2026-10-05" };
    const out = painel({
      periodo,
      planejamentos: [antigo, novo],
      fornecimentos: [forn({ data: "2026-10-01", populacaoSnapshot: 50, quantidadeFornecidaKg: 100 })],
    });
    expect(out.planejado).toHaveLength(1);
    expect(out.planejado[0]!.planejamentoIds).toEqual([1, 2]);
    expect(out.planejado[0]!.planejadoPeriodoKg).toBe(500);
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBe(500);
    expect(out.planejado[0]!.fornecidoKg).toBe(100);
    expect(planejadoNoPeriodo({ plan: antigo, periodo, populacao: 50, todosPlanos: [antigo, novo] }).diasAplicaveis).toBe(4);
    expect(planejadoNoPeriodo({ plan: novo, periodo, populacao: 50, todosPlanos: [antigo, novo] }).diasAplicaveis).toBe(1);
  });
});

function planB01(over: Partial<VgPlan> = {}): VgPlan {
  return plan({
    tipoOrigem: "produto",
    produtoId: 22,
    modalidadeMeta: "g_cab_dia",
    valorMeta: 100,
    frequencia: "diaria",
    tratosPorDia: 2,
    origemNome: "Sal Nitrogenado 40 Flex LA",
    ...over,
  });
}

function fornB01(over: Partial<VgForn> = {}): VgForn {
  return forn({
    tipoOrigem: "produto",
    produtoId: 22,
    origemNomeSnapshot: "Sal Nitrogenado 40 Flex LA",
    populacaoSnapshot: 6,
    quantidadeFornecidaKg: 0.6,
    ...over,
  });
}

describe("nutricaoVisaoGeral — data de referência", () => {
  it("período passado usa o fim do filtro", () => {
    expect(dataReferenciaPeriodo({ de: "2026-09-01", ate: "2026-09-30" }, "2026-10-02")).toBe("2026-09-30");
    expect(periodoRealizadoAteReferencia({ de: "2026-09-01", ate: "2026-09-30" }, "2026-10-02"))
      .toEqual({ de: "2026-09-01", ate: "2026-09-30" });
  });

  it("período atual e período que termina hoje usam hoje", () => {
    expect(dataReferenciaPeriodo({ de: "2026-10-01", ate: "2026-10-31" }, "2026-10-02")).toBe("2026-10-02");
    expect(periodoRealizadoAteReferencia({ de: "2026-10-01", ate: "2026-10-31" }, "2026-10-02"))
      .toEqual({ de: "2026-10-01", ate: "2026-10-02" });
    expect(dataReferenciaPeriodo({ de: "2026-09-25", ate: "2026-10-02" }, "2026-10-02")).toBe("2026-10-02");
  });

  it("período totalmente futuro não tem intervalo realizado", () => {
    expect(dataReferenciaPeriodo({ de: "2026-10-10", ate: "2026-10-31" }, "2026-10-02")).toBe("2026-10-02");
    expect(periodoRealizadoAteReferencia({ de: "2026-10-10", ate: "2026-10-31" }, "2026-10-02")).toBeNull();
  });
});

describe("nutricaoVisaoGeral — consolidação planejado × fornecido", () => {
  it("B01: uma linha, acumulado 1,2 kg, período 18,6 kg, desvio 0", () => {
    const p1 = planB01({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-01" });
    const p2 = planB01({ id: 2, status: "ativo", dataInicio: "2026-10-02", dataFim: null });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [p1, p2],
      fornecimentos: [
        fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" }),
        fornB01({ id: 3, planejamentoId: 2, data: "2026-10-02" }),
      ],
    });
    expect(out.planejado).toHaveLength(1);
    const row = out.planejado[0]!;
    expect(row.loteNome).toBe("B01");
    expect(row.fonte).toBe("Sal Nitrogenado 40 Flex LA");
    expect(row.meta).toBe("100 g/cab/dia");
    expect(row.planejadoAteReferenciaKg).toBe(1.2);
    expect(row.planejadoPeriodoKg).toBe(18.6);
    expect(row.fornecidoKg).toBe(1.2);
    expect(row.desvioAteReferenciaKg).toBe(0);
    expect(row.desvioAteReferenciaPercentual).toBe(0);
    expect(row.planejamentoIds).toEqual([1, 2]);
    expect(row.fornecimentoIds).toEqual([2, 3]);
    expect(invarianteFornecidoSemDuplicar(out.planejado)).toBe(true);
    expect(out.cards.kgFornecido).toBe(1.2);
    expect(out.cards.fornecidoCabDia).toBe(0.1);
  });

  it("meta variável não escolhe uma das metas", () => {
    const p1 = planB01({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-01", valorMeta: 100 });
    const p2 = planB01({ id: 2, status: "ativo", dataInicio: "2026-10-02", dataFim: null, valorMeta: 120 });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [p1, p2],
      fornecimentos: [
        fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" }),
        fornB01({ id: 3, planejamentoId: 2, data: "2026-10-02" }),
      ],
    });
    expect(out.planejado).toHaveLength(1);
    expect(out.planejado[0]!.meta).toBe(MSG_VG_METAS_VARIAVEIS);
    expect(out.planejado[0]!.meta).not.toBe("100 g/cab/dia");
    expect(out.planejado[0]!.meta).not.toBe("120 g/cab/dia");
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBe(1.32);
    expect(out.planejado[0]!.planejadoPeriodoKg).toBe(22.2);
    expect(out.planejado[0]!.fornecidoKg).toBe(1.2);
  });

  it("produto e dieta, ou produtos distintos, não consolidam pelo nome", () => {
    const produtoA = planB01({ id: 1, produtoId: 22, origemNome: "Sal" });
    const produtoB = planB01({ id: 2, produtoId: 23, origemNome: "Sal" });
    const dieta = planB01({
      id: 3,
      tipoOrigem: "dieta",
      produtoId: null,
      dietaId: 5,
      origemNome: "Sal",
    });
    expect(chaveFonteLote(produtoA)).not.toBe(chaveFonteLote(produtoB));
    expect(chaveFonteLote(produtoA)).not.toBe(chaveFonteLote(dieta));
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [produtoA, produtoB, dieta],
      fornecimentos: [
        fornB01({ id: 10, planejamentoId: 1, produtoId: 22 }),
        fornB01({ id: 11, planejamentoId: 2, produtoId: 23, origemNomeSnapshot: "Sal" }),
        fornB01({
          id: 12,
          planejamentoId: 3,
          tipoOrigem: "dieta",
          produtoId: null,
          dietaId: 5,
          origemNomeSnapshot: "Sal",
        }),
      ],
    });
    expect(out.planejado).toHaveLength(3);
    expect(new Set(out.planejado.map(l => l.chave)).size).toBe(3);
    expect(invarianteFornecidoSemDuplicar(out.planejado)).toBe(true);
    expect(arredondarKg(out.planejado.reduce((s, l) => s + l.fornecidoKg, 0))).toBe(1.8);
  });

  it("fornecimento sem plano entra uma vez, sem meta inventada", () => {
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [],
      fornecimentos: [fornB01({ id: 9, planejamentoId: null, data: "2026-10-01" })],
    });
    expect(out.planejado).toHaveLength(1);
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBeNull();
    expect(out.planejado[0]!.planejadoPeriodoKg).toBeNull();
    expect(out.planejado[0]!.desvioAteReferenciaKg).toBeNull();
    expect(out.planejado[0]!.meta).toBe("—");
    expect(out.planejado[0]!.fornecidoKg).toBe(0.6);
    expect(out.planejado[0]!.planejamentoIds).toEqual([]);
  });

  it("período futuro projeta sem desvio nem acumulado", () => {
    const p1 = planB01({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-01" });
    const p2 = planB01({ id: 2, status: "ativo", dataInicio: "2026-10-02", dataFim: null });
    const fornsPop = [
      fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" }),
      fornB01({ id: 3, planejamentoId: 2, data: "2026-10-02" }),
    ];
    const linhas = consolidarPlanejadoFornecido({
      periodo: { de: "2026-10-10", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planos: [p2],
      todosPlanos: [p1, p2],
      forns: [],
      porLote: new Map([[1, fornsPop]]),
      nomeLote: () => "B01",
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.periodoRealizado).toBe(false);
    expect(linhas[0]!.planejadoAteReferenciaKg).toBeNull();
    expect(linhas[0]!.desvioAteReferenciaKg).toBeNull();
    expect(linhas[0]!.desvioAteReferenciaPercentual).toBeNull();
    expect(linhas[0]!.planejadoPeriodoKg).toBe(13.2);
  });

  it("período passado: acumulado coincide com o período", () => {
    const encerrado = planB01({
      id: 1,
      status: "encerrado",
      dataInicio: "2026-09-01",
      dataFim: "2026-09-30",
    });
    const out = painel({
      periodo: { de: "2026-09-01", ate: "2026-09-30" },
      hojeISO: "2026-10-02",
      planejamentos: [encerrado],
      fornecimentos: [
        fornB01({ id: 4, planejamentoId: 1, data: "2026-09-01" }),
        fornB01({ id: 5, planejamentoId: 1, data: "2026-09-02" }),
      ],
    });
    expect(out.planejado).toHaveLength(1);
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBe(out.planejado[0]!.planejadoPeriodoKg);
    expect(out.planejado[0]!.planejadoPeriodoKg).toBe(18);
  });

  it("frequências usam as mesmas regras no acumulado e no período", () => {
    const semana = planB01({ frequencia: "dias_semana", frequenciaDiasSemana: [3] });
    const intervalo = planB01({
      id: 2,
      produtoId: 23,
      origemNome: "Outro",
      frequencia: "a_cada_x_dias",
      frequenciaIntervaloDias: 2,
    });
    const necessidade = planB01({
      id: 3,
      produtoId: 24,
      origemNome: "Livre",
      frequencia: "conforme_necessidade",
    });
    const forns = [
      fornB01({ id: 20, planejamentoId: 1, data: "2026-10-01" }),
      fornB01({ id: 21, planejamentoId: 2, produtoId: 23, origemNomeSnapshot: "Outro", data: "2026-10-01" }),
      fornB01({ id: 22, planejamentoId: 3, produtoId: 24, origemNomeSnapshot: "Livre", data: "2026-10-01" }),
    ];
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [semana, intervalo, necessidade],
      fornecimentos: forns,
    });
    const rowSemana = out.planejado.find(l => l.produtoId === 22)!;
    const rowIntervalo = out.planejado.find(l => l.produtoId === 23)!;
    const rowNecessidade = out.planejado.find(l => l.produtoId === 24)!;
    expect(rowSemana.planejadoAteReferenciaKg).toBe(0);
    expect(rowSemana.planejadoPeriodoKg).toBe(2.4);
    expect(rowIntervalo.planejadoAteReferenciaKg).toBe(0.6);
    expect(rowIntervalo.planejadoPeriodoKg).toBe(9.6);
    expect(rowNecessidade.planejadoAteReferenciaKg).toBeNull();
    expect(rowNecessidade.planejadoPeriodoKg).toBeNull();
    expect(rowNecessidade.desvioAteReferenciaKg).toBeNull();
    expect(rowNecessidade.fornecidoKg).toBe(0.6);
  });

  it("2 tratos não dobram a consolidação", () => {
    const p1 = planB01({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-01", tratosPorDia: 2 });
    const p2 = planB01({ id: 2, dataInicio: "2026-10-02", dataFim: "2026-10-02", tratosPorDia: 2 });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-02" },
      hojeISO: "2026-10-02",
      planejamentos: [p1, p2],
      fornecimentos: [
        fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" }),
        fornB01({ id: 3, planejamentoId: 2, data: "2026-10-02" }),
      ],
    });
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBe(1.2);
    expect(out.planejado[0]!.planejadoPeriodoKg).toBe(1.2);
    expect(out.planejado[0]!.fornecidoKg).toBe(1.2);
  });

  it("encerrado só na vigência; cancelado não entra; ativo futuro só na projeção", () => {
    const encerrado = planB01({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-01" });
    const cancelado = planB01({ id: 3, status: "cancelado", dataInicio: "2026-10-03", dataFim: null, valorMeta: 200 });
    const futuro = planB01({ id: 2, status: "ativo", dataInicio: "2026-10-10", dataFim: null });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [encerrado, cancelado, futuro],
      fornecimentos: [fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" })],
    });
    expect(out.planejado).toHaveLength(1);
    expect(out.planejado[0]!.planejamentoIds).toEqual([1, 2]);
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBe(0.6);
    expect(out.planejado[0]!.planejadoPeriodoKg).toBe(13.8);
    expect(out.planejado[0]!.meta).toBe("100 g/cab/dia");
  });

  it("população instável não inventa planejado consolidado", () => {
    const p1 = planB01({ id: 1, dataInicio: "2026-10-01", dataFim: null });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [p1],
      fornecimentos: [
        fornB01({ id: 2, data: "2026-10-01", populacaoSnapshot: 6 }),
        fornB01({ id: 3, data: "2026-10-02", populacaoSnapshot: 8 }),
      ],
    });
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBeNull();
    expect(out.planejado[0]!.planejadoPeriodoKg).toBeNull();
    expect(out.planejado[0]!.desvioAteReferenciaKg).toBeNull();
    expect(out.planejado[0]!.motivo).toMatch(/População histórica/);
    expect(out.planejado[0]!.fornecidoKg).toBe(1.2);
  });

  it("ad libitum e %PV não viram 0 kg", () => {
    const adlib = planB01({ id: 1, modalidadeMeta: "ad_libitum", valorMeta: null });
    const pv = planB01({
      id: 2,
      produtoId: 23,
      origemNome: "Ração",
      modalidadeMeta: "pct_pv_dia",
      valorMeta: 2,
    });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [adlib, pv],
      fornecimentos: [
        fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" }),
        fornB01({ id: 3, planejamentoId: 2, produtoId: 23, origemNomeSnapshot: "Ração", data: "2026-10-02" }),
      ],
    });
    const rowAdlib = out.planejado.find(l => l.produtoId === 22)!;
    const rowPv = out.planejado.find(l => l.produtoId === 23)!;
    expect(rowAdlib.meta).toBe("Ad libitum");
    expect(rowAdlib.adLibitum).toBe(true);
    expect(rowAdlib.planejadoAteReferenciaKg).toBeNull();
    expect(rowAdlib.planejadoPeriodoKg).toBeNull();
    expect(rowAdlib.desvioAteReferenciaKg).toBeNull();
    expect(rowAdlib.fornecidoKg).toBe(0.6);
    expect(rowPv.meta).toBe("2% PV/dia");
    expect(rowPv.planejadoAteReferenciaKg).toBeNull();
    expect(rowPv.planejadoPeriodoKg).toBeNull();
    expect(rowPv.desvioAteReferenciaKg).toBeNull();
    expect(formatarIndicadorNumero(rowPv.planejadoAteReferenciaKg, { sufixo: "kg" })).toBe("—");
  });

  it("invariante: cada fornecimento confirmado aparece no máximo uma vez", () => {
    const p1 = planB01({ id: 1, status: "encerrado", dataInicio: "2026-10-01", dataFim: "2026-10-01" });
    const p2 = planB01({ id: 2, dataInicio: "2026-10-02", dataFim: null });
    const outro = planB01({ id: 3, produtoId: 23, origemNome: "Outro", dataInicio: "2026-10-01", dataFim: null });
    const forns = [
      fornB01({ id: 2, planejamentoId: 1, data: "2026-10-01" }),
      fornB01({ id: 3, planejamentoId: 2, data: "2026-10-02" }),
      fornB01({ id: 4, planejamentoId: 3, produtoId: 23, origemNomeSnapshot: "Outro", data: "2026-10-02", quantidadeFornecidaKg: 1 }),
    ];
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [p1, p2, outro],
      fornecimentos: forns,
    });
    expect(invarianteFornecidoSemDuplicar(out.planejado)).toBe(true);
    expect(out.planejado.reduce((s, l) => s + l.fornecidoKg, 0)).toBe(2.2);
    expect(out.planejado.flatMap(l => l.fornecimentoIds).sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it("planejado acumulado 0 não gera percentual infinito", () => {
    const semana = planB01({ frequencia: "dias_semana", frequenciaDiasSemana: [3] });
    const out = painel({
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
      hojeISO: "2026-10-02",
      planejamentos: [semana],
      fornecimentos: [fornB01({ id: 2, data: "2026-10-01" })],
    });
    expect(out.planejado[0]!.planejadoAteReferenciaKg).toBe(0);
    expect(out.planejado[0]!.desvioAteReferenciaKg).toBe(0.6);
    expect(out.planejado[0]!.desvioAteReferenciaPercentual).toBeNull();
    expect(Number.isFinite(out.planejado[0]!.desvioAteReferenciaPercentual ?? 0)).toBe(true);
  });

  it("mensagens da tabela distinguem acumulado e projeção", () => {
    expect(MSG_VG_PLANEJADO_ACUMULADO).toMatch(/dias já alcançados/);
    expect(MSG_VG_PLANEJADO_PERIODO).toMatch(/todo o período selecionado/);
  });
});
