/** Apresentação da listagem de Compradores — só lê campos já persistidos. */

export type CompradorListagemRow = {
  id: number;
  nome: string;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  ativo?: boolean | null;
  propriedadeEstabelecimento?: string | null;
  nomeContato?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

export type StatusFiltroComprador = "todos" | "ativos" | "inativos";

export type FiltrosCompradoresListagem = {
  busca?: string;
  status?: StatusFiltroComprador;
};

/** Listagem administrativa: precisa de ativos e inativos para o filtro Status. */
export const CONSULTA_COMPRADORES_ADMIN = { tipo: "cliente" as const, incluirInativos: true as const };

/** Nova Venda: sem incluirInativos — o backend devolve só ativos. */
export const CONSULTA_COMPRADORES_NOVA_VENDA = { tipo: "cliente" as const };

export function acoesCompradorListagem(ativo: boolean): {
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

export function paginarCompradoresListagem<T>(
  rows: ReadonlyArray<T>,
  page: number,
  pageSize: number,
): T[] {
  const pagina = Math.max(1, page);
  const tamanho = Math.max(1, pageSize);
  const inicio = (pagina - 1) * tamanho;
  return rows.slice(inicio, inicio + tamanho);
}

export function compradoresDisponiveisNovaVenda<T extends Pick<CompradorListagemRow, "ativo">>(
  rows: ReadonlyArray<T>,
): T[] {
  return rows.filter(compradorEstaAtivo);
}

export function compradorEstaAtivo(row: Pick<CompradorListagemRow, "ativo">): boolean {
  return row.ativo !== false;
}

export function textoOuTraco(value: unknown): string {
  const texto = String(value ?? "").trim();
  return texto || "—";
}

export function soDigitos(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export type EstadoFiltrosCompradoresUi = {
  rascunho: Required<FiltrosCompradoresListagem>;
  aplicados: Required<FiltrosCompradoresListagem>;
  page: number;
};

export const FILTROS_COMPRADORES_VAZIOS: Required<FiltrosCompradoresListagem> = {
  busca: "",
  status: "todos",
};

export function estadoInicialFiltrosCompradores(): EstadoFiltrosCompradoresUi {
  return {
    rascunho: { ...FILTROS_COMPRADORES_VAZIOS },
    aplicados: { ...FILTROS_COMPRADORES_VAZIOS },
    page: 1,
  };
}

/** Status entra na tabela na hora — o rascunho sozinho não filtra. */
export function selecionarStatusCompradores(
  estado: EstadoFiltrosCompradoresUi,
  status: StatusFiltroComprador,
): EstadoFiltrosCompradoresUi {
  return {
    rascunho: { ...estado.rascunho, status },
    aplicados: { ...estado.aplicados, status },
    page: 1,
  };
}

export function alterarBuscaCompradores(
  estado: EstadoFiltrosCompradoresUi,
  busca: string,
): EstadoFiltrosCompradoresUi {
  return {
    ...estado,
    rascunho: { ...estado.rascunho, busca },
  };
}

export function aplicarFiltrosCompradores(
  estado: EstadoFiltrosCompradoresUi,
): EstadoFiltrosCompradoresUi {
  return {
    rascunho: { ...estado.rascunho },
    aplicados: { ...estado.rascunho },
    page: 1,
  };
}

export function limparFiltrosCompradores(): EstadoFiltrosCompradoresUi {
  return estadoInicialFiltrosCompradores();
}

export function compradoresExibidosNaTabela(
  compradores: ReadonlyArray<CompradorListagemRow>,
  estado: EstadoFiltrosCompradoresUi,
): CompradorListagemRow[] {
  return filtrarCompradoresListagem(compradores, estado.aplicados);
}

export function filtrarCompradoresListagem(
  compradores: ReadonlyArray<CompradorListagemRow>,
  filtros: FiltrosCompradoresListagem = {},
): CompradorListagemRow[] {
  const busca = filtros.busca?.trim().toLowerCase() ?? "";
  const buscaDigitos = soDigitos(busca);
  const status = filtros.status ?? "todos";

  return compradores.filter(row => {
    const ativo = compradorEstaAtivo(row);
    if (status === "ativos" && !ativo) return false;
    if (status === "inativos" && ativo) return false;
    if (!busca) return true;

    const nome = String(row.nome ?? "").toLowerCase();
    if (nome.includes(busca)) return true;

    const documento = String(row.documento ?? "").toLowerCase();
    const documentoDigitos = soDigitos(row.documento);
    if (documento.includes(busca) || (buscaDigitos.length > 0 && documentoDigitos.includes(buscaDigitos))) {
      return true;
    }

    const telefone = String(row.telefone ?? "").toLowerCase();
    const telefoneDigitos = soDigitos(row.telefone);
    if (telefone.includes(busca) || (buscaDigitos.length > 0 && telefoneDigitos.includes(buscaDigitos))) {
      return true;
    }

    const propriedade = String(row.propriedadeEstabelecimento ?? "").toLowerCase();
    if (propriedade.includes(busca)) return true;

    const contato = String(row.nomeContato ?? "").toLowerCase();
    if (contato.includes(busca)) return true;

    const cidade = String(row.cidade ?? "").toLowerCase();
    if (cidade.includes(busca)) return true;

    return false;
  });
}
