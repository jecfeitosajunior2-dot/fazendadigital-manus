/**
 * Mapeia registros de `historico_brincos` (persistidos pelo manejo Brinco Eletrônico)
 * para exibição consultiva na ficha do animal.
 *
 * Contrato das observações geradas por `manejo.registrarPontualBrinco`:
 *   "<rótulo operação> · RFID: <antigo|Não vinculado> → <novo> · Brinco visual: … → … · Motivo: Outro — … · <obs livre>"
 *
 * RFID permanece sempre como string (nunca Number/parseInt).
 */

export type MotivoTrocaIdentificacao =
  | "perda"
  | "danificado"
  | "reidentificacao"
  | "erro_cadastro"
  | "outro";

export type OperacaoIdentificacao = "rfid" | "brinco" | "ambos" | "desconhecida";

export type HistoricoBrincoRow = {
  id: number;
  animalId?: number;
  brincoAnterior?: string | null;
  brincoNovo?: string | null;
  motivo: MotivoTrocaIdentificacao | string;
  observacoes?: string | null;
  dataAlteracao: string;
  usuarioNome?: string | null;
  createdAt?: Date | string | null;
};

export type HistoricoIdentificacaoDisplay = {
  id: number;
  animalId: number | null;
  dataAlteracao: string;
  operacao: OperacaoIdentificacao;
  operacaoLabel: string;
  brincoAnterior: string | null;
  brincoNovo: string | null;
  rfidAnterior: string | null;
  rfidNovo: string | null;
  motivo: string;
  motivoLabel: string;
  /** Observação livre do usuário (sem linhas estruturadas do sistema). */
  observacaoLivre: string | null;
  responsavel: string | null;
  createdAt: Date | string | null;
};

export const MOTIVO_IDENTIFICACAO_LABELS: Record<MotivoTrocaIdentificacao, string> = {
  perda: "Perda do brinco",
  danificado: "Brinco danificado",
  reidentificacao: "Reidentificação",
  erro_cadastro: "Erro de cadastro",
  outro: "Outro",
};

const OPERACAO_LABELS: Record<Exclude<OperacaoIdentificacao, "desconhecida">, string> = {
  rfid: "Trocar RFID",
  brinco: "Trocar brinco visual",
  ambos: "Trocar brinco visual e RFID",
};

/** Rótulos gravados nas observações (atuais e legado). */
const OPERACAO_FROM_PREFIX: Array<{ match: RegExp; operacao: OperacaoIdentificacao }> = [
  { match: /^trocar brinco visual e rfid\b/i, operacao: "ambos" },
  { match: /^trocar brinco visual e vincular rfid\b/i, operacao: "ambos" },
  { match: /^trocar brinco e rfid\b/i, operacao: "ambos" },
  { match: /^atualizar ambos\b/i, operacao: "ambos" },
  { match: /^vincular\s*\/\s*atualizar rfid\b/i, operacao: "rfid" },
  { match: /^vincular rfid\b/i, operacao: "rfid" },
  { match: /^trocar rfid\b/i, operacao: "rfid" },
  { match: /^troca de brinco visual\b/i, operacao: "brinco" },
  { match: /^trocar brinco visual\b/i, operacao: "brinco" },
  { match: /^trocar brinco\b/i, operacao: "brinco" },
];

const RFID_ARROW_RE =
  /RFID:\s*(Não vinculado|[^·]+?)\s*→\s*([^·]+?)(?=\s*·|$)/i;
const BRINCO_ARROW_RE =
  /Brinco visual:\s*(Não vinculado|[^·]+?)\s*→\s*([^·]+?)(?=\s*·|$)/i;

function normalizeToken(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || /^não vinculado$/i.test(trimmed) || trimmed === "—") return null;
  return trimmed;
}

function motivoLabel(
  motivo: string,
  operacao?: OperacaoIdentificacao | null,
): string {
  if (motivo === "perda") {
    if (operacao === "rfid") return "Perda do RFID";
    if (operacao === "ambos") return "Perda da identificação";
    return "Perda do brinco";
  }
  if (motivo === "danificado") {
    if (operacao === "rfid") return "RFID danificado";
    if (operacao === "ambos") return "Identificação danificada";
    return "Brinco danificado";
  }
  if (motivo in MOTIVO_IDENTIFICACAO_LABELS) {
    return MOTIVO_IDENTIFICACAO_LABELS[motivo as MotivoTrocaIdentificacao];
  }
  return motivo;
}

function detectOperacao(obs: string): OperacaoIdentificacao {
  const head = obs.trim();
  for (const rule of OPERACAO_FROM_PREFIX) {
    if (rule.match.test(head)) return rule.operacao;
  }
  return "desconhecida";
}

function inferOperacao(params: {
  fromPrefix: OperacaoIdentificacao;
  rfidMudou: boolean;
  brincoMudou: boolean;
}): OperacaoIdentificacao {
  if (params.fromPrefix !== "desconhecida") return params.fromPrefix;
  if (params.rfidMudou && params.brincoMudou) return "ambos";
  if (params.rfidMudou) return "rfid";
  if (params.brincoMudou) return "brinco";
  return "desconhecida";
}

function extractObservacaoLivre(obs: string): string | null {
  const parts = obs
    .split("·")
    .map(p => p.trim())
    .filter(Boolean);

  const livres = parts.filter(part => {
    if (OPERACAO_FROM_PREFIX.some(r => r.match.test(part))) return false;
    if (/^RFID:/i.test(part)) return false;
    if (/^Brinco visual:/i.test(part)) return false;
    if (/^Motivo:\s*Outro/i.test(part)) return false;
    return true;
  });

  const text = livres.join(" · ").trim();
  return text || null;
}

/**
 * Constrói o texto estruturado das observações do histórico (contrato de persistência).
 * Usado pelo backend e pelos testes — RFID sempre como string.
 */
export function buildObservacoesHistoricoIdentificacao(input: {
  operacao: "rfid" | "brinco" | "ambos";
  /** true quando já existia RFID e está sendo trocado (não só vinculado). */
  tinhaRfid?: boolean;
  rfidAnterior?: string | null;
  rfidNovo?: string | null;
  brincoAnterior?: string | null;
  brincoNovo?: string | null;
  motivo?: MotivoTrocaIdentificacao | string | null;
  motivoDetalhe?: string | null;
  observacoesUsuario?: string | null;
}): string {
  const alteraRfid = input.operacao === "rfid" || input.operacao === "ambos";
  const alteraBrinco = input.operacao === "brinco" || input.operacao === "ambos";

  let operacaoLabel: string;
  if (input.operacao === "ambos") {
    operacaoLabel = input.tinhaRfid
      ? "Trocar brinco visual e RFID"
      : "Trocar brinco visual e vincular RFID";
  } else if (input.operacao === "brinco") {
    operacaoLabel = "Trocar brinco visual";
  } else {
    operacaoLabel = input.tinhaRfid ? "Trocar RFID" : "Vincular RFID";
  }

  const partes: string[] = [operacaoLabel];

  if (alteraRfid) {
    const de = normalizeToken(input.rfidAnterior) ?? "Não vinculado";
    const para = String(input.rfidNovo ?? "").trim();
    partes.push(`RFID: ${de} → ${para}`);
  }
  if (alteraBrinco) {
    const de = normalizeToken(input.brincoAnterior) ?? "Não vinculado";
    const para = String(input.brincoNovo ?? "").trim();
    partes.push(`Brinco visual: ${de} → ${para}`);
  }
  if (input.motivo === "outro" && input.motivoDetalhe?.trim()) {
    partes.push(`Motivo: Outro — ${input.motivoDetalhe.trim()}`);
  }
  if (input.observacoesUsuario?.trim()) {
    partes.push(input.observacoesUsuario.trim());
  }

  return partes.join(" · ");
}

export function mapHistoricoBrincoToDisplay(
  reg: HistoricoBrincoRow,
): HistoricoIdentificacaoDisplay {
  const obs = (reg.observacoes ?? "").trim();
  const rfidMatch = obs.match(RFID_ARROW_RE);
  const brincoObsMatch = obs.match(BRINCO_ARROW_RE);

  const rfidAnterior = normalizeToken(rfidMatch?.[1] ?? null);
  const rfidNovo = normalizeToken(rfidMatch?.[2] ?? null);

  const brincoFromObsAnterior = normalizeToken(brincoObsMatch?.[1] ?? null);
  const brincoFromObsNovo = normalizeToken(brincoObsMatch?.[2] ?? null);

  const brincoColAnterior = normalizeToken(reg.brincoAnterior ?? null);
  const brincoColNovo = normalizeToken(reg.brincoNovo ?? null);

  const fromPrefix = detectOperacao(obs);
  const rfidMudou = Boolean(rfidMatch);
  // Mudança de brinco: linha explícita OU colunas diferentes (legado de troca só visual)
  const brincoMudouPorObs = Boolean(brincoObsMatch);
  const brincoMudouPorCol =
    !rfidMudou &&
    !brincoMudouPorObs &&
    brincoColAnterior != null &&
    brincoColNovo != null &&
    brincoColAnterior !== brincoColNovo;

  const operacao = inferOperacao({
    fromPrefix,
    rfidMudou,
    brincoMudou: brincoMudouPorObs || brincoMudouPorCol,
  });

  let brincoAnterior: string | null = null;
  let brincoNovo: string | null = null;
  if (operacao === "brinco" || operacao === "ambos") {
    brincoAnterior = brincoFromObsAnterior ?? brincoColAnterior;
    brincoNovo = brincoFromObsNovo ?? brincoColNovo;
  }

  let operacaoLabel: string;
  if (operacao === "rfid" && !rfidAnterior && rfidNovo) {
    operacaoLabel = "Vincular RFID";
  } else if (operacao !== "desconhecida") {
    operacaoLabel = OPERACAO_LABELS[operacao];
  } else {
    operacaoLabel = "Alteração de identificação";
  }

  return {
    id: reg.id,
    animalId: reg.animalId ?? null,
    dataAlteracao: reg.dataAlteracao,
    operacao,
    operacaoLabel,
    brincoAnterior,
    brincoNovo,
    rfidAnterior: operacao === "brinco" ? null : rfidAnterior,
    rfidNovo: operacao === "brinco" ? null : rfidNovo,
    motivo: reg.motivo,
    motivoLabel: motivoLabel(reg.motivo, operacao),
    observacaoLivre: extractObservacaoLivre(obs),
    responsavel: normalizeToken(reg.usuarioNome ?? null),
    createdAt: reg.createdAt ?? null,
  };
}

/** Ordena mais recente primeiro (dataAlteracao, depois createdAt, depois id). */
export function sortHistoricoIdentificacaoDesc(
  rows: HistoricoBrincoRow[],
): HistoricoBrincoRow[] {
  return [...rows].sort((a, b) => {
    const d = String(b.dataAlteracao).localeCompare(String(a.dataAlteracao));
    if (d !== 0) return d;
    const ca = a.createdAt ? String(a.createdAt) : "";
    const cb = b.createdAt ? String(b.createdAt) : "";
    if (ca || cb) {
      const c = cb.localeCompare(ca);
      if (c !== 0) return c;
    }
    return (b.id ?? 0) - (a.id ?? 0);
  });
}

export function listHistoricoIdentificacaoDoAnimal(
  rows: HistoricoBrincoRow[],
  animalId: number,
): HistoricoIdentificacaoDisplay[] {
  const filtered = rows.filter(r => r.animalId === animalId);
  return sortHistoricoIdentificacaoDesc(filtered).map(mapHistoricoBrincoToDisplay);
}

/** Linha compacta da coluna Alteração (um tipo por linha). */
export type LinhaAlteracaoIdentificacao = {
  label: "Brinco" | "RFID";
  de: string;
  para: string;
};

/**
 * Linhas da coluna Alteração — só o que realmente mudou.
 * Em "ambos": Brinco primeiro, depois RFID (um único evento).
 */
export function getLinhasAlteracaoIdentificacao(
  row: HistoricoIdentificacaoDisplay,
): LinhaAlteracaoIdentificacao[] {
  const linhas: LinhaAlteracaoIdentificacao[] = [];
  if (row.operacao === "brinco" || row.operacao === "ambos") {
    if (row.brincoAnterior || row.brincoNovo) {
      linhas.push({
        label: "Brinco",
        de: row.brincoAnterior ?? "—",
        para: row.brincoNovo ?? "—",
      });
    }
  }
  if (row.operacao === "rfid" || row.operacao === "ambos") {
    if (row.rfidAnterior || row.rfidNovo) {
      linhas.push({
        label: "RFID",
        de: row.rfidAnterior ?? "—",
        para: row.rfidNovo ?? "—",
      });
    }
  }
  return linhas;
}

/** Formata alteração consolidada (texto; múltiplas linhas quando ambos). */
export function formatAlteracaoIdentificacao(
  row: HistoricoIdentificacaoDisplay,
): string {
  const linhas = getLinhasAlteracaoIdentificacao(row);
  if (linhas.length === 0) return "—";
  return linhas.map(l => `${l.label}\n${l.de} → ${l.para}`).join("\n");
}
