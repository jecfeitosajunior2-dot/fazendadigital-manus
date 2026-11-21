import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cadastrarAnimalAutorizado, type ConsultaCadastroAnimal, type IoCadastroAnimal } from "./cadastroAnimalAutorizado";
import { inserirAnimalImportadoNaTransacao, type TransacaoImportacaoAnimal } from "./importacaoAnimalAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-h4ar-brinco";
const PORTA = 3362;
const SENHA = "isolado-h4ar";
const BANCO = "fd_h4ar";
const MIGRACAO = readFileSync(resolve(here, "../drizzle/propostas/0071_animais_brinco_ativo_fazenda_uq.sql"), "utf8");
const PROPOSTA_0070 = readFileSync(resolve(here, "../drizzle/propostas/0070_animais_brinco_ativo_uq.sql"), "utf8");

const TABELA = `
CREATE TABLE animais (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId int NOT NULL,
  fazendaId int NULL,
  loteId int NULL,
  pastoId int NULL,
  brinco varchar(50) NULL,
  brincoEletronico varchar(80) NULL,
  sexo varchar(20) NULL,
  status varchar(20) NOT NULL DEFAULT 'ativo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE lotes (
  id int NOT NULL PRIMARY KEY,
  userId int NOT NULL,
  fazendaId int NULL,
  ativo tinyint NOT NULL
) ENGINE=InnoDB;
CREATE TABLE historico_lotes (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  animalId int NOT NULL,
  userId int NOT NULL
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  animalId int NOT NULL
) ENGINE=InnoDB;
CREATE TABLE partos (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId int NOT NULL,
  matrizId int NOT NULL
) ENGINE=InnoDB;
CREATE TABLE parto_crias (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partoId int NOT NULL,
  animalId int NOT NULL
) ENGINE=InnoDB;
`;

function alvo(database = BANCO) {
  return { host: "127.0.0.1", port: PORTA, database, container: CONTAINER };
}
async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}
async function conectar(database?: string) {
  afirmarBancoDescartavel(alvo(database ?? BANCO));
  return mysql.createConnection({
    host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database,
    multipleStatements: true,
  });
}
function mysqlCli(sql: string, database = BANCO) {
  afirmarBancoDescartavel(alvo(database));
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolver, rejeitar) => {
    const filho = spawn("docker", [
      "exec", "-i", CONTAINER, "mysql", "-uroot", `-p${SENHA}`, "--default-character-set=utf8mb4", database,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    filho.stdout.setEncoding("utf8");
    filho.stderr.setEncoding("utf8");
    filho.stdout.on("data", (pedaço) => { stdout += pedaço; });
    filho.stderr.on("data", (pedaço) => { stderr += pedaço; });
    filho.on("error", rejeitar);
    filho.on("close", (code) => resolver({ code: code ?? 1, stdout, stderr }));
    filho.stdin.write(sql);
    filho.stdin.end();
  });
}
function errnoDe(erro: unknown): number | null {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; cause?: unknown };
    if (typeof item.errno === "number") return item.errno;
    atual = item.cause;
  }
  return null;
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
async function recriar(extra = "") {
  const raiz = await conectar();
  await raiz.query(`DROP DATABASE IF EXISTS \`${BANCO}\``);
  await raiz.query(`CREATE DATABASE \`${BANCO}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await raiz.end();
  const conn = await conectar(BANCO);
  await conn.query(TABELA + extra);
  await conn.end();
}
async function aplicar() {
  return mysqlCli(MIGRACAO);
}
async function foto() {
  const conn = await conectar(BANCO);
  const [linhas] = await conn.query<RowDataPacket[]>(
    "SELECT id, userId, fazendaId, brinco, status FROM animais ORDER BY id",
  );
  await conn.end();
  return linhas.map((linha) => ({
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    brinco: linha.brinco == null ? null : String(linha.brinco),
    status: String(linha.status),
  }));
}
async function indice() {
  const conn = await conectar(BANCO);
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT INDEX_NAME AS nome, COLUMN_NAME AS coluna, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'animais'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [BANCO],
  );
  await conn.end();
  return linhas.map((linha) => `${linha.nome}:${linha.ordem}:${linha.coluna}:${linha.naoUnico}`);
}
async function colunaChave() {
  const conn = await conectar(BANCO);
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT COLLATION_NAME AS collation, EXTRA AS extra
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'animais' AND COLUMN_NAME = 'brinco_ativo_chave'`,
    [BANCO],
  );
  await conn.end();
  return linhas[0] ?? null;
}
async function inserir(row: { userId?: number; fazendaId?: number | null; brinco?: string | null; status?: string }) {
  const conn = await conectar(BANCO);
  try {
    await conn.query(
      "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (?, ?, ?, ?)",
      [row.userId ?? 1, row.fazendaId === undefined ? 10 : row.fazendaId, row.brinco ?? null, row.status ?? "ativo"],
    );
    return "ok";
  } catch (erro) {
    return errnoDe(erro) === 1062 ? "duplicado" : "erro";
  } finally {
    await conn.end();
  }
}
async function contar(tabela: string) {
  const conn = await conectar(BANCO);
  const [linhas] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${tabela}\``);
  await conn.end();
  return Number(linhas[0]?.n ?? 0);
}

describe("brinco ativo por fazenda no MySQL descartável", () => {
  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", "MYSQL_DATABASE=mysql",
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
    );
    await esperarMysql();
  }, 120_000);

  afterAll(async () => {
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  it("sem o índice a repetição entra; a rotina recusa e não mexe nos animais", async () => {
    await recriar();
    expect(await inserir({ brinco: "B1" })).toBe("ok");
    expect(await inserir({ brinco: "b1" })).toBe("ok");
    const antes = await foto();
    const recusa = await aplicar();
    expect(recusa.code).not.toBe(0);
    expect(recusa.stdout).toContain("duplicado_ativo");
    expect(recusa.stdout).toContain("B1");
    expect(recusa.stderr).toContain("brinco ativo repetido");
    expect(await foto()).toEqual(antes);
    expect(await colunaChave()).toBeNull();
    expect(await indice()).not.toContainEqual(expect.stringContaining("animais_brinco_ativo_fazenda_uq"));
  });

  it("índice certo, repetição histórica e identificações diferentes", async () => {
    await recriar();
    expect(await inserir({ brinco: "  001 " })).toBe("ok");
    expect(await inserir({ brinco: "1" })).toBe("ok");
    expect(await inserir({ brinco: "Á1" })).toBe("ok");
    expect(await inserir({ brinco: "A1" })).toBe("ok");
    expect(await inserir({ brinco: "VELHO", status: "morto" })).toBe("ok");
    expect(await inserir({ brinco: "velho", status: "vendido" })).toBe("ok");
    expect(await inserir({ brinco: "VELHO", status: "transferido" })).toBe("ok");
    expect(await inserir({ brinco: null })).toBe("ok");
    expect(await inserir({ brinco: "" })).toBe("ok");
    expect(await inserir({ brinco: "   " })).toBe("ok");
    expect(await inserir({ brinco: "OUTRA", fazendaId: 20 })).toBe("ok");
    expect(await inserir({ userId: 9, brinco: "OUTRA", fazendaId: 20 })).toBe("ok");
    const antes = await foto();
    const criado = await aplicar();
    expect(criado.code, criado.stderr).toBe(0);
    expect(criado.stdout).toContain("criado");
    expect(await foto()).toEqual(antes);
    const chave = await colunaChave();
    expect(String(chave?.collation)).toBe("utf8mb4_bin");
    expect(String(chave?.extra)).toContain("GENERATED");
    const deNovo = await aplicar();
    expect(deNovo.code, deNovo.stderr).toBe(0);
    expect(deNovo.stdout).toContain("ja_conferido");
    expect(await foto()).toEqual(antes);
    expect(await inserir({ brinco: "001" })).toBe("duplicado");
    expect(await inserir({ brinco: "a1" })).toBe("duplicado");
    expect(await inserir({ brinco: "á1" })).toBe("duplicado");
    expect(await inserir({ brinco: "A1", fazendaId: 20 })).toBe("ok");
    expect(await inserir({ userId: 9, brinco: "A1" })).toBe("ok");
    expect(await inserir({ brinco: "NOVO", status: "morto" })).toBe("ok");
    expect(await inserir({ brinco: "NOVO", status: "vendido" })).toBe("ok");
    expect(await inserir({ brinco: null })).toBe("ok");
    expect(await inserir({ brinco: "   " })).toBe("ok");
    expect(await inserir({ fazendaId: null, brinco: "SEM-FAZENDA" })).toBe("ok");
    expect(await inserir({ fazendaId: null, brinco: "SEM-FAZENDA" })).toBe("ok");
    const guardados = await foto();
    expect(guardados.find((item) => item.brinco === "  001 ")?.status).toBe("ativo");
    expect(guardados.filter((item) => item.brinco?.toLowerCase() === "velho")).toHaveLength(3);
  });

  it("proposta 0070 e índice com outro formato são recusados sem apagar nada", async () => {
    await recriar();
    expect(await inserir({ brinco: "HIST" })).toBe("ok");
    const conn = await conectar(BANCO);
    await conn.query(PROPOSTA_0070);
    await conn.end();
    const antes = await foto();
    const recusa = await aplicar();
    expect(recusa.code).not.toBe(0);
    expect(recusa.stdout).toContain("incompativel");
    expect(recusa.stderr).toContain("proposta 0070");
    expect(await foto()).toEqual(antes);
    expect(await indice()).toContainEqual(expect.stringContaining("animais_user_brinco_ativo_uq"));
    expect((await indice()).join(" ")).not.toContain("animais_brinco_ativo_fazenda_uq");

    await recriar();
    const direto = await conectar(BANCO);
    await direto.query("ALTER TABLE animais ADD UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, brinco)");
    await direto.query("INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'FICA', 'ativo')");
    await direto.end();
    const fotoErrada = await foto();
    const formaErrada = await aplicar();
    expect(formaErrada.code).not.toBe(0);
    expect(formaErrada.stdout).toContain("indice_incompativel");
    expect(await foto()).toEqual(fotoErrada);
    expect(await colunaChave()).toBeNull();
    expect((await indice()).join(" ")).toContain("animais_brinco_ativo_fazenda_uq:2:brinco");
  });

  it("cadastro, importação, parto, baixa e transferência disputam o mesmo brinco", async () => {
    await recriar(readFileSync(resolve(here, "administracao.isolado.sql"), "utf8"));
    const criado = await aplicar();
    expect(criado.code, criado.stderr).toBe(0);
    const pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
    });
    afirmarBancoDescartavel(alvo());
    try {
      await pool.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 9, 'Alheia')");
      await pool.query(
        `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
         (1, 'ficticio-openid-1', 'Ana', 'ana@teste.isolado', 'admin', 'principal', 1, 'ativo', 0),
         (2, 'ficticio-openid-2', 'Bia', 'bia@teste.isolado', 'user', 'comum', 1, 'ativo', 0),
         (3, 'ficticio-openid-3', 'Caio', 'caio@teste.isolado', 'user', 'comum', 1, 'ativo', 0),
         (9, 'ficticio-openid-9', 'Beto', 'beto@teste.isolado', 'admin', 'principal', 9, 'ativo', 0)`,
      );
      await pool.query(
        `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
         (2, 1, 'animais.criar', 1), (3, 1, 'animais.criar', 1)`,
      );
      await pool.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (2, 20, 1)");
      await pool.query("INSERT INTO lotes (id, userId, fazendaId, ativo) VALUES (1, 1, 10, 1)");

      function ioCadastro(conn: mysql.PoolConnection): IoCadastroAnimal {
        const tx: ConsultaCadastroAnimal = {
          async usuario(id) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
              [id],
            );
            const row = rows[0];
            if (!row) return null;
            return {
              id: Number(row.id), openId: String(row.openId), name: String(row.name),
              email: row.email == null ? null : String(row.email), role: String(row.role),
              papel: String(row.papel) as "principal" | "comum", titularUserId: Number(row.titularUserId),
              situacao: String(row.situacao) as "ativo", sessionVersion: Number(row.sessionVersion),
            };
          },
          async permissoes(userId, titularUserId) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
              [userId, titularUserId],
            );
            return rows.map((row) => String(row.permissao));
          },
          async vinculos(userId) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT userId, fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE",
              [userId],
            );
            return rows.map((row) => ({ userId: Number(row.userId), fazendaId: Number(row.fazendaId) }));
          },
          async fazendasDoTitular(titularUserId) {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE userId = ?", [titularUserId]);
            return rows.map((row) => ({ id: Number(row.id), userId: Number(row.userId) }));
          },
          async fazenda(id) {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE id = ?", [id]);
            const row = rows[0];
            return row ? { id: Number(row.id), userId: Number(row.userId) } : null;
          },
          async lote(id) {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId, ativo FROM lotes WHERE id = ?", [id]);
            const row = rows[0];
            return row ? { id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId), ativo: Boolean(row.ativo) } : null;
          },
          async pasto() { return null; },
          async animaisAtivos(titularUserId) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT id, brinco, brincoEletronico, status, fazendaId, loteId FROM animais WHERE userId = ? AND status = 'ativo'",
              [titularUserId],
            );
            return rows.map((row) => ({
              id: Number(row.id), brinco: row.brinco == null ? null : String(row.brinco),
              brincoEletronico: row.brincoEletronico == null ? null : String(row.brincoEletronico),
              status: String(row.status), fazendaId: row.fazendaId == null ? null : Number(row.fazendaId),
              loteId: row.loteId == null ? null : Number(row.loteId),
            }));
          },
          async lotesDoTitular(titularUserId) {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT id, fazendaId FROM lotes WHERE userId = ?", [titularUserId]);
            return rows.map((row) => ({ id: Number(row.id), fazendaId: row.fazendaId == null ? null : Number(row.fazendaId) }));
          },
          async inserirAnimal(row) {
            const [result] = await conn.query<ResultSetHeader>(
              "INSERT INTO animais (userId, fazendaId, loteId, brinco, sexo, status) VALUES (?, ?, ?, ?, ?, 'ativo')",
              [row.userId, row.fazendaId ?? null, row.loteId ?? null, row.brinco ?? null, row.sexo ?? null],
            );
            return Number(result.insertId);
          },
          async inserirMovimento(row) {
            await conn.query("INSERT INTO historico_lotes (animalId, userId) VALUES (?, ?)", [row.animalId, row.userId]);
          },
        };
        return {
          async emTransacao(fn) {
            await conn.beginTransaction();
            try {
              const resultado = await fn(tx);
              await conn.commit();
              return resultado;
            } catch (erro) {
              await conn.rollback();
              throw erro;
            }
          },
        };
      }

      async function cadastrar(executorId: number, brinco: string, fazendaId = 10, comLote = true) {
        const conn = await pool.getConnection();
        try {
          const resultado = await cadastrarAnimalAutorizado(ioCadastro(conn), {
            executorId,
            sessionVersionDaSessao: 0,
            input: { brinco, sexo: "femea", fazendaId, ...(comLote ? { loteId: 1 } : {}) },
          });
          return resultado.ok ? "ok" : resultado.motivo;
        } finally {
          conn.release();
        }
      }

      function adaptador(conn: mysql.PoolConnection): TransacaoImportacaoAnimal {
        return {
          async travarUsuario(id) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT id, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
              [id],
            );
            const row = rows[0];
            if (!row) return null;
            return {
              id: Number(row.id), papel: String(row.papel), titularUserId: Number(row.titularUserId),
              situacao: String(row.situacao), sessionVersion: Number(row.sessionVersion ?? 0),
            };
          },
          async permissoes(userId, titularUserId) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
              [userId, titularUserId],
            );
            return rows.map((row) => String(row.permissao));
          },
          async fazendasDoVinculo(userId) {
            const [rows] = await conn.query<RowDataPacket[]>(
              "SELECT fazendaId FROM usuario_fazendas WHERE userId = ? FOR UPDATE",
              [userId],
            );
            return rows.map((row) => Number(row.fazendaId));
          },
          async brincoAtivo(titularUserId, fazendaId, brinco) {
            const [rows] = await conn.query<RowDataPacket[]>(
              `SELECT id FROM animais WHERE userId = ? AND fazendaId = ? AND status = 'ativo'
               AND LOWER(TRIM(brinco)) = LOWER(TRIM(?)) LIMIT 1 FOR UPDATE`,
              [titularUserId, fazendaId, brinco],
            );
            return rows.length > 0;
          },
          async rfidAtivo() { return false; },
          async inserir(row) {
            const [result] = await conn.query<ResultSetHeader>(
              "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (?, ?, ?, ?)",
              [row.userId, row.fazendaId ?? null, row.brinco ?? null, row.status ?? "ativo"],
            );
            return Number(result.insertId);
          },
        };
      }

      async function importar(executorId: number, brinco: string, fazendaId: number, titularUserId = 1, status = "ativo") {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const resultado = await inserirAnimalImportadoNaTransacao(adaptador(conn), {
            executorId, titularUserId, sessionVersionDaSessao: 0, fazendaId, brinco,
            brincoEletronico: null, status,
            row: { userId: 99, fazendaId, brinco, status },
          });
          if (!resultado.ok) {
            await conn.rollback();
            return resultado.motivo;
          }
          await conn.commit();
          return "ok";
        } catch (erro) {
          await conn.rollback();
          return errnoDe(erro) === 1213 ? "deadlock" : "erro";
        } finally {
          conn.release();
        }
      }

      async function parto(brinco: string) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const [partoRow] = await conn.query<ResultSetHeader>("INSERT INTO partos (userId, matrizId) VALUES (1, 17)");
          const [animal] = await conn.query<ResultSetHeader>(
            "INSERT INTO animais (userId, fazendaId, brinco, sexo, status) VALUES (1, 10, ?, 'femea', 'ativo')",
            [brinco],
          );
          await conn.query("INSERT INTO parto_crias (partoId, animalId) VALUES (?, ?)", [partoRow.insertId, animal.insertId]);
          await conn.query("INSERT INTO pesagens (animalId) VALUES (?)", [animal.insertId]);
          await new Promise((resolver) => setTimeout(resolver, 80));
          await conn.commit();
          return "ok";
        } catch (erro) {
          await conn.rollback();
          return errnoDe(erro) === 1062 ? "duplicado" : "erro";
        } finally {
          conn.release();
        }
      }

      const cadastros = await Promise.all([cadastrar(2, "CAD"), cadastrar(3, "cad")]);
      expect(cadastros.sort()).toEqual(["brinco_duplicado", "ok"]);
      expect(await contar("animais")).toBe(1);
      expect(await contar("historico_lotes")).toBe(1);
      expect(await contar("pesagens")).toBe(0);

      const importacoes = await Promise.all([importar(2, "IMP", 10), importar(3, "imp", 10)]);
      expect(importacoes.sort()).toEqual(["brinco_duplicado", "ok"]);

      const cruzado = await Promise.all([cadastrar(2, "CRUZ"), importar(3, "cruz", 10)]);
      expect(cruzado.sort()).toEqual(["brinco_duplicado", "ok"]);

      const partoImportacao = await Promise.all([parto("NASCE"), importar(2, "nasce", 10)]);
      expect(partoImportacao.filter((item) => item === "ok")).toHaveLength(1);
      const [nasce] = await pool.query<RowDataPacket[]>("SELECT id FROM animais WHERE LOWER(brinco) = 'nasce'");
      expect(nasce).toHaveLength(1);
      const [partosNasce] = await pool.query<RowDataPacket[]>(
        "SELECT p.id FROM partos p JOIN parto_crias c ON c.partoId = p.id JOIN animais a ON a.id = c.animalId WHERE LOWER(a.brinco) = 'nasce'",
      );
      const [pesagensNasce] = await pool.query<RowDataPacket[]>(
        "SELECT p.id FROM pesagens p JOIN animais a ON a.id = p.animalId WHERE LOWER(a.brinco) = 'nasce'",
      );
      expect(partosNasce.length).toBe(pesagensNasce.length);
      expect(partosNasce.length).toBeLessThanOrEqual(1);

      await pool.query("DELETE FROM animais");
      await pool.query("DELETE FROM historico_lotes");
      await pool.query("DELETE FROM partos");
      await pool.query("DELETE FROM parto_crias");
      await pool.query("DELETE FROM pesagens");

      const partoCadastro = await Promise.all([parto("MISTO"), cadastrar(3, "misto")]);
      expect(partoCadastro.filter((item) => item === "ok")).toHaveLength(1);
      expect(await contar("animais")).toBe(1);
      const [criasMisto] = await pool.query<RowDataPacket[]>("SELECT id FROM parto_crias");
      const [partosMisto] = await pool.query<RowDataPacket[]>("SELECT id FROM partos");
      expect(criasMisto).toHaveLength(partosMisto.length);

      const doisPartos = await Promise.all([parto("GEMEOS"), parto("gemeos")]);
      expect(doisPartos.sort()).toEqual(["duplicado", "ok"]);
      const [gemeos] = await pool.query<RowDataPacket[]>("SELECT id FROM animais WHERE LOWER(brinco) = 'gemeos'");
      expect(gemeos).toHaveLength(1);
      expect(await contar("partos")).toBe(partosMisto.length + 1);

      expect(await importar(1, "FAZ", 10)).toBe("ok");
      expect(await importar(1, "FAZ", 20)).toBe("ok");
      expect(await importar(9, "FAZ", 30, 9)).toBe("ok");
      const [faz] = await pool.query<RowDataPacket[]>("SELECT userId, fazendaId FROM animais WHERE brinco = 'FAZ' ORDER BY userId, fazendaId");
      expect(faz.map((row) => `${row.userId}:${row.fazendaId}`)).toEqual(["1:10", "1:20", "9:30"]);

      await pool.query("INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'BAIXA', 'ativo')");
      const baixa = (async () => {
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            const [marcados] = await conn.query<RowDataPacket[]>(
              "SELECT id FROM animais WHERE brinco = 'BAIXA' AND status = 'ativo' ORDER BY id LIMIT 1 FOR UPDATE",
            );
            await new Promise((resolver) => setTimeout(resolver, 150));
            await conn.query("UPDATE animais SET status = 'morto' WHERE id = ?", [marcados[0]?.id]);
            await conn.commit();
            return;
          } catch (erro) {
            await conn.rollback().catch(() => undefined);
            if (errnoDe(erro) === 1213 && tentativa < 2) continue;
            throw erro;
          } finally {
            conn.release();
          }
        }
      })();
      const importacaoBaixa = importar(2, "BAIXA", 10);
      await Promise.all([baixa, importacaoBaixa]);
      const [baixaRows] = await pool.query<RowDataPacket[]>(
        "SELECT id, brinco, status, fazendaId FROM animais WHERE brinco = 'BAIXA' ORDER BY id",
      );
      expect(baixaRows[0]?.brinco).toBe("BAIXA");
      expect(baixaRows.filter((row) => row.status === "ativo").length).toBeLessThanOrEqual(1);
      expect(baixaRows.some((row) => row.status === "morto")).toBe(true);

      await pool.query("INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'MUDA', 'ativo')");
      const transferencia = (async () => {
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            const [marcados] = await conn.query<RowDataPacket[]>(
              "SELECT id FROM animais WHERE brinco = 'MUDA' AND fazendaId = 10 AND status = 'ativo' ORDER BY id LIMIT 1 FOR UPDATE",
            );
            if (!marcados[0]) {
              await conn.rollback();
              return;
            }
            await new Promise((resolver) => setTimeout(resolver, 150));
            await conn.query("UPDATE animais SET fazendaId = 20 WHERE id = ?", [marcados[0].id]);
            await conn.commit();
            return;
          } catch (erro) {
            await conn.rollback().catch(() => undefined);
            if (errnoDe(erro) === 1213 && tentativa < 2) continue;
            throw erro;
          } finally {
            conn.release();
          }
        }
      })();
      await Promise.all([transferencia, importar(2, "MUDA", 10)]);
      const [muda] = await pool.query<RowDataPacket[]>(
        "SELECT brinco, fazendaId, status FROM animais WHERE brinco = 'MUDA' ORDER BY fazendaId",
      );
      expect(muda.every((row) => row.brinco === "MUDA")).toBe(true);
      expect(muda.filter((row) => Number(row.fazendaId) === 10 && row.status === "ativo").length).toBeLessThanOrEqual(1);
      expect(muda.some((row) => Number(row.fazendaId) === 20)).toBe(true);

      expect(await inserir({ brinco: "HIST", status: "morto" })).toBe("ok");
      expect(await importar(1, "HIST", 10)).toBe("ok");
      expect(await importar(1, "SUMIU", 10, 1, "vendido")).toBe("ok");
      expect(await importar(1, "SUMIU", 10)).toBe("ok");

      expect(await importar(2, "LINHA1", 10)).toBe("ok");
      const connQuebrada = await pool.getConnection();
      try {
        await connQuebrada.beginTransaction();
        await connQuebrada.query(
          "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'LINHA2', 'ativo')",
        );
        throw new Error("falha depois da primeira linha");
      } catch (erro) {
        await connQuebrada.rollback();
        expect(erro).toBeInstanceOf(Error);
      } finally {
        connQuebrada.release();
      }
      const [linhas] = await pool.query<RowDataPacket[]>("SELECT brinco FROM animais WHERE brinco IN ('LINHA1', 'LINHA2')");
      expect(linhas.map((row) => String(row.brinco))).toEqual(["LINHA1"]);

      await pool.query("INSERT INTO animais (id, userId, fazendaId, brinco, status) VALUES (801, 1, 10, 'TRAVA1', 'ativo'), (802, 1, 10, 'TRAVA2', 'ativo')");
      async function travar(primeiro: number, segundo: number) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await conn.query("SELECT id FROM animais WHERE id = ? FOR UPDATE", [primeiro]);
          await conn.query(
            "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, ?, 'morto')",
            [`MORTO-${primeiro}`],
          );
          await new Promise((resolver) => setTimeout(resolver, 80));
          await conn.query("SELECT id FROM animais WHERE id = ? FOR UPDATE", [segundo]);
          await conn.commit();
          return "ok";
        } catch (erro) {
          await conn.rollback();
          return errnoDe(erro) === 1213 ? "deadlock" : "erro";
        } finally {
          conn.release();
        }
      }
      const travas = await Promise.all([travar(801, 802), travar(802, 801)]);
      expect(travas.sort()).toEqual(["deadlock", "ok"]);
      const [mortos] = await pool.query<RowDataPacket[]>("SELECT brinco FROM animais WHERE brinco LIKE 'MORTO-%'");
      expect(mortos).toHaveLength(1);

      await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2");
      expect(await importar(2, "REVOGADO", 10)).toBe("sem_permissao");
      const [revogados] = await pool.query<RowDataPacket[]>("SELECT id FROM animais WHERE brinco = 'REVOGADO'");
      expect(revogados).toEqual([]);
    } finally {
      await pool.end();
    }
  }, 60_000);
});
