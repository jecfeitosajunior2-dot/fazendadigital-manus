import { describe, expect, it } from "vitest";
import {
  formatGenealogiaParentLabel,
  resolveGenealogiaDisplay,
  resolveGenealogiaParentDisplay,
} from "../shared/genealogiaDisplay";

describe("resolveGenealogiaParentDisplay", () => {
  it("maeId estruturado vence texto legado", () => {
    expect(
      resolveGenealogiaParentDisplay(
        15,
        "registro antigo errado",
        { id: 15, brinco: "58" },
      ),
    ).toBe("58");
  });

  it("paiId estruturado vence texto legado", () => {
    expect(
      resolveGenealogiaParentDisplay(
        7,
        "Touro antigo",
        { id: 7, brinco: "16" },
      ),
    ).toBe("16");
  });

  it("maeId null usa mae legado", () => {
    expect(resolveGenealogiaParentDisplay(null, "Vaca 123", undefined)).toBe(
      "Vaca 123",
    );
  });

  it("paiId null usa pai legado", () => {
    expect(resolveGenealogiaParentDisplay(undefined, "Touro X", undefined)).toBe(
      "Touro X",
    );
  });

  it("sem ambos retorna vazio", () => {
    expect(resolveGenealogiaParentDisplay(null, null, undefined)).toBe("");
    expect(resolveGenealogiaParentDisplay(null, "  ", undefined)).toBe("");
  });

  it("parente inativo continua resolvido pelo brinco atual", () => {
    expect(
      resolveGenealogiaParentDisplay(15, null, { id: 15, brinco: "58" }),
    ).toBe("58");
  });

  it("não mostra ID interno como identificação", () => {
    expect(resolveGenealogiaParentDisplay(15, null, undefined)).toBe("");
    expect(formatGenealogiaParentLabel({ id: 15, brinco: null, nome: null })).toBe(
      "",
    );
  });
});

describe("resolveGenealogiaDisplay", () => {
  it("resolve mãe e pai estruturados", () => {
    const map = new Map([
      [15, { id: 15, brinco: "58" }],
      [7, { id: 7, brinco: "16" }],
    ]);
    expect(
      resolveGenealogiaDisplay({ maeId: 15, paiId: 7, mae: "x", pai: "y" }, map),
    ).toEqual({ mae: "58", pai: "16" });
  });

  it("cria 301: mãe 58, pai vazio", () => {
    const map = new Map([[15, { id: 15, brinco: "58" }]]);
    expect(
      resolveGenealogiaDisplay({ maeId: 15, paiId: null, mae: null, pai: null }, map),
    ).toEqual({ mae: "58", pai: "" });
  });
});
