import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_ESCOPO,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_VALOR_POSITIVO,
} from "@shared/financeiroNucleo";
import type { ContaFinanceiraV2Oficial } from "./contasFinanceirasV2";
import type { TituloV2DetalheOficial } from "./contasAPagarListagem";
import {
  MSG_PAGAMENTO_DATA,
  MSG_PAGAMENTO_ENVIO_DUPLICADO,
  MSG_PAGAMENTO_HISTORICO_PARECIDO,
  MSG_PAGAMENTO_HISTORICO_VAZIO_NAO_PROVA,
  MSG_PAGAMENTO_INTENCAO_TRAVADA,
  MSG_PAGAMENTO_PARCELA_QUITADA,
  MSG_PAGAMENTO_PENDENTE_RECUPERADA,
  MSG_PAGAMENTO_RESULTADO_DESCONHECIDO,
  MSG_PAGAMENTO_RETRY_MESMA_CHAVE,
  MSG_PAGAMENTO_SEM_PARCELAS,
  PREFIXO_PAGAMENTO_PENDENTE,
  ROTULO_REGISTRAR_PAGAMENTO,
  apagarPagamentoPendente,
  assinaturaPayloadPagamento,
  chaveArmazenamentoPagamentoPendente,
  chaveParaEnvioPagamento,
  contasAtivasParaPagamento,
  criarArmazenamentoPagamentoMemoria,
  devePreservarChaveIdempotencia,
  gravarPagamentoPendente,
  historicoSugerePagamentoDaPendencia,
  lerPagamentoPendente,
  mensagemErroPagamento,
  mensagemSituacaoPendencia,
  montarIntencaoPagamento,
  novaChaveIdempotenciaPagamento,
  pagamentoRecusaDefinitiva,
  pagamentoResultadoDesconhecido,
  parcelaTemSaldoAberto,
  pendenciaFoiRecuperada,
  podeRegistrarPagamentoParcela,
  rascunhoInicialPagamento,
  validarPagamentoParcela,
} from "./contasAPagarPagamento";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");

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
    tipo: "pagar",
    estado: "ativo",
    condicaoStatus: "definida",
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

function rascunho(parcial: Partial<ReturnType<typeof rascunhoInicialPagamento>> = {}) {
  return {
    ...rascunhoInicialPagamento({ parcela: parcelaAberta, dataLiquidacao: "2026-10-19", contaId: 3 }),
    ...parcial,
  };
}

describe("contasAPagarPagamento — disponibilidade e validação", () => {
  it("pagamento integral e parcial usam o saldo oficial e a mesma fórmula de caixa", () => {
    const integral = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "300,00" }),
      idempotencyKey: "pag-integral",
    });
    expect(integral.ok).toBe(true);
    if (integral.ok) {
      expect(integral.payload.valorMovimentado).toBe(300);
      expect(integral.payload.alocacoes).toEqual([{ parcelaId: 11, principalLiquidado: 300 }]);
      expect(integral.payload.idempotencyKey).toBe("pag-integral");
    }

    const parcial = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "100,50" }),
      idempotencyKey: "pag-parcial",
    });
    expect(parcial.ok).toBe(true);
    if (parcial.ok) {
      expect(parcial.payload.valorMovimentado).toBe(100.5);
      expect(parcial.payload.alocacoes[0]?.principalLiquidado).toBe(100.5);
    }
    expect(rascunhoInicialPagamento({ parcela: parcelaAberta, dataLiquidacao: "2026-10-19" }).valor).toBe("300,00");
  });

  it("rejeita valor zero, acima do saldo e data inválida ou anterior à abertura", () => {
    const zero = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "0,00" }),
      idempotencyKey: "pag-zero",
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.erros.valor).toBe(MSG_FIN_VALOR_POSITIVO);

    const acima = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "300,01" }),
      idempotencyKey: "pag-acima",
    });
    expect(acima.ok).toBe(false);
    if (!acima.ok) expect(acima.erros.valor).toBe(MSG_FIN_OVERPAYMENT);

    const data = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ dataLiquidacao: "19/10/2026" }),
      idempotencyKey: "pag-data",
    });
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.erros.dataLiquidacao).toBe(MSG_PAGAMENTO_DATA);

    const abertura = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta({ dataSaldoAbertura: "2026-10-20" })],
      userId: 1,
      rascunho: rascunho({ dataLiquidacao: "2026-10-19" }),
      idempotencyKey: "pag-abertura",
    });
    expect(abertura.ok).toBe(false);
    if (!abertura.ok) expect(abertura.erros.dataLiquidacao).toBe(MSG_FIN_DATA_ANTES_ABERTURA);
  });

  it("bloqueia título cancelado, parcela quitada, sem parcelas, conta inativa e conta de outro usuário", () => {
    expect(podeRegistrarPagamentoParcela({
      titulo: titulo({ estado: "cancelado" }),
      parcela: parcelaAberta,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "cancelado" });
    expect(validarPagamentoParcela({
      titulo: titulo({ estado: "cancelado" }),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho(),
      idempotencyKey: "pag-canc",
    }).ok).toBe(false);

    const quitada = {
      ...parcelaAberta,
      quitada: true,
      saldoPrincipal: 0,
      principalLiquidado: 300,
    };
    expect(parcelaTemSaldoAberto(quitada)).toBe(false);
    expect(podeRegistrarPagamentoParcela({
      titulo: titulo({ parcelas: [quitada] }),
      parcela: quitada,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "quitada" });

    expect(podeRegistrarPagamentoParcela({
      titulo: titulo({ parcelas: [] }),
      parcela: null,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
    })).toEqual({ ok: false, motivo: "sem_parcelas" });
    expect(MSG_PAGAMENTO_SEM_PARCELAS).toMatch(/condição de pagamento/i);
    expect(MSG_PAGAMENTO_PARCELA_QUITADA).toMatch(/quitada/i);
    expect(MSG_FIN_TITULO_CANCELADO).toMatch(/cancelado/i);

    const inativa = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta({ ativa: false })],
      userId: 1,
      rascunho: rascunho(),
      idempotencyKey: "pag-inativa",
    });
    expect(inativa.ok).toBe(false);
    if (!inativa.ok) expect(inativa.erros.contaId).toBe(MSG_FIN_CONTA_INATIVA);
    expect(contasAtivasParaPagamento([conta(), conta({ id: 9, ativa: false })], 1).map(c => c.id)).toEqual([3]);

    const alheia = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta({ userId: 99 })],
      userId: 1,
      rascunho: rascunho(),
      idempotencyKey: "pag-user",
    });
    expect(alheia.ok).toBe(false);
    if (!alheia.ok) expect(alheia.erros.contaId ?? alheia.erros.geral).toBeTruthy();
    expect(contasAtivasParaPagamento([conta({ userId: 99 })], 1)).toEqual([]);
    expect(MSG_FIN_ESCOPO).toMatch(/acesso/i);
  });
});

describe("contasAPagarPagamento — idempotência", () => {
  it("gera chave nova por intenção e preserva a mesma chave no retry desconhecido", () => {
    const a = novaChaveIdempotenciaPagamento();
    const b = novaChaveIdempotenciaPagamento();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(80);

    const base = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "pag-retry-1",
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const intencao = montarIntencaoPagamento(80, base.payload);
    expect(devePreservarChaveIdempotencia({
      chaveAtual: "pag-retry-1",
      assinaturaAtual: intencao.assinatura,
      intencao,
      resultadoDesconhecido: true,
    })).toBe(true);

    const retry = chaveParaEnvioPagamento({
      chaveAtual: "outra-chave",
      assinaturaAtual: intencao.assinatura,
      intencao,
      resultadoDesconhecido: true,
    });
    expect(retry).toEqual({ ok: true, chave: "pag-retry-1" });

    const mudouValor = chaveParaEnvioPagamento({
      chaveAtual: "pag-retry-1",
      assinaturaAtual: `${intencao.assinatura}|mudou`,
      intencao,
      resultadoDesconhecido: true,
    });
    expect(mudouValor).toEqual({ ok: false, motivo: "travada" });
    expect(MSG_PAGAMENTO_INTENCAO_TRAVADA).toMatch(/travados/);
    expect(MSG_PAGAMENTO_RETRY_MESMA_CHAVE).toMatch(/mesma chave/);
  });

  it("timeout após gravação e falha de conexão não geram chave nova nem afirmam que falhou", () => {
    expect(pagamentoResultadoDesconhecido({ codigo: undefined, mensagem: "Failed to fetch" })).toBe(true);
    expect(pagamentoResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(pagamentoResultadoDesconhecido({ codigo: "INTERNAL_SERVER_ERROR" })).toBe(true);
    expect(pagamentoResultadoDesconhecido({ codigo: "BAD_REQUEST", mensagem: MSG_FIN_OVERPAYMENT })).toBe(false);
    expect(pagamentoResultadoDesconhecido({ codigo: "FORBIDDEN" })).toBe(false);
    expect(MSG_PAGAMENTO_RESULTADO_DESCONHECIDO).not.toMatch(/falhou/i);
    expect(MSG_PAGAMENTO_RESULTADO_DESCONHECIDO).toMatch(/não foi possível confirmar/i);
    expect(mensagemErroPagamento("FORBIDDEN")).toMatch(/acesso/i);
    expect(mensagemErroPagamento("BAD_REQUEST", "SELECT * FROM financeiro")).toBe("Não foi possível registrar o pagamento.");
    expect(MSG_PAGAMENTO_ENVIO_DUPLICADO).toMatch(/em andamento/);
  });

  it("nova operação com dados diferentes recebe chave nova; clique duplo não inicia outra", () => {
    const primeiro = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "pag-op-1",
    });
    const segundo = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "80,00" }),
      idempotencyKey: "pag-op-2",
    });
    expect(primeiro.ok && segundo.ok).toBe(true);
    if (primeiro.ok && segundo.ok) {
      expect(primeiro.payload.idempotencyKey).not.toBe(segundo.payload.idempotencyKey);
      expect(assinaturaPayloadPagamento(primeiro.payload)).not.toBe(assinaturaPayloadPagamento(segundo.payload));
    }
    expect(podeRegistrarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contasAtivas: [conta()],
      userId: 1,
      ocupado: true,
    })).toEqual({ ok: false, motivo: "ocupado" });
    expect(validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho(),
      idempotencyKey: "pag-busy",
      ocupado: true,
    }).ok).toBe(false);
  });
});

describe("contasAPagarPagamento — tela e contrato oficial", () => {
  it("detalhe usa liquidacaoPagar para pagar e liquidacaoEstornar só no V2", () => {
    expect(page).toContain("financeiroV2.liquidacaoPagar");
    expect(page).toContain("ROTULO_REGISTRAR_PAGAMENTO");
    expect(page).toContain("titulosGet.invalidate");
    expect(page).toContain("tituloHistoricoPagamentos.invalidate");
    expect(page).toContain("contasList.invalidate");
    expect(page).toContain("titulosList.invalidate");
    expect(page).toContain("idempotencyKey");
    expect(page).toContain("gravarPagamentoPendente");
    expect(page).toContain("lerPagamentoPendente");
    expect(page).toContain("apagarPagamentoPendente");
    expect(page).toContain("chaveIniciadaNestaSessaoRef");
    expect(page).toContain("pendenciaFoiRecuperada");
    expect(page).toContain("pendenciaRecuperada");
    expect(page).toContain("pagamentoRecusaDefinitiva");
    expect(page).toContain("liquidacaoEstornar");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("listContas");
    expect(lista).not.toContain("liquidacaoPagar");
    expect(ROTULO_REGISTRAR_PAGAMENTO).toBe("Registrar pagamento");
  });

  it("não altera o núcleo: retry oficial devolve a mesma liquidação", () => {
    expect(v2Router).toContain("liquidacaoPagar: protectedProcedure");
    expect(v2Router).toContain("financeiroNucleoService.criarPagamento");
    expect(nucleo).toContain("const existente = await tx.findLiquidacaoPorIdem(userId, input.idempotencyKey)");
    expect(nucleo).toContain("if (toCentavos(alloc.principalLiquidado) > toCentavos(saldo.saldoPrincipal))");
    expect(nucleo).toContain("if (!conta.ativa) toTrpc(MSG_FIN_CONTA_INATIVA)");
  });
});

describe("contasAPagarPagamento — recuperação da pendência", () => {
  it("persiste a mesma chave após fechar o navegador e não entrega a outro usuário", () => {
    const storage = criarArmazenamentoPagamentoMemoria();
    const validado = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "pag-refresh-1",
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoPagamento(80, validado.payload);
    gravarPagamentoPendente({ userId: 1, intencao, storage });
    expect(chaveArmazenamentoPagamentoPendente(1, 80)).toContain(PREFIXO_PAGAMENTO_PENDENTE);
    const depoisDoReload = lerPagamentoPendente({ userId: 1, tituloId: 80, storage });
    expect(depoisDoReload?.chave).toBe("pag-refresh-1");
    expect(depoisDoReload?.payload.valorMovimentado).toBe(50);
    expect(lerPagamentoPendente({ userId: 99, tituloId: 80, storage })).toBeNull();
    expect(lerPagamentoPendente({ userId: 1, tituloId: 81, storage })).toBeNull();
    const retry = validarPagamentoParcela({
      titulo: titulo({
        parcelas: [{ ...parcelaAberta, saldoPrincipal: 0, principalLiquidado: 50, quitada: true }],
      }),
      parcela: { ...parcelaAberta, saldoPrincipal: 0, principalLiquidado: 50, quitada: true },
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "50,00" }),
      idempotencyKey: "outra",
      resultadoDesconhecido: true,
      intencao: depoisDoReload,
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.payload.idempotencyKey).toBe("pag-refresh-1");
  });

  it("histórico parecido não limpa a pendência; ausência não prova que não gravou", () => {
    const intencao = montarIntencaoPagamento(80, {
      contaId: 3,
      dataLiquidacao: "2026-10-19",
      valorMovimentado: 50,
      idempotencyKey: "pag-hist",
      formaPagamento: null,
      referencia: null,
      observacoes: null,
      alocacoes: [{ parcelaId: 11, principalLiquidado: 50 }],
    });
    expect(historicoSugerePagamentoDaPendencia({
      intencao,
      eventos: undefined,
      historicoCarregando: true,
      historicoComErro: false,
    })).toBe("inconclusivo");
    expect(historicoSugerePagamentoDaPendencia({
      intencao,
      eventos: [],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("ausente");
    expect(mensagemSituacaoPendencia("ausente")).toBe(MSG_PAGAMENTO_HISTORICO_VAZIO_NAO_PROVA);
    expect(historicoSugerePagamentoDaPendencia({
      intencao,
      eventos: [{
        tipo: "pagamento",
        contaId: 3,
        dataLiquidacao: "2026-10-19",
        estornadaPorLiquidacaoId: null,
        alocacoesDesteTitulo: [{ parcelaId: 11, principalLiquidado: "50.00" }],
      }],
      historicoCarregando: false,
      historicoComErro: false,
    })).toBe("parecido");
    expect(mensagemSituacaoPendencia("parecido")).toBe(MSG_PAGAMENTO_HISTORICO_PARECIDO);
    expect(MSG_PAGAMENTO_HISTORICO_VAZIO_NAO_PROVA).toMatch(/não prova/i);
  });

  it("timeout não apaga a pendência; só sucesso ou recusa definitiva apagam; dados travados", () => {
    const storage = criarArmazenamentoPagamentoMemoria();
    const validado = validarPagamentoParcela({
      titulo: titulo(),
      parcela: parcelaAberta,
      contas: [conta()],
      userId: 1,
      rascunho: rascunho({ valor: "80,00" }),
      idempotencyKey: "pag-to",
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    const intencao = montarIntencaoPagamento(80, validado.payload);
    gravarPagamentoPendente({ userId: 1, intencao, storage });
    expect(pagamentoResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(pagamentoRecusaDefinitiva("TIMEOUT")).toBe(false);
    expect(pagamentoRecusaDefinitiva("FORBIDDEN")).toBe(false);
    expect(pagamentoRecusaDefinitiva("BAD_REQUEST")).toBe(true);
    expect(lerPagamentoPendente({ userId: 1, tituloId: 80, storage })?.chave).toBe("pag-to");
    const mudar = chaveParaEnvioPagamento({
      chaveAtual: intencao.chave,
      assinaturaAtual: "outra",
      intencao,
      resultadoDesconhecido: true,
    });
    expect(mudar).toEqual({ ok: false, motivo: "travada" });
    apagarPagamentoPendente({ userId: 1, tituloId: 80, storage });
    expect(lerPagamentoPendente({ userId: 1, tituloId: 80, storage })).toBeNull();
    expect(podeRegistrarPagamentoParcela({
      titulo: titulo(),
      parcela: { ...parcelaAberta, id: 99 },
      contasAtivas: [conta()],
      userId: 1,
      ocupado: false,
      pendenteOutraParcela: true,
    })).toEqual({ ok: false, motivo: "pendente" });
    expect(MSG_PAGAMENTO_PENDENTE_RECUPERADA).toMatch(/não inicie outro pagamento/i);
  });

  it("aviso de recuperação só vale para pendência de outra sessão", () => {
    expect(pendenciaFoiRecuperada({ persistido: null, chaveIniciadaNestaSessao: null })).toBe(false);
    expect(pendenciaFoiRecuperada({
      persistido: { chave: "pag-sessao" },
      chaveIniciadaNestaSessao: "pag-sessao",
    })).toBe(false);
    expect(pendenciaFoiRecuperada({
      persistido: { chave: "pag-antes" },
      chaveIniciadaNestaSessao: null,
    })).toBe(true);
    expect(pendenciaFoiRecuperada({
      persistido: { chave: "pag-antes" },
      chaveIniciadaNestaSessao: "pag-agora",
    })).toBe(true);
  });
});
