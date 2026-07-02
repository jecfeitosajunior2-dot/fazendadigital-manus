/** Visão Geral do Rebanho — fallback vazio quando o banco não está disponível */

export type RebanhoOverviewChartItem = { label: string; value: number; pct: number };

export type RebanhoOverviewData = {
  totalAnimais: number;
  totalMachos: number;
  totalFemeas: number;
  pesoMedio: number | null;
  gmdMedio: number | null;
  totalEmCarencia: number;
  totalSemLote: number;
  totalSemPesagemRecente: number;
  totalLotesSuperLotados: number;
  porCategoria: RebanhoOverviewChartItem[];
  porCategoriaMachos: RebanhoOverviewChartItem[];
  porCategoriaFemeas: RebanhoOverviewChartItem[];
  porRaca: RebanhoOverviewChartItem[];
  porAtividade: RebanhoOverviewChartItem[];
  porFaixaPeso: RebanhoOverviewChartItem[];
  porFaixaEtaria: RebanhoOverviewChartItem[];
  porFaixaEtariaCategoria: { faixa: string; categorias: Record<string, number> }[];
  top5Gmd: { animalId?: number; brinco: string | null; categoria: string | null; gmd: number }[];
  evolucaoEfetivo: { entradas: number; saidas: number; nascimentosNoMes: number };
};

/** Estado vazio — espelha o retorno da API sem animais cadastrados */
export const REBANHO_OVERVIEW_DEMO: RebanhoOverviewData = {
  totalAnimais: 0,
  totalMachos: 0,
  totalFemeas: 0,
  pesoMedio: null,
  gmdMedio: null,
  totalEmCarencia: 0,
  totalSemLote: 0,
  totalSemPesagemRecente: 0,
  totalLotesSuperLotados: 0,
  porCategoria: [],
  porCategoriaMachos: [],
  porCategoriaFemeas: [],
  porRaca: [],
  porAtividade: [],
  porFaixaPeso: [],
  porFaixaEtaria: [],
  porFaixaEtariaCategoria: [],
  top5Gmd: [],
  evolucaoEfetivo: { entradas: 0, saidas: 0, nascimentosNoMes: 0 },
};
