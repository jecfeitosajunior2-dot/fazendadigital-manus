import { afterAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { lerEsquemaDescartavel } from "./leituraEsquema";
import { aplicar0073, diagnosticar0073 } from "./propostaNutricao0073";

const url = new URL(process.env.DATABASE_URL ?? "mysql://root:ausente@127.0.0.1:9/ausente");
const porta = Number(url.port || 3306);
const modelo = url.pathname.replace(/^\//, "");
const banco = "fd_h4ca_0073";
const container = process.env.FD_CONTAINER ?? "";
const alvo = {
  host: url.hostname,
  port: porta,
  database: banco,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  container,
};
const arquivo = "drizzle/propostas/0073_nutricao_idempotencia.sql";

afirmarBancoDescartavel({
  host: alvo.host,
  port: alvo.port,
  database: modelo,
  container,
});

async function admin() {
  return mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    multipleStatements: true,
  });
}

async function recriar() {
  const conn = await admin();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await conn.query(`CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${banco}\``);
    await conn.query(`
      CREATE TABLE nutricao_fornecimentos (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        PRIMARY KEY (id)
      )
    `);
    await conn.query(`
      CREATE TABLE nutricao_batidas (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        PRIMARY KEY (id)
      )
    `);
  } finally {
    await conn.end();
  }
}

describe("proposta 0073 no descartável", () => {
  beforeEach(async () => {
    await recriar();
  });

  afterAll(async () => {
    const conn = await admin();
    await conn.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await conn.end();
  });

  it("a pré-verificação não grava e libera a base limpa", async () => {
    const antes = await diagnosticar0073(alvo);
    const depois = await diagnosticar0073(alvo);
    expect(antes.decisao).toBe("aplicar");
    expect(depois).toEqual(antes);
  });

  it("aplica a 0073 limpa e recusa a segunda execução", async () => {
    const primeira = await aplicar0073(alvo, arquivo);
    expect(primeira.situacao).toBe("concluida");
    const segunda = await aplicar0073(alvo, arquivo);
    expect(segunda.situacao).toBe("repetida");
    const conferido = await diagnosticar0073(alvo);
    expect(conferido.decisao).toBe("ja_completa");
  });

  it("interrompe a retomada quando só o primeiro comando passou", async () => {
    const conn = await mysql.createConnection({
      host: alvo.host,
      port: alvo.port,
      user: alvo.user,
      password: alvo.password,
      database: banco,
    });
    await conn.query("ALTER TABLE nutricao_fornecimentos ADD COLUMN chaveOperacao varchar(80) NULL");
    await conn.end();
    const resultado = await aplicar0073(alvo, arquivo);
    expect(resultado.situacao).toBe("interrompida");
    expect(resultado.motivo).toContain("parcial");
    const diag = await diagnosticar0073(alvo);
    expect(diag.pecas.find(peca => peca.tabela === "nutricao_batidas" && peca.peca === "chaveOperacao")?.situacao).toBe("ausente");
  });

  it("recusa índice incompatível e chave repetida sem apagar linha", async () => {
    const conn = await mysql.createConnection({
      host: alvo.host,
      port: alvo.port,
      user: alvo.user,
      password: alvo.password,
      database: banco,
      multipleStatements: true,
    });
    await conn.query(`
      ALTER TABLE nutricao_fornecimentos
        ADD COLUMN chaveOperacao varchar(80) NULL,
        ADD COLUMN conteudoHash varchar(64) NULL,
        ADD KEY nutricao_fornecimentos_user_chave_uq (chaveOperacao);
      ALTER TABLE nutricao_batidas
        ADD COLUMN chaveOperacao varchar(80) NULL,
        ADD COLUMN conteudoHash varchar(64) NULL;
      INSERT INTO nutricao_batidas (userId, chaveOperacao) VALUES (1, 'bat-1'), (1, 'bat-1');
    `);
    await conn.end();
    const diag = await diagnosticar0073(alvo);
    expect(diag.decisao).toBe("interromper");
    expect(diag.duplicidades).toBe(1);
    const resultado = await aplicar0073(alvo, arquivo);
    expect(resultado.situacao).toBe("interrompida");
    const ainda = await mysql.createConnection({
      host: alvo.host,
      port: alvo.port,
      user: alvo.user,
      password: alvo.password,
      database: banco,
    });
    const [linhas] = await ainda.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM nutricao_batidas");
    expect(Number(linhas[0]?.n)).toBe(2);
    await ainda.end();
  });

  it("falha de conexão não grava livro", async () => {
    await expect(aplicar0073({ ...alvo, port: 9, database: "fd_teste_nao_conectar" }, arquivo)).rejects.toThrow();
  });

  it("a leitura do esquema é consulta e não fala do operacional", async () => {
    const leitura = await lerEsquemaDescartavel({ ...alvo, database: banco });
    expect(leitura.versao.startsWith("8.")).toBe(true);
    expect(leitura.tabelas).toContain("nutricao_fornecimentos");
    expect(leitura.situacaoOperacional).toBe("NÃO VERIFICADO NO OPERACIONAL");
    expect(() => afirmarBancoDescartavel({ ...alvo, port: 3306 })).toThrow(/porta/);
  });
});
