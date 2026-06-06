/**
 * Fonte única de verdade para Tipos e Marcas de Máquinas.
 * Importar daqui em TODOS os pontos da aplicação:
 *   - Formulário de cadastro/edição (frontend)
 *   - Planilha de importação (backend gerarModeloPlanilha)
 *   - Validação de importação (backend validarImportacao / importar)
 *   - shared/importacaoMaquinarios.ts
 *
 * Mapeamento de migração (tipos antigos → novo tipo):
 *   Trator, Colheitadeira, Plantadeira, Pulverizador → Máquinas
 *   Implemento → Implementos
 *   Caminhão, Carreta, Carro, Moto → Veículos
 *   Outro → Outros
 */

export const TIPOS_MAQUINA = [
  "Aeronaves",
  "Máquinas",
  "Implementos",
  "Veículos",
  "Equipamentos com Motor",
  "Outros",
] as const;

export type TipoMaquina = (typeof TIPOS_MAQUINA)[number];

/** Mapeamento de tipos legados para os novos tipos macro */
export const MAPEAMENTO_TIPO_LEGADO: Record<string, TipoMaquina> = {
  Trator: "Máquinas",
  Colheitadeira: "Máquinas",
  Plantadeira: "Máquinas",
  Pulverizador: "Máquinas",
  Implemento: "Implementos",
  Caminhão: "Veículos",
  Carreta: "Veículos",
  Carro: "Veículos",
  Moto: "Veículos",
  Outro: "Outros",
};

export const MARCAS_MAQUINA = [
  "John Deere",
  "Case IH",
  "New Holland",
  "Massey Ferguson",
  "Valtra",
  "Ford",
  "Volkswagen",
  "Mercedes-Benz",
  "Outra",
] as const;

export type MarcaMaquina = (typeof MARCAS_MAQUINA)[number];
