import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarAdministracaoDb } from "./administracaoDb";
import { seloDaRevisao } from "./administracao";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-admin-784c";
const PORTA = 3318;
const SENHA = "isolado-784c";
const BANCO = "fd_784c";
const alvo = { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1",
    port: PORTA,
    user: "root",
    password: SENHA,
    database: banco,
    multipleStatements: true,
  });
}

async function esperarMysql() {
  const prazo = Date.now() + 90_000;
  let ultimo = "";
  while (Date.now() < prazo) {
    try {
      const conn = await conectar();
      await conn.query("SELECT 1 AS ok");
      await conn.end();
      return;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
      await new Promise((resolver) => setTimeout(resolver, 1500));
    }
  }
  throw new Error(`MySQL isolado não respondeu. ${ultimo}`);
}

describe.sequential("persistência administrativa em MySQL isolado", () => {
  let pool: mysql.Pool;
  let svc: ReturnType<typeof criarAdministracaoDb>;

  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    expect(() => criarAdministracaoDb({} as mysql.Pool, { ...alvo, database: "fazenda_digital" })).toThrow(/operacional/);
    expect(() => criarAdministracaoDb({} as mysql.Pool, { ...alvo, port: 3306 })).toThrow(/porta/);
    expect(() => criarAdministracaoDb({} as mysql.Pool, { ...alvo, container: "fazenda-digital-mysql" })).toThrow(/instância/);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
    );
    await esperarMysql();
    const conn = await conectar(BANCO);
    const [banco] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    expect(banco[0]?.nome).toBe(BANCO);
    await conn.query(readFileSync(resolve(here, "administracao.isolado.sql"), "utf8"));
    await conn.end();
    pool = mysql.createPool({
      host: alvo.host,
      port: alvo.port,
      database: alvo.database,
      user: "root",
      password: SENHA,
      connectionLimit: 8,
    });
    svc = criarAdministracaoDb(pool, alvo);
  }, 120_000);

  beforeEach(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.query("DELETE FROM auditoria_eventos");
      await conn.query("DELETE FROM revisoes_reativacao");
      await conn.query("DELETE FROM usuario_permissoes");
      await conn.query("DELETE FROM usuario_fazendas");
      await conn.query("DELETE FROM perfil_permissoes");
      await conn.query("DELETE FROM perfis_acesso");
      await conn.query("DELETE FROM users");
      await conn.query("DELETE FROM fazendas");
      await conn.query(
        `INSERT INTO fazendas (id, userId, nome) VALUES
         (10, 1, 'Pasto Norte'), (20, 1, 'Pasto Sul'), (30, 9, 'Pasto Alheio')`,
      );
      await conn.query(
        `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
         (1, 'ficticio-openid-1', 'Pessoa 1', 'pessoa-1@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, NULL),
         (2, 'ficticio-openid-2', 'Pessoa 2', 'pessoa-2@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
         (3, 'ficticio-openid-3', 'Pessoa 3', 'pessoa-3@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, NULL),
         (4, 'ficticio-openid-4', 'Pessoa 4', 'pessoa-4@teste.isolado', 'user', 'comum', 1, 'ativo', 0, NULL),
         (9, 'ficticio-openid-9', 'Pessoa 9', 'pessoa-9@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, NULL)`,
      );
      await conn.query(
        `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
         (3, 1, 'usuarios.criar', 1),
         (3, 1, 'usuarios.inativar', 1),
         (3, 1, 'usuarios.gerenciar_permissoes', 1),
         (3, 1, 'usuarios.gerenciar_acessos', 1),
         (3, 1, 'animais.visualizar', 1)`,
      );
      await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (3, 10, 1)");
    } finally {
      conn.release();
    }
  });

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function valor<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [linhas] = await pool.query<RowDataPacket[]>(sql, params);
    return linhas[0] as T;
  }

  async function versao(id: number): Promise<number> {
    const linha = await valor<{ sessionVersion: number }>("SELECT sessionVersion FROM users WHERE id = ?", [id]);
    return Number(linha.sessionVersion);
  }

  async function eventos(operacao?: string): Promise<number> {
    const linha = operacao
      ? await valor<{ total: number }>("SELECT COUNT(*) AS total FROM auditoria_eventos WHERE operacao = ?", [operacao])
      : await valor<{ total: number }>("SELECT COUNT(*) AS total FROM auditoria_eventos");
    return Number(linha.total);
  }

  async function temPermissao(userId: number, permissao: string): Promise<boolean> {
    const linha = await valor<{ total: number }>(
      "SELECT COUNT(*) AS total FROM usuario_permissoes WHERE userId = ? AND permissao = ?",
      [userId, permissao],
    );
    return Number(linha.total) > 0;
  }

  it("o banco conectado é o descartável", async () => {
    const linha = await valor<{ nome: string }>("SELECT DATABASE() AS nome");
    expect(linha.nome).toBe("fd_784c");
    const fonte = readFileSync(resolve(here, "administracaoDb.ts"), "utf8");
    expect(fonte.includes("./db")).toBe(false);
    expect(fonte.includes("DATABASE_URL")).toBe(false);
    expect(fonte.includes("routers")).toBe(false);
    const roteador = readFileSync(resolve(here, "routers.ts"), "utf8");
    expect(roteador.includes("administracaoDb")).toBe(false);
  });

  it("o principal concede e o secundário só dentro do teto", async () => {
    expect(await svc.concederPermissao(1, 4, "pesagens.criar")).toEqual({ ok: true });
    expect(await temPermissao(4, "pesagens.criar")).toBe(true);
    expect(await versao(4)).toBe(1);
    expect(await svc.concederPermissao(3, 4, "animais.visualizar")).toEqual({ ok: true });
    expect(await svc.concederPermissao(3, 4, "animais.editar")).toMatchObject({ ok: false, motivo: "acima_do_teto" });
    expect(await temPermissao(4, "animais.editar")).toBe(false);
  });

  it("recusa secundário sem permissão, comum, outra conta, autoalteração e troca de titular", async () => {
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 3 AND permissao = 'usuarios.gerenciar_permissoes'");
    expect(await svc.concederPermissao(3, 4, "animais.visualizar")).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await svc.concederPermissao(2, 4, "animais.visualizar")).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await svc.concederPermissao(1, 9, "animais.visualizar")).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await svc.concederPermissao(3, 3, "animais.visualizar")).toMatchObject({ ok: false, motivo: "auto_modificacao" });
    const antes = await versao(4);
    expect(await svc.editarUsuario(1, 4, { name: "Pessoa quatro", titularUserId: 9, senha: "segredo-senha" })).toEqual({ ok: true });
    const usuario = await valor<{ name: string; titularUserId: number; sessionVersion: number }>(
      "SELECT name, titularUserId, sessionVersion FROM users WHERE id = 4",
    );
    expect(usuario.name).toBe("Pessoa quatro");
    expect(usuario.titularUserId).toBe(1);
    expect(usuario.sessionVersion).toBe(antes);
    const texto = JSON.stringify(await pool.query("SELECT dadosAnteriores, dadosPosteriores FROM auditoria_eventos"));
    expect(texto).not.toContain("segredo-senha");
    expect(texto).not.toContain("ficticio-openid");
  });

  it("revoga, aplica perfil, recusa perfil inativo, duplicado e fazenda de outra conta", async () => {
    expect(await svc.concederPermissao(1, 4, "animais.visualizar")).toEqual({ ok: true });
    expect(await svc.revogarPermissao(1, 4, "animais.visualizar")).toEqual({ ok: true });
    expect(await temPermissao(4, "animais.visualizar")).toBe(false);
    const criado = await svc.criarPerfil(1, { nome: "Curral", permissoes: ["animais.visualizar", "pesagens.criar"], titularUserId: 9 });
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    const perfil = await valor<{ titularUserId: number }>("SELECT titularUserId FROM perfis_acesso WHERE id = ?", [criado.id]);
    expect(perfil.titularUserId).toBe(1);
    expect(await svc.aplicarPerfil(1, 4, criado.id)).toEqual({ ok: true });
    expect(await temPermissao(4, "pesagens.criar")).toBe(true);
    expect(await svc.aplicarPerfil(1, 4, criado.id)).toMatchObject({ ok: false, motivo: "concessao_duplicada" });
    expect(await svc.inativarPerfil(1, criado.id)).toEqual({ ok: true });
    expect(await svc.aplicarPerfil(1, 2, criado.id)).toMatchObject({ ok: false, motivo: "perfil_inativo" });
    expect(await svc.concederPermissao(1, 4, "animais.visualizar")).toMatchObject({ ok: false, motivo: "concessao_duplicada" });
    expect(await svc.concederFazenda(1, 4, 30)).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await svc.concederFazenda(3, 4, 20)).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(await svc.concederFazenda(1, 4, 20)).toEqual({ ok: true });
    expect(await svc.revogarFazenda(1, 4, 20)).toEqual({ ok: true });
  });

  it("saneia permissão irregular e vínculo de fazenda sem mudar o dono", async () => {
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (4, 1, 'usuarios.alterar_papel', 1)",
    );
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (4, 30, 1)");
    expect(await svc.sanearPermissao(3, 4, "usuarios.alterar_papel")).toMatchObject({ ok: false, motivo: "reservado_ao_principal" });
    expect(await svc.sanearPermissao(1, 4, "usuarios.alterar_papel")).toEqual({ ok: true });
    expect(await temPermissao(4, "usuarios.alterar_papel")).toBe(false);
    expect(await svc.sanearFazenda(3, 4, 30)).toMatchObject({ ok: false, motivo: "reservado_ao_principal" });
    expect(await svc.sanearFazenda(1, 4, 30)).toEqual({ ok: true });
    const fazenda = await valor<{ userId: number }>("SELECT userId FROM fazendas WHERE id = 30");
    expect(fazenda.userId).toBe(9);
    const vinculo = await valor<{ total: number }>("SELECT COUNT(*) AS total FROM usuario_fazendas WHERE userId = 4 AND fazendaId = 30");
    expect(Number(vinculo.total)).toBe(0);
    expect(await eventos("permissao.sanear")).toBe(1);
    expect(await eventos("fazenda.sanear")).toBe(1);
    expect(await versao(4)).toBe(2);
  });

  it("desfaz a operação inteira se a gravação, a sessão ou a auditoria falhar", async () => {
    await expect(svc.concederPermissao(1, 4, "pesagens.criar", {
      antesDaGravacao: () => { throw new Error("falha-antes"); },
    })).rejects.toThrow(/falha-antes/);
    expect(await temPermissao(4, "pesagens.criar")).toBe(false);
    expect(await versao(4)).toBe(0);
    expect(await eventos()).toBe(0);

    await expect(svc.concederPermissao(1, 4, "pesagens.criar", {
      depoisDaAlteracao: () => { throw new Error("falha-depois"); },
    })).rejects.toThrow(/falha-depois/);
    expect(await temPermissao(4, "pesagens.criar")).toBe(false);
    expect(await versao(4)).toBe(0);
    expect(await eventos()).toBe(0);

    await expect(svc.concederPermissao(1, 4, "pesagens.criar", { falharSessao: true })).rejects.toThrow(/falha-sessao/);
    expect(await temPermissao(4, "pesagens.criar")).toBe(false);
    expect(await versao(4)).toBe(0);
    expect(await eventos()).toBe(0);

    await expect(svc.concederPermissao(1, 4, "pesagens.criar", { falharAuditoria: true })).rejects.toThrow(/falha-auditoria/);
    expect(await temPermissao(4, "pesagens.criar")).toBe(false);
    expect(await versao(4)).toBe(0);
    expect(await eventos()).toBe(0);
  });

  it("recusa reativação sem revisão, com selo calculável, expirada, de outro executor ou já usada", async () => {
    expect(await svc.inativarUsuario(1, 4)).toEqual({ ok: true });
    expect(await svc.confirmarReativacao(1, { confirmado: true })).toMatchObject({ ok: false, motivo: "revisao_ausente" });
    expect(await svc.confirmarReativacao(1, { token: "calculavel-pelo-navegador", confirmado: true })).toMatchObject({
      ok: false,
      motivo: "revisao_nao_autenticada",
    });
    const selo = seloDaRevisao({
      executorUserId: 1,
      userId: 4,
      titularUserId: 1,
      papel: "comum",
      situacao: "inativo",
      sessionVersion: 1,
      permissoesAtuais: [],
      fazendasAtuais: [],
      permissoesPropostas: [],
      fazendasPropostas: [],
    });
    expect(await svc.confirmarReativacao(1, { token: selo })).toMatchObject({ ok: false, motivo: "revisao_nao_autenticada" });

    const expirada = await svc.prepararRevisao(1, 4, { permissoesPropostas: [], fazendasPropostas: [], confirmado: true }, { validadeMs: -1000 });
    expect(expirada.ok).toBe(true);
    if (!expirada.ok) return;
    expect(await svc.confirmarReativacao(1, { token: expirada.token })).toMatchObject({ ok: false, motivo: "revisao_expirada" });

    const deOutro = await svc.prepararRevisao(1, 4, { permissoesPropostas: [], fazendasPropostas: [] });
    expect(deOutro.ok).toBe(true);
    if (!deOutro.ok) return;
    expect(await svc.confirmarReativacao(3, { token: deOutro.token })).toMatchObject({ ok: false, motivo: "revisao_outro_executor" });

    const valida = await svc.prepararRevisao(1, 4, { permissoesPropostas: [], fazendasPropostas: [] });
    expect(valida.ok).toBe(true);
    if (!valida.ok) return;
    expect(await svc.confirmarReativacao(1, { token: valida.token })).toEqual({ ok: true });
    expect(await svc.confirmarReativacao(1, { token: valida.token })).toMatchObject({ ok: false, motivo: "revisao_ja_utilizada" });
    const usuario = await valor<{ situacao: string; sessionVersion: number }>("SELECT situacao, sessionVersion FROM users WHERE id = 4");
    expect(usuario.situacao).toBe("ativo");
    expect(usuario.sessionVersion).toBe(2);
  });

  it("recusa revisão desatualizada e executor que perdeu autoridade", async () => {
    expect(await svc.inativarUsuario(1, 4)).toEqual({ ok: true });
    const revisao = await svc.prepararRevisao(1, 4, { permissoesPropostas: [], fazendasPropostas: [] });
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (4, 1, 'animais.visualizar', 1)",
    );
    expect(await svc.confirmarReativacao(1, { token: revisao.token })).toMatchObject({ ok: false, motivo: "revisao_desatualizada" });
    const parado = await valor<{ situacao: string; consumida: number }>(
      `SELECT u.situacao, (r.consumidaEmMs IS NOT NULL) AS consumida
       FROM users u JOIN revisoes_reativacao r ON r.alvoUserId = u.id WHERE u.id = 4 AND r.token = ?`,
      [revisao.token],
    );
    expect(parado.situacao).toBe("inativo");
    expect(Number(parado.consumida)).toBe(0);

    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 4");
    await pool.query("UPDATE users SET sessionVersion = 1 WHERE id = 4");
    const doSecundario = await svc.prepararRevisao(3, 4, { permissoesPropostas: [], fazendasPropostas: [] });
    expect(doSecundario.ok).toBe(true);
    if (!doSecundario.ok) return;
    expect(await svc.revogarPermissao(1, 3, "usuarios.inativar")).toEqual({ ok: true });
    expect(await svc.confirmarReativacao(3, { token: doSecundario.token })).toMatchObject({ ok: false, motivo: "sem_permissao" });
    const ainda = await valor<{ situacao: string }>("SELECT situacao FROM users WHERE id = 4");
    expect(ainda.situacao).toBe("inativo");
  });

  it("reativa com saneamento e desfaz tudo se a auditoria da confirmação falhar", async () => {
    await pool.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (4, 1, 'usuarios.alterar_papel', 1), (4, 1, 'animais.visualizar', 1)",
    );
    await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (4, 10, 1), (4, 30, 1)");
    expect(await svc.inativarUsuario(1, 4)).toEqual({ ok: true });
    const revisao = await svc.prepararRevisao(1, 4, {
      permissoesPropostas: ["animais.visualizar"],
      fazendasPropostas: [10],
    });
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    expect(await svc.confirmarReativacao(1, { token: revisao.token })).toEqual({ ok: true });
    expect(await temPermissao(4, "usuarios.alterar_papel")).toBe(false);
    expect(await temPermissao(4, "animais.visualizar")).toBe(true);
    const dono = await valor<{ userId: number }>("SELECT userId FROM fazendas WHERE id = 30");
    expect(dono.userId).toBe(9);
    const vinculos = await valor<{ total: number }>("SELECT COUNT(*) AS total FROM usuario_fazendas WHERE userId = 4");
    expect(Number(vinculos.total)).toBe(1);
    expect(await eventos("usuario.reativar")).toBe(1);

    await pool.query("UPDATE users SET situacao = 'inativo', sessionVersion = sessionVersion WHERE id = 4");
    const outra = await svc.prepararRevisao(1, 4, { permissoesPropostas: ["animais.visualizar"], fazendasPropostas: [10] });
    expect(outra.ok).toBe(true);
    if (!outra.ok) return;
    await expect(svc.confirmarReativacao(1, { token: outra.token }, { falharAuditoria: true })).rejects.toThrow(/falha-auditoria/);
    const usuario = await valor<{ situacao: string }>("SELECT situacao FROM users WHERE id = 4");
    expect(usuario.situacao).toBe("inativo");
    expect(await eventos("usuario.reativar")).toBe(1);
    const consumo = await valor<{ consumida: number }>(
      "SELECT (consumidaEmMs IS NOT NULL) AS consumida FROM revisoes_reativacao WHERE token = ?",
      [outra.token],
    );
    expect(Number(consumo.consumida)).toBe(0);
  });

  it("duas concessões da mesma permissão deixam uma linha só", async () => {
    const [primeira, segunda] = await Promise.all([
      svc.concederPermissao(1, 4, "animais.visualizar"),
      svc.concederPermissao(3, 4, "animais.visualizar"),
    ]);
    const resultados = [primeira, segunda];
    expect(resultados.filter((item) => item.ok).length).toBe(1);
    expect(resultados.filter((item) => !item.ok && item.motivo === "concessao_duplicada").length).toBe(1);
    const total = await valor<{ total: number }>(
      "SELECT COUNT(*) AS total FROM usuario_permissoes WHERE userId = 4 AND permissao = 'animais.visualizar'",
    );
    expect(Number(total.total)).toBe(1);
    expect(await versao(4)).toBe(1);
    expect(await eventos("permissao.conceder")).toBe(1);
  });

  it("concessão e revogação concorrentes não gravam estado pela metade", async () => {
    expect(await svc.concederPermissao(1, 4, "animais.visualizar")).toEqual({ ok: true });
    const [revogacao, concessao] = await Promise.all([
      svc.revogarPermissao(1, 4, "animais.visualizar"),
      svc.concederPermissao(3, 4, "animais.visualizar"),
    ]);
    const sucessos = [revogacao, concessao].filter((item) => item.ok).length;
    expect(sucessos).toBeGreaterThanOrEqual(1);
    const total = await valor<{ total: number }>(
      "SELECT COUNT(*) AS total FROM usuario_permissoes WHERE userId = 4 AND permissao = 'animais.visualizar'",
    );
    const quantidade = Number(total.total);
    expect([0, 1]).toContain(quantidade);
    expect(await versao(4)).toBe(1 + sucessos);
    expect(await eventos()).toBe(1 + sucessos);
  });

  it("a inativação em andamento faz a concessão seguinte ver o usuário inativo", async () => {
    let travado = false;
    let liberar: () => void = () => undefined;
    const porta = new Promise<void>((resolver) => { liberar = resolver; });
    const inativar = svc.inativarUsuario(1, 4, {
      depoisDoBloqueio: async () => {
        travado = true;
        await porta;
      },
    });
    const inicio = Date.now();
    while (!travado && Date.now() - inicio < 8000) await new Promise((resolver) => setTimeout(resolver, 20));
    expect(travado).toBe(true);
    const conceder = svc.concederPermissao(1, 4, "pesagens.criar");
    await new Promise((resolver) => setTimeout(resolver, 250));
    liberar();
    const [inativado, concessao] = await Promise.all([inativar, conceder]);
    expect(inativado).toEqual({ ok: true });
    expect(concessao).toMatchObject({ ok: false, motivo: "ja_inativo" });
    expect(await versao(4)).toBe(1);
    expect(await temPermissao(4, "pesagens.criar")).toBe(false);
    expect(await eventos("permissao.conceder")).toBe(0);
  });

  it("duas confirmações do mesmo token reativam uma vez só", async () => {
    expect(await svc.inativarUsuario(1, 4)).toEqual({ ok: true });
    const revisao = await svc.prepararRevisao(1, 4, { permissoesPropostas: [], fazendasPropostas: [] });
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    const [primeira, segunda] = await Promise.all([
      svc.confirmarReativacao(1, { token: revisao.token }),
      svc.confirmarReativacao(1, { token: revisao.token }),
    ]);
    const resultados = [primeira, segunda];
    expect(resultados.filter((item) => item.ok).length).toBe(1);
    expect(resultados.filter((item) => !item.ok && item.motivo === "revisao_ja_utilizada").length).toBe(1);
    const usuario = await valor<{ situacao: string; sessionVersion: number }>("SELECT situacao, sessionVersion FROM users WHERE id = 4");
    expect(usuario.situacao).toBe("ativo");
    expect(usuario.sessionVersion).toBe(2);
    expect(await eventos("usuario.reativar")).toBe(1);
  });

  it("criação fictícia não grava senha nem openId na auditoria e não incrementa a sessão do executor", async () => {
    const antes = await versao(1);
    const criado = await svc.criarUsuario(1, {
      name: "Pessoa nova",
      email: "pessoa-nova@teste.isolado",
      papel: "comum",
      senha: "segredo-senha",
      openId: "ficticio-openid-cliente",
      titularUserId: 9,
    });
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    const usuario = await valor<{ passwordHash: string | null; titularUserId: number; papel: string }>(
      "SELECT passwordHash, titularUserId, papel FROM users WHERE id = ?",
      [criado.id],
    );
    expect(usuario.passwordHash).toBeNull();
    expect(usuario.titularUserId).toBe(1);
    expect(usuario.papel).toBe("comum");
    expect(await versao(1)).toBe(antes);
    const texto = JSON.stringify(await pool.query("SELECT dadosAnteriores, dadosPosteriores, executorNome FROM auditoria_eventos"));
    expect(texto).not.toContain("segredo-senha");
    expect(texto).not.toContain("ficticio-openid");
    expect(texto).not.toContain("openId");
  });

  it("altera papel e aplica um conjunto de permissões", async () => {
    expect(await svc.alterarPapel(1, 4, "secundario")).toEqual({ ok: true });
    const papel = await valor<{ papel: string; role: string; sessionVersion: number; titularUserId: number }>(
      "SELECT papel, role, sessionVersion, titularUserId FROM users WHERE id = 4",
    );
    expect(papel.papel).toBe("secundario");
    expect(papel.role).toBe("user");
    expect(papel.titularUserId).toBe(1);
    expect(papel.sessionVersion).toBe(1);
    expect(await svc.concederConjunto(1, 4, ["animais.visualizar", "pesagens.criar"])).toEqual({ ok: true });
    expect(await temPermissao(4, "animais.visualizar")).toBe(true);
    expect(await temPermissao(4, "pesagens.criar")).toBe(true);
    expect(await versao(4)).toBe(2);
    expect(await svc.concederConjunto(1, 4, ["animais.editar", "identidade.inventada"])).toMatchObject({
      ok: false,
      motivo: "permissao_invalida",
    });
    expect(await versao(4)).toBe(2);
  });

  it("editar o modelo do perfil não incrementa sessão de usuário", async () => {
    const criado = await svc.criarPerfil(3, { nome: "Curral", permissoes: ["animais.visualizar"] });
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    expect(await svc.editarPerfil(3, criado.id, { nome: "Curral novo", permissoes: ["animais.visualizar"] })).toEqual({ ok: true });
    expect(await versao(3)).toBe(0);
    expect(await versao(4)).toBe(0);
    expect(await eventos("perfil.editar")).toBe(1);
  });
});
