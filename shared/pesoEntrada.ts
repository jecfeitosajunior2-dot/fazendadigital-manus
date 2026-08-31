/**
 * Peso na Entrada = dado cadastral do ingresso.
 * Não é pesagem. Não vira linha de histórico.
 */

export const HINT_PESO_ENTRADA =
  "Peso informado no ingresso do animal na fazenda.";

export const MSG_PESO_ENTRADA_INVALIDO =
  "Informe um peso na entrada válido e maior que zero.";

export type OrigemUltimoPeso = "pesagem" | "entrada";

export type PesagemPesoRef = {
  peso?: string | number | null;
  data?: string | Date | null;
};

/** Aceita número ou texto (vírgula ou ponto). Rejeita zero, negativo e NaN. */
export function parsePesoPositivo(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Campo opcional: vazio é válido; preenchido precisa ser positivo. */
export function isPesoEntradaFormValido(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  return parsePesoPositivo(t) !== null;
}

export function isPesoEntradaInformadoInvalido(value: unknown): boolean {
  if (value == null || value === "") return false;
  const raw = String(value).trim();
  if (!raw) return false;
  return parsePesoPositivo(raw) === null;
}

/**
 * Data cadastral YYYY-MM-DD.
 * Não usa createdAt. Não inventa data.
 */
export function parseDataCadastroISO(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function diasEntreISO(dataAnterior: string, dataAtual: string): number | null {
  const a = dataAnterior.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const b = dataAtual.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!a || !b) return null;
  const d1 = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const d2 = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function sortPesagensPesoAsc(pesagens: PesagemPesoRef[]): PesagemPesoRef[] {
  return [...pesagens].sort((a, b) => {
    const da = parseDataCadastroISO(a.data) ?? "";
    const db = parseDataCadastroISO(b.data) ?? "";
    if (da !== db) return da.localeCompare(db);
    return 0;
  });
}

export function resolveUltimoPeso(
  pesagens: PesagemPesoRef[],
  pesoEntrada: unknown,
): { valor: number | null; origem: OrigemUltimoPeso | null } {
  const asc = sortPesagensPesoAsc(pesagens);
  if (asc.length > 0) {
    const valor = parsePesoPositivo(asc[asc.length - 1].peso);
    return { valor, origem: valor != null ? "pesagem" : null };
  }
  const valor = parsePesoPositivo(pesoEntrada);
  return { valor, origem: valor != null ? "entrada" : null };
}

/** Base temporal do ingresso: só com dataEntrada + pesoEntrada válidos. */
export function resolveBaseEntrada(cadastro: {
  pesoEntrada?: unknown;
  dataEntrada?: unknown;
}): { peso: number; data: string } | null {
  const peso = parsePesoPositivo(cadastro.pesoEntrada);
  const data = parseDataCadastroISO(cadastro.dataEntrada);
  if (peso == null || !data) return null;
  return { peso, data };
}

/**
 * Usa entrada como ponto anterior da primeira pesagem real
 * somente quando a pesagem é posterior à data de entrada.
 */
export function resolveBaseEntradaParaPesagem(
  cadastro: { pesoEntrada?: unknown; dataEntrada?: unknown },
  dataPrimeiraPesagem: unknown,
): { peso: number; data: string } | null {
  const base = resolveBaseEntrada(cadastro);
  if (!base) return null;
  const dataPesagem = parseDataCadastroISO(dataPrimeiraPesagem);
  if (!dataPesagem) return null;
  const dias = diasEntreISO(base.data, dataPesagem);
  if (dias == null || dias <= 0) return null;
  return base;
}

export function calcularGmdIntervalo(
  pesoAnterior: number,
  pesoAtual: number,
  dataAnterior: string,
  dataAtual: string,
): number | null {
  const dias = diasEntreISO(dataAnterior, dataAtual);
  if (dias == null || dias <= 0) return null;
  return Math.round(((pesoAtual - pesoAnterior) / dias) * 1000) / 1000;
}

export type IndicadoresPeso = {
  ultimoPeso: number | null;
  origemUltimoPeso: OrigemUltimoPeso | null;
  ganhoKg: number | null;
  gmd: number | null;
  ultimaPesagemData: string | Date | null;
};

/**
 * Indicadores da lista/ficha.
 * 0 pesagens: Últ. Peso pode ser fallback de entrada; sem GMD.
 * 1 pesagem: GMD/ganho usam entrada só com data válida.
 * 2+ pesagens: só pesagens reais (primeira → última).
 */
export function computeIndicadoresPeso(
  pesagens: PesagemPesoRef[],
  cadastro: { pesoEntrada?: unknown; dataEntrada?: unknown },
): IndicadoresPeso {
  const asc = sortPesagensPesoAsc(pesagens);
  const ultimo = resolveUltimoPeso(asc, cadastro.pesoEntrada);

  if (asc.length === 0) {
    return {
      ultimoPeso: ultimo.valor,
      origemUltimoPeso: ultimo.origem,
      ganhoKg: null,
      gmd: null,
      ultimaPesagemData: null,
    };
  }

  const last = asc[asc.length - 1];
  const lastPeso = parsePesoPositivo(last.peso);
  const lastData = parseDataCadastroISO(last.data);

  if (asc.length === 1) {
    const base = resolveBaseEntradaParaPesagem(cadastro, last.data);
    let ganhoKg: number | null = null;
    let gmd: number | null = null;
    if (base && lastPeso != null) {
      ganhoKg = Math.round((lastPeso - base.peso) * 100) / 100;
      if (ganhoKg === 0) ganhoKg = null;
      if (lastData) gmd = calcularGmdIntervalo(base.peso, lastPeso, base.data, lastData);
    }
    return {
      ultimoPeso: lastPeso,
      origemUltimoPeso: lastPeso != null ? "pesagem" : null,
      ganhoKg,
      gmd,
      ultimaPesagemData: last.data ?? null,
    };
  }

  const first = asc[0];
  const firstPeso = parsePesoPositivo(first.peso);
  const firstData = parseDataCadastroISO(first.data);
  let ganhoKg: number | null = null;
  let gmd: number | null = null;
  if (firstPeso != null && lastPeso != null && firstPeso !== lastPeso) {
    ganhoKg = Math.round((lastPeso - firstPeso) * 100) / 100;
  }
  if (firstPeso != null && lastPeso != null && firstData && lastData) {
    const dias = diasEntreISO(firstData, lastData);
    if (dias != null && dias > 0) {
      gmd = Math.round(((lastPeso - firstPeso) / dias) * 1000) / 1000;
    } else if (dias === 0) {
      gmd = Math.round((lastPeso - firstPeso) * 1000) / 1000;
    }
  }

  return {
    ultimoPeso: lastPeso,
    origemUltimoPeso: lastPeso != null ? "pesagem" : null,
    ganhoKg,
    gmd,
    ultimaPesagemData: last.data ?? null,
  };
}
