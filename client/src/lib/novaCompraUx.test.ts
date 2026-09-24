import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NovaCompraPage.tsx"), "utf8");

describe("Nova Compra — conferência do modal", () => {
  it("mostra Peso total já somado da composição, com formatação pt-BR", () => {
    expect(page).toContain("Peso total:");
    expect(page).toContain("formatarMetricaPeso");
    expect(page).toContain("calc.pesoTotal");
    expect(page).toContain("calc.pesoTotal > 0");
  });

  it("não confirma a compra ao montar o modal", () => {
    expect(page).toContain("if (!ok) return;");
    expect(page).toContain('confirmText: "Confirmar Compra"');
  });

  it("não pede lote nem pasto na aquisição", () => {
    expect(page).not.toContain("Destino no Rebanho");
    expect(page).not.toContain("Lote de destino");
    expect(page).not.toContain("Pasto de destino");
    expect(page).not.toContain("loteDestinoId");
    expect(page).not.toContain("pastoDestinoId");
    expect(page).toContain("Observações");
  });
});
