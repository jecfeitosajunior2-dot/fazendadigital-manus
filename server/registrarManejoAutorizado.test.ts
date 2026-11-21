import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MSG_CASTRACAO_DATA_FUTURA } from "../shared/castracaoManejo";
import {
  MSG_REPRO_DATA_FUTURA,
  PERMISSAO_CASTRACAO,
  PERMISSAO_REPRODUCAO,
  castrarAnimalAutorizado,
  registrarReproducaoSimplesAutorizado,
  type IoManejo,
  type PedidoCastracao,
  type PedidoReproducaoSimples,
} from "./registrarManejoAutorizado";

const ioFechado: IoManejo = {
  async emTransacao() {
    throw new Error("a transação não deveria abrir");
  },
};

function pedidoCastracao(dataCastracao: string): PedidoCastracao {
  return {
    executorId: 1,
    sessionVersionDaSessao: 1,
    input: { fazendaId: 10, animalId: 70, dataCastracao, metodo: "cirurgica" },
  };
}

function pedidoRepro(dataCobertura: string): PedidoReproducaoSimples {
  return {
    executorId: 1,
    sessionVersionDaSessao: 1,
    input: {
      animalId: 71,
      fazendaId: 10,
      tipo: "Diagnóstico de prenhez",
      dataCobertura,
      resultado: "Prenha",
    },
  };
}

describe("castração e reprodução simples", () => {
  it("recusa data futura antes de abrir o banco", async () => {
    const castracao = await castrarAnimalAutorizado(ioFechado, pedidoCastracao("2099-01-01"));
    expect(castracao).toMatchObject({ ok: false, mensagem: MSG_CASTRACAO_DATA_FUTURA });
    const reproducao = await registrarReproducaoSimplesAutorizado(ioFechado, pedidoRepro("2099-01-01"));
    expect(reproducao).toMatchObject({ ok: false, mensagem: MSG_REPRO_DATA_FUTURA });
  });

  it("usa as permissões que já existem e não cria outra", () => {
    expect(PERMISSAO_CASTRACAO).toBe("saude.criar");
    expect(PERMISSAO_REPRODUCAO).toBe("reproducao.criar");
  });

  it("a rota protege castração, diagnóstico, inseminação, parto e a estação", () => {
    const rota = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const castracao = rota.slice(rota.indexOf("registrarCastracao: protectedProcedure"), rota.indexOf("REPRODUCAO ROUTER"));
    expect(castracao).toContain("castrarEEspelharAnimal");
    expect(castracao).toContain("Banco de dados indisponível.");
    expect(castracao).not.toContain("registrarCastracao(");
    expect(rota).toContain("registrarReproducaoSimplesEEspelhar");
    expect(rota).toContain("lancarInseminacaoSemenEEspelhar");
    expect(rota).toContain("registrarReproducaoColetivaAutorizada");
    expect(rota).toContain("registrarPartoAutorizado");
    expect(rota).not.toContain("registrarInseminacaoComSemenLocal");
    expect(rota).not.toContain("executeRegistrarPartoComCrias");
    expect(rota).toContain("lancarSanidadeEEspelhar");
    expect(rota).toContain("estornarSanidadeAutorizado");
    expect(rota).toContain("recusarExclusaoFisicaAnimal()");
    const telaCastracao = readFileSync(new URL("../client/src/pages/ManejoCastracaoForm.tsx", import.meta.url), "utf8");
    expect(telaCastracao).toContain("trpc.saude.registrarCastracao.useMutation");
    const telaRepro = readFileSync(new URL("../client/src/pages/ManejoPages.tsx", import.meta.url), "utf8");
    expect(telaRepro).toContain("trpc.reproducao.create.useMutation");
  });
});
