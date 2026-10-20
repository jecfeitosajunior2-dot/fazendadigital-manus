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
import { MSG_ACESSO_NEGADO } from "./contasAPagarDetalhe";
import {
  MSG_CONDICAO_NUMERO_DUPLICADO,
  MSG_CONDICAO_PAGAMENTO_ATUALIZADA,
  MSG_CONDICAO_PAGAMENTO_DEFINIDA,
  MSG_CONDICAO_VENCIMENTO,
  ROTULO_DEFINIR_CONDICAO,
  ROTULO_EDITAR_CONDICAO,
  acaoCondicaoPagamentoTitulo,
  aplicarModalidadeCondicao,
  aplicarQuantidadeParcelas,
  distribuirValorOriginalEmParcelas,
  mensagemErroDefinirParcelas,
  rascunhoInicialDaCondicao,
  tituloTemPagamentoEfetivo,
  validarCondicaoPagamento,
  vencimentoISOValido,
  type RascunhoCondicaoPagamento,
} from "./contasAPagarCondicao";
import type { TituloV2DetalheOficial } from "./contasAPagarListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 80,
    userId: 1,
    tipo: "pagar",
    estado: "ativo",
    condicaoStatus: "a_definir",
    pessoaId: 18,
    contraparteNomeSnapshot: "Premix",
    fazendaOrigemId: 1,
    origemTipo: "compra_insumos",
    origemId: 8,
    origemItemChave: "principal",
    descricao: "Compra de insumos",
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

describe("contasAPagarCondicao — validação", () => {
  it("pagamento único usa o valor original oficial e a data informada", () => {
    const resultado = validarCondicaoPagamento({
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

  it("duas ou mais parcelas com centavos somam exatamente o título", () => {
    const valores = distribuirValorOriginalEmParcelas("100.01", 2);
    expect(valores).toEqual([50, 50.01]);
    expect(distribuirValorOriginalEmParcelas("10.00", 3)).toEqual([3.33, 3.33, 3.34]);
    const resultado = validarCondicaoPagamento({
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
  });

  it("rejeita soma incorreta, valor zero/negativo, data inválida e número duplicado", () => {
    const soma = validarCondicaoPagamento({
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

    const zero = validarCondicaoPagamento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico("2026-11-10", "0,00"),
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.erros.linhas?.[1]?.valor).toBe(MSG_FIN_VALOR_POSITIVO);

    const negativa = validarCondicaoPagamento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico("2026-11-10", "-10"),
    });
    expect(negativa.ok).toBe(false);

    expect(vencimentoISOValido("2026-02-31")).toBe(false);
    expect(vencimentoISOValido("17/10/2026")).toBe(false);
    expect(vencimentoISOValido("")).toBe(false);
    expect(vencimentoISOValido("2026-11-10")).toBe(true);
    const data = validarCondicaoPagamento({
      titulo: titulo(),
      userId: 1,
      rascunho: rascunhoUnico("2026-02-31"),
    });
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.erros.linhas?.[1]?.vencimento).toBe(MSG_CONDICAO_VENCIMENTO);

    const duplicada = validarCondicaoPagamento({
      titulo: titulo(),
      userId: 1,
      rascunho: {
        modalidade: "parcelado",
        quantidade: 2,
        linhas: [
          { numero: 1, valor: "150,00", vencimento: "2026-11-10" },
          { numero: 1, valor: "150,00", vencimento: "2026-12-10" },
        ],
      },
    });
    expect(duplicada.ok).toBe(false);
    if (!duplicada.ok) expect(duplicada.erros.geral).toBe(MSG_CONDICAO_NUMERO_DUPLICADO);
  });

  it("não inventa vencimento ao mudar para parcelado; só reparte o valor oficial", () => {
    const base = rascunhoInicialDaCondicao(titulo());
    const parcelado = aplicarModalidadeCondicao(base, "parcelado", "300.00");
    expect(parcelado.linhas.map(l => l.vencimento)).toEqual(["", ""]);
    expect(parcelado.linhas.map(l => l.valor)).toEqual(["150,00", "150,00"]);
    const tres = aplicarQuantidadeParcelas(parcelado, 3, "300.00");
    expect(tres.linhas.map(l => l.vencimento)).toEqual(["", "", ""]);
    expect(tres.linhas[0]?.vencimento).toBe("");
  });
});

describe("contasAPagarCondicao — restrições oficiais", () => {
  it("título cancelado e título de outro usuário não oferecem a ação", () => {
    expect(acaoCondicaoPagamentoTitulo(titulo({ estado: "cancelado" }), 1)).toEqual({
      tipo: "nenhuma",
      motivo: "cancelado",
    });
    expect(acaoCondicaoPagamentoTitulo(titulo({ userId: 99 }), 1)).toEqual({
      tipo: "nenhuma",
      motivo: "sem_acesso",
    });
    const cancelado = validarCondicaoPagamento({
      titulo: titulo({ estado: "cancelado" }),
      userId: 1,
      rascunho: rascunhoUnico(),
    });
    expect(cancelado.ok).toBe(false);
    if (!cancelado.ok) expect(cancelado.erros.geral).toBe(MSG_FIN_TITULO_CANCELADO);
  });

  it("redefinição é permitida sem pagamento efetivo e bloqueada com pagamento", () => {
    const semPagamento = titulo({
      condicaoStatus: "definida",
      parcelas: [{
        id: 1,
        tituloId: 80,
        numero: 1,
        vencimento: "2026-11-10",
        valorOriginal: "300.00",
        principalLiquidado: 0,
        saldoPrincipal: 300,
        quitada: false,
      }],
    });
    expect(tituloTemPagamentoEfetivo(semPagamento)).toBe(false);
    expect(acaoCondicaoPagamentoTitulo(semPagamento, 1)).toEqual({
      tipo: "editar",
      rotulo: ROTULO_EDITAR_CONDICAO,
    });
    expect(rascunhoInicialDaCondicao(semPagamento).linhas[0]?.vencimento).toBe("2026-11-10");

    const comPagamento = titulo({
      condicaoStatus: "definida",
      parcelas: [{
        id: 1,
        tituloId: 80,
        numero: 1,
        vencimento: "2026-11-10",
        valorOriginal: "300.00",
        principalLiquidado: 50,
        saldoPrincipal: 250,
        quitada: false,
      }],
    });
    expect(tituloTemPagamentoEfetivo(comPagamento)).toBe(true);
    expect(acaoCondicaoPagamentoTitulo(comPagamento, 1)).toEqual({
      tipo: "nenhuma",
      motivo: "pagamento",
    });
    const bloqueada = validarCondicaoPagamento({
      titulo: comPagamento,
      userId: 1,
      rascunho: rascunhoUnico(),
    });
    expect(bloqueada.ok).toBe(false);
    if (!bloqueada.ok) expect(bloqueada.erros.geral).toBe(MSG_FIN_TITULO_COM_LIQUIDACAO);
  });

  it("título ativo sem parcelas oferece definir; erros oficiais da API são preservados", () => {
    expect(acaoCondicaoPagamentoTitulo(titulo(), 1)).toEqual({
      tipo: "definir",
      rotulo: ROTULO_DEFINIR_CONDICAO,
    });
    expect(mensagemErroDefinirParcelas("FORBIDDEN")).toBe(MSG_ACESSO_NEGADO);
    expect(mensagemErroDefinirParcelas("NOT_FOUND")).toBe("Título financeiro não encontrado.");
    expect(mensagemErroDefinirParcelas("BAD_REQUEST", MSG_FIN_PARCELAS_SOMA)).toBe(MSG_FIN_PARCELAS_SOMA);
    expect(mensagemErroDefinirParcelas("BAD_REQUEST", MSG_FIN_TITULO_COM_LIQUIDACAO)).toBe(MSG_FIN_TITULO_COM_LIQUIDACAO);
    expect(MSG_CONDICAO_PAGAMENTO_DEFINIDA).toMatch(/definida/);
    expect(MSG_CONDICAO_PAGAMENTO_ATUALIZADA).toMatch(/atualizada/);
  });
});

describe("contasAPagarCondicao — tela e contrato oficial", () => {
  it("detalhe usa só titulosDefinirParcelas e não registra pagamento", () => {
    expect(page).toContain("financeiroV2.titulosDefinirParcelas");
    expect(page).toContain("ROTULO_DEFINIR_CONDICAO");
    expect(page).toContain("ROTULO_EDITAR_CONDICAO");
    expect(page).toContain("titulosGet.invalidate");
    expect(page).toContain("tituloHistoricoPagamentos.invalidate");
    expect(page).toContain("titulosList.invalidate");
    expect(page).toContain("financeiroV2.liquidacaoPagar");
    expect(page).toContain("liquidacaoEstornar");
    expect(page).not.toContain("titulosCreateManual");
    expect(page).not.toContain("trpc.financeiro.");
    expect(lista).not.toContain("titulosDefinirParcelas");
  });

  it("não altera o núcleo: a operação oficial continua a autoridade", () => {
    expect(v2Router).toMatch(/titulosDefinirParcelas: protectedProcedure/);
    expect(nucleo).toContain("if (titulo.estado === \"cancelado\") toTrpc(MSG_FIN_TITULO_CANCELADO)");
    expect(nucleo).toContain("if (await tituloTemLiquidacao(tx, userId, tituloId)) toTrpc(MSG_FIN_TITULO_COM_LIQUIDACAO)");
    expect(nucleo).toContain("if (!validarSomaParcelas(titulo.valorOriginal, parcelas)) toTrpc(MSG_FIN_PARCELAS_SOMA)");
    expect(nucleo).toContain("return tituloTemLiquidacaoEfetiva(tx, userId, tituloId)");
  });
});
