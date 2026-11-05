/**
 * 3E.13I.3P — operações oficiais A/B/C/D. Uma confirmação por execução.
 * FD_3E13I3P_OP=A|B|C|D  FD_3E13I3P_TITULO=id (C e D)
 */
import pkg from "../node_modules/playwright-core/index.js";
const { chromium } = pkg;
const { mkdirSync, writeFileSync } = await import("node:fs");
const { join } = await import("node:path");

const OP = String(process.env.FD_3E13I3P_OP ?? "").toUpperCase();
const TITULO = Number(process.env.FD_3E13I3P_TITULO ?? "");
const BASE = "http://localhost:3000";
const EMAIL = process.env.FD_3E13I3_EMAIL ?? "";
const PASS = process.env.FD_3E13I3_PASS ?? "";
const EVID = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-3e13i3p";
mkdirSync(EVID, { recursive: true });

if (!EMAIL || !PASS) {
  console.error("ABORT: credenciais ausentes");
  process.exit(2);
}
if (!["A", "B", "C", "D"].includes(OP)) {
  console.error("ABORT: FD_3E13I3P_OP inválido");
  process.exit(2);
}
if ((OP === "C" || OP === "D") && !Number.isInteger(TITULO)) {
  console.error("ABORT: título ausente");
  process.exit(2);
}

const browser = await chromium.launchPersistentContext(join(EVID, "edge-profile"), {
  channel: "msedge",
  headless: true,
  viewport: { width: 1440, height: 980 },
});
const page = browser.pages()[0] || await browser.newPage();
const rotas = [];
const out = { fase: "3E.13I.3P", op: OP, cliquesConfirmar: 0, http: null, chave: null, erro: null };

page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("/api/trpc/")) return;
  rotas.push({ method: req.method(), path: url.replace(BASE, "").split("?")[0] });
  const raw = req.postData() || "";
  if (req.method() !== "POST") return;
  if (url.includes("confirmarIntegrada")) {
    out.chave = raw.match(/ven-[a-f0-9]{16,}/i)?.[0] ?? null;
    out.payload = {
      parcelado: /"parcelado"/.test(raw),
      definir: /definir_depois/.test(raw),
      vista: /a_vista/.test(raw),
      prazo: /a_prazo/.test(raw),
      v1: raw.includes("2026-11-27"),
      v2: raw.includes("2026-12-27"),
      v3: raw.includes("2027-01-27"),
      peso: raw.includes("300"),
    };
    out.payloadPreview = raw.slice(0, 900);
  }
  if (url.includes("titulosDefinirParcelas")) {
    out.payloadDefinir = raw.slice(0, 700);
  }
  if (url.includes("liquidacaoReceber")) {
    out.payloadReceber = {
      conta97: /"contaId"\s*:\s*97/.test(raw),
      valor1000: /"valorMovimentado"\s*:\s*1000/.test(raw),
      data: /2026-10-28/.test(raw),
    };
    out.payloadReceberRaw = raw.slice(0, 700);
  }
});

async function login() {
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
    throw new Error(`ABORT: modo ${JSON.stringify(modo)}`);
  }
}

async function preencherVenda(brinco) {
  await page.goto(`${BASE}/compra-venda/vendas/nova`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Nova Venda" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Fazenda J/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /Lucas Coelho/i }).click();
  await page.getByPlaceholder("Buscar por brinco, RFID ou nome").fill(brinco);
  await page.waitForTimeout(400);
  await page.getByRole("checkbox", { name: new RegExp(`Selecionar ${brinco}`) }).click();
  await page.getByRole("button", { name: /Incluir selecionados/i }).click();
  await page.waitForTimeout(400);
  const linha = page.locator("table tbody tr").first();
  await linha.locator("input").first().fill("300");
  await linha.locator("input").nth(1).fill("10,00");
  await page.waitForTimeout(300);
}

async function confirmarVenda(esperado) {
  const texto = await page.locator("body").innerText();
  out.formAntes = {
    fazendaJ: /Fazenda J/.test(texto),
    lucas: /Lucas Coelho/.test(texto),
    animal: new RegExp(`\\b${esperado.brinco}\\b`).test(texto),
    total3000: /3\.000,00/.test(texto),
  };
  if (!out.formAntes.fazendaJ || !out.formAntes.lucas || !out.formAntes.animal || !out.formAntes.total3000) {
    throw new Error(`ABORT: formulário ${JSON.stringify(out.formAntes)}`);
  }
  await page.screenshot({ path: join(EVID, `${OP}-antes.png`) });
  const integPromise = page.waitForResponse(
    (r) => r.url().includes("confirmarIntegrada") && r.request().method() === "POST",
    { timeout: 25000 },
  );
  await page.getByRole("button", { name: /^Confirmar Venda$/i, disabled: false }).first().click();
  await page.getByText("Comprador:").waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(EVID, `${OP}-dialogo.png`) });
  await page.getByRole("button", { name: /^Confirmar Venda$/i }).last().click();
  out.cliquesConfirmar = 1;
  const integ = await integPromise;
  out.http = integ.status();
  try {
    const body = await integ.json();
    writeFileSync(join(EVID, `${OP}-body.json`), JSON.stringify(body, null, 2));
    const data = body?.[0]?.result?.data?.json ?? body?.result?.data?.json ?? null;
    const err = body?.error?.json ?? body?.error ?? null;
    out.body = {
      errorMessage: err?.message ?? null,
      vendaId: data?.vendaId ?? null,
      tituloId: data?.tituloId ?? null,
      success: data?.success ?? null,
    };
  } catch {
    out.body = { parse: false };
  }
  if (out.http !== 200) throw new Error(`confirmarIntegrada HTTP ${out.http}`);
  if (esperado.parcelado && !out.payload?.parcelado) throw new Error("ABORT: payload não é parcelado");
  if (esperado.definir && !out.payload?.definir) throw new Error("ABORT: payload não é definir_depois");
  await page.waitForURL(/\/compra-venda\/vendas\/\d+/, { timeout: 20000 });
  out.url = page.url();
  out.vendaNaUrl = (page.url().match(/vendas\/(\d+)/) || [])[1] ?? null;
  await page.screenshot({ path: join(EVID, `${OP}-depois.png`) });
}

try {
  await login();

  if (OP === "A") {
    await preencherVenda("1001");
    await page.getByRole("button", { name: /^Parcelado$/i }).click();
    await page.waitForTimeout(300);
    const qtd = page.locator('input[type="number"]').first();
    await qtd.fill("3");
    await qtd.blur();
    await page.waitForTimeout(400);
    const datas = page.getByPlaceholder("dd/mm/aaaa");
    const seq = ["27112026", "27122026", "27012027"];
    const esperados = ["27/11/2026", "27/12/2026", "27/01/2027"];
    out.parcelasDigitadas = [];
    for (let i = 0; i < 3; i++) {
      const campo = datas.nth(i + 1);
      await campo.click();
      await campo.press("Control+A");
      await campo.press("Backspace");
      await campo.pressSequentially(seq[i], { delay: 40 });
      await campo.blur();
      out.parcelasDigitadas.push(await campo.inputValue());
    }
    await page.waitForTimeout(400);
    out.parcelasVisiveis = {
      d1: out.parcelasDigitadas[0] === esperados[0],
      d2: out.parcelasDigitadas[1] === esperados[1],
      d3: out.parcelasDigitadas[2] === esperados[2],
    };
    if (!out.parcelasVisiveis.d1 || !out.parcelasVisiveis.d2 || !out.parcelasVisiveis.d3) {
      throw new Error(`ABORT: vencimentos ${JSON.stringify(out.parcelasDigitadas)}`);
    }
    await confirmarVenda({ brinco: "1001", parcelado: true });
  }

  if (OP === "B") {
    await preencherVenda("804");
    await page.getByRole("button", { name: /^Definir depois$/i }).click();
    await page.waitForTimeout(300);
    await confirmarVenda({ brinco: "804", definir: true });
  }

  if (OP === "C") {
    await page.goto(`${BASE}/financeiro/contas-a-receber/${TITULO}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByText("Contas a Receber / Detalhes").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: /Definir parcelas/i }).first().click();
    await page.getByText("Valor a receber:").waitFor({ timeout: 10000 });
    const data = page.locator('input[type="date"]').first();
    await data.fill("2026-11-27");
    await data.blur();
    await page.screenshot({ path: join(EVID, "C-dialogo.png") });
    const defPromise = page.waitForResponse(
      (r) => r.url().includes("titulosDefinirParcelas") && r.request().method() === "POST",
      { timeout: 25000 },
    );
    await page.getByRole("button", { name: /^Confirmar$/i }).click();
    await page.getByText("Confirmar parcelas?").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^Definir parcelas$/i }).last().click();
    out.cliquesConfirmar = 1;
    const def = await defPromise;
    out.http = def.status();
    try {
      const body = await def.json();
      writeFileSync(join(EVID, "C-body.json"), JSON.stringify(body, null, 2));
      out.body = { http: def.status() };
    } catch {
      out.body = { parse: false };
    }
    if (out.http !== 200) throw new Error(`titulosDefinirParcelas HTTP ${out.http}`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(EVID, "C-depois.png") });
  }

  if (OP === "D") {
    await page.goto(`${BASE}/financeiro/contas-a-receber/${TITULO}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByText("Contas a Receber / Detalhes").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: /Registrar recebimento/i }).first().click();
    await page.getByText("Valor a receber agora").waitFor({ timeout: 10000 });
    await page.getByText("Conta financeira").locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: /Caixa Teste/i }).click();
    const data = page.getByText("Data do recebimento").locator("..").locator("input").first();
    await data.fill("2026-10-28");
    const valor = page.getByText("Valor a receber agora").locator("..").locator("input").first();
    await valor.click();
    await valor.press("Control+A");
    await valor.fill("1000,00");
    await valor.blur();
    await page.screenshot({ path: join(EVID, "D-dialogo.png") });
    const recPromise = page.waitForResponse(
      (r) => r.url().includes("liquidacaoReceber") && r.request().method() === "POST",
      { timeout: 25000 },
    );
    await page.getByRole("button", { name: /^Continuar$/i }).click();
    await page.getByText("Confirmar recebimento?").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^Registrar recebimento$/i }).last().click();
    out.cliquesConfirmar = 1;
    const rec = await recPromise;
    out.http = rec.status();
    try {
      const body = await rec.json();
      writeFileSync(join(EVID, "D-body.json"), JSON.stringify(body, null, 2));
      const dataBody = body?.[0]?.result?.data?.json ?? null;
      out.body = { liquidacaoId: dataBody?.id ?? null, movimentoId: dataBody?.movimentoId ?? null };
    } catch {
      out.body = { parse: false };
    }
    if (out.http !== 200) throw new Error(`liquidacaoReceber HTTP ${out.http}`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(EVID, "D-depois.png") });
  }
} catch (err) {
  out.erro = err instanceof Error ? err.message : String(err);
  try { await page.screenshot({ path: join(EVID, `${OP}-erro.png`) }); } catch { /* */ }
} finally {
  out.rotas = rotas.filter((r) => /confirmarIntegrada|titulosDefinirParcelas|liquidacaoReceber|cancelar/i.test(r.path));
  await browser.close();
}

writeFileSync(join(EVID, `${OP}-resultado.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.erro && out.cliquesConfirmar === 0) process.exit(2);
if (out.erro) process.exit(1);
if (out.http !== 200) process.exit(1);
