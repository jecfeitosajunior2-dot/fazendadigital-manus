import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(import.meta.dirname, "DashboardPage.tsx"), "utf8");
const ui = readFileSync(resolve(import.meta.dirname, "../components/dashboard/DashboardUI.tsx"), "utf8");

describe("Painel de Controle — tela", () => {
  it("troca o período que não filtrava pelo seletor de fazenda", () => {
    expect(page).toContain("FazendaOverviewSelect");
    expect(page).toContain("Todas as fazendas");
    expect(page).toContain("PAINEL_STORAGE_KEY");
    expect(page).not.toContain("PERIODOS");
    expect(page).not.toContain("setPeriodo");
    expect(page).not.toContain("30 dias");
    expect(page).not.toContain("90 dias");
  });

  it("mostra carregamento e erro, sem Tudo em ordem antecipado", () => {
    expect(page).toContain("Carregando alertas");
    expect(page).toContain("Não foi possível carregar os alertas");
    expect(page).toContain('estadoAlertas === "pronto"');
    expect(ui).toContain("loading = false");
    expect(ui).toContain("animate-pulse");
  });

  it("preserva os atalhos oficiais", () => {
    expect(page).toContain('setLocation("/rebanho/visao-geral")');
    expect(page).toContain('setLocation("/insumos/visao-geral")');
    expect(page).toContain('setLocation("/fazendas/visao-geral")');
    expect(page).toContain('setLocation("/financeiro/contas-a-receber")');
    expect(page).toContain('setLocation("/financeiro/contas-a-pagar")');
    expect(page).toContain("FINANCEIRO_CAIXA_OFICIAL_PATH");
    expect(page).toContain("FINANCEIRO_VISAO_GERAL_PATH");
    expect(page).toContain('setLocation("/maquinas/manutencao")');
    expect(page).toContain("COMPRA_VENDA_COMPRAS_PATH");
    expect(page).toContain("COMPRA_VENDA_VENDAS_PATH");
    expect(page).toContain("Total a receber");
    expect(page).toContain("rotuloResultado");
    expect(page).toContain("avisoCaixa");
    expect(page).toContain("avisoSemAtribuicao");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("financeiroV2");
    expect(page).not.toContain('value="V2"');
    expect(page).not.toContain('value="Oficial"');
  });

  it("usa só animais ativos do resumo e não dashboard.stats.totalAnimais", () => {
    expect(page).toContain("painel.rebanho.total");
    expect(page).not.toContain("stats.totalAnimais");
    expect(page).not.toContain("dashboard.stats");
  });

  it("mantém os oito indicadores, com título e valor completos", () => {
    const bloco = page.slice(page.indexOf("Indicadores principais"), page.indexOf("Central de Alertas"));
    expect(bloco.match(/<KpiCard/g)).toHaveLength(8);
    expect(bloco.match(/wrapText/g)).toHaveLength(8);
    expect(bloco).toContain('label="Rebanho ativo"');
    expect(bloco).toContain('label="Peso médio"');
    expect(bloco).toContain('label="Caixa e Bancos"');
    expect(bloco).toContain('label="Total a receber"');
    expect(bloco).toContain('label="Total a pagar"');
    expect(bloco).toContain("painel.financeiro.rotuloResultado");
    expect(bloco).toContain('label="Valor em estoque"');
    expect(bloco).toContain('label="Área total"');
    expect(bloco).toContain("formatarValorRelatorioV2(painel.financeiro.saldoCaixaBancos)");
    expect(bloco).toContain("formatarValorRelatorioV2(painel.financeiro.totalAReceber)");
    expect(bloco).toContain("formatarValorRelatorioV2(painel.financeiro.totalAPagar)");
    expect(bloco).toContain("formatarValorRelatorioV2(painel.financeiro.resultadoRealizado)");
    expect(bloco).toContain("brlCompact(painel.estoque.valorTotal)");
    expect(bloco).toContain("painel.rebanho.pesoMedio");
    expect(bloco).toContain('value={`${num(painel.areaTotal, 0)} ha`}');
    expect(bloco).toContain("num(painel.rebanho.total)");
    expect(ui).toContain("wrapText = false");
    expect(ui).toContain('compact ? "text-[18px]" : "text-[22px]"');
    expect(ui).toContain("break-words whitespace-normal");
    expect(ui).toContain("h-8 w-8");
    expect(ui).not.toContain("text-[14px]");
  });

  it("organiza os indicadores em grade responsiva, sem oito na mesma linha", () => {
    const bloco = page.slice(page.indexOf("Indicadores principais"), page.indexOf("Central de Alertas"));
    expect(bloco).toContain("grid-cols-1");
    expect(bloco).toContain("md:grid-cols-2");
    expect(bloco).toContain("xl:grid-cols-4");
    expect(bloco).toContain("items-stretch");
    expect(bloco).toContain("min-w-0");
    expect(bloco).not.toContain("grid-cols-8");
    expect(bloco).not.toContain("lg:grid-cols-4");
    expect(page).not.toContain("xl:grid-cols-8");
  });

  it("alinha a central de alertas sem cortar título nem quantidade", () => {
    const bloco = page.slice(page.indexOf('title="Central de Alertas"'), page.indexOf("Compra e Venda recentes"));
    expect(bloco).toContain("grid-cols-1");
    expect(bloco).toContain("md:grid-cols-2");
    expect(bloco).toContain("xl:grid-cols-3");
    expect(bloco).toContain("items-stretch");
    expect(bloco).toContain("gap-3");
    expect(bloco).toContain("shrink-0 whitespace-nowrap");
    expect(bloco).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(page).not.toContain("sm:grid-cols-2 lg:grid-cols-3");
    expect(ui).toContain("h-full min-w-0");
    expect(ui).toContain("shrink-0 rounded-full");
    expect(ui).toContain("break-words");
    expect(ui).not.toContain("truncate font-medium");
  });

  it("preserva saudação, data, seletor de fazenda e atalhos do cabeçalho", () => {
    expect(page).toContain("{saudacao}");
    expect(page).toContain("hojeBr");
    expect(page).toContain("FazendaOverviewSelect");
    expect(page).toContain("Todas as fazendas");
    expect(page).toContain("sm:min-w-[220px]");
    expect(page).toContain("max-w-full");
    expect(page).toContain('setLocation("/rebanho/visao-geral")');
    expect(page).toContain('setLocation("/insumos/visao-geral")');
    expect(page).toContain('setLocation("/fazendas/visao-geral")');
    expect(page).toContain("FINANCEIRO_CAIXA_OFICIAL_PATH");
    expect(page).toContain('setLocation("/financeiro/contas-a-receber")');
    expect(page).toContain('setLocation("/financeiro/contas-a-pagar")');
    expect(page).toContain('setLocation("/financeiro/relatorios")');
    expect(page).toContain('setLocation("/maquinas/manutencao")');
    expect(page).not.toContain("trpc.financeiro.");
  });
});
