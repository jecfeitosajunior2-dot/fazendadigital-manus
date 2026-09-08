import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeLingeringAuthorizedPorts,
  formatSerialError,
  isPortSelectionCancelled,
  isSerialPortOpen,
  isWebSerialAvailable,
  safeCloseSerialSession,
} from "@/lib/hardware/at05Serial";
import {
  createScaleRxProcessor,
  createScaleStabilizer,
  type ScaleStabilizerOptions,
} from "@/lib/hardware/scaleProtocol";
import {
  getScalePreset,
  TRUTEST_S3_SCALE_PRESET,
  type ScaleBrandPreset,
  type ScaleBrandPresetId,
} from "@/lib/hardware/scalePresets";

export type ScaleReaderStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "error"
  | "disconnected";

export type UseScaleReaderOptions = {
  /** Peso estável (balança parada ou simulação). */
  onStableWeight?: (kg: number) => void;
  /** Preset de marca — padrão Tru-Test. */
  presetId?: ScaleBrandPresetId;
};

export function statusLabelScale(
  status: ScaleReaderStatus,
  preset: ScaleBrandPreset = TRUTEST_S3_SCALE_PRESET,
): string {
  switch (status) {
    case "idle":
    case "disconnected":
      return "Desconectada";
    case "connecting":
      return "Conectando...";
    case "connected":
      return "Balança conectada";
    case "listening":
      return preset.pollCommand
        ? `Aguardando peso (${preset.label})…`
        : "Aguardando peso...";
    case "error":
      return "Erro na conexão";
    default:
      return "Desconectada";
  }
}

type SharedScaleSession = {
  port: SerialPort | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  rxLoopPromise: Promise<void> | null;
  stopReading: boolean;
  connectGen: number;
  status: ScaleReaderStatus;
  shuttingDown: boolean;
  stabilizer: ReturnType<typeof createScaleStabilizer> | null;
  preset: ScaleBrandPreset;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollWriter: WritableStreamDefaultWriter<Uint8Array> | null;
};

let shared: SharedScaleSession | null = null;
let hookAliveCount = 0;
let connectInFlight = false;
let sharedShutdownPromise: Promise<void> | null = null;
let pageHideHandlerBound = false;

function getShared(): SharedScaleSession {
  if (!shared) {
    shared = {
      port: null,
      reader: null,
      rxLoopPromise: null,
      stopReading: false,
      connectGen: 0,
      status: "idle",
      shuttingDown: false,
      stabilizer: null,
      preset: TRUTEST_S3_SCALE_PRESET,
      pollTimer: null,
      pollWriter: null,
    };
  }
  return shared;
}

function setSharedStatus(next: ScaleReaderStatus) {
  getShared().status = next;
}

function bindPageHideHandler() {
  if (pageHideHandlerBound || typeof window === "undefined") return;
  pageHideHandlerBound = true;
  window.addEventListener("pagehide", () => {
    void shutdownScaleSharedSession("pagehide");
  });
}

function stopPollLoop(s: SharedScaleSession) {
  if (s.pollTimer) {
    clearInterval(s.pollTimer);
    s.pollTimer = null;
  }
  const writer = s.pollWriter;
  s.pollWriter = null;
  if (writer) {
    void writer.close().catch(() => undefined);
  }
}

export async function shutdownScaleSharedSession(reason: string): Promise<void> {
  if (sharedShutdownPromise) return sharedShutdownPromise;

  const s = getShared();
  const hasWork =
    s.reader != null ||
    s.rxLoopPromise != null ||
    (s.port != null && isSerialPortOpen(s.port));

  if (!hasWork && !s.shuttingDown) {
    connectInFlight = false;
    s.stopReading = false;
    s.shuttingDown = false;
    s.stabilizer?.reset();
    stopPollLoop(s);
    setSharedStatus("disconnected");
    try {
      await closeLingeringAuthorizedPorts();
    } catch {
      /* ignore */
    }
    return;
  }

  sharedShutdownPromise = (async () => {
    s.shuttingDown = true;
    s.stopReading = true;
    connectInFlight = false;

    const reader = s.reader;
    const loop = s.rxLoopPromise;
    const port = s.port;

    stopPollLoop(s);

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }

    if (loop) {
      await loop.catch(() => undefined);
      if (s.rxLoopPromise === loop) s.rxLoopPromise = null;
    }

    if (s.reader) {
      try {
        s.reader.releaseLock();
      } catch {
        /* ignore */
      }
      s.reader = null;
    }

    if (port) {
      try {
        await safeCloseSerialSession({ reader: null, port });
      } catch {
        try {
          await closeLingeringAuthorizedPorts();
        } catch {
          /* ignore */
        }
      }
    }

    s.port = null;
    s.rxLoopPromise = null;
    s.stopReading = false;
    s.stabilizer?.reset();
    s.shuttingDown = false;
    setSharedStatus("disconnected");
  })().finally(() => {
    sharedShutdownPromise = null;
  });

  return sharedShutdownPromise;
}

/** Simula peso estável sem hardware (teste / desenvolvimento). */
export function simulateScaleWeight(kg: number): void {
  const s = getShared();
  if (s.shuttingDown) return;
  s.stabilizer?.deliverImmediate(kg);
}

export function getScaleSharedSessionSnapshot() {
  const s = getShared();
  return {
    status: s.status,
    hasReader: s.reader != null,
    portOpen: s.port != null && isSerialPortOpen(s.port),
  };
}

export function useScaleReader(options: UseScaleReaderOptions = {}) {
  const onStableRef = useRef(options.onStableWeight);
  useEffect(() => {
    onStableRef.current = options.onStableWeight;
  }, [options.onStableWeight]);

  const mountedRef = useRef(true);
  const [status, setStatus] = useState<ScaleReaderStatus>(() => getShared().status);
  const [lastWeightKg, setLastWeightKg] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => isWebSerialAvailable());

  const syncStatus = useCallback((next: ScaleReaderStatus) => {
    setSharedStatus(next);
    if (mountedRef.current) setStatus(next);
  }, []);

  const ensureStabilizer = useCallback(() => {
    const s = getShared();
    if (s.stabilizer) return s.stabilizer;

    const stabilizerOpts: ScaleStabilizerOptions = {
      onStableWeight: kg => {
        if (s.shuttingDown || s.stopReading) return;
        try {
          onStableRef.current?.(kg);
        } catch (err) {
          console.error("[SCALE] onStableWeight threw", err);
        }
        if (mountedRef.current) setLastWeightKg(kg);
      },
    };
    s.stabilizer = createScaleStabilizer(stabilizerOpts);
    return s.stabilizer;
  }, []);

  const presetRef = useRef(getScalePreset(options.presetId ?? "trutest-s3"));

  const startPollLoop = useCallback((port: SerialPort) => {
    const s = getShared();
    const preset = s.preset;
    if (!preset.pollCommand || preset.pollIntervalMs <= 0 || !port.writable) return;

    stopPollLoop(s);
    const encoder = new TextEncoder();
    try {
      s.pollWriter = port.writable.getWriter();
    } catch {
      return;
    }

    const sendPoll = () => {
      if (s.stopReading || s.shuttingDown || !s.pollWriter) return;
      void s.pollWriter.write(encoder.encode(preset.pollCommand!)).catch(() => undefined);
    };

    sendPoll();
    s.pollTimer = setInterval(sendPoll, preset.pollIntervalMs);
  }, []);

  const startRxLoop = useCallback(
    async (port: SerialPort, connectGen: number) => {
      const s = getShared();
      if (!port.readable) throw new Error("port.readable indisponível após open");

      s.stopReading = false;
      const stabilizer = ensureStabilizer();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const rxProcessor = createScaleRxProcessor({
        onWeightCandidate: kg => stabilizer.pushCandidate(kg),
      });

      const reader = port.readable.getReader();
      s.reader = reader;

      if (s.connectGen === connectGen && !s.shuttingDown) {
        syncStatus("listening");
        bindPageHideHandler();
        startPollLoop(port);
      }

      try {
        while (!s.stopReading && !s.shuttingDown) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value == null || value.byteLength === 0) continue;
          rxProcessor.pushChunk(decoder.decode(value, { stream: true }));
        }
      } finally {
        stopPollLoop(s);
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
        if (s.reader === reader) s.reader = null;
        rxProcessor.reset();
        stabilizer.reset();
      }
    },
    [ensureStabilizer, startPollLoop, syncStatus],
  );

  const disconnect = useCallback(async () => {
    try {
      await shutdownScaleSharedSession("manual");
      if (mountedRef.current) {
        setStatus(getShared().status);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setStatus("error");
        setError(formatSerialError(err));
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!isWebSerialAvailable()) {
      if (mountedRef.current) {
        setError("Web Serial indisponível. Use Edge ou Chrome no desktop.");
        syncStatus("error");
      }
      return;
    }

    if (connectInFlight || getShared().shuttingDown) {
      if (sharedShutdownPromise) await sharedShutdownPromise.catch(() => undefined);
      return;
    }

    if (sharedShutdownPromise) {
      await sharedShutdownPromise.catch(() => undefined);
    }

    const s = getShared();
    if (
      s.port &&
      isSerialPortOpen(s.port) &&
      (s.status === "listening" || s.status === "connected") &&
      s.rxLoopPromise &&
      !s.stopReading
    ) {
      syncStatus("listening");
      return;
    }

    connectInFlight = true;
    const connectGen = ++s.connectGen;
    if (mountedRef.current) setError(null);
    syncStatus("connecting");
    ensureStabilizer();
    s.preset = presetRef.current;

    let port: SerialPort;
    try {
      port = await navigator.serial!.requestPort();
    } catch (err) {
      connectInFlight = false;
      if (isPortSelectionCancelled(err)) {
        syncStatus("disconnected");
        return;
      }
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
      syncStatus("error");
      return;
    }

    connectInFlight = false;
    try {
      await shutdownScaleSharedSession("pre-open-cleanup");
    } catch (err) {
      if (mountedRef.current) setError(formatSerialError(err));
      syncStatus("error");
      return;
    }
    connectInFlight = true;

    try {
      await port.open({
        baudRate: s.preset.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      s.port = port;
      syncStatus("connected");

      const loopPromise = startRxLoop(port, connectGen);
      s.rxLoopPromise = loopPromise;
      connectInFlight = false;

      void loopPromise
        .then(async () => {
          if (s.stopReading || s.shuttingDown) return;
          await shutdownScaleSharedSession("read-loop-done");
          if (mountedRef.current) setStatus(getShared().status);
        })
        .catch(async err => {
          if (s.connectGen !== connectGen || s.shuttingDown) return;
          if (mountedRef.current) setError(formatSerialError(err));
          syncStatus("error");
          await shutdownScaleSharedSession("error");
        });
    } catch (err) {
      s.port = null;
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
      syncStatus("error");
      connectInFlight = false;
    }
  }, [ensureStabilizer, startRxLoop, syncStatus]);

  useEffect(() => {
    mountedRef.current = true;
    hookAliveCount += 1;
    ensureStabilizer();

    return () => {
      mountedRef.current = false;
      hookAliveCount = Math.max(0, hookAliveCount - 1);
      if (hookAliveCount === 0) {
        void shutdownScaleSharedSession("effect-cleanup");
      }
    };
  }, [ensureStabilizer]);

  const busy =
    status === "connecting" || status === "connected" || status === "listening";

  return {
    supported,
    status,
    statusLabel: statusLabelScale(status, presetRef.current),
    preset: presetRef.current,
    lastWeightKg,
    error,
    busy,
    sessionActive: busy,
    connect,
    disconnect,
    simulateWeight: simulateScaleWeight,
  };
}
