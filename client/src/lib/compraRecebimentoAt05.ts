import { interpretAt05OnlineLine } from "@/lib/hardware/at05ProtocolDiag";
import { normalizeRfidKey } from "@shared/rfidUnicidade";

export type DecisaoRfidRecebimento =
  | { aplicar: true; rfid: string }
  | { aplicar: false; motivo: "rfid_vazio" | "nao_aceitando" | "ciclo_stale" | "nao_identificacao" };

export function formularioRecebimentoAptoParaRfid(input: {
  grupoSelecionado: boolean;
  pendentes: number;
  confirmando: boolean;
}): boolean {
  return input.grupoSelecionado && input.pendentes > 0 && !input.confirmando;
}

export function deveGuardarRfidPendenteRecebimento(input: {
  motivo: Exclude<DecisaoRfidRecebimento, { aplicar: true }>["motivo"];
  confirmando: boolean;
}): boolean {
  return input.motivo === "nao_aceitando" && !input.confirmando;
}

/** Mesmo parser do driver compartilhado — não inventa regra só da Compra. */
export function rfidIdentificacaoAt05NaLinha(line: string): string | null {
  const ev = interpretAt05OnlineLine(line);
  if (ev.tipo !== "IDENTIFICAÇÃO RFID" || !ev.rfid) return null;
  return ev.rfid;
}

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

export function decidirLeituraAt05RecebimentoCompra(input: {
  line: string;
  aceitandoLeituras: boolean;
  cicloAtual: number;
  cicloDaLeitura: number;
}): DecisaoRfidRecebimento {
  const rfid = rfidIdentificacaoAt05NaLinha(input.line);
  if (!rfid) return { aplicar: false, motivo: "nao_identificacao" };
  return deveAplicarRfidRecebimentoCompra({
    rfid,
    aceitandoLeituras: input.aceitandoLeituras,
    cicloAtual: input.cicloAtual,
    cicloDaLeitura: input.cicloDaLeitura,
  });
}

export function aplicarRfidNoFormularioRecebimento(
  atual: string,
  lido: string,
): string {
  return normalizeRfidKey(lido) || atual;
}
