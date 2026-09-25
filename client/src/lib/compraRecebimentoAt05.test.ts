import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aplicarRfidNoFormularioRecebimento,
  deveAplicarRfidRecebimentoCompra,
  proximoCicloCapturaRecebimento,
  rotuloStatusAt05Recebimento,
} from "./compraRecebimentoAt05";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/CompraRecebimentoPage.tsx"), "utf8");
const hook = readFileSync(resolve(here, "../hooks/useAt05Reader.ts"), "utf8");

describe("AT05 no recebimento da Compra — só preenche RFID", () => {
  it("leitura válida atualiza o campo RFID", () => {
    const ciclo = 1;
    const decisao = deveAplicarRfidRecebimentoCompra({
      rfid: "  RFID-MOCK-A  ",
      aceitandoLeituras: true,
      cicloAtual: ciclo,
      cicloDaLeitura: ciclo,
    });
    expect(decisao).toEqual({ aplicar: true, rfid: "RFID-MOCK-A" });
    expect(aplicarRfidNoFormularioRecebimento("", "RFID-MOCK-A")).toBe("RFID-MOCK-A");
  });

  it("leitura mais recente substitui o RFID atual, sem confirmar", () => {
    expect(aplicarRfidNoFormularioRecebimento("RFID-MOCK-A", "RFID-MOCK-B")).toBe("RFID-MOCK-B");
    const decisao = deveAplicarRfidRecebimentoCompra({
      rfid: "RFID-MOCK-B",
      aceitandoLeituras: true,
      cicloAtual: 2,
      cicloDaLeitura: 2,
    });
    expect(decisao.aplicar).toBe(true);
  });

  it("depois de confirmar, ciclo novo ignora leitura stale do animal anterior", () => {
    const cicloAntes = 3;
    const cicloDepois = proximoCicloCapturaRecebimento(cicloAntes);
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "RFID-MOCK-A",
        aceitandoLeituras: true,
        cicloAtual: cicloDepois,
        cicloDaLeitura: cicloAntes,
      }),
    ).toEqual({ aplicar: false, motivo: "ciclo_stale" });
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "RFID-MOCK-B",
        aceitandoLeituras: true,
        cicloAtual: cicloDepois,
        cicloDaLeitura: cicloDepois,
      }),
    ).toEqual({ aplicar: true, rfid: "RFID-MOCK-B" });
  });

  it("não aplica leitura sem formulário aberto ou durante a confirmação", () => {
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "RFID-MOCK-A",
        aceitandoLeituras: false,
        cicloAtual: 1,
        cicloDaLeitura: 1,
      }),
    ).toEqual({ aplicar: false, motivo: "nao_aceitando" });
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "   ",
        aceitandoLeituras: true,
        cicloAtual: 1,
        cicloDaLeitura: 1,
      }),
    ).toEqual({ aplicar: false, motivo: "rfid_vazio" });
  });

  it("status reflete conexão real, sem inventar equipamento", () => {
    expect(rotuloStatusAt05Recebimento({ sessionActive: false, connecting: false })).toBe("");
    expect(rotuloStatusAt05Recebimento({ sessionActive: false, connecting: true })).toBe(
      "AT05 conectando...",
    );
    expect(rotuloStatusAt05Recebimento({ sessionActive: true, connecting: false })).toBe(
      "AT05 conectado",
    );
  });

  it("tela reusa o hook, não confirma no bip e remove a captura no unmount", () => {
    expect(page).toContain("useAt05Reader({");
    expect(page).toContain("onRead: rfidLido => aplicarRfidLidoRef.current(rfidLido)");
    expect(page).toContain('variant="compact"');
    expect(page).toContain("continuous");
    expect(page).toContain('mode="identificar"');
    expect(page).toContain("onRfidRead={() => undefined}");
    expect(page).toContain("proximoCicloCapturaRecebimento");
    expect(page).not.toContain("Ler RFID");
    expect(page).not.toContain("receberAnimalCompra");
    expect(page).not.toContain("useScaleReader");
    expect(hook).toContain("return pushAt05OnRead(handler)");
    expect(hook).toContain("if (hookAliveCount === 0)");
  });
});
