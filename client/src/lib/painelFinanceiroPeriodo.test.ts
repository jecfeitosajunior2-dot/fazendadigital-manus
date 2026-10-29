import { describe, expect, it } from "vitest";
import { periodoMesAtual } from "./date-utils";
import { periodoMesCorrentePainel } from "@shared/painelControle";

describe("Painel e Relatórios usam o mesmo mês civil", () => {
  it("coincide com o período padrão da tela /financeiro/relatorios", () => {
    const ref = new Date(2026, 9, 29, 18, 0, 0);
    const relatorios = periodoMesAtual(ref);
    const painel = periodoMesCorrentePainel(ref);
    expect(painel.de).toBe(relatorios.de);
    expect(painel.ate).toBe(relatorios.ate);
    expect(painel.de).toBe("2026-10-01");
    expect(painel.ate).toBe("2026-10-31");
  });
});
