import { describe, expect, it } from "vitest";
import { MSG_MANUT_EDICAO_PATRIMONIAL, MSG_MANUT_NAO_ENCONTRADA } from "../shared/manutencaoEstoque";
import {
  MANUT_PECA_ORIGEM_OFICINA,
  MSG_MANUT_EDICAO_ESTORNADA,
  MSG_MANUT_OFICINA_SO_TERCEIRIZADA,
  MSG_MANUT_ORIGEM_IMUTAVEL,
} from "../shared/manutencaoPecasOrigem";
import { editarPecasOficinaNoTx, type EdicaoOficinaCtx } from "./manutencaoOficinaEdicao";

const pecaOficina = {
  origem: MANUT_PECA_ORIGEM_OFICINA,
  nome: "Retentor",
  quantidade: 2,
  valorUnitario: 40,
  valorTotal: 80,
} as const;

function ctxEdicao(opts?: {
  status?: string;
  pecas?: Array<{
    origem?: string | null;
    estoqueId?: number | null;
    quantidade?: string | number;
    valorTotal?: string;
    estoqueMovimentacaoId?: number | null;
  }>;
  falharSubstituir?: boolean;
  userId?: number;
}): EdicaoOficinaCtx & { log: string[]; pecasAtuais: unknown[]; osPatch: unknown } {
  const log: string[] = [];
  const pecasAtuais = [...(opts?.pecas ?? [{ origem: "oficina", quantidade: 2, valorTotal: "80.00" }])];
  const osPatch: { current?: unknown } = {};
  return {
    log,
    pecasAtuais,
    osPatch,
    async bloquearOs() {
      log.push("lock");
      return {
        id: 20,
        userId: opts?.userId ?? 910001,
        status: opts?.status ?? "concluida",
        valorPecas: "80.00",
        valorPecasOficina: "80.00",
        valorMaoObra: "250.00",
      };
    },
    async listarPecas() {
      log.push("pecas");
      return pecasAtuais;
    },
    async substituirPecasOficina(pecas) {
      log.push(`oficina:${pecas.map((p) => `${p.nome}:${p.quantidade}x${p.valorUnitario}`).join("|")}`);
      if (opts?.falharSubstituir) throw new Error("falha sintética edição");
      pecasAtuais.splice(0, pecasAtuais.length, ...pecas);
    },
    async atualizarOs(patch) {
      log.push(`totais:${patch.valorPecas}:${patch.valorPecasOficina}:${patch.valorCobradoOficina}:${patch.valorTotal}`);
      osPatch.current = patch;
    },
  };
}

const inputBase = {
  userId: 910001,
  id: 20,
  tipoExecucao: "externa" as const,
  valorMaoObra: 250,
  pecasEstoqueInput: [] as Array<{ estoqueId?: number | null; quantidade: number }>,
  pecasOficina: [pecaOficina],
};

describe("editar peças da oficina", () => {
  it("edita a descrição e recalcula o total no servidor", async () => {
    const ctx = ctxEdicao();
    const r = await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasOficina: [{ ...pecaOficina, nome: "Retentor reforçado", valorTotal: 999 }],
    });
    expect(ctx.log[0]).toBe("lock");
    expect(r.totais.valorPecasOficina).toBe("80.00");
    expect(r.totais.valorCobradoOficina).toBe("330.00");
  });

  it("repassa o pessoaId oficial do prestador no cabeçalho", async () => {
    const ctx = ctxEdicao();
    await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      cabecalho: {
        prestadorNome: "Oficina Central",
        prestadorPessoaId: 7,
      },
    });
    expect((ctx.osPatch.current as { prestadorPessoaId?: number }).prestadorPessoaId).toBe(7);
  });

  it("altera quantidade e valor unitário com total oficial do servidor", async () => {
    const ctx = ctxEdicao();
    const r = await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasOficina: [{
        origem: MANUT_PECA_ORIGEM_OFICINA,
        nome: "Retentor",
        quantidade: 3,
        valorUnitario: 50,
        valorTotal: 1,
      }],
    });
    expect(r.totais.valorPecasOficina).toBe("150.00");
    expect(r.totais.valorTotal).toBe("400.00");
    expect(r.totais.valorCobradoOficina).toBe("400.00");
  });

  it("OS mista preserva o snapshot do estoque nos totais", async () => {
    const ctx = ctxEdicao({
      pecas: [
        { origem: "estoque", estoqueId: 33, quantidade: 1, valorTotal: "25.00", estoqueMovimentacaoId: 156 },
        { origem: "oficina", quantidade: 2, valorTotal: "80.00" },
      ],
    });
    const r = await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasEstoqueInput: [{ estoqueId: 33, quantidade: 1 }],
      pecasOficina: [{ ...pecaOficina, quantidade: 1, valorUnitario: 40, valorTotal: 40 }],
    });
    expect(r.totais.valorPecas).toBe("65.00");
    expect(r.totais.valorPecasOficina).toBe("40.00");
    expect(r.totais.valorTotal).toBe("315.00");
  });

  it("falha ao gravar oficina não chega a persistir totais", async () => {
    const ctx = ctxEdicao({ falharSubstituir: true });
    await expect(editarPecasOficinaNoTx(ctx, inputBase)).rejects.toThrow(/falha sintética edição/);
    expect(ctx.log.some((l) => l.startsWith("totais:"))).toBe(false);
  });

  it("bloqueia OS estornada", async () => {
    const ctx = ctxEdicao({ status: "estornado" });
    await expect(editarPecasOficinaNoTx(ctx, inputBase)).rejects.toThrow(MSG_MANUT_EDICAO_ESTORNADA);
    expect(ctx.log).toEqual(["lock"]);
  });

  it("bloqueia alteração patrimonial da peça do estoque", async () => {
    const ctx = ctxEdicao({
      pecas: [
        { origem: "estoque", estoqueId: 33, quantidade: 1, valorTotal: "25.00", estoqueMovimentacaoId: 156 },
      ],
    });
    await expect(editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasEstoqueInput: [{ estoqueId: 33, quantidade: 4 }],
    })).rejects.toThrow(MSG_MANUT_EDICAO_PATRIMONIAL);
  });

  it("bloqueia converter origem da peça", async () => {
    const ctx = ctxEdicao({
      pecas: [{ origem: "oficina", quantidade: 2, valorTotal: "80.00" }],
    });
    await expect(editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasOficina: [],
      pecasEstoqueInput: [{ estoqueId: 33, quantidade: 1 }],
    })).rejects.toThrow(MSG_MANUT_ORIGEM_IMUTAVEL);
  });

  it("rejeita oficina em manutenção interna", async () => {
    const ctx = ctxEdicao();
    await expect(editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      tipoExecucao: "interna",
    })).rejects.toThrow(MSG_MANUT_OFICINA_SO_TERCEIRIZADA);
  });

  it("duas edições em sequência ficam com o último total consistente", async () => {
    const ctx = ctxEdicao();
    await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasOficina: [{ ...pecaOficina, quantidade: 3, valorUnitario: 40, valorTotal: 120 }],
    });
    const segunda = await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasOficina: [{ ...pecaOficina, quantidade: 1, valorUnitario: 10, valorTotal: 10 }],
    });
    expect(segunda.totais.valorPecasOficina).toBe("10.00");
    expect(segunda.totais.valorTotal).toBe("260.00");
    expect(ctx.log.filter((l) => l === "lock")).toHaveLength(2);
  });

  it("registro antigo sem origem de estoque continua congelado", async () => {
    const ctx = ctxEdicao({
      pecas: [
        { origem: null, estoqueId: 33, quantidade: 1, valorTotal: "25.00", estoqueMovimentacaoId: 156 },
      ],
    });
    const r = await editarPecasOficinaNoTx(ctx, {
      ...inputBase,
      pecasEstoqueInput: [{ estoqueId: 33, quantidade: 1 }],
      pecasOficina: [pecaOficina],
    });
    expect(r.totais.valorPecas).toBe("105.00");
    expect(r.totais.valorPecasOficina).toBe("80.00");
  });

  it("OS de outro usuário não é editada", async () => {
    const ctx = ctxEdicao({ userId: 7 });
    await expect(editarPecasOficinaNoTx(ctx, inputBase)).rejects.toThrow(MSG_MANUT_NAO_ENCONTRADA);
  });
});
