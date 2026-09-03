export type FazendaDeleteBlockerKey =
  | "subdivisoes"
  | "animais"
  | "lotes"
  | "maquinas"
  | "benfeitorias"
  | "estoque";

export type FazendaDeleteBlocker = {
  key: FazendaDeleteBlockerKey;
  label: string;
  qtd: number;
};

const BLOCKER_WORDS: Record<FazendaDeleteBlockerKey, { one: string; other: string }> = {
  subdivisoes: { one: "subdivisão", other: "subdivisões" },
  animais: { one: "animal", other: "animais" },
  lotes: { one: "lote", other: "lotes" },
  maquinas: { one: "máquina", other: "máquinas" },
  benfeitorias: { one: "benfeitoria", other: "benfeitorias" },
  estoque: { one: "item de estoque", other: "itens de estoque" },
};

/** Palavra no plural — usada ao gravar o blocker. A tela formata com a quantidade. */
export const FAZENDA_DELETE_BLOCKER_LABELS: Record<FazendaDeleteBlockerKey, string> = {
  subdivisoes: "subdivisões",
  animais: "animais",
  lotes: "lotes",
  maquinas: "máquinas",
  benfeitorias: "benfeitorias",
  estoque: "itens de estoque",
};

export function formatFazendaDeleteBlockerCount(key: FazendaDeleteBlockerKey, qtd: number): string {
  const word = BLOCKER_WORDS[key];
  return `${qtd} ${qtd === 1 ? word.one : word.other}`;
}

function joinPtList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

export function formatFazendaDeleteBlockersFrase(blockers: FazendaDeleteBlocker[]): string {
  return joinPtList(blockers.map(b => formatFazendaDeleteBlockerCount(b.key, b.qtd)));
}

export function fazendaDeleteBlockerHref(key: FazendaDeleteBlockerKey, fazendaId: number): string {
  switch (key) {
    case "subdivisoes":
      return "/fazendas/visao-geral#fazenda-subdivisoes";
    case "animais":
      return `/rebanho/lista-animais?fazendaId=${fazendaId}`;
    case "lotes":
      return `/rebanho/lotes?fazendaId=${fazendaId}`;
    case "maquinas":
      return "/maquinas/visao-geral";
    case "benfeitorias":
      return "/fazendas/benfeitorias";
    case "estoque":
      return "/insumos/lista-produtos";
  }
}

export function formatFazendaDeleteBlockersMessage(nomeFazenda: string, blockers: FazendaDeleteBlocker[]): string {
  const parts = formatFazendaDeleteBlockersFrase(blockers);
  return `Não é possível excluir a fazenda "${nomeFazenda}". Possui ${parts}.`;
}
