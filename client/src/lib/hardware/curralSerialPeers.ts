/**
 * Portas Web Serial ativas no hub curral (bastão + balança).
 * Evita que o cleanup de um periférico feche a COM do outro.
 */

export function isSerialPortOpen(port: SerialPort): boolean {
  return port.readable != null || port.writable != null;
}

let curralScaleActivePort: SerialPort | null = null;
let curralAt05ActivePort: SerialPort | null = null;

export function registerCurralScaleSerialPort(port: SerialPort | null): void {
  curralScaleActivePort = port;
}

export function registerCurralAt05SerialPort(port: SerialPort | null): void {
  curralAt05ActivePort = port;
}

export function getCurralScaleSerialPort(): SerialPort | null {
  return curralScaleActivePort;
}

export function getCurralAt05SerialPort(): SerialPort | null {
  return curralAt05ActivePort;
}

function serialPortUsbIdentityKey(port: SerialPort): string | null {
  const info = port.getInfo();
  if (info.usbVendorId == null || info.usbProductId == null) return null;
  return `usb:${info.usbVendorId}:${info.usbProductId}`;
}

/** Mesmo dispositivo USB autorizado duas vezes (comum com COM virtual da balança). */
export function isSameAuthorizedSerialPort(a: SerialPort, b: SerialPort): boolean {
  if (a === b) return true;
  const keyA = serialPortUsbIdentityKey(a);
  const keyB = serialPortUsbIdentityKey(b);
  return keyA != null && keyA === keyB;
}

/** Porta em uso pela balança (instância ou mesmo USB id da sessão ativa). */
export function isCurralScaleSerialPort(port: SerialPort): boolean {
  if (curralScaleActivePort == null || !isSerialPortOpen(curralScaleActivePort)) {
    return false;
  }
  return isSameAuthorizedSerialPort(port, curralScaleActivePort);
}

export function isCurralAt05SerialPort(port: SerialPort): boolean {
  return (
    curralAt05ActivePort != null &&
    port === curralAt05ActivePort &&
    isSerialPortOpen(curralAt05ActivePort)
  );
}

export function isProtectedCurralSerialPort(port: SerialPort): boolean {
  return isCurralScaleSerialPort(port) || isCurralAt05SerialPort(port);
}

export function collectCurralPeerExceptPorts(): SerialPort[] {
  const except: SerialPort[] = [];
  if (curralScaleActivePort && isSerialPortOpen(curralScaleActivePort)) {
    except.push(curralScaleActivePort);
  }
  if (curralAt05ActivePort && isSerialPortOpen(curralAt05ActivePort)) {
    except.push(curralAt05ActivePort);
  }
  return except;
}
