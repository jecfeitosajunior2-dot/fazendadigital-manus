import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calcularCustoEstimadoDieta,
  custoMedioAtualLinhaDieta,
  custoMedioVigentePorKg,
  formatarCustoEstimadoDieta,
  formatarCustoEstimadoPorKgDieta,
  formulacaoDietaFechadaNaBase,
  podeApresentarCustoEstimadoPorKgDieta,
  MSG_DIETA_DATAS,
  MSG_DIETA_DUPLICADO,
  MSG_DIETA_PRODUTO_FAZENDA,
  MSG_DIETA_QTD,
  MSG_DIETA_TOTAL,
  parseQuantidadeDieta,
  rotuloCustoMedioAtualLinhaDieta,
  rotuloEquivalenciaEmbalagemMassa,
  unidadeCompativelFormulacaoKg,
  validarDietaInput,
  type NutricaoDietaInput,
  type NutricaoDietaProdutoRef,
} from "./nutricaoDietas";
import { MSG_CONVERSAO_KG_AMBIGUA, MSG_CONVERSAO_KG_INDISPONIVEL } from "./estoqueConversaoKg";

function inputBase(over: Partial<NutricaoDietaInput> = {}): NutricaoDietaInput {
  return {
    fazendaId: 1,
    nome: "Mineral 90",
    tipo: "mineral",
    baseQuantidade: 1000,
    ingredientes: [
      { produtoId: 10, quantidade: 600 },
      { produtoId: 11, quantidade: 250 },
      { produtoId: 12, quantidade: 150 },
    ],
    ...over,
  };
}

function produtos(): Map<number, NutricaoDietaProdutoRef> {
  return new Map([
    [10, { produtoId: 10, unidade: "kg", valorUnitario: "1.20", vinculadoFazenda: true }],
    [11, { produtoId: 11, unidade: "kg", valorUnitario: "2.10", vinculadoFazenda: true }],
    [12, { produtoId: 12, unidade: "kg", valorUnitario: "4.00", vinculadoFazenda: true }],
    [13, { produtoId: 13, unidade: "sc", valorUnitario: "80", vinculadoFazenda: true }],
    [16, { produtoId: 16, unidade: "sc", valorUnitario: "90", vinculadoFazenda: true, embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }] }],
    [17, {
      produtoId: 17,
      unidade: "sc",
      valorUnitario: "90",
      vinculadoFazenda: true,
      embalagens: [
        { nome: "Saco 25 kg", volume: 25, unidade: "kg" },
        { nome: "Saco 30 kg", volume: 30, unidade: "kg" },
      ],
    }],
    [14, { produtoId: 14, unidade: "kg", valorUnitario: "1.00", vinculadoFazenda: false }],
    [15, { produtoId: 15, unidade: "kg", valorUnitario: null, vinculadoFazenda: true }],
  ]);
}

describe("validarDietaInput", () => {
  it("aceita dieta válida cuja soma fecha a base", () => {
    expect(validarDietaInput(inputBase(), produtos())).toEqual({ ok: true });
  });

  it("bloqueia produto não vinculado à fazenda", () => {
    const out = validarDietaInput(
      inputBase({ ingredientes: [{ produtoId: 14, quantidade: 1000 }] }),
      produtos(),
    );
    expect(out).toMatchObject({ ok: false, message: MSG_DIETA_PRODUTO_FAZENDA });
  });

  it("bloqueia ingrediente duplicado", () => {
    const out = validarDietaInput(
      inputBase({
        ingredientes: [
          { produtoId: 10, quantidade: 500 },
          { produtoId: 10, quantidade: 500 },
        ],
      }),
      produtos(),
    );
    expect(out).toMatchObject({ ok: false, message: MSG_DIETA_DUPLICADO });
  });

  it("bloqueia quantidade zero ou negativa", () => {
    expect(
      validarDietaInput(inputBase({ ingredientes: [{ produtoId: 10, quantidade: 0 }] }), produtos()),
    ).toMatchObject({ ok: false, message: MSG_DIETA_QTD });
    expect(
      validarDietaInput(inputBase({ ingredientes: [{ produtoId: 10, quantidade: -1 }] }), produtos()),
    ).toMatchObject({ ok: false, message: MSG_DIETA_QTD });
  });

  it("bloqueia total diferente da base", () => {
    const out = validarDietaInput(
      inputBase({
        ingredientes: [
          { produtoId: 10, quantidade: 600 },
          { produtoId: 11, quantidade: 380 },
        ],
      }),
      produtos(),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain(MSG_DIETA_TOTAL);
  });

  it("bloqueia saco sem embalagem de massa", () => {
    const out = validarDietaInput(
      inputBase({ ingredientes: [{ produtoId: 13, quantidade: 1000 }] }),
      produtos(),
    );
    expect(out).toMatchObject({ ok: false, message: MSG_CONVERSAO_KG_INDISPONIVEL });
  });

  it("aceita saco com uma única embalagem de 30 kg", () => {
    expect(validarDietaInput(
      inputBase({ ingredientes: [{ produtoId: 16, quantidade: 1000 }] }),
      produtos(),
    )).toEqual({ ok: true });
  });

  it("bloqueia saco com duas embalagens de massa diferentes", () => {
    const out = validarDietaInput(
      inputBase({ ingredientes: [{ produtoId: 17, quantidade: 1000 }] }),
      produtos(),
    );
    expect(out).toMatchObject({ ok: false, message: MSG_CONVERSAO_KG_AMBIGUA });
  });

  it("bloqueia data final anterior à inicial", () => {
    const out = validarDietaInput(
      inputBase({ dataInicio: "2026-10-10", dataFim: "2026-10-01" }),
      produtos(),
    );
    expect(out).toMatchObject({ ok: false, message: MSG_DIETA_DATAS });
  });
});

describe("unidades da formulação", () => {
  it("aceita kg, g e saco com uma embalagem de massa; recusa o restante", () => {
    expect(unidadeCompativelFormulacaoKg("kg")).toBe(true);
    expect(unidadeCompativelFormulacaoKg("g")).toBe(true);
    expect(unidadeCompativelFormulacaoKg("sc")).toBe(false);
    expect(unidadeCompativelFormulacaoKg("sc", [{ nome: "Saco", volume: 30, unidade: "kg" }])).toBe(true);
    expect(unidadeCompativelFormulacaoKg("sc", [
      { nome: "Saco 25 kg", volume: 25, unidade: "kg" },
      { nome: "Saco 30 kg", volume: 30, unidade: "kg" },
    ])).toBe(false);
    expect(unidadeCompativelFormulacaoKg("L")).toBe(false);
    expect(unidadeCompativelFormulacaoKg("un")).toBe(false);
  });
});

describe("custo estimado vigente", () => {
  it("calcula custo por ingrediente, total e por kg", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [
        { produtoId: 10, quantidade: 600, unidade: "kg", valorUnitario: "1.20" },
        { produtoId: 11, quantidade: 250, unidade: "kg", valorUnitario: "2.10" },
        { produtoId: 12, quantidade: 150, unidade: "kg", valorUnitario: "4.00" },
      ],
    });
    expect(custo.completo).toBe(true);
    expect(custo.formulacaoFechada).toBe(true);
    expect(custo.custoTotal).toBe(1845);
    expect(custo.custoPorKg).toBe(1.85);
    expect(custo.ingredientes[0]?.percentual).toBe(60);
    expect(formatarCustoEstimadoPorKgDieta(custo)).toContain("1,85");
  });

  it("ingrediente sem custo não vira R$ 0 — marca incompleto", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [
        { produtoId: 10, quantidade: 600, unidade: "kg", valorUnitario: "1.20" },
        { produtoId: 15, quantidade: 400, unidade: "kg", valorUnitario: null },
      ],
    });
    expect(custo.completo).toBe(false);
    expect(custo.custoTotal).toBeNull();
    expect(custo.custoPorKg).toBeNull();
    expect(custo.ingredientes[1]).toMatchObject({
      custoConhecido: false,
      custoEstimado: null,
    });
    expect(formatarCustoEstimadoDieta(custo.custoPorKg, custo.completo)).toBe("Custo incompleto");
  });

  it("custo conhecido zero permanece R$ 0,00", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 100,
      ingredientes: [{ produtoId: 10, quantidade: 100, unidade: "kg", valorUnitario: "0" }],
    });
    expect(custo.completo).toBe(true);
    expect(custo.custoTotal).toBe(0);
    expect(formatarCustoEstimadoDieta(0, true)).toMatch(/R\$\s*0,00/);
  });

  it("1: produto em kg com custo conhecido", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ produtoId: 10, quantidade: 30, unidade: "kg", valorUnitario: "4.31" }],
    });
    expect(custo.completo).toBe(true);
    expect(custo.ingredientes[0]?.custoMedioPorKg).toBe(4.31);
    expect(custo.custoTotal).toBe(129.3);
    expect(rotuloEquivalenciaEmbalagemMassa("kg")).toBeNull();
  });

  it("2: produto em g converte custo para kg", () => {
    expect(custoMedioVigentePorKg("4.31", "g")).toBeCloseTo(4310, 5);
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1,
      ingredientes: [{ produtoId: 21, quantidade: 1, unidade: "g", valorUnitario: "0.00431" }],
    });
    expect(custo.ingredientes[0]?.custoMedioPorKg).toBe(4.31);
    expect(rotuloEquivalenciaEmbalagemMassa("g")).toBeNull();
  });

  it("3: saco 30 kg/sc com custo conhecido vira custo/kg", () => {
    const embalagens = [{ nome: "Saco", volume: 30, unidade: "kg" }];
    expect(custoMedioVigentePorKg("129.37", "sc", embalagens)).toBeCloseTo(4.312333, 5);
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{
        produtoId: 16,
        quantidade: 30,
        unidade: "sc",
        valorUnitario: "129.37",
        embalagens,
      }],
    });
    expect(custo.completo).toBe(true);
    expect(custo.ingredientes[0]?.custoMedioPorKg).toBeCloseTo(4.312333, 5);
    expect(custo.custoTotal).toBe(129.37);
    expect(custo.custoPorKg).toBe(4.31);
    expect(rotuloEquivalenciaEmbalagemMassa("sc", embalagens)).toBe("Equivalência: 1 sc = 30 kg");
  });

  it("4: saco 40 kg/sc usa o peso da embalagem, não 30", () => {
    const embalagens = [{ nome: "Saco", volume: 40, unidade: "kg" }];
    expect(custoMedioVigentePorKg("160", "sc", embalagens)).toBe(4);
    expect(rotuloEquivalenciaEmbalagemMassa("sc", embalagens)).toBe("Equivalência: 1 sc = 40 kg");
  });

  it("5: saco sem conversão configurada não converte em silêncio", () => {
    expect(custoMedioVigentePorKg("129.37", "sc")).toBeNull();
    expect(unidadeCompativelFormulacaoKg("sc")).toBe(false);
    expect(rotuloEquivalenciaEmbalagemMassa("sc")).toBeNull();
    const semEmbalagem = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ produtoId: 13, quantidade: 30, unidade: "sc", valorUnitario: "129.37" }],
    });
    expect(semEmbalagem.completo).toBe(false);
    expect(semEmbalagem.ingredientes[0]?.custoConhecido).toBe(false);
  });

  it("6: produto sem custo continua incompleto", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{
        produtoId: 16,
        quantidade: 30,
        unidade: "sc",
        valorUnitario: null,
        embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }],
      }],
    });
    expect(custo.completo).toBe(false);
    expect(custo.custoTotal).toBeNull();
    expect(formatarCustoEstimadoDieta(custo.custoTotal, custo.completo)).toBe("Custo incompleto");
  });

  it("7: litro não vira kg automaticamente", () => {
    expect(custoMedioVigentePorKg("10", "L")).toBeNull();
    expect(unidadeCompativelFormulacaoKg("L")).toBe(false);
    expect(rotuloEquivalenciaEmbalagemMassa("L")).toBeNull();
  });

  it("8: mudar a quantidade do ingrediente recalcula o estimado", () => {
    const embalagens = [{ nome: "Saco", volume: 30, unidade: "kg" }];
    const a = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ produtoId: 16, quantidade: 30, unidade: "sc", valorUnitario: "129.37", embalagens }],
    });
    const b = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ produtoId: 16, quantidade: 15, unidade: "sc", valorUnitario: "129.37", embalagens }],
    });
    expect(a.custoTotal).toBe(129.37);
    expect(a.custoPorKg).toBe(4.31);
    expect(b.custoTotal).toBe(64.69);
    expect(b.formulacaoFechada).toBe(false);
    expect(b.custoPorKg).toBeNull();
    expect(formatarCustoEstimadoPorKgDieta(b)).toBe("Custo incompleto");
  });

  it("9: total só fecha quando todos os custos necessários existem", () => {
    const embalagens = [{ nome: "Saco", volume: 30, unidade: "kg" }];
    const incompleto = calcularCustoEstimadoDieta({
      baseQuantidade: 60,
      ingredientes: [
        { produtoId: 16, quantidade: 30, unidade: "sc", valorUnitario: "129.37", embalagens },
        { produtoId: 15, quantidade: 30, unidade: "kg", valorUnitario: null },
      ],
    });
    expect(incompleto.completo).toBe(false);
    expect(incompleto.custoTotal).toBeNull();
  });

  it("10: prévia da nova dieta e detalhe usam o mesmo custo/kg quando recebem as embalagens", () => {
    const produto = {
      produtoId: 16,
      unidade: "sc" as const,
      valorUnitario: "129.37",
      embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }],
    };
    const semEmbalagem = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{
        produtoId: produto.produtoId,
        quantidade: 30,
        unidade: produto.unidade,
        valorUnitario: produto.valorUnitario,
      }],
    });
    const previa = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ ...produto, quantidade: 30 }],
    });
    const detalhe = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ ...produto, quantidade: 30 }],
    });
    expect(semEmbalagem.ingredientes[0]?.custoConhecido).toBe(false);
    expect(previa.ingredientes[0]?.custoMedioPorKg).toBe(detalhe.ingredientes[0]?.custoMedioPorKg);
    expect(previa.custoTotal).toBe(detalhe.custoTotal);
  });

  it("13: produto selecionado com quantidade vazia ainda mostra custo/kg e não inventa estimado", () => {
    const produto = {
      produtoId: 22,
      unidade: "sc",
      valorUnitario: "129.37",
      embalagens: [{ nome: "Saco (sc) de 30 Quilograma (kg)", volume: 30, unidade: "kg" }],
    };
    const quantidade = "";
    expect(parseQuantidadeDieta(quantidade)).toBeNull();
    expect(parseQuantidadeDieta(undefined)).toBeNull();

    expect(custoMedioVigentePorKg(produto.valorUnitario, produto.unidade, produto.embalagens))
      .toBeCloseTo(4.312333, 5);
    expect(custoMedioAtualLinhaDieta(produto)).toBeCloseTo(4.312333, 5);
    expect(rotuloEquivalenciaEmbalagemMassa(produto.unidade, produto.embalagens))
      .toBe("Equivalência: 1 sc = 30 kg");
    expect(rotuloCustoMedioAtualLinhaDieta(produto)).toMatch(/R\$\s*4,31/);

    const embalagensJson = JSON.stringify(produto.embalagens);
    expect(custoMedioAtualLinhaDieta({ ...produto, embalagens: embalagensJson }))
      .toBeCloseTo(4.312333, 5);

    const qtd = parseQuantidadeDieta(quantidade);
    const ingredientesPrevia = qtd == null
      ? []
      : [{ ...produto, quantidade: qtd }];
    const previaVazia = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: ingredientesPrevia,
    });
    expect(previaVazia.ingredientes).toHaveLength(0);
    expect(previaVazia.totalKg).toBe(0);
    expect(previaVazia.completo).toBe(false);
    expect(previaVazia.custoTotal).toBeNull();
    expect(formatarCustoEstimadoDieta(previaVazia.custoTotal, previaVazia.completo))
      .toBe("Custo incompleto");

    const previa30 = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{ ...produto, quantidade: 30 }],
    });
    expect(previa30.ingredientes[0]?.custoMedioPorKg).toBeCloseTo(4.312333, 5);
    expect(previa30.custoTotal).toBe(129.37);
    expect(previa30.custoPorKg).toBe(4.31);
    expect(previa30.totalKg).toBe(30);
    expect(previa30.diferencaKg).toBe(0);
  });

  it("13b: Nova Dieta não amarra custo/kg à prévia que exige quantidade", () => {
    const form = readFileSync(new URL("../client/src/pages/NutricaoDietaFormPage.tsx", import.meta.url), "utf8");
    expect(form).toContain("rotuloCustoMedioAtualLinhaDieta");
    expect(form).not.toContain("formatarCustoEstimadoDieta(linhaCusto.custoMedioPorKg");
  });

  it("14A: fórmula incompleta com custo conhecido não mostra R$ 0,13/kg", () => {
    const embalagens = [{ nome: "Saco", volume: 30, unidade: "kg" }];
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [{
        produtoId: 22,
        quantidade: 30,
        unidade: "sc",
        valorUnitario: "129.37",
        embalagens,
      }],
    });
    expect(custo.totalKg).toBe(30);
    expect(custo.diferencaKg).toBe(-970);
    expect(custo.formulacaoFechada).toBe(false);
    expect(custo.completo).toBe(true);
    expect(custo.custoTotal).toBe(129.37);
    expect(custo.custoPorKg).toBeNull();
    expect(podeApresentarCustoEstimadoPorKgDieta(custo)).toBe(false);
    expect(formatarCustoEstimadoDieta(custo.custoTotal, custo.completo)).toMatch(/R\$\s*129,37/);
    expect(formatarCustoEstimadoPorKgDieta(custo)).toBe("Custo incompleto");
    expect(custo.ingredientes[0]?.custoMedioPorKg).toBeCloseTo(4.312333, 5);
    expect(custo.ingredientes[0]?.custoEstimado).toBe(129.37);
  });

  it("14B: fórmula fechada com saco 30 kg mostra custo/kg da dieta", () => {
    const embalagens = [{ nome: "Saco", volume: 30, unidade: "kg" }];
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{
        produtoId: 22,
        quantidade: 30,
        unidade: "sc",
        valorUnitario: "129.37",
        embalagens,
      }],
    });
    expect(custo.formulacaoFechada).toBe(true);
    expect(custo.completo).toBe(true);
    expect(custo.custoTotal).toBe(129.37);
    expect(custo.custoPorKg).toBe(4.31);
    expect(formatarCustoEstimadoPorKgDieta(custo)).toMatch(/R\$\s*4,31/);
  });

  it("14C: vários ingredientes com fórmula fechada", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [
        { produtoId: 10, quantidade: 600, unidade: "kg", valorUnitario: "1.20" },
        { produtoId: 11, quantidade: 250, unidade: "kg", valorUnitario: "2.10" },
        { produtoId: 12, quantidade: 150, unidade: "kg", valorUnitario: "4.00" },
      ],
    });
    expect(custo.formulacaoFechada).toBe(true);
    expect(custo.custoTotal).toBe(1845);
    expect(custo.custoPorKg).toBe(1.85);
    expect(formatarCustoEstimadoPorKgDieta(custo)).toContain("1,85");
  });

  it("14D: fórmula fechada com ingrediente sem custo não inventa zero", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [
        { produtoId: 10, quantidade: 600, unidade: "kg", valorUnitario: "1.20" },
        { produtoId: 15, quantidade: 400, unidade: "kg", valorUnitario: null },
      ],
    });
    expect(custo.formulacaoFechada).toBe(true);
    expect(custo.completo).toBe(false);
    expect(custo.custoTotal).toBeNull();
    expect(custo.custoPorKg).toBeNull();
    expect(formatarCustoEstimadoPorKgDieta(custo)).toBe("Custo incompleto");
  });

  it("14E: quantidade acima da base não fecha a fórmula", () => {
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [{ produtoId: 10, quantidade: 1010, unidade: "kg", valorUnitario: "4.00" }],
    });
    expect(custo.totalKg).toBe(1010);
    expect(custo.diferencaKg).toBe(10);
    expect(custo.formulacaoFechada).toBe(false);
    expect(custo.completo).toBe(true);
    expect(custo.custoTotal).toBe(4040);
    expect(custo.custoPorKg).toBeNull();
    expect(formatarCustoEstimadoPorKgDieta(custo)).toBe("Custo incompleto");
  });

  it("14: decimais usam a mesma tolerância de 3 casas da diferença da base", () => {
    expect(formulacaoDietaFechadaNaBase(333.333 + 333.333 + 333.334, 1000)).toBe(true);
    expect(formulacaoDietaFechadaNaBase(999.999, 1000)).toBe(false);
    expect(formulacaoDietaFechadaNaBase(30.001, 30)).toBe(false);
    const custo = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [
        { produtoId: 10, quantidade: 333.333, unidade: "kg", valorUnitario: "3.00" },
        { produtoId: 11, quantidade: 333.333, unidade: "kg", valorUnitario: "3.00" },
        { produtoId: 12, quantidade: 333.334, unidade: "kg", valorUnitario: "3.00" },
      ],
    });
    expect(custo.formulacaoFechada).toBe(true);
    expect(custo.custoPorKg).not.toBeNull();
  });

  it("14: saco 25 kg e produto em kg/g mantêm conversão; prévia = detalhe = edição", () => {
    const saco25 = calcularCustoEstimadoDieta({
      baseQuantidade: 25,
      ingredientes: [{
        produtoId: 31,
        quantidade: 25,
        unidade: "sc",
        valorUnitario: "100",
        embalagens: [{ nome: "Saco", volume: 25, unidade: "kg" }],
      }],
    });
    expect(saco25.custoPorKg).toBe(4);
    const emG = calcularCustoEstimadoDieta({
      baseQuantidade: 1,
      ingredientes: [{ produtoId: 21, quantidade: 1, unidade: "g", valorUnitario: "0.00431" }],
    });
    expect(emG.ingredientes[0]?.custoMedioPorKg).toBe(4.31);
    expect(emG.custoPorKg).toBe(4.31);
    const payload = {
      baseQuantidade: 30,
      ingredientes: [{
        produtoId: 22,
        quantidade: 30,
        unidade: "sc" as const,
        valorUnitario: "129.37",
        embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }],
      }],
    };
    const previa = calcularCustoEstimadoDieta(payload);
    const detalhe = calcularCustoEstimadoDieta(payload);
    const edicao = calcularCustoEstimadoDieta(payload);
    expect(previa.custoPorKg).toBe(detalhe.custoPorKg);
    expect(edicao.custoPorKg).toBe(detalhe.custoPorKg);
    expect(formatarCustoEstimadoPorKgDieta(previa)).toBe(formatarCustoEstimadoPorKgDieta(detalhe));
  });

  it("14: Nova Dieta, detalhe e listagem usam o helper compartilhado do custo/kg", () => {
    const form = readFileSync(new URL("../client/src/pages/NutricaoDietaFormPage.tsx", import.meta.url), "utf8");
    const detalhe = readFileSync(new URL("../client/src/pages/NutricaoDietaDetalhePage.tsx", import.meta.url), "utf8");
    const lista = readFileSync(new URL("../client/src/pages/NutricaoDietasListPage.tsx", import.meta.url), "utf8");
    expect(form).toContain("formatarCustoEstimadoPorKgDieta(preview)");
    expect(detalhe).toContain("formatarCustoEstimadoPorKgDieta(data.custo)");
    expect(lista).toContain("formatarCustoEstimadoPorKgDieta(dieta.custo)");
    expect(form).not.toContain("formatarCustoEstimadoDieta(preview.custoPorKg");
    expect(detalhe).not.toContain("formatarCustoEstimadoDieta(data.custo.custoPorKg");
  });
});
