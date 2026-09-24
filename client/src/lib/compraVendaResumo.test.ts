import { describe, expect, it } from "vitest";
import {
  formatarMetricaPeso,
  formatarMetricaQuantidade,
  formatarMetricaValor,
  operacaoNoPeriodo,
  parseQuantidadeOperacao,
  parseValorOperacao,
  resumirOperacoes,
} from "./compraVendaResumo";

describe("compraVendaResumo", () => {
  it("parseia valor varchar no formato gravado pelo formulário", () => {
    expect(parseValorOperacao("125000.00")).toBe(125000);
    expect(parseValorOperacao("0")).toBe(0);
    expect(parseValorOperacao("")).toBe(0);
    expect(parseValorOperacao(null)).toBe(0);
    expect(parseValorOperacao("abc")).toBeNull();
  });

  it("usa quantidade agregada já persistida, sem inventar vínculo individual", () => {
    expect(parseQuantidadeOperacao({ quantidadeAnimais: 12 })).toBe(12);
    expect(parseQuantidadeOperacao({ quantidade: 3 })).toBe(3);
    expect(parseQuantidadeOperacao({})).toBe(0);
    expect(parseQuantidadeOperacao({ quantidadeAnimais: -1 })).toBeNull();
  });

  it("filtra pelo período civil YYYY-MM-DD", () => {
    expect(operacaoNoPeriodo("2026-08-15", "2026-08-01", "2026-08-31")).toBe(true);
    expect(operacaoNoPeriodo("2026-07-31", "2026-08-01", "2026-08-31")).toBe(false);
    expect(operacaoNoPeriodo("data-invalida", "2026-08-01", "2026-08-31")).toBe(false);
  });

  it("zero conhecido quando não há operações no período", () => {
    const resumo = resumirOperacoes(
      [{ id: 1, data: "2026-07-10", fornecedor: "A", quantidadeAnimais: 5, valorTotal: "100" }],
      { de: "2026-08-01", ate: "2026-08-31" },
      "fornecedor",
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 0 });
    expect(resumo.animais).toEqual({ kind: "known", value: 0 });
    expect(resumo.peso).toEqual({ kind: "unknown" });
    expect(resumo.recentes).toEqual([]);
    expect(formatarMetricaValor(resumo.valor).replace(/\u00a0/g, " ")).toMatch(/R\$ 0,00/);
    expect(formatarMetricaQuantidade(resumo.animais)).toBe("0");
    expect(formatarMetricaValor(resumo.peso)).toBe("—");
    expect(formatarMetricaPeso(resumo.peso)).toBe("—");
  });

  it("não arredonda 7,5 kg para 8 kg", () => {
    expect(formatarMetricaPeso({ kind: "known", value: 7.5 })).toBe("7,5 kg");
    expect(formatarMetricaPeso({ kind: "known", value: 691 })).toBe("691 kg");
    expect(formatarMetricaPeso({ kind: "known", value: 8400 })).toBe("8.400 kg");
    expect(formatarMetricaPeso({ kind: "known", value: 425.5 })).toBe("425,5 kg");
  });

  it("soma valor e quantidade reais do período", () => {
    const resumo = resumirOperacoes(
      [
        { id: 1, data: "2026-08-02", fornecedor: "Fazenda Norte", quantidadeAnimais: 10, valorTotal: "1000" },
        { id: 2, data: "2026-08-20", fornecedor: "Fazenda Sul", quantidadeAnimais: 4, valorTotal: "250.5" },
        { id: 3, data: "2026-07-01", fornecedor: "Fora", quantidadeAnimais: 99, valorTotal: "9999" },
      ],
      { de: "2026-08-01", ate: "2026-08-31" },
      "fornecedor",
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 1250.5 });
    expect(resumo.animais).toEqual({ kind: "known", value: 14 });
    expect(resumo.recentes.map(r => r.parceiro)).toEqual(["Fazenda Sul", "Fazenda Norte"]);
  });

  it("marca valor como desconhecido se algum lançamento do período for ilegível", () => {
    const resumo = resumirOperacoes(
      [{ id: 1, data: "2026-08-02", comprador: "João", quantidadeAnimais: 2, valorTotal: "não sei" }],
      { de: "2026-08-01", ate: "2026-08-31" },
      "comprador",
    );
    expect(resumo.valor).toEqual({ kind: "unknown" });
    expect(resumo.animais).toEqual({ kind: "known", value: 2 });
  });

  it("soma peso vendido só quando o lançamento tem peso real", () => {
    const resumo = resumirOperacoes(
      [
        { id: 1, data: "2026-08-02", comprador: "A", quantidadeAnimais: 2, valorTotal: "8000", pesoTotal: 691 },
        { id: 2, data: "2026-08-10", comprador: "B", quantidadeAnimais: 20, valorTotal: "1000" },
      ],
      { de: "2026-08-01", ate: "2026-08-31" },
      "comprador",
    );
    expect(resumo.peso).toEqual({ kind: "known", value: 691 });
  });

  it("compra cancelada permanece fora dos totais efetivos", () => {
    const resumo = resumirOperacoes(
      [
        { id: 9001, data: "2026-09-24", fornecedor: "Ativa", quantidadeAnimais: 10, valorTotal: "1000", pesoTotal: 200, status: "concluido" },
        { id: 9002, data: "2026-09-24", fornecedor: "Cancelada", quantidadeAnimais: 40, valorTotal: "108000", pesoTotal: 8400, status: "cancelado" },
      ],
      { de: "2026-09-01", ate: "2026-09-30" },
      "fornecedor",
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 1000 });
    expect(resumo.animais).toEqual({ kind: "known", value: 10 });
    expect(resumo.peso).toEqual({ kind: "known", value: 200 });
    expect(resumo.recentes.map(r => r.id)).toEqual([9001]);
  });
});
