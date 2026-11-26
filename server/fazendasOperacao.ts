/**
 * Fazendas no MySQL, com o titular da sessão gravada.
 * O funcionário não vira dono. O arquivo local não responde no lugar do banco.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { fazendas } from "../drizzle/schema";
import {
  FAZENDA_DELETE_BLOCKER_LABELS,
  formatFazendaDeleteBlockersMessage,
  type FazendaDeleteBlocker,
  type FazendaDeleteBlockerKey,
} from "../shared/fazendaDeleteBlockers";
import { prepararCamposFazenda } from "../shared/fazendaCadastro";
import { loginPermitido, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { avaliarAcessoFazenda, montarAcesso } from "./acessoFazendas";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db as dbPadrao } from "./db";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";

export const MSG_FAZENDA_SEM_MYSQL =
  "O cadastro de fazendas precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_FAZENDA_SEM_PERMISSAO = "Sem permissão para esta operação de fazenda.";
export const MSG_FAZENDA_NAO_ENCONTRADA = "Fazenda não encontrada.";
export const MSG_FAZENDA_HISTORICO =
  "Esta fazenda ainda tem concessões ou lançamentos. Esse histórico não é apagado.";
export const MSG_FAZENDA_VINCULO_OPACO =
  "Não foi possível conferir os vínculos desta fazenda. Nada foi apagado.";
export const MSG_FAZENDA_SITUACAO_INDISPONIVEL =
  "A inativação da fazenda ainda não está disponível neste banco. Nada foi alterado.";
export const MSG_FAZENDA_CODIGO_SISBOV_INDISPONIVEL =
  "O código SISBOV da propriedade ainda não está disponível neste banco. Nada foi alterado.";

export const MSG_FAZENDA_PASTAGEM_INDISPONIVEL =
  "A área de pastagem ainda não está disponível neste banco. Nada foi alterado.";

export type SessaoFazenda = {
  executorId: number;
  sessionVersionDaSessao: number | null;
};

type Banco = typeof dbPadrao;
type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
let bancoFazendas: Banco = dbPadrao;

export function definirBancoFazendas(banco: Banco | null) {
  bancoFazendas = banco ?? dbPadrao;
}

let ganchoTrava: (() => Promise<void>) | null = null;

export function definirGanchoTravaFazenda(gancho: (() => Promise<void>) | null) {
  ganchoTrava = gancho;
}

async function pausaTrava() {
  const gancho = ganchoTrava;
  if (!gancho) return;
  ganchoTrava = null;
  await gancho();
}

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_SEM_MYSQL });
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_FAZENDA_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_FAZENDA_NAO_ENCONTRADA });
  }
}

function textoErro(erro: unknown) {
  return erro instanceof Error
    ? `${erro.message} ${String((erro as { code?: string }).code ?? "")}`
    : String(erro);
}

async function correr<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await bancoFazendas.transaction(fn, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    recusarSeDeadlockEstoque(erro);
    if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(textoErro(erro))) {
      semMysql();
    }
    throw erro;
  }
}

type Conta = {
  identidade: IdentidadeUsuario;
  permissoes: string[];
  titular: number;
};

async function conta(tx: Tx, sessao: SessaoFazenda, permissaoId: string): Promise<Conta> {
  const consulta = consultaEstoqueNaTransacao(tx);
  const usuario = await consulta.usuario(sessao.executorId);
  if (!usuario || !loginPermitido(usuario.situacao) || usuario.titularUserId == null) recusar("sem_identidade");
  if (
    sessao.sessionVersionDaSessao != null
    && sessao.sessionVersionDaSessao !== usuario.sessionVersion
  ) {
    recusar("sem_identidade");
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
  if (!principal && !permissoes.includes(permissaoId)) recusar("sem_permissao");
  return { identidade, permissoes, titular: identidade.titularUserId };
}

async function autorizarFazenda(tx: Tx, sessao: SessaoFazenda, fazendaId: number, permissaoId: string) {
  const deciso = await autorizarOperacaoPersistida(consultaEstoqueNaTransacao(tx), {
    executorId: sessao.executorId,
    sessionVersionDaSessao: sessao.sessionVersionDaSessao,
    permissaoId,
    fazendaId,
  });
  if (!deciso.ok) recusar(deciso.motivo);
  return deciso.contexto;
}

function camposLivres(entrada: Record<string, unknown>) {
  const preparado = prepararCamposFazenda(entrada);
  if (!preparado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: preparado.mensagem });
  return preparado.dados;
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

const BLOQUEIOS: { key: FazendaDeleteBlockerKey; sql: (titular: number, id: number) => ReturnType<typeof sql> }[] = [
  { key: "subdivisoes", sql: (titular, id) => sql`SELECT COUNT(*) AS n FROM pastos WHERE userId = ${titular} AND fazendaId = ${id}` },
  { key: "animais", sql: (titular, id) => sql`SELECT COUNT(*) AS n FROM animais WHERE userId = ${titular} AND fazendaId = ${id}` },
  { key: "lotes", sql: (titular, id) => sql`SELECT COUNT(*) AS n FROM lotes WHERE userId = ${titular} AND fazendaId = ${id}` },
  { key: "maquinas", sql: (titular, id) => sql`SELECT COUNT(*) AS n FROM maquinas WHERE userId = ${titular} AND fazendaId = ${id}` },
  { key: "benfeitorias", sql: (titular, id) => sql`SELECT COUNT(*) AS n FROM benfeitorias WHERE userId = ${titular} AND fazendaId = ${id}` },
  { key: "estoque", sql: (_titular, id) => sql`SELECT COUNT(*) AS n FROM estoque WHERE fazenda_id = ${id}` },
];

const HISTORICO = [
  (id: number) => sql`SELECT COUNT(*) AS n FROM usuario_fazendas WHERE fazendaId = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM compras WHERE fazenda_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM vendas WHERE fazenda_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM animal_baixas WHERE fazendaId = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM nutricao_dietas WHERE fazendaId = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM abastecimentos WHERE fazendaId = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM financeiro_titulos WHERE fazenda_origem_id = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM auditoria_eventos WHERE fazendaId = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM reproducao_operacoes WHERE fazendaId = ${id}`,
  (id: number) => sql`SELECT COUNT(*) AS n FROM semen_partidas WHERE fazenda_id = ${id}`,
];

async function colunaExiste(tx: Tx, coluna: string) {
  const qtd = await contar(
    tx,
    sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fazendas' AND COLUMN_NAME = ${coluna}`,
  );
  return qtd != null && qtd > 0;
}

async function colunaSituacaoExiste(tx: Tx) {
  return colunaExiste(tx, "situacao");
}

async function pastagensDaConta(tx: Tx, titular: number) {
  if (!(await colunaExiste(tx, "areaPastagem"))) return null;
  const resultado = await tx.execute(sql`SELECT id, areaPastagem FROM fazendas WHERE userId = ${titular}`);
  const pacote = resultado as unknown as [Array<{ id?: number; areaPastagem?: unknown }>, unknown];
  const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
  const mapa = new Map<number, string | null>();
  for (const linha of linhas) {
    mapa.set(Number(linha.id), linha.areaPastagem == null || linha.areaPastagem === "" ? null : String(linha.areaPastagem));
  }
  return mapa;
}

async function gravarAreaPastagem(tx: Tx, titular: number, id: number, valor: string | null) {
  await tx.execute(sql`
    UPDATE fazendas
    SET areaPastagem = ${valor}
    WHERE id = ${id} AND userId = ${titular}
  `);
}

function separarAreaPastagem(dados: Record<string, unknown>) {
  const informada = Object.prototype.hasOwnProperty.call(dados, "areaPastagem");
  const valor = informada ? (dados.areaPastagem == null ? null : String(dados.areaPastagem)) : undefined;
  delete dados.areaPastagem;
  return { informada, valor };
}

async function codigosSisbovDaConta(tx: Tx, titular: number) {
  if (!(await colunaExiste(tx, "codigoSisbov"))) return null;
  const resultado = await tx.execute(sql`SELECT id, codigoSisbov FROM fazendas WHERE userId = ${titular}`);
  const pacote = resultado as unknown as [Array<{ id?: number; codigoSisbov?: unknown }>, unknown];
  const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
  const mapa = new Map<number, string | null>();
  for (const linha of linhas) {
    const texto = linha.codigoSisbov == null ? "" : String(linha.codigoSisbov).trim();
    mapa.set(Number(linha.id), texto ? texto : null);
  }
  return mapa;
}

function separarCodigoSisbov(dados: Record<string, unknown>) {
  const informada = Object.prototype.hasOwnProperty.call(dados, "codigoSisbov");
  const texto = informada ? (dados.codigoSisbov == null ? "" : String(dados.codigoSisbov).trim()) : "";
  delete dados.codigoSisbov;
  return { informada, texto };
}

function valorCodigoSisbov(texto: string) {
  if (texto.length > 40) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O código da fazenda no SISBOV pode ter no máximo 40 caracteres.",
    });
  }
  return texto ? texto : null;
}

async function gravarCodigoSisbov(tx: Tx, titular: number, id: number, valor: string | null) {
  await tx.execute(sql`
    UPDATE fazendas
    SET codigoSisbov = ${valor}
    WHERE id = ${id} AND userId = ${titular}
  `);
}

async function situacoesDaConta(tx: Tx, titular: number) {
  if (!(await colunaSituacaoExiste(tx))) return null;
  const resultado = await tx.execute(sql`SELECT id, situacao FROM fazendas WHERE userId = ${titular}`);
  const pacote = resultado as unknown as [Array<{ id?: number; situacao?: string }>, unknown];
  const linhas = Array.isArray(pacote?.[0]) ? pacote[0] : [];
  const mapa = new Map<number, "ativo" | "inativo">();
  for (const linha of linhas) {
    mapa.set(Number(linha.id), linha.situacao === "inativo" ? "inativo" : "ativo");
  }
  return mapa;
}

async function vinculos(tx: Tx, titular: number, id: number) {
  const blockers: FazendaDeleteBlocker[] = [];
  for (const item of BLOQUEIOS) {
    const qtd = await contar(tx, item.sql(titular, id));
    if (qtd == null) return null;
    if (qtd > 0) blockers.push({ key: item.key, label: FAZENDA_DELETE_BLOCKER_LABELS[item.key], qtd });
  }
  let historico = 0;
  for (const item of HISTORICO) {
    const qtd = await contar(tx, item(id));
    if (qtd == null) return null;
    historico += qtd;
  }
  return { blockers, historico };
}

export const fazendasOperacao = {
  async listar(sessao: SessaoFazenda) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "fazendas.visualizar");
      const consulta = consultaEstoqueNaTransacao(tx);
      const linhas = await tx
        .select()
        .from(fazendas)
        .where(eq(fazendas.userId, atual.titular))
        .orderBy(desc(fazendas.createdAt));
      const vinculosConta = await consulta.vinculos(atual.identidade.id, atual.titular);
      const acesso = montarAcesso({
        identidade: atual.identidade,
        fazendasDoTitular: linhas.map((row) => ({ id: row.id, userId: row.userId })),
        vinculos: vinculosConta,
      });
      if (!acesso) recusar("sem_identidade");
      const situacoes = await situacoesDaConta(tx, atual.titular);
      const pastagens = await pastagensDaConta(tx, atual.titular);
      const codigos = await codigosSisbovDaConta(tx, atual.titular);
      return linhas
        .filter((row) => avaliarAcessoFazenda(acesso, { id: row.id, userId: row.userId }) === "permitido")
        .map((row) => ({
          ...row,
          situacao: situacoes?.get(row.id) ?? "ativo",
          areaPastagem: pastagens?.get(row.id) ?? null,
          codigoSisbov: codigos?.get(row.id) ?? null,
        }));
    });
  },

  async obter(sessao: SessaoFazenda, id: number) {
    return correr(async (tx) => {
      await autorizarFazenda(tx, sessao, id, "fazendas.visualizar");
      const [row] = await tx.select().from(fazendas).where(eq(fazendas.id, id)).limit(1);
      if (!row) recusar("fazenda_inexistente");
      const situacoes = await situacoesDaConta(tx, row.userId);
      const pastagens = await pastagensDaConta(tx, row.userId);
      const codigos = await codigosSisbovDaConta(tx, row.userId);
      return {
        ...row,
        situacao: situacoes?.get(id) ?? "ativo",
        areaPastagem: pastagens?.get(id) ?? null,
        codigoSisbov: codigos?.get(id) ?? null,
      };
    });
  },

  async criar(sessao: SessaoFazenda, entrada: { nome: string } & Record<string, unknown>) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "fazendas.criar");
      const nome = String(entrada.nome ?? "").trim();
      if (!nome) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome da fazenda." });
      const dados = { ...camposLivres(entrada), nome, userId: atual.titular };
      const pastagem = separarAreaPastagem(dados);
      const codigo = separarCodigoSisbov(dados);
      if (pastagem.informada && !(await colunaExiste(tx, "areaPastagem"))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_PASTAGEM_INDISPONIVEL });
      }
      if (codigo.informada && !(await colunaExiste(tx, "codigoSisbov"))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_CODIGO_SISBOV_INDISPONIVEL });
      }
      const codigoValor = codigo.informada ? valorCodigoSisbov(codigo.texto) : undefined;
      const result = await tx.insert(fazendas).values(dados as typeof fazendas.$inferInsert);
      const id = Number((result as unknown as [{ insertId?: number }])[0]?.insertId ?? 0);
      if (pastagem.informada && pastagem.valor !== undefined) {
        await gravarAreaPastagem(tx, atual.titular, id, pastagem.valor);
      }
      if (codigo.informada && codigoValor !== undefined) {
        await gravarCodigoSisbov(tx, atual.titular, id, codigoValor);
      }
      return { success: true as const, id };
    });
  },

  async atualizar(sessao: SessaoFazenda, id: number, entrada: Record<string, unknown>) {
    return correr(async (tx) => {
      const contexto = await autorizarFazenda(tx, sessao, id, "fazendas.editar");
      await pausaTrava();
      const dados = camposLivres(entrada);
      const pastagem = separarAreaPastagem(dados);
      const codigo = separarCodigoSisbov(dados);
      if (pastagem.informada && !(await colunaExiste(tx, "areaPastagem"))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_PASTAGEM_INDISPONIVEL });
      }
      if (codigo.informada && !(await colunaExiste(tx, "codigoSisbov"))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_CODIGO_SISBOV_INDISPONIVEL });
      }
      const codigoValor = codigo.informada ? valorCodigoSisbov(codigo.texto) : undefined;
      if (Object.keys(dados).length > 0) {
        await tx.update(fazendas).set(dados).where(and(eq(fazendas.id, id), eq(fazendas.userId, contexto.titularUserId)));
      }
      if (pastagem.informada && pastagem.valor !== undefined) {
        await gravarAreaPastagem(tx, contexto.titularUserId, id, pastagem.valor);
      }
      if (codigo.informada && codigoValor !== undefined) {
        await gravarCodigoSisbov(tx, contexto.titularUserId, id, codigoValor);
      }
      const [row] = await tx.select({ userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, id)).limit(1);
      if (!row || row.userId !== contexto.titularUserId) recusar("fazenda_inexistente");
      return { success: true as const };
    });
  },

  async definirSituacao(sessao: SessaoFazenda, id: number, situacao: "ativo" | "inativo") {
    return correr(async (tx) => {
      const contexto = await autorizarFazenda(tx, sessao, id, "fazendas.inativar");
      if (!(await colunaSituacaoExiste(tx))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_SITUACAO_INDISPONIVEL });
      }
      const [row] = await tx
        .select({ userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.id, id))
        .for("update")
        .limit(1);
      if (!row || row.userId !== contexto.titularUserId) recusar("fazenda_inexistente");
      await tx.execute(sql`
        UPDATE fazendas
        SET situacao = ${situacao}
        WHERE id = ${id} AND userId = ${contexto.titularUserId}
      `);
      const situacoes = await situacoesDaConta(tx, contexto.titularUserId);
      if (situacoes?.get(id) !== situacao) recusar("fazenda_inexistente");
      return { success: true as const, situacao };
    });
  },

  async conferirExclusao(sessao: SessaoFazenda, id: number) {
    return correr(async (tx) => {
      const contexto = await autorizarFazenda(tx, sessao, id, "fazendas.inativar");
      const [row] = await tx.select({ nome: fazendas.nome }).from(fazendas).where(eq(fazendas.id, id)).limit(1);
      if (!row) recusar("fazenda_inexistente");
      const achados = await vinculos(tx, contexto.titularUserId, id);
      if (!achados) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_VINCULO_OPACO });
      return {
        nome: row.nome,
        blockers: achados.blockers,
        canDelete: achados.blockers.length === 0 && achados.historico === 0,
      };
    });
  },

  async excluir(sessao: SessaoFazenda, id: number) {
    return correr(async (tx) => {
      const contexto = await autorizarFazenda(tx, sessao, id, "fazendas.inativar");
      await pausaTrava();
      const [row] = await tx.select({ nome: fazendas.nome, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, id)).for("update").limit(1);
      if (!row || row.userId !== contexto.titularUserId) recusar("fazenda_inexistente");
      const achados = await vinculos(tx, contexto.titularUserId, id);
      if (!achados) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_FAZENDA_VINCULO_OPACO });
      if (achados.blockers.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: formatFazendaDeleteBlockersMessage(row.nome, achados.blockers),
        });
      }
      if (achados.historico > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Não é possível excluir a fazenda "${row.nome}". ${MSG_FAZENDA_HISTORICO}`,
        });
      }
      await tx.delete(fazendas).where(and(eq(fazendas.id, id), eq(fazendas.userId, contexto.titularUserId)));
      const [ainda] = await tx.select({ id: fazendas.id }).from(fazendas).where(eq(fazendas.id, id)).limit(1);
      if (ainda) recusar("fazenda_inexistente");
      return { success: true as const };
    });
  },
};
