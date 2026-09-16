/**
 * Nomes amigáveis das portas no Fazenda Digital.
 * Não altera driver, baud, open() nem o protocolo — só identificação na UI.
 *
 * O popup nativo do Chrome não pode ser renomeado. Esta camada:
 * - classifica USB (balança) vs Bluetooth sem USB id (bastão);
 * - lembra o papel da última conexão bem-sucedida;
 * - mostra o nome técnico que o Windows/Chrome costuma usar.
 */

export type EquipamentoSerialPapel = "bastao" | "balanca" | "desconhecido";

export type PortaSerialRotulo = {
  key: string;
  papelSugerido: EquipamentoSerialPapel;
  nomeAmigavel: string;
  nomeNoChrome: string;
  detalhe: string;
  /** Só preenchido se o navegador/Windows expuser COM de forma explícita. Nunca inventado. */
  comConhecida: string | null;
};

const COM_RE = /\bCOM\d+\b/i;

/** Extrai COMx somente de um texto que já contenha esse padrão. */
export function extractKnownComLabel(source: string | null | undefined): string | null {
  const m = (source ?? "").match(COM_RE);
  return m ? m[0]!.toUpperCase() : null;
}

/**
 * Web Serial padrão só entrega usbVendorId/usbProductId.
 * Se alguma implementação expor `name` com COM, usamos; senão null (não inventar).
 */
export function comFromSerialPort(port: SerialPort): string | null {
  const info = port.getInfo() as SerialPortInfo & { name?: string };
  return extractKnownComLabel(info.name);
}

export function linhaModeloComCom(modelo: string, com: string | null | undefined): string {
  const known = extractKnownComLabel(com);
  if (known) return `${modelo} · ${known}`;
  return modelo;
}

export function statusOperacionalEquipamento(
  status: "idle" | "connecting" | "connected" | "listening" | "error" | "disconnected",
  genero: "m" | "f",
): string {
  switch (status) {
    case "connecting":
      return "Conectando...";
    case "connected":
    case "listening":
      return genero === "f" ? "Conectada" : "Conectado";
    case "error":
      return "Erro de conexão";
    default:
      return genero === "f" ? "Desconectada" : "Desconectado";
  }
}

export function mensagemErroAberturaAt05(detalhe: string | null | undefined): string {
  const raw = (detalhe ?? "").trim();
  if (raw.includes("Esta porta é da balança") || raw.includes("COM USB da balança")) return raw;
  if (/locked|already open|InvalidStateError|in use/i.test(raw)) {
    return "A porta do AT05 já está sendo utilizada em outra aba ou aplicativo.";
  }
  if (/Failed to open|NetworkError|Access denied/i.test(raw)) {
    return "Não foi possível abrir a porta do AT05.";
  }
  if (!raw) return "Não foi possível abrir a porta do AT05.";
  return "Não foi possível abrir a porta do AT05.";
}

export function mensagemErroAberturaBalanca(detalhe: string | null | undefined): string {
  const raw = (detalhe ?? "").trim();
  if (raw.includes("bastão RFID")) return raw;
  if (/locked|already open|InvalidStateError|in use/i.test(raw)) {
    return "A porta da Tru-Test S3 já está sendo utilizada em outra aba ou aplicativo.";
  }
  if (/Failed to open|NetworkError|Access denied/i.test(raw)) {
    return "Não foi possível abrir a porta da Tru-Test S3.";
  }
  if (!raw) return "Não foi possível abrir a porta da Tru-Test S3.";
  return "Não foi possível abrir a porta da Tru-Test S3.";
}

const STORAGE_KEY = "fd.serial.portRole.v1";

export function serialPortIdentityKey(port: SerialPort): string {
  const info = port.getInfo();
  if (info.usbVendorId != null) {
    return `usb:${info.usbVendorId}:${info.usbProductId ?? 0}`;
  }
  return "bt:spp";
}

export function isUsbWebSerialPort(port: SerialPort): boolean {
  return port.getInfo().usbVendorId != null;
}

function readRememberedRoles(): Record<string, EquipamentoSerialPapel> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, EquipamentoSerialPapel>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberSerialPortRole(port: SerialPort, papel: EquipamentoSerialPapel): void {
  if (papel === "desconhecido" || typeof localStorage === "undefined") return;
  try {
    const next = { ...readRememberedRoles(), [serialPortIdentityKey(port)]: papel };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / modo privado */
  }
}

export function rememberedSerialPortRole(port: SerialPort): EquipamentoSerialPapel | null {
  const papel = readRememberedRoles()[serialPortIdentityKey(port)];
  return papel === "bastao" || papel === "balanca" ? papel : null;
}

function inferPapel(port: SerialPort): EquipamentoSerialPapel {
  const remembered = rememberedSerialPortRole(port);
  if (remembered) return remembered;
  return isUsbWebSerialPort(port) ? "balanca" : "bastao";
}

export function rotuloPortaSerial(port: SerialPort): PortaSerialRotulo {
  const papelSugerido = inferPapel(port);
  const key = serialPortIdentityKey(port);

  const comConhecida = comFromSerialPort(port);

  if (papelSugerido === "balanca") {
    return {
      key,
      papelSugerido,
      nomeAmigavel: linhaModeloComCom("Tru-Test S3", comConhecida),
      nomeNoChrome: "Virtual Serial Port / COM USB",
      detalhe: "Use só em Conectar balança. Não escolha esta porta no bastão.",
      comConhecida,
    };
  }

  if (papelSugerido === "bastao") {
    return {
      key,
      papelSugerido,
      nomeAmigavel: linhaModeloComCom("AT05", comConhecida),
      nomeNoChrome: "AT05 pareado / SPP Dev",
      detalhe: "Use só em Conectar bastão. O bastão precisa estar ligado e pareado.",
      comConhecida,
    };
  }

  return {
    key,
    papelSugerido: "desconhecido",
    nomeAmigavel: "Porta serial (não identificada)",
    nomeNoChrome: "Nome técnico do Chrome/Windows",
    detalhe: "Confira se é o cabo da balança (USB) ou o bastão (Bluetooth).",
    comConhecida,
  };
}

export async function listarPortasAutorizadasRotuladas(): Promise<
  Array<{ port: SerialPort; rotulo: PortaSerialRotulo }>
> {
  if (typeof navigator === "undefined" || !navigator.serial) return [];
  const ports = await navigator.serial.getPorts();
  return ports.map(port => ({ port, rotulo: rotuloPortaSerial(port) }));
}

export function filterLikelyAt05SerialPorts(ports: readonly SerialPort[]): SerialPort[] {
  return ports.filter(p => rotuloPortaSerial(p).papelSugerido === "bastao");
}

export function filterLikelyScaleSerialPorts(ports: readonly SerialPort[]): SerialPort[] {
  return ports.filter(p => rotuloPortaSerial(p).papelSugerido === "balanca");
}

export async function resolveAt05PortForConnect(
  requestNewPort: () => Promise<SerialPort>,
): Promise<{ port: SerialPort; source: "authorized" | "requested" }> {
  const ports = await navigator.serial!.getPorts();
  const candidates = filterLikelyAt05SerialPorts(ports);
  if (candidates.length === 1) {
    return { port: candidates[0]!, source: "authorized" };
  }
  const port = await requestNewPort();
  return { port, source: "requested" };
}

export async function resolveScalePortForConnect(
  requestNewPort: () => Promise<SerialPort>,
): Promise<{ port: SerialPort; source: "authorized" | "requested" }> {
  const ports = await navigator.serial!.getPorts();
  const candidates = filterLikelyScaleSerialPorts(ports);
  if (candidates.length === 1) {
    return { port: candidates[0]!, source: "authorized" };
  }
  const port = await requestNewPort();
  return { port, source: "requested" };
}
