import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function roteador() {
  const texto = readFileSync(resolve(here, "routers.ts"), "utf8").replace(/\r\n/g, "\n");
  const inicio = texto.indexOf("const estoqueRouter = router({");
  const fim = texto.indexOf("const financeiroRouter = router({");
  return texto.slice(inicio, fim);
}

function corpo(nome: string) {
  const bloco = roteador();
  const marca = `\n  ${nome}: protectedProcedure`;
  const inicio = bloco.indexOf(marca);
  const resto = bloco.slice(inicio + marca.length);
  const proximo = resto.search(/\n  [A-Za-z0-9]+: protectedProcedure/);
  return proximo === -1 ? resto : resto.slice(0, proximo);
}

describe("estoque geral — vinte e duas rotas", () => {
  it("mantém os nomes que as telas já chamam", () => {
    const nomes = [...roteador().matchAll(/\n  ([A-Za-z0-9]+): protectedProcedure/g)].map((achado) => achado[1]);
    expect(nomes).toEqual([
      "list",
      "listByFazenda",
      "get",
      "create",
      "update",
      "vincularFazenda",
      "delete",
      "inativarProdutos",
      "ativarProdutos",
      "resumo",
      "listMovimentacoes",
      "getMovimentacao",
      "createMovimentacao",
      "confirmarCompraInsumos",
      "confirmarTransferenciaInsumos",
      "updateMovimentacao",
      "validarEstorno",
      "estornarMovimentacao",
      "deleteMovimentacao",
      "listMovimentacoesByProduto",
      "deleteAllMovimentacoesByProduto",
      "listByCategories",
    ]);
  });

  it("consulta o titular no banco e não devolve o arquivo quando o MySQL falha", () => {
    for (const nome of ["list", "listByFazenda", "get", "resumo", "listMovimentacoes", "getMovimentacao", "listMovimentacoesByProduto", "listByCategories"]) {
      const trecho = corpo(nome);
      expect(trecho).toContain("fazendasDaConsultaEstoqueNoBanco");
      expect(trecho).toContain("recusarEstoqueSemMysql()");
      expect(trecho).not.toContain("devLocalStore");
      expect(trecho).not.toContain("resolverLeituraEstoqueList");
      expect(trecho).not.toContain("localFallback");
    }
  });

  it("trava o produto na mesma transação da saída e não grava movimento só no arquivo", () => {
    const trecho = corpo("createMovimentacao");
    expect(trecho).toContain("autorizarMovimentoEstoque");
    expect(trecho).toContain("db.transaction");
    expect(trecho).toContain('.for("update")');
    expect(trecho).not.toContain("localFallback");
    expect(trecho).not.toContain("devLocalStore.createMovimentacao");
  });

  it("recusa apagar produto ou histórico antes de qualquer exclusão", () => {
    for (const nome of ["delete", "deleteMovimentacao", "deleteAllMovimentacoesByProduto"]) {
      const trecho = corpo(nome);
      const recusa = trecho.indexOf("recusarExclusaoFisicaEstoque()");
      const apaga = trecho.search(/\.delete\(/);
      expect(recusa).toBeGreaterThan(-1);
      expect(apaga).toBeGreaterThan(recusa);
    }
  });

  it("usa as permissões que já existem no catálogo", () => {
    const catalogo = readFileSync(resolve(here, "catalogoPermissoes.ts"), "utf8");
    const consulta = readFileSync(resolve(here, "consultaEstoqueAutorizada.ts"), "utf8");
    expect(consulta).toContain('PERMISSAO_CONSULTAR_ESTOQUE = "estoque.visualizar"');
    expect(consulta).toContain('PERMISSAO_MOVIMENTAR_ESTOQUE = "estoque.criar"');
    expect(catalogo).toContain('item("estoque", "visualizar"');
    expect(catalogo).toContain('item("estoque", "criar"');
    expect(catalogo).toContain('item("estoque", "editar"');
    expect(catalogo).toContain('item("estoque", "inativar"');
    expect(catalogo).toContain('item("estoque", "confirmar"');
    expect(catalogo).toContain('item("estoque", "estornar"');
    expect(catalogo).not.toContain("estoque.ajustar");
    expect(catalogo).not.toContain('item("estoque", "saida"');
  });
});
