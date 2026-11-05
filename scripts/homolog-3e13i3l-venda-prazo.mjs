/**
 * 3E.13I.3L — uma confirmação a prazo na UI oficial após correção fazendaId.
 * Não reutiliza chaves antigas. Não registra recebimento. Sem retry automático.
 */
import pkg from "../node_modules/playwright-core/index.js";
const { chromium } = pkg;
const { mkdirSync, writeFileSync } = await import("node:fs");
const { join } = await import("node:path");

const BASE = "http://localhost:3000";
const EMAIL = process.env.FD_3E13I3_EMAIL ?? "";
const PASS = process.env.FD_3E13I3_PASS ?? "";
const EVID = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-3e13i3l";
const CHAVES_PROIBIDAS = [
  "ven-8c853243caae49fda6957fb36aa232d0",
  "ven-89a2b5d471fa470d9d60adbf1eb26ce6",
  "ven-a5a0265163dd43088816c2d1cba868e5",
];
mkdirSync(EVID, { recursive: true });

if (!EMAIL || !PASS) {
  console.error("ABORT: credenciais ausentes");
  process.exit(2);
}

const browser = await chromium.launchPersistentContext(join(EVID, "edge-profile"), {
  channel: "msedge",
  headless: true,
  viewport: { width: 1440, height: 980 },
});
const page = browser.pages()[0] || await browser.newPage();
const rotas = [];
const out = { fase: "3E.13I.3L", cliquesConfirmar: 0, confirmHttp: null, chave: null, erro: null };

page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("/api/trpc/")) return;
  rotas.push({ method: req.method(), path: url.replace(BASE, "").split("?")[0] });
  if (url.includes("confirmarIntegrada") && req.method() === "POST") {
    const raw = req.postData() || "";
    out.chave = raw.match(/ven-[a-f0-9]{16,}/i)?.[0] ?? null;
    out.payloadTemChaveProibida = CHAVES_PROIBIDAS.some((k) => raw.includes(k));
    out.payloadPrazo = /a_prazo/.test(raw);
    out.payloadVista = /a_vista/.test(raw);
    out.payloadParcelado = /"parcelado"/.test(raw);
    out.payloadVencimento = raw.includes("2026-11-27");
    out.payloadPeso300 = raw.includes("300");
    out.payloadPreco10 = /10(\.0+)?/.test(raw);
  }
});

try {
  await page.goto(`${BASE}/entrar`, { waitUntil: "load", timeout: 60000 });
  const temSessao = Boolean((await browser.cookies()).find((c) => c.name === "session"));
  if (!temSessao) {
    const loginCampo = page.locator('input[autocomplete="username"], input[type="email"], input[placeholder="seu@email.com"]').first();
    await loginCampo.waitFor({ state: "visible", timeout: 20000 });
    await loginCampo.fill(EMAIL);
    await page.locator('input[autocomplete="current-password"], input[type="password"]').first().fill(PASS);
    const loginRespPromise = page.waitForResponse(
      (r) => r.url().includes("auth.login") && r.request().method() === "POST",
      { timeout: 20000 },
    );
    await page.getByRole("button", { name: /entrar/i }).click();
    const loginResp = await loginRespPromise;
    out.loginHttp = loginResp.status();
    if (loginResp.status() !== 200) throw new Error(`ABORT: login HTTP ${loginResp.status()}`);
    await page.waitForURL(/\/admin\/overview|\/compra-venda|\/rebanho|\/financeiro/, { timeout: 20000 });
  } else {
    out.loginHttp = "sessao";
  }
  if (!(await browser.cookies()).find((c) => c.name === "session")) {
    throw new Error("ABORT: cookie de sessão ausente");
  }

  const modo = await page.evaluate(async () => {
    const unwrap = (j) => j?.result?.data?.json ?? j?.result?.data ?? null;
    const e = await fetch("/api/trpc/vendas.estadoConfirmacaoVenda", { credentials: "include" });
    const f = await fetch("/api/trpc/vendas.integracaoConfirmacaoAtiva", { credentials: "include" });
    return { estado: unwrap(await e.json()), flag: unwrap(await f.json()) };
  });
  out.modo = modo;
  if (modo.estado !== "integrado" || modo.flag !== true) {
    throw new Error(`ABORT: modo não integrado ${JSON.stringify(modo)}`);
  }

  await page.goto(`${BASE}/compra-venda/vendas/nova`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Nova Venda" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Fazenda J/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /Lucas Coelho/i }).click();

  await page.getByPlaceholder("Buscar por brinco, RFID ou nome").fill("1000");
  await page.waitForTimeout(400);
  await page.getByRole("checkbox", { name: /Selecionar 1000/i }).click();
  await page.getByRole("button", { name: /Incluir selecionados/i }).click();
  await page.waitForTimeout(400);

  const linha = page.locator("table tbody tr").first();
  await linha.locator("input").first().fill("300");
  await linha.locator("input").nth(1).fill("10,00");
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: /^A prazo$/i }).click();
  await page.waitForTimeout(300);
  const venc = page.getByPlaceholder("dd/mm/aaaa").nth(1);
  await venc.click();
  await venc.press("Control+A");
  await venc.press("Backspace");
  await venc.pressSequentially("27112026", { delay: 50 });
  await venc.blur();
  await page.waitForTimeout(400);
  out.vencimentoDigitado = await venc.inputValue();

  const texto = await page.locator("body").innerText();
  out.formAntes = {
    fazendaJ: /Fazenda J/.test(texto),
    lucas: /Lucas Coelho/.test(texto),
    animal1000: /\b1000\b/.test(texto),
    aPrazo: /A prazo/.test(texto),
    total3000: /3\.000,00/.test(texto),
    vencimento: /27\/11\/2026/.test(texto) || /27\/11\/2026/.test(out.vencimentoDigitado || ""),
  };
  if (!out.formAntes.fazendaJ || !out.formAntes.lucas || !out.formAntes.animal1000 || !out.formAntes.total3000) {
    throw new Error(`ABORT: formulário não confere ${JSON.stringify(out.formAntes)}`);
  }
  if (!out.formAntes.vencimento) {
    throw new Error("ABORT: vencimento 27/11/2026 não visível");
  }
  await page.screenshot({ path: join(EVID, "antes-confirmar.png") });

  const integPromise = page.waitForResponse(
    (r) => r.url().includes("confirmarIntegrada") && r.request().method() === "POST",
    { timeout: 25000 },
  );
  await page.getByRole("button", { name: /^Confirmar Venda$/i, disabled: false }).first().click();
  await page.getByText("Comprador:").waitFor({ timeout: 10000 });
  const dialogTxt = await page.locator("body").innerText();
  out.dialogo = {
    lucas: /Lucas Coelho/.test(dialogTxt),
    total3000: /3\.000,00/.test(dialogTxt),
  };
  if (!out.dialogo.lucas || !out.dialogo.total3000) {
    throw new Error(`ABORT: diálogo não confere ${JSON.stringify(out.dialogo)}`);
  }
  await page.screenshot({ path: join(EVID, "dialogo.png") });
  await page.getByRole("button", { name: /^Confirmar Venda$/i }).last().click();
  out.cliquesConfirmar = 1;
  const integ = await integPromise;
  out.confirmHttp = integ.status();
  if (out.payloadTemChaveProibida || CHAVES_PROIBIDAS.includes(out.chave ?? "")) {
    throw new Error("ABORT: tentou reutilizar chave antiga");
  }
  if (out.payloadVista || !out.payloadPrazo) {
    throw new Error("ABORT: condição no payload não é a prazo");
  }
  try {
    const body = await integ.json();
    const err = body?.error?.json ?? body?.error ?? body?.result?.error ?? null;
    out.confirmBody = {
      errorMessage: err?.message ?? err?.json?.message ?? null,
      errorCode: err?.data?.code ?? err?.code ?? err?.json?.data?.code ?? null,
      httpStatus: integ.status(),
      rawKeys: body && typeof body === "object" ? Object.keys(body) : [],
    };
    writeFileSync(join(EVID, "confirm-body.json"), JSON.stringify(body, null, 2));
  } catch {
    out.confirmBody = { parse: false };
  }
  if (out.confirmHttp !== 200) {
    throw new Error(`confirmarIntegrada HTTP ${out.confirmHttp}`);
  }

  await page.waitForURL(/\/compra-venda\/vendas\/\d+/, { timeout: 20000 });
  out.url = page.url();
  await page.waitForTimeout(800);
  const detalhe = await page.locator("body").innerText();
  out.detalhe = {
    venda: (page.url().match(/vendas\/(\d+)/) || [])[1] ?? null,
    lucas: /Lucas Coelho/.test(detalhe),
    animal1000: /\b1000\b/.test(detalhe),
    total3000: /3\.000,00/.test(detalhe),
    concluida: /Conclu[ií]da/.test(detalhe),
  };
  await page.screenshot({ path: join(EVID, "depois-confirmar.png") });

  await page.goto(`${BASE}/financeiro/contas-a-receber`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(800);
  const receber = await page.locator("body").innerText();
  out.receberLista = {
    lucas: /Lucas Coelho/.test(receber),
    total3000: /3\.000,00/.test(receber),
    vencimento: /27\/11\/2026/.test(receber),
  };
  await page.screenshot({ path: join(EVID, "contas-receber.png") });
} catch (err) {
  out.erro = err instanceof Error ? err.message : String(err);
  try { await page.screenshot({ path: join(EVID, "erro.png") }); } catch { /* */ }
} finally {
  out.rotas = rotas.filter((r) => /confirmar|liquidacao|vendas\.cancelar/i.test(r.path));
  await browser.close();
}

writeFileSync(join(EVID, "resultado.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.rotas.some((r) => /liquidacao/i.test(r.path))) process.exit(1);
if (out.erro && out.cliquesConfirmar === 0) process.exit(2);
if (out.erro) process.exit(1);
