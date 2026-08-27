import { unpackReproObservacoes } from "./reproRegistroMeta";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
} from "./semenEstoque";
import {
  formatSemenAjusteContextoExport,
  formatSemenAjusteHistoricoLinhas,
  formatSemenAjusteQuantidadeLabel,
  buildSemenAjusteResumoTela,
  isSemenMovimentacaoAjusteEstoque,
  unpackSemenAjusteObservacoes,
  type SemenAjusteResumoTela,
  type SemenAjusteSnapshot,
} from "./semenEstoqueAjuste";

export type SemenReproContext = {
  femeaId: number;
  inseminador: string | null;
};

export type SemenMovimentacaoDisplayFields = {
  tipoLabel: string;
  quantidadeLabel: string;
  contextoDisplay: string | null;
};

/** Label de negócio para o tipo persistido da movimentação. */
export function formatSemenMovimentacaoTipoLabel(
  tipo: string,
  movimentacaoOrigemId?: number | null,
): string {
  if (tipo === SEMEN_MOV_TIPO_SAIDA_IA) return "Uso em inseminação";
  if (tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA) return "Correção de lançamento";
  if (isSemenMovimentacaoAjusteEstoque(tipo)) return "Ajuste de estoque";
  if (tipo === SEMEN_MOV_TIPO_ENTRADA && Number(movimentacaoOrigemId) > 0) {
    return "Entrada corrigida";
  }
  if (tipo === SEMEN_MOV_TIPO_ENTRADA) return "Entrada";
  return "Movimentação";
}

export function formatSemenMovimentacaoQuantidadeLabel(
  quantidadeDoses: number,
  tipo?: string,
  observacoes?: string | null,
): string {
  if (tipo && isSemenMovimentacaoAjusteEstoque(tipo)) {
    const snap = unpackSemenAjusteObservacoes(observacoes);
    if (snap) return formatSemenAjusteQuantidadeLabel(snap);
  }
  const qtd = Math.max(0, Number(quantidadeDoses) || 0);
  const base = qtd === 1 ? "1 dose" : `${qtd} doses`;
  if (tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA) return `Estorno de ${base}`;
  return base;
}

/** Entrada e correção mostram custo total + custo/dose. Uso em inseminação mostra só o snapshot da dose. */
export function shouldShowSemenMovimentacaoCustoTotal(tipo: string): boolean {
  return tipo === SEMEN_MOV_TIPO_ENTRADA || tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA;
}

/** Extrai referência estrutural ao registro reprodutivo (não exibir na UI). */
export function parseSemenMovimentacaoReproRegistroId(
  observacoes: string | null | undefined,
): number | null {
  if (!observacoes) return null;
  const match = observacoes.match(/registro repro #(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function collectSemenMovimentacaoReproRegistroIds(
  movimentacoes: ReadonlyArray<{ tipo: string; observacoes?: string | null }>,
): number[] {
  const ids = new Set<number>();
  for (const mov of movimentacoes) {
    if (mov.tipo !== SEMEN_MOV_TIPO_SAIDA_IA) continue;
    const reproId = parseSemenMovimentacaoReproRegistroId(mov.observacoes);
    if (reproId != null) ids.add(reproId);
  }
  return [...ids];
}

export function formatSemenMovimentacaoContexto(params: {
  matrizBrinco?: string | null;
  inseminador?: string | null;
}): string | null {
  const brinco = params.matrizBrinco?.trim();
  const inseminador = params.inseminador?.trim();
  if (brinco && inseminador) return `Matriz ${brinco} · Inseminador ${inseminador}`;
  if (brinco) return `Matriz ${brinco}`;
  return null;
}

export function buildSemenMovimentacaoDisplay(
  mov: {
    tipo: string;
    quantidadeDoses: number;
    observacoes?: string | null;
    movimentacaoOrigemId?: number | null;
  },
  reproById: ReadonlyMap<number, SemenReproContext>,
  brincoByAnimalId: ReadonlyMap<number, string>,
): SemenMovimentacaoDisplayFields {
  const tipoLabel = formatSemenMovimentacaoTipoLabel(mov.tipo, mov.movimentacaoOrigemId);
  const quantidadeLabel = formatSemenMovimentacaoQuantidadeLabel(
    mov.quantidadeDoses,
    mov.tipo,
    mov.observacoes,
  );

  if (isSemenMovimentacaoAjusteEstoque(mov.tipo)) {
    const snap = unpackSemenAjusteObservacoes(mov.observacoes);
    return {
      tipoLabel,
      quantidadeLabel,
      contextoDisplay: snap ? formatSemenAjusteContextoExport(snap) : null,
    };
  }

  if (mov.tipo !== SEMEN_MOV_TIPO_SAIDA_IA) {
    return { tipoLabel, quantidadeLabel, contextoDisplay: null };
  }

  const reproId = parseSemenMovimentacaoReproRegistroId(mov.observacoes);
  if (reproId == null) {
    return { tipoLabel, quantidadeLabel, contextoDisplay: null };
  }

  const repro = reproById.get(reproId);
  if (!repro) {
    return { tipoLabel, quantidadeLabel, contextoDisplay: null };
  }

  return {
    tipoLabel,
    quantidadeLabel,
    contextoDisplay: formatSemenMovimentacaoContexto({
      matrizBrinco: brincoByAnimalId.get(repro.femeaId),
      inseminador: repro.inseminador,
    }),
  };
}

export function buildSemenMovimentacoesDisplay<
  T extends { tipo: string; quantidadeDoses: number; observacoes?: string | null },
>(
  movimentacoes: T[],
  reproById: ReadonlyMap<number, SemenReproContext>,
  brincoByAnimalId: ReadonlyMap<number, string>,
): Array<T & SemenMovimentacaoDisplayFields> {
  return movimentacoes.map(mov => ({
    ...mov,
    ...buildSemenMovimentacaoDisplay(mov, reproById, brincoByAnimalId),
  }));
}

/** Monta mapas de contexto a partir de registros reprodutivos e animais (batch). */
export function buildSemenReproContextMapsFromRows(params: {
  registros: ReadonlyArray<{
    id: number;
    femeaId: number;
    observacoes?: string | null;
  }>;
  animais: ReadonlyArray<{ id: number; brinco?: string | null }>;
}): {
  reproById: Map<number, SemenReproContext>;
  brincoByAnimalId: Map<number, string>;
} {
  const reproById = new Map<number, SemenReproContext>();
  for (const registro of params.registros) {
    const meta = unpackReproObservacoes(registro.observacoes);
    reproById.set(registro.id, {
      femeaId: registro.femeaId,
      inseminador: meta.inseminador,
    });
  }

  const brincoByAnimalId = new Map<number, string>();
  for (const animal of params.animais) {
    const brinco = animal.brinco?.trim();
    if (brinco) brincoByAnimalId.set(animal.id, brinco);
  }

  return { reproById, brincoByAnimalId };
}

function historicoCreatedAtKey(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value);
}

function isoDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function isSemenMovimentacaoEstornoTecnico(tipo: string): boolean {
  return tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA;
}

type SemenHistoricoOrdenavel = {
  id: number;
  dataEntrada?: string;
  createdAt?: string | Date | null;
};

function dataOrdenacaoOperacional(mov: SemenHistoricoOrdenavel): string {
  return isoDateOnly(mov.dataEntrada) ?? isoDateOnly(mov.createdAt) ?? "";
}

export type SemenHistoricoGrupo<T> =
  | { kind: "item"; mov: T }
  | { kind: "correcao"; original: T; estorno: T; novaEntrada: T };

export type SemenHistoricoOrdem = "asc" | "desc";

function chaveUnidadeHistorico<T extends SemenHistoricoOrdenavel>(
  grupo: SemenHistoricoGrupo<T>,
): string {
  if (grupo.kind === "item") {
    const data = dataOrdenacaoOperacional(grupo.mov);
    return `${data}#${historicoCreatedAtKey(grupo.mov.createdAt)}#${String(grupo.mov.id).padStart(12, "0")}`;
  }
  const data =
    dataOrdenacaoOperacional(grupo.novaEntrada) || dataOrdenacaoOperacional(grupo.original);
  const representativa = grupo.novaEntrada;
  return `${data}#${historicoCreatedAtKey(representativa.createdAt)}#${String(representativa.id).padStart(12, "0")}`;
}

/** Ordena unidades visuais. Não separa o grupo de correção. Não muta o array recebido. */
export function sortSemenHistoricoGrupos<T extends SemenHistoricoOrdenavel>(
  grupos: readonly SemenHistoricoGrupo<T>[],
  ordem: SemenHistoricoOrdem = "desc",
): Array<SemenHistoricoGrupo<T>> {
  const copy = [...grupos];
  copy.sort((a, b) => {
    const cmp = chaveUnidadeHistorico(a).localeCompare(chaveUnidadeHistorico(b));
    return ordem === "asc" ? cmp : -cmp;
  });
  return copy;
}

/** Agrupa original + estorno + nova entrada. Não ordena — use sortSemenHistoricoGrupos. */
export function groupSemenHistoricoParaExibicao<
  T extends {
    id: number;
    tipo: string;
    createdAt?: string | Date | null;
    dataEntrada?: string;
    movimentacaoOrigemId?: number | null;
    grupoCorrecaoId?: string | null;
  },
>(movimentacoes: T[]): Array<SemenHistoricoGrupo<T>> {
  const byId = new Map(movimentacoes.map(m => [m.id, m]));
  const consumed = new Set<number>();
  const grupos: Array<SemenHistoricoGrupo<T>> = [];

  for (const estorno of movimentacoes) {
    if (estorno.tipo !== SEMEN_MOV_TIPO_ESTORNO_ENTRADA) continue;
    const grupoId = String(estorno.grupoCorrecaoId ?? "").trim();
    const origemId = Number(estorno.movimentacaoOrigemId);
    const original = origemId > 0 ? byId.get(origemId) : undefined;
    const novaEntrada = grupoId
      ? movimentacoes.find(
          m =>
            m.tipo === SEMEN_MOV_TIPO_ENTRADA &&
            m.grupoCorrecaoId === grupoId &&
            m.id !== original?.id,
        )
      : undefined;
    if (!original || !novaEntrada) continue;
    consumed.add(original.id);
    consumed.add(estorno.id);
    consumed.add(novaEntrada.id);
    grupos.push({ kind: "correcao", original, estorno, novaEntrada });
  }

  for (const mov of movimentacoes) {
    if (!consumed.has(mov.id)) grupos.push({ kind: "item", mov });
  }

  return grupos;
}

function isoToBr(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Texto secundário da original: data da auditoria + motivo humano. */
export function formatSemenHistoricoCorrecaoLinha(
  dataCorrecaoIso: string | null | undefined,
  motivo: string | null | undefined,
): string | null {
  const dataIso = isoDateOnly(dataCorrecaoIso);
  const motivoTxt = String(motivo ?? "").trim();
  if (!dataIso && !motivoTxt) return null;
  if (dataIso && motivoTxt) return `Corrigida em ${isoToBr(dataIso)} · Motivo: ${motivoTxt}`;
  if (dataIso) return `Corrigida em ${isoToBr(dataIso)}`;
  return `Motivo: ${motivoTxt}`;
}

export type SemenHistoricoVisualRow<T> = T & {
  correcaoResumo: string | null;
  dataCorrecaoIso: string | null;
  motivoCorrecaoExport: string | null;
  ajusteSnapshot: SemenAjusteSnapshot | null;
  ajusteLinhas: { saldo: string; custoMedio: string; valor: string } | null;
  ajusteResumoTela: SemenAjusteResumoTela | null;
};

function metaCorrecaoOriginal<
  T extends {
    id: number;
    motivoCorrecao?: string | null;
    motivoCorrecaoLabel?: string | null;
  },
>(
  mov: T,
  estornoPorOrigem: ReadonlyMap<
    number,
    { createdAt?: string | Date | null; dataEntrada?: string; motivo: string }
  >,
): { dataIso: string | null; motivo: string | null } {
  const info = estornoPorOrigem.get(mov.id);
  if (!info) return { dataIso: null, motivo: null };
  const motivo = String(mov.motivoCorrecaoLabel ?? info.motivo ?? "").trim() || null;
  const dataIso = isoDateOnly(info.createdAt) ?? isoDateOnly(info.dataEntrada);
  return { dataIso, motivo };
}

function withVisualCorrecao<T extends { tipo?: string; observacoes?: string | null; motivoCorrecao?: string | null }>(
  mov: T,
  meta: { dataIso: string | null; motivo: string | null },
): SemenHistoricoVisualRow<T> {
  const isAjuste = isSemenMovimentacaoAjusteEstoque(String(mov.tipo ?? ""));
  const ajusteSnapshot = isAjuste ? unpackSemenAjusteObservacoes(mov.observacoes) : null;
  return {
    ...mov,
    correcaoResumo: formatSemenHistoricoCorrecaoLinha(meta.dataIso, meta.motivo),
    dataCorrecaoIso: meta.dataIso,
    motivoCorrecaoExport:
      meta.motivo ?? (isAjuste ? String(mov.motivoCorrecao ?? "").trim() || null : null),
    ajusteSnapshot,
    ajusteLinhas: ajusteSnapshot ? formatSemenAjusteHistoricoLinhas(ajusteSnapshot) : null,
    ajusteResumoTela: ajusteSnapshot ? buildSemenAjusteResumoTela(ajusteSnapshot) : null,
  };
}

/**
 * Visão operacional do histórico: oculta o estorno técnico, anexa
 * motivo/data na original e ordena unidades por data operacional.
 * Dentro do grupo: entrada corrigida antes da original. Não altera o ledger.
 * `ordem: "desc"` = tela (mais recente primeiro). `ordem: "asc"` = relatório.
 */
export function buildSemenHistoricoVisual<
  T extends {
    id: number;
    tipo: string;
    createdAt?: string | Date | null;
    dataEntrada?: string;
    movimentacaoOrigemId?: number | null;
    grupoCorrecaoId?: string | null;
    motivoCorrecao?: string | null;
    motivoCorrecaoLabel?: string | null;
    observacoes?: string | null;
  },
>(
  movimentacoes: readonly T[],
  opts?: { ordem?: SemenHistoricoOrdem },
): Array<SemenHistoricoVisualRow<T>> {
  const estornoPorOrigem = new Map<
    number,
    { createdAt?: string | Date | null; dataEntrada?: string; motivo: string }
  >();
  for (const mov of movimentacoes) {
    if (!isSemenMovimentacaoEstornoTecnico(mov.tipo)) continue;
    const origemId = Number(mov.movimentacaoOrigemId);
    if (!(origemId > 0)) continue;
    estornoPorOrigem.set(origemId, {
      createdAt: mov.createdAt,
      dataEntrada: mov.dataEntrada,
      motivo: String(mov.motivoCorrecaoLabel ?? mov.motivoCorrecao ?? "").trim(),
    });
  }

  const grupos = sortSemenHistoricoGrupos(
    groupSemenHistoricoParaExibicao([...movimentacoes]),
    opts?.ordem ?? "desc",
  );
  const visuais: Array<SemenHistoricoVisualRow<T>> = [];

  for (const grupo of grupos) {
    if (grupo.kind === "correcao") {
      visuais.push(withVisualCorrecao(grupo.novaEntrada, { dataIso: null, motivo: null }));
      visuais.push(withVisualCorrecao(grupo.original, metaCorrecaoOriginal(grupo.original, estornoPorOrigem)));
      continue;
    }
    if (isSemenMovimentacaoEstornoTecnico(grupo.mov.tipo)) continue;
    visuais.push(withVisualCorrecao(grupo.mov, metaCorrecaoOriginal(grupo.mov, estornoPorOrigem)));
  }

  return visuais;
}
