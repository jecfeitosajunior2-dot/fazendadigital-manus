import { describe, expect, it } from "vitest";
import { buildReproReprodutorPayload } from "../shared/reproReprodutorPersist";
import {
  filterAnimalAutocompleteCandidates,
  matchesAnimalAutocompleteBusca,
  resolveAnimalIdFromSelecao,
  shouldClearAutocompleteSelection,
} from "../shared/animalAutocomplete";
import { labelAnimalBusca } from "../shared/animalBuscaDisplay";
import {
  filterMachosReprodutoresCandidatos,
  isMachoReprodutorCandidato,
} from "../shared/reproMachoSelect";

const femea58 = {
  id: 15,
  brinco: "58",
  nome: "Estrela",
  sexo: "femea" as const,
  status: "ativo" as const,
  categoria: "Vaca",
  idadeMeses: 48,
  fazendaId: 1,
};

const macho16 = {
  id: 7,
  brinco: "16",
  sexo: "macho" as const,
  status: "ativo" as const,
  categoria: "Boi",
  idadeMeses: 36,
  fazendaId: 1,
};

describe("matchesAnimalAutocompleteBusca", () => {
  it("A) encontra animal por brinco", () => {
    expect(matchesAnimalAutocompleteBusca(femea58, "58")).toBe(true);
  });

  it("B) encontra por nome", () => {
    expect(matchesAnimalAutocompleteBusca(femea58, "estrela")).toBe(true);
  });
});

describe("resolveAnimalIdFromSelecao", () => {
  it("C) seleção armazena ID interno", () => {
    expect(resolveAnimalIdFromSelecao(femea58)).toBe(15);
  });

  it("D) brinco diferente do ID não causa confusão", () => {
    expect(resolveAnimalIdFromSelecao(macho16)).toBe(7);
    expect(resolveAnimalIdFromSelecao(macho16)).not.toBe(16);
  });

  it("E) digitação sem seleção deixa ID vazio", () => {
    expect(resolveAnimalIdFromSelecao(null)).toBeUndefined();
  });
});

describe("shouldClearAutocompleteSelection", () => {
  it("F) alterar texto após seleção limpa seleção stale", () => {
    expect(shouldClearAutocompleteSelection("60", femea58, labelAnimalBusca)).toBe(true);
    expect(shouldClearAutocompleteSelection("58", femea58, labelAnimalBusca)).toBe(true);
    expect(shouldClearAutocompleteSelection("58 · Estrela", femea58, labelAnimalBusca)).toBe(false);
  });
});

describe("filterAnimalAutocompleteCandidates", () => {
  it("G) animal principal lista todos os candidatos ativos da busca", () => {
    const found = filterAnimalAutocompleteCandidates([femea58, macho16], { search: "58" });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(15);
  });
});

describe("reprodutor filters", () => {
  it("H) reprodutor filtra apenas machos elegíveis", () => {
    expect(isMachoReprodutorCandidato(macho16, { fazendaId: 1 })).toBe(true);
    expect(isMachoReprodutorCandidato(femea58, { fazendaId: 1 })).toBe(false);
  });

  it("I) fêmea não aparece como reprodutor", () => {
    const found = filterMachosReprodutoresCandidatos([femea58, macho16], {
      fazendaId: 1,
      search: "58",
    });
    expect(found).toHaveLength(0);
  });

  it("J) macho inativo não aparece", () => {
    expect(
      isMachoReprodutorCandidato(
        { ...macho16, status: "vendido" },
        { fazendaId: 1 },
      ),
    ).toBe(false);
  });

  it("K) macho jovem não aparece", () => {
    expect(
      isMachoReprodutorCandidato(
        { ...macho16, categoria: "Bezerro", idadeMeses: 6 },
        { fazendaId: 1 },
      ),
    ).toBe(false);
  });

  it("L) outra fazenda não aparece quando fazendaId explícito", () => {
    expect(
      isMachoReprodutorCandidato({ ...macho16, fazendaId: 2 }, { fazendaId: 1 }),
    ).toBe(false);
  });

  it("M) seleção do reprodutor envia machoId correto", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Cobertura",
        animalSexo: "femea",
        machoId: macho16.id,
        machoLabel: macho16.brinco,
        origem: "interno",
      }),
    ).toEqual({ machoId: 7, reprodutorSemen: "16" });
  });

  it("N) modo externo não envia machoId", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        origem: "externo",
        textoExterno: "GSC-7117",
      }),
    ).toEqual({ reprodutorSemen: "GSC-7117" });
  });
});
