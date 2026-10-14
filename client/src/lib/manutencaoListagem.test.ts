import { describe, expect, it } from "vitest";
import {
  ordenarManutencoesListagem,
  paginarManutencoesListagem,
} from "./manutencaoListagem";

function os(input: {
  id: number;
  data: string;
  createdAt?: string | null;
  valorTotal?: number;
  tipo?: string;
  maquina?: string;
  status?: string;
}) {
  return {
    id: input.id,
    data: input.data,
    createdAt: input.createdAt,
    valorTotal: input.valorTotal ?? 0,
    tipo: input.tipo ?? "Preventiva",
    maquina: input.maquina ?? "Trator",
    status: input.status ?? "concluida",
  };
}

const nomeMaquina = (row: { maquina?: string }) => row.maquina ?? "";

describe("ordenação da lista de manutenções", () => {
  it("datas diferentes: mais recente primeiro", () => {
    const ordenadas = ordenarManutencoesListagem([
      os({ id: 2, data: "2026-10-10", createdAt: "2026-10-10T18:00:00.000Z" }),
      os({ id: 3, data: "2026-10-14", createdAt: "2026-10-14T08:00:00.000Z" }),
      os({ id: 1, data: "2026-09-01", createdAt: "2026-09-01T10:00:00.000Z" }),
    ]);
    expect(ordenadas.map(r => r.id)).toEqual([3, 2, 1]);
  });

  it("mesma data: horário de criação mais recente primeiro", () => {
    const ordenadas = ordenarManutencoesListagem([
      os({ id: 10, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z", valorTotal: 100 }),
      os({ id: 12, data: "2026-10-14", createdAt: "2026-10-14T16:30:00.000Z", valorTotal: 454 }),
      os({ id: 11, data: "2026-10-14", createdAt: "2026-10-14T12:00:00.000Z", valorTotal: 200 }),
    ]);
    expect(ordenadas.map(r => r.id)).toEqual([12, 11, 10]);
    expect(ordenadas[0].valorTotal).toBe(454);
  });

  it("histórico sem createdAt empata pelo ID maior", () => {
    const ordenadas = ordenarManutencoesListagem([
      os({ id: 4, data: "2026-10-14", createdAt: null }),
      os({ id: 8, data: "2026-10-14" }),
      os({ id: 6, data: "2026-10-14", createdAt: "" }),
    ]);
    expect(ordenadas.map(r => r.id)).toEqual([8, 6, 4]);
  });

  it("após cadastrar uma nova OS no mesmo dia, ela fica no topo do dia", () => {
    const anteriores = [
      os({ id: 13, data: "2026-10-14", createdAt: "2026-10-14T10:00:00.000Z", valorTotal: 80 }),
      os({ id: 12, data: "2026-10-13", createdAt: "2026-10-13T18:00:00.000Z", valorTotal: 50 }),
    ];
    const nova = os({
      id: 14,
      data: "2026-10-14",
      createdAt: "2026-10-14T16:20:00.000Z",
      valorTotal: 454,
    });
    expect(ordenarManutencoesListagem([...anteriores, nova]).map(r => r.id)).toEqual([14, 13, 12]);
  });

  it("paginação usa a lista já ordenada", () => {
    const ordenadas = ordenarManutencoesListagem([
      os({ id: 1, data: "2026-10-10", createdAt: "2026-10-10T08:00:00.000Z" }),
      os({ id: 3, data: "2026-10-14", createdAt: "2026-10-14T16:00:00.000Z" }),
      os({ id: 2, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z" }),
    ]);
    expect(paginarManutencoesListagem(ordenadas, 1, 2).map(r => r.id)).toEqual([3, 2]);
    expect(paginarManutencoesListagem(ordenadas, 2, 2).map(r => r.id)).toEqual([1]);
  });

  it("filtro não altera o critério de ordenação do que restou", () => {
    const daFazenda = [
      os({ id: 21, data: "2026-10-14", createdAt: "2026-10-14T08:00:00.000Z", tipo: "Corretiva" }),
      os({ id: 22, data: "2026-10-14", createdAt: "2026-10-14T15:00:00.000Z", tipo: "Preventiva" }),
      os({ id: 20, data: "2026-10-12", createdAt: "2026-10-12T10:00:00.000Z", tipo: "Preventiva" }),
    ].filter(r => r.tipo === "Preventiva");
    expect(ordenarManutencoesListagem(daFazenda).map(r => r.id)).toEqual([22, 20]);
  });

  it("manutenção estornada entra na mesma ordem", () => {
    const ordenadas = ordenarManutencoesListagem([
      os({ id: 30, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z", status: "concluida" }),
      os({ id: 31, data: "2026-10-14", createdAt: "2026-10-14T17:00:00.000Z", status: "estornado" }),
    ]);
    expect(ordenadas.map(r => r.id)).toEqual([31, 30]);
  });

  it("ordenação manual por valor preserva desempate por criação e ID", () => {
    const ordenadas = ordenarManutencoesListagem(
      [
        os({ id: 41, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z", valorTotal: 100 }),
        os({ id: 42, data: "2026-10-14", createdAt: "2026-10-14T16:00:00.000Z", valorTotal: 100 }),
        os({ id: 40, data: "2026-10-10", createdAt: "2026-10-10T10:00:00.000Z", valorTotal: 50 }),
      ],
      { sortKey: "valor", sortAsc: true },
    );
    expect(ordenadas.map(r => r.id)).toEqual([40, 42, 41]);
  });

  it("ordenação manual por máquina e tipo não inverte o desempate", () => {
    const porMaquina = ordenarManutencoesListagem(
      [
        os({ id: 51, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z", maquina: "Trator" }),
        os({ id: 52, data: "2026-10-14", createdAt: "2026-10-14T16:00:00.000Z", maquina: "Trator" }),
      ],
      { sortKey: "maquina", sortAsc: true, nomeMaquina },
    );
    expect(porMaquina.map(r => r.id)).toEqual([52, 51]);

    const porTipo = ordenarManutencoesListagem(
      [
        os({ id: 61, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z", tipo: "Preventiva" }),
        os({ id: 62, data: "2026-10-14", createdAt: "2026-10-14T16:00:00.000Z", tipo: "Preventiva" }),
      ],
      { sortKey: "tipo", sortAsc: true },
    );
    expect(porTipo.map(r => r.id)).toEqual([62, 61]);
  });
});
