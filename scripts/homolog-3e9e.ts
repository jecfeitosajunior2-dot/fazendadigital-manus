/**
 * Homologação 3E.9E — ponta a ponta controlada (serviço integrado, não a rota operacional).
 * Somente fazenda_digital_test_3e8e. Não apaga cenários anteriores.
 * Não altera a flag compartilhada. Não aplica migration. Não faz db:push.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createConfirmarVendaFinanceiroService } from "../server/confirmarVendaFinanceiro";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import type { ConfirmarVendaFinanceiroInput } from "../server/confirmarVendaFinanceiro";
import {
  createCancelarVendaFinanceiroService,
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO,
  MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO,
  MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS,
} from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";
import { createFinanceiroNucleoMysqlStore, createFinanceiroNucleoService } from "../server/financeiroNucleo";
import { MSG_VENDA_CANCELAR_JA_CANCELADA } from "../server/cancelarVenda";
import { confirmarVendaIntegradaSeAtiva } from "../server/vendaConfirmacaoIntegrada";
import { MSG_FIN_TITULO_CANCELADO } from "../shared/financeiroNucleo";
import { toCentavos } from "../shared/financeiroMoeda";
import { MSG_VENDA_CONFLITO_IDEMPOTENCIA } from "../shared/vendaFinanceiro";
import { MSG_VENDA_ARROBA_REQUER_MIGRATION } from "../shared/vendaComercial";
import {
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
} from "../shared/vendaIntegracao";
import {
  linkOrigemContasAReceber,
  referenciaOrigemVendaAnimais,
  rotuloOrigemTitulo,
} from "../client/src/lib/contasAReceberDetalhe";
import { textoListagemOrigemVendaAnimais } from "../client/src/lib/contasAPagarListagem";
import { compraVendaVendaDetalhePath } from "../client/src/lib/compraVendaCompradores";

const TESTE = "fazenda_digital_test_3e8e";
const TESTE_3E5B = "fazenda_digital_test_3e5b";
const OPERACIONAL = "fazenda_digital";
const HOMOLOG_3C47 = "fazenda_digital_homolog_3c47";
const HOMOLOG_3B2A3 = "fazenda_digital_homolog_3b2a3";
const PROTEGIDOS = [OPERACIONAL, HOMOLOG_3C47, HOMOLOG_3B2A3, TESTE_3E5B] as const;
const USER_A = 940001;
const USER_B = 940002;
const RUN = Date.now().toString(36);

function chaveRun(key: string) {
  return key.replace(/^ven-3e9e-/, `ven-3e9e-${RUN}-`).replace(/^rec-3e9e-/, `rec-3e9e-${RUN}-`).replace(/^est-3e9e-/, `est-3e9e-${RUN}-`);
}
const PREFIXOS_ANTERIORES = [
  "ven-3e8e%", "ven-3e8f%", "ven-3e8g%", "ven-3e8h%", "ven-3e8i%", "ven-3e9b1%", "ven-3e9b2%",
] as const;

type Cenario = { id: string; nome: string; ok: boolean; detalhe: Record<string, unknown>; erro?: string };

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
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não é MySQL local");
  if ((u.pathname || "").replace(/^\//, "").split("?")[0] !== OPERACIONAL) {
    throw new Error("ABORT: URL operacional inesperada");
  }
  return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

async function q<T extends mysql.RowDataPacket[]>(conn: mysql.Connection | mysql.Pool, sqlText: string, params: unknown[] = []) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function assertTeste(nome: string | null) {
  if (nome !== TESTE) throw new Error(`ABORT: conexão em ${nome}, esperado ${TESTE}`);
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function erroSqlCru(texto: string) {
  return /Failed query|ER_LOCK_DEADLOCK|Deadlock found when trying to get lock|ER_DUP_ENTRY|Duplicate entry|Unknown column/i.test(texto);
}

function isLockWait(texto: string) {
  return /ER_LOCK_WAIT_TIMEOUT|Lock wait timeout exceeded|1205/i.test(texto);
}

function dataCivil(valor: string | Date | null | undefined): string {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const texto = String(valor ?? "");
  const iso = texto.match(/\d{4}-\d{2}-\d{2}/);
  return iso?.[0] ?? texto.slice(0, 10);
}

function settled<T>(r: PromiseSettledResult<T>) {
  if (r.status === "fulfilled") return { ok: true as const, value: r.value };
  return { ok: false as const, erro: msg(r.reason), sqlCru: erroSqlCru(msg(r.reason)), lockWait: isLockWait(msg(r.reason)) };
}

async function snapshotBanco(admin: mysql.Connection, schemaName: string) {
  const existe = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [schemaName]))[0]?.n);
  if (!existe) return { existe: false as const, schemaName };
  const count = async (tabela: string) => {
    const tem = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [schemaName, tabela]))[0]?.n);
    if (!tem) return null;
    return Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${schemaName}\`.\`${tabela}\``))[0]?.n);
  };
  const [chk] = await admin.query(
    `CHECKSUM TABLE \`${schemaName}\`.vendas, \`${schemaName}\`.animais, \`${schemaName}\`.financeiro_titulos, \`${schemaName}\`.financeiro_movimentos, \`${schemaName}\`.financeiro_liquidacoes`,
  );
  return {
    existe: true as const, schemaName,
    vendas: await count("vendas"), animais: await count("animais"),
    titulos: await count("financeiro_titulos"), movimentos: await count("financeiro_movimentos"),
    liquidacoes: await count("financeiro_liquidacoes"),
    checksums: Object.fromEntries((chk as Array<{ Table: string; Checksum: number | null }>).map(r => [String(r.Table).split(".").pop(), r.Checksum])),
  };
}

async function seedAnimal(pool: mysql.Pool, userId: number, fazendaId: number, brinco: string, extra: {
  pesoAtual?: number; brincoEletronico?: string | null;
} = {}) {
  const brincoRun = `${brinco}-${RUN}`;
  await pool.query(
    "INSERT INTO animais (`userId`, `brinco`, `brincoEletronico`, `sexo`, `status`, `fazendaId`, `pesoAtual`) VALUES (?, ?, ?, 'macho', 'ativo', ?, ?)",
    [userId, brincoRun, extra.brincoEletronico ?? null, fazendaId, extra.pesoAtual ?? null],
  );
  return Number((await q<{ id: number }[]>(pool, "SELECT id FROM animais WHERE brinco = ? AND userId = ? ORDER BY id DESC LIMIT 1", [brincoRun, userId]))[0]?.id);
}

async function vendaHistorica(pool: mysql.Pool, input: {
  userId: number; fazendaId: number; pessoaId: number; animalId: number; brinco: string; chave?: string | null;
}) {
  await pool.query(
    `INSERT INTO vendas (user_id, comprador, data, quantidade_animais, valor_total, status, fazenda_id, comprador_id, forma_precificacao, idempotency_key)
     VALUES (?, 'Histórico 3E9E', '2026-10-20', 1, '1500.00', 'concluido', ?, ?, 'cabeca', ?)`,
    [input.userId, input.fazendaId, input.pessoaId, input.chave ?? null],
  );
  const vendaId = Number((await q<{ id: number }[]>(pool, "SELECT LAST_INSERT_ID() id"))[0]?.id);
  await pool.query(
    `INSERT INTO venda_itens (user_id, venda_id, animal_id, brinco_snapshot, forma_precificacao, preco_unitario, valor_item)
     VALUES (?, ?, ?, ?, 'cabeca', '1500.00', '1500.00')`,
    [input.userId, vendaId, input.animalId, input.brinco],
  );
  await pool.query("UPDATE animais SET status = 'vendido' WHERE id = ? AND userId = ?", [input.animalId, input.userId]);
  await pool.query(
    `INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, destino, vendaId, status)
     VALUES (?, ?, ?, 'venda', '2026-10-20', 'Histórico 3E9E', ?, 'ativa')`,
    [input.userId, input.animalId, input.fazendaId, vendaId],
  );
  return vendaId;
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const bloqueios: string[] = [];
  const cred = credenciais();
  const admin = await mysql.createConnection({ host: cred.host, port: cred.port, user: cred.user, password: cred.password });
  let pool: mysql.Pool | null = null;
  let pool2: mysql.Pool | null = null;
  const reg = (c: Cenario) => {
    cenarios.push(c);
    if (!c.ok) problemas.push(`${c.id}: ${c.erro || JSON.stringify(c.detalhe)}`);
  };

  try {
    const [adminDb] = await q<{ db: string | null }[]>(admin, "SELECT DATABASE() db");
    if (adminDb.db && (PROTEGIDOS as readonly string[]).includes(adminDb.db)) {
      throw new Error(`ABORT: admin conectado em protegido ${adminDb.db}`);
    }
    const antesOp = await snapshotBanco(admin, OPERACIONAL);
    const antes47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const antesB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const antes5b = await snapshotBanco(admin, TESTE_3E5B);
    if (!antesOp.existe || !antes47.existe || !antes5b.existe) throw new Error("ABORT: banco protegido ausente");

    const colOp = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'`, [OPERACIONAL]))[0]?.n);
    const idxOp = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND INDEX_NAME = 'vendas_idem_uq'`, [OPERACIONAL]))[0]?.n);
    const colTeste = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendas' AND COLUMN_NAME = 'idempotency_key'`, [TESTE]))[0]?.n);

    const bancos = (await q<{ Database: string }[]>(admin, "SHOW DATABASES")).map(b => b.Database);
    if (!bancos.includes(TESTE)) throw new Error("ABORT: banco de teste 3e8e ausente");

    const likeAnteriores = PREFIXOS_ANTERIORES.map(() => "idempotency_key LIKE ?").join(" OR ");
    const vendasAnteriores = Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${TESTE}\`.vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    pool = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 8 });
    pool2 = mysql.createPool({ host: cred.host, port: cred.port, user: cred.user, password: cred.password, database: TESTE, connectionLimit: 4 });
    const [db1] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [db2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    assertTeste(db1.db);
    assertTeste(db2.db);

    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9E A')", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM fazendas WHERE userId = ?", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO fazendas (`userId`, `nome`) VALUES (?, 'Fazenda 3E9E B')", [USER_B]);
    }
    const fazendaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const fazendaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9E A', 'cliente', 1)", [USER_A]);
    }
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM pessoas WHERE user_id = ? AND tipo = 'cliente'", [USER_B]))[0]?.n)) {
      await pool.query("INSERT INTO pessoas (user_id, nome, tipo, ativo) VALUES (?, 'Cliente 3E9E B', 'cliente', 1)", [USER_B]);
    }
    const pessoaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_A]))[0]?.id);
    const pessoaB = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id LIMIT 1", [USER_B]))[0]?.id);
    if (!Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_contas WHERE user_id = ?", [USER_A]))[0]?.n)) {
      await pool.query("INSERT INTO financeiro_contas (user_id, nome, tipo, saldo_abertura, data_saldo_abertura, ativa) VALUES (?, 'Caixa 3E9E', 'caixa', '200000.00', '2026-10-01', 1)", [USER_A]);
    }
    const contaA = Number((await q<{ id: number }[]>(pool, "SELECT id FROM financeiro_contas WHERE user_id = ? ORDER BY id LIMIT 1", [USER_A]))[0]?.id);

    const d1 = drizzle(pool, { schema, mode: "default" as const });
    const d2 = drizzle(pool2, { schema, mode: "default" as const });
    const conf = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d1));
    const conf2 = createConfirmarVendaFinanceiroService(createConfirmarVendaFinanceiroMysqlStore(d2));
    const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d1));
    const canc2 = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(d2));
    const nucleo = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d1));
    const nucleo2 = createFinanceiroNucleoService(createFinanceiroNucleoMysqlStore(d2));

    const cabeca = (key: string, animalId: number, extra: Partial<ConfirmarVendaFinanceiroInput> = {}): ConfirmarVendaFinanceiroInput => ({
      idempotencyKey: chaveRun(key), fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca", itens: [{ animalId, precoUnitario: 1500 }], condicao: "a_vista", ...extra,
    });

    async function statusAnimal(id: number) {
      return (await q<{ status: string }[]>(pool!, "SELECT status FROM animais WHERE id = ?", [id]))[0]?.status;
    }
    async function baixasAtivas(id: number) {
      return Number((await q<{ n: number }[]>(pool!, "SELECT COUNT(*) n FROM animal_baixas WHERE animalId = ? AND status = 'ativa'", [id]))[0]?.n);
    }
    async function parcela(tituloId: number) {
      return Number((await q<{ id: number }[]>(pool!, "SELECT id FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero LIMIT 1", [tituloId]))[0]?.id);
    }
    async function liqsDoTitulo(tituloId: number) {
      return Number((await q<{ n: number }[]>(pool!, `SELECT COUNT(*) n FROM financeiro_liquidacoes l
        JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id
        JOIN financeiro_parcelas p ON p.id = a.parcela_id WHERE p.titulo_id = ?`, [tituloId]))[0]?.n);
    }
    async function efetiva(tituloId: number) {
      return Number((await q<{ n: number }[]>(pool!, `SELECT COUNT(*) n FROM financeiro_parcelas p
        JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
        JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
        WHERE p.titulo_id = ? AND l.tipo IN ('recebimento','pagamento')
          AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)`, [tituloId]))[0]?.n);
    }
    async function tituloOrigem(vendaId: number) {
      return (await q<{
        id: number; tipo: string; estado: string; origem_tipo: string; origem_id: number; origem_item_chave: string;
        valor_original: string; condicao_status: string;
      }[]>(pool!, `SELECT id, tipo, estado, origem_tipo, origem_id, origem_item_chave, valor_original, condicao_status
        FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ? AND origem_item_chave = 'principal'`, [vendaId]))[0];
    }

    const raiz = dirname(fileURLToPath(import.meta.url));
    const flagSrc = readFileSync(join(raiz, "../shared/vendaIntegracao.ts"), "utf8");
    const portaSrc = readFileSync(join(raiz, "../server/vendaConfirmacaoIntegrada.ts"), "utf8");
    const routerSrc = readFileSync(join(raiz, "../server/routers.ts"), "utf8");
    const confSrc = readFileSync(join(raiz, "../server/confirmarVendaFinanceiro.ts"), "utf8");
    const cancSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiro.ts"), "utf8");
    const mysqlCancSrc = readFileSync(join(raiz, "../server/cancelarVendaFinanceiroMysql.ts"), "utf8");
    const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");
    const appSrc = readFileSync(join(raiz, "../client/src/App.tsx"), "utf8");

    let rotaRecusou = "";
    try {
      await confirmarVendaIntegradaSeAtiva(createConfirmarVendaFinanceiroMysqlStore(d1), USER_A, cabeca("ven-3e9e-rota", 1));
    } catch (e) { rotaRecusou = msg(e); }

    reg({
      id: "SEG",
      nome: "Flag desligada, 0061 ausente no operacional, conexões no 3e8e",
      ok: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
        && flagSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
        && !flagSrc.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true")
        && colOp === 0 && idxOp === 0 && colTeste === 1
        && !journal.includes("0061_vendas_idempotency")
        && db1.db === TESTE && db2.db === TESTE
        && rotaRecusou.includes(MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA)
        && portaSrc.includes("recusarSeRotaNegada")
        && routerSrc.includes("confirmarVendaComercial")
        && routerSrc.includes("confirmarVendaIntegradaSeAtiva"),
      detalhe: {
        flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA, colOp, idxOp, colTeste, db1: db1.db, db2: db2.db,
        rotaRecusou, isolamento: "serviço createConfirmarVendaFinanceiroService; rota confirmarIntegrada recusa com flag false",
      },
    });

    const confAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-CONF01");
    const confVenda = await conf.confirmar(USER_A, cabeca("ven-3e9e-conf", confAnim));
    const titConf = await tituloOrigem(confVenda.vendaId);
    const itensConf = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM venda_itens WHERE venda_id = ?", [confVenda.vendaId]))[0]?.n);
    const parcConf = await q<{ numero: number; vencimento: string; valor_original: string }[]>(pool, "SELECT numero, vencimento, valor_original FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero", [confVenda.tituloId]);
    reg({
      id: "CONF",
      nome: "Confirmação atômica: venda, item, baixa, status, título, parcela, origem",
      ok: confVenda.success && !confVenda.idempotente
        && itensConf === 1
        && await statusAnimal(confAnim) === "vendido"
        && await baixasAtivas(confAnim) === 1
        && titConf?.tipo === "receber"
        && titConf.estado === "ativo"
        && titConf.origem_tipo === "venda_animais"
        && Number(titConf.origem_id) === confVenda.vendaId
        && titConf.origem_item_chave === "principal"
        && Number(titConf.valor_original) === 1500
        && toCentavos(titConf.valor_original) === 150000
        && parcConf.length === 1
        && dataCivil(parcConf[0]?.vencimento) === "2026-10-23"
        && Number(parcConf[0]?.valor_original) === 1500
        && await liqsDoTitulo(confVenda.tituloId) === 0,
      detalhe: { confVenda, titConf, parcConf, itensConf },
    });

    const aVistaAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-CA");
    const aVista = await conf.confirmar(USER_A, cabeca("ven-3e9e-ca", aVistaAnim));
    const parcA = await q<{ vencimento: string; valor_original: string }[]>(pool, "SELECT vencimento, valor_original FROM financeiro_parcelas WHERE titulo_id = ?", [aVista.tituloId]);
    reg({
      id: "COND-A",
      nome: "À vista: 1 parcela no total, vencimento na data da venda, sem recebimento",
      ok: aVista.valorTotal === 1500 && parcA.length === 1 && dataCivil(parcA[0]?.vencimento) === "2026-10-23"
        && Number(parcA[0]?.valor_original) === 1500 && await liqsDoTitulo(aVista.tituloId) === 0,
      detalhe: { aVista, parcA },
    });

    const prazoAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-CB");
    const prazo = await conf.confirmar(USER_A, cabeca("ven-3e9e-cb", prazoAnim, {
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-23", valorOriginal: 1500 }],
    }));
    const parcB = await q<{ vencimento: string; valor_original: string }[]>(pool, "SELECT vencimento, valor_original FROM financeiro_parcelas WHERE titulo_id = ?", [prazo.tituloId]);
    reg({
      id: "COND-B",
      nome: "A prazo: 1 parcela no total, vencimento posterior, sem recebimento",
      ok: prazo.valorTotal === 1500 && parcB.length === 1 && dataCivil(parcB[0]?.vencimento) === "2026-11-23"
        && Number(parcB[0]?.valor_original) === 1500 && await liqsDoTitulo(prazo.tituloId) === 0,
      detalhe: { prazo, parcB },
    });

    const parcAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-CC");
    const parcelado = await conf.confirmar(USER_A, cabeca("ven-3e9e-cc", parcAnim, {
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-23", valorOriginal: 700 },
        { numero: 2, vencimento: "2026-12-23", valorOriginal: 800 },
      ],
    }));
    const parcC = await q<{ numero: number; valor_original: string }[]>(pool, "SELECT numero, valor_original FROM financeiro_parcelas WHERE titulo_id = ? ORDER BY numero", [parcelado.tituloId]);
    const somaC = parcC.reduce((s, p) => s + Number(p.valor_original), 0);
    reg({
      id: "COND-C",
      nome: "Parcelado: 2 parcelas, soma exata, sem recebimento",
      ok: parcelado.valorTotal === 1500 && parcC.length === 2 && somaC === 1500
        && toCentavos(somaC) === toCentavos(parcelado.valorTotal) && await liqsDoTitulo(parcelado.tituloId) === 0,
      detalhe: { parcelado, parcC, somaC },
    });

    const depoisAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-CD");
    const depois = await conf.confirmar(USER_A, cabeca("ven-3e9e-cd", depoisAnim, { condicao: "definir_depois", parcelas: [] }));
    const titD = await tituloOrigem(depois.vendaId);
    const parcD = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_parcelas WHERE titulo_id = ?", [depois.tituloId]))[0]?.n);
    reg({
      id: "COND-D",
      nome: "Definir depois: título a_definir, zero parcelas, sem recebimento",
      ok: depois.valorTotal === 1500 && titD?.condicao_status === "a_definir" && parcD === 0 && await liqsDoTitulo(depois.tituloId) === 0,
      detalhe: { depois, titD, parcD },
    });

    const modA = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MA");
    const vendaA = await conf.confirmar(USER_A, cabeca("ven-3e9e-ma", modA));
    reg({
      id: "MOD-A",
      nome: "Venda por cabeça",
      ok: vendaA.valorTotal === 1500 && (await q<{ forma_precificacao: string }[]>(pool, "SELECT forma_precificacao FROM vendas WHERE id = ?", [vendaA.vendaId]))[0]?.forma_precificacao === "cabeca",
      detalhe: { vendaA },
    });

    const modB = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MB", { pesoAtual: 999 });
    const vendaB = await conf.confirmar(USER_A, {
      idempotencyKey: chaveRun("ven-3e9e-mb"), fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "kg", precoPadrao: 20,
      itens: [{ animalId: modB, pesoVenda: 250, precoUnitario: 20 }],
      condicao: "a_vista",
    });
    const itemB = (await q<{ peso_venda: string; valor_item: string }[]>(pool, "SELECT peso_venda, valor_item FROM venda_itens WHERE venda_id = ?", [vendaB.vendaId]))[0];
    reg({
      id: "MOD-B-E",
      nome: "Por kg com peso informado na venda; peso histórico 999 ignorado",
      ok: vendaB.valorTotal === 5000 && Number(itemB?.peso_venda) === 250 && Number(itemB?.valor_item) === 5000
        && Number(itemB?.valor_item) !== 999 * 20,
      detalhe: { vendaB, itemB, pesoHistorico: 999 },
    });

    const modC1 = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MC1");
    const modC2 = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MC2");
    const vendaC = await conf.confirmar(USER_A, {
      idempotencyKey: chaveRun("ven-3e9e-mc"), fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "kg", precoPadrao: 18,
      itens: [
        { animalId: modC1, pesoVenda: 200, precoUnitario: 18 },
        { animalId: modC2, pesoVenda: 180, precoUnitario: 18 },
      ],
      condicao: "a_vista",
    });
    reg({
      id: "MOD-C-H",
      nome: "Preço padrão, mais de um animal",
      ok: vendaC.valorTotal === 6840 && vendaC.quantidade === 2
        && await statusAnimal(modC1) === "vendido" && await statusAnimal(modC2) === "vendido",
      detalhe: { vendaC },
    });

    const modD1 = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MD1");
    const modD2 = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MD2");
    const vendaD = await conf.confirmar(USER_A, {
      idempotencyKey: chaveRun("ven-3e9e-md"), fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
      formaPrecificacao: "cabeca",
      itens: [
        { animalId: modD1, precoUnitario: 1400 },
        { animalId: modD2, precoUnitario: 1600 },
      ],
      condicao: "a_vista",
    });
    const itensD = await q<{ preco_unitario: string }[]>(pool, "SELECT preco_unitario FROM venda_itens WHERE venda_id = ? ORDER BY animal_id", [vendaD.vendaId]);
    reg({
      id: "MOD-D",
      nome: "Preço individual por cabeça",
      ok: vendaD.valorTotal === 3000 && itensD.map(i => Number(i.preco_unitario)).join(",") === "1400,1600",
      detalhe: { vendaD, itensD },
    });

    const semRfid = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MF", { brincoEletronico: null });
    const comRfid = await seedAnimal(pool, USER_A, fazendaA, "3E9E-MG", { brincoEletronico: "RFID-3E9E-MG" });
    const vendaF = await conf.confirmar(USER_A, cabeca("ven-3e9e-mf", semRfid));
    const vendaG = await conf.confirmar(USER_A, cabeca("ven-3e9e-mg", comRfid));
    reg({
      id: "MOD-F-G",
      nome: "Animal sem RFID e com RFID (brincoEletronico)",
      ok: vendaF.success && vendaG.success && await statusAnimal(semRfid) === "vendido" && await statusAnimal(comRfid) === "vendido",
      detalhe: { vendaF: vendaF.vendaId, vendaG: vendaG.vendaId },
    });

    let arrobaMsg = "";
    const arrobaAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-AR");
    try {
      await conf.confirmar(USER_A, {
        idempotencyKey: chaveRun("ven-3e9e-ar"), fazendaId: fazendaA, data: "2026-10-23", compradorId: pessoaA,
        formaPrecificacao: "arroba", itens: [{ animalId: arrobaAnim, pesoVenda: 300, precoUnitario: 300 }],
        condicao: "a_vista",
      });
    } catch (e) { arrobaMsg = msg(e); }
    reg({
      id: "MOD-ARROBA",
      nome: "Arroba recusada (não reintroduzida)",
      ok: arrobaMsg.includes(MSG_VENDA_ARROBA_REQUER_MIGRATION) && await statusAnimal(arrobaAnim) === "ativo",
      detalhe: { arrobaMsg },
    });

    const idA = await seedAnimal(pool, USER_A, fazendaA, "3E9E-IA");
    const rIdem = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e9e-ia", idA)),
      conf2.confirmar(USER_A, cabeca("ven-3e9e-ia", idA)),
    ]);
    const ia1 = settled(rIdem[0]!); const ia2 = settled(rIdem[1]!);
    const idsIa = [ia1, ia2].filter(x => x.ok).map(x => x.ok ? x.value : null);
    const vendasIa = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [chaveRun("ven-3e9e-ia")]))[0]?.n);
    const titIa = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key = ?)", [chaveRun("ven-3e9e-ia")]))[0]?.n);
    reg({
      id: "IDEM-A-D-H-I-J",
      nome: "Mesma chave simultânea: uma venda, um título, uma baixa",
      ok: idsIa.length === 2 && idsIa[0]?.vendaId === idsIa[1]?.vendaId && idsIa[0]?.tituloId === idsIa[1]?.tituloId
        && vendasIa === 1 && titIa === 1 && await baixasAtivas(idA) === 1 && !ia1.sqlCru && !ia2.sqlCru,
      detalhe: { ia1, ia2, vendasIa, titIa },
    });

    const idB = await seedAnimal(pool, USER_A, fazendaA, "3E9E-IB");
    const ibOk = await conf.confirmar(USER_A, cabeca("ven-3e9e-ib", idB));
    let ibMsg = "";
    try { await conf2.confirmar(USER_A, cabeca("ven-3e9e-ib", idB, { condicao: "definir_depois", parcelas: [] })); }
    catch (e) { ibMsg = msg(e); }
    reg({
      id: "IDEM-B",
      nome: "Mesma chave + payload diferente",
      ok: ibOk.success && ibMsg.includes(MSG_VENDA_CONFLITO_IDEMPOTENCIA)
        && Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [chaveRun("ven-3e9e-ib")]))[0]?.n) === 1,
      detalhe: { ibOk, ibMsg },
    });

    const idC = await seedAnimal(pool, USER_A, fazendaA, "3E9E-IC");
    const rC = await Promise.allSettled([
      conf.confirmar(USER_A, cabeca("ven-3e9e-ic1", idC)),
      conf2.confirmar(USER_A, cabeca("ven-3e9e-ic2", idC)),
    ]);
    const ic1 = settled(rC[0]!); const ic2 = settled(rC[1]!);
    const vendasIc = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key IN (?, ?)", [chaveRun("ven-3e9e-ic1"), chaveRun("ven-3e9e-ic2")]))[0]?.n);
    reg({
      id: "IDEM-C",
      nome: "Chaves diferentes + mesmo animal",
      ok: [ic1, ic2].filter(x => x.ok).length === 1 && vendasIc === 1 && await baixasAtivas(idC) === 1 && !ic1.sqlCru && !ic2.sqlCru,
      detalhe: { ic1, ic2, vendasIc },
    });

    const idE = await seedAnimal(pool, USER_A, fazendaA, "3E9E-IE");
    const ie1 = await conf.confirmar(USER_A, cabeca("ven-3e9e-ie", idE));
    const ie2 = await conf2.confirmar(USER_A, cabeca("ven-3e9e-ie", idE));
    reg({
      id: "IDEM-E-F-G",
      nome: "Resposta perdida / retry: recupera vendaId e tituloId",
      ok: ie2.idempotente === true && ie2.vendaId === ie1.vendaId && ie2.tituloId === ie1.tituloId
        && Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM vendas WHERE idempotency_key = ?", [chaveRun("ven-3e9e-ie")]))[0]?.n) === 1,
      detalhe: { ie1, ie2 },
    });

    const finTit = await tituloOrigem(confVenda.vendaId);
    const histFin = await nucleo.historicoPagamentosTitulo(USER_A, confVenda.tituloId);
    const recFin = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: chaveRun("rec-3e9e-fin"), alocacoes: [{ parcelaId: await parcela(confVenda.tituloId), principalLiquidado: 1500 }],
    });
    const histDepois = await nucleo.historicoPagamentosTitulo(USER_A, confVenda.tituloId);
    const rotulo = rotuloOrigemTitulo(finTit!.origem_tipo);
    const ref = referenciaOrigemVendaAnimais(finTit!.origem_tipo, finTit!.origem_id);
    const link = linkOrigemContasAReceber(finTit!.origem_tipo, finTit!.origem_id);
    const listaTxt = textoListagemOrigemVendaAnimais(finTit!.origem_tipo, finTit!.origem_id);
    reg({
      id: "FIN",
      nome: "Contas a Receber: origem, referência, link, valor, parcelas, recebimento e histórico",
      ok: finTit?.tipo === "receber"
        && rotulo === "Venda de Animais" && rotulo !== "venda_animais"
        && ref === `Venda ${confVenda.vendaId}` && !ref.includes("#")
        && link?.href === compraVendaVendaDetalhePath(confVenda.vendaId)
        && link.href === `/compra-venda/vendas/${confVenda.vendaId}`
        && appSrc.includes('path="/compra-venda/vendas/:id"')
        && listaTxt === `Venda de Animais · Venda ${confVenda.vendaId}`
        && Number(finTit.valor_original) === 1500
        && histFin.eventos.length === 0
        && recFin.id > 0 && histDepois.eventos.length >= 1
        && await efetiva(confVenda.tituloId) === 1,
      detalhe: { rotulo, ref, link, listaTxt, recFin: recFin.id, histAntes: histFin.eventos.length, histDepois: histDepois.eventos.length },
    });

    const estFin = await nucleo.estornarLiquidacao(USER_A, {
      liquidacaoId: recFin.id, idempotencyKey: chaveRun("est-3e9e-fin"), dataLiquidacao: "2026-10-24",
    });
    const histEst = await nucleo.historicoPagamentosTitulo(USER_A, confVenda.tituloId);
    reg({
      id: "EST",
      nome: "Estorno do recebimento da venda",
      ok: estFin.id > 0 && await efetiva(confVenda.tituloId) === 0 && histEst.eventos.length >= 2,
      detalhe: { estFin: estFin.id, efetiva: await efetiva(confVenda.tituloId) },
    });

    const canA = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XA");
    const canAV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xa", canA));
    const canACanc = await canc.cancelar(USER_A, { vendaId: canAV.vendaId, motivo: "sem recebimento 3E9E", canceladoPorUserId: USER_A });
    const stXA = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [canAV.vendaId]))[0]?.status;
    const titXA = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [canAV.tituloId]))[0]?.estado;
    reg({
      id: "CANC-A",
      nome: "Cancelar sem recebimento",
      ok: canACanc.success && stXA === "cancelado" && titXA === "cancelado"
        && await statusAnimal(canA) === "ativo" && await baixasAtivas(canA) === 0 && await efetiva(canAV.tituloId) === 0,
      detalhe: { canACanc, stXA, titXA },
    });

    const canB = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XB");
    const canBV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xb", canB));
    await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: chaveRun("rec-3e9e-xb"), alocacoes: [{ parcelaId: await parcela(canBV.tituloId), principalLiquidado: 1500 }],
    });
    let xbMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: canBV.vendaId, motivo: "com recebimento", canceladoPorUserId: USER_A }); }
    catch (e) { xbMsg = msg(e); }
    const titXB = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [canBV.tituloId]))[0]?.estado;
    reg({
      id: "CANC-B",
      nome: "Bloquear com recebimento efetivo",
      ok: xbMsg.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO) && titXB === "ativo" && await efetiva(canBV.tituloId) === 1,
      detalhe: { xbMsg, titXB },
    });

    const canC = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XC");
    const canCV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xc", canC));
    const recXC = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: chaveRun("rec-3e9e-xc"), alocacoes: [{ parcelaId: await parcela(canCV.tituloId), principalLiquidado: 1500 }],
    });
    await nucleo.estornarLiquidacao(USER_A, { liquidacaoId: recXC.id, idempotencyKey: chaveRun("est-3e9e-xc"), dataLiquidacao: "2026-10-24" });
    const xcCanc = await canc.cancelar(USER_A, { vendaId: canCV.vendaId, motivo: "após estorno", canceladoPorUserId: USER_A });
    const titXC = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [canCV.tituloId]))[0]?.estado;
    reg({
      id: "CANC-C",
      nome: "Estornar e depois cancelar",
      ok: xcCanc.success && titXC === "cancelado" && await statusAnimal(canC) === "ativo" && await efetiva(canCV.tituloId) === 0,
      detalhe: { xcCanc, titXC },
    });

    const canD = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XD");
    const canDV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xd", canD));
    const xdCanc = await canc.cancelar(USER_A, { vendaId: canDV.vendaId, motivo: "flag false", canceladoPorUserId: USER_A });
    reg({
      id: "CANC-D",
      nome: "Cancelar com flag false (protegido permanece)",
      ok: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false && xdCanc.success
        && (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [canDV.vendaId]))[0]?.status === "cancelado",
      detalhe: { flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA, xdCanc },
    });

    const histAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XE");
    const histId = await vendaHistorica(pool, { userId: USER_A, fazendaId: fazendaA, pessoaId: pessoaA, animalId: histAnim, brinco: "3E9E-XE" });
    const xeCanc = await canc.cancelar(USER_A, { vendaId: histId, motivo: "histórico sem título", canceladoPorUserId: USER_A });
    reg({
      id: "CANC-E",
      nome: "Venda histórica sem título",
      ok: xeCanc.success && xeCanc.vendaAntigaSemTitulo === true && xeCanc.tituloId === null
        && await statusAnimal(histAnim) === "ativo",
      detalhe: { xeCanc },
    });

    const venAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XF");
    const venId = await vendaHistorica(pool, {
      userId: USER_A, fazendaId: fazendaA, pessoaId: pessoaA, animalId: venAnim, brinco: "3E9E-XF", chave: chaveRun("ven-3e9e-xf-sem-titulo"),
    });
    let xfMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: venId, motivo: "ven- sem título", canceladoPorUserId: USER_A }); }
    catch (e) { xfMsg = msg(e); }
    const stXF = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [venId]))[0]?.status;
    reg({
      id: "CANC-F",
      nome: "Venda ven- sem título: integridade",
      ok: xfMsg.includes(MSG_VENDA_CANCELAR_INTEGRIDADE_TITULO) && stXF === "concluido" && await statusAnimal(venAnim) === "vendido",
      detalhe: { xfMsg, stXF },
    });

    const xgAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XG");
    const xgV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xg", xgAnim));
    await pool.query(
      `INSERT INTO financeiro_titulos (user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, origem_item_chave, descricao, data_competencia, valor_original)
       SELECT user_id, tipo, estado, condicao_status, pessoa_id, contraparte_nome_snapshot, fazenda_origem_id, origem_tipo, origem_id, 'item-extra', descricao, data_competencia, valor_original
       FROM financeiro_titulos WHERE id = ?`,
      [xgV.tituloId],
    );
    let xgMsg = "";
    try { await canc.cancelar(USER_A, { vendaId: xgV.vendaId, motivo: "principal + extra", canceladoPorUserId: USER_A }); }
    catch (e) { xgMsg = msg(e); }
    const stXG = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [xgV.vendaId]))[0]?.status;
    const titXG = await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [xgV.vendaId]);
    reg({
      id: "CANC-G",
      nome: "Título principal + extra: bloqueia, nada parcial",
      ok: xgMsg.includes(MSG_VENDA_CANCELAR_TITULOS_DUPLICADOS) && stXG === "concluido"
        && titXG.length === 2 && titXG.every(t => t.estado === "ativo") && await statusAnimal(xgAnim) === "vendido",
      detalhe: { xgMsg, stXG, titXG },
    });

    const xhAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XH");
    const xhV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xh", xhAnim));
    const rH = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: xhV.vendaId, motivo: "primeiro", canceladoPorUserId: USER_A }),
      canc2.cancelar(USER_A, { vendaId: xhV.vendaId, motivo: "segundo", canceladoPorUserId: USER_A }),
    ]);
    const h1 = settled(rH[0]!); const h2 = settled(rH[1]!);
    const stXH = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [xhV.vendaId]))[0]?.status;
    const recusaJa = [h1, h2].some(x => !x.ok && x.erro.includes(MSG_VENDA_CANCELAR_JA_CANCELADA));
    reg({
      id: "CANC-H",
      nome: "Dois cancelamentos simultâneos",
      ok: [h1, h2].filter(x => x.ok).length === 1 && recusaJa && stXH === "cancelado" && !h1.sqlCru && !h2.sqlCru,
      detalhe: { h1, h2, stXH },
    });

    const xiAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XI");
    const xiV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xi", xiAnim));
    const parcXI = await parcela(xiV.tituloId);
    const rI = await Promise.allSettled([
      canc.cancelar(USER_A, { vendaId: xiV.vendaId, motivo: "corrida rec", canceladoPorUserId: USER_A }),
      nucleo2.criarRecebimento(USER_A, {
        contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
        idempotencyKey: chaveRun("rec-3e9e-xi"), alocacoes: [{ parcelaId: parcXI, principalLiquidado: 1500 }],
      }),
    ]);
    const iCanc = settled(rI[0]!); const iRec = settled(rI[1]!);
    const titXI = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [xiV.tituloId]))[0]?.estado;
    const efXI = await efetiva(xiV.tituloId);
    const recusaRec = !iRec.ok && iRec.erro.includes(MSG_FIN_TITULO_CANCELADO);
    const recusaCanc = !iCanc.ok && iCanc.erro.includes(MSG_VENDA_CANCELAR_COM_RECEBIMENTO);
    reg({
      id: "CANC-I",
      nome: "Cancelar × receber: sem título cancelado com recebimento efetivo",
      ok: !(titXI === "cancelado" && efXI > 0) && (iCanc.ok || iRec.ok) && (recusaCanc || recusaRec || (iCanc.ok && efXI === 0))
        && !iCanc.sqlCru && !iRec.sqlCru,
      detalhe: { iCanc, iRec, titXI, efXI },
    });

    const xjAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-XJ");
    const xjV = await conf.confirmar(USER_A, cabeca("ven-3e9e-xj", xjAnim));
    const recXJ = await nucleo.criarRecebimento(USER_A, {
      contaId: contaA, dataLiquidacao: "2026-10-23", valorMovimentado: 1500,
      idempotencyKey: chaveRun("rec-3e9e-xj"), alocacoes: [{ parcelaId: await parcela(xjV.tituloId), principalLiquidado: 1500 }],
    });
    const rJ = await Promise.allSettled([
      nucleo2.estornarLiquidacao(USER_A, { liquidacaoId: recXJ.id, idempotencyKey: chaveRun("est-3e9e-xj"), dataLiquidacao: "2026-10-24" }),
      canc.cancelar(USER_A, { vendaId: xjV.vendaId, motivo: "corrida est", canceladoPorUserId: USER_A }),
    ]);
    const jEst = settled(rJ[0]!); const jCanc = settled(rJ[1]!);
    const titXJ = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [xjV.tituloId]))[0]?.estado;
    const efXJ = await efetiva(xjV.tituloId);
    reg({
      id: "CANC-J",
      nome: "Cancelar × estornar: sem cancelado com recebimento efetivo",
      ok: !(titXJ === "cancelado" && efXJ > 0) && (jEst.ok || jCanc.ok) && !jEst.sqlCru && !jCanc.sqlCru,
      detalhe: { jEst, jCanc, titXJ, efXJ },
    });

    const lockOrdem = confSrc.includes("animais da intenção, por id crescente")
      && confSrc.includes("criar título receber")
      && cancSrc.includes("lockVenda")
      && cancSrc.includes("lockTitulosDaVenda")
      && mysqlCancSrc.includes("FOR UPDATE")
      && confSrc.includes("isDeadlockMysql")
      && confSrc.includes("isLockWaitTimeoutMysql")
      && confSrc.includes("for (let tentativa = 0; tentativa < 6; tentativa++)")
      && cancSrc.includes("for (let tentativa = 0; tentativa < 6; tentativa++)");
    const recuperaCancelada = confSrc.includes("if (existente) return resultadoDaVendaExistente")
      && !confSrc.includes('existente.status === "cancelado"')
      && !confSrc.includes('venda.status === "cancelado"');

    const retryAnim = await seedAnimal(pool, USER_A, fazendaA, "3E9E-LOCK");
    const retryV = await conf.confirmar(USER_A, cabeca("ven-3e9e-lock", retryAnim));
    await canc.cancelar(USER_A, { vendaId: retryV.vendaId, motivo: "para retry", canceladoPorUserId: USER_A });
    const retryApos = await conf.confirmar(USER_A, cabeca("ven-3e9e-lock", retryAnim));
    const stLock = (await q<{ status: string }[]>(pool, "SELECT status FROM vendas WHERE id = ?", [retryV.vendaId]))[0]?.status;
    const titLock = (await q<{ estado: string }[]>(pool, "SELECT estado FROM financeiro_titulos WHERE id = ?", [retryV.tituloId]))[0]?.estado;
    const titulosLock = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?", [retryV.vendaId]))[0]?.n);
    const retryAceitaCancelada = retryApos.success && retryApos.vendaId === retryV.vendaId && stLock === "cancelado";
    if (retryAceitaCancelada) {
      bloqueios.push("Retry da mesma chave após cancelamento devolve success sobre venda/título cancelados (resultadoDaVendaExistente não recusa status cancelado).");
    }
    if (recuperaCancelada) {
      bloqueios.push("Confirmação integrada não recusa venda já cancelada na recuperação idempotente — risco de título/venda cancelados parecerem confirmados de novo.");
    }
    reg({
      id: "LOCK",
      nome: "Locks, retry 1213/1205 e risco residual de recuperação após cancelar",
      ok: lockOrdem && titulosLock === 1 && titLock === "cancelado",
      detalhe: {
        lockOrdem,
        retryApos,
        stLock,
        titLock,
        titulosLock,
        retryAceitaCancelada,
        causa: "confirmarVendaFinanceiroNoTx recupera pela chave sem checar vendas.status",
      },
    });

    const isoAnim = await seedAnimal(pool, USER_B, fazendaB, "3E9E-ISO-B");
    await conf2.confirmar(USER_B, {
      idempotencyKey: chaveRun("ven-3e9e-iso-b"), fazendaId: fazendaB, data: "2026-10-23", compradorId: pessoaB,
      formaPrecificacao: "cabeca", itens: [{ animalId: isoAnim, precoUnitario: 1800 }], condicao: "a_vista",
    });
    const isoAcesso = await nucleo.detalheTitulo(USER_A, (await tituloOrigem(
      Number((await q<{ id: number }[]>(pool, "SELECT id FROM vendas WHERE idempotency_key = ?", [chaveRun("ven-3e9e-iso-b")]))[0]?.id),
    ))!.id).then(() => "vazou").catch(e => msg(e));

    const dupVendaAnimal = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT vi.animal_id FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id
      WHERE v.status = 'concluido' AND v.idempotency_key LIKE 'ven-3e9e%' GROUP BY vi.animal_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const semTitulo = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas v
      LEFT JOIN financeiro_titulos t ON t.origem_tipo = 'venda_animais' AND t.origem_id = v.id AND t.origem_item_chave = 'principal'
      WHERE v.idempotency_key LIKE 'ven-3e9e%' AND v.idempotency_key NOT LIKE '%-xf-sem-titulo'
        AND v.status = 'concluido' AND t.id IS NULL`))[0]?.n);
    const dupTit = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT origem_id FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_item_chave = 'principal'
        AND origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e9e%')
      GROUP BY origem_id HAVING COUNT(*) > 1) x`))[0]?.n);
    const dupBaixa = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM (
      SELECT animalId FROM animal_baixas WHERE status = 'ativa' AND animalId IN (SELECT id FROM animais WHERE brinco LIKE '3E9E%')
      GROUP BY animalId HAVING COUNT(*) > 1) x`))[0]?.n);
    const cancEfetiva = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_titulos t WHERE t.estado = 'cancelado' AND t.origem_tipo = 'venda_animais'
      AND t.origem_id IN (SELECT id FROM vendas WHERE idempotency_key LIKE 'ven-3e9e%')
      AND EXISTS (
        SELECT 1 FROM financeiro_parcelas p JOIN financeiro_liquidacao_alocacoes a ON a.parcela_id = p.id
        JOIN financeiro_liquidacoes l ON l.id = a.liquidacao_id
        WHERE p.titulo_id = t.id AND l.tipo IN ('recebimento','pagamento')
          AND NOT EXISTS (SELECT 1 FROM financeiro_liquidacoes e WHERE e.liquidacao_original_id = l.id)
      )`))[0]?.n);
    const vendasAnterioresDepois = Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM vendas WHERE ${likeAnteriores}`, [...PREFIXOS_ANTERIORES]))[0]?.n);

    reg({
      id: "INV",
      nome: "Invariantes 3E.9E",
      ok: dupVendaAnimal === 0 && semTitulo === 0 && dupTit === 0 && dupBaixa === 0 && cancEfetiva === 0
        && vendasAnterioresDepois === vendasAnteriores
        && isoAcesso !== "vazou"
        && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false,
      detalhe: { dupVendaAnimal, semTitulo, dupTit, dupBaixa, cancEfetiva, vendasAnteriores, vendasAnterioresDepois, isoAcesso },
    });

    const depoisOp = await snapshotBanco(admin, OPERACIONAL);
    const depois47 = await snapshotBanco(admin, HOMOLOG_3C47);
    const depoisB2 = await snapshotBanco(admin, HOMOLOG_3B2A3);
    const depois5b = await snapshotBanco(admin, TESTE_3E5B);
    const [dbFinal] = await q<{ db: string }[]>(pool, "SELECT DATABASE() db");
    const [dbFinal2] = await q<{ db: string }[]>(pool2, "SELECT DATABASE() db");
    reg({
      id: "ISO",
      nome: "Bancos protegidos preservados",
      ok: dbFinal.db === TESTE && dbFinal2.db === TESTE
        && JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && JSON.stringify(antes47) === JSON.stringify(depois47)
        && JSON.stringify(antesB2) === JSON.stringify(depoisB2)
        && JSON.stringify(antes5b) === JSON.stringify(depois5b)
        && colOp === 0,
      detalhe: { dbFinal: dbFinal.db, dbFinal2: dbFinal2.db },
    });
  } catch (e) {
    reg({ id: "ABORT", nome: "Execução", ok: false, detalhe: {}, erro: msg(e) });
  } finally {
    if (pool) await pool.end();
    if (pool2) await pool2.end();
    await admin.end();
  }

  const ok = problemas.length === 0;
  console.log(JSON.stringify({
    banco: TESTE,
    flag: INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
    parecer: !ok ? "NECESSITA CORREÇÕES" : (bloqueios.length ? "HOMOLOGADO COM BLOQUEIO PARA ATIVAÇÃO" : "HOMOLOGADO SEM BLOQUEIO"),
    problemas,
    bloqueios,
    cenarios,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
