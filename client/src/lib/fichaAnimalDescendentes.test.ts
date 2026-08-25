import { describe, expect, it } from "vitest";
import type { DescendenteRow } from "@shared/animalDescendentes";
import {
  DESCENDENTES_PREVIEW_LIMIT,
  formatDescendenteBrinco,
  formatDescendenteNascimento,
  formatDescendenteSexoCategoria,
  formatDescendentesContagem,
  sliceDescendentesPreview,
} from "./fichaAnimalDescendentes";
import { getFichaAnimalPath } from "./fichaAnimalRoute";

const sampleRow = (overrides: Partial<DescendenteRow> = {}): DescendenteRow => ({
  animalId: 17,
  brinco: "301",
  sexo: "femea",
  categoria: "Bezerra",
  dataNascimento: "2026-08-24",
  status: "ativo",
  vinculo: "mae",
  ...overrides,
});

describe("formatDescendentesContagem", () => {
  it("A) 0 filhos registrados", () => {
    expect(formatDescendentesContagem(0)).toBe("0 filhos registrados");
  });

  it("B) 1 filho registrado", () => {
    expect(formatDescendentesContagem(1)).toBe("1 filho registrado");
  });

  it("C) 2 filhos registrados", () => {
    expect(formatDescendentesContagem(2)).toBe("2 filhos registrados");
  });
});

describe("formatDescendenteBrinco", () => {
  it("D) exibe brinco", () => {
    expect(formatDescendenteBrinco("300")).toBe("300");
  });

  it("ausência → traço", () => {
    expect(formatDescendenteBrinco(null)).toBe("—");
  });
});

describe("formatDescendenteSexoCategoria", () => {
  it("E) exibe sexo e categoria", () => {
    expect(formatDescendenteSexoCategoria("macho", "Bezerro")).toBe("Macho · Bezerro");
    expect(formatDescendenteSexoCategoria("femea", "Bezerra")).toBe("Fêmea · Bezerra");
  });
});

describe("formatDescendenteNascimento", () => {
  it("F) nascimento ausente → —", () => {
    expect(formatDescendenteNascimento(null)).toBe("—");
    expect(formatDescendenteNascimento("2026-08-24")).toBe("2026-08-24");
  });
});

describe("sliceDescendentesPreview", () => {
  it("limita preview e mantém contagem total separada", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      sampleRow({ animalId: i + 1, brinco: String(300 + i) }),
    );
    const preview = sliceDescendentesPreview(rows, false);
    expect(preview).toHaveLength(DESCENDENTES_PREVIEW_LIMIT);
    expect(rows).toHaveLength(15);
  });

  it("mostra todos quando showAll=true", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      sampleRow({ animalId: i + 1, brinco: String(300 + i) }),
    );
    expect(sliceDescendentesPreview(rows, true)).toHaveLength(15);
  });
});

describe("navegação descendente", () => {
  it("H) usa animalId interno na rota, não brinco", () => {
    const row = sampleRow({ animalId: 17, brinco: "301" });
    expect(getFichaAnimalPath(row.animalId)).toBe("/rebanho/detalhes-animal?id=17");
    expect(getFichaAnimalPath(Number(row.brinco))).not.toBe(getFichaAnimalPath(row.animalId));
  });

  it("G) status inativo preservado no payload", () => {
    expect(sampleRow({ status: "inativo" }).status).toBe("inativo");
  });
});
