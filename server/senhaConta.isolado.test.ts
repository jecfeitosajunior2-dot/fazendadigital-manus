import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarAdministracaoDb } from "./administracaoDb";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { senhaConfereComHash } from "./_core/loginSenha";
import { criarSenhaContaDb } from "./senhaContaDb";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(here, "..");
const CONTAINER = "fd-h4cl-senha";
const PORTA = 3319;
const SENHA_BANCO = "h4cl-3319";
const BANCO = "fd_h4cl";
const ATUAL = "atual-isolada-h4cl";
const NOVA = "nova-isolada-h4cl";
const RECUP = "recup-isolada-h4cl";
const RECUP2 = "recup2-isolada-h4cl";
const alvo = { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1",
    port: PORTA,
    user: "root",
    password: SENHA_BANCO,
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

describe.sequential("senha da conta em MySQL isolado", () => {
  let pool: mysql.Pool;
  let hashAtual = "";
  let servico: ReturnType<typeof criarSenhaContaDb>;

  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    hashAtual = await bcrypt.hash(ATUAL, 10);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA_BANCO}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
    );
    await esperarMysql();
    const conn = await conectar(BANCO);
    await conn.query(readFileSync(resolve(here, "administracao.isolado.sql"), "utf8"));
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1",
      port: PORTA,
      user: "root",
      password: SENHA_BANCO,
      database: BANCO,
      connectionLimit: 4,
    });
    servico = criarSenhaContaDb(pool, alvo);
  }, 120_000);

  beforeEach(async () => {
    await pool.query("DELETE FROM auditoria_eventos");
    await pool.query("DELETE FROM users");
    await pool.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Pessoa 1', 'pessoa-1@teste.isolado', 'admin', 'principal', 1, 'ativo', 3, ?),
       (2, 'ficticio-openid-2', 'Pessoa 2', 'pessoa-2@teste.isolado', 'user', 'comum', 1, 'ativo', 0, ?),
       (9, 'ficticio-openid-9', 'Pessoa 9', 'pessoa-9@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, ?)`,
      [hashAtual, hashAtual, hashAtual],
    );
  });

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function hashDe(id: number): Promise<string | null> {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT passwordHash FROM users WHERE id = ?", [id]);
    return linhas[0]?.passwordHash == null ? null : String(linhas[0].passwordHash);
  }

  async function versaoDe(id: number): Promise<number> {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT sessionVersion FROM users WHERE id = ?", [id]);
    return Number(linhas[0]?.sessionVersion ?? -1);
  }

  async function identidade(id: number): Promise<IdentidadeUsuario> {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ?",
      [id],
    );
    const linha = linhas[0];
    return {
      id: Number(linha.id),
      openId: String(linha.openId),
      name: String(linha.name),
      email: String(linha.email),
      role: linha.role,
      papel: linha.papel,
      titularUserId: Number(linha.titularUserId),
      situacao: linha.situacao,
      sessionVersion: Number(linha.sessionVersion),
    };
  }

  it("a senha atual correta altera o hash", async () => {
    expect(await servico.alterarMinhaSenha(1, 3, ATUAL, NOVA, NOVA)).toEqual({ ok: true });
    expect(await senhaConfereComHash(await hashDe(1), NOVA)).toBe(true);
  });

  it("a senha atual incorreta não altera o banco", async () => {
    const antes = await hashDe(1);
    expect(await servico.alterarMinhaSenha(1, 3, "errada-isolada-h4cl", NOVA, NOVA)).toMatchObject({
      ok: false,
      motivo: "senha_atual_incorreta",
    });
    expect(await hashDe(1)).toBe(antes);
    expect(await versaoDe(1)).toBe(3);
  });

  it("senha fora da política não altera o banco", async () => {
    expect(await servico.alterarMinhaSenha(1, 3, ATUAL, "curta", "curta")).toMatchObject({
      ok: false,
      motivo: "senha_invalida",
    });
    expect(await versaoDe(1)).toBe(3);
  });

  it("confirmação diferente não altera o banco", async () => {
    expect(await servico.alterarMinhaSenha(1, 3, ATUAL, NOVA, "outra-isolada-h4cl")).toMatchObject({
      ok: false,
      motivo: "confirmacao_diferente",
    });
    expect(await versaoDe(1)).toBe(3);
  });

  it("não aceita repetir a senha atual", async () => {
    expect(await servico.alterarMinhaSenha(1, 3, ATUAL, ATUAL, ATUAL)).toMatchObject({
      ok: false,
      motivo: "senha_reutilizada",
    });
    expect(await versaoDe(1)).toBe(3);
  });

  it("usuário de outro titular não altera a conta alheia", async () => {
    const antes = await hashDe(1);
    expect(await servico.alterarMinhaSenha(9, 0, ATUAL, NOVA, NOVA)).toEqual({ ok: true });
    expect(await hashDe(1)).toBe(antes);
    expect(await versaoDe(1)).toBe(3);
    expect(await senhaConfereComHash(await hashDe(9), NOVA)).toBe(true);
  });

  it("sessão inválida não altera o banco", async () => {
    expect(await servico.alterarMinhaSenha(1, 0, ATUAL, NOVA, NOVA)).toMatchObject({
      ok: false,
      motivo: "sessao_invalida",
    });
    expect(await versaoDe(1)).toBe(3);
    expect(await senhaConfereComHash(await hashDe(1), ATUAL)).toBe(true);
  });

  it("a senha antiga deixa de autenticar e a nova autentica", async () => {
    expect(await servico.alterarMinhaSenha(1, 3, ATUAL, NOVA, NOVA)).toEqual({ ok: true });
    expect(await senhaConfereComHash(await hashDe(1), ATUAL)).toBe(false);
    expect(await senhaConfereComHash(await hashDe(1), NOVA)).toBe(true);
  });

  it("a sessão anterior perde a validade", async () => {
    expect(await servico.alterarMinhaSenha(1, 3, ATUAL, NOVA, NOVA)).toEqual({ ok: true });
    const registro = await identidade(1);
    expect(decidirSessao({ id: 1, sessionVersion: 3 }, registro, false)).toBeNull();
    expect(decidirSessao({ id: 1, sessionVersion: registro.sessionVersion }, registro, false)?.id).toBe(1);
  });

  it("funcionário comum não redefine a senha do titular", async () => {
    const admin = criarAdministracaoDb(pool, alvo);
    expect(await admin.definirSenhaAcesso(2, 1, NOVA)).toMatchObject({ ok: false, motivo: "alvo_protegido" });
    expect(await senhaConfereComHash(await hashDe(1), ATUAL)).toBe(true);
    const roteador = readFileSync(resolve(here, "acessoContaRouter.ts"), "utf8");
    expect(roteador).not.toContain("recuperarAcesso");
  });

  it("a recuperação administrativa troca a credencial e invalida a sessão", async () => {
    const resultado = await servico.recuperarAcesso({
      email: "pessoa-1@teste.isolado",
      senha: RECUP,
      acessoAdministrativo: true,
      confirmouProcedimento: true,
      titularAutorizou: true,
    });
    expect(resultado).toMatchObject({ ok: true, id: 1 });
    expect(await senhaConfereComHash(await hashDe(1), ATUAL)).toBe(false);
    expect(await senhaConfereComHash(await hashDe(1), RECUP)).toBe(true);
    const registro = await identidade(1);
    expect(decidirSessao({ id: 1, sessionVersion: 3 }, registro, false)).toBeNull();
    expect(await servico.precisaTrocar(1)).toBe(true);
  });

  it("a segunda recuperação não reativa a sessão antiga", async () => {
    expect((await servico.recuperarAcesso({
      email: "pessoa-1@teste.isolado",
      senha: RECUP,
      acessoAdministrativo: true,
      confirmouProcedimento: true,
      titularAutorizou: true,
    })).ok).toBe(true);
    const meio = await versaoDe(1);
    expect((await servico.recuperarAcesso({
      email: "pessoa-1@teste.isolado",
      senha: RECUP2,
      acessoAdministrativo: true,
      confirmouProcedimento: true,
      titularAutorizou: true,
    })).ok).toBe(true);
    const registro = await identidade(1);
    expect(registro.sessionVersion).toBeGreaterThan(meio);
    expect(decidirSessao({ id: 1, sessionVersion: 3 }, registro, false)).toBeNull();
    expect(decidirSessao({ id: 1, sessionVersion: meio }, registro, false)).toBeNull();
    expect(await senhaConfereComHash(await hashDe(1), RECUP)).toBe(false);
    expect(await senhaConfereComHash(await hashDe(1), RECUP2)).toBe(true);
  });

  it("operação recusada não altera o banco", async () => {
    const antes = await hashDe(1);
    expect(await servico.recuperarAcesso({
      email: "pessoa-1@teste.isolado",
      senha: RECUP,
      acessoAdministrativo: false,
      confirmouProcedimento: false,
      titularAutorizou: false,
    })).toMatchObject({ ok: false, motivo: "autorizacao_ausente" });
    expect(await hashDe(1)).toBe(antes);
    expect(await versaoDe(1)).toBe(3);
    const [eventos] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM auditoria_eventos");
    expect(Number(eventos[0]?.total)).toBe(0);
  });

  it("a auditoria não contém a credencial", async () => {
    expect((await servico.recuperarAcesso({
      email: "pessoa-1@teste.isolado",
      senha: RECUP,
      acessoAdministrativo: true,
      confirmouProcedimento: true,
      titularAutorizou: true,
    })).ok).toBe(true);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT operacao, dadosPosteriores FROM auditoria_eventos",
    );
    const texto = JSON.stringify(linhas);
    expect(texto).not.toContain(RECUP);
    expect(texto).not.toContain(ATUAL);
    expect(String(linhas[0]?.operacao)).toBe("acesso.recuperar");
  });

  it("o comando local atualiza sem escrever a senha na saída", async () => {
    const resultado = await exec(process.execPath, [
      resolve(raiz, "node_modules/tsx/dist/cli.mjs"),
      resolve(raiz, "scripts/recuperar-acesso.ts"),
      "--confirmo-recuperacao",
    ], {
      cwd: raiz,
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: `mysql://root:${SENHA_BANCO}@127.0.0.1:${PORTA}/${BANCO}`,
        FD_RECUPERAR_ACESSO: "1",
        FD_RECUPERAR_AUTORIZACAO_TITULAR: "1",
        FD_RECUPERAR_EMAIL: "pessoa-1@teste.isolado",
        FD_RECUPERAR_SENHA: RECUP,
      },
    });
    const saida = `${resultado.stdout}\n${resultado.stderr}`;
    expect(saida).toContain("Credencial atualizada");
    expect(saida).not.toContain(RECUP);
    expect(saida).not.toContain(SENHA_BANCO);
    expect(await senhaConfereComHash(await hashDe(1), RECUP)).toBe(true);
    expect(await versaoDe(1)).toBe(4);
  });

  it("a gravação cabe no privilégio de atualizar usuário e auditoria", async () => {
    const conta = "fd_h4cl_app";
    const segredo = "app-h4cl-3319";
    await pool.query(`CREATE USER '${conta}'@'%' IDENTIFIED BY '${segredo}'`);
    await pool.query(`GRANT SELECT, UPDATE ON ${BANCO}.users TO '${conta}'@'%'`);
    await pool.query(`GRANT SELECT, INSERT ON ${BANCO}.auditoria_eventos TO '${conta}'@'%'`);
    const estreito = mysql.createPool({
      host: "127.0.0.1",
      port: PORTA,
      user: conta,
      password: segredo,
      database: BANCO,
      connectionLimit: 2,
    });
    try {
      const limitado = criarSenhaContaDb(estreito, alvo);
      expect(await limitado.alterarMinhaSenha(2, 0, ATUAL, NOVA, NOVA)).toEqual({ ok: true });
      expect(await senhaConfereComHash(await hashDe(2), NOVA)).toBe(true);
      expect(await senhaConfereComHash(await hashDe(1), ATUAL)).toBe(true);
    } finally {
      await estreito.end().catch(() => undefined);
    }
  });
});
