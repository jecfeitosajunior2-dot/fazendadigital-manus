import { beforeEach, describe, expect, it, vi } from "vitest";
import { packReproObservacoes, unpackReproObservacoes } from "../shared/reproRegistroMeta";
import {
  applySemenSaidaIa,
  MSG_SEMEN_PARTIDA_INCOMPATIVEL,
  MSG_SEMEN_SEM_DOSES,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_PARTIDA_SEM_LOTE,
  SEMEN_STATUS_DISPONIVEL,
  SEMEN_STATUS_ESGOTADO,
  validateSemenPartidaReprodutorCompat,
} from "../shared/semenEstoque";

vi.mock("./validateSemenMachoId", () => ({
  validateSemenMachoInterno: vi.fn(async (_u: number, _f: number, machoId: number) => ({
    machoId,
    reprodutorTexto: machoId === 7 ? "16 — Touro Teste" : "20 — Outro",
  })),
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: vi.fn(async (_u: number, fazendaId: number) => {
    if (fazendaId !== 1 && fazendaId !== 2) throw new Error("Sem acesso.");
  }),
}));

vi.mock("./localFallbackStore", () => ({
  createLocalReproducaoRegistro: vi.fn(async (_userId: number, input: { femeaId: number }) => ({
    id: 9001,
  })),
  listLocalReproducaoRegistros: vi.fn(async () => []),
  listLocalAnimais: vi.fn(async () => []),
}));

import { createLocalReproducaoRegistro } from "./localFallbackStore";
import {
  __resetSemenLocalStoreForTests,
  __seedSemenLocalStoreForTests,
  getSemenPartidaByIdLocal,
  listSemenPartidasDisponiveisInseminacaoLocal,
  registrarInseminacaoComSemenLocal,
} from "./semenEstoqueLocal";

const USER_ID = 1;
const FAZENDA_ID = 1;

function seedPartidaInterna(overrides: Partial<{
  id: number;
  partida: string;
  saldoDoses: number;
  custoUnitario: string;
  machoId: number;
  fazendaId: number;
}> = {}) {
  const id = overrides.id ?? 2;
  return {
    id,
    userId: USER_ID,
    fazendaId: overrides.fazendaId ?? FAZENDA_ID,
    origemReprodutor: SEMEN_ORIGEM_INTERNO,
    reprodutorKey: "m:7",
    machoId: overrides.machoId ?? 7,
    reprodutorTexto: "16 — Touro Teste",
    partida: overrides.partida ?? SEMEN_PARTIDA_SEM_LOTE,
    centralOrigem: null,
    saldoDoses: overrides.saldoDoses ?? 15,
    custoUnitario: overrides.custoUnitario ?? "100.00",
    status: (overrides.saldoDoses ?? 15) > 0 ? SEMEN_STATUS_DISPONIVEL : SEMEN_STATUS_ESGOTADO,
    observacoes: null,
    createdAt: new Date("2026-08-20") as unknown as Date,
    updatedAt: new Date("2026-08-20") as unknown as Date,
  };
}

function packIaObs(
  observacoes: string | null | undefined,
  extras: {
    partidaSemen: string;
    inseminador?: string;
    ecc?: number;
    semenPartidaId: number;
    custoDoseSemen: number | null;
    centralOrigem?: string | null;
  },
) {
  return packReproObservacoes(observacoes, undefined, undefined, undefined, undefined, {
    partidaSemen: extras.partidaSemen,
    inseminador: extras.inseminador,
    ecc: extras.ecc,
    semenPartidaId: extras.semenPartidaId,
    custoDoseSemen: extras.custoDoseSemen,
    centralOrigem: extras.centralOrigem,
  });
}

describe("semen Inseminação V2 — local", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
    vi.mocked(createLocalReproducaoRegistro).mockClear();
  });

  it("lista partidas disponíveis do touro 7 (brinco 16)", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        seedPartidaInterna({ id: 2, partida: SEMEN_PARTIDA_SEM_LOTE, saldoDoses: 15, custoUnitario: "100.00" }),
        seedPartidaInterna({ id: 3, partida: "L23081", saldoDoses: 15, custoUnitario: "133.33" }),
        seedPartidaInterna({ id: 4, machoId: 8, saldoDoses: 10, partida: "OUTRO" }),
      ],
      movimentacoes: [],
      nextPartidaId: 5,
      nextMovId: 1,
    });

    const rows = await listSemenPartidasDisponiveisInseminacaoLocal(USER_ID, {
      fazendaId: FAZENDA_ID,
      origem: SEMEN_ORIGEM_INTERNO,
      machoId: 7,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.partida).sort()).toEqual(["L23081", SEMEN_PARTIDA_SEM_LOTE]);
  });

  it("teste A — touro 16 / Sem lote consome 1 dose e persiste metadata", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [seedPartidaInterna({ id: 2, saldoDoses: 15, custoUnitario: "100.00" })],
      movimentacoes: [],
      nextPartidaId: 3,
      nextMovId: 1,
    });

    const result = await registrarInseminacaoComSemenLocal(
      USER_ID,
      {
        fazendaId: FAZENDA_ID,
        femeaId: 15,
        machoId: 7,
        dataCobertura: new Date("2026-08-25"),
        dataPrevistoParto: new Date("2027-06-04"),
        resultado: null,
        observacoes: null,
        inseminador: "João",
        ecc: 2.5,
        semenPartidaId: 2,
        origemReprodutor: SEMEN_ORIGEM_INTERNO,
        machoIdReprodutor: 7,
      },
      packIaObs,
    );

    expect(result.id).toBe(9001);
    expect(result.movimentacaoId).toBe(1);

    const partida = await getSemenPartidaByIdLocal(USER_ID, 2);
    expect(partida?.saldoDoses).toBe(14);
    expect(partida?.custoUnitario).toBe("100.00");
    expect(partida?.movimentacoes).toHaveLength(1);
    expect(partida?.movimentacoes[0]?.tipo).toBe(SEMEN_MOV_TIPO_SAIDA_IA);
    expect(partida?.movimentacoes[0]?.quantidadeDoses).toBe(1);
    expect(partida?.movimentacoes[0]?.custoTotal).toBe("100.00");

    const obsArg = vi.mocked(createLocalReproducaoRegistro).mock.calls[0]?.[1]?.observacoes;
    const meta = unpackReproObservacoes(obsArg);
    expect(meta.semenPartidaId).toBe(2);
    expect(meta.partidaSemen).toBe(SEMEN_PARTIDA_SEM_LOTE);
    expect(meta.custoDoseSemen).toBe(100);
    expect(meta.inseminador).toBe("João");
    expect(meta.ecc).toBe(2.5);
  });

  it("teste B — L23081 com custo 133,33", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        seedPartidaInterna({ id: 5, partida: "L23081", saldoDoses: 15, custoUnitario: "133.33" }),
      ],
      movimentacoes: [],
      nextPartidaId: 6,
      nextMovId: 1,
    });

    await registrarInseminacaoComSemenLocal(
      USER_ID,
      {
        fazendaId: FAZENDA_ID,
        femeaId: 15,
        machoId: 7,
        dataCobertura: new Date("2026-08-25"),
        semenPartidaId: 5,
        origemReprodutor: SEMEN_ORIGEM_INTERNO,
        machoIdReprodutor: 7,
      },
      packIaObs,
    );

    const partida = await getSemenPartidaByIdLocal(USER_ID, 5);
    expect(partida?.saldoDoses).toBe(14);
    const meta = unpackReproObservacoes(
      vi.mocked(createLocalReproducaoRegistro).mock.calls[0]?.[1]?.observacoes,
    );
    expect(meta.partidaSemen).toBe("L23081");
    expect(meta.custoDoseSemen).toBe(133.33);
  });

  it("teste C — última dose esgota partida", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [seedPartidaInterna({ id: 2, saldoDoses: 1 })],
      movimentacoes: [],
      nextPartidaId: 3,
      nextMovId: 1,
    });

    await registrarInseminacaoComSemenLocal(
      USER_ID,
      {
        fazendaId: FAZENDA_ID,
        femeaId: 15,
        machoId: 7,
        dataCobertura: new Date("2026-08-25"),
        semenPartidaId: 2,
        origemReprodutor: SEMEN_ORIGEM_INTERNO,
        machoIdReprodutor: 7,
      },
      packIaObs,
    );

    const partida = await getSemenPartidaByIdLocal(USER_ID, 2);
    expect(partida?.saldoDoses).toBe(0);
    expect(partida?.status).toBe(SEMEN_STATUS_ESGOTADO);
  });

  it("teste D — saldo zero rejeita", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [seedPartidaInterna({ id: 2, saldoDoses: 0 })],
      movimentacoes: [],
      nextPartidaId: 3,
      nextMovId: 1,
    });

    await expect(
      registrarInseminacaoComSemenLocal(
        USER_ID,
        {
          fazendaId: FAZENDA_ID,
          femeaId: 15,
          machoId: 7,
          dataCobertura: new Date("2026-08-25"),
          semenPartidaId: 2,
          origemReprodutor: SEMEN_ORIGEM_INTERNO,
          machoIdReprodutor: 7,
        },
        packIaObs,
      ),
    ).rejects.toThrow(MSG_SEMEN_SEM_DOSES);

    expect(createLocalReproducaoRegistro).not.toHaveBeenCalled();
    const partida = await getSemenPartidaByIdLocal(USER_ID, 2);
    expect(partida?.saldoDoses).toBe(0);
    expect(partida?.movimentacoes).toHaveLength(0);
  });

  it("teste E — partida de outro touro rejeita", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [seedPartidaInterna({ id: 9, machoId: 8, saldoDoses: 5 })],
      movimentacoes: [],
      nextPartidaId: 10,
      nextMovId: 1,
    });

    await expect(
      registrarInseminacaoComSemenLocal(
        USER_ID,
        {
          fazendaId: FAZENDA_ID,
          femeaId: 15,
          machoId: 7,
          dataCobertura: new Date("2026-08-25"),
          semenPartidaId: 9,
          origemReprodutor: SEMEN_ORIGEM_INTERNO,
          machoIdReprodutor: 7,
        },
        packIaObs,
      ),
    ).rejects.toThrow(MSG_SEMEN_PARTIDA_INCOMPATIVEL);
  });

  it("teste F — partida de outra fazenda rejeita", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [seedPartidaInterna({ id: 2, fazendaId: 2, saldoDoses: 5 })],
      movimentacoes: [],
      nextPartidaId: 3,
      nextMovId: 1,
    });

    await expect(
      registrarInseminacaoComSemenLocal(
        USER_ID,
        {
          fazendaId: FAZENDA_ID,
          femeaId: 15,
          machoId: 7,
          dataCobertura: new Date("2026-08-25"),
          semenPartidaId: 2,
          origemReprodutor: SEMEN_ORIGEM_INTERNO,
          machoIdReprodutor: 7,
        },
        packIaObs,
      ),
    ).rejects.toThrow(MSG_SEMEN_PARTIDA_INCOMPATIVEL);
  });

  it("teste G — concorrência simulada na última dose", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [seedPartidaInterna({ id: 2, saldoDoses: 1 })],
      movimentacoes: [],
      nextPartidaId: 3,
      nextMovId: 1,
    });

    const params = {
      fazendaId: FAZENDA_ID,
      femeaId: 15,
      machoId: 7,
      dataCobertura: new Date("2026-08-25"),
      semenPartidaId: 2,
      origemReprodutor: SEMEN_ORIGEM_INTERNO as const,
      machoIdReprodutor: 7,
    };

    await registrarInseminacaoComSemenLocal(USER_ID, params, packIaObs);

    await expect(registrarInseminacaoComSemenLocal(USER_ID, params, packIaObs)).rejects.toThrow(
      MSG_SEMEN_SEM_DOSES,
    );

    const partida = await getSemenPartidaByIdLocal(USER_ID, 2);
    expect(partida?.saldoDoses).toBe(0);
    expect(partida?.movimentacoes.filter(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA)).toHaveLength(1);
  });

  it("GSC-7117 consome 1 dose, machoId permanece null e custo 200", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        {
          id: 4,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          origemReprodutor: SEMEN_ORIGEM_EXTERNO,
          reprodutorKey: "e:gsc-7117",
          machoId: null,
          reprodutorTexto: "GSC-7117",
          partida: SEMEN_PARTIDA_SEM_LOTE,
          centralOrigem: "Alta",
          saldoDoses: 5,
          custoUnitario: "200.00",
          status: SEMEN_STATUS_DISPONIVEL,
          observacoes: null,
          createdAt: new Date("2026-08-26") as unknown as Date,
          updatedAt: new Date("2026-08-26") as unknown as Date,
        },
      ],
      movimentacoes: [],
      nextPartidaId: 5,
      nextMovId: 1,
    });

    const disponiveis = await listSemenPartidasDisponiveisInseminacaoLocal(USER_ID, {
      fazendaId: FAZENDA_ID,
      origem: SEMEN_ORIGEM_EXTERNO,
      reprodutorKey: "e:gsc-7117",
      reprodutorTexto: "GSC-7117",
    });
    expect(disponiveis).toHaveLength(1);

    const result = await registrarInseminacaoComSemenLocal(
      USER_ID,
      {
        fazendaId: FAZENDA_ID,
        femeaId: 15,
        machoId: null,
        dataCobertura: new Date("2026-08-26"),
        semenPartidaId: 4,
        origemReprodutor: SEMEN_ORIGEM_EXTERNO,
        reprodutorTextoExterno: "GSC-7117",
      },
      packIaObs,
    );

    expect(result.movimentacaoId).toBe(1);
    const persistido = vi.mocked(createLocalReproducaoRegistro).mock.calls[0]?.[1];
    expect(persistido?.machoId).toBeUndefined();

    const partida = await getSemenPartidaByIdLocal(USER_ID, 4);
    expect(partida?.saldoDoses).toBe(4);
    expect(partida?.custoUnitario).toBe("200.00");
    expect(partida?.machoId).toBeNull();

    const meta = unpackReproObservacoes(persistido?.observacoes);
    expect(meta.semenPartidaId).toBe(4);
    expect(meta.partidaSemen).toBe(SEMEN_PARTIDA_SEM_LOTE);
    expect(meta.custoDoseSemen).toBe(200);
  });
});

describe("applySemenSaidaIa", () => {
  it("não altera custo unitário após consumo", () => {
    const r = applySemenSaidaIa({ saldoAnterior: 15, custoUnitario: "100.00" });
    expect(r.novoSaldo).toBe(14);
    expect(r.novoCustoUnitario).toBe("100.00");
  });
});

describe("validateSemenPartidaReprodutorCompat", () => {
  it("aceita macho interno compatível", () => {
    expect(
      validateSemenPartidaReprodutorCompat({
        origem: SEMEN_ORIGEM_INTERNO,
        partidaMachoId: 7,
        partidaReprodutorKey: "m:7",
        machoId: 7,
      }),
    ).toBe(true);
  });

  it("aceita reprodutor externo pela chave", () => {
    expect(
      validateSemenPartidaReprodutorCompat({
        origem: SEMEN_ORIGEM_EXTERNO,
        partidaMachoId: null,
        partidaReprodutorKey: "e:gsc-7117",
        reprodutorTexto: "GSC-7117",
      }),
    ).toBe(true);
  });

  it("rejeita match parcial externo", () => {
    expect(
      validateSemenPartidaReprodutorCompat({
        origem: SEMEN_ORIGEM_EXTERNO,
        partidaMachoId: null,
        partidaReprodutorKey: "e:gsc-7117",
        reprodutorTexto: "GSC-711",
      }),
    ).toBe(false);
  });
});
