const BASE = "http://127.0.0.1:3010";
const EMAIL = "homolog.3c47@teste.local";
const SENHA = "Homolog3c47!Ui";
const login = await fetch(`${BASE}/api/trpc/auth.login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ json: { username: EMAIL, password: SENHA } }),
});
const loginJson = await login.json();
const cookie = (login.headers.getSetCookie?.() || []).find(c => c.startsWith("session="))?.split(";")[0];
async function get(path, input) {
  const url = new URL(`${BASE}/api/trpc/${path}`);
  if (input !== undefined) url.searchParams.set("input", JSON.stringify({ json: input }));
  const res = await fetch(url, { headers: { cookie } });
  const json = await res.json();
  return json?.result?.data?.json ?? json?.result?.data;
}
const titulo = await get("financeiroV2.titulosGet", { id: 1 });
const hist = await get("financeiroV2.tituloHistoricoPagamentos", { tituloId: 1 });
const contas = await get("financeiroV2.contasList");
const p1 = titulo.parcelas.find(p => p.numero === 1);
const p2 = titulo.parcelas.find(p => p.numero === 2);
console.log(JSON.stringify({
  user: loginJson?.result?.data?.json?.user?.email ?? loginJson?.result?.data?.user?.email,
  titulo: {
    valorOriginal: titulo.valorOriginal,
    condicao: titulo.condicaoStatus,
    situacao: titulo.situacao,
  },
  p1: { valor: p1.valorOriginal, pago: p1.principalLiquidado, saldo: p1.saldoPrincipal, quitada: p1.quitada },
  p2: { valor: p2.valorOriginal, pago: p2.principalLiquidado, saldo: p2.saldoPrincipal, quitada: p2.quitada },
  historico: (hist.eventos || []).map(e => ({
    valor: e.valorAlocadoNesteTitulo,
    conta: e.contaNome,
    data: e.dataLiquidacao,
    tipo: e.tipo,
    estorno: Boolean(e.estornoId || e.estornado),
  })),
  contas: (contas || []).map(c => ({ nome: c.nome, ativa: c.ativa, saldoAtual: c.saldoAtual })),
}, null, 2));
