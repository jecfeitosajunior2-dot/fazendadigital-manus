/** Visão Geral do Rebanho — print Manus (6 animais brincos 02–55) */

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
  top5Gmd: { brinco: string | null; categoria: string | null; gmd: number }[];
  evolucaoEfetivo: { entradas: number; saidas: number; nascimentosNoMes: number };
};

/** Valores fixos do print Manus (rebanho/visao-geral) */
export const REBANHO_OVERVIEW_DEMO: RebanhoOverviewData = {
  totalAnimais: 6,
  totalMachos: 4,
  totalFemeas: 2,
  pesoMedio: 200,
  gmdMedio: 25,
  totalEmCarencia: 0,
  totalSemLote: 0,
  totalSemPesagemRecente: 4,
  totalLotesSuperLotados: 1,
  porCategoria: [
    { label: "Bezerro", value: 2, pct: 33 },
    { label: "Vaca", value: 2, pct: 33 },
    { label: "Novilho", value: 1, pct: 17 },
    { label: "Boi", value: 1, pct: 17 },
  ],
  porCategoriaMachos: [
    { label: "Bezerro", value: 2, pct: 50 },
    { label: "Novilho", value: 1, pct: 25 },
    { label: "Boi", value: 1, pct: 25 },
  ],
  porCategoriaFemeas: [
    { label: "Vaca", value: 2, pct: 100 },
  ],
  porRaca: [
    { label: "Nelore", value: 5, pct: 83 },
    { label: "Sem raça", value: 1, pct: 17 },
  ],
  porAtividade: [
    { label: "Cria", value: 2, pct: 33 },
    { label: "Outros", value: 4, pct: 67 },
  ],
  porFaixaPeso: [
    { label: "< 200 kg", value: 1, pct: 17 },
    { label: "200–350 kg", value: 1, pct: 17 },
    { label: "350–500 kg", value: 0, pct: 0 },
    { label: "> 500 kg", value: 0, pct: 0 },
  ],
  porFaixaEtaria: [
    { label: "0–8 meses", value: 2, pct: 33 },
    { label: "9–12 meses", value: 0, pct: 0 },
    { label: "13–24 meses", value: 1, pct: 17 },
    { label: "25–36 meses", value: 0, pct: 0 },
    { label: "> 36 meses", value: 3, pct: 50 },
  ],
  porFaixaEtariaCategoria: [
    {
      faixa: "0–8 meses",
      categorias: { Bezerro: 2, Novilho: 0, Boi: 0, Bezerra: 0, Novilha: 0, Vaca: 0 },
    },
    {
      faixa: "9–12 meses",
      categorias: { Bezerro: 0, Novilho: 0, Boi: 0, Bezerra: 0, Novilha: 0, Vaca: 0 },
    },
    {
      faixa: "13–24 meses",
      categorias: { Bezerro: 0, Novilho: 1, Boi: 0, Bezerra: 0, Novilha: 0, Vaca: 0 },
    },
    {
      faixa: "25–36 meses",
      categorias: { Bezerro: 0, Novilho: 0, Boi: 0, Bezerra: 0, Novilha: 0, Vaca: 0 },
    },
    {
      faixa: "> 36 meses",
      categorias: { Bezerro: 0, Novilho: 0, Boi: 1, Bezerra: 0, Novilha: 0, Vaca: 2 },
    },
  ],
  top5Gmd: [
    { brinco: "02", categoria: "Novilho", gmd: 30 },
    { brinco: "55", categoria: "Boi", gmd: 20 },
  ],
  evolucaoEfetivo: { entradas: 0, saidas: 0, nascimentosNoMes: 1 },
};

export function isRebanhoOverviewDemo(data: RebanhoOverviewData | undefined): boolean {
  return data?.totalAnimais === 6 && data.totalMachos === 4 && data.totalFemeas === 2;
}
