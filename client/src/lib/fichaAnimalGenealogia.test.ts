import { describe, expect, it } from "vitest";
import {
  formatGenealogiaFichaCampo,
  resolveGenealogiaFichaExibicao,
} from "./fichaAnimalDisplay";
import { resolveGenealogiaDisplay } from "@shared/genealogiaDisplay";

describe("formatGenealogiaFichaCampo", () => {
  it("substitui ausência por traço", () => {
    expect(formatGenealogiaFichaCampo(null)).toBe("—");
    expect(formatGenealogiaFichaCampo(undefined)).toBe("—");
    expect(formatGenealogiaFichaCampo("")).toBe("—");
    expect(formatGenealogiaFichaCampo("   ")).toBe("—");
  });

  it("preserva brinco ou texto legado", () => {
    expect(formatGenealogiaFichaCampo("58")).toBe("58");
    expect(formatGenealogiaFichaCampo("Vaca 123")).toBe("Vaca 123");
  });
});

describe("resolveGenealogiaFichaExibicao", () => {
  it("A) mãe e pai estruturados → 58 / 16", () => {
    const map = new Map([
      [15, { id: 15, brinco: "58" }],
      [7, { id: 7, brinco: "16" }],
    ]);
    const display = resolveGenealogiaDisplay(
      { maeId: 15, paiId: 7, mae: "x", pai: "y" },
      map,
    );
    expect(resolveGenealogiaFichaExibicao(display)).toEqual({
      mae: "58",
      pai: "16",
    });
  });

  it("B) só mãe estruturada → 58 / —", () => {
    const map = new Map([[15, { id: 15, brinco: "58" }]]);
    const display = resolveGenealogiaDisplay(
      { maeId: 15, paiId: null, mae: null, pai: null },
      map,
    );
    expect(resolveGenealogiaFichaExibicao(display)).toEqual({
      mae: "58",
      pai: "—",
    });
  });

  it("C) sem estruturado, usa legado", () => {
    const display = resolveGenealogiaDisplay(
      { maeId: null, paiId: null, mae: "Vaca 123", pai: "Touro X" },
      new Map(),
    );
    expect(resolveGenealogiaFichaExibicao(display)).toEqual({
      mae: "Vaca 123",
      pai: "Touro X",
    });
  });

  it("D) estruturado vence legado no payload enriquecido", () => {
    const map = new Map([
      [15, { id: 15, brinco: "58" }],
      [7, { id: 7, brinco: "16" }],
    ]);
    const display = resolveGenealogiaDisplay(
      { maeId: 15, paiId: 7, mae: "registro antigo", pai: "Touro antigo" },
      map,
    );
    expect(resolveGenealogiaFichaExibicao(display)).toEqual({
      mae: "58",
      pai: "16",
    });
  });

  it("E) parente inativo continua aparecendo", () => {
    const map = new Map([[15, { id: 15, brinco: "58" }]]);
    const display = resolveGenealogiaDisplay({ maeId: 15, paiId: null }, map);
    expect(resolveGenealogiaFichaExibicao(display).mae).toBe("58");
  });

  it("F) nunca mostra PK interna como display", () => {
    const display = resolveGenealogiaDisplay(
      { maeId: 15, paiId: 7, mae: null, pai: null },
      new Map(),
    );
    const exibicao = resolveGenealogiaFichaExibicao(display);
    expect(exibicao.mae).toBe("—");
    expect(exibicao.pai).toBe("—");
    expect(exibicao.mae).not.toBe("15");
    expect(exibicao.pai).not.toBe("7");
  });

  it("G) ausência de genealogia não quebra a ficha", () => {
    expect(resolveGenealogiaFichaExibicao(null)).toEqual({ mae: "—", pai: "—" });
    expect(resolveGenealogiaFichaExibicao(undefined)).toEqual({ mae: "—", pai: "—" });
    expect(resolveGenealogiaFichaExibicao({ mae: "", pai: "" })).toEqual({
      mae: "—",
      pai: "—",
    });
  });
});
