import { createRequire } from "module";
import { mkdirSync } from "fs";
import { resolve } from "path";
const require = createRequire("C:/Users/PEDRON~1/AppData/Local/Temp/fd-pw/package.json");
const puppeteer = require("puppeteer-core");

const BASE = "http://127.0.0.1:3010";
const EMAIL = "homolog.3c47@teste.local";
const SENHA = "Homolog3c47!Ui";
const SHOT = resolve(".local-data/homolog-3c47-pay-shots");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
mkdirSync(SHOT, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });
}

async function waitText(page, text, timeout = 20000) {
  await page.waitForFunction(
    t => (document.body?.innerText || "").toLowerCase().includes(String(t).toLowerCase()),
    { timeout },
    text,
  );
}

async function clickText(page, text) {
  const ok = await page.evaluate(t => {
    const els = [...document.querySelectorAll("button, a")];
    const el = els.find(e => (e.textContent || "").replace(/\s+/g, " ").trim().includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`Não achei o clique: ${text}`);
}

async function setNearLabel(page, labelPrefix, value) {
  const done = await page.evaluate((lab, val) => {
    const alvo = lab.toLowerCase();
    const span = [...document.querySelectorAll("span, label")].find(e => (e.textContent || "").trim().toLowerCase().startsWith(alvo));
    if (!span) return "no-label";
    const root = span.closest("label") || span.parentElement;
    const input = root?.querySelector("input");
    if (!input) return "no-input";
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    desc.set.call(input, val);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.value;
  }, labelPrefix, value);
  if (done === "no-label" || done === "no-input") throw new Error(`Campo ${labelPrefix}: ${done}`);
  return done;
}

const login = await fetch(`${BASE}/api/trpc/auth.login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ json: { username: EMAIL, password: SENHA } }),
});
const loginJson = await login.json();
const user = loginJson?.result?.data?.json?.user ?? loginJson?.result?.data?.user;
if (!user || user.email !== EMAIL) throw new Error("ABORT: login API 3010 não é o usuário fictício");
const cookie = (login.headers.getSetCookie?.() || []).find(c => c.startsWith("session="))?.split(";")[0];
const tit = await fetch(`${BASE}/api/trpc/financeiroV2.titulosGet?input=${encodeURIComponent(JSON.stringify({ json: { id: 1 } }))}`, {
  headers: { cookie },
});
const titJson = await tit.json();
const titulo = titJson?.result?.data?.json ?? titJson?.result?.data;
if (!titulo || titulo.descricao !== "Título homologação interface 3C.4.8") {
  throw new Error("ABORT: servidor 3010 não devolveu o título isolado");
}
if ((titulo.parcelas || []).length !== 2) throw new Error("ABORT: título sem 2 parcelas");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${SHOT}/chrome-profile`],
});
const page = await browser.newPage();
page.setDefaultTimeout(25000);
await page.setViewport({ width: 1400, height: 900 });

try {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[placeholder="seu@email.com"]');
  await page.type('input[placeholder="seu@email.com"]', EMAIL);
  await page.type('input[placeholder="••••••••"]', SENHA);
  await clickText(page, "Entrar");
  await page.waitForFunction(() => !location.pathname.includes("/entrar"), { timeout: 20000 });

  await page.goto(`${BASE}/financeiro/contas-a-pagar/1`, { waitUntil: "networkidle2" });
  await waitText(page, "Registrar pagamento");
  await shot(page, "01-antes");

  const clicked = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find(tr => (tr.textContent || "").includes("25/10/2026"));
    if (!row) return "no-row";
    const btn = [...row.querySelectorAll("button")].find(b => (b.textContent || "").includes("Registrar pagamento"));
    if (!btn) return "no-btn";
    btn.click();
    return "ok";
  });
  if (clicked !== "ok") throw new Error(`Parcela 1: ${clicked}`);

  await waitText(page, "Continuar");
  await setNearLabel(page, "valor do pagamento", "40,00");
  const precisaConta = await page.evaluate(() => (document.body.innerText || "").includes("Selecione a conta"));
  if (precisaConta) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(e => (e.textContent || "").includes("Selecione a conta"));
      if (btn) btn.click();
    });
    await page.waitForSelector('[role="option"]');
    await page.evaluate(() => {
      const opt = [...document.querySelectorAll('[role="option"]')].find(e => (e.textContent || "").includes("Caixa Homolog"));
      if (!opt) throw new Error("conta ausente");
      opt.click();
    });
  }
  await setNearLabel(page, "data do pagamento", "2026-10-20");
  await shot(page, "02-form");
  await clickText(page, "Continuar");
  await waitText(page, "Confirmar pagamento?");
  await shot(page, "03-confirma");
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter(b => (b.textContent || "").trim() === "Registrar pagamento");
    const ultimo = btns[btns.length - 1];
    if (!ultimo) throw new Error("botão confirmar ausente");
    ultimo.click();
  });
  await waitText(page, "Pagamento registrado.");
  await page.waitForFunction(() => (document.body.innerText || "").includes("40,00"), { timeout: 20000 });
  await shot(page, "04-detalhe-depois");
  const detalhe = await page.evaluate(() => document.body.innerText);

  await page.goto(`${BASE}/financeiro/v2/contas`, { waitUntil: "networkidle2" });
  await waitText(page, "Caixa Homolog");
  await shot(page, "05-conta");
  const contasTxt = await page.evaluate(() => document.body.innerText);

  console.log(JSON.stringify({
    ok: true,
    apiTitulo: { id: titulo.id, descricao: titulo.descricao, userEmail: user.email },
    detalheTem40: detalhe.includes("40,00"),
    detalheTem60: detalhe.includes("60,00"),
    detalheTem210: detalhe.includes("210,00"),
    detalheParcial: /parcial/i.test(detalhe),
    historico: detalhe.includes("Caixa Homolog") && detalhe.includes("20/10/2026"),
    conta960: contasTxt.includes("960"),
    shots: SHOT,
  }, null, 2));
} catch (err) {
  await shot(page, "erro").catch(() => {});
  const dump = await page.evaluate(() => ({ url: location.href, text: (document.body.innerText || "").slice(0, 3000) })).catch(() => ({}));
  console.error(JSON.stringify({ ok: false, erro: String(err), dump }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
