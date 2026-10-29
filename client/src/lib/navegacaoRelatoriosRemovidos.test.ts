import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { menuItems } from "./data";
import { FINANCEIRO_MENU_OFICIAL } from "./financeiroNavegacao";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const sidebar = readFileSync(resolve(here, "../components/Sidebar.tsx"), "utf8");
const dashboard = readFileSync(resolve(here, "../pages/DashboardPage.tsx"), "utf8");
const financeiroRelatorios = readFileSync(resolve(here, "../pages/FinanceiroRelatoriosPage.tsx"), "utf8");

const ROTAS_RELATORIOS_LEGADO = [
  "/relatorios/visao-geral",
  "/relatorios/gerenciais",
  "/relatorios/evolucao",
  "/relatorios/reprodutivos",
  "/relatorios/operacionais",
] as const;

describe("Fase 5.2A — Relatórios independentes fora de circulação", () => {
  it("o menu principal não lista o módulo Relatórios", () => {
    expect(menuItems.map(item => item.label)).not.toContain("Relatórios");
    const paths = menuItems.flatMap(item => [
      item.path,
      ...(item.children?.map(c => c.path) ?? []),
    ]);
    for (const rota of ROTAS_RELATORIOS_LEGADO) {
      expect(paths).not.toContain(rota);
    }
  });

  it("os demais grupos oficiais continuam no menu", () => {
    expect(menuItems.map(item => item.label)).toEqual([
      "Painel de Controle",
      "Acesso Rápido",
      "Fazendas",
      "Rebanho",
      "Insumos",
      "Máquinas",
      "Manejo",
      "Reprodução",
      "Nutrição",
      "Compra e Venda",
      "Financeiro",
      "Administrativo",
      "Simulações",
    ]);
  });

  it("as cinco URLs antigas redirecionam ao Painel, sem montar a página fictícia", () => {
    expect(app).not.toMatch(/import\s+\{[^}]*ReportsManagementPage/);
    expect(app).not.toContain("component={ReportsManagementPage}");
    expect(app).toContain("function RedirectPainelControle");
    expect(app).toContain('to="/admin/overview"');
    for (const rota of ROTAS_RELATORIOS_LEGADO) {
      expect(app).toContain(`path="${rota}"`);
      const bloco = app.slice(app.indexOf(`path="${rota}"`), app.indexOf(`path="${rota}"`) + 80);
      expect(bloco).toContain("RedirectPainelControle");
    }
  });

  it("Financeiro → Relatórios e o Painel permanecem acessíveis", () => {
    expect(FINANCEIRO_MENU_OFICIAL.some(item => item.path === "/financeiro/relatorios")).toBe(true);
    expect(menuItems.find(item => item.label === "Financeiro")?.children?.map(c => c.path)).toContain(
      "/financeiro/relatorios",
    );
    expect(app).toContain("FinanceiroRelatoriosPage");
    expect(app).toContain('path="/financeiro/relatorios"');
    expect(app).toContain("DashboardPage");
    expect(app).toContain('path="/admin/overview"');
    expect(sidebar).toContain("menuItems");
    expect(dashboard).toContain("Painel de controle");
    expect(financeiroRelatorios).toContain("financeiroV2.relatorioFinanceiro");
  });
});
