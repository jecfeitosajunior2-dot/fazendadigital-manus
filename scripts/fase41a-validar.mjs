/**
 * Fase 4.1A — leitura e chamadas de proteção. Não grava financeiro.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const EVID = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-fase41a";
const EMAIL = process.env.FD_3E13I3_EMAIL || "admin@fazendadigital.local";
const PASS = process.env.FD_3E13I3_PASS || "admin123";
mkdirSync(EVID, { recursive: true });

function unwrap(body) {
  return body?.result?.data?.json ?? body?.result?.data ?? null;
}

function erroTrpc(body) {
  const err = body?.error?.json ?? body?.error ?? body?.result?.error?.json ?? body?.result?.error ?? null;
  return {
    code: err?.data?.code ?? err?.code ?? null,
    message: err?.message ?? null,
  };
}

async function trpc(path, { method = "GET", cookie, body } = {}) {
  const url = body
    ? `${BASE}/api/trpc/${path}`
    : method === "GET" && path.includes("?")
      ? `${BASE}/api/trpc/${path}`
      : `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify({ json: body }) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 400), err: erroTrpc(json), data: unwrap(json) };
}

function queryUrl(path, input) {
  return `${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

const out = { fase: "4.1A", http: null, health: null, login: null, integrado: null, legado: {}, v2: {}, rotas: {} };

try {
  const home = await fetch(`${BASE}/`, { redirect: "manual" });
  out.http = { status: home.status };

  const health = await fetch(`${BASE}/api/health`);
  out.health = { status: health.status, body: await health.json() };

  const login = await fetch(`${BASE}/api/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { username: EMAIL, password: PASS } }),
  });
  const loginJson = await login.json();
  const user = unwrap(loginJson)?.user ?? unwrap(loginJson);
  const setCookie = login.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.find((c) => c.startsWith("session="))?.split(";")[0] ?? null;
  out.login = { status: login.status, ok: Boolean(user?.id && cookie), userId: user?.id ?? null };

  if (!cookie) throw new Error("sem cookie de sessão");

  const estado = await trpc("vendas.estadoConfirmacaoVenda", { cookie });
  const flag = await trpc("vendas.integracaoConfirmacaoAtiva", { cookie });
  out.integrado = { estado: estado.data, flag: flag.data, status: [estado.status, flag.status] };

  for (const nome of ["listContas", "listMovimentacoes", "summary"]) {
    out.legado[nome] = await trpc(`financeiro.${nome}`, { cookie });
  }
  out.legado.createConta = await trpc("financeiro.createConta", {
    method: "POST",
    cookie,
    body: { nome: "NAO-GRAVAR", tipo: "caixa" },
  });
  out.legado.createMovimentacao = await trpc("financeiro.createMovimentacao", {
    method: "POST",
    cookie,
    body: {
      tipo: "receita",
      descricao: "NAO-GRAVAR",
      valor: "1",
      data: "2026-10-28",
    },
  });
  out.legado.deleteMovimentacao = await trpc("financeiro.deleteMovimentacao", {
    method: "POST",
    cookie,
    body: { id: 1 },
  });

  const contas = await trpc("financeiroV2.contasList", { cookie });
  const caixa = Array.isArray(contas.data)
    ? contas.data.find((c) => c.id === 97)
    : null;
  out.v2.contasListStatus = contas.status;
  out.v2.caixa97 = caixa
    ? { id: caixa.id, nome: caixa.nome, saldoAtual: caixa.saldoAtual, ativa: caixa.ativa }
    : null;
  out.v2.qtdContas = Array.isArray(contas.data) ? contas.data.length : null;

  const tit108 = await trpc(queryUrl("financeiroV2.titulosGet", { id: 108 }), { cookie });
  out.v2.titulo108 = tit108.data
    ? { id: tit108.data.id ?? tit108.data.titulo?.id, estado: tit108.data.estado ?? tit108.data.titulo?.estado }
    : { err: tit108.err };

  for (const path of [
    "/financeiro/visao-geral",
    "/financeiro/contas-a-receber",
    "/financeiro/contas-a-pagar",
    "/financeiro/v2/contas",
    "/financeiro/pessoas",
    "/financeiro/contas",
    "/financeiro/movimentacao",
    "/relatorios/visao-geral",
  ]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    out.rotas[path] = { status: res.status, location: res.headers.get("location") };
  }

  writeFileSync(`${EVID}/validacao.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} catch (error) {
  out.erro = String(error.message || error);
  writeFileSync(`${EVID}/validacao.json`, JSON.stringify(out, null, 2));
  console.error(JSON.stringify(out, null, 2));
  process.exit(2);
}
