import { describe, expect, it } from "vitest";
import { buildReproReprodutorPayload } from "../shared/reproReprodutorPersist";
import {
  filterAnimalAutocompleteCandidates,
  matchesAnimalAutocompleteBusca,
  resolveAnimalIdFromSelecao,
  shouldClearAutocompleteSelection,
  shouldShowAnimalAutocompleteDropdown,
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

  it("busca vazia retorna opções iniciais (não lista vazia)", () => {
    const found = filterAnimalAutocompleteCandidates([femea58, macho16], { search: "" });
    expect(found).toHaveLength(2);
    expect(found.map(a => a.brinco)).toEqual(["16", "58"]);
  });

  it("digitação filtra as opções iniciais", () => {
    const found = filterAnimalAutocompleteCandidates([femea58, macho16], { search: "5" });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(15);
  });

  it("ordena como Rebanho → Animais: brinco crescente numérico", () => {
    const found = filterAnimalAutocompleteCandidates(
      [
        { id: 1, brinco: "301" },
        { id: 2, brinco: "04" },
        { id: 3, brinco: "58" },
        { id: 4, brinco: "300" },
        { id: 5, brinco: "16" },
      ],
      { search: "" },
    );
    expect(found.map(a => a.brinco)).toEqual(["04", "16", "58", "300", "301"]);
  });

  it("limite 40 pega os menores brincos, não os mais recentes", () => {
    const muitos = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      brinco: String(80 - i),
    }));
    const found = filterAnimalAutocompleteCandidates(muitos, { search: "", limit: 20 });
    expect(found).toHaveLength(20);
    expect(found[0]?.brinco).toBe("1");
    expect(found[19]?.brinco).toBe("20");
    expect(filterAnimalAutocompleteCandidates(muitos, { search: "" })).toHaveLength(40);
  });

  it("busca vazia continua aplicando filtro contextual (isCandidate)", () => {
    const found = filterAnimalAutocompleteCandidates([femea58, macho16], {
      search: "",
      isCandidate: a => a.sexo === "macho",
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(7);
  });

  it("troca de fazenda não reaproveita opções da fazenda anterior", () => {
    const machoFazendaB = { ...macho16, id: 99, brinco: "20", fazendaId: 2 };
    const found = filterAnimalAutocompleteCandidates([femea58, macho16, machoFazendaB], {
      search: "",
      isCandidate: a => a.fazendaId === 2,
    });
    expect(found.map(a => a.id)).toEqual([99]);
  });
});

describe("shouldShowAnimalAutocompleteDropdown", () => {
  it("A) foco com busca vazia abre o dropdown", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: false,
        selected: null,
      }),
    ).toBe(true);
  });

  it("campo sem foco permanece fechado", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: false,
        disabled: false,
        selected: null,
      }),
    ).toBe(false);
  });

  it("F) Trocar (seleção nula + open) reabre a lista", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: false,
        selected: null,
      }),
    ).toBe(true);
  });

  it("com animal selecionado o dropdown não fica aberto", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: false,
        selected: macho16,
      }),
    ).toBe(false);
  });

  it("campo desabilitado não abre lista", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: true,
        selected: null,
      }),
    ).toBe(false);
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

  it("Macho do rebanho: busca vazia lista machos elegíveis da fazenda", () => {
    const macho20 = {
      id: 21,
      brinco: "20",
      sexo: "macho" as const,
      status: "ativo" as const,
      categoria: "Boi",
      idadeMeses: 36,
      fazendaId: 1,
    };
    const found = filterMachosReprodutoresCandidatos([femea58, macho16, macho20], {
      fazendaId: 1,
      search: "",
    });
    expect(found.map(a => a.brinco)).toEqual(["16", "20"]);
    expect(found.find(a => a.brinco === "16")?.id).toBe(7);
    expect(found.find(a => a.brinco === "16")?.id).not.toBe(16);
  });

  it("Reprodutivo: busca vazia não ignora isCandidate de elegibilidade", () => {
    const bezerroInelegivel = {
      ...macho16,
      id: 9,
      brinco: "99",
      categoria: "Bezerro",
      idadeMeses: 6,
    };
    const found = filterMachosReprodutoresCandidatos([macho16, bezerroInelegivel, femea58], {
      fazendaId: 1,
      search: "",
    });
    expect(found.map(a => a.id)).toEqual([7]);
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
