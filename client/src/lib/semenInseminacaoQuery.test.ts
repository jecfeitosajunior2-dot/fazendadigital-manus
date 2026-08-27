import { describe, expect, it } from "vitest";
import { shouldLoadSemenPartidasParaInseminacao } from "./semenInseminacaoQuery";

describe("shouldLoadSemenPartidasParaInseminacao", () => {
  it("sempre retorna boolean", () => {
    const result = shouldLoadSemenPartidasParaInseminacao({
      tipoReprodutivo: "Inseminação",
      fazendaId: 1,
      origemReprodutor: "interno",
      machoId: 7,
    });
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });

  it("machoId undefined → false", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: undefined,
      }),
    ).toBe(false);
  });

  it("machoId null → false", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: null,
      }),
    ).toBe(false);
  });

  it("machoId 0 → false", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: 0,
      }),
    ).toBe(false);
  });

  it("machoId 7 → true quando demais condições válidas", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: 7,
      }),
    ).toBe(true);
  });

  it("tipo diferente de Inseminação → false mesmo com macho válido", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Cobertura",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: 7,
      }),
    ).toBe(false);
  });

  it("origem interna habilitada; externa desabilitada", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: 7,
      }),
    ).toBe(true);

    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "interno",
        machoId: undefined,
      }),
    ).toBe(false);
  });

  it("origem externa habilitada somente com reprodutorKey", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "externo",
        reprodutorKeyExterno: "e:gsc-7117",
      }),
    ).toBe(true);

    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "externo",
        reprodutorKeyExterno: "   ",
      }),
    ).toBe(false);

    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 1,
        origemReprodutor: "externo",
        machoId: 7,
      }),
    ).toBe(false);
  });

  it("fazenda inválida → false", () => {
    expect(
      shouldLoadSemenPartidasParaInseminacao({
        tipoReprodutivo: "Inseminação",
        fazendaId: 0,
        origemReprodutor: "interno",
        machoId: 7,
      }),
    ).toBe(false);
  });
});
