import { describe, expect, it, vi } from "vitest";
import { resolverLeituraEstoqueList } from "./estoqueListFonte";

const dieselMysql = {
  id: 34,
  quantidade: "2020",
  valorTotalEstoque: "15440",
  capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
  valorUnitario: "7.643564",
};
const dieselLocal = {
  id: 34,
  quantidade: "2020",
  valorTotalEstoque: null,
  capitalInicializadoEm: null,
  valorUnitario: "8",
};
const monovimMysql = { id: 26, quantidade: "5" };
const monovimLocal = { id: 26, quantidade: "10" };
const soroMysql = {
  id: 29,
  quantidade: "6",
  valorTotalEstoque: "75",
  capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
};
const soroLocal = {
  id: 29,
  quantidade: "7",
  valorTotalEstoque: null,
  capitalInicializadoEm: null,
};
const salMysql = { id: 39, quantidade: "50.98", valorTotalEstoque: "6605.28" };

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

  it("CASO B — Monovim MySQL 5 vence local 10", () => {
    const listarLocal = vi.fn(() => [monovimLocal]);
    const rows = resolverLeituraEstoqueList(
      { ok: true, rows: [monovimMysql] },
      listarLocal,
      bancoCaiu,
    );
    expect(rows).toEqual([{ id: 26, quantidade: "5" }]);
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
