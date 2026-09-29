import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NovaCompraPage.tsx"), "utf8");
const confirmar = readFileSync(resolve(here, "../../../server/confirmarCompra.ts"), "utf8");
const receber = readFileSync(resolve(here, "../../../server/receberAnimalCompra.ts"), "utf8");

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
    expect(page).not.toContain("Observações");
  });

  it("não exibe escolha de modo de identificação", () => {
    expect(page).not.toContain("Identificação dos Animais");
    expect(page).not.toContain("IDENTIFICAÇÃO DOS ANIMAIS");
    expect(page).not.toContain("Como os animais desta compra serão registrados?");
    expect(page).not.toContain("Animais identificados individualmente");
    expect(page).not.toContain("Animais ainda não identificados");
    expect(page).not.toContain("A identificação individual ainda não está disponível");
    expect(page).not.toContain("RadioGroup");
    expect(page).not.toContain("setModo");
    expect(page).toContain("MODO_IDENTIFICACAO_COMPRA_LEGADO");
    expect(page).toContain("Composição dos Animais");
    expect(page).toContain("Valores da Aquisição");
    expect(page).not.toContain("id=\"recebimento-brinco\"");
    expect(page).not.toContain("useAt05Reader");
    expect(page).not.toContain("useTruTestBleReader");
  });

  it("Confirmar Compra não cria animal; Recebimento grava origem comercial", () => {
    expect(confirmar).not.toContain("insertAnimal");
    expect(confirmar).not.toContain("from(animais");
    expect(confirmar).toContain("compraGrupos");
    expect(confirmar).toContain("MODO_IDENTIFICACAO_COMPRA_LEGADO");
    expect(receber).toContain("compraId: parsed.compraId");
    expect(receber).toContain("compraGrupoId: grupo.id");
    expect(receber).toContain("insertAnimal");
  });
});
