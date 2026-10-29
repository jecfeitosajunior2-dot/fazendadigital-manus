import { describe, expect, it } from "vitest";
import {
  fazendaIdAutorizada,
  filtrarMovimentacoesEstoque,
  filtrarProdutosEstoque,
  idsEstoqueNaoAutorizados,
  movimentacaoEstoqueVisivel,
  podeEscreverProdutoEstoque,
  produtoEstoqueNaFazenda,
  produtoEstoqueVisivel,
  setFazendasDoUsuario,
} from "./estoqueIsolamento";

const fazendasA = setFazendasDoUsuario([10, 11]);
const fazendasB = setFazendasDoUsuario([20]);

const produtoA = { id: 1, nome: "Sal", fazendaId: 10, quantidade: "50" };
const produtoB = { id: 2, nome: "Milho", fazendaId: 20, quantidade: "80" };
const produtoOrfao = { id: 3, nome: "Sem fazenda", fazendaId: null, quantidade: "9" };
const produtoFazendaInvalida = { id: 4, nome: "Fazenda 0", fazendaId: 0, quantidade: "1" };

describe("estoqueIsolamento — produtos", () => {
  it("usuário A vê só o produto da própria fazenda", () => {
    expect(filtrarProdutosEstoque([produtoA, produtoB, produtoOrfao], [10, 11])).toEqual([produtoA]);
  });

  it("usuário B vê só o produto da própria fazenda", () => {
    expect(filtrarProdutosEstoque([produtoA, produtoB], [20])).toEqual([produtoB]);
  });

  it("usuário A não vê registros do usuário B", () => {
    expect(produtoEstoqueVisivel(produtoB, fazendasA)).toBe(false);
    expect(filtrarProdutosEstoque([produtoB], [10, 11])).toEqual([]);
  });

  it("produto sem vínculo válido não aparece para ninguém", () => {
    expect(produtoEstoqueVisivel(produtoOrfao, fazendasA)).toBe(false);
    expect(produtoEstoqueVisivel(produtoFazendaInvalida, fazendasA)).toBe(false);
    expect(filtrarProdutosEstoque([produtoOrfao, produtoFazendaInvalida], [10, 20])).toEqual([]);
  });

  it("proprietário legítimo continua vendo o próprio item", () => {
    expect(produtoEstoqueVisivel(produtoA, fazendasA)).toBe(true);
  });

  it("usuário sem fazenda não vê nada", () => {
    expect(filtrarProdutosEstoque([produtoA, produtoB], [])).toEqual([]);
  });
});

describe("estoqueIsolamento — movimentações", () => {
  const movA = { id: 100, fazendaId: 10, produtoFazendaId: 10, nome: "Sal" };
  const movB = { id: 200, fazendaId: 20, produtoFazendaId: 20, nome: "Milho" };
  const movOrfa = { id: 300, fazendaId: null, produtoFazendaId: null, nome: "Avulso" };
  const movFazendaCruzada = { id: 400, fazendaId: 10, produtoFazendaId: 20, nome: "Vazamento" };
  const movSoProdutoA = { id: 500, fazendaId: null, produtoFazendaId: 10, nome: "Histórico A" };

  it("movimentações respeitam o mesmo isolamento", () => {
    expect(filtrarMovimentacoesEstoque([movA, movB, movOrfa], [10, 11])).toEqual([movA]);
    expect(filtrarMovimentacoesEstoque([movA, movB, movSoProdutoA], [10])).toEqual([movA, movSoProdutoA]);
    expect(filtrarMovimentacoesEstoque([movA, movB], [20])).toEqual([movB]);
  });

  it("usuário A não vê movimentação do usuário B", () => {
    expect(movimentacaoEstoqueVisivel(movB, fazendasA)).toBe(false);
    expect(movimentacaoEstoqueVisivel(movA, fazendasB)).toBe(false);
  });

  it("filtro por fazenda não permite acesso cruzado no produto", () => {
    expect(movimentacaoEstoqueVisivel(movFazendaCruzada, fazendasA)).toBe(false);
    expect(movimentacaoEstoqueVisivel(movFazendaCruzada, fazendasB)).toBe(false);
  });

  it("histórico sem fazenda no lançamento usa a fazenda do produto", () => {
    expect(movimentacaoEstoqueVisivel(movSoProdutoA, fazendasA)).toBe(true);
    expect(movimentacaoEstoqueVisivel(movSoProdutoA, fazendasB)).toBe(false);
  });

  it("movimento órfão não é exposto", () => {
    expect(movimentacaoEstoqueVisivel(movOrfa, fazendasA)).toBe(false);
  });
});

describe("estoqueIsolamento — painel (alertas derivados)", () => {
  it("só produtos autorizados entram no recorte do painel", () => {
    const baixoA = { ...produtoA, monitorarEstoque: true, quantidadeMinima: "60" };
    const baixoB = { ...produtoB, monitorarEstoque: true, quantidadeMinima: "90" };
    const visiveis = filtrarProdutosEstoque([baixoA, baixoB], [10]);
    expect(visiveis).toEqual([baixoA]);
    expect(visiveis.some(p => p.fazendaId === 20)).toBe(false);
  });
});

describe("estoqueIsolamento — escrita", () => {
  it("usuário A pode escrever no próprio produto e B é recusado", () => {
    expect(podeEscreverProdutoEstoque(produtoA, fazendasA)).toBe(true);
    expect(podeEscreverProdutoEstoque(produtoA, fazendasB)).toBe(false);
    expect(idsEstoqueNaoAutorizados([produtoA, produtoB], fazendasA)).toEqual([2]);
  });

  it("ID de produto alheio e produto sem fazenda são rejeitados", () => {
    expect(podeEscreverProdutoEstoque(produtoB, fazendasA)).toBe(false);
    expect(podeEscreverProdutoEstoque(produtoOrfao, fazendasA)).toBe(false);
    expect(podeEscreverProdutoEstoque(null, fazendasA)).toBe(false);
  });

  it("troca de fazenda não autoriza produto de outro", () => {
    expect(produtoEstoqueNaFazenda(produtoA, 10)).toBe(true);
    expect(produtoEstoqueNaFazenda(produtoA, 20)).toBe(false);
    expect(produtoEstoqueNaFazenda(produtoB, 10)).toBe(false);
  });
});

describe("estoqueIsolamento — fazendaId", () => {
  it("recusa id nulo, zero e fazenda de outro", () => {
    expect(fazendaIdAutorizada(null, fazendasA)).toBe(false);
    expect(fazendaIdAutorizada(undefined, fazendasA)).toBe(false);
    expect(fazendaIdAutorizada(0, fazendasA)).toBe(false);
    expect(fazendaIdAutorizada(20, fazendasA)).toBe(false);
    expect(fazendaIdAutorizada(10, fazendasA)).toBe(true);
  });
});
