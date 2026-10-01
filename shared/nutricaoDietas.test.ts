import { describe, expect, it } from "vitest";
import {
  calcularCustoEstimadoDieta,
  formatarCustoEstimadoDieta,
  MSG_DIETA_DATAS,
  MSG_DIETA_DUPLICADO,
  MSG_DIETA_PRODUTO_FAZENDA,
  MSG_DIETA_QTD,
  MSG_DIETA_TOTAL,
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
    expect(custo.custoTotal).toBe(1845);
    expect(custo.custoPorKg).toBe(1.85);
    expect(custo.ingredientes[0]?.percentual).toBe(60);
    expect(formatarCustoEstimadoDieta(custo.custoPorKg, custo.completo)).toContain("1,85");
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
});
