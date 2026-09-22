import { describe, expect, it } from "vitest";
import { statusWhereVendasList, vendasListInputSchema } from "./vendasListFiltro";

describe("vendasListFiltro", () => {
  it("mapeia rótulo visual → valor persistido aceito no input", () => {
    const visualParaPersistido = [
      { visual: "Pendente", persistido: "pendente" },
      { visual: "Concluída", persistido: "concluido" },
      { visual: "Cancelada", persistido: "cancelado" },
    ] as const;

    for (const { persistido } of visualParaPersistido) {
      expect(statusWhereVendasList(persistido)).toBe(persistido);
      expect(vendasListInputSchema.parse({ status: persistido })).toEqual({ status: persistido });
    }
  });

  it("Todos não envia status e não monta WHERE de status", () => {
    expect(statusWhereVendasList(undefined)).toBeUndefined();
    expect(statusWhereVendasList(null)).toBeUndefined();
    expect(statusWhereVendasList("")).toBeUndefined();
    expect(statusWhereVendasList("__all__")).toBeUndefined();
    expect(statusWhereVendasList("__empty__")).toBeUndefined();
    expect(vendasListInputSchema.parse({ fazendaId: 1 })).toEqual({ fazendaId: 1 });
    expect(vendasListInputSchema.parse(undefined)).toBeUndefined();
  });

  it("rejeita rótulos e sinônimos que não existem no MySQL", () => {
    expect(statusWhereVendasList("Pendente")).toBeUndefined();
    expect(statusWhereVendasList("Concluída")).toBeUndefined();
    expect(statusWhereVendasList("Cancelada")).toBeUndefined();
    expect(statusWhereVendasList("concluida")).toBeUndefined();
    expect(statusWhereVendasList("cancelada")).toBeUndefined();
    expect(statusWhereVendasList("confirmado")).toBeUndefined();
    expect(() => vendasListInputSchema.parse({ status: "cancelada" })).toThrow();
    expect(() => vendasListInputSchema.parse({ status: "concluida" })).toThrow();
  });
});
