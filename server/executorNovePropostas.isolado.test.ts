/**
 * Ensaio das nove alterações.
 * O esquema abaixo NÃO é cópia da fazenda.
 * Comprovado pela leitura: tabelas de base presentes, peças novas ausentes,
 * índice da 0060 presente, 0070 ausente, fazenda nula em abastecimento.
 * Reconstruído por inferência: só as colunas que os arquivos tocam.
 * Artificial: uma manutenção sem fazenda e cinco abastecimentos sem fazenda.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { CONTAINER_OPERACIONAL } from "./isolamentoMysql";
import { aplicarConjuntoMinimo, aplicarProposta, CONJUNTO_MINIMO } from "./executorNovePropostas";

const url = new URL(process.env.DATABASE_URL ?? "mysql://root:ausente@127.0.0.1:9/ausente");
const porta = Number(url.port || 3306);
const banco = "fd_h4ce_nove";
const container = process.env.FD_CONTAINER ?? "";
const alvo = {
  host: url.hostname,
  port: porta,
  database: banco,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  container,
};

function caminho(codigo: string) {
  const item = CONJUNTO_MINIMO.find(atual => atual.codigo === codigo);
  if (!item) throw new Error(codigo);
  return item.arquivo;
}

async function admin() {
  return mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    multipleStatements: true,
  });
}

async function noBanco() {
  return mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    database: banco,
  });
}

async function esperarMysql() {
  const inicio = Date.now();
  let ultimo = "sem resposta";
  while (Date.now() - inicio < 40_000) {
    try {
      const conn = await admin();
      await conn.query("SELECT 1");
      await conn.end();
      return;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : "falha";
      await new Promise(resolver => setTimeout(resolver, 1000));
    }
  }
  throw new Error(`MySQL descartável indisponível: ${ultimo}`);
}

async function recriar() {
  const conn = await admin();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await conn.query(`CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${banco}\``);
    await conn.query(`
      CREATE TABLE manutencoes (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        chaveOperacao VARCHAR(80) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY manutencoes_chave_operacao_uq (userId, chaveOperacao)
      );
      INSERT INTO manutencoes (userId, chaveOperacao) VALUES (1, NULL);
      CREATE TABLE abastecimentos (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        fazendaId INT NULL,
        PRIMARY KEY (id)
      );
      INSERT INTO abastecimentos (userId, fazendaId) VALUES (1, NULL), (1, NULL), (1, NULL), (1, NULL), (1, NULL);
      CREATE TABLE semen_partidas (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        fazenda_id INT NOT NULL,
        reprodutor_key VARCHAR(80) NOT NULL,
        partida VARCHAR(80) NOT NULL,
        PRIMARY KEY (id)
      );
      INSERT INTO semen_partidas (user_id, fazenda_id, reprodutor_key, partida) VALUES (1, 10, 'touro-a', 'lote-1');
      CREATE TABLE animais (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        fazendaId INT NULL,
        brinco VARCHAR(50) NULL,
        status VARCHAR(20) NOT NULL,
        PRIMARY KEY (id)
      );
      INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'B001', 'ativo');
      CREATE TABLE nutricao_fornecimentos (id INT NOT NULL AUTO_INCREMENT, userId INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE nutricao_batidas (id INT NOT NULL AUTO_INCREMENT, userId INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE nutricao_cocho_leituras (id INT NOT NULL AUTO_INCREMENT, userId INT NOT NULL, PRIMARY KEY (id));
    `);
  } finally {
    await conn.end();
  }
}

async function total(sql: string) {
  const conn = await noBanco();
  try {
    const [linhas] = await conn.query<mysql.RowDataPacket[]>(sql);
    return Number(linhas[0]?.total ?? 0);
  } finally {
    await conn.end();
  }
}

describe("nove alterações no MySQL descartável", () => {
  beforeAll(esperarMysql);
  beforeEach(recriar);
  afterAll(async () => {
    const conn = await admin();
    await conn.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await conn.end();
  });

  it("aplica as nove, conserva o histórico artificial e recusa a repetição", async () => {
    const primeira = await aplicarConjuntoMinimo(alvo);
    expect(primeira.map(item => item.situacao)).toEqual(Array(9).fill("concluida"));
    expect(new Set(primeira.map(item => item.hash)).size).toBe(9);

    const conn = await noBanco();
    try {
      await expect(conn.query(
        "INSERT INTO reproducao_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash) VALUES (1, 'op-1', 10, 1, 'abc')",
      )).resolves.toBeTruthy();
      await expect(conn.query(
        "INSERT INTO reproducao_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash) VALUES (1, 'op-1', 10, 1, 'abc')",
      )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      await expect(conn.query(
        "INSERT INTO semen_entrada_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash) VALUES (1, 'ent-1', 10, 1, 'abc')",
      )).resolves.toBeTruthy();
      await expect(conn.query(
        "INSERT INTO semen_entrada_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash) VALUES (1, 'ent-1', 11, 1, 'xyz')",
      )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      await expect(conn.query(
        "INSERT INTO semen_partidas (user_id, fazenda_id, reprodutor_key, partida) VALUES (1, 10, 'touro-a', 'lote-1')",
      )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      await expect(conn.query(
        "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'B001', 'ativo')",
      )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      await expect(conn.query(
        "INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 11, 'B001', 'ativo')",
      )).resolves.toBeTruthy();
    } finally {
      await conn.end();
    }

    expect(await total("SELECT COUNT(*) AS total FROM abastecimentos WHERE fazendaId IS NULL")).toBe(5);
    expect(await total("SELECT COUNT(*) AS total FROM abastecimentos WHERE chaveOperacao IS NULL")).toBe(5);
    expect(await total("SELECT COUNT(*) AS total FROM manutencoes WHERE fazendaId IS NULL")).toBe(1);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'conteudoOriginal'")).toBe(0);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manutencoes' AND INDEX_NAME = 'manutencoes_chave_operacao_uq'")).toBe(2);
    expect(await total("SELECT COUNT(*) AS total FROM fd_livro_propostas WHERE estado = 'concluida'")).toBe(9);

    const segunda = await aplicarConjuntoMinimo(alvo);
    expect(segunda.map(item => item.situacao)).toEqual(Array(9).fill("repetida"));
    expect(await total("SELECT COUNT(*) AS total FROM fd_livro_propostas WHERE estado = 'concluida'")).toBe(9);
  }, 120_000);

  it("para o conjunto quando a 0073 está pela metade e não chega na leitura de cocho", async () => {
    const conn = await noBanco();
    await conn.query("ALTER TABLE nutricao_fornecimentos ADD COLUMN chaveOperacao varchar(80) NULL");
    await conn.end();
    const resultados = await aplicarConjuntoMinimo(alvo);
    expect(resultados.at(-1)?.codigo).toBe("0073");
    expect(resultados.at(-1)?.situacao).toBe("interrompida");
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nutricao_cocho_leituras' AND COLUMN_NAME = 'chaveOperacao'")).toBe(0);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nutricao_batidas' AND COLUMN_NAME = 'chaveOperacao'")).toBe(0);
  }, 120_000);

  it("recusa o índice incompatível do abastecimento sem criar a coluna", async () => {
    const conn = await noBanco();
    await conn.query("CREATE INDEX abastecimentos_chave_operacao_uq ON abastecimentos (userId)");
    await conn.end();
    const resultado = await aplicarProposta(alvo, "0076", caminho("0076"));
    expect(resultado.situacao).toBe("interrompida");
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'abastecimentos' AND COLUMN_NAME = 'chaveOperacao'")).toBe(0);
  });

  it("bloqueia a partida duplicada e conserva as duas linhas", async () => {
    const conn = await noBanco();
    await conn.query("INSERT INTO semen_partidas (user_id, fazenda_id, reprodutor_key, partida) VALUES (1, 10, 'touro-a', 'lote-1')");
    await conn.end();
    const resultado = await aplicarProposta(alvo, "0069", caminho("0069"));
    expect(resultado.situacao).toBe("interrompida");
    expect(await total("SELECT COUNT(*) AS total FROM semen_partidas")).toBe(2);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'semen_partidas' AND INDEX_NAME = 'semen_partidas_uq'")).toBe(0);
  });

  it("bloqueia o brinco ativo repetido e conserva os dois animais", async () => {
    const conn = await noBanco();
    await conn.query("INSERT INTO animais (userId, fazendaId, brinco, status) VALUES (1, 10, 'B001', 'ativo')");
    await conn.end();
    const resultado = await aplicarProposta(alvo, "0071", caminho("0071"));
    expect(resultado.situacao).toBe("interrompida");
    expect(await total("SELECT COUNT(*) AS total FROM animais")).toBe(2);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animais' AND COLUMN_NAME = 'brinco_ativo_chave'")).toBe(0);
  });

  it("falha a conexão antes de registrar conclusão", async () => {
    await expect(aplicarProposta(
      { ...alvo, port: 9, database: "fd_teste_nao_conectar" },
      "0067",
      caminho("0067"),
    )).rejects.toThrow();
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fd_livro_propostas'")).toBe(0);
  });

  it("recusa a fazenda, a porta 3306, o container operacional e a conta de auditoria", async () => {
    const arquivo = caminho("0067");
    await expect(aplicarProposta({ ...alvo, port: 3306 }, "0067", arquivo)).rejects.toThrow(/operacional/);
    await expect(aplicarProposta({ ...alvo, database: "fazenda_digital" }, "0067", arquivo)).rejects.toThrow(/operacional/);
    await expect(aplicarProposta({ ...alvo, container: CONTAINER_OPERACIONAL }, "0067", arquivo)).rejects.toThrow(/operacional/);
    await expect(aplicarProposta({ ...alvo, user: "fd_auditoria_ro" }, "0067", arquivo)).rejects.toThrow(/auditoria/);
  });

  it("deixa a 0060, a 0070 e a 0077 fora do conjunto mínimo", async () => {
    const fora = await Promise.all([
      aplicarProposta(alvo, "0060", "drizzle/migrations/0060_manutencoes_chave_operacao.sql"),
      aplicarProposta(alvo, "0070", "drizzle/propostas/0070_animais_brinco_ativo_uq.sql"),
      aplicarProposta(alvo, "0077", "drizzle/propostas/0077_fotografia_chave_operacao.sql"),
    ]);
    expect(fora.map(item => item.situacao)).toEqual(["recusada", "recusada", "recusada"]);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animais' AND COLUMN_NAME = 'brinco_ativo_chave'")).toBe(0);
    expect(await total("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'conteudoOriginal'")).toBe(0);
  });
});
