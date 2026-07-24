// Utilitários do Painel de Controle: datas, moeda e agregações.

/** Formata valor em Real brasileiro. */
export function brl(value: number | string | null | undefined, decimals = 2): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  if (Number.isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Formato compacto para KPIs (ex.: R$ 1,2 mi / R$ 340 mil).
 * Abaixo de R$ 1.000 mantém centavos, alinhado às telas operacionais. */
export function brlCompact(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  if (Number.isNaN(n) || n === 0) return "R$ 0,00";
  const abs = Math.abs(n);
  const sinal = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Número pt-BR. */
export function num(value: number | string | null | undefined, decimals = 0): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Converte qualquer formato de data (ISO, YYYY-MM-DD, DD/MM/YYYY) em Date local. */
export function parseData(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  // DD/MM/YYYY
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  // YYYY-MM-DD (+ hora opcional)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dias entre hoje e a data (positivo = futuro, negativo = passado). */
export function diasAte(value: string | Date | null | undefined): number | null {
  const d = parseData(value);
  if (!d) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function dataBr(value: string | Date | null | undefined): string {
  const d = parseData(value);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

/** Texto relativo amigável (ex.: "em 3 dias", "vencido há 2 dias", "hoje"). */
export function prazoRelativo(value: string | Date | null | undefined): string {
  const dias = diasAte(value);
  if (dias == null) return "—";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  if (dias > 1) return `em ${dias} dias`;
  return `há ${Math.abs(dias)} dias`;
}

export type PeriodoChave = "30d" | "90d" | "12m" | "all";

export const PERIODOS: { chave: PeriodoChave; label: string }[] = [
  { chave: "30d", label: "30 dias" },
  { chave: "90d", label: "90 dias" },
  { chave: "12m", label: "12 meses" },
  { chave: "all", label: "Tudo" },
];

/** Data de início do período (null = sem limite). */
export function inicioPeriodo(chave: PeriodoChave): Date | null {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  switch (chave) {
    case "30d": return new Date(hoje.getTime() - 30 * 86_400_000);
    case "90d": return new Date(hoje.getTime() - 90 * 86_400_000);
    case "12m": { const d = new Date(hoje); d.setMonth(d.getMonth() - 12); return d; }
    case "all": return null;
  }
}

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type BucketMes = { chave: string; label: string; receita: number; despesa: number; saldo: number };

/** Gera N buckets mensais (mais antigo → mais recente) terminando no mês atual. */
export function ultimosMeses(n: number): BucketMes[] {
  const hoje = new Date();
  const buckets: BucketMes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    buckets.push({
      chave: `${d.getFullYear()}-${d.getMonth()}`,
      label: `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      receita: 0,
      despesa: 0,
      saldo: 0,
    });
  }
  return buckets;
}

export function mesChave(value: string | Date | null | undefined): string | null {
  const d = parseData(value);
  return d ? `${d.getFullYear()}-${d.getMonth()}` : null;
}

export type BucketFluxo = {
  chave: string;
  label: string;
  entrada: number;
  saida: number;
};

/** Chave semanal ISO aproximada (segunda = início). */
function semanaChave(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7; // segunda=0
  copy.setDate(copy.getDate() - day);
  return `${copy.getFullYear()}-${copy.getMonth()}-${copy.getDate()}`;
}

function semanaLabel(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return `${String(copy.getDate()).padStart(2, "0")}/${String(copy.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Buckets do gráfico Entradas × Saídas conforme o filtro de período.
 * - 30d: semanal
 * - 90d / 12m: mensal
 * - all: mensal cobrindo o histórico informado (mín. 1, máx. 24)
 */
export function bucketsFluxoPeriodo(
  periodo: PeriodoChave,
  datasHistorico: Array<string | Date | null | undefined> = [],
): BucketFluxo[] {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);

  if (periodo === "30d") {
    const buckets: BucketFluxo[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i * 7);
      buckets.push({ chave: semanaChave(d), label: semanaLabel(d), entrada: 0, saida: 0 });
    }
    // dedupe por chave (caso sobreposição)
    const seen = new Set<string>();
    return buckets.filter(b => {
      if (seen.has(b.chave)) return false;
      seen.add(b.chave);
      return true;
    });
  }

  if (periodo === "90d") {
    return ultimosMeses(3).map(b => ({
      chave: b.chave,
      label: b.label,
      entrada: 0,
      saida: 0,
    }));
  }

  if (periodo === "12m") {
    return ultimosMeses(12).map(b => ({
      chave: b.chave,
      label: b.label,
      entrada: 0,
      saida: 0,
    }));
  }

  // all — mensal conforme histórico disponível
  let maisAntiga: Date | null = null;
  for (const raw of datasHistorico) {
    const d = parseData(raw);
    if (!d) continue;
    if (!maisAntiga || d < maisAntiga) maisAntiga = d;
  }
  if (!maisAntiga) {
    return ultimosMeses(6).map(b => ({
      chave: b.chave,
      label: b.label,
      entrada: 0,
      saida: 0,
    }));
  }
  const meses =
    (hoje.getFullYear() - maisAntiga.getFullYear()) * 12 +
    (hoje.getMonth() - maisAntiga.getMonth()) +
    1;
  const n = Math.min(24, Math.max(1, meses));
  return ultimosMeses(n).map(b => ({
    chave: b.chave,
    label: b.label,
    entrada: 0,
    saida: 0,
  }));
}

/** Chave do bucket para uma data, alinhada ao período. */
export function chaveFluxoPeriodo(
  periodo: PeriodoChave,
  value: string | Date | null | undefined,
): string | null {
  const d = parseData(value);
  if (!d) return null;
  if (periodo === "30d") return semanaChave(d);
  return mesChave(d);
}

/** Idade em anos a partir da data de nascimento (null se inválida). */
export function idadeAnos(dataNascimento: string | Date | null | undefined): number | null {
  const d = parseData(dataNascimento);
  if (!d) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return null;
  return diff / (365.25 * 86_400_000);
}

/** Faixa etária de bovinos a partir da idade em anos. */
export function faixaEtaria(anos: number | null): string {
  if (anos == null) return "Sem idade";
  if (anos < 1) return "0–12 meses";
  if (anos < 2) return "12–24 meses";
  if (anos < 3) return "24–36 meses";
  return "+36 meses";
}

/** Paleta para gráficos, alinhada à identidade Fazenda Digital. */
export const CHART_COLORS = ["#1BC5BD", "#0891B2", "#164E63", "#D4AF37", "#14B8A6", "#64748B", "#F5A623"];
