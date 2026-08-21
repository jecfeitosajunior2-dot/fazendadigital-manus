import { formatDateBR, parseLocalDate, toLocalDateISO } from "@/lib/date-utils";
import { formatUltimoPesoKg } from "@/lib/listaAnimaisTable";
import { EM_CARENCIA_SIM_BADGE_CLASS } from "@/lib/listaAnimaisTable";
import { formatValorCelulaMoedaBrlExcel, formatMoedaBrlExcel, parseMoedaBr, parseValorDecimalBanco } from "@shared/parseMoedaBr";

export { EM_CARENCIA_SIM_BADGE_CLASS };

export type PesagemRow = {
  id?: number;
  peso: string | null;
  data: string | Date | null;
  observacoes?: string | null;
  createdAt?: string | Date | null;
};

export const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  vendido: "Vendido",
  morto: "Morto",
  transferido: "Transferido",
  descartado: "Descartado",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

export function statusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "ativo":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200/80";
    case "inativo":
      return "bg-gray-100 text-gray-600 border border-gray-200";
    case "vendido":
      return "bg-blue-50 text-blue-700 border border-blue-200/80";
    case "morto":
      return "bg-gray-200 text-gray-700 border border-gray-300";
    case "transferido":
      return "bg-violet-50 text-violet-700 border border-violet-200/80";
    case "descartado":
      return "bg-red-50 text-red-700 border border-red-200/80";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

export function statusAccentClass(status: string | null | undefined): string {
  switch (status) {
    case "ativo":
      return "bg-emerald-500";
    case "vendido":
      return "bg-blue-500";
    case "morto":
    case "descartado":
      return "bg-red-400";
    case "transferido":
      return "bg-violet-500";
    default:
      return "bg-gray-400";
  }
}

/** Idade compacta — mesmo padrão da Lista de Animais. */
export function formatIdadeResumo(meses: number | null | undefined): string {
  if (meses === null || meses === undefined) return "—";
  if (meses < 1) return "< 1 m";
  if (meses < 24) return `${meses} m`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto > 0 ? `${anos}a ${resto}m` : `${anos} anos`;
}

export function sortPesagensAsc(pesagens: PesagemRow[]): PesagemRow[] {
  return [...pesagens].sort((a, b) => {
    const ta = parseLocalDate(a.data)?.getTime() ?? 0;
    const tb = parseLocalDate(b.data)?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    const ida = Number(a.id) || 0;
    const idb = Number(b.id) || 0;
    if (ida !== idb) return ida - idb;
    return (parseLocalDate(a.createdAt)?.getTime() ?? 0) - (parseLocalDate(b.createdAt)?.getTime() ?? 0);
  });
}

export function sortPesagensDesc(pesagens: PesagemRow[]): PesagemRow[] {
  return [...pesagens].sort((a, b) => {
    const ta = parseLocalDate(a.data)?.getTime() ?? 0;
    const tb = parseLocalDate(b.data)?.getTime() ?? 0;
    if (tb !== ta) return tb - ta;
    const ida = Number(a.id) || 0;
    const idb = Number(b.id) || 0;
    if (idb !== ida) return idb - ida;
    return (parseLocalDate(b.createdAt)?.getTime() ?? 0) - (parseLocalDate(a.createdAt)?.getTime() ?? 0);
  });
}

/** Dias calendário entre duas datas de pesagem (null se inválidas). */
export function diasEntrePesagens(
  dataAnterior: string | Date | null | undefined,
  dataAtual: string | Date | null | undefined,
): number | null {
  const d1 = parseLocalDate(dataAnterior);
  const d2 = parseLocalDate(dataAtual);
  if (!d1 || !d2) return null;
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * GMD entre duas pesagens consecutivas (variação / dias).
 * Mesma data (0 dias) ou intervalo inválido → null (não divide por zero).
 */
export function calcularGmdEntrePesagens(
  pesoAnterior: string | number | null | undefined,
  pesoAtual: string | number | null | undefined,
  dataAnterior: string | Date | null | undefined,
  dataAtual: string | Date | null | undefined,
): number | null {
  if (pesoAnterior == null || pesoAtual == null || pesoAnterior === "" || pesoAtual === "") {
    return null;
  }
  const p1 = Number(pesoAnterior);
  const p2 = Number(pesoAtual);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  const dias = diasEntrePesagens(dataAnterior, dataAtual);
  if (dias == null || dias <= 0) return null;
  return Math.round(((p2 - p1) / dias) * 1000) / 1000;
}

export function calcularVariacaoPesagem(
  pesoAnterior: string | number | null | undefined,
  pesoAtual: string | number | null | undefined,
): number | null {
  if (pesoAnterior == null || pesoAtual == null || pesoAnterior === "" || pesoAtual === "") {
    return null;
  }
  const p1 = Number(pesoAnterior);
  const p2 = Number(pesoAtual);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return Math.round((p2 - p1) * 10) / 10;
}

export type ResumoPesoAnimal = {
  pesoAtual: number | null;
  ultimaPesagemData: string | Date | null;
  ganhoKg: number | null;
  gmd: number | null;
};

/** Espelha a lógica de exibição da lista — apenas para apresentação na ficha. */
export function computeResumoPeso(
  pesagens: PesagemRow[] | undefined,
  animal: {
    pesoAtual?: string | null;
    pesoEntrada?: string | null;
    dataNascimento?: string | Date | null;
    dataEntrada?: string | Date | null;
    createdAt?: string | Date | null;
  },
): ResumoPesoAnimal {
  const asc = sortPesagensAsc(pesagens ?? []);
  const desc = sortPesagensDesc(pesagens ?? []);

  const ultimoPeso =
    asc.length > 0
      ? Number(asc[asc.length - 1].peso)
      : animal.pesoAtual
        ? Number(animal.pesoAtual)
        : animal.pesoEntrada
          ? Number(animal.pesoEntrada)
          : null;

  const primeiroPeso =
    asc.length > 0 ? Number(asc[0].peso) : animal.pesoEntrada ? Number(animal.pesoEntrada) : null;

  let ganhoKg: number | null = null;
  if (ultimoPeso !== null && primeiroPeso !== null && ultimoPeso !== primeiroPeso) {
    ganhoKg = Math.round((ultimoPeso - primeiroPeso) * 100) / 100;
  }

  const hoje = new Date();
  let diasNaFazenda: number | null = null;
  if (animal.dataNascimento) {
    diasNaFazenda = Math.floor(
      (hoje.getTime() - new Date(animal.dataNascimento).getTime()) / (1000 * 60 * 60 * 24),
    );
  } else if (animal.dataEntrada) {
    diasNaFazenda = Math.floor(
      (hoje.getTime() - new Date(animal.dataEntrada).getTime()) / (1000 * 60 * 60 * 24),
    );
  } else if (animal.createdAt) {
    diasNaFazenda = Math.floor(
      (hoje.getTime() - new Date(animal.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  let gmd: number | null = null;
  if (asc.length >= 2) {
    const p1 = asc[0];
    const p2 = asc[asc.length - 1];
    const d1 = parseLocalDate(p1.data);
    const d2 = parseLocalDate(p2.data);
    if (d1 && d2) {
      const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      gmd = Math.round(((Number(p2.peso) - Number(p1.peso)) / dias) * 1000) / 1000;
    }
  } else if (diasNaFazenda && diasNaFazenda > 0 && ganhoKg !== null) {
    gmd = Math.round((ganhoKg / diasNaFazenda) * 1000) / 1000;
  }

  return {
    pesoAtual: ultimoPeso !== null && !Number.isNaN(ultimoPeso) ? ultimoPeso : null,
    ultimaPesagemData: desc[0]?.data ?? null,
    ganhoKg,
    gmd,
  };
}

export function formatGanhoDisplay(ganhoKg: number | null | undefined): string {
  if (ganhoKg === null || ganhoKg === undefined) return "—";
  const prefix = ganhoKg > 0 ? "+" : "";
  return `${prefix}${ganhoKg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export function ganhoToneClass(ganhoKg: number | null | undefined): string {
  if (ganhoKg === null || ganhoKg === undefined) return "text-gray-400";
  if (ganhoKg > 0) return "text-emerald-600";
  if (ganhoKg < 0) return "text-red-500";
  return "text-gray-700";
}

export function formatGmdDisplay(gmd: number | null | undefined): string {
  if (gmd === null || gmd === undefined) return "—";
  return `${gmd.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`;
}

export function formatPesoAtualDisplay(peso: number | null | undefined): string {
  if (peso === null || peso === undefined) return "Sem pesagem";
  const fmt = formatUltimoPesoKg(peso);
  return fmt ? `${fmt} kg` : "Sem pesagem";
}

/** Calcula a data de fim da carência a partir da data do registro + dias. */
export function calcFimCarenciaFromDias(
  dataRegistro: string | Date | null | undefined,
  carenciaDias: number,
): Date | null {
  const base = parseLocalDate(dataRegistro);
  if (!base || !Number.isFinite(carenciaDias) || carenciaDias <= 0) return null;
  const fim = new Date(base);
  fim.setDate(fim.getDate() + carenciaDias);
  return fim;
}

/** Dias entre data do registro e fim da carência (proximaData). */
export function calcCarenciaDiasEntreDatas(
  dataRegistro: string | Date | null | undefined,
  proximaData: string | Date | null | undefined,
): number | null {
  const inicio = parseLocalDate(dataRegistro);
  const fim = parseLocalDate(proximaData);
  if (!inicio || !fim) return null;
  const dias = Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : null;
}

/** Carência em duas linhas na tabela sanitária: "90 dias" / "até 05/10/2026". */
export function getCarenciaRegistroLinhas(
  dataRegistro: string | Date | null | undefined,
  proximaData: string | Date | null | undefined,
): { diasLabel: string | null; ateLabel: string } | null {
  if (!proximaData) return null;
  const dias = calcCarenciaDiasEntreDatas(dataRegistro, proximaData);
  return {
    diasLabel: dias ? `${dias} dias` : null,
    ateLabel: `até ${formatDateBR(proximaData)}`,
  };
}

/** Abreviações padronizadas do tipo sanitário — só na tabela (valor salvo permanece completo). */
const TIPO_SANITARIO_TABELA_ABREV: Record<string, string> = {
  "Tratamento clínico": "Trat. clínico",
  "Procedimento sanitário": "Proc. sanitário",
  Tratamento: "Trat. clínico",
  Procedimento: "Proc. sanitário",
};

/** Rótulo do badge Tipo na tabela + nome completo para tooltip. */
export function formatTipoSanitarioTabelaDisplay(tipo: string | null | undefined): {
  label: string;
  tituloCompleto: string;
} {
  const completo = (tipo ?? "").trim();
  if (!completo) return { label: "—", tituloCompleto: "—" };
  const label = TIPO_SANITARIO_TABELA_ABREV[completo] ?? completo;
  return { label, tituloCompleto: completo };
}

/** Exibição do custo na tabela sanitária: "R$ 150,00" ou "—". */
export function formatCustoRegistroDisplay(custo: string | number | null | undefined): string {
  if (custo == null || String(custo).trim() === "") return "—";
  const formatted = formatValorCelulaMoedaBrlExcel(custo);
  return formatted || "—";
}

function parseCustoRegistroValor(custo: string | number | null | undefined): number | null {
  if (custo == null || String(custo).trim() === "") return null;
  const fromDb = parseValorDecimalBanco(custo);
  if (fromDb != null) return fromDb;
  const fromBr = parseMoedaBr(String(custo));
  if (!fromBr) return null;
  const n = parseFloat(fromBr);
  return Number.isFinite(n) ? n : null;
}

/** Soma custos informados nos registros sanitários do animal. */
export function computeCustoSanitarioResumo(
  registros: Array<{ custo?: string | number | null }>,
): { total: number; comCusto: number; totalRegistros: number; totalFormatado: string } {
  let total = 0;
  let comCusto = 0;
  for (const reg of registros) {
    const valor = parseCustoRegistroValor(reg.custo);
    if (valor == null) continue;
    total += valor;
    comCusto += 1;
  }
  return {
    total,
    comCusto,
    totalRegistros: registros.length,
    totalFormatado: formatMoedaBrlExcel(total),
  };
}

/** Converte dias de carência preenchidos no formulário para ISO local (proximaData). */
export function carenciaDiasToProximaDataISO(
  dataRegistro: string,
  carenciaDias: string,
): string | undefined {
  const dias = parseInt(carenciaDias, 10);
  if (!dataRegistro || !Number.isFinite(dias) || dias <= 0) return undefined;
  const fim = calcFimCarenciaFromDias(dataRegistro, dias);
  return fim ? toLocalDateISO(fim) : undefined;
}
