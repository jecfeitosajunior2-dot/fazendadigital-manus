import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_CONTA_NAO_ENCONTRADA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
} from "@shared/financeiroNucleo";
import type { ContaFinanceiraV2Oficial } from "./contasFinanceirasV2";
import type { TituloV2DetalheOficial } from "./contasAPagarListagem";
import type { EventoHistoricoPagamentoOficial } from "./contasAPagarDetalhe";
import {
  MSG_CONFIRMAR_ESTORNO_RECEBIMENTO,
  MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO,
  MSG_ESTORNO_RECEBIMENTO_DATA,
  MSG_ESTORNO_RECEBIMENTO_DO_ESTORNO,
  MSG_ESTORNO_RECEBIMENTO_HISTORICO_PARECIDO,
  MSG_ESTORNO_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA,
  MSG_ESTORNO_RECEBIMENTO_INTENCAO_TRAVADA,
  MSG_ESTORNO_RECEBIMENTO_NAO_EFETIVO,
  MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA,
  MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE,
  MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO,
  MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS,
  PREFIXO_CHAVE_ESTORNO_RECEBIMENTO,
  PREFIXO_ESTORNO_RECEBIMENTO_PENDENTE,
  ROTULO_ESTORNAR_RECEBIMENTO,
  alcanceEstornoDaLiquidacao,
  apagarEstornoRecebimentoPendente,
  chaveArmazenamentoEstornoRecebimentoPendente,
  chaveIdempotenciaEstornoRecebimentoValida,
  chaveParaEnvioEstornoRecebimento,
  criarArmazenamentoEstornoRecebimentoMemoria,
  estornoRecebimentoRecusaDefinitiva,
  estornoRecebimentoResultadoDesconhecido,
  gravarEstornoRecebimentoPendente,
  historicoSugereEstornoRecebimentoDaPendencia,
  lerEstornoRecebimentoPendente,
  lerEstornoRecebimentoPendenteDoTitulo,
  linhasTitulosAlcanceEstorno,
  mensagemBloqueioEstornoRecebimento,
  mensagemSituacaoPendenciaEstornoRecebimento,
  montarIntencaoEstornoRecebimento,
  novaChaveIdempotenciaEstornoRecebimento,
  pendenciaEstornoRecebimentoFoiRecuperada,
  podeEstornarRecebimento,
  recebimentoEfetivoParaEstorno,
  respostaEstornoConfirmaIntencao,
  textoConfirmacaoEstornoRecebimento,
  validarEstornoRecebimento,
} from "./contasAReceberEstorno";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAReceberDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAReceberPage.tsx"), "utf8");
const pagarPage = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");
const legado = readFileSync(resolve(here, "../pages/FinancialManagementPage.tsx"), "utf8");

function conta(parcial: Partial<ContaFinanceiraV2Oficial> = {}): ContaFinanceiraV2Oficial {
  return {
    id: 3,
    userId: 1,
    nome: "Caixa",
    tipo: "caixa",
    banco: null,
    agencia: null,
    numeroConta: null,
    saldoAbertura: "0.00",
    dataSaldoAbertura: "2026-01-01",
    ativa: true,
    saldoAtual: 1000,
    ...parcial,
  };
}

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 80,
    userId: 1,
    tipo: "receber",
    estado: "ativo",
    condicaoStatus: "definida",
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
    situacao: "parcial",
    parcelas: [{
      id: 11,
      tituloId: 80,
      numero: 1,
      vencimento: "2026-11-10",
      valorOriginal: "300.00",
      principalLiquidado: 100,
      saldoPrincipal: 200,
      quitada: false,
    }],
    ...parcial,
  };
}

function evento(parcial: Partial<EventoHistoricoPagamentoOficial> = {}): EventoHistoricoPagamentoOficial {
  return {
    liquidacaoId: 21,
    tipo: "recebimento",
    dataLiquidacao: "2026-10-20",
    contaId: 3,
    contaNome: "Caixa",
    valorMovimentado: "100.00",
    valorAlocadoNesteTitulo: 100,
    liquidacaoOriginalId: null,
    estornadaPorLiquidacaoId: null,
    referencia: null,
    observacoes: null,
    alocacoesDesteTitulo: [{
      parcelaId: 11,
      parcelaNumero: 1,
      vencimento: "2026-11-10",
      principalLiquidado: "100.00",
      desconto: "0.00",
      juros: "0.00",
      multa: "0.00",
      valorCaixaAlocado: 100,
    }],
    alcanceCompleto: true,
    quantidadeTitulosNaLiquidacao: 1,
    titulosNaLiquidacao: [{
      tituloId: 80,
      descricao: "Venda de bezerros",
      valorAlocado: 100,
    }],
    ...parcial,
  };
}

describe("contasAReceberEstorno — elegibilidade", () => {
  it("recebimento parcial efetivo pode ser estornado", () => {
    expect(recebimentoEfetivoParaEstorno(evento())).toBe(true);
    expect(podeEstornarRecebimento({
      titulo: titulo(),
      evento: evento(),
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: true });
  });

  it("recebimento que quitou parcela ou título continua sendo a liquidação original", () => {
    const quitouParcela = evento({
      liquidacaoId: 22,
      valorMovimentado: "200.00",
      valorAlocadoNesteTitulo: 200,
      alocacoesDesteTitulo: [{
        parcelaId: 11,
        parcelaNumero: 1,
        vencimento: "2026-11-10",
        principalLiquidado: "200.00",
        desconto: "0.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 200,
      }],
    });
    const quitouTitulo = evento({
      liquidacaoId: 23,
      valorMovimentado: "300.00",
      valorAlocadoNesteTitulo: 300,
    });
    expect(podeEstornarRecebimento({
      titulo: titulo({
        parcelas: [{ ...titulo().parcelas[0]!, quitada: true, saldoPrincipal: 0, principalLiquidado: 300 }],
      }),
      evento: quitouParcela,
      userId: 1,
      ocupado: false,
    }).ok).toBe(true);
    expect(podeEstornarRecebimento({
      titulo: titulo({ situacao: "liquidado" }),
      evento: quitouTitulo,
      userId: 1,
      ocupado: false,
    }).ok).toBe(true);
  });

  it("vários recebimentos na mesma parcela têm ação independente", () => {
    const primeiro = evento({ liquidacaoId: 21 });
    const segundo = evento({ liquidacaoId: 22, valorMovimentado: "50.00", valorAlocadoNesteTitulo: 50 });
    expect(podeEstornarRecebimento({ titulo: titulo(), evento: primeiro, userId: 1, ocupado: false }).ok).toBe(true);
    expect(podeEstornarRecebimento({ titulo: titulo(), evento: segundo, userId: 1, ocupado: false }).ok).toBe(true);
  });

  it("não oferece estorno para recebimento já estornado nem para o evento de estorno", () => {
    const original = evento({ estornadaPorLiquidacaoId: 99 });
    const inverso = evento({
      liquidacaoId: 99,
      tipo: "estorno_recebimento",
      liquidacaoOriginalId: 21,
      estornadaPorLiquidacaoId: null,
    });
    expect(podeEstornarRecebimento({ titulo: titulo(), evento: original, userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "ja_estornado" });
    expect(podeEstornarRecebimento({ titulo: titulo(), evento: inverso, userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "evento_estorno" });
    expect(mensagemBloqueioEstornoRecebimento("ja_estornado")).toBe(MSG_FIN_LIQUIDACAO_JA_ESTORNADA);
    expect(mensagemBloqueioEstornoRecebimento("evento_estorno")).toBe(MSG_ESTORNO_RECEBIMENTO_DO_ESTORNO);
    expect(mensagemBloqueioEstornoRecebimento("nao_efetivo")).toBe(MSG_ESTORNO_RECEBIMENTO_NAO_EFETIVO);
  });

  it("bloqueia usuário diferente, título a pagar, ocupado e clique em andamento", () => {
    expect(podeEstornarRecebimento({ titulo: titulo({ userId: 99 }), evento: evento(), userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "acesso" });
    expect(podeEstornarRecebimento({ titulo: titulo({ tipo: "pagar" }), evento: evento(), userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "nao_receber" });
    expect(podeEstornarRecebimento({ titulo: titulo(), evento: evento(), userId: 1, ocupado: true }))
      .toEqual({ ok: false, motivo: "ocupado" });
    expect(validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
      ocupado: true,
    }).ok).toBe(false);
  });
});

describe("contasAReceberEstorno — alcance e validações oficiais", () => {
  it("recebimento só neste título usa o alcance oficial, não a igualdade de valores", () => {
    expect(alcanceEstornoDaLiquidacao(evento())).toEqual({
      ok: true,
      abrangencia: "somente_este_titulo",
      titulos: [{ tituloId: 80, descricao: "Venda de bezerros", valorAlocado: 100 }],
    });
    expect(MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO).toBe("O estorno afeta somente este título.");
  });

  it("recebimento com outros títulos lista o alcance oficial e exige confirmação integral", () => {
    const compartilhado = evento({
      valorMovimentado: "250.00",
      valorAlocadoNesteTitulo: 100,
      quantidadeTitulosNaLiquidacao: 2,
      titulosNaLiquidacao: [
        { tituloId: 80, descricao: "Venda de bezerros", valorAlocado: 100 },
        { tituloId: 81, descricao: "Outro título", valorAlocado: 150 },
      ],
    });
    expect(alcanceEstornoDaLiquidacao(compartilhado)).toEqual({
      ok: true,
      abrangencia: "varios_titulos",
      titulos: compartilhado.titulosNaLiquidacao,
    });
    expect(MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS).toMatch(/todos os títulos relacionados a este recebimento/);
    expect(linhasTitulosAlcanceEstorno(compartilhado.titulosNaLiquidacao ?? []).map(t => t.rotulo))
      .toEqual(["Venda de bezerros", "Outro título"]);
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: compartilhado,
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-21",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(validado.ok).toBe(true);
    if (validado.ok) {
      expect(validado.snapshot.abrangencia).toBe("varios_titulos");
      expect(validado.snapshot.titulosNaLiquidacao).toHaveLength(2);
    }
  });

  it("caixa zero em outro título não prova que o recebimento é só deste título", () => {
    const descontoIntegral = evento({
      valorMovimentado: "100.00",
      valorAlocadoNesteTitulo: 100,
      quantidadeTitulosNaLiquidacao: 2,
      titulosNaLiquidacao: [
        { tituloId: 80, descricao: "Venda de bezerros", valorAlocado: 100 },
        { tituloId: 81, descricao: "Título com desconto integral", valorAlocado: 0 },
      ],
    });
    expect(alcanceEstornoDaLiquidacao(descontoIntegral)).toEqual({
      ok: true,
      abrangencia: "varios_titulos",
      titulos: descontoIntegral.titulosNaLiquidacao,
    });
  });

  it("bloqueia se faltar dado oficial para o alcance da liquidação", () => {
    const incompleto = evento({
      alcanceCompleto: false,
      quantidadeTitulosNaLiquidacao: undefined,
      titulosNaLiquidacao: undefined,
    });
    expect(alcanceEstornoDaLiquidacao(incompleto)).toEqual({ ok: false, motivo: "alcance_incompleto" });
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: incompleto,
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(validado.ok).toBe(false);
    if (!validado.ok) expect(validado.erros.geral).toBe(MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO);
  });

  it("conta inativa, data inválida e data antes da abertura usam as mensagens oficiais", () => {
    const inativa = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta({ ativa: false })],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(inativa.ok).toBe(false);
    if (!inativa.ok) expect(inativa.erros.geral).toBe(MSG_FIN_CONTA_INATIVA);

    const dataRuim = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "20/10/2026",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(dataRuim.ok).toBe(false);
    if (!dataRuim.ok) expect(dataRuim.erros.dataLiquidacao).toBe(MSG_ESTORNO_RECEBIMENTO_DATA);

    const antes = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta({ dataSaldoAbertura: "2026-10-21" })],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(antes.ok).toBe(false);
    if (!antes.ok) expect(antes.erros.dataLiquidacao).toBe(MSG_FIN_DATA_ANTES_ABERTURA);

    const outraPessoa = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta({ userId: 99 })],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(outraPessoa.ok).toBe(false);
    if (!outraPessoa.ok) expect(outraPessoa.erros.geral).toBe(MSG_FIN_CONTA_NAO_ENCONTRADA);
  });

  it("payload oficial só tem liquidacaoId, chave e data; nunca parcela, título ou motivo", () => {
    const chave = novaChaveIdempotenciaEstornoRecebimento();
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 21 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    expect(Object.keys(validado.payload).sort()).toEqual(["dataLiquidacao", "idempotencyKey", "liquidacaoId"]);
    expect(validado.payload.liquidacaoId).toBe(21);
    expect(validado.payload.dataLiquidacao).toBe("2026-10-20");
    expect(validado.payload.idempotencyKey.startsWith(PREFIXO_CHAVE_ESTORNO_RECEBIMENTO)).toBe(true);
    expect(JSON.stringify(validado.payload)).not.toMatch(/parcelaId|tituloId|motivo/);
  });

  it("confirmação resume cliente, data original, conta, valores, parcelas e data do estorno", () => {
    expect(MSG_CONFIRMAR_ESTORNO_RECEBIMENTO).toBe("Confirmar estorno?");
    expect(textoConfirmacaoEstornoRecebimento({
      cliente: "Frigorífico Norte",
      dataRecebimentoOriginal: "2026-10-20",
      contaNome: "Caixa",
      valorTotal: 250,
      valorNesteTitulo: 100,
      parcelasTexto: "Parcela 1",
      dataEstorno: "2026-10-21",
      abrangencia: "varios_titulos",
      titulos: [
        { tituloId: 80, descricao: "Venda de bezerros", valorAlocado: 100 },
        { tituloId: 81, descricao: "Outro título", valorAlocado: 150 },
      ],
    })).toContain("Cliente: Frigorífico Norte");
    expect(textoConfirmacaoEstornoRecebimento({
      cliente: "Frigorífico Norte",
      dataRecebimentoOriginal: "2026-10-20",
      contaNome: "Caixa",
      valorTotal: 100,
      valorNesteTitulo: 100,
      parcelasTexto: "Parcela 1",
      dataEstorno: "2026-10-21",
      abrangencia: "somente_este_titulo",
      titulos: [{ tituloId: 80, descricao: "Venda de bezerros", valorAlocado: 100 }],
    })).toContain(MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO);
  });
});

describe("contasAReceberEstorno — idempotência e recuperação", () => {
  it("chave de estorno de recebimento não reutiliza prefixo de pagamento nem de recebimento", () => {
    const a = novaChaveIdempotenciaEstornoRecebimento();
    const b = novaChaveIdempotenciaEstornoRecebimento();
    expect(a).not.toBe(b);
    expect(chaveIdempotenciaEstornoRecebimentoValida(a)).toBe(true);
    expect(chaveIdempotenciaEstornoRecebimentoValida("est-pag-abc")).toBe(false);
    expect(chaveIdempotenciaEstornoRecebimentoValida("rec-abc")).toBe(false);
    expect(chaveIdempotenciaEstornoRecebimentoValida("pag-abc")).toBe(false);
  });

  it("timeout preserva a chave; retry usa a mesma; alteração fica travada", () => {
    const chave = novaChaveIdempotenciaEstornoRecebimento();
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstornoRecebimento(80, validado.payload, validado.snapshot);
    expect(estornoRecebimentoResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(estornoRecebimentoRecusaDefinitiva("TIMEOUT")).toBe(false);
    expect(estornoRecebimentoRecusaDefinitiva("BAD_REQUEST")).toBe(true);
    expect(chaveParaEnvioEstornoRecebimento({
      chaveAtual: novaChaveIdempotenciaEstornoRecebimento(),
      assinaturaAtual: intencao.assinatura,
      intencao,
      resultadoDesconhecido: true,
    })).toEqual({ ok: true, chave: intencao.chave });
    expect(chaveParaEnvioEstornoRecebimento({
      chaveAtual: intencao.chave,
      assinaturaAtual: "outra",
      intencao,
      resultadoDesconhecido: true,
    })).toEqual({ ok: false, motivo: "travada" });
    expect(MSG_ESTORNO_RECEBIMENTO_INTENCAO_TRAVADA).toMatch(/travados/);
    expect(MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE).toMatch(/mesma chave/);
  });

  it("persiste por usuário e liquidação original; outro usuário não lê", () => {
    const storage = criarArmazenamentoEstornoRecebimentoMemoria();
    const chave = novaChaveIdempotenciaEstornoRecebimento();
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 21 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstornoRecebimento(80, validado.payload, validado.snapshot);
    gravarEstornoRecebimentoPendente({ userId: 1, intencao, storage });
    expect(chaveArmazenamentoEstornoRecebimentoPendente(1, 21)).toContain(PREFIXO_ESTORNO_RECEBIMENTO_PENDENTE);
    expect(chaveArmazenamentoEstornoRecebimentoPendente(1, 21)).not.toContain("fd.finv2.estpend.v1");
    expect(lerEstornoRecebimentoPendente({ userId: 1, liquidacaoId: 21, storage })?.chave).toBe(chave);
    expect(lerEstornoRecebimentoPendente({ userId: 99, liquidacaoId: 21, storage })).toBeNull();
    expect(lerEstornoRecebimentoPendente({ userId: 1, liquidacaoId: 22, storage })).toBeNull();
    expect(lerEstornoRecebimentoPendenteDoTitulo({
      userId: 1,
      tituloId: 80,
      liquidacaoIds: [21, 22],
      storage,
    })?.liquidacaoId).toBe(21);
    expect(pendenciaEstornoRecebimentoFoiRecuperada({ persistido: intencao, chaveIniciadaNestaSessao: null })).toBe(true);
    expect(pendenciaEstornoRecebimentoFoiRecuperada({ persistido: intencao, chaveIniciadaNestaSessao: chave })).toBe(false);
    apagarEstornoRecebimentoPendente({ userId: 1, liquidacaoId: 21, storage });
    expect(lerEstornoRecebimentoPendente({ userId: 1, liquidacaoId: 21, storage })).toBeNull();
  });

  it("histórico parecido não limpa a pendência; pagamento no histórico não conta", () => {
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstornoRecebimento(80, validado.payload, validado.snapshot);
    expect(historicoSugereEstornoRecebimentoDaPendencia({
      intencao,
      eventos: [{ tipo: "estorno_recebimento", liquidacaoOriginalId: 21, dataLiquidacao: "2026-10-20" }],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("parecido");
    expect(mensagemSituacaoPendenciaEstornoRecebimento("parecido")).toBe(MSG_ESTORNO_RECEBIMENTO_HISTORICO_PARECIDO);
    expect(historicoSugereEstornoRecebimentoDaPendencia({
      intencao,
      eventos: [{ tipo: "estorno_pagamento", liquidacaoOriginalId: 21, dataLiquidacao: "2026-10-20" }],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("ausente");
    expect(historicoSugereEstornoRecebimentoDaPendencia({
      intencao,
      eventos: [],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("ausente");
    expect(mensagemSituacaoPendenciaEstornoRecebimento("ausente")).toBe(MSG_ESTORNO_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA);
    expect(MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA).toMatch(/não inicie outro estorno/i);
  });

  it("após reabrir, o retry reenvia o payload original e a mesma chave", () => {
    const storage = criarArmazenamentoEstornoRecebimentoMemoria();
    const chave = novaChaveIdempotenciaEstornoRecebimento();
    const validado = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 21 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstornoRecebimento(80, validado.payload, validado.snapshot);
    gravarEstornoRecebimentoPendente({ userId: 1, intencao, storage });
    const recuperada = lerEstornoRecebimentoPendente({ userId: 1, liquidacaoId: 21, storage });
    expect(pendenciaEstornoRecebimentoFoiRecuperada({ persistido: recuperada, chaveIniciadaNestaSessao: null })).toBe(true);
    const retryLegitimo = validarEstornoRecebimento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 21 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: recuperada!.payload.dataLiquidacao,
      idempotencyKey: novaChaveIdempotenciaEstornoRecebimento(),
      resultadoDesconhecido: true,
      intencao: recuperada,
    });
    expect(retryLegitimo.ok).toBe(true);
    if (!retryLegitimo.ok) return;
    expect(retryLegitimo.payload).toEqual(intencao.payload);
    expect(retryLegitimo.payload.idempotencyKey).toBe(chave);
  });

  it("pendência de uma liquidação bloqueia nova intenção em outro recebimento", () => {
    expect(podeEstornarRecebimento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 22, valorMovimentado: "50.00", valorAlocadoNesteTitulo: 50 }),
      userId: 1,
      ocupado: false,
      pendenteOutraLiquidacao: true,
    })).toEqual({ ok: false, motivo: "pendente" });
    expect(respostaEstornoConfirmaIntencao({ liquidacaoOriginalId: 21, respostaId: 21 })).toBe(false);
    expect(respostaEstornoConfirmaIntencao({ liquidacaoOriginalId: 21, respostaId: 40 })).toBe(true);
  });
});

describe("contasAReceberEstorno — tela e contrato oficial", () => {
  it("detalhe chama só liquidacaoEstornar do V2, sem legado e sem motivo", () => {
    expect(ROTULO_ESTORNAR_RECEBIMENTO).toBe("Estornar recebimento");
    expect(page).toContain("financeiroV2.liquidacaoEstornar");
    expect(page).toContain("ROTULO_ESTORNAR_RECEBIMENTO");
    expect(page).toContain("gravarEstornoRecebimentoPendente");
    expect(page).toContain("lerEstornoRecebimentoPendenteDoTitulo");
    expect(page).toContain("respostaEstornoConfirmaIntencao");
    expect(page).toContain("PREFIXO_CHAVE_ESTORNO_RECEBIMENTO");
    expect(page).toContain("MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS");
    expect(page).toContain("MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO");
    expect(page).toContain("textoAlcanceConfirmacaoEstornoRecebimento");
    expect(page).toContain("linhasTitulosAlcanceEstorno");
    expect(page).toContain("MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO");
    expect(page).toContain("textoConfirmacaoEstornoRecebimento");
    expect(page).not.toContain("liquidacaoAbrangeOutrosTitulos(");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("motivoEstorno");
    expect(page).not.toContain("liquidacaoPagar");
    expect(lista).not.toContain("liquidacaoEstornar");
    expect(pagarPage).toContain("liquidacaoEstornar");
    expect(v2Router).toContain("liquidacaoEstornar: protectedProcedure");
    expect(nucleo).toContain("async estornarLiquidacao(userId: number");
    expect(nucleo).toContain("Não é possível estornar um estorno.");
    expect(page.indexOf("gravarEstornoRecebimentoPendente")).toBeLessThan(
      page.indexOf("estornarRecebimento.mutateAsync"),
    );
    expect(page).toContain("apagarEstornoRecebimentoPendente");
    expect(page).toContain("enviandoEstornoRef.current");
    expect(page).toContain("MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA");
    expect(legado).not.toContain("liquidacaoEstornar");
  });
});
