import { RACAS } from "./animal-types";
import { parseDataCadastroISO, parsePesoPositivo } from "./pesoEntrada";
import { hojeISODateLocal } from "./transferirAnimaisEntreLotes";

export const MSG_RECEBIMENTO_COMPRA_NAO_ENCONTRADA = "Compra não encontrada.";
export const MSG_RECEBIMENTO_COMPRA_CANCELADA =
  "Esta compra está cancelada e não aceita recebimento.";
export const MSG_RECEBIMENTO_COMPRA_NAO_CONCLUIDA =
  "Só é possível receber animais de uma compra concluída.";
export const MSG_RECEBIMENTO_GRUPO_NAO_ENCONTRADO = "Grupo da compra não encontrado.";
export const MSG_RECEBIMENTO_GRUPO_ESGOTADO =
  "Este grupo já atingiu a quantidade comprada.";
export const MSG_RECEBIMENTO_BRINCO = "Informe o brinco visual.";
export const MSG_RECEBIMENTO_DATA = "Informe uma data de recebimento válida.";
export const MSG_RECEBIMENTO_DATA_FUTURA = "A data de recebimento não pode ser futura.";
export const MSG_RECEBIMENTO_LOTE_FAZENDA = "O lote não pertence à fazenda desta compra.";
export const MSG_RECEBIMENTO_LOTE_INATIVO = "O lote selecionado não está ativo.";
export const MSG_RECEBIMENTO_LOTE_NAO_ENCONTRADO = "Lote não encontrado.";
export const MSG_RECEBIMENTO_PASTO_FAZENDA = "O pasto não pertence à fazenda desta compra.";
export const MSG_RECEBIMENTO_PASTO_NAO_ENCONTRADO = "Pasto não encontrado.";
export const MSG_RECEBIMENTO_RACA = "Raça não cadastrada.";
export const MSG_RECEBIMENTO_PESO = "Informe um peso de entrada válido e maior que zero.";
export const MSG_RECEBIMENTO_SEM_FAZENDA = "A compra não tem fazenda para receber os animais.";
export const MSG_RECEBIMENTO_FALHOU = "Não foi possível confirmar a entrada do animal.";

export function observacaoRecebimentoCompra(compraId: number): string {
  return `Recebimento da Compra ${compraId}`;
}

export type PesagemRecebimentoRef = {
  peso?: unknown;
  observacoes?: string | null;
};

export type ExibicaoPesoEntrada =
  | { origem: "compra_pesagem"; pesoKg: number; compraId: number; somenteLeitura: true }
  | { origem: "compra_sem_pesagem"; pesoKg: null; compraId: number; somenteLeitura: true }
  | { origem: "cadastral"; pesoKg: number | null; somenteLeitura: false };

export function compraIdRecebimento(value: unknown): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export function isPesagemRecebimentoCompra(
  pesagem: PesagemRecebimentoRef,
  compraId: number,
): boolean {
  return String(pesagem.observacoes ?? "").trim() === observacaoRecebimentoCompra(compraId);
}

/** Só aceita a pesagem do recebimento quando há exatamente um match da observação oficial. */
export function localizarPesagemRecebimentoCompra(
  pesagens: readonly PesagemRecebimentoRef[],
  compraId: number | null,
): { pesoKg: number; compraId: number } | null {
  if (compraId == null) return null;
  const matches = pesagens.filter(p => isPesagemRecebimentoCompra(p, compraId));
  if (matches.length !== 1) return null;
  const pesoKg = parsePesoPositivo(matches[0]?.peso);
  if (pesoKg == null) return null;
  return { pesoKg, compraId };
}

export function resolverExibicaoPesoEntrada(input: {
  compraId?: unknown;
  pesoEntrada?: unknown;
  pesagens?: readonly PesagemRecebimentoRef[];
}): ExibicaoPesoEntrada {
  const compraId = compraIdRecebimento(input.compraId);
  if (compraId != null) {
    const encontrada = localizarPesagemRecebimentoCompra(input.pesagens ?? [], compraId);
    if (encontrada) {
      return { origem: "compra_pesagem", ...encontrada, somenteLeitura: true };
    }
    return { origem: "compra_sem_pesagem", pesoKg: null, compraId, somenteLeitura: true };
  }
  return {
    origem: "cadastral",
    pesoKg: parsePesoPositivo(input.pesoEntrada),
    somenteLeitura: false,
  };
}

export function formatarPesoEntradaExibicao(pesoKg: number): string {
  return `${pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export function textoAuxiliarPesoEntrada(exibicao: ExibicaoPesoEntrada): string {
  if (exibicao.origem === "compra_pesagem") {
    return `Pesagem realizada no recebimento da Compra ${exibicao.compraId}`;
  }
  if (exibicao.origem === "compra_sem_pesagem") {
    return "Nenhuma pesagem registrada no recebimento";
  }
  return "";
}

/** Compra: não enviar pesoEntrada no update — evita gravar a pesagem no cadastro. */
export function pesoEntradaNoUpdateAnimal(
  exibicao: ExibicaoPesoEntrada,
  valorFormulario: string,
): string | null | undefined {
  if (exibicao.origem !== "cadastral") return undefined;
  const trimmed = valorFormulario.trim();
  return trimmed ? trimmed : null;
}

export function racaRecebimentoValida(raca: string): boolean {
  return (RACAS as readonly string[]).includes(raca);
}

export function normalizarRecebimentoAnimalInput(input: {
  compraId: number;
  compraGrupoId: number;
  brincoVisual?: string | null;
  rfid?: string | null;
  pesoEntrada?: string | number | null;
  loteId?: number | null;
  pastoId?: number | null;
  raca?: string | null;
  observacoes?: string | null;
  dataRecebimento?: string | null;
}):
  | {
      ok: true;
      compraId: number;
      compraGrupoId: number;
      brinco: string;
      rfid: string | null;
      pesoKg: number | null;
      loteId: number | null;
      pastoId: number | null;
      raca: string | null;
      observacoes: string | null;
      dataRecebimento: string;
    }
  | { ok: false; message: string } {
  const compraId = Number(input.compraId);
  const compraGrupoId = Number(input.compraGrupoId);
  if (!Number.isInteger(compraId) || compraId <= 0) {
    return { ok: false, message: MSG_RECEBIMENTO_COMPRA_NAO_ENCONTRADA };
  }
  if (!Number.isInteger(compraGrupoId) || compraGrupoId <= 0) {
    return { ok: false, message: MSG_RECEBIMENTO_GRUPO_NAO_ENCONTRADO };
  }

  const brinco = String(input.brincoVisual ?? "").trim();
  if (!brinco) return { ok: false, message: MSG_RECEBIMENTO_BRINCO };

  const dataRecebimento = parseDataCadastroISO(input.dataRecebimento);
  if (!dataRecebimento) return { ok: false, message: MSG_RECEBIMENTO_DATA };
  if (dataRecebimento > hojeISODateLocal()) {
    return { ok: false, message: MSG_RECEBIMENTO_DATA_FUTURA };
  }

  const pesoRaw = input.pesoEntrada;
  const pesoInformado =
    pesoRaw != null && String(pesoRaw).trim() !== "";
  const pesoKg = pesoInformado ? parsePesoPositivo(pesoRaw) : null;
  if (pesoInformado && pesoKg == null) {
    return { ok: false, message: MSG_RECEBIMENTO_PESO };
  }

  const raca = String(input.raca ?? "").trim() || null;
  if (raca && !racaRecebimentoValida(raca)) {
    return { ok: false, message: MSG_RECEBIMENTO_RACA };
  }

  const loteId =
    input.loteId != null && Number(input.loteId) > 0 ? Number(input.loteId) : null;
  const pastoId =
    input.pastoId != null && Number(input.pastoId) > 0 ? Number(input.pastoId) : null;

  return {
    ok: true,
    compraId,
    compraGrupoId,
    brinco,
    rfid: String(input.rfid ?? "").trim() || null,
    pesoKg,
    loteId,
    pastoId,
    raca,
    observacoes: String(input.observacoes ?? "").trim() || null,
    dataRecebimento,
  };
}
