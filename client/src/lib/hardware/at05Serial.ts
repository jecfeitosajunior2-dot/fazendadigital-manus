/**
 * Serviço isolado de leitura do bastão AnimallTAG AT05 via Web Serial (SPP).
 * POC — sem integração com Brinco Eletrônico / backend.
 *
 * Marco válido (17/08/2026): Edge + AT05 Bluetooth SPP/COM5 → open 9600 8N1 →
 * bytes no reader → RFID como string (ex.: 963000400291061), sem DTR/RTS/TX.
 * Parser/normalize aqui; a POC de página usa o caminho direto requestPort→open→read.
 */

export type At05ReaderStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "error"
  | "disconnected";

export type At05ReadHandler = (rfid: string) => void;
export type At05LogHandler = (message: string) => void;
export type At05StatusHandler = (status: At05ReaderStatus) => void;

/** Intervalo padrão para ignorar a mesma tag em sequência. */
export const AT05_DEDUP_MS = 1000;

/** Tamanho mínimo/máximo aceito nesta POC (RFID como string de dígitos). */
export const AT05_RFID_MIN_LEN = 6;
export const AT05_RFID_MAX_LEN = 24;

const SERIAL_OPTIONS = {
  baudRate: 9600,
  dataBits: 8 as const,
  stopBits: 1 as const,
  parity: "none" as const,
  flowControl: "none" as const,
};

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.serial);
}

/** Detalha qualquer erro DOMException/Error para o log da POC. */
export function formatSerialError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name || "(sem name)";
    const message = err.message || "(sem message)";
    const stack = err.stack ? `\nstack: ${err.stack}` : "";
    return `name=${name} · message=${message} · String=${String(err)}${stack}`;
  }
  return `String=${String(err)}`;
}

export function isPortSelectionCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === "NotFoundError";
}

/** Porta já aberta no Web Serial: readable/writable deixam de ser null. */
export function isSerialPortOpen(port: SerialPort): boolean {
  return port.readable != null || port.writable != null;
}


/**
 * Fila global de cleanup — evita open() enquanto um close() anterior ainda corre
 * (HMR, navegação, clique rápido em reconectar).
 */
let at05CleanupChain: Promise<void> = Promise.resolve();

export function enqueueAt05Cleanup(task: () => Promise<void>): Promise<void> {
  const run = at05CleanupChain.then(task, task);
  at05CleanupChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function waitAt05CleanupIdle(): Promise<void> {
  await at05CleanupChain;
}

/**
 * Ordem segura exigida pelo Web Serial:
 * stop → reader.cancel() → reader.releaseLock() → port.close() → limpar refs.
 * Nunca chamar port.close() com readable/writable ainda locked.
 */
export async function safeCloseSerialSession(options: {
  reader?: ReadableStreamDefaultReader<Uint8Array> | null;
  port?: SerialPort | null;
  onBeforeClosePort?: (() => void) | null;
}): Promise<void> {
  console.info("[AT05 PROD] cleanup begin");
  const reader = options.reader ?? null;
  const port = options.port ?? null;

  if (reader) {
    try {
      console.info("[AT05 PROD] reader cancel");
      await reader.cancel();
    } catch (err) {
      console.info("[AT05 PROD] reader cancel (ignorado)", formatSerialError(err));
    }
    try {
      console.info("[AT05 PROD] reader releaseLock");
      reader.releaseLock();
    } catch (err) {
      console.info("[AT05 PROD] reader releaseLock (ignorado)", formatSerialError(err));
    }
  }

  try {
    options.onBeforeClosePort?.();
  } catch {
    /* ignore */
  }

  if (port) {
    // Se ainda houver lock em readable (reader perdido), close() falha e a COM fica presa.
    console.info("[AT05 PROD] port close", {
      readable: Boolean(port.readable),
      writable: Boolean(port.writable),
    });
    try {
      await port.close();
      console.info("[AT05 PROD] port close OK");
    } catch (err) {
      console.error("[AT05 PROD] port close FAILED", formatSerialError(err));
      throw err;
    }
  } else {
    console.info("[AT05 PROD] port close skipped (sem porta)");
  }

  console.info("[AT05 PROD] cleanup complete");
}

/**
 * Antes de um novo open(): se alguma porta autorizada ainda estiver aberta
 * (cleanup anterior falhou / aba POC / HMR), tenta fechar sem retry de open.
 */
export async function closeLingeringAuthorizedPorts(): Promise<void> {
  if (!isWebSerialAvailable()) return;
  await enqueueAt05Cleanup(async () => {
    const ports = await navigator.serial!.getPorts();
    for (const port of ports) {
      if (!port.readable && !port.writable) continue;
      console.warn("[AT05 PROD] porta autorizada ainda aberta — cleanup residual");
      try {
        // Se readable estiver locked, tenta cancelar via getReader falha —
        // ainda assim tentamos close; o caller deve ter liberado o reader próprio.
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        if (port.readable && !port.readable.locked) {
          try {
            reader = port.readable.getReader();
          } catch {
            reader = null;
          }
        }
        await safeCloseSerialSession({ reader, port });
      } catch (err) {
        console.error(
          "[AT05 PROD] não foi possível liberar porta residual",
          formatSerialError(err),
        );
      }
    }
  });
}


/** Diagnóstico do ambiente antes de requestPort / open. */
export function logWebSerialEnvironment(onLog: At05LogHandler): void {
  const ua = (
    navigator as Navigator & {
      userActivation?: { isActive?: boolean; hasBeenActive?: boolean };
    }
  ).userActivation;

  onLog(`isSecureContext=${String(window.isSecureContext)}`);
  onLog(`"serial" in navigator=${String("serial" in navigator)}`);
  onLog(`location.origin=${location.origin}`);
  onLog(`document.hasFocus()=${String(document.hasFocus())}`);
  onLog(`userActivation.isActive=${String(ua?.isActive ?? "(n/a)")}`);
  onLog(`userActivation.hasBeenActive=${String(ua?.hasBeenActive ?? "(n/a)")}`);
}

/**
 * Normaliza uma linha recebida do AT05.
 * Mantém zeros à esquerda; nunca converte para number.
 */
export function normalizeAt05Rfid(raw: string): string | null {
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!cleaned) return null;
  if (!/^\d+$/.test(cleaned)) return null;
  if (cleaned.length < AT05_RFID_MIN_LEN || cleaned.length > AT05_RFID_MAX_LEN) {
    return null;
  }
  return cleaned;
}

/**
 * Acumula chunks e emite linhas completas ao encontrar \r\n, \n ou \r.
 */
export function createAt05LineParser() {
  let buffer = "";

  return {
    push(chunk: string): string[] {
      if (!chunk) return [];
      buffer += chunk;
      const lines: string[] = [];

      // Normaliza CRLF e CR isolado para LF antes de fatiar.
      const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const parts = normalized.split("\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (part.length > 0) lines.push(part);
      }
      return lines;
    },
    flush(): string[] {
      const rest = buffer;
      buffer = "";
      return rest.length > 0 ? [rest] : [];
    },
    reset() {
      buffer = "";
    },
    getPending() {
      return buffer;
    },
  };
}

export type At05LineParser = ReturnType<typeof createAt05LineParser>;

export function formatPortInfo(info: SerialPortInfo): string {
  const parts: string[] = [];
  if (info.usbVendorId != null) {
    parts.push(`vendorId=0x${info.usbVendorId.toString(16)}`);
  }
  if (info.usbProductId != null) {
    parts.push(`productId=0x${info.usbProductId.toString(16)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "sem info USB (comum em SPP Bluetooth)";
}

export async function listAuthorizedSerialPorts(): Promise<SerialPort[]> {
  if (!isWebSerialAvailable()) return [];
  return navigator.serial!.getPorts();
}

export class At05SerialService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopActive = false;
  private stopRequested = false;
  private disconnectHandler: (() => void) | null = null;
  private lastAcceptedRfid: string | null = null;
  private lastAcceptedAt = 0;

  isConnected() {
    return Boolean(this.port);
  }

  /**
   * Deve ser chamado diretamente do clique do usuário.
   * `requestPort()` é a primeira operação serial — sem awaits prévios no serviço.
   * Sem filters.
   */
  async requestPortFromUserGesture(onLog?: At05LogHandler): Promise<SerialPort> {
    if (!isWebSerialAvailable()) {
      throw new Error(
        "Web Serial não está disponível neste navegador. Use Chrome ou Edge no desktop.",
      );
    }
    onLog?.("Chamando navigator.serial.requestPort() (sem filters)…");
    try {
      const port = await navigator.serial!.requestPort();
      onLog?.(`Porta selecionada · ${formatPortInfo(port.getInfo())}`);
      return port;
    } catch (err) {
      onLog?.(`Erro em requestPort(): ${formatSerialError(err)}`);
      throw err;
    }
  }

  /** Abre uma porta já obtida via requestPort. Nunca chama open() se já estiver aberta. */
  async openPort(port: SerialPort, onLog?: At05LogHandler): Promise<void> {
    if (this.port && this.port !== port) {
      throw new Error("Já existe outra porta aberta neste serviço. Desconecte antes.");
    }

    this.stopRequested = false;
    this.readLoopActive = false;
    this.reader = null;
    this.lastAcceptedRfid = null;
    this.lastAcceptedAt = 0;

    const readable = port.readable != null;
    const writable = port.writable != null;
    console.info(
      `[AT05 PROD] BEFORE OPEN readable=${String(readable)} writable=${String(writable)}`,
    );

    // Já aberta (mesma instância reutilizada pelo browser) — não chamar open() de novo.
    if (readable || writable) {
      console.info("[AT05 PROD] OPEN SKIP — porta já aberta nesta instância");
      this.port = port;
      onLog?.("Porta já estava aberta — reutilizando sem novo open()");
      if (!this.disconnectHandler) {
        this.disconnectHandler = () => {
          console.warn("[AT05 PROD] browser disconnect event");
          onLog?.("Porta desconectada (evento do navegador)");
        };
        port.addEventListener("disconnect", this.disconnectHandler);
      }
      return;
    }

    if (this.port === port) {
      // Ref interna aponta para esta porta mas streams null = estado inconsistente.
      this.port = null;
    }

    onLog?.(
      "Abrindo porta com baudRate=9600, dataBits=8, stopBits=1, parity=none, flowControl=none…",
    );
    console.info("[AT05 PROD] OPEN START");
    try {
      await port.open(SERIAL_OPTIONS);
    } catch (err) {
      this.port = null;
      this.reader = null;
      const name = err instanceof Error ? err.name : "(unknown)";
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AT05 PROD] OPEN FAILED name=${name} message=${message}`);
      console.info(`[AT05 PROD] port.readable=${String(port.readable != null)}`);
      console.info(`[AT05 PROD] port.writable=${String(port.writable != null)}`);
      onLog?.(`Erro em port.open(): ${formatSerialError(err)}`);
      throw err;
    }

    this.port = port;
    console.info("[AT05 PROD] OPEN OK");
    console.info("[AT05 PROD] PORT REF SET");
    onLog?.("Porta aberta em 9600 baud (8N1, sem flow control)");

    this.disconnectHandler = () => {
      console.warn("[AT05 PROD] browser disconnect event");
      onLog?.("Porta desconectada (evento do navegador)");
    };
    port.addEventListener("disconnect", this.disconnectHandler);
  }

  /** Zera refs após falha de open — não mantém SerialPort quebrada. */
  clearPortAfterOpenFailure(): void {
    this.reader = null;
    this.port = null;
    this.readLoopActive = false;
    this.stopRequested = false;
    this.disconnectHandler = null;
    console.info("[AT05 PROD] PORT REF CLEARED");
  }

  /** Porta aberta atual (para loops RX alinhados à POC). */
  getPort(): SerialPort | null {
    return this.port;
  }

  /**
   * Encerra sessão na ordem segura.
   * `externalReader`: reader criado fora do serviço (hook de produção).
   * Se `portCloseFailed`, mantém `this.port` para retry de cleanup — não finge desconectado.
   */
  async disconnect(
    onLog?: At05LogHandler,
    externalReader?: ReadableStreamDefaultReader<Uint8Array> | null,
  ): Promise<void> {
    this.stopRequested = true;

    const reader = externalReader ?? this.reader;
    const port = this.port;
    this.reader = null;

    const removeListener = () => {
      if (port && this.disconnectHandler) {
        port.removeEventListener("disconnect", this.disconnectHandler);
        this.disconnectHandler = null;
      }
    };

    try {
      await enqueueAt05Cleanup(() =>
        safeCloseSerialSession({
          reader,
          port,
          onBeforeClosePort: removeListener,
        }),
      );
      this.port = null;
      onLog?.("Porta fechada");
    } catch (err) {
      // close falhou: NÃO zerar this.port se a porta segue aberta no SO.
      if (port && (port.readable != null || port.writable != null)) {
        this.port = port;
        onLog?.(`Erro ao fechar porta (porta ainda aberta): ${formatSerialError(err)}`);
      } else {
        this.port = null;
        onLog?.(`Erro ao fechar porta: ${formatSerialError(err)}`);
      }
      throw err;
    } finally {
      this.readLoopActive = false;
      this.lastAcceptedRfid = null;
      this.lastAcceptedAt = 0;
    }
  }
}
