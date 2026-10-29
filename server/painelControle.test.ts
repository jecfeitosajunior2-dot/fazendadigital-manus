import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MSG_PAINEL_FAZENDA_NEGADA, resolverEscopoFazendasPainel } from "../shared/painelControle";

const here = import.meta.dirname;
const painelServer = readFileSync(resolve(here, "painelControle.ts"), "utf8");
const dashboardPage = readFileSync(resolve(here, "../client/src/pages/DashboardPage.tsx"), "utf8");
const routers = readFileSync(resolve(here, "routers.ts"), "utf8");

describe("consulta resumida do Painel no servidor", () => {
  it("recusa fazenda de outro usuário antes de montar indicadores", () => {
    expect(resolverEscopoFazendasPainel({
      fazendaId: 77,
      fazendasAutorizadas: [{ id: 1, nome: "Minha", area: 10 }],
    }).ok).toBe(false);
    expect(painelServer).toContain("FORBIDDEN");
    expect(painelServer).toContain("MSG_PAINEL_FAZENDA_NEGADA");
    expect(MSG_PAINEL_FAZENDA_NEGADA).toBeTruthy();
  });

  it("lê só animais ativos e pesoAtual, sem histórico de pesagem", () => {
    expect(painelServer).toContain('eq(animais.status, "ativo")');
    expect(painelServer).toContain("pesoAtual: animais.pesoAtual");
    expect(painelServer).not.toContain("from(pesagens)");
    expect(painelServer).not.toContain("from(animalBaixas)");
  });

  it("filtra estoque, pastos e máquinas pelas fazendas autorizadas", () => {
    expect(painelServer).toContain("inArray(estoque.fazendaId, fazendaIds)");
    expect(painelServer).toContain("inArray(pastos.fazendaId, fazendaIds)");
    expect(painelServer).toContain("inArray(maquinas.fazendaId, fazendaIds)");
    expect(painelServer).toContain("animalNasFazendasPainel");
  });

  it("o resumo financeiro passa pelo apurador oficial do V2", () => {
    expect(painelServer).toContain("financeiroNucleoService.relatorioFinanceiro");
    expect(painelServer).toContain("indicadoresFinanceirosDoRelatorioV2");
    expect(painelServer).toContain("periodoMesCorrentePainel");
    expect(painelServer).toContain("haRegistrosSemFazendaNoRelatorioV2");
    expect(painelServer).not.toContain("from(contasFinanceiras)");
    expect(painelServer).not.toContain("listContas");
  });

  it("o router oficial expõe overview e o painel não dispara as listas antigas", () => {
    expect(routers).toContain("carregarPainelControle");
    expect(routers).toContain("overview:");
    for (const consulta of [
      "trpc.animais.list",
      "trpc.estoque.list",
      "trpc.estoque.listMovimentacoes",
      "trpc.saude.list",
      "trpc.reproducao.list",
      "trpc.manutencoes.list",
      "trpc.pastos.listWithDetails",
      "trpc.fazendas.list",
      "trpc.dashboard.stats",
    ]) {
      expect(dashboardPage).not.toContain(consulta);
    }
    expect(dashboardPage).toContain("trpc.dashboard.overview");
    expect(dashboardPage).toContain("trpc.auth.me");
  });
});
