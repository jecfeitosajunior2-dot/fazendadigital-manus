import { useCallback, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";

const FD_PRIMARY = "#4ECDC4";
const MAX_LOGS = 80;

function formatError(error: unknown): string[] {
  const err = error as Error;
  const lines = [
    `name=${err?.name ?? "(sem name)"}`,
    `message=${err?.message ?? "(sem message)"}`,
    `String(error)=${String(error)}`,
  ];
  if (err?.stack) lines.push(`stack: ${err.stack}`);
  return lines;
}

/**
 * POC temporária — etapa 2: requestPort() + port.open({ baudRate: 9600 }).
 * Sem leitura RFID. Objetivo: ver se o LED azul do AT05 acende.
 */
export default function DiagnosticoAt05Page() {
  const portRef = useRef<SerialPort | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState("Desconectado");
  const [portOpen, setPortOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const addLog = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setLogs(prev => [`[${stamp}] ${message}`, ...prev].slice(0, MAX_LOGS));
  }, []);

  const handleConnect = async () => {
    if (!("serial" in navigator) || !navigator.serial) {
      addLog("Clique em Conectar bastão");
      addLog("Erro: navigator.serial indisponível");
      setStatus("Web Serial indisponível");
      return;
    }

    if (portRef.current) {
      addLog("Já existe porta aberta — use Desconectar antes.");
      return;
    }

    setBusy(true);

    // Snapshot síncrono (sem setState) antes do seletor.
    const envSnapshot = [
      "Clique em Conectar bastão",
      `isSecureContext=${String(window.isSecureContext)}`,
      `location.origin=${location.origin}`,
      `document.hasFocus()=${String(document.hasFocus())}`,
      `userActivation.isActive=${String(navigator.userActivation?.isActive ?? "(n/a)")}`,
      "requestPort() — aguardando seleção manual (ex.: SPP Dev COM5)",
    ];

    let port: SerialPort;
    try {
      // 1) Seletor nativo — primeira operação serial deste clique.
      port = await navigator.serial.requestPort();
    } catch (error) {
      for (const line of envSnapshot) addLog(line);
      addLog("A) Erro / cancelamento em requestPort():");
      for (const line of formatError(error)) addLog(`  ${line}`);
      setStatus(`Erro requestPort: ${(error as Error)?.name ?? "desconhecido"}`);
      setBusy(false);
      return;
    }

    for (const line of envSnapshot) addLog(line);
    const info = port.getInfo();
    const infoText =
      info.usbVendorId != null || info.usbProductId != null
        ? `vendorId=${info.usbVendorId ?? "—"} productId=${info.usbProductId ?? "—"}`
        : "sem info USB (comum em SPP Bluetooth)";
    addLog(`Porta selecionada com sucesso · ${infoText}`);

    try {
      // 2) Abrir a MESMA instância retornada por requestPort().
      //    Somente baudRate nesta etapa — validar link Bluetooth / LED azul.
      addLog("Abrindo porta com port.open({ baudRate: 9600 })…");
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      setPortOpen(true);
      addLog("COM serial aberta em 9600 baud");
      setStatus("Porta aberta - aguardando teste do LED");
    } catch (error) {
      addLog("B) Erro durante port.open():");
      for (const line of formatError(error)) addLog(`  ${line}`);
      setStatus(`Erro open: ${(error as Error)?.name ?? "desconhecido"}`);
      portRef.current = null;
      setPortOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    const port = portRef.current;
    if (!port) {
      setStatus("Desconectado");
      setPortOpen(false);
      addLog("Nenhuma porta para fechar");
      return;
    }

    setBusy(true);
    try {
      await port.close();
      addLog("Porta fechada");
    } catch (error) {
      addLog("Erro ao fechar porta:");
      for (const line of formatError(error)) addLog(`  ${line}`);
    } finally {
      portRef.current = null;
      setPortOpen(false);
      setStatus("Desconectado");
      setBusy(false);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <AppLayout>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-0.5">
          Diagnóstico · POC temporária · etapa open()
        </p>
        <h1
          className="text-[20px] font-semibold text-gray-900"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Diagnóstico AT05
        </h1>
        <p className="text-[12px] text-gray-500 mt-1 max-w-2xl">
          Nesta etapa: <code className="text-[11px]">requestPort()</code> → seleção manual de{" "}
          <strong>SPP Dev (COM5)</strong> →{" "}
          <code className="text-[11px]">port.open({"{ baudRate: 9600 }"})</code>. Sem leitura RFID.
          Observe se o LED azul do AT05 acende.
        </p>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 p-5 space-y-5 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-gray-500 font-medium">Status</p>
            <p className="text-[14px] font-semibold text-gray-900 mt-0.5">{status}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy || portOpen}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px] disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Conectar bastão
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy || !portOpen}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-50"
            >
              Desconectar
            </button>
            <button
              type="button"
              onClick={clearLogs}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600 font-medium hover:bg-gray-50 min-h-[40px]"
            >
              Limpar log
            </button>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Log técnico
          </p>
          <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-900 px-3 py-2 font-mono text-[10px] text-gray-200 space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-gray-500">
                Sem eventos. Clique em Conectar bastão → escolha SPP Dev (COM5) → observe o LED.
              </p>
            ) : (
              logs.map((line, i) => (
                <p key={`${i}-${line.slice(0, 32)}`} className="break-all whitespace-pre-wrap">
                  {line}
                </p>
              ))
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Sucesso desta etapa: log “COM serial aberta em 9600 baud” + LED azul aceso no AT05.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
