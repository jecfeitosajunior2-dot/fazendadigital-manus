import { reproDataToInputISO, unpackReproObservacoes } from "./reproRegistroMeta";
import {
  formatReprodutorAnimalLabel,
  resolveReproReprodutorDisplay,
  reprodutorTextoEhPartida,
  SEMEN_REPRODUTOR_NAO_INFORMADO_KEY,
  SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
} from "./reproReprodutorDisplay";
import {
  normalizeSemenPartida,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  type SemenOrigemReprodutor,
} from "./semenEstoque";

export const REPRO_TIPO_INSEMINACAO = "Inseminação";
export {
  SEMEN_REPRODUTOR_NAO_INFORMADO_KEY,
  SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
  reprodutorTextoEhPartida,
} from "./reproReprodutorDisplay";

export type SemenUtilizadoRegistroFonte = {
  id: number;
  tipo: string;
  femeaId: number;
  machoId?: number | null;
  dataCobertura: string | Date | null;
  createdAt?: string | Date | null;
  resultado?: string | null;
  observacoes?: string | null;
};

export type SemenUtilizadoAnimalFonte = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  fazendaId?: number | null;
};

export type SemenUtilizadoUso = {
  registroId: number;
  femeaId: number;
  matrizBrinco: string;
  dataIso: string;
  createdAtIso: string;
  inseminador: string | null;
  custoDose: number | null;
  resultado: string | null;
  origem: SemenOrigemReprodutor;
  machoId: number | null;
  reprodutorKey: string;
  reprodutorDisplay: string;
  partida: string;
  central: string | null;
  fazendaId: number;
};

export type SemenUtilizadoGrupo = {
  key: string;
  origem: SemenOrigemReprodutor;
  machoId: number | null;
  reprodutorKey: string;
  reprodutorDisplay: string;
  partida: string;
  central: string | null;
  dosesUtilizadas: number;
  matrizes: number;
  custoMedioUso: number | null;
  custoTotalUtilizado: number | null;
  usosComCusto: number;
  usosSemCusto: number;
  ultimoUso: string;
  ultimoRegistroId: number;
};

export type SemenUtilizadoPartidaFonte = {
  id: number;
  centralOrigem?: string | null;
  reprodutorTexto?: string | null;
  reprodutorKey?: string | null;
  origemReprodutor?: string | null;
  machoId?: number | null;
};

export type SemenUtilizadoFiltros = {
  fazendaId?: number;
  search?: string;
  dataIni?: string;
  dataFim?: string;
  reprodutor?: string;
};

export type SemenUtilizadoReprodutorOpcao = {
  value: string;
  label: string;
  origem: SemenOrigemReprodutor;
};

export function shouldConsumirEstoqueSemenNaInseminacao(
  semenPartidaId?: number | null,
): boolean {
  const id = Number(semenPartidaId);
  return Number.isInteger(id) && id > 0;
}

export function formatSemenUtilizadoMatrizLabel(brinco: string | null | undefined): string {
  const t = String(brinco ?? "").trim();
  if (!t || t === "—") return "Matriz";
  return `Matriz ${t}`;
}

function cents(n: number): number {
  return Math.round(n * 100);
}

function createdAtKey(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value);
}

function displayAnimal(animal: SemenUtilizadoAnimalFonte | undefined): string {
  return formatReprodutorAnimalLabel(animal);
}

export function buildSemenUtilizadoGrupoKey(params: {
  origem: SemenOrigemReprodutor;
  reprodutorKey: string;
  partida: string;
}): string {
  return `${params.origem}|${params.reprodutorKey}|${normalizeSemenPartida(params.partida)}`;
}

export function parseSemenUtilizadoGrupoKey(
  raw: string | null | undefined,
): { origem: SemenOrigemReprodutor; reprodutorKey: string; partida: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  })();
  const parts = decoded.split("|");
  if (parts.length < 3) return null;
  const origem = parts[0];
  const reprodutorKey = parts[1];
  const partida = parts.slice(2).join("|");
  if (origem !== SEMEN_ORIGEM_INTERNO && origem !== SEMEN_ORIGEM_EXTERNO) return null;
  if (!reprodutorKey || !partida) return null;
  return { origem, reprodutorKey, partida };
}

export function encodeSemenUtilizadoGrupoKey(key: string): string {
  return encodeURIComponent(key);
}

export function calcularCustosSemenUtilizado(custos: readonly (number | null | undefined)[]): {
  doses: number;
  usosComCusto: number;
  usosSemCusto: number;
  custoTotal: number | null;
  custoMedio: number | null;
} {
  const doses = custos.length;
  let usosComCusto = 0;
  let totalCents = 0;
  for (const raw of custos) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !(n > 0)) continue;
    usosComCusto += 1;
    totalCents += cents(n);
  }
  const usosSemCusto = doses - usosComCusto;
  if (usosComCusto === 0) {
    return { doses, usosComCusto, usosSemCusto, custoTotal: null, custoMedio: null };
  }
  const custoTotal = totalCents / 100;
  const custoMedio = Math.round(totalCents / usosComCusto) / 100;
  return { doses, usosComCusto, usosSemCusto, custoTotal, custoMedio };
}

export type SemenUtilizadoTotalGeral = {
  totalUtilizacoes: number;
  totalMatrizes: number;
  custoTotal: number | null;
};

/** Resumo do período exportado: IAs, matrizes distintas por femeaId e soma dos snapshots. */
export function calcularSemenUtilizadoTotalGeral(
  usos: readonly SemenUtilizadoUso[],
): SemenUtilizadoTotalGeral {
  return {
    totalUtilizacoes: usos.length,
    totalMatrizes: new Set(usos.map(u => u.femeaId)).size,
    custoTotal: calcularCustosSemenUtilizado(usos.map(u => u.custoDose)).custoTotal,
  };
}

export function extractSemenUtilizadoUso(
  registro: SemenUtilizadoRegistroFonte,
  animaisById: ReadonlyMap<number, SemenUtilizadoAnimalFonte>,
  partidasById?: ReadonlyMap<number, SemenUtilizadoPartidaFonte>,
): SemenUtilizadoUso | null {
  if (String(registro.tipo ?? "").trim() !== REPRO_TIPO_INSEMINACAO) return null;
  const femeaId = Number(registro.femeaId);
  if (!Number.isInteger(femeaId) || femeaId <= 0) return null;
  const dataIso = reproDataToInputISO(registro.dataCobertura);
  if (!dataIso) return null;

  const meta = unpackReproObservacoes(registro.observacoes);
  const machoId = Number(registro.machoId);
  const temMacho = Number.isInteger(machoId) && machoId > 0;
  const partidaSnap = normalizeSemenPartida(meta.partidaSemen ?? "");
  const cadastro =
    meta.semenPartidaId && partidasById ? partidasById.get(meta.semenPartidaId) : undefined;
  const resolved = resolveReproReprodutorDisplay({
    machoId: temMacho ? machoId : null,
    reprodutorSemen: meta.reprodutorSemen,
    partidaSemen: meta.partidaSemen,
    macho: temMacho ? animaisById.get(machoId) : undefined,
    cadastro,
  });
  const origem = resolved.origem;
  const reprodutorKey = resolved.reprodutorKey;
  const reprodutorDisplay = resolved.reprodutorDisplay;
  const machoPersistido = resolved.machoId;

  const femea = animaisById.get(femeaId);
  const fazendaId = Number(femea?.fazendaId) || 0;
  let central = String(meta.centralOrigem ?? "").trim() || null;
  if (!central && meta.semenPartidaId && partidasById) {
    const partida = partidasById.get(meta.semenPartidaId);
    central = String(partida?.centralOrigem ?? "").trim() || null;
  }

  return {
    registroId: registro.id,
    femeaId,
    matrizBrinco: displayAnimal(femea),
    dataIso,
    createdAtIso: createdAtKey(registro.createdAt),
    inseminador: meta.inseminador,
    custoDose: meta.custoDoseSemen,
    resultado: String(registro.resultado ?? "").trim() || null,
    origem,
    machoId: machoPersistido,
    reprodutorKey,
    reprodutorDisplay,
    partida: partidaSnap,
    central,
    fazendaId,
  };
}

export function extractSemenUtilizadoUsos(
  registros: readonly SemenUtilizadoRegistroFonte[],
  animais: readonly SemenUtilizadoAnimalFonte[],
  partidas?: readonly SemenUtilizadoPartidaFonte[],
): SemenUtilizadoUso[] {
  const animaisById = new Map(animais.map(a => [a.id, a]));
  const partidasById = partidas ? new Map(partidas.map(p => [p.id, p])) : undefined;
  const usos: SemenUtilizadoUso[] = [];
  for (const registro of registros) {
    const uso = extractSemenUtilizadoUso(registro, animaisById, partidasById);
    if (uso) usos.push(uso);
  }
  return usos;
}

function matchesPeriodo(dataIso: string, dataIni?: string, dataFim?: string): boolean {
  if (dataIni && dataIso < dataIni) return false;
  if (dataFim && dataIso > dataFim) return false;
  return true;
}

function matchesSearch(uso: SemenUtilizadoUso, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    uso.reprodutorDisplay.toLowerCase().includes(q) ||
    uso.reprodutorKey.toLowerCase().includes(q) ||
    uso.partida.toLowerCase().includes(q) ||
    String(uso.central ?? "").toLowerCase().includes(q)
  );
}

function matchesReprodutor(uso: SemenUtilizadoUso, reprodutor: string): boolean {
  if (!reprodutor) return true;
  if (uso.reprodutorKey === reprodutor) return true;
  return uso.reprodutorDisplay.toLowerCase() === reprodutor.toLowerCase();
}

export function listSemenUtilizadoReprodutorOpcoes(
  usos: readonly SemenUtilizadoUso[],
): SemenUtilizadoReprodutorOpcao[] {
  const byKey = new Map<string, SemenUtilizadoReprodutorOpcao>();
  for (const uso of usos) {
    const label = String(uso.reprodutorDisplay ?? "").trim();
    const value = String(uso.reprodutorKey ?? "").trim();
    if (!value || !label || label === "—") continue;
    if (value === SEMEN_REPRODUTOR_NAO_INFORMADO_KEY) continue;
    if (label === SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL) continue;
    if (reprodutorTextoEhPartida(label, uso.partida)) continue;
    if (byKey.has(value)) continue;
    byKey.set(value, { value, label, origem: uso.origem });
  }
  const sortLabel = (a: SemenUtilizadoReprodutorOpcao, b: SemenUtilizadoReprodutorOpcao) =>
    a.label.localeCompare(b.label, "pt-BR", { numeric: true, sensitivity: "base" });
  const internos = [...byKey.values()]
    .filter(o => o.origem === SEMEN_ORIGEM_INTERNO)
    .sort(sortLabel);
  const externos = [...byKey.values()]
    .filter(o => o.origem === SEMEN_ORIGEM_EXTERNO)
    .sort(sortLabel);
  return [...internos, ...externos];
}

export function filterSemenUtilizadoUsos(
  usos: readonly SemenUtilizadoUso[],
  filtros: SemenUtilizadoFiltros,
): SemenUtilizadoUso[] {
  const search = String(filtros.search ?? "").trim();
  const reprodutor = String(filtros.reprodutor ?? "").trim();
  const fazendaId = Number(filtros.fazendaId) || 0;
  const dataIni = String(filtros.dataIni ?? "").trim();
  const dataFim = String(filtros.dataFim ?? "").trim();
  return usos.filter(uso => {
    if (fazendaId > 0 && uso.fazendaId !== fazendaId) return false;
    if (!matchesPeriodo(uso.dataIso, dataIni || undefined, dataFim || undefined)) return false;
    if (!matchesSearch(uso, search)) return false;
    if (!matchesReprodutor(uso, reprodutor)) return false;
    return true;
  });
}

export function buildSemenUtilizadoVisao(
  registros: readonly SemenUtilizadoRegistroFonte[],
  animais: readonly SemenUtilizadoAnimalFonte[],
  filtros: SemenUtilizadoFiltros,
  partidas?: readonly SemenUtilizadoPartidaFonte[],
): {
  usos: SemenUtilizadoUso[];
  grupos: SemenUtilizadoGrupo[];
  custoTotalFiltrado: number | null;
  reprodutoresOpcoes: SemenUtilizadoReprodutorOpcao[];
} {
  const extraidos = extractSemenUtilizadoUsos(registros, animais, partidas);
  const fazendaId = Number(filtros.fazendaId) || 0;
  const daFazenda =
    fazendaId > 0 ? extraidos.filter(uso => uso.fazendaId === fazendaId) : extraidos;
  const usos = filterSemenUtilizadoUsos(extraidos, filtros);
  const grupos = aggregateSemenUtilizado(usos);
  return {
    usos,
    grupos,
    custoTotalFiltrado: somarCustoTotalSemenUtilizado(grupos),
    reprodutoresOpcoes: listSemenUtilizadoReprodutorOpcoes(daFazenda),
  };
}

export function aggregateSemenUtilizado(usos: readonly SemenUtilizadoUso[]): SemenUtilizadoGrupo[] {
  const byKey = new Map<string, SemenUtilizadoUso[]>();
  for (const uso of usos) {
    const key = buildSemenUtilizadoGrupoKey(uso);
    const list = byKey.get(key) ?? [];
    list.push(uso);
    byKey.set(key, list);
  }

  const grupos: SemenUtilizadoGrupo[] = [];
  for (const [key, list] of byKey) {
    const ordered = [...list].sort((a, b) => {
      if (a.dataIso !== b.dataIso) return b.dataIso.localeCompare(a.dataIso);
      if (a.createdAtIso !== b.createdAtIso) return b.createdAtIso.localeCompare(a.createdAtIso);
      return b.registroId - a.registroId;
    });
    const ultimo = ordered[0]!;
    const matrizes = new Set(list.map(u => u.femeaId)).size;
    const custos = calcularCustosSemenUtilizado(list.map(u => u.custoDose));
    const central =
      ordered.map(u => u.central).find(c => c && c.trim()) || null;
    grupos.push({
      key,
      origem: ultimo.origem,
      machoId: ultimo.machoId,
      reprodutorKey: ultimo.reprodutorKey,
      reprodutorDisplay: ultimo.reprodutorDisplay,
      partida: ultimo.partida,
      central,
      dosesUtilizadas: custos.doses,
      matrizes,
      custoMedioUso: custos.custoMedio,
      custoTotalUtilizado: custos.custoTotal,
      usosComCusto: custos.usosComCusto,
      usosSemCusto: custos.usosSemCusto,
      ultimoUso: ultimo.dataIso,
      ultimoRegistroId: ultimo.registroId,
    });
  }

  grupos.sort((a, b) => {
    if (a.ultimoUso !== b.ultimoUso) return b.ultimoUso.localeCompare(a.ultimoUso);
    if (a.ultimoRegistroId !== b.ultimoRegistroId) return b.ultimoRegistroId - a.ultimoRegistroId;
    return a.key.localeCompare(b.key);
  });
  return grupos;
}

export function somarCustoTotalSemenUtilizado(
  grupos: readonly SemenUtilizadoGrupo[],
): number | null {
  let totalCents = 0;
  let temCusto = false;
  for (const g of grupos) {
    if (g.custoTotalUtilizado == null) continue;
    temCusto = true;
    totalCents += cents(g.custoTotalUtilizado);
  }
  return temCusto ? totalCents / 100 : null;
}

export function sortSemenUtilizadoUsosDetalhe(usos: readonly SemenUtilizadoUso[]): SemenUtilizadoUso[] {
  return [...usos].sort((a, b) => {
    if (a.dataIso !== b.dataIso) return b.dataIso.localeCompare(a.dataIso);
    if (a.createdAtIso !== b.createdAtIso) return b.createdAtIso.localeCompare(a.createdAtIso);
    return b.registroId - a.registroId;
  });
}

/** Dentro do dia: brinco crescente (numérico). Mesma matriz permanece em linhas distintas. */
export function sortSemenUtilizadoUsosPorBrinco(usos: readonly SemenUtilizadoUso[]): SemenUtilizadoUso[] {
  return [...usos].sort((a, b) => {
    const byBrinco = a.matrizBrinco.localeCompare(b.matrizBrinco, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
    if (byBrinco !== 0) return byBrinco;
    if (a.createdAtIso !== b.createdAtIso) return a.createdAtIso.localeCompare(b.createdAtIso);
    return a.registroId - b.registroId;
  });
}

export type SemenUtilizadoDiaGrupo = {
  dataIso: string;
  usos: SemenUtilizadoUso[];
  utilizacoes: number;
  matrizes: number;
  usosComCusto: number;
  custoTotal: number | null;
};

/** Agrupa o histórico pela data operacional da IA. Dentro do dia, cada IA permanece uma linha. */
export function groupSemenUtilizadoUsosPorDia(
  usos: readonly SemenUtilizadoUso[],
): SemenUtilizadoDiaGrupo[] {
  const ordered = sortSemenUtilizadoUsosDetalhe(usos);
  const byDay = new Map<string, SemenUtilizadoUso[]>();
  for (const uso of ordered) {
    const list = byDay.get(uso.dataIso);
    if (list) list.push(uso);
    else byDay.set(uso.dataIso, [uso]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dataIso, list]) => {
      const usosDoDia = sortSemenUtilizadoUsosPorBrinco(list);
      const custos = calcularCustosSemenUtilizado(usosDoDia.map(u => u.custoDose));
      return {
        dataIso,
        usos: usosDoDia,
        utilizacoes: usosDoDia.length,
        matrizes: new Set(usosDoDia.map(u => u.femeaId)).size,
        usosComCusto: custos.usosComCusto,
        custoTotal: custos.custoTotal,
      };
    });
}

/** Estado inicial da tela: só o dia mais recente aberto. */
export function semenUtilizadoDiasAbertosIniciais(
  dias: readonly { dataIso: string }[],
): string[] {
  return dias[0]?.dataIso ? [dias[0].dataIso] : [];
}

/** Excel/PDF da listagem: mais antigo → mais recente (inverso da tela). */
export function sortSemenUtilizadoGruposExport(
  grupos: readonly SemenUtilizadoGrupo[],
): SemenUtilizadoGrupo[] {
  return [...grupos].sort((a, b) => {
    if (a.ultimoUso !== b.ultimoUso) return a.ultimoUso.localeCompare(b.ultimoUso);
    const repro = a.reprodutorDisplay.localeCompare(b.reprodutorDisplay, "pt-BR");
    if (repro !== 0) return repro;
    const partida = a.partida.localeCompare(b.partida, "pt-BR");
    if (partida !== 0) return partida;
    return a.key.localeCompare(b.key);
  });
}

/** Excel do detalhe: mais antigo → mais recente (inverso da tela). */
export function sortSemenUtilizadoUsosExport(usos: readonly SemenUtilizadoUso[]): SemenUtilizadoUso[] {
  return [...usos].sort((a, b) => {
    if (a.dataIso !== b.dataIso) return a.dataIso.localeCompare(b.dataIso);
    if (a.createdAtIso !== b.createdAtIso) return a.createdAtIso.localeCompare(b.createdAtIso);
    return a.registroId - b.registroId;
  });
}
