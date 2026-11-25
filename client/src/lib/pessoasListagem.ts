/** Apresentação da listagem de Pessoas — cadastro central de fornecedor, cliente e funcionário. */

export const FINANCEIRO_PESSOAS_PATH = "/financeiro/pessoas";
export const FINANCEIRO_PESSOAS_CADASTRO_PATH = "/financeiro/pessoas/cadastro";

/** Rota antiga de Gerenciar Compradores — App redireciona para Pessoas. */
export const COMPRA_VENDA_COMPRADORES_LEGADO_PATH = "/compra-venda/vendas/compradores";

/** Listagem administrativa: precisa de ativos e inativos para inativar/reativar. */
export const CONSULTA_PESSOAS_ADMIN = { incluirInativos: true as const };

export type StatusFiltroPessoa = "todos" | "ativos" | "inativos";

export const COLUNAS_LISTA_PARCEIROS = [
  "Nome",
  "Tipo",
  "CPF/CNPJ",
  "E-mail",
  "Telefone",
  "Situação",
  "Ações",
] as const;

export const SEM_VALOR_PARCEIRO = "—";

export type PessoaListagemRow = {
  id: number;
  nome: string;
  tipo?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean | null;
};

export function rotuloTipoParceiro(tipo?: string | null): string {
  if (tipo === "cliente") return "Cliente";
  if (tipo === "fornecedor") return "Fornecedor";
  if (tipo === "funcionario") return "Funcionário";
  return SEM_VALOR_PARCEIRO;
}

export function rotuloSituacaoParceiro(ativo?: boolean | null): "Ativo" | "Inativo" {
  return ativo === false ? "Inativo" : "Ativo";
}

export function corSituacaoParceiro(ativo?: boolean | null): "#16A34A" | "#D97706" {
  return ativo === false ? "#D97706" : "#16A34A";
}

export function textoParceiro(valor?: string | null): string {
  const texto = String(valor ?? "").trim();
  return texto || SEM_VALOR_PARCEIRO;
}

/** A lista abre de A até Z. A seta do nome inverte para Z até A. */
export function ordenarParceirosPorNome<T extends { nome?: string | null }>(
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

/** A busca olha o que a tabela mostra: nome, tipo, documento, e-mail e telefone. */
export function parceiroCombinaBusca(
  parceiro: Pick<PessoaListagemRow, "nome" | "tipo" | "documento" | "email" | "telefone">,
  busca: string,
): boolean {
  const termo = busca.trim().toLowerCase();
  if (!termo) return true;
  return [parceiro.nome, rotuloTipoParceiro(parceiro.tipo), parceiro.documento, parceiro.email, parceiro.telefone]
    .some((valor) => String(valor ?? "").toLowerCase().includes(termo));
}

export function pessoaEstaAtiva(row: Pick<PessoaListagemRow, "ativo">): boolean {
  return row.ativo !== false;
}

export function acoesPessoaListagem(ativo: boolean): {
  editar: true;
  inativar: boolean;
  reativar: boolean;
  excluir: true;
} {
  return {
    editar: true,
    inativar: ativo,
    reativar: !ativo,
    excluir: true,
  };
}

export function filtrarPessoasPorStatus<T extends Pick<PessoaListagemRow, "ativo">>(
  pessoas: ReadonlyArray<T>,
  status: StatusFiltroPessoa,
): T[] {
  if (status === "ativos") return pessoas.filter(pessoaEstaAtiva);
  if (status === "inativos") return pessoas.filter(pessoa => !pessoaEstaAtiva(pessoa));
  return [...pessoas];
}

export function rotuloPapelPessoa(tipo?: string | null): string {
  if (tipo === "cliente") return "comprador";
  if (tipo === "fornecedor") return "fornecedor";
  if (tipo === "funcionario") return "funcionário";
  return "cadastro";
}

export function tituloInativarPessoa(tipo?: string | null): string {
  const papel = rotuloPapelPessoa(tipo);
  return `Inativar ${papel}?`;
}

export function tituloReativarPessoa(tipo?: string | null): string {
  const papel = rotuloPapelPessoa(tipo);
  return `Reativar ${papel}`;
}
