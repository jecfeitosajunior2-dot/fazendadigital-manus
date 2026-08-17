import { useCallback, useEffect, useRef, useState } from "react";
import {
  At05SerialService,
  type At05ReaderStatus,
  formatPortInfo,
  formatSerialError,
  isPortSelectionCancelled,
  isWebSerialAvailable,
  listAuthorizedSerialPorts,
  logWebSerialEnvironment,
} from "@/lib/hardware/at05Serial";

export type At05HistoryItem = {
  rfid: string;
  at: number;
};

const MAX_HISTORY = 10;
const MAX_LOGS = 120;

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

export function useAt05Reader() {
  const serviceRef = useRef<At05SerialService | null>(null);
  const [status, setStatus] = useState<At05ReaderStatus>("idle");
  const [lastRfid, setLastRfid] = useState<string | null>(null);
  const [history, setHistory] = useState<At05HistoryItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => isWebSerialAvailable());
  const [authorizedPorts, setAuthorizedPorts] = useState<SerialPort[]>([]);

  const pushLog = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setLogs(prev => [`[${stamp}] ${message}`, ...prev].slice(0, MAX_LOGS));
  }, []);

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new At05SerialService();
    }
    return serviceRef.current;
  }, []);

  const onRead = useCallback((rfid: string) => {
    setLastRfid(rfid);
    setHistory(prev => [{ rfid, at: Date.now() }, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const refreshAuthorizedPorts = useCallback(async () => {
    if (!isWebSerialAvailable()) {
      setAuthorizedPorts([]);
      return [];
    }
    try {
      const ports = await listAuthorizedSerialPorts();
      setAuthorizedPorts(ports);
      pushLog(`Portas previamente autorizadas: ${ports.length}`);
      ports.forEach((port, idx) => {
        pushLog(`  [${idx}] ${formatPortInfo(port.getInfo())}`);
      });
      return ports;
    } catch (err) {
      pushLog(`Erro em getPorts(): ${formatSerialError(err)}`);
      setAuthorizedPorts([]);
      return [];
    }
  }, [pushLog]);

  const beginReading = useCallback(
    (service: At05SerialService) => {
      pushLog("AT05 conectado — iniciando leitura contínua");
      void service
        .startReading(onRead, {
          onLog: pushLog,
          onStatus: setStatus,
          onDuplicate: rfid => {
            pushLog(`Duplicado recente ignorado na lista: ${rfid}`);
          },
        })
        .catch(err => {
          pushLog(`Erro no loop de leitura: ${formatSerialError(err)}`);
          setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
          setStatus("error");
        });
    },
    [onRead, pushLog],
  );

  const disconnect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      setStatus("disconnected");
      return;
    }
    try {
      await service.disconnect(pushLog);
    } finally {
      setStatus("disconnected");
      void refreshAuthorizedPorts();
    }
  }, [pushLog, refreshAuthorizedPorts]);

  /**
   * Handler do botão Conectar bastão.
   * Importante: `requestPort()` é chamado o mais cedo possível neste fluxo
   * (sem disconnect/await prévio que consuma o user gesture).
   */
  const connect = useCallback(async () => {
    if (!isWebSerialAvailable()) {
      setError(
        "Web Serial não está disponível neste navegador. Use Chrome ou Edge no desktop.",
      );
      setStatus("error");
      pushLog("Web Serial indisponível");
      return;
    }

    if (getService().isConnected()) {
      pushLog("Já conectado — use Desconectar antes de conectar de novo.");
      return;
    }

    setError(null);
    setStatus("connecting");
    logWebSerialEnvironment(pushLog);

    const service = getService();

    // 1) requestPort DIRETO — primeira await serial (preserva user gesture).
    let port: SerialPort;
    try {
      port = await service.requestPortFromUserGesture(pushLog);
    } catch (err) {
      if (isPortSelectionCancelled(err)) {
        pushLog("Seleção de porta cancelada (NotFoundError)");
        setStatus("disconnected");
        setError(null);
        void refreshAuthorizedPorts();
        return;
      }
      const detail = formatSerialError(err);
      pushLog(`Falha ao selecionar porta: ${detail}`);
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setStatus("error");
      void refreshAuthorizedPorts();
      return;
    }

    // 2) open separado — erros de open não se confundem com cancelamento.
    try {
      await service.openPort(port, pushLog);
      setStatus("connected");
      beginReading(service);
      void refreshAuthorizedPorts();
    } catch (err) {
      const detail = formatSerialError(err);
      pushLog(`Falha ao abrir porta: ${detail}`);
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setStatus("error");
      try {
        await service.disconnect(pushLog);
      } catch {
        /* ignore */
      }
      void refreshAuthorizedPorts();
    }
  }, [beginReading, getService, pushLog, refreshAuthorizedPorts]);

  /** Usa a primeira porta já autorizada (sem requestPort). */
  const connectAuthorized = useCallback(async () => {
    if (!isWebSerialAvailable()) {
      setError(
        "Web Serial não está disponível neste navegador. Use Chrome ou Edge no desktop.",
      );
      setStatus("error");
      return;
    }

    if (getService().isConnected()) {
      pushLog("Já conectado — use Desconectar antes.");
      return;
    }

    setError(null);
    setStatus("connecting");
    logWebSerialEnvironment(pushLog);

    const service = getService();
    let ports: SerialPort[];
    try {
      ports = await listAuthorizedSerialPorts();
      setAuthorizedPorts(ports);
      pushLog(`Portas previamente autorizadas: ${ports.length}`);
    } catch (err) {
      pushLog(`Erro em getPorts(): ${formatSerialError(err)}`);
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setStatus("error");
      return;
    }

    if (ports.length === 0) {
      pushLog("Nenhuma porta previamente autorizada. Use Conectar bastão.");
      setStatus("disconnected");
      setError(null);
      return;
    }

    const port = ports[0]!;
    pushLog(`Usando porta autorizada [0] · ${formatPortInfo(port.getInfo())}`);

    try {
      await service.openPort(port, pushLog);
      setStatus("connected");
      beginReading(service);
    } catch (err) {
      pushLog(`Falha ao abrir porta autorizada: ${formatSerialError(err)}`);
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setStatus("error");
      try {
        await service.disconnect(pushLog);
      } catch {
        /* ignore */
      }
    }
  }, [beginReading, getService, pushLog]);

  useEffect(() => {
    void refreshAuthorizedPorts();
  }, [refreshAuthorizedPorts]);

  useEffect(() => {
    return () => {
      void serviceRef.current?.disconnect();
    };
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastRfid(null);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const busy = status === "connecting" || status === "connected" || status === "listening";

  return {
    supported,
    status,
    statusLabel: statusLabelAt05(status),
    lastRfid,
    history,
    logs,
    error,
    busy,
    authorizedPortCount: authorizedPorts.length,
    connect,
    connectAuthorized,
    disconnect,
    refreshAuthorizedPorts,
    clearHistory,
    clearLogs,
  };
}
