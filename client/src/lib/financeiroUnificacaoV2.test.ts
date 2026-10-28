import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { menuItems } from "./data";
import {
  FINANCEIRO_CAIXA_OFICIAL_PATH,
  FINANCEIRO_MENU_OFICIAL,
  FINANCEIRO_ROTAS_LEGADO_OPERACIONAIS,
  MSG_RELATORIO_FINANCEIRO_INDISPONIVEL,
} from "./financeiroNavegacao";
import { FINANCEIRO_CONTAS_V2_PATH } from "./contasFinanceirasV2";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const visao = readFileSync(resolve(here, "../pages/FinanceiroVisaoGeralPage.tsx"), "utf8");
const dashboard = readFileSync(resolve(here, "../pages/DashboardPage.tsx"), "utf8");
const reports = readFileSync(resolve(here, "../pages/ReportsManagementPage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const confirmar = readFileSync(resolve(here, "../../../server/confirmarVendaFinanceiro.ts"), "utf8");
const legadoPage = readFileSync(resolve(here, "../pages/FinancialManagementPage.tsx"), "utf8");

describe("Fase 4.1 — unificação do Financeiro no V2", () => {
  it("o menu Financeiro aponta para as páginas V2", () => {
    const grupo = menuItems.find((item) => item.label === "Financeiro");
    const filhos = grupo?.children ?? [];
    expect(filhos.map((c) => c.label)).toEqual(FINANCEIRO_MENU_OFICIAL.map((c) => c.label));
    expect(filhos.map((c) => c.path)).toEqual(FINANCEIRO_MENU_OFICIAL.map((c) => c.path));
    expect(filhos.some((c) => c.path === FINANCEIRO_CAIXA_OFICIAL_PATH)).toBe(true);
    expect(FINANCEIRO_CAIXA_OFICIAL_PATH).toBe("/financeiro/v2/contas");
  });

  it("Caixa e Bancos usa a página oficial V2", () => {
    expect(app).toContain("ContasFinanceirasV2Page");
    expect(app).toContain("FINANCEIRO_CONTAS_V2_PATH");
    expect(FINANCEIRO_CONTAS_V2_PATH).toBe("/financeiro/v2/contas");
  });

  it("páginas operacionais do legado não ficam acessíveis", () => {
    expect(app).toContain("FinanceiroVisaoGeralPage");
    expect(app).not.toContain("FinancialManagementPage");
    for (const rota of FINANCEIRO_ROTAS_LEGADO_OPERACIONAIS) {
      expect(app).toContain(`path="${rota}"`);
      expect(app).toContain("RedirectTo");
    }
    expect(app).toContain("RedirectTo to={FINANCEIRO_CONTAS_V2_PATH}");
    expect(visao).not.toContain("trpc.financeiro.");
    expect(visao).not.toContain("listContas");
    expect(visao).not.toContain("createMovimentacao");
  });

  it("relatórios não exibem valores financeiros fictícios", () => {
    expect(reports).toContain("MSG_RELATORIO_FINANCEIRO_INDISPONIVEL");
    expect(MSG_RELATORIO_FINANCEIRO_INDISPONIVEL).toBe(
      "Relatório financeiro ainda não disponível.",
    );
    expect(reports).not.toContain("329.000");
    expect(reports).not.toContain("136.000");
    expect(reports).not.toContain("54.833");
    expect(reports).not.toContain("32.167");
    expect(reports).not.toContain("987.500");
    expect(reports).not.toContain("ManagerialReportData");
  });

  it("dashboard e visão geral não usam saldo do legado", () => {
    expect(dashboard).not.toContain("trpc.financeiro.listContas");
    expect(dashboard).not.toContain("trpc.financeiro.listMovimentacoes");
    expect(dashboard).not.toContain("trpc.financeiro.summary");
    expect(dashboard).toContain("FINANCEIRO_CAIXA_OFICIAL_PATH");
    expect(visao).toContain("FINANCEIRO_MENU_OFICIAL");
  });

  it("o código histórico do legado e o núcleo V2 permanecem", () => {
    expect(legadoPage).toContain("trpc.financeiro.listContas");
    expect(legadoPage).toContain("createConta");
    expect(nucleo).toContain("async listarContas(userId: number)");
    expect(confirmar).toContain("criarTituloNoTx");
  });
});
