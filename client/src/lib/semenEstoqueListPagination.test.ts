import { describe, expect, it } from "vitest";
import {
  SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT,
  paginateSemenEstoqueList,
  semenEstoqueEmptyMessage,
} from "./semenEstoqueListPagination";

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
