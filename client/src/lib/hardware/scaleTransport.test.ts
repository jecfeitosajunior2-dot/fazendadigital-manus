import { describe, expect, it } from "vitest";
import {
  ajudaScaleCard,
  defaultScaleTransportChoice,
  mensagemScaleJaConectada,
  subtituloScaleCard,
  textoPesoRecebidoBalanca,
} from "./scaleTransport";

describe("scaleTransport", () => {
  it("não inventa COM no Bluetooth e só mostra USB com COM conhecida", () => {
    expect(
      subtituloScaleCard({ connected: true, transport: "ble", usbCom: "COM7" }),
    ).toBe("Bluetooth");
    expect(subtituloScaleCard({ connected: true, transport: "usb", usbCom: "COM7" })).toBe(
      "USB · COM7",
    );
    expect(subtituloScaleCard({ connected: true, transport: "usb", usbCom: null })).toBe("USB");
    expect(subtituloScaleCard({ connected: false, transport: "usb", usbCom: "COM7" })).toBeNull();
  });

  it("prioriza Bluetooth quando o navegador tem Web Bluetooth", () => {
    expect(defaultScaleTransportChoice(true)).toBe("ble");
    expect(defaultScaleTransportChoice(false)).toBe("usb");
    expect(ajudaScaleCard({ connected: false, connecting: false, bleSupported: false })).toMatch(
      /Use USB/,
    );
  });

  it("explica troca sem misturar os dois transportes", () => {
    expect(mensagemScaleJaConectada("ble")).toMatch(/Bluetooth/);
    expect(mensagemScaleJaConectada("usb")).toMatch(/USB/);
    expect(textoPesoRecebidoBalanca("ble")).toMatch(/Bluetooth/);
  });
});
