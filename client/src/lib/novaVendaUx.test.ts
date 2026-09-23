import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NovaVendaPage.tsx"), "utf8");
const at05Control = readFileSync(resolve(here, "../components/At05RfidReaderControl.tsx"), "utf8");
const at05Hook = readFileSync(resolve(here, "../hooks/useAt05Reader.ts"), "utf8");

describe("Nova Venda — regras da tela", () => {
  it("não sugere o último peso histórico no embarque", () => {
    expect(page).not.toContain("ultimoPeso");
    expect(page).not.toContain("origemUltimoPeso");
    expect(page).toContain('pesoVenda: ""');
    expect(page).toContain('pesoOrigem: "manual"');
  });

  it("reusa AT05 e Tru-Test S3 sem confirmar a venda na leitura", () => {
    expect(page).toContain("At05RfidReaderControl");
    expect(page).toContain("ScaleReaderControl");
    expect(page).toContain("useTruTestBleReader");
    expect(page).toContain("readCurrentTruTestBleWeightKg");
    expect(page).toContain("pedirPesoVisorBalanca");
    expect(page).toContain("pesoBalancaVendaNaIdentificacao");
    expect(page).toContain("aplicarPesoBalanca");
    expect(page).toContain("formatPesoKgVisorSessao");
    expect(page).not.toContain("formatPesoKgParaCampo");
    expect(page).toContain("pesoOrigem: \"balanca\"");
  });

  it("RFID e balança usam os mesmos cartões de Equipamentos do Curral", () => {
    expect(page).toContain("Identifique o animal pelo RFID. Com a balança conectada, o peso do embarque será preenchido automaticamente.");
    expect(page).toContain('variant="hub"');
    expect(page).not.toContain("usarBalanca");
    expect(page).not.toContain("setUsarBalanca");
  });

  it("mostra Animal atual a partir do foco operacional, sem Último animal", () => {
    expect(page).toContain("estadoAnimalAtualVenda");
    expect(page).toContain("Animal atual:");
    expect(page).toContain("Adicionado à venda");
    expect(page).toContain("Aguardando peso...");
    expect(page).toContain("Peso do embarque:");
    expect(page).toContain("balancaConectada");
    expect(page).not.toContain("Último animal");
    expect(page).not.toContain("ultimoBrincoRfid");
    expect(page).not.toContain("Animal ${draft.brinco} adicionado.");
    const incluir = page.slice(page.indexOf("const incluirPorRfid"), page.indexOf("const labelPrecoPadrao"));
    expect(incluir).toContain("setFocoPesoAnimalId(draft.animalId)");
    expect(incluir).not.toMatch(/confirmarMut|status:\s*"vendido"/);
  });

  it("AT05 na venda fica em leitura contínua — sem botão Ler RFID entre animais", () => {
    expect(page).toContain('mode="identificar"');
    expect(page).toContain("continuous");
    expect(page).toContain("Bastão conectado — aguardando próximo animal...");
    expect(page).toContain("incluirPorRfid");
    expect(page).not.toMatch(/Ler RFID/);
    expect(page).not.toContain("setUsarRfid");
    const incluir = page.slice(page.indexOf("const incluirPorRfid"), page.indexOf("const labelPrecoPadrao"));
    expect(incluir).not.toMatch(/confirmarMut|status:\s*"vendido"|animais\.update/);
    expect(incluir).toContain("itensRef.current");
  });

  it("leitura contínua do AT05 não exige clique e some ao desconectar/desmontar", () => {
    expect(at05Control).toContain('const escutaContinua = mode === "identificar" && continuous');
    expect(at05Control).toContain("if (!escutaContinua && !capturingRef.current) return");
    expect(at05Control).toContain("{!(mode === \"identificar\" && continuous) ? (");
    expect(at05Control).toContain("Desconectar");
    expect(at05Control).toContain("return bindReadHandler(applyRead)");
    expect(at05Hook).toContain("return pushAt05OnRead(handler)");
    expect(at05Hook).toContain("if (hookAliveCount === 0)");
  });

  it("preço e rendimento padrão não sobrescrevem exceção", () => {
    expect(page).toContain("aplicarPadraoEmLinhas");
    expect(page).toContain("precoManual");
    expect(page).toContain("rendimentoManual");
  });

  it("grade da Nova Venda segue a fila da lida, último embaixo", () => {
    expect(page).toContain("anexarItensVendaNaOrdemDaLida");
    expect(page).not.toContain("ordenarItensVendaPorBrinco");
  });

  it("R$/@ calcula na tela mas não grava sem migration", () => {
    expect(page).toContain("MSG_VENDA_ARROBA_REQUER_MIGRATION");
    expect(page).toContain("isFormaPrecificacaoVendaPersistivel");
    expect(page).toContain("arroba");
  });
});
