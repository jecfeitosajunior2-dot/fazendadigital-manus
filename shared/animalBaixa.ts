/** Regras puras do evento operacional Baixa do Animal. */

import { validarMotivoMortePersistido } from "./causaMorte";

export const TIPOS_BAIXA_ANIMAL = ["venda", "morte", "transferencia"] as const;
export type TipoBaixaAnimal = (typeof TIPOS_BAIXA_ANIMAL)[number];

/** Tipos que o Manejo → Movimentação do Animal ainda pode criar. */
export const TIPOS_MOVIMENTACAO_ANIMAL = ["morte", "transferencia"] as const;
export type TipoMovimentacaoAnimal = (typeof TIPOS_MOVIMENTACAO_ANIMAL)[number];

export const STATUS_BAIXA_ANIMAL = ["vendido", "morto", "transferido"] as const;
export type StatusBaixaAnimal = (typeof STATUS_BAIXA_ANIMAL)[number];
export type StatusAnimal = "ativo" | StatusBaixaAnimal;

export const TIPO_BAIXA_LABEL: Record<TipoBaixaAnimal, string> = {
  venda: "Venda",
  morte: "Morte",
  transferencia: "Transferência",
};

export const STATUS_ANIMAL_LABEL: Record<StatusAnimal, string> = {
  ativo: "Ativo",
  vendido: "Vendido",
  morto: "Morto",
  transferido: "Transferido",
};

export const MSG_BAIXA_DUPLICADA =
  "Este animal já possui uma baixa registrada e não pode receber uma nova baixa.";
export const MSG_SAIDA_VENDA_DUPLICADA =
  "Este animal já possui uma saída registrada e não pode ser vendido novamente.";
export const MSG_SAIDA_MORTE_DUPLICADA =
  "Este animal já possui uma saída registrada e não pode receber um novo evento de morte.";
export const MSG_SAIDA_TRANSFERENCIA_DUPLICADA =
  "Este animal já possui uma saída registrada e não pode ser transferido novamente.";
export const MSG_BAIXA_ANIMAL_INATIVO =
  "Somente animais ativos podem receber uma baixa.";
export const MSG_BAIXA_FAZENDA_DIVERGENTE =
  "O animal selecionado não pertence à Fazenda informada.";
export const MSG_BAIXA_DATA_OBRIGATORIA = "Data da baixa é obrigatória.";
export const MSG_BAIXA_DATA_INVALIDA = "Data da baixa inválida.";
export const MSG_BAIXA_DATA_FUTURA = "A data da baixa não pode ser futura.";
export const MSG_BAIXA_TIPO_OBRIGATORIO = "Selecione o tipo de baixa.";
export const MSG_TRANSFERENCIA_EXTERNA_DESTINO =
  "Informe o destino da transferência.";
export const MSG_VENDA_VIA_MANEJO_BLOQUEADA =
  "Venda deve ser registrada em Compra e Venda → Vendas.";
export const MSG_BAIXA_GENERICO = "Não foi possível registrar a baixa do animal.";
export const MSG_BAIXA_SUCESSO = "Baixa do animal registrada com sucesso.";
export const MSG_STATUS_ALTERACAO_DIRETA =
  "O Status do animal não pode ser alterado no cadastro. Use Manejo → Movimentação do Animal.";
export const MSG_MANEJO_BAIXA_LEGADA =
  "Não é possível registrar este manejo porque o animal possui uma baixa legada sem data confiável.";

export function mensagemSaidaDuplicada(tipo?: string | null): string {
  if (tipo === "venda") return MSG_SAIDA_VENDA_DUPLICADA;
  if (tipo === "morte") return MSG_SAIDA_MORTE_DUPLICADA;
  if (tipo === "transferencia") return MSG_SAIDA_TRANSFERENCIA_DUPLICADA;
  return MSG_BAIXA_DUPLICADA;
}

const STATUS_BAIXA_SET = new Set<string>(STATUS_BAIXA_ANIMAL);
const TIPO_BAIXA_SET = new Set<string>(TIPOS_BAIXA_ANIMAL);

export function isStatusAnimalBaixado(
  status?: string | null,
): status is StatusBaixaAnimal {
  return STATUS_BAIXA_SET.has((status ?? "").trim().toLowerCase());
}

export function isTipoBaixaAnimal(
  tipo?: string | null,
): tipo is TipoBaixaAnimal {
  return TIPO_BAIXA_SET.has((tipo ?? "").trim().toLowerCase());
}

export function tipoBaixaParaStatus(tipo: TipoBaixaAnimal): StatusBaixaAnimal {
  if (tipo === "venda") return "vendido";
  if (tipo === "morte") return "morto";
  return "transferido";
}

export function hojeISODate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizarDataOperacional(value?: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }
  const iso = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    return null;
  }
  return iso;
}

export function formatarDataBaixa(value?: string | Date | null): string {
  const iso = normalizarDataOperacional(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const TITULO_CONFIRMAR_TRANSFERENCIA_EXTERNA = "Confirmar transferência externa";
export const BOTAO_CONFIRMAR_TRANSFERENCIA_EXTERNA = "Confirmar transferência";

export function montarConfirmacaoTransferenciaExterna(input: {
  identificacao?: string | null;
  destino?: string | null;
  dataISO?: string | null;
}):
  | { ok: true; title: string; confirmText: string; texto: string }
  | { ok: false; message: string } {
  const identificacao = (input.identificacao ?? "").trim();
  const destino = (input.destino ?? "").trim();
  const dataBr = formatarDataBaixa(input.dataISO);
  if (!identificacao) return { ok: false, message: "Selecione um animal válido." };
  if (!destino) return { ok: false, message: MSG_TRANSFERENCIA_EXTERNA_DESTINO };
  if (dataBr === "—") return { ok: false, message: MSG_BAIXA_DATA_INVALIDA };
  return {
    ok: true,
    title: TITULO_CONFIRMAR_TRANSFERENCIA_EXTERNA,
    confirmText: BOTAO_CONFIRMAR_TRANSFERENCIA_EXTERNA,
    texto: `O animal ${identificacao} será marcado como Transferido e enviado para ${destino} em ${dataBr}. Essa ação ficará registrada no histórico.`,
  };
}

export type ValidacaoBaixaAnimal =
  | { ok: true; dataISO: string; tipo: TipoBaixaAnimal; status: StatusBaixaAnimal }
  | { ok: false; message: string };

export function validarBaixaAnimalInput(input: {
  fazendaId?: number | null;
  animalId?: number | null;
  dataBaixa?: string | null;
  tipo?: string | null;
  destino?: string | null;
  motivo?: string | null;
  hojeISO?: string;
}): ValidacaoBaixaAnimal {
  if (input.fazendaId == null || input.fazendaId <= 0) {
    return { ok: false, message: "Selecione uma Fazenda." };
  }
  if (input.animalId == null || input.animalId <= 0) {
    return { ok: false, message: "Selecione um animal válido." };
  }
  if (!(input.dataBaixa ?? "").trim()) {
    return { ok: false, message: MSG_BAIXA_DATA_OBRIGATORIA };
  }
  const dataISO = normalizarDataOperacional(input.dataBaixa);
  if (!dataISO) return { ok: false, message: MSG_BAIXA_DATA_INVALIDA };
  if (dataISO > (input.hojeISO ?? hojeISODate())) {
    return { ok: false, message: MSG_BAIXA_DATA_FUTURA };
  }
  if (!isTipoBaixaAnimal(input.tipo)) {
    return { ok: false, message: MSG_BAIXA_TIPO_OBRIGATORIO };
  }
  if (input.tipo === "venda") {
    return { ok: false, message: MSG_VENDA_VIA_MANEJO_BLOQUEADA };
  }
  if (input.tipo === "transferencia" && !(input.destino ?? "").trim()) {
    return { ok: false, message: MSG_TRANSFERENCIA_EXTERNA_DESTINO };
  }
  if (input.tipo === "morte") {
    const causa = validarMotivoMortePersistido(input.motivo);
    if (!causa.ok) return { ok: false, message: causa.message };
  }
  return {
    ok: true,
    dataISO,
    tipo: input.tipo,
    status: tipoBaixaParaStatus(input.tipo),
  };
}

export type AvaliacaoManejoVsBaixa =
  | { permitido: true }
  | { permitido: false; codigo: "BAIXA_LEGADA_SEM_DATA" | "MANEJO_APOS_BAIXA"; mensagem: string };

/**
 * Ativo: segue o fluxo normal.
 * Baixado com evento: aceita retroativo até a data da baixa, inclusive.
 * Legado baixado sem data confiável: bloqueia sem inventar data.
 */
export function avaliarManejoVsBaixa(input: {
  status?: string | null;
  dataBaixa?: string | Date | null;
  dataEvento?: string | Date | null;
}): AvaliacaoManejoVsBaixa {
  if (!isStatusAnimalBaixado(input.status)) return { permitido: true };

  const dataBaixa = normalizarDataOperacional(input.dataBaixa);
  if (!dataBaixa) {
    return {
      permitido: false,
      codigo: "BAIXA_LEGADA_SEM_DATA",
      mensagem: MSG_MANEJO_BAIXA_LEGADA,
    };
  }

  const dataEvento = normalizarDataOperacional(input.dataEvento);
  if (dataEvento && dataEvento <= dataBaixa) return { permitido: true };

  return {
    permitido: false,
    codigo: "MANEJO_APOS_BAIXA",
    mensagem: `Não é possível registrar este manejo porque o animal foi baixado em ${formatarDataBaixa(
      dataBaixa,
    )}.`,
  };
}

export function animalElegivelParaManejoNaData(input: {
  status?: string | null;
  dataBaixa?: string | Date | null;
  dataEvento?: string | Date | null;
}): boolean {
  return avaliarManejoVsBaixa(input).permitido;
}

export function isMensagemBloqueioBaixa(message?: string | null): boolean {
  const texto = (message ?? "").trim();
  return (
    texto === MSG_BAIXA_DUPLICADA ||
    texto === MSG_SAIDA_VENDA_DUPLICADA ||
    texto === MSG_SAIDA_MORTE_DUPLICADA ||
    texto === MSG_SAIDA_TRANSFERENCIA_DUPLICADA ||
    texto === MSG_BAIXA_ANIMAL_INATIVO ||
    texto === MSG_VENDA_VIA_MANEJO_BLOQUEADA ||
    texto === MSG_MANEJO_BAIXA_LEGADA ||
    texto.startsWith("Não é possível registrar este manejo porque o animal foi baixado em ")
  );
}
