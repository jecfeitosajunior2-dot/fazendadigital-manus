/**
 * Serviço isolado de leitura do bastão AnimallTAG AT05 via Web Serial (SPP).
 * POC — sem integração com Brinco Eletrônico / backend.
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

  /** Abre uma porta já obtida (requestPort ou getPorts). */
  async openPort(port: SerialPort, onLog?: At05LogHandler): Promise<void> {
    if (this.port) {
      throw new Error("Já existe uma porta aberta neste serviço. Desconecte antes.");
    }

    this.port = port;
    onLog?.(
      "Abrindo porta com baudRate=9600, dataBits=8, stopBits=1, parity=none, flowControl=none…",
    );
    try {
      await port.open(SERIAL_OPTIONS);
    } catch (err) {
      this.port = null;
      onLog?.(`Erro em port.open(): ${formatSerialError(err)}`);
      throw err;
    }
    onLog?.("Porta aberta em 9600 baud (8N1, sem flow control)");

    this.disconnectHandler = () => {
      onLog?.("Porta desconectada (evento do navegador)");
      void this.handleUnexpectedDisconnect(onLog);
    };
    port.addEventListener("disconnect", this.disconnectHandler);
  }

  async startReading(
    onRead: At05ReadHandler,
    options?: {
      onLog?: At05LogHandler;
      onStatus?: At05StatusHandler;
      onDuplicate?: (rfid: string) => void;
      dedupMs?: number;
    },
  ): Promise<void> {
    if (!this.port?.readable) {
      throw new Error("Porta serial não está aberta.");
    }
    if (this.readLoopActive) {
      options?.onLog?.("Leitura já em andamento.");
      return;
    }

    this.stopRequested = false;
    this.readLoopActive = true;
    const parser = createAt05LineParser();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const dedupMs = options?.dedupMs ?? AT05_DEDUP_MS;

    options?.onStatus?.("listening");
    options?.onLog?.("Aguardando leitura");

    try {
      while (this.port?.readable && !this.stopRequested) {
        this.reader = this.port.readable.getReader();
        try {
          while (!this.stopRequested) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (!value || value.byteLength === 0) continue;

            const chunk = decoder.decode(value, { stream: true });
            options?.onLog?.(
              `Chunk recebido (${value.byteLength} bytes): ${JSON.stringify(chunk)}`,
            );

            const lines = parser.push(chunk);
            for (const line of lines) {
              this.handleLine(line, onRead, options?.onLog, options?.onDuplicate, dedupMs);
            }
          }
        } catch (err) {
          if (!this.stopRequested) {
            options?.onLog?.(`Erro na leitura: ${formatSerialError(err)}`);
            options?.onStatus?.("error");
            throw err;
          }
        } finally {
          try {
            this.reader.releaseLock();
          } catch {
            /* ignore */
          }
          this.reader = null;
        }

        if (this.stopRequested) break;
        break;
      }
    } finally {
      this.readLoopActive = false;
      parser.reset();
    }
  }

  private handleLine(
    line: string,
    onRead: At05ReadHandler,
    onLog: At05LogHandler | undefined,
    onDuplicate: ((rfid: string) => void) | undefined,
    dedupMs: number,
  ) {
    const rfid = normalizeAt05Rfid(line);
    if (!rfid) {
      onLog?.(`Leitura inválida ignorada: ${JSON.stringify(line)}`);
      return;
    }

    const now = Date.now();
    if (
      this.lastAcceptedRfid === rfid &&
      now - this.lastAcceptedAt < dedupMs
    ) {
      onLog?.(`Leitura ignorada por duplicidade: ${rfid}`);
      onDuplicate?.(rfid);
      return;
    }

    this.lastAcceptedRfid = rfid;
    this.lastAcceptedAt = now;
    onLog?.(`RFID recebido: ${rfid}`);
    onRead(rfid);
  }

  async disconnect(onLog?: At05LogHandler): Promise<void> {
    this.stopRequested = true;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        /* ignore */
      }
      try {
        this.reader.releaseLock();
      } catch {
        /* ignore */
      }
      this.reader = null;
    }

    if (this.port) {
      if (this.disconnectHandler) {
        this.port.removeEventListener("disconnect", this.disconnectHandler);
        this.disconnectHandler = null;
      }
      try {
        await this.port.close();
        onLog?.("Porta fechada");
      } catch (err) {
        onLog?.(`Erro ao fechar porta: ${formatSerialError(err)}`);
      }
      this.port = null;
    }

    this.readLoopActive = false;
    this.lastAcceptedRfid = null;
    this.lastAcceptedAt = 0;
  }

  private async handleUnexpectedDisconnect(onLog?: At05LogHandler) {
    this.stopRequested = true;
    this.reader = null;
    this.port = null;
    this.readLoopActive = false;
    onLog?.("Conexão encerrada inesperadamente");
  }
}
