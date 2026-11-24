import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { menuItems } from "./data";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const pendente = readFileSync(resolve(here, "../pages/AdministrativoPendentePage.tsx"), "utf8");
const pessoas = readFileSync(resolve(here, "../pages/FinancialPeoplePage.tsx"), "utf8");
const acesso = readFileSync(resolve(here, "../pages/AcessoContaPage.tsx"), "utf8");
const benfeitorias = readFileSync(resolve(here, "../pages/BenfeitoriasListPage.tsx"), "utf8");
const routerFinanceiro = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");

function filhos(grupo: string) {
  return menuItems.find(item => item.label === grupo)?.children ?? [];
}

describe("menu Administrativo", () => {
  it("segue a ordem pedida e tira a Visão Geral", () => {
    expect(filhos("Administrativo").map(item => item.label)).toEqual([
      "Fazendas",
      "Pessoas e Empresas",
      "Categorias Financeiras",
      "Centro de Custos",
      "Usuários e Acessos",
    ]);
    expect(filhos("Administrativo").map(item => item.path)).toEqual([
      "/fazendas/lista-fazendas",
      "/financeiro/pessoas",
      "/administrativo/categorias-financeiras",
      "/administrativo/centros-de-custos",
      "/conta/acessos",
    ]);
    expect(filhos("Administrativo").map(item => item.label)).not.toContain("Visão Geral");
    expect(filhos("Administrativo").map(item => item.path)).not.toContain("/administrativo/visao-geral");
    expect(filhos("Administrativo").map(item => item.label)).not.toContain("Benfeitorias");
  });

  it("deixa Benfeitorias só em Fazendas e o atalho de acessos só no Administrativo", () => {
    expect(filhos("Fazendas").map(item => item.label)).toEqual(["Visão Geral", "Benfeitorias"]);
    expect(filhos("Fazendas").map(item => item.path)).toContain("/fazendas/benfeitorias");
    expect(menuItems.map(item => item.label)).not.toContain("Acessos da conta");
    expect(menuItems.filter(item => item.path === "/conta/acessos")).toHaveLength(0);
  });

  it("a Visão Geral antiga vai para a lista de fazendas e não monta a página vazia", () => {
    const bloco = app.slice(
      app.indexOf('path="/administrativo/visao-geral"'),
      app.indexOf('path="/administrativo/visao-geral"') + 90,
    );
    expect(bloco).toContain("RedirectAdministrativoFazendas");
    expect(bloco).not.toContain("AdministrativeOverviewPage");
    expect(app).toContain('to="/fazendas/lista-fazendas"');
    expect(app).not.toContain("component={AdministrativeOverviewPage}");
    expect(app).toContain('path="/fazendas/lista-fazendas"');
    expect(app).toContain("component={FarmsListPage}");
    expect(app).toContain('path="/fazendas/cadastro"');
    expect(app).toContain("component={FarmRegistrationPage}");
  });

  it("pessoas, usuários e benfeitorias continuam nas páginas que já gravam", () => {
    expect(app).toContain('path="/financeiro/pessoas"');
    expect(app).toContain("component={FinancialPeoplePage}");
    expect(pessoas).toContain("trpc.pessoas.create");
    expect(pessoas).toContain("trpc.pessoas.list");
    expect(app).toContain('path="/conta/acessos"');
    expect(app).toContain("component={AcessoContaPage}");
    expect(acesso).toContain("trpc.acesso.listarUsuarios");
    expect(acesso).toContain("trpc.acesso.permissoes");
    expect(acesso).toContain("trpc.acesso.fazendas");
    expect(app).toContain('path="/fazendas/benfeitorias"');
    expect(app).toContain("component={BenfeitoriasListPage}");
    expect(benfeitorias).toContain("trpc.benfeitorias.list");
  });

  it("categorias e centros avisam que a tela ainda não grava", () => {
    expect(app).toContain('path="/administrativo/categorias-financeiras"');
    expect(app).toContain("component={CategoriasFinanceirasPendentePage}");
    expect(app).toContain('path="/administrativo/centros-de-custos"');
    expect(app).toContain("component={CentrosCustoPendentePage}");
    expect(pendente).not.toContain("trpc.");
    expect(pendente).toContain("Nada é gravado nesta página.");
    expect(routerFinanceiro).toContain("categoriasCreate:");
    expect(routerFinanceiro).toContain("centrosCreate:");
    expect(routerFinanceiro).toContain("PERMISSAO_CRIAR_FINANCEIRO");
  });
});
