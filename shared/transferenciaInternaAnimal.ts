/** Regras puras da Transferência interna entre Fazendas cadastradas. */

import {
  hojeISODate,
  normalizarDataOperacional,
  MSG_BAIXA_ANIMAL_INATIVO,
  MSG_BAIXA_FAZENDA_DIVERGENTE,
} from "./animalBaixa";

export const MSG_TRANSFERENCIA_MESMA_FAZENDA =
  "Selecione uma Fazenda de destino diferente da Fazenda atual.";
export const MSG_TRANSFERENCIA_DESTINO_OBRIGATORIA =
  "Selecione a Fazenda de destino.";
export const MSG_TRANSFERENCIA_LOTE_OBRIGATORIO =
  "Selecione o Lote de destino.";
export const MSG_TRANSFERENCIA_LOTE_FAZENDA =
  "O Lote de destino precisa pertencer à Fazenda de destino.";
export const MSG_TRANSFERENCIA_LOTE_INATIVO =
  "Este Lote está inativo e não pode receber o animal.";
export const MSG_TRANSFERENCIA_PASTO_FAZENDA =
  "A subdivisão de destino precisa pertencer à Fazenda de destino.";
export const MSG_TRANSFERENCIA_DATA_OBRIGATORIA = "Data da transferência é obrigatória.";
export const MSG_TRANSFERENCIA_DATA_INVALIDA = "Data da transferência inválida.";
export const MSG_TRANSFERENCIA_DATA_FUTURA =
  "A data da transferência não pode ser futura.";
export const MSG_TRANSFERENCIA_GENERICO =
  "Não foi possível registrar a transferência interna do animal.";
export const MSG_TRANSFERENCIA_SUCESSO =
  "Transferência interna registrada. O animal permanece Ativo na Fazenda de destino.";

export const TITULO_CONFIRMAR_TRANSFERENCIA_INTERNA = "Confirmar transferência interna";
export const BOTAO_CONFIRMAR_TRANSFERENCIA = "Confirmar transferência";
export const MSG_TRANSFERENCIA_LOTE_NOME =
  "Não foi possível identificar o Lote de destino. Selecione o Lote novamente.";
export const MSG_TRANSFERENCIA_DESTINO_NOME =
  "Não foi possível identificar a Fazenda de destino. Selecione a Fazenda novamente.";

export function montarConfirmacaoTransferenciaInterna(input: {
  identificacao?: string | null;
  fazendaDestinoNome?: string | null;
  loteDestinoNome?: string | null;
}):
  | { ok: true; title: string; confirmText: string; texto: string }
  | { ok: false; message: string } {
  const identificacao = (input.identificacao ?? "").trim();
  const fazenda = (input.fazendaDestinoNome ?? "").trim();
  const lote = (input.loteDestinoNome ?? "").trim();
  if (!identificacao) return { ok: false, message: "Selecione um animal válido." };
  if (!fazenda) return { ok: false, message: MSG_TRANSFERENCIA_DESTINO_NOME };
  if (!lote) return { ok: false, message: MSG_TRANSFERENCIA_LOTE_NOME };
  return {
    ok: true,
    title: TITULO_CONFIRMAR_TRANSFERENCIA_INTERNA,
    confirmText: BOTAO_CONFIRMAR_TRANSFERENCIA,
    texto: `O animal ${identificacao} permanecerá Ativo e será transferido para ${fazenda}, Lote ${lote}.`,
  };
}

export type ValidacaoTransferenciaInterna =
  | {
      ok: true;
      dataISO: string;
      fazendaOrigemId: number;
      fazendaDestinoId: number;
      loteDestinoId: number;
      pastoDestinoId: number | null;
    }
  | { ok: false; message: string };

export function validarTransferenciaInternaInput(input: {
  fazendaOrigemId?: number | null;
  fazendaDestinoId?: number | null;
  animalId?: number | null;
  loteDestinoId?: number | null;
  loteDestinoFazendaId?: number | null;
  loteDestinoAtivo?: boolean | null;
  pastoDestinoId?: number | null;
  pastoDestinoFazendaId?: number | null;
  dataTransferencia?: string | null;
  hojeISO?: string;
}): ValidacaoTransferenciaInterna {
  if (input.fazendaOrigemId == null || input.fazendaOrigemId <= 0) {
    return { ok: false, message: "Selecione uma Fazenda." };
  }
  if (input.animalId == null || input.animalId <= 0) {
    return { ok: false, message: "Selecione um animal válido." };
  }
  if (input.fazendaDestinoId == null || input.fazendaDestinoId <= 0) {
    return { ok: false, message: MSG_TRANSFERENCIA_DESTINO_OBRIGATORIA };
  }
  if (Number(input.fazendaDestinoId) === Number(input.fazendaOrigemId)) {
    return { ok: false, message: MSG_TRANSFERENCIA_MESMA_FAZENDA };
  }
  if (!(input.dataTransferencia ?? "").trim()) {
    return { ok: false, message: MSG_TRANSFERENCIA_DATA_OBRIGATORIA };
  }
  const dataISO = normalizarDataOperacional(input.dataTransferencia);
  if (!dataISO) return { ok: false, message: MSG_TRANSFERENCIA_DATA_INVALIDA };
  if (dataISO > (input.hojeISO ?? hojeISODate())) {
    return { ok: false, message: MSG_TRANSFERENCIA_DATA_FUTURA };
  }
  if (input.loteDestinoId == null || input.loteDestinoId <= 0) {
    return { ok: false, message: MSG_TRANSFERENCIA_LOTE_OBRIGATORIO };
  }
  if (
    input.loteDestinoFazendaId != null &&
    Number(input.loteDestinoFazendaId) !== Number(input.fazendaDestinoId)
  ) {
    return { ok: false, message: MSG_TRANSFERENCIA_LOTE_FAZENDA };
  }
  if (input.loteDestinoAtivo === false) {
    return { ok: false, message: MSG_TRANSFERENCIA_LOTE_INATIVO };
  }
  const pastoDestinoId =
    input.pastoDestinoId != null && input.pastoDestinoId > 0 ? input.pastoDestinoId : null;
  if (
    pastoDestinoId != null &&
    input.pastoDestinoFazendaId != null &&
    Number(input.pastoDestinoFazendaId) !== Number(input.fazendaDestinoId)
  ) {
    return { ok: false, message: MSG_TRANSFERENCIA_PASTO_FAZENDA };
  }
  return {
    ok: true,
    dataISO,
    fazendaOrigemId: input.fazendaOrigemId,
    fazendaDestinoId: input.fazendaDestinoId,
    loteDestinoId: input.loteDestinoId,
    pastoDestinoId,
  };
}

export { MSG_BAIXA_ANIMAL_INATIVO, MSG_BAIXA_FAZENDA_DIVERGENTE };
