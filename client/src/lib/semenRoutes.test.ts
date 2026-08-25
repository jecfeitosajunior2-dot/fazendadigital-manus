import { describe, expect, it } from "vitest";
import {
  SEMEN_ESTOQUE_PATH,
  isValidSemenMovimentacaoId,
  parseSemenMovimentacaoIdFromRoute,
  semenEntradaResumoPath,
  semenPartidaDetalhePath,
} from "./semenRoutes";

describe("semenRoutes", () => {
  it("navegação após sucesso usa movimentacaoId", () => {
    expect(semenEntradaResumoPath(12)).toBe("/reproducao/estoque-semen/entrada/12");
  });

  it("nunca monta rota com partidaId no lugar da movimentação", () => {
    expect(semenEntradaResumoPath(12)).not.toBe("/reproducao/estoque-semen/entrada/3");
    expect(semenPartidaDetalhePath(3)).toBe("/reproducao/estoque-semen/3");
  });

  it("rejeita movimentacaoId inválido na rota", () => {
    expect(() => semenEntradaResumoPath(undefined as unknown as number)).toThrow();
    expect(() => semenEntradaResumoPath(0)).toThrow();
  });

  it("parseSemenMovimentacaoIdFromRoute rejeita undefined na URL", () => {
    expect(parseSemenMovimentacaoIdFromRoute("undefined")).toBeNull();
    expect(parseSemenMovimentacaoIdFromRoute(undefined)).toBeNull();
    expect(parseSemenMovimentacaoIdFromRoute("NaN")).toBeNull();
    expect(parseSemenMovimentacaoIdFromRoute("0")).toBeNull();
    expect(parseSemenMovimentacaoIdFromRoute("12")).toBe(12);
  });

  it("isValidSemenMovimentacaoId exige número finito > 0", () => {
    expect(isValidSemenMovimentacaoId(12)).toBe(true);
    expect(isValidSemenMovimentacaoId(undefined)).toBe(false);
    expect(isValidSemenMovimentacaoId(NaN)).toBe(false);
  });

  it("Voltar ao estoque usa rota correta", () => {
    expect(SEMEN_ESTOQUE_PATH).toBe("/reproducao/estoque-semen");
  });
});
