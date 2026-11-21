import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSG_ESTOQUE_ESCRITA_NEGADA } from "../shared/estoqueIsolamento";

const here = dirname(fileURLToPath(import.meta.url));
const routers = readFileSync(resolve(here, "routers.ts"), "utf8");
const saldoTx = readFileSync(resolve(here, "estoqueSaldoTx.ts"), "utf8");
const manut = readFileSync(resolve(here, "manutencaoEstoque.ts"), "utf8");
const compra = readFileSync(resolve(here, "compraInsumos.ts"), "utf8");
const transferencia = readFileSync(resolve(here, "estoqueSaldoTx.ts"), "utf8");
const bloco = routers.slice(routers.indexOf("const estoqueRouter"), routers.indexOf("const financeiroRouter"));

describe("Fase 5.2B.1 — isolamento de escrita do estoque", () => {
  it("mutações oficiais exigem fazenda ou produto do usuário antes de gravar", () => {
    expect(bloco).toContain("cadastrarProdutoEstoque(ctx.user, input)");
    expect(bloco).toContain("editarProdutoEstoque(ctx.user, input)");
    expect(bloco).toContain("autorizarMovimentoEstoque");
    expect(bloco).toContain("PERMISSAO_ESTORNAR_ESTOQUE");
    expect(bloco).toContain("recusarExclusaoFisicaEstoque()");
  });

  it("saída compartilhada recusa produto de outra fazenda antes do saldo", () => {
    const saida = saldoTx.slice(saldoTx.indexOf("async function criarMovimentacaoPeloSaldo"));
    expect(saida).toContain("O produto não pertence à fazenda da movimentação.");
    expect(saida.indexOf("findEstoque")).toBeLessThan(saida.indexOf("O produto não pertence à fazenda da movimentação."));
    expect(saida.indexOf("O produto não pertence à fazenda da movimentação.")).toBeLessThan(saida.indexOf("itemParaSaldo"));
    expect(manut).toContain("O produto não pertence à fazenda da máquina.");
    expect(compra).toContain("Number(produto.fazendaId) !== Number(input.fazendaId)");
    expect(transferencia).toContain("O produto não pertence à fazenda de origem.");
  });

  it("mensagem de recusa é estável", () => {
    expect(MSG_ESTOQUE_ESCRITA_NEGADA).toBe("Você não tem acesso a este produto de estoque.");
  });
});
