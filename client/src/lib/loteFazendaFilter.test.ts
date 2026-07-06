import { describe, expect, it } from "vitest";
import { filtrarLotesPorFazenda } from "./loteFazendaFilter";

describe("filtrarLotesPorFazenda", () => {
  const lotes = [
    { id: 1, nome: "Sem Fazenda", fazendaId: null },
    { id: 2, nome: "Engorda", fazendaId: 1 },
    { id: 3, nome: "Outra Fazenda", fazendaId: 2 },
  ];

  it("mostra só lotes da fazenda selecionada", () => {
    const result = filtrarLotesPorFazenda(lotes, 1);
    expect(result.map(l => l.nome)).toEqual(["Engorda"]);
  });

  it("não inclui lotes sem fazenda vinculada", () => {
    expect(filtrarLotesPorFazenda(lotes, 1).some(l => l.nome === "Sem Fazenda")).toBe(false);
  });

  it("retorna todos os lotes quando nenhuma fazenda está selecionada", () => {
    expect(filtrarLotesPorFazenda(lotes, null)).toHaveLength(3);
  });
});
