import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { montarRelatorioFinanceiroV2 } from "@shared/financeiroRelatoriosV2";
import {
  formatarValorRelatorioV2,
  linhasExportFluxo,
  linhasExportTitulos,
  linhasExportVisao,
  periodoRelatorioTexto,
} from "./financeiroRelatoriosExport";
import { buildExportSpreadsheetBuffer } from "@shared/buildExportSpreadsheet";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/FinanceiroRelatoriosPage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const nav = readFileSync(resolve(here, "./financeiroNavegacao.ts"), "utf8");

describe("financeiroRelatorios — tela e exportação", () => {
  it("usa o relatório oficial V2 e exporta números", () => {
    expect(page).toContain("financeiroV2.relatorioFinanceiro");
    expect(page).toContain("Resultado financeiro realizado");
    expect(page).toContain("ListExportButtons");
    expect(page).toContain("formatarValorRelatorioV2");
    expect(page).toContain("enabled: autenticado");
    expect(page).not.toContain("formatCurrencyBrl");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("Lucro");
    expect(app).toContain("FinanceiroRelatoriosPage");
    expect(nav).toContain("Relatórios");
    const rel = montarRelatorioFinanceiroV2({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 5000 }],
      titulos: [],
      movimentos: [{
        id: 92, contaId: 1, contaNome: "Caixa", dataMovimento: "2026-10-27",
        direcao: "entrada", natureza: "recebimento", valor: 3000, descricao: "Recebimento",
        liquidacaoId: 61, transferenciaId: null, fazendaOrigemId: null,
      }],
      filtro: { de: "2026-10-01", ate: "2026-10-31", hojeISO: "2026-10-28" },
    });
    const visao = linhasExportVisao(rel);
    expect(visao[0]?.[1]).toBe(5000);
    expect(typeof visao[0]?.[1]).toBe("number");
    expect(linhasExportFluxo(rel).some(l => l[5] === 3000)).toBe(true);
    expect(periodoRelatorioTexto("2026-10-01", "2026-10-31")).toContain("2026-10-01");
  });

  it("formata reais da API sem tratar o número como centavos", () => {
    expect(formatarValorRelatorioV2(5000)).toMatch(/R\$\s*5\.000,00/);
    expect(formatarValorRelatorioV2(1000)).toMatch(/R\$\s*1\.000,00/);
    expect(formatarValorRelatorioV2(139.37)).toMatch(/R\$\s*139,37/);
    expect(formatarValorRelatorioV2(0)).toMatch(/R\$\s*0,00/);
    expect(formatarValorRelatorioV2(-1000)).toMatch(/-R\$\s*1\.000,00|R\$\s*-1\.000,00/);
    expect(formatarValorRelatorioV2("3000.00")).toMatch(/R\$\s*3\.000,00/);
  });

  it("exporta indicadores e títulos com os números oficiais da API", async () => {
    const rel = montarRelatorioFinanceiroV2({
      contas: [{ id: 1, nome: "Caixa", ativa: true, saldoAtual: 5000 }],
      titulos: [{
        id: 80, userId: 1, tipo: "pagar", estado: "ativo", condicaoStatus: "a_definir",
        pessoaId: 1, contraparteNomeSnapshot: "Premix", fazendaOrigemId: 1, origemTipo: "compra_insumos",
        origemId: 8, descricao: "Compra", valorOriginal: 139.37, parcelas: [],
      }],
      movimentos: [],
      filtro: { de: "2026-10-01", ate: "2026-10-31", hojeISO: "2026-10-28" },
    });
    expect(rel.visao.saldoCaixaBancos).toBe(5000);
    expect(rel.pagar.totalPendente).toBe(139.37);
    expect(rel.visao.resultadoRealizado).toBe(0);
    const titulos = linhasExportTitulos(rel.pagar.linhas);
    expect(titulos[0]?.[4]).toBe(139.37);
    const buffer = await buildExportSpreadsheetBuffer(
      ["Indicador", "Valor"],
      linhasExportVisao(rel),
      { spreadsheetCurrencyCols: [1] },
    );
    expect(buffer.byteLength).toBeGreaterThan(200);
  });
});
