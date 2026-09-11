import { describe, expect, it } from "vitest";
import {
  avisosDesmamaCompletos,
  CATEGORIAS_FALLBACK_DESMAMA,
  calcularAvisosDesmama,
  dataNascimentoPorIdadeMeses,
  parseIdadeMesesDesmama,
  resolverDataNascimentoDesmama,
  DESMAMA_IDADE_BLOQUEIO_MIN_MESES,
  DESMAMA_IDADE_IDEAL_MAX_MESES,
  DESMAMA_IDADE_IDEAL_MIN_MESES,
  DESMAMA_PESO_IDEAL_MIN_KG,
  deveExibirDataDesmamaNoFormularioAnimal,
  filtrarAnimaisElegiveisDesmama,
  idadeMesesNaData,
  isAnimalElegivelParaDesmama,
  MSG_DESMAMA_IDADE_ABSOLUTA,
  precisaConfirmarDesmama,
  textosAvisoDesmama,
  validarAnimalParaDesmama,
} from "../shared/desmamaManejo";

const DATA = "2026-08-29";

function base(partial: Parameters<typeof isAnimalElegivelParaDesmama>[0] = {}) {
  return {
    status: "ativo" as const,
    dataDesmama: null,
    dataEvento: DATA,
    ...partial,
  };
}

describe("idadeMesesNaData — meses civis na data do evento", () => {
  it("10/01/2026 → 10/07/2026 = 6 meses", () => {
    expect(idadeMesesNaData("2026-01-10", "2026-07-10")).toBe(6);
  });

  it("01/06/2026 → 29/08/2026 = 2 meses (abaixo do ideal)", () => {
    expect(idadeMesesNaData("2026-06-01", "2026-08-29")).toBe(2);
  });

  it("01/05/2025 → 01/01/2026 = 8 meses (retroativo)", () => {
    expect(idadeMesesNaData("2025-05-01", "2026-01-01")).toBe(8);
  });
});

describe("isAnimalElegivelParaDesmama", () => {
  it("constantes: bloqueio < 1 mês; ideal 6–8 meses", () => {
    expect(DESMAMA_IDADE_BLOQUEIO_MIN_MESES).toBe(1);
    expect(DESMAMA_IDADE_IDEAL_MIN_MESES).toBe(6);
    expect(DESMAMA_IDADE_IDEAL_MAX_MESES).toBe(8);
    expect(DESMAMA_PESO_IDEAL_MIN_KG).toBe(180);
  });

  it("A) 6 meses ativo sem desmama → elegível sem aviso", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-02-28" }));
    expect(r).toMatchObject({ eligible: true, idadeMeses: 6 });
    expect(r.avisos).toBeUndefined();
  });

  it("B) 7 meses → elegível sem aviso", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-01-29" }));
    expect(r.eligible).toBe(true);
    expect(r.idadeMeses).toBe(7);
    expect(r.avisos).toBeUndefined();
  });

  it("C) 2 meses → elegível com aviso IDADE_ABAIXO_IDEAL", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-06-29" }));
    expect(r).toMatchObject({ eligible: true, idadeMeses: 2 });
    expect(r.avisos).toEqual(["IDADE_ABAIXO_IDEAL"]);
    expect(precisaConfirmarDesmama(r)).toBe(true);
  });

  it("D) 13 meses → elegível com aviso IDADE_ACIMA_IDEAL", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-07-29" }));
    expect(r).toMatchObject({ eligible: true, idadeMeses: 13 });
    expect(r.avisos).toEqual(["IDADE_ACIMA_IDEAL"]);
  });

  it("E) vaca adulta 4 anos sem histórico → elegível com aviso (regularizar histórico)", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2022-08-29", categoria: "Vaca" }),
    );
    expect(r.eligible).toBe(true);
    expect(r.idadeMeses).toBe(48);
    expect(r.avisos).toEqual(["IDADE_ACIMA_IDEAL"]);
  });

  it("E2) boi 2 anos sem Data de Desmama → aparece na lista com aviso", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2024-08-29", categoria: "Boi" }),
    );
    expect(r.eligible).toBe(true);
    expect(r.avisos).toEqual(["IDADE_ACIMA_IDEAL"]);
    expect(
      filtrarAnimaisElegiveisDesmama(
        [{ id: 99, status: "ativo", dataDesmama: null, dataNascimento: "2024-08-29", categoria: "Boi" }],
        DATA,
      ).map(a => a.id),
    ).toEqual([99]);
  });

  it("E3) recém-nascido (< 1 mês) → bloqueio absoluto", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2026-08-20", dataEvento: "2026-08-29" }),
    );
    expect(r).toMatchObject({ eligible: false, reason: "IDADE_ABAIXO_ABSOLUTA", idadeMeses: 0 });
  });

  it("cadastro manual não mostra Data de Desmama; editar mostra somente leitura", () => {
    expect(deveExibirDataDesmamaNoFormularioAnimal("create")).toBe(false);
    expect(deveExibirDataDesmamaNoFormularioAnimal("edit")).toBe(true);
  });

  it("F) 7 meses já desmamado → JA_DESMAMADO", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2026-01-29", dataDesmama: "2026-06-01" }),
    );
    expect(r).toMatchObject({ eligible: false, reason: "JA_DESMAMADO" });
  });

  it("G) macho e fêmea de 7 meses → ambos elegíveis", () => {
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-01-29", categoria: "Bezerro" }))
        .eligible,
    ).toBe(true);
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-01-29", categoria: "Bezerra" }))
        .eligible,
    ).toBe(true);
  });

  it("H) outra fazenda → FAZENDA_INCOMPATIVEL", () => {
    const r = isAnimalElegivelParaDesmama(
      base({
        dataNascimento: "2026-01-29",
        fazendaAnimalId: 2,
        fazendaSelecionadaId: 1,
      }),
    );
    expect(r).toMatchObject({ eligible: false, reason: "FAZENDA_INCOMPATIVEL" });
  });

  it("I) alterar data para quando tinha 2 meses pede confirmação, não bloqueia", () => {
    const animal = { status: "ativo", dataDesmama: null, dataNascimento: "2026-01-10" };
    expect(
      isAnimalElegivelParaDesmama({ ...animal, dataEvento: "2026-07-10" }).eligible,
    ).toBe(true);
    const cedo = isAnimalElegivelParaDesmama({ ...animal, dataEvento: "2026-02-10" });
    expect(cedo.eligible).toBe(true);
    expect(cedo.avisos).toEqual(["IDADE_ABAIXO_IDEAL"]);
    expect(validarAnimalParaDesmama(animal, "2026-02-10").ok).toBe(true);
  });

  it("J) retroativo: na data histórica tinha 8 → elegível; hoje com aviso acima do ideal", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2025-05-01", dataEvento: "2026-01-01" }),
    );
    expect(r).toMatchObject({ eligible: true, idadeMeses: 8 });
    expect(r.avisos).toBeUndefined();
    const hoje = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2025-05-01", dataEvento: DATA }),
    );
    expect(hoje.eligible).toBe(true);
    expect(hoje.avisos).toEqual(["IDADE_ACIMA_IDEAL"]);
  });

  it("K) sem nascimento + Bezerro → fallback permite", () => {
    const r = isAnimalElegivelParaDesmama(base({ categoria: "Bezerro" }));
    expect(r).toMatchObject({ eligible: true, idadeMeses: null });
    expect(CATEGORIAS_FALLBACK_DESMAMA).toEqual(["Bezerro", "Bezerra"]);
  });

  it("K2) sem nascimento + Bezerra → fallback permite", () => {
    expect(isAnimalElegivelParaDesmama(base({ categoria: "Bezerra" })).eligible).toBe(true);
  });

  it("L) sem nascimento + Vaca → não lista", () => {
    const r = isAnimalElegivelParaDesmama(base({ categoria: "Vaca" }));
    expect(r).toMatchObject({ eligible: false, reason: "SEM_DATA_CONFIAVEL" });
  });

  it.each(["Boi", "Touro", "Novilho", "Novilha", "", null] as const)(
    "fallback não inclui adulto/ambíguo sem nascimento: %s",
    categoria => {
      expect(isAnimalElegivelParaDesmama(base({ categoria })).eligible).toBe(false);
    },
  );

  it("idade prevalece sobre categoria (Novilho com 8 meses aparece)", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2025-12-29", categoria: "Novilho" }),
    );
    expect(r.eligible).toBe(true);
    expect(r.idadeMeses).toBe(8);
  });

  it("lote não entra na regra — 8 meses em lote Novilhos aparece", () => {
    const lista = filtrarAnimaisElegiveisDesmama(
      [
        {
          id: 1,
          status: "ativo",
          dataDesmama: null,
          dataNascimento: "2025-12-29",
          categoria: "Novilho",
          loteNome: "Novilhos",
        },
      ],
      DATA,
    );
    expect(lista.map(a => a.id)).toEqual([1]);
  });

  it("inativo não aparece mesmo na faixa etária", () => {
    expect(
      isAnimalElegivelParaDesmama(
        base({ status: "vendido", dataNascimento: "2026-01-29" }),
      ).reason,
    ).toBe("INATIVO");
  });

  it("evento legado de Desmama bloqueia mesmo na faixa", () => {
    expect(
      isAnimalElegivelParaDesmama(
        base({
          dataNascimento: "2026-01-29",
          registrosEvento: [{ tipo: "Desmama" }],
        }),
      ).reason,
    ).toBe("JA_DESMAMADO");
  });

  it("faixa ideal inclusiva: 6 e 8 meses sem aviso; 5 e 9 meses com aviso", () => {
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-02-28" })).avisos,
    ).toBeUndefined();
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-12-29" })).avisos,
    ).toBeUndefined();
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-03-29" })).avisos,
    ).toEqual(["IDADE_ABAIXO_IDEAL"]);
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-11-29" })).avisos,
    ).toEqual(["IDADE_ACIMA_IDEAL"]);
  });
});

describe("textosAvisoDesmama — banner e modal contextual", () => {
  it("12 meses e 210 kg — banner curto com peso bom", () => {
    const t = textosAvisoDesmama(["IDADE_ACIMA_IDEAL"], { idadeMeses: 12, pesoKg: "210" }, {
      animalLabel: "#26",
    });
    expect(t.banner).toBe("12 meses (ref. 6–8) · 210 kg — pode registrar");
    expect(t.confirmDescription).toContain("peso bom");
    expect(t.confirmDescription).toContain("#26");
    expect(t.confirmText).toBe("Registrar mesmo assim");
  });

  it("desmama precoce — tom de confirmação intencional", () => {
    const t = textosAvisoDesmama(["IDADE_ABAIXO_IDEAL"], { idadeMeses: 4 });
    expect(t.banner).toContain("precoce");
    expect(t.confirmDescription).toContain("precoce");
  });

  it("≥ 18 meses — sugere regularizar histórico", () => {
    const t = textosAvisoDesmama(["IDADE_ACIMA_IDEAL"], { idadeMeses: 24 });
    expect(t.banner).toContain("regularizar histórico");
    expect(t.confirmDescription).toContain("Regularizar histórico");
  });

  it("só peso baixo — mensagem de referência", () => {
    const t = textosAvisoDesmama(["PESO_ABAIXO_IDEAL"], { idadeMeses: 7, pesoKg: "150" });
    expect(t.banner).toContain("150 kg");
    expect(t.banner).toContain("abaixo da referência");
  });
});

describe("calcularAvisosDesmama — peso", () => {
  it("peso abaixo de 180 kg gera aviso quando informado", () => {
    expect(calcularAvisosDesmama({ idadeMeses: 7, pesoKg: "150" })).toEqual([
      "PESO_ABAIXO_IDEAL",
    ]);
    expect(calcularAvisosDesmama({ idadeMeses: 7, pesoKg: "" })).toEqual([]);
    expect(calcularAvisosDesmama({ idadeMeses: 7, pesoKg: "210" })).toEqual([]);
  });

  it("avisosDesmamaCompletos combina idade e peso", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-01-29" }));
    expect(avisosDesmamaCompletos(r, "150")).toEqual(["PESO_ABAIXO_IDEAL"]);
  });

  it("bloqueio absoluto retorna mensagem específica", () => {
    const bloqueio = validarAnimalParaDesmama(
      { status: "ativo", dataNascimento: "2026-08-20" },
      "2026-08-29",
    );
    expect(bloqueio.ok).toBe(false);
    if (!bloqueio.ok) expect(bloqueio.message).toBe(MSG_DESMAMA_IDADE_ABSOLUTA);
  });
});

describe("idade aproximada na desmama (curral)", () => {
  it("dataNascimentoPorIdadeMeses é consistente com idadeMesesNaData", () => {
    const nasc = dataNascimentoPorIdadeMeses(7, "2026-08-29");
    expect(nasc).toBe("2026-01-29");
    expect(idadeMesesNaData(nasc, "2026-08-29")).toBe(7);
  });

  it("parseIdadeMesesDesmama aceita inteiros válidos", () => {
    expect(parseIdadeMesesDesmama("7")).toEqual({ ok: true, meses: 7 });
    expect(parseIdadeMesesDesmama("7,5").ok).toBe(false);
    expect(parseIdadeMesesDesmama("").ok).toBe(false);
  });

  it("resolverDataNascimentoDesmama prioriza cadastro e calcula por idade", () => {
    expect(
      resolverDataNascimentoDesmama({
        dataNascimento: "2020-01-15",
        idadeMesesInformada: 7,
        dataEvento: "2026-08-29",
      }),
    ).toBe("2020-01-15");
    expect(
      resolverDataNascimentoDesmama({
        dataNascimento: null,
        idadeMesesInformada: 7,
        dataEvento: "2026-08-29",
      }),
    ).toBe("2026-01-29");
  });

  it("bezerra sem nascimento permanece elegível; com idade informada ganha avisos", () => {
    const semIdade = isAnimalElegivelParaDesmama(
      base({ dataNascimento: null, categoria: "Bezerra" }),
    );
    expect(semIdade.eligible).toBe(true);
    expect(semIdade.idadeMeses).toBeNull();

    const comIdade = isAnimalElegivelParaDesmama(
      base({
        dataNascimento: dataNascimentoPorIdadeMeses(5, DATA),
        categoria: "Bezerra",
      }),
    );
    expect(comIdade.eligible).toBe(true);
    expect(comIdade.avisos).toContain("IDADE_ABAIXO_IDEAL");
  });
});
