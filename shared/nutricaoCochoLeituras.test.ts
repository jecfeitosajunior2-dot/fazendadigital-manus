import { describe, expect, it } from "vitest";
import {
  calcularConsumoAparente,
  compararMomentos,
  formatarConsumoLista,
  formatarDataHoraLeitura,
  leituraTemConteudo,
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
