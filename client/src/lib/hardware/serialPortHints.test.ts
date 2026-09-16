import { describe, expect, it } from "vitest";
import {
  describeSerialPortHint,
  filterLikelyAt05SerialPorts,
  isUsbWebSerialPort,
} from "./serialPortHints";

function mockPort(info: SerialPortInfo): SerialPort {
  return { getInfo: () => info } as SerialPort;
}

describe("serialPortHints", () => {
  it("identifica COM virtual USB (balança)", () => {
    const port = mockPort({ usbVendorId: 0x1234, usbProductId: 0x5678 });
    expect(isUsbWebSerialPort(port)).toBe(true);
    expect(describeSerialPortHint(port)).toContain("Tru-Test");
  });

  it("identifica porta sem USB id (bastão Bluetooth)", () => {
    const port = mockPort({});
    expect(isUsbWebSerialPort(port)).toBe(false);
    expect(describeSerialPortHint(port)).toContain("AT05");
  });

  it("filterLikelyAt05SerialPorts ignora COM USB da balança", () => {
    const scale = mockPort({ usbVendorId: 0x1234, usbProductId: 0x1 });
    const at05 = mockPort({});
    expect(filterLikelyAt05SerialPorts([scale, at05])).toEqual([at05]);
  });
});
