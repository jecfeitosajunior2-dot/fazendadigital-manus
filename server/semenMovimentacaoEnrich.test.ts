import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEMEN_MOV_TIPO_SAIDA_IA } from "../shared/semenEstoque";
import { packReproObservacoes } from "../shared/reproRegistroMeta";
import { enrichSemenMovimentacoesDisplayLocal } from "./semenMovimentacaoEnrich";
import {
  __resetSemenLocalStoreForTests,
  __seedSemenLocalStoreForTests,
} from "./semenEstoqueLocal";

vi.mock("./localFallbackStore", () => ({
  listLocalReproducaoRegistros: vi.fn(async () => [
    {
      id: 27,
      userId: 1,
      femeaId: 15,
      machoId: 7,
      tipo: "Inseminação",
      observacoes: packReproObservacoes(null, undefined, undefined, undefined, undefined, {
        inseminador: "João",
      }),
      dataCobertura: "2026-08-25",
      dataPrevistoParto: null,
      resultado: null,
      createdAt: "2026-08-25T00:00:00.000Z",
    },
  ]),
  listLocalAnimais: vi.fn(async () => [
    { id: 15, userId: 1, brinco: "58", nome: "58", sexo: "femea", status: "ativo", fazendaId: 1 },
  ]),
}));

describe("enrichSemenMovimentacoesDisplayLocal", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
  });

  it("enriquece SAIDA_IA em batch sem expor PKs", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [],
      movimentacoes: [
        {
          id: 1,
          partidaId: 2,
          userId: 1,
          fazendaId: 1,
          tipo: SEMEN_MOV_TIPO_SAIDA_IA,
          dataEntrada: "2026-08-25",
          quantidadeDoses: 1,
          custoTotal: "150.00",
          custoUnitario: "150.00",
          observacoes: "Inseminação — matriz #15 · registro repro #27",
          createdAt: new Date("2026-08-25") as unknown as Date,
        },
      ],
      nextPartidaId: 3,
      nextMovId: 2,
    });

    const enriched = await enrichSemenMovimentacoesDisplayLocal(1, [
      {
        id: 1,
        partidaId: 2,
        userId: 1,
        fazendaId: 1,
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        dataEntrada: "2026-08-25",
        quantidadeDoses: 1,
        custoTotal: "150.00",
        custoUnitario: "150.00",
        observacoes: "Inseminação — matriz #15 · registro repro #27",
        createdAt: new Date("2026-08-25") as unknown as Date,
      },
    ]);

    expect(enriched[0]?.tipoLabel).toBe("Uso em inseminação");
    expect(enriched[0]?.contextoDisplay).toBe("Matriz 58 · Inseminador João");
    expect(enriched[0]?.contextoDisplay).not.toContain("#");
  });
});
