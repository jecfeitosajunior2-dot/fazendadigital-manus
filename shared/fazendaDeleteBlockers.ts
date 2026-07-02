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

export const FAZENDA_DELETE_BLOCKER_LABELS: Record<FazendaDeleteBlockerKey, string> = {
  subdivisoes: "subdivisão(ões)",
  animais: "animal(is)",
  lotes: "lote(s)",
  maquinas: "máquina(s)",
  benfeitorias: "benfeitoria(s)",
  estoque: "item(ns) de estoque",
};

export function fazendaDeleteBlockerHref(key: FazendaDeleteBlockerKey, fazendaId: number): string {
  switch (key) {
    case "subdivisoes":
      return "/fazendas/subdivisoes";
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
  const parts = blockers.map(b => `${b.qtd} ${b.label}`);
  return `Não é possível excluir a fazenda "${nomeFazenda}". Possui: ${parts.join(", ")}.`;
}
