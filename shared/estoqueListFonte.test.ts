import { describe, expect, it, vi } from "vitest";
import { resolverLeituraEstoqueList } from "./estoqueListFonte";

type LinhaFonte = {
  id: number;
  quantidade: string;
  valorTotalEstoque?: string | null;
  capitalInicializadoEm?: string | null;
  valorUnitario?: string | null;
};

const dieselMysql: LinhaFonte = {
  id: 34,
  quantidade: "2020",
  valorTotalEstoque: "15440",
  capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
  valorUnitario: "7.643564",
};
const dieselLocal: LinhaFonte = {
  id: 34,
  quantidade: "2020",
  valorTotalEstoque: null,
  capitalInicializadoEm: null,
  valorUnitario: "8",
};
const monovimMysql: LinhaFonte = {
  id: 26,
  quantidade: "5.00",
  valorTotalEstoque: "10.25",
  capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
  valorUnitario: "2.050000",
};
const monovimLocal: LinhaFonte = {
  id: 26,
  quantidade: "10",
  valorTotalEstoque: null,
  capitalInicializadoEm: null,
  valorUnitario: "1.02",
};
const soroMysql: LinhaFonte = {
  id: 29,
  quantidade: "6",
  valorTotalEstoque: "75",
  capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
};
const soroLocal: LinhaFonte = {
  id: 29,
  quantidade: "7",
  valorTotalEstoque: null,
  capitalInicializadoEm: null,
};
const salMysql: LinhaFonte = { id: 39, quantidade: "50.98", valorTotalEstoque: "6605.28" };

const bancoCaiu = (error: unknown) =>
  String((error as { code?: string })?.code ?? error).includes("ECONNREFUSED");

describe("resolverLeituraEstoqueList — fonte oficial", () => {
  it("CASO A — MySQL e local com o mesmo Diesel: fica o MySQL com capital 15440", () => {
    const listarLocal = vi.fn(() => [dieselLocal]);
    const rows = resolverLeituraEstoqueList(
      { ok: true, rows: [dieselMysql] },
      listarLocal,
      bancoCaiu,
    );
    expect(rows).toEqual([dieselMysql]);
    expect(rows[0]?.valorTotalEstoque).toBe("15440");
    expect(listarLocal).not.toHaveBeenCalled();
  });

  it("CASO B — Monovim MySQL 5 / 10,25 vence local 10 / 1,02 e não lê JSON", () => {
    const listarLocal = vi.fn(() => [monovimLocal]);
    const rows = resolverLeituraEstoqueList(
      { ok: true, rows: [monovimMysql] },
      listarLocal,
      bancoCaiu,
    );
    expect(rows).toEqual([monovimMysql]);
    expect(rows[0]?.quantidade).toBe("5.00");
    expect(rows[0]?.valorTotalEstoque).toBe("10.25");
    expect(rows[0]?.valorUnitario).toBe("2.050000");
    expect(listarLocal).not.toHaveBeenCalled();
  });

  it("CASO C — Soro MySQL 6 / capital 75 vence local 7 sem capital", () => {
    const listarLocal = vi.fn(() => [soroLocal]);
    const rows = resolverLeituraEstoqueList(
      { ok: true, rows: [soroMysql] },
      listarLocal,
      bancoCaiu,
    );
    expect(rows).toEqual([soroMysql]);
    expect(rows[0]?.quantidade).toBe("6");
    expect(rows[0]?.valorTotalEstoque).toBe("75");
    expect(listarLocal).not.toHaveBeenCalled();
  });

  it("CASO D — MySQL [] é sucesso e não completa com local", () => {
    const listarLocal = vi.fn(() => [dieselLocal, monovimLocal]);
    const rows = resolverLeituraEstoqueList({ ok: true, rows: [] }, listarLocal, bancoCaiu);
    expect(rows).toEqual([]);
    expect(listarLocal).not.toHaveBeenCalled();
  });

  it("CASO E — erro real de MySQL cai no fallback local", () => {
    const listarLocal = vi.fn(() => [dieselLocal]);
    const rows = resolverLeituraEstoqueList(
      { ok: false, error: { code: "ECONNREFUSED" } },
      listarLocal,
      bancoCaiu,
    );
    expect(rows).toEqual([dieselLocal]);
    expect(listarLocal).toHaveBeenCalledTimes(1);
  });

  it("CASO F — item só no MySQL volta intacto", () => {
    const listarLocal = vi.fn(() => []);
    const rows = resolverLeituraEstoqueList(
      { ok: true, rows: [salMysql] },
      listarLocal,
      bancoCaiu,
    );
    expect(rows).toEqual([salMysql]);
    expect(listarLocal).not.toHaveBeenCalled();
  });

  it("erro que não é queda do banco é relançado e não lê local", () => {
    const listarLocal = vi.fn(() => [dieselLocal]);
    expect(() =>
      resolverLeituraEstoqueList(
        { ok: false, error: new Error("falha de SQL") },
        listarLocal,
        bancoCaiu,
      ),
    ).toThrow("falha de SQL");
    expect(listarLocal).not.toHaveBeenCalled();
  });
});
