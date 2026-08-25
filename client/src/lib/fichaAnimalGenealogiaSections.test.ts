import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDescendentesList } from "@shared/animalDescendentes";
import { resolveGenealogiaDisplay } from "@shared/genealogiaDisplay";
import { resolveGenealogiaFichaExibicao } from "./fichaAnimalDisplay";
import { formatDescendentesContagem } from "./fichaAnimalDescendentes";

const MATRIZ_58_ID = 15;
const TOURO_16_ID = 7;

const parentMap = new Map([
  [MATRIZ_58_ID, { id: MATRIZ_58_ID, brinco: "58" }],
  [TOURO_16_ID, { id: TOURO_16_ID, brinco: "16" }],
]);

const rebanhoFixture = [
  { id: MATRIZ_58_ID, brinco: "58", sexo: "femea", maeId: null, paiId: null },
  {
    id: TOURO_16_ID,
    brinco: "16",
    sexo: "macho",
    mae: "Maria",
    pai: "Pedro",
    maeId: null,
    paiId: null,
  },
  {
    id: 16,
    brinco: "300",
    sexo: "macho",
    categoria: "Bezerro",
    dataNascimento: "2026-08-24",
    status: "ativo",
    maeId: MATRIZ_58_ID,
    paiId: null,
  },
  {
    id: 17,
    brinco: "301",
    sexo: "femea",
    categoria: "Bezerra",
    dataNascimento: "2026-08-24",
    status: "ativo",
    maeId: MATRIZ_58_ID,
    paiId: null,
  },
];

describe("ficha expandida — seções Genealogia + Descendentes", () => {
  it("C) componente da árvore visual foi removido", () => {
    const treeComponent = resolve(
      import.meta.dirname,
      "../components/animais/AnimalGenealogyTree.tsx",
    );
    const treeHelper = resolve(import.meta.dirname, "./animalGenealogyTree.ts");
    expect(existsSync(treeComponent)).toBe(false);
    expect(existsSync(treeHelper)).toBe(false);
  });

  it("A) Genealogia é exibida a partir de genealogiaDisplay", () => {
    const display = resolveGenealogiaDisplay(
      { maeId: MATRIZ_58_ID, paiId: null },
      parentMap,
    );
    expect(resolveGenealogiaFichaExibicao(display).mae).toBe("58");
  });

  it("B) Descendentes são exibidos a partir de descendentes estruturados", () => {
    const filhos = buildDescendentesList(MATRIZ_58_ID, rebanhoFixture);
    expect(filhos.map(f => f.brinco)).toEqual(["300", "301"]);
  });

  it("D) cria 301 — mãe 58, pai vazio, 0 filhos", () => {
    const genealogia = resolveGenealogiaFichaExibicao(
      resolveGenealogiaDisplay(
        { maeId: MATRIZ_58_ID, paiId: null, mae: null, pai: null },
        parentMap,
      ),
    );
    const filhos = buildDescendentesList(17, rebanhoFixture);
    expect(genealogia).toEqual({ mae: "58", pai: "—" });
    expect(formatDescendentesContagem(filhos.length)).toBe("0 filhos registrados");
  });

  it("E) fêmea 58 — sem pais, 300 e 301 como filhos", () => {
    const genealogia = resolveGenealogiaFichaExibicao(
      resolveGenealogiaDisplay({ maeId: null, paiId: null }, parentMap),
    );
    const filhos = buildDescendentesList(MATRIZ_58_ID, rebanhoFixture);
    expect(genealogia).toEqual({ mae: "—", pai: "—" });
    expect(formatDescendentesContagem(filhos.length)).toBe("2 filhos registrados");
    expect(filhos.map(f => f.brinco)).toEqual(["300", "301"]);
  });

  it("F) touro 16 — 0 filhos, não associa 300/301", () => {
    const genealogia = resolveGenealogiaFichaExibicao(
      resolveGenealogiaDisplay(
        { maeId: null, paiId: null, mae: "Maria", pai: "Pedro" },
        parentMap,
      ),
    );
    const filhos = buildDescendentesList(TOURO_16_ID, rebanhoFixture);
    expect(genealogia).toEqual({ mae: "Maria", pai: "Pedro" });
    expect(filhos).toEqual([]);
  });

  it("G) legado Maria/Pedro permanece sem inferir filhos", () => {
    const genealogia = resolveGenealogiaFichaExibicao(
      resolveGenealogiaDisplay(
        { maeId: null, paiId: null, mae: "Maria", pai: "Pedro" },
        parentMap,
      ),
    );
    expect(genealogia.mae).toBe("Maria");
    expect(genealogia.pai).toBe("Pedro");
  });
});
