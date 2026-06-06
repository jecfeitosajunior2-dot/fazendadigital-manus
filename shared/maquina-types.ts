/**
 * Fonte única de verdade para Tipos e Marcas de Máquinas.
 * Importar daqui em TODOS os pontos da aplicação:
 *   - Formulário de cadastro/edição (frontend)
 *   - Planilha de importação (backend gerarModeloPlanilha)
 *   - Validação de importação (backend validarImportacao / importar)
 *   - shared/importacaoMaquinarios.ts
 */

export const TIPOS_MAQUINA = [
  "Trator",
  "Colheitadeira",
  "Plantadeira",
  "Pulverizador",
  "Caminhão",
  "Carreta",
  "Carro",
  "Moto",
  "Implemento",
  "Outro",
] as const;

export type TipoMaquina = (typeof TIPOS_MAQUINA)[number];

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
