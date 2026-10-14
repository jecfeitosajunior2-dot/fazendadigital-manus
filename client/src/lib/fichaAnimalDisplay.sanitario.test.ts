import { describe, expect, it } from "vitest";
import { computeCustoSanitarioResumo } from "./fichaAnimalDisplay";

describe("computeCustoSanitarioResumo", () => {
  it("não soma custo de registro estornado", () => {
    const resumo = computeCustoSanitarioResumo([
      { custo: "20.00", status: "ativo" },
      { custo: "15.00", status: "estornado" },
    ]);
    expect(resumo.total).toBe(20);
    expect(resumo.comCusto).toBe(1);
    expect(resumo.totalRegistros).toBe(2);
  });
});
