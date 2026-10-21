import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_VALOR_POSITIVO,
} from "@shared/financeiroNucleo";
import type { ContaFinanceiraV2Oficial } from "./contasFinanceirasV2";
import type { TituloV2DetalheOficial } from "./contasAPagarListagem";
import {
  MSG_CONFIRMAR_RECEBIMENTO,
  MSG_RECEBIMENTO_DATA,
  MSG_RECEBIMENTO_ENVIO_DUPLICADO,
  MSG_RECEBIMENTO_HISTORICO_PARECIDO,
  MSG_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA,
  MSG_RECEBIMENTO_INTENCAO_TRAVADA,
  MSG_RECEBIMENTO_PARCELA_RECEBIDA,
  MSG_RECEBIMENTO_PENDENTE_RECUPERADA,
  MSG_RECEBIMENTO_RESULTADO_DESCONHECIDO,
  MSG_RECEBIMENTO_RETRY_MESMA_CHAVE,
  MSG_RECEBIMENTO_SEM_PARCELAS,
  PREFIXO_RECEBIMENTO_PENDENTE,
  ROTULO_REGISTRAR_RECEBIMENTO,
  apagarRecebimentoPendente,
  chaveArmazenamentoRecebimentoPendente,
  contasAtivasParaRecebimento,
  criarArmazenamentoRecebimentoMemoria,
  gravarRecebimentoPendente,
  historicoSugereRecebimentoDaPendencia,
  lerRecebimentoPendente,
  mensagemErroRecebimento,
  mensagemSituacaoPendenciaRecebimento,
  montarIntencaoRecebimento,
  novaChaveIdempotenciaRecebimento,
  parcelaTemSaldoAberto,
  pendenciaFoiRecuperada,
  podeRegistrarRecebimentoParcela,
  rascunhoInicialRecebimento,
  recebimentoRecusaDefinitiva,
  recebimentoResultadoDesconhecido,
  textoConfirmacaoRecebimento,
  validarRecebimentoParcela,
} from "./contasAReceberRecebimento";
import { chaveParaEnvioPagamento } from "./contasAPagarPagamento";

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
    situacao: "em_aberto",
    parcelas: [{
      id: 11,
      tituloId: 80,
      numero: 1,
      vencimento: "2026-11-10",
      valorOriginal: "300.00",
      principalLiquidado: 0,
      saldoPrincipal: 300,
      quitada: false,
    }],
    ...parcial,
  };
}

const parcelaAberta = titulo().parcelas[0]!;

function rascunho(parcial: Partial<ReturnType<typeof rascunhoInicialRecebimento>> = {}) {
  return {
    ...rascunhoInicialRecebimento({ parcela: parcelaAberta, dataLiquidacao: "2026-10-21", contaId: 3 }),
    ...parcial,
  };
}

describe("contasAReceberRecebimento — disponibilidade e validação", () => {
  it("recebimento integral e parcial usam o saldo oficial e uma parcela por operação", () => {
    const integral = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "300,00" }),
      idempotencyKey: "rec-integral",
    });
    expect(integral.ok).toBe(true);
    if (integral.ok) {
      expect(integral.payload.valorMovimentado).toBe(300);
      expect(integral.payload.alocacoes).toEqual([{ parcelaId: 11, principalLiquidado: 300 }]);
      expect(integral.payload.alocacoes).toHaveLength(1);
      expect(integral.payload.formaPagamento).toBeNull();
      expect(integral.payload.idempotencyKey).toBe("rec-integral");
    }

    const parcial = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "100,50" }),
      idempotencyKey: "rec-parcial",
    });
    expect(parcial.ok).toBe(true);
    if (parcial.ok) {
      expect(parcial.payload.valorMovimentado).toBe(100.5);
      expect(toCentavosPayload(parcial.payload.valorMovimentado)).toBe(10050);
    }
    expect(rascunhoInicialRecebimento({ parcela: parcelaAberta, dataLiquidacao: "2026-10-21" }).valor).toBe("300,00");
  });

  it("rejeita valor zero, negativo, acima do saldo e data inválida ou anterior à abertura", () => {
    const zero = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "0,00" }),
      idempotencyKey: "rec-zero",
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.erros.valor).toBe(MSG_FIN_VALOR_POSITIVO);

    const negativa = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "-10" }),
      idempotencyKey: "rec-neg",
    });
    expect(negativa.ok).toBe(false);

    const acima = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "300,01" }),
      idempotencyKey: "rec-acima",
    });
    expect(acima.ok).toBe(false);
    if (!acima.ok) expect(acima.erros.valor).toBe(MSG_FIN_OVERPAYMENT);

    const data = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ dataLiquidacao: "21/10/2026" }),
      idempotencyKey: "rec-data",
    });
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.erros.dataLiquidacao).toBe(MSG_RECEBIMENTO_DATA);

    const abertura = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta({ dataSaldoAbertura: "2026-10-22" })],
      userId: 1,
      rascunho: rascunho({ dataLiquidacao: "2026-10-21" }),
      idempotencyKey: "rec-abertura",
    });
    expect(abertura.ok).toBe(false);
    if (!abertura.ok) expect(abertura.erros.dataLiquidacao).toBe(MSG_FIN_DATA_ANTES_ABERTURA);
  });

  it("bloqueia título cancelado, parcela recebida, a pagar, outro usuário e conta inativa", () => {
    expect(podeRegistrarRecebimentoParcela({
      titulo: titulo({ estado: "cancelado" }),
      parcela: parcelaAberta,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "cancelado" });
    expect(podeRegistrarRecebimentoParcela({
      titulo: titulo({ tipo: "pagar" }),
      parcela: parcelaAberta,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "nao_receber" });
    expect(podeRegistrarRecebimentoParcela({
      titulo: titulo({ userId: 99 }),
      parcela: parcelaAberta,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "acesso" });

    const recebida = { ...parcelaAberta, quitada: true, saldoPrincipal: 0, principalLiquidado: 300 };
    expect(parcelaTemSaldoAberto(recebida)).toBe(false);
    expect(podeRegistrarRecebimentoParcela({
      titulo: titulo({ parcelas: [recebida] }),
      parcela: recebida,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "recebida" });
    expect(MSG_RECEBIMENTO_PARCELA_RECEBIDA).toMatch(/recebida/);
    expect(MSG_RECEBIMENTO_SEM_PARCELAS).toMatch(/parcelas/);
    expect(MSG_FIN_TITULO_CANCELADO).toMatch(/cancelado/);

    const inativa = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta({ ativa: false })],
      userId: 1,
      rascunho: rascunho(),
      idempotencyKey: "rec-inativa",
    });
    expect(inativa.ok).toBe(false);
    if (!inativa.ok) expect(inativa.erros.contaId).toBe(MSG_FIN_CONTA_INATIVA);
    expect(contasAtivasParaRecebimento([conta(), conta({ id: 9, ativa: false })], 1).map(c => c.id)).toEqual([3]);
  });
});

describe("contasAReceberRecebimento — idempotência e confirmação", () => {
  it("gera chave exclusiva e preserva a mesma chave no retry desconhecido", () => {
    expect(novaChaveIdempotenciaRecebimento()).not.toBe(novaChaveIdempotenciaRecebimento());
    const base = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "rec-retry-1",
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const intencao = montarIntencaoRecebimento(80, base.payload);
    const retry = chaveParaEnvioPagamento({
      chaveAtual: "outra-chave",
      assinaturaAtual: intencao.assinatura,
      intencao,
      resultadoDesconhecido: true,
    });
    expect(retry).toEqual({ ok: true, chave: "rec-retry-1" });
    expect(chaveParaEnvioPagamento({
      chaveAtual: "rec-retry-1",
      assinaturaAtual: `${intencao.assinatura}|mudou`,
      intencao,
      resultadoDesconhecido: true,
    })).toEqual({ ok: false, motivo: "travada" });
    expect(MSG_RECEBIMENTO_INTENCAO_TRAVADA).toMatch(/travados/);
    expect(MSG_RECEBIMENTO_RETRY_MESMA_CHAVE).toMatch(/mesma chave/);
  });

  it("timeout não afirma falha; clique duplo não inicia outra operação", () => {
    expect(recebimentoResultadoDesconhecido({ codigo: undefined })).toBe(true);
    expect(recebimentoResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(recebimentoResultadoDesconhecido({ codigo: "BAD_REQUEST" })).toBe(false);
    expect(MSG_RECEBIMENTO_RESULTADO_DESCONHECIDO).not.toMatch(/falhou/i);
    expect(MSG_RECEBIMENTO_ENVIO_DUPLICADO).toMatch(/em andamento/);
    expect(podeRegistrarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: true,
    })).toEqual({ ok: false, motivo: "ocupado" });
    expect(mensagemErroRecebimento("BAD_REQUEST", "SELECT * FROM financeiro")).toBe(
      "Não foi possível registrar o recebimento.",
    );
  });

  it("confirmação resume cliente, parcela, conta, data e valor", () => {
    expect(MSG_CONFIRMAR_RECEBIMENTO).toBe("Confirmar recebimento?");
    expect(textoConfirmacaoRecebimento({
      cliente: "Frigorífico Norte",
      parcelaNumero: 1,
      contaNome: "Caixa",
      dataLiquidacao: "2026-10-21",
      valor: 150,
    })).toBe([
      "Cliente: Frigorífico Norte",
      "Parcela: 1",
      "Conta financeira: Caixa",
      "Data: 2026-10-21",
      "Valor a receber: R$ 150,00",
    ].join("\n"));
  });
});

describe("contasAReceberRecebimento — recuperação da pendência", () => {
  it("persiste por usuário e título e recupera a mesma chave após reabrir", () => {
    const storage = criarArmazenamentoRecebimentoMemoria();
    const validado = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "rec-refresh-1",
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoRecebimento(80, validado.payload);
    gravarRecebimentoPendente({ userId: 1, intencao, storage });
    expect(chaveArmazenamentoRecebimentoPendente(1, 80)).toContain(PREFIXO_RECEBIMENTO_PENDENTE);
    expect(lerRecebimentoPendente({ userId: 1, tituloId: 80, storage })?.chave).toBe("rec-refresh-1");
    expect(lerRecebimentoPendente({ userId: 99, tituloId: 80, storage })).toBeNull();
    expect(lerRecebimentoPendente({ userId: 1, tituloId: 81, storage })).toBeNull();
    const retry = validarRecebimentoParcela({
      titulo: titulo({
        parcelas: [{ ...parcelaAberta, saldoPrincipal: 0, principalLiquidado: 50, quitada: true }],
      }),
      parcela: { ...parcelaAberta, saldoPrincipal: 0, principalLiquidado: 50, quitada: true },
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "outra",
      resultadoDesconhecido: true,
      intencao: lerRecebimentoPendente({ userId: 1, tituloId: 80, storage }),
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.payload.idempotencyKey).toBe("rec-refresh-1");
  });

  it("histórico parecido não limpa a pendência; ausência não prova que não gravou", () => {
    const intencao = montarIntencaoRecebimento(80, {
      contaId: 3,
      dataLiquidacao: "2026-10-21",
      valorMovimentado: 50,
      idempotencyKey: "rec-hist",
      formaPagamento: null,
      referencia: null,
      observacoes: null,
      alocacoes: [{ parcelaId: 11, principalLiquidado: 50 }],
    });
    expect(historicoSugereRecebimentoDaPendencia({
      intencao,
      eventos: [],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("ausente");
    expect(mensagemSituacaoPendenciaRecebimento("ausente")).toBe(MSG_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA);
    expect(historicoSugereRecebimentoDaPendencia({
      intencao,
      eventos: [{
        tipo: "recebimento",
        contaId: 3,
        dataLiquidacao: "2026-10-21",
        estornadaPorLiquidacaoId: null,
        alocacoesDesteTitulo: [{ parcelaId: 11, principalLiquidado: "50.00" }],
      }],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("parecido");
    expect(mensagemSituacaoPendenciaRecebimento("parecido")).toBe(MSG_RECEBIMENTO_HISTORICO_PARECIDO);
    expect(historicoSugereRecebimentoDaPendencia({
      intencao,
      eventos: [{
        tipo: "pagamento",
        contaId: 3,
        dataLiquidacao: "2026-10-21",
        estornadaPorLiquidacaoId: null,
        alocacoesDesteTitulo: [{ parcelaId: 11, principalLiquidado: "50.00" }],
      }],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("ausente");
  });

  it("timeout não apaga; só sucesso ou recusa definitiva apagam", () => {
    const storage = criarArmazenamentoRecebimentoMemoria();
    const validado = validarRecebimentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "80,00" }),
      idempotencyKey: "rec-to",
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    gravarRecebimentoPendente({ userId: 1, intencao: montarIntencaoRecebimento(80, validado.payload), storage });
    expect(recebimentoRecusaDefinitiva("TIMEOUT")).toBe(false);
    expect(recebimentoRecusaDefinitiva("BAD_REQUEST")).toBe(true);
    expect(lerRecebimentoPendente({ userId: 1, tituloId: 80, storage })?.chave).toBe("rec-to");
    apagarRecebimentoPendente({ userId: 1, tituloId: 80, storage });
    expect(lerRecebimentoPendente({ userId: 1, tituloId: 80, storage })).toBeNull();
    expect(pendenciaFoiRecuperada({ persistido: { chave: "rec-antes" }, chaveIniciadaNestaSessao: null })).toBe(true);
    expect(MSG_RECEBIMENTO_PENDENTE_RECUPERADA).toMatch(/não inicie outro recebimento/i);
  });
});

describe("contasAReceberRecebimento — tela e contrato oficial", () => {
  it("detalhe usa liquidacaoReceber e invalida as consultas oficiais", () => {
    expect(page).toContain("financeiroV2.liquidacaoReceber");
    expect(page).toContain("ROTULO_REGISTRAR_RECEBIMENTO");
    expect(page).toContain("titulosGet.invalidate");
    expect(page).toContain("titulosList.invalidate");
    expect(page).toContain("tituloHistoricoPagamentos.invalidate");
    expect(page).toContain("contasList.invalidate");
    expect(page).toContain("gravarRecebimentoPendente");
    expect(page).toContain("lerRecebimentoPendente");
    expect(page).toContain("apagarRecebimentoPendente");
    expect(page).toContain("textoConfirmacaoRecebimento");
    expect(page).toContain("MSG_CONFIRMAR_RECEBIMENTO");
    expect(page).toContain("Valor a receber agora");
    expect(page).toContain("Data do recebimento");
    expect(page).toContain("Conta financeira");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).toContain("liquidacaoEstornar");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("descontoLiquidado");
    expect(page).not.toContain("Valor do pagamento");
    expect(lista).not.toContain("liquidacaoReceber");
    expect(pagarPage).toContain("liquidacaoPagar");
    expect(ROTULO_REGISTRAR_RECEBIMENTO).toBe("Registrar recebimento");
  });

  it("não altera o núcleo: recebimento oficial continua a autoridade", () => {
    expect(v2Router).toContain("liquidacaoReceber: protectedProcedure");
    expect(v2Router).toContain("financeiroNucleoService.criarRecebimento");
    expect(nucleo).toContain("criarRecebimento(userId: number, input: Omit<LiquidacaoCmd, \"tipo\">)");
    expect(nucleo).toContain("{ ...input, tipo: \"recebimento\" }");
    expect(legado).not.toContain("liquidacaoReceber");
  });
});

function toCentavosPayload(valor: number): number {
  return Math.round(valor * 100);
}
