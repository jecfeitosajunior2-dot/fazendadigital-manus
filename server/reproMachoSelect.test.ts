import { describe, expect, it } from "vitest";
import { buildReproReprodutorPayload } from "../shared/reproReprodutorPersist";
import {
  filterMachosReprodutoresCandidatos,
  isMachoReprodutorCandidato,
  matchesReproMachoBusca,
  resolveMachoIdFromSelecao,
} from "../shared/reproMachoSelect";

const machoElegivelFazenda1 = {
  id: 7,
  brinco: "16",
  sexo: "macho" as const,
  status: "ativo" as const,
  categoria: "Boi",
  idadeMeses: 36,
  fazendaId: 1,
};

const femea58 = {
  id: 15,
  brinco: "58",
  sexo: "femea" as const,
  status: "ativo" as const,
  categoria: "Vaca",
  idadeMeses: 48,
  fazendaId: 1,
};

const machoInativo = {
  id: 8,
  brinco: "28",
  sexo: "macho" as const,
  status: "vendido" as const,
  categoria: "Boi",
  idadeMeses: 36,
  fazendaId: 1,
};

const machoJovem = {
  id: 9,
  brinco: "99",
  sexo: "macho" as const,
  status: "ativo" as const,
  categoria: "Bezerro",
  idadeMeses: 6,
  fazendaId: 1,
};

const machoOutraFazenda = {
  id: 10,
  brinco: "16",
  sexo: "macho" as const,
  status: "ativo" as const,
  categoria: "Boi",
  idadeMeses: 36,
  fazendaId: 2,
};

describe("matchesReproMachoBusca", () => {
  it("A) busca encontra macho elegível por brinco", () => {
    expect(matchesReproMachoBusca(machoElegivelFazenda1, "16")).toBe(true);
    const found = filterMachosReprodutoresCandidatos(
      [machoElegivelFazenda1, femea58, machoInativo, machoJovem],
      { fazendaId: 1, search: "16" },
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.brinco).toBe("16");
  });
});

describe("isMachoReprodutorCandidato", () => {
  it("B) fêmea não aparece", () => {
    expect(isMachoReprodutorCandidato(femea58, { fazendaId: 1 })).toBe(false);
  });

  it("C) macho inativo não aparece", () => {
    expect(isMachoReprodutorCandidato(machoInativo, { fazendaId: 1 })).toBe(false);
  });

  it("D) macho jovem/ineligível não aparece", () => {
    expect(isMachoReprodutorCandidato(machoJovem, { fazendaId: 1 })).toBe(false);
  });

  it("E) macho de outra fazenda não aparece quando fazendaId explícito no animal", () => {
    expect(isMachoReprodutorCandidato(machoOutraFazenda, { fazendaId: 1 })).toBe(false);
  });
});

describe("filterMachosReprodutoresCandidatos", () => {
  it("F) seleção guarda ID interno correto (brinco 16 ≠ id 16)", () => {
    const found = filterMachosReprodutoresCandidatos([machoElegivelFazenda1], {
      fazendaId: 1,
      search: "16",
    });
    expect(found[0]?.id).toBe(7);
    expect(found[0]?.id).not.toBe(16);
  });

  it("G) texto digitado sem seleção não vira machoId", () => {
    expect(resolveMachoIdFromSelecao(null)).toBeUndefined();
    expect(
      buildReproReprodutorPayload({
        tipo: "Cobertura",
        animalSexo: "femea",
        origem: "interno",
      }),
    ).toEqual({});
  });

  it("H) troca interno → externo limpa machoId no payload", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        origem: "externo",
        textoExterno: "Sêmen XYZ",
      }),
    ).toEqual({ reprodutorSemen: "Sêmen XYZ" });
  });

  it("I) troca externo → interno sem macho não reaproveita texto", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        origem: "interno",
        textoExterno: "texto externo antigo",
      }),
    ).toEqual({});
  });

  it("J) zero resultados retorna lista vazia", () => {
    expect(
      filterMachosReprodutoresCandidatos([machoElegivelFazenda1], {
        fazendaId: 1,
        search: "inexistente",
      }),
    ).toEqual([]);
  });

  it("payload após seleção real usa machoId interno e brinco como label", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Cobertura",
        animalSexo: "femea",
        machoId: machoElegivelFazenda1.id,
        machoLabel: machoElegivelFazenda1.brinco,
        origem: "interno",
      }),
    ).toEqual({ machoId: 7, reprodutorSemen: "16" });
  });
});
