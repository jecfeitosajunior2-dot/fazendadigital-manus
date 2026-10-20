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
import { criarArmazenamentoPagamentoMemoria } from "./contasAPagarPagamento";
import {
  MSG_ESTORNO_ALCANCE_INCOMPLETO,
  MSG_ESTORNO_DATA,
  MSG_ESTORNO_DO_ESTORNO,
  MSG_ESTORNO_HISTORICO_PARECIDO,
  MSG_ESTORNO_HISTORICO_VAZIO_NAO_PROVA,
  MSG_ESTORNO_INTENCAO_TRAVADA,
  MSG_ESTORNO_NAO_EFETIVO,
  MSG_ESTORNO_PENDENTE_RECUPERADA,
  MSG_ESTORNO_RETRY_MESMA_CHAVE,
  MSG_ESTORNO_SOMENTE_ESTE_TITULO,
  MSG_ESTORNO_VARIOS_TITULOS,
  PREFIXO_CHAVE_ESTORNO,
  PREFIXO_ESTORNO_PENDENTE,
  ROTULO_ESTORNAR_PAGAMENTO,
  alcanceEstornoDaLiquidacao,
  linhasTitulosAlcanceEstorno,
  apagarEstornoPendente,
  chaveArmazenamentoEstornoPendente,
  chaveIdempotenciaEstornoValida,
  chaveParaEnvioEstorno,
  estornoRecusaDefinitiva,
  estornoResultadoDesconhecido,
  gravarEstornoPendente,
  historicoSugereEstornoDaPendencia,
  lerEstornoPendente,
  lerEstornoPendenteDoTitulo,
  mensagemBloqueioEstorno,
  mensagemSituacaoPendenciaEstorno,
  montarIntencaoEstorno,
  novaChaveIdempotenciaEstorno,
  pagamentoEfetivoParaEstorno,
  pendenciaEstornoFoiRecuperada,
  podeEstornarPagamento,
  respostaEstornoConfirmaIntencao,
  validarEstornoPagamento,
} from "./contasAPagarEstorno";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");

function conta(parcial: Partial<ContaFinanceiraV2Oficial> = {}): ContaFinanceiraV2Oficial {
  return {
    id: 3,
    userId: 1,
    nome: "Caixa Homolog",
    tipo: "caixa",
    banco: null,
    agencia: null,
    numeroConta: null,
    saldoAbertura: "0.00",
    dataSaldoAbertura: "2026-01-01",
    ativa: true,
    saldoAtual: 750,
    ...parcial,
  };
}

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 1,
    userId: 1,
    tipo: "pagar",
    estado: "ativo",
    condicaoStatus: "definida",
    pessoaId: 18,
    contraparteNomeSnapshot: "Fornecedor Homolog",
    fazendaOrigemId: 1,
    origemTipo: "manual",
    origemId: null,
    origemItemChave: null,
    descricao: "Título homologação",
    dataCompetencia: "2026-10-20",
    valorOriginal: "250.00",
    situacao: "parcial",
    parcelas: [
      {
        id: 1,
        tituloId: 1,
        numero: 1,
        vencimento: "2026-10-25",
        valorOriginal: "100.00",
        principalLiquidado: 40,
        saldoPrincipal: 60,
        quitada: false,
      },
    ],
    ...parcial,
  };
}

function evento(parcial: Partial<EventoHistoricoPagamentoOficial> = {}): EventoHistoricoPagamentoOficial {
  return {
    liquidacaoId: 11,
    tipo: "pagamento",
    dataLiquidacao: "2026-10-20",
    contaId: 3,
    contaNome: "Caixa Homolog",
    valorMovimentado: "40.00",
    valorAlocadoNesteTitulo: 40,
    liquidacaoOriginalId: null,
    estornadaPorLiquidacaoId: null,
    referencia: null,
    observacoes: null,
    alocacoesDesteTitulo: [{
      parcelaId: 1,
      parcelaNumero: 1,
      vencimento: "2026-10-25",
      principalLiquidado: "40.00",
      desconto: "0.00",
      juros: "0.00",
      multa: "0.00",
      valorCaixaAlocado: 40,
    }],
    alcanceCompleto: true,
    quantidadeTitulosNaLiquidacao: 1,
    titulosNaLiquidacao: [{
      tituloId: 1,
      descricao: "Título homologação",
      valorAlocado: 40,
    }],
    ...parcial,
  };
}

describe("contasAPagarEstorno — elegibilidade", () => {
  it("pagamento parcial efetivo pode ser estornado", () => {
    expect(pagamentoEfetivoParaEstorno(evento())).toBe(true);
    expect(podeEstornarPagamento({
      titulo: titulo(),
      evento: evento(),
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: true });
  });

  it("pagamento que quitou parcela ou título continua sendo a liquidação original", () => {
    const quitouParcela = evento({
      liquidacaoId: 12,
      valorMovimentado: "60.00",
      valorAlocadoNesteTitulo: 60,
      alocacoesDesteTitulo: [{
        parcelaId: 1,
        parcelaNumero: 1,
        vencimento: "2026-10-25",
        principalLiquidado: "60.00",
        desconto: "0.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 60,
      }],
    });
    const quitouTitulo = evento({
      liquidacaoId: 13,
      valorMovimentado: "150.00",
      valorAlocadoNesteTitulo: 150,
      alocacoesDesteTitulo: [{
        parcelaId: 2,
        parcelaNumero: 2,
        vencimento: "2026-11-25",
        principalLiquidado: "150.00",
        desconto: "0.00",
        juros: "0.00",
        multa: "0.00",
        valorCaixaAlocado: 150,
      }],
    });
    expect(podeEstornarPagamento({ titulo: titulo(), evento: quitouParcela, userId: 1, ocupado: false }).ok).toBe(true);
    expect(podeEstornarPagamento({ titulo: titulo({ situacao: "liquidado" }), evento: quitouTitulo, userId: 1, ocupado: false }).ok).toBe(true);
  });

  it("vários pagamentos na mesma parcela têm ação independente", () => {
    const primeiro = evento({ liquidacaoId: 11 });
    const segundo = evento({ liquidacaoId: 12, valorMovimentado: "60.00", valorAlocadoNesteTitulo: 60 });
    expect(podeEstornarPagamento({ titulo: titulo(), evento: primeiro, userId: 1, ocupado: false }).ok).toBe(true);
    expect(podeEstornarPagamento({ titulo: titulo(), evento: segundo, userId: 1, ocupado: false }).ok).toBe(true);
  });

  it("não oferece estorno para pagamento já estornado nem para o evento de estorno", () => {
    const original = evento({ estornadaPorLiquidacaoId: 99 });
    const inverso = evento({
      liquidacaoId: 99,
      tipo: "estorno_pagamento",
      liquidacaoOriginalId: 11,
      estornadaPorLiquidacaoId: null,
    });
    expect(podeEstornarPagamento({ titulo: titulo(), evento: original, userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "ja_estornado" });
    expect(podeEstornarPagamento({ titulo: titulo(), evento: inverso, userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "evento_estorno" });
    expect(mensagemBloqueioEstorno("ja_estornado")).toBe(MSG_FIN_LIQUIDACAO_JA_ESTORNADA);
    expect(mensagemBloqueioEstorno("evento_estorno")).toBe(MSG_ESTORNO_DO_ESTORNO);
    expect(mensagemBloqueioEstorno("nao_efetivo")).toBe(MSG_ESTORNO_NAO_EFETIVO);
  });

  it("bloqueia usuário diferente, ocupado e clique em andamento", () => {
    expect(podeEstornarPagamento({ titulo: titulo({ userId: 99 }), evento: evento(), userId: 1, ocupado: false }))
      .toEqual({ ok: false, motivo: "acesso" });
    expect(podeEstornarPagamento({ titulo: titulo(), evento: evento(), userId: 1, ocupado: true }))
      .toEqual({ ok: false, motivo: "ocupado" });
    expect(validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
      ocupado: true,
    }).ok).toBe(false);
  });
});

describe("contasAPagarEstorno — alcance e validações oficiais", () => {
  it("pagamento só neste título usa o alcance oficial, não a igualdade de valores", () => {
    expect(alcanceEstornoDaLiquidacao(evento())).toEqual({
      ok: true,
      abrangencia: "somente_este_titulo",
      titulos: [{ tituloId: 1, descricao: "Título homologação", valorAlocado: 40 }],
    });
    expect(MSG_ESTORNO_SOMENTE_ESTE_TITULO).toBe("O estorno afeta somente este título.");
  });

  it("pagamento com outros títulos lista o alcance oficial e exige confirmação integral", () => {
    const compartilhado = evento({
      valorMovimentado: "200.00",
      valorAlocadoNesteTitulo: 40,
      quantidadeTitulosNaLiquidacao: 2,
      titulosNaLiquidacao: [
        { tituloId: 1, descricao: "Título homologação", valorAlocado: 40 },
        { tituloId: 2, descricao: "Outro título", valorAlocado: 160 },
      ],
    });
    expect(alcanceEstornoDaLiquidacao(compartilhado)).toEqual({
      ok: true,
      abrangencia: "varios_titulos",
      titulos: compartilhado.titulosNaLiquidacao,
    });
    expect(MSG_ESTORNO_VARIOS_TITULOS).toBe(
      "O estorno será integral e afetará todos os títulos relacionados a este pagamento.",
    );
    expect(linhasTitulosAlcanceEstorno(compartilhado.titulosNaLiquidacao ?? []).map(t => t.rotulo))
      .toEqual(["Título homologação", "Outro título"]);
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: compartilhado,
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(validado.ok).toBe(true);
    if (validado.ok) {
      expect(validado.snapshot.abrangencia).toBe("varios_titulos");
      expect(validado.snapshot.titulosNaLiquidacao).toHaveLength(2);
    }
  });

  it("caixa zero em outro título não prova que o pagamento é só deste título", () => {
    const descontoIntegral = evento({
      valorMovimentado: "40.00",
      valorAlocadoNesteTitulo: 40,
      quantidadeTitulosNaLiquidacao: 2,
      titulosNaLiquidacao: [
        { tituloId: 1, descricao: "Título homologação", valorAlocado: 40 },
        { tituloId: 2, descricao: "Título com desconto integral", valorAlocado: 0 },
      ],
    });
    expect(alcanceEstornoDaLiquidacao(descontoIntegral)).toEqual({
      ok: true,
      abrangencia: "varios_titulos",
      titulos: descontoIntegral.titulosNaLiquidacao,
    });
  });

  it("bloqueia se faltar dado oficial para o alcance da liquidação", () => {
    const incompleto = evento({ alcanceCompleto: false, quantidadeTitulosNaLiquidacao: undefined, titulosNaLiquidacao: undefined });
    expect(alcanceEstornoDaLiquidacao(incompleto)).toEqual({ ok: false, motivo: "alcance_incompleto" });
    expect(alcanceEstornoDaLiquidacao(evento({
      valorMovimentado: "200.00",
      valorAlocadoNesteTitulo: 40,
    }))).toEqual({
      ok: true,
      abrangencia: "somente_este_titulo",
      titulos: [{ tituloId: 1, descricao: "Título homologação", valorAlocado: 40 }],
    });
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: incompleto,
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(validado.ok).toBe(false);
    if (!validado.ok) expect(validado.erros.geral).toBe(MSG_ESTORNO_ALCANCE_INCOMPLETO);
  });

  it("conta inativa, data inválida e data antes da abertura usam as mensagens oficiais", () => {
    const inativa = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta({ ativa: false })],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(inativa.ok).toBe(false);
    if (!inativa.ok) expect(inativa.erros.geral).toBe(MSG_FIN_CONTA_INATIVA);

    const dataRuim = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "20/10/2026",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(dataRuim.ok).toBe(false);
    if (!dataRuim.ok) expect(dataRuim.erros.dataLiquidacao).toBe(MSG_ESTORNO_DATA);

    const antes = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta({ dataSaldoAbertura: "2026-10-21" })],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(antes.ok).toBe(false);
    if (!antes.ok) expect(antes.erros.dataLiquidacao).toBe(MSG_FIN_DATA_ANTES_ABERTURA);

    const outraPessoa = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta({ userId: 99 })],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(outraPessoa.ok).toBe(false);
    if (!outraPessoa.ok) expect(outraPessoa.erros.geral).toBe(MSG_FIN_CONTA_NAO_ENCONTRADA);
  });

  it("payload oficial só tem liquidacaoId, chave e data; nunca parcela, título ou motivo", () => {
    const chave = novaChaveIdempotenciaEstorno();
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 11 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    expect(Object.keys(validado.payload).sort()).toEqual(["dataLiquidacao", "idempotencyKey", "liquidacaoId"]);
    expect(validado.payload.liquidacaoId).toBe(11);
    expect(validado.payload.dataLiquidacao).toBe("2026-10-20");
    expect(validado.payload.idempotencyKey.startsWith(PREFIXO_CHAVE_ESTORNO)).toBe(true);
    expect(JSON.stringify(validado.payload)).not.toMatch(/parcelaId|tituloId|motivo/);
  });
});

describe("contasAPagarEstorno — idempotência e recuperação", () => {
  it("chave de estorno não reutiliza prefixo de pagamento", () => {
    const a = novaChaveIdempotenciaEstorno();
    const b = novaChaveIdempotenciaEstorno();
    expect(a).not.toBe(b);
    expect(chaveIdempotenciaEstornoValida(a)).toBe(true);
    expect(chaveIdempotenciaEstornoValida("pag-abc")).toBe(false);
    expect(chaveIdempotenciaEstornoValida("")).toBe(false);
  });

  it("timeout preserva a chave; retry usa a mesma; alteração fica travada", () => {
    const chave = novaChaveIdempotenciaEstorno();
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstorno(1, validado.payload, validado.snapshot);
    expect(estornoResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(estornoRecusaDefinitiva("TIMEOUT")).toBe(false);
    expect(estornoRecusaDefinitiva("BAD_REQUEST")).toBe(true);
    expect(chaveParaEnvioEstorno({
      chaveAtual: novaChaveIdempotenciaEstorno(),
      assinaturaAtual: intencao.assinatura,
      intencao,
      resultadoDesconhecido: true,
    })).toEqual({ ok: true, chave: intencao.chave });
    expect(chaveParaEnvioEstorno({
      chaveAtual: intencao.chave,
      assinaturaAtual: "outra",
      intencao,
      resultadoDesconhecido: true,
    })).toEqual({ ok: false, motivo: "travada" });
    expect(MSG_ESTORNO_INTENCAO_TRAVADA).toMatch(/travados/);
    expect(MSG_ESTORNO_RETRY_MESMA_CHAVE).toMatch(/mesma chave/);
  });

  it("persiste por usuário e liquidação original; outro usuário não lê", () => {
    const storage = criarArmazenamentoPagamentoMemoria();
    const chave = novaChaveIdempotenciaEstorno();
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 11 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstorno(1, validado.payload, validado.snapshot);
    gravarEstornoPendente({ userId: 1, intencao, storage });
    expect(chaveArmazenamentoEstornoPendente(1, 11)).toContain(PREFIXO_ESTORNO_PENDENTE);
    expect(lerEstornoPendente({ userId: 1, liquidacaoId: 11, storage })?.chave).toBe(chave);
    expect(lerEstornoPendente({ userId: 99, liquidacaoId: 11, storage })).toBeNull();
    expect(lerEstornoPendente({ userId: 1, liquidacaoId: 12, storage })).toBeNull();
    expect(lerEstornoPendenteDoTitulo({
      userId: 1,
      tituloId: 1,
      liquidacaoIds: [11, 12],
      storage,
    })?.liquidacaoId).toBe(11);
    expect(pendenciaEstornoFoiRecuperada({ persistido: intencao, chaveIniciadaNestaSessao: null })).toBe(true);
    expect(pendenciaEstornoFoiRecuperada({ persistido: intencao, chaveIniciadaNestaSessao: chave })).toBe(false);
    apagarEstornoPendente({ userId: 1, liquidacaoId: 11, storage });
    expect(lerEstornoPendente({ userId: 1, liquidacaoId: 11, storage })).toBeNull();
  });

  it("histórico parecido não limpa a pendência; ausência não prova que não gravou", () => {
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento(),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstorno(1, validado.payload, validado.snapshot);
    expect(historicoSugereEstornoDaPendencia({
      intencao,
      eventos: [{ tipo: "estorno_pagamento", liquidacaoOriginalId: 11, dataLiquidacao: "2026-10-20" }],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("parecido");
    expect(mensagemSituacaoPendenciaEstorno("parecido")).toBe(MSG_ESTORNO_HISTORICO_PARECIDO);
    expect(historicoSugereEstornoDaPendencia({
      intencao,
      eventos: [],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("ausente");
    expect(mensagemSituacaoPendenciaEstorno("ausente")).toBe(MSG_ESTORNO_HISTORICO_VAZIO_NAO_PROVA);
    expect(MSG_ESTORNO_PENDENTE_RECUPERADA).toMatch(/não inicie outro estorno/i);
  });

  it("resposta idempotente com o id do pagamento original é colisão, não sucesso", () => {
    expect(respostaEstornoConfirmaIntencao({ liquidacaoOriginalId: 11, respostaId: 11 })).toBe(false);
    expect(respostaEstornoConfirmaIntencao({ liquidacaoOriginalId: 11, respostaId: 40 })).toBe(true);
  });

  it("após recarregar a página, o retry reenvia o payload original e a mesma chave", () => {
    const storage = criarArmazenamentoPagamentoMemoria();
    const chave = novaChaveIdempotenciaEstorno();
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 3 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: chave,
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstorno(1, validado.payload, validado.snapshot);
    gravarEstornoPendente({ userId: 1, intencao, storage });

    const recuperada = lerEstornoPendente({ userId: 1, liquidacaoId: 3, storage });
    expect(pendenciaEstornoFoiRecuperada({ persistido: recuperada, chaveIniciadaNestaSessao: null })).toBe(true);
    expect(recuperada?.payload).toEqual(intencao.payload);

    const retry = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 3 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-21",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
      resultadoDesconhecido: true,
      intencao: recuperada,
    });
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.erros.geral).toBe(MSG_ESTORNO_INTENCAO_TRAVADA);

    const retryLegitimo = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 3 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: recuperada!.payload.dataLiquidacao,
      idempotencyKey: novaChaveIdempotenciaEstorno(),
      resultadoDesconhecido: true,
      intencao: recuperada,
    });
    expect(retryLegitimo.ok).toBe(true);
    if (!retryLegitimo.ok) return;
    expect(retryLegitimo.payload).toEqual(intencao.payload);
    expect(retryLegitimo.payload.idempotencyKey).toBe(chave);
  });

  it("timeout e erro de rede mantêm a pendência; recusa definitiva apaga", () => {
    const storage = criarArmazenamentoPagamentoMemoria();
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 3 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstorno(1, validado.payload, validado.snapshot);
    gravarEstornoPendente({ userId: 1, intencao, storage });
    expect(estornoResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(estornoResultadoDesconhecido({ mensagem: "Failed to fetch" })).toBe(true);
    expect(estornoResultadoDesconhecido({ codigo: "INTERNAL_SERVER_ERROR" })).toBe(true);
    expect(estornoRecusaDefinitiva("BAD_REQUEST")).toBe(true);
    expect(lerEstornoPendente({ userId: 1, liquidacaoId: 3, storage })?.chave).toBe(intencao.chave);
    apagarEstornoPendente({ userId: 1, liquidacaoId: 3, storage });
    expect(lerEstornoPendente({ userId: 1, liquidacaoId: 3, storage })).toBeNull();
  });

  it("resposta idempotente com id do estorno confirma a intenção e a pendência pode ser limpa", () => {
    const storage = criarArmazenamentoPagamentoMemoria();
    const validado = validarEstornoPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 3 }),
      contas: [conta()],
      userId: 1,
      dataLiquidacao: "2026-10-20",
      idempotencyKey: novaChaveIdempotenciaEstorno(),
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoEstorno(1, validado.payload, validado.snapshot);
    gravarEstornoPendente({ userId: 1, intencao, storage });
    expect(respostaEstornoConfirmaIntencao({ liquidacaoOriginalId: 3, respostaId: 4 })).toBe(true);
    apagarEstornoPendente({ userId: 1, liquidacaoId: 3, storage });
    expect(lerEstornoPendente({ userId: 1, liquidacaoId: 3, storage })).toBeNull();
  });

  it("pendência de uma liquidação bloqueia nova intenção em outro pagamento", () => {
    expect(podeEstornarPagamento({
      titulo: titulo(),
      evento: evento({ liquidacaoId: 2, valorMovimentado: "60.00", valorAlocadoNesteTitulo: 60 }),
      userId: 1,
      ocupado: false,
      pendenteOutraLiquidacao: true,
    })).toEqual({ ok: false, motivo: "pendente" });
    expect(mensagemBloqueioEstorno("pendente")).toBe(MSG_ESTORNO_PENDENTE_RECUPERADA);
  });
});

describe("contasAPagarEstorno — tela e contrato oficial", () => {
  it("detalhe chama só liquidacaoEstornar do V2, sem legado e sem motivo", () => {
    expect(ROTULO_ESTORNAR_PAGAMENTO).toBe("Estornar pagamento");
    expect(page).toContain("financeiroV2.liquidacaoEstornar");
    expect(page).toContain("ROTULO_ESTORNAR_PAGAMENTO");
    expect(page).toContain("gravarEstornoPendente");
    expect(page).toContain("lerEstornoPendenteDoTitulo");
    expect(page).toContain("respostaEstornoConfirmaIntencao");
    expect(page).toContain("PREFIXO_CHAVE_ESTORNO");
    expect(page).toContain("MSG_ESTORNO_VARIOS_TITULOS");
    expect(page).toContain("MSG_ESTORNO_SOMENTE_ESTE_TITULO");
    expect(page).toContain("textoAlcanceConfirmacaoEstorno");
    expect(page).toContain("linhasTitulosAlcanceEstorno");
    expect(page).toContain("MSG_ESTORNO_ALCANCE_INCOMPLETO");
    expect(page).not.toContain("liquidacaoAbrangeOutrosTitulos(");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("motivoEstorno");
    expect(lista).not.toContain("liquidacaoEstornar");
    expect(v2Router).toContain("liquidacaoEstornar: protectedProcedure");
    expect(nucleo).toContain("async estornarLiquidacao(userId: number");
    expect(nucleo).toContain("Não é possível estornar um estorno.");
    expect(page.indexOf("gravarEstornoPendente")).toBeLessThan(page.indexOf("estornarPagamento.mutateAsync"));
    expect(page).toContain("apagarEstornoPendente");
    expect(page).toContain("enviandoEstornoRef.current");
    expect(page).toContain("MSG_ESTORNO_PENDENTE_RECUPERADA");
    expect(page).toContain("lerEstornoPendenteDoTitulo");
  });
});
