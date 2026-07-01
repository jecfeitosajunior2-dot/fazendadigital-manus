import { describe, it, expect } from "vitest";
import { normalizeBenfeitoriaDate, toBenfeitoriaRow, toBenfeitoriaUpdateRow } from "./benfeitoriasDb";

describe("toBenfeitoriaRow — insert benfeitorias", () => {
  it("define dataInstalacao como null quando ausente (evita deslocar valorEstimado)", () => {
    const row = toBenfeitoriaRow(
      1,
      {
        fazendaId: 1,
        nome: "Galpão",
        anoConstrucao: 2026,
        vidaUtil: "10",
        valorEstimado: "100000.00",
      },
      [null, null, null],
    );

    expect(row.dataInstalacao).toBeUndefined();
    expect(row.valorEstimado).toBe("100000.00");
    expect(row.vidaUtil).toBe("10");
  });

  it("define status padrão ativo no cadastro", () => {
    const row = toBenfeitoriaRow(
      1,
      { fazendaId: 1, nome: "Galpão", anoConstrucao: 2026 },
      [null, null, null],
    );
    expect(row.status).toBe("ativo");
  });

  it("persiste tipo e estado no cadastro e na edição", () => {
    const input = {
      fazendaId: 1,
      nome: "Curral Principal",
      tipo: "Curral",
      estado: "Bom",
      anoConstrucao: 2026,
      vidaUtil: "10 anos",
      valorEstimado: "150000.00",
    };
    const createRow = toBenfeitoriaRow(1, input, [null, null, null]);
    const updateRow = toBenfeitoriaUpdateRow({ ...input, estado: "Regular" }, [null, null, null]);

    expect(createRow.tipo).toBe("Curral");
    expect(createRow.estado).toBe("Bom");
    expect(updateRow.tipo).toBe("Curral");
    expect(updateRow.estado).toBe("Regular");
  });

  it("permite update parcial sem sobrescrever tipo e estado", () => {
    const updateRow = toBenfeitoriaUpdateRow(
      { valorEstimado: "120000.00" },
      [null, null, null],
    );

    expect(updateRow.valorEstimado).toBe("120000.00");
    expect(updateRow.tipo).toBeUndefined();
    expect(updateRow.estado).toBeUndefined();
  });

  it("normaliza dataInstalacao para YYYY-MM-DD", () => {
    expect(normalizeBenfeitoriaDate("2026-06-02")).toBe("2026-06-02");
    expect(normalizeBenfeitoriaDate("2026-06-02T13:45:00.000Z")).toBe("2026-06-02");
    expect(normalizeBenfeitoriaDate("")).toBeNull();
    expect(normalizeBenfeitoriaDate(undefined)).toBeNull();
  });
});
