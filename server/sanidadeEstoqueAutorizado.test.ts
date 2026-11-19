import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFimCarenciaPorAnimal } from "../shared/carenciaAnimal";
import {
  MSG_SEM_PERMISSAO_ESTORNO_SAUDE,
  PERMISSAO_SAUDE_CRIAR,
  PERMISSAO_SAUDE_INATIVAR,
  erroEstornoSanidade,
  lancarSanidadeAutorizado,
  type IoSanidade,
  type PedidoSanidade,
} from "./sanidadeEstoqueAutorizado";

const ioFechado: IoSanidade = {
  async emTransacao() {
    throw new Error("a transação não deveria abrir");
  },
};

describe("sanidade com estoque", () => {
  it("recusa data futura antes de abrir o banco", async () => {
    const pedido: PedidoSanidade = {
      executorId: 1,
      sessionVersionDaSessao: 1,
      input: {
        animalId: 70,
        fazendaId: 10,
        tipo: "Outro",
        descricao: "curativo",
        dataRegistro: "2099-01-01",
      },
    };
    const resultado = await lancarSanidadeAutorizado(ioFechado, pedido);
    expect(resultado).toMatchObject({
      ok: false,
      mensagem: "A data do manejo sanitário não pode ser futura.",
    });
  });

  it("usa as permissões que já existem", () => {
    expect(PERMISSAO_SAUDE_CRIAR).toBe("saude.criar");
    expect(PERMISSAO_SAUDE_INATIVAR).toBe("saude.inativar");
    expect(erroEstornoSanidade({ ok: false, motivo: "sem_permissao" }).message).toBe(MSG_SEM_PERMISSAO_ESTORNO_SAUDE);
  });

  it("a carência continua na data gravada e a tela chama as mesmas rotas", () => {
    const hoje = new Date(2026, 10, 19);
    const fim = buildFimCarenciaPorAnimal([
      { animalId: 70, medicamento: "Ivomec", dataRegistro: "2026-11-10", proximaData: "2026-12-01" },
    ], new Map(), hoje);
    expect(fim.get(70)?.getDate()).toBe(1);
    const tela = readFileSync(new URL("../client/src/pages/ManejoPages.tsx", import.meta.url), "utf8");
    expect(tela).toContain("trpc.saude.create.useMutation");
    const lista = readFileSync(new URL("../client/src/pages/ReproductionManagementPage.tsx", import.meta.url), "utf8");
    expect(lista).toContain("trpc.saude.delete.useMutation");
    expect(lista).toContain("O registro permanece no histórico.");
    const curral = readFileSync(new URL("../client/src/components/curral/CurralSanitarioPanel.tsx", import.meta.url), "utf8");
    expect(curral).toContain("trpc.saude.create.useMutation");
  });
});
