import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_FALLBACK_DESMAMA,
  DESMAMA_IDADE_MAX_MESES,
  DESMAMA_IDADE_MIN_MESES,
  deveExibirDataDesmamaNoFormularioAnimal,
  filtrarAnimaisElegiveisDesmama,
  idadeMesesNaData,
  isAnimalElegivelParaDesmama,
  MSG_DESMAMA_IDADE,
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

  it("01/06/2026 → 29/08/2026 = 2 meses (abaixo do mínimo)", () => {
    expect(idadeMesesNaData("2026-06-01", "2026-08-29")).toBe(2);
  });

  it("01/05/2025 → 01/01/2026 = 8 meses (retroativo)", () => {
    expect(idadeMesesNaData("2025-05-01", "2026-01-01")).toBe(8);
  });
});

describe("isAnimalElegivelParaDesmama", () => {
  it("constantes da faixa: 3 a 12 meses", () => {
    expect(DESMAMA_IDADE_MIN_MESES).toBe(3);
    expect(DESMAMA_IDADE_MAX_MESES).toBe(12);
  });

  it("A) 6 meses ativo sem desmama → elegível", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-02-28" }));
    expect(r).toMatchObject({ eligible: true, idadeMeses: 6 });
  });

  it("B) 11 meses → elegível", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-09-29" }));
    expect(r.eligible).toBe(true);
    expect(r.idadeMeses).toBe(11);
  });

  it("C) 2 meses → IDADE_ABAIXO_MINIMA", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-06-29" }));
    expect(r).toMatchObject({ eligible: false, reason: "IDADE_ABAIXO_MINIMA", idadeMeses: 2 });
  });

  it("D) 13 meses → IDADE_ACIMA_MAXIMA", () => {
    const r = isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-07-29" }));
    expect(r).toMatchObject({ eligible: false, reason: "IDADE_ACIMA_MAXIMA", idadeMeses: 13 });
  });

  it("E) vaca adulta 4 anos sem histórico de desmama → não elegível", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2022-08-29", categoria: "Vaca" }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("IDADE_ACIMA_MAXIMA");
    expect(r.idadeMeses).toBe(48);
  });

  it("E2) boi 2 anos sem Data de Desmama → não elegível", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2024-08-29", categoria: "Boi" }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("IDADE_ACIMA_MAXIMA");
    expect(r.idadeMeses).toBe(24);
    expect(
      filtrarAnimaisElegiveisDesmama(
        [{ id: 99, status: "ativo", dataDesmama: null, dataNascimento: "2024-08-29", categoria: "Boi" }],
        DATA,
      ),
    ).toEqual([]);
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

  it("I) alterar data para quando tinha 2 meses invalida", () => {
    const animal = { status: "ativo", dataDesmama: null, dataNascimento: "2026-01-10" };
    expect(
      isAnimalElegivelParaDesmama({ ...animal, dataEvento: "2026-07-10" }).eligible,
    ).toBe(true);
    const cedo = isAnimalElegivelParaDesmama({ ...animal, dataEvento: "2026-02-10" });
    expect(cedo).toMatchObject({ eligible: false, reason: "IDADE_ABAIXO_MINIMA" });
    const msg = validarAnimalParaDesmama(animal, "2026-02-10");
    expect(msg.ok).toBe(false);
    if (!msg.ok) expect(msg.message).toBe(MSG_DESMAMA_IDADE);
  });

  it("J) retroativo: hoje > 12 meses, na data histórica tinha 8 → elegível", () => {
    const r = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2025-05-01", dataEvento: "2026-01-01" }),
    );
    expect(r).toMatchObject({ eligible: true, idadeMeses: 8 });
    const hoje = isAnimalElegivelParaDesmama(
      base({ dataNascimento: "2025-05-01", dataEvento: DATA }),
    );
    expect(hoje.eligible).toBe(false);
    expect(hoje.reason).toBe("IDADE_ACIMA_MAXIMA");
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
    "fallback não inclui adulto/ambíguo: %s",
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

  it("limites inclusivos: 3 meses e 12 meses são elegíveis", () => {
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-05-29" })).idadeMeses,
    ).toBe(3);
    expect(isAnimalElegivelParaDesmama(base({ dataNascimento: "2026-05-29" })).eligible).toBe(
      true,
    );
    expect(
      isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-08-29" })).idadeMeses,
    ).toBe(12);
    expect(isAnimalElegivelParaDesmama(base({ dataNascimento: "2025-08-29" })).eligible).toBe(
      true,
    );
  });
});
