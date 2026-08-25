import { toDateOnlyISO } from "./carenciaAnimal";
import { formatMoedaBrlExcel, parseMoedaBr, parseValorDecimalBanco } from "./parseMoedaBr";

function parseCustoMedio(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function calcularCustoMedioPonderado(params: {
  quantidadeAnterior: number;
  custoMedioAnterior: number | null;
  quantidadeEntrada: number;
  valorTotalEntrada: number;
}): number | null {
  const qEnt = params.quantidadeEntrada;
  const valorEnt = params.valorTotalEntrada;
  if (!(qEnt > 0) || !(valorEnt > 0)) {
    return parseCustoMedio(params.custoMedioAnterior);
  }

  const qAnt = Math.max(0, Number(params.quantidadeAnterior) || 0);
  const custoAnt = parseCustoMedio(params.custoMedioAnterior) ?? 0;
  const valorAnt = qAnt * custoAnt;
  const qTotal = qAnt + qEnt;
  if (!(qTotal > 0)) return null;

  const medio = (valorAnt + valorEnt) / qTotal;
  return Number.isFinite(medio) && medio > 0 ? medio : null;
}

function formatCustoMedio(valor: number): string {
  return (Math.round(valor * 100) / 100).toFixed(2);
}

export const SEMEN_ORIGEM_INTERNO = "interno" as const;
export const SEMEN_ORIGEM_EXTERNO = "externo" as const;
export type SemenOrigemReprodutor = typeof SEMEN_ORIGEM_INTERNO | typeof SEMEN_ORIGEM_EXTERNO;

export const SEMEN_STATUS_DISPONIVEL = "disponivel" as const;
export const SEMEN_STATUS_ESGOTADO = "esgotado" as const;
export type SemenStatus = typeof SEMEN_STATUS_DISPONIVEL | typeof SEMEN_STATUS_ESGOTADO;

export const SEMEN_MOV_TIPO_ENTRADA = "ENTRADA" as const;
export const SEMEN_MOV_TIPO_SAIDA_IA = "SAIDA_IA" as const;
export type SemenMovimentacaoTipo =
  | typeof SEMEN_MOV_TIPO_ENTRADA
  | typeof SEMEN_MOV_TIPO_SAIDA_IA;

export const MSG_SEMEN_SEM_DOSES = "Não há doses disponíveis nesta partida.";
export const MSG_SEMEN_PARTIDA_INCOMPATIVEL =
  "A partida selecionada não corresponde ao reprodutor informado.";
export const MSG_SEMEN_PARTIDA_NAO_ENCONTRADA = "Partida de sêmen não encontrada.";
export const MSG_SEMEN_PARTIDA_IA_OBRIGATORIA = "Selecione uma partida do estoque de sêmen.";
export const MSG_SEMEN_NENHUMA_DOSE_REPRODUTOR = "Nenhuma dose disponível para este reprodutor.";

export const MSG_SEMEN_PARTIDA_OBRIGATORIA = "Informe a partida / lote do sêmen.";
/** Valor persistido quando o usuário não informa partida / lote. */
export const SEMEN_PARTIDA_SEM_LOTE = "Sem lote" as const;
export const MSG_SEMEN_QUANTIDADE_OBRIGATORIA = "Informe a quantidade de doses.";
export const MSG_SEMEN_QUANTIDADE_INVALIDA = "A quantidade de doses deve ser um inteiro positivo.";
export const MSG_SEMEN_CUSTO_OBRIGATORIO = "Informe o custo total da entrada.";
export const MSG_SEMEN_CUSTO_INVALIDO = "O custo total deve ser maior que zero.";
export const MSG_SEMEN_REPRODUTOR_EXTERNO_OBRIGATORIO = "Informe o reprodutor / sêmen externo.";
export const MSG_SEMEN_MACHO_OBRIGATORIO = "Selecione o touro do rebanho.";
export const MSG_SEMEN_ORIGEM_INVALIDA = "Selecione a origem do reprodutor.";
export const MSG_SEMEN_DATA_FUTURA = "A data de entrada não pode ser futura.";
export const MSG_SEMEN_DATA_INVALIDA = "Informe uma data de entrada válida.";

export function normalizeSemenPartida(raw: string): string {
  const trimmed = raw.trim();
  return trimmed || SEMEN_PARTIDA_SEM_LOTE;
}

export function normalizeSemenReprodutorExterno(raw: string): string {
  return raw.trim();
}

export function buildSemenReprodutorKey(params: {
  origem: SemenOrigemReprodutor;
  machoId?: number | null;
  reprodutorTexto?: string | null;
}): string {
  if (params.origem === SEMEN_ORIGEM_INTERNO) {
    const id = Number(params.machoId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error(MSG_SEMEN_MACHO_OBRIGATORIO);
    }
    return `m:${id}`;
  }
  const texto = normalizeSemenReprodutorExterno(String(params.reprodutorTexto ?? ""));
  if (!texto) throw new Error(MSG_SEMEN_REPRODUTOR_EXTERNO_OBRIGATORIO);
  return `e:${texto.toLowerCase()}`;
}

export function deriveSemenStatus(saldoDoses: number): SemenStatus {
  return saldoDoses > 0 ? SEMEN_STATUS_DISPONIVEL : SEMEN_STATUS_ESGOTADO;
}

export function formatSemenStatusLabel(status: SemenStatus | string): string {
  return status === SEMEN_STATUS_ESGOTADO ? "Esgotado" : "Disponível";
}

export function parseSemenQuantidadeDoses(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export function parseSemenCustoTotal(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  const s = String(raw).trim().replace(/^R\$\s*/i, "");
  if (!s) return null;
  const fromMoeda = parseMoedaBr(s);
  if (fromMoeda) {
    const n = parseFloat(fromMoeda);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const fromDb = parseValorDecimalBanco(s);
  return fromDb != null && fromDb > 0 ? fromDb : null;
}

/** Remove prefixo R$ digitado pelo usuário — mantém apenas o valor. */
export function sanitizeSemenCustoTotalInput(raw: string): string {
  return raw.replace(/^R\$\s*/i, "");
}

/** Formata custo total para exibição completa (ex.: "R$ 1.000,00"). */
export function formatSemenCustoTotalDisplay(raw: unknown): string {
  const n = parseSemenCustoTotal(raw);
  if (n == null) return "—";
  return formatMoedaBrlExcel(n);
}

/** Formata valor do input após blur — sem prefixo R$ (ex.: "1.000,00"). */
export function formatSemenCustoTotalOnBlur(raw: string): string {
  const parsed = parseSemenCustoTotal(raw);
  if (parsed == null) return sanitizeSemenCustoTotalInput(raw);
  return formatMoedaBrlExcel(parsed).replace(/^R\$\s*/, "");
}

export type SemenEntradaFormDraft = {
  origem: "" | SemenOrigemReprodutor;
  machoId?: number | null;
  reprodutorTexto?: string;
  partida?: string;
  quantidadeDoses?: string | number;
  custoTotal?: string | number;
  dataEntrada?: string;
};

/** Indica se o formulário de nova entrada pode ser enviado (botão habilitado). */
export function isSemenEntradaFormSubmittable(
  draft: SemenEntradaFormDraft,
  refDate: Date = new Date(),
): boolean {
  if (!draft.origem) return false;

  const qtdRaw = String(draft.quantidadeDoses ?? "").trim();
  if (qtdRaw && !/^\d+$/.test(qtdRaw)) return false;

  return validateSemenEntradaInput(
    {
      origemReprodutor: draft.origem,
      machoId: draft.origem === SEMEN_ORIGEM_INTERNO ? draft.machoId : undefined,
      reprodutorTexto: draft.origem === SEMEN_ORIGEM_EXTERNO ? draft.reprodutorTexto : undefined,
      partida: draft.partida ?? "",
      quantidadeDoses: draft.quantidadeDoses ?? "",
      custoTotal: draft.custoTotal ?? "",
      dataEntrada: draft.dataEntrada,
    },
    refDate,
  ).ok;
}

export function calcSemenCustoUnitarioEntrada(
  quantidadeDoses: number,
  custoTotal: number,
): string {
  const unit = custoTotal / quantidadeDoses;
  return formatCustoMedio(unit);
}

export function parseSemenDataEntrada(raw: unknown, refDate: Date = new Date()): string | null {
  if (raw == null || String(raw).trim() === "") return toDateOnlyISO(refDate);
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (s > toDateOnlyISO(refDate)) return null;
  return s;
}

export type SemenEntradaValidada = {
  origem: SemenOrigemReprodutor;
  machoId: number | null;
  reprodutorTexto: string | null;
  reprodutorKey: string;
  partida: string;
  centralOrigem: string | null;
  quantidadeDoses: number;
  custoTotal: number;
  custoUnitario: string;
  dataEntrada: string;
  observacoes: string | null;
};

export function validateSemenEntradaInput(
  input: {
    origemReprodutor: unknown;
    machoId?: unknown;
    reprodutorTexto?: unknown;
    partida: unknown;
    centralOrigem?: unknown;
    quantidadeDoses: unknown;
    custoTotal: unknown;
    dataEntrada?: unknown;
    observacoes?: unknown;
  },
  refDate: Date = new Date(),
):
  | { ok: true; value: SemenEntradaValidada }
  | { ok: false; message: string } {
  const origemRaw = String(input.origemReprodutor ?? "").trim();
  if (origemRaw !== SEMEN_ORIGEM_INTERNO && origemRaw !== SEMEN_ORIGEM_EXTERNO) {
    return { ok: false, message: MSG_SEMEN_ORIGEM_INVALIDA };
  }
  const origem = origemRaw as SemenOrigemReprodutor;

  const partida = normalizeSemenPartida(String(input.partida ?? ""));

  const quantidadeDoses = parseSemenQuantidadeDoses(input.quantidadeDoses);
  if (quantidadeDoses == null) {
    const raw = input.quantidadeDoses;
    if (raw == null || raw === "") return { ok: false, message: MSG_SEMEN_QUANTIDADE_OBRIGATORIA };
    return { ok: false, message: MSG_SEMEN_QUANTIDADE_INVALIDA };
  }

  const custoTotal = parseSemenCustoTotal(input.custoTotal);
  if (custoTotal == null) {
    const raw = input.custoTotal;
    if (raw == null || raw === "") return { ok: false, message: MSG_SEMEN_CUSTO_OBRIGATORIO };
    return { ok: false, message: MSG_SEMEN_CUSTO_INVALIDO };
  }

  const dataEntrada = parseSemenDataEntrada(input.dataEntrada, refDate);
  if (!dataEntrada) {
    const raw = input.dataEntrada;
    if (raw != null && String(raw).trim() !== "" && String(raw).trim() > toDateOnlyISO(refDate)) {
      return { ok: false, message: MSG_SEMEN_DATA_FUTURA };
    }
    return { ok: false, message: MSG_SEMEN_DATA_INVALIDA };
  }

  let machoId: number | null = null;
  let reprodutorTexto: string | null = null;

  if (origem === SEMEN_ORIGEM_INTERNO) {
    const id = Number(input.machoId);
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, message: MSG_SEMEN_MACHO_OBRIGATORIO };
    }
    machoId = id;
  } else {
    reprodutorTexto = normalizeSemenReprodutorExterno(String(input.reprodutorTexto ?? ""));
    if (!reprodutorTexto) {
      return { ok: false, message: MSG_SEMEN_REPRODUTOR_EXTERNO_OBRIGATORIO };
    }
  }

  let reprodutorKey: string;
  try {
    reprodutorKey = buildSemenReprodutorKey({ origem, machoId, reprodutorTexto });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : MSG_SEMEN_ORIGEM_INVALIDA };
  }

  const centralRaw = String(input.centralOrigem ?? "").trim();
  const observacoesRaw = String(input.observacoes ?? "").trim();

  return {
    ok: true,
    value: {
      origem,
      machoId,
      reprodutorTexto,
      reprodutorKey,
      partida,
      centralOrigem: centralRaw || null,
      quantidadeDoses,
      custoTotal,
      custoUnitario: calcSemenCustoUnitarioEntrada(quantidadeDoses, custoTotal),
      dataEntrada,
      observacoes: observacoesRaw || null,
    },
  };
}

/** Baixa de estoque por Inseminação — 1 dose; custo unitário da partida não muda. */
export function applySemenSaidaIa(params: {
  saldoAnterior: number;
  custoUnitario: string | number | null;
  quantidadeSaida?: number;
}): { novoSaldo: number; novoCustoUnitario: string | null; status: SemenStatus } {
  const qtd = params.quantidadeSaida ?? 1;
  const saldo = Math.max(0, Number(params.saldoAnterior) || 0);
  if (!(qtd > 0) || saldo < qtd) {
    throw new Error(MSG_SEMEN_SEM_DOSES);
  }
  const novoSaldo = saldo - qtd;
  const custoMedioNum = parseCustoMedio(params.custoUnitario);
  const novoCustoUnitario = custoMedioNum != null ? formatCustoMedio(custoMedioNum) : null;
  return {
    novoSaldo,
    novoCustoUnitario,
    status: deriveSemenStatus(novoSaldo),
  };
}

export type SemenPartidaDisponivelInseminacao = {
  id: number;
  partida: string;
  centralOrigem: string | null;
  saldoDoses: number;
  custoUnitario: string | null;
  reprodutorDisplay: string;
};

/** Valida compatibilidade reprodutor ↔ partida para Inseminação. */
export function validateSemenPartidaReprodutorCompat(params: {
  origem: SemenOrigemReprodutor;
  partidaMachoId: number | null;
  partidaReprodutorKey: string;
  machoId?: number | null;
  reprodutorTexto?: string | null;
}): boolean {
  if (params.origem === SEMEN_ORIGEM_INTERNO) {
    const expected = Number(params.machoId);
    return (
      Number.isFinite(expected) &&
      expected > 0 &&
      params.partidaMachoId === expected
    );
  }
  try {
    const key = buildSemenReprodutorKey({
      origem: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: params.reprodutorTexto,
    });
    return key === params.partidaReprodutorKey;
  } catch {
    return false;
  }
}

/** Atualiza saldo e custo médio após nova entrada na mesma partida. */
export function applySemenEntradaAgregacao(params: {
  saldoAnterior: number;
  custoUnitarioAnterior: string | number | null;
  quantidadeEntrada: number;
  custoTotalEntrada: number;
}): { novoSaldo: number; novoCustoUnitario: string | null; status: SemenStatus } {
  const novoSaldo = Math.max(0, params.saldoAnterior) + params.quantidadeEntrada;
  const custoMedioNum = calcularCustoMedioPonderado({
    quantidadeAnterior: params.saldoAnterior,
    custoMedioAnterior: parseCustoMedio(params.custoUnitarioAnterior),
    quantidadeEntrada: params.quantidadeEntrada,
    valorTotalEntrada: params.custoTotalEntrada,
  });
  const novoCustoUnitario = custoMedioNum != null ? formatCustoMedio(custoMedioNum) : null;
  return {
    novoSaldo,
    novoCustoUnitario,
    status: deriveSemenStatus(novoSaldo),
  };
}

export function parseSemenCustoUnitario(raw: unknown): number | null {
  return parseCustoMedio(raw);
}

export function formatSemenPartidaInseminacaoOptionLabel(params: {
  partida: string;
  saldoDoses: number;
  custoUnitario: string | number | null;
  centralOrigem?: string | null;
}): string {
  const custo = formatSemenCustoTotalDisplay(params.custoUnitario);
  const central = params.centralOrigem?.trim();
  let label = `${params.saldoDoses} doses · ${custo}/dose`;
  if (central) label += ` · ${central}`;
  return label;
}

export function formatSemenReprodutorDisplay(params: {
  origem: SemenOrigemReprodutor | string;
  reprodutorTexto?: string | null;
  machoDisplay?: string | null;
}): string {
  if (params.origem === SEMEN_ORIGEM_INTERNO) {
    return params.machoDisplay?.trim() || params.reprodutorTexto?.trim() || "—";
  }
  return params.reprodutorTexto?.trim() || "—";
}

export function resolveSemenMachoDisplayLabel(animal: {
  brinco?: string | null;
  nome?: string | null;
}): string {
  const brinco = animal.brinco?.trim();
  const nome = animal.nome?.trim();
  if (brinco && nome) return `${brinco} — ${nome}`;
  return brinco || nome || "—";
}

export {
  formatSemenMovimentacaoTipoLabel,
  formatSemenMovimentacaoQuantidadeLabel,
  formatSemenMovimentacaoContexto,
} from "./semenMovimentacaoDisplay";
