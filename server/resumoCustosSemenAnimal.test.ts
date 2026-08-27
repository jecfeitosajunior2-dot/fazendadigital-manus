import { describe, expect, it } from "vitest";
import { packReproObservacoes } from "../shared/reproRegistroMeta";
import { calcularResumoCustosSemenAnimal } from "../shared/resumoCustosSemenAnimal";

function ia(custo?: number | null) {
  return {
    tipo: "Inseminação",
    observacoes: packReproObservacoes(undefined, "GSC-7117", undefined, undefined, null, {
      custoDoseSemen: custo ?? undefined,
    }),
  };
}

describe("calcularResumoCustosSemenAnimal", () => {
  it("teste A — 3 IAs com custo: total 300 e média 100", () => {
    const r = calcularResumoCustosSemenAnimal([ia(90), ia(100), ia(110)]);
    expect(r.totalInseminacoes).toBe(3);
    expect(r.inseminacoesComCusto).toBe(3);
    expect(r.custoTotal).toBe(300);
    expect(r.custoMedio).toBe(100);
  });

  it("teste B — uma IA sem custo não entra na média", () => {
    const r = calcularResumoCustosSemenAnimal([ia(90), ia(110), ia(null)]);
    expect(r.totalInseminacoes).toBe(3);
    expect(r.inseminacoesComCusto).toBe(2);
    expect(r.custoTotal).toBe(200);
    expect(r.custoMedio).toBe(100);
    expect(r.custoTotal).not.toBe(0);
    expect(r.custoMedio).not.toBe(0);
  });

  it("teste C — todas sem custo: total e média ausentes", () => {
    const r = calcularResumoCustosSemenAnimal([ia(null), ia(null)]);
    expect(r.totalInseminacoes).toBe(2);
    expect(r.inseminacoesComCusto).toBe(0);
    expect(r.custoTotal).toBeNull();
    expect(r.custoMedio).toBeNull();
  });

  it("teste D — sem IA", () => {
    const r = calcularResumoCustosSemenAnimal([]);
    expect(r.totalInseminacoes).toBe(0);
    expect(r.custoTotal).toBeNull();
    expect(r.custoMedio).toBeNull();
  });

  it("teste E — Cobertura, Diagnóstico e Parto não entram", () => {
    const r = calcularResumoCustosSemenAnimal([
      { tipo: "Cobertura", observacoes: packReproObservacoes(undefined, "16") },
      { tipo: "Diagnóstico de prenhez", observacoes: null },
      { tipo: "Parto", observacoes: null },
      ia(90),
      ia(110),
    ]);
    expect(r.totalInseminacoes).toBe(2);
    expect(r.custoTotal).toBe(200);
    expect(r.custoMedio).toBe(100);
  });

  it("teste F — usa snapshot da IA, não custo atual de cadastro", () => {
    const r = calcularResumoCustosSemenAnimal([
      {
        tipo: "Inseminação",
        observacoes: packReproObservacoes(undefined, "GSC-7117", undefined, undefined, null, {
          custoDoseSemen: 90,
        }),
      },
    ]);
    expect(r.custoTotal).toBe(90);
    expect(r.custoTotal).not.toBe(120);
  });

  it("centavos: soma real, média não recompõe o total", () => {
    const r = calcularResumoCustosSemenAnimal([ia(90), ia(138.89), ia(138.89)]);
    expect(r.totalInseminacoes).toBe(3);
    expect(r.custoTotal).toBe(367.78);
    expect(r.custoMedio).toBe(122.59);
    expect(Number((r.custoMedio! * r.totalInseminacoes).toFixed(2))).not.toBe(r.custoTotal);
  });

  it("IA legado sem reprodutor mas com custo entra no total", () => {
    const r = calcularResumoCustosSemenAnimal([
      {
        tipo: "Inseminação",
        observacoes: `\n__fd_repro__${JSON.stringify({ r: "P-10FAZ", ps: "P-10FAZ", cds: 90 })}__end__`,
      },
      ia(null),
    ]);
    expect(r.totalInseminacoes).toBe(2);
    expect(r.custoTotal).toBe(90);
    expect(r.custoMedio).toBe(90);
  });
});
