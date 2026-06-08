/**
 * Faixas etárias (meses) do Gerenciamento de Lotes — padrão iRancho
 */

export const FAIXAS_IDADE_LOTE = ['0-8', '9-12', '13-24', '25-36', '36+'] as const;
export type FaixaIdadeLote = (typeof FAIXAS_IDADE_LOTE)[number];

export type ContagemPorFaixa = Record<FaixaIdadeLote, number>;

export const CONTAGEM_VAZIA: ContagemPorFaixa = {
  '0-8': 0,
  '9-12': 0,
  '13-24': 0,
  '25-36': 0,
  '36+': 0,
};

export function calcularIdadeMeses(dataNascimento: string | Date | null | undefined, referencia = new Date()): number | null {
  if (!dataNascimento) return null;
  const nasc = dataNascimento instanceof Date ? dataNascimento : new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const ref = new Date(referencia);
  ref.setHours(0, 0, 0, 0);
  nasc.setHours(0, 0, 0, 0);
  const diffMs = ref.getTime() - nasc.getTime();
  if (diffMs < 0) return null;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

export function faixaIdadeLote(idadeMeses: number | null | undefined): FaixaIdadeLote | null {
  if (idadeMeses === null || idadeMeses === undefined || idadeMeses < 0) return null;
  if (idadeMeses <= 8) return '0-8';
  if (idadeMeses <= 12) return '9-12';
  if (idadeMeses <= 24) return '13-24';
  if (idadeMeses <= 36) return '25-36';
  return '36+';
}

export function criarContagemVazia(): ContagemPorFaixa {
  return { ...CONTAGEM_VAZIA };
}

export type ResumoSexoFaixa = {
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
};

export function criarResumoSexoFaixa(): ResumoSexoFaixa {
  return { machos: criarContagemVazia(), femeas: criarContagemVazia() };
}

export function adicionarAnimalAoResumo(
  resumo: ResumoSexoFaixa,
  sexo: string,
  idadeMeses: number | null | undefined,
): ResumoSexoFaixa {
  const faixa = faixaIdadeLote(idadeMeses);
  if (!faixa) return resumo;

  const alvo = sexo === 'femea' ? 'femeas' : sexo === 'macho' ? 'machos' : null;
  if (!alvo) return resumo;

  return {
    ...resumo,
    [alvo]: {
      ...resumo[alvo],
      [faixa]: resumo[alvo][faixa] + 1,
    },
  };
}
