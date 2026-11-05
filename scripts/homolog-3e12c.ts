/**
 * Homologação 3E.12C — interface Nova Venda em modo INTEGRADO isolado.
 * Não altera constantes de produção. Não grava no operacional.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import mysql from "mysql2/promise";
import {
  ESTADO_CONFIRMACAO_VENDA_PRODUCAO,
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
} from "../shared/vendaIntegracao";

const TESTE = "fazenda_digital_test_integracao_3e12b";
const TEST_USER = "fd_integ_3e12b";
const OPERACIONAL = "fazenda_digital";
const PROTEGIDOS = [
  OPERACIONAL,
  "fazenda_digital_restore_3e11b_20261026",
  "fazenda_digital_homolog_3c47",
  "fazenda_digital_homolog_3b2a3",
  "fazenda_digital_test_boot_3e11e2",
] as const;
const SECRETS_DIR = "C:/Users/Pedro Neto/FazendaDigital-backups/.secrets";
const EVID_DIR = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-3e12c";
const PORT_API = 3102;
const PORT_UI = 5174;
const RUN = Date.now().toString(36);
const BRINCO_A = `UI12C-A-${RUN}`;
const BRINCO_B = `UI12C-B-${RUN}`;
const PRECO = 1500;

type Cenario = { id: string; nome: string; ok: boolean; detalhe: Record<string, unknown> };

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

function credenciaisAdmin() {
  const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL admin ausente");
  const u = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("ABORT: host não local");
  const db = (u.pathname || "").replace(/^\//, "").split("?")[0];
  if (db !== OPERACIONAL) throw new Error(`ABORT: URL admin aponta para ${db}`);
  return {
    host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    jwtSecret: env.JWT_SECRET || "",
  };
}

async function q<T extends mysql.RowDataPacket[]>(
  conn: mysql.Connection | mysql.Pool,
  sqlText: string,
  params: unknown[] = [],
) {
  const [rows] = await conn.query(sqlText, params);
  return rows as T;
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function snapshotOp(admin: mysql.Connection) {
  const count = async (t: string) =>
    Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.\`${t}\``))[0]?.n);
  return {
    tables: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [OPERACIONAL]))[0]?.n),
    fks: Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'", [OPERACIONAL]))[0]?.n),
    vendas: await count("vendas"),
    itens: await count("venda_itens"),
    baixas: await count("animal_baixas"),
    titulos: await count("financeiro_titulos"),
    titulosVenda: Number((await q<{ n: number }[]>(admin, `SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.financeiro_titulos WHERE origem_tipo = 'venda_animais'`))[0]?.n),
    animais: await count("animais"),
  };
}

function waitFor(child: ReturnType<typeof spawn>, pattern: RegExp, ms: number) {
  return new Promise<{ code: number | null; out: string }>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* */ }
      reject(new Error(`timeout ${pattern}. log=${out.slice(-2500)}`));
    }, ms);
    const onData = (buf: Buffer) => {
      out += buf.toString();
      if (pattern.test(out)) {
        clearTimeout(timer);
        resolve({ code: null, out });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (pattern.test(out)) resolve({ code, out });
      else reject(new Error(`processo saiu ${code} sem ${pattern}. log=${out.slice(-2500)}`));
    });
  });
}

async function killChild(child: ReturnType<typeof spawn> | null) {
  if (!child?.pid) return;
  try { child.kill(); } catch { /* */ }
  await new Promise((r) => setTimeout(r, 500));
}

async function main() {
  const cenarios: Cenario[] = [];
  const problemas: string[] = [];
  const relatorio: Record<string, unknown> = { fase: "3E.12C", schema: TESTE, run: RUN };
  const reg = (c: Cenario) => {
    cenarios.push(c);
    if (!c.ok) problemas.push(`${c.id}: ${JSON.stringify(c.detalhe).slice(0, 280)}`);
  };

  const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../shared/vendaIntegracao.ts"), "utf8");
  const constantesOk = ESTADO_CONFIRMACAO_VENDA_PRODUCAO === "comercial"
    && INTEGRACAO_CONFIRMACAO_VENDA_ATIVA === false
    && fonte.includes('ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "comercial"')
    && fonte.includes("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false")
    && !fonte.includes('ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "integrado"');
  if (!constantesOk) throw new Error("ABORT: constantes de produção não estão COMERCIAL/OFF");

  const cred = credenciaisAdmin();
  const passFile = join(SECRETS_DIR, "fd-integ-3e12b.pass");
  const userPassFile = join(SECRETS_DIR, "fd-integ-3e12b-user.pass");
  if (!existsSync(passFile) || !existsSync(userPassFile)) {
    throw new Error("ABORT: senhas do harness 3E.12B ausentes");
  }
  const mysqlPass = readFileSync(passFile, "utf8").trim();
  const userPass = readFileSync(userPassFile, "utf8").trim();

  const admin = await mysql.createConnection({
    host: cred.host, port: cred.port, user: cred.user, password: cred.password,
  });
  let pool: mysql.Pool | null = null;
  let childApi: ReturnType<typeof spawn> | null = null;
  let childUi: ReturnType<typeof spawn> | null = null;

  try {
    const existe = Number((await q<{ n: number }[]>(admin, "SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [TESTE]))[0]?.n);
    if (!existe) throw new Error(`ABORT: schema ${TESTE} ausente`);
    const grants = (await q<{ [k: string]: string }[]>(admin, `SHOW GRANTS FOR '${TEST_USER}'@'localhost'`))
      .map((r) => String(Object.values(r)[0]).replace(/IDENTIFIED BY\s+'[^']*'/gi, "IDENTIFIED BY ***"));
    const tocaOp = grants.some((g) => /on\s+`?fazenda_digital`?\./i.test(g) && !/test_integracao_3e12b/i.test(g));
    const probe = await mysql.createConnection({
      host: cred.host, port: cred.port, user: TEST_USER, password: mysqlPass, database: TESTE,
    });
    const [probeMeta] = await q<{ db: string }[]>(probe, "SELECT DATABASE() db");
    if (probeMeta.db !== TESTE) throw new Error(`ABORT: probe ${probeMeta.db}`);
    let operacionalNegado = false;
    try {
      await probe.query(`SELECT COUNT(*) n FROM \`${OPERACIONAL}\`.vendas`);
    } catch (err) {
      operacionalNegado = /denied|1142|1044/i.test(msg(err));
    }
    await probe.end();
    if (!operacionalNegado || tocaOp) throw new Error("BLOQUEADO POR ISOLAMENTO");
    const antesOp = await snapshotOp(admin);
    relatorio.isolamento = { grants, operacionalNegado, db: probeMeta.db, antesOp };
    reg({
      id: "ISO",
      nome: "Isolamento, GRANTS e constantes COMERCIAL",
      ok: operacionalNegado && probeMeta.db === TESTE && constantesOk && antesOp.vendas === 2 && antesOp.titulosVenda === 0,
      detalhe: { operacionalNegado, constantesOk, antesOp },
    });

    pool = mysql.createPool({
      host: cred.host, port: cred.port, user: TEST_USER, password: mysqlPass, database: TESTE, connectionLimit: 4,
    });
    const userId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM users WHERE openId = 'homolog-3e12b'"))[0]?.id);
    const fazendaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM fazendas WHERE userId = ? ORDER BY id DESC LIMIT 1", [userId]))[0]?.id);
    const pessoaId = Number((await q<{ id: number }[]>(pool, "SELECT id FROM pessoas WHERE user_id = ? AND tipo = 'cliente' ORDER BY id DESC LIMIT 1", [userId]))[0]?.id);
    const fazendaNome = String((await q<{ nome: string }[]>(pool, "SELECT nome FROM fazendas WHERE id = ?", [fazendaId]))[0]?.nome ?? "");
    const compradorNome = String((await q<{ nome: string }[]>(pool, "SELECT nome FROM pessoas WHERE id = ?", [pessoaId]))[0]?.nome ?? "Comprador Sintetico 3E12B");
    if (!userId || !fazendaId || !pessoaId) throw new Error("ABORT: dados sintéticos 3E.12B ausentes");

    for (const brinco of [BRINCO_A, BRINCO_B]) {
      await pool.query(
        "INSERT INTO animais (`userId`, `brinco`, `sexo`, `status`, `fazendaId`) VALUES (?, ?, 'macho', 'ativo', ?)",
        [userId, brinco, fazendaId],
      );
    }
    const animais = await q<{ id: number; brinco: string; status: string }[]>(
      pool, "SELECT id, brinco, status FROM animais WHERE userId = ? AND brinco IN (?, ?)", [userId, BRINCO_A, BRINCO_B],
    );
    const baixasAtivas = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas b JOIN animais a ON a.id = b.animalId WHERE a.brinco IN (?, ?) AND b.status = 'ativa'", [BRINCO_A, BRINCO_B]))[0]?.n);
    reg({
      id: "SEED",
      nome: "Dois animais sintéticos ativos sem baixa",
      ok: animais.length === 2 && animais.every((a) => a.status === "ativo") && baixasAtivas === 0,
      detalhe: { animais, baixasAtivas, fazendaId, pessoaId },
    });

    const testUrl = `mysql://${encodeURIComponent(TEST_USER)}:${encodeURIComponent(mysqlPass)}@127.0.0.1:${cred.port}/${TESTE}`;
    const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
    const uiDir = join(EVID_DIR, "ui");
    mkdirSync(uiDir, { recursive: true });
    const bundle = await esbuild.build({
      absWorkingDir: raiz,
      entryPoints: ["scripts/homolog-3e12c-main.tsx"],
      bundle: true,
      format: "esm",
      outfile: join(uiDir, "app.js"),
      jsx: "automatic",
      platform: "browser",
      target: "es2020",
      sourcemap: false,
      logLevel: "silent",
      alias: {
        "@": join(raiz, "client/src"),
        "@shared": join(raiz, "shared"),
      },
      loader: {
        ".css": "empty",
        ".webp": "file",
        ".png": "file",
        ".svg": "file",
        ".woff": "empty",
        ".woff2": "empty",
      },
      define: {
        "process.env.NODE_ENV": '"development"',
      },
      plugins: [{
        name: "homolog-stub-pdf",
        setup(build) {
          build.onResolve({ filter: /^(canvg|jspdf|jspdf-autotable|html2canvas|core-js(?:\/.*)?)$/ }, () => ({
            path: join(raiz, "scripts/homolog-3e12c-empty.ts"),
          }));
        },
      }],
    });
    if (bundle.errors.length) throw new Error(`esbuild: ${bundle.errors.map((e) => e.text).join("; ")}`);
    writeFileSync(join(uiDir, "index.html"), `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Homologação 3E.12C</title></head>
<body><div id="root"></div><script type="module" src="/homolog-ui/app.js"></script></body></html>
`);
    relatorio.bundleUi = { js: existsSync(join(uiDir, "app.js")), html: true };

    const spawnEnv = {
      ...process.env,
      DATABASE_URL: testUrl,
      PORT: String(PORT_API),
      NODE_ENV: "development",
      JWT_SECRET: cred.jwtSecret || process.env.JWT_SECRET || "homolog-3e12c-local",
      HOMOLOG_3E12C_UI_DIR: uiDir,
    };

    const apiLog: string[] = [];
    childApi = spawn(process.execPath, [
      "--import", "./scripts/homolog-3e12c-register.mjs",
      "--import", "tsx",
      "scripts/homolog-3e12c-server.ts",
    ], {
      cwd: raiz,
      env: spawnEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    childApi.stdout?.on("data", (b) => apiLog.push(String(b)));
    childApi.stderr?.on("data", (b) => apiLog.push(String(b)));
    const bootApi = await waitFor(childApi, /Server running on http:\/\/localhost:3102/, 80000);
    mkdirSync(EVID_DIR, { recursive: true });
    writeFileSync(join(EVID_DIR, "api-boot.log"), apiLog.join(""));
    relatorio.boot = {
      api: bootApi.out.split(/\r?\n/).filter((l) => /\[schema\]|Server running|3e12c-hook|3e12c-server/.test(l)).slice(0, 12),
      apiLog: apiLog.join("").slice(-2500),
      ui: `mesma origem http://127.0.0.1:${PORT_API}`,
    };

    const health = await fetch(`http://127.0.0.1:${PORT_API}/api/health`).then((r) => r.json()).catch((e) => ({ erro: msg(e) }));
    const loginApi = await fetch(`http://127.0.0.1:${PORT_API}/api/trpc/auth.login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { username: "homolog.3e12b@local.test", password: userPass } }),
    });
    const loginApiText = await loginApi.text();
    relatorio.probes = { health, loginApi: { status: loginApi.status, body: loginApiText.slice(0, 300) } };
    if (loginApi.status >= 400) throw new Error(`ABORT: login tRPC isolado falhou ${loginApi.status} ${loginApiText.slice(0, 200)}`);

    mkdirSync(EVID_DIR, { recursive: true });
    const ui = await exercitarInterface({
      baseUi: `http://127.0.0.1:${PORT_API}`,
      email: "homolog.3e12b@local.test",
      password: userPass,
      comprador: compradorNome,
      fazenda: fazendaNome,
      brincos: [BRINCO_A, BRINCO_B],
    });
    relatorio.interface = ui;

    const vendaUi = await q<{ id: number; status: string; valor_total: string; idempotency_key: string | null }[]>(
      pool,
      `SELECT v.id, v.status, v.valor_total, v.idempotency_key
       FROM vendas v
       JOIN venda_itens i ON i.venda_id = v.id
       JOIN animais a ON a.id = i.animal_id
       WHERE a.brinco IN (?, ?)
       GROUP BY v.id, v.status, v.valor_total, v.idempotency_key
       HAVING COUNT(*) = 2
       ORDER BY v.id DESC LIMIT 3`,
      [BRINCO_A, BRINCO_B],
    );
    const venda = vendaUi[0];
    const itensN = venda
      ? Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM venda_itens WHERE venda_id = ?", [venda.id]))[0]?.n)
      : 0;
    const tits = venda
      ? await q<{ id: number; tipo: string; estado: string; origem_tipo: string; origem_id: number; valor_original: string; observacoes: string | null }[]>(
        pool,
        "SELECT id, tipo, estado, origem_tipo, origem_id, valor_original, observacoes FROM financeiro_titulos WHERE origem_tipo = 'venda_animais' AND origem_id = ?",
        [venda.id],
      )
      : [];
    const stA = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE brinco = ?", [BRINCO_A]))[0]?.status;
    const stB = (await q<{ status: string }[]>(pool, "SELECT status FROM animais WHERE brinco = ?", [BRINCO_B]))[0]?.status;
    const baixaA = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas b JOIN animais a ON a.id = b.animalId WHERE a.brinco = ? AND b.status = 'ativa'", [BRINCO_A]))[0]?.n);
    const baixaB = Number((await q<{ n: number }[]>(pool, "SELECT COUNT(*) n FROM animal_baixas b JOIN animais a ON a.id = b.animalId WHERE a.brinco = ? AND b.status = 'ativa'", [BRINCO_B]))[0]?.n);
    const liqs = tits[0]
      ? Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_liquidacoes l
        JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id
        JOIN financeiro_parcelas p ON p.id = a.parcela_id WHERE p.titulo_id = ?`, [tits[0].id]))[0]?.n)
      : -1;
    const movs = tits[0]
      ? Number((await q<{ n: number }[]>(pool, `SELECT COUNT(*) n FROM financeiro_movimentos m
        JOIN financeiro_liquidacoes l ON l.id = m.liquidacao_id
        JOIN financeiro_liquidacao_alocacoes a ON a.liquidacao_id = l.id
        JOIN financeiro_parcelas p ON p.id = a.parcela_id WHERE p.titulo_id = ?`, [tits[0].id]))[0]?.n)
      : -1;

    reg({
      id: "UI",
      nome: "Fluxo React Nova Venda em INTEGRADO",
      ok: Boolean(ui.ok)
        && ui.estado === "integrado"
        && ui.flag === true
        && ui.chamouIntegrada === true
        && ui.chamouComercial === false
        && ui.validacaoSemAnimal === true,
      detalhe: { ...ui, health },
    });
    reg({
      id: "MYSQL",
      nome: "Persistência da venda feita pela interface",
      ok: Boolean(venda)
        && vendaUi.length === 1
        && venda.status === "concluido"
        && Number(venda.valor_total) === PRECO * 2
        && String(venda.idempotency_key ?? "").startsWith("ven-")
        && itensN === 2
        && tits.length === 1
        && tits[0]?.tipo === "receber"
        && tits[0]?.estado === "ativo"
        && tits[0]?.origem_tipo === "venda_animais"
        && Number(tits[0]?.origem_id) === venda.id
        && Number(tits[0]?.valor_original) === PRECO * 2
        && stA === "vendido" && stB === "vendido"
        && baixaA === 1 && baixaB === 1
        && liqs === 0 && movs === 0,
      detalhe: { vendaUi, itensN, tits, stA, stB, baixaA, baixaB, liqs, movs },
    });

    const depoisOp = await snapshotOp(admin);
    relatorio.operacionalDepois = depoisOp;
    reg({
      id: "OP",
      nome: "Operacional intacto",
      ok: JSON.stringify(antesOp) === JSON.stringify(depoisOp)
        && depoisOp.tables === 55 && depoisOp.fks === 27 && depoisOp.vendas === 2
        && depoisOp.itens === 6 && depoisOp.baixas === 9 && depoisOp.titulos === 6
        && depoisOp.titulosVenda === 0 && depoisOp.animais === 37,
      detalhe: { antesOp, depoisOp },
    });
  } finally {
    await killChild(childApi);
    await killChild(childUi);
    if (pool) await pool.end();
    await admin.end();
  }

  relatorio.cenarios = cenarios;
  relatorio.problemas = problemas;
  relatorio.arquivos = [
    "scripts/homolog-3e12c.ts",
    "scripts/homolog-3e12c-register.mjs",
    "scripts/homolog-3e12c-loader.mjs",
    "scripts/homolog-3e12c-vendaIntegracao.ts",
    "scripts/homolog-3e12c-server.ts",
    "scripts/homolog-3e12c-App.tsx",
    "scripts/homolog-3e12c-main.tsx",
    "scripts/vite.homolog-3e12c.ts",
  ];
  const parecer = !cenarios.find((c) => c.id === "ISO")?.ok
    ? "BLOQUEADA POR ISOLAMENTO"
    : problemas.length
      ? "REPROVADA"
      : "INTERFACE HOMOLOGADA COM RESSALVAS";
  relatorio.parecer = parecer;
  writeFileSync(join(SECRETS_DIR, "homolog-3e12c-relatorio.json"), JSON.stringify(relatorio, null, 2));
  console.log(JSON.stringify({
    fase: "3E.12C",
    parecer,
    problemas,
    cenarios: cenarios.map((c) => ({ id: c.id, ok: c.ok, nome: c.nome })),
  }, null, 2));
  if (parecer === "BLOQUEADA POR ISOLAMENTO") process.exit(2);
}

async function exercitarInterface(input: {
  baseUi: string;
  email: string;
  password: string;
  comprador: string;
  fazenda: string;
  brincos: string[];
}) {
  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("playwright-core ausente. Instale só em node_modules sem commit.");
  }

  const browser = await chromium.launch({
    channel: existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
      || existsSync("C:/Program Files/Microsoft/Edge/Application/msedge.exe")
      ? "msedge"
      : "chrome",
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const reqs: string[] = [];
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => logs.push(`fail: ${req.url()} ${req.failure()?.errorText}`));
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/trpc/")) reqs.push(`${req.method()} ${url}`);
  });

  const out: Record<string, unknown> = { ok: false };
  try {
    await page.goto(`${input.baseUi}/entrar`, { waitUntil: "load", timeout: 90000 });
    await page.screenshot({ path: join(EVID_DIR, "00-entrar.png") });
    writeFileSync(join(EVID_DIR, "00-entrar.html"), await page.content());
    out.entrarUrl = page.url();
    out.entrarTitulo = await page.title();
    out.logs = logs.slice(0, 40);
    const userInput = page.locator('input[autocomplete="username"], input[placeholder="seu@email.com"]');
    await userInput.first().waitFor({ state: "visible", timeout: 25000 });
    await userInput.first().fill(input.email);
    await page.locator('input[autocomplete="current-password"]').fill(input.password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/admin\/overview|\/compra-venda|\/rebanho/, { timeout: 20000 }).catch(() => null);
    await page.screenshot({ path: join(EVID_DIR, "01-login.png") });

    await page.goto(`${input.baseUi}/compra-venda/vendas/nova`, { waitUntil: "networkidle", timeout: 30000 });
    await page.getByRole("heading", { name: "Nova Venda" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    const estado = await page.evaluate(async () => {
      const res = await fetch("/api/trpc/vendas.estadoConfirmacaoVenda");
      const json = await res.json();
      return json?.result?.data?.json;
    });
    const flag = await page.evaluate(async () => {
      const res = await fetch("/api/trpc/vendas.integracaoConfirmacaoAtiva");
      const json = await res.json();
      return json?.result?.data?.json;
    });
    out.estado = estado;
    out.flag = flag;
    await page.screenshot({ path: join(EVID_DIR, "02-nova-venda.png") });

    const confirmarVenda = page.getByRole("button", { name: /^confirmar venda$/i });
    await confirmarVenda.click();
    await page.waitForTimeout(600);
    const toastSemAnimal = await page.locator("text=/Nenhum animal|Informe|Selecione/i").first().isVisible().catch(() => false);
    out.validacaoSemAnimal = toastSemAnimal;
    await page.screenshot({ path: join(EVID_DIR, "03-validacao.png") });

    const buscaFazenda = page.getByPlaceholder(/Selecione a Fazenda primeiro|Buscar por brinco/i);
    if (await page.getByText("Selecione uma fazenda").first().isVisible().catch(() => false)) {
      await escolherSelect(page, "Fazenda", input.fazenda);
      await page.waitForTimeout(800);
    }
    await escolherSelect(page, "Comprador", input.comprador);
    await escolherSelect(page, "Forma de precificação", /cabeça/i);
    await page.locator("input[placeholder='R$ 0,00']").fill("1500");

    const busca = page.getByPlaceholder(/Buscar por brinco, RFID ou nome/i);
    await busca.waitFor({ state: "visible", timeout: 15000 });
    for (const brinco of input.brincos) {
      await busca.fill(brinco);
      await page.waitForTimeout(400);
      await page.getByLabel(new RegExp(`Selecionar ${brinco}`, "i")).click();
    }
    await page.getByRole("button", { name: /Incluir selecionados/i }).click();
    await page.waitForTimeout(400);

    const linhas = await page.locator("tbody tr").filter({ hasText: /UI12C/ }).count();
    out.linhas = linhas;
    const precoLinhas = page.locator("tbody input").filter({ hasNot: page.locator("[placeholder*='kg']") });
    const nPreco = await page.locator("tbody tr td input").count();
    out.nInputsTabela = nPreco;
    const precos = page.locator("tbody tr").filter({ hasText: /UI12C/ }).locator("input");
    const qtd = await precos.count();
    for (let i = 0; i < qtd; i++) {
      const val = await precos.nth(i).inputValue();
      if (!val || /kg/i.test(await precos.nth(i).getAttribute("placeholder") ?? "")) continue;
      await precos.nth(i).fill("1500");
    }
    await page.getByRole("button", { name: /^À vista$|^A vista$/i }).click().catch(() => null);
    await page.screenshot({ path: join(EVID_DIR, "04-preenchida.png") });

    const before = reqs.length;
    await confirmarVenda.click();
    const dialogBtn = page.getByRole("button", { name: /^confirmar venda$/i }).last();
    await dialogBtn.click({ timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const after = reqs.slice(before);
    out.chamouIntegrada = after.some((u) => u.includes("confirmarIntegrada"));
    out.chamouComercial = after.some((u) => /vendas\.confirmar(?!Integrada)/.test(u) || u.includes("vendas.confirmar?") || /vendas\.confirmar,/.test(u) || /\/vendas\.confirmar$/.test(u.split(" ")[1] ?? ""));
    out.reqsConfirm = after;
    const sucesso = /\/compra-venda\/vendas\/\d+|Venda confirmada/i.test(await page.content())
      || Boolean(await page.locator("text=Venda confirmada").count());
    out.sucessoVisivel = sucesso;
    await page.screenshot({ path: join(EVID_DIR, "05-resultado.png") });

    const pendKeys = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes("venpend")) keys.push(k);
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.includes("venpend")) keys.push(`session:${k}`);
      }
      return keys;
    });
    out.pendencias = pendKeys;

    out.ok = estado === "integrado" && flag === true && out.chamouIntegrada === true && out.chamouComercial === false && linhas >= 2;
    out.logs = logs.slice(0, 50);
  } catch (err) {
    writeFileSync(join(EVID_DIR, "ui-erro.json"), JSON.stringify({
      erro: msg(err), logs, url: page.url(), html: (await page.content()).slice(0, 4000),
    }, null, 2));
    throw err;
  } finally {
    await browser.close();
  }
  return out;
}

async function escolherSelect(page: import("playwright-core").Page, label: string, opcao: string | RegExp) {
  const trigger = page.locator(`xpath=//label[contains(., '${label}')]/following::button[1]`).first();
  await trigger.click();
  const item = typeof opcao === "string"
    ? page.getByRole("option", { name: opcao })
    : page.getByRole("option", { name: opcao });
  await item.first().click();
}

main().catch((err) => {
  console.error("FALHA 3E.12C", err);
  process.exit(1);
});
