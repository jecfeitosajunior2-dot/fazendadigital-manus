import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  concluirOperacaoInseminacao,
  operacaoInseminacaoAtual,
} from "../client/src/lib/operacaoInseminacao";
import {
  lancarInseminacaoSemenEEspelhar,
  MSG_OPERACAO_IA_OBRIGATORIA,
  PERMISSAO_REPRODUCAO,
  type IoInseminacao,
  type PedidoInseminacao,
} from "./inseminacaoSemenAutorizado";
import { MSG_REPRO_DATA_FUTURA } from "./registrarManejoAutorizado";
import { SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO } from "../shared/semenUtilizado";

const ioFechado: IoInseminacao = {
  async emTransacao() {
    throw new Error("a transação não deveria abrir");
  },
};

function pedido(dataCobertura: string): PedidoInseminacao {
  return {
    executorId: 1,
    sessionVersionDaSessao: 1,
    input: {
      animalId: 71,
      fazendaId: 10,
      tipo: "Inseminação",
      dataCobertura,
      semenPartidaId: 500,
      machoId: 80,
      operacaoId: "00000000-0000-4000-8000-0000000000aa",
    },
  };
}

describe("inseminação com sêmen", () => {
  it("recusa data futura antes de abrir o banco", async () => {
    const resultado = await lancarInseminacaoSemenEEspelhar(ioFechado, pedido("2099-01-01"), {
      async inseminar() { throw new Error("espelho não deveria rodar"); },
    });
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_REPRO_DATA_FUTURA });
  });

  it("usa a permissão de reprodução e não cria consumo de sêmen", () => {
    expect(PERMISSAO_REPRODUCAO).toBe("reproducao.criar");
    expect(permissaoPorId("semen.consumir")).toBeNull();
    expect(permissaoPorId("semen.editar")?.descricao).toMatch(/ajustar estoque/i);
    expect(SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO).toBe(1);
  });

  it("a tela continua mandando partida e inseminador, e o espelho só entra depois do banco", async () => {
    const tela = readFileSync(new URL("../client/src/pages/ManejoPages.tsx", import.meta.url), "utf8");
    expect(tela).toContain("trpc.reproducao.create.useMutation");
    expect(tela).toContain("semenPartidaId");
    expect(tela).toContain("inseminador");
    expect(tela).toContain("operacaoInseminacaoAtual");
    expect(tela).toContain("concluirOperacaoInseminacao");
    const curral = readFileSync(new URL("../client/src/components/curral/CurralReprodutivoPanel.tsx", import.meta.url), "utf8");
    expect(curral).toContain("operacaoInseminacaoAtual(\"curral\"");
    let espelhou = false;
    await expect(lancarInseminacaoSemenEEspelhar({
      async emTransacao() {
        const erro = new Error("connect ECONNREFUSED 127.0.0.1:3306");
        (erro as { code?: string }).code = "ECONNREFUSED";
        throw erro;
      },
    }, pedido("2026-11-10"), {
      async inseminar() { espelhou = true; },
    })).rejects.toThrow(/ECONNREFUSED/);
    expect(espelhou).toBe(false);
  });

  it("não abre o banco sem a chave e outra inseminação recebe outra chave", async () => {
    let abriu = false;
    const semChave = await lancarInseminacaoSemenEEspelhar({
      async emTransacao() {
        abriu = true;
        throw new Error("não abrir");
      },
    }, { ...pedido("2026-11-10"), input: { ...pedido("2026-11-10").input, operacaoId: "" } }, {
      async inseminar() { throw new Error("espelho"); },
    });
    expect(semChave).toMatchObject({ ok: false, mensagem: MSG_OPERACAO_IA_OBRIGATORIA });
    expect(abriu).toBe(false);
    concluirOperacaoInseminacao("manejo");
    const primeira = operacaoInseminacaoAtual("manejo", "matriz-70|partida-500");
    expect(operacaoInseminacaoAtual("manejo", "matriz-70|partida-500")).toBe(primeira);
    const outra = operacaoInseminacaoAtual("manejo", "matriz-71|partida-500");
    expect(outra).not.toBe(primeira);
    concluirOperacaoInseminacao("manejo");
    expect(operacaoInseminacaoAtual("manejo", "matriz-70|partida-500")).not.toBe(primeira);
  });
});
