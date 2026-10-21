/**
 * Preparação 3C.4.8 — banco isolado + dados fictícios.
 * Não grava em fazenda_digital. Não registra pagamentos.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const HOMOLOG = "fazenda_digital_homolog_3c47";
const OPERACIONAL = "fazenda_digital";
const EMAIL = "homolog.3c47@teste.local";
const SENHA = "Homolog3c47!Ui";
const NOME_USER = "Usuário Homolog 3C.4.7";
const NOME_FAZENDA = "Fazenda Homolog 3C.4.7";
const NOME_FORNECEDOR = "Fornecedor Homolog";
const DESC_TITULO = "Título homologação interface 3C.4.8";

function parseEnv(file: string) {
  if (!existsSync(file)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

function credenciais() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL ausente");
  const u = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("ABORT: host não é MySQL local");
  }
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

async function snapshot(admin: mysql.Connection) {
  const titulos = await q<{ id: number; estado: string; condicao_status: string; valor_original: string }[]>(
    admin,
    `SELECT id, estado, condicao_status, valor_original FROM \`${OPERACIONAL}\`.financeiro_titulos WHERE id IN (80,84) ORDER BY id`,
  );
  const contagens = {
    titulos: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_titulos`))[0]?.n),
    parcelas: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_parcelas`))[0]?.n),
    liquidacoes: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_liquidacoes`))[0]?.n),
    contasV2: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_contas`))[0]?.n),
    users: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.users`))[0]?.n),
    emailHomologNoOperacional: Number((await q<{ n: number }[]>(
      admin,
      `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.users WHERE email = ?`,
      [EMAIL],
    ))[0]?.n),
  };
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${OPERACIONAL}\`.financeiro_titulos, \`${OPERACIONAL}\`.financeiro_parcelas, \`${OPERACIONAL}\`.financeiro_liquidacoes, \`${OPERACIONAL}\`.financeiro_contas, \`${OPERACIONAL}\`.users, \`${OPERACIONAL}\`.pessoas, \`${OPERACIONAL}\`.fazendas`,
  );
  return {
    titulos80_84: titulos,
    contagens,
    checksums: Object.fromEntries(
      (chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum]),
    ),
  };
}

async function main() {
  const cred = credenciais();
  const admin = await mysql.createConnection(cred);
  try {
    const [dbAdmin] = await q<{ db: string | null }[]>(admin, "SELECT DATABASE() db");
    if (dbAdmin.db && dbAdmin.db !== OPERACIONAL && dbAdmin.db !== null) {
      // conexão admin sem database selecionado é o ideal
    }

    const antes = await snapshot(admin);
    if (antes.titulos80_84.map(t => t.id).join(",") !== "80,84") {
      throw new Error("ABORT: títulos 80/84 não conferíveis no operacional");
    }
    if (antes.contagens.emailHomologNoOperacional !== 0) {
      throw new Error("ABORT: e-mail de homologação já existe no operacional");
    }

    await admin.query(`DROP DATABASE IF EXISTS \`${HOMOLOG}\``);
    await admin.query(`CREATE DATABASE \`${HOMOLOG}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

    const tabelas = await q<{ TABLE_NAME: string }[]>(
      admin,
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [OPERACIONAL],
    );
    await admin.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { TABLE_NAME } of tabelas) {
      await admin.query(`CREATE TABLE \`${HOMOLOG}\`.\`${TABLE_NAME}\` LIKE \`${OPERACIONAL}\`.\`${TABLE_NAME}\``);
      const n = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${HOMOLOG}\`.\`${TABLE_NAME}\``))[0]?.n);
      if (n !== 0) throw new Error(`Homolog ${TABLE_NAME} não está vazio`);
    }
    await admin.query("SET FOREIGN_KEY_CHECKS = 1");

    const [dbH] = await q<{ db: string }[]>(admin, `SELECT DATABASE() db FROM DUAL`);
    // força uso explícito do homolog nas gravações
    await admin.query(`USE \`${HOMOLOG}\``);
    const [dbUsado] = await q<{ db: string }[]>(admin, "SELECT DATABASE() db");
    if (dbUsado.db !== HOMOLOG) throw new Error(`ABORT: USE falhou, conectado em ${dbUsado.db}`);
    if (HOMOLOG === OPERACIONAL) throw new Error("ABORT: nome isolado igual ao operacional");

    const hash = await bcrypt.hash(SENHA, 12);
    await admin.query(
      `INSERT INTO users (openId, name, email, loginMethod, passwordHash, role)
       VALUES (?, ?, ?, 'local', ?, 'admin')`,
      [`local:${EMAIL}`, NOME_USER, EMAIL, hash],
    );
    const userId = Number((await q<{ id: number }[]>(admin, "SELECT id FROM users WHERE email = ? LIMIT 1", [EMAIL]))[0]?.id);
    if (!userId) throw new Error("Falha ao criar usuário fictício");

    await admin.query(`INSERT INTO fazendas (userId, nome, cidade, estado) VALUES (?, ?, 'Homolog', 'GO')`, [
      userId,
      NOME_FAZENDA,
    ]);
    const fazendaId = Number((await q<{ id: number }[]>(admin, "SELECT id FROM fazendas WHERE userId = ? LIMIT 1", [userId]))[0]?.id);

    await admin.query(
      `INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, ?, 'fornecedor', 1)`,
      [userId, NOME_FORNECEDOR],
    );
    const pessoaId = Number((await q<{ id: number }[]>(admin, "SELECT id FROM pessoas WHERE user_id = ? LIMIT 1", [userId]))[0]?.id);

    await admin.query(
      `INSERT INTO financeiro_titulos
        (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot,
         fazenda_origem_id, origem_tipo, descricao, data_competencia, valor_original)
       VALUES (?, 'pagar', 'ativo', 'a_definir', ?, ?, ?, 'manual', ?, '2026-10-20', '250.00')`,
      [userId, pessoaId, NOME_FORNECEDOR, fazendaId, DESC_TITULO],
    );
    const tituloId = Number((await q<{ id: number }[]>(
      admin,
      "SELECT id FROM financeiro_titulos WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [userId],
    ))[0]?.id);

    const homologContagens = {
      users: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM users"))[0]?.n),
      fazendas: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM fazendas"))[0]?.n),
      pessoas: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM pessoas"))[0]?.n),
      titulos: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM financeiro_titulos"))[0]?.n),
      parcelas: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM financeiro_parcelas"))[0]?.n),
      contasV2: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM financeiro_contas"))[0]?.n),
      liquidacoes: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM financeiro_liquidacoes"))[0]?.n),
    };
    if (homologContagens.parcelas !== 0 || homologContagens.contasV2 !== 0 || homologContagens.liquidacoes !== 0) {
      throw new Error("ABORT: homolog não deveria ter parcela, conta V2 ou liquidação");
    }

    const depois = await snapshot(admin);
    const isolamentoOk = JSON.stringify(antes.checksums) === JSON.stringify(depois.checksums)
      && JSON.stringify(antes.titulos80_84) === JSON.stringify(depois.titulos80_84)
      && depois.contagens.emailHomologNoOperacional === 0;

    if (!isolamentoOk) throw new Error("ABORT: operacional mudou após preparar homolog");

    console.log(JSON.stringify({
      ok: true,
      bancoIsolado: HOMOLOG,
      tabelasCopiadas: tabelas.length,
      databaseAdminAntesDoUse: dbAdmin.db,
      databaseAposUse: dbUsado.db,
      ids: { userId, fazendaId, pessoaId, tituloId },
      homologContagens,
      isolamentoOperacional: isolamentoOk,
      operacionalAntes: antes,
      operacionalDepois: depois,
      loginEmail: EMAIL,
    }, null, 2));
  } finally {
    await admin.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
