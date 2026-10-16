import { describe, expect, it } from "vitest";
import {
  FINANCEIRO_ORIGEM_MANUTENCAO,
  MSG_FIN_ORIGEM_AUTOMATICA,
  validarOrigemTitulo,
} from "./financeiroNucleo";
import {
  MSG_MANUT_FAZENDA_ACESSO,
  MSG_MANUT_FAZENDA_MAQUINA_INVALIDA,
  MSG_MANUT_PRESTADOR_INATIVO,
  MSG_MANUT_PRESTADOR_INVALIDO,
} from "./manutencaoIdentificacaoOperacional";
import {
  amarrarOrigemTituloManutencao,
  avaliarElegibilidadeAPagarManutencao,
  chaveOrigemTituloManutencao,
  decidirEdicaoIdentidadeFinanceiraManutencao,
  decidirEdicaoManutencaoComMotorV2Atual,
  decidirEdicaoValorFinanceiroManutencao,
  decidirEstornoFinanceiroManutencao,
  assinarOperacaoManutencao,
  decidirIdempotenciaOperacaoCompleta,
  decidirIdempotenciaTituloManutencao,
  decidirReusoChaveOperacaoManutencao,
  isDuplicateChaveOperacaoManutencao,
  MANUTENCOES_CHAVE_OPERACAO_UQ,
  edicaoFinanceiraSemTransacaoUnicaDeveBloquear,
  ETAPAS_TX_MANUT_A_PAGAR,
  MANUT_A_PAGAR_OPERACIONAL,
  MANUT_FINANCEIRO_CHAVE_OFICINA,
  MOTOR_V2_PERMITE_ATUALIZAR_VALOR_TITULO,
  MSG_MANUT_FIN_COM_PAGAMENTO,
  MSG_MANUT_FIN_EDICAO_ATOMICA,
  MSG_MANUT_FIN_EDICAO_SEM_API_V2,
  MSG_MANUT_FIN_IDENTIDADE,
  MSG_MANUT_FIN_CHAVE_ALHEIA,
  MSG_MANUT_FIN_CHAVE_DIVERGENTE,
  MSG_MANUT_FIN_IDEMPOTENCY,
  MSG_MANUT_FIN_INTERNA,
  MSG_MANUT_FIN_NAO_ATIVA,
  MSG_MANUT_FIN_OS_HISTORICA,
  MSG_MANUT_FIN_OS_ID,
  MSG_MANUT_FIN_TITULO_CANCELADO,
  MSG_MANUT_FIN_VALOR_DIVERGENTE,
  MSG_MANUT_FIN_VALOR_ZERO,
  MSG_MANUT_FIN_VENCIMENTO,
  planejarTransacaoUnicaManutencaoAPagar,
  prepararPlanoTituloAPagarManutencao,
  recusarAtivacaoOperacionalAPagar,
  resultadoTransacaoUnicaSimulada,
  validarConsistenciaTituloManutencaoEmitido,
  validarIdempotencyOperacaoManutencao,
  valorFinanceiroOficialDaOs,
} from "./manutencaoFinanceiroAPagar";
import { calcularCustosManutencaoCompletos } from "./manutencaoPecasOrigem";

const userA = 910001;
const userB = 910002;

const fornecedor = { id: 7, userId: userA, tipo: "fornecedor" as const, ativo: true };
const maquina = { id: 4, userId: userA, fazendaId: 12 };
const fazenda = { id: 12, userId: userA };

const pecaEstoque = { quantidade: 1, valorUnitario: 100 };
const pecaOficina = { quantidade: 1, valorUnitario: 150, valorTotal: 150 };

function baseElegivel(extras: Record<string, unknown> = {}) {
  return {
    userId: userA,
    tipoExecucao: "externa" as const,
    prestadorPessoaId: 7,
    prestadorNome: "Oficina Central",
    pessoa: fornecedor,
    maquina,
    fazenda,
    valorCobradoOficina: 500,
    valorTotal: 600,
    dataCompetencia: "2026-10-14",
    dataVencimento: "2026-11-14",
    pecasEstoque: [pecaEstoque],
    pecasOficina: [pecaOficina],
    valorMaoObra: 350,
    ...extras,
  };
}

describe("valor financeiro oficial", () => {
  it("usa só oficina + mão de obra, nunca o custo total", () => {
    const custos = calcularCustosManutencaoCompletos({
      pecasEstoque: [pecaEstoque],
      pecasOficina: [pecaOficina],
      valorMaoObra: 350,
    });
    expect(custos.valorTotal).toBe(600);
    expect(custos.valorCobradoOficina).toBe(500);
    expect(valorFinanceiroOficialDaOs({
      pecasEstoque: [pecaEstoque],
      pecasOficina: [pecaOficina],
      valorMaoObra: 350,
    })).toBe(500);
    expect(valorFinanceiroOficialDaOs({ valorCobradoOficina: 500, valorTotal: 600 })).toBe(500);
  });

  it("peças só do estoque: financeiro é só a mão de obra", () => {
    expect(valorFinanceiroOficialDaOs({
      pecasEstoque: [pecaEstoque],
      pecasOficina: [],
      valorMaoObra: 350,
    })).toBe(350);
  });

  it("peças só da oficina: financeiro é oficina + mão de obra", () => {
    expect(valorFinanceiroOficialDaOs({
      pecasEstoque: [],
      pecasOficina: [pecaOficina],
      valorMaoObra: 350,
    })).toBe(500);
  });
});

describe("elegibilidade A pagar", () => {
  it("manutenção interna não gera título", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({ tipoExecucao: "interna" }));
    expect(r).toMatchObject({ ok: true, elegivel: false, motivo: "interna", message: MSG_MANUT_FIN_INTERNA });
  });

  it("manutenção externa com valor positivo é elegível", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel());
    expect(r.ok).toBe(true);
    if (r.ok && r.elegivel) {
      expect(r.valorOriginal).toBe(500);
      expect(r.pessoaId).toBe(7);
      expect(r.fazendaOrigemId).toBe(12);
    }
  });

  it("valor cobrado zero não gera título", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({
      valorCobradoOficina: 0,
      valorTotal: 100,
      pecasOficina: [],
      valorMaoObra: 0,
    }));
    expect(r).toMatchObject({ ok: true, elegivel: false, motivo: "valor_zero", message: MSG_MANUT_FIN_VALOR_ZERO });
  });

  it("peças mistas elegíveis com 500, não 600", () => {
    const plano = prepararPlanoTituloAPagarManutencao(baseElegivel());
    expect(plano.ok).toBe(true);
    if (plano.ok) {
      expect(plano.plano.valorOriginal).toBe(500);
      expect(plano.plano.tipo).toBe("pagar");
      expect(plano.plano.origemTipo).toBe(FINANCEIRO_ORIGEM_MANUTENCAO);
      expect(plano.plano.origemItemChave).toBe(MANUT_FINANCEIRO_CHAVE_OFICINA);
      expect(plano.plano.origemId).toBeNull();
    }
  });

  it("recusa valor informado igual ao custo total", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({ valorInformado: 600 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_MANUT_FIN_VALOR_DIVERGENTE);
  });

  it("fornecedor inexistente", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({ pessoa: null }));
    expect(r).toMatchObject({ ok: false, motivo: "prestador_invalido", message: MSG_MANUT_PRESTADOR_INVALIDO });
  });

  it("fornecedor inativo", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({
      pessoa: { ...fornecedor, ativo: false },
    }));
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_PRESTADOR_INATIVO });
  });

  it("fornecedor de outro usuário", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({
      pessoa: { ...fornecedor, userId: userB },
    }));
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_PRESTADOR_INVALIDO });
  });

  it("máquina sem fazenda", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({
      maquina: { id: 4, userId: userA, fazendaId: 0 },
    }));
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_FAZENDA_MAQUINA_INVALIDA });
  });

  it("fazenda de outro usuário", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({
      fazenda: { id: 12, userId: userB },
    }));
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_FAZENDA_ACESSO });
  });

  it("vencimento inválido", () => {
    expect(avaliarElegibilidadeAPagarManutencao(baseElegivel({ dataVencimento: "" }))).toMatchObject({
      ok: false,
      message: MSG_MANUT_FIN_VENCIMENTO,
    });
    expect(avaliarElegibilidadeAPagarManutencao(baseElegivel({ dataVencimento: "31/11/2026" }))).toMatchObject({
      ok: false,
      message: MSG_MANUT_FIN_VENCIMENTO,
    });
    expect(avaliarElegibilidadeAPagarManutencao(baseElegivel({ dataVencimento: "2026-02-30" }))).toMatchObject({
      ok: false,
      message: MSG_MANUT_FIN_VENCIMENTO,
    });
  });

  it("OS histórica sem pessoaId não recebe título", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({
      tipoExecucao: null,
      prestadorPessoaId: null,
      prestadorNome: "Fornecedor Teste Validação",
    }));
    expect(r).toMatchObject({
      ok: true,
      elegivel: false,
      motivo: "os_historica",
      message: MSG_MANUT_FIN_OS_HISTORICA,
    });
  });

  it("externa antiga só com nome, sem pessoaId, também não gera título", () => {
    const r = avaliarElegibilidadeAPagarManutencao(baseElegivel({ prestadorPessoaId: null }));
    expect(r).toMatchObject({ ok: true, elegivel: false, motivo: "os_historica" });
  });
});

describe("origem e idempotência", () => {
  it("origem automática exige OS real + chave oficina", () => {
    expect(validarOrigemTitulo({
      origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
      origemId: 54,
      origemItemChave: MANUT_FINANCEIRO_CHAVE_OFICINA,
    })).toEqual({
      ok: true,
      origemTipo: "manutencao",
      origemId: 54,
      origemItemChave: "oficina",
    });
    expect(validarOrigemTitulo({
      origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
      origemId: null,
      origemItemChave: "oficina",
    }).ok).toBe(false);
  });

  it("não inventa origemId antes da OS", () => {
    const preparado = prepararPlanoTituloAPagarManutencao(baseElegivel());
    expect(preparado.ok).toBe(true);
    if (!preparado.ok) return;
    expect(preparado.plano.origemId).toBeNull();
    expect(amarrarOrigemTituloManutencao(preparado.plano, 0)).toEqual({
      ok: false,
      message: MSG_MANUT_FIN_OS_ID,
    });
    expect(amarrarOrigemTituloManutencao(preparado.plano, undefined)).toMatchObject({
      ok: false,
      message: MSG_MANUT_FIN_OS_ID,
    });
    const preso = amarrarOrigemTituloManutencao(preparado.plano, 54);
    expect(preso.ok).toBe(true);
    if (preso.ok) {
      expect(preso.plano.origemId).toBe(54);
      expect(chaveOrigemTituloManutencao(54)).toEqual({
        origemTipo: "manutencao",
        origemId: 54,
        origemItemChave: "oficina",
      });
    }
  });

  it("tentativa repetida / duplo clique reutiliza o título ativo", () => {
    const primeira = decidirIdempotenciaTituloManutencao([]);
    expect(primeira).toEqual({ acao: "criar" });
    const segunda = decidirIdempotenciaTituloManutencao([
      { id: 88, estado: "ativo", origemTipo: "manutencao", origemItemChave: "oficina", situacao: "em_aberto" },
    ]);
    expect(segunda).toEqual({ acao: "reutilizar", tituloId: 88 });
  });

  it("concorrência com dois ativos da mesma origem bloqueia", () => {
    const r = decidirIdempotenciaTituloManutencao([
      { id: 88, estado: "ativo", origemTipo: "manutencao", origemItemChave: "oficina" },
      { id: 89, estado: "ativo", origemTipo: "manutencao", origemItemChave: "oficina" },
    ]);
    expect(r.acao).toBe("bloquear");
  });

  it("título cancelado não é reaproveitado nem gera segundo", () => {
    const r = decidirIdempotenciaTituloManutencao([
      { id: 88, estado: "cancelado", origemTipo: "manutencao", origemItemChave: "oficina" },
    ]);
    expect(r).toEqual({ acao: "bloquear", message: MSG_MANUT_FIN_TITULO_CANCELADO });
  });

  it("origem sem chave é recusada pelo núcleo oficial", () => {
    const r = validarOrigemTitulo({
      origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
      origemId: 54,
      origemItemChave: null,
    });
    expect(r).toEqual({ ok: false, message: MSG_FIN_ORIGEM_AUTOMATICA });
  });
});

describe("transação única (proposta, não executada)", () => {
  it("ordem: OS, origem, título, apropriação e parcela", () => {
    const plano = planejarTransacaoUnicaManutencaoAPagar();
    expect(plano.atomica).toBe(true);
    expect(plano.origemIdSomenteAposOs).toBe(true);
    expect(plano.etapas).toEqual([...ETAPAS_TX_MANUT_A_PAGAR]);
  });

  it("falha em qualquer etapa reverte a operação inteira", () => {
    const falhou = resultadoTransacaoUnicaSimulada([
      { nome: "persistir_os", ok: true },
      { nome: "amarrar_origem", ok: true },
      { nome: "emitir_titulo", ok: false },
      { nome: "apropriar", ok: true },
      { nome: "definir_parcela", ok: true },
    ]);
    expect(falhou).toEqual({ ok: false, reverter: true, falhouEm: "emitir_titulo" });
    expect(resultadoTransacaoUnicaSimulada([
      { nome: "persistir_os", ok: true },
      { nome: "amarrar_origem", ok: true },
      { nome: "emitir_titulo", ok: true },
      { nome: "apropriar", ok: true },
      { nome: "definir_parcela", ok: true },
    ])).toEqual({ ok: true, commit: true });
  });
});

describe("edição e estorno financeiros (regras, sem alterar procedures)", () => {
  it("título sem pagamento: estorna OS e cancela o título", () => {
    const r = decidirEstornoFinanceiroManutencao({
      id: 88,
      estado: "ativo",
      situacao: "em_aberto",
      temLiquidacaoEfetiva: false,
    });
    expect(r).toEqual({ ok: true, acao: "cancelar_titulo", tituloId: 88 });
  });

  it("título vencido sem pagamento também pode cancelar", () => {
    const r = decidirEstornoFinanceiroManutencao({
      id: 88,
      estado: "ativo",
      situacao: "vencido",
      temLiquidacaoEfetiva: false,
    });
    expect(r).toEqual({ ok: true, acao: "cancelar_titulo", tituloId: 88 });
  });

  it("parcialmente pago bloqueia estorno e alteração de valor", () => {
    const titulo = { id: 88, estado: "ativo" as const, situacao: "parcial" as const, temLiquidacaoEfetiva: true };
    expect(decidirEstornoFinanceiroManutencao(titulo)).toEqual({
      ok: false,
      message: MSG_MANUT_FIN_COM_PAGAMENTO,
    });
    expect(decidirEdicaoValorFinanceiroManutencao({
      titulo,
      valorCobradoOficinaNovo: 400,
      valorTituloAtual: 500,
    })).toEqual({ ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO });
  });

  it("totalmente pago bloqueia estorno e alteração de valor", () => {
    const titulo = { id: 88, estado: "ativo" as const, situacao: "liquidado" as const, temLiquidacaoEfetiva: true };
    expect(decidirEstornoFinanceiroManutencao(titulo).ok).toBe(false);
    expect(decidirEdicaoValorFinanceiroManutencao({
      titulo,
      valorCobradoOficinaNovo: 400,
      valorTituloAtual: 500,
    }).ok).toBe(false);
  });

  it("sem pagamento: correção de valor exige título e parcelas na mesma transação", () => {
    const r = decidirEdicaoValorFinanceiroManutencao({
      titulo: { id: 88, estado: "ativo", situacao: "em_aberto", temLiquidacaoEfetiva: false },
      valorCobradoOficinaNovo: 400,
      valorTituloAtual: 500,
    });
    expect(r).toEqual({
      ok: true,
      acao: "atualizar_titulo_e_parcelas",
      exigeTransacaoUnica: true,
    });
    expect(edicaoFinanceiraSemTransacaoUnicaDeveBloquear()).toEqual({
      ok: false,
      message: MSG_MANUT_FIN_EDICAO_ATOMICA,
    });
  });
});

describe("ativação e idempotência da operação completa", () => {
  it("permanece desligada no fluxo operacional", () => {
    expect(MANUT_A_PAGAR_OPERACIONAL).toBe(false);
    expect(recusarAtivacaoOperacionalAPagar()).toEqual({
      ok: false,
      message: MSG_MANUT_FIN_NAO_ATIVA,
    });
  });

  it("exige chave de confirmação da operação inteira", () => {
    expect(validarIdempotencyOperacaoManutencao("curta")).toEqual({
      ok: false,
      message: MSG_MANUT_FIN_IDEMPOTENCY,
    });
    expect(validarIdempotencyOperacaoManutencao("confirma-os-01")).toEqual({
      ok: true,
      key: "confirma-os-01",
    });
  });

  it("duplo clique com a mesma chave reutiliza a OS, não só o título", () => {
    expect(decidirIdempotenciaOperacaoCompleta(null)).toEqual({ acao: "executar" });
    expect(decidirIdempotenciaOperacaoCompleta({ osId: 77, tituloId: 88 })).toEqual({
      acao: "reutilizar",
      osId: 77,
      tituloId: 88,
    });
  });

  it("mesma chave com dados diferentes é recusada; outro usuário não reutiliza", () => {
    const base = {
      maquinaId: 4,
      fazendaId: 12,
      prestadorPessoaId: 7,
      tipoExecucao: "externa" as const,
      data: "2026-10-14",
      pecasOficina: [pecaOficina],
    };
    const proposta = assinarOperacaoManutencao({ ...base, valorMaoObra: 350 });
    const outra = assinarOperacaoManutencao({ ...base, valorMaoObra: 100 });
    expect(decidirReusoChaveOperacaoManutencao({
      existente: { userId: userA, osId: 20, tituloId: 88, assinatura: proposta },
      userId: userA,
      proposta,
    })).toEqual({ acao: "reutilizar", osId: 20, tituloId: 88 });
    expect(decidirReusoChaveOperacaoManutencao({
      existente: { userId: userA, osId: 20, tituloId: 88, assinatura: proposta },
      userId: userA,
      proposta: outra,
    })).toEqual({ acao: "bloquear", message: MSG_MANUT_FIN_CHAVE_DIVERGENTE });
    expect(decidirReusoChaveOperacaoManutencao({
      existente: { userId: userA, osId: 20, tituloId: 88, assinatura: proposta },
      userId: userB,
      proposta,
    })).toEqual({ acao: "bloquear", message: MSG_MANUT_FIN_CHAVE_ALHEIA });
  });

  it("1062 só da unique da operação é repetição; outro índice não", () => {
    const sqlOk = `Duplicate entry '910001-confirma-os-01' for key 'manutencoes.${MANUTENCOES_CHAVE_OPERACAO_UQ}'`;
    const direto = Object.assign(new Error(sqlOk), {
      errno: 1062,
      code: "ER_DUP_ENTRY",
      sqlMessage: sqlOk,
    });
    expect(isDuplicateChaveOperacaoManutencao(direto)).toBe(true);

    const encapsulado = new Error("Failed query: insert into `manutencoes`");
    (encapsulado as Error & { cause: object }).cause = {
      errno: 1062,
      code: "ER_DUP_ENTRY",
      sqlMessage: sqlOk,
    };
    expect(isDuplicateChaveOperacaoManutencao(encapsulado)).toBe(true);

    const outra = Object.assign(new Error("Duplicate entry"), {
      errno: 1062,
      code: "ER_DUP_ENTRY",
      sqlMessage: "Duplicate entry '1' for key 'financeiro_titulos.financeiro_titulos_origem_uq'",
    });
    expect(isDuplicateChaveOperacaoManutencao(outra)).toBe(false);

    const generico = Object.assign(new Error("Duplicate entry"), {
      errno: 1062,
      code: "ER_DUP_ENTRY",
    });
    expect(isDuplicateChaveOperacaoManutencao(generico)).toBe(false);

    const primary = Object.assign(new Error("Duplicate entry"), {
      errno: 1062,
      code: "ER_DUP_ENTRY",
      sqlMessage: "Duplicate entry '20' for key 'manutencoes.PRIMARY'",
    });
    expect(isDuplicateChaveOperacaoManutencao(primary)).toBe(false);

    const backtick = Object.assign(new Error("Failed query"), {
      cause: {
        errno: 1062,
        code: "ER_DUP_ENTRY",
        sqlMessage: `Duplicate entry '910001-confirma-os-01' for key \`${MANUTENCOES_CHAVE_OPERACAO_UQ}\``,
      },
    });
    expect(isDuplicateChaveOperacaoManutencao(backtick)).toBe(true);

    const soTexto = new Error("duplicate key value violates unique constraint");
    expect(isDuplicateChaveOperacaoManutencao(soTexto)).toBe(false);
  });
});

describe("motor V2 na edição e consistência do título", () => {
  it("sem API oficial de valor, bloqueia correção mesmo sem pagamento", () => {
    expect(MOTOR_V2_PERMITE_ATUALIZAR_VALOR_TITULO).toBe(false);
    const r = decidirEdicaoManutencaoComMotorV2Atual({
      titulo: { id: 88, estado: "ativo", situacao: "em_aberto", temLiquidacaoEfetiva: false },
      valorCobradoOficinaNovo: 400,
      valorTituloAtual: 500,
    });
    expect(r).toEqual({
      ok: false,
      message: MSG_MANUT_FIN_EDICAO_SEM_API_V2,
      motivo: "sem_api_oficial",
    });
  });

  it("troca de fornecedor ou fazenda com título ativo é bloqueada", () => {
    expect(decidirEdicaoIdentidadeFinanceiraManutencao({
      titulo: { id: 88, estado: "ativo", situacao: "em_aberto" },
      prestadorAtual: 7,
      prestadorNovo: 9,
      fazendaAtual: 12,
      fazendaNova: 12,
    })).toEqual({ ok: false, message: MSG_MANUT_FIN_IDENTIDADE });
  });

  it("título emitido precisa bater OS, oficina, fornecedor, fazenda e parcela", () => {
    const ok = validarConsistenciaTituloManutencaoEmitido({
      osId: 20,
      valorCobradoOficina: 500,
      prestadorPessoaId: 7,
      fazendaId: 12,
      titulo: {
        tipo: "pagar",
        estado: "ativo",
        pessoaId: 7,
        fazendaOrigemId: 12,
        origemTipo: "manutencao",
        origemId: 20,
        origemItemChave: "oficina",
        valorOriginal: 500,
      },
      parcelas: [{ valorOriginal: 500 }],
      apropriacoes: [{ fazendaId: 12, valor: 500 }],
    });
    expect(ok).toEqual({ ok: true });
    expect(validarConsistenciaTituloManutencaoEmitido({
      osId: 20,
      valorCobradoOficina: 500,
      prestadorPessoaId: 7,
      fazendaId: 12,
      titulo: {
        tipo: "pagar",
        estado: "ativo",
        pessoaId: 7,
        fazendaOrigemId: 12,
        origemTipo: "manutencao",
        origemId: 20,
        origemItemChave: "oficina",
        valorOriginal: 600,
      },
      parcelas: [{ valorOriginal: 600 }],
      apropriacoes: [{ fazendaId: 12, valor: 600 }],
    }).ok).toBe(false);
  });
});
