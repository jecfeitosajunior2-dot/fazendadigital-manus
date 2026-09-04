import { describe, expect, it } from "vitest";
import { produtoControlaSaldo } from "@shared/estoqueControle";

/** Métricas espelhadas da Visão Geral — fixture da Fazenda 1 (local.json). */
const FAZENDA_1_PRODUTOS = [
  {
    id: 25,
    nome: "Kinetomax",
    quantidade: "140",
    quantidadeMinima: "50",
    monitorarEstoque: true,
    controlarSaldo: true,
    situacao: "ativo",
    valorUnitario: "1.76",
  },
  {
    id: 26,
    nome: "Monovim B-12",
    quantidade: "30",
    quantidadeMinima: "0",
    monitorarEstoque: true,
    controlarSaldo: true,
    situacao: "ativo",
    valorUnitario: "1.02",
  },
  {
    id: 28,
    nome: "Oleo 15W40",
    quantidade: "0",
    quantidadeMinima: "0",
    monitorarEstoque: false,
    controlarSaldo: false,
    situacao: "ativo",
    valorUnitario: "8.00",
  },
] as const;

const FAZENDA_1_MOVS = [
  { estoqueId: 25, tipo: "Compra", status: "ativa", dataMovimentacao: "2026-08-21", valor: "166", quantidade: "100" },
  { estoqueId: 26, tipo: "Compra", status: "ativa", dataMovimentacao: "2026-08-21", valor: "82", quantidade: "40" },
  { estoqueId: 25, tipo: "Compra", status: "ativa", dataMovimentacao: "2026-08-21", valor: "97.5", quantidade: "50" },
  { estoqueId: 28, tipo: "Compra", status: "ativa", dataMovimentacao: "2026-09-04", valor: "160", quantidade: "20" },
] as const;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

function abaixoMinimo(produtos: readonly (typeof FAZENDA_1_PRODUTOS)[number][]) {
  return produtos.filter(
    p =>
      p.situacao !== "inativo" &&
      produtoControlaSaldo(p.controlarSaldo) &&
      p.monitorarEstoque &&
      num(p.quantidadeMinima) > 0 &&
      num(p.quantidade) <= num(p.quantidadeMinima),
  );
}

function valorEmEstoque(produtos: readonly (typeof FAZENDA_1_PRODUTOS)[number][]) {
  return produtos
    .filter(p => produtoControlaSaldo(p.controlarSaldo) && num(p.quantidade) > 0)
    .reduce((s, p) => s + num(p.quantidade) * num(p.valorUnitario), 0);
}

function comprasPeriodo(
  movs: readonly (typeof FAZENDA_1_MOVS)[number][],
  produtos: readonly (typeof FAZENDA_1_PRODUTOS)[number][],
  ini: string,
  fim: string,
) {
  let comprado = 0;
  let semEstoque = 0;
  for (const mv of movs) {
    if (String(mv.status).toLowerCase() === "estornada") continue;
    if (String(mv.tipo).toLowerCase() !== "compra") continue;
    if (mv.dataMovimentacao < ini || mv.dataMovimentacao > fim) continue;
    const prod = produtos.find(p => p.id === mv.estoqueId);
    const valor = num(mv.valor);
    comprado += valor;
    if (!produtoControlaSaldo(prod?.controlarSaldo)) semEstoque += valor;
  }
  return { comprado, semEstoque };
}

describe("insumosVisaoGeralMetrics — Fazenda 1", () => {
  const periodoIni = "2026-06-08";
  const periodoFim = "2026-09-04";

  it("não há produtos abaixo do mínimo (modal vazio)", () => {
    expect(abaixoMinimo(FAZENDA_1_PRODUTOS)).toHaveLength(0);
  });

  it("valor em estoque soma só estocáveis com saldo", () => {
    expect(valorEmEstoque(FAZENDA_1_PRODUTOS)).toBeCloseTo(277, 0);
  });

  it("compras sem estoque inclui Oleo 15W40 (consumo direto)", () => {
    const { comprado, semEstoque } = comprasPeriodo(
      FAZENDA_1_MOVS,
      FAZENDA_1_PRODUTOS,
      periodoIni,
      periodoFim,
    );
    expect(comprado).toBeCloseTo(505.5, 1);
    expect(semEstoque).toBe(160);
  });
});
