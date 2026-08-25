import { describe, expect, it } from "vitest";
import {
  buildDescendentesList,
  filterDescendentesDirectos,
  isDescendenteDireto,
  resolveVinculoDescendente,
  sortDescendentes,
  type DescendenteSource,
} from "../shared/animalDescendentes";

const MATRIZ_58_ID = 15;
const TOURO_16_ID = 7;
const CRIA_300_ID = 16;
const CRIA_301_ID = 17;

const rebanhoMatriz58: DescendenteSource[] = [
  { id: MATRIZ_58_ID, brinco: "58", sexo: "femea", maeId: null, paiId: null },
  { id: TOURO_16_ID, brinco: "16", sexo: "macho", maeId: null, paiId: null },
  {
    id: CRIA_300_ID,
    brinco: "300",
    sexo: "macho",
    categoria: "Bezerro",
    dataNascimento: "2026-08-24",
    status: "ativo",
    maeId: MATRIZ_58_ID,
    paiId: null,
  },
  {
    id: CRIA_301_ID,
    brinco: "301",
    sexo: "femea",
    categoria: "Bezerra",
    dataNascimento: "2026-08-24",
    status: "ativo",
    maeId: MATRIZ_58_ID,
    paiId: null,
  },
  {
    id: 99,
    brinco: "999",
    sexo: "macho",
    maeId: null,
    paiId: null,
    mae: "58",
    pai: "Touro texto",
  } as DescendenteSource,
];

describe("isDescendenteDireto", () => {
  it("usa maeId estruturado", () => {
    expect(isDescendenteDireto(MATRIZ_58_ID, { maeId: MATRIZ_58_ID, paiId: null })).toBe(true);
  });

  it("usa paiId estruturado", () => {
    expect(isDescendenteDireto(TOURO_16_ID, { maeId: null, paiId: TOURO_16_ID })).toBe(true);
  });

  it("não infere por texto legado", () => {
    expect(isDescendenteDireto(MATRIZ_58_ID, { maeId: null, paiId: null })).toBe(false);
  });
});

describe("buildDescendentesList — matriz 58", () => {
  it("A) mãe com dois filhos retorna ambos", () => {
    const rows = buildDescendentesList(MATRIZ_58_ID, rebanhoMatriz58);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.brinco)).toEqual(["300", "301"]);
    expect(rows.every(r => r.vinculo === "mae")).toBe(true);
  });

  it("B) pai sem filhos estruturados retorna vazio", () => {
    expect(buildDescendentesList(TOURO_16_ID, rebanhoMatriz58)).toEqual([]);
  });

  it("C) filho sem vínculo estruturado não aparece", () => {
    const rows = buildDescendentesList(MATRIZ_58_ID, rebanhoMatriz58);
    expect(rows.some(r => r.brinco === "999")).toBe(false);
  });
});

describe("buildDescendentesList — casos gerais", () => {
  it("D) filho inativo continua aparecendo", () => {
    const rows = buildDescendentesList(MATRIZ_58_ID, [
      {
        id: 20,
        brinco: "400",
        status: "inativo",
        maeId: MATRIZ_58_ID,
        paiId: null,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("inativo");
  });

  it("E) filho em outra fazenda continua aparecendo", () => {
    const rows = buildDescendentesList(MATRIZ_58_ID, [
      {
        id: 21,
        brinco: "401",
        maeId: MATRIZ_58_ID,
        fazendaId: 99,
      } as DescendenteSource,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("F) outro usuário não aparece — filtro feito na query; lista vazia se ID não bate", () => {
    const rows = buildDescendentesList(999, [
      { id: 22, brinco: "402", maeId: MATRIZ_58_ID, paiId: null },
    ]);
    expect(rows).toEqual([]);
  });

  it("G) mesmo filho não duplica quando maeId e paiId apontam para o mesmo pai", () => {
    const rows = buildDescendentesList(TOURO_16_ID, [
      {
        id: 30,
        brinco: "500",
        maeId: MATRIZ_58_ID,
        paiId: TOURO_16_ID,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.vinculo).toBe("pai");
  });

  it("G2) vínculo ambos quando parent é mãe e pai do mesmo filho (dado inconsistente)", () => {
    expect(resolveVinculoDescendente(MATRIZ_58_ID, MATRIZ_58_ID, MATRIZ_58_ID)).toBe("ambos");
  });

  it("H) ordenação determinística por nascimento desc, depois brinco", () => {
    const rows = sortDescendentes([
      {
        animalId: 1,
        brinco: "100",
        sexo: null,
        categoria: null,
        dataNascimento: "2025-01-01",
        status: "ativo",
        vinculo: "mae",
      },
      {
        animalId: 2,
        brinco: "200",
        sexo: null,
        categoria: null,
        dataNascimento: "2026-08-24",
        status: "ativo",
        vinculo: "mae",
      },
    ]);
    expect(rows.map(r => r.brinco)).toEqual(["200", "100"]);
  });

  it("I) ausência de dataNascimento ordena após registros com data", () => {
    const rows = sortDescendentes([
      {
        animalId: 1,
        brinco: "100",
        sexo: null,
        categoria: null,
        dataNascimento: null,
        status: "ativo",
        vinculo: "mae",
      },
      {
        animalId: 2,
        brinco: "200",
        sexo: null,
        categoria: null,
        dataNascimento: "2026-01-01",
        status: "ativo",
        vinculo: "mae",
      },
    ]);
    expect(rows[0]?.animalId).toBe(2);
    expect(rows[1]?.animalId).toBe(1);
  });

  it("J) PK diferente do brinco preserva ambos", () => {
    const rows = buildDescendentesList(MATRIZ_58_ID, rebanhoMatriz58);
    const cria301 = rows.find(r => r.brinco === "301");
    expect(cria301?.animalId).toBe(CRIA_301_ID);
    expect(cria301?.animalId).not.toBe(301);
  });

  it("pai com dois filhos estruturados", () => {
    const rows = buildDescendentesList(TOURO_16_ID, [
      { id: 40, brinco: "600", paiId: TOURO_16_ID, maeId: null },
      { id: 41, brinco: "601", paiId: TOURO_16_ID, maeId: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.vinculo === "pai")).toBe(true);
  });
});

describe("filterDescendentesDirectos", () => {
  it("não usa campos de texto", () => {
    expect(
      filterDescendentesDirectos(MATRIZ_58_ID, [
        { id: 50, maeId: null, paiId: null, brinco: "58" } as DescendenteSource,
      ]),
    ).toEqual([]);
  });
});
