import { formatMoedaBrlExcel, parseMoedaBr, parseValorDecimalBanco } from "./parseMoedaBr";
import { deriveSemenStatus, SEMEN_MOV_TIPO_AJUSTE_ESTOQUE, type SemenStatus } from "./semenEstoque";

export { SEMEN_MOV_TIPO_AJUSTE_ESTOQUE };

export const SEMEN_AJUSTE_MODO_QUANTIDADE = "quantidade" as const;
export const SEMEN_AJUSTE_MODO_VALOR = "valor" as const;
export const SEMEN_AJUSTE_MODO_AMBOS = "ambos" as const;

export type SemenAjusteModo =
  | typeof SEMEN_AJUSTE_MODO_QUANTIDADE
  | typeof SEMEN_AJUSTE_MODO_VALOR
  | typeof SEMEN_AJUSTE_MODO_AMBOS;

export const SEMEN_AJUSTE_MODOS = [
  { codigo: SEMEN_AJUSTE_MODO_QUANTIDADE, label: "Ajustar quantidade" },
  { codigo: SEMEN_AJUSTE_MODO_VALOR, label: "Ajustar valor/custo" },
  { codigo: SEMEN_AJUSTE_MODO_AMBOS, label: "Ajustar quantidade e valor" },
] as const;

export const SEMEN_AJUSTE_MOTIVO_OUTRO = "outro" as const;

export const SEMEN_AJUSTE_MOTIVOS = [
  { codigo: "conferencia_fisica_estoque", label: "Conferência física de estoque" },
  { codigo: "correcao_valor_historico", label: "Correção de valor histórico" },
  { codigo: "ajuste_apos_lancamento_incorreto", label: "Ajuste após lançamento incorreto" },
  { codigo: "divergencia_inventario", label: "Divergência identificada em inventário" },
  { codigo: SEMEN_AJUSTE_MOTIVO_OUTRO, label: "Outro" },
] as const;

export type SemenAjusteMotivoCodigo = (typeof SEMEN_AJUSTE_MOTIVOS)[number]["codigo"];

export const MSG_SEMEN_AJUSTE_SEM_ALTERACAO = "Nenhuma alteração realizada.";
export const MSG_SEMEN_AJUSTE_MOTIVO = "Informe o motivo do ajuste.";
export const MSG_SEMEN_AJUSTE_MOTIVO_OUTRO = "Descreva o motivo";
export const MSG_SEMEN_AJUSTE_SALDO_NEGATIVO = "O saldo final não pode ser negativo.";
export const MSG_SEMEN_AJUSTE_VALOR_NEGATIVO = "O valor atual não pode ser negativo.";
export const MSG_SEMEN_AJUSTE_VALOR_ZERO =
  "Com doses em estoque, o valor atual precisa ser maior que zero.";
export const MSG_SEMEN_AJUSTE_SALDO_OBRIGATORIO = "Informe o novo saldo de doses.";
export const MSG_SEMEN_AJUSTE_SALDO_INVALIDO = "O saldo de doses deve ser um inteiro maior ou igual a zero.";
export const MSG_SEMEN_AJUSTE_VALOR_OBRIGATORIO = "Informe o novo valor atual do estoque.";
export const MSG_SEMEN_AJUSTE_VALOR_INVALIDO = "Informe um valor atual válido.";
export const MSG_SEMEN_AJUSTE_MODO = "Selecione o tipo de ajuste.";
export const MSG_SEMEN_AJUSTE_CONFIRMACAO =
  "Este ajuste não altera movimentações passadas. Ele passa a valer para o estoque atual e para movimentações futuras.";

const AJUSTE_META_PREFIX = "\n__fd_semen_ajuste__";
const AJUSTE_META_SUFFIX = "__end__";

export type SemenAjusteSnapshot = {
  saldoAnterior: number;
  saldoNovo: number;
  custoMedioAnterior: string;
  custoMedioNovo: string;
  valorAnterior: number;
  valorNovo: number;
  observacao: string | null;
};

type AjusteMetaPacked = {
  sa: number;
  sn: number;
  ca: string;
  cn: string;
  va: number;
  vn: number;
  o?: string;
};

function cents(n: number): number {
  return Math.round(n * 100);
}

function formatCusto2(n: number): string {
  return (cents(n) / 100).toFixed(2);
}

function formatValor2(n: number): number {
  return cents(n) / 100;
}

function parseCustoAtual(raw: string | number | null | undefined): number {
  const n = parseValorDecimalBanco(raw);
  return n != null && Number.isFinite(n) && n >= 0 ? n : 0;
}

export function isSemenMovimentacaoAjusteEstoque(tipo: string): boolean {
  return tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE;
}

export function parseSemenSaldoAjuste(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

export function parseSemenValorAjuste(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? formatValor2(raw) : null;
  }
  const s = String(raw).trim().replace(/^R\$\s*/i, "");
  if (!s) return null;
  const fromMoeda = parseMoedaBr(s);
  if (fromMoeda !== "") {
    const n = parseFloat(fromMoeda);
    if (Number.isFinite(n) && n >= 0) return formatValor2(n);
  }
  const fromDb = parseValorDecimalBanco(s);
  if (fromDb != null && fromDb >= 0) return formatValor2(fromDb);
  return null;
}

export function calcularValorEstoqueDeSaldoCusto(
  saldo: number,
  custoUnitario: string | number | null | undefined,
): number {
  const qtd = Math.trunc(Number(saldo));
  if (!Number.isFinite(qtd) || qtd <= 0) return 0;
  const custo = parseCustoAtual(custoUnitario);
  if (!(custo > 0)) return 0;
  return (cents(custo) * qtd) / 100;
}

export function calcSemenCustoMedioAjuste(saldo: number, valor: number): string {
  if (!(saldo > 0) || !(valor > 0)) return "0.00";
  return formatCusto2(valor / saldo);
}

export function validateSemenAjusteMotivo(
  codigo: unknown,
  descricaoOutro?: unknown,
): { ok: true; texto: string; codigo: SemenAjusteMotivoCodigo } | { ok: false; message: string } {
  const raw = String(codigo ?? "").trim();
  const found = SEMEN_AJUSTE_MOTIVOS.find(m => m.codigo === raw);
  if (!found) return { ok: false, message: MSG_SEMEN_AJUSTE_MOTIVO };
  if (found.codigo === SEMEN_AJUSTE_MOTIVO_OUTRO) {
    const desc = String(descricaoOutro ?? "").trim();
    if (!desc) return { ok: false, message: MSG_SEMEN_AJUSTE_MOTIVO_OUTRO };
    return { ok: true, texto: desc, codigo: found.codigo };
  }
  return { ok: true, texto: found.label, codigo: found.codigo };
}

export function validateSemenAjusteModo(raw: unknown): SemenAjusteModo | null {
  const s = String(raw ?? "").trim();
  if (
    s === SEMEN_AJUSTE_MODO_QUANTIDADE ||
    s === SEMEN_AJUSTE_MODO_VALOR ||
    s === SEMEN_AJUSTE_MODO_AMBOS
  ) {
    return s;
  }
  return null;
}

export function packSemenAjusteObservacoes(snapshot: SemenAjusteSnapshot): string {
  const meta: AjusteMetaPacked = {
    sa: snapshot.saldoAnterior,
    sn: snapshot.saldoNovo,
    ca: snapshot.custoMedioAnterior,
    cn: snapshot.custoMedioNovo,
    va: snapshot.valorAnterior,
    vn: snapshot.valorNovo,
  };
  const obs = String(snapshot.observacao ?? "").trim();
  if (obs) meta.o = obs;
  return `${AJUSTE_META_PREFIX}${JSON.stringify(meta)}${AJUSTE_META_SUFFIX}`.trim();
}

export function unpackSemenAjusteObservacoes(
  raw: string | null | undefined,
): SemenAjusteSnapshot | null {
  if (!raw) return null;
  const start = raw.indexOf(AJUSTE_META_PREFIX.trim());
  if (start < 0) return null;
  const from = raw.indexOf("{", start);
  const end = raw.indexOf(AJUSTE_META_SUFFIX, from);
  if (from < 0 || end < 0) return null;
  try {
    const meta = JSON.parse(raw.slice(from, end)) as AjusteMetaPacked;
    if (
      typeof meta.sa !== "number" ||
      typeof meta.sn !== "number" ||
      typeof meta.va !== "number" ||
      typeof meta.vn !== "number"
    ) {
      return null;
    }
    return {
      saldoAnterior: meta.sa,
      saldoNovo: meta.sn,
      custoMedioAnterior: String(meta.ca ?? "0.00"),
      custoMedioNovo: String(meta.cn ?? "0.00"),
      valorAnterior: meta.va,
      valorNovo: meta.vn,
      observacao: String(meta.o ?? "").trim() || null,
    };
  } catch {
    return null;
  }
}

function dosesLabel(n: number): string {
  return n === 1 ? "1 dose" : `${n} doses`;
}

export function formatSemenAjusteQuantidadeLabel(snapshot: SemenAjusteSnapshot): string {
  return `${snapshot.saldoAnterior} → ${dosesLabel(snapshot.saldoNovo)}`;
}

export function formatSemenAjusteHistoricoLinhas(snapshot: SemenAjusteSnapshot): {
  saldo: string;
  custoMedio: string;
  valor: string;
} {
  return {
    saldo: `${snapshot.saldoAnterior} → ${dosesLabel(snapshot.saldoNovo)}`,
    custoMedio: `${formatMoedaBrlExcel(parseCustoAtual(snapshot.custoMedioAnterior))} → ${formatMoedaBrlExcel(parseCustoAtual(snapshot.custoMedioNovo))}`,
    valor: `${formatMoedaBrlExcel(snapshot.valorAnterior)} → ${formatMoedaBrlExcel(snapshot.valorNovo)}`,
  };
}

export function formatSemenAjusteContextoExport(snapshot: SemenAjusteSnapshot): string {
  const custoAnt = formatMoedaBrlExcel(parseCustoAtual(snapshot.custoMedioAnterior));
  const custoNovo = formatMoedaBrlExcel(parseCustoAtual(snapshot.custoMedioNovo));
  const valorAnt = formatMoedaBrlExcel(snapshot.valorAnterior);
  const valorNovo = formatMoedaBrlExcel(snapshot.valorNovo);
  return `Saldo ${snapshot.saldoAnterior}→${snapshot.saldoNovo} · Custo médio ${custoAnt}→${custoNovo} · Valor ${valorAnt}→${valorNovo}`;
}

/** Resumo operacional da tela: só o que mudou. Não inclui valor em estoque. */
export type SemenAjusteResumoTela = {
  mudancas: string[];
  linhaMudancas: string | null;
};

export function buildSemenAjusteResumoTela(snapshot: SemenAjusteSnapshot): SemenAjusteResumoTela {
  const mudancas: string[] = [];
  if (snapshot.saldoAnterior !== snapshot.saldoNovo) {
    mudancas.push(`Saldo: ${snapshot.saldoAnterior} → ${dosesLabel(snapshot.saldoNovo)}`);
  }
  const custoAnt = parseCustoAtual(snapshot.custoMedioAnterior);
  const custoNovo = parseCustoAtual(snapshot.custoMedioNovo);
  if (cents(custoAnt) !== cents(custoNovo)) {
    mudancas.push(`Custo/dose: ${formatMoedaBrlExcel(custoAnt)} → ${formatMoedaBrlExcel(custoNovo)}`);
  }
  return {
    mudancas,
    linhaMudancas: mudancas.length > 0 ? mudancas.join(" · ") : null,
  };
}

export type SemenAjusteEstadoCalculado = {
  saldoAnterior: number;
  saldoNovo: number;
  custoMedioAnterior: string;
  custoMedioNovo: string;
  valorAnterior: number;
  valorNovo: number;
  status: SemenStatus;
};

export function evaluateSemenAjusteEstoque(params: {
  saldoAtual: number;
  custoMedioAtual: string | number | null;
  valorAtual: number;
  modo: unknown;
  saldoNovo?: unknown;
  valorNovo?: unknown;
}): { ok: true; value: SemenAjusteEstadoCalculado } | { ok: false; message: string } {
  const modo = validateSemenAjusteModo(params.modo);
  if (!modo) return { ok: false, message: MSG_SEMEN_AJUSTE_MODO };

  const saldoAtual = Math.max(0, Math.trunc(Number(params.saldoAtual) || 0));
  const custoAtualNum = parseCustoAtual(params.custoMedioAtual);
  const custoMedioAnterior = formatCusto2(custoAtualNum);
  const valorAnterior = formatValor2(Number(params.valorAtual) || 0);
  if (valorAnterior < 0) return { ok: false, message: MSG_SEMEN_AJUSTE_VALOR_NEGATIVO };

  let saldoNovo = saldoAtual;
  let valorNovo = valorAnterior;

  if (modo === SEMEN_AJUSTE_MODO_QUANTIDADE || modo === SEMEN_AJUSTE_MODO_AMBOS) {
    if (params.saldoNovo == null || params.saldoNovo === "") {
      return { ok: false, message: MSG_SEMEN_AJUSTE_SALDO_OBRIGATORIO };
    }
    const parsed = parseSemenSaldoAjuste(params.saldoNovo);
    if (parsed == null) {
      const n = Number(params.saldoNovo);
      if (Number.isFinite(n) && n < 0) return { ok: false, message: MSG_SEMEN_AJUSTE_SALDO_NEGATIVO };
      return { ok: false, message: MSG_SEMEN_AJUSTE_SALDO_INVALIDO };
    }
    saldoNovo = parsed;
  }

  if (modo === SEMEN_AJUSTE_MODO_VALOR || modo === SEMEN_AJUSTE_MODO_AMBOS) {
    if (params.valorNovo == null || params.valorNovo === "") {
      return { ok: false, message: MSG_SEMEN_AJUSTE_VALOR_OBRIGATORIO };
    }
    const parsed = parseSemenValorAjuste(params.valorNovo);
    if (parsed == null) {
      const n = typeof params.valorNovo === "number" ? params.valorNovo : Number(String(params.valorNovo).replace(",", "."));
      if (Number.isFinite(n) && n < 0) return { ok: false, message: MSG_SEMEN_AJUSTE_VALOR_NEGATIVO };
      return { ok: false, message: MSG_SEMEN_AJUSTE_VALOR_INVALIDO };
    }
    valorNovo = parsed;
  } else if (saldoNovo === 0) {
    valorNovo = 0;
  } else {
    valorNovo = calcularValorEstoqueDeSaldoCusto(saldoNovo, custoMedioAnterior);
  }

  if (saldoNovo < 0) return { ok: false, message: MSG_SEMEN_AJUSTE_SALDO_NEGATIVO };
  if (valorNovo < 0) return { ok: false, message: MSG_SEMEN_AJUSTE_VALOR_NEGATIVO };

  if (saldoNovo === 0) {
    valorNovo = 0;
  } else if (!(valorNovo > 0)) {
    return { ok: false, message: MSG_SEMEN_AJUSTE_VALOR_ZERO };
  }

  const custoMedioNovo =
    saldoNovo === 0
      ? "0.00"
      : modo === SEMEN_AJUSTE_MODO_QUANTIDADE
        ? custoMedioAnterior
        : calcSemenCustoMedioAjuste(saldoNovo, valorNovo);

  if (saldoNovo === saldoAtual && cents(valorNovo) === cents(valorAnterior)) {
    return { ok: false, message: MSG_SEMEN_AJUSTE_SEM_ALTERACAO };
  }

  return {
    ok: true,
    value: {
      saldoAnterior: saldoAtual,
      saldoNovo,
      custoMedioAnterior,
      custoMedioNovo,
      valorAnterior,
      valorNovo,
      status: deriveSemenStatus(saldoNovo),
    },
  };
}

export type SemenAjusteMovimentacaoDraft = {
  tipo: typeof SEMEN_MOV_TIPO_AJUSTE_ESTOQUE;
  dataEntrada: string;
  quantidadeDoses: number;
  custoTotal: string;
  custoUnitario: string;
  motivoCorrecao: string;
  observacoes: string;
};

export function buildSemenAjusteMovimentacao(params: {
  estado: SemenAjusteEstadoCalculado;
  dataOperacional: string;
  motivoTexto: string;
  observacao?: string | null;
}): SemenAjusteMovimentacaoDraft {
  const snapshot: SemenAjusteSnapshot = {
    saldoAnterior: params.estado.saldoAnterior,
    saldoNovo: params.estado.saldoNovo,
    custoMedioAnterior: params.estado.custoMedioAnterior,
    custoMedioNovo: params.estado.custoMedioNovo,
    valorAnterior: params.estado.valorAnterior,
    valorNovo: params.estado.valorNovo,
    observacao: String(params.observacao ?? "").trim() || null,
  };
  return {
    tipo: SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
    dataEntrada: params.dataOperacional,
    quantidadeDoses: params.estado.saldoNovo,
    custoTotal: params.estado.valorNovo.toFixed(2),
    custoUnitario: params.estado.custoMedioNovo,
    motivoCorrecao: params.motivoTexto,
    observacoes: packSemenAjusteObservacoes(snapshot),
  };
}
