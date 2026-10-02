import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  calcularConsumoAparente,
  compararMomentos,
  consumoFornCicloJaFechado,
  deveExibirMensagemPreviewLeitura,
  relacaoOperacional,
  formatarConsumoAparentePorCabeca,
  formatarConsumoLista,
  formatarDataHoraLeitura,
  rotuloConsumoAparenteBalanco,
  rotuloSobraInicialBalanco,
  leituraTemConteudo,
  CODIGO_CONS_FORN_CICLO_FECHADO,
  MSG_CONS_ANTES,
  MSG_CONS_AVULSA,
  MSG_CONS_CANCELADA,
  MSG_CONS_ORDEM,
  MSG_CONS_SEM_FORN,
  MSG_CONS_SO_ESCORE,
  MSG_CONS_SOBRA_INICIAL,
  MSG_CONS_TROCA_ALIMENTO,
  MSG_CONS_TROCA_LOTE,
  MSG_LEITURA_COCHO,
  MSG_LEITURA_COCHO_FAZENDA,
  MSG_LEITURA_COCHO_INATIVO,
  MSG_LEITURA_FORN_COCHO,
  MSG_LEITURA_FORN_ESTORNADO,
  MSG_LEITURA_FORN_LOTE,
  MSG_LEITURA_FORN_TEMPO,
  MSG_LEITURA_LOTE_FAZENDA,
  MSG_LEITURA_SOBRA,
  MSG_LEITURA_VAZIA,
  validarLeituraInput,
  type LeituraCicloRef,
  type NutricaoLeituraFornRef,
  type NutricaoLeituraInput,
} from "./nutricaoCochoLeituras";
import type { NutricaoCochoRef } from "./nutricaoCochos";
import type { NutricaoPlanLoteRef } from "./nutricaoPlanejamento";

const HOJE = "2026-10-01";
const cocho: NutricaoCochoRef = { id: 1, userId: 10, fazendaId: 1, nome: "C01", codigo: "C01", status: "ativo" };
const lote: NutricaoPlanLoteRef = { id: 1, userId: 10, fazendaId: 1, ativo: true, nome: "B01" };

function input(over: Partial<NutricaoLeituraInput> = {}): NutricaoLeituraInput {
  return {
    fazendaId: 1,
    cochoId: 1,
    loteId: 1,
    data: HOJE,
    hora: "17:00",
    sobraKg: 20,
    ...over,
  };
}

function forn(over: Partial<NutricaoLeituraFornRef> = {}): NutricaoLeituraFornRef {
  return {
    id: 1,
    userId: 10,
    fazendaId: 1,
    cochoId: 1,
    loteId: 1,
    tipoOrigem: "produto",
    produtoId: 10,
    dietaId: null,
    origemNomeSnapshot: "Milho",
    quantidadeFornecidaKg: 100,
    status: "confirmado",
    data: HOJE,
    hora: "08:00",
    populacaoSnapshot: 50,
    batidaId: null,
    planejamentoId: null,
    ...over,
  };
}

function leitura(over: Partial<LeituraCicloRef> = {}): LeituraCicloRef {
  return {
    id: 10,
    cochoId: 1,
    loteId: 1,
    fornecimentoId: 1,
    data: HOJE,
    hora: "17:00",
    sobraKg: 20,
    status: "ativa",
    ...over,
  };
}

function validar(over: Partial<NutricaoLeituraInput> = {}, ctx: Parameters<typeof validarLeituraInput>[1] = {
  cocho, lote, hojeISO: HOJE, novaLeitura: true,
}) {
  return validarLeituraInput(input(over), ctx);
}

describe("nutricaoCochoLeituras — validação", () => {
  it("1: cria leitura com sobra", () => {
    expect(validar({ sobraKg: 20 })).toEqual({ ok: true });
  });

  it("2: cria leitura com escore", () => {
    expect(validar({ sobraKg: null, escore: "baixo" })).toEqual({ ok: true });
  });

  it("3: cria leitura só com observação", () => {
    expect(validar({ sobraKg: null, observacoes: "Cocho úmido" })).toEqual({ ok: true });
  });

  it("4: leitura vazia é bloqueada", () => {
    expect(validar({ sobraKg: null, escore: "", observacoes: "  " })).toMatchObject({ message: MSG_LEITURA_VAZIA });
    expect(leituraTemConteudo({ sobraKg: null, escore: null, observacoes: null })).toBe(false);
  });

  it("5: sobra zero é permitida", () => {
    expect(validar({ sobraKg: 0 })).toEqual({ ok: true });
    expect(leituraTemConteudo({ sobraKg: 0 })).toBe(true);
  });

  it("6: sobra negativa é bloqueada", () => {
    expect(validar({ sobraKg: -1 })).toMatchObject({ message: MSG_LEITURA_SOBRA });
  });

  it("7: cocho é obrigatório", () => {
    expect(validarLeituraInput(input({ cochoId: 0 }), { hojeISO: HOJE, novaLeitura: true }))
      .toMatchObject({ message: MSG_LEITURA_COCHO });
  });

  it("8: cocho de outra fazenda é bloqueado", () => {
    expect(validar({}, {
      cocho: { ...cocho, fazendaId: 2 },
      lote,
      hojeISO: HOJE,
      novaLeitura: true,
    })).toMatchObject({ message: MSG_LEITURA_COCHO_FAZENDA });
  });

  it("10: lote é opcional", () => {
    expect(validar({ loteId: null })).toEqual({ ok: true });
  });

  it("11: lote de outra fazenda é bloqueado", () => {
    expect(validar({ loteId: 2 }, {
      cocho,
      lote: { ...lote, id: 2, fazendaId: 2 },
      hojeISO: HOJE,
      novaLeitura: true,
    })).toMatchObject({ message: MSG_LEITURA_LOTE_FAZENDA });
  });

  it("12: fornecimento é opcional", () => {
    expect(validar({ fornecimentoId: null })).toEqual({ ok: true });
  });

  it("13: fornecimento estornado é bloqueado como referência", () => {
    expect(validar({ fornecimentoId: 1 }, {
      cocho, lote, fornecimento: forn({ status: "estornado" }), hojeISO: HOJE, novaLeitura: true,
    })).toMatchObject({ message: MSG_LEITURA_FORN_ESTORNADO });
  });

  it("14: fornecimento de outro cocho é bloqueado", () => {
    expect(validar({ fornecimentoId: 1 }, {
      cocho, lote, fornecimento: forn({ cochoId: 99 }), hojeISO: HOJE, novaLeitura: true,
    })).toMatchObject({ message: MSG_LEITURA_FORN_COCHO });
  });

  it("15: lote incompatível com o fornecimento é bloqueado", () => {
    expect(validar({ fornecimentoId: 1, loteId: 3 }, {
      cocho,
      lote: { ...lote, id: 3, nome: "B02" },
      fornecimento: forn({ loteId: 1 }),
      hojeISO: HOJE,
      novaLeitura: true,
    })).toMatchObject({ message: MSG_LEITURA_FORN_LOTE });
  });

  it("16: leitura anterior ao fornecimento vinculado é bloqueada", () => {
    expect(validar({ fornecimentoId: 1, hora: "07:00" }, {
      cocho, lote, fornecimento: forn({ hora: "08:00" }), hojeISO: HOJE, novaLeitura: true,
    })).toMatchObject({ message: MSG_LEITURA_FORN_TEMPO });
  });

  it("cocho inativo bloqueia nova leitura, mas não a correção histórica", () => {
    const inativo = { ...cocho, status: "inativo" };
    expect(validar({}, { cocho: inativo, lote, hojeISO: HOJE, novaLeitura: true }))
      .toMatchObject({ message: MSG_LEITURA_COCHO_INATIVO });
    expect(validar({}, { cocho: inativo, lote, hojeISO: HOJE, novaLeitura: false })).toEqual({ ok: true });
  });
});

describe("nutricaoCochoLeituras — data/hora civil", () => {
  it("38: data civil sem UTC", () => {
    expect(formatarDataHoraLeitura("2026-06-03", null)).toBe("03/06/2026");
    expect(formatarDataHoraLeitura("2026-06-03", "06:30")).toBe("03/06/2026 06:30");
  });

  it("39: hora ausente não inventa precisão", () => {
    expect(formatarDataHoraLeitura("2026-10-01", null)).not.toMatch(/00:00/);
    expect(compararMomentos({ data: "2026-10-01" }, { data: "2026-10-01" })).toBe("igual");
  });

  it("40: mesma data com só uma hora é ambígua", () => {
    expect(compararMomentos({ data: HOJE, hora: "17:00" }, { data: HOJE })).toBe("ambiguo");
  });
});

describe("nutricaoCochoLeituras — consumo aparente derivado", () => {
  it("17: leitura avulsa não inventa consumo", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ fornecimentoId: null }),
      leiturasCocho: [],
      fornecimentosCocho: [],
    });
    expect(out.calculavel).toBe(false);
    expect(out.consumoAparenteKg).toBeNull();
    expect(out.motivo).toBe(MSG_CONS_AVULSA);
    expect(formatarConsumoLista(out)).toBe("—");
  });

  it("18: escore sem sobra não vira kg", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ sobraKg: null, fornecimentoId: 1 }),
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
      fornecimentoVinculado: forn(),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_SO_ESCORE);
    expect(out.consumoAparenteKg).toBeNull();
  });

  it("19: 100 fornecido − 20 sobra = 80 no caso simples válido", () => {
    const out = calcularConsumoAparente({
      leitura: leitura(),
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
      fornecimentoVinculado: forn(),
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(80);
    expect(out.fornecidoKg).toBe(100);
    expect(out.sobraInicialKg).toBeNull();
    expect(out.sobraFinalKg).toBe(20);
    expect(out.intervaloLabel).toBe("9 hora(s)");
    expect(out.formula).toContain("80");
    expect(out.formula).toMatch(/Estimativa do primeiro ciclo/);
    expect(out.formula).not.toMatch(/^0 kg/);
    expect(out.formula).not.toContain("0 kg (sem sobra inicial");
    expect(rotuloSobraInicialBalanco(out.sobraInicialKg)).toBe("não determinada (primeiro ciclo)");
    expect(rotuloConsumoAparenteBalanco(out.sobraInicialKg)).toBe("Consumo aparente estimado");
  });

  it("apresenta 0 kg quando a sobra inicial foi medida como zero", () => {
    const prev = leitura({ id: 9, hora: "07:00", sobraKg: 0, fornecimentoId: null });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 0.2, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [forn({ hora: "08:00", quantidadeFornecidaKg: 0.6 })],
    });
    expect(out.calculavel).toBe(true);
    expect(out.sobraInicialKg).toBe(0);
    expect(out.consumoAparenteKg).toBe(0.4);
    expect(rotuloSobraInicialBalanco(out.sobraInicialKg)).toBe("0 kg");
    expect(rotuloConsumoAparenteBalanco(out.sobraInicialKg)).toBe("Consumo aparente");
    expect(out.formula).toMatch(/^0 kg \+/);
  });

  it("20/21: sobra inicial 10 + fornecimentos 150 − sobra 20 = 140", () => {
    const prev = leitura({ id: 9, hora: "07:00", sobraKg: 10, fornecimentoId: null });
    const f1 = forn({ id: 1, hora: "08:00", quantidadeFornecidaKg: 100 });
    const f2 = forn({ id: 2, hora: "12:00", quantidadeFornecidaKg: 50 });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [f1, f2],
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(140);
    expect(out.sobraInicialKg).toBe(10);
    expect(out.fornecidoKg).toBe(150);
    expect(out.fornecimentoIds).toEqual([1, 2]);
  });

  it("22: fornecimento estornado não entra na soma", () => {
    const prev = leitura({ id: 9, hora: "07:00", sobraKg: 10 });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [
        forn({ id: 1, hora: "08:00", quantidadeFornecidaKg: 100 }),
        forn({ id: 2, hora: "12:00", quantidadeFornecidaKg: 50, status: "estornado" }),
      ],
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(90);
    expect(out.fornecimentoIds).toEqual([1]);
  });

  it("23: leitura cancelada não fecha ciclo", () => {
    const cancelada = leitura({ id: 9, hora: "10:00", sobraKg: 10, status: "cancelada" });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      leiturasCocho: [cancelada],
      fornecimentosCocho: [forn()],
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_AVULSA);
    expect(calcularConsumoAparente({
      leitura: cancelada,
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
    }).motivo).toBe(MSG_CONS_CANCELADA);
  });

  it("16b: leitura anterior ao vínculo não calcula", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ hora: "07:00", fornecimentoId: 1 }),
      leiturasCocho: [],
      fornecimentosCocho: [forn({ hora: "08:00" })],
      fornecimentoVinculado: forn({ hora: "08:00" }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_ANTES);
  });

  it("24: troca de lote no intervalo impede atribuição", () => {
    const prev = leitura({ id: 9, hora: "07:00", sobraKg: 10, loteId: 1 });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, loteId: 2, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [forn({ id: 1, hora: "08:00", loteId: 2 })],
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_TROCA_LOTE);
  });

  it("25: troca de alimento impede cálculo", () => {
    const prev = leitura({ id: 9, hora: "07:00", sobraKg: 10 });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [
        forn({ id: 1, hora: "08:00", produtoId: 10, origemNomeSnapshot: "Milho" }),
        forn({ id: 2, hora: "12:00", tipoOrigem: "dieta", dietaId: 5, produtoId: null, origemNomeSnapshot: "Dieta 90" }),
      ],
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_TROCA_ALIMENTO);
  });

  it("26: cochos diferentes não são misturados", () => {
    const out = calcularConsumoAparente({
      leitura: leitura(),
      leiturasCocho: [leitura({ id: 8, cochoId: 2, hora: "07:00", sobraKg: 10 })],
      fornecimentosCocho: [
        forn(),
        forn({ id: 9, cochoId: 2, quantidadeFornecidaKg: 999 }),
      ],
      fornecimentoVinculado: forn(),
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(80);
    expect(out.fornecimentoIds).toEqual([1]);
  });

  it("21b: sem fornecimento no intervalo do ciclo → indisponível", () => {
    const prev = leitura({ id: 9, hora: "16:00", sobraKg: 10 });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [forn({ hora: "08:00" })],
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_SEM_FORN);
  });

  it("primeira leitura com evidência de estoque anterior não inventa saldo", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ fornecimentoId: 2 }),
      leiturasCocho: [],
      fornecimentosCocho: [
        forn({ id: 1, hora: "06:00", quantidadeFornecidaKg: 40 }),
        forn({ id: 2, hora: "08:00", quantidadeFornecidaKg: 100 }),
      ],
      fornecimentoVinculado: forn({ id: 2, hora: "08:00" }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_SOBRA_INICIAL);
  });

  it("40: mesma data sem ordem segura não calcula", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ hora: "17:00", fornecimentoId: 1 }),
      leiturasCocho: [],
      fornecimentosCocho: [forn({ hora: null })],
      fornecimentoVinculado: forn({ hora: null }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_ORDEM);
  });

  it("42: /cab só com denominador defensável do fornecimento", () => {
    const simples = calcularConsumoAparente({
      leitura: leitura(),
      leiturasCocho: [],
      fornecimentosCocho: [forn({ populacaoSnapshot: 50 })],
      fornecimentoVinculado: forn({ populacaoSnapshot: 50 }),
    });
    expect(simples.kgPorCabeca).toBe(1.6);

    const prev = leitura({ id: 9, hora: "07:00", sobraKg: 10 });
    const misturado = calcularConsumoAparente({
      leitura: leitura({ id: 10, hora: "17:00", sobraKg: 20, fornecimentoId: null }),
      leiturasCocho: [prev],
      fornecimentosCocho: [
        forn({ id: 1, hora: "08:00", quantidadeFornecidaKg: 100, populacaoSnapshot: 50 }),
        forn({ id: 2, hora: "12:00", quantidadeFornecidaKg: 50, populacaoSnapshot: 60 }),
      ],
    });
    expect(misturado.consumoAparenteKg).toBe(140);
    expect(misturado.kgPorCabeca).toBeNull();
    expect(misturado.kgPorCabecaDia).toBeNull();
  });

  it("43: /cab/dia exige intervalo e população válidos", () => {
    const comHora = calcularConsumoAparente({
      leitura: leitura(),
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
      fornecimentoVinculado: forn(),
    });
    expect(comHora.kgPorCabeca).toBe(1.6);
    expect(comHora.kgPorCabecaDia).not.toBeNull();

    const semHora = calcularConsumoAparente({
      leitura: leitura({ hora: null }),
      leiturasCocho: [],
      fornecimentosCocho: [forn({ hora: null })],
      fornecimentoVinculado: forn({ hora: null }),
    });
    expect(semHora.calculavel).toBe(true);
    expect(semHora.kgPorCabeca).toBe(1.6);
    expect(semHora.kgPorCabecaDia).toBeNull();
  });

  it("35: mudança na leitura recalcula o derivado", () => {
    const a = calcularConsumoAparente({
      leitura: leitura({ sobraKg: 20 }),
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
      fornecimentoVinculado: forn(),
    });
    const b = calcularConsumoAparente({
      leitura: leitura({ sobraKg: 10 }),
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
      fornecimentoVinculado: forn(),
    });
    expect(a.consumoAparenteKg).toBe(80);
    expect(b.consumoAparenteKg).toBe(90);
  });
});

describe("nutricaoCochoLeituras — encadeamento do segundo ciclo", () => {
  const DIA = "2026-10-02";
  const tLeitura1 = "2026-10-02T11:00:00.000Z";
  const tForn2 = "2026-10-02T12:00:00.000Z";
  const tLeitura2 = "2026-10-02T13:00:00.000Z";

  it("A: homologação — sobra anterior 0,2 + 0,6 − 0,3 = 0,5", () => {
    const prev = leitura({
      id: 11,
      data: DIA,
      hora: null,
      sobraKg: 0.2,
      fornecimentoId: 1,
      createdAt: tLeitura1,
    });
    const f1 = forn({
      id: 1,
      data: "2026-10-01",
      hora: null,
      quantidadeFornecidaKg: 0.6,
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    const f2 = forn({
      id: 2,
      data: DIA,
      hora: null,
      quantidadeFornecidaKg: 0.6,
      createdAt: tForn2,
    });
    const atual = leitura({
      id: 0,
      data: DIA,
      hora: null,
      sobraKg: 0.3,
      fornecimentoId: 2,
    });
    expect(compararMomentos(prev, atual)).toBe("igual");
    const out = calcularConsumoAparente({
      leitura: atual,
      leiturasCocho: [prev],
      fornecimentosCocho: [f1, f2],
      fornecimentoVinculado: f2,
    });
    expect(out.calculavel).toBe(true);
    expect(out.sobraInicialKg).toBe(0.2);
    expect(out.fornecidoKg).toBe(0.6);
    expect(out.sobraFinalKg).toBe(0.3);
    expect(out.consumoAparenteKg).toBe(0.5);
    expect(out.fornecimentoIds).toEqual([2]);
    expect(out.formula).not.toMatch(/00:00|23:59/);
  });

  it("B: primeiro ciclo sem saldo inicial conhecido permanece conservador", () => {
    const unico = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.2, fornecimentoId: 2 }),
      leiturasCocho: [],
      fornecimentosCocho: [forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 })],
      fornecimentoVinculado: forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
    });
    expect(unico.calculavel).toBe(true);
    expect(unico.sobraInicialKg).toBeNull();
    expect(unico.consumoAparenteKg).toBe(0.4);
    expect(rotuloSobraInicialBalanco(unico.sobraInicialKg)).toBe("não determinada (primeiro ciclo)");

    const comAnterior = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.2, fornecimentoId: 2 }),
      leiturasCocho: [],
      fornecimentosCocho: [
        forn({ id: 1, data: "2026-10-01", hora: null, quantidadeFornecidaKg: 0.6 }),
        forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
      ],
      fornecimentoVinculado: forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
    });
    expect(comAnterior.calculavel).toBe(false);
    expect(comAnterior.motivo).toBe(MSG_CONS_SOBRA_INICIAL);
    expect(comAnterior.consumoAparenteKg).toBeNull();
  });

  it("C: sobra anterior zero é valor conhecido, não ausência", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.1, fornecimentoId: 2 }),
      leiturasCocho: [leitura({
        id: 11, data: DIA, hora: null, sobraKg: 0, fornecimentoId: 1, createdAt: tLeitura1,
      })],
      fornecimentosCocho: [forn({
        id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2,
      })],
    });
    expect(out.calculavel).toBe(true);
    expect(out.sobraInicialKg).toBe(0);
    expect(out.consumoAparenteKg).toBe(0.5);
    expect(rotuloSobraInicialBalanco(out.sobraInicialKg)).toBe("0 kg");
  });

  it("D: soma múltiplos fornecimentos confirmados do ciclo", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.3 }),
      leiturasCocho: [leitura({
        id: 11, data: DIA, hora: null, sobraKg: 0.2, createdAt: tLeitura1, fornecimentoId: null,
      })],
      fornecimentosCocho: [
        forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
        forn({ id: 3, data: DIA, hora: null, quantidadeFornecidaKg: 0.4, createdAt: "2026-10-02T12:30:00.000Z" }),
      ],
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(0.9);
    expect(out.fornecidoKg).toBe(1);
  });

  it("E: fornecimento estornado fica de fora do ciclo", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.3 }),
      leiturasCocho: [leitura({
        id: 11, data: DIA, hora: null, sobraKg: 0.2, createdAt: tLeitura1, fornecimentoId: null,
      })],
      fornecimentosCocho: [
        forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
        forn({
          id: 3,
          data: DIA,
          hora: null,
          quantidadeFornecidaKg: 0.4,
          status: "estornado",
          createdAt: "2026-10-02T12:30:00.000Z",
        }),
      ],
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(0.5);
    expect(out.fornecimentoIds).toEqual([2]);
  });

  it("F: leitura anterior cancelada não estabelece saldo inicial", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.3, fornecimentoId: 2 }),
      leiturasCocho: [leitura({
        id: 11, data: DIA, hora: null, sobraKg: 0.2, status: "cancelada", createdAt: tLeitura1,
      })],
      fornecimentosCocho: [
        forn({ id: 1, data: "2026-10-01", hora: null, quantidadeFornecidaKg: 0.6 }),
        forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
      ],
      fornecimentoVinculado: forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_SOBRA_INICIAL);
    expect(out.sobraInicialKg).toBeNull();
  });

  it("G: leitura de outro cocho nunca vira saldo inicial", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.3, fornecimentoId: 2, cochoId: 1 }),
      leiturasCocho: [leitura({
        id: 11, cochoId: 9, data: DIA, hora: null, sobraKg: 0.2, createdAt: tLeitura1,
      })],
      fornecimentosCocho: [
        forn({ id: 1, data: "2026-10-01", hora: null, quantidadeFornecidaKg: 0.6 }),
        forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
      ],
      fornecimentoVinculado: forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_SOBRA_INICIAL);
  });

  it("H: alimento diferente não combina saldo automaticamente", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: null, sobraKg: 0.3, fornecimentoId: 2 }),
      leiturasCocho: [leitura({
        id: 11, data: DIA, hora: null, sobraKg: 0.2, fornecimentoId: 1, createdAt: tLeitura1,
      })],
      fornecimentosCocho: [
        forn({
          id: 1,
          data: "2026-10-01",
          hora: null,
          produtoId: 10,
          origemNomeSnapshot: "Sal Nitrogenado 40 Flex LA",
          quantidadeFornecidaKg: 0.6,
        }),
        forn({
          id: 2,
          data: DIA,
          hora: null,
          produtoId: 99,
          origemNomeSnapshot: "Sal mineral",
          quantidadeFornecidaKg: 0.6,
          createdAt: tForn2,
        }),
      ],
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_TROCA_ALIMENTO);
  });

  it("I: mesmo dia sem hora usa sequência persistida, sem inventar 00:00", () => {
    const prev = leitura({
      id: 11, data: DIA, hora: null, sobraKg: 0.2, createdAt: tLeitura1, fornecimentoId: null,
    });
    const fornCiclo = forn({
      id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2,
    });
    const atual = leitura({
      id: 12, data: DIA, hora: null, sobraKg: 0.3, createdAt: tLeitura2, fornecimentoId: 2,
    });

    expect(compararMomentos(prev, fornCiclo)).toBe("igual");
    expect(compararMomentos(fornCiclo, atual)).toBe("igual");
    expect(relacaoOperacional(
      { ...prev, tipo: "leitura" },
      { ...atual, tipo: "leitura" },
    )).toBe("antes");
    expect(relacaoOperacional(
      { data: fornCiclo.data, hora: fornCiclo.hora, id: fornCiclo.id, createdAt: fornCiclo.createdAt, tipo: "fornecimento" },
      { ...prev, tipo: "leitura" },
    )).toBe("depois");

    const out = calcularConsumoAparente({
      leitura: atual,
      leiturasCocho: [prev],
      fornecimentosCocho: [fornCiclo],
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(0.5);
    expect(out.formula).not.toMatch(/00:00|23:59/);
    expect(prev.hora).toBeNull();
    expect(fornCiclo.hora).toBeNull();
    expect(atual.hora).toBeNull();
  });

  it("mesma data com só uma hora continua ambígua", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA, hora: "17:00", sobraKg: 0.3, fornecimentoId: 2 }),
      leiturasCocho: [leitura({
        id: 11, data: DIA, hora: null, sobraKg: 0.2, createdAt: tLeitura1,
      })],
      fornecimentosCocho: [forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 })],
      fornecimentoVinculado: forn({ id: 2, data: DIA, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2 }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_ORDEM);
  });
});

describe("nutricaoCochoLeituras — fornecimento com ciclo já fechado", () => {
  const DIA1 = "2026-10-01";
  const DIA2 = "2026-10-02";
  const tForn2 = "2026-10-01T16:59:53.000Z";
  const tLeitura1 = "2026-10-02T09:16:59.000Z";
  const tForn3 = "2026-10-02T09:21:02.000Z";
  const tLeitura2 = "2026-10-02T09:39:40.000Z";
  const tForn4 = "2026-10-02T14:00:00.000Z";

  const f2 = () => forn({
    id: 2, data: DIA1, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn2, populacaoSnapshot: 6,
  });
  const f3 = () => forn({
    id: 3, data: DIA2, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn3, populacaoSnapshot: 6,
  });
  const l1 = () => leitura({
    id: 1, data: DIA2, hora: null, sobraKg: 0.2, fornecimentoId: 2, createdAt: tLeitura1,
  });
  const l2 = () => leitura({
    id: 2, data: DIA2, hora: null, sobraKg: 0.3, fornecimentoId: 3, createdAt: tLeitura2,
  });

  it("A: primeiro fornecimento + primeira leitura continua calculando", () => {
    const out = calcularConsumoAparente({
      leitura: l1(),
      leiturasCocho: [],
      fornecimentosCocho: [f2()],
      fornecimentoVinculado: f2(),
    });
    expect(out.calculavel).toBe(true);
    expect(out.consumoAparenteKg).toBe(0.4);
    expect(out.codigo).not.toBe(CODIGO_CONS_FORN_CICLO_FECHADO);
    expect(consumoFornCicloJaFechado(out)).toBe(false);
  });

  it("B: sobra anterior + novo fornecimento + nova leitura continua o ciclo", () => {
    const out = calcularConsumoAparente({
      leitura: l2(),
      leiturasCocho: [l1()],
      fornecimentosCocho: [f2(), f3()],
      fornecimentoVinculado: f3(),
    });
    expect(out.calculavel).toBe(true);
    expect(out.sobraInicialKg).toBe(0.2);
    expect(out.fornecidoKg).toBe(0.6);
    expect(out.consumoAparenteKg).toBe(0.5);
    expect(consumoFornCicloJaFechado(out)).toBe(false);
  });

  it("C/D/F: reabrir o fornecimento 3 já fechado não recalcula", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: null, sobraKg: 0.2, fornecimentoId: 3 }),
      leiturasCocho: [l1(), l2()],
      fornecimentosCocho: [f2(), f3()],
      fornecimentoVinculado: f3(),
    });
    expect(out.calculavel).toBe(false);
    expect(out.codigo).toBe(CODIGO_CONS_FORN_CICLO_FECHADO);
    expect(consumoFornCicloJaFechado(out)).toBe(true);
    expect(out.cicloFechado?.leituraId).toBe(2);
    expect(out.cicloFechado?.sobraKg).toBe(0.3);
    expect(out.cicloFechado?.consumoAparenteKg).toBe(0.5);
    expect(out.consumoAparenteKg).toBeNull();
    expect(out.fornecidoKg).toBeNull();
    expect(out.motivo).toContain("02/10/2026");
    expect(out.motivo).toContain("0,3 kg");
    expect(out.motivo).not.toBe(MSG_CONS_SEM_FORN);
    expect(out.fornecimentoIds).toEqual([]);
  });

  it("G: novo fornecimento depois da última leitura continua calculável", () => {
    const f4 = forn({
      id: 4, data: DIA2, hora: null, quantidadeFornecidaKg: 0.6, createdAt: tForn4, populacaoSnapshot: 6,
    });
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: null, sobraKg: 0.1, fornecimentoId: 4 }),
      leiturasCocho: [l1(), l2()],
      fornecimentosCocho: [f2(), f3(), f4],
      fornecimentoVinculado: f4,
    });
    expect(out.calculavel).toBe(true);
    expect(out.sobraInicialKg).toBe(0.3);
    expect(out.fornecidoKg).toBe(0.6);
    expect(out.consumoAparenteKg).toBe(0.8);
    expect(consumoFornCicloJaFechado(out)).toBe(false);
  });

  it("H: fornecimento estornado continua fora do cálculo", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: null, sobraKg: 0.1, fornecimentoId: 4 }),
      leiturasCocho: [l1(), l2()],
      fornecimentosCocho: [
        f2(),
        f3(),
        forn({
          id: 4, data: DIA2, hora: null, quantidadeFornecidaKg: 0.6,
          status: "estornado", createdAt: tForn4,
        }),
      ],
      fornecimentoVinculado: forn({
        id: 4, data: DIA2, hora: null, quantidadeFornecidaKg: 0.6,
        status: "estornado", createdAt: tForn4,
      }),
    });
    expect(out.calculavel).toBe(false);
    expect(out.motivo).toBe(MSG_CONS_SEM_FORN);
    expect(consumoFornCicloJaFechado(out)).toBe(false);
  });

  it("I: leitura cancelada não fecha o ciclo", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: null, sobraKg: 0.2, fornecimentoId: 3 }),
      leiturasCocho: [l1(), leitura({ ...l2(), status: "cancelada" })],
      fornecimentosCocho: [f2(), f3()],
      fornecimentoVinculado: f3(),
    });
    expect(out.calculavel).toBe(true);
    expect(out.sobraInicialKg).toBe(0.2);
    expect(out.consumoAparenteKg).toBe(0.6);
    expect(consumoFornCicloJaFechado(out)).toBe(false);
  });

  it("J: mesmo dia sem hora preserva a ordem por createdAt", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: null, sobraKg: 0.2, fornecimentoId: 3 }),
      leiturasCocho: [l1(), l2()],
      fornecimentosCocho: [f2(), f3()],
      fornecimentoVinculado: f3(),
    });
    expect(out.cicloFechado?.leituraId).toBe(2);
    expect(out.motivo).not.toMatch(/00:00|23:59/);
    expect(compararMomentos(l2(), { data: DIA2, hora: null })).toBe("igual");
  });

  it("1: leitura normal vazia continua pedindo sobra, escore ou observação", () => {
    expect(deveExibirMensagemPreviewLeitura(MSG_LEITURA_VAZIA, null)).toBe(true);
    expect(deveExibirMensagemPreviewLeitura(MSG_LEITURA_VAZIA, { codigo: null })).toBe(true);
  });

  it("2-5: ciclo fechado esconde a obrigatoriedade e mantém o aviso específico", () => {
    expect(deveExibirMensagemPreviewLeitura(MSG_LEITURA_VAZIA, {
      codigo: CODIGO_CONS_FORN_CICLO_FECHADO,
    })).toBe(false);
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: null, sobraKg: 0.2, fornecimentoId: 3 }),
      leiturasCocho: [l1(), l2()],
      fornecimentosCocho: [f2(), f3()],
      fornecimentoVinculado: f3(),
    });
    expect(consumoFornCicloJaFechado(out)).toBe(true);
    expect(out.motivo).toContain("02/10/2026");
    expect(out.cicloFechado?.leituraId).toBe(2);
  });

  it("ausência real de fornecimento no período não vira ciclo fechado", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ id: 0, data: DIA2, hora: "17:00", sobraKg: 0.2, fornecimentoId: null }),
      leiturasCocho: [leitura({ id: 9, hora: "16:00", sobraKg: 0.3 })],
      fornecimentosCocho: [forn({ hora: "08:00" })],
    });
    expect(out.motivo).toBe(MSG_CONS_SEM_FORN);
    expect(consumoFornCicloJaFechado(out)).toBe(false);
  });
});

describe("formatarConsumoAparentePorCabeca — só apresentação", () => {
  it("A: 0,5 kg / 6 animais → 83 g", () => {
    expect(formatarConsumoAparentePorCabeca(0.5 / 6)).toBe("83 g");
  });

  it("B: 0,3 kg / 6 → 50 g", () => {
    expect(formatarConsumoAparentePorCabeca(0.3 / 6)).toBe("50 g");
  });

  it("C: 0,75 kg / 6 → 125 g", () => {
    expect(formatarConsumoAparentePorCabeca(0.75 / 6)).toBe("125 g");
  });

  it("D: 6 kg / 6 → 1 kg", () => {
    expect(formatarConsumoAparentePorCabeca(6 / 6)).toBe("1 kg");
  });

  it("E: 7,5 kg / 6 → 1,25 kg", () => {
    expect(formatarConsumoAparentePorCabeca(7.5 / 6)).toBe("1,25 kg");
  });

  it("F: população zero/indisponível → —", () => {
    expect(formatarConsumoAparentePorCabeca(null)).toBe("—");
    expect(formatarConsumoAparentePorCabeca(undefined)).toBe("—");
  });

  it("G: consumo aparente indisponível → —", () => {
    const out = calcularConsumoAparente({
      leitura: leitura({ fornecimentoId: null, sobraKg: 0.2 }),
      leiturasCocho: [],
      fornecimentosCocho: [],
    });
    expect(out.calculavel).toBe(false);
    expect(out.kgPorCabeca).toBeNull();
    expect(formatarConsumoAparentePorCabeca(out.kgPorCabeca)).toBe("—");
  });

  it("H: kg/cabeça/dia não muda e o texto por cabeça não leva /dia", () => {
    const comHora = calcularConsumoAparente({
      leitura: leitura(),
      leiturasCocho: [],
      fornecimentosCocho: [forn()],
      fornecimentoVinculado: forn(),
    });
    expect(comHora.kgPorCabeca).toBe(1.6);
    expect(comHora.kgPorCabecaDia).not.toBeNull();

    const semHora = calcularConsumoAparente({
      leitura: leitura({ hora: null }),
      leiturasCocho: [],
      fornecimentosCocho: [forn({ hora: null })],
      fornecimentoVinculado: forn({ hora: null }),
    });
    expect(semHora.kgPorCabeca).toBe(1.6);
    expect(semHora.kgPorCabecaDia).toBeNull();

    const texto = formatarConsumoAparentePorCabeca(0.5 / 6);
    expect(texto).toBe("83 g");
    expect(texto).not.toContain("/dia");
    expect(texto).not.toMatch(/83[,.]3/);
  });

  it("detalhe da leitura usa o helper e mantém kg/cabeça/dia separado", () => {
    const detalhe = readFileSync(
      new URL("../client/src/pages/NutricaoCochoLeituraDetalhePage.tsx", import.meta.url),
      "utf8",
    );
    expect(detalhe).toContain("formatarConsumoAparentePorCabeca");
    expect(detalhe).toContain("Consumo aparente/cabeça:");
    expect(detalhe).toContain("kg/cabeça/dia:");
    expect(detalhe).not.toContain("kg/cabeça: {");
  });
});
