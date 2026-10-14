import { describe, expect, it } from "vitest";
import { decidirEstornoManutencao, MSG_MANUT_ESTORNO_LEGADO } from "../shared/manutencaoEstoque";
import {
  estornoCompletoSemMovimentacao,
  MANUT_PECA_ORIGEM_OFICINA,
} from "../shared/manutencaoPecasOrigem";
import {
  complementoTotaisOs,
  estornarManutencaoCompletaNoTx,
  persistirManutencaoCompletaNoTx,
  type PersistenciaCompletaCtx,
  type PersistirManutencaoCompletaInput,
} from "./manutencaoCompleta";
import { ManutencaoEstoqueError, type ManutencaoEstoqueTx } from "./manutencaoEstoque";

const pecaOficina = {
  origem: MANUT_PECA_ORIGEM_OFICINA,
  nome: "Retentor",
  quantidade: 2,
  valorUnitario: 40,
  valorTotal: 80,
} as const;

const pecaEstoque = {
  estoqueId: 33,
  nome: "Parafuso do Eixo",
  quantidade: 1,
  valorUnitario: 25,
};

function inputBase(
  extras: Partial<PersistirManutencaoCompletaInput> = {},
): PersistirManutencaoCompletaInput {
  return {
    userId: 910001,
    registradoPor: "Teste isolado",
    maquinaId: 4,
    fazendaId: 1,
    tipo: "Corretiva",
    descricao: "Reparo sintético",
    data: "2026-10-14",
    valorMaoObra: 250,
    pecas: [],
    pecasOficina: [],
    tipoExecucao: "externa",
    ...extras,
  };
}

function ctxGravacao(log: string[], opts?: { falharOficina?: boolean }): PersistenciaCompletaCtx {
  return {
    async persistirEstoque() {
      log.push("estoque");
      return { id: 10, pecaIds: [15], movimentacaoIds: [156] };
    },
    async inserirOsSemEstoque(row) {
      log.push(`os-sem-estoque:${row.prestadorPessoaId ?? "sem-pessoa"}`);
      return 20;
    },
    async marcarOrigemEstoque(ids) {
      log.push(`origem-estoque:${ids.join(",")}`);
    },
    async gravarPecasOficina(osId, pecas) {
      log.push(`oficina:${osId}:${pecas.length}`);
      if (opts?.falharOficina) throw new Error("falha sintética oficina");
      return pecas.map((_, i) => 80 + i);
    },
    async lerTotaisOs() {
      log.push("ler-totais");
      return { valorPecas: 25, valorMaoObra: 250 };
    },
    async atualizarComplementoOs(osId, patch) {
      log.push(`totais:${osId}:${patch.valorPecas}:${patch.valorPecasOficina}:${patch.valorCobradoOficina}:${patch.valorTotal}`);
    },
  };
}

function motorFake(pecas: Array<{
  estoqueId?: number | null;
  quantidade?: string | number;
  estoqueMovimentacaoId?: number | null;
}>, status = "concluida"): ManutencaoEstoqueTx {
  const updates: unknown[] = [];
  return {
    findOs: async () => ({ id: 13, userId: 910001, maquinaId: 4, status }),
    listPecas: async () => pecas.map((p, i) => ({
      id: i + 1,
      manutencaoId: 13,
      ...p,
      nome: "x",
      quantidade: p.quantidade ?? 1,
    })),
    updateOs: async (_id, patch) => {
      updates.push(patch);
    },
    updates,
  } as ManutencaoEstoqueTx & { updates: unknown[] };
}

describe("totais complementares após o motor", () => {
  it("soma estoque oficial, oficina e mão de obra", () => {
    const c = complementoTotaisOs({
      valorPecasEstoqueOficial: 25,
      pecasOficina: [pecaOficina],
      valorMaoObra: 250,
    });
    expect(c.valorPecas).toBe("105.00");
    expect(c.valorPecasOficina).toBe("80.00");
    expect(c.valorCobradoOficina).toBe("330.00");
    expect(c.valorTotal).toBe("355.00");
  });
});

describe("persistir OS completa — ordem e rollback lógico", () => {
  it("OS só com peças da oficina não chama o motor patrimonial", async () => {
    const log: string[] = [];
    const r = await persistirManutencaoCompletaNoTx(
      ctxGravacao(log),
      inputBase({ pecasOficina: [pecaOficina] }),
    );
    expect(r.id).toBe(20);
    expect(r.movimentacaoIds).toEqual([]);
    expect(log.some((l) => l === "estoque")).toBe(false);
    expect(log[0]).toBe("os-sem-estoque:sem-pessoa");
    expect(log[1]).toBe("oficina:20:1");
  });

  it("OS só com oficina grava pessoaId e não exige fazendaId no motor", async () => {
    const log: string[] = [];
    const r = await persistirManutencaoCompletaNoTx(
      ctxGravacao(log),
      inputBase({
        fazendaId: null,
        pecasOficina: [pecaOficina],
        prestadorPessoaId: 7,
      }),
    );
    expect(r.id).toBe(20);
    expect(log[0]).toBe("os-sem-estoque:7");
    expect(log.some((l) => l === "estoque")).toBe(false);
  });

  it("OS com estoque recusa fazendaId 0 antes de chamar o motor", async () => {
    const log: string[] = [];
    await expect(persistirManutencaoCompletaNoTx(
      ctxGravacao(log),
      inputBase({ pecas: [pecaEstoque], fazendaId: 0 }),
    )).rejects.toThrow(/Informe a fazenda da máquina/);
    expect(log.some((l) => l === "estoque")).toBe(false);
  });

  it("OS só com mão de obra terceirizada não gera peça nem movimentação", async () => {
    const log: string[] = [];
    const r = await persistirManutencaoCompletaNoTx(
      ctxGravacao(log),
      inputBase({ pecasOficina: [], valorMaoObra: 180 }),
    );
    expect(r.pecaIds).toEqual([]);
    expect(r.pecaOficinaIds).toEqual([]);
    expect(r.movimentacaoIds).toEqual([]);
    expect(log).toEqual(["os-sem-estoque:sem-pessoa", "oficina:20:0"]);
  });

  it("OS com as duas origens: motor, origem, oficina e totais na mesma sequência", async () => {
    const log: string[] = [];
    const r = await persistirManutencaoCompletaNoTx(
      ctxGravacao(log),
      inputBase({ pecas: [pecaEstoque], pecasOficina: [pecaOficina] }),
    );
    expect(r.id).toBe(10);
    expect(r.pecaIds).toEqual([15]);
    expect(r.movimentacaoIds).toEqual([156]);
    expect(log).toEqual([
      "estoque",
      "origem-estoque:15",
      "oficina:10:1",
      "ler-totais",
      "totais:10:105.00:80.00:330.00:355.00",
    ]);
  });

  it("falha ao gravar peça da oficina ocorre depois do motor — a transação deve reverter tudo", async () => {
    const log: string[] = [];
    await expect(
      persistirManutencaoCompletaNoTx(
        ctxGravacao(log, { falharOficina: true }),
        inputBase({ pecas: [pecaEstoque], pecasOficina: [pecaOficina] }),
      ),
    ).rejects.toThrow(/falha sintética oficina/);
    expect(log[0]).toBe("estoque");
    expect(log).toContain("oficina:10:1");
    expect(log.some((l) => l.startsWith("totais:"))).toBe(false);
  });
});

describe("estornar OS completa", () => {
  it("OS só com oficina altera status e não chama o motor patrimonial", async () => {
    const motor = motorFake([{ origem: "oficina", quantidade: 2, estoqueId: null }]);
    let patrimonialChamado = false;
    const r = await estornarManutencaoCompletaNoTx(motor, {
      userId: 910001,
      registradoPor: "Teste",
      id: 13,
      motivo: "Oficina cobrou errado",
      hojeISO: "2026-10-14",
    }, async () => {
      patrimonialChamado = true;
      return { id: 13, movimentacaoEstornoIds: [999] };
    });
    expect(r).toEqual({ handled: true, id: 13, movimentacaoEstornoIds: [] });
    expect(patrimonialChamado).toBe(false);
    expect((motor as { updates: unknown[] }).updates).toEqual([{
      status: "estornado",
      estornadoEmAgora: true,
      motivoEstorno: "Oficina cobrou errado",
    }]);
  });

  it("OS só com mão de obra terceirizada estorna o registro", async () => {
    const motor = motorFake([]);
    const r = await estornarManutencaoCompletaNoTx(motor, {
      userId: 910001,
      registradoPor: "Teste",
      id: 13,
      hojeISO: "2026-10-14",
    }, async () => {
      throw new Error("motor não deveria rodar");
    });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.movimentacaoEstornoIds).toEqual([]);
    expect(estornoCompletoSemMovimentacao("sem_consumo")).toBe(true);
  });

  it("OS mista delega só o motor homologado", async () => {
    const motor = motorFake([
      { estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
      { estoqueId: null, quantidade: 2, estoqueMovimentacaoId: null },
    ]);
    const r = await estornarManutencaoCompletaNoTx(motor, {
      userId: 910001,
      registradoPor: "Teste",
      id: 13,
      hojeISO: "2026-10-14",
    }, async () => ({ id: 13, movimentacaoEstornoIds: [200] }));
    expect(r).toEqual({
      handled: true,
      id: 13,
      alreadyEstornado: undefined,
      movimentacaoEstornoIds: [200],
    });
    expect(decidirEstornoManutencao({
      status: "concluida",
      pecas: [
        { estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
        { estoqueId: null, quantidade: 2, estoqueMovimentacaoId: null },
      ],
    })).toEqual({ kind: "com_vinculo", movimentacaoIds: [156] });
  });

  it("segundo estorno é idempotente e não gera movimentação", async () => {
    const motor = motorFake([{ estoqueId: null, quantidade: 2 }], "estornado");
    let patrimonialChamado = false;
    const r = await estornarManutencaoCompletaNoTx(motor, {
      userId: 910001,
      registradoPor: "Teste",
      id: 13,
      hojeISO: "2026-10-14",
    }, async () => {
      patrimonialChamado = true;
      return { id: 13, movimentacaoEstornoIds: [1] };
    });
    expect(r).toEqual({
      handled: true,
      id: 13,
      alreadyEstornado: true,
      movimentacaoEstornoIds: [],
    });
    expect(patrimonialChamado).toBe(false);
    expect((motor as { updates: unknown[] }).updates).toEqual([]);
  });

  it("OS antiga com vínculo oficial de estoque permanece no motor da Fase 1", async () => {
    const motor = motorFake([
      { estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
    ]);
    const r = await estornarManutencaoCompletaNoTx(motor, {
      userId: 910001,
      registradoPor: "Teste",
      id: 13,
      hojeISO: "2026-10-14",
    }, async () => ({ id: 13, movimentacaoEstornoIds: [156] }));
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.movimentacaoEstornoIds).toEqual([156]);
  });

  it("OS antiga com peça de estoque sem vínculo e com capital continua bloqueada", async () => {
    const motor = motorFake([
      { estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: null },
    ]);
    await expect(estornarManutencaoCompletaNoTx(motor, {
      userId: 910001,
      registradoPor: "Teste",
      id: 13,
      hojeISO: "2026-10-14",
      algumEstoqueComCapital: true,
    })).rejects.toThrow(MSG_MANUT_ESTORNO_LEGADO);
  });
});

describe("ManutencaoEstoqueError permanece no domínio", () => {
  it("existe", () => {
    expect(new ManutencaoEstoqueError("x")).toBeInstanceOf(Error);
  });
});
