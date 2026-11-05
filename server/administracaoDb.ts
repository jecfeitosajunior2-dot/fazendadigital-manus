import { randomBytes } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { IdentidadeUsuario, PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { montarAcesso, type FazendaConhecida, type VinculoFazenda } from "./acessoFazendas";
import {
  emitirRevisaoReativacao,
  planejarAlteracaoPapel,
  planejarAplicacaoPerfil,
  planejarConcessaoFazenda,
  planejarConcessaoPermissao,
  planejarConjuntoPermissoes,
  planejarCriacaoPerfil,
  planejarCriacaoUsuario,
  planejarEdicaoPerfil,
  planejarEdicaoUsuario,
  planejarInativacaoPerfil,
  planejarInativacaoUsuario,
  planejarReativacao,
  planejarRevogacaoFazenda,
  planejarRevogacaoPermissao,
  planejarSaneamentoFazenda,
  planejarSaneamentoPermissao,
  seloDaRevisao,
  type ContextoAdministracao,
  type MotivoAdministracao,
  type PerfilConhecido,
  type SessaoPlanejada,
  type UsuarioAdministravel,
} from "./administracao";
import { registrarEvento, concluirTransacao, type EntradaEventoAuditoria } from "./auditoriaTransacao";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";
import type { LinhaPermissaoUsuario } from "./perfisAcesso";

/**
 * Grava no MySQL que o chamador já isolou. A regra continua em administracao.ts.
 * A revisão de reativação fica nesta base, com token opaco, prazo e uso único.
 */

const VALIDADE_REVISAO_MS = 15 * 60 * 1000;

export type MotivoPersistencia =
  | MotivoAdministracao
  | "revisao_expirada"
  | "revisao_ja_utilizada"
  | "revisao_nao_autenticada"
  | "conflito";

export type FalhaPersistencia = {
  ok: false;
  motivo: MotivoPersistencia;
  permissao?: string;
  fazendaId?: number;
};

export type GanchosPersistencia = {
  depoisDoBloqueio?: () => Promise<void> | void;
  antesDaGravacao?: () => Promise<void> | void;
  depoisDaAlteracao?: () => Promise<void> | void;
  falharSessao?: boolean;
  falharAuditoria?: boolean;
  agoraMs?: number;
  validadeMs?: number;
};

type Ok = { ok: true };

class Recusa extends Error {
  readonly resultado: FalhaPersistencia;
  constructor(resultado: FalhaPersistencia) {
    super("operacao-recusada");
    this.name = "Recusa";
    this.resultado = resultado;
  }
}

function recusar(motivo: MotivoPersistencia, extra?: { permissao?: string; fazendaId?: number }): never {
  throw new Recusa(extra ? { ok: false, motivo, ...extra } : { ok: false, motivo });
}

function agoraDe(ganchos?: GanchosPersistencia): number {
  return ganchos?.agoraMs ?? Date.now();
}

function json(valor: unknown): string | null {
  if (valor == null) return null;
  return JSON.stringify(valor);
}

type UsuarioLinha = RowDataPacket & {
  id: number;
  name: string;
  email: string | null;
  role: "admin" | "user";
  papel: PapelConta;
  titularUserId: number;
  situacao: SituacaoUsuario;
  sessionVersion: number;
};

function usuarioDe(linha: UsuarioLinha): UsuarioAdministravel {
  return {
    id: linha.id,
    name: linha.name,
    email: linha.email,
    role: linha.role,
    papel: linha.papel,
    titularUserId: linha.titularUserId,
    situacao: linha.situacao,
    sessionVersion: linha.sessionVersion,
  };
}

function identidadeDe(linha: UsuarioLinha): IdentidadeUsuario {
  return {
    id: linha.id,
    openId: "",
    name: linha.name,
    email: linha.email,
    role: linha.role,
    papel: linha.papel,
    titularUserId: linha.titularUserId,
    situacao: linha.situacao,
    sessionVersion: linha.sessionVersion,
  };
}

async function conferirBanco(conn: PoolConnection, alvo: AlvoMysql): Promise<void> {
  const [linhas] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
  const nome = String(linhas[0]?.nome ?? "");
  if (nome.toLowerCase() !== alvo.database.toLowerCase() || nome.toLowerCase() === "fazenda_digital") {
    throw new Error("Conexão recusada: banco inesperado.");
  }
}

async function bloquearEscopo(
  conn: PoolConnection,
  userIds: number[],
  extra?: { perfilId?: number; revisaoId?: number },
): Promise<void> {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
  if (ids.length > 0) {
    const marcas = ids.map(() => "?").join(",");
    await conn.query(`SELECT id FROM users WHERE id IN (${marcas}) ORDER BY id FOR UPDATE`, ids);
    await conn.query(
      `SELECT id FROM usuario_permissoes WHERE userId IN (${marcas}) ORDER BY userId, id FOR UPDATE`,
      ids,
    );
    await conn.query(
      `SELECT id FROM usuario_fazendas WHERE userId IN (${marcas}) ORDER BY userId, id FOR UPDATE`,
      ids,
    );
  }
  if (extra?.perfilId) {
    await conn.query("SELECT id FROM perfis_acesso WHERE id = ? FOR UPDATE", [extra.perfilId]);
    await conn.query("SELECT id FROM perfil_permissoes WHERE perfilId = ? ORDER BY id FOR UPDATE", [extra.perfilId]);
  }
  if (extra?.revisaoId) {
    await conn.query("SELECT id FROM revisoes_reativacao WHERE id = ? FOR UPDATE", [extra.revisaoId]);
  }
}

async function carregarUsuario(conn: PoolConnection, id: number): Promise<UsuarioAdministravel> {
  const [linhas] = await conn.query<UsuarioLinha[]>(
    `SELECT id, name, email, role, papel, titularUserId, situacao, sessionVersion
     FROM users WHERE id = ?`,
    [id],
  );
  const linha = linhas[0];
  if (!linha || linha.titularUserId == null) recusar("alvo_invalido");
  return usuarioDe(linha);
}

async function carregarIdentidade(conn: PoolConnection, id: number): Promise<IdentidadeUsuario> {
  const [linhas] = await conn.query<UsuarioLinha[]>(
    `SELECT id, name, email, role, papel, titularUserId, situacao, sessionVersion
     FROM users WHERE id = ?`,
    [id],
  );
  const linha = linhas[0];
  if (!linha || linha.titularUserId == null) recusar("sem_identidade");
  return identidadeDe(linha);
}

async function carregarPermissoes(conn: PoolConnection, userId: number): Promise<LinhaPermissaoUsuario[]> {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId
     FROM usuario_permissoes WHERE userId = ? ORDER BY permissao`,
    [userId],
  );
  return linhas.map((linha) => ({
    userId: Number(linha.userId),
    titularUserId: Number(linha.titularUserId),
    permissao: String(linha.permissao),
    concedidoPorUserId: Number(linha.concedidoPorUserId),
    origemPerfilId: linha.origemPerfilId == null ? null : Number(linha.origemPerfilId),
  }));
}

async function carregarVinculos(conn: PoolConnection, userId: number): Promise<VinculoFazenda[]> {
  const [linhas] = await conn.query<RowDataPacket[]>(
    "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ? ORDER BY fazendaId",
    [userId],
  );
  return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
}

async function carregarFazendas(
  conn: PoolConnection,
  titularUserId: number,
  extras: readonly number[] = [],
): Promise<FazendaConhecida[]> {
  const ids = extras.filter((id) => Number.isInteger(id) && id > 0);
  const [linhas] = await conn.query<RowDataPacket[]>(
    ids.length > 0
      ? `SELECT id, userId FROM fazendas WHERE userId = ? OR id IN (${ids.map(() => "?").join(",")}) ORDER BY id`
      : "SELECT id, userId FROM fazendas WHERE userId = ? ORDER BY id",
    ids.length > 0 ? [titularUserId, ...ids] : [titularUserId],
  );
  return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
}

async function carregarPerfil(conn: PoolConnection, id: number): Promise<PerfilConhecido> {
  const [perfis] = await conn.query<RowDataPacket[]>(
    `SELECT id, titularUserId, nome, descricao, situacao, criadoPorUserId
     FROM perfis_acesso WHERE id = ?`,
    [id],
  );
  const perfil = perfis[0];
  if (!perfil) recusar("alvo_invalido");
  const [itens] = await conn.query<RowDataPacket[]>(
    "SELECT permissao FROM perfil_permissoes WHERE perfilId = ? ORDER BY permissao",
    [id],
  );
  return {
    id: Number(perfil.id),
    titularUserId: Number(perfil.titularUserId),
    nome: String(perfil.nome),
    descricao: perfil.descricao == null ? null : String(perfil.descricao),
    situacao: perfil.situacao === "inativo" ? "inativo" : "ativo",
    criadoPorUserId: Number(perfil.criadoPorUserId),
    permissoes: itens.map((item) => String(item.permissao)),
  };
}

async function carregarContexto(conn: PoolConnection, executorId: number): Promise<ContextoAdministracao> {
  const identidade = await carregarIdentidade(conn, executorId);
  const permissoes = (await carregarPermissoes(conn, executorId)).map((linha) => linha.permissao);
  const fazendas = await carregarFazendas(conn, identidade.titularUserId);
  const vinculos = identidade.papel === "principal" ? [] : await carregarVinculos(conn, executorId);
  return {
    identidade,
    acesso: montarAcesso({ identidade, fazendasDoTitular: fazendas, vinculos }),
    permissoes,
  };
}

async function emails(conn: PoolConnection): Promise<Array<{ id: number; email: string | null }>> {
  const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, email FROM users");
  return linhas.map((linha) => ({ id: Number(linha.id), email: linha.email == null ? null : String(linha.email) }));
}

async function perfisDaConta(conn: PoolConnection, titularUserId: number) {
  const [linhas] = await conn.query<RowDataPacket[]>(
    "SELECT id, titularUserId, nome FROM perfis_acesso WHERE titularUserId = ?",
    [titularUserId],
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    titularUserId: Number(linha.titularUserId),
    nome: String(linha.nome),
  }));
}

async function aplicarSessao(conn: PoolConnection, sessao: SessaoPlanejada, ganchos?: GanchosPersistencia): Promise<void> {
  if (!sessao.invalidar || sessao.userId == null || sessao.sessionVersionAtual == null) return;
  const [resultado] = await conn.query<ResultSetHeader>(
    "UPDATE users SET sessionVersion = sessionVersion + 1 WHERE id = ? AND sessionVersion = ?",
    [sessao.userId, sessao.sessionVersionAtual],
  );
  if (resultado.affectedRows !== 1) recusar("conflito");
  if (ganchos?.falharSessao) throw new Error("falha-sessao");
}

async function gravarAuditoria(
  conn: PoolConnection,
  identidade: IdentidadeUsuario,
  entrada: EntradaEventoAuditoria,
  ganchos?: GanchosPersistencia,
): Promise<void> {
  await registrarEvento({
    async inserirEvento(linha) {
      await conn.query(
        `INSERT INTO auditoria_eventos
          (executorUserId, executorNome, titularUserId, fazendaId, modulo, operacao, registroTipo, registroId, dadosAnteriores, dadosPosteriores)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          linha.executorUserId,
          linha.executorNome,
          linha.titularUserId,
          linha.fazendaId,
          linha.modulo,
          linha.operacao,
          linha.registroTipo,
          linha.registroId,
          json(linha.dadosAnteriores),
          json(linha.dadosPosteriores),
        ],
      );
      if (ganchos?.falharAuditoria) throw new Error("falha-auditoria");
    },
  }, identidade, entrada);
}

async function inserirPermissoes(conn: PoolConnection, linhas: readonly LinhaPermissaoUsuario[]): Promise<void> {
  for (const linha of linhas) {
    await conn.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId)
       VALUES (?, ?, ?, ?, ?)`,
      [linha.userId, linha.titularUserId, linha.permissao, linha.concedidoPorUserId, linha.origemPerfilId],
    );
  }
}

async function apagarPermissoes(conn: PoolConnection, userId: number, titularUserId: number, permissoes: readonly string[]): Promise<void> {
  for (const permissao of permissoes) {
    const [resultado] = await conn.query<ResultSetHeader>(
      "DELETE FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? AND permissao = ?",
      [userId, titularUserId, permissao],
    );
    if (resultado.affectedRows !== 1) recusar("conflito", { permissao });
  }
}

async function inserirFazenda(conn: PoolConnection, userId: number, fazendaId: number, concedidoPorUserId: number): Promise<void> {
  await conn.query(
    "INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (?, ?, ?)",
    [userId, fazendaId, concedidoPorUserId],
  );
}

async function apagarFazendas(conn: PoolConnection, userId: number, fazendas: readonly number[]): Promise<void> {
  for (const fazendaId of fazendas) {
    const [resultado] = await conn.query<ResultSetHeader>(
      "DELETE FROM usuario_fazendas WHERE userId = ? AND fazendaId = ?",
      [userId, fazendaId],
    );
    if (resultado.affectedRows !== 1) recusar("conflito", { fazendaId });
  }
}

function traduzirDuplicidade(erro: unknown): FalhaPersistencia | null {
  const detalhe = erro as { errno?: number; code?: string; message?: string };
  if (detalhe.code !== "ER_DUP_ENTRY" && detalhe.errno !== 1062) return null;
  const texto = detalhe.message ?? "";
  if (texto.includes("users_email")) return { ok: false, motivo: "email_duplicado" };
  if (texto.includes("usuario_permissoes")) return { ok: false, motivo: "concessao_duplicada" };
  if (texto.includes("usuario_fazendas")) return { ok: false, motivo: "vinculo_existente" };
  if (texto.includes("perfis_acesso")) return { ok: false, motivo: "nome_duplicado" };
  return { ok: false, motivo: "conflito" };
}

type EstadoGuardado = {
  sessionVersion: number;
  situacao: SituacaoUsuario;
  papel: PapelConta;
  titularUserId: number;
  permissoes: string[];
  fazendas: number[];
};

type PropostaGuardada = {
  permissoesPropostas: string[];
  fazendasPropostas: number[];
};

function estadoVivo(
  usuario: UsuarioAdministravel,
  permissoes: readonly LinhaPermissaoUsuario[],
  fazendas: readonly number[],
): EstadoGuardado {
  return {
    sessionVersion: usuario.sessionVersion,
    situacao: usuario.situacao,
    papel: usuario.papel,
    titularUserId: usuario.titularUserId,
    permissoes: [...new Set(permissoes.map((linha) => linha.permissao))].sort(),
    fazendas: [...new Set(fazendas)].sort((a, b) => a - b),
  };
}

function mesmoEstado(salvo: EstadoGuardado, vivo: EstadoGuardado): boolean {
  return salvo.sessionVersion === vivo.sessionVersion
    && salvo.situacao === vivo.situacao
    && salvo.papel === vivo.papel
    && salvo.titularUserId === vivo.titularUserId
    && salvo.permissoes.join("\0") === vivo.permissoes.join("\0")
    && salvo.fazendas.join("\0") === vivo.fazendas.join("\0");
}

export function criarAdministracaoDb(pool: Pool, alvo: AlvoMysql) {
  afirmarBancoDescartavel(alvo);

  async function emTransacao<T>(trabalho: (conn: PoolConnection) => Promise<T>): Promise<T | FalhaPersistencia> {
    afirmarBancoDescartavel(alvo);
    const conn = await pool.getConnection();
    try {
      await conferirBanco(conn, alvo);
      await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await conn.beginTransaction();
      return await concluirTransacao({
        commit: async () => { await conn.commit(); },
        rollback: async () => { await conn.rollback(); },
      }, () => trabalho(conn));
    } catch (erro) {
      if (erro instanceof Recusa) return erro.resultado;
      const duplicidade = traduzirDuplicidade(erro);
      if (duplicidade) return duplicidade;
      throw erro;
    } finally {
      conn.release();
    }
  }

  async function preparar(
    conn: PoolConnection,
    executorId: number,
    alvoId: number,
    ganchos: GanchosPersistencia | undefined,
    extra?: { perfilId?: number; revisaoId?: number },
  ) {
    await bloquearEscopo(conn, [executorId, alvoId], extra);
    if (ganchos?.depoisDoBloqueio) await ganchos.depoisDoBloqueio();
    const ctx = await carregarContexto(conn, executorId);
    const usuario = executorId === alvoId ? usuarioDe(await linhaUsuario(conn, alvoId)) : await carregarUsuario(conn, alvoId);
    if (ganchos?.antesDaGravacao) await ganchos.antesDaGravacao();
    return { ctx, usuario, identidade: ctx.identidade };
  }

  async function linhaUsuario(conn: PoolConnection, id: number): Promise<UsuarioLinha> {
    const [linhas] = await conn.query<UsuarioLinha[]>(
      `SELECT id, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ?`,
      [id],
    );
    const linha = linhas[0];
    if (!linha || linha.titularUserId == null) recusar("alvo_invalido");
    return linha;
  }

  async function finalizar(
    conn: PoolConnection,
    identidade: IdentidadeUsuario,
    sessao: SessaoPlanejada,
    entrada: EntradaEventoAuditoria,
    ganchos?: GanchosPersistencia,
  ): Promise<void> {
    if (ganchos?.depoisDaAlteracao) await ganchos.depoisDaAlteracao();
    await aplicarSessao(conn, sessao, ganchos);
    await gravarAuditoria(conn, identidade, entrada, ganchos);
  }

  return {
    async editarUsuario(
      executorId: number,
      alvoId: number,
      entrada: { name?: string; email?: string; titularUserId?: number | null; senha?: string | null },
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const plano = planejarEdicaoUsuario(ctx, usuario, { name: entrada.name, email: entrada.email }, await emails(conn));
        if (!plano.ok) recusar(plano.motivo, plano);
        const [resultado] = await conn.query<ResultSetHeader>(
          `UPDATE users SET name = ?, email = ?
           WHERE id = ? AND sessionVersion = ? AND titularUserId = ?`,
          [plano.plano.usuario.name, plano.plano.usuario.email, alvoId, usuario.sessionVersion, usuario.titularUserId],
        );
        if (resultado.affectedRows !== 1) recusar("conflito");
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async inativarUsuario(executorId: number, alvoId: number, ganchos?: GanchosPersistencia): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const plano = planejarInativacaoUsuario(ctx, usuario);
        if (!plano.ok) recusar(plano.motivo, plano);
        const [resultado] = await conn.query<ResultSetHeader>(
          `UPDATE users
             SET situacao = 'inativo', inativadoEm = CURRENT_TIMESTAMP, inativadoPorUserId = ?
           WHERE id = ? AND sessionVersion = ? AND situacao = 'ativo' AND titularUserId = ?`,
          [executorId, alvoId, usuario.sessionVersion, usuario.titularUserId],
        );
        if (resultado.affectedRows !== 1) recusar("conflito");
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async alterarPapel(
      executorId: number,
      alvoId: number,
      papel: string,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const plano = planejarAlteracaoPapel(ctx, usuario, papel);
        if (!plano.ok) recusar(plano.motivo, plano);
        const [resultado] = await conn.query<ResultSetHeader>(
          `UPDATE users SET papel = ?, role = 'user'
           WHERE id = ? AND sessionVersion = ? AND titularUserId = ?`,
          [plano.plano.usuario.papel, alvoId, usuario.sessionVersion, usuario.titularUserId],
        );
        if (resultado.affectedRows !== 1) recusar("conflito");
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async criarUsuario(
      executorId: number,
      entrada: { name: string; email: string; papel: string; senha?: string | null; titularUserId?: number | null; openId?: string | null },
      ganchos?: GanchosPersistencia,
    ): Promise<Ok & { id: number } | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        await bloquearEscopo(conn, [executorId]);
        if (ganchos?.depoisDoBloqueio) await ganchos.depoisDoBloqueio();
        const ctx = await carregarContexto(conn, executorId);
        if (ganchos?.antesDaGravacao) await ganchos.antesDaGravacao();
        const plano = planejarCriacaoUsuario(ctx, {
          name: entrada.name,
          email: entrada.email,
          papel: entrada.papel,
        }, await emails(conn));
        if (!plano.ok) recusar(plano.motivo, plano);
        const openId = `isolado-${randomBytes(16).toString("hex")}`;
        const [resultado] = await conn.query<ResultSetHeader>(
          `INSERT INTO users (openId, name, email, loginMethod, passwordHash, role, papel, titularUserId, situacao, sessionVersion)
           VALUES (?, ?, ?, 'local', NULL, 'user', ?, ?, 'ativo', 0)`,
          [openId, plano.plano.usuario.name, plano.plano.usuario.email, plano.plano.usuario.papel, plano.plano.usuario.titularUserId],
        );
        const posterior = plano.plano.auditoria.entrada.dadosPosteriores;
        const entradaAuditoria: EntradaEventoAuditoria = {
          ...plano.plano.auditoria.entrada,
          registroId: resultado.insertId,
          dadosPosteriores: posterior && typeof posterior === "object"
            ? { ...(posterior as Record<string, unknown>), id: resultado.insertId }
            : posterior,
        };
        await finalizar(conn, ctx.identidade, plano.plano.sessao, entradaAuditoria, ganchos);
        return { ok: true as const, id: resultado.insertId };
      });
    },

    async criarPerfil(
      executorId: number,
      entrada: { nome: string; descricao?: string | null; permissoes: readonly string[]; titularUserId?: number | null },
      ganchos?: GanchosPersistencia,
    ): Promise<Ok & { id: number } | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        await bloquearEscopo(conn, [executorId]);
        if (ganchos?.depoisDoBloqueio) await ganchos.depoisDoBloqueio();
        const ctx = await carregarContexto(conn, executorId);
        if (ganchos?.antesDaGravacao) await ganchos.antesDaGravacao();
        const plano = planejarCriacaoPerfil(ctx, entrada, await perfisDaConta(conn, ctx.identidade.titularUserId));
        if (!plano.ok) recusar(plano.motivo, plano);
        const [resultado] = await conn.query<ResultSetHeader>(
          `INSERT INTO perfis_acesso (titularUserId, nome, descricao, situacao, criadoPorUserId)
           VALUES (?, ?, ?, 'ativo', ?)`,
          [plano.plano.perfil.titularUserId, plano.plano.perfil.nome, plano.plano.perfil.descricao, executorId],
        );
        for (const permissao of plano.plano.perfil.permissoes) {
          await conn.query("INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (?, ?)", [resultado.insertId, permissao]);
        }
        await finalizar(conn, ctx.identidade, plano.plano.sessao, {
          ...plano.plano.auditoria.entrada,
          registroId: resultado.insertId,
        }, ganchos);
        return { ok: true as const, id: resultado.insertId };
      });
    },

    async editarPerfil(
      executorId: number,
      perfilId: number,
      entrada: { nome: string; descricao?: string | null; permissoes: readonly string[] },
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        await bloquearEscopo(conn, [executorId], { perfilId });
        if (ganchos?.depoisDoBloqueio) await ganchos.depoisDoBloqueio();
        const ctx = await carregarContexto(conn, executorId);
        const perfil = await carregarPerfil(conn, perfilId);
        if (ganchos?.antesDaGravacao) await ganchos.antesDaGravacao();
        const plano = planejarEdicaoPerfil(ctx, perfil, entrada, await perfisDaConta(conn, ctx.identidade.titularUserId));
        if (!plano.ok) recusar(plano.motivo, plano);
        const [resultado] = await conn.query<ResultSetHeader>(
          `UPDATE perfis_acesso SET nome = ?, descricao = ? WHERE id = ? AND titularUserId = ? AND situacao = 'ativo'`,
          [plano.plano.perfil.nome, plano.plano.perfil.descricao, perfilId, perfil.titularUserId],
        );
        if (resultado.affectedRows !== 1) recusar("conflito");
        await conn.query("DELETE FROM perfil_permissoes WHERE perfilId = ?", [perfilId]);
        for (const permissao of plano.plano.perfil.permissoes) {
          await conn.query("INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (?, ?)", [perfilId, permissao]);
        }
        await finalizar(conn, ctx.identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async inativarPerfil(executorId: number, perfilId: number, ganchos?: GanchosPersistencia): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        await bloquearEscopo(conn, [executorId], { perfilId });
        if (ganchos?.depoisDoBloqueio) await ganchos.depoisDoBloqueio();
        const ctx = await carregarContexto(conn, executorId);
        const perfil = await carregarPerfil(conn, perfilId);
        if (ganchos?.antesDaGravacao) await ganchos.antesDaGravacao();
        const plano = planejarInativacaoPerfil(ctx, perfil);
        if (!plano.ok) recusar(plano.motivo, plano);
        const [resultado] = await conn.query<ResultSetHeader>(
          "UPDATE perfis_acesso SET situacao = 'inativo' WHERE id = ? AND titularUserId = ? AND situacao = 'ativo'",
          [perfilId, perfil.titularUserId],
        );
        if (resultado.affectedRows !== 1) recusar("conflito");
        await finalizar(conn, ctx.identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async aplicarPerfil(executorId: number, alvoId: number, perfilId: number, ganchos?: GanchosPersistencia): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos, { perfilId });
        const perfil = await carregarPerfil(conn, perfilId);
        const linhas = await carregarPermissoes(conn, alvoId);
        const plano = planejarAplicacaoPerfil(ctx, usuario, linhas, perfil);
        if (!plano.ok) recusar(plano.motivo, plano);
        await inserirPermissoes(conn, plano.plano.novas);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async concederPermissao(
      executorId: number,
      alvoId: number,
      permissao: string,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const plano = planejarConcessaoPermissao(ctx, usuario, await carregarPermissoes(conn, alvoId), permissao);
        if (!plano.ok) recusar(plano.motivo, plano);
        await inserirPermissoes(conn, plano.plano.novas);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async revogarPermissao(
      executorId: number,
      alvoId: number,
      permissao: string,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const linhas = await carregarPermissoes(conn, alvoId);
        const plano = planejarRevogacaoPermissao(ctx, usuario, linhas, permissao);
        if (!plano.ok) recusar(plano.motivo, plano);
        await apagarPermissoes(conn, alvoId, usuario.titularUserId, [permissao]);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async concederConjunto(
      executorId: number,
      alvoId: number,
      permissoes: readonly string[],
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const plano = planejarConjuntoPermissoes(ctx, usuario, await carregarPermissoes(conn, alvoId), permissoes);
        if (!plano.ok) recusar(plano.motivo, plano);
        await inserirPermissoes(conn, plano.plano.novas);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async sanearPermissao(
      executorId: number,
      alvoId: number,
      permissao: string,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const plano = planejarSaneamentoPermissao(ctx, usuario, await carregarPermissoes(conn, alvoId), permissao);
        if (!plano.ok) recusar(plano.motivo, plano);
        await apagarPermissoes(conn, alvoId, usuario.titularUserId, [permissao]);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async concederFazenda(
      executorId: number,
      alvoId: number,
      fazendaId: number,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const fazendas = await carregarFazendas(conn, usuario.titularUserId, [fazendaId]);
        const plano = planejarConcessaoFazenda(
          ctx,
          usuario,
          fazendas.find((fazenda) => fazenda.id === fazendaId) ?? null,
          await carregarVinculos(conn, alvoId),
        );
        if (!plano.ok) recusar(plano.motivo, plano);
        await inserirFazenda(conn, plano.plano.vinculo.userId, plano.plano.vinculo.fazendaId, plano.plano.vinculo.concedidoPorUserId);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async revogarFazenda(
      executorId: number,
      alvoId: number,
      fazendaId: number,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const fazendas = await carregarFazendas(conn, usuario.titularUserId, [fazendaId]);
        const plano = planejarRevogacaoFazenda(
          ctx,
          usuario,
          fazendas.find((fazenda) => fazenda.id === fazendaId) ?? null,
          await carregarVinculos(conn, alvoId),
        );
        if (!plano.ok) recusar(plano.motivo, plano);
        await apagarFazendas(conn, alvoId, [fazendaId]);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async sanearFazenda(
      executorId: number,
      alvoId: number,
      fazendaId: number,
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const vinculos = await carregarVinculos(conn, alvoId);
        const plano = planejarSaneamentoFazenda(
          ctx,
          usuario,
          fazendaId,
          vinculos,
          await carregarFazendas(conn, usuario.titularUserId, vinculos.map((vinculo) => vinculo.fazendaId)),
        );
        if (!plano.ok) recusar(plano.motivo, plano);
        await apagarFazendas(conn, alvoId, [fazendaId]);
        await finalizar(conn, identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },

    async prepararRevisao(
      executorId: number,
      alvoId: number,
      proposta: { permissoesPropostas: readonly string[]; fazendasPropostas: readonly number[]; confirmado?: boolean | null },
      ganchos?: GanchosPersistencia,
    ): Promise<Ok & { token: string; expiraEmMs: number } | FalhaPersistencia> {
      return emTransacao(async (conn) => {
        const { ctx, usuario, identidade } = await preparar(conn, executorId, alvoId, ganchos);
        const linhas = await carregarPermissoes(conn, alvoId);
        const vinculos = await carregarVinculos(conn, alvoId);
        const fazendasAtuais = vinculos.map((vinculo) => vinculo.fazendaId);
        const revisao = emitirRevisaoReativacao(ctx, {
          usuario,
          permissoesAtuais: linhas,
          fazendasAtuais,
          fazendasConhecidas: await carregarFazendas(conn, usuario.titularUserId, fazendasAtuais),
          permissoesPropostas: proposta.permissoesPropostas,
          fazendasPropostas: proposta.fazendasPropostas,
          confirmado: proposta.confirmado,
        });
        if (!revisao.ok) recusar(revisao.motivo, revisao);
        const token = randomBytes(32).toString("hex");
        const expiraEmMs = agoraDe(ganchos) + (ganchos?.validadeMs ?? VALIDADE_REVISAO_MS);
        const estado: EstadoGuardado = estadoVivo(usuario, linhas, fazendasAtuais);
        const guardada: PropostaGuardada = {
          permissoesPropostas: revisao.revisao.estado.permissoesPropostas,
          fazendasPropostas: revisao.revisao.estado.fazendasPropostas,
        };
        await conn.query(
          `INSERT INTO revisoes_reativacao
            (token, executorUserId, titularUserId, alvoUserId, estadoJson, propostaJson, expiraEmMs)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [token, executorId, identidade.titularUserId, alvoId, JSON.stringify(estado), JSON.stringify(guardada), expiraEmMs],
        );
        await gravarAuditoria(conn, identidade, {
          modulo: "usuarios",
          operacao: "usuario.revisar",
          registroTipo: "revisoes_reativacao",
          registroId: alvoId,
          dadosPosteriores: { alvoUserId: alvoId, expiraEmMs },
        }, ganchos);
        return { ok: true as const, token, expiraEmMs };
      });
    },

    async confirmarReativacao(
      executorId: number,
      entrada: { token?: string | null; confirmado?: boolean | null },
      ganchos?: GanchosPersistencia,
    ): Promise<Ok | FalhaPersistencia> {
      if (!entrada.token) return { ok: false, motivo: "revisao_ausente" };
      return emTransacao(async (conn) => {
        const [previas] = await conn.query<RowDataPacket[]>(
          "SELECT id, alvoUserId FROM revisoes_reativacao WHERE token = ?",
          [entrada.token],
        );
        const previa = previas[0];
        if (!previa) recusar("revisao_nao_autenticada");
        const revisaoId = Number(previa.id);
        const alvoId = Number(previa.alvoUserId);
        await bloquearEscopo(conn, [executorId, alvoId], { revisaoId });
        if (ganchos?.depoisDoBloqueio) await ganchos.depoisDoBloqueio();
        const [linhas] = await conn.query<RowDataPacket[]>(
          `SELECT executorUserId, titularUserId, alvoUserId, estadoJson, propostaJson, expiraEmMs, consumidaEmMs
           FROM revisoes_reativacao WHERE id = ?`,
          [revisaoId],
        );
        const revisao = linhas[0];
        if (!revisao) recusar("revisao_nao_autenticada");
        if (Number(revisao.executorUserId) !== executorId) recusar("revisao_outro_executor");
        if (revisao.consumidaEmMs != null) recusar("revisao_ja_utilizada");
        if (Number(revisao.expiraEmMs) <= agoraDe(ganchos)) recusar("revisao_expirada");
        const ctx = await carregarContexto(conn, executorId);
        const usuario = await carregarUsuario(conn, alvoId);
        const permissoesAtuais = await carregarPermissoes(conn, alvoId);
        const vinculos = await carregarVinculos(conn, alvoId);
        const fazendasAtuais = vinculos.map((vinculo) => vinculo.fazendaId);
        const salvo = JSON.parse(String(revisao.estadoJson)) as EstadoGuardado;
        const vivo = estadoVivo(usuario, permissoesAtuais, fazendasAtuais);
        if (!mesmoEstado(salvo, vivo)) recusar("revisao_desatualizada");
        const proposta = JSON.parse(String(revisao.propostaJson)) as PropostaGuardada;
        const fazendasConhecidas = await carregarFazendas(conn, usuario.titularUserId, fazendasAtuais);
        const selo = seloDaRevisao({
          executorUserId: executorId,
          userId: usuario.id,
          titularUserId: usuario.titularUserId,
          papel: usuario.papel,
          situacao: usuario.situacao,
          sessionVersion: usuario.sessionVersion,
          permissoesAtuais: vivo.permissoes,
          fazendasAtuais: vivo.fazendas,
          permissoesPropostas: proposta.permissoesPropostas,
          fazendasPropostas: proposta.fazendasPropostas,
        });
        if (ganchos?.antesDaGravacao) await ganchos.antesDaGravacao();
        const plano = planejarReativacao(ctx, {
          usuario,
          permissoesAtuais,
          fazendasAtuais,
          fazendasConhecidas,
          permissoesPropostas: proposta.permissoesPropostas,
          fazendasPropostas: proposta.fazendasPropostas,
          selo,
          executorDaRevisao: executorId,
        });
        if (!plano.ok) recusar(plano.motivo, plano);
        await inserirPermissoes(conn, plano.plano.concederPermissoes.map((permissao) => ({
          userId: usuario.id,
          titularUserId: usuario.titularUserId,
          permissao,
          concedidoPorUserId: executorId,
          origemPerfilId: null,
        })));
        await apagarPermissoes(conn, usuario.id, usuario.titularUserId, [
          ...plano.plano.revogarPermissoes,
          ...plano.plano.sanearPermissoes,
        ]);
        for (const fazendaId of plano.plano.concederFazendas) {
          await inserirFazenda(conn, usuario.id, fazendaId, executorId);
        }
        await apagarFazendas(conn, usuario.id, [...plano.plano.revogarFazendas, ...plano.plano.sanearFazendas]);
        const [reativado] = await conn.query<ResultSetHeader>(
          `UPDATE users SET situacao = 'ativo'
           WHERE id = ? AND sessionVersion = ? AND situacao = 'inativo' AND titularUserId = ?`,
          [usuario.id, usuario.sessionVersion, usuario.titularUserId],
        );
        if (reativado.affectedRows !== 1) recusar("conflito");
        const [consumo] = await conn.query<ResultSetHeader>(
          "UPDATE revisoes_reativacao SET consumidaEmMs = ? WHERE id = ? AND consumidaEmMs IS NULL",
          [agoraDe(ganchos), revisaoId],
        );
        if (consumo.affectedRows !== 1) recusar("revisao_ja_utilizada");
        await finalizar(conn, ctx.identidade, plano.plano.sessao, plano.plano.auditoria.entrada, ganchos);
        return { ok: true as const };
      });
    },
  };
}
