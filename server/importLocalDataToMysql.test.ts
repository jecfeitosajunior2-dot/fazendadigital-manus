import { describe, expect, it } from "vitest";
import { explodeManutencaoPecas } from "../scripts/import-local-data-to-mysql.dry-run";
import {
  ALL_SCHEMA_TABLES,
  assertDestinationEmpty,
  assertNoDemoImported,
  buildManutencaoPecaRow,
  DEMO_SIGNATURES,
  INSERT_ORDER,
  isDevDemoCollection,
  rejectLoteId1,
  remapDevUserId,
  resolveOfficialAdmin,
  shouldImportDevCollection,
  TARGET_TABLES,
  toTimestamp,
} from "../scripts/import-local-data-to-mysql.lib";

describe("importador real local → mysql (funções puras)", () => {
  it("ignora coleções demo e não amplia a whitelist", () => {
    expect(isDevDemoCollection("fazendas")).toBe(true);
    expect(isDevDemoCollection("animais")).toBe(true);
    expect(isDevDemoCollection("lotes")).toBe(true);
    expect(shouldImportDevCollection("fazendas")).toBe(false);
    expect(shouldImportDevCollection("animais")).toBe(false);
    expect(shouldImportDevCollection("lotes")).toBe(false);
    expect(shouldImportDevCollection("produtosCatalogo")).toBe(true);
    expect(shouldImportDevCollection("estoque")).toBe(true);
    expect(shouldImportDevCollection("movimentacoes")).toBe(true);
    expect(shouldImportDevCollection("pessoas")).toBe(true);
    expect(shouldImportDevCollection("contas")).toBe(true);
    expect(shouldImportDevCollection("financeiroMovimentacoes")).toBe(true);
    expect(shouldImportDevCollection("rebanhoSeedVersion")).toBe(false);
  });

  it("preserva IDs e recusa criar lote 1", () => {
    expect(() => rejectLoteId1(1)).toThrow(/lote id 1/);
    expect(() => rejectLoteId1(2)).not.toThrow();
    const peca = buildManutencaoPecaRow({
      manutencaoId: 1,
      estoqueId: 24,
      nome: "Terminal",
      quantidade: "1.00",
      valorUnitario: "48.14",
      valorTotal: "48.14",
    });
    expect(peca).not.toHaveProperty("id");
    expect(peca.manutencaoId).toBe(1);
    expect(peca.estoqueId).toBe(24);
  });

  it("explode peças sem inventar id e mantém referências", () => {
    const exploded = explodeManutencaoPecas({
      id: 3,
      pecas: [{ estoqueId: 33, nome: "Parafuso do Eixo", quantidade: "1.00", valorUnitario: "25.00", valorTotal: "25.00" }],
    });
    expect(exploded.pecas[0]).not.toHaveProperty("id");
    expect(buildManutencaoPecaRow(exploded.pecas[0]!)).toEqual({
      manutencaoId: 3,
      estoqueId: 33,
      nome: "Parafuso do Eixo",
      quantidade: "1.00",
      valorUnitario: "25.00",
      valorTotal: "25.00",
    });
  });

  it("bloqueia destino que já tenha qualquer registro", () => {
    expect(() => assertDestinationEmpty({ animais: 0, fazendas: 0 })).not.toThrow();
    expect(() => assertDestinationEmpty({ animais: 1, fazendas: 0 })).toThrow(/não está vazio/);
    expect(() => assertDestinationEmpty({ vendas: 2 })).toThrow(/Abortado sem apagar/);
  });

  it("reconhece sentinelas reais e rejeita demo no destino", () => {
    expect(() =>
      assertNoDemoImported({
        fazendaNomes: ["Fazenda J", "Fazenda B"],
        lotes: DEMO_SIGNATURES.lotesReais.map(item => ({ ...item })),
        animais: [
          { id: 1, brinco: "12" },
          { id: 2, brinco: "7845" },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      assertNoDemoImported({
        fazendaNomes: ["Minha Fazenda"],
        lotes: DEMO_SIGNATURES.lotesReais.map(item => ({ ...item })),
        animais: [
          { id: 1, brinco: "12" },
          { id: 2, brinco: "7845" },
        ],
      }),
    ).toThrow(/Minha Fazenda/);
    expect(() =>
      assertNoDemoImported({
        fazendaNomes: ["Fazenda J", "Fazenda B"],
        lotes: [
          { id: 2, nome: "Vazias" },
          { id: 3, nome: "Vacas" },
          { id: 4, nome: "Novilhos" },
          { id: 5, nome: "Bezerra" },
          { id: 6, nome: "Bezerro" },
          { id: 7, nome: "B01" },
        ],
        animais: [
          { id: 1, brinco: "12" },
          { id: 2, brinco: "7845" },
        ],
      }),
    ).toThrow(/Vazias/);
    expect(() =>
      assertNoDemoImported({
        fazendaNomes: ["Fazenda J", "Fazenda B"],
        lotes: DEMO_SIGNATURES.lotesReais.map(item => ({ ...item })),
        animais: [
          { id: 1, brinco: "02" },
          { id: 2, brinco: "7845" },
        ],
      }),
    ).toThrow(/brinco demo/);
  });

  it("resolve o admin oficial sem inventar credencial", () => {
    const admin = resolveOfficialAdmin({});
    expect(admin.id).toBe(1);
    expect(admin.email).toBe("admin@fazendadigital.local");
    expect(admin.openId).toBe("local:admin@fazendadigital.local");
    expect(admin.source).toContain("scripts/seed.ts");
    expect(remapDevUserId(0)).toBe(1);
    expect(remapDevUserId(1)).toBe(1);
    expect(() => remapDevUserId(9)).toThrow(/não mapeável/);
  });

  it("converte timestamp ISO para formato MySQL", () => {
    expect(toTimestamp("2026-09-18T20:13:57.794Z")).toBe("2026-09-18 20:13:57");
  });

  it("mantém a ordem de insert e o conjunto de tabelas do schema", () => {
    expect(INSERT_ORDER[0]).toBe("users");
    expect(INSERT_ORDER).toContain("manutencao_pecas");
    expect(INSERT_ORDER).not.toContain("vendas");
    expect(new Set(ALL_SCHEMA_TABLES).size).toBe(31);
    expect(TARGET_TABLES).not.toContain("vendas");
  });
});
