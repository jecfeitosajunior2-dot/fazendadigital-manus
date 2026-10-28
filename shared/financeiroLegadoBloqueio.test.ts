import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FINANCEIRO_LEGADO_MUTATIONS_BLOQUEADAS,
  FINANCEIRO_LEGADO_QUERIES_BLOQUEADAS,
  MSG_FINANCEIRO_LEGADO_DESATIVADO,
  MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
} from "./financeiroLegadoBloqueio";

const routers = readFileSync(resolve(import.meta.dirname, "../server/routers.ts"), "utf8");
const v2Router = readFileSync(resolve(import.meta.dirname, "../server/financeiroV2Router.ts"), "utf8");
const dashboard = readFileSync(
  resolve(import.meta.dirname, "../client/src/pages/DashboardPage.tsx"),
  "utf8",
);
const confirmar = readFileSync(
  resolve(import.meta.dirname, "../server/confirmarVendaFinanceiro.ts"),
  "utf8",
);
const cancelar = readFileSync(
  resolve(import.meta.dirname, "../server/cancelarVendaFinanceiro.ts"),
  "utf8",
);

function recorteFinanceiroRouter() {
  const inicio = routers.indexOf("const financeiroRouter");
  const fim = routers.indexOf("const dashboardRouter");
  return routers.slice(inicio, fim);
}

describe("bloqueio total do Financeiro legado na API", () => {
  it("mantém a mensagem oficial e as procedures bloqueadas", () => {
    expect(MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA).toBe(
      "O Financeiro legado está desativado. Use o Financeiro V2.",
    );
    expect(MSG_FINANCEIRO_LEGADO_DESATIVADO).toBe(MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA);
    expect(FINANCEIRO_LEGADO_MUTATIONS_BLOQUEADAS).toEqual([
      "createConta",
      "createMovimentacao",
      "deleteMovimentacao",
    ]);
    expect(FINANCEIRO_LEGADO_QUERIES_BLOQUEADAS).toEqual([
      "listContas",
      "listMovimentacoes",
      "summary",
    ]);
  });

  it("consultas e mutations do legado devolvem FORBIDDEN sem ler as tabelas", () => {
    const legadoRouter = recorteFinanceiroRouter();
    expect(legadoRouter).toContain("listContas:");
    expect(legadoRouter).toContain("listMovimentacoes:");
    expect(legadoRouter).toContain("summary:");
    expect(legadoRouter).toContain("createConta:");
    expect(legadoRouter).toContain("createMovimentacao:");
    expect(legadoRouter).toContain("deleteMovimentacao:");
    expect(legadoRouter).toContain("MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA");
    expect(legadoRouter).toContain('code: "FORBIDDEN"');
    expect(legadoRouter).not.toContain("from(contasFinanceiras)");
    expect(legadoRouter).not.toContain("from(movimentacoes)");
    expect(legadoRouter).not.toContain("insert(contasFinanceiras)");
    expect(legadoRouter).not.toContain("insert(movimentacoes)");
    expect(legadoRouter).not.toContain("db.delete(movimentacoes)");
    expect((legadoRouter.match(/FORBIDDEN/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("o Financeiro V2 continua acessível e o Dashboard não consulta o legado", () => {
    expect(v2Router).toContain("contasList:");
    expect(v2Router).toContain("titulosList:");
    expect(v2Router).toContain("liquidacaoReceber:");
    expect(dashboard).not.toContain("trpc.financeiro.listContas");
    expect(dashboard).not.toContain("trpc.financeiro.listMovimentacoes");
    expect(dashboard).not.toContain("trpc.financeiro.summary");
  });

  it("venda e recebimento não passam a usar o financeiro legado", () => {
    expect(confirmar).toContain('from "./financeiroNucleo"');
    expect(confirmar).not.toContain("listContas");
    expect(confirmar).not.toContain("listMovimentacoes");
    expect(cancelar).toContain('from "./financeiroNucleo"');
    expect(cancelar).not.toContain("createMovimentacao");
  });
});
