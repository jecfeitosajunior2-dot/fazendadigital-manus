import { isCurralScaleSerialPort } from "@/lib/hardware/curralSerialPeers";
import { rotuloPortaSerial } from "@/lib/hardware/serialPortLabels";

export {
  filterLikelyAt05SerialPorts,
  isUsbWebSerialPort,
  resolveAt05PortForConnect,
} from "@/lib/hardware/serialPortLabels";

export function describeSerialPortHint(port: SerialPort): string {
  const rotulo = rotuloPortaSerial(port);
  return `${rotulo.nomeAmigavel} · no Chrome: ${rotulo.nomeNoChrome}`;
}

export function isProtectedScalePortForAt05(port: SerialPort): boolean {
  return isCurralScaleSerialPort(port) || rotuloPortaSerial(port).papelSugerido === "balanca";
}
