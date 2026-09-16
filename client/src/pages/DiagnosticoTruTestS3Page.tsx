import { useCallback, useEffect, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import {
  BLE_UUID_LABEL,
  bluetoothAdapterAvailable,
  connectTruTestS3Gatt,
  dataViewToBytes,
  disconnectTruTestS3,
  formatBleDec,
  formatBleHex,
  formatBleWeightNumber,
  formatDiagClock,
  formatSerialErrorDetail,
  friendlyBleS3Error,
  isSecureWebContext,
  isWebBluetoothAvailable,
  parseBleWeightMeasurement,
  requestTruTestS3Device,
  startWeightMeasurementIndications,
  TRUTEST_S3_NAME_PREFIX,
  TruTestBleError,
  type ParsedBleWeightMeasurement,
  type ParsedWeightScaleFeature,
} from "@/lib/hardware/truTestBle";

const FD_PRIMARY = "#4ECDC4";
const MAX_LOGS = 250;
const MAX_HISTORY = 80;

type FoundState = "—" | "Encontrado" | "Não encontrado";
type ActiveState = "—" | "Ativa" | "Inativa";

type HistoryRow = {
  at: number;
  clock: string;
  hex: string;
  parsed: ParsedBleWeightMeasurement;
  intervalMs: number | null;
};

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-gray-100 last:border-0">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-[12px] font-semibold text-gray-900 text-right">{value}</span>
    </div>
  );
}

/**
 * POC isolada — Tru-Test S3 via Web Bluetooth / Weight Measurement 0x2A9D.
 * Não usa Web Serial. Não grava pesagem. Não altera a sessão do curral.
 */
export default function DiagnosticoTruTestS3Page() {
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const measurementRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const listenerRef = useRef<EventListener | null>(null);
  const lastEventAtRef = useRef<number | null>(null);
  const disconnectHandlerRef = useRef<((ev: Event) => void) | null>(null);

  const [bluetoothApi, setBluetoothApi] = useState(false);
  const [adapterOn, setAdapterOn] = useState<boolean | null>(null);
  const [secureContext, setSecureContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [gatt, setGatt] = useState<"Conectado" | "Desconectado">("Desconectado");
  const [weightService, setWeightService] = useState<FoundState>("—");
  const [weightMeasurement, setWeightMeasurement] = useState<FoundState>("—");
  const [indication, setIndication] = useState<ActiveState>("—");
  const [nusDetected, setNusDetected] = useState<FoundState>("—");
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [feature, setFeature] = useState<ParsedWeightScaleFeature | null>(null);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [status, setStatus] = useState("Desconectado");
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [lastParsed, setLastParsed] = useState<ParsedBleWeightMeasurement | null>(null);
  const [lastClock, setLastClock] = useState<string | null>(null);
  const [lastIntervalMs, setLastIntervalMs] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((line: string) => {
    const stamped = `[BLE S3] ${formatDiagClock()} ${line}`;
    setLogs(prev => {
      const next = [...prev, stamped];
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
  }, []);

  useEffect(() => {
    setBluetoothApi(isWebBluetoothAvailable());
    setSecureContext(isSecureWebContext());
    void bluetoothAdapterAvailable().then(setAdapterOn);
  }, []);

  const resetDiscoveryVisual = useCallback(() => {
    setWeightService("—");
    setWeightMeasurement("—");
    setIndication("—");
    setNusDetected("—");
    setBatteryPercent(null);
    setFeature(null);
    setFeatureError(null);
  }, []);

  const detachDevice = useCallback(() => {
    const device = deviceRef.current;
    const handler = disconnectHandlerRef.current;
    if (device && handler) {
      device.removeEventListener("gattserverdisconnected", handler);
    }
    disconnectHandlerRef.current = null;
  }, []);

  const handleUnexpectedDisconnect = useCallback(() => {
    setGatt("Desconectado");
    setIndication("Inativa");
    setStatus("Tru-Test S3 desconectada.");
    setFriendlyError("Tru-Test S3 desconectada.");
    addLog("GATT DISCONNECTED (evento gattserverdisconnected)");
    measurementRef.current = null;
    listenerRef.current = null;
  }, [addLog]);

  const bindDisconnect = useCallback(
    (device: BluetoothDevice) => {
      detachDevice();
      const handler = () => handleUnexpectedDisconnect();
      disconnectHandlerRef.current = handler;
      device.addEventListener("gattserverdisconnected", handler);
    },
    [detachDevice, handleUnexpectedDisconnect],
  );

  const onMeasurementValue: EventListener = useCallback(
    ev => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      const value = target?.value;
      if (!value) {
        addLog("VALUE vazio no characteristicvaluechanged");
        return;
      }
      const at = Date.now();
      const clock = formatDiagClock(at);
      const bytes = dataViewToBytes(value);
      const parsed = parseBleWeightMeasurement(value);
      const prevAt = lastEventAtRef.current;
      const intervalMs = prevAt == null ? null : at - prevAt;
      lastEventAtRef.current = at;

      addLog(`VALUE HEX=${formatBleHex(bytes)} DEC=${formatBleDec(bytes)} LEN=${bytes.length}`);
      if (parsed.valid && parsed.weightKg != null) {
        const unitLine =
          parsed.unit === "lb" && parsed.weightInSourceUnit != null
            ? `WEIGHT=${formatBleWeightNumber(parsed.weightInSourceUnit)} lb · ${formatBleWeightNumber(parsed.weightKg)} kg`
            : `WEIGHT=${formatBleWeightNumber(parsed.weightKg)} kg`;
        addLog(unitLine);
      } else {
        addLog(`PARSER ${parsed.reason ?? "inválido"}`);
      }

      setEventCount(n => n + 1);
      setLastParsed(parsed);
      setLastClock(clock);
      setLastIntervalMs(intervalMs);
      setHistory(prev => {
        const row: HistoryRow = { at, clock, hex: parsed.hex, parsed, intervalMs };
        const next = [row, ...prev];
        return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
      });
    },
    [addLog],
  );

  const subscribeAfterConnect = useCallback(
    async (device: BluetoothDevice) => {
      addLog(`GATT CONNECTING name=${device.name ?? "(sem nome)"}`);
      const discovery = await connectTruTestS3Gatt(device);
      setGatt("Conectado");
      addLog("GATT CONNECTED");
      if (discovery.serviceUuids.length) {
        addLog(`SERVICES ${discovery.serviceUuids.join(" | ")}`);
      }
      setNusDetected(discovery.nusDetected ? "Encontrado" : "Não encontrado");
      addLog(
        discovery.nusDetected
          ? `NUS DETECTED ${BLE_UUID_LABEL.nordicUartService} (não utilizado nesta POC)`
          : "NUS NÃO DETECTADO",
      );

      setWeightService("Encontrado");
      addLog(`SERVICE 181D FOUND ${BLE_UUID_LABEL.weightScaleService}`);
      setWeightMeasurement(discovery.measurement ? "Encontrado" : "Não encontrado");
      if (!discovery.measurement) {
        throw new Error("Weight Measurement (0x2A9D) não encontrada.");
      }
      addLog(`CHARACTERISTIC 2A9D FOUND ${BLE_UUID_LABEL.weightMeasurement}`);

      if (discovery.feature) {
        setFeature(discovery.feature);
        setFeatureError(null);
        addLog(
          `FEATURE 2A9E HEX=${discovery.feature.hex} ts=${discovery.feature.timeStampSupported} res=${discovery.feature.weightResolutionLabel}`,
        );
      } else {
        setFeature(null);
        setFeatureError(discovery.featureError);
        addLog(`FEATURE 2A9E FALHOU ${discovery.featureError ?? "sem detalhe"}`);
      }

      setBatteryPercent(discovery.batteryPercent);
      if (discovery.batteryPercent != null) {
        addLog(`BATTERY ${discovery.batteryPercent}%`);
      } else {
        addLog("BATTERY indisponível (não bloqueia peso)");
      }

      listenerRef.current = onMeasurementValue;
      measurementRef.current = discovery.measurement;
      await startWeightMeasurementIndications(discovery.measurement, onMeasurementValue);
      setIndication("Ativa");
      addLog("INDICATION LISTENER READY · startNotifications OK");
      setStatus("Conectado e aguardando medição.");
      setFriendlyError(null);
    },
    [addLog, onMeasurementValue],
  );

  const handleConnect = async () => {
    if (busy) return;
    setBusy(true);
    setFriendlyError(null);
    setStatus("Abrindo seletor Bluetooth...");
    addLog("REQUEST DEVICE (acceptAllDevices · sem filters · optionalServices 180F/181D/NUS)");
    try {
      const device = await requestTruTestS3Device();
      deviceRef.current = device;
      setDeviceName(device.name || "S3");
      addLog(`DEVICE SELECTED ${device.name || "(sem nome anunciado)"}`);
      if (device.name && !device.name.toUpperCase().startsWith(TRUTEST_S3_NAME_PREFIX)) {
        addLog(`AVISO nome="${device.name}" não começa com S3 — confirme se é a Tru-Test`);
      }
      bindDisconnect(device);
      setStatus("Conectando GATT...");
      await subscribeAfterConnect(device);
    } catch (err) {
      addLog(`ERROR ${formatSerialErrorDetail(err)}`);
      setFriendlyError(friendlyBleS3Error(err));
      setStatus("Erro de conexão");
      const connected = Boolean(deviceRef.current?.gatt?.connected);
      setGatt(connected ? "Conectado" : "Desconectado");
      if (err instanceof TruTestBleError && err.code === "service") {
        setWeightService("Não encontrado");
      } else if (err instanceof TruTestBleError && err.code === "measurement") {
        setWeightService("Encontrado");
        setWeightMeasurement("Não encontrado");
      } else if (err instanceof TruTestBleError && err.code === "indicate") {
        setWeightMeasurement("Encontrado");
        setIndication("Inativa");
      } else if (!connected) {
        resetDiscoveryVisual();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = async () => {
    const device = deviceRef.current;
    if (!device || busy) return;
    setBusy(true);
    setFriendlyError(null);
    setStatus("Reconectando...");
    addLog("RECONNECT (mesmo device em memória, sem novo seletor)");
    try {
      bindDisconnect(device);
      await subscribeAfterConnect(device);
    } catch (err) {
      addLog(`ERROR ${formatSerialErrorDetail(err)}`);
      setFriendlyError(friendlyBleS3Error(err));
      setStatus("Erro de conexão");
      setGatt(deviceRef.current?.gatt?.connected ? "Conectado" : "Desconectado");
      if (err instanceof TruTestBleError && err.code === "service") {
        setWeightService("Não encontrado");
      } else if (err instanceof TruTestBleError && err.code === "measurement") {
        setWeightService("Encontrado");
        setWeightMeasurement("Não encontrado");
      } else if (err instanceof TruTestBleError && err.code === "indicate") {
        setWeightMeasurement("Encontrado");
        setIndication("Inativa");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    addLog("DISCONNECT solicitado");
    try {
      await disconnectTruTestS3(deviceRef.current, measurementRef.current, listenerRef.current);
    } finally {
      measurementRef.current = null;
      listenerRef.current = null;
      setGatt("Desconectado");
      setIndication("Inativa");
      setStatus("Desconectado");
      setFriendlyError(null);
      setBusy(false);
    }
  };

  const clearLog = () => {
    setLogs([]);
    setHistory([]);
    setEventCount(0);
    setLastParsed(null);
    setLastClock(null);
    setLastIntervalMs(null);
    lastEventAtRef.current = null;
  };

  useEffect(() => {
    return () => {
      void disconnectTruTestS3(deviceRef.current, measurementRef.current, listenerRef.current);
      detachDevice();
    };
  }, [detachDevice]);

  const gattConnected = gatt === "Conectado";
  const canReconnect = Boolean(deviceName) && !gattConnected && !busy;
  const lastBytes = lastParsed ? lastParsed.hex.split(" ").length : 0;

  return (
    <AppLayout>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-0.5">
          Diagnóstico · POC temporária · Web Bluetooth BLE
        </p>
        <h1
          className="text-[20px] font-semibold text-gray-900"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Diagnóstico Tru-Test S3
        </h1>
        <p className="text-[12px] text-gray-500 mt-1 max-w-2xl">
          Conexão sem fio da balança pelo Bluetooth do navegador. Não usa cabo USB, não abre COM e
          não grava pesagem. A interpretação do peso só será considerada válida depois de comparar
          com o indicador da S3.
        </p>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 p-5 space-y-5 max-w-2xl">
        {!bluetoothApi ? (
          <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Este navegador não oferece suporte ao Bluetooth necessário para esta função. Use Chrome
            ou Edge no computador.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={busy || !bluetoothApi || gattConnected}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px] disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Conectar Tru-Test S3 via Bluetooth
          </button>
          <button
            type="button"
            onClick={() => void handleReconnect()}
            disabled={!canReconnect}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-[#4ECDC4] text-[12px] font-semibold text-gray-800 hover:bg-[#4ECDC4]/10 min-h-[40px] disabled:opacity-50"
          >
            Reconectar
          </button>
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={busy || !gattConnected}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-50"
          >
            Desconectar
          </button>
          <button
            type="button"
            onClick={clearLog}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600 font-medium hover:bg-gray-50 min-h-[40px]"
          >
            Limpar log
          </button>
        </div>
        <p className="text-[11px] text-gray-500 -mt-2">
          O seletor do Chrome pode listar outros Bluetooth. Escolha a Tru-Test (ex.: S3 120229).
        </p>

        <div>
          <p className="text-[11px] text-gray-500 font-medium">Status</p>
          <p className="text-[14px] font-semibold text-gray-900 mt-0.5">{status}</p>
          {friendlyError ? (
            <p className="text-[12px] text-red-600 mt-1">{friendlyError}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-100 px-3 py-2">
          <StatusRow
            label="Bluetooth disponível"
            value={
              !bluetoothApi ? "Não" : adapterOn === false ? "API sim · adaptador não" : "Sim"
            }
          />
          <StatusRow label="Contexto seguro" value={secureContext ? "Sim (localhost/HTTPS)" : "Não"} />
          <StatusRow label="Dispositivo selecionado" value={deviceName ?? "—"} />
          <StatusRow label="GATT" value={gatt} />
          <StatusRow label="Weight Scale Service" value={weightService} />
          <StatusRow label="Weight Measurement" value={weightMeasurement} />
          <StatusRow label="Indicação" value={indication} />
          <StatusRow label="Serviço NUS (não usado)" value={nusDetected} />
          <StatusRow
            label="Bateria S3"
            value={batteryPercent == null ? "—" : `${batteryPercent}%`}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">
            Peso recebido
          </p>
          {lastParsed?.valid && lastParsed.weightKg != null ? (
            <div className="mt-2">
              <p className="text-[28px] font-semibold text-gray-900 leading-none">
                {lastParsed.unit === "lb" && lastParsed.weightInSourceUnit != null
                  ? `${formatBleWeightNumber(lastParsed.weightInSourceUnit)} lb`
                  : `${formatBleWeightNumber(lastParsed.weightKg)} kg`}
              </p>
              {lastParsed.unit === "lb" ? (
                <p className="text-[13px] text-gray-600 mt-1">
                  Convertido: {formatBleWeightNumber(lastParsed.weightKg)} kg
                </p>
              ) : null}
              <p className="text-[11px] text-gray-500 mt-2">
                Raw: {lastParsed.rawWeight ?? "—"} · HEX: {lastParsed.hex}
              </p>
              <p className="text-[10px] text-amber-700 mt-1">
                Interpretação teórica do perfil Bluetooth — ainda sem validação com peso real na
                plataforma.
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-gray-500 mt-2">
              {indication === "Ativa" ? "Aguardando medição..." : "Nenhuma medição recebida."}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-100 px-4 py-3 space-y-1">
          <p className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide">
            Última medição BLE
          </p>
          <p className="text-[12px] text-gray-700">Horário: {lastClock ?? "—"}</p>
          <p className="text-[12px] text-gray-700">Bytes: {lastParsed ? lastBytes : "—"}</p>
          <p className="text-[12px] text-gray-700 font-mono">HEX: {lastParsed?.hex ?? "—"}</p>
          <p className="text-[12px] text-gray-700 font-mono">DEC: {lastParsed?.dec ?? "—"}</p>
          <p className="text-[12px] text-gray-700">
            Flags:{" "}
            {lastParsed?.flags
              ? `${lastParsed.flags.imperial ? "imperial (lb)" : "SI (kg)"}${
                  lastParsed.flags.timestampPresent ? " · timestamp" : ""
                }${lastParsed.flags.userIdPresent ? " · user ID" : ""}${
                  lastParsed.flags.bmiHeightPresent ? " · BMI/altura" : ""
                }`
              : "—"}
          </p>
          {lastParsed?.timestamp ? (
            <p className="text-[12px] text-gray-700">Timestamp: {lastParsed.timestamp.label}</p>
          ) : null}
          {lastParsed?.userId != null ? (
            <p className="text-[12px] text-gray-700">User ID: {lastParsed.userId}</p>
          ) : null}
          {lastParsed?.bmi != null ? (
            <p className="text-[12px] text-gray-700">BMI: {lastParsed.bmi}</p>
          ) : null}
          <p className="text-[12px] text-gray-700">Eventos recebidos: {eventCount}</p>
          <p className="text-[12px] text-gray-700">Último evento: {lastClock ?? "—"}</p>
          <p className="text-[12px] text-gray-700">
            Intervalo desde o evento anterior:{" "}
            {lastIntervalMs == null ? "—" : `${lastIntervalMs} ms`}
          </p>
          {lastParsed && !lastParsed.valid ? (
            <p className="text-[12px] text-red-600">Parser: {lastParsed.reason}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-100 px-4 py-3 space-y-1">
          <p className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide">
            Weight Scale Feature (0x2A9E)
          </p>
          {feature ? (
            <>
              <p className="text-[12px] font-mono text-gray-700">HEX: {feature.hex}</p>
              <p className="text-[12px] text-gray-700">
                Timestamp: {feature.timeStampSupported ? "sim" : "não"} · Multiuser:{" "}
                {feature.multipleUsersSupported ? "sim" : "não"} · BMI:{" "}
                {feature.bmiSupported ? "sim" : "não"}
              </p>
              <p className="text-[12px] text-gray-700">
                Resolução anunciada: {feature.weightResolutionLabel}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-gray-500">
              {featureError
                ? `Não lida — ${featureError}. A conexão de peso continua.`
                : "Ainda não lida."}
            </p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide mb-2">
            Histórico (somente memória)
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 max-h-40 overflow-auto">
            {history.length === 0 ? (
              <p className="text-[11px] text-gray-400">Nenhum evento ainda.</p>
            ) : (
              <ul className="space-y-1">
                {history.map(row => (
                  <li key={row.at} className="text-[11px] font-mono text-gray-700">
                    {row.clock} | {row.hex} |{" "}
                    {row.parsed.valid && row.parsed.weightKg != null
                      ? row.parsed.unit === "lb" && row.parsed.weightInSourceUnit != null
                        ? `${formatBleWeightNumber(row.parsed.weightInSourceUnit)} lb (${formatBleWeightNumber(row.parsed.weightKg)} kg)`
                        : `${formatBleWeightNumber(row.parsed.weightKg)} kg`
                      : row.parsed.reason ?? "inválido"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-gray-800 uppercase tracking-wide mb-2">
            Log técnico
          </p>
          <pre className="rounded-lg border border-gray-200 bg-slate-900 text-slate-100 text-[10px] leading-relaxed px-3 py-2 max-h-56 overflow-auto whitespace-pre-wrap">
            {logs.length ? logs.join("\n") : "Aguardando ação…"}
          </pre>
        </div>

        <p className="text-[10px] text-gray-400 leading-relaxed">
          Web Bluetooth exige contexto seguro (localhost em desenvolvimento; HTTPS em produção).
          Nordic UART é só detectado — nenhum comando é enviado. USB/COM da Tru-Test e o AT05 não
          passam por esta página.
        </p>
      </div>
    </AppLayout>
  );
}
