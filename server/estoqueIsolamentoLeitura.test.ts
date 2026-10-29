import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const routers = readFileSync(resolve(here, "routers.ts"), "utf8");
const dashboard = readFileSync(resolve(here, "../client/src/pages/DashboardPage.tsx"), "utf8");
const painel = readFileSync(resolve(here, "painelControle.ts"), "utf8");
const leitura = readFileSync(resolve(here, "estoqueIsolamentoLeitura.ts"), "utf8");

const blocoEstoque = routers.slice(
  routers.indexOf("const estoqueRouter"),
  routers.indexOf("const financeiroRouter"),
);

describe("Fase 5.2B — isolamento de leitura do estoque", () => {
  it("listagens oficiais filtram pela fazenda do usuário autenticado", () => {
    expect(leitura).toContain("eq(fazendas.userId, userId)");
    expect(blocoEstoque).toContain("idsFazendasDoUsuarioParaEstoque(ctx.user.id)");
    expect(blocoEstoque).toContain("inArray(estoque.fazendaId, fazendaIds)");
    expect(blocoEstoque).toContain("assertFazendaDoUsuario(ctx.user.id, input.fazendaId)");
    expect(blocoEstoque).toContain("produtoEstoqueVisivel");
    expect(blocoEstoque).toContain("movimentacaoEstoqueVisivel");
    expect(blocoEstoque).toContain("filtrarMovimentacoesEstoque");
  });

  it("não volta a listar estoque ou movimentação sem recorte de dono", () => {
    expect(blocoEstoque).not.toMatch(/list:\s*protectedProcedure\.query\(async \(\) => \{\s*try \{\s*const rows = await db\.select\(\)\.from\(estoque\)/);
    expect(blocoEstoque).toContain("listMovimentacoes: protectedProcedure.query(async ({ ctx })");
  });

  it("o Painel lê estoque pelo resumo autorizado, sem lista completa", () => {
    expect(dashboard).toContain("trpc.dashboard.overview");
    expect(dashboard).not.toContain("trpc.estoque.list.useQuery()");
    expect(dashboard).not.toContain("trpc.estoque.listMovimentacoes.useQuery()");
    expect(painel).toContain("inArray(estoque.fazendaId, fazendaIds)");
    expect(painel).toContain("filtrarProdutosEstoque");
    expect(painel).toContain("filtrarMovimentacoesEstoque");
  });
});
