import { describe, expect, it } from "vitest";
import { formatDateInputLocal } from "@/lib/date-utils";
import { dataInicialNovaMovimentacao } from "./insumosNovaMovimentacaoData";

describe("Nova Movimentação — data civil inicial", () => {
  it("usa o helper local, não toISOString", () => {
    const agora = new Date(2026, 9, 12, 22, 30, 0);
    expect(dataInicialNovaMovimentacao(agora)).toBe(formatDateInputLocal(agora));
    expect(dataInicialNovaMovimentacao(agora)).toBe("2026-10-12");
  });

  it("regressão: 12/10/2026 22:30 local não vira 13/10", () => {
    const local2230 = new Date(2026, 9, 12, 22, 30, 0);
    expect(dataInicialNovaMovimentacao(local2230)).toBe("2026-10-12");
    expect(dataInicialNovaMovimentacao(local2230)).not.toBe("2026-10-13");
  });
});
