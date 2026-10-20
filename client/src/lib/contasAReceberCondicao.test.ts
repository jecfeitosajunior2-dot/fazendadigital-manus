import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_TITULO_COM_LIQUIDACAO,
  MSG_FIN_VALOR_POSITIVO,
} from "@shared/financeiroNucleo";
import { MSG_ACESSO_NEGADO } from "./contasAReceberDetalhe";
import {
  MSG_CONDICAO_VENCIMENTO,
  MSG_CONFIRMAR_PARCELAS,
  MSG_PARCELAS_ATUALIZADAS,
  MSG_PARCELAS_DEFINIDAS,
  ROTULO_DEFINIR_PARCELAS,
  ROTULO_EDITAR_PARCELAS,
  acaoCondicaoRecebimentoTitulo,
  aplicarModalidadeCondicao,
  aplicarQuantidadeParcelas,
  diferencaParcelasRascunho,
  mensagemErroDefinirParcelasReceber,
  rascunhoInicialDaCondicao,
  textoConfirmacaoParcelasReceber,
  tituloTemRecebimentoEfetivo,
  validarCondicaoRecebimento,
  vencimentoISOValido,
  type RascunhoCondicaoPagamento,
} from "./contasAReceberCondicao";
import { distribuirValorOriginalEmParcelas } from "./contasAPagarCondicao";
import type { TituloV2DetalheOficial } from "./contasAPagarListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAReceberDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAReceberPage.tsx"), "utf8");
const pagarPage = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");
const legado = readFileSync(resolve(here, "../pages/FinancialManagementPage.tsx"), "utf8");

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 80,
    userId: 1,
    tipo: "receber",
    estado: "ativo",
    condicaoStatus: "a_definir",
    pessoaId: 18,
    contraparteNomeSnapshot: "Frigorífico Norte",
    fazendaOrigemId: 1,
    origemTipo: "manual",
    origemId: null,
    origemItemChave: null,
    descricao: "Venda de bezerros",
    dataCompetencia: "2026-10-09",
    valorOriginal: "300.00",
    documentoReferencia: "NF-12",
    situacao: "em_aberto",
    parcelas: [],
    ...parcial,
  };
}

function rascunhoUnico(vencimento = "2026-11-10", valor = "300,00"): RascunhoCondicaoPagamento {
  return {
    modalidade: "unico",
    quantidade: 1,
    linhas: [{ numero: 1, valor, vencimento }],
  };
}

function parcelaOficial(
  principalLiquidado: number,
  saldo: number,
  quitada = false,
) {
  return {
    id: 1,
    tituloId: 80,
    numero: 1,
    vencimento: "2026-11-10",
    valorOriginal: "300.00",
    principalLiquidado,
    saldoPrincipal: saldo,
    quitada,
  };
}

describe("contasAReceberCondicao — validação", () => {
  it("uma parcela à vista usa o valor original oficial", () => {
    const resultado = validarCondicaoRecebimento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico(),
    });
    expect(resultado).toEqual({
      ok: true,
      payload: {
        tituloId: 80,
        parcelas: [{ numero: 1, vencimento: "2026-11-10", valorOriginal: 300 }],
      },
    });
    expect(rascunhoInicialDaCondicao(titulo()).linhas[0]?.vencimento).toBe("");
  });

  it("múltiplas parcelas com centavos somam exatamente o título", () => {
    expect(distribuirValorOriginalEmParcelas("100.01", 2)).toEqual([50, 50.01]);
    expect(distribuirValorOriginalEmParcelas("10.00", 3)).toEqual([3.33, 3.33, 3.34]);
    const resultado = validarCondicaoRecebimento({
      titulo: titulo({ valorOriginal: "100.01" }),
      userId: 1,
      rascunho: {
        modalidade: "parcelado",
        quantidade: 2,
        linhas: [
          { numero: 1, valor: "50,00", vencimento: "2026-11-10" },
          { numero: 2, valor: "50,01", vencimento: "2026-12-10" },
        ],
      },
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.payload.parcelas).toEqual([
        { numero: 1, vencimento: "2026-11-10", valorOriginal: 50 },
        { numero: 2, vencimento: "2026-12-10", valorOriginal: 50.01 },
      ]);
    }
    const diferenca = diferencaParcelasRascunho("100.01", [
      { numero: 1, valor: "50,00", vencimento: "2026-11-10" },
      { numero: 2, valor: "50,01", vencimento: "2026-12-10" },
    ]);
    expect(diferenca).toMatchObject({ ok: true, restanteCentavos: 0 });
  });

  it("rejeita soma incorreta, valor inválido e vencimento inválido", () => {
    const soma = validarCondicaoRecebimento({
      titulo: titulo(),
      userId: 1,
      rascunho: {
        modalidade: "parcelado",
        quantidade: 2,
        linhas: [
          { numero: 1, valor: "100,00", vencimento: "2026-11-10" },
          { numero: 2, valor: "100,00", vencimento: "2026-12-10" },
        ],
      },
    });
    expect(soma.ok).toBe(false);
    if (!soma.ok) expect(soma.erros.geral).toBe(MSG_FIN_PARCELAS_SOMA);
    expect(diferencaParcelasRascunho("300.00", [
      { numero: 1, valor: "100,00", vencimento: "2026-11-10" },
      { numero: 2, valor: "100,00", vencimento: "2026-12-10" },
    ]).restanteCentavos).toBe(10000);

    const zero = validarCondicaoRecebimento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico("2026-11-10", "0,00"),
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.erros.linhas?.[1]?.valor).toBe(MSG_FIN_VALOR_POSITIVO);

    const negativa = validarCondicaoRecebimento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico("2026-11-10", "-10"),
    });
    expect(negativa.ok).toBe(false);

    expect(vencimentoISOValido("2026-02-31")).toBe(false);
    const data = validarCondicaoRecebimento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico("2026-02-31"),
    });
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.erros.linhas?.[1]?.vencimento).toBe(MSG_CONDICAO_VENCIMENTO);
  });

  it("não inventa vencimento ao mudar a quantidade", () => {
    const parcelado = aplicarModalidadeCondicao(rascunhoInicialDaCondicao(titulo()), "parcelado", "300.00");
    expect(parcelado.linhas.map(l => l.vencimento)).toEqual(["", ""]);
    expect(aplicarQuantidadeParcelas(parcelado, 3, "300.00").linhas.map(l => l.vencimento)).toEqual(["", "", ""]);
  });
});

describe("contasAReceberCondicao — restrições oficiais", () => {
  it("título cancelado, liquidado, a pagar e de outro usuário não oferecem a ação", () => {
    expect(acaoCondicaoRecebimentoTitulo(titulo({ estado: "cancelado" }), 1)).toEqual({
      tipo: "nenhuma",
      motivo: "cancelado",
    });
    expect(acaoCondicaoRecebimentoTitulo(titulo({ situacao: "liquidado", parcelas: [parcelaOficial(300, 0, true)] }), 1))
      .toEqual({ tipo: "nenhuma", motivo: "liquidado" });
    expect(acaoCondicaoRecebimentoTitulo(titulo({ tipo: "pagar" }), 1)).toEqual({
      tipo: "nenhuma",
      motivo: "nao_receber",
    });
    expect(acaoCondicaoRecebimentoTitulo(titulo({ userId: 99 }), 1)).toEqual({
      tipo: "nenhuma",
      motivo: "sem_acesso",
    });
    const cancelado = validarCondicaoRecebimento({
      titulo: titulo({ estado: "cancelado" }),
      userId: 1,
      rascunho: rascunhoUnico(),
    });
    expect(cancelado.ok).toBe(false);
    if (!cancelado.ok) expect(cancelado.erros.geral).toBe(MSG_FIN_TITULO_CANCELADO);
  });

  it("bloqueia recebimento efetivo e libera depois do estorno integral", () => {
    const comRecebimento = titulo({
      condicaoStatus: "definida",
      situacao: "parcial",
      parcelas: [parcelaOficial(50, 250)],
    });
    expect(tituloTemRecebimentoEfetivo(comRecebimento)).toBe(true);
    expect(acaoCondicaoRecebimentoTitulo(comRecebimento, 1)).toEqual({
      tipo: "nenhuma",
      motivo: "recebimento",
    });
    const bloqueada = validarCondicaoRecebimento({
      titulo: comRecebimento,
      userId: 1,
      rascunho: rascunhoUnico(),
    });
    expect(bloqueada.ok).toBe(false);
    if (!bloqueada.ok) expect(bloqueada.erros.geral).toBe(MSG_FIN_TITULO_COM_LIQUIDACAO);

    const aposEstorno = titulo({
      condicaoStatus: "definida",
      situacao: "em_aberto",
      parcelas: [parcelaOficial(0, 300)],
    });
    expect(tituloTemRecebimentoEfetivo(aposEstorno)).toBe(false);
    expect(acaoCondicaoRecebimentoTitulo(aposEstorno, 1)).toEqual({
      tipo: "editar",
      rotulo: ROTULO_EDITAR_PARCELAS,
    });
  });

  it("título ativo sem parcelas oferece definir; confirmação resume cliente e vencimentos", () => {
    expect(acaoCondicaoRecebimentoTitulo(titulo(), 1)).toEqual({
      tipo: "definir",
      rotulo: ROTULO_DEFINIR_PARCELAS,
    });
    expect(textoConfirmacaoParcelasReceber({
      cliente: "Frigorífico Norte",
      descricao: "Venda de bezerros",
      valorOriginal: "300.00",
      parcelas: [
        { numero: 1, vencimento: "2026-11-10", valorOriginal: 150 },
        { numero: 2, vencimento: "2026-12-10", valorOriginal: 150 },
      ],
    })).toContain("Cliente: Frigorífico Norte");
    expect(textoConfirmacaoParcelasReceber({
      cliente: "Frigorífico Norte",
      descricao: "Venda de bezerros",
      valorOriginal: "300.00",
      parcelas: [{ numero: 1, vencimento: "2026-11-10", valorOriginal: 300 }],
    })).toContain("Quantidade de parcelas: 1");
    expect(mensagemErroDefinirParcelasReceber("FORBIDDEN")).toBe(MSG_ACESSO_NEGADO);
    expect(mensagemErroDefinirParcelasReceber("BAD_REQUEST", MSG_FIN_PARCELAS_SOMA)).toBe(MSG_FIN_PARCELAS_SOMA);
    expect(MSG_PARCELAS_DEFINIDAS).toMatch(/definidas/);
    expect(MSG_PARCELAS_ATUALIZADAS).toMatch(/atualizadas/);
    expect(MSG_CONFIRMAR_PARCELAS).toBe("Confirmar parcelas?");
  });
});

describe("contasAReceberCondicao — tela e contrato oficial", () => {
  it("detalhe usa só titulosDefinirParcelas e não movimenta caixa", () => {
    expect(page).toContain("financeiroV2.titulosDefinirParcelas");
    expect(page).toContain("ROTULO_DEFINIR_PARCELAS");
    expect(page).toContain("ROTULO_EDITAR_PARCELAS");
    expect(page).toContain("titulosGet.invalidate");
    expect(page).toContain("titulosList.invalidate");
    expect(page).toContain("Recebimento à vista");
    expect(page).toContain("Recebimento parcelado");
    expect(page).toContain("Valor a receber");
    expect(page).toContain("textoConfirmacaoParcelasReceber");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).not.toContain("liquidacaoReceber");
    expect(page).not.toContain("liquidacaoEstornar");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("Pagamento único");
    expect(lista).not.toContain("titulosDefinirParcelas");
    expect(pagarPage).toContain("financeiroV2.titulosDefinirParcelas");
  });

  it("não altera o núcleo: a operação oficial continua a autoridade", () => {
    expect(v2Router).toMatch(/titulosDefinirParcelas: protectedProcedure/);
    expect(nucleo).toContain("if (titulo.estado === \"cancelado\") toTrpc(MSG_FIN_TITULO_CANCELADO)");
    expect(nucleo).toContain("if (await tituloTemLiquidacao(tx, userId, tituloId)) toTrpc(MSG_FIN_TITULO_COM_LIQUIDACAO)");
    expect(nucleo).toContain("return tituloTemLiquidacaoEfetiva(tx, userId, tituloId)");
    expect(legado).not.toContain("titulosDefinirParcelas");
  });
});
