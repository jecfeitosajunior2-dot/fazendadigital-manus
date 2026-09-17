import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT,
  paginateSemenEstoqueList,
  semenEstoqueEmptyMessage,
  sortSemenEstoqueByReprodutor,
} from "./semenEstoqueListPagination";

const here = dirname(fileURLToPath(import.meta.url));
const rows = Array.from({ length: 23 }, (_, i) => ({ id: i + 1 }));

describe("paginateSemenEstoqueList", () => {
  it("usa 10 itens por página no padrão administrativo", () => {
    expect(SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT).toBe(10);
    const { pageItems, totalPages, totalItems } = paginateSemenEstoqueList(
      rows,
      1,
      SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT,
    );
    expect(pageItems).toHaveLength(10);
    expect(pageItems[0]?.id).toBe(1);
    expect(pageItems[9]?.id).toBe(10);
    expect(totalPages).toBe(3);
    expect(totalItems).toBe(23);
  });

  it("segunda página mostra o intervalo correto", () => {
    const { pageItems } = paginateSemenEstoqueList(rows, 2, 10);
    expect(pageItems.map(r => r.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("última página mostra o restante", () => {
    const { pageItems, pageSafe } = paginateSemenEstoqueList(rows, 3, 10);
    expect(pageSafe).toBe(3);
    expect(pageItems.map(r => r.id)).toEqual([21, 22, 23]);
  });

  it("filtro que reduz resultados não deixa página inválida", () => {
    const filtrados = rows.slice(0, 3);
    const { pageSafe, pageItems, totalPages } = paginateSemenEstoqueList(filtrados, 5, 10);
    expect(pageSafe).toBe(1);
    expect(totalPages).toBe(1);
    expect(pageItems).toHaveLength(3);
  });

  it("lista vazia permanece na página 1", () => {
    const { pageSafe, pageItems, totalItems } = paginateSemenEstoqueList([], 4, 10);
    expect(pageSafe).toBe(1);
    expect(pageItems).toEqual([]);
    expect(totalItems).toBe(0);
  });
});

describe("semenEstoqueEmptyMessage", () => {
  it("pede fazenda quando não há seleção", () => {
    expect(
      semenEstoqueEmptyMessage({
        hasFazenda: false,
        loading: false,
        totalItems: 0,
        hasActiveFilters: false,
      }),
    ).toBe("Selecione uma fazenda para ver o estoque.");
  });

  it("mostra loading discreto", () => {
    expect(
      semenEstoqueEmptyMessage({
        hasFazenda: true,
        loading: true,
        totalItems: 0,
        hasActiveFilters: false,
      }),
    ).toBe("Carregando...");
  });

  it("filtro sem resultado usa mensagem de busca", () => {
    expect(
      semenEstoqueEmptyMessage({
        hasFazenda: true,
        loading: false,
        totalItems: 0,
        hasActiveFilters: true,
      }),
    ).toBe("Nenhuma partida encontrada.");
  });

  it("fazenda sem estoque usa mensagem de cadastro", () => {
    expect(
      semenEstoqueEmptyMessage({
        hasFazenda: true,
        loading: false,
        totalItems: 0,
        hasActiveFilters: false,
      }),
    ).toBe("Nenhuma partida de sêmen cadastrada.");
  });

  it("ordena por reprodutor A-Z e Z-A, estável na mesma letra", () => {
    const items = [
      { id: 2, reprodutorDisplay: "P-10FAZ" },
      { id: 1, reprodutorDisplay: "GSC-7117" },
      { id: 3, reprodutorDisplay: "GSC-7117" },
    ];
    expect(sortSemenEstoqueByReprodutor(items, true).map(i => i.id)).toEqual([1, 3, 2]);
    expect(sortSemenEstoqueByReprodutor(items, false).map(i => i.reprodutorDisplay)).toEqual([
      "P-10FAZ",
      "GSC-7117",
      "GSC-7117",
    ]);
  });

  it("Estoque e Utilizado não usam seta de ordenar no Reprodutor", () => {
    const page = readFileSync(resolve(here, "../pages/SemenEstoquePage.tsx"), "utf8");
    const utilizado = readFileSync(resolve(here, "../pages/SemenUtilizadoPage.tsx"), "utf8");
    expect(page).not.toContain("sortSemenEstoqueByReprodutor");
    expect(page).not.toContain("Ordenar por reprodutor");
    expect(page).not.toContain("arrow_drop_up");
    expect(utilizado).not.toContain("sortSemenEstoqueByReprodutor");
    expect(utilizado).not.toContain("Ordenar por reprodutor");
    expect(utilizado).not.toContain("arrow_drop_up");
    expect(utilizado).toContain("paginateSemenEstoqueList(grupos");
    expect(utilizado).not.toContain("sortSemenUtilizadoGruposExport");
    expect(page).toContain("SEMEN_ESTOQUE_TITULO");
    expect(page).not.toContain("Estoque de sêmen");
    expect(page).toContain("buildSemenEstoqueExportRows(partidas)");
    expect(page).toContain("SEMEN_ESTOQUE_EXPORT_COLUMN_ALIGNS");
    expect(page).toContain("SEMEN_ESTOQUE_PDF_COLUMN_ALIGNS");
    expect(page).toContain("spreadsheetFooterRowCount");
    expect(page).toContain("text-center align-middle text-gray-800");
    expect(page).toContain("FormSelect");
    expect(page).toContain("SEMEN_STATUS_DISPONIVEL");
    expect(page).not.toMatch(/<select[\s\S]*aria-label="Status"/);
  });

  it("com itens não gera empty state", () => {
    expect(
      semenEstoqueEmptyMessage({
        hasFazenda: true,
        loading: false,
        totalItems: 3,
        hasActiveFilters: false,
      }),
    ).toBe("");
  });
});
