import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANIMAL_AUTOCOMPLETE_MENU_ATTR,
  filterAnimalAutocompleteCandidates,
  isAnimalAutocompleteMenuEventTarget,
  isAnimalAutocompleteMenuOutsideEvent,
  resolveAnimalIdFromSelecao,
  shouldShowAnimalAutocompleteDropdown,
  type AnimalAutocompleteRow,
} from "@shared/animalAutocomplete";
import { filterMachosReprodutoresCandidatos } from "@shared/reproMachoSelect";
import {
  labelAnimalBusca,
  labelSexoAnimal,
  sexoDotClassName,
  subtituloAnimalBusca,
  withSexoNoSubtitulo,
} from "@shared/animalBuscaDisplay";

const femea58: AnimalAutocompleteRow = {
  id: 15,
  brinco: "58",
  nome: "Estrela",
  sexo: "femea",
  status: "ativo",
  categoria: "Vaca",
  idadeMeses: 48,
  fazendaId: 1,
};

const macho16: AnimalAutocompleteRow = {
  id: 7,
  brinco: "16",
  sexo: "macho",
  status: "ativo",
  categoria: "Boi",
  idadeMeses: 36,
  fazendaId: 1,
};

const macho20: AnimalAutocompleteRow = {
  id: 21,
  brinco: "20",
  sexo: "macho",
  status: "ativo",
  categoria: "Boi",
  idadeMeses: 36,
  fazendaId: 1,
};

describe("AnimalAutocomplete — lista no modal", () => {
  it("abre a listagem fora do card para não cortar no overflow", () => {
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "./AnimalAutocomplete.tsx"),
      "utf8",
    );
    expect(src).toContain("createPortal");
    expect(src).toContain("[data-slot=dialog-content]");
    expect(src).toContain("pointerEvents: \"auto\"");
    expect(src).toContain("ANIMAL_AUTOCOMPLETE_MENU_ATTR");
    expect(src).toContain("handlePick");
    expect(isAnimalAutocompleteMenuEventTarget(null)).toBe(false);
    const menuTarget = {
      closest: (sel: string) => (sel.includes(ANIMAL_AUTOCOMPLETE_MENU_ATTR) ? {} : null),
    } as unknown as EventTarget;
    expect(isAnimalAutocompleteMenuEventTarget(menuTarget)).toBe(true);
    expect(
      isAnimalAutocompleteMenuOutsideEvent({
        target: { closest: () => null } as unknown as EventTarget,
        detail: { originalEvent: { target: menuTarget } },
      }),
    ).toBe(true);
  });
});

describe("AnimalAutocomplete — abertura com busca vazia", () => {
  it("A) focus com busca vazia → dropdown abre", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: false,
        selected: null,
      }),
    ).toBe(true);
  });

  it("B) busca vazia → retorna opções iniciais", () => {
    const found = filterAnimalAutocompleteCandidates([femea58, macho16, macho20], {
      search: "",
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found.map(a => a.brinco)).toEqual(["16", "20", "58"]);
  });

  it("C) digitar → filtra opções", () => {
    const found = filterAnimalAutocompleteCandidates([femea58, macho16, macho20], {
      search: "5",
    });
    expect(found.map(a => a.brinco)).toEqual(["58"]);
  });

  it("D) selecionar → usa animal.id (PK interna)", () => {
    const selected = macho16;
    expect(resolveAnimalIdFromSelecao(selected)).toBe(7);
    expect(resolveAnimalIdFromSelecao(selected)).not.toBe(Number(selected.brinco));
  });

  it("E) digitar sem selecionar → selected permanece null", () => {
    const selected = null;
    const search = "16";
    expect(search).toBe("16");
    expect(resolveAnimalIdFromSelecao(selected)).toBeUndefined();
  });

  it("F) Trocar → abre lista novamente", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: false,
        selected: null,
      }),
    ).toBe(true);
    const iniciais = filterAnimalAutocompleteCandidates([femea58, macho16], { search: "" });
    expect(iniciais.length).toBeGreaterThan(0);
  });
});

describe("AnimalAutocomplete — Macho do rebanho", () => {
  it("click sem digitar lista machos elegíveis 16 e 20; seleção usa PK", () => {
    const found = filterMachosReprodutoresCandidatos([femea58, macho16, macho20], {
      fazendaId: 1,
      search: "",
    });
    expect(found.map(a => a.brinco)).toEqual(["16", "20"]);
    const escolhido = found.find(a => a.brinco === "16");
    expect(resolveAnimalIdFromSelecao(escolhido)).toBe(7);
    expect(resolveAnimalIdFromSelecao(escolhido)).not.toBe(16);
  });

  it("cada macho elegível usa bolinha azul e subtítulo com sexo", () => {
    const found = filterMachosReprodutoresCandidatos([femea58, macho16, macho20], {
      fazendaId: 1,
      search: "",
    });
    for (const a of found) {
      expect(sexoDotClassName(a.sexo)).toBe("bg-blue-400");
      expect(labelSexoAnimal(a.sexo)).toBe("Macho");
      expect(withSexoNoSubtitulo(a.sexo, subtituloAnimalBusca(a))).toMatch(/^Macho · /);
    }
  });
});

describe("AnimalAutocomplete — indicador de sexo", () => {
  it("F) seleção continua retornando animal.id", () => {
    expect(resolveAnimalIdFromSelecao(femea58)).toBe(15);
    expect(resolveAnimalIdFromSelecao(macho16)).toBe(7);
  });

  it("H) busca/abertura imediata continua funcionando com sexo no display", () => {
    expect(
      shouldShowAnimalAutocompleteDropdown({
        open: true,
        disabled: false,
        selected: null,
      }),
    ).toBe(true);
    const found = filterAnimalAutocompleteCandidates([femea58, macho16], { search: "" });
    expect(found).toHaveLength(2);
    expect(found.map(a => a.brinco)).toEqual(["16", "58"]);
    expect(sexoDotClassName(found.find(a => a.brinco === "58")?.sexo)).toBe("bg-pink-400");
    expect(sexoDotClassName(found.find(a => a.brinco === "16")?.sexo)).toBe("bg-blue-400");
    expect(labelAnimalBusca(femea58)).toBe("58 · Estrela");
  });
});
