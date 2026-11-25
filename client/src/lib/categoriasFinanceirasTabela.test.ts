import { describe, expect, it } from "vitest";
import {
  categoriasVisiveis,
  linhasDaTabelaCategorias,
  ORDEM_PAIS_DESPESA,
  ORDEM_PAIS_RECEITA,
  separarCategoriasFinanceiras,
  type CategoriaFinanceiraLista,
} from "./categoriasFinanceirasTabela";

const item = (
  id: number,
  nome: string,
  tipo: string,
  categoriaPaiId: number | null = null,
): CategoriaFinanceiraLista => ({ id, nome, tipo, categoriaPaiId, ativa: true });

describe("tabela de categorias financeiras", () => {
  it("separa receitas e despesas e põe o filho abaixo do pai", () => {
    const separado = separarCategoriasFinanceiras([
      item(2, "Sal mineral", "saida", 1),
      item(1, "Nutrição", "saida"),
      item(3, "Venda de animais", "entrada"),
      item(4, "Arrendamento", "entrada"),
    ]);
    expect(separado.receitas.map((categoria) => categoria.nome)).toEqual(["Arrendamento", "Venda de animais"]);
    expect(separado.despesas.map((categoria) => categoria.nome)).toEqual(["Nutrição", "Sal mineral"]);
  });

  it("lista os pais de receita na ordem da fazenda, sem depender do alfabeto", () => {
    const separado = separarCategoriasFinanceiras(
      [...ORDEM_PAIS_RECEITA].reverse().map((nome, indice) => item(indice + 1, nome, "entrada")),
    );
    expect(separado.receitas.map((categoria) => categoria.nome)).toEqual([...ORDEM_PAIS_RECEITA]);
  });

  it("lista os pais de despesa na ordem da fazenda, sem depender do alfabeto", () => {
    const separado = separarCategoriasFinanceiras(
      [...ORDEM_PAIS_DESPESA].reverse().map((nome, indice) => item(indice + 1, nome, "saida")),
    );
    expect(separado.despesas.map((categoria) => categoria.nome)).toEqual([...ORDEM_PAIS_DESPESA]);
  });

  it("mostra a seta só no pai com filho e esconde o filho quando o pai está fechado", () => {
    const separado = separarCategoriasFinanceiras([
      item(1, "Venda de animais", "entrada"),
      item(2, "Venda de bezerros", "entrada", 1),
      item(3, "Arrendamento", "entrada"),
      item(4, "Nutrição", "saida"),
      item(5, "Sal mineral", "saida", 4),
      item(6, "Sanidade", "saida"),
    ]);
    const receitasAbertas = categoriasVisiveis(separado.receitas, new Set());
    expect(receitasAbertas.map((linha) => [linha.categoria.nome, linha.temFilhos, linha.aberta, linha.filha])).toEqual([
      ["Arrendamento", false, false, false],
      ["Venda de animais", true, true, false],
      ["Venda de bezerros", false, false, true],
    ]);
    const despesasFechadas = categoriasVisiveis(separado.despesas, new Set([4]));
    expect(despesasFechadas.map((linha) => linha.categoria.nome)).toEqual(["Nutrição", "Sanidade"]);
    expect(despesasFechadas[0]).toMatchObject({ temFilhos: true, aberta: false, filha: false });
    expect(categoriasVisiveis(separado.receitas, new Set([4])).map((linha) => linha.categoria.nome)).toContain("Venda de bezerros");
  });

  it("alinha as duas colunas pelo índice e deixa vazio o lado mais curto", () => {
    const linhas = linhasDaTabelaCategorias(
      [item(1, "Venda de animais", "entrada")],
      [item(2, "Nutrição", "saida"), item(3, "Sanidade", "saida")],
    );
    expect(linhas).toEqual([
      { receita: expect.objectContaining({ nome: "Venda de animais" }), despesa: expect.objectContaining({ nome: "Nutrição" }) },
      { receita: null, despesa: expect.objectContaining({ nome: "Sanidade" }) },
    ]);
  });
});
