/** Agregações da Visão Geral comercial — só usa campos já persistidos em compras/vendas. */

export type OperacaoComercial = {
  id?: number;
  data?: string | null;
  fornecedor?: string | null;
  comprador?: string | null;
  quantidadeAnimais?: number | null;
  quantidade?: number | null;
  valorTotal?: string | number | null;
  valorTotalNumero?: string | number | null;
  pesoTotal?: string | number | null;
  createdAt?: Date | string | null;
};

export type MetricKnown = { kind: "known"; value: number };
export type MetricUnknown = { kind: "unknown" };
export type CommercialMetric = MetricKnown | MetricUnknown;

export type OperacaoResumoLinha = {
  id: number;
  data: string;
  parceiro: string;
  quantidade: CommercialMetric;
  valor: CommercialMetric;
};

export type ComercialResumo = {
  valor: CommercialMetric;
  animais: CommercialMetric;
  peso: CommercialMetric;
  recentes: OperacaoResumoLinha[];
};

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

export function normalizeOperacaoData(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const match = String(raw).trim().match(ISO_DATE);
  return match ? match[1] : null;
}

export function operacaoNoPeriodo(data: unknown, de: string, ate: string): boolean {
  const iso = normalizeOperacaoData(data);
  if (!iso) return false;
  return iso >= de && iso <= ate;
}

/** Interpreta valorTotal varchar já gravado. Vazio conta como 0; lixo não parseável é desconhecido. */
export function parseValorOperacao(raw: unknown): number | null {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (s.includes(",")) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseQuantidadeOperacao(row: OperacaoComercial): number | null {
  const raw = row.quantidadeAnimais ?? row.quantidade;
  if (raw == null || raw === ("" as unknown)) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function somarMetrica(valores: Array<number | null>): CommercialMetric {
  const conhecidos = valores.filter((v): v is number => v != null);
  if (conhecidos.length !== valores.length) return { kind: "unknown" };
  return { kind: "known", value: conhecidos.reduce((acc, v) => acc + v, 0) };
}

function parceiroDe(row: OperacaoComercial, campo: "fornecedor" | "comprador"): string {
  const nome = String(row[campo] ?? "").trim();
  return nome || "—";
}

function idDe(row: OperacaoComercial, fallback: number): number {
  return typeof row.id === "number" && Number.isFinite(row.id) ? row.id : fallback;
}

export function resumirOperacoes(
  rows: ReadonlyArray<OperacaoComercial>,
  periodo: { de: string; ate: string },
  parceiroCampo: "fornecedor" | "comprador",
  limiteRecentes = 5,
): ComercialResumo {
  const noPeriodo = rows.filter(row => operacaoNoPeriodo(row.data, periodo.de, periodo.ate));
  const recentes = [...noPeriodo]
    .sort((a, b) => {
      const da = normalizeOperacaoData(a.data) ?? "";
      const db = normalizeOperacaoData(b.data) ?? "";
      if (da !== db) return db.localeCompare(da);
      return idDe(b, 0) - idDe(a, 0);
    })
    .slice(0, limiteRecentes)
    .map(row => {
      const qtd = parseQuantidadeOperacao(row);
      const valor = parseValorOperacao(row.valorTotalNumero ?? row.valorTotal);
      return {
        id: idDe(row, 0),
        data: normalizeOperacaoData(row.data) ?? "",
        parceiro: parceiroDe(row, parceiroCampo),
        quantidade: qtd == null ? { kind: "unknown" as const } : { kind: "known" as const, value: qtd },
        valor: valor == null ? { kind: "unknown" as const } : { kind: "known" as const, value: valor },
      };
    });

  const pesosConhecidos = noPeriodo
    .map(row => {
      if (row.pesoTotal == null || row.pesoTotal === "") return null;
      const n = Number(row.pesoTotal);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => n != null);

  return {
    valor: somarMetrica(noPeriodo.map(row => parseValorOperacao(row.valorTotalNumero ?? row.valorTotal))),
    animais: somarMetrica(noPeriodo.map(row => parseQuantidadeOperacao(row))),
    peso: pesosConhecidos.length
      ? { kind: "known" as const, value: Math.round(pesosConhecidos.reduce((a, b) => a + b, 0) * 100) / 100 }
      : { kind: "unknown" as const },
    recentes,
  };
}

export function formatarMetricaValor(metric: CommercialMetric): string {
  if (metric.kind === "unknown") return "—";
  return metric.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMetricaQuantidade(metric: CommercialMetric): string {
  if (metric.kind === "unknown") return "—";
  return metric.value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatarMetricaPeso(metric: CommercialMetric): string {
  if (metric.kind === "unknown") return "—";
  return `${metric.value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
}
