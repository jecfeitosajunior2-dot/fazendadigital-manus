import { normalizeRfidKey } from "@shared/rfidUnicidade";

export const MSG_RFID_BASTAO_INDISPONIVEL =
  "Leitura por bastão não disponível neste navegador. O RFID pode ser informado manualmente.";

export const MSG_RFID_CONEXAO_FALHOU = "Não foi possível conectar ao leitor RFID.";

export const MSG_RFID_SUBSTITUIR =
  "Já existe um RFID informado. Deseja substituir pelo RFID lido?";

export type DecisaoRfidLido = "aplicar" | "manter" | "confirmar";

/** RFID lido no cadastro inicial: preenche, confirma ou ignora. Não persiste. */
export function decidirAplicacaoRfidLido(
  valorAtual: string | null | undefined,
  rfidLido: string | null | undefined,
): DecisaoRfidLido {
  const lido = normalizeRfidKey(rfidLido);
  if (!lido) return "manter";
  const atual = normalizeRfidKey(valorAtual);
  if (!atual) return "aplicar";
  if (atual === lido) return "manter";
  return "confirmar";
}

export function deveMostrarLeituraRfidCadastro(isEditMode: boolean): boolean {
  return !isEditMode;
}

export type StatusLeitorRfidCadastro =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected"
  | "capturing"
  | "error";

export function textoStatusLeitorRfid(status: StatusLeitorRfidCadastro): string {
  switch (status) {
    case "unsupported":
      return MSG_RFID_BASTAO_INDISPONIVEL;
    case "connecting":
      return "Conectando...";
    case "capturing":
      return "Aguardando leitura...";
    case "connected":
      return "Leitor conectado";
    case "error":
      return MSG_RFID_CONEXAO_FALHOU;
    default:
      return "Leitor desconectado";
  }
}
