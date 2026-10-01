import { describe, expect, it } from "vitest";
import {
  calcularPesoReferenciaLote,
  calcularProjecaoPlanejamento,
  diaAnteriorCivil,
  formatarDataCivilBR,
  metaKgPorCabecaDia,
  MSG_PLAN_ORIGEM_AMBOS,
  MSG_PLAN_ORIGEM_NENHUM,
  MSG_PLAN_DATAS,
  mudouCampoMaterial,
  normalizarDataCivil,
  periodosSobrepostos,
  podeEditarMaterialmente,
  situacaoTemporal,
  validarPlanejamentoInput,
  type NutricaoPlanInput,
} from "./nutricaoPlanejamento";

const lote = { id: 1, userId: 10, fazendaId: 1, ativo: true, nome: "B01" };
const produto = {
  produtoId: 10,
  nome: "Sal mineral",
  unidade: "kg",
  valorUnitario: "3.20",
  quantidade: "1000",
  controlarSaldo: true,
  vinculadoFazenda: true,
};
const dieta = {
  id: 5,
  userId: 10,
  fazendaId: 1,
  nome: "Mineral 90",
  status: "ativa",
  dataInicio: null,
  dataFim: null,
  baseQuantidade: 1000,
  ingredientes: [
    { produtoId: 10, quantidadeKg: 600 },
    { produtoId: 11, quantidadeKg: 400 },
  ],
};

function base(over: Partial<NutricaoPlanInput> = {}): NutricaoPlanInput {
  return {
    fazendaId: 1,
    loteId: 1,
    tipoOrigem: "produto",
    produtoId: 10,
    modalidadeMeta: "g_cab_dia",
    valorMeta: 100,
    frequencia: "diaria",
    dataInicio: "2026-10-01",
    ...over,
  };
}

describe("datas civis", () => {
  it("32: formata YYYY-MM-DD sem deslocamento UTC", () => {
    expect(formatarDataCivilBR("2026-06-03")).toBe("03/06/2026");
    expect(formatarDataCivilBR("2026-10-01")).toBe("01/10/2026");
    expect(normalizarDataCivil("2026-06-03")).toBe("2026-06-03");
    expect(diaAnteriorCivil("2026-10-01")).toBe("2026-09-30");
  });
});

describe("validação de origem", () => {
  it("3: produto e dieta simultâneos são bloqueados", () => {
    const out = validarPlanejamentoInput(
      base({ tipoOrigem: "produto", produtoId: 10, dietaId: 5 }),
      { lote, produto, dieta },
    );
    expect(out).toMatchObject({ ok: false, message: MSG_PLAN_ORIGEM_AMBOS });
  });

  it("4: nenhum dos dois é bloqueado", () => {
    const out = validarPlanejamentoInput(
      base({ tipoOrigem: "produto", produtoId: null, dietaId: null }),
      { lote, produto: null, dieta: null },
    );
    expect(out).toMatchObject({ ok: false, message: MSG_PLAN_ORIGEM_NENHUM });
  });

  it("31: data final anterior à inicial", () => {
    const out = validarPlanejamentoInput(
      base({ dataInicio: "2026-10-10", dataFim: "2026-10-01" }),
      { lote, produto },
    );
    expect(out).toMatchObject({ ok: false, message: MSG_PLAN_DATAS });
  });
});

describe("metas e projeções", () => {
  it("9: g/cab/dia calcula 100 g × 100 cab = 10 kg/dia", () => {
    expect(metaKgPorCabecaDia({ modalidadeMeta: "g_cab_dia", valorMeta: 100 })).toBe(0.1);
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "g_cab_dia",
      valorMeta: 100,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.necessidadeKgDia).toBe(10);
    expect(proj.necessidadeKg30d).toBe(300);
  });

  it("10: kg/cab/dia calcula 2,5 × 100 = 250 kg/dia", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 2.5,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.metaKgPorCabecaDia).toBe(2.5);
    expect(proj.necessidadeKgDia).toBe(250);
  });

  it("11: %PV com peso válido", () => {
    const animalIds = Array.from({ length: 100 }, (_, i) => i + 1);
    const pesagens = animalIds.map(id => ({ animalId: id, peso: 300, data: "2026-09-28" }));
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "pct_pv_dia",
      valorMeta: 1,
      tipoOrigem: "produto",
      animalIds,
      pesagens,
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.peso.pesoMedioKg).toBe(300);
    expect(proj.metaKgPorCabecaDia).toBe(3);
    expect(proj.necessidadeKgDia).toBe(300);
  });

  it("12: %PV sem peso não inventa necessidade", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "pct_pv_dia",
      valorMeta: 1,
      tipoOrigem: "produto",
      animalIds: [1, 2],
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.peso.pesoMedioKg).toBeNull();
    expect(proj.necessidadeKgDia).toBeNull();
    expect(proj.mensagemNecessidade).toMatch(/indisponível/i);
  });

  it("13: cobertura parcial de peso é informada", () => {
    const peso = calcularPesoReferenciaLote({
      animalIds: [1, 2, 3, 4, 5],
      pesagens: [
        { animalId: 1, peso: 310, data: "2026-09-28" },
        { animalId: 2, peso: 314, data: "2026-09-28" },
        { animalId: 3, peso: 0, data: "2026-09-28" },
      ],
      hojeISO: "2026-10-01",
    });
    expect(peso.animaisComPeso).toBe(2);
    expect(peso.coberturaTexto).toBe("2/5 animais com peso válido");
    expect(peso.pesoMedioKg).toBe(312);
    expect(peso.dataReferencia).toBe("2026-09-28");
  });

  it("14: ad libitum não inventa kg/dia", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "ad_libitum",
      tipoOrigem: "produto",
      animalIds: [1, 2],
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.metaKgPorCabecaDia).toBeNull();
    expect(proj.necessidadeKgDia).toBeNull();
    expect(proj.mensagemNecessidade).toMatch(/à vontade/i);
  });

  it("15: 2 tratos/dia não dobra a meta diária", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 2,
      tratosPorDia: 2,
      tipoOrigem: "produto",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.metaKgPorCabecaDia).toBe(2);
    expect(proj.necessidadeKgDia).toBe(2);
    expect(proj.kgPorCabecaPorTrato).toBe(1);
  });

  it("16: população atual altera projeção sem mudar a meta", () => {
    const a = calcularProjecaoPlanejamento({
      modalidadeMeta: "g_cab_dia",
      valorMeta: 100,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    const b = calcularProjecaoPlanejamento({
      modalidadeMeta: "g_cab_dia",
      valorMeta: 100,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 120 }, (_, i) => i + 1),
      pesagens: [],
      hojeISO: "2026-10-02",
      produto,
    });
    expect(a.metaKgPorCabecaDia).toBe(0.1);
    expect(b.metaKgPorCabecaDia).toBe(0.1);
    expect(a.necessidadeKgDia).toBe(10);
    expect(b.necessidadeKgDia).toBe(12);
  });

  it("17: lote vazio tem necessidade 0, meta permanece", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "g_cab_dia",
      valorMeta: 100,
      tipoOrigem: "produto",
      animalIds: [],
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(proj.loteVazio).toBe(true);
    expect(proj.metaKgPorCabecaDia).toBe(0.1);
    expect(proj.necessidadeKgDia).toBe(0);
  });
});

describe("custo e autonomia", () => {
  it("18/19: custo do produto usa vigente e não inventa zero", () => {
    const ok = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 1,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      pesagens: [],
      hojeISO: "2026-10-01",
      produto,
    });
    expect(ok.custo.completo).toBe(true);
    expect(ok.custo.custoMedioPorKg).toBe(3.2);
    expect(ok.custo.custoDia).toBe(320);

    const sem = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 1,
      tipoOrigem: "produto",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      produto: { ...produto, valorUnitario: null },
    });
    expect(sem.custo.completo).toBe(false);
    expect(sem.custo.custoDia).toBeNull();
    expect(sem.custo.mensagem).toMatch(/não disponível/i);
  });

  it("20/21: custo da dieta usa estimativa atual e fica incompleto se faltar custo", () => {
    const produtosPorId = new Map([
      [10, { ...produto, produtoId: 10, valorUnitario: "1.20" }],
      [11, { ...produto, produtoId: 11, nome: "Farelo", valorUnitario: "2.10", quantidade: "400" }],
    ]);
    const ok = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 1,
      tipoOrigem: "dieta",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      dieta,
      produtosPorId,
    });
    expect(ok.custo.completo).toBe(true);
    expect(ok.custo.custoMedioPorKg).toBe(1.56);

    const incompleto = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 1,
      tipoOrigem: "dieta",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      dieta,
      produtosPorId: new Map([
        [10, { ...produto, produtoId: 10, valorUnitario: "1.20" }],
        [11, { ...produto, produtoId: 11, valorUnitario: null }],
      ]),
    });
    expect(incompleto.custo.completo).toBe(false);
    expect(incompleto.custo.custoDia).toBeNull();
    expect(incompleto.custo.mensagem).toMatch(/incompleto/i);
  });

  it("22: autonomia de produto", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 1,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      pesagens: [],
      hojeISO: "2026-10-01",
      produto: { ...produto, quantidade: "1000" },
    });
    expect(proj.autonomiaProduto?.calculavel).toBe(true);
    expect(proj.autonomiaProduto?.autonomiaDias).toBe(10);
  });

  it("autonomia de saco usa kg derivado (10 sc × 30 kg = 300 kg)", () => {
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 30,
      tipoOrigem: "produto",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      produto: {
        ...produto,
        unidade: "sc",
        quantidade: "10",
        valorUnitario: "90",
        embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }],
      },
    });
    expect(proj.autonomiaProduto?.calculavel).toBe(true);
    expect(proj.autonomiaProduto?.saldoKg).toBe(300);
    expect(proj.autonomiaProduto?.autonomiaDias).toBe(10);
    expect(proj.custo.custoMedioPorKg).toBe(3);
    expect(proj.custo.custoDia).toBe(90);
  });

  it("aceita planejamento de saco com embalagem única; bloqueia sem embalagem ou ambíguo", () => {
    const saco30 = { ...produto, unidade: "sc", embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }] };
    expect(validarPlanejamentoInput(base(), { lote, produto: saco30 })).toEqual({ ok: true });
    const semEmb = validarPlanejamentoInput(base(), { lote, produto: { ...produto, unidade: "sc" } });
    expect(semEmb.ok).toBe(false);
    const ambigua = validarPlanejamentoInput(base(), {
      lote,
      produto: {
        ...produto,
        unidade: "sc",
        embalagens: [
          { nome: "Saco 25 kg", volume: 25, unidade: "kg" },
          { nome: "Saco 30 kg", volume: 30, unidade: "kg" },
        ],
      },
    });
    expect(ambigua.ok).toBe(false);
  });

  it("23/24: autonomia de dieta usa limitante; sem dado não inventa", () => {
    const produtosPorId = new Map([
      [10, { ...produto, produtoId: 10, quantidade: "1200" }],
      [11, { ...produto, produtoId: 11, nome: "Núcleo", quantidade: "320" }],
    ]);
    const ok = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 10,
      tipoOrigem: "dieta",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      dieta,
      produtosPorId,
    });
    expect(ok.necessidadeKgDia).toBe(10);
    expect(ok.autonomiaDieta?.calculavel).toBe(true);
    expect(ok.autonomiaDieta?.limitanteProdutoId).toBe(11);
    expect(ok.autonomiaDieta?.autonomiaDias).toBe(80);

    const falta = calcularProjecaoPlanejamento({
      modalidadeMeta: "kg_cab_dia",
      valorMeta: 10,
      tipoOrigem: "dieta",
      animalIds: [1],
      pesagens: [],
      hojeISO: "2026-10-01",
      dieta,
      produtosPorId: new Map([[10, { ...produto, produtoId: 10, quantidade: "1200" }]]),
    });
    expect(falta.autonomiaDieta?.calculavel).toBe(false);
    expect(falta.autonomiaDieta?.autonomiaDias).toBeNull();
  });
});

describe("conflito e histórico", () => {
  it("periodos sobrepostos", () => {
    expect(periodosSobrepostos("2026-10-01", "2026-10-31", "2026-10-15", "2026-11-15")).toBe(true);
    expect(periodosSobrepostos("2026-10-01", "2026-10-31", "2026-11-01", null)).toBe(false);
    expect(periodosSobrepostos("2026-10-01", null, "2026-12-01", "2026-12-31")).toBe(true);
  });

  it("33/34: edição material só antes ou no dia de início", () => {
    expect(podeEditarMaterialmente("2026-10-10", "2026-10-01")).toBe(true);
    expect(podeEditarMaterialmente("2026-10-01", "2026-10-01")).toBe(true);
    expect(podeEditarMaterialmente("2026-09-01", "2026-10-01")).toBe(false);
    expect(mudouCampoMaterial(
      { loteId: 1, tipoOrigem: "produto", produtoId: 10, dietaId: null, modalidadeMeta: "g_cab_dia", valorMeta: 100, dataInicio: "2026-10-01" },
      base({ valorMeta: 120 }),
    )).toBe(true);
    expect(mudouCampoMaterial(
      { loteId: 1, tipoOrigem: "produto", produtoId: 10, dietaId: null, modalidadeMeta: "g_cab_dia", valorMeta: 100, dataInicio: "2026-10-01" },
      base({ observacoes: "ajuste de rotina", frequencia: "diaria" }),
    )).toBe(false);
  });

  it("situação temporal deriva das datas", () => {
    expect(situacaoTemporal({ status: "ativo", dataInicio: "2026-10-10", dataFim: null, hojeISO: "2026-10-01" })).toBe("programado");
    expect(situacaoTemporal({ status: "ativo", dataInicio: "2026-09-01", dataFim: null, hojeISO: "2026-10-01" })).toBe("vigente");
    expect(situacaoTemporal({ status: "ativo", dataInicio: "2026-08-01", dataFim: "2026-09-30", hojeISO: "2026-10-01" })).toBe("encerrado");
    expect(situacaoTemporal({ status: "cancelado", dataInicio: "2026-09-01", dataFim: null, hojeISO: "2026-10-01" })).toBe("cancelado");
  });
});
