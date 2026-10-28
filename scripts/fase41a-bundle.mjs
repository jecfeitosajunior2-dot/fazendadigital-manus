const html = await (await fetch("http://127.0.0.1:3000/")).text();
const match = html.match(/src="(\/assets\/index-[^"]+)"/);
const js = match ? await (await fetch(`http://127.0.0.1:3000${match[1]}`)).text() : "";
console.log(JSON.stringify({
  bundle: match?.[1] ?? null,
  caixaBancos: js.includes("Caixa e Bancos"),
  visaoNeutra: js.includes("Os números oficiais do caixa"),
  relatorioNeutro: js.includes("Relatório financeiro ainda não disponível"),
  ficticio329: js.includes("329.000") || js.includes("329000"),
  v2Path: js.includes("/financeiro/v2/contas"),
}, null, 2));
