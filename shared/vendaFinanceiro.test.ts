import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toCentavos } from "./financeiroMoeda";
import { MSG_FIN_PARCELAS_SOMA, MSG_FIN_VALOR_POSITIVO } from "./financeiroNucleo";
import { calcularValorItem } from "./vendaComercial";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  MSG_VENDA_CONDICAO_A_PRAZO,
  MSG_VENDA_CONDICAO_A_VISTA,
  MSG_VENDA_CONDICAO_DEFINIR_DEPOIS,
  MSG_VENDA_CONDICAO_PARCELADO,
  MSG_VENDA_PARCELA_NUMERO_DUPLICADO,
  MSG_VENDA_VENCIMENTO_ANTES_DA_VENDA,
  MSG_VENDA_VENCIMENTO_INVALIDO,
  assinaturaIntencaoConfirmacaoVenda,
  MSG_VENDA_CONFIRMACAO_INTEGRIDADE_TITULO,
  MSG_VENDA_CONFIRMACAO_JA_CANCELADA,
  MSG_VENDA_IDEMPOTENCY,
  origemFinanceiraVendaAnimais,
  vendaConfirmacaoEstaCancelada,
  observacaoCondicaoTituloVenda,
  lerCondicaoTituloVenda,
  retryConfirmacaoVendaBateComPedido,
  validarChaveIdempotenciaVenda,
  validarCondicaoRecebimentoVenda,
  type IntencaoConfirmacaoVendaFinanceiro,
} from "./vendaFinanceiro";

const raiz = dirname(fileURLToPath(import.meta.url));

function intencao(
  extra: Partial<IntencaoConfirmacaoVendaFinanceiro> = {},
): IntencaoConfirmacaoVendaFinanceiro {
  return {
    fazendaId: 7,
    data: "2026-10-21",
    compradorId: 4,
    formaPrecificacao: "kg",
    precoPadrao: 20,
    observacoes: "Lote de desmama",
    itens: [
      { animalId: 11, pesoVenda: 300, precoUnitario: 20 },
      { animalId: 12, pesoVenda: 250, precoUnitario: 20 },
    ],
    condicao: "a_vista",
    ...extra,
  };
}

describe("vendaFinanceiro — origem", () => {
  it("usa as constantes oficiais do núcleo, sem duplicar o literal", () => {
    expect(FINANCEIRO_ORIGEM_VENDA_ANIMAIS).toBe("venda_animais");
    expect(FINANCEIRO_ORIGEM_ITEM_PRINCIPAL).toBe("principal");
    expect(vendaConfirmacaoEstaCancelada("cancelado")).toBe(true);
    expect(vendaConfirmacaoEstaCancelada("concluido")).toBe(false);
    expect(MSG_VENDA_CONFIRMACAO_JA_CANCELADA).toMatch(/já foi cancelada/);
    expect(MSG_VENDA_CONFIRMACAO_INTEGRIDADE_TITULO).toMatch(/inconsistente/);
    expect(origemFinanceiraVendaAnimais(88)).toEqual({
      ok: true,
      origemTipo: "venda_animais",
      origemId: 88,
      origemItemChave: "principal",
    });
  });
});

describe("vendaFinanceiro — condições", () => {
  it("à vista válida gera uma parcela no total e vence na data da venda", () => {
    const r = validarCondicaoRecebimentoVenda(intencao());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.condicaoStatusTitulo).toBe("definida");
    expect(r.valorTotal).toBe(11000);
    expect(r.valorTotalCentavos).toBe(1_100_000);
    expect(r.parcelas).toEqual([{ numero: 1, vencimento: "2026-10-21", valorOriginal: 11000 }]);
    expect(r.itens).toHaveLength(2);
  });

  it("a prazo válido aceita vencimento na data da venda ou depois", () => {
    const naData = validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-10-21", valorOriginal: 11000 }],
    }));
    const depois = validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 11000 }],
    }));
    expect(naData.ok).toBe(true);
    expect(depois.ok).toBe(true);
    if (depois.ok) expect(depois.parcelas[0]!.vencimento).toBe("2026-11-21");
  });

  it("a prazo anterior à venda é recusado", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-10-20", valorOriginal: 11000 }],
    }));
    expect(r).toEqual({ ok: false, message: MSG_VENDA_VENCIMENTO_ANTES_DA_VENDA });
  });

  it("parcelamento válido fecha a soma em centavos", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "parcelado",
      parcelas: [
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6500 },
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 4500 },
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parcelas.map(p => p.numero)).toEqual([1, 2]);
    expect(r.parcelas.reduce((s, p) => s + toCentavos(p.valorOriginal), 0)).toBe(r.valorTotalCentavos);
  });

  it("soma de parcelas divergente é recusada", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5000 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 5000 },
      ],
    }));
    expect(r).toEqual({ ok: false, message: MSG_FIN_PARCELAS_SOMA });
  });

  it("diferença de um centavo na soma é recusada", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5500 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 5499.99 },
      ],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_FIN_PARCELAS_SOMA);
  });

  it("parcelas duplicadas são recusadas", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 5500 },
        { numero: 1, vencimento: "2026-12-21", valorOriginal: 5500 },
      ],
    }));
    expect(r).toEqual({ ok: false, message: MSG_VENDA_PARCELA_NUMERO_DUPLICADO });
  });

  it("vencimento inválido é recusado", () => {
    expect(validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "21/10/2026", valorOriginal: 11000 }],
    }))).toEqual({ ok: false, message: MSG_VENDA_VENCIMENTO_INVALIDO });
    expect(validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-02-31", valorOriginal: 11000 }],
    }))).toEqual({ ok: false, message: MSG_VENDA_VENCIMENTO_INVALIDO });
  });

  it("definir depois não leva parcela", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({ condicao: "definir_depois", parcelas: undefined }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.condicaoStatusTitulo).toBe("a_definir");
    expect(r.parcelas).toEqual([]);
  });

  it("definir depois com parcelas indevidas é recusado", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "definir_depois",
      parcelas: [{ numero: 1, vencimento: "2026-10-21", valorOriginal: 11000 }],
    }));
    expect(r).toEqual({ ok: false, message: MSG_VENDA_CONDICAO_DEFINIR_DEPOIS });
  });

  it("à vista com vencimento diferente da venda é recusada", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 11000 }],
    }));
    expect(r).toEqual({ ok: false, message: MSG_VENDA_CONDICAO_A_VISTA });
  });

  it("a prazo sem parcela e parcelado com uma parcela são recusados", () => {
    expect(validarCondicaoRecebimentoVenda(intencao({ condicao: "a_prazo" }))).toEqual({
      ok: false,
      message: MSG_VENDA_CONDICAO_A_PRAZO,
    });
    expect(validarCondicaoRecebimentoVenda(intencao({
      condicao: "parcelado",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 11000 }],
    }))).toEqual({ ok: false, message: MSG_VENDA_CONDICAO_PARCELADO });
  });
});

describe("vendaFinanceiro — valores", () => {
  it("rejeita valores negativos e não finitos", () => {
    expect(validarCondicaoRecebimentoVenda(intencao({
      itens: [{ animalId: 11, pesoVenda: 300, precoUnitario: -20 }],
    })).ok).toBe(false);
    expect(validarCondicaoRecebimentoVenda(intencao({
      itens: [{ animalId: 11, pesoVenda: 300, precoUnitario: Number.NaN }],
    }))).toMatchObject({ ok: false, message: MSG_FIN_VALOR_POSITIVO });
    expect(validarCondicaoRecebimentoVenda(intencao({
      itens: [{ animalId: 11, pesoVenda: 300, precoUnitario: Number.POSITIVE_INFINITY }],
    })).ok).toBe(false);
    expect(validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: -11000 }],
    }))).toMatchObject({ ok: false, message: MSG_FIN_VALOR_POSITIVO });
  });

  it("normaliza monetariamente 10 e 10,00 e preserva o valor oficial do item", () => {
    const a = validarCondicaoRecebimentoVenda(intencao({
      precoPadrao: 10,
      itens: [{ animalId: 3, pesoVenda: 10.1, precoUnitario: 10 }],
    }));
    const b = validarCondicaoRecebimentoVenda(intencao({
      precoPadrao: 10.00,
      itens: [{ animalId: 3, pesoVenda: "10,10" as unknown as number, precoUnitario: 10 }],
    }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const comercial = calcularValorItem({ forma: "kg", pesoVenda: 10.1, precoUnitario: 10 });
    expect(comercial.ok).toBe(true);
    if (comercial.ok) expect(a.itens[0]!.valorItem).toBe(comercial.valor);
    expect(a.valorTotalCentavos).toBe(b.valorTotalCentavos);
    expect(assinaturaIntencaoConfirmacaoVenda(intencao({
      precoPadrao: 20,
      observacoes: "  Lote de desmama  ",
      itens: [
        { animalId: 12, pesoVenda: 250, precoUnitario: "20.00" as unknown as number },
        { animalId: 11, pesoVenda: 300, precoUnitario: 20 },
      ],
    }))).toBe(assinaturaIntencaoConfirmacaoVenda(intencao()));
  });

  it("não aceita total independente: o total sai dos itens comerciais", () => {
    const r = validarCondicaoRecebimentoVenda(intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 999999 }],
    }));
    expect(r.ok).toBe(false);
  });
});

describe("vendaFinanceiro — assinatura e retry", () => {
  it("retry com payload idêntico aceita ordem diferente de animais e parcelas", () => {
    const original = intencao({
      condicao: "parcelado",
      parcelas: [
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 4500 },
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6500 },
      ],
    });
    const reordenado = intencao({
      condicao: "parcelado",
      itens: [
        { animalId: 12, pesoVenda: 250, precoUnitario: 20 },
        { animalId: 11, pesoVenda: 300, precoUnitario: 20 },
      ],
      parcelas: [
        { numero: 2, vencimento: "2026-12-21", valorOriginal: 6500 },
        { numero: 1, vencimento: "2026-11-21", valorOriginal: 4500 },
      ],
    });
    expect(retryConfirmacaoVendaBateComPedido(original, reordenado)).toBe(true);
  });

  it("retry com comprador, animal, preço, condição ou vencimento diferente conflita", () => {
    const base = intencao({
      condicao: "a_prazo",
      parcelas: [{ numero: 1, vencimento: "2026-11-21", valorOriginal: 11000 }],
    });
    expect(retryConfirmacaoVendaBateComPedido(base, { ...base, compradorId: 9 })).toBe(false);
    expect(retryConfirmacaoVendaBateComPedido(base, {
      ...base,
      itens: [{ animalId: 99, pesoVenda: 300, precoUnitario: 20 }, base.itens[1]!],
    })).toBe(false);
    expect(retryConfirmacaoVendaBateComPedido(base, {
      ...base,
      itens: [{ ...base.itens[0]!, precoUnitario: 21 }, base.itens[1]!],
    })).toBe(false);
    expect(retryConfirmacaoVendaBateComPedido(base, intencao({ condicao: "definir_depois" }))).toBe(false);
    expect(retryConfirmacaoVendaBateComPedido(base, {
      ...base,
      parcelas: [{ numero: 1, vencimento: "2026-12-21", valorOriginal: 11000 }],
    })).toBe(false);
  });
});

describe("chave ven- da confirmação", () => {
  it("aceita ven- com 8 a 80 caracteres e recusa o restante", () => {
    expect(validarChaveIdempotenciaVenda("ven-ok01")).toEqual({ ok: true, key: "ven-ok01" });
    expect(validarChaveIdempotenciaVenda("curta")).toEqual({ ok: false, message: MSG_VENDA_IDEMPOTENCY });
    expect(validarChaveIdempotenciaVenda("compra-teste-aaaa")).toEqual({
      ok: false,
      message: MSG_VENDA_IDEMPOTENCY,
    });
  });

  it("grava e lê a condição no título sem misturar com a observação comercial", () => {
    expect(observacaoCondicaoTituloVenda("a_vista")).toBe("condicaoRecebimento=a_vista");
    expect(lerCondicaoTituloVenda("condicaoRecebimento=parcelado")).toBe("parcelado");
    expect(lerCondicaoTituloVenda("Lote de desmama")).toBeNull();
  });
});

describe("vendaFinanceiro — isolamento do fluxo comercial atual", () => {
  it("não altera confirmação, cancelamento nem o contrato tRPC vigente", () => {
    const confirmar = readFileSync(join(raiz, "../server/confirmarVenda.ts"), "utf8");
    const cancelar = readFileSync(join(raiz, "../server/cancelarVenda.ts"), "utf8");
    const router = readFileSync(join(raiz, "../server/routers.ts"), "utf8");
    const novaVenda = readFileSync(join(raiz, "../client/src/pages/NovaVendaPage.tsx"), "utf8");
    const confirmarTrpc = router.slice(
      router.indexOf("confirmar: protectedProcedure"),
      router.indexOf("cancelar: protectedProcedure"),
    );
    expect(confirmar).not.toContain("vendaFinanceiro");
    expect(confirmar).not.toContain("venda_animais");
    expect(confirmar).not.toContain("criarTituloNoTx");
    expect(confirmar).not.toContain("idempotencyKey");
    expect(cancelar).not.toContain("vendaFinanceiro");
    expect(cancelar).not.toContain("cancelarTituloNoTx");
    expect(confirmarTrpc).not.toContain("vendaFinanceiro");
    expect(confirmarTrpc).not.toContain("idempotencyKey");
    expect(confirmarTrpc).not.toContain("condicao");
    expect(router).toContain("confirmarVendaIntegradaSeAtiva");
    expect(router).toContain("createCancelarVendaFinanceiroService");
    expect(novaVenda).not.toContain("confirmarVendaFinanceiro");
  });
});
