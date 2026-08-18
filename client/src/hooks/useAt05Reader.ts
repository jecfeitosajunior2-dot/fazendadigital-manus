import { useCallback, useEffect, useRef, useState } from "react";
import {
  At05SerialService,
  closeLingeringAuthorizedPorts,
  type At05ReaderStatus,
  formatSerialError,
  isPortSelectionCancelled,
  isSerialPortOpen,
  isWebSerialAvailable,
} from "@/lib/hardware/at05Serial";
import {
  createAt05OnlineRxProcessor,
  type At05OnlineMode,
} from "@/lib/hardware/at05ProtocolDiag";

export type UseAt05ReaderOptions = {
  /**
   * Chamado somente com IDENTIFICAÇÃO RFID (string; nunca Number).
   * Cartões de função / CONN / DISC / DESCONHECIDO NÃO disparam.
   * Não depende do estado observado CONECTADO/DESCONHECIDO.
   */
  onRead?: (rfid: string) => void;
};

export function statusLabelAt05(status: At05ReaderStatus): string {
  switch (status) {
    case "idle":
    case "disconnected":
      return "Desconectado";
    case "connecting":
      return "Conectando...";
    case "connected":
      return "AT05 conectado";
    case "listening":
      return "Aguardando leitura...";
    case "error":
      return "Erro na conexão";
    default:
      return "Desconectado";
  }
}

export function observedLinkLabelAt05(state: At05OnlineMode): string {
  switch (state) {
    case "CONECTADO":
      return "AT05 conectado";
    case "DESCONECTADO":
      return "AT05 desconectado";
    default:
      return "AT05 — estado desconhecido";
  }
}

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function log(msg: string, extra?: unknown) {
  if (extra !== undefined) {
    console.info(`[AT05 PROD] ${ts()} ${msg}`, extra);
  } else {
    console.info(`[AT05 PROD] ${ts()} ${msg}`);
  }
}

/**
 * Sessão serial fora do ciclo de vida React.
 * Proprietário único do reader por porta nesta sessão de módulo.
 * Ao sair da tela a porta DEVE ser liberada (não manter COM presa).
 */
type SharedAt05Session = {
  service: At05SerialService;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  rxLoopPromise: Promise<void> | null;
  stopReading: boolean;
  connectGen: number;
  status: At05ReaderStatus;
  observedLink: At05OnlineMode;
  /** true enquanto shutdown corre (idempotente). */
  shuttingDown: boolean;
};

let shared: SharedAt05Session | null = null;
/** Contagem de hooks montados (diagnóstico). Shutdown NÃO depende de delay. */
let hookAliveCount = 0;

/** Trava de módulo: impede 2× requestPort / open / reader entre remounts. */
let connectInFlight = false;

/** Shutdown em andamento — ownership no módulo (sobrevive ao unmount do React). */
let sharedShutdownPromise: Promise<void> | null = null;

/** Listener pagehide registrado enquanto há sessão (back/fechar aba). */
let pageHideHandlerBound = false;

function getShared(): SharedAt05Session {
  if (!shared) {
    shared = {
      service: new At05SerialService(),
      reader: null,
      rxLoopPromise: null,
      stopReading: false,
      connectGen: 0,
      status: "idle",
      observedLink: "DESCONHECIDO",
      shuttingDown: false,
    };
  }
  return shared;
}

function setSharedStatus(next: At05ReaderStatus) {
  getShared().status = next;
  log(`CONNECTION STATE -> ${next}`);
}

function bindPageHideHandler() {
  if (pageHideHandlerBound || typeof window === "undefined") return;
  pageHideHandlerBound = true;
  window.addEventListener("pagehide", () => {
    void shutdownAt05SharedSession("pagehide");
  });
}

/**
 * Encerra a sessão Web Serial de forma segura e idempotente.
 * Ownership no módulo: continua após unmount do componente React.
 * Ordem: stop → cancel(read pendente) → await loop → releaseLock → port.close → limpar refs.
 */
export async function shutdownAt05SharedSession(reason: string): Promise<void> {
  if (sharedShutdownPromise) {
    log(`SHUTDOWN JOIN reason=${reason}`);
    return sharedShutdownPromise;
  }

  const s = getShared();
  const hasWork =
    s.reader != null ||
    s.rxLoopPromise != null ||
    s.service.isConnected() ||
    (s.service.getPort() != null && isSerialPortOpen(s.service.getPort()!));

  if (!hasWork && !s.shuttingDown) {
    log(`SHUTDOWN NOOP reason=${reason}`);
    connectInFlight = false;
    s.stopReading = false;
    s.shuttingDown = false;
    setSharedStatus("disconnected");
    // Mesmo em noop: garantir que nenhuma porta autorizada ficou aberta órfã.
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
    log(`SHUTDOWN START reason=${reason}`);

    const reader = s.reader;
    const loop = s.rxLoopPromise;

    // 1) Cancela read() pendente (cenário “Aguardando leitura”).
    if (reader) {
      try {
        log("READER CANCEL");
        await reader.cancel();
      } catch (err) {
        // Cancelamento intencional — não é erro de UI.
        log("READER CANCEL (esperado em cleanup)", formatSerialError(err));
      }
    }

    // 2) Aguarda o loop terminar — o finally do loop faz releaseLock.
    if (loop) {
      await loop.catch(err => {
        log("RX LOOP ended during shutdown", formatSerialError(err));
      });
      if (s.rxLoopPromise === loop) s.rxLoopPromise = null;
    }

    // 3) Se o loop não limpou o reader, libera o lock aqui.
    if (s.reader) {
      try {
        log("RELEASE LOCK (shutdown)");
        s.reader.releaseLock();
      } catch (err) {
        log("RELEASE LOCK (ignorado)", formatSerialError(err));
      }
      s.reader = null;
    }

    // 4) Fecha a SerialPort (reader já liberado — não passar reader de novo).
    const port = s.service.getPort();
    if (port || s.service.isConnected()) {
      try {
        log("PORT CLOSE");
        await s.service.disconnect(undefined, null);
        log("PORT CLOSE OK");
      } catch (err) {
        console.error(`[AT05 PROD] ${ts()} PORT CLOSE error`, formatSerialError(err));
        try {
          await closeLingeringAuthorizedPorts();
        } catch (lingerErr) {
          console.error(
            `[AT05 PROD] ${ts()} lingering close failed`,
            formatSerialError(lingerErr),
          );
        }
        const still = s.service.getPort();
        if (still && isSerialPortOpen(still)) {
          setSharedStatus("error");
          s.shuttingDown = false;
          throw err instanceof Error ? err : new Error(formatSerialError(err));
        }
      }
    }

    // 5) Varredura residual (outra instância SerialPort da mesma COM).
    try {
      await closeLingeringAuthorizedPorts();
    } catch (err) {
      console.error(`[AT05 PROD] ${ts()} post-close lingering`, formatSerialError(err));
    }

    s.reader = null;
    s.rxLoopPromise = null;
    s.stopReading = false;
    s.observedLink = "DESCONHECIDO";
    s.shuttingDown = false;
    setSharedStatus("disconnected");
    log(`SHUTDOWN COMPLETE reason=${reason}`);
  })().finally(() => {
    sharedShutdownPromise = null;
  });

  return sharedShutdownPromise;
}

/** Expõe estado da sessão compartilhada (testes / diagnóstico). */
export function getAt05SharedSessionSnapshot() {
  const s = getShared();
  return {
    status: s.status,
    hasReader: s.reader != null,
    hasRxLoop: s.rxLoopPromise != null,
    stopReading: s.stopReading,
    shuttingDown: s.shuttingDown,
    serviceConnected: s.service.isConnected(),
    portOpen: s.service.getPort() != null && isSerialPortOpen(s.service.getPort()!),
  };
}

/**
 * Hook de produção AT05 — um reader por porta (sessão compartilhada no módulo).
 * Classificação somente via interpretAt05OnlineLine (sem parser paralelo).
 */
export function useAt05Reader(options: UseAt05ReaderOptions = {}) {
  const onReadRef = useRef(options.onRead);
  useEffect(() => {
    onReadRef.current = options.onRead;
  }, [options.onRead]);

  const mountedRef = useRef(true);
  const [status, setStatus] = useState<At05ReaderStatus>(() => getShared().status);
  const [observedLink, setObservedLink] = useState<At05OnlineMode>(
    () => getShared().observedLink,
  );
  const [lastRfid, setLastRfid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => isWebSerialAvailable());

  const syncStatus = useCallback((next: At05ReaderStatus) => {
    setSharedStatus(next);
    if (mountedRef.current) setStatus(next);
  }, []);

  const syncObservedLink = useCallback((next: At05OnlineMode) => {
    getShared().observedLink = next;
    if (mountedRef.current) setObservedLink(next);
    log(`OBSERVED LINK -> ${next}`);
  }, []);

  const deliverRfid = useCallback((rfid: string) => {
    const s = getShared();
    if (s.stopReading || s.shuttingDown) {
      log("ONREAD ignored — shutting down", rfid);
      return;
    }
    log("ONREAD (IDENTIFICAÇÃO RFID)", rfid);
    try {
      onReadRef.current?.(rfid);
    } catch (err) {
      console.error(`[AT05 PROD] ${ts()} ONREAD threw`, err);
    }
    if (mountedRef.current) setLastRfid(rfid);
  }, []);

  const startRxLoop = useCallback(
    async (port: SerialPort, connectGen: number) => {
      const s = getShared();
      if (!port.readable) {
        throw new Error("port.readable indisponível após open");
      }

      s.stopReading = false;
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let readCall = 0;

      const rxProcessor = createAt05OnlineRxProcessor({
        sameRfidDedupeMs: 250,
        onObservedLink: mode => {
          syncObservedLink(mode);
        },
        onIdentificationRfid: rfid => {
          deliverRfid(rfid);
        },
      });

      log("RX LOOP START");
      const reader = port.readable.getReader();
      s.reader = reader;
      log("READER CREATED");

      if (s.connectGen === connectGen && !s.shuttingDown) {
        syncStatus("listening");
        bindPageHideHandler();
      }

      try {
        while (!s.stopReading && !s.shuttingDown) {
          readCall += 1;
          log(`WAITING reader.read() (#${readCall})`);
          const { value, done } = await reader.read();
          if (done) {
            log("stream done=true");
            break;
          }
          if (value == null || value.byteLength === 0) continue;

          const chunk = decoder.decode(value, { stream: true });
          rxProcessor.pushChunk(chunk);
        }
      } finally {
        try {
          log("RELEASE LOCK");
          reader.releaseLock();
        } catch {
          /* ignore — já liberado / cancelado */
        }
        if (s.reader === reader) s.reader = null;
        rxProcessor.reset();
        log(`RX LOOP END (readCalls=${readCall})`);
      }
    },
    [deliverRfid, syncObservedLink, syncStatus],
  );

  const disconnect = useCallback(
    async (reason: string) => {
      try {
        await shutdownAt05SharedSession(reason);
        if (mountedRef.current) {
          setStatus(getShared().status);
          setObservedLink(getShared().observedLink);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setStatus("error");
          setError(formatSerialError(err));
        }
        throw err;
      }
    },
    [],
  );

  const connect = useCallback(async () => {
    log("CONNECT CLICK");
    log(
      `CONNECT GUARD inFlight=${String(connectInFlight)} shuttingDown=${String(getShared().shuttingDown)} status=${getShared().status}`,
    );

    if (!isWebSerialAvailable()) {
      if (mountedRef.current) {
        setError(
          "Web Serial não está disponível. Use Microsoft Edge (ou Chromium) no desktop.",
        );
        syncStatus("error");
      }
      return;
    }

    if (connectInFlight || getShared().shuttingDown) {
      log("CONNECT IGNORED — duplicidade (já conectando/cleanup)");
      if (sharedShutdownPromise) {
        await sharedShutdownPromise.catch(() => undefined);
      }
      return;
    }

    // Se um shutdown de unmount/menu ainda corre, aguardar antes de pedir porta.
    if (sharedShutdownPromise) {
      log("CONNECT waits in-flight shutdown");
      await sharedShutdownPromise.catch(() => undefined);
    }

    const s = getShared();
    const existing = s.service.getPort();
    if (
      existing &&
      isSerialPortOpen(existing) &&
      (s.status === "listening" || s.status === "connected") &&
      s.rxLoopPromise &&
      !s.stopReading &&
      !s.shuttingDown
    ) {
      log("CONNECT IGNORED — já conectado com porta/reader ativos");
      syncStatus("listening");
      return;
    }

    connectInFlight = true;
    const connectGen = ++s.connectGen;
    if (mountedRef.current) setError(null);
    syncStatus("connecting");

    log("REQUEST PORT START");
    let port: SerialPort;
    try {
      port = await s.service.requestPortFromUserGesture();
      log("REQUEST PORT OK");
    } catch (err) {
      connectInFlight = false;
      if (isPortSelectionCancelled(err)) {
        syncStatus("disconnected");
        if (mountedRef.current) setError(null);
        return;
      }
      if (mountedRef.current) {
        setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
      syncStatus("error");
      return;
    }

    if (s.connectGen !== connectGen) {
      log("CONNECT IGNORED — gen obsoleto após requestPort");
      connectInFlight = false;
      return;
    }

    // Após o gesto: liberar sessão residual + qualquer porta autorizada ainda aberta.
    // Necessário quando o unmount anterior não concluiu o close a tempo / ficou órfão.
    connectInFlight = false;
    try {
      await shutdownAt05SharedSession("pre-open-cleanup");
      await closeLingeringAuthorizedPorts();
    } catch (err) {
      if (mountedRef.current) setError(formatSerialError(err));
      syncStatus("error");
      return;
    }
    connectInFlight = true;
    if (s.connectGen !== connectGen) {
      connectInFlight = false;
      return;
    }

    const attemptId = `prod-open-${Date.now()}-gen${connectGen}`;
    const info = port.getInfo();
    console.info(`[AT05 PROD] BEFORE OPEN`, {
      timestamp: new Date().toISOString(),
      attemptId,
      connectGen,
      readable: port.readable != null,
      writable: port.writable != null,
      getInfo: {
        usbVendorId: info.usbVendorId ?? null,
        usbProductId: info.usbProductId ?? null,
      },
      status: s.status,
    });

    try {
      await s.service.openPort(port);
      console.info(`[AT05 PROD] OPEN OK`, {
        timestamp: new Date().toISOString(),
        attemptId,
        readable: port.readable != null,
        writable: port.writable != null,
      });
      log("PORT REF SET");

      if (s.connectGen !== connectGen || s.shuttingDown) {
        log("gen obsoleto / shutdown após open — disconnect");
        connectInFlight = false;
        await shutdownAt05SharedSession("stale-connect-after-open");
        return;
      }

      if (s.rxLoopPromise) {
        log("CONNECT IGNORED RX — loop já ativo");
        syncStatus("listening");
        connectInFlight = false;
        return;
      }

      syncStatus("connected");

      const loopPromise = startRxLoop(port, connectGen);
      s.rxLoopPromise = loopPromise;
      connectInFlight = false;

      void loopPromise
        .then(async () => {
          if (s.stopReading || s.shuttingDown) return;
          log("read loop ended without stop");
          await shutdownAt05SharedSession("read-loop-done");
          if (mountedRef.current) setStatus(getShared().status);
        })
        .catch(async err => {
          if (s.connectGen !== connectGen) return;
          if (s.stopReading || s.shuttingDown) return;
          console.error(`[AT05 PROD] ${ts()} RX LOOP error`, err);
          if (mountedRef.current) setError(formatSerialError(err));
          syncStatus("error");
          await shutdownAt05SharedSession("error");
          if (mountedRef.current) setStatus(getShared().status);
        });
    } catch (err) {
      const name = err instanceof Error ? err.name : "(unknown)";
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AT05 PROD] OPEN FAILED`, {
        timestamp: new Date().toISOString(),
        attemptId,
        name,
        message,
        readable: port.readable != null,
        writable: port.writable != null,
      });
      log("CLEANUP AFTER OPEN FAILURE");

      s.stopReading = true;
      s.reader = null;
      s.rxLoopPromise = null;
      s.service.clearPortAfterOpenFailure();

      if (isSerialPortOpen(port)) {
        try {
          log("PORT CLOSE (after open failure)");
          await port.close();
        } catch (closeErr) {
          console.error(
            `[AT05 PROD] ${ts()} close after open failure`,
            formatSerialError(closeErr),
          );
        }
      }
      log("PORT REF CLEARED");

      if (mountedRef.current) {
        setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
      syncStatus("error");
      connectInFlight = false;
    }
  }, [startRxLoop, syncStatus]);

  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;

  useEffect(() => {
    mountedRef.current = true;
    hookAliveCount += 1;
    log(`HOOK MOUNT (alive=${hookAliveCount})`);

    const s = getShared();

    // Se unmount anterior ainda está fechando a COM, não restaurar sessão fantasma.
    if (sharedShutdownPromise) {
      void sharedShutdownPromise.finally(() => {
        if (mountedRef.current) setStatus(getShared().status);
      });
    } else if (
      s.service.isConnected() &&
      s.service.getPort() &&
      isSerialPortOpen(s.service.getPort()!) &&
      s.rxLoopPromise &&
      !s.shuttingDown
    ) {
      const restore =
        s.status === "listening" || s.status === "connected" || s.status === "connecting"
          ? s.status
          : "listening";
      syncStatusRef.current(restore);
      log("restored live session after mount", { status: restore });
    } else if (mountedRef.current) {
      setStatus(s.status);
    }

    return () => {
      mountedRef.current = false;
      hookAliveCount = Math.max(0, hookAliveCount - 1);
      log(`HOOK UNMOUNT (alive=${hookAliveCount}) — shutdown imediato (sem delay)`);

      // Ownership no módulo: a Promise continua após o React desmontar o componente.
      // Não usar setTimeout — menu lateral / Voltar precisam liberar a COM de verdade.
      // Idempotente com Cancelar (já fechou → noop/join).
      void shutdownAt05SharedSession("effect-cleanup");
    };
  }, []);

  const busy =
    status === "connecting" || status === "connected" || status === "listening";

  const sessionActive = busy;

  return {
    supported,
    status,
    statusLabel: statusLabelAt05(status),
    observedLink,
    observedLinkLabel: observedLinkLabelAt05(observedLink),
    lastRfid,
    error,
    busy,
    sessionActive,
    isListening: status === "listening",
    connect,
    /** Aguardável — Cancelar/navegação devem await antes de sair. */
    disconnect: () => disconnect("manual"),
  };
}
