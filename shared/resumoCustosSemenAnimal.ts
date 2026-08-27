import { unpackReproObservacoes } from "./reproRegistroMeta";
import { calcularCustosSemenUtilizado, REPRO_TIPO_INSEMINACAO } from "./semenUtilizado";

export type ResumoCustosSemenAnimalEvento = {
  tipo?: string | null;
  observacoes?: string | null;
};

export type ResumoCustosSemenAnimal = {
  totalInseminacoes: number;
  inseminacoesComCusto: number;
  /** Soma dos snapshots de sêmen. Null quando nenhuma IA tem custo. */
  custoTotal: number | null;
  /** custoTotal / inseminacoesComCusto. Null quando nenhuma IA tem custo. */
  custoMedio: number | null;
};

/**
 * Resumo gerencial de custo de sêmen da matriz.
 * Nesta etapa só sêmen. Futuro: somar hormônios/dispositivos em camadas à parte.
 */
export function calcularResumoCustosSemenAnimal(
  eventos: readonly ResumoCustosSemenAnimalEvento[],
): ResumoCustosSemenAnimal {
  const ias = eventos.filter(
    e => String(e.tipo ?? "").trim() === REPRO_TIPO_INSEMINACAO,
  );
  const custos = ias.map(e => unpackReproObservacoes(e.observacoes).custoDoseSemen);
  const r = calcularCustosSemenUtilizado(custos);
  return {
    totalInseminacoes: r.doses,
    inseminacoesComCusto: r.usosComCusto,
    custoTotal: r.custoTotal,
    custoMedio: r.custoMedio,
  };
}
