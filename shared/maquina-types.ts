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

/** Normaliza tipo legado/atual para o valor do select de cadastro. */
export function normalizarTipoMaquina(tipo: string | null | undefined): TipoMaquina | "" {
  const raw = String(tipo || "").trim();
  if (!raw) return "";
  if ((TIPOS_MAQUINA as readonly string[]).includes(raw)) return raw as TipoMaquina;
  return MAPEAMENTO_TIPO_LEGADO[raw] ?? "";
}

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
    "ACELLERA",
    "ACURA",
    "ADAMO",
    "ADLY",
    "AGRALE",
    "ALFA ROMEO",
    "AM GEN",
    "AMAZONAS",
    "AMERICAR",
    "APRILIA",
    "ARIEL",
    "ASTON MARTIN",
    "AUDI",
    "BAJAJ",
    "BENELLI",
    "BENTLEY",
    "BMW",
    "BUGATTI",
    "BUICK",
    "CADILLAC",
    "CAN-AM",
    "CHERY",
    "CHEVROLET",
    "CHRYSLER",
    "CITROEN",
    "DAFRA",
    "DODGE",
    "DUCATI",
    "FERRARI",
    "FIAT",
    "FORD",
    "GEELY",
    "GREAT WALL",
    "HARLEY-DAVIDSON",
    "HONDA",
    "HUMMER",
    "HYUNDAI",
    "INFINITI",
    "ISUZU",
    "IVECO",
    "JAC",
    "JAGUAR",
    "JEEP",
    "KAWASAKI",
    "KIA",
    "KTM",
    "LAMBORGHINI",
    "LAND ROVER",
    "LEXUS",
    "LIFAN",
    "LINCOLN",
    "LOTUS",
    "MAHINDRA",
    "MASERATI",
    "MAYBACH",
    "MAZDA",
    "MCLAREN",
    "MERCEDES-BENZ",
    "MINI",
    "MITSUBISHI",
    "NISSAN",
    "PAGANI",
    "PEUGEOT",
    "PIAGGIO",
    "POLARIS",
    "PORSCHE",
    "RAM",
    "RENAULT",
    "ROLLS-ROYCE",
    "SCANIA",
    "SHINERAY",
    "SKODA",
    "SMART",
    "SSANGYONG",
    "SUBARU",
    "SUZUKI",
    "TATA",
    "TOYOTA",
    "TRIUMPH",
    "TROLLER",
    "VOLKSWAGEN",
    "VOLVO",
    "WUYANG",
    "YAMAHA",
    "ZONGSHEN",
  ],
  "Equipamentos com Motor": [
    "BRANCO",
    "DJI SmartFarm",
    "KUHN",
    "ROAF Ordenhadeiras e Tanques",
    "STIHL",
    "Buffalo",
    "Husqvarna",
    "Toyama",
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

/** Fonte de verdade do medidor operacional da máquina. */
export const TIPOS_MEDIDOR = ["horimetro", "quilometragem", "sem_medidor"] as const;
export type TipoMedidor = (typeof TIPOS_MEDIDOR)[number];

export const TIPOS_MEDIDOR_LABEL: Record<TipoMedidor, string> = {
  horimetro: "Horímetro",
  quilometragem: "Quilometragem",
  sem_medidor: "Sem medidor",
};

/** Sugestão inicial de medidor conforme o Tipo (usuário pode alterar). */
export function sugerirTipoMedidor(tipo: string): TipoMedidor {
  const t = tipo.trim();
  if (t === "Veículos" || ["Caminhão", "Carreta", "Carro", "Moto"].includes(t)) {
    return "quilometragem";
  }
  if (
    t === "Máquinas" ||
    t === "Equipamentos com Motor" ||
    ["Trator", "Colheitadeira", "Plantadeira", "Pulverizador"].includes(t)
  ) {
    return "horimetro";
  }
  return "sem_medidor";
}

/** Label dinâmico de placa / número de série conforme o Tipo. */
export function labelIdentificadorMaquina(tipo: string): string {
  const t = tipo.trim();
  if (t === "Veículos" || ["Caminhão", "Carreta", "Carro", "Moto"].includes(t)) {
    return "Placa";
  }
  if (t === "Máquinas" || ["Trator", "Colheitadeira", "Plantadeira", "Pulverizador"].includes(t)) {
    return "Número de série";
  }
  if (t === "Equipamentos com Motor" || t === "Implementos") {
    return "Número de série / patrimônio";
  }
  return "Placa ou número de série";
}

/** Campos obrigatórios ausentes no cadastro da máquina (alerta âmbar). */
export function camposCadastroIncompletosMaquina(m: {
  tipo?: string | null;
  fazendaId?: number | string | null;
  marca?: string | null;
  nome?: string | null;
  tipoMedidor?: string | null;
}): string[] {
  const fazendaVazia =
    m.fazendaId == null || m.fazendaId === "" || String(m.fazendaId).trim() === "";
  return [
    !String(m.tipo || "").trim() && "Tipo",
    fazendaVazia && "Fazenda",
    !String(m.marca || "").trim() && "Marca",
    !String(m.nome || "").trim() && "Nome de identificação",
    !String(m.tipoMedidor || "").trim() && "Tipo de medidor",
  ].filter(Boolean) as string[];
}
