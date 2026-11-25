import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  documentoFinanceiroVisivel,
  PERMISSAO_CONFIRMAR_FINANCEIRO,
  PERMISSAO_CRIAR_FINANCEIRO,
  PERMISSAO_EDITAR_FINANCEIRO,
  PERMISSAO_ESTORNAR_FINANCEIRO,
  PERMISSAO_INATIVAR_FINANCEIRO,
  PERMISSAO_VER_FINANCEIRO,
} from "./consultaFinanceiroAutorizada";

const here = dirname(fileURLToPath(import.meta.url));

function ler(nome: string) {
  return readFileSync(resolve(here, nome), "utf8").replace(/\r\n/g, "\n");
}

const ROTAS = [
  "contasList",
  "contasGet",
  "contasCreate",
  "contasInativar",
  "contasUpdate",
  "contasReativar",
  "titulosList",
  "titulosGet",
  "tituloHistoricoPagamentos",
  "titulosCreateManual",
  "titulosDefinirParcelas",
  "titulosApropriar",
  "liquidacaoPagar",
  "liquidacaoReceber",
  "liquidacaoEstornar",
  "transferenciaCreate",
  "transferenciaEstornar",
  "movimentosExtrato",
  "relatorioFinanceiro",
  "categoriasList",
  "categoriasCreate",
  "categoriasInativar",
  "categoriasRenomear",
  "categoriasDeleteCheck",
  "categoriasExcluir",
  "centrosList",
  "centrosCreate",
  "centrosInativar",
];

describe("financeiro V2 — contrato da conta", () => {
  const router = ler("financeiroV2Router.ts");
  const nucleo = ler("financeiroNucleo.ts");
  const routers = ler("routers.ts");

  it("as rotas continuam no roteador e o dono é o titular", () => {
    for (const rota of ROTAS) expect(router).toContain(`${rota}:`);
    expect(router).not.toContain("financeiroNucleoService.listarContas(ctx.user.id)");
    expect(router).not.toContain("financeiroNucleoService.criarPagamento(ctx.user.id");
    expect(router).not.toContain("financeiroNucleoService.criarRecebimento(ctx.user.id");
    expect(router).not.toContain("financeiroNucleoService.estornarLiquidacao(ctx.user.id");
    expect(router).toContain("acesso.titularUserId");
    expect(router).toContain("sessaoFinanceiro");
    expect(router).toContain("mascararSaldo");
    expect(router).toContain("recusarFinanceiroSemMysql");
    expect(router).toContain("isDatabaseUnavailable");
    expect(router).not.toContain("getLocal");
    expect(router).not.toContain("withDbFallback");
  });

  it("caixa, transferência e extrato exigem o responsável da conta", () => {
    expect(router).toContain("PERMISSAO_CRIAR_FINANCEIRO, true");
    expect(router).toContain("PERMISSAO_ESTORNAR_FINANCEIRO, true");
    expect(router).toContain("PERMISSAO_VER_FINANCEIRO, true");
    expect(router).toContain("MSG_EXTRATO_SO_PRINCIPAL");
  });

  it("pagamento e estorno revalidam a sessão dentro da transação do valor", () => {
    expect(nucleo).toContain("async revalidarSessao");
    expect(nucleo).toContain("await abrirSessaoFinanceiro(tx, userId, sessao)");
    expect(nucleo).toContain("fecharFazendasFinanceiro(acesso, await fazendasDaLiquidacao");
    expect(nucleo).toContain("fecharFazendasFinanceiro(acesso, titulos.map((titulo) => titulo.fazendaOrigemId))");
    expect(nucleo).not.toContain("getLocalFinanceiro");
    expect(nucleo).not.toContain("localFallback");
  });

  it("a confirmação integrada grava na mesma transação da autorização", () => {
    const integrada = routers.slice(routers.indexOf("confirmarIntegrada: protectedProcedure"));
    expect(integrada).toContain("confirmarVendaAutorizada");
    expect(integrada).toContain("confirmarVendaIntegradaSeAtiva");
    expect(integrada).toContain("titularUserId");
    expect(integrada).toContain("tx.transacaoAtual");
    expect(integrada).not.toContain("createConfirmarVendaFinanceiroMysqlStore(db)");
    expect(integrada).not.toContain("confirmarVendaIntegradaSeAtiva(\n        createConfirmarVendaFinanceiroMysqlStore(db),\n        ctx.user.id");
    const cancelar = routers.slice(
      routers.indexOf("cancelar: protectedProcedure"),
      routers.indexOf("integracaoConfirmacaoAtiva"),
    );
    expect(cancelar).toContain("tx.transacaoAtual");
    expect(cancelar).toContain("cancelar(titularUserId");
    expect(cancelar).toContain("canceladoPorUserId: ctx.user.id");
    expect(cancelar).not.toContain("createCancelarVendaFinanceiroMysqlStore(db)");
  });

  it("o catálogo de permissões não ganhou item novo", () => {
    expect(PERMISSAO_VER_FINANCEIRO).toBe("financeiro.visualizar");
    expect(PERMISSAO_CRIAR_FINANCEIRO).toBe("financeiro.criar");
    expect(PERMISSAO_EDITAR_FINANCEIRO).toBe("financeiro.editar");
    expect(PERMISSAO_INATIVAR_FINANCEIRO).toBe("financeiro.inativar");
    expect(PERMISSAO_CONFIRMAR_FINANCEIRO).toBe("financeiro.confirmar");
    expect(PERMISSAO_ESTORNAR_FINANCEIRO).toBe("financeiro.estornar");
    const catalogo = ler("catalogoPermissoes.ts");
    expect(catalogo).not.toContain("financeiro.cancelar");
  });

  it("título com fazenda não concedida some por inteiro", () => {
    const funcionario = { titularUserId: 1, papel: "comum", fazendaIds: [10] };
    expect(documentoFinanceiroVisivel(10, [], funcionario)).toBe(true);
    expect(documentoFinanceiroVisivel(20, [], funcionario)).toBe(false);
    expect(documentoFinanceiroVisivel(10, [{ fazendaId: 20 }], funcionario)).toBe(false);
    expect(documentoFinanceiroVisivel(10, [{ fazendaId: null }], funcionario)).toBe(false);
    expect(documentoFinanceiroVisivel(null, [], funcionario)).toBe(false);
    expect(documentoFinanceiroVisivel(20, [{ fazendaId: 20 }], { titularUserId: 1, papel: "principal", fazendaIds: [] })).toBe(true);
  });

  it("o relatório lê as apropriações antes de somar e a exportação usa essa mesma consulta", () => {
    const nucleo = ler("financeiroNucleo.ts");
    const inicio = nucleo.indexOf("async relatorioFinanceiro(");
    const fim = nucleo.indexOf("async apropriar(", inicio);
    const corpo = nucleo.slice(inicio, fim);
    expect(corpo).toContain("listApropriacoes(userId, titulo.id)");
    expect(corpo).toContain("documentoFinanceiroVisivel(");
    expect(corpo).not.toContain("documentoFinanceiroVisivel(titulo.fazendaOrigemId, [], escopo)");
    expect(corpo).not.toContain("getLocal");
    expect(corpo).not.toContain("withDbFallback");
    const pagina = ler("../client/src/pages/FinanceiroRelatoriosPage.tsx");
    expect(pagina).toContain("trpc.financeiroV2.relatorioFinanceiro.useQuery");
    expect(pagina).toContain("ListExportButtons");
    expect(pagina).not.toContain("/api/");
    const painel = ler("painelControle.ts");
    const chamada = painel.slice(painel.indexOf("export async function financeiroDoPainel"), painel.indexOf("async function carregarComercialPainel"));
    expect(chamada).toContain("io.relatorio(acesso.titularUserId,");
    expect(chamada).toContain(", acesso)");
    expect(chamada).not.toContain("relatorioFinanceiro(userId,");
    expect(painel).toContain("PERMISSAO_VER_FINANCEIRO");
    expect(painel).toContain("sessionVersionDaSessao");
  });
});
