import { describe, expect, it } from "vitest";
import {
  comprasListInputSchema,
  statusWhereComprasList,
  whereListagemCompras,
} from "./comprasListFiltro";

describe("comprasListFiltro", () => {
  it("aceita só os status persistidos do schema", () => {
    for (const persistido of ["pendente", "concluido", "cancelado"] as const) {
      expect(statusWhereComprasList(persistido)).toBe(persistido);
      expect(comprasListInputSchema.parse({ status: persistido })).toEqual({ status: persistido });
    }
  });

  it("Todos não envia status e listagem sem input continua válida", () => {
    expect(statusWhereComprasList(undefined)).toBeUndefined();
    expect(statusWhereComprasList(null)).toBeUndefined();
    expect(statusWhereComprasList("")).toBeUndefined();
    expect(statusWhereComprasList("__all__")).toBeUndefined();
    expect(comprasListInputSchema.parse({ fazendaId: 1 })).toEqual({ fazendaId: 1 });
    expect(comprasListInputSchema.parse(undefined)).toBeUndefined();
  });

  it("rejeita rótulos visuais e isola userId + fazenda", () => {
    expect(statusWhereComprasList("Concluída")).toBeUndefined();
    expect(statusWhereComprasList("Cancelada")).toBeUndefined();
    expect(() => comprasListInputSchema.parse({ status: "cancelada" })).toThrow();
    expect(whereListagemCompras(7, { fazendaId: 1, status: "concluido" })).toEqual({
      userId: 7,
      fazendaId: 1,
      status: "concluido",
    });
    expect(whereListagemCompras(7, { fazendaId: 2 })).toEqual({
      userId: 7,
      fazendaId: 2,
      status: undefined,
    });
    expect(whereListagemCompras(7)).toEqual({ userId: 7, fazendaId: undefined, status: undefined });
  });
});
