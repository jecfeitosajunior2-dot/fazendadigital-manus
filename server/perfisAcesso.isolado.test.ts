import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, "../drizzle/migrations/0065_perfis_permissoes.sql");
const CONTAINER = "fd-perfis-783";
const PORTA = 3317;
const SENHA = "isolado";
const BANCO = "fd_783";

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
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

async function conectar(banco = BANCO) {
  return mysql.createConnection({
    host: "127.0.0.1",
    port: PORTA,
    user: "root",
    password: SENHA,
    database: banco,
    multipleStatements: true,
  });
}

async function esperarRecusa(banco: string, trecho: string) {
  try {
    await chamar(banco);
    throw new Error("a chamada deveria recusar");
  } catch (erro) {
    const detalhe = erro as { stderr?: string; message?: string };
    const texto = `${detalhe.stderr ?? ""}\n${detalhe.message ?? ""}`;
    if (texto.includes("a chamada deveria recusar")) throw erro;
    expect(texto).toContain(trecho);
  }
}

async function aplicarArquivo(banco: string) {
  await docker("cp", sqlPath, `${CONTAINER}:/tmp/0065.sql`);
  await docker("exec", CONTAINER, "mysql", "-uroot", `-p${SENHA}`, banco, "-e", "source /tmp/0065.sql");
}

async function chamar(banco: string) {
  return docker("exec", CONTAINER, "mysql", "-uroot", `-p${SENHA}`, banco, "-e", "CALL fd_78_perfis_permissoes();");
}

const BASE = `
  CREATE TABLE users (
    id int NOT NULL,
    titularUserId int NOT NULL,
    situacao varchar(20) NOT NULL DEFAULT 'ativo',
    PRIMARY KEY (id)
  ) ENGINE=InnoDB;
  CREATE TABLE fazendas (
    id int NOT NULL,
    userId int NOT NULL,
    nome varchar(200) NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB;
  CREATE TABLE animais (
    id int NOT NULL,
    userId int NOT NULL,
    nome varchar(100) NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB;
  INSERT INTO users (id, titularUserId, situacao) VALUES (1, 1, 'ativo'), (2, 1, 'ativo'), (9, 9, 'ativo');
  INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Fazenda J'), (20, 1, 'Fazenda B');
  INSERT INTO animais (id, userId, nome) VALUES (100, 1, 'Mimosa'), (101, 1, 'Estrela');
`;

describe.sequential("migração 0065 em MySQL isolado", () => {
  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker("run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci");
    await esperarMysql();
    const conn = await conectar();
    const [banco] = await conn.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS nome");
    expect(banco[0]?.nome).toBe(BANCO);
    await conn.query(BASE);
    await conn.end();
    await aplicarArquivo(BANCO);
    const chamada = await chamar(BANCO);
    expect(`${chamada.stdout}`).toContain("aplicar");
  }, 120_000);

  afterAll(async () => {
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  it("cria as três tabelas vazias, sem cascata, e preserva o que já existia", async () => {
    const conn = await conectar();
    const [tabelas] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS nome FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('perfis_acesso','perfil_permissoes','usuario_permissoes')
        ORDER BY TABLE_NAME`,
      [BANCO],
    );
    expect(tabelas.map((linha) => linha.nome)).toEqual(["perfil_permissoes", "perfis_acesso", "usuario_permissoes"]);
    const [regras] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME AS nome, DELETE_RULE AS apaga, UPDATE_RULE AS atualiza
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME IN ('perfis_acesso','perfil_permissoes','usuario_permissoes')`,
      [BANCO],
    );
    expect(regras).toHaveLength(8);
    expect(regras.every((regra) => regra.apaga === "RESTRICT" && regra.atualiza === "RESTRICT")).toBe(true);
    const [unicos] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT INDEX_NAME AS nome FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND NON_UNIQUE = 0
          AND INDEX_NAME IN ('perfis_acesso_titular_nome_uq','perfil_permissoes_perfil_permissao_uq','usuario_permissoes_usuario_permissao_uq')`,
      [BANCO],
    );
    expect(unicos).toHaveLength(3);
    const [animais] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n, GROUP_CONCAT(nome ORDER BY id) AS nomes FROM animais");
    const [fazendas] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n, GROUP_CONCAT(nome ORDER BY id) AS nomes FROM fazendas");
    const [users] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM users");
    expect(animais[0]).toMatchObject({ n: 2, nomes: "Mimosa,Estrela" });
    expect(fazendas[0]).toMatchObject({ n: 2, nomes: "Fazenda J,Fazenda B" });
    expect(users[0]?.n).toBe(3);
    const [vazias] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM perfis_acesso) + (SELECT COUNT(*) FROM perfil_permissoes) + (SELECT COUNT(*) FROM usuario_permissoes) AS n",
    );
    expect(vazias[0]?.n).toBe(0);
    const [indice] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(DISTINCT INDEX_NAME) AS n FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_id_titular_uq'`,
      [BANCO],
    );
    expect(indice[0]?.n).toBe(1);
    const [titulares] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id, titularUserId FROM users WHERE id = 1",
    );
    expect(titulares[0]).toMatchObject({ id: 1, titularUserId: 1 });
    await conn.end();
  });

  it("recusa nome repetido, perfil alheio, duplicata e referência inexistente", async () => {
    const conn = await conectar();
    const [perfil] = await conn.query<mysql.ResultSetHeader>(
      "INSERT INTO perfis_acesso (titularUserId, nome, descricao, situacao, criadoPorUserId) VALUES (1, 'Funcionário de Curral', 'curral', 'ativo', 1)",
    );
    await expect(conn.query(
      "INSERT INTO perfis_acesso (titularUserId, nome, descricao, situacao, criadoPorUserId) VALUES (1, 'funcionario de curral', NULL, 'ativo', 1)",
    )).rejects.toMatchObject({ errno: 1062 });
    await conn.query(
      "INSERT INTO perfis_acesso (titularUserId, nome, descricao, situacao, criadoPorUserId) VALUES (9, 'Funcionário de Curral', NULL, 'ativo', 9)",
    );
    await conn.query("INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (?, 'animais.visualizar')", [perfil.insertId]);
    await conn.query("INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (?, 'pesagens.criar')", [perfil.insertId]);
    await expect(conn.query(
      "INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (?, 'animais.visualizar')",
      [perfil.insertId],
    )).rejects.toMatchObject({ errno: 1062 });
    await expect(conn.query(
      "INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (999, 'animais.visualizar')",
    )).rejects.toMatchObject({ errno: 1452 });
    const [alheio] = await conn.query<mysql.RowDataPacket[]>("SELECT id FROM perfis_acesso WHERE titularUserId = 9");
    await expect(conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (2, 1, 'animais.visualizar', 1, ?)",
      [alheio[0]?.id],
    )).rejects.toMatchObject({ errno: 1452 });
    await expect(conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (2, 1, 'saude.criar', 1, 999)",
    )).rejects.toMatchObject({ errno: 1452 });
    await conn.end();
  });

  it("copia, preserva edição do perfil, concessão avulsa, inativação e recusa cascata", async () => {
    const conn = await conectar();
    const [perfis] = await conn.query<mysql.RowDataPacket[]>("SELECT id FROM perfis_acesso WHERE titularUserId = 1");
    const perfilId = Number(perfis[0]?.id);
    await conn.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId)
       SELECT 2, 1, permissao, 1, perfilId FROM perfil_permissoes WHERE perfilId = ?`,
      [perfilId],
    );
    await conn.query("INSERT INTO perfil_permissoes (perfilId, permissao) VALUES (?, 'vendas.confirmar')", [perfilId]);
    const [efetivas] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT permissao FROM usuario_permissoes WHERE userId = 2 ORDER BY permissao",
    );
    expect(efetivas.map((linha) => linha.permissao)).toEqual(["animais.visualizar", "pesagens.criar"]);
    await conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (2, 1, 'lotes.visualizar', 1, NULL)",
    );
    await expect(conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (2, 1, 'lotes.visualizar', 1, NULL)",
    )).rejects.toMatchObject({ errno: 1062 });
    await conn.query("UPDATE users SET situacao = 'inativo' WHERE id = 2");
    const [depoisUsuario] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM usuario_permissoes WHERE userId = 2");
    expect(depoisUsuario[0]?.n).toBe(3);
    await conn.query("UPDATE perfis_acesso SET situacao = 'inativo' WHERE id = ?", [perfilId]);
    const [depoisPerfil] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM usuario_permissoes WHERE origemPerfilId = ?",
      [perfilId],
    );
    expect(depoisPerfil[0]?.n).toBe(2);
    await expect(conn.query("DELETE FROM users WHERE id = 2")).rejects.toMatchObject({ errno: 1451 });
    await expect(conn.query("DELETE FROM perfis_acesso WHERE id = ?", [perfilId])).rejects.toMatchObject({ errno: 1451 });
    const [animais] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM animais");
    expect(animais[0]?.n).toBe(2);
    await conn.end();
  });

  it("recusa titular diferente e preserva o histórico se a conta mudar", async () => {
    const conn = await conectar();
    await expect(conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (2, 9, 'brincos.visualizar', 1, NULL)",
    )).rejects.toMatchObject({ errno: 1452 });
    await conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (1, 1, 'fazendas.visualizar', 1, NULL)",
    );
    await expect(conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (1, 9, 'pastos.visualizar', 1, NULL)",
    )).rejects.toMatchObject({ errno: 1452 });
    const [antes] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM usuario_permissoes WHERE userId = 2 AND titularUserId = 1",
    );
    await expect(conn.query("UPDATE users SET titularUserId = 9 WHERE id = 2")).rejects.toMatchObject({ errno: 1451 });
    const [usuario] = await conn.query<mysql.RowDataPacket[]>("SELECT titularUserId FROM users WHERE id = 2");
    const [depois] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM usuario_permissoes WHERE userId = 2 AND titularUserId = 1",
    );
    expect(usuario[0]?.titularUserId).toBe(1);
    expect(depois[0]?.n).toBe(antes[0]?.n);
    await conn.query("INSERT INTO users (id, titularUserId, situacao) VALUES (8, 1, 'ativo')");
    await conn.query("UPDATE users SET titularUserId = 9 WHERE id = 8");
    await expect(conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (8, 1, 'animais.visualizar', 9, NULL)",
    )).rejects.toMatchObject({ errno: 1452 });
    await conn.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (8, 9, 'animais.visualizar', 9, NULL)",
    );
    const [animais] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM animais");
    expect(animais[0]?.n).toBe(2);
    await conn.end();
  });

  it("a segunda chamada não altera nada", async () => {
    const conn = await conectar();
    const [antes] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM perfis_acesso) AS perfis, (SELECT COUNT(*) FROM perfil_permissoes) AS itens, (SELECT COUNT(*) FROM usuario_permissoes) AS efetivas",
    );
    await esperarRecusa(BANCO, "ja existem");
    const [depois] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM perfis_acesso) AS perfis, (SELECT COUNT(*) FROM perfil_permissoes) AS itens, (SELECT COUNT(*) FROM usuario_permissoes) AS efetivas",
    );
    expect(depois[0]).toEqual(antes[0]);
    await conn.end();
  });

  it("identifica migração pela metade e não completa sozinha", async () => {
    const conn = await conectar();
    await conn.query("CREATE DATABASE fd_783_parcial");
    await conn.query(`
      CREATE TABLE fd_783_parcial.users (
        id int NOT NULL,
        titularUserId int NOT NULL,
        situacao varchar(20) NOT NULL,
        PRIMARY KEY (id)
      )
    `);
    await conn.end();
    await aplicarArquivo("fd_783_parcial");
    const parcial = await conectar("fd_783_parcial");
    await parcial.query(`
      CREATE TABLE perfis_acesso (
        id int NOT NULL,
        titularUserId int NOT NULL,
        nome varchar(80) NOT NULL,
        PRIMARY KEY (id)
      )
    `);
    await parcial.end();
    await esperarRecusa("fd_783_parcial", "so perfis_acesso");
    const conferencia = await conectar("fd_783_parcial");
    const [tabelas] = await conferencia.query<mysql.RowDataPacket[]>("SHOW TABLES");
    const nomes = tabelas.map((linha) => Object.values(linha)[0]);
    expect(nomes).toContain("perfis_acesso");
    expect(nomes).not.toContain("perfil_permissoes");
    expect(nomes).not.toContain("usuario_permissoes");
    await conferencia.end();

    const indice = await conectar();
    await indice.query("CREATE DATABASE fd_783_indice");
    await indice.query(`
      CREATE TABLE fd_783_indice.users (
        id int NOT NULL,
        titularUserId int NULL,
        PRIMARY KEY (id),
        UNIQUE KEY users_id_titular_uq (id, titularUserId)
      )
    `);
    await indice.end();
    await aplicarArquivo("fd_783_indice");
    await esperarRecusa("fd_783_indice", "so indice de titular");
    const soIndice = await conectar("fd_783_indice");
    const [tabelasIndice] = await soIndice.query<mysql.RowDataPacket[]>("SHOW TABLES");
    const nomesIndice = tabelasIndice.map((linha) => Object.values(linha)[0]);
    expect(nomesIndice).not.toContain("perfis_acesso");
    expect(nomesIndice).not.toContain("usuario_permissoes");
    await soIndice.end();
  });

  it("duas concessões iguais ao mesmo tempo deixam uma só linha", async () => {
    const a = await conectar();
    const b = await conectar();
    const sqlInclusao = "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES (1, 1, 'maquinas.visualizar', 1, NULL)";
    const resultados = await Promise.allSettled([a.query(sqlInclusao), b.query(sqlInclusao)]);
    const falhas = resultados.filter((resultado) => resultado.status === "rejected");
    expect(resultados.some((resultado) => resultado.status === "fulfilled")).toBe(true);
    expect(falhas).toHaveLength(1);
    expect(String((falhas[0] as PromiseRejectedResult).reason)).toMatch(/Duplicate|ER_DUP_ENTRY/);
    const [linhas] = await a.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM usuario_permissoes WHERE userId = 1 AND permissao = 'maquinas.visualizar'",
    );
    expect(linhas[0]?.n).toBe(1);
    await a.end();
    await b.end();
  });
});

describe("arquivo da migração permanece o da pasta", () => {
  it("o teste isolado usa o arquivo 0065, sem texto de execução solta", () => {
    const texto = readFileSync(sqlPath, "utf8");
    expect(texto).toContain("CREATE TABLE `usuario_permissoes`");
    expect(texto).not.toMatch(/^\s*CALL\s+fd_78_perfis_permissoes/m);
  });
});
