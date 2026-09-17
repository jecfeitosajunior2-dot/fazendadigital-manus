import { SEMEN_ORIGEM_EXTERNO, SEMEN_ORIGEM_INTERNO } from "@shared/semenEstoque";
import { formatValorAtualEstoqueSemenDisplay } from "@shared/semenEstoqueValor";

export const SEMEN_DETALHE_LABEL_CENTRAL = "Central";
export const SEMEN_DETALHE_LABEL_SALDO = "Saldo";
export const SEMEN_DETALHE_LABEL_CUSTO_DOSE = "Custo por dose";
export const SEMEN_DETALHE_LABEL_VALOR_ESTOQUE = "Valor em estoque";
export const SEMEN_DETALHE_LABEL_PROCEDENCIA = "Procedência";

/** Mesma formatação da coluna Valor em estoque da listagem. */
export function formatSemenPartidaDetalheValorEstoque(
  valorAtualEstoque: number | null | undefined,
): string {
  return formatValorAtualEstoqueSemenDisplay(valorAtualEstoque);
}

/**
 * Título = reprodutor. Partida sempre rotulada quando existe.
 * São campos distintos: o texto pode coincidir sem ser o mesmo dado.
 */
export function buildSemenPartidaDetalheIdentidade(params: {
  reprodutorDisplay?: string | null;
  partida?: string | null;
}): { titulo: string; partidaLinha: string | null } {
  const reprodutor = String(params.reprodutorDisplay ?? "").trim();
  const partida = String(params.partida ?? "").trim();
  const titulo = reprodutor || partida || "—";
  if (!partida) return { titulo, partidaLinha: null };
  return { titulo, partidaLinha: `Partida: ${partida}` };
}

export function formatSemenPartidaProcedenciaLabel(
  origemReprodutor: string | null | undefined,
): string {
  if (origemReprodutor === SEMEN_ORIGEM_INTERNO) return "Rebanho";
  if (origemReprodutor === SEMEN_ORIGEM_EXTERNO) return "Externa";
  return "—";
}
