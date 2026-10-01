import { describe, it, expect } from "vitest";
import { quantidadeEstoqueParaKg } from "@shared/estoqueConversaoKg";
import {
  converterUnidade,
  unidadesCompativeis,
  normalizarUnidade,
  calcularQuantidadeEstoquePorDose,
  sugerirUnidadeDoseSanitaria,
  mensagemErroConversaoDoseSanitaria,
  validarUnidadeDoseSanitariaParaProduto,
  listarUnidadesDoseSanitariaUiParaProduto,
  produtoEstoqueContagemSemEmbalagem,
  quantidadeNaUnidadeBase,
  EMBALAGEM_UNIDADE_PREFIX,
} from "./produto-types";

describe("converterUnidade — lançamento → unidade base", () => {
  it("1000 ml em produto base Litro = 1 L (bug reportado)", () => {
    expect(converterUnidade(1000, "ml", "L")).toBe(1);
  });

  it("1 L em produto base ml = 1000 ml", () => {
    expect(converterUnidade(1, "L", "ml")).toBe(1000);
  });

  it("2000 g em produto base kg = 2 kg", () => {
    expect(converterUnidade(2000, "g", "kg")).toBe(2);
  });

  it("1.5 kg em produto base g = 1500 g", () => {
    expect(converterUnidade(1.5, "kg", "g")).toBe(1500);
  });

  it("mesma unidade não converte", () => {
    expect(converterUnidade(50, "ml", "ml")).toBe(50);
    expect(converterUnidade(7, "un", "un")).toBe(7);
  });

  it("aceita nomes legados (Litro/Mililitro) normalizando", () => {
    expect(converterUnidade(1000, "Mililitro", "Litro")).toBe(1);
  });

  it("unidade ausente assume mesma (sem conversão)", () => {
    expect(converterUnidade(10, "", "kg")).toBe(10);
    expect(converterUnidade(10, "kg", "")).toBe(10);
  });

  it("famílias incompatíveis retornam null", () => {
    expect(converterUnidade(10, "ml", "kg")).toBeNull();
    expect(converterUnidade(10, "un", "L")).toBeNull();
    expect(converterUnidade(10, "sc", "fr")).toBeNull();
  });
});

describe("unidadesCompativeis", () => {
  it("volume é compatível entre si", () => {
    expect(unidadesCompativeis("ml", "L")).toBe(true);
  });

  it("massa é compatível entre si", () => {
    expect(unidadesCompativeis("g", "kg")).toBe(true);
  });

  it("volume e massa são incompatíveis", () => {
    expect(unidadesCompativeis("ml", "kg")).toBe(false);
  });

  it("unidades de contagem distintas são incompatíveis", () => {
    expect(unidadesCompativeis("un", "sc")).toBe(false);
  });

  it("mesma unidade sempre compatível", () => {
    expect(unidadesCompativeis("dose", "dose")).toBe(true);
  });
});

describe("estoque: cálculo após conversão (regressão do bug ml→L)", () => {
  it("entrada de 1000 ml soma 1 L ao estoque base em Litro", () => {
    const estoqueAtual = 5; // litros
    const lancado = 1000; // ml
    const convertido = converterUnidade(lancado, "ml", normalizarUnidade("Litro"))!;
    const novo = estoqueAtual + convertido;
    expect(novo).toBe(6);
  });

  it("saída de 500 ml subtrai 0,5 L do estoque base em Litro", () => {
    const estoqueAtual = 2; // litros
    const lancado = 500; // ml
    const convertido = converterUnidade(lancado, "ml", "L")!;
    const novo = estoqueAtual - convertido;
    expect(novo).toBe(1.5);
  });
});

describe("sugerirUnidadeDoseSanitaria", () => {
  it("estoque em volume/massa sugere a mesma unidade no dropdown", () => {
    expect(sugerirUnidadeDoseSanitaria({ unidadeEstoque: "ml" })).toBe("mL");
    expect(sugerirUnidadeDoseSanitaria({ unidadeEstoque: "L" })).toBe("L");
    expect(sugerirUnidadeDoseSanitaria({ unidadeEstoque: "kg" })).toBe("kg");
    expect(sugerirUnidadeDoseSanitaria({ unidadeEstoque: "dose" })).toBe("dose");
  });

  it("estoque em unidade com embalagem volume sugere unidade da embalagem", () => {
    const emb = JSON.stringify([{ nome: "Frasco 500ml", volume: 500, unidade: "ml" }]);
    expect(
      sugerirUnidadeDoseSanitaria({ unidadeEstoque: "un", embalagensRaw: emb }),
    ).toBe("mL");
  });

  it("estoque em contagem sem embalagem sugere a unidade de contagem", () => {
    expect(sugerirUnidadeDoseSanitaria({ unidadeEstoque: "un" })).toBe("un");
    expect(sugerirUnidadeDoseSanitaria({ unidadeEstoque: "fr" })).toBe("fr");
  });
});

describe("listarUnidadesDoseSanitariaUiParaProduto", () => {
  it("sempre inclui volume, massa, UI, dose e contagem", () => {
    const opcoes = listarUnidadesDoseSanitariaUiParaProduto({ unidadeEstoque: "ml" });
    expect(opcoes).toContain("mL");
    expect(opcoes).toContain("un");
    expect(opcoes).toContain("fr");
    expect(opcoes).toContain("sc");
  });
});

describe("produtoEstoqueContagemSemEmbalagem", () => {
  it("detecta un sem embalagem", () => {
    expect(
      produtoEstoqueContagemSemEmbalagem({ unidadeEstoque: "un" }),
    ).toBe(true);
  });

  it("false quando há embalagem com volume", () => {
    const emb = JSON.stringify([{ nome: "Frasco 500ml", volume: 500, unidade: "ml" }]);
    expect(
      produtoEstoqueContagemSemEmbalagem({ unidadeEstoque: "un", embalagensRaw: emb }),
    ).toBe(false);
  });
});

describe("calcularQuantidadeEstoquePorDose — unidade alinhada ao estoque", () => {
  it("bloqueia L quando estoque é mL (mesmo convertendo)", () => {
    const r = calcularQuantidadeEstoquePorDose({
      doseValor: 2,
      doseUnidade: "L",
      unidadeEstoque: "ml",
    });
    expect(r).toHaveProperty("erro");
    if ("erro" in r) {
      expect(r.erro).toContain("mL");
      expect(r.erro).not.toContain("equivalente");
    }
  });

  it("aceita mL quando estoque é mL", () => {
    expect(
      calcularQuantidadeEstoquePorDose({
        doseValor: 5,
        doseUnidade: "mL",
        unidadeEstoque: "ml",
      }),
    ).toEqual({ quantidade: 5 });
  });

  it("aceita un quando estoque é un (frasco inteiro)", () => {
    expect(
      calcularQuantidadeEstoquePorDose({
        doseValor: 1,
        doseUnidade: "un",
        unidadeEstoque: "un",
      }),
    ).toEqual({ quantidade: 1 });
  });
});

describe("validarUnidadeDoseSanitariaParaProduto", () => {
  it("retorna null quando dose usa unidade sugerida", () => {
    expect(
      validarUnidadeDoseSanitariaParaProduto({
        doseUnidade: "mL",
        unidadeEstoque: "ml",
      }),
    ).toBeNull();
  });

  it("retorna erro quando dose usa L e estoque mL", () => {
    const msg = validarUnidadeDoseSanitariaParaProduto({
      doseValor: 2,
      doseUnidade: "L",
      unidadeEstoque: "ml",
    });
    expect(msg).toContain("Use mL");
  });
});

describe("mensagemErroConversaoDoseSanitaria", () => {
  const emb500ml = JSON.stringify([{ nome: "Frasco 500ml", volume: 500, unidade: "ml" }]);

  it("típico 2: estoque un + embalagem + dose incompatível", () => {
    const msg = mensagemErroConversaoDoseSanitaria({
      doseValor: 3,
      doseUnidade: "L",
      unidadeEstoque: "un",
      embalagensRaw: emb500ml,
    });
    expect(msg).toContain("Unidade incompatível");
    expect(msg).toContain("embalagem de 500 mL");
    expect(msg).toContain("Troque a dose para mL");
    expect(msg).toContain("não 3 L");
  });

  it("estoque un sem embalagem orienta usar un ou cadastrar embalagem", () => {
    const msg = mensagemErroConversaoDoseSanitaria({
      doseUnidade: "L",
      unidadeEstoque: "un",
    });
    expect(msg).toContain("não combina com estoque em un");
    expect(msg).toContain("Use un na dose");
    expect(msg).toContain("Insumos → Farmácia");
  });

  it("estoque em kg orienta mesma unidade do estoque", () => {
    const msg = mensagemErroConversaoDoseSanitaria({
      doseUnidade: "mL",
      unidadeEstoque: "kg",
    });
    expect(msg).toContain("não combina com estoque em kg");
    expect(msg).toContain("Use kg");
    expect(msg).toContain("mesma unidade do estoque");
  });
});

describe("quantidadeNaUnidadeBase — movimentação comercial vs massa física", () => {
  const saco30Real = [{
    nome: "Saco (sc) de 30 Quilograma (kg)",
    volume: 30,
    unidade: "kg",
  }];
  const saco25 = [{ nome: "Saco 25 kg", volume: 25, unidade: "kg" }];
  const saco30Kg = [{ nome: "Saco 30 kg", volume: 30, unidade: "kg" }];
  const galao20 = [{ nome: "Galão 20 L", volume: 20, unidade: "L" }];
  const frasco500 = [{ nome: "Frasco 500 ml", volume: 500, unidade: "ml" }];

  function emb(nome: string) {
    return `${EMBALAGEM_UNIDADE_PREFIX}${nome}`;
  }

  it("A: base sc + Saco 30 kg, 50 embalagens = +50 sc (não 1.500 sc)", () => {
    const qtd = quantidadeNaUnidadeBase(50, emb("Saco (sc) de 30 Quilograma (kg)"), {
      unidade: "sc",
      embalagens: saco30Real,
    });
    expect(qtd).toBe(50);
    expect(qtd).not.toBe(1500);
  });

  it("B: base sc + Saco 25 kg, 50 embalagens = +50 sc", () => {
    expect(quantidadeNaUnidadeBase(50, emb("Saco 25 kg"), {
      unidade: "sc",
      embalagens: saco25,
    })).toBe(50);
  });

  it("C: base kg + Saco 30 kg, 50 embalagens = +1.500 kg", () => {
    expect(quantidadeNaUnidadeBase(50, emb("Saco 30 kg"), {
      unidade: "kg",
      embalagens: saco30Kg,
    })).toBe(1500);
  });

  it("D: base L + Galão 20 L, 10 embalagens = +200 L", () => {
    expect(quantidadeNaUnidadeBase(10, emb("Galão 20 L"), {
      unidade: "L",
      embalagens: galao20,
    })).toBe(200);
  });

  it("E: base ml + Frasco 500 ml, 10 embalagens = +5.000 ml", () => {
    expect(quantidadeNaUnidadeBase(10, emb("Frasco 500 ml"), {
      unidade: "ml",
      embalagens: frasco500,
    })).toBe(5000);
  });

  it("F: 50 sacos × R$ 119,37 = R$ 5.968,50 e custo oficial R$ 119,37/sc", () => {
    const qtdBase = quantidadeNaUnidadeBase(50, emb("Saco (sc) de 30 Quilograma (kg)"), {
      unidade: "sc",
      embalagens: saco30Real,
    });
    expect(qtdBase).toBe(50);
    const valorTotal = 50 * 119.37;
    expect(valorTotal).toBeCloseTo(5968.5, 2);
    expect(valorTotal / qtdBase!).toBeCloseTo(119.37, 2);
  });

  it("G: Nutrição deriva 50 sc × 30 kg/sc = 1.500 kg sem mudar o saldo", () => {
    const qtdBase = quantidadeNaUnidadeBase(50, emb("Saco (sc) de 30 Quilograma (kg)"), {
      unidade: "sc",
      embalagens: saco30Real,
    });
    expect(qtdBase).toBe(50);
    expect(quantidadeEstoqueParaKg(qtdBase!, "sc", saco30Real)).toBe(1500);
  });

  it("não converte embalagem de volume para base sc", () => {
    expect(quantidadeNaUnidadeBase(10, emb("Galão 20 L"), {
      unidade: "sc",
      embalagens: galao20,
    })).toBeNull();
  });
});
