/**
 * 3E.13I.3M — um recebimento parcial oficial de R$ 1.000,00 na parcela 98.
 * Sem retry. Sem quitar o restante.
 */
import pkg from "../node_modules/playwright-core/index.js";
const { chromium } = pkg;
const { mkdirSync, writeFileSync } = await import("node:fs");
const { join } = await import("node:path");

const BASE = "http://localhost:3000";
const EMAIL = process.env.FD_3E13I3_EMAIL ?? "";
const PASS = process.env.FD_3E13I3_PASS ?? "";
const EVID = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-3e13i3m";
mkdirSync(EVID, { recursive: true });

if (!EMAIL || !PASS) {
  console.error("ABORT: credenciais ausentes");
  process.exit(2);
}

const browser = await chromium.launchPersistentContext(join(EVID, "edge-profile-m"), {
  channel: "msedge",
  headless: true,
  viewport: { width: 1440, height: 980 },
});
const page = browser.pages()[0] || await browser.newPage();
const rotas = [];
const out = {
  fase: "3E.13I.3M",
  cliquesConfirmar: 0,
  receberHttp: null,
  erro: null,
};

page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("/api/trpc/")) return;
  rotas.push({ method: req.method(), path: url.replace(BASE, "").split("?")[0] });
  if (url.includes("liquidacaoReceber") && req.method() === "POST") {
    const raw = req.postData() || "";
    out.payloadConta97 = /"contaId"\s*:\s*97/.test(raw);
    out.payloadValor1000 = /"valorMovimentado"\s*:\s*1000/.test(raw);
    out.payloadParcela98 = /"parcelaId"\s*:\s*98/.test(raw);
    out.payloadJuros = /"juros"\s*:\s*([0-9.]+)/.exec(raw)?.[1] ?? "ausente";
    out.payloadMulta = /"multa"\s*:\s*([0-9.]+)/.exec(raw)?.[1] ?? "ausente";
    out.payloadDesconto = /"desconto"\s*:\s*([0-9.]+)/.exec(raw)?.[1] ?? "ausente";
    out.payloadData = /"dataLiquidacao"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? null;
    out.payloadRawPreview = raw.slice(0, 800);
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

  await page.goto(`${BASE}/financeiro/contas-a-receber`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByText("Todas as datas").first().click();
  await page.waitForTimeout(800);
  const listaTxt = await page.locator("body").innerText();
  out.lista = {
    lucas: /Lucas Coelho/.test(listaTxt),
    total3000: /3\.000,00/.test(listaTxt),
  };
  await page.screenshot({ path: join(EVID, "lista-receber.png") });

  const linha = page.locator("table tbody tr").filter({ hasText: /Lucas Coelho/ }).filter({ hasText: /3\.000,00/ }).first();
  if (await linha.count()) {
    await linha.click({ timeout: 5000 }).catch(() => {});
  }
  await page.goto(`${BASE}/financeiro/contas-a-receber/108`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByText("Contas a Receber / Detalhes").waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  const detTxt = await page.locator("body").innerText();
  out.detalheAntes = {
    titulo108: /108/.test(detTxt) || page.url().includes("/108"),
    lucas: /Lucas Coelho/.test(detTxt),
    venda5: /Venda|#\s*5|venda 5/i.test(detTxt),
    original3000: /3\.000,00/.test(detTxt),
  };
  if (!out.detalheAntes.lucas || !out.detalheAntes.original3000) {
    throw new Error(`ABORT: detalhe não confere ${JSON.stringify(out.detalheAntes)}`);
  }

  await page.getByRole("button", { name: /Registrar recebimento/i }).first().click();
  await page.getByText("Valor a receber agora").waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);

  await page.getByText("Conta financeira").locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: /Caixa Teste/i }).click();

  const valor = page.getByText("Valor a receber agora").locator("..").locator("input").first();
  await valor.click();
  await valor.press("Control+A");
  await valor.press("Backspace");
  await valor.fill("1000,00");
  await valor.blur();
  await page.waitForTimeout(300);
  out.valorDigitado = await valor.inputValue();
  out.dataDigitada = await page.getByText("Data do recebimento").locator("..").locator("input").first().inputValue();
  await page.screenshot({ path: join(EVID, "dialogo-recebimento.png") });

  if (!/1\.?000,00|1000,00/.test(out.valorDigitado || "")) {
    throw new Error(`ABORT: valor no formulário ${out.valorDigitado}`);
  }

  const receberPromise = page.waitForResponse(
    (r) => r.url().includes("liquidacaoReceber") && r.request().method() === "POST",
    { timeout: 25000 },
  );
  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.getByText("Confirmar recebimento?").waitFor({ timeout: 10000 });
  const confTxt = await page.locator("body").innerText();
  out.confirmacao = {
    lucas: /Lucas Coelho/.test(confTxt),
    valor1000: /1\.000,00|1000,00/.test(confTxt),
    caixa: /Caixa Teste/.test(confTxt),
  };
  if (!out.confirmacao.valor1000 || !out.confirmacao.caixa) {
    throw new Error(`ABORT: diálogo não confere ${JSON.stringify(out.confirmacao)}`);
  }
  await page.screenshot({ path: join(EVID, "confirmar-recebimento.png") });
  await page.getByRole("button", { name: /^Registrar recebimento$/i }).last().click();
  out.cliquesConfirmar = 1;

  const rec = await receberPromise;
  out.receberHttp = rec.status();
  try {
    const body = await rec.json();
    writeFileSync(join(EVID, "receber-body.json"), JSON.stringify(body, null, 2));
    const err = body?.error?.json ?? body?.error ?? null;
    const data = body?.[0]?.result?.data?.json ?? body?.result?.data?.json ?? null;
    out.receberBody = {
      errorMessage: err?.message ?? null,
      errorCode: err?.data?.code ?? err?.code ?? null,
      httpStatus: rec.status(),
      liquidacaoId: data?.id ?? data?.liquidacaoId ?? null,
    };
  } catch {
    out.receberBody = { parse: false };
  }
  if (out.receberHttp !== 200) {
    throw new Error(`liquidacaoReceber HTTP ${out.receberHttp}`);
  }
  if (out.payloadValor1000 === false || out.payloadParcela98 === false || out.payloadConta97 === false) {
    throw new Error(`ABORT: payload fora do autorizado ${JSON.stringify({
      conta: out.payloadConta97,
      valor: out.payloadValor1000,
      parcela: out.payloadParcela98,
    })}`);
  }

  await page.waitForTimeout(1200);
  const depois = await page.locator("body").innerText();
  out.detalheDepois = {
    recebido1000: /1\.000,00/.test(depois),
    saldo2000: /2\.000,00/.test(depois),
    parcial: /Parcial/.test(depois),
  };
  await page.screenshot({ path: join(EVID, "depois-recebimento.png") });
} catch (err) {
  out.erro = err instanceof Error ? err.message : String(err);
  try { await page.screenshot({ path: join(EVID, "erro-recebimento.png") }); } catch { /* */ }
} finally {
  out.rotas = rotas.filter((r) => /liquidacao|vendas\.(confirmar|cancelar)/i.test(r.path));
  await browser.close();
}

writeFileSync(join(EVID, "resultado-recebimento.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.erro && out.cliquesConfirmar === 0) process.exit(2);
if (out.erro) process.exit(1);
if ((out.rotas || []).filter((r) => /liquidacaoReceber/i.test(r.path)).length !== 1) process.exit(1);
