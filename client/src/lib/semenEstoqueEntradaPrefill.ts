import {
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  type SemenOrigemReprodutor,
} from "@shared/semenEstoque";

export type SemenEntradaPrefill = {
  origem: SemenOrigemReprodutor;
  machoId: number | null;
  reprodutorTexto: string;
  reprodutorDisplay: string;
  partida: string;
  centralOrigem: string;
};

export type SemenPartidaPrefillSource = {
  origemReprodutor: string;
  machoId: number | null;
  reprodutorTexto?: string | null;
  reprodutorDisplay: string;
  partida: string;
  centralOrigem?: string | null;
};

/** Monta pré-preenchimento seguro para repor estoque da partida existente. */
export function buildSemenEntradaPrefillFromPartida(
  partida: SemenPartidaPrefillSource,
): SemenEntradaPrefill | null {
  const origem = partida.origemReprodutor;
  if (origem !== SEMEN_ORIGEM_INTERNO && origem !== SEMEN_ORIGEM_EXTERNO) return null;
  if (origem === SEMEN_ORIGEM_INTERNO) {
    const machoId = Number(partida.machoId);
    if (!Number.isInteger(machoId) || machoId <= 0) return null;
  }
  return {
    origem,
    machoId: origem === SEMEN_ORIGEM_INTERNO ? Number(partida.machoId) : null,
    reprodutorTexto: (partida.reprodutorTexto ?? partida.reprodutorDisplay ?? "").trim(),
    reprodutorDisplay: partida.reprodutorDisplay,
    partida: partida.partida,
    centralOrigem: partida.centralOrigem ?? "",
  };
}
