import { describe, expect, it } from "vitest";
import {
  extractKnownComLabel,
  filterLikelyAt05SerialPorts,
  filterLikelyScaleSerialPorts,
  linhaModeloComCom,
  mensagemErroAberturaAt05,
  mensagemErroAberturaBalanca,
  resolveAt05PortForConnect,
  resolveScalePortForConnect,
  rotuloPortaSerial,
  serialPortIdentityKey,
} from "./serialPortLabels";

function mockPort(info: SerialPortInfo): SerialPort {
  return { getInfo: () => info } as SerialPort;
}

describe("serialPortLabels", () => {
  it("nomeia USB como balança Tru-Test", () => {
    const port = mockPort({ usbVendorId: 0x1234, usbProductId: 0x5678 });
    const rotulo = rotuloPortaSerial(port);
    expect(rotulo.papelSugerido).toBe("balanca");
    expect(rotulo.nomeAmigavel).toBe("Tru-Test S3");
    expect(rotulo.comConhecida).toBeNull();
    expect(rotulo.nomeNoChrome).toContain("Virtual Serial");
    expect(serialPortIdentityKey(port)).toBe("usb:4660:22136");
  });

  it("nomeia porta sem USB id como bastão AT05", () => {
    const port = mockPort({});
    const rotulo = rotuloPortaSerial(port);
    expect(rotulo.papelSugerido).toBe("bastao");
    expect(rotulo.nomeAmigavel).toBe("AT05");
    expect(rotulo.comConhecida).toBeNull();
    expect(rotulo.nomeNoChrome).toContain("AT05");
  });

  it("separa candidatos de bastão e balança", () => {
    const scale = mockPort({ usbVendorId: 0x1234, usbProductId: 0x1 });
    const at05 = mockPort({});
    expect(filterLikelyAt05SerialPorts([scale, at05])).toEqual([at05]);
    expect(filterLikelyScaleSerialPorts([scale, at05])).toEqual([scale]);
  });

  it("não inventa COM e só mostra quando o texto já traz COMx", () => {
    expect(extractKnownComLabel("SPP Dev (COM5)")).toBe("COM5");
    expect(extractKnownComLabel("serial port")).toBeNull();
    expect(linhaModeloComCom("AT05", null)).toBe("AT05");
    expect(linhaModeloComCom("AT05", "COM5")).toBe("AT05 · COM5");
  });

  it("erro de porta ocupada é amigável", () => {
    expect(mensagemErroAberturaAt05("InvalidStateError: already open")).toContain(
      "outra aba ou aplicativo",
    );
    expect(mensagemErroAberturaBalanca("NetworkError: Failed to open serial port.")).toBe(
      "Não foi possível abrir a porta da Tru-Test S3.",
    );
    expect(mensagemErroAberturaBalanca("InvalidStateError: already open")).toContain(
      "outra aba ou aplicativo",
    );
  });

  it("reutiliza getPorts só quando existe um único candidato do equipamento", async () => {
    const at05 = mockPort({});
    const scale = mockPort({ usbVendorId: 0x1234, usbProductId: 0x1 });
    const requested = mockPort({});
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { serial: { getPorts: async () => [at05, scale] } },
    });
    try {
      await expect(resolveAt05PortForConnect(async () => requested)).resolves.toEqual({
        port: at05,
        source: "authorized",
      });
      await expect(resolveScalePortForConnect(async () => requested)).resolves.toEqual({
        port: scale,
        source: "authorized",
      });
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
    }
  });

  it("não escolhe porta automaticamente se houver zero ou vários candidatos", async () => {
    const a = mockPort({});
    const b = mockPort({});
    const requested = mockPort({});
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { serial: { getPorts: async () => [a, b] } },
    });
    try {
      await expect(resolveAt05PortForConnect(async () => requested)).resolves.toEqual({
        port: requested,
        source: "requested",
      });
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
    }
  });
});
