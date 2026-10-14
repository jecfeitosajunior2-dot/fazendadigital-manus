import { lerTipoExecucaoManutencao } from "./manutencaoTipoExecucao";

export const MSG_MANUT_MAQUINA_NAO_ENCONTRADA = "Máquina não encontrada.";
export const MSG_MANUT_FAZENDA_MAQUINA_ESTOQUE =
  "Informe a fazenda da máquina para baixar o estoque.";
export const MSG_MANUT_FAZENDA_MAQUINA_INVALIDA =
  "A máquina não possui fazenda válida neste cadastro.";
export const MSG_MANUT_FAZENDA_ACESSO = "Fazenda não encontrada neste cadastro.";
export const MSG_MANUT_PRESTADOR_INVALIDO = "Fornecedor não encontrado neste cadastro.";
export const MSG_MANUT_PRESTADOR_INATIVO =
  "Este fornecedor está inativo e não pode ser usado na manutenção.";
export const MSG_MANUT_PRESTADOR_TIPO =
  "Selecione um fornecedor cadastrado em Pessoas.";

export type PessoaPrestadorSnapshot = {
  id: number;
  userId: number;
  tipo: string;
  ativo?: boolean | null;
};

export type MaquinaFazendaSnapshot = {
  id: number;
  userId: number;
  fazendaId?: number | null;
};

export type FazendaSnapshot = {
  id: number;
  userId: number;
};

export type IdentificacaoFazendaOk = {
  ok: true;
  fazendaId: number;
};

export type IdentificacaoFazendaErro = {
  ok: false;
  motivo: "maquina_ausente" | "maquina_outro_usuario" | "fazenda_invalida" | "fazenda_acesso";
  message: string;
};

export type IdentificacaoFazendaMaquina = IdentificacaoFazendaOk | IdentificacaoFazendaErro;

/** 0 e valores vazios nunca são fazenda oficial. */
export function fazendaIdOficial(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function lerPrestadorPessoaId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Só o id persistido. Nome e lista de homônimos não escolhem fornecedor.
 */
export function resolverPrestadorPessoaIdPersistido(input: {
  prestadorPessoaId?: number | null;
  prestadorNome?: string | null;
  candidatos?: Array<{ id: number; nome: string }>;
}): number | null {
  void input.prestadorNome;
  void input.candidatos;
  return lerPrestadorPessoaId(input.prestadorPessoaId);
}

export function prestadorPessoaIdDoPayload(input: {
  tipoExecucao?: string | null;
  fornecedorId?: string | number | null;
}): number | null {
  if (lerTipoExecucaoManutencao(input.tipoExecucao) !== "externa") return null;
  return lerPrestadorPessoaId(input.fornecedorId);
}

export function deveExibirNomeHistoricoPrestador(input: {
  tipoExecucao?: string | null;
  prestadorPessoaId?: number | null;
  prestadorNome?: string | null;
}): boolean {
  if (lerTipoExecucaoManutencao(input.tipoExecucao) !== "externa") return false;
  if (lerPrestadorPessoaId(input.prestadorPessoaId) != null) return false;
  return Boolean(String(input.prestadorNome ?? "").trim());
}

export function validarPrestadorPessoaParaOs(input: {
  userId: number;
  tipoExecucao?: string | null;
  prestadorPessoaId?: number | null;
  pessoa?: PessoaPrestadorSnapshot | null;
}): { ok: true; prestadorPessoaId: number | null } | { ok: false; message: string } {
  if (lerTipoExecucaoManutencao(input.tipoExecucao) !== "externa") {
    return { ok: true, prestadorPessoaId: null };
  }

  const pessoaId = lerPrestadorPessoaId(input.prestadorPessoaId);
  if (pessoaId == null) {
    return { ok: true, prestadorPessoaId: null };
  }

  const pessoa = input.pessoa;
  if (!pessoa || pessoa.id !== pessoaId || pessoa.userId !== input.userId) {
    return { ok: false, message: MSG_MANUT_PRESTADOR_INVALIDO };
  }
  if (pessoa.ativo === false) {
    return { ok: false, message: MSG_MANUT_PRESTADOR_INATIVO };
  }
  if (String(pessoa.tipo ?? "").trim().toLowerCase() !== "fornecedor") {
    return { ok: false, message: MSG_MANUT_PRESTADOR_TIPO };
  }
  return { ok: true, prestadorPessoaId: pessoa.id };
}

export function identificarFazendaMaquina(input: {
  userId: number;
  maquina?: MaquinaFazendaSnapshot | null;
}): IdentificacaoFazendaMaquina {
  const maquina = input.maquina;
  if (!maquina) {
    return { ok: false, motivo: "maquina_ausente", message: MSG_MANUT_MAQUINA_NAO_ENCONTRADA };
  }
  if (maquina.userId !== input.userId) {
    return { ok: false, motivo: "maquina_outro_usuario", message: MSG_MANUT_MAQUINA_NAO_ENCONTRADA };
  }
  const fazendaId = fazendaIdOficial(maquina.fazendaId);
  if (fazendaId == null) {
    return { ok: false, motivo: "fazenda_invalida", message: MSG_MANUT_FAZENDA_MAQUINA_INVALIDA };
  }
  return { ok: true, fazendaId };
}

export function confirmarFazendaDoUsuario(input: {
  userId: number;
  fazendaId: number;
  fazenda?: FazendaSnapshot | null;
}): IdentificacaoFazendaMaquina {
  const fazendaId = fazendaIdOficial(input.fazendaId);
  if (fazendaId == null) {
    return { ok: false, motivo: "fazenda_invalida", message: MSG_MANUT_FAZENDA_MAQUINA_INVALIDA };
  }
  const fazenda = input.fazenda;
  if (!fazenda || fazenda.id !== fazendaId || fazenda.userId !== input.userId) {
    return { ok: false, motivo: "fazenda_acesso", message: MSG_MANUT_FAZENDA_ACESSO };
  }
  return { ok: true, fazendaId };
}

/**
 * Estoque exige fazenda oficial. Oficina/mão de obra sozinhas não usam 0.
 * Identificação financeira fica pronta só com fazenda válida.
 */
export function decidirFazendaPersistenciaOs(input: {
  temPecasEstoque: boolean;
  identificacao: IdentificacaoFazendaMaquina;
}):
  | { ok: true; fazendaId: number | null; financeiraPronta: boolean }
  | { ok: false; message: string } {
  if (input.identificacao.ok) {
    return {
      ok: true,
      fazendaId: input.identificacao.fazendaId,
      financeiraPronta: true,
    };
  }
  if (input.temPecasEstoque) {
    return { ok: false, message: MSG_MANUT_FAZENDA_MAQUINA_ESTOQUE };
  }
  return { ok: true, fazendaId: null, financeiraPronta: false };
}
