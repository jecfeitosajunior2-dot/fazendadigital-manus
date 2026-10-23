import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSG_FIN_PARCELAS_SOMA } from "@shared/financeiroNucleo";
import {
  MSG_VENDA_VENCIMENTO_ANTES_DA_VENDA,
} from "@shared/vendaFinanceiro";
import { toCentavos } from "@shared/financeiroMoeda";
import {
  MSG_VENDA_CONDICAO_PREPARACAO,
  MSG_VENDA_DEFINIR_DEPOIS_ORIENTACAO,
  alinharCondicaoNovaVendaAoTotal,
  aplicarCondicaoNovaVenda,
  aplicarQuantidadeParcelasNovaVenda,
  atualizarLinhaParcelaNovaVenda,
  formatarCentavosNovaVenda,
  lerRascunhoCondicaoNovaVenda,
  mensagemDiferencaParcelasNovaVenda,
  preservarRascunhoComercialNovaVenda,
  rascunhoInicialCondicaoNovaVenda,
  resumoParcelasNovaVenda,
  totalOficialNovaVenda,
  validarRascunhoCondicaoNovaVenda,
} from "./novaVendaCondicao";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NovaVendaPage.tsx"), "utf8");

const itens = [
  { animalId: 11, pesoVenda: 300, precoUnitario: 20 },
  { animalId: 12, pesoVenda: 250, precoUnitario: 20 },
];

function comercial() {
  return {
    fazendaId: "7",
    data: "2026-10-21",
    compradorId: "4",
    forma: "kg",
    precoPadrao: "20,00",
    rendimento: "",
    observacoes: "Lote de desmama",
    itens: [{ animalId: 11, brinco: "101" }],
  };
}

function intencao(rascunho = rascunhoInicialCondicaoNovaVenda()) {
  return {
    fazendaId: 7,
    data: "2026-10-21",
    compradorId: 4,
    formaPrecificacao: "kg",
    itens,
    rascunho,
  };
}

describe("Nova Venda — condições de recebimento", () => {
  it("alterna entre as quatro condições sem apagar o rascunho comercial", () => {
    const total = 11000;
    let rascunho = rascunhoInicialCondicaoNovaVenda();
    rascunho = aplicarCondicaoNovaVenda(rascunho, "a_prazo", { dataVenda: "2026-10-21", valorTotal: total });
    rascunho = atualizarLinhaParcelaNovaVenda(rascunho, 1, "vencimento", "2026-11-21");
    rascunho = aplicarCondicaoNovaVenda(rascunho, "parcelado", { dataVenda: "2026-10-21", valorTotal: total });
    rascunho = aplicarCondicaoNovaVenda(rascunho, "definir_depois", { dataVenda: "2026-10-21", valorTotal: total });
    rascunho = aplicarCondicaoNovaVenda(rascunho, "a_vista", { dataVenda: "2026-10-21", valorTotal: total });
    const salvo = preservarRascunhoComercialNovaVenda(comercial(), rascunho);
    expect(salvo.fazendaId).toBe("7");
    expect(salvo.compradorId).toBe("4");
    expect(salvo.itens).toHaveLength(1);
    expect(salvo.observacoes).toBe("Lote de desmama");
    expect(rascunho.condicao).toBe("a_vista");
    expect(rascunho.linhas).toEqual([{ numero: 1, vencimento: "2026-10-21", valor: "11000,00" }]);
  });

  it("à vista usa o total oficial, uma parcela e o vencimento na data da venda", () => {
    const total = totalOficialNovaVenda({ formaPrecificacao: "kg", itens });
    expect(total.ok).toBe(true);
    if (!total.ok) return;
    const rascunho = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_vista", {
      dataVenda: "2026-10-21",
      valorTotal: total.valorTotal,
    });
    const validado = validarRascunhoCondicaoNovaVenda(intencao(rascunho));
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    expect(validado.parcelas).toEqual([{ numero: 1, vencimento: "2026-10-21", valorOriginal: 11000 }]);
    expect(validado.valorTotalCentavos).toBe(total.valorTotalCentavos);
  });

  it("a prazo exige vencimento na data da venda ou depois, no valor total", () => {
    const base = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_prazo", {
      dataVenda: "2026-10-21",
      valorTotal: 11000,
    });
    const atrasado = atualizarLinhaParcelaNovaVenda(base, 1, "vencimento", "2026-10-20");
    const ok = atualizarLinhaParcelaNovaVenda(base, 1, "vencimento", "2026-11-21");
    expect(validarRascunhoCondicaoNovaVenda(intencao(atrasado))).toEqual({
      ok: false,
      message: MSG_VENDA_VENCIMENTO_ANTES_DA_VENDA,
    });
    const validado = validarRascunhoCondicaoNovaVenda(intencao(ok));
    expect(validado.ok).toBe(true);
    expect(validarRascunhoCondicaoNovaVenda(intencao(base)).ok).toBe(false);
  });

  it("parcelado reparte o total oficial, exige duas parcelas e recusa diferença de um centavo", () => {
    const rascunho = aplicarQuantidadeParcelasNovaVenda(
      aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "parcelado", {
        dataVenda: "2026-10-21",
        valorTotal: 11000,
      }),
      2,
      11000,
    );
    expect(rascunho.linhas.map(l => l.valor)).toEqual(["5500,00", "5500,00"]);
    const comDatas = rascunho.linhas.reduce(
      (acc, linha, i) => atualizarLinhaParcelaNovaVenda(acc, linha.numero, "vencimento", i === 0 ? "2026-11-21" : "2026-12-21"),
      rascunho,
    );
    expect(validarRascunhoCondicaoNovaVenda(intencao(comDatas)).ok).toBe(true);

    const umCentavo = aplicarQuantidadeParcelasNovaVenda(comDatas, 2, 100.01);
    expect(umCentavo.linhas.map(l => l.valor)).toEqual(["50,00", "50,01"]);
    const resumo = resumoParcelasNovaVenda(100.01, umCentavo.linhas);
    expect(resumo.somaBate).toBe(true);
    expect(resumo.restanteCentavos).toBe(0);

    const divergente = atualizarLinhaParcelaNovaVenda(comDatas, 2, "valor", "5499,99");
    const diff = resumoParcelasNovaVenda(11000, divergente.linhas);
    expect(diff.restanteCentavos).toBe(1);
    expect(mensagemDiferencaParcelasNovaVenda(diff.restanteCentavos)).toBe(MSG_FIN_PARCELAS_SOMA);
    expect(validarRascunhoCondicaoNovaVenda(intencao(divergente))).toEqual({
      ok: false,
      message: MSG_FIN_PARCELAS_SOMA,
    });
  });

  it("definir depois não exige vencimento nem parcela", () => {
    const rascunho = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "definir_depois", {
      dataVenda: "2026-10-21",
      valorTotal: 11000,
    });
    expect(rascunho.linhas).toEqual([]);
    const validado = validarRascunhoCondicaoNovaVenda(intencao(rascunho));
    expect(validado.ok).toBe(true);
    if (validado.ok) {
      expect(validado.condicaoStatusTitulo).toBe("a_definir");
      expect(validado.parcelas).toEqual([]);
    }
    expect(MSG_VENDA_DEFINIR_DEPOIS_ORIENTACAO).toContain("Contas a Receber");
  });

  it("arredonda o parcelamento em centavos inteiros e recusa data inválida", () => {
    const tres = aplicarQuantidadeParcelasNovaVenda(rascunhoInicialCondicaoNovaVenda(), 3, 100);
    expect(tres.linhas.map(l => l.valor)).toEqual(["33,33", "33,33", "33,34"]);
    expect(toCentavos(33.33) + toCentavos(33.33) + toCentavos(33.34)).toBe(10000);
    const semData = atualizarLinhaParcelaNovaVenda(
      atualizarLinhaParcelaNovaVenda(
        atualizarLinhaParcelaNovaVenda(tres, 1, "vencimento", "2026-11-21"),
        2,
        "vencimento",
        "2026-13-40",
      ),
      3,
      "vencimento",
      "2026-12-21",
    );
    expect(validarRascunhoCondicaoNovaVenda(intencao(semData)).ok).toBe(false);
    expect(validarRascunhoCondicaoNovaVenda(intencao(
      aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "parcelado", {
        dataVenda: "2026-10-21",
        valorTotal: 11000,
      }),
    )).ok).toBe(false);
  });

  it("persiste e recupera a condição sem apagar dados comerciais antigos", () => {
    const condicao = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_prazo", {
      dataVenda: "2026-10-21",
      valorTotal: 11000,
    });
    const comVenc = atualizarLinhaParcelaNovaVenda(condicao, 1, "vencimento", "2026-12-01");
    const salvo = preservarRascunhoComercialNovaVenda(comercial(), comVenc);
    const json = JSON.stringify(salvo);
    const lido = JSON.parse(json) as typeof salvo;
    expect(lerRascunhoCondicaoNovaVenda(lido.condicaoRecebimento)).toEqual(comVenc);
    expect(lido.itens).toEqual(salvo.itens);
    expect(lido.precoPadrao).toBe("20,00");

    const antigo = comercial();
    expect(lerRascunhoCondicaoNovaVenda((antigo as { condicaoRecebimento?: unknown }).condicaoRecebimento)).toEqual(
      rascunhoInicialCondicaoNovaVenda(),
    );
  });

  it("realinha valores ao total oficial quando os animais mudam, preservando vencimentos do prazo", () => {
    const prazo = atualizarLinhaParcelaNovaVenda(
      aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_prazo", {
        dataVenda: "2026-10-21",
        valorTotal: 11000,
      }),
      1,
      "vencimento",
      "2026-11-21",
    );
    const alinhado = alinharCondicaoNovaVendaAoTotal(prazo, { dataVenda: "2026-10-22", valorTotal: 8000 });
    expect(alinhado.linhas[0]).toEqual({ numero: 1, vencimento: "2026-11-21", valor: "8000,00" });
  });

  it("formata diferença e orientação sem fingir que o título já existe", () => {
    expect(formatarCentavosNovaVenda(1).replace(/\s/g, " ")).toContain("0,01");
    expect(mensagemDiferencaParcelasNovaVenda(0)).toBeNull();
    expect(MSG_VENDA_CONDICAO_PREPARACAO).toContain("ainda não está ligada");
  });
});

describe("Nova Venda — isolamento da confirmação integrada", () => {
  it("mostra a seção financeira e continua confirmando só pela rota comercial", () => {
    expect(page).toContain("Condições de recebimento");
    expect(page).toContain("MSG_VENDA_CONDICAO_PREPARACAO");
    expect(page).toContain("trpc.vendas.confirmar");
    expect(page).not.toContain("confirmarVendaFinanceiro");
    expect(page).not.toContain("cancelarVendaFinanceiro");
    expect(page).not.toContain("criarTituloNoTx");
    const confirmar = page.slice(page.indexOf("const confirmar = async"), page.indexOf("const colSpan"));
    expect(confirmar).toContain("mutateAsync");
    expect(confirmar).not.toContain("condicao:");
    expect(confirmar).not.toContain("parcelas:");
    expect(confirmar).not.toContain("idempotencyKey");
    expect(confirmar).not.toContain("confirmarVendaFinanceiro");
    expect(page).toContain("condicaoRecebimento");
    expect(page).toContain("VENDA_DRAFT_KEY");
  });
});
