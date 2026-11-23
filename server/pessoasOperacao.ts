/**
 * Pessoas da conta, compartilhadas entre as fazendas do mesmo titular.
 * O arquivo local não responde. Inativar não apaga compra, venda nem título.
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
};

type Banco = typeof dbPadrao;
type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
let bancoPessoas: Banco = dbPadrao;

export function definirBancoPessoas(banco: Banco | null) {
  bancoPessoas = banco ?? dbPadrao;
}

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PESSOA_SEM_MYSQL });
}

function textoErro(erro: unknown) {
  return erro instanceof Error
    ? `${erro.message} ${String((erro as { code?: string }).code ?? "")}`
    : String(erro);
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

export const pessoasOperacao = {
  async listar(sessao: SessaoPessoa, filtro?: { tipo?: PessoaTipo; incluirInativos?: boolean }) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.visualizar");
      const condicoes = [eq(pessoas.userId, titular)];
      if (deveRestringirPessoasListAosAtivos(filtro?.incluirInativos)) condicoes.push(eq(pessoas.ativo, true));
      if (filtro?.tipo) condicoes.push(eq(pessoas.tipo, filtro.tipo));
      return tx.select().from(pessoas).where(and(...condicoes)).orderBy(pessoas.nome);
    });
  },

  async criar(sessao: SessaoPessoa, entrada: PessoaEntrada) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.criar");
      const nome = entrada.nome?.trim() ?? "";
      if (!nome) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome." });
      if (!entrada.tipo) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o tipo." });
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
      return { success: true as const, id };
    });
  },

  async atualizar(sessao: SessaoPessoa, id: number, entrada: PessoaEntrada) {
    return correr(async (tx) => {
      const titular = await conta(tx, sessao, "pessoas.editar");
      const atual = await pessoaDaConta(tx, titular, id);
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
};
