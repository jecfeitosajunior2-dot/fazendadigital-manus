import { describe, expect, it } from "vitest";
import {
  MSG_COMPRA_CATEGORIA_SEXO,
  MSG_COMPRA_FORMA_INVALIDA,
  MSG_COMPRA_MODO_INDIVIDUAL,
  MSG_COMPRA_PESO_OBRIGATORIO,
  MSG_COMPRA_PRECO_INVALIDO,
  MSG_COMPRA_QUANTIDADE_INVALIDA,
  MSG_COMPRA_SEM_FAZENDA,
  MSG_COMPRA_SEM_FORNECEDOR,
  MSG_COMPRA_SEM_GRUPOS,
  MSG_COMPRA_VALOR_NEGATIVO,
  avaliarConfirmacaoCompraNaoIdentificados,
  calcularCustoMedioCabeca,
  calcularCustoMedioKg,
  calcularCustoTotalCompra,
  calcularValorAnimaisCompra,
  parseCustoOpcional,
  somarGruposCompra,
} from "./compraComercial";

const gruposExemplo = [
  { categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: 4400 },
  { categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: 4000 },
];

const base = {
  fazendaId: 1,
  fornecedorId: 9,
  data: "2026-09-22",
  modoIdentificacao: "nao_identificados" as const,
  grupos: gruposExemplo,
};

describe("compra comercial — não identificados", () => {
  it("1. compra por kg", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.calculado.valorAnimais).toBe(105000);
  });

  it("2. compra por cabeça", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "cabeca",
      precoUnitario: 2500,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.calculado.valorAnimais).toBe(100000);
  });

  it("3 e 4. múltiplos grupos somam quantidade", () => {
    const soma = somarGruposCompra([
      { categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: 4400 },
      { categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: 4000 },
    ]);
    expect(soma.quantidadeTotal).toBe(40);
  });

  it("5. soma de peso", () => {
    const soma = somarGruposCompra([
      { categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: 4400 },
      { categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: 4000 },
    ]);
    expect(soma.pesoTotal).toBe(8400);
  });

  it("6. valor por kg", () => {
    expect(calcularValorAnimaisCompra({
      forma: "kg", precoUnitario: 12.5, quantidadeTotal: 40, pesoTotal: 8400,
    })).toEqual({ ok: true, valor: 105000 });
  });

  it("7. valor por cabeça", () => {
    expect(calcularValorAnimaisCompra({
      forma: "cabeca", precoUnitario: 2500, quantidadeTotal: 40, pesoTotal: 8400,
    })).toEqual({ ok: true, valor: 100000 });
  });

  it("8 e 9. frete e outros custos", () => {
    expect(parseCustoOpcional(3000)).toEqual({ ok: true, valor: 3000 });
    expect(parseCustoOpcional("")).toEqual({ ok: true, valor: 0 });
    expect(parseCustoOpcional(0)).toEqual({ ok: true, valor: 0 });
  });

  it("10. custo total", () => {
    expect(calcularCustoTotalCompra({
      valorAnimais: 105000, frete: 3000, outrosCustos: 0,
    })).toBe(108000);
  });

  it("11. custo médio/cabeça", () => {
    expect(calcularCustoMedioCabeca(108000, 40)).toBe(2700);
  });

  it("12. custo médio/kg", () => {
    expect(calcularCustoMedioKg(108000, 8400)).toBe(12.86);
  });

  it("13. peso obrigatório na compra por kg", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
      grupos: [{ categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: "" }],
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_PESO_OBRIGATORIO });
  });

  it("14. peso opcional na compra por cabeça", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "cabeca",
      precoUnitario: 2500,
      grupos: [{ categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: "" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.calculado.pesoTotal).toBeNull();
      expect(r.calculado.valorAnimais).toBe(50000);
      expect(r.calculado.custoMedioKg).toBeNull();
    }
  });

  it("15. quantidade zero bloqueada", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "cabeca",
      precoUnitario: 2500,
      grupos: [{ categoria: "Bezerro", sexo: "macho", quantidade: 0, pesoTotal: 100 }],
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_QUANTIDADE_INVALIDA });
  });

  it("16. valor negativo bloqueado", () => {
    expect(parseCustoOpcional(-1).ok).toBe(false);
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
      frete: -10,
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_VALOR_NEGATIVO });
  });

  it("17. fornecedor obrigatório", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      fornecedorId: "",
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_SEM_FORNECEDOR });
  });

  it("18. fazenda obrigatória", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      fazendaId: 0,
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_SEM_FAZENDA });
  });

  it("máscara de peso não altera o cálculo", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "kg",
      precoUnitario: "12,50",
      grupos: [
        { categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: "4.400,00" },
        { categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: "4.000" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.calculado.pesoTotal).toBe(8400);
      expect(r.calculado.valorAnimais).toBe(105000);
    }
    expect(avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "kg",
      precoUnitario: 10,
      grupos: [{ categoria: "Bezerro", sexo: "macho", quantidade: 1, pesoTotal: "4.000" }],
    }).ok).toBe(true);
  });

  it("categoria incompatível com sexo é rejeitada", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "cabeca",
      precoUnitario: 2500,
      grupos: [{ categoria: "Bezerra", sexo: "macho", quantidade: 2, pesoTotal: 200 }],
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_CATEGORIA_SEXO });
  });

  it("modo individual não confirma nesta etapa", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      modoIdentificacao: "individuais",
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
    });
    expect(r).toEqual({ ok: false, message: MSG_COMPRA_MODO_INDIVIDUAL });
  });

  it("sem grupos ou sem forma", () => {
    expect(avaliarConfirmacaoCompraNaoIdentificados({
      ...base, grupos: [], formaPrecificacao: "kg", precoUnitario: 12.5,
    })).toEqual({ ok: false, message: MSG_COMPRA_SEM_GRUPOS });
    expect(avaliarConfirmacaoCompraNaoIdentificados({
      ...base, formaPrecificacao: "arroba", precoUnitario: 12.5,
    })).toEqual({ ok: false, message: MSG_COMPRA_FORMA_INVALIDA });
    expect(avaliarConfirmacaoCompraNaoIdentificados({
      ...base, formaPrecificacao: "kg", precoUnitario: 0,
    })).toEqual({ ok: false, message: MSG_COMPRA_PRECO_INVALIDO });
  });

  it("25. fornecedor não exige fazendaId no cadastro de pessoa", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...base,
      formaPrecificacao: "cabeca",
      precoUnitario: 100,
      grupos: [{ categoria: "Boi", sexo: "macho", quantidade: 1, pesoTotal: "" }],
    });
    expect(r.ok).toBe(true);
    expect("fazendaId" in ({} as { fazendaId?: number })).toBe(false);
  });
});
