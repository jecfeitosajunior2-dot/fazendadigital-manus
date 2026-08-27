import { describe, expect, it } from "vitest";
import {
  SEMEN_ESTOQUE_PATH,
  SEMEN_UTILIZADO_PATH,
  SEMEN_CADASTRO_PATH,
  isValidSemenMovimentacaoId,
  parseSemenMovimentacaoIdFromRoute,
  semenEntradaResumoPath,
  semenPartidaDetalhePath,
  semenUtilizadoDetalhePath,
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

  it("nova rota principal é Sêmen utilizado", () => {
    expect(SEMEN_UTILIZADO_PATH).toBe("/reproducao/semen-utilizado");
    expect(semenUtilizadoDetalhePath("externo|e:gsc-7117|P-01")).toBe(
      "/reproducao/semen-utilizado/externo%7Ce%3Agsc-7117%7CP-01",
    );
  });

  it("cadastro de sêmen legado redireciona para Sêmen utilizado", () => {
    expect(SEMEN_CADASTRO_PATH).toBe("/reproducao/cadastro-semen");
    expect(SEMEN_CADASTRO_PATH).not.toContain("estoque");
    expect(SEMEN_UTILIZADO_PATH).toBe("/reproducao/semen-utilizado");
  });
});
