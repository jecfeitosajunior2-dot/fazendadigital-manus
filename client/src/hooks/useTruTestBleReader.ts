import { useCallback, useEffect, useRef, useState } from "react";
import { statusOperacionalEquipamento } from "@/lib/hardware/serialPortLabels";
import {
  connectTruTestS3Gatt,
  dataViewToBytes,
  disconnectTruTestS3,
  formatBleHex,
  formatSerialErrorDetail,
  friendlyBleS3Error,
  isWebBluetoothAvailable,
  parseBleWeightMeasurement,
  requestTruTestS3Device,
  startWeightMeasurementIndications,
  TruTestBleError,
} from "@/lib/hardware/truTestBle";

export type TruTestBleStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "error"
  | "disconnected";

export type UseTruTestBleReaderOptions = {
  /** Cada medição BLE válida (sem heurística de estabilidade). */
  onWeight?: (kg: number) => void;
};

type SharedBleSession = {
  device: BluetoothDevice | null;
  characteristic: BluetoothRemoteGATTCharacteristic | null;
  listener: EventListener | null;
  disconnectHandler: ((ev: Event) => void) | null;
  status: TruTestBleStatus;
  lastWeightKg: number | null;
  error: string | null;
  lost: boolean;
  deviceName: string | null;
  connectGen: number;
  shuttingDown: boolean;
};

let shared: SharedBleSession | null = null;
let hookAliveCount = 0;
let connectInFlight = false;
let sharedShutdownPromise: Promise<void> | null = null;
let pageHideHandlerBound = false;

const weightListeners = new Set<(kg: number) => void>();

function getShared(): SharedBleSession {
  if (!shared) {
    shared = {
      device: null,
      characteristic: null,
      listener: null,
      disconnectHandler: null,
      status: "idle",
      lastWeightKg: null,
      error: null,
      lost: false,
      deviceName: null,
      connectGen: 0,
      shuttingDown: false,
    };
  }
  return shared;
}

function setSharedStatus(next: TruTestBleStatus) {
  getShared().status = next;
}

function log(msg: string, extra?: unknown) {
  if (extra !== undefined) console.info(`[BLE S3] ${msg}`, extra);
  else console.info(`[BLE S3] ${msg}`);
}

function operationalBleError(err: unknown): string {
  if (err instanceof TruTestBleError) {
    if (err.code === "unavailable") {
      return "Bluetooth não disponível neste navegador. Use USB.";
    }
    if (err.code === "cancelled") return "";
    if (err.code === "indicate") return "Não foi possível iniciar a leitura de peso da Tru-Test S3.";
    if (err.code === "service" || err.code === "measurement") {
      return "Não foi possível iniciar a leitura de peso da Tru-Test S3.";
    }
    return "Não foi possível conectar à Tru-Test S3 via Bluetooth.";
  }
  const friendly = friendlyBleS3Error(err);
  if (friendly === "Seleção Bluetooth cancelada.") return "";
  return "Não foi possível conectar à Tru-Test S3 via Bluetooth.";
}

function deliverBleWeight(kg: number) {
  const s = getShared();
  if (s.shuttingDown) return;
  s.lastWeightKg = kg;
  weightListeners.forEach(fn => {
    try {
      fn(kg);
    } catch (err) {
      console.error("[BLE S3] onWeight threw", err);
    }
  });
}

function bindPageHideHandler() {
  if (pageHideHandlerBound || typeof window === "undefined") return;
  pageHideHandlerBound = true;
  window.addEventListener("pagehide", () => {
    void shutdownTruTestBleSharedSession("pagehide");
  });
}

function detachDisconnectHandler(s: SharedBleSession) {
  if (s.device && s.disconnectHandler) {
    s.device.removeEventListener("gattserverdisconnected", s.disconnectHandler);
  }
  s.disconnectHandler = null;
}

export async function shutdownTruTestBleSharedSession(reason: string): Promise<void> {
  if (sharedShutdownPromise) return sharedShutdownPromise;
  const s = getShared();
  const connected = Boolean(s.device?.gatt?.connected || s.characteristic);

  if (!connected && !s.shuttingDown) {
    connectInFlight = false;
    s.shuttingDown = false;
    setSharedStatus("disconnected");
    log(`SHUTDOWN NOOP reason=${reason}`);
    return;
  }

  sharedShutdownPromise = (async () => {
    s.shuttingDown = true;
    connectInFlight = false;
    log(`SHUTDOWN reason=${reason}`);
    detachDisconnectHandler(s);
    await disconnectTruTestS3(s.device, s.characteristic, s.listener);
    s.characteristic = null;
    s.listener = null;
    s.lost = false;
    s.error = null;
    s.shuttingDown = false;
    setSharedStatus("disconnected");
  })().finally(() => {
    sharedShutdownPromise = null;
  });

  return sharedShutdownPromise;
}

export function getTruTestBleSharedSnapshot() {
  const s = getShared();
  return {
    status: s.status,
    gattConnected: Boolean(s.device?.gatt?.connected),
    hasDevice: s.device != null,
    lastWeightKg: s.lastWeightKg,
  };
}

export function useTruTestBleReader(options: UseTruTestBleReaderOptions = {}) {
  const onWeightRef = useRef(options.onWeight);
  useEffect(() => {
    onWeightRef.current = options.onWeight;
  }, [options.onWeight]);

  const mountedRef = useRef(true);
  const [supported] = useState(() => isWebBluetoothAvailable());
  const [status, setStatus] = useState<TruTestBleStatus>(() => getShared().status);
  const [lastWeightKg, setLastWeightKg] = useState<number | null>(() => getShared().lastWeightKg);
  const [error, setError] = useState<string | null>(() => getShared().error);
  const [deviceName, setDeviceName] = useState<string | null>(() => getShared().deviceName);
  const [lost, setLost] = useState(() => getShared().lost);

  const syncStatus = useCallback((next: TruTestBleStatus) => {
    setSharedStatus(next);
    if (mountedRef.current) setStatus(next);
  }, []);

  const handleUnexpectedDisconnect = useCallback(() => {
    const s = getShared();
    s.characteristic = null;
    s.listener = null;
    s.lost = true;
    s.error = "Conexão Bluetooth com a Tru-Test S3 foi perdida.";
    setSharedStatus("disconnected");
    if (mountedRef.current) {
      setStatus("disconnected");
      setLost(true);
      setError(s.error);
    }
    log("disconnected (gattserverdisconnected)");
  }, []);

  const subscribeDevice = useCallback(
    async (device: BluetoothDevice) => {
      const s = getShared();
      detachDisconnectHandler(s);
      const onDisc = () => handleUnexpectedDisconnect();
      s.disconnectHandler = onDisc;
      device.addEventListener("gattserverdisconnected", onDisc);

      log("GATT connecting", device.name ?? "(sem nome)");
      const discovery = await connectTruTestS3Gatt(device);
      log("connected");
      log("181D found");
      log("2A9D found");
      if (discovery.feature) {
        log(`2A9E HEX=${discovery.feature.hex} res=${discovery.feature.weightResolutionLabel}`);
      }
      if (discovery.nusDetected) log("NUS detected (unused)");

      const listener: EventListener = ev => {
        const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
        const value = target?.value;
        if (!value) return;
        const parsed = parseBleWeightMeasurement(value);
        const hex = formatBleHex(dataViewToBytes(value));
        log(`weight event HEX=${hex}`, parsed.valid ? parsed.weightKg : parsed.reason);
        if (!parsed.valid || parsed.weightKg == null) return;
        deliverBleWeight(parsed.weightKg);
      };

      await startWeightMeasurementIndications(discovery.measurement!, listener);
      s.characteristic = discovery.measurement;
      s.listener = listener;
      s.lost = false;
      s.error = null;
      log("notifications active");
      bindPageHideHandler();
      syncStatus("listening");
      if (mountedRef.current) {
        setLost(false);
        setError(null);
      }
    },
    [handleUnexpectedDisconnect, syncStatus],
  );

  const connect = useCallback(async () => {
    if (!isWebBluetoothAvailable()) {
      const msg = "Bluetooth não disponível neste navegador. Use USB.";
      getShared().error = msg;
      if (mountedRef.current) setError(msg);
      syncStatus("error");
      return;
    }
    if (connectInFlight || getShared().shuttingDown) return;

    const s = getShared();
    if (s.device?.gatt?.connected && (s.status === "listening" || s.status === "connected")) {
      syncStatus("listening");
      return;
    }

    connectInFlight = true;
    s.connectGen += 1;
    s.lost = false;
    if (mountedRef.current) {
      setError(null);
      setLost(false);
    }
    syncStatus("connecting");

    try {
      const device = await requestTruTestS3Device();
      s.device = device;
      s.deviceName = device.name || "Tru-Test S3";
      if (mountedRef.current) setDeviceName(s.deviceName);
      log("DEVICE SELECTED", s.deviceName);
      await subscribeDevice(device);
    } catch (err) {
      log("ERROR", formatSerialErrorDetail(err));
      const msg = operationalBleError(err);
      if (!msg) {
        syncStatus(s.device?.gatt?.connected ? "listening" : "disconnected");
        if (mountedRef.current) setError(null);
        return;
      }
      s.error = msg;
      if (mountedRef.current) setError(msg);
      syncStatus("error");
    } finally {
      connectInFlight = false;
    }
  }, [subscribeDevice, syncStatus]);

  const reconnect = useCallback(async () => {
    const s = getShared();
    if (!s.device) {
      await connect();
      return;
    }
    if (connectInFlight || s.shuttingDown) return;
    if (s.device.gatt?.connected && (s.status === "listening" || s.status === "connected")) {
      syncStatus("listening");
      return;
    }

    connectInFlight = true;
    s.lost = false;
    if (mountedRef.current) {
      setError(null);
      setLost(false);
    }
    syncStatus("connecting");
    log("RECONNECT (device em memória)");
    try {
      await subscribeDevice(s.device);
    } catch (err) {
      log("ERROR", formatSerialErrorDetail(err));
      const msg = operationalBleError(err) || "Não foi possível conectar à Tru-Test S3 via Bluetooth.";
      s.error = msg;
      if (mountedRef.current) setError(msg);
      syncStatus("error");
    } finally {
      connectInFlight = false;
    }
  }, [connect, subscribeDevice, syncStatus]);

  const disconnect = useCallback(async () => {
    const s = getShared();
    s.lost = false;
    s.error = null;
    try {
      await shutdownTruTestBleSharedSession("manual");
    } finally {
      if (mountedRef.current) {
        setStatus(getShared().status);
        setLost(false);
        setError(null);
      }
    }
  }, []);

  useEffect(() => {
    const fn = (kg: number) => {
      onWeightRef.current?.(kg);
      if (mountedRef.current) setLastWeightKg(kg);
    };
    weightListeners.add(fn);
    return () => {
      weightListeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    hookAliveCount += 1;
    const s = getShared();
    setStatus(s.status);
    setDeviceName(s.deviceName);
    setLastWeightKg(s.lastWeightKg);
    setError(s.error);
    setLost(s.lost);

    return () => {
      mountedRef.current = false;
      hookAliveCount = Math.max(0, hookAliveCount - 1);
      if (hookAliveCount === 0) {
        void shutdownTruTestBleSharedSession("effect-cleanup");
      }
    };
  }, []);

  const busy =
    status === "connecting" || status === "connected" || status === "listening";

  return {
    supported,
    status,
    statusOperacional: statusOperacionalEquipamento(status, "f"),
    lastWeightKg,
    error,
    lost,
    deviceName,
    busy,
    sessionActive: busy,
    canReconnect: Boolean(deviceName) && !busy,
    equipamentoLinha: "Tru-Test S3",
    connect,
    reconnect,
    disconnect,
  };
}

export type TruTestBleReaderSession = ReturnType<typeof useTruTestBleReader>;
