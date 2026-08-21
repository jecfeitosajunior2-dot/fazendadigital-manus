import { describe, it, expect } from "vitest";
import {
  calcularGmdEntrePesagens,
  calcularVariacaoPesagem,
  diasEntrePesagens,
} from "../client/src/lib/fichaAnimalDisplay";

describe("cálculo de pesagens consecutivas", () => {
  it("calcula variação positiva e negativa", () => {
    expect(calcularVariacaoPesagem(300, 320)).toBe(20);
    expect(calcularVariacaoPesagem(350, 340)).toBe(-10);
  });

  it("calcula GMD pelo intervalo real entre datas", () => {
    expect(calcularGmdEntrePesagens(300, 350, "2026-07-18", "2026-09-06")).toBe(1);
  });

  it("não calcula GMD na mesma data (evita divisão por zero)", () => {
    expect(diasEntrePesagens("2026-07-18", "2026-07-18")).toBe(0);
    expect(calcularGmdEntrePesagens(300, 320, "2026-07-18", "2026-07-18")).toBeNull();
  });

  it("primeira pesagem sem anterior não gera variação/GMD", () => {
    expect(calcularVariacaoPesagem(null, 300)).toBeNull();
    expect(calcularGmdEntrePesagens(null, 300, null, "2026-07-18")).toBeNull();
  });
});
