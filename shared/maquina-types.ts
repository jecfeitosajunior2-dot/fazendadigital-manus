/**
 * Fonte única de verdade para Tipos, Marcas e mapeamento Tipo→Marcas de Máquinas.
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

/**
 * Mapeamento Tipo → Marcas específicas.
 * Ao selecionar um tipo, o campo Marca deve exibir EXCLUSIVAMENTE
 * as marcas desta lista. Nenhuma marca de outra categoria deve aparecer.
 */
export const MARCAS_POR_TIPO: Record<TipoMaquina, readonly string[]> = {
  Aeronaves: [
    "Bombardier Global",
    "Cessna Citation",
    "Cirrus",
    "Dassault Falcon",
    "Embraer",
    "Gulfstream",
    "King Air",
    "Piaggio",
  ],
  Máquinas: [
    "Agrale",
    "Bobcat",
    "Bomag",
    "Case",
    "Caterpillar",
    "CBT",
    "Clark",
    "Cummins",
    "Doosan",
    "Ensign",
    "ESAB",
    "Feeler",
    "Fiat",
    "Ford",
    "Fort",
    "Galucho",
    "Gelgás",
    "Goldoni",
    "GranHorse",
    "HARAMAQ",
    "Husqvarna",
    "Hyundai",
    "IKEDA",
    "Incomagri",
    "IPACOL",
    "Iseki",
    "Jacto",
    "JCB",
    "JF Máquinas",
    "John Deere",
    "KO Máquinas Agrícolas",
    "Komatsu",
    "Kubota",
    "KUHN",
    "Lamborghini",
    "Landini",
    "Liebherr",
    "Makita",
    "MARISPAN",
    "Massey Ferguson",
    "Mercedes Benz",
    "MFW Máquinas",
    "MSA Industrial",
    "Murray Trap",
    "Nagano",
    "New Holland",
    "Nogueira",
    "Same",
    "Sany",
    "SCHEMAQ",
    "SDLG",
    "SEM",
    "Shantui",
    "Shearmaster",
    "Siloking",
    "Tatu",
    "Terex",
    "TRITON",
    "Valmet",
    "Valpadana",
    "Valtra",
    "Volvo",
    "XCMG",
    "Yale",
    "Yanmar",
    "YTO",
  ],
  Implementos: [
    "ACTON",
    "Baldan",
    "Case",
    "Cremasco",
    "Fachini",
    "FIDO",
    "IKEDA",
    "Incomagri",
    "INRODA",
    "IPACOL",
    "Jacto",
    "JAN",
    "JF Máquinas",
    "John Deere",
    "JUMIL",
    "KUHN",
    "LUMA",
    "Menta",
    "Mepel",
    "MSA Industrial",
    "New Holland",
    "Nogueira Máquinas e Implementos Agrícolas",
    "Panter",
    "Piccin",
    "Santo Expedito",
    "Siltomac",
    "Stara",
    "Tatu",
    "Tecmesteel",
    "TRITON",
    "Valtra",
    "Vincon",
  ],
  Veículos: [
    "Ford",
    "Volkswagen",
    "Mercedes-Benz",
    "Fiat",
    "Chevrolet",
    "Toyota",
    "Iveco",
    "Outra",
  ],
  "Equipamentos com Motor": [
    "Honda",
    "Husqvarna",
    "Stihl",
    "Briggs & Stratton",
    "Outra",
  ],
  Outros: ["Outra"],
};

/**
 * Retorna a lista de marcas válidas para um tipo.
 * Se o tipo não for reconhecido, retorna lista vazia.
 */
export function getMarcasPorTipo(tipo: string): readonly string[] {
  return MARCAS_POR_TIPO[tipo as TipoMaquina] ?? [];
}

/**
 * Verifica se uma marca é válida para o tipo informado.
 * Retorna true se o tipo não for reconhecido (permissivo para tipos legados).
 */
export function isMarcaValidaParaTipo(tipo: string, marca: string): boolean {
  const marcas = MARCAS_POR_TIPO[tipo as TipoMaquina];
  if (!marcas) return true; // tipo desconhecido → permissivo
  return marcas.includes(marca);
}

/** Lista de todas as marcas do sistema (para compatibilidade retroativa) */
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
