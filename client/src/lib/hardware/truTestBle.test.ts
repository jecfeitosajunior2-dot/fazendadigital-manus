import { describe, expect, it } from "vitest";
import {
  BLE_UUID,
  BLE_UUID_LABEL,
  bluetoothUuidEquals,
  formatBleDec,
  formatBleHex,
  formatBleWeightNumber,
  normalizeBluetoothUuid,
  parseBatteryLevel,
  parseBleWeightMeasurement,
  parseWeightScaleFeature,
  truTestS3RequestOptions,
} from "./truTestBle";

function view(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe("truTestBle — identificação", () => {
  it("abre o seletor sem filters restritivos e sem prender ao número de série", () => {
    const opts = truTestS3RequestOptions();
    expect(opts.filters).toBeUndefined();
    expect(opts.acceptAllDevices).toBe(true);
    expect(JSON.stringify(opts)).not.toMatch(/namePrefix/);
    expect(opts.optionalServices).toContain(BLE_UUID.weightScaleService);
    expect(opts.optionalServices).toContain(BLE_UUID.batteryService);
    expect(opts.optionalServices).toContain(BLE_UUID.nordicUartService);
  });

  it("normaliza UUID curto do Weight Scale Service", () => {
    expect(normalizeBluetoothUuid(0x181d)).toBe(BLE_UUID_LABEL.weightScaleService);
    expect(bluetoothUuidEquals("0000181D-0000-1000-8000-00805F9B34FB", 0x181d)).toBe(true);
    expect(bluetoothUuidEquals(BLE_UUID_LABEL.weightMeasurement, 0x2a9d)).toBe(true);
  });
});

describe("parseBleWeightMeasurement", () => {
  it("interpreta 00 B0 04 como 60 kg (S3 de gado, não o 0,005 do SIG)", () => {
    const parsed = parseBleWeightMeasurement(view([0x00, 0xb0, 0x04]));
    expect(parsed.valid).toBe(true);
    expect(parsed.byteLength).toBe(3);
    expect(parsed.hex).toBe("00 B0 04");
    expect(parsed.flags?.imperial).toBe(false);
    expect(parsed.rawWeight).toBe(1200);
    expect(parsed.unit).toBe("kg");
    expect(parsed.weightKg).toBe(60);
    expect(parsed.weightInSourceUnit).toBe(60);
  });

  it("interpreta pacote SI 00 88 13 como 250,0 kg", () => {
    const parsed = parseBleWeightMeasurement(view([0x00, 0x88, 0x13]));
    expect(parsed.valid).toBe(true);
    expect(parsed.byteLength).toBe(3);
    expect(parsed.hex).toBe("00 88 13");
    expect(parsed.dec).toBe("0 136 19");
    expect(parsed.flags?.imperial).toBe(false);
    expect(parsed.rawWeight).toBe(5000);
    expect(parsed.unit).toBe("kg");
    expect(parsed.weightKg).toBe(250);
    expect(parsed.weightInSourceUnit).toBe(250);
  });

  it("interpreta 00 84 13 como 249,80 kg sem inventar COM", () => {
    const parsed = parseBleWeightMeasurement(view([0x00, 0x84, 0x13]));
    expect(parsed.valid).toBe(true);
    expect(parsed.hex).toBe("00 84 13");
    expect(parsed.rawWeight).toBe(4996);
    expect(parsed.weightKg).toBeCloseTo(249.8, 5);
  });

  it("não assume kg quando o flag é imperial", () => {
    const parsed = parseBleWeightMeasurement(view([0x01, 0xd8, 0xd6]));
    expect(parsed.valid).toBe(true);
    expect(parsed.flags?.imperial).toBe(true);
    expect(parsed.unit).toBe("lb");
    expect(parsed.rawWeight).toBe(55000);
    expect(parsed.weightInSourceUnit).toBeCloseTo(550, 5);
    expect(parsed.weightKg).toBeCloseTo(249.4758, 3);
  });

  it("rejeita 0xFFFF como medição inválida", () => {
    const parsed = parseBleWeightMeasurement(view([0x00, 0xff, 0xff]));
    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toMatch(/inválida/i);
    expect(parsed.rawWeight).toBe(0xffff);
    expect(parsed.weightKg).toBeNull();
  });

  it("não assume pacote de 3 bytes quando há timestamp", () => {
    const bytes = [
      0x02, 0x88, 0x13, 0xea, 0x07, 0x09, 0x10, 0x08, 0x20, 0x0f,
    ];
    const parsed = parseBleWeightMeasurement(view(bytes));
    expect(parsed.valid).toBe(true);
    expect(parsed.byteLength).toBe(10);
    expect(parsed.flags?.timestampPresent).toBe(true);
    expect(parsed.timestamp?.year).toBe(2026);
    expect(parsed.weightKg).toBe(250);
  });

  it("marca incompleto se a flag pede timestamp e o pacote é curto", () => {
    const parsed = parseBleWeightMeasurement(view([0x02, 0x50, 0xc3]));
    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toMatch(/timestamp/i);
    expect(parsed.weightKg).toBeNull();
  });

  it("desloca user ID e BMI sem perder o peso", () => {
    const bytes = [
      0x0c, 0x88, 0x13, 0x07, 0x2c, 0x01, 0xac, 0x06,
    ];
    const parsed = parseBleWeightMeasurement(view(bytes));
    expect(parsed.valid).toBe(true);
    expect(parsed.flags?.userIdPresent).toBe(true);
    expect(parsed.flags?.bmiHeightPresent).toBe(true);
    expect(parsed.userId).toBe(7);
    expect(parsed.bmi).toBe(30);
    expect(parsed.heightMeters).toBeCloseTo(1.708, 3);
    expect(parsed.weightKg).toBe(250);
  });

  it("rejeita pacote vazio ou só flags", () => {
    expect(parseBleWeightMeasurement(view([])).valid).toBe(false);
    expect(parseBleWeightMeasurement(view([0x00])).reason).toMatch(/incompleto/i);
  });
});

describe("formatadores e extras", () => {
  it("formata HEX e número em pt-BR", () => {
    expect(formatBleHex(new Uint8Array([0, 80, 195]))).toBe("00 50 C3");
    expect(formatBleDec(new Uint8Array([0, 80, 195]))).toBe("0 80 195");
    expect(formatBleWeightNumber(250)).toMatch(/250[,.]0/);
  });

  it("lê Weight Scale Feature sem quebrar se curto", () => {
    const parsed = parseWeightScaleFeature(view([0x07, 0x38, 0x00, 0x00]));
    expect(parsed.timeStampSupported).toBe(true);
    expect(parsed.multipleUsersSupported).toBe(true);
    expect(parsed.bmiSupported).toBe(true);
    expect(parsed.hex).toBe("07 38 00 00");
  });

  it("lê bateria 0–100", () => {
    expect(parseBatteryLevel(view([69]))).toBe(69);
    expect(parseBatteryLevel(view([140]))).toBeNull();
    expect(parseBatteryLevel(view([]))).toBeNull();
  });
});
