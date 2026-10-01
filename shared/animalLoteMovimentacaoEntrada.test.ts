import { describe, expect, it } from "vitest";
import {
  buildEntradaInicialLoteMovimentacao,
  loteIdEfetivoParaHistorico,
} from "./animalLoteMovimentacaoEntrada";

describe("entrada inicial em lote", () => {
  it("origem permanece nula — não inventa lote de origem", () => {
    expect(
      buildEntradaInicialLoteMovimentacao({
        userId: 10,
        animalId: 101,
        loteDestinoId: 1,
        dataMovimentacao: "2026-10-01",
        usuarioNome: "Paulo",
      }),
    ).toMatchObject({
      loteOrigemId: null,
      loteDestinoId: 1,
    });
  });

  it("ignora lote vazio ou zero", () => {
    expect(loteIdEfetivoParaHistorico(null)).toBeNull();
    expect(loteIdEfetivoParaHistorico(undefined)).toBeNull();
    expect(loteIdEfetivoParaHistorico(0)).toBeNull();
    expect(loteIdEfetivoParaHistorico(7)).toBe(7);
  });
});
