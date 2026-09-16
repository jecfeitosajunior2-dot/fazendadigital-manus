/**
 * POC Web Bluetooth da Tru-Test S3.
 * Não usa Web Serial. Não grava pesagem. Não escreve no Nordic UART.
 */

export const TRUTEST_S3_NAME_PREFIX = "S3";

export const BLE_UUID = {
  batteryService: 0x180f,
  batteryLevel: 0x2a19,
  weightScaleService: 0x181d,
  weightMeasurement: 0x2a9d,
  weightScaleFeature: 0x2a9e,
  nordicUartService: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
} as const;

export const BLE_UUID_LABEL = {
  batteryService: "0000180f-0000-1000-8000-00805f9b34fb",
  weightScaleService: "0000181d-0000-1000-8000-00805f9b34fb",
  weightMeasurement: "00002a9d-0000-1000-8000-00805f9b34fb",
  weightScaleFeature: "00002a9e-0000-1000-8000-00805f9b34fb",
  nordicUartService: BLE_UUID.nordicUartService,
} as const;

const SIG_BASE = "-0000-1000-8000-00805f9b34fb";
const INVALID_WEIGHT_RAW = 0xffff;
const SI_KG_RESOLUTION = 0.005;
const IMPERIAL_LB_RESOLUTION = 0.01;
const LB_TO_KG = 0.45359237;

export type BleS3ErrorCode =
  | "unavailable"
  | "cancelled"
  | "gatt"
  | "service"
  | "measurement"
  | "indicate"
  | "disconnect";

export class TruTestBleError extends Error {
  readonly code: BleS3ErrorCode;
  readonly detail?: string;

  constructor(code: BleS3ErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "TruTestBleError";
    this.code = code;
    this.detail = detail;
  }
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.bluetooth);
}

export function isSecureWebContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export async function bluetoothAdapterAvailable(): Promise<boolean | null> {
  if (!isWebBluetoothAvailable()) return false;
  try {
    return await navigator.bluetooth!.getAvailability();
  } catch {
    return null;
  }
}

export function normalizeBluetoothUuid(uuid: string | number): string {
  if (typeof uuid === "number") {
    const hex = uuid.toString(16).padStart(4, "0");
    return `0000${hex}${SIG_BASE}`;
  }
  const raw = uuid.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(raw)) return `0000${raw}${SIG_BASE}`;
  return raw;
}

export function bluetoothUuidEquals(a: string | number, b: string | number): boolean {
  return normalizeBluetoothUuid(a) === normalizeBluetoothUuid(b);
}

/**
 * O Chrome só aplica namePrefix/services em `filters` ao que vem no anúncio BLE.
 * A S3 aparece no bluetooth-internals como "S3 120229", mas esse nome (e o 0x181D)
 * muitas vezes NÃO vão no advertising — o seletor fica vazio.
 * Por isso a POC usa acceptAllDevices + optionalServices, sem filters.
 * Não combinar namePrefix + services em filters: isso restringe ainda mais.
 */
export function truTestS3RequestOptions(): RequestDeviceOptions {
  return {
    acceptAllDevices: true,
    optionalServices: [
      BLE_UUID.batteryService,
      BLE_UUID.weightScaleService,
      BLE_UUID.nordicUartService,
    ],
  };
}

export function dataViewToBytes(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function formatBleHex(bytes: Uint8Array | readonly number[]): string {
  return Array.from(bytes)
    .map(b => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

export function formatBleDec(bytes: Uint8Array | readonly number[]): string {
  return Array.from(bytes).join(" ");
}

export function formatDiagClock(at = Date.now()): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function formatBleWeightNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export function formatSerialErrorDetail(err: unknown): string {
  if (err instanceof TruTestBleError) {
    return err.detail
      ? `${err.code} · ${err.message} · ${err.detail}`
      : `${err.code} · ${err.message}`;
  }
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

export function friendlyBleS3Error(err: unknown): string {
  if (err instanceof TruTestBleError) return err.message;
  if (err instanceof Error) {
    if (err.name === "NotFoundError") return "Seleção Bluetooth cancelada.";
    if (err.name === "SecurityError") {
      return "Este navegador não oferece suporte ao Bluetooth necessário para esta função.";
    }
    if (err.name === "NetworkError") return "Não foi possível conectar ao GATT da Tru-Test S3.";
    if (err.name === "NotSupportedError") {
      return "Este navegador não oferece suporte ao Bluetooth necessário para esta função.";
    }
  }
  return "Falha na conexão Bluetooth da Tru-Test S3.";
}

export type WeightMeasurementFlags = {
  imperial: boolean;
  timestampPresent: boolean;
  userIdPresent: boolean;
  bmiHeightPresent: boolean;
};

export type BleDateTimeFields = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
};

export type ParsedBleWeightMeasurement = {
  byteLength: number;
  hex: string;
  dec: string;
  flagsByte: number | null;
  flags: WeightMeasurementFlags | null;
  rawWeight: number | null;
  unit: "kg" | "lb" | null;
  weightInSourceUnit: number | null;
  weightKg: number | null;
  timestamp: BleDateTimeFields | null;
  userId: number | null;
  bmi: number | null;
  heightMeters: number | null;
  heightInches: number | null;
  valid: boolean;
  reason: string | null;
};

function emptyParsed(bytes: Uint8Array, reason: string): ParsedBleWeightMeasurement {
  return {
    byteLength: bytes.length,
    hex: formatBleHex(bytes),
    dec: formatBleDec(bytes),
    flagsByte: bytes.length > 0 ? bytes[0]! : null,
    flags: null,
    rawWeight: null,
    unit: null,
    weightInSourceUnit: null,
    weightKg: null,
    timestamp: null,
    userId: null,
    bmi: null,
    heightMeters: null,
    heightInches: null,
    valid: false,
    reason,
  };
}

function parseBleDateTime(view: DataView, offset: number): BleDateTimeFields {
  const year = view.getUint16(offset, true);
  const month = view.getUint8(offset + 2);
  const day = view.getUint8(offset + 3);
  const hours = view.getUint8(offset + 4);
  const minutes = view.getUint8(offset + 5);
  const seconds = view.getUint8(offset + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const label =
    year === 0
      ? "timestamp presente (ano não informado)"
      : `${pad(day)}/${pad(month)}/${year} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return { year, month, day, hours, minutes, seconds, label };
}

/**
 * Bluetooth SIG — Weight Measurement (0x2A9D).
 * Flags (1) + Weight uint16 LE (2) + opcionais conforme flags.
 * SI: raw × 0,005 kg. Imperial: raw × 0,01 lb.
 * 0xFFFF = medição inválida.
 */
export function parseBleWeightMeasurement(data: DataView): ParsedBleWeightMeasurement {
  const bytes = dataViewToBytes(data);
  if (bytes.length < 1) return emptyParsed(bytes, "pacote vazio");

  const flagsByte = data.getUint8(0);
  const flags: WeightMeasurementFlags = {
    imperial: (flagsByte & 0x01) !== 0,
    timestampPresent: (flagsByte & 0x02) !== 0,
    userIdPresent: (flagsByte & 0x04) !== 0,
    bmiHeightPresent: (flagsByte & 0x08) !== 0,
  };

  let offset = 1;
  if (data.byteLength < offset + 2) {
    return {
      ...emptyParsed(bytes, "pacote incompleto: faltam os 2 bytes de peso"),
      flagsByte,
      flags,
    };
  }

  const rawWeight = data.getUint16(offset, true);
  offset += 2;

  let timestamp: BleDateTimeFields | null = null;
  if (flags.timestampPresent) {
    if (data.byteLength < offset + 7) {
      return {
        ...emptyParsed(bytes, "pacote incompleto: flag de timestamp sem 7 bytes"),
        flagsByte,
        flags,
        rawWeight,
        unit: flags.imperial ? "lb" : "kg",
      };
    }
    timestamp = parseBleDateTime(data, offset);
    offset += 7;
  }

  let userId: number | null = null;
  if (flags.userIdPresent) {
    if (data.byteLength < offset + 1) {
      return {
        ...emptyParsed(bytes, "pacote incompleto: flag de user ID sem 1 byte"),
        flagsByte,
        flags,
        rawWeight,
        unit: flags.imperial ? "lb" : "kg",
        timestamp,
      };
    }
    userId = data.getUint8(offset);
    offset += 1;
  }

  let bmi: number | null = null;
  let heightMeters: number | null = null;
  let heightInches: number | null = null;
  if (flags.bmiHeightPresent) {
    if (data.byteLength < offset + 4) {
      return {
        ...emptyParsed(bytes, "pacote incompleto: flag de BMI/altura sem 4 bytes"),
        flagsByte,
        flags,
        rawWeight,
        unit: flags.imperial ? "lb" : "kg",
        timestamp,
        userId,
      };
    }
    const rawBmi = data.getUint16(offset, true);
    offset += 2;
    const rawHeight = data.getUint16(offset, true);
    bmi = Math.round(rawBmi * 0.1 * 10) / 10;
    if (flags.imperial) {
      heightInches = Math.round(rawHeight * 0.1 * 10) / 10;
    } else {
      heightMeters = Math.round(rawHeight * 0.001 * 1000) / 1000;
    }
  }

  const unit: "kg" | "lb" = flags.imperial ? "lb" : "kg";
  const base = {
    byteLength: bytes.length,
    hex: formatBleHex(bytes),
    dec: formatBleDec(bytes),
    flagsByte,
    flags,
    rawWeight,
    unit,
    weightInSourceUnit: null as number | null,
    weightKg: null as number | null,
    timestamp,
    userId,
    bmi,
    heightMeters,
    heightInches,
    valid: false,
    reason: null as string | null,
  };

  if (rawWeight === INVALID_WEIGHT_RAW) {
    return { ...base, reason: "medição inválida (0xFFFF)" };
  }

  if (flags.imperial) {
    const lb = rawWeight * IMPERIAL_LB_RESOLUTION;
    return {
      ...base,
      valid: true,
      weightInSourceUnit: lb,
      weightKg: lb * LB_TO_KG,
    };
  }

  const kg = rawWeight * SI_KG_RESOLUTION;
  return {
    ...base,
    valid: true,
    weightInSourceUnit: kg,
    weightKg: kg,
  };
}

const WEIGHT_RES_LABELS: Record<number, string> = {
  0: "não especificada",
  1: "0,5 kg ou 1 lb",
  2: "0,2 kg ou 0,5 lb",
  3: "0,1 kg ou 0,2 lb",
  4: "0,05 kg ou 0,1 lb",
  5: "0,02 kg ou 0,05 lb",
  6: "0,01 kg ou 0,02 lb",
  7: "0,005 kg ou 0,01 lb",
};

const HEIGHT_RES_LABELS: Record<number, string> = {
  0: "não especificada",
  1: "0,01 m ou 1 in",
  2: "0,005 m ou 0,5 in",
  3: "0,001 m ou 0,1 in",
};

export type ParsedWeightScaleFeature = {
  hex: string;
  dec: string;
  byteLength: number;
  timeStampSupported: boolean;
  multipleUsersSupported: boolean;
  bmiSupported: boolean;
  weightResolutionCode: number;
  weightResolutionLabel: string;
  heightResolutionCode: number;
  heightResolutionLabel: string;
};

export function parseWeightScaleFeature(data: DataView): ParsedWeightScaleFeature {
  const bytes = dataViewToBytes(data);
  let bits = 0;
  for (let i = 0; i < Math.min(4, data.byteLength); i++) {
    bits |= data.getUint8(i) << (8 * i);
  }
  const weightResolutionCode = (bits >> 3) & 0x0f;
  const heightResolutionCode = (bits >> 7) & 0x07;
  return {
    hex: formatBleHex(bytes),
    dec: formatBleDec(bytes),
    byteLength: bytes.length,
    timeStampSupported: (bits & 0x01) !== 0,
    multipleUsersSupported: (bits & 0x02) !== 0,
    bmiSupported: (bits & 0x04) !== 0,
    weightResolutionCode,
    weightResolutionLabel: WEIGHT_RES_LABELS[weightResolutionCode] ?? `código ${weightResolutionCode}`,
    heightResolutionCode,
    heightResolutionLabel: HEIGHT_RES_LABELS[heightResolutionCode] ?? `código ${heightResolutionCode}`,
  };
}

export function parseBatteryLevel(data: DataView): number | null {
  if (data.byteLength < 1) return null;
  const n = data.getUint8(0);
  return n >= 0 && n <= 100 ? n : null;
}

export async function requestTruTestS3Device(): Promise<BluetoothDevice> {
  if (!isWebBluetoothAvailable()) {
    throw new TruTestBleError(
      "unavailable",
      "Este navegador não oferece suporte ao Bluetooth necessário para esta função.",
    );
  }
  try {
    return await navigator.bluetooth!.requestDevice(truTestS3RequestOptions());
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") {
      throw new TruTestBleError("cancelled", "Seleção Bluetooth cancelada.", formatSerialErrorDetail(err));
    }
    if (err instanceof Error && (err.name === "SecurityError" || err.name === "NotSupportedError")) {
      throw new TruTestBleError(
        "unavailable",
        "Este navegador não oferece suporte ao Bluetooth necessário para esta função.",
        formatSerialErrorDetail(err),
      );
    }
    throw new TruTestBleError(
      "gatt",
      "Não foi possível selecionar a Tru-Test S3.",
      formatSerialErrorDetail(err),
    );
  }
}

export type TruTestBleDiscovery = {
  server: BluetoothRemoteGATTServer;
  serviceUuids: string[];
  weightService: BluetoothRemoteGATTService | null;
  measurement: BluetoothRemoteGATTCharacteristic | null;
  feature: ParsedWeightScaleFeature | null;
  featureError: string | null;
  batteryPercent: number | null;
  nusDetected: boolean;
};

async function listPrimaryServiceUuids(server: BluetoothRemoteGATTServer): Promise<string[]> {
  try {
    const services = await server.getPrimaryServices();
    return services.map(s => s.uuid.toLowerCase());
  } catch {
    return [];
  }
}

export async function connectTruTestS3Gatt(device: BluetoothDevice): Promise<TruTestBleDiscovery> {
  if (!device.gatt) {
    throw new TruTestBleError("gatt", "Não foi possível conectar ao GATT da Tru-Test S3.", "gatt ausente");
  }

  let server: BluetoothRemoteGATTServer;
  try {
    server = await device.gatt.connect();
  } catch (err) {
    throw new TruTestBleError(
      "gatt",
      "Não foi possível conectar ao GATT da Tru-Test S3.",
      formatSerialErrorDetail(err),
    );
  }

  const serviceUuids = await listPrimaryServiceUuids(server);
  const nusDetected =
    serviceUuids.some(uuid => bluetoothUuidEquals(uuid, BLE_UUID.nordicUartService)) ||
    (await server.getPrimaryService(BLE_UUID.nordicUartService).then(
      () => true,
      () => false,
    ));

  let weightService: BluetoothRemoteGATTService | null = null;
  try {
    weightService = await server.getPrimaryService(BLE_UUID.weightScaleService);
  } catch (err) {
    throw new TruTestBleError(
      "service",
      "Weight Scale Service (0x181D) não encontrado.",
      formatSerialErrorDetail(err),
    );
  }

  let measurement: BluetoothRemoteGATTCharacteristic | null = null;
  try {
    measurement = await weightService.getCharacteristic(BLE_UUID.weightMeasurement);
  } catch (err) {
    throw new TruTestBleError(
      "measurement",
      "Weight Measurement (0x2A9D) não encontrada.",
      formatSerialErrorDetail(err),
    );
  }

  let feature: ParsedWeightScaleFeature | null = null;
  let featureError: string | null = null;
  try {
    const featureChar = await weightService.getCharacteristic(BLE_UUID.weightScaleFeature);
    const view = await featureChar.readValue();
    feature = parseWeightScaleFeature(view);
  } catch (err) {
    featureError = formatSerialErrorDetail(err);
  }

  let batteryPercent: number | null = null;
  try {
    const batteryService = await server.getPrimaryService(BLE_UUID.batteryService);
    const batteryChar = await batteryService.getCharacteristic(BLE_UUID.batteryLevel);
    const view = await batteryChar.readValue();
    batteryPercent = parseBatteryLevel(view);
  } catch {
    batteryPercent = null;
  }

  return {
    server,
    serviceUuids,
    weightService,
    measurement,
    feature,
    featureError,
    batteryPercent,
    nusDetected,
  };
}

export async function startWeightMeasurementIndications(
  characteristic: BluetoothRemoteGATTCharacteristic,
  listener: EventListener,
): Promise<void> {
  characteristic.addEventListener("characteristicvaluechanged", listener);
  try {
    await characteristic.startNotifications();
  } catch (err) {
    characteristic.removeEventListener("characteristicvaluechanged", listener);
    throw new TruTestBleError(
      "indicate",
      "Não foi possível ativar as indicações de peso.",
      formatSerialErrorDetail(err),
    );
  }
}

export async function stopWeightMeasurementIndications(
  characteristic: BluetoothRemoteGATTCharacteristic | null,
  listener: EventListener | null,
): Promise<void> {
  if (!characteristic) return;
  if (listener) {
    characteristic.removeEventListener("characteristicvaluechanged", listener);
  }
  try {
    await characteristic.stopNotifications();
  } catch {
    /* já desconectada */
  }
}

export async function disconnectTruTestS3(
  device: BluetoothDevice | null,
  characteristic: BluetoothRemoteGATTCharacteristic | null,
  listener: EventListener | null,
): Promise<void> {
  await stopWeightMeasurementIndications(characteristic, listener);
  try {
    device?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
}
