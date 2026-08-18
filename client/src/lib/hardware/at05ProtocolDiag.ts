/**
 * Helpers exclusivos da POC Diagnóstico AT05 (protocolo bruto).
 * Não usados pela integração de produção.
 */

export const AT05_RX_CAPTURE_MAX_BYTES = 5 * 1024;
export const AT05_TX_HISTORY_MAX = 50;

export type At05RxCaptureChunk = {
  at: number;
  byteLength: number;
  hex: string;
  text: string;
};

export type At05TxMode = "HEX" | "TEXT";

export type At05TxHistoryEntry = {
  at: number;
  mode: At05TxMode;
  txHex: string;
  rxChunks: number;
  rxBytes: number;
  resultado: string;
  rxHex: string;
  rxAscii: string;
  firstRxAt: number | null;
  lastRxAt: number | null;
  windowMs: number;
};

export function bytesToDec(data: Uint8Array): string {
  return Array.from(data).join(" ");
}

export function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, "0"))
    .join(" ");
}

/** ASCII/UTF-8 legível: imprimíveis + escapes comuns; demais como \\xHH. */
export function bytesToVisibleText(data: Uint8Array): string {
  let out = "";
  for (const b of data) {
    if (b === 0x0d) {
      out += "\\r";
      continue;
    }
    if (b === 0x0a) {
      out += "\\n";
      continue;
    }
    if (b === 0x09) {
      out += "\\t";
      continue;
    }
    if (b === 0x00) {
      out += "\\0";
      continue;
    }
    if (b >= 0x20 && b <= 0x7e) {
      out += String.fromCharCode(b);
      continue;
    }
    out += `\\x${b.toString(16).padStart(2, "0")}`;
  }
  return out;
}

export function appendRxCapture(
  chunks: At05RxCaptureChunk[],
  data: Uint8Array,
  at: number,
): At05RxCaptureChunk[] {
  const next: At05RxCaptureChunk[] = [
    ...chunks,
    {
      at,
      byteLength: data.byteLength,
      hex: bytesToHex(data),
      text: bytesToVisibleText(data),
    },
  ];
  let total = next.reduce((s, c) => s + c.byteLength, 0);
  while (total > AT05_RX_CAPTURE_MAX_BYTES && next.length > 0) {
    const removed = next.shift()!;
    total -= removed.byteLength;
  }
  return next;
}

export function formatRxCaptureForCopy(chunks: At05RxCaptureChunk[]): string {
  if (chunks.length === 0) {
    return "(nenhum RX capturado)\n";
  }
  const lines: string[] = [];
  for (const c of chunks) {
    lines.push(`--- ${new Date(c.at).toISOString()} · ${c.byteLength} bytes ---`);
    lines.push(`HEX: ${c.hex}`);
    lines.push(`TEXT: ${JSON.stringify(c.text)}`);
    lines.push(`ASCII: ${JSON.stringify(c.text)}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * HEX robusto: aceita `0D 0A`, `0D0A`, `0d 0a`, separadores espaço/,/:
 * Rejeita vazio, ímpar de nibbles e caracteres não-HEX (além dos separadores).
 */
export function parseHexPayload(
  input: string,
): { ok: true; data: Uint8Array } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "HEX vazio" };
  }
  if (/[^0-9a-fA-F\s,:]/.test(trimmed)) {
    return { ok: false, error: "caracteres não HEX (use apenas 0-9 A-F e espaços/,/:)" };
  }
  const cleaned = trimmed.replace(/[^0-9a-fA-F]/g, "");
  if (cleaned.length === 0) {
    return { ok: false, error: "HEX vazio" };
  }
  if (cleaned.length % 2 !== 0) {
    return { ok: false, error: `quantidade ímpar de nibbles (${cleaned.length})` };
  }
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
  }
  return { ok: true, data: new Uint8Array(bytes) };
}

/** Expande escapes explícitos: \\r \\n \\t \\0 \\\\ */
export function expandTextEscapes(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1]!;
      if (next === "r") {
        out += "\r";
        i += 1;
        continue;
      }
      if (next === "n") {
        out += "\n";
        i += 1;
        continue;
      }
      if (next === "t") {
        out += "\t";
        i += 1;
        continue;
      }
      if (next === "0") {
        out += "\0";
        i += 1;
        continue;
      }
      if (next === "\\") {
        out += "\\";
        i += 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

export type At05PayloadPreview = {
  ok: true;
  data: Uint8Array;
  length: number;
  hex: string;
  dec: string;
  ascii: string;
} | {
  ok: false;
  error: string;
};

export function buildTxPayload(mode: At05TxMode, input: string): At05PayloadPreview {
  if (mode === "HEX") {
    const parsed = parseHexPayload(input);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      data: parsed.data,
      length: parsed.data.byteLength,
      hex: bytesToHex(parsed.data),
      dec: bytesToDec(parsed.data),
      ascii: bytesToVisibleText(parsed.data),
    };
  }
  if (input.length === 0) {
    return { ok: false, error: "texto vazio" };
  }
  const expanded = expandTextEscapes(input);
  const data = new TextEncoder().encode(expanded);
  return {
    ok: true,
    data,
    length: data.byteLength,
    hex: bytesToHex(data),
    dec: bytesToDec(data),
    ascii: bytesToVisibleText(data),
  };
}

export function appendTxHistory(
  entries: At05TxHistoryEntry[],
  entry: At05TxHistoryEntry,
): At05TxHistoryEntry[] {
  return [entry, ...entries].slice(0, AT05_TX_HISTORY_MAX);
}

export function summarizeRxChunks(chunks: At05RxCaptureChunk[]): {
  rxHex: string;
  rxAscii: string;
  firstRxAt: number | null;
  lastRxAt: number | null;
  rxChunks: number;
  rxBytes: number;
} {
  if (chunks.length === 0) {
    return {
      rxHex: "",
      rxAscii: "",
      firstRxAt: null,
      lastRxAt: null,
      rxChunks: 0,
      rxBytes: 0,
    };
  }
  return {
    rxHex: chunks.map(c => c.hex).join(" | "),
    rxAscii: chunks.map(c => c.text).join(" | "),
    firstRxAt: chunks[0]!.at,
    lastRxAt: chunks[chunks.length - 1]!.at,
    rxChunks: chunks.length,
    rxBytes: chunks.reduce((s, c) => s + c.byteLength, 0),
  };
}

export function formatSignalsLine(signals: SerialInputSignals): string {
  return `CTS=${signals.clearToSend} DCD=${signals.dataCarrierDetect} DSR=${signals.dataSetReady} RI=${signals.ringIndicator}`;
}

/** ── Captura de sessão (cronológica, sem interpretar protocolo) ─────────── */

export const AT05_SESSION_EVENTS_MAX = 2000;

export type At05SessionEventKind =
  | "meta"
  | "port"
  | "signals"
  | "rx"
  | "tx"
  | "action"
  | "state"
  | "physical"
  | "note"
  | "error";

export type At05SessionEvent = {
  at: number;
  kind: At05SessionEventKind;
  message: string;
  detail?: Record<string, unknown>;
};

export type At05PhysicalChecklist = {
  leuBrinco: boolean | null;
  bipou: boolean | null;
  ledAcendeu: boolean | null;
  numeroNoVisor: boolean | null;
  animalJaTrabalhado: boolean | null;
  observacao: string;
};

export type At05SessionSnapshot = {
  startedAt: number;
  endedAt: number | null;
  portLabel: string;
  portInfo: string;
  selectionOrder: number | null;
  strategyNote: string;
  physical: At05PhysicalChecklist;
  events: At05SessionEvent[];
};

export function emptyPhysicalChecklist(): At05PhysicalChecklist {
  return {
    leuBrinco: null,
    bipou: null,
    ledAcendeu: null,
    numeroNoVisor: null,
    animalJaTrabalhado: null,
    observacao: "",
  };
}

export function appendSessionEvent(
  events: At05SessionEvent[],
  event: At05SessionEvent,
): At05SessionEvent[] {
  const next = [...events, event];
  if (next.length <= AT05_SESSION_EVENTS_MAX) return next;
  return next.slice(next.length - AT05_SESSION_EVENTS_MAX);
}

export function formatPhysicalLine(p: At05PhysicalChecklist): string {
  const yn = (v: boolean | null) => (v == null ? "?" : v ? "sim" : "não");
  return [
    `leuBrinco=${yn(p.leuBrinco)}`,
    `bipou=${yn(p.bipou)}`,
    `led=${yn(p.ledAcendeu)}`,
    `visor=${yn(p.numeroNoVisor)}`,
    `jaTrabalhado=${yn(p.animalJaTrabalhado)}`,
    p.observacao.trim() ? `obs=${JSON.stringify(p.observacao.trim())}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildSessionExportObject(snap: At05SessionSnapshot): Record<string, unknown> {
  return {
    tool: "Fazenda Digital · Diagnóstico AT05 · captura de sessão",
    warning:
      "Captura bruta. Não interpreta protocolo. Não inventa comandos. Caminhos possíveis: A=online, B=descarga de trabalho.",
    startedAt: new Date(snap.startedAt).toISOString(),
    endedAt: snap.endedAt ? new Date(snap.endedAt).toISOString() : null,
    portLabel: snap.portLabel || null,
    portInfo: snap.portInfo || null,
    selectionOrder: snap.selectionOrder,
    strategyNote: snap.strategyNote,
    physical: snap.physical,
    eventCount: snap.events.length,
    events: snap.events.map(e => ({
      at: new Date(e.at).toISOString(),
      kind: e.kind,
      message: e.message,
      detail: e.detail ?? null,
    })),
  };
}

export function formatSessionExportTxt(snap: At05SessionSnapshot): string {
  const lines: string[] = [
    "=== Fazenda Digital · Captura de sessão AT05 ===",
    `startedAt=${new Date(snap.startedAt).toISOString()}`,
    `endedAt=${snap.endedAt ? new Date(snap.endedAt).toISOString() : "(em andamento)"}`,
    `portLabel=${snap.portLabel || "(não informado)"}`,
    `portInfo=${snap.portInfo || "(n/a)"}`,
    `selectionOrder=${snap.selectionOrder ?? "(n/a)"}`,
    `strategy=${snap.strategyNote}`,
    `physical=${formatPhysicalLine(snap.physical)}`,
    "",
    "--- EVENTOS (cronológico) ---",
  ];
  for (const e of snap.events) {
    lines.push(`[${new Date(e.at).toISOString()}] [${e.kind}] ${e.message}`);
    if (e.detail && Object.keys(e.detail).length > 0) {
      lines.push(`  detail=${JSON.stringify(e.detail)}`);
    }
  }
  lines.push("");
  lines.push("--- FIM ---");
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ── Replay futuro (parse only — não executar automaticamente) ──────────── */

export type At05ReplayStep =
  | { type: "TX"; hex: string; rawLine: string }
  | { type: "DELAY"; ms: number; rawLine: string }
  | { type: "WAIT"; ms: number; rawLine: string }
  | { type: "COMMENT"; text: string; rawLine: string };

export type At05ReplayParseResult =
  | { ok: true; steps: At05ReplayStep[] }
  | { ok: false; error: string; line: number };

/**
 * Aceita script documental futuro, ex.:
 *   TX 02 31 30
 *   delay 100
 *   TX 0D
 *   wait 3000
 * Não executa — só valida/estrutura.
 */
export function parseProtocolReplayScript(script: string): At05ReplayParseResult {
  const lines = script.split(/\r?\n/);
  const steps: At05ReplayStep[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
      steps.push({ type: "COMMENT", text: trimmed.replace(/^(#|\/\/)\s*/, ""), rawLine });
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const cmd = (parts[0] ?? "").toUpperCase();
    if (cmd === "TX") {
      const hexPart = parts.slice(1).join(" ");
      const parsed = parseHexPayload(hexPart);
      if (!parsed.ok) {
        return { ok: false, error: `TX inválido: ${parsed.error}`, line: i + 1 };
      }
      steps.push({ type: "TX", hex: bytesToHex(parsed.data), rawLine });
      continue;
    }
    if (cmd === "DELAY" || cmd === "WAIT") {
      const ms = Number(parts[1]);
      if (!Number.isFinite(ms) || ms < 0) {
        return { ok: false, error: `${cmd} exige ms numérico ≥ 0`, line: i + 1 };
      }
      steps.push({
        type: cmd === "DELAY" ? "DELAY" : "WAIT",
        ms,
        rawLine,
      });
      continue;
    }
    return {
      ok: false,
      error: `comando desconhecido "${parts[0]}" (apenas TX / delay / wait / #comentário)`,
      line: i + 1,
    };
  }
  if (steps.filter(s => s.type !== "COMMENT").length === 0) {
    return { ok: false, error: "nenhum passo TX/delay/wait encontrado", line: 0 };
  }
  return { ok: true, steps };
}

export const AT05_REPLAY_PLACEHOLDER = `# Cole aqui uma sequência DOCUMENTADA (SisGado / captura oficial).
# NÃO executar automaticamente nesta etapa.
# Exemplo de formato futuro:
# TX 02 31 30
# delay 100
# TX 0D
# wait 3000
`;

export const AT05_STRATEGY_PATHS = {
  A: "Caminho A — leitura online: AT05 lê → transmite imediatamente → app recebe",
  B: "Caminho B — descarga de trabalho: AT05 acumula → comando documentado → descarrega lote",
} as const;

/** ── Interpretação mínima ONLINE (camada sobre RX bruto; só CRLF) ───────── */

export const AT05_ONLINE_EVENT_HISTORY_MAX = 80;

/** Cartões de função comprovados em hardware — SOMENTE igualdade exata do RFID. */
export const AT05_FUNCTION_CARDS = {
  "999090000000065": "ENVIAR MICROCHIP",
  "999090000000055": "CONTAGEM",
  "999090000000062": "CONFIGURAÇÃO",
} as const;

export type At05FunctionCardRfid = keyof typeof AT05_FUNCTION_CARDS;
export type At05FunctionCardName = (typeof AT05_FUNCTION_CARDS)[At05FunctionCardRfid];

/**
 * Estado de link observado nesta sessão da página (não é verdade absoluta do bastão).
 * DESCONHECIDO = ainda não houve AT+SPPCONN nem AT+SPPDISC nesta sessão.
 */
export type At05OnlineMode = "DESCONHECIDO" | "CONECTADO" | "DESCONECTADO";

export type At05OnlineInterpretedEvent = {
  at: number;
  tipo: "CONEXÃO" | "CARTÃO DE FUNÇÃO" | "IDENTIFICAÇÃO RFID" | "DESCONHECIDO";
  /** Texto curto para histórico (ex.: AT05 conectado · addr). */
  summary: string;
  /** Linha completa recebida (sem \\r\\n). */
  line: string;
  /** Endereço após AT+SPPCONN=, se houver. */
  address?: string;
  /** Valor RFID se for identificação numérica ou cartão. */
  rfid?: string;
  /** Nome do cartão de função, se aplicável. */
  functionName?: At05FunctionCardName;
  /** Novo estado observado, se a linha alterou o link (CONN/DISC). */
  onlineMode?: At05OnlineMode;
};

/**
 * Buffer textual que só completa mensagem em \\r\\n.
 * Mantém resto incompleto (suporta chunks fragmentados).
 */
export function createAt05OnlineCrlfBuffer() {
  let buffer = "";
  return {
    push(chunk: string): string[] {
      if (!chunk) return [];
      buffer += chunk;
      const lines: string[] = [];
      while (true) {
        const idx = buffer.indexOf("\r\n");
        if (idx < 0) break;
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // AT05 pode enviar \r extras antes do \r\n (ex.: AT+SPPDISC\r\r\n).
        while (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }
        if (line.length > 0) lines.push(line);
      }
      return lines;
    },
    reset() {
      buffer = "";
    },
    getPending() {
      return buffer;
    },
  };
}

export type At05OnlineCrlfBuffer = ReturnType<typeof createAt05OnlineCrlfBuffer>;

/** Classifica uma linha completa (sem terminador). Sem inventar regras extras. */
export function interpretAt05OnlineLine(
  line: string,
  at: number = Date.now(),
): At05OnlineInterpretedEvent {
  if (line.startsWith("AT+SPPCONN=")) {
    const address = line.slice("AT+SPPCONN=".length);
    return {
      at,
      tipo: "CONEXÃO",
      summary: `AT05 conectado · ${address}`,
      line,
      address,
      onlineMode: "CONECTADO",
    };
  }
  if (line === "AT+SPPDISC") {
    return {
      at,
      tipo: "CONEXÃO",
      summary: "AT05 desconectado",
      line,
      onlineMode: "DESCONECTADO",
    };
  }
  if (Object.prototype.hasOwnProperty.call(AT05_FUNCTION_CARDS, line)) {
    const functionName = AT05_FUNCTION_CARDS[line as At05FunctionCardRfid];
    return {
      at,
      tipo: "CARTÃO DE FUNÇÃO",
      summary: `${functionName} · ${line}`,
      line,
      rfid: line,
      functionName,
    };
  }
  if (/^\d+$/.test(line)) {
    return {
      at,
      tipo: "IDENTIFICAÇÃO RFID",
      summary: line,
      line,
      rfid: line,
    };
  }
  return {
    at,
    tipo: "DESCONHECIDO",
    summary: line,
    line,
  };
}

/**
 * Eventos ONLINE (RFID, cartão, CONN/DISC, etc.) NUNCA encerram a sessão Web Serial.
 * A sessão só termina por disconnect explícito, unmount/cleanup ou erro irrecuperável da porta.
 */
export function at05OnlineEventShouldEndSerialSession(
  _ev: At05OnlineInterpretedEvent,
): boolean {
  return false;
}

export type At05OnlineRxProcessorOptions = {
  onIdentificationRfid: (rfid: string, ev: At05OnlineInterpretedEvent) => void;
  onObservedLink?: (mode: At05OnlineMode) => void;
  onEvent?: (ev: At05OnlineInterpretedEvent) => void;
  /** Anti-bounce do mesmo RFID (ms). Não encerra sessão. Default 250. */
  sameRfidDedupeMs?: number;
};

/**
 * Camada reutilizável: buffer CRLF + interpretAt05OnlineLine.
 * Vários RFIDs consecutivos são processados na mesma sessão (sem fechar reader).
 */
export function createAt05OnlineRxProcessor(options: At05OnlineRxProcessorOptions) {
  const buffer = createAt05OnlineCrlfBuffer();
  const dedupeMs = options.sameRfidDedupeMs ?? 250;
  let lastAcceptedRfid: string | null = null;
  let lastAcceptedAt = 0;
  let identificationCount = 0;

  return {
    pushChunk(chunk: string): At05OnlineInterpretedEvent[] {
      if (!chunk) return [];
      const out: At05OnlineInterpretedEvent[] = [];
      for (const line of buffer.push(chunk)) {
        const ev = interpretAt05OnlineLine(line);
        out.push(ev);
        options.onEvent?.(ev);
        if (ev.onlineMode) {
          options.onObservedLink?.(ev.onlineMode);
        }
        if (ev.tipo !== "IDENTIFICAÇÃO RFID" || !ev.rfid) {
          continue;
        }
        const now = Date.now();
        if (lastAcceptedRfid === ev.rfid && now - lastAcceptedAt < dedupeMs) {
          continue;
        }
        lastAcceptedRfid = ev.rfid;
        lastAcceptedAt = now;
        identificationCount += 1;
        options.onIdentificationRfid(ev.rfid, ev);
      }
      return out;
    },
    getIdentificationCount() {
      return identificationCount;
    },
    reset() {
      buffer.reset();
      lastAcceptedRfid = null;
      lastAcceptedAt = 0;
    },
  };
}

export type At05OnlineRxProcessor = ReturnType<typeof createAt05OnlineRxProcessor>;

export function appendOnlineEventHistory(
  events: At05OnlineInterpretedEvent[],
  event: At05OnlineInterpretedEvent,
): At05OnlineInterpretedEvent[] {
  return [event, ...events].slice(0, AT05_ONLINE_EVENT_HISTORY_MAX);
}
