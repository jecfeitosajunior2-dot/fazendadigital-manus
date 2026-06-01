import { describe, it, expect } from "vitest";
import {
  converterUnidade,
  unidadesCompativeis,
  normalizarUnidade,
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
