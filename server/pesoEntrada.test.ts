import { describe, expect, it } from "vitest";
import {
  HINT_PESO_ENTRADA,
  computeIndicadoresPeso,
  isPesoEntradaFormValido,
  parsePesoPositivo,
  resolveBaseEntradaParaPesagem,
  resolveUltimoPeso,
} from "../shared/pesoEntrada";

describe("Peso na Entrada — dado cadastral", () => {
  it("mantém o texto auxiliar oficial", () => {
    expect(HINT_PESO_ENTRADA).toBe("Peso informado no ingresso do animal na fazenda.");
  });

  it("rejeita zero, negativo, NaN e texto inválido", () => {
    expect(parsePesoPositivo("0")).toBeNull();
    expect(parsePesoPositivo("-10")).toBeNull();
    expect(parsePesoPositivo("abc")).toBeNull();
    expect(parsePesoPositivo("")).toBeNull();
    expect(isPesoEntradaFormValido("")).toBe(true);
    expect(isPesoEntradaFormValido("280")).toBe(true);
    expect(isPesoEntradaFormValido("280,5")).toBe(true);
    expect(isPesoEntradaFormValido("0")).toBe(false);
    expect(isPesoEntradaFormValido("-1")).toBe(false);
  });

  it("A — só peso na entrada: fallback de Últ. Peso, sem GMD", () => {
    const r = computeIndicadoresPeso([], {
      pesoEntrada: "280",
      dataEntrada: "2026-08-01",
    });
    expect(r.ultimoPeso).toBe(280);
    expect(r.origemUltimoPeso).toBe("entrada");
    expect(r.ganhoKg).toBeNull();
    expect(r.gmd).toBeNull();
    expect(r.ultimaPesagemData).toBeNull();
  });

  it("B — primeira pesagem prevalece; entrada permanece cadastral", () => {
    const r = computeIndicadoresPeso(
      [{ peso: "295", data: "2026-08-15" }],
      { pesoEntrada: "280", dataEntrada: "2026-08-01" },
    );
    expect(r.ultimoPeso).toBe(295);
    expect(r.origemUltimoPeso).toBe("pesagem");
    expect(resolveUltimoPeso([{ peso: "295", data: "2026-08-15" }], "280").origem).toBe("pesagem");
  });

  it("C — primeiro GMD usa entrada 280 → 295 em 14 dias", () => {
    const r = computeIndicadoresPeso(
      [{ peso: "295", data: "2026-08-15" }],
      { pesoEntrada: "280", dataEntrada: "2026-08-01" },
    );
    expect(r.ganhoKg).toBe(15);
    expect(r.gmd).toBe(Math.round((15 / 14) * 1000) / 1000);
  });

  it("D — segunda pesagem usa a pesagem anterior, não a entrada", () => {
    const r = computeIndicadoresPeso(
      [
        { peso: "295", data: "2026-08-15" },
        { peso: "310", data: "2026-08-29" },
      ],
      { pesoEntrada: "280", dataEntrada: "2026-08-01" },
    );
    expect(r.ultimoPeso).toBe(310);
    expect(r.ganhoKg).toBe(15);
    expect(r.ganhoKg).not.toBe(30);
    expect(r.gmd).toBe(Math.round((15 / 14) * 1000) / 1000);
    expect(resolveBaseEntradaParaPesagem(
      { pesoEntrada: "280", dataEntrada: "2026-08-01" },
      "2026-08-15",
    )?.peso).toBe(280);
  });

  it("E — sem data de entrada não calcula GMD inicial", () => {
    const r = computeIndicadoresPeso(
      [{ peso: "295", data: "2026-08-15" }],
      { pesoEntrada: "280", dataEntrada: "" },
    );
    expect(r.ultimoPeso).toBe(295);
    expect(r.gmd).toBeNull();
    expect(r.ganhoKg).toBeNull();
    expect(resolveBaseEntradaParaPesagem({ pesoEntrada: "280" }, "2026-08-15")).toBeNull();
  });

  it("F — corrigir peso na entrada não inventa pesagem; só recalcula derivados", () => {
    const antes = computeIndicadoresPeso(
      [{ peso: "295", data: "2026-08-15" }],
      { pesoEntrada: "280", dataEntrada: "2026-08-01" },
    );
    const depois = computeIndicadoresPeso(
      [{ peso: "295", data: "2026-08-15" }],
      { pesoEntrada: "282", dataEntrada: "2026-08-01" },
    );
    expect(depois.ultimoPeso).toBe(295);
    expect(depois.ganhoKg).toBe(13);
    expect(depois.gmd).not.toBe(antes.gmd);
  });

  it("G — com pesagens, alterar entrada não muda Últ. Peso", () => {
    const r = computeIndicadoresPeso(
      [
        { peso: "295", data: "2026-08-15" },
        { peso: "310", data: "2026-08-29" },
      ],
      { pesoEntrada: "500", dataEntrada: "2026-08-01" },
    );
    expect(r.ultimoPeso).toBe(310);
    expect(r.origemUltimoPeso).toBe("pesagem");
  });

  it("não usa createdAt como data de entrada", () => {
    const r = computeIndicadoresPeso(
      [{ peso: "295", data: "2026-08-15" }],
      { pesoEntrada: "280" },
    );
    expect(r.gmd).toBeNull();
  });
});
