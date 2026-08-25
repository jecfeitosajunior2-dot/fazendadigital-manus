import { unpackReproObservacoes } from "./reproRegistroMeta";
import { SEMEN_MOV_TIPO_ENTRADA, SEMEN_MOV_TIPO_SAIDA_IA } from "./semenEstoque";

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
export function formatSemenMovimentacaoTipoLabel(tipo: string): string {
  if (tipo === SEMEN_MOV_TIPO_SAIDA_IA) return "Uso em inseminação";
  if (tipo === SEMEN_MOV_TIPO_ENTRADA) return "Entrada";
  return tipo;
}

export function formatSemenMovimentacaoQuantidadeLabel(quantidadeDoses: number): string {
  const qtd = Math.max(0, Number(quantidadeDoses) || 0);
  return qtd === 1 ? "1 dose" : `${qtd} doses`;
}

/** Entrada mostra custo total + custo/dose. Uso em inseminação mostra só o snapshot da dose. */
export function shouldShowSemenMovimentacaoCustoTotal(tipo: string): boolean {
  return tipo === SEMEN_MOV_TIPO_ENTRADA;
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
  mov: { tipo: string; quantidadeDoses: number; observacoes?: string | null },
  reproById: ReadonlyMap<number, SemenReproContext>,
  brincoByAnimalId: ReadonlyMap<number, string>,
): SemenMovimentacaoDisplayFields {
  const tipoLabel = formatSemenMovimentacaoTipoLabel(mov.tipo);
  const quantidadeLabel = formatSemenMovimentacaoQuantidadeLabel(mov.quantidadeDoses);

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
