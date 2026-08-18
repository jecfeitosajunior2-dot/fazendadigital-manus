import { useCallback, useEffect, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import {
  AT05_DEDUP_MS,
  enqueueAt05Cleanup,
  formatPortInfo,
  safeCloseSerialSession,
} from "@/lib/hardware/at05Serial";
import {
  appendOnlineEventHistory,
  appendRxCapture,
  appendSessionEvent,
  appendTxHistory,
  AT05_REPLAY_PLACEHOLDER,
  AT05_STRATEGY_PATHS,
  buildSessionExportObject,
  buildTxPayload,
  bytesToDec,
  bytesToHex,
  bytesToVisibleText,
  createAt05OnlineCrlfBuffer,
  downloadTextFile,
  emptyPhysicalChecklist,
  formatPhysicalLine,
  formatRxCaptureForCopy,
  formatSessionExportTxt,
  formatSignalsLine,
  interpretAt05OnlineLine,
  parseProtocolReplayScript,
  summarizeRxChunks,
  type At05OnlineInterpretedEvent,
  type At05OnlineMode,
  type At05PhysicalChecklist,
  type At05RxCaptureChunk,
  type At05SessionEvent,
  type At05TxHistoryEntry,
  type At05TxMode,
} from "@/lib/hardware/at05ProtocolDiag";

const FD_PRIMARY = "#4ECDC4";
const MAX_LOGS = 250;
const MAX_HISTORY = 10;

type HistoryItem = { rfid: string; at: number };

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

function formatInputSignals(signals: SerialInputSignals): string {
  return formatSignalsLine(signals);
}

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("pt-BR", { hour12: false });
}

/**
 * POC Diagnóstico AT05 — etapas separadas:
 * 1) Selecionar nova porta (só requestPort)
 * 2) Listar / usar porta já autorizada (getPorts)
 * 3) Abrir porta (open 9600 8N1)
 * 4) Ler RFID
 *
 * VALIDADO FISICAMENTE em 17/08/2026 (Edge + AnimalTAG AT05 via Bluetooth SPP / COM5):
 * requestPort → SPP Dev(COM5) → open(9600 8N1 none) → LED azul → getReader →
 * reader.read() recebe bytes → RFID string "963000400291061".
 * Neste teste NÃO foi necessário DTR/RTS nem TX. Não alterar o protocolo serial validado.
 */
export default function DiagnosticoAt05Page() {
  const selectedPortRef = useRef<SerialPort | null>(null);
  const openPortRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const stopReadingRef = useRef(false);
  const lastAcceptedRef = useRef<{ rfid: string; at: number } | null>(null);
  const selectLockRef = useRef(false);
  const selectSeqRef = useRef(0);

  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState("Desconectado");
  const [hasSelectedPort, setHasSelectedPort] = useState(false);
  const [portOpen, setPortOpen] = useState(false);
  const [authorizedCount, setAuthorizedCount] = useState(0);
  const [selectBusy, setSelectBusy] = useState(false);
  const [lastRfid, setLastRfid] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [txInput, setTxInput] = useState("0D 0A");
  const [txMode, setTxMode] = useState<At05TxMode>("HEX");
  const [txBusy, setTxBusy] = useState(false);
  const [txCallCount, setTxCallCount] = useState(0);
  const [txObserveRunning, setTxObserveRunning] = useState(false);
  const [txBrincoWaitRunning, setTxBrincoWaitRunning] = useState(false);
  const [txObserveResult, setTxObserveResult] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<At05TxHistoryEntry[]>([]);

  /** Captura de sessão + identificação de porta + checklist físico (Prompt 11). */
  const [portLabelManual, setPortLabelManual] = useState("");
  const [portInfoText, setPortInfoText] = useState("");
  const [selectionOrder, setSelectionOrder] = useState(0);
  const selectionOrderRef = useRef(0);
  const [sessionCapturing, setSessionCapturing] = useState(false);
  const sessionCapturingRef = useRef(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionEvents, setSessionEvents] = useState<At05SessionEvent[]>([]);
  const sessionEventsRef = useRef<At05SessionEvent[]>([]);
  const [physical, setPhysical] = useState<At05PhysicalChecklist>(emptyPhysicalChecklist);
  const [strategyPath, setStrategyPath] = useState<"A" | "B" | "indefinido">("indefinido");
  const [replayScript, setReplayScript] = useState(AT05_REPLAY_PLACEHOLDER);
  const [replayParseMsg, setReplayParseMsg] = useState<string | null>(null);

  /** Interpretação ONLINE (camada adicional — não substitui RX bruto). */
  const [onlineMode, setOnlineMode] = useState<At05OnlineMode>("DESCONHECIDO");
  const [lastOnlineEvent, setLastOnlineEvent] = useState<string>("—");
  const [lastOnlineRfid, setLastOnlineRfid] = useState<string>("—");
  const [lastOnlineFunctionCard, setLastOnlineFunctionCard] = useState<string>("—");
  const [lastOnlineProtocolMsg, setLastOnlineProtocolMsg] = useState<string>("—");
  const [onlineEventHistory, setOnlineEventHistory] = useState<At05OnlineInterpretedEvent[]>(
    [],
  );
  const onlineCrlfBufferRef = useRef(createAt05OnlineCrlfBuffer());

  /** POC — correspondência RFID → cadastro (somente leitura). */
  type AnimalLookupStatus = "idle" | "loading" | "found" | "not-found" | "error";
  type AnimalLookupMatch = {
    id: number;
    brinco: string | null;
    brincoEletronico: string | null;
    sexo: string;
    categoria: string | null;
    status: string | null;
    loteId: number | null;
    loteNome: string | null;
    fazendaId: number | null;
    fazendaNome: string | null;
  };
  const [animalLookupStatus, setAnimalLookupStatus] = useState<AnimalLookupStatus>("idle");
  const [lastAnimalLookupRfid, setLastAnimalLookupRfid] = useState<string | null>(null);
  const [matchedAnimal, setMatchedAnimal] = useState<AnimalLookupMatch | null>(null);
  const [animalLookupError, setAnimalLookupError] = useState<string | null>(null);
  const animalLookupSeqRef = useRef(0);
  const trpcUtils = trpc.useUtils();

  /** Painel protocolo — contadores e captura bruta (só POC). */
  const [readerActive, setReaderActive] = useState(false);
  const [rxByteCount, setRxByteCount] = useState(0);
  const [txByteCount, setTxByteCount] = useState(0);
  const [rxChunkCount, setRxChunkCount] = useState(0);
  const [lastRxAt, setLastRxAt] = useState<number | null>(null);
  const lastRxAtRef = useRef<number | null>(null);
  const [lastTxAt, setLastTxAt] = useState<number | null>(null);
  const [signalsSnap, setSignalsSnap] = useState<SerialInputSignals | null>(null);
  const [rxCapture, setRxCapture] = useState<At05RxCaptureChunk[]>([]);
  const [brincoTestRunning, setBrincoTestRunning] = useState(false);
  const [rxMonitorRunning, setRxMonitorRunning] = useState(false);
  const [readCallCount, setReadCallCount] = useState(0);
  const [readErrorCount, setReadErrorCount] = useState(0);
  const [lastChunkSummary, setLastChunkSummary] = useState<string>("—");
  type RxLoopUiState =
    | "não iniciado"
    | "iniciando"
    | "aguardando reader.read()"
    | "recebeu chunk"
    | "encerrado"
    | "erro";
  const [rxLoopState, setRxLoopState] = useState<RxLoopUiState>("não iniciado");
  const [readerExistsUi, setReaderExistsUi] = useState(false);
  const [readerLockedUi, setReaderLockedUi] = useState(false);
  const [stopRequestedUi, setStopRequestedUi] = useState(false);
  const [readerInstanceIdUi, setReaderInstanceIdUi] = useState<number | null>(null);
  const [testDeltaSummary, setTestDeltaSummary] = useState<string | null>(null);

  const rxByteCountRef = useRef(0);
  const rxChunkCountRef = useRef(0);
  const readCallCountRef = useRef(0);
  const readErrorCountRef = useRef(0);
  const readerInstanceSeqRef = useRef(0);
  const awaitResponseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brincoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rxMonitorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const txObserveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rxCaptureRef = useRef<At05RxCaptureChunk[]>([]);
  const txCallCountRef = useRef(0);
  const rxMonitorBaselineRef = useRef<{
    at: number;
    startReadCalls: number;
    startChunks: number;
    startBytes: number;
    startErrors: number;
    firstRxAt: number | null;
    lastRxAt: number | null;
  } | null>(null);
  const brincoBaselineRef = useRef<{
    at: number;
    rxBytes: number;
    rxChunks: number;
  } | null>(null);
  /** Espelho do port aberto — habilita sinais mesmo se state atrasar. */
  const portOpenAliveRef = useRef(false);

  const syncStopRequestedUi = () => {
    setStopRequestedUi(stopReadingRef.current);
  };

  const syncReadableLockUi = (port: SerialPort | null) => {
    setReaderLockedUi(Boolean(port?.readable?.locked));
  };

  const addLog = useCallback((message: string, selectId?: number) => {
    const stamp = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    const prefix =
      selectId != null && selectId > 0 ? `[SELECT #${selectId}] ` : "";
    setLogs(prev => [`[${stamp}] ${prefix}${message}`, ...prev].slice(0, MAX_LOGS));
  }, []);

  const logAt05 = useCallback(
    (
      channel: "CONNECT" | "OPEN" | "SIGNALS" | "TX" | "RX" | "TEST" | "ERROR",
      message: string,
    ) => {
      addLog(`[AT05][${channel}] ${message}`);
      console.info(`[AT05][${channel}] ${message}`);
      if (sessionCapturingRef.current) {
        const kind: At05SessionEvent["kind"] =
          channel === "RX"
            ? "rx"
            : channel === "TX"
              ? "tx"
              : channel === "SIGNALS"
                ? "signals"
                : channel === "ERROR"
                  ? "error"
                  : channel === "OPEN" || channel === "CONNECT"
                    ? "port"
                    : "state";
        const ev: At05SessionEvent = {
          at: Date.now(),
          kind,
          message: `[${channel}] ${message}`,
        };
        sessionEventsRef.current = appendSessionEvent(sessionEventsRef.current, ev);
        setSessionEvents(sessionEventsRef.current);
      }
    },
    [addLog],
  );

  const pushSession = useCallback(
    (kind: At05SessionEvent["kind"], message: string, detail?: Record<string, unknown>) => {
      if (!sessionCapturingRef.current) return;
      const ev: At05SessionEvent = { at: Date.now(), kind, message, detail };
      sessionEventsRef.current = appendSessionEvent(sessionEventsRef.current, ev);
      setSessionEvents(sessionEventsRef.current);
    },
    [],
  );

  const acceptRfid = useCallback(
    (rfid: string) => {
      const now = Date.now();
      const prev = lastAcceptedRef.current;
      if (prev && prev.rfid === rfid && now - prev.at < AT05_DEDUP_MS) {
        addLog(`leitura ignorada por duplicidade: ${rfid}`);
        return;
      }
      lastAcceptedRef.current = { rfid, at: now };
      setLastRfid(rfid);
      setHistory(h => [{ rfid, at: now }, ...h].slice(0, MAX_HISTORY));
      addLog(`RFID: ${rfid}`);
    },
    [addLog],
  );

  const runAnimalLookup = useCallback(
    async (rfid: string) => {
      const seq = ++animalLookupSeqRef.current;
      setLastAnimalLookupRfid(rfid);
      setAnimalLookupStatus("loading");
      setMatchedAnimal(null);
      setAnimalLookupError(null);
      logAt05("TEST", `consulta rebanho RFID=${rfid} (string exata)`);
      try {
        const animal = await trpcUtils.animais.getByBrincoEletronicoExact.fetch({
          brincoEletronico: rfid,
        });
        if (seq !== animalLookupSeqRef.current) return;
        if (animal) {
          const match: AnimalLookupMatch = {
            id: Number(animal.id),
            brinco: animal.brinco == null ? null : String(animal.brinco),
            brincoEletronico:
              animal.brincoEletronico == null ? null : String(animal.brincoEletronico),
            sexo: String(animal.sexo ?? ""),
            categoria: animal.categoria == null ? null : String(animal.categoria),
            status: animal.status == null ? null : String(animal.status),
            loteId: animal.loteId == null ? null : Number(animal.loteId),
            loteNome: animal.loteNome == null ? null : String(animal.loteNome),
            fazendaId: animal.fazendaId == null ? null : Number(animal.fazendaId),
            fazendaNome: animal.fazendaNome == null ? null : String(animal.fazendaNome),
          };
          setMatchedAnimal(match);
          setAnimalLookupStatus("found");
          logAt05(
            "TEST",
            `animal encontrado id=${match.id} brinco=${match.brinco ?? "—"} rfid=${match.brincoEletronico ?? rfid}`,
          );
        } else {
          setMatchedAnimal(null);
          setAnimalLookupStatus("not-found");
          logAt05("TEST", `RFID não encontrado no cadastro: ${rfid}`);
        }
      } catch (error) {
        if (seq !== animalLookupSeqRef.current) return;
        const err = error as Error;
        setMatchedAnimal(null);
        setAnimalLookupStatus("error");
        setAnimalLookupError(err?.message ?? String(error));
        logAt05("ERROR", `consulta rebanho falhou: ${err?.message ?? String(error)}`);
      }
    },
    [logAt05, trpcUtils],
  );

  const applyOnlineInterpretedEvent = useCallback(
    (ev: At05OnlineInterpretedEvent) => {
      setOnlineEventHistory(prev => appendOnlineEventHistory(prev, ev));
      setLastOnlineEvent(`${ev.tipo}: ${ev.summary}`);
      if (ev.onlineMode) {
        setOnlineMode(ev.onlineMode);
      }
      if (ev.tipo === "CONEXÃO") {
        setLastOnlineProtocolMsg(ev.line);
        if (ev.onlineMode === "CONECTADO") {
          setStatus(`AT05 conectado${ev.address ? ` · ${ev.address}` : ""}`);
        } else if (ev.onlineMode === "DESCONECTADO") {
          setStatus("AT05 desconectado");
        }
      } else if (ev.tipo === "CARTÃO DE FUNÇÃO" && ev.functionName && ev.rfid) {
        setLastOnlineFunctionCard(`${ev.functionName} · ${ev.rfid}`);
      } else if (ev.tipo === "IDENTIFICAÇÃO RFID" && ev.rfid) {
        setLastOnlineRfid(ev.rfid);
      } else if (ev.tipo === "DESCONHECIDO") {
        setLastOnlineProtocolMsg(ev.line);
      }
      logAt05("RX", `[ONLINE] ${ev.tipo} · ${ev.summary}`);
    },
    [logAt05],
  );

  const startReading = useCallback(
    async (port: SerialPort) => {
      setRxLoopState("iniciando");
      syncStopRequestedUi();
      logAt05("RX", `BEFORE getReader`);
      logAt05("RX", `port.readable=${String(Boolean(port.readable))}`);
      logAt05("RX", `readable.locked=${String(port.readable?.locked ?? "n/a")}`);
      syncReadableLockUi(port);

      if (!port.readable) {
        logAt05("RX", "ABORT: port.readable indisponível — loop não inicia");
        setRxLoopState("erro");
        setStatus("Erro: readable indisponível");
        return;
      }

      if (port.readable.locked) {
        logAt05(
          "RX",
          "ABORT: readable.locked=true — já existe reader; NÃO criar segundo getReader()",
        );
        setRxLoopState("erro");
        setStatus("Erro: readable já locked (evitar 2º reader)");
        return;
      }

      if (readerRef.current) {
        logAt05(
          "RX",
          "ABORT: readerRef já preenchido — recusando segundo reader na sessão",
        );
        setRxLoopState("erro");
        setStatus("Erro: reader já existe");
        return;
      }

      stopReadingRef.current = false;
      syncStopRequestedUi();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      // Buffer ONLINE CRLF — classificação única via interpretAt05OnlineLine.
      onlineCrlfBufferRef.current.reset();

      const instanceId = ++readerInstanceSeqRef.current;
      setReaderInstanceIdUi(instanceId);
      logAt05("RX", "AFTER getReader (chamando agora)");
      const reader = port.readable.getReader();
      readerRef.current = reader;
      setReaderExistsUi(true);
      setReaderActive(true);
      syncReadableLockUi(port);
      logAt05("RX", "reader created");
      logAt05("RX", `reader instance id=${instanceId}`);
      logAt05("RX", `readable.locked=${String(port.readable?.locked ?? "n/a")}`);
      setStatus("Aguardando leitura...");

      try {
        logAt05("RX", "LOOP ENTER");
        // Mantém o mesmo reader enquanto a porta estiver aberta e o diagnóstico ativo.
        while (port.readable && !stopReadingRef.current) {
          // Contador ANTES do await — se ficar pendente, UI mostra >= 1.
          readCallCountRef.current += 1;
          const callN = readCallCountRef.current;
          setReadCallCount(callN);
          setRxLoopState("aguardando reader.read()");
          logAt05("RX", `BEFORE reader.read #${callN}`);

          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await reader.read();
          } catch (readErr) {
            readErrorCountRef.current += 1;
            setReadErrorCount(readErrorCountRef.current);
            setRxLoopState("erro");
            const err = readErr as Error;
            logAt05("RX", "[ERROR] reader.read threw");
            logAt05("RX", `name=${err?.name ?? "?"}`);
            logAt05("RX", `message=${err?.message ?? String(readErr)}`);
            logAt05("RX", `stack=${err?.stack ?? "(sem stack)"}`);
            throw readErr;
          }

          const { value, done } = result;
          const at = Date.now();
          const length = value?.byteLength ?? 0;

          logAt05("RX", `AFTER reader.read #${callN}`);
          logAt05("RX", `done=${String(done)}`);
          logAt05("RX", `valueLength=${length}`);

          // ── [RX RAW] SEMPRE, antes de qualquer parser/decoder ────────────
          const hex = value && length > 0 ? bytesToHex(value) : "(vazio)";
          const dec = value && length > 0 ? bytesToDec(value) : "(vazio)";
          const ascii = value && length > 0 ? bytesToVisibleText(value) : "(vazio)";

          logAt05("RX", "[RX RAW]");
          logAt05("RX", `timestamp=${new Date(at).toISOString()}`);
          logAt05("RX", `done=${String(done)} length=${length} readCall=#${callN}`);
          logAt05("RX", `DEC=${dec}`);
          logAt05("RX", `HEX=${hex}`);
          logAt05("RX", `ASCII=${JSON.stringify(ascii)}`);

          if (done) {
            logAt05("RX", "stream done=true — encerrando loop (porta/stream fechou)");
            setRxLoopState("encerrado");
            break;
          }

          if (value == null) {
            setLastChunkSummary(`#${callN} value=null`);
            continue;
          }

          if (length > 0) {
            setRxLoopState("recebeu chunk");
            rxByteCountRef.current += length;
            rxChunkCountRef.current += 1;
            setRxByteCount(rxByteCountRef.current);
            setRxChunkCount(rxChunkCountRef.current);
            setLastRxAt(at);
            lastRxAtRef.current = at;
            setRxCapture(prev => {
              const next = appendRxCapture(prev, value, at);
              rxCaptureRef.current = next;
              return next;
            });
            setLastChunkSummary(
              `#${callN} ${length}B HEX=${hex.slice(0, 48)}${hex.length > 48 ? "…" : ""}`,
            );

            const mon = rxMonitorBaselineRef.current;
            if (mon) {
              if (mon.firstRxAt == null) mon.firstRxAt = at;
              mon.lastRxAt = at;
            }
          } else {
            setLastChunkSummary(`#${callN} length=0`);
          }

          // Decodifica após RX bruto; classificação única decide o estado legado.
          const utfChunk = decoder.decode(value, { stream: true });

          if (utfChunk) {
            for (const line of onlineCrlfBufferRef.current.push(utfChunk)) {
              const interpreted = interpretAt05OnlineLine(line, at);
              applyOnlineInterpretedEvent(interpreted);
              // Estado legado + consulta rebanho só para IDENTIFICAÇÃO RFID.
              if (interpreted.tipo === "IDENTIFICAÇÃO RFID" && interpreted.rfid) {
                acceptRfid(interpreted.rfid);
                void runAnimalLookup(interpreted.rfid);
              }
            }
          }
        }

        if (stopReadingRef.current) {
          setRxLoopState("encerrado");
          logAt05("RX", "LOOP EXIT por stopRequested");
        } else {
          setRxLoopState("encerrado");
          logAt05("RX", "LOOP EXIT (readable falso ou fim natural)");
        }
      } catch (error) {
        setRxLoopState("erro");
        if (!stopReadingRef.current) {
          logAt05("ERROR", "erro no loop de leitura");
          for (const line of formatError(error)) addLog(`  ${line}`);
          setStatus(`Erro leitura: ${(error as Error)?.name ?? "desconhecido"}`);
        } else {
          addLog("leitura interrompida (stop / disconnect)");
        }
      } finally {
        // Só libera lock ao sair do diagnóstico (disconnect/stop), não após cada chunk.
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
        if (readerRef.current === reader) readerRef.current = null;
        setReaderExistsUi(false);
        setReaderActive(false);
        syncReadableLockUi(port);
        syncStopRequestedUi();
        logAt05(
          "RX",
          `loop encerrado · instance=${instanceId} readCalls=${readCallCountRef.current} chunks=${rxChunkCountRef.current} bytes=${rxByteCountRef.current} errors=${readErrorCountRef.current}`,
        );
        setRxLoopState(prev => (prev === "erro" ? prev : "encerrado"));
      }
    },
    [acceptRfid, addLog, applyOnlineInterpretedEvent, logAt05, runAnimalLookup],
  );

  /** Etapa 1 — SOMENTE requestPort(). Não abre a porta. */
  const handleSelectNewPort = async () => {
    if (selectLockRef.current) {
      addLog("SELECT ignorado: seleção já em andamento");
      return;
    }
    if (portOpen) {
      addLog("Feche a porta (Desconectar) antes de selecionar outra.");
      return;
    }
    if (!("serial" in navigator) || !navigator.serial) {
      addLog("navigator.serial indisponível");
      setStatus("Web Serial indisponível");
      return;
    }

    selectLockRef.current = true;
    selectSeqRef.current += 1;
    const selectId = selectSeqRef.current;
    setSelectBusy(true);
    setStatus("Selecionando porta...");

    addLog("clique em Selecionar nova porta", selectId);
    addLog(
      `isSecureContext=${window.isSecureContext} · origin=${location.origin} · hasFocus=${document.hasFocus()} · userActivation.isActive=${String(navigator.userActivation?.isActive ?? "(n/a)")}`,
      selectId,
    );

    try {
      addLog("chamando requestPort() UMA vez (sem filters) — NÃO vai abrir a porta", selectId);
      const port = await navigator.serial.requestPort();
      selectedPortRef.current = port;
      setHasSelectedPort(true);
      selectionOrderRef.current += 1;
      setSelectionOrder(selectionOrderRef.current);
      const info = formatPortInfo(port.getInfo());
      setPortInfoText(info);
      addLog("requestPort retornou SerialPort — autorização OK", selectId);
      addLog(`port info: ${info}`, selectId);
      addLog(`selectionOrder=#${selectionOrderRef.current}`, selectId);
      pushSession("port", `selecionada nova · order=#${selectionOrderRef.current} · ${info}`, {
        selectionOrder: selectionOrderRef.current,
        portInfo: info,
        portLabel: portLabelManual || null,
      });
      setStatus("Porta selecionada (ainda fechada)");
      addLog("PRÓXIMO PASSO: clique em Abrir porta (9600)", selectId);
    } catch (error) {
      addLog("A) falha em requestPort():", selectId);
      for (const line of formatError(error)) addLog(`  ${line}`, selectId);
      setStatus(`Erro requestPort: ${(error as Error)?.name ?? "desconhecido"}`);
    } finally {
      selectLockRef.current = false;
      setSelectBusy(false);
    }
  };

  /** Lista portas já autorizadas pelo Edge (sem seletor). */
  const handleListAuthorized = async () => {
    if (!("serial" in navigator) || !navigator.serial) {
      addLog("navigator.serial indisponível");
      return;
    }
    try {
      addLog("chamando navigator.serial.getPorts()…");
      const ports = await navigator.serial.getPorts();
      setAuthorizedCount(ports.length);
      addLog(`Portas previamente autorizadas: ${ports.length}`);
      ports.forEach((port, idx) => {
        addLog(`  [${idx}] ${formatPortInfo(port.getInfo())}`);
      });
      if (ports.length === 0) {
        addLog("Nenhuma porta autorizada. Use Selecionar nova porta.");
      }
    } catch (error) {
      addLog("Erro em getPorts():");
      for (const line of formatError(error)) addLog(`  ${line}`);
    }
  };

  /**
   * Usa a 1ª porta de getPorts() como selecionada (sem requestPort).
   * Não abre ainda.
   */
  const handleUseAuthorized = async () => {
    if (portOpen) {
      addLog("Feche a porta antes de trocar a seleção.");
      return;
    }
    if (!("serial" in navigator) || !navigator.serial) {
      addLog("navigator.serial indisponível");
      return;
    }
    try {
      addLog("getPorts() para reutilizar autorização…");
      const ports = await navigator.serial.getPorts();
      setAuthorizedCount(ports.length);
      addLog(`Portas previamente autorizadas: ${ports.length}`);
      if (ports.length === 0) {
        addLog("Nenhuma porta autorizada. Use Selecionar nova porta primeiro.");
        setStatus("Sem porta autorizada");
        return;
      }
      const port = ports[0]!;
      selectedPortRef.current = port;
      setHasSelectedPort(true);
      selectionOrderRef.current += 1;
      setSelectionOrder(selectionOrderRef.current);
      const info = formatPortInfo(port.getInfo());
      setPortInfoText(info);
      addLog(`Usando porta autorizada [0]: ${info}`);
      addLog(`selectionOrder=#${selectionOrderRef.current}`);
      pushSession("port", `autorizada [0] · order=#${selectionOrderRef.current} · ${info}`, {
        selectionOrder: selectionOrderRef.current,
        portInfo: info,
        portLabel: portLabelManual || null,
      });
      setStatus("Porta autorizada selecionada (ainda fechada)");
      addLog("PRÓXIMO PASSO: clique em Abrir porta (9600)");
    } catch (error) {
      addLog("Erro ao usar porta autorizada:");
      for (const line of formatError(error)) addLog(`  ${line}`);
    }
  };

  /** Etapa 2 — open da porta já selecionada + sinais + leitura. */
  const handleOpenPort = async () => {
    const port = selectedPortRef.current;
    if (!port) {
      addLog("Nenhuma porta selecionada. Use Selecionar nova porta ou Usar porta autorizada.");
      return;
    }
    if (openPortRef.current) {
      addLog("Porta já aberta — use Desconectar antes.");
      return;
    }

    setStatus("Abrindo porta...");
    const attemptId = `poc-open-${Date.now()}`;
    const info = port.getInfo();
    // Instrumentação comparativa (somente log — sem mudança funcional).
    console.info(`[AT05 POC] BEFORE OPEN`, {
      timestamp: new Date().toISOString(),
      attemptId,
      portEqualsSelectedRef: port === selectedPortRef.current,
      portEqualsOpenRef: port === openPortRef.current,
      readable: port.readable != null,
      writable: port.writable != null,
      getInfo: {
        usbVendorId: info.usbVendorId ?? null,
        usbProductId: info.usbProductId ?? null,
      },
      portOpenState: portOpen,
      hasSelectedPort,
      hasReader: readerRef.current != null,
      selectLock: selectLockRef.current,
      openPortRefSet: openPortRef.current != null,
    });
    addLog(
      "chamando port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: none, flowControl: none })",
    );

    try {
      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      console.info(`[AT05 POC] OPEN OK`, {
        timestamp: new Date().toISOString(),
        attemptId,
        readable: port.readable != null,
        writable: port.writable != null,
      });
      openPortRef.current = port;
      portOpenAliveRef.current = true;
      setPortOpen(true);
      addLog("port.open OK — COM aberta em 9600 8N1");
      logAt05("OPEN", "OK · baud=9600 8N1 none · observe LED azul");
      addLog("Observe o LED azul do AT05");

      // Snapshot inicial de sinais (somente leitura — sem TX / sem alternar DTR-RTS aqui).
      try {
        addLog("chamando port.getSignals() (após open)…");
        const afterOpen = await port.getSignals();
        setSignalsSnap(afterOpen);
        logAt05("SIGNALS", `CTS=${String(afterOpen.clearToSend)}`);
        logAt05("SIGNALS", `DCD=${String(afterOpen.dataCarrierDetect)}`);
        logAt05("SIGNALS", `DSR=${String(afterOpen.dataSetReady)}`);
        logAt05("SIGNALS", `RI=${String(afterOpen.ringIndicator)}`);
        addLog(`getSignals após open: ${formatInputSignals(afterOpen)}`);
      } catch (error) {
        addLog("getSignals() após open falhou:");
        for (const line of formatError(error)) addLog(`  ${line}`);
      }

      setStatus("AT05 conectado");
      addLog("iniciando leitura contínua (sem TX automático)");
      // Contadores de sessão começam do zero a cada open (teste 15s NÃO zera).
      readCallCountRef.current = 0;
      readErrorCountRef.current = 0;
      rxByteCountRef.current = 0;
      rxChunkCountRef.current = 0;
      lastRxAtRef.current = null;
      setReadCallCount(0);
      setReadErrorCount(0);
      setRxByteCount(0);
      setRxChunkCount(0);
      setLastRxAt(null);
      setLastChunkSummary("—");
      setTestDeltaSummary(null);
      setTxObserveResult(null);
      rxCaptureRef.current = [];
      setRxCapture([]);
      setOnlineMode("DESCONHECIDO");
      setLastOnlineEvent("—");
      setLastOnlineRfid("—");
      setLastOnlineFunctionCard("—");
      setLastOnlineProtocolMsg("—");
      setOnlineEventHistory([]);
      onlineCrlfBufferRef.current.reset();
      setRxLoopState("iniciando");
      logAt05("RX", "chamando void startReading(port) AGORA");
      void startReading(port);
      logAt05("RX", "void startReading(port) agendado (promise em voo)");
    } catch (error) {
      const err = error as Error;
      console.error(`[AT05 POC] OPEN FAILED`, {
        timestamp: new Date().toISOString(),
        attemptId,
        name: err?.name,
        message: err?.message,
        readable: port.readable != null,
        writable: port.writable != null,
      });
      addLog("B) falha em port.open():");
      for (const line of formatError(error)) addLog(`  ${line}`);
      setStatus(`Erro open: ${(error as Error)?.name ?? "desconhecido"}`);
      openPortRef.current = null;
      portOpenAliveRef.current = false;
      setPortOpen(false);
    }
  };

  /** Reaplica DTR/RTS com a porta já aberta (teste manual sem reabrir). */
  const handleAssertSignals = async () => {
    const port = openPortRef.current;
    if (!port) {
      addLog("Nenhuma porta aberta para setSignals.");
      return;
    }
    try {
      const before = await port.getSignals();
      setSignalsSnap(before);
      logAt05("SIGNALS", `(manual ANTES) ${formatSignalsLine(before)}`);
      logAt05("SIGNALS", "setSignals Diagnóstico: DTR=true RTS=true (não automático)");
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      const after = await port.getSignals();
      setSignalsSnap(after);
      logAt05("SIGNALS", `(manual DEPOIS) ${formatSignalsLine(after)}`);
      addLog("Passe o bastão no brinco novamente e observe RX LOOP.");
    } catch (error) {
      logAt05("ERROR", `assertar sinais: ${(error as Error)?.message ?? String(error)}`);
    }
  };

  const handleDisconnect = async () => {
    addLog("Desconectar clicado");
    stopReadingRef.current = true;
    syncStopRequestedUi();

    const reader = readerRef.current;
    const port = openPortRef.current;
    readerRef.current = null;

    try {
      await enqueueAt05Cleanup(() => safeCloseSerialSession({ reader, port }));
      openPortRef.current = null;
      portOpenAliveRef.current = false;
      setReaderActive(false);
      setPortOpen(false);
      addLog("port.close() OK — Porta fechada");
      lastAcceptedRef.current = null;
      setStatus(
        selectedPortRef.current
          ? "Porta fechada (seleção mantida)"
          : "Desconectado",
      );
    } catch (error) {
      addLog("erro no cleanup da porta:");
      for (const line of formatError(error)) addLog(`  ${line}`);
      // Mantém openPortRef se a porta seguir aberta no SO.
      if (port && (port.readable != null || port.writable != null)) {
        openPortRef.current = port;
        portOpenAliveRef.current = true;
        setPortOpen(true);
        setStatus("Erro ao fechar porta — tente Desconectar de novo");
      } else {
        openPortRef.current = null;
        portOpenAliveRef.current = false;
        setPortOpen(false);
        setStatus("Desconectado");
      }
    }
  };

  // Evita deixar COM5 presa ao sair da POC sem clicar em Desconectar.
  useEffect(() => {
    return () => {
      stopReadingRef.current = true;
      const reader = readerRef.current;
      const port = openPortRef.current;
      readerRef.current = null;
      openPortRef.current = null;
      if (reader || port) {
        void enqueueAt05Cleanup(() => safeCloseSerialSession({ reader, port }));
      }
    };
  }, []);

  /**
   * Bancada TX — não mexe no reader. Writer só para o write e libera lock.
   */
  const writeProtocolBytes = async (
    data: Uint8Array,
    mode: At05TxMode,
  ): Promise<{ ok: true; at: number } | { ok: false }> => {
    const port = openPortRef.current;
    if (!port) {
      logAt05("ERROR", "TX: nenhuma porta aberta");
      return { ok: false };
    }
    if (!port.writable) {
      logAt05("ERROR", "TX: port.writable indisponível");
      return { ok: false };
    }

    const at = Date.now();
    const hex = bytesToHex(data);
    const dec = bytesToDec(data);
    const ascii = bytesToVisibleText(data);

    logAt05("TX", "START");
    logAt05("TX", `timestamp=${new Date(at).toISOString()}`);
    logAt05("TX", `mode=${mode}`);
    logAt05("TX", `length=${data.byteLength}`);
    logAt05("TX", `HEX=${hex}`);
    logAt05("TX", `DEC=${dec}`);
    logAt05("TX", `ASCII=${JSON.stringify(ascii)}`);

    setTxBusy(true);
    const writer = port.writable.getWriter();
    try {
      await writer.write(data);
      txCallCountRef.current += 1;
      setTxCallCount(txCallCountRef.current);
      setTxByteCount(n => n + data.byteLength);
      setLastTxAt(at);
      logAt05("TX", "write OK");
      return { ok: true, at };
    } catch (error) {
      const err = error as Error;
      logAt05("TX", "[ERROR]");
      logAt05("TX", `name=${err?.name ?? "?"}`);
      logAt05("TX", `message=${err?.message ?? String(error)}`);
      logAt05("TX", `stack=${err?.stack ?? "(sem stack)"}`);
      return { ok: false };
    } finally {
      try {
        writer.releaseLock();
      } catch {
        /* ignore */
      }
      setTxBusy(false);
    }
  };

  const finishObserveWindow = (
    args: {
      mode: At05TxMode;
      txHex: string;
      baselineAt: number;
      startChunks: number;
      startBytes: number;
      startReadCalls: number;
      windowMs: number;
      label: string;
    },
  ) => {
    const chunksAfter = rxCaptureRef.current.filter(c => c.at >= args.baselineAt);
    const summary = summarizeRxChunks(chunksAfter);
    const deltaChunks = rxChunkCountRef.current - args.startChunks;
    const deltaBytes = rxByteCountRef.current - args.startBytes;
    const deltaReads = readCallCountRef.current - args.startReadCalls;

    logAt05("TEST", `======== ${args.label} ========`);
    logAt05("TEST", `TX enviado: HEX=${args.txHex}`);
    logAt05("TEST", `Resposta em ${args.windowMs / 1000}s: chunks=${deltaChunks} bytes=${deltaBytes}`);
    logAt05("TEST", `readCalls Δ=${deltaReads}`);

    if (deltaBytes <= 0 && summary.rxChunks === 0) {
      logAt05("TEST", `Nenhuma resposta RX em ${args.windowMs / 1000}s`);
      const resultado = `sem resposta`;
      setTxObserveResult(
        `TX HEX=${args.txHex}\nResposta em ${args.windowMs / 1000}s: chunks=0 bytes=0\nNenhuma resposta RX em ${args.windowMs / 1000}s`,
      );
      setTxHistory(prev =>
        appendTxHistory(prev, {
          at: args.baselineAt,
          mode: args.mode,
          txHex: args.txHex,
          rxChunks: 0,
          rxBytes: 0,
          resultado,
          rxHex: "",
          rxAscii: "",
          firstRxAt: null,
          lastRxAt: null,
          windowMs: args.windowMs,
        }),
      );
      setStatus(`TX ${args.txHex} → sem RX em ${args.windowMs / 1000}s`);
      return;
    }

    logAt05("TEST", `RX HEX=${summary.rxHex}`);
    logAt05("TEST", `RX ASCII=${JSON.stringify(summary.rxAscii)}`);
    const resultado = "resposta recebida";
    setTxObserveResult(
      `TX HEX=${args.txHex}\nResposta em ${args.windowMs / 1000}s: chunks=${deltaChunks} bytes=${deltaBytes}\nHEX=${summary.rxHex}\nASCII=${JSON.stringify(summary.rxAscii)}`,
    );
    setTxHistory(prev =>
      appendTxHistory(prev, {
        at: args.baselineAt,
        mode: args.mode,
        txHex: args.txHex,
        rxChunks: deltaChunks,
        rxBytes: deltaBytes,
        resultado,
        rxHex: summary.rxHex,
        rxAscii: summary.rxAscii,
        firstRxAt: summary.firstRxAt,
        lastRxAt: summary.lastRxAt,
        windowMs: args.windowMs,
      }),
    );
    setStatus(`TX ${args.txHex} → RX ${deltaBytes} B / ${deltaChunks} chunks`);
  };

  const handleSendPayload = async (opts: {
    observeMs?: number;
    waitBrinco?: boolean;
  } = {}) => {
    const preview = buildTxPayload(txMode, txInput);
    if (!preview.ok) {
      logAt05("ERROR", `TX payload inválido: ${preview.error}`);
      setStatus(`TX inválido: ${preview.error}`);
      return;
    }
    if (txObserveTimerRef.current) {
      clearTimeout(txObserveTimerRef.current);
      txObserveTimerRef.current = null;
    }

    const observeMs = opts.observeMs;
    const waitBrinco = Boolean(opts.waitBrinco);

    const startChunks = rxChunkCountRef.current;
    const startBytes = rxByteCountRef.current;
    const startReadCalls = readCallCountRef.current;

    const sent = await writeProtocolBytes(preview.data, txMode);
    if (!sent.ok) return;

    if (!observeMs) {
      setTxObserveResult(`TX enviado HEX=${preview.hex} (sem janela de observação)`);
      return;
    }

    setTxObserveResult(null);
    if (waitBrinco) {
      setTxBrincoWaitRunning(true);
      setStatus("Passe o brinco agora");
      logAt05("TEST", "Passe o brinco agora — janela 10s após TX (sem TX extra)");
    } else {
      setTxObserveRunning(true);
      setStatus(`Observando RX por ${observeMs / 1000}s após TX…`);
      logAt05("TEST", `observando RX ${observeMs}ms (reader intacto)`);
    }

    txObserveTimerRef.current = setTimeout(() => {
      txObserveTimerRef.current = null;
      setTxObserveRunning(false);
      setTxBrincoWaitRunning(false);
      finishObserveWindow({
        mode: txMode,
        txHex: preview.hex,
        baselineAt: sent.at,
        startChunks,
        startBytes,
        startReadCalls,
        windowMs: observeMs,
        label: waitBrinco ? "TX + BRINCO 10s" : "TX + OBSERVE 3s",
      });
    }, observeMs);
  };

  /** Habilitado com porta aberta — não depende de writer/reader/RFID/TX. */
  const canRefreshSignals = Boolean(portOpen);
  const txPreview = buildTxPayload(txMode, txInput);

  const handleStartSessionCapture = () => {
    const at = Date.now();
    sessionEventsRef.current = [];
    setSessionEvents([]);
    sessionCapturingRef.current = true;
    setSessionCapturing(true);
    setSessionStartedAt(at);
    const strategyNote =
      strategyPath === "A"
        ? AT05_STRATEGY_PATHS.A
        : strategyPath === "B"
          ? AT05_STRATEGY_PATHS.B
          : "estratégia ainda indefinida (A online vs B descarga)";
    const bootstrap: At05SessionEvent[] = [
      {
        at,
        kind: "meta",
        message: "Iniciar captura de sessão",
        detail: {
          portOpen,
          readerActive,
          portLabel: portLabelManual || null,
          portInfo: portInfoText || null,
          selectionOrder: selectionOrder || null,
          signals: signalsSnap ? formatSignalsLine(signalsSnap) : null,
          rxBytes: rxByteCountRef.current,
          rxChunks: rxChunkCountRef.current,
          txBytes: txByteCount,
          txCalls: txCallCountRef.current,
          readCalls: readCallCountRef.current,
          strategy: strategyNote,
        },
      },
      {
        at,
        kind: "physical",
        message: `checklist inicial: ${formatPhysicalLine(physical)}`,
        detail: { ...physical },
      },
    ];
    sessionEventsRef.current = bootstrap;
    setSessionEvents(bootstrap);
    setStatus("Captura de sessão ATIVA");
    logAt05("TEST", `captura de sessão INÍCIO ${new Date(at).toISOString()}`);
  };

  const buildCurrentSessionSnapshot = (endedAt: number | null) => {
    const strategyNote =
      strategyPath === "A"
        ? AT05_STRATEGY_PATHS.A
        : strategyPath === "B"
          ? AT05_STRATEGY_PATHS.B
          : "estratégia ainda indefinida (A online vs B descarga)";
    return {
      startedAt: sessionStartedAt ?? Date.now(),
      endedAt,
      portLabel: portLabelManual,
      portInfo: portInfoText,
      selectionOrder: selectionOrder || null,
      strategyNote,
      physical,
      events: sessionEventsRef.current,
    };
  };

  const handleEndSessionCapture = (andExport: "none" | "txt" | "json" | "both" = "both") => {
    if (!sessionCapturingRef.current && sessionEventsRef.current.length === 0) {
      logAt05("ERROR", "nenhuma captura para encerrar");
      return;
    }
    const endedAt = Date.now();
    pushSession("meta", "Encerrar captura", {
      endedAt: new Date(endedAt).toISOString(),
      physical: formatPhysicalLine(physical),
    });
    sessionCapturingRef.current = false;
    setSessionCapturing(false);
    const snap = buildCurrentSessionSnapshot(endedAt);
    const stamp = new Date(endedAt).toISOString().replace(/[:.]/g, "-");
    if (andExport === "txt" || andExport === "both") {
      downloadTextFile(
        `at05-sessao-${stamp}.txt`,
        formatSessionExportTxt(snap),
        "text/plain;charset=utf-8",
      );
    }
    if (andExport === "json" || andExport === "both") {
      downloadTextFile(
        `at05-sessao-${stamp}.json`,
        JSON.stringify(buildSessionExportObject(snap), null, 2),
        "application/json;charset=utf-8",
      );
    }
    setStatus("Captura encerrada — arquivos exportados");
    logAt05("TEST", `captura encerrada · eventos=${snap.events.length}`);
  };

  const handleValidateReplayScript = () => {
    const parsed = parseProtocolReplayScript(replayScript);
    if (!parsed.ok) {
      setReplayParseMsg(`INVÁLIDO (linha ${parsed.line}): ${parsed.error}`);
      pushSession("note", `replay parse falhou: ${parsed.error}`, { line: parsed.line });
      return;
    }
    const summary = parsed.steps
      .map(s => {
        if (s.type === "TX") return `TX ${s.hex}`;
        if (s.type === "DELAY") return `delay ${s.ms}ms`;
        if (s.type === "WAIT") return `wait ${s.ms}ms`;
        return `# ${s.text}`;
      })
      .join(" → ");
    setReplayParseMsg(
      `OK · ${parsed.steps.length} passo(s) estruturados · NÃO executado.\n${summary}`,
    );
    pushSession("note", "replay validado (sem executar)", {
      steps: parsed.steps.length,
      summary,
    });
  };

  const setPhysicalField = (
    key: keyof Omit<At05PhysicalChecklist, "observacao">,
    value: boolean | null,
  ) => {
    setPhysical(prev => {
      const next = { ...prev, [key]: value };
      pushSession("physical", `checklist ${key}=${value == null ? "?" : value ? "sim" : "não"}`, {
        ...next,
      });
      return next;
    });
  };

  const handleRefreshSignals = async () => {
    const port = openPortRef.current ?? selectedPortRef.current;
    if (!port) {
      logAt05("ERROR", "sinais: nenhuma porta selecionada/aberta");
      setStatus("Erro: sem porta para getSignals()");
      return;
    }
    try {
      const signals = await port.getSignals();
      setSignalsSnap(signals);
      logAt05("SIGNALS", `CTS=${String(signals.clearToSend)}`);
      logAt05("SIGNALS", `DCD=${String(signals.dataCarrierDetect)}`);
      logAt05("SIGNALS", `DSR=${String(signals.dataSetReady)}`);
      logAt05("SIGNALS", `RI=${String(signals.ringIndicator)}`);
    } catch (error) {
      const err = error as Error;
      logAt05(
        "ERROR",
        `getSignals falhou: name=${err?.name ?? "?"} message=${err?.message ?? String(error)}`,
      );
      for (const line of formatError(error)) addLog(`  ${line}`);
      setStatus(`Erro getSignals: ${err?.name ?? "desconhecido"}`);
    }
  };

  const handleMonitorRx15s = () => {
    if (!portOpen || !openPortRef.current) {
      logAt05("ERROR", "monitor RX 15s: abra a porta primeiro");
      return;
    }
    if (!readerRef.current) {
      logAt05("ERROR", "monitor RX 15s: reader inexistente — abra a porta e confirme loop ativo");
      return;
    }
    if (readCallCountRef.current < 1) {
      logAt05(
        "ERROR",
        "monitor RX 15s: reader.read() chamadas ainda 0 — confirme LOOP aguardando antes do teste",
      );
      return;
    }
    if (rxMonitorTimerRef.current) {
      clearTimeout(rxMonitorTimerRef.current);
      rxMonitorTimerRef.current = null;
    }

    // NÃO zera contadores globais. Só grava baseline para delta.
    const at = Date.now();
    const startReadCalls = readCallCountRef.current;
    const startChunks = rxChunkCountRef.current;
    const startBytes = rxByteCountRef.current;
    const startErrors = readErrorCountRef.current;

    rxMonitorBaselineRef.current = {
      at,
      startReadCalls,
      startChunks,
      startBytes,
      startErrors,
      firstRxAt: null,
      lastRxAt: null,
    };
    setTestDeltaSummary(null);
    setRxMonitorRunning(true);
    setStatus("Monitor RX 15s — aproxime o AT05 do brinco até bipar");
    logAt05("TEST", `Monitor RX 15s INÍCIO ${new Date(at).toISOString()}`);
    logAt05(
      "TEST",
      `baseline readCalls=${startReadCalls} chunks=${startChunks} bytes=${startBytes} errors=${startErrors}`,
    );
    logAt05(
      "TEST",
      `reader instance id=${readerInstanceIdUi ?? "?"} · sem getReader novo · sem zerar globais`,
    );
    logAt05(
      "TEST",
      "Durante 15s: sem TX, sem fechar porta, reader existente. Aproxime o AT05 até bipar.",
    );

    rxMonitorTimerRef.current = setTimeout(() => {
      rxMonitorTimerRef.current = null;
      setRxMonitorRunning(false);
      const base = rxMonitorBaselineRef.current;
      const first = base?.firstRxAt ?? null;
      const last = base?.lastRxAt ?? null;
      const testReadCalls = readCallCountRef.current - (base?.startReadCalls ?? 0);
      const testChunks = rxChunkCountRef.current - (base?.startChunks ?? 0);
      const testBytes = rxByteCountRef.current - (base?.startBytes ?? 0);
      const testErrors = readErrorCountRef.current - (base?.startErrors ?? 0);

      logAt05("TEST", "======== TESTE RX (15s) ========");
      logAt05("TEST", `delta reader.read chamadas: ${testReadCalls}`);
      logAt05("TEST", `delta chunks: ${testChunks}`);
      logAt05("TEST", `delta bytes: ${testBytes}`);
      logAt05("TEST", `delta erros: ${testErrors}`);
      logAt05(
        "TEST",
        `globais agora: readCalls=${readCallCountRef.current} chunks=${rxChunkCountRef.current} bytes=${rxByteCountRef.current}`,
      );
      logAt05("TEST", `primeiro RX: ${first ? new Date(first).toISOString() : "(nenhum)"}`);
      logAt05("TEST", `último RX: ${last ? new Date(last).toISOString() : "(nenhum)"}`);
      const summary =
        testBytes > 0
          ? `TESTE RX Δ: ${testBytes} B / ${testChunks} chunks (readCalls Δ=${testReadCalls})`
          : `TESTE RX Δ: 0 bytes / 0 chunks (readCalls Δ=${testReadCalls})`;
      setTestDeltaSummary(summary);
      setStatus(summary);
      rxMonitorBaselineRef.current = null;
    }, 15_000);
  };

  const handleCopyRxBruto = async () => {
    const text = formatRxCaptureForCopy(rxCapture);
    try {
      await navigator.clipboard.writeText(text);
      logAt05("TEST", `RX bruto copiado (${rxCapture.length} chunks, buffer local)`);
    } catch {
      logAt05("ERROR", "falha ao copiar RX bruto para clipboard");
      addLog(text);
    }
  };

  const handleBrincoTestStart = async () => {
    if (!portOpen) {
      logAt05("ERROR", "teste brinco: abra a porta primeiro");
      return;
    }
    if (brincoTimerRef.current) {
      clearTimeout(brincoTimerRef.current);
      brincoTimerRef.current = null;
    }

    const port = openPortRef.current;
    let signalsBefore = "n/a";
    try {
      if (port) {
        const s = await port.getSignals();
        setSignalsSnap(s);
        signalsBefore = formatSignalsLine(s);
      }
    } catch {
      signalsBefore = "getSignals falhou";
    }

    const at = Date.now();
    brincoBaselineRef.current = {
      at,
      rxBytes: rxByteCountRef.current,
      rxChunks: rxChunkCountRef.current,
    };
    setBrincoTestRunning(true);

    logAt05("TEST", `Brinco iniciado ${new Date(at).toISOString()}`);
    logAt05(
      "TEST",
      `ANTES readable=${String(Boolean(port?.readable))} writable=${String(Boolean(port?.writable))} readerActive=${String(Boolean(readerRef.current))} RX=${rxByteCountRef.current}B chunks=${rxChunkCountRef.current}`,
    );
    logAt05("SIGNALS", `ANTES ${signalsBefore}`);

    brincoTimerRef.current = setTimeout(async () => {
      brincoTimerRef.current = null;
      setBrincoTestRunning(false);
      const base = brincoBaselineRef.current;
      const deltaBytes = rxByteCountRef.current - (base?.rxBytes ?? 0);
      const deltaChunks = rxChunkCountRef.current - (base?.rxChunks ?? 0);

      let signalsAfter = "n/a";
      try {
        const p = openPortRef.current;
        if (p) {
          const s = await p.getSignals();
          setSignalsSnap(s);
          signalsAfter = formatSignalsLine(s);
        }
      } catch {
        signalsAfter = "getSignals falhou";
      }

      logAt05("TEST", `Brinco finalizado: RX=${deltaBytes} bytes · chunks=${deltaChunks}`);
      logAt05(
        "TEST",
        `DEPOIS readable=${String(Boolean(openPortRef.current?.readable))} writable=${String(Boolean(openPortRef.current?.writable))} readerActive=${String(Boolean(readerRef.current))}`,
      );
      logAt05("SIGNALS", `DEPOIS ${signalsAfter}`);
    }, 5000);
  };

  const handleExportDiagLog = () => {
    const port = openPortRef.current ?? selectedPortRef.current;
    const info = port?.getInfo();
    const lines = [
      "=== Fazenda Digital · Diagnóstico AT05 ===",
      `exportedAt=${new Date().toISOString()}`,
      "config=baudRate:9600 dataBits:8 stopBits:1 parity:none flowControl:none",
      `portInfo=${info ? formatPortInfo(info) : "(nenhuma)"}`,
      `selected=${hasSelectedPort} open=${portOpen} readerActive=${readerActive}`,
      `writable=${String(Boolean(openPortRef.current?.writable))}`,
      `rxBytes=${rxByteCount} rxChunks=${rxChunkCount} txBytes=${txByteCount} txCalls=${txCallCount}`,
      `readCalls=${readCallCount} readErrors=${readErrorCount}`,
      `lastRxAt=${lastRxAt ? new Date(lastRxAt).toISOString() : "—"}`,
      `lastChunk=${lastChunkSummary}`,
      `lastTxAt=${lastTxAt ? new Date(lastTxAt).toISOString() : "—"}`,
      `signals=${signalsSnap ? formatSignalsLine(signalsSnap) : "—"}`,
      "",
      "--- LOG ---",
      ...[...logs].reverse(),
      "",
      "--- TX HISTORY ---",
      ...(txHistory.length === 0
        ? ["(vazio)"]
        : txHistory.map(
            e =>
              `${new Date(e.at).toISOString()} | ${e.mode} | TX=${e.txHex} | RXch=${e.rxChunks} | RXB=${e.rxBytes} | ${e.resultado}` +
              (e.rxHex ? ` | RXHEX=${e.rxHex}` : ""),
          )),
      "",
      "--- RX CAPTURE (últimos ≤5KB) ---",
      formatRxCaptureForCopy(rxCapture),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `at05-diagnostico-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logAt05("TEST", "log de diagnóstico exportado (.txt)");
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const clearHistory = () => {
    setHistory([]);
    setLastRfid(null);
    lastAcceptedRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (awaitResponseTimerRef.current) clearTimeout(awaitResponseTimerRef.current);
      if (brincoTimerRef.current) clearTimeout(brincoTimerRef.current);
      if (rxMonitorTimerRef.current) clearTimeout(rxMonitorTimerRef.current);
      if (txObserveTimerRef.current) clearTimeout(txObserveTimerRef.current);
    };
  }, []);

  return (
    <AppLayout>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-0.5">
          Diagnóstico · POC temporária · seleção ≠ abertura
        </p>
        <h1
          className="text-[20px] font-semibold text-gray-900"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Diagnóstico AT05
        </h1>
        <p className="text-[12px] text-gray-500 mt-1 max-w-2xl">
          Etapas separadas: <strong>Selecionar nova porta</strong> (só requestPort) →{" "}
          <strong>Abrir porta</strong> (open 9600) → leitura. Também dá para reutilizar
          autorização via <code className="text-[11px]">getPorts()</code>.
        </p>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 p-5 space-y-5 max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-gray-500 font-medium">Status</p>
            <p className="text-[14px] font-semibold text-gray-900 mt-0.5">{status}</p>
            <p className="text-[11px] text-gray-500 mt-1">
              Portas autorizadas (última consulta):{" "}
              <span className="font-semibold text-gray-800">{authorizedCount}</span>
              {" · "}
              Selecionada:{" "}
              <span className="font-semibold text-gray-800">
                {hasSelectedPort ? "sim" : "não"}
              </span>
              {" · "}
              Aberta:{" "}
              <span className="font-semibold text-gray-800">{portOpen ? "sim" : "não"}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSelectNewPort}
            disabled={selectBusy || portOpen}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px] disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Selecionar nova porta
          </button>
          <button
            type="button"
            onClick={handleListAuthorized}
            disabled={selectBusy}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-50"
          >
            Listar autorizadas
          </button>
          <button
            type="button"
            onClick={handleUseAuthorized}
            disabled={selectBusy || portOpen}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-[#4ECDC4] text-[12px] font-semibold text-gray-800 hover:bg-[#4ECDC4]/10 min-h-[40px] disabled:opacity-50"
          >
            Usar porta autorizada
          </button>
          <button
            type="button"
            onClick={handleOpenPort}
            disabled={!hasSelectedPort || portOpen || selectBusy}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-800 text-[12px] font-semibold text-gray-900 hover:bg-gray-50 min-h-[40px] disabled:opacity-50"
          >
            Abrir porta (9600)
          </button>
          <button
            type="button"
            onClick={handleAssertSignals}
            disabled={!portOpen}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-amber-400 text-[12px] font-semibold text-amber-900 hover:bg-amber-50 min-h-[40px] disabled:opacity-50"
            title="Somente diagnóstico — não faz parte do fluxo principal"
          >
            Assertar DTR/RTS (Diagnóstico)
          </button>
          <button
            type="button"
            onClick={() => void handleRefreshSignals()}
            disabled={!canRefreshSignals}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-50"
            title="Habilitado com porta aberta — independente de writer/reader/RFID"
          >
            Atualizar sinais
          </button>
          <button
            type="button"
            onClick={handleExportDiagLog}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px]"
          >
            Exportar log de diagnóstico
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={!portOpen}
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

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-3">
          <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">
            Identificação da porta · Captura de sessão · Estratégia
          </p>
          <p className="text-[11px] text-slate-600">
            Web Serial raramente mostra nome amigável (ex.: COM5). Use o rótulo manual. Hipótese
            atual: AT05 pode ser <strong>online</strong> (A) ou <strong>descarga de trabalho</strong>{" "}
            (B) — sem assumir qual.
          </p>
          <label className="block text-[11px] text-gray-600 font-medium">
            Rótulo manual da porta (só diagnóstico)
            <input
              type="text"
              value={portLabelManual}
              onChange={e => setPortLabelManual(e.target.value)}
              onBlur={() =>
                pushSession("port", `rótulo manual=${JSON.stringify(portLabelManual)}`)
              }
              className="mt-1 w-full text-[12px] border border-gray-300 rounded px-3 py-2 text-gray-800 bg-white font-mono min-h-[34px]"
              placeholder="SPP Dev (COM5) ou AT05 — Emparelhado"
              autoComplete="off"
            />
          </label>
          <div className="text-[11px] text-gray-700 space-y-0.5 font-mono">
            <p>
              getInfo: <span className="font-semibold">{portInfoText || "—"}</span>
            </p>
            <p>
              ordem de seleção:{" "}
              <span className="font-semibold">{selectionOrder > 0 ? `#${selectionOrder}` : "—"}</span>
            </p>
            <p>
              rótulo:{" "}
              <span className="font-semibold">{portLabelManual.trim() || "(não informado)"}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="font-medium text-gray-700 self-center">Estratégia em teste:</span>
            {(
              [
                ["indefinido", "Indefinido"],
                ["A", "A · online"],
                ["B", "B · descarga"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setStrategyPath(id);
                  pushSession("note", `estratégia=${id}`);
                }}
                className={`inline-flex items-center px-2.5 py-1.5 rounded border text-[11px] font-semibold min-h-[32px] ${
                  strategyPath === id
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">
            {strategyPath === "A"
              ? AT05_STRATEGY_PATHS.A
              : strategyPath === "B"
                ? AT05_STRATEGY_PATHS.B
                : "Ainda sem definição — registre evidências na captura."}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartSessionCapture}
              disabled={sessionCapturing}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[36px] disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {sessionCapturing ? "Captura ativa…" : "Iniciar captura de sessão"}
            </button>
            <button
              type="button"
              onClick={() => handleEndSessionCapture("both")}
              disabled={!sessionCapturing && sessionEvents.length === 0}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-400 text-[12px] font-semibold text-slate-900 hover:bg-white min-h-[36px] disabled:opacity-50"
            >
              Encerrar captura (TXT+JSON)
            </button>
            <button
              type="button"
              onClick={() => {
                const snap = buildCurrentSessionSnapshot(
                  sessionCapturing ? null : Date.now(),
                );
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                downloadTextFile(
                  `at05-sessao-${stamp}.json`,
                  JSON.stringify(buildSessionExportObject(snap), null, 2),
                  "application/json;charset=utf-8",
                );
              }}
              disabled={sessionEvents.length === 0}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] font-semibold text-gray-700 hover:bg-white min-h-[36px] disabled:opacity-50"
            >
              Exportar JSON agora
            </button>
          </div>
          {sessionCapturing ? (
            <p className="text-[12px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              Captura ATIVA · {sessionEvents.length} eventos · TX/RX/ações entram no log de
              sessão
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-4 py-3 space-y-2">
          <p className="text-[11px] font-semibold text-violet-950 uppercase tracking-wide">
            Checklist físico do bastão (manual)
          </p>
          <p className="text-[11px] text-violet-900/80">
            Correlaciona o que o AT05 faz no curral com o que a serial vê (ou não vê).
          </p>
          {(
            [
              ["leuBrinco", "AT05 leu o brinco?"],
              ["bipou", "bipou?"],
              ["ledAcendeu", "LED acendeu?"],
              ["numeroNoVisor", "número apareceu no visor?"],
              ["animalJaTrabalhado", "mensagem “animal já trabalhado”?"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="min-w-[200px] text-gray-800">{label}</span>
              {(
                [
                  [true, "sim"],
                  [false, "não"],
                  [null, "?"],
                ] as const
              ).map(([val, lab]) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setPhysicalField(key, val)}
                  className={`px-2 py-1 rounded border min-h-[28px] font-semibold ${
                    physical[key] === val
                      ? "border-violet-800 bg-violet-800 text-white"
                      : "border-gray-300 text-gray-700 bg-white"
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>
          ))}
          <label className="block text-[11px] text-gray-600 font-medium">
            Observação física
            <input
              type="text"
              value={physical.observacao}
              onChange={e => {
                const observacao = e.target.value;
                setPhysical(prev => ({ ...prev, observacao }));
              }}
              onBlur={() =>
                pushSession("physical", `obs física=${JSON.stringify(physical.observacao)}`)
              }
              className="mt-1 w-full text-[12px] border border-gray-300 rounded px-3 py-2 bg-white"
              placeholder="ex.: leu 2x o mesmo brinco; visor mostrou já trabalhado"
            />
          </label>
        </div>

        {portOpen ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-4 py-3 space-y-3">
            <p className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wide">
              Diagnóstico de protocolo · RX isolado
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-gray-700">
              <p>
                Selecionada:{" "}
                <span className="font-semibold">{hasSelectedPort ? "sim" : "não"}</span>
              </p>
              <p>
                Aberta: <span className="font-semibold">{portOpen ? "sim" : "não"}</span>
              </p>
              <p>
                Reader:{" "}
                <span className="font-semibold">{readerActive ? "ativo" : "inativo"}</span>
              </p>
              <p>
                Writable:{" "}
                <span className="font-semibold">{portOpen ? "sim (após open)" : "não"}</span>
              </p>
              <p>
                RX:{" "}
                <span className="font-semibold tabular-nums">
                  {rxByteCount} B / {rxChunkCount} chunks
                </span>
              </p>
              <p>
                TX: <span className="font-semibold tabular-nums">{txByteCount} B</span>
              </p>
              <p className="col-span-2 sm:col-span-3">
                Último RX:{" "}
                <span className="font-semibold">
                  {lastRxAt ? formatTime(lastRxAt) : "—"}
                </span>
                {" · "}
                Último TX:{" "}
                <span className="font-semibold">
                  {lastTxAt ? formatTime(lastTxAt) : "—"}
                </span>
              </p>
            </div>

            <div className="rounded border border-indigo-200 bg-white/80 px-3 py-2 space-y-1 text-[11px] text-gray-800">
              <p className="font-semibold text-indigo-900 uppercase tracking-wide text-[10px]">
                Estado do RX loop
              </p>
              <p>
                RX loop: <span className="font-semibold">{rxLoopState}</span>
              </p>
              <p>
                reader existe:{" "}
                <span className="font-semibold">{readerExistsUi ? "sim" : "não"}</span>
              </p>
              <p>
                reader lock ativo:{" "}
                <span className="font-semibold">{readerLockedUi ? "sim" : "não"}</span>
              </p>
              <p>
                stopRequested:{" "}
                <span className="font-semibold">{stopRequestedUi ? "true" : "false"}</span>
              </p>
              <p>
                reader instance id:{" "}
                <span className="font-semibold tabular-nums">
                  {readerInstanceIdUi ?? "—"}
                </span>
              </p>
            </div>

            <div className="rounded border border-indigo-200 bg-white/80 px-3 py-2 space-y-1 text-[11px] text-gray-800">
              <p className="font-semibold text-indigo-900 uppercase tracking-wide text-[10px]">
                Contadores session (globais — não zerados pelo teste 15s)
              </p>
              <p>
                reader.read() chamadas:{" "}
                <span className="font-semibold tabular-nums">{readCallCount}</span>
              </p>
              <p>
                chunks recebidos:{" "}
                <span className="font-semibold tabular-nums">{rxChunkCount}</span>
              </p>
              <p>
                bytes recebidos:{" "}
                <span className="font-semibold tabular-nums">{rxByteCount}</span>
              </p>
              <p>
                último chunk:{" "}
                <span className="font-mono text-[10px] break-all">{lastChunkSummary}</span>
              </p>
              <p>
                último byte recebido em:{" "}
                <span className="font-semibold">{lastRxAt ? formatTime(lastRxAt) : "—"}</span>
              </p>
              <p>
                erros de leitura:{" "}
                <span className="font-semibold tabular-nums">{readErrorCount}</span>
              </p>
              {testDeltaSummary ? (
                <p className="pt-1 border-t border-indigo-100 text-indigo-950">
                  Último teste 15s: <span className="font-semibold">{testDeltaSummary}</span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-700 font-mono">
                Sinais:{" "}
                <span className="font-semibold">
                  {signalsSnap ? formatSignalsLine(signalsSnap) : "— clique no botão abaixo"}
                </span>
              </p>
              <button
                type="button"
                onClick={() => void handleRefreshSignals()}
                disabled={!canRefreshSignals}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-indigo-400 bg-white text-[12px] font-semibold text-indigo-950 hover:bg-indigo-100 min-h-[36px] disabled:opacity-50"
              >
                Atualizar sinais
              </button>
            </div>

            {rxMonitorRunning ? (
              <p className="text-[12px] font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded px-3 py-2">
                Durante os próximos 15 segundos, aproxime o AT05 de um brinco até ele bipar. Não
                pressione outros botões.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleMonitorRx15s}
                disabled={rxMonitorRunning || brincoTestRunning || readCallCount < 1}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[36px] disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
                title={
                  readCallCount < 1
                    ? "Espere reader.read() chamadas >= 1 (loop aguardando)"
                    : undefined
                }
              >
                {rxMonitorRunning ? "Monitorando RX… (15s)" : "Monitorar RX por 15 segundos"}
              </button>
              <button
                type="button"
                onClick={handleBrincoTestStart}
                disabled={brincoTestRunning || rxMonitorRunning}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-indigo-300 text-[12px] font-semibold text-indigo-950 hover:bg-indigo-100 min-h-[36px] disabled:opacity-50"
              >
                {brincoTestRunning
                  ? "Teste brinco… (5s)"
                  : "Marcar início do teste de leitura"}
              </button>
              <button
                type="button"
                onClick={handleCopyRxBruto}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-indigo-300 text-[12px] font-semibold text-indigo-950 hover:bg-indigo-100 min-h-[36px]"
              >
                Copiar RX bruto
              </button>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-indigo-900 uppercase tracking-wide mb-1">
                RX BRUTO
              </p>
              <div className="max-h-40 overflow-y-auto rounded border border-indigo-200 bg-gray-900 px-2.5 py-2 font-mono text-[10px] text-emerald-200 space-y-1">
                {rxCapture.length === 0 ? (
                  <p className="text-gray-500">
                    (nenhum byte ainda — qualquer chunk de reader.read() aparece aqui antes do
                    parser)
                  </p>
                ) : (
                  [...rxCapture].reverse().map((c, i) => (
                    <div key={`${c.at}-${i}`} className="border-b border-gray-800 pb-1 mb-1">
                      <p className="text-gray-400">
                        {new Date(c.at).toISOString()} · {c.byteLength} B
                      </p>
                      <p className="break-all">HEX {c.hex}</p>
                      <p className="break-all text-amber-200">ASCII {JSON.stringify(c.text)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {portOpen ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-4 py-3 space-y-3">
            <p className="text-[11px] font-semibold text-teal-950 uppercase tracking-wide">
              Interpretação do protocolo AT05 · ONLINE
            </p>
            <p className="text-[11px] text-teal-900/80">
              Camada adicional sobre o RX bruto. Só reconhece{" "}
              <code className="text-[10px]">AT+SPPCONN=</code>,{" "}
              <code className="text-[10px]">AT+SPPDISC</code> e linhas só com dígitos. Não classifica
              RFID como animal.
            </p>
            <div className="rounded border border-teal-200 bg-white/90 px-3 py-2 space-y-1 text-[12px] text-gray-800">
              <p>
                Estado AT05 observado:{" "}
                <span
                  className={`font-semibold ${
                    onlineMode === "CONECTADO"
                      ? "text-emerald-700"
                      : onlineMode === "DESCONECTADO"
                        ? "text-amber-700"
                        : "text-gray-600"
                  }`}
                >
                  {onlineMode}
                </span>
              </p>
              <p className="text-[10px] text-teal-900/70">
                Observado nesta sessão da página (não bloqueia identificação RFID).
              </p>
              <p>
                Último evento: <span className="font-semibold">{lastOnlineEvent}</span>
              </p>
              <p>
                Última identificação RFID:{" "}
                <span className="font-mono font-semibold">{lastOnlineRfid}</span>
              </p>
              <p>
                Último cartão de função:{" "}
                <span className="font-semibold">{lastOnlineFunctionCard}</span>
              </p>
              <p>
                Última mensagem de protocolo:{" "}
                <span className="font-mono text-[11px] break-all">{lastOnlineProtocolMsg}</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-teal-900 uppercase tracking-wide mb-1">
                Histórico interpretado
              </p>
              {onlineEventHistory.length === 0 ? (
                <p className="text-[11px] text-gray-500">
                  (nenhum evento ainda — ative ENVIAR MICROCHIP no AT05)
                </p>
              ) : (
                <ol className="max-h-48 overflow-y-auto space-y-1 rounded border border-teal-200 bg-white px-2.5 py-2">
                  {onlineEventHistory.map((ev, i) => (
                    <li
                      key={`${ev.at}-${i}`}
                      className="text-[11px] text-gray-800 font-mono leading-snug"
                    >
                      <span className="text-gray-400 tabular-nums">{formatTime(ev.at)}</span>
                      {"  "}
                      <span className="font-semibold text-teal-900">
                        {ev.tipo === "IDENTIFICAÇÃO RFID"
                          ? "RFID"
                          : ev.tipo === "CARTÃO DE FUNÇÃO"
                            ? "CARTÃO"
                            : ev.tipo}
                      </span>
                      {"  "}
                      <span className="break-all">
                        {ev.tipo === "IDENTIFICAÇÃO RFID"
                          ? ev.rfid
                          : ev.tipo === "CARTÃO DE FUNÇÃO"
                            ? ev.summary
                            : ev.tipo === "CONEXÃO"
                              ? ev.summary
                              : `DESCONHECIDO · ${ev.line}`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}

        {portOpen ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3 space-y-2">
            <p className="text-[11px] font-semibold text-emerald-950 uppercase tracking-wide">
              Correspondência com o Rebanho · POC
            </p>
            <p className="text-[11px] text-emerald-900/80">
              Somente <strong>IDENTIFICAÇÃO RFID</strong> consulta o cadastro. Cartões / conexão /
              desconhecido não disparam busca. Sem gravação de manejo.
            </p>
            <p className="text-[12px] text-gray-800">
              RFID recebido:{" "}
              <span className="font-mono font-semibold">
                {lastAnimalLookupRfid ?? "—"}
              </span>
            </p>
            {animalLookupStatus === "idle" ? (
              <p className="text-[12px] text-gray-500">Aguardando identificação RFID</p>
            ) : null}
            {animalLookupStatus === "loading" ? (
              <p className="text-[12px] font-semibold text-sky-800">Consultando cadastro...</p>
            ) : null}
            {animalLookupStatus === "found" && matchedAnimal ? (
              <div className="rounded border border-emerald-300 bg-emerald-100/80 px-3 py-2 space-y-1 text-[12px] text-emerald-950">
                <p className="font-semibold">Animal encontrado</p>
                <p>
                  Brinco visual:{" "}
                  <span className="font-mono font-semibold">{matchedAnimal.brinco || "—"}</span>
                </p>
                <p>
                  RFID eletrônico:{" "}
                  <span className="font-mono font-semibold">
                    {matchedAnimal.brincoEletronico || lastAnimalLookupRfid || "—"}
                  </span>
                </p>
                <p>Sexo: {matchedAnimal.sexo || "—"}</p>
                <p>Categoria: {matchedAnimal.categoria || "—"}</p>
                <p>Lote: {matchedAnimal.loteNome || "—"}</p>
                <p>Fazenda: {matchedAnimal.fazendaNome || "—"}</p>
                <p>Status: {matchedAnimal.status || "—"}</p>
              </div>
            ) : null}
            {animalLookupStatus === "not-found" ? (
              <div className="rounded border border-amber-300 bg-amber-100/80 px-3 py-2 text-[12px] text-amber-950">
                <p className="font-semibold">RFID não encontrado no cadastro</p>
                <p className="font-mono mt-1">{lastAnimalLookupRfid}</p>
                <p className="mt-1 text-[11px]">RFID não encontrado no cadastro de animais</p>
              </div>
            ) : null}
            {animalLookupStatus === "error" ? (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-900">
                <p className="font-semibold">Erro ao consultar cadastro</p>
                <p className="mt-1 break-all">{animalLookupError ?? "erro desconhecido"}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {portOpen ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-3">
            <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide">
              Teste de descarga / protocolo · TX manual
            </p>
            <p className="text-[11px] text-amber-900/90 font-medium border border-amber-300 bg-amber-100/80 rounded px-2.5 py-2">
              Use apenas comandos obtidos de documentação, software oficial ou captura de
              protocolo. Não inventar READ/GET/AT/DUMP nem sequências proprietárias.
            </p>
            <p className="text-[11px] text-amber-900/80">
              Reader RX permanece ativo. Nada é enviado sozinho — só no clique. Sem DTR/RTS
              automático. Baud permanece 9600.
            </p>

            <div className="flex flex-wrap gap-3 items-center text-[12px]">
              <span className="font-medium text-gray-700">Modo:</span>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="txMode"
                  checked={txMode === "HEX"}
                  onChange={() => setTxMode("HEX")}
                />
                HEX
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="txMode"
                  checked={txMode === "TEXT"}
                  onChange={() => setTxMode("TEXT")}
                />
                TEXTO
              </label>
            </div>

            <label className="block text-[11px] text-gray-600 font-medium">
              Payload
              <input
                type="text"
                value={txInput}
                onChange={e => setTxInput(e.target.value)}
                className="mt-1 w-full text-[12px] border border-gray-300 rounded px-3 py-2 text-gray-800 bg-white font-mono min-h-[34px]"
                placeholder={txMode === "HEX" ? "0D 0A" : "\\r\\n"}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <div className="rounded border border-amber-200 bg-white/80 px-3 py-2 font-mono text-[10px] text-gray-800 space-y-0.5">
              {txPreview.ok ? (
                <>
                  <p>
                    bytes: <span className="font-semibold">{txPreview.length}</span>
                  </p>
                  <p className="break-all">HEX={txPreview.hex}</p>
                  <p className="break-all">DEC={txPreview.dec}</p>
                  <p className="break-all">ASCII={JSON.stringify(txPreview.ascii)}</p>
                </>
              ) : (
                <p className="text-red-700">preview inválido: {txPreview.error}</p>
              )}
              <p>
                último TX:{" "}
                <span className="font-semibold">{lastTxAt ? formatTime(lastTxAt) : "—"}</span>
                {" · "}
                TX sessão:{" "}
                <span className="font-semibold tabular-nums">
                  {txCallCount} envios / {txByteCount} B
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSendPayload()}
                disabled={txBusy || txObserveRunning || txBrincoWaitRunning || !txPreview.ok}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[36px] disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                Enviar payload
              </button>
              <button
                type="button"
                onClick={() => void handleSendPayload({ observeMs: 3000 })}
                disabled={txBusy || txObserveRunning || txBrincoWaitRunning || !txPreview.ok}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-indigo-400 text-[12px] font-semibold text-indigo-950 hover:bg-indigo-100 min-h-[36px] disabled:opacity-50"
              >
                {txObserveRunning
                  ? "Observando RX… (3s)"
                  : "Enviar e observar RX por 3 segundos"}
              </button>
              <button
                type="button"
                onClick={() => void handleSendPayload({ observeMs: 10_000, waitBrinco: true })}
                disabled={txBusy || txObserveRunning || txBrincoWaitRunning || !txPreview.ok}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-amber-500 text-[12px] font-semibold text-amber-950 hover:bg-amber-100 min-h-[36px] disabled:opacity-50"
              >
                {txBrincoWaitRunning ? "Aguardando brinco… (10s)" : "Marcar TX e aguardar brinco"}
              </button>
            </div>

            {txBrincoWaitRunning ? (
              <p className="text-[12px] font-medium text-amber-950 bg-amber-100 border border-amber-300 rounded px-3 py-2">
                Passe o brinco agora
              </p>
            ) : null}

            {txObserveResult ? (
              <pre className="whitespace-pre-wrap rounded border border-amber-200 bg-white px-3 py-2 text-[11px] text-gray-800 font-mono">
                {txObserveResult}
              </pre>
            ) : null}

            <p className="text-[10px] text-amber-900/70 font-medium uppercase tracking-wide">
              Presets neutros (só preenchem — não enviam)
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["NUL", "00"],
                  ["CR", "0D"],
                  ["LF", "0A"],
                  ["CRLF", "0D 0A"],
                  ["STX", "02"],
                  ["ETX", "03"],
                  ["ENQ", "05"],
                  ["ACK", "06"],
                  ["ESC", "1B"],
                ] as const
              ).map(([label, hex]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setTxMode("HEX");
                    setTxInput(hex);
                    logAt05("TEST", `preset ${label}=${hex} preenchido — envie manualmente`);
                  }}
                  disabled={txBusy}
                  className="inline-flex items-center px-2.5 py-1.5 rounded border border-gray-300 text-[11px] text-gray-700 hover:bg-white min-h-[36px] disabled:opacity-50"
                >
                  {label} = {hex}
                </button>
              ))}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-amber-900 uppercase tracking-wide mb-1">
                Histórico de testes TX/RX (máx. 50)
              </p>
              {txHistory.length === 0 ? (
                <p className="text-[11px] text-gray-500">nenhum teste com janela ainda</p>
              ) : (
                <div className="overflow-x-auto rounded border border-amber-200 bg-white">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-amber-100/80 text-amber-950">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">hora</th>
                        <th className="px-2 py-1.5 font-semibold">modo</th>
                        <th className="px-2 py-1.5 font-semibold">TX HEX</th>
                        <th className="px-2 py-1.5 font-semibold">RX ch</th>
                        <th className="px-2 py-1.5 font-semibold">RX B</th>
                        <th className="px-2 py-1.5 font-semibold">resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txHistory.map((row, i) => (
                        <tr key={`${row.at}-${i}`} className="border-t border-amber-100 align-top">
                          <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                            {formatTime(row.at)}
                          </td>
                          <td className="px-2 py-1.5">{row.mode}</td>
                          <td className="px-2 py-1.5 font-mono break-all">{row.txHex}</td>
                          <td className="px-2 py-1.5 tabular-nums">{row.rxChunks}</td>
                          <td className="px-2 py-1.5 tabular-nums">{row.rxBytes}</td>
                          <td className="px-2 py-1.5">
                            <div>{row.resultado}</div>
                            {row.rxHex ? (
                              <div className="font-mono text-emerald-800 break-all mt-0.5">
                                RX {row.rxHex}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-rose-200 bg-rose-50/40 px-4 py-3 space-y-2">
          <p className="text-[11px] font-semibold text-rose-950 uppercase tracking-wide">
            Replay de protocolo (futuro) — só validar
          </p>
          <p className="text-[11px] text-rose-900/80">
            Estrutura pronta para quando houver captura real do SisGado/AT05.{" "}
            <strong>Não executa</strong> automaticamente. Sem brute force.
          </p>
          <textarea
            value={replayScript}
            onChange={e => setReplayScript(e.target.value)}
            rows={8}
            className="w-full text-[11px] font-mono border border-rose-200 rounded px-3 py-2 bg-white text-gray-800"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleValidateReplayScript}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-rose-400 text-[12px] font-semibold text-rose-950 hover:bg-rose-100 min-h-[36px]"
          >
            Validar sequência (não executar)
          </button>
          <button
            type="button"
            disabled
            className="ml-2 inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-400 min-h-[36px] cursor-not-allowed"
            title="Desabilitado até haver sequência documentada"
          >
            Executar replay (bloqueado)
          </button>
          {replayParseMsg ? (
            <pre className="whitespace-pre-wrap text-[11px] font-mono bg-white border border-rose-200 rounded px-3 py-2">
              {replayParseMsg}
            </pre>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Último RFID
          </p>
          <p className="mt-1 font-mono text-[18px] font-semibold text-gray-900 tracking-wide">
            {lastRfid ?? "—"}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Leituras recebidas
            </p>
            {history.length > 0 ? (
              <button
                type="button"
                onClick={clearHistory}
                className="text-[11px] text-gray-500 underline"
              >
                Limpar
              </button>
            ) : null}
          </div>
          {history.length === 0 ? (
            <p className="text-[12px] text-gray-400">nenhuma leitura</p>
          ) : (
            <ol className="space-y-1.5">
              {history.map((item, idx) => (
                <li
                  key={`${item.rfid}-${item.at}-${idx}`}
                  className="flex items-baseline justify-between gap-3 text-[12px] border border-gray-100 rounded px-2.5 py-1.5 bg-white"
                >
                  <span className="font-mono font-medium text-gray-900">{item.rfid}</span>
                  <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                    {formatTime(item.at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Log técnico
          </p>
          <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-900 px-3 py-2 font-mono text-[10px] text-gray-200 space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-gray-500">
                1) Abrir SPP Dev → 2) confirmar reader aguardando → 3) preset CRLF → 4) Enviar e
                observar RX 3s. Depois ENQ / STX / NUL. Sem fechar a porta entre testes.
              </p>
            ) : (
              logs.map((line, i) => (
                <p key={`${i}-${line.slice(0, 40)}`} className="break-all whitespace-pre-wrap">
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
