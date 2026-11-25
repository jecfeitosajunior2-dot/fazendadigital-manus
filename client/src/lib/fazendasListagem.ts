import {
  formatFazendaDeleteBlockersFrase,
  type FazendaDeleteBlocker,
} from "@shared/fazendaDeleteBlockers";

/** Apresentação da lista /fazendas/lista-fazendas. Não calcula área que o cadastro não guarda. */

export const COLUNAS_LISTA_FAZENDAS = [
  "Nome",
  "Município/UF",
  "Área Total (ha)",
  "Pastagem (ha)",
  "Situação",
  "Ações",
] as const;

export const SEM_VALOR_LISTA_FAZENDA = "—";

/** Hectares de pastagem digitados no cadastro. Sem número, a lista mostra traço. Não soma subdivisão. */
export function pastagemHaCadastrada(valor?: unknown): string {
  return areaTotalHa(valor);
}

/** A lista abre de A até Z. A seta do nome inverte para Z até A. */
export function ordenarFazendasPorNome<T extends { nome?: string | null }>(
  lista: readonly T[],
  crescente = true,
): T[] {
  const sentido = crescente ? 1 : -1;
  return [...lista].sort(
    (a, b) => sentido * String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

/** A busca da lista olha o nome e o município já carregados nesta conta. */
export function fazendaCombinaBusca(
  fazenda: { nome?: string | null; cidade?: string | null; estado?: string | null },
  busca: string,
): boolean {
  const termo = busca.trim().toLowerCase();
  if (!termo) return true;
  const local = municipioUf(fazenda.cidade, fazenda.estado);
  return [fazenda.nome, fazenda.cidade, local].some((valor) =>
    String(valor ?? "").toLowerCase().includes(termo),
  );
}

export function municipioUf(cidade?: string | null, estado?: string | null): string {
  const municipio = String(cidade ?? "").trim();
  const uf = String(estado ?? "").trim();
  if (municipio && uf) return `${municipio}/${uf}`;
  return municipio || uf || SEM_VALOR_LISTA_FAZENDA;
}

export function areaTotalHa(valor: unknown): string {
  if (valor == null || valor === "") return SEM_VALOR_LISTA_FAZENDA;
  const texto = String(valor).trim();
  if (!texto) return SEM_VALOR_LISTA_FAZENDA;
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return SEM_VALOR_LISTA_FAZENDA;
  return numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sem situação gravada, a fazenda segue ativa. Só "inativo" vira Inativa. */
export function rotuloSituacaoFazenda(situacao?: string | null): "Ativa" | "Inativa" {
  return situacao === "inativo" ? "Inativa" : "Ativa";
}

/** Verde de fazenda em uso e amarelo do botão Inativar. A cor fica só na palavra. */
export function corSituacaoFazenda(situacao?: string | null): "#16A34A" | "#D97706" {
  return situacao === "inativo" ? "#D97706" : "#16A34A";
}

/** Quantidade de pastos vinculados. Zero é dado real. Sem lista, não inventa número. */
export function quantidadeSubdivisoes(quantidade: number | null | undefined): string {
  if (quantidade == null || !Number.isInteger(quantidade) || quantidade < 0) {
    return SEM_VALOR_LISTA_FAZENDA;
  }
  return String(quantidade);
}

export const ACOES_MENU_FAZENDA = ["Editar", "Inativar", "Excluir"] as const;

/** O cadastro não tem coluna de fazenda inativa. O menu avisa e não grava. */
export const MSG_INATIVAR_FAZENDA_INDISPONIVEL =
  "O cadastro ainda não guarda fazenda inativa. Nada é alterado.";

/** A exclusão física continua recusada no servidor. O menu não dispara essa operação. */
export const MSG_EXCLUIR_FAZENDA_BLOQUEADA =
  "A exclusão física segue bloqueada. O histórico ainda não está protegido por completo.";

export function caminhoSubdivisoesDaFazenda(id: number): string {
  return `/fazendas/subdivisoes?fazendaId=${id}`;
}

export function fazendaIdDaBusca(busca: string): number | null {
  const texto = busca.startsWith("?") ? busca.slice(1) : busca;
  const bruto = new URLSearchParams(texto).get("fazendaId");
  if (bruto == null || !/^\d+$/.test(bruto)) return null;
  const id = Number(bruto);
  return id > 0 ? id : null;
}

export type ModoExclusaoBloqueada =
  | { modo: "subdivisoes"; quantidade: number }
  | { modo: "vinculos"; frase: string }
  | { modo: "sem-vinculo" };

/** A frase acompanha os vínculos que a conferência realmente encontrou. */
export function modoExclusaoBloqueada(blockers: readonly FazendaDeleteBlocker[]): ModoExclusaoBloqueada {
  const soSubdivisoes = blockers.length === 1 && blockers[0]?.key === "subdivisoes";
  if (soSubdivisoes) return { modo: "subdivisoes", quantidade: blockers[0].qtd };
  if (blockers.length > 0) return { modo: "vinculos", frase: formatFazendaDeleteBlockersFrase([...blockers]) };
  return { modo: "sem-vinculo" };
}

/** Só abre fazenda que já veio na lista autorizada da conta. */
export function fazendaDaLista<T extends { id: number }>(
  lista: readonly T[],
  id: number | null,
): T | null {
  if (id == null) return null;
  return lista.find((item) => item.id === id) ?? null;
}
