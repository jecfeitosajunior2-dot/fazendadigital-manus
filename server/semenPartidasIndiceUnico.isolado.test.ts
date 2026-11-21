import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applySemenEntradaAgregacao } from "../shared/semenEstoque";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  EntradaAindaPendente,
  registrarEntradaSemenAutorizado,
  type ConsultaEntradaSemen,
  type IoEntradaSemen,
  type PedidoEntradaSemen,
} from "./entradaSemenAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const MIGRACAO = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../drizzle/migrations/0069_semen_partidas_indice_unico.sql"),
  "utf8",
).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const CONTAINER = "fd-h4am-uq";
const PORTA = 3359;
const SENHA = "isolado-h4am";
const BANCO = "fd_h4am";
const DATA = "2026-11-10";
let seq = 0;
function chave() {
  seq += 1;
  return `20000000-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
}

const TABELA = `
CREATE TABLE semen_partidas (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  fazenda_id int NOT NULL,
  origem_reprodutor varchar(20) NOT NULL,
  reprodutor_key varchar(120) NOT NULL,
  macho_id int NULL,
  reprodutor_texto varchar(500) NULL,
  partida varchar(120) NOT NULL,
  central_origem varchar(150) NULL,
  saldo_doses int NOT NULL DEFAULT 0,
  custo_unitario decimal(12,2) NULL,
  status varchar(20) NOT NULL DEFAULT 'disponivel',
  observacoes text NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_movimentacoes (
  id int NOT NULL AUTO_INCREMENT,
  partida_id int NOT NULL,
  user_id int NOT NULL,
  fazenda_id int NOT NULL,
  tipo varchar(20) NOT NULL,
  data_entrada date NOT NULL,
  quantidade_doses int NOT NULL,
  custo_total decimal(12,2) NOT NULL,
  custo_unitario decimal(12,2) NOT NULL,
  observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

const APOIO = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL,
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  fazendaId int NULL, pastoAtualId int NULL, ativo tinyint(1) NOT NULL DEFAULT 1, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL, fazendaId int NULL, pastoId int NULL,
  status varchar(20) NOT NULL, brinco varchar(50) NULL, nome varchar(100) NULL,
  categoria varchar(50) NULL, sexo varchar(20) NULL, castrado tinyint(1) NULL,
  dataNascimento date NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_entrada_operacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, chave varchar(64) NOT NULL,
  fazendaId int NOT NULL, executorUserId int NOT NULL, conteudoHash varchar(64) NOT NULL,
  partidaId int NULL, movimentacaoId int NULL, saldoAtual int NULL,
  custoMedioAtual varchar(20) NULL, novaEntrada tinyint(1) NOT NULL DEFAULT 0,
  criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
  UNIQUE KEY semen_entrada_operacoes_titular_chave_uq (userId, chave)
) ENGINE=InnoDB;
`;

function alvo(database: string) {
  return { host: "127.0.0.1", port: PORTA, database, container: CONTAINER };
}
async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}
async function conectar(database?: string) {
  if (database) afirmarBancoDescartavel(alvo(database));
  else afirmarBancoDescartavel(alvo(BANCO));
  return mysql.createConnection({
    host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database,
    multipleStatements: true, dateStrings: true,
  });
}
function mysqlCli(database: string, sql: string) {
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
function errno(erro: unknown): number | null {
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
async function indices(database: string) {
  const conn = await conectar(database);
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'semen_partidas'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [database],
  );
  await conn.end();
  return linhas.map((linha) => `${linha.INDEX_NAME}:${linha.NON_UNIQUE}:${linha.SEQ_IN_INDEX}:${linha.COLUMN_NAME}:${linha.INDEX_TYPE}`);
}
async function preparar(database: string, extra = "") {
  afirmarBancoDescartavel(alvo(database));
  const raiz = await conectar();
  await raiz.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await raiz.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await raiz.end();
  const conn = await conectar(database);
  await conn.query(TABELA + extra);
  await conn.end();
}
async function aplicar(database: string) {
  return mysqlCli(database, MIGRACAO);
}
async function inserir(database: string, row: {
  userId: number; fazendaId: number; key: string; partida: string; saldo: number; custo: string;
}) {
  const conn = await conectar(database);
  try {
    await conn.query(
      `INSERT INTO semen_partidas
        (user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
       VALUES (?, ?, 'interno', ?, ?, ?, ?, 'disponivel')`,
      [row.userId, row.fazendaId, row.key, row.partida, row.saldo, row.custo],
    );
  } finally {
    await conn.end();
  }
}

describe.sequential("índice único das partidas de sêmen", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel(alvo(BANCO));
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker("run", "-d", "--name", CONTAINER, "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`, "-p", `127.0.0.1:${PORTA}:3306`, "mysql:8.4");
    await esperarMysql();
    await preparar(BANCO, APOIO);
    const conn = await conectar(BANCO);
    const [versao] = await conn.query<RowDataPacket[]>("SELECT VERSION() AS versao");
    expect(String(versao[0]?.versao).startsWith("8.")).toBe(true);
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
      VALUES
        (1, 1, 10, 'interno', 'm:1', 'ORIGINAL', 7, 12.50, 'disponivel'),
        (2, 1, 10, 'interno', 'm:2', 'OUTRA', 3, 4.00, 'disponivel')
    `);
    await conn.query(`
      INSERT INTO semen_movimentacoes
        (id, partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario)
      VALUES (1, 1, 1, 10, 'ENTRADA', '2026-11-01', 7, 87.50, 12.50)
    `);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p', 'Administrador da conta', 'p@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'f', 'Funcionario Curral', 'f@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (6, 'g', 'Segundo Curral', 'g@isolado.local', 'user', 'comum', 1, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (6, 10, 1)");
    await conn.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'semen.criar', 1), (6, 1, 'semen.criar', 1)");
    await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral')");
    await conn.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId) VALUES (100, 1, 'Sede', 10, 1000)");
    await conn.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, categoria, sexo, castrado, dataNascimento)
      VALUES (80, 1, 100, 10, 1000, 'ativo', 'TO-80', 'Boi', 'macho', 0, '2018-01-01')
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      dateStrings: true, connectionLimit: 8,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function conferirOriginais() {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, user_id, fazenda_id, reprodutor_key, partida, saldo_doses, custo_unitario FROM semen_partidas WHERE id IN (1, 2) ORDER BY id",
    );
    expect(linhas).toMatchObject([
      { id: 1, user_id: 1, fazenda_id: 10, reprodutor_key: "m:1", partida: "ORIGINAL", saldo_doses: 7, custo_unitario: "12.50" },
      { id: 2, user_id: 1, fazenda_id: 10, reprodutor_key: "m:2", partida: "OUTRA", saldo_doses: 3, custo_unitario: "4.00" },
    ]);
    const [mov] = await pool.query<RowDataPacket[]>("SELECT * FROM semen_movimentacoes WHERE id = 1");
    expect(mov[0]).toMatchObject({
      id: 1, partida_id: 1, user_id: 1, quantidade_doses: 7, custo_total: "87.50", custo_unitario: "12.50",
    });
  }

  it("17. banco sem o índice recebe a restrição e a repetição não cria outra", async () => {
    const conn = await conectar(BANCO);
    try {
      await conn.query("CREATE UNIQUE INDEX IF NOT EXISTS prova_sintaxe ON semen_partidas (id)");
      await conn.query("DROP INDEX prova_sintaxe ON semen_partidas");
      throw new Error("MySQL aceitou IF NOT EXISTS");
    } catch (erro) {
      if (erro instanceof Error && erro.message === "MySQL aceitou IF NOT EXISTS") throw erro;
      expect(errno(erro)).toBe(1064);
    } finally {
      await conn.end();
    }
    const antes = await indices(BANCO);
    expect(antes).toEqual(["PRIMARY:0:1:id:BTREE"]);
    const primeira = await aplicar(BANCO);
    expect(primeira.code).toBe(0);
    expect(primeira.stdout).toContain("criado");
    expect(await indices(BANCO)).toEqual([
      "PRIMARY:0:1:id:BTREE",
      "semen_partidas_uq:0:1:user_id:BTREE",
      "semen_partidas_uq:0:2:fazenda_id:BTREE",
      "semen_partidas_uq:0:3:reprodutor_key:BTREE",
      "semen_partidas_uq:0:4:partida:BTREE",
    ]);
    const segunda = await aplicar(BANCO);
    expect(segunda.code).toBe(0);
    expect(segunda.stdout).toContain("ja_conferido");
    expect(await indices(BANCO)).toHaveLength(5);
    await conferirOriginais();
    const [rotina] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = 'fd_h4am_aplicar_semen_partidas_uq'",
      [BANCO],
    );
    expect(Number(rotina[0]?.n)).toBe(0);
  });

  it("18. banco que já tem o índice certo segue sem segunda restrição", async () => {
    const banco = "fd_h4am_existe";
    await preparar(banco);
    const conn = await conectar(banco);
    await conn.query("ALTER TABLE semen_partidas ADD UNIQUE KEY semen_partidas_uq (user_id, fazenda_id, reprodutor_key, partida)");
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
      VALUES (9, 1, 10, 'interno', 'm:9', 'PRONTA', 6, 8.00, 'disponivel')
    `);
    await conn.end();
    const resultado = await aplicar(banco);
    expect(resultado.code).toBe(0);
    expect(resultado.stdout).toContain("ja_conferido");
    expect((await indices(banco)).filter((item) => item.startsWith("semen_partidas_uq:"))).toHaveLength(4);
    const leitura = await conectar(banco);
    const [linhas] = await leitura.query<RowDataPacket[]>("SELECT id, saldo_doses, custo_unitario FROM semen_partidas WHERE id = 9");
    expect(linhas[0]).toMatchObject({ id: 9, saldo_doses: 6, custo_unitario: "8.00" });
    await leitura.end();
  });

  it("índice de outro nome com as mesmas colunas não é duplicado", async () => {
    const banco = "fd_h4am_equiv";
    await preparar(banco);
    const conn = await conectar(banco);
    await conn.query("ALTER TABLE semen_partidas ADD UNIQUE KEY semen_partidas_identidade (partida, user_id, fazenda_id, reprodutor_key)");
    await conn.end();
    const resultado = await aplicar(banco);
    expect(resultado.code).toBe(0);
    expect(resultado.stdout).toContain("equivalente");
    expect(resultado.stdout).toContain("semen_partidas_identidade");
    const nomes = await indices(banco);
    expect(nomes.some((item) => item.startsWith("semen_partidas_uq:"))).toBe(false);
    expect(nomes.some((item) => item.startsWith("semen_partidas_identidade:"))).toBe(true);
  });

  it("19. índice com o nome certo e colunas diferentes interrompe sem drop", async () => {
    const banco = "fd_h4am_div";
    await preparar(banco);
    const conn = await conectar(banco);
    await conn.query("ALTER TABLE semen_partidas ADD UNIQUE KEY semen_partidas_uq (user_id, fazenda_id)");
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
      VALUES (4, 1, 10, 'interno', 'm:4', 'CURTA', 2, 5.00, 'disponivel')
    `);
    await conn.end();
    const antes = await indices(banco);
    const resultado = await aplicar(banco);
    expect(resultado.code).not.toBe(0);
    expect(resultado.stderr).toContain("divergente");
    expect(await indices(banco)).toEqual(antes);
    const leitura = await conectar(banco);
    const [linhas] = await leitura.query<RowDataPacket[]>("SELECT saldo_doses, custo_unitario FROM semen_partidas WHERE id = 4");
    expect(linhas[0]).toMatchObject({ saldo_doses: 2, custo_unitario: "5.00" });
    await leitura.end();
  });

  it("20. partidas duplicadas recusam o índice e conservam saldo e custo", async () => {
    const banco = "fd_h4am_dup";
    await preparar(banco);
    const conn = await conectar(banco);
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
      VALUES
        (11, 1, 10, 'interno', 'm:11', 'REPETIDA', 4, 10.00, 'disponivel'),
        (12, 1, 10, 'interno', 'm:11', 'REPETIDA', 9, 30.00, 'disponivel')
    `);
    await conn.query(`
      INSERT INTO semen_movimentacoes
        (id, partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario)
      VALUES (11, 11, 1, 10, 'ENTRADA', '2026-11-01', 4, 40.00, 10.00)
    `);
    await conn.end();
    const resultado = await aplicar(banco);
    expect(resultado.code).not.toBe(0);
    expect(resultado.stderr).toContain("duplicado");
    expect(resultado.stdout).toContain("11");
    expect(resultado.stdout).toContain("12");
    expect(await indices(banco)).toEqual(["PRIMARY:0:1:id:BTREE"]);
    const leitura = await conectar(banco);
    const [linhas] = await leitura.query<RowDataPacket[]>(
      "SELECT id, saldo_doses, custo_unitario FROM semen_partidas ORDER BY id",
    );
    expect(linhas).toMatchObject([
      { id: 11, saldo_doses: 4, custo_unitario: "10.00" },
      { id: 12, saldo_doses: 9, custo_unitario: "30.00" },
    ]);
    const [mov] = await leitura.query<RowDataPacket[]>("SELECT quantidade_doses, custo_total FROM semen_movimentacoes WHERE id = 11");
    expect(mov[0]).toMatchObject({ quantidade_doses: 4, custo_total: "40.00" });
    await leitura.end();
  });

  it("11. coluna anulável e valor NULL não recebem o índice", async () => {
    const banco = "fd_h4am_nula";
    await preparar(banco);
    const conn = await conectar(banco);
    await conn.query("ALTER TABLE semen_partidas MODIFY partida varchar(120) NULL");
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
      VALUES
        (21, 1, 10, 'interno', 'm:21', NULL, 1, 1.00, 'disponivel'),
        (22, 1, 10, 'interno', 'm:21', NULL, 2, 2.00, 'disponivel')
    `);
    await conn.end();
    const resultado = await aplicar(banco);
    expect(resultado.code).not.toBe(0);
    expect(resultado.stderr).toContain("admite NULL");
    expect(await indices(banco)).toEqual(["PRIMARY:0:1:id:BTREE"]);
    const leitura = await conectar(banco);
    const [linhas] = await leitura.query<RowDataPacket[]>("SELECT id, partida, saldo_doses FROM semen_partidas ORDER BY id");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.partida).toBeNull();
    expect(linhas[1]?.partida).toBeNull();
    await leitura.end();

    const connBanido = await conectar(BANCO);
    await expect(connBanido.query(
      `INSERT INTO semen_partidas
        (user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
       VALUES (1, 10, 'interno', 'm:1', NULL, 1, 1.00, 'disponivel')`,
    )).rejects.toMatchObject({ errno: 1048 });
    await connBanido.end();
    const longa = "L".repeat(121);
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:1", partida: longa, saldo: 1, custo: "1.00" })).rejects.toMatchObject({ errno: 1406 });
  });

  it("1. o mesmo titular, fazenda, touro e lote não gera a segunda partida", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:30", partida: "MESMA", saldo: 5, custo: "10.00" });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:30", partida: "MESMA", saldo: 8, custo: "99.00" })).rejects.toMatchObject({ errno: 1062 });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT saldo_doses, custo_unitario FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND reprodutor_key = 'm:30' AND partida = 'MESMA'",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ saldo_doses: 5, custo_unitario: "10.00" });
  });

  it("2. outro titular pode ter o mesmo lote", async () => {
    await inserir(BANCO, { userId: 4, fazendaId: 10, key: "m:30", partida: "MESMA", saldo: 1, custo: "1.00" });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT user_id FROM semen_partidas WHERE reprodutor_key = 'm:30' AND partida = 'MESMA' ORDER BY user_id",
    );
    expect(linhas.map((linha) => Number(linha.user_id))).toEqual([1, 4]);
  });

  it("3. outra fazenda pode ter o mesmo lote", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 20, key: "m:30", partida: "MESMA", saldo: 2, custo: "2.00" });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT fazenda_id FROM semen_partidas WHERE user_id = 1 AND reprodutor_key = 'm:30' AND partida = 'MESMA' ORDER BY fazenda_id",
    );
    expect(linhas.map((linha) => Number(linha.fazenda_id))).toEqual([10, 20]);
  });

  it("4. outro touro pode ter o mesmo lote", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:31", partida: "MESMA", saldo: 3, custo: "3.00" });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT reprodutor_key FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND partida = 'MESMA' ORDER BY reprodutor_key",
    );
    expect(linhas.map((linha) => String(linha.reprodutor_key))).toEqual(["m:30", "m:31"]);
  });

  it("5. outro lote do mesmo touro é outra partida", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:30", partida: "OUTRO-LOTE", saldo: 4, custo: "4.00" });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT partida FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND reprodutor_key = 'm:30' ORDER BY partida",
    );
    expect(linhas.map((linha) => String(linha.partida))).toEqual(["MESMA", "OUTRO-LOTE"]);
  });

  it("6. o lote Sem lote entra uma vez", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:40", partida: "Sem lote", saldo: 6, custo: "6.00" });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:40", partida: "Sem lote", saldo: 1, custo: "1.00" })).rejects.toMatchObject({ errno: 1062 });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND reprodutor_key = 'm:40' AND partida = 'Sem lote'",
    );
    expect(Number(linhas[0]?.n)).toBe(1);
  });

  it("7. o lote vazio não é o mesmo que Sem lote", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:41", partida: "", saldo: 1, custo: "1.00" });
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:41", partida: "Sem lote", saldo: 2, custo: "2.00" });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:41", partida: "", saldo: 3, custo: "3.00" })).rejects.toMatchObject({ errno: 1062 });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT partida, saldo_doses FROM semen_partidas WHERE user_id = 1 AND reprodutor_key = 'm:41' ORDER BY partida",
    );
    expect(linhas).toMatchObject([
      { partida: "", saldo_doses: 1 },
      { partida: "Sem lote", saldo_doses: 2 },
    ]);
  });

  it("8. maiúsculas e minúsculas são a mesma identidade nesta collation", async () => {
    const [collation] = await pool.query<RowDataPacket[]>(
      `SELECT COLLATION_NAME, (SELECT PAD_ATTRIBUTE FROM information_schema.COLLATIONS c WHERE c.COLLATION_NAME = col.COLLATION_NAME) AS pad
       FROM information_schema.COLUMNS col
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'semen_partidas' AND COLUMN_NAME = 'partida'`,
      [BANCO],
    );
    expect(collation[0]).toMatchObject({ COLLATION_NAME: "utf8mb4_0900_ai_ci", pad: "NO PAD" });
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:50", partida: "LoteA", saldo: 5, custo: "5.00" });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:50", partida: "lotea", saldo: 9, custo: "9.00" })).rejects.toMatchObject({ errno: 1062 });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "M:50", partida: "LoteA", saldo: 1, custo: "1.00" })).rejects.toMatchObject({ errno: 1062 });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT reprodutor_key, partida, saldo_doses FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND reprodutor_key = 'm:50'",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ reprodutor_key: "m:50", partida: "LoteA", saldo_doses: 5 });

    const banco = "fd_h4am_caso";
    await preparar(banco);
    await inserir(banco, { userId: 1, fazendaId: 10, key: "m:50", partida: "LoteA", saldo: 5, custo: "5.00" });
    await inserir(banco, { userId: 1, fazendaId: 10, key: "m:50", partida: "lotea", saldo: 9, custo: "9.00" });
    const resultado = await aplicar(banco);
    expect(resultado.code).not.toBe(0);
    expect(resultado.stderr).toContain("duplicado");
    expect(await indices(banco)).toEqual(["PRIMARY:0:1:id:BTREE"]);
    const leitura = await conectar(banco);
    const [guardadas] = await leitura.query<RowDataPacket[]>("SELECT partida, saldo_doses FROM semen_partidas ORDER BY id");
    expect(guardadas.map((linha) => String(linha.partida))).toEqual(["LoteA", "lotea"]);
    expect(guardadas.map((linha) => Number(linha.saldo_doses))).toEqual([5, 9]);
    await leitura.end();
  });

  it("9. acentos equivalentes também impedem a segunda partida", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:51", partida: "Ação", saldo: 2, custo: "2.00" });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:51", partida: "Acao", saldo: 3, custo: "3.00" })).rejects.toMatchObject({ errno: 1062 });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT partida, saldo_doses FROM semen_partidas WHERE user_id = 1 AND reprodutor_key = 'm:51'",
    );
    expect(linhas).toMatchObject([{ partida: "Ação", saldo_doses: 2 }]);
  });

  it("10. espaço no fim continua sendo outro texto para o banco", async () => {
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:52", partida: "ESPACO", saldo: 2, custo: "2.00" });
    await inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:52", partida: "ESPACO ", saldo: 4, custo: "4.00" });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT partida, saldo_doses FROM semen_partidas WHERE user_id = 1 AND reprodutor_key = 'm:52' ORDER BY id",
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.map((linha) => String(linha.partida))).toEqual(["ESPACO", "ESPACO "]);
    expect(linhas.map((linha) => Number(linha.saldo_doses))).toEqual([2, 4]);
  });

  it("12. duas inserções simultâneas da mesma partida deixam uma só", async () => {
    const a = await conectar(BANCO);
    const b = await conectar(BANCO);
      let terminou = false;
      let erroSegunda: unknown;
      try {
        await a.beginTransaction();
        await b.beginTransaction();
        await a.query(
          `INSERT INTO semen_partidas
            (user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
           VALUES (1, 10, 'interno', 'm:60', 'SIMUL', 2, 10.00, 'disponivel')`,
        );
        const segunda = b.query(
          `INSERT INTO semen_partidas
            (user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
           VALUES (1, 10, 'interno', 'm:60', 'SIMUL', 3, 30.00, 'disponivel')`,
        ).then(() => "ok" as const, (erro: unknown) => {
          terminou = true;
          erroSegunda = erro;
          return "erro" as const;
        });
        await new Promise((resolver) => setTimeout(resolver, 400));
        expect(terminou).toBe(false);
        await a.commit();
        await expect(segunda).resolves.toBe("erro");
        expect(errno(erroSegunda)).toBe(1062);
        await b.rollback();
    } finally {
      await a.end();
      await b.end();
    }
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT saldo_doses, custo_unitario FROM semen_partidas WHERE user_id = 1 AND reprodutor_key = 'm:60' AND partida = 'SIMUL'",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ saldo_doses: 2, custo_unitario: "10.00" });
  }, 20_000);

  function io(ganchos: Partial<IoEntradaSemen> = {}): IoEntradaSemen {
    return { ...ganchos, emTransacao: transacao().emTransacao };
  }
  function transacao() {
    return {
      async emTransacao<T>(fn: (tx: ConsultaEntradaSemen) => Promise<T>) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultas(conn));
            await conn.commit();
            return resultado;
          } catch (erro) {
            await conn.rollback();
            throw erro;
          }
        } finally {
          conn.release();
        }
      },
    };
  }
  function pedido(executorId: number, sessionVersion: number, extra: Partial<PedidoEntradaSemen["input"]> = {}): PedidoEntradaSemen {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      fazendaId: 10,
      input: {
        origemReprodutor: "interno", machoId: 80, partida: "SERVICO",
        quantidadeDoses: 2, custoTotal: 200, dataEntrada: DATA, operacaoId: chave(),
        ...extra,
      },
    };
  }

  it("13. duas entradas distintas somam doses numa única partida", async () => {
    let esperas = 0;
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const criaA = registrarEntradaSemenAutorizado(io({
      aposSaldo: async () => {
        esperas += 1;
        if (esperas === 1) {
          avisou();
          await segue;
        }
      },
    }), pedido(2, 1, { partida: "CORRIDA", quantidadeDoses: 2, custoTotal: 200 }));
    await travou;
    const criaB = registrarEntradaSemenAutorizado(io(), pedido(6, 1, { partida: "CORRIDA", quantidadeDoses: 3, custoTotal: 450 }));
    await new Promise((resolver) => setTimeout(resolver, 300));
    liberar();
    const par = await Promise.all([criaA, criaB]);
    expect(par.every((item) => item.ok)).toBe(true);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, saldo_doses, custo_unitario FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND reprodutor_key = 'm:80' AND partida = 'CORRIDA'",
    );
    expect(linhas).toHaveLength(1);
    const livro = applySemenEntradaAgregacao({
      saldoAnterior: 2,
      custoUnitarioAnterior: "100.00",
      quantidadeEntrada: 3,
      custoTotalEntrada: 450,
    });
    expect(Number(linhas[0]?.saldo_doses)).toBe(5);
    expect(String(linhas[0]?.custo_unitario)).toBe(livro.novoCustoUnitario);
    const [movs] = await pool.query<RowDataPacket[]>(
      "SELECT id, quantidade_doses, custo_total FROM semen_movimentacoes WHERE partida_id = ? ORDER BY id",
      [linhas[0]?.id],
    );
    expect(movs).toHaveLength(2);
    expect(movs.map((linha) => Number(linha.quantidade_doses))).toEqual([2, 3]);
    await conferirOriginais();
  }, 20_000);

  it("14. a mesma chave de entrada não soma a segunda vez", async () => {
    const chaveUnica = chave();
    let reenvios = 0;
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const primeiro = registrarEntradaSemenAutorizado(io({
      aposSaldo: async () => {
        reenvios += 1;
        if (reenvios === 1) {
          avisou();
          await segue;
        }
      },
    }), pedido(2, 1, { partida: "REENVIO", quantidadeDoses: 1, custoTotal: 100, operacaoId: chaveUnica }));
    await travou;
    const segundo = registrarEntradaSemenAutorizado(io(), pedido(6, 1, { partida: "REENVIO", quantidadeDoses: 1, custoTotal: 100, operacaoId: chaveUnica }));
    await new Promise((resolver) => setTimeout(resolver, 300));
    liberar();
    const par = await Promise.all([primeiro, segundo]);
    expect(par.every((item) => item.ok)).toBe(true);
    expect(par.filter((item) => item.ok && item.repetida)).toHaveLength(1);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, saldo_doses, custo_unitario FROM semen_partidas WHERE partida = 'REENVIO'",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ saldo_doses: 1, custo_unitario: "100.00" });
    const [movs] = await pool.query<RowDataPacket[]>("SELECT id FROM semen_movimentacoes WHERE partida_id = ?", [linhas[0]?.id]);
    expect(movs).toHaveLength(1);
  }, 20_000);

  it("15. falha antes do commit não deixa partida nem movimento", async () => {
    const chaveFalha = chave();
    await expect(registrarEntradaSemenAutorizado(io({
      async aposSaldo() { throw new Error("antes do commit"); },
    }), pedido(1, 3, { partida: "FALHA", quantidadeDoses: 4, custoTotal: 400, operacaoId: chaveFalha }))).rejects.toThrow("antes do commit");
    const [vazio] = await pool.query<RowDataPacket[]>("SELECT id FROM semen_partidas WHERE partida = 'FALHA'");
    expect(vazio).toHaveLength(0);
    const retomada = await registrarEntradaSemenAutorizado(io(), pedido(1, 3, {
      partida: "FALHA", quantidadeDoses: 4, custoTotal: 400, operacaoId: chaveFalha,
    }));
    expect(retomada).toMatchObject({ ok: true, repetida: false, saldoAtual: 4, novaEntrada: true });
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, saldo_doses, custo_unitario FROM semen_partidas WHERE partida = 'FALHA'",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ saldo_doses: 4, custo_unitario: "100.00" });
    const [movs] = await pool.query<RowDataPacket[]>("SELECT quantidade_doses, custo_total FROM semen_movimentacoes WHERE partida_id = ?", [linhas[0]?.id]);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ quantidade_doses: 4, custo_total: "400.00" });
  });

  it("16. deadlock no índice desfaz a transação perdedora e a repetição não duplica", async () => {
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    const insert = (conn: mysql.PoolConnection, partida: string) => conn.query(
      `INSERT INTO semen_partidas
        (user_id, fazenda_id, origem_reprodutor, reprodutor_key, partida, saldo_doses, custo_unitario, status)
       VALUES (1, 10, 'interno', 'm:70', ?, 1, 1.00, 'disponivel')`,
      [partida],
    );
    let aPronto: () => void = () => undefined;
    let bPronto: () => void = () => undefined;
    const aChegou = new Promise<void>((resolver) => { aPronto = resolver; });
    const bChegou = new Promise<void>((resolver) => { bPronto = resolver; });
    try {
      await a.beginTransaction();
      await b.beginTransaction();
      await insert(a, "DK-A");
      await insert(b, "DK-B");
      const passoA = (async () => {
        aPronto();
        await bChegou;
        await insert(a, "DK-B");
        await a.commit();
      })();
      const passoB = (async () => {
        bPronto();
        await aChegou;
        await insert(b, "DK-A");
        await b.commit();
      })();
      const resultados = await Promise.allSettled([passoA, passoB]);
      const falhas = resultados.filter((item) => item.status === "rejected");
      expect(falhas).toHaveLength(1);
      expect(errno(falhas[0]?.status === "rejected" ? falhas[0].reason : null)).toBe(1213);
      await a.rollback().catch(() => undefined);
      await b.rollback().catch(() => undefined);
    } finally {
      a.release();
      b.release();
    }
    const [depois] = await pool.query<RowDataPacket[]>(
      "SELECT partida FROM semen_partidas WHERE reprodutor_key = 'm:70' AND partida IN ('DK-A', 'DK-B') ORDER BY partida",
    );
    expect(depois.map((linha) => String(linha.partida))).toEqual(["DK-A", "DK-B"]);
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:70", partida: "DK-A", saldo: 8, custo: "8.00" })).rejects.toMatchObject({ errno: 1062 });
    await expect(inserir(BANCO, { userId: 1, fazendaId: 10, key: "m:70", partida: "DK-B", saldo: 8, custo: "8.00" })).rejects.toMatchObject({ errno: 1062 });
    const [saldos] = await pool.query<RowDataPacket[]>(
      "SELECT partida, saldo_doses FROM semen_partidas WHERE reprodutor_key = 'm:70' ORDER BY partida",
    );
    expect(saldos).toMatchObject([
      { partida: "DK-A", saldo_doses: 1 },
      { partida: "DK-B", saldo_doses: 1 },
    ]);
    await conferirOriginais();
  }, 20_000);
});

function chaveDuplicada(erro: unknown): boolean {
  return errno(erro) === 1062;
}
function consultas(conn: mysql.PoolConnection): ConsultaEntradaSemen {
  return {
    async usuario(id: number): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM users WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id), openId: String(linha.openId), name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email), role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel, titularUserId: linha.titularUserId == null ? null : Number(linha.titularUserId),
        situacao: linha.situacao, sessionVersion: Number(linha.sessionVersion),
      };
    },
    async permissoes(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE", [userId, titularUserId]);
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf JOIN users u ON u.id = uf.userId WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
    },
    async fazendasDoTitular(titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE userId = ?", [titularUserId]);
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId) } : null;
    },
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: linhas[0].fazendaId == null ? null : Number(linhas[0].fazendaId) } : null;
    },
    async pasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: linhas[0].fazendaId == null ? null : Number(linhas[0].fazendaId) } : null;
    },
    async espiar(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ? AND userId = ? FOR UPDATE", [id, titularUserId]);
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async espiarPartida(titularUserId, fazendaId, reprodutorKey, partida) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM semen_partidas WHERE user_id = ? AND fazenda_id = ? AND reprodutor_key = ? AND partida = ?",
        [titularUserId, fazendaId, reprodutorKey, partida],
      );
      return linhas[0] ? mapearPartida(linhas[0]) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ? AND user_id = ? FOR UPDATE", [id, titularUserId]);
      return linhas[0] ? mapearPartida(linhas[0]) : null;
    },
    async inserirPartida(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_partidas
          (user_id, fazenda_id, origem_reprodutor, reprodutor_key, macho_id, reprodutor_texto, partida, central_origem, saldo_doses, custo_unitario, status, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.fazendaId, row.origemReprodutor, row.reprodutorKey, row.machoId, row.reprodutorTexto, row.partida, row.centralOrigem, row.saldoDoses, row.custoUnitario, row.status, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPartida(id, patch) {
      await conn.query(
        "UPDATE semen_partidas SET saldo_doses = ?, custo_unitario = ?, status = ?, central_origem = ?, reprodutor_texto = ? WHERE id = ?",
        [patch.saldoDoses, patch.custoUnitario, patch.status, patch.centralOrigem, patch.reprodutorTexto, id],
      );
    },
    async inserirMovimento(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_movimentacoes
          (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.partidaId, row.userId, row.fazendaId, row.tipo, row.dataEntrada, row.quantidadeDoses, row.custoTotal, row.custoUnitario, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async reservarOperacao(row) {
      try {
        await conn.query(
          "INSERT INTO semen_entrada_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash, novaEntrada) VALUES (?, ?, ?, ?, ?, 0)",
          [row.userId, row.chave, row.fazendaId, row.executorUserId, row.conteudoHash],
        );
        return { situacao: "nova" as const };
      } catch (erro) {
        if (!chaveDuplicada(erro)) throw erro;
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT conteudoHash, partidaId, movimentacaoId, saldoAtual, custoMedioAtual, novaEntrada FROM semen_entrada_operacoes WHERE userId = ? AND chave = ? FOR UPDATE",
          [row.userId, row.chave],
        );
        const linha = linhas[0];
        if (!linha || String(linha.conteudoHash) !== row.conteudoHash) return { situacao: "divergente" as const };
        if (linha.partidaId == null || linha.movimentacaoId == null) throw new EntradaAindaPendente();
        return {
          situacao: "repetida" as const,
          partidaId: Number(linha.partidaId),
          movimentacaoId: Number(linha.movimentacaoId),
          saldoAtual: Number(linha.saldoAtual),
          custoMedioAtual: linha.custoMedioAtual == null ? null : String(linha.custoMedioAtual),
          novaEntrada: Number(linha.novaEntrada) === 1,
        };
      }
    },
    async concluirOperacao(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `UPDATE semen_entrada_operacoes
         SET partidaId = ?, movimentacaoId = ?, saldoAtual = ?, custoMedioAtual = ?, novaEntrada = ?
         WHERE userId = ? AND chave = ? AND partidaId IS NULL`,
        [row.partidaId, row.movimentacaoId, row.saldoAtual, row.custoMedioAtual, row.novaEntrada ? 1 : 0, row.userId, row.chave],
      );
      if (Number(resultado.affectedRows) !== 1) throw new Error("entrada de sêmen não vinculada");
    },
  };
}
function mapearAnimal(linha: RowDataPacket) {
  return {
    id: Number(linha.id), userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    status: linha.status == null ? null : String(linha.status),
    sexo: linha.sexo == null ? null : String(linha.sexo),
    castrado: linha.castrado == null ? null : Number(linha.castrado),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    dataNascimento: linha.dataNascimento == null ? null : String(linha.dataNascimento).slice(0, 10),
    brinco: linha.brinco == null ? null : String(linha.brinco),
    nome: linha.nome == null ? null : String(linha.nome),
  };
}
function mapearPartida(linha: RowDataPacket) {
  return {
    id: Number(linha.id), userId: Number(linha.user_id), fazendaId: Number(linha.fazenda_id),
    reprodutorKey: String(linha.reprodutor_key), partida: String(linha.partida),
    saldoDoses: Number(linha.saldo_doses), custoUnitario: linha.custo_unitario == null ? null : String(linha.custo_unitario),
    centralOrigem: linha.central_origem == null ? null : String(linha.central_origem),
    reprodutorTexto: linha.reprodutor_texto == null ? null : String(linha.reprodutor_texto),
    status: String(linha.status),
  };
}
