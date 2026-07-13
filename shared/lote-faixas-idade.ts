/**
 * Faixas etárias (meses completos) do Gerenciamento de Lotes
 *
 * Intervalos sem sobreposição:
 * 0–8 | 9–12 | 13–24 | 25–35 | 36+
 */

export const FAIXAS_IDADE_LOTE = ['0-8', '9-12', '13-24', '25-35', '36+'] as const;
export type FaixaIdadeLote = (typeof FAIXAS_IDADE_LOTE)[number];

/** Rótulos de exibição (meses completos, sem sobreposição). */
export const FAIXA_IDADE_LOTE_LABELS: Record<FaixaIdadeLote, string> = {
  '0-8': '0–8',
  '9-12': '9–12',
  '13-24': '13–24',
  '25-35': '25–35',
  '36+': '36+',
};

export type ContagemPorFaixa = Record<FaixaIdadeLote, number>;

export const CONTAGEM_VAZIA: ContagemPorFaixa = {
  '0-8': 0,
  '9-12': 0,
  '13-24': 0,
  '25-35': 0,
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
  if (idadeMeses <= 35) return '25-35';
  return '36+';
}

/** Intervalo em meses completos para filtrar a lista de animais. */
export function faixaIdadeLoteRange(faixa: FaixaIdadeLote): { min: number; max: number | null } {
  switch (faixa) {
    case '0-8':
      return { min: 0, max: 8 };
    case '9-12':
      return { min: 9, max: 12 };
    case '13-24':
      return { min: 13, max: 24 };
    case '25-35':
      return { min: 25, max: 35 };
    case '36+':
      return { min: 36, max: null };
  }
}

export function criarContagemVazia(): ContagemPorFaixa {
  return { ...CONTAGEM_VAZIA };
}

export type ResumoSexoFaixa = {
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
  /** Animais sem data de nascimento (idade desconhecida) — não entram nas faixas mas contam no total */
  machosSemIdade: number;
  femeasSemIdade: number;
};

export function criarResumoSexoFaixa(): ResumoSexoFaixa {
  return { machos: criarContagemVazia(), femeas: criarContagemVazia(), machosSemIdade: 0, femeasSemIdade: 0 };
}

export function adicionarAnimalAoResumo(
  resumo: ResumoSexoFaixa,
  sexo: string,
  idadeMeses: number | null | undefined,
): ResumoSexoFaixa {
  const alvo = sexo === 'femea' ? 'femeas' : sexo === 'macho' ? 'machos' : null;
  if (!alvo) return resumo;

  const faixa = faixaIdadeLote(idadeMeses);

  // Sem data de nascimento: conta no campo semIdade (sem faixa)
  if (!faixa) {
    const campoSemIdade = alvo === 'femeas' ? 'femeasSemIdade' : 'machosSemIdade';
    return { ...resumo, [campoSemIdade]: resumo[campoSemIdade] + 1 };
  }

  return {
    ...resumo,
    [alvo]: {
      ...resumo[alvo],
      [faixa]: resumo[alvo][faixa] + 1,
    },
  };
}

export function totalPorSexoFaixas(
  contagem: ContagemPorFaixa,
  semIdade = 0,
): number {
  return FAIXAS_IDADE_LOTE.reduce((s, f) => s + (contagem[f] ?? 0), 0) + semIdade;
}
