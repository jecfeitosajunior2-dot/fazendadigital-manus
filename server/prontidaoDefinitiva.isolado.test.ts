/**
 * Falha fechada da prontidão. Só no MySQL descartável do ensaio.
 * Não altera o banco definitivo: os casos quebrados usam outro schema.
 */
import { afterAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { verificarPecasProposta, verificarProntidaoDefinitiva } from "./prontidaoDefinitiva";
import type { SchemaQuery } from "./verifyDatabaseSchema";

const porta = Number(process.env.FD_H4CH_PORT ?? "9");
const banco = process.env.FD_H4CH_DATABASE ?? "";
const container = process.env.FD_H4CH_CONTAINER ?? "";
const user = process.env.FD_H4CH_USER ?? "root";
const password = process.env.FD_H4CH_PASSWORD ?? "";

function alvo(database: string, port = porta) {
  return { host: "127.0.0.1", port, database, user, password, container };
}

const BASE = `
CREATE TABLE animais (
  id int primary key,
  userId int not null,
  fazendaId int null,
  brinco varchar(50) null,
  status varchar(20) null,
  brinco_ativo_chave varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    GENERATED ALWAYS AS (
      CASE WHEN status = 'ativo' AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
        THEN LOWER(TRIM(brinco)) ELSE NULL END
    ) STORED,
  UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave)
);
CREATE TABLE estoque_movimentacao_chaves (
  id int primary key,
  titular_user_id int not null,
  chave varchar(80) not null,
  conteudo_hash char(64) not null,
  UNIQUE KEY estoque_mov_chave_uq (titular_user_id, chave)
);
CREATE TABLE nutricao_fornecimentos (
  id int primary key,
  userId int not null,
  chaveOperacao varchar(80) null,
  conteudoHash varchar(64) null,
  UNIQUE KEY nutricao_fornecimentos_user_chave_uq (userId, chaveOperacao)
);
CREATE TABLE nutricao_batidas (
  id int primary key,
  userId int not null,
  chaveOperacao varchar(80) null,
  conteudoHash varchar(64) null,
  UNIQUE KEY nutricao_batidas_user_chave_uq (userId, chaveOperacao)
);
CREATE TABLE nutricao_cocho_leituras (
  id int primary key,
  userId int not null,
  chaveOperacao varchar(80) null,
  conteudoHash varchar(64) null,
  UNIQUE KEY nutricao_cocho_leituras_user_chave_uq (userId, chaveOperacao)
);
CREATE TABLE manutencoes (
  id int primary key,
  userId int not null,
  fazendaId int null,
  KEY manutencoes_user_fazenda_idx (userId, fazendaId)
);
CREATE TABLE abastecimentos (
  id int primary key,
  userId int not null,
  chaveOperacao varchar(80) null,
  UNIQUE KEY abastecimentos_chave_operacao_uq (userId, chaveOperacao)
);
`;

const criados: string[] = [];

async function admin() {
  if (!banco || !password || porta === 9) {
    throw new Error("Ensaio H4-CH sem banco descartável. Nada foi consultado na fazenda.");
  }
  return mysql.createConnection({
    host: "127.0.0.1",
    port: porta,
    user,
    password,
    multipleStatements: true,
  });
}

async function pecasDe(nome: string, sql: string) {
  const conexao = await admin();
  criados.push(nome);
  try {
    await conexao.query(`DROP DATABASE IF EXISTS \`${nome}\``);
    await conexao.query(`CREATE DATABASE \`${nome}\``);
    await conexao.query(`USE \`${nome}\``);
    await conexao.query(sql);
    const query: SchemaQuery = async (comando) => conexao.query(comando);
    return await verificarPecasProposta(query);
  } finally {
    await conexao.end();
  }
}

describe("prontidão definitiva", () => {
  afterAll(async () => {
    if (criados.length === 0 || porta === 9) return;
    const conexao = await admin();
    try {
      for (const nome of criados) {
        if (nome === banco) continue;
        await conexao.query(`DROP DATABASE IF EXISTS \`${nome}\``);
      }
    } finally {
      await conexao.end();
    }
  });

  it("banco completo passa modelo e propostas", async () => {
    const resultado = await verificarProntidaoDefinitiva(alvo(banco));
    expect(resultado.ok).toBe(true);
    expect(resultado.faltas).toEqual([]);
  });

  it("coluna ausente é nomeada", async () => {
    const sql = BASE
      .replace(/,\s*brinco_ativo_chave varchar\(50\)[\s\S]*?STORED/, "")
      .replace(/,\s*UNIQUE KEY animais_brinco_ativo_fazenda_uq \(userId, fazendaId, brinco_ativo_chave\)/, "");
    const resultado = await pecasDe("fd_h4ch_coluna", sql);
    expect(resultado.ok).toBe(false);
    expect(resultado.faltas.some((falta) => falta.includes("animais.brinco_ativo_chave"))).toBe(true);
  });

  it("índice ausente é nomeado", async () => {
    const sql = BASE.replace(",\n  UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave)", "");
    const resultado = await pecasDe("fd_h4ch_indice", sql);
    expect(resultado.ok).toBe(false);
    expect(resultado.faltas.some((falta) => falta.includes("animais_brinco_ativo_fazenda_uq"))).toBe(true);
  });

  it("índice incompatível mostra a definição encontrada", async () => {
    const sql = BASE.replace(
      "UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave)",
      "UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId)",
    );
    const resultado = await pecasDe("fd_h4ch_incompativel", sql);
    expect(resultado.ok).toBe(false);
    expect(resultado.faltas.some((falta) => falta.includes("Índice incompatível") && falta.includes("animais_brinco_ativo_fazenda_uq"))).toBe(true);
  });

  it("estrutura parcial aponta a peça que falta", async () => {
    const sql = BASE.replace(
      `chaveOperacao varchar(80) null,
  conteudoHash varchar(64) null,
  UNIQUE KEY nutricao_fornecimentos_user_chave_uq (userId, chaveOperacao)`,
      "chaveOperacao varchar(80) null",
    );
    const resultado = await pecasDe("fd_h4ch_parcial", sql);
    expect(resultado.ok).toBe(false);
    expect(resultado.faltas.some((falta) => falta.includes("nutricao_fornecimentos.conteudoHash"))).toBe(true);
    expect(resultado.faltas.some((falta) => falta.includes("nutricao_fornecimentos_user_chave_uq"))).toBe(true);
  });

  it("banco inacessível não libera e não altera nada", async () => {
    const resultado = await verificarProntidaoDefinitiva({
      host: "127.0.0.1",
      port: 9,
      database: "fd_h4ch_ausente",
      user: "root",
      password: "fechada",
      container: "fd-h4ch-vazio",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.faltas).toEqual(["Banco inacessível."]);
  });
});
