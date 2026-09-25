import { normalizeRfidKey } from "@shared/rfidUnicidade";

export type DecisaoRfidRecebimento =
  | { aplicar: true; rfid: string }
  | { aplicar: false; motivo: "rfid_vazio" | "nao_aceitando" | "ciclo_stale" };

export function proximoCicloCapturaRecebimento(ciclo: number): number {
  return ciclo + 1;
}

export function rotuloStatusAt05Recebimento(input: {
  sessionActive: boolean;
  connecting: boolean;
}): string {
  if (input.connecting) return "AT05 conectando...";
  if (input.sessionActive) return "AT05 conectado";
  return "";
}

/**
 * Destino da leitura no recebimento: só o campo RFID do formulário aberto.
 * Não confirma animal. Não enfileira leitura para o próximo.
 */
export function deveAplicarRfidRecebimentoCompra(input: {
  rfid: string;
  aceitandoLeituras: boolean;
  cicloAtual: number;
  cicloDaLeitura: number;
}): DecisaoRfidRecebimento {
  const rfid = normalizeRfidKey(input.rfid);
  if (!rfid) return { aplicar: false, motivo: "rfid_vazio" };
  if (!input.aceitandoLeituras) return { aplicar: false, motivo: "nao_aceitando" };
  if (input.cicloDaLeitura !== input.cicloAtual) {
    return { aplicar: false, motivo: "ciclo_stale" };
  }
  return { aplicar: true, rfid };
}

export function aplicarRfidNoFormularioRecebimento(
  atual: string,
  lido: string,
): string {
  return normalizeRfidKey(lido) || atual;
}
