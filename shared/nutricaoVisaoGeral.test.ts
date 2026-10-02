import { describe, expect, it } from "vitest";
import {
  animalDiaLote,
  agregarCustoFornecimentos,
  consumoAparenteDoPainel,
  custoPorKgFornecido,
  enumerarDiasCivis,
  fornsConfirmados,
  formatarIndicadorNumero,
  formatarMoedaIndicador,
  intersecaoPeriodo,
  montarPainelNutricao,
  MSG_VG_CONSUMO_APARENTE,
  MSG_VG_FORNECIDO_CAB_DIA,
  MSG_VG_NAO_REAL,
  MSG_VG_SEM_MOVIMENTO,
  rotuloCoberturaFornecidoCabDia,
  periodoRapido,
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
    const soma = painelOut.planejado.reduce((s, l) => s + (l.planejadoKg ?? 0), 0);
    expect(soma).toBe(100);
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
