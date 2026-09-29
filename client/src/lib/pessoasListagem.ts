/** Apresentação da listagem de Pessoas — cadastro central de fornecedor, cliente e funcionário. */

export const FINANCEIRO_PESSOAS_PATH = "/financeiro/pessoas";

/** Rota antiga de Gerenciar Compradores — App redireciona para Pessoas. */
export const COMPRA_VENDA_COMPRADORES_LEGADO_PATH = "/compra-venda/vendas/compradores";

/** Listagem administrativa: precisa de ativos e inativos para inativar/reativar. */
export const CONSULTA_PESSOAS_ADMIN = { incluirInativos: true as const };

export type StatusFiltroPessoa = "todos" | "ativos" | "inativos";

export type PessoaListagemRow = {
  id: number;
  nome: string;
  tipo?: string | null;
  ativo?: boolean | null;
};

export function pessoaEstaAtiva(row: Pick<PessoaListagemRow, "ativo">): boolean {
  return row.ativo !== false;
}

export function acoesPessoaListagem(ativo: boolean): {
  editar: true;
  inativar: boolean;
  reativar: boolean;
} {
  return {
    editar: true,
    inativar: ativo,
    reativar: !ativo,
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
