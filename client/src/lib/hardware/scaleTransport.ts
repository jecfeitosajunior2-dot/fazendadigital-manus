export type ScaleTransport = "ble" | "usb";

export function mensagemScaleJaConectada(atual: ScaleTransport): string {
  return atual === "ble"
    ? "A Tru-Test S3 já está conectada via Bluetooth."
    : "A Tru-Test S3 já está conectada via USB.";
}

export function subtituloScaleCard(opts: {
  connected: boolean;
  transport: ScaleTransport | null;
  usbCom?: string | null;
}): string | null {
  if (!opts.connected || !opts.transport) return null;
  if (opts.transport === "ble") return "Bluetooth";
  const com = opts.usbCom?.trim();
  return com ? `USB · ${com}` : "USB";
}

export function ajudaScaleCard(opts: {
  connected: boolean;
  connecting: boolean;
  bleSupported: boolean;
}): string | undefined {
  if (opts.connecting) return undefined;
  if (opts.connected) return "Aguardando peso...";
  if (!opts.bleSupported) return "Bluetooth não disponível neste navegador. Use USB.";
  return "Conecte a Tru-Test S3 para receber o peso automaticamente.";
}

export function textoPesoRecebidoBalanca(fonte: ScaleTransport): string {
  return fonte === "ble"
    ? "Recebido da Tru-Test S3 via Bluetooth."
    : "Peso recebido da balança.";
}

export function defaultScaleTransportChoice(bleSupported: boolean): ScaleTransport {
  return bleSupported ? "ble" : "usb";
}
