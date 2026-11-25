/**
 * Pessoas da conta, compartilhadas entre as fazendas do mesmo titular.
 * O arquivo local não responde. Inativar não apaga compra, venda nem título.
 * Excluir só apaga o cadastro quando a conferência não acha vínculo.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { pessoas } from "../drizzle/schema";
import {
  avaliarDocumentoClienteCreate,
  avaliarDocumentoClienteUpdate,
  MSG_COMPRADOR_DOC_INVALIDO,
} from "../shared/pessoaDocumentoCliente";
import { normalizeUfBrasil } from "../shared/ufsBrasil";
import { loginPermitido, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db as dbPadrao } from "./db";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";
import { deveRestringirPessoasListAosAtivos } from "./pessoasListFiltro";
import { MSG_PESSOA_REATIVAR_NAO_ENCONTRADA } from "./reativarPessoa";

export const MSG_PESSOA_SEM_MYSQL =
  "O cadastro de pessoas precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_PESSOA_SEM_PERMISSAO = "Sem permissão para esta operação de pessoas.";
export const MSG_PESSOA_NAO_ENCONTRADA = "Pessoa não encontrada.";
export const MSG_PESSOA_VINCULO_OPACO =
  "Não foi possível conferir os vínculos deste parceiro. Nada foi apagado.";

export type SessaoPessoa = {
  executorId: number;
  sessionVersionDaSessao: number | null;
};

export type PessoaTipo = "fornecedor" | "cliente" | "funcionario";

export type PessoaEntrada = {
  nome?: string;
  tipo?: PessoaTipo;
  funcao?: string | null;
  documento?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
  propriedadeEstabelecimento?: string | null;
  nomeContato?: string | null;
  cidade?: string | null;
  uf?: string | null;
  inscricaoEstadual?: string | null;
  cep?: string | null;
};

const MSG_PESSOA_IE_INDISPONIVEL =
  "A inscrição estadual ainda não está disponível neste banco. Nada foi alterado.";
const MSG_PESSOA_CEP_INDISPONIVEL =
  "O CEP ainda não está disponível neste banco. Nada foi alterado.";

type Banco = typeof dbPadrao;
type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
let bancoPessoas: Banco = dbPadrao;

export function definirBancoPessoas(banco: Banco | null) {
  bancoPessoas = banco ?? dbPadrao;
}

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_SEM_MYSQL });
}

function textoErro(erro: unknown): string {
  if (!erro || typeof erro !== "object") return String(erro);
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const codigo = String((erro as { code?: string }).code ?? "");
  const causa = "cause" in erro ? textoErro((erro as { cause?: unknown }).cause) : "";
  return `${mensagem} ${codigo} ${causa}`;
}

async function correr<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await bancoPessoas.transaction(fn, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    recusarSeDeadlockEstoque(erro);
    if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(textoErro(erro))) {
      semMysql();
    }
    throw erro;
  }
}

function recusarDocumento(resultado: { ok: true } | { ok: false; message: string }) {
  if (resultado.ok) return;
  throw new TRPCError({
    code: resultado.message === MSG_COMPRADOR_DOC_INVALIDO ? "BAD_REQUEST" : "CONFLICT",
    message: resultado.message,
  });
}

async function conta(tx: Tx, sessao: SessaoPessoa, permissaoId: string) {
  const consulta = consultaEstoqueNaTransacao(tx);
  const usuario = await consulta.usuario(sessao.executorId);
  if (!usuario || !loginPermitido(usuario.situacao) || usuario.titularUserId == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }
  if (sessao.sessionVersionDaSessao != null && sessao.sessionVersionDaSessao !== usuario.sessionVersion) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }
  const identidade: IdentidadeUsuario = {
    id: usuario.id,
    openId: usuario.openId,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    papel: usuario.papel,
    titularUserId: Number(usuario.titularUserId),
    situacao: usuario.situacao,
    sessionVersion: usuario.sessionVersion,
  };
  const permissoes = await consulta.permissoes(identidade.id, identidade.titularUserId);
  const principal = identidade.papel === "principal" && identidade.id === identidade.titularUserId;
  if (!principal && !permissoes.includes(permissaoId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_PESSOA_SEM_PERMISSAO });
  }
  if (identidade.id !== identidade.titularUserId) {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${identidade.titularUserId} FOR UPDATE`);
  }
  return identidade.titularUserId;
}

function limpo(valor: string | null | undefined) {
  const texto = valor?.trim();
  return texto ? texto : null;
}

async function colunaPessoaExiste(tx: Tx, coluna: string) {
  const resultado = await tx.execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pessoas' AND COLUMN_NAME = ${coluna}`,
  );
  const pacote = resultado as unknown as [{ n?: number }[], unknown];
  const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
  return Number(linhas[0]?.n ?? 0) > 0;
}

function separarComplemento(entrada: PessoaEntrada) {
  const ieInformada = entrada.inscricaoEstadual !== undefined;
  const cepInformado = entrada.cep !== undefined;
  const inscricaoEstadual = limpo(entrada.inscricaoEstadual);
  const cep = limpo(entrada.cep);
  if (inscricaoEstadual && inscricaoEstadual.length > 50) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A inscrição estadual pode ter no máximo 50 caracteres." });
  }
  if (cep && cep.length > 10) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O CEP pode ter no máximo 10 caracteres." });
  }
  return { ieInformada, cepInformado, inscricaoEstadual, cep };
}

async function exigirComplemento(tx: Tx, complemento: ReturnType<typeof separarComplemento>) {
  if (complemento.ieInformada && complemento.inscricaoEstadual && !(await colunaPessoaExiste(tx, "inscricao_estadual"))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_IE_INDISPONIVEL });
  }
  if (complemento.cepInformado && complemento.cep && !(await colunaPessoaExiste(tx, "cep"))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_CEP_INDISPONIVEL });
  }
}

async function gravarComplemento(
  tx: Tx,
  titular: number,
  id: number,
  complemento: ReturnType<typeof separarComplemento>,
) {
  if (complemento.ieInformada && await colunaPessoaExiste(tx, "inscricao_estadual")) {
    await tx.execute(sql`
      UPDATE pessoas SET inscricao_estadual = ${complemento.inscricaoEstadual}
      WHERE id = ${id} AND user_id = ${titular}
    `);
  }
  if (complemento.cepInformado && await colunaPessoaExiste(tx, "cep")) {
    await tx.execute(sql`
      UPDATE pessoas SET cep = ${complemento.cep}
      WHERE id = ${id} AND user_id = ${titular}
    `);
  }
}

async function complementoDaConta(tx: Tx, titular: number) {
  const temIe = await colunaPessoaExiste(tx, "inscricao_estadual");
  const temCep = await colunaPessoaExiste(tx, "cep");
  if (!temIe && !temCep) return null;
  const consulta = temIe && temCep
    ? sql`SELECT id, inscricao_estadual AS inscricaoEstadual, cep FROM pessoas WHERE user_id = ${titular}`
    : temIe
      ? sql`SELECT id, inscricao_estadual AS inscricaoEstadual, NULL AS cep FROM pessoas WHERE user_id = ${titular}`
      : sql`SELECT id, NULL AS inscricaoEstadual, cep FROM pessoas WHERE user_id = ${titular}`;
  const resultado = await tx.execute(consulta);
  const pacote = resultado as unknown as [Array<{ id?: number; inscricaoEstadual?: unknown; cep?: unknown }>, unknown];
  const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
  const mapa = new Map<number, { inscricaoEstadual: string | null; cep: string | null }>();
  for (const linha of linhas) {
    const inscricao = linha.inscricaoEstadual == null ? "" : String(linha.inscricaoEstadual).trim();
    const codigo = linha.cep == null ? "" : String(linha.cep).trim();
    mapa.set(Number(linha.id), {
      inscricaoEstadual: inscricao || null,
      cep: codigo || null,
    });
  }
  return mapa;
}

async function clientes(tx: Tx, titular: number) {
  return tx
    .select({
      id: pessoas.id,
      userId: pessoas.userId,
      tipo: pessoas.tipo,
      documento: pessoas.documento,
      ativo: pessoas.ativo,
    })
    .from(pessoas)
    .where(and(eq(pessoas.userId, titular), eq(pessoas.tipo, "cliente")));
}

async function pessoaDaConta(tx: Tx, titular: number, id: number) {
  const [row] = await tx
    .select()
    .from(pessoas)
    .where(eq(pessoas.id, id))
    .for("update")
    .limit(1);
  if (!row || row.userId !== titular) {
    throw new TRPCError({ code: "NOT_FOUND", message: MSG_PESSOA_NAO_ENCONTRADA });
  }
  return row;
}

async function contar(tx: Tx, consulta: ReturnType<typeof sql>) {
  try {
    const resultado = await tx.execute(consulta);
    const pacote = resultado as unknown as [{ n?: number }[], unknown];
    const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
    return Number(linhas[0]?.n ?? 0);
  } catch (erro) {
    if (/doesn't exist|does not exist|ER_NO_SUCH_TABLE|1146/i.test(textoErro(erro))) return null;
    throw erro;
  }
}

const CONSULTAS_VINCULO = [
  (id: number) => sql`SELECT COUNT(*) AS n FROM compras WHERE fornecedor_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM vendas WHERE comprador_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM estoque_operacoes WHERE fornecedor_id = ${id} OR frete_credor_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM financeiro_titulos WHERE pessoa_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM financeiro_movimentos WHERE contraparte_pessoa_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM manutencoes WHERE prestadorPessoaId = ${id}`,
];

async function vinculos(tx: Tx, id: number) {
  let total = 0;
  for (const consulta of CONSULTAS_VINCULO) {
    const qtd = await contar(tx, consulta(id));
    if (qtd == null) return null;
    total += qtd;
  }
  return total;
}

export const pessoasOperacao = {
  async listar(sessao: SessaoPessoa, filtro?: { tipo?: PessoaTipo; incluirInativos?: boolean }) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.visualizar");
      const condicoes = [eq(pessoas.userId, titular)];
      if (deveRestringirPessoasListAosAtivos(filtro?.incluirInativos)) condicoes.push(eq(pessoas.ativo, true));
      if (filtro?.tipo) condicoes.push(eq(pessoas.tipo, filtro.tipo));
      const linhas = await tx.select().from(pessoas).where(and(...condicoes)).orderBy(pessoas.nome);
      const complemento = await complementoDaConta(tx, titular);
      if (!complemento) return linhas;
      return linhas.map((linha) => ({
        ...linha,
        inscricaoEstadual: complemento.get(linha.id)?.inscricaoEstadual ?? null,
        cep: complemento.get(linha.id)?.cep ?? null,
      }));
    });
  },

  async criar(sessao: SessaoPessoa, entrada: PessoaEntrada) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.criar");
      const nome = entrada.nome?.trim() ?? "";
      if (!nome) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome." });
      if (!entrada.tipo) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o tipo." });
      const complemento = separarComplemento(entrada);
      await exigirComplemento(tx, complemento);
      const documento = limpo(entrada.documento);
      recusarDocumento(avaliarDocumentoClienteCreate({
        userId: titular,
        tipo: entrada.tipo,
        documento,
        existentes: await clientes(tx, titular),
      }));
      const result = await tx.insert(pessoas).values({
        userId: titular,
        nome,
        tipo: entrada.tipo,
        funcao: limpo(entrada.funcao),
        documento,
        endereco: limpo(entrada.endereco),
        telefone: limpo(entrada.telefone),
        email: limpo(entrada.email),
        observacoes: limpo(entrada.observacoes),
        propriedadeEstabelecimento: limpo(entrada.propriedadeEstabelecimento),
        nomeContato: limpo(entrada.nomeContato),
        cidade: limpo(entrada.cidade),
        uf: normalizeUfBrasil(entrada.uf),
        ativo: true,
      });
      const id = Number((result as unknown as [{ insertId?: number }])[0]?.insertId ?? 0);
      if (id > 0) await gravarComplemento(tx, titular, id, complemento);
      return { success: true as const, id };
    });
  },

  async atualizar(sessao: SessaoPessoa, id: number, entrada: PessoaEntrada) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.editar");
      const atual = await pessoaDaConta(tx, titular, id);
      const complemento = separarComplemento(entrada);
      await exigirComplemento(tx, complemento);
      recusarDocumento(avaliarDocumentoClienteUpdate({
        userId: titular,
        id,
        tipoAtual: atual.tipo,
        tipoNovo: entrada.tipo,
        documentoAtual: atual.documento,
        documentoNovo: entrada.documento,
        documentoInformado: entrada.documento !== undefined,
        existentes: await clientes(tx, titular),
      }));
      const patch: Record<string, unknown> = {};
      if (entrada.nome !== undefined) patch.nome = entrada.nome.trim();
      if (entrada.tipo !== undefined) patch.tipo = entrada.tipo;
      if (entrada.funcao !== undefined) patch.funcao = limpo(entrada.funcao);
      if (entrada.documento !== undefined) patch.documento = limpo(entrada.documento);
      if (entrada.endereco !== undefined) patch.endereco = limpo(entrada.endereco);
      if (entrada.telefone !== undefined) patch.telefone = limpo(entrada.telefone);
      if (entrada.email !== undefined) patch.email = limpo(entrada.email);
      if (entrada.observacoes !== undefined) patch.observacoes = limpo(entrada.observacoes);
      if (entrada.propriedadeEstabelecimento !== undefined) {
        patch.propriedadeEstabelecimento = limpo(entrada.propriedadeEstabelecimento);
      }
      if (entrada.nomeContato !== undefined) patch.nomeContato = limpo(entrada.nomeContato);
      if (entrada.cidade !== undefined) patch.cidade = limpo(entrada.cidade);
      if (entrada.uf !== undefined) patch.uf = normalizeUfBrasil(entrada.uf);
      if (Object.keys(patch).length > 0) {
        await tx.update(pessoas).set(patch).where(and(eq(pessoas.id, id), eq(pessoas.userId, titular)));
      }
      await gravarComplemento(tx, titular, id, complemento);
      return { success: true as const };
    });
  },

  async inativar(sessao: SessaoPessoa, id: number) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.inativar");
      await pessoaDaConta(tx, titular, id);
      await tx.update(pessoas).set({ ativo: false }).where(and(eq(pessoas.id, id), eq(pessoas.userId, titular)));
      return { success: true as const };
    });
  },

  async reativar(sessao: SessaoPessoa, id: number) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.editar");
      const [row] = await tx.select({ id: pessoas.id, userId: pessoas.userId }).from(pessoas).where(eq(pessoas.id, id)).for("update").limit(1);
      if (!row || row.userId !== titular) {
        throw new TRPCError({ code: "NOT_FOUND", message: MSG_PESSOA_REATIVAR_NAO_ENCONTRADA });
      }
      await tx.update(pessoas).set({ ativo: true }).where(and(eq(pessoas.id, id), eq(pessoas.userId, titular)));
      return { success: true as const };
    });
  },

  async conferirExclusao(sessao: SessaoPessoa, id: number) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.inativar");
      const row = await pessoaDaConta(tx, titular, id);
      const total = await vinculos(tx, id);
      if (total == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_VINCULO_OPACO });
      return { nome: row.nome, canDelete: total === 0 };
    });
  },

  async excluir(sessao: SessaoPessoa, id: number) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.inativar");
      const row = await pessoaDaConta(tx, titular, id);
      const total = await vinculos(tx, id);
      if (total == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_VINCULO_OPACO });
      if (total > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Não é possível excluir o parceiro "${row.nome}".`,
        });
      }
      await tx.delete(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, titular)));
      const [ainda] = await tx.select({ id: pessoas.id }).from(pessoas).where(eq(pessoas.id, id)).limit(1);
      if (ainda) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_VINCULO_OPACO });
      return { success: true as const };
    });
  },
};
