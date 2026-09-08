/**
 * Matriz JetBov de Campo/Curral × Fazenda Digital.
 * Referência para hub da sessão de curral e ordem de implementação.
 */

export type CurralManejoId =
  | "pesagem"
  | "sanitario"
  | "troca-lote"
  | "brinco-eletronico"
  | "reprodutivo"
  | "desmama"
  | "castracao"
  | "baixa-animal";

export type CurralManejoStatus = "disponivel" | "em_breve" | "pontual_apenas";

export type JetBovPresenca = "sim" | "parcial" | "nao";

export type CurralManejoJetBovEntry = {
  id: CurralManejoId;
  /** Nome ou agrupamento usado no JetBov de Campo/Curral. */
  labelJetBov: string;
  jetBov: JetBovPresenca;
  fdPontual: boolean;
  statusCurral: CurralManejoStatus;
  /** Ordem sugerida de implementação no modo curral (1 = primeiro). */
  prioridade: number;
  nota?: string;
};

/** Mapeamento principal — ids alinhados a TIPOS_MANEJO do frontend. */
export const CURRAL_MANEJO_JETBOV_MAP: readonly CurralManejoJetBovEntry[] = [
  {
    id: "pesagem",
    labelJetBov: "Manejo de pesagem",
    jetBov: "sim",
    fdPontual: true,
    statusCurral: "disponivel",
    prioridade: 1,
    nota: "RFID + balança; loop principal do curral.",
  },
  {
    id: "sanitario",
    labelJetBov: "Manejo sanitário",
    jetBov: "sim",
    fdPontual: true,
    statusCurral: "em_breve",
    prioridade: 2,
    nota: "Vacinação, vermifugação e tratamentos.",
  },
  {
    id: "troca-lote",
    labelJetBov: "Troca de lote",
    jetBov: "sim",
    fdPontual: true,
    statusCurral: "em_breve",
    prioridade: 3,
    nota: "Frequente na mesma lida da pesagem no JetBov.",
  },
  {
    id: "brinco-eletronico",
    labelJetBov: "RFID / cadastro e reidentificação",
    jetBov: "sim",
    fdPontual: true,
    statusCurral: "em_breve",
    prioridade: 4,
    nota: "Cadastro no curral e vínculo de brinco/RFID.",
  },
  {
    id: "reprodutivo",
    labelJetBov: "Reprodutivo (IA, DG, parto)",
    jetBov: "sim",
    fdPontual: true,
    statusCurral: "em_breve",
    prioridade: 5,
  },
  {
    id: "desmama",
    labelJetBov: "Desmama",
    jetBov: "sim",
    fdPontual: true,
    statusCurral: "em_breve",
    prioridade: 6,
    nota: "Apartação, pesagem e reidentificação na mesma operação.",
  },
  {
    id: "castracao",
    labelJetBov: "Castração / procedimento vet.",
    jetBov: "parcial",
    fdPontual: true,
    statusCurral: "em_breve",
    prioridade: 7,
    nota: "No JetBov muitas vezes entra em sanitário ou procedimento.",
  },
  {
    id: "baixa-animal",
    labelJetBov: "Baixa / movimentação",
    jetBov: "parcial",
    fdPontual: true,
    statusCurral: "pontual_apenas",
    prioridade: 8,
    nota: "Mais comum na plataforma; curral foca manejos ativos.",
  },
] as const;

/** Funcionalidades JetBov de curral ainda sem módulo equivalente no FD. */
export const CURRAL_JETBOV_LACUNAS: readonly { label: string; descricao: string }[] = [
  {
    label: "Manejo nutricional",
    descricao: "Registro de suplementação/fornecimento por animal ou lote.",
  },
  {
    label: "Cadastro de animal no curral",
    descricao: "Inclusão de novos bovinos sem voltar ao escritório.",
  },
  {
    label: "Offline + sync",
    descricao: "Operação sem internet e envio posterior à plataforma.",
  },
  {
    label: "Fotos e tarefas de campo",
    descricao: "Evidências e controle de equipe no app de curral.",
  },
];

const mapById = new Map(CURRAL_MANEJO_JETBOV_MAP.map(e => [e.id, e]));

export function getCurralManejoJetBovEntry(id: string): CurralManejoJetBovEntry | undefined {
  return mapById.get(id as CurralManejoId);
}

export function isCurralManejoDisponivel(id: string): boolean {
  return getCurralManejoJetBovEntry(id)?.statusCurral === "disponivel";
}

export function labelStatusCurralManejo(status: CurralManejoStatus): string {
  switch (status) {
    case "disponivel":
      return "Disponível";
    case "em_breve":
      return "Em breve";
    case "pontual_apenas":
      return "Só pontual";
  }
}

/** Ordem de exibição no hub — mesma sequência de TIPOS_MANEJO (manejos pontuais). */
export function curralManejoIdsOrdenados(): CurralManejoId[] {
  return [
    "brinco-eletronico",
    "pesagem",
    "sanitario",
    "reprodutivo",
    "troca-lote",
    "castracao",
    "desmama",
    "baixa-animal",
  ];
}

export function podeSelecionarManejoNoHub(id: string): boolean {
  const entry = getCurralManejoJetBovEntry(id);
  return entry != null && entry.statusCurral !== "pontual_apenas";
}

/** Primeiro manejo selecionado que já está operacional no curral. */
export function primeiroManejoDisponivelNaOrdem(ids: readonly string[]): CurralManejoId | null {
  for (const id of ids) {
    if (isCurralManejoDisponivel(id)) return id as CurralManejoId;
  }
  return null;
}
