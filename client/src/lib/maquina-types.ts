/**
 * Re-exporta de shared/maquina-types.ts — fonte única de verdade.
 * NÃO duplicar listas aqui. Alterar apenas em shared/maquina-types.ts.
 */
export {
  TIPOS_MAQUINA,
  MARCAS_MAQUINA,
  MARCAS_POR_TIPO,
  getMarcasPorTipo,
  isMarcaValidaParaTipo,
  TIPOS_MEDIDOR,
  TIPOS_MEDIDOR_LABEL,
  sugerirTipoMedidor,
  labelIdentificadorMaquina,
} from "@shared/maquina-types";
export type { TipoMaquina, MarcaMaquina, TipoMedidor } from "@shared/maquina-types";
