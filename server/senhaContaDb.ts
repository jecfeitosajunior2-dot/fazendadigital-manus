/**
 * Troca da própria senha e recuperação administrativa.
 * O alvo é sempre o usuário da sessão, ou o e-mail informado ao procedimento local.
 */

import bcrypt from "bcryptjs";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { serializarDados } from "./auditoria";
import { loginPermitido } from "./_core/identidadeSessao";
import { senhaConfereComHash } from "./_core/loginSenha";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";
import { avaliarRecuperacao, avaliarTrocaSenha } from "./senhaConta";

type Falha = { ok: false; motivo: string };
type UsuarioLinha = {
  id: number;
  name: string;
  papel: "principal" | "secundario" | "comum";
  titularUserId: number;
  situacao: string;
  sessionVersion: number;
  passwordHash: string | null;
};

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isInteger(n) ? n : 0;
}

let poolAplicacao: Pool | null = null;

export async function precisaTrocarDaConta(usuarioId: number): Promise<boolean> {
  const { env } = await import("./_core/env");
  const { createMysqlPool } = await import("./_core/mysqlPool");
  if (!env.DATABASE_URL) return false;
  if (!poolAplicacao) poolAplicacao = createMysqlPool(2);
  try {
    return await criarSenhaContaDaAplicacao(poolAplicacao).precisaTrocar(usuarioId);
  } catch {
    return false;
  }
}

export function criarSenhaContaDaAplicacao(pool: Pool) {
  return criarSenhaContaDb(pool, { host: "127.0.0.1", port: 9, database: "aplicacao" }, "aplicacao");
}

export function criarSenhaContaDb(
  pool: Pool,
  alvo: AlvoMysql,
  modo: "descartavel" | "aplicacao" | "operador" = "descartavel",
) {
  if (modo === "descartavel") afirmarBancoDescartavel(alvo);
  if (modo === "operador" && alvo.database.trim().toLowerCase() === "fazenda_digital") {
    throw new Error("Conexão recusada: banco operacional.");
  }

  async function conferir(conn: PoolConnection): Promise<void> {
    const [linhas] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    const nome = String(linhas[0]?.nome ?? "");
    if (modo === "descartavel") {
      afirmarBancoDescartavel(alvo);
      if (nome !== alvo.database) throw new Error("Conexão recusada: banco diferente do alvo.");
      return;
    }
    const normal = nome.toLowerCase();
    if (!normal || normal === "fazenda_digital") throw new Error("Conexão recusada: banco operacional.");
    if (modo === "operador" && nome !== alvo.database) {
      throw new Error("Conexão recusada: banco diferente do alvo.");
    }
  }

  async function emTransacao<T>(trabalho: (conn: PoolConnection) => Promise<T>): Promise<T | Falha> {
    if (modo === "descartavel") afirmarBancoDescartavel(alvo);
    const conn = await pool.getConnection();
    try {
      await conferir(conn);
      await conn.beginTransaction();
      const resultado = await trabalho(conn);
      if (resultado && typeof resultado === "object" && "ok" in resultado && resultado.ok === false) {
        await conn.rollback();
        return resultado;
      }
      await conn.commit();
      return resultado;
    } catch (erro) {
      await conn.rollback().catch(() => undefined);
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (mensagem.startsWith("Conexão recusada")) throw erro;
      return { ok: false, motivo: "conflito" };
    } finally {
      conn.release();
    }
  }

  async function carregar(conn: PoolConnection, id: number): Promise<UsuarioLinha | null> {
    const [linhas] = await conn.query<RowDataPacket[]>(
      `SELECT id, name, papel, titularUserId, situacao, sessionVersion, passwordHash
       FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    const linha = linhas[0];
    if (!linha) return null;
    return {
      id: numero(linha.id),
      name: String(linha.name ?? ""),
      papel: linha.papel,
      titularUserId: numero(linha.titularUserId),
      situacao: String(linha.situacao ?? ""),
      sessionVersion: numero(linha.sessionVersion),
      passwordHash: linha.passwordHash == null ? null : String(linha.passwordHash),
    };
  }

  async function auditar(conn: PoolConnection, usuario: UsuarioLinha, operacao: string): Promise<void> {
    const posteriores = serializarDados({ acessoPreparado: true });
    await conn.query(
      `INSERT INTO auditoria_eventos
        (executorUserId, executorNome, titularUserId, fazendaId, modulo, operacao, registroTipo, registroId, dadosAnteriores, dadosPosteriores)
       VALUES (?, ?, ?, NULL, 'acesso', ?, 'usuario', ?, NULL, ?)`,
      [usuario.id, usuario.name || "Sem nome", usuario.titularUserId, operacao, usuario.id, posteriores],
    );
  }

  async function gravarHash(
    conn: PoolConnection,
    usuario: UsuarioLinha,
    hash: string,
    operacao: string,
  ): Promise<{ ok: true } | Falha> {
    const [resultado] = await conn.query<ResultSetHeader>(
      "UPDATE users SET passwordHash = ?, sessionVersion = sessionVersion + 1 WHERE id = ? AND sessionVersion = ?",
      [hash, usuario.id, usuario.sessionVersion],
    );
    if (resultado.affectedRows !== 1) return { ok: false, motivo: "conflito" };
    await auditar(conn, usuario, operacao);
    return { ok: true };
  }

  return {
    async alterarMinhaSenha(
      usuarioId: number,
      sessionVersion: number,
      senhaAtual: string,
      nova: string,
      confirmacao: string,
    ): Promise<{ ok: true } | Falha> {
      if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isInteger(sessionVersion) || sessionVersion < 0) {
        return { ok: false, motivo: "sessao_invalida" };
      }
      return emTransacao(async (conn) => {
        const usuario = await carregar(conn, usuarioId);
        const sessaoConfere = !!usuario
          && usuario.sessionVersion === sessionVersion
          && loginPermitido(usuario.situacao as "ativo");
        const atualConfere = sessaoConfere
          ? await senhaConfereComHash(usuario?.passwordHash, senhaAtual)
          : false;
        const novaRepeteAtual = atualConfere
          ? await senhaConfereComHash(usuario?.passwordHash, nova)
          : false;
        const plano = avaliarTrocaSenha({
          sessaoConfere,
          atualConfere,
          nova,
          confirmacao,
          novaRepeteAtual,
        });
        if (!plano.ok || !usuario) return plano.ok ? { ok: false, motivo: "sessao_invalida" } : plano;
        const hash = await bcrypt.hash(nova, 10);
        return gravarHash(conn, usuario, hash, "acesso.trocar");
      });
    },

    async recuperarAcesso(entrada: {
      email: string;
      senha: string;
      acessoAdministrativo: boolean;
      confirmouProcedimento: boolean;
      titularAutorizou: boolean;
    }): Promise<{ ok: true; id: number } | Falha> {
      const plano = avaliarRecuperacao({
        banco: alvo.database,
        acessoAdministrativo: entrada.acessoAdministrativo,
        confirmouProcedimento: entrada.confirmouProcedimento,
        titularAutorizou: entrada.titularAutorizou,
        email: entrada.email,
        senhaInformada: entrada.senha.length > 0,
        senhaTamanho: entrada.senha.length,
      });
      if (!plano.ok) return plano;
      if (modo === "aplicacao") return { ok: false, motivo: "procedimento_local" };
      const resultado = await emTransacao(async (conn) => {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE email = ? LIMIT 2",
          [plano.email],
        );
        if (linhas.length !== 1) return { ok: false as const, motivo: "conta_nao_encontrada" };
        const usuario = await carregar(conn, numero(linhas[0]?.id));
        if (!usuario || !loginPermitido(usuario.situacao as "ativo")) {
          return { ok: false as const, motivo: "conta_inativa" };
        }
        const hash = await bcrypt.hash(entrada.senha, 10);
        const gravou = await gravarHash(conn, usuario, hash, "acesso.recuperar");
        if (!gravou.ok) return gravou;
        return { ok: true as const, id: usuario.id };
      });
      return resultado;
    },

    async precisaTrocar(usuarioId: number): Promise<boolean> {
      const conn = await pool.getConnection();
      try {
        await conferir(conn);
        const [linhas] = await conn.query<RowDataPacket[]>(
          `SELECT operacao FROM auditoria_eventos
           WHERE executorUserId = ? AND operacao IN ('acesso.recuperar', 'acesso.trocar')
           ORDER BY id DESC LIMIT 1`,
          [usuarioId],
        );
        return String(linhas[0]?.operacao ?? "") === "acesso.recuperar";
      } catch {
        return false;
      } finally {
        conn.release();
      }
    },
  };
}
