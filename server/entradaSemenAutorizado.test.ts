import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MSG_SEMEN_DATA_FUTURA, MSG_SEMEN_QUANTIDADE_INVALIDA } from "../shared/semenEstoque";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  MSG_OPERACAO_ENTRADA_OBRIGATORIA,
  PERMISSAO_SEMEN_CRIAR,
  registrarEntradaSemenEEspelhar,
  type IoEntradaSemen,
  type PedidoEntradaSemen,
} from "./entradaSemenAutorizado";
import {
  concluirOperacaoEntradaSemen,
  descartarOperacaoEntradaSemen,
  operacaoEntradaSemenAtual,
} from "../client/src/lib/operacaoEntradaSemen";

const ioFechado: IoEntradaSemen = {
  async emTransacao() {
    throw new Error("a transação não deveria abrir");
  },
};

function pedido(extra: Partial<PedidoEntradaSemen["input"]> = {}): PedidoEntradaSemen {
  return {
    executorId: 1,
    sessionVersionDaSessao: 1,
    fazendaId: 10,
    input: {
      origemReprodutor: "interno",
      machoId: 80,
      partida: "L23081",
      quantidadeDoses: 2,
      custoTotal: 300,
      dataEntrada: "2026-11-10",
      operacaoId: "00000000-0000-4000-8000-000000000001",
      ...extra,
    },
  };
}

describe("entrada de sêmen", () => {
  it("recusa data e quantidade antes de abrir o banco", async () => {
    const futura = await registrarEntradaSemenEEspelhar(ioFechado, pedido({ dataEntrada: "2099-01-01" }), {
      async registrar() { throw new Error("espelho não deveria rodar"); },
    });
    expect(futura).toMatchObject({ ok: false, mensagem: MSG_SEMEN_DATA_FUTURA });
    const quantidade = await registrarEntradaSemenEEspelhar(ioFechado, pedido({ quantidadeDoses: "0" }), {
      async registrar() { throw new Error("espelho não deveria rodar"); },
    });
    expect(quantidade).toMatchObject({ ok: false, mensagem: MSG_SEMEN_QUANTIDADE_INVALIDA });
  });

  it("usa a permissão de entrada e não a de reprodução", () => {
    expect(PERMISSAO_SEMEN_CRIAR).toBe("semen.criar");
    expect(permissaoPorId("semen.criar")?.descricao).toMatch(/entrada/i);
    expect(permissaoPorId("reproducao.criar")?.id).toBe("reproducao.criar");
  });

  it("a tela continua na mesma rota e o espelho não roda sem o banco", async () => {
    const tela = readFileSync(new URL("../client/src/components/semen/NovaEntradaSemenDialog.tsx", import.meta.url), "utf8");
    expect(tela).toContain("trpc.semen.registrarEntrada.useMutation");
    expect(tela).toContain("operacaoEntradaSemenAtual");
    expect(tela).toContain("concluirOperacaoEntradaSemen");
    expect(tela).toContain("descartarOperacaoEntradaSemen");
    const sql = readFileSync(new URL("../drizzle/migrations/0068_semen_entrada_operacoes.sql", import.meta.url), "utf8");
    expect(sql).toContain("semen_entrada_operacoes_titular_chave_uq");
    expect(sql).not.toContain("ALTER TABLE");
    expect(sql).toContain("NÃO cria outro índice");
    const rota = readFileSync(new URL("./semenRouter.ts", import.meta.url), "utf8");
    const trecho = rota.slice(rota.indexOf("registrarEntrada:"), rota.indexOf("listDisponiveisParaInseminacao"));
    expect(trecho).toContain("registrarEntradaSemenEEspelhar");
    expect(trecho).toContain("Banco de dados indisponível.");
    expect(trecho).not.toContain("registrarEntradaSemenLocal");
    let espelhou = false;
    await expect(registrarEntradaSemenEEspelhar({
      async emTransacao() {
        const erro = new Error("connect ECONNREFUSED 127.0.0.1:3306");
        (erro as { code?: string }).code = "ECONNREFUSED";
        throw erro;
      },
    }, pedido(), {
      async registrar() { espelhou = true; },
    })).rejects.toThrow(/ECONNREFUSED/);
    expect(espelhou).toBe(false);
  });

  it("não abre o banco sem a chave e o formulário vazio não reaproveita a anterior", async () => {
    let abriu = false;
    const semChave = await registrarEntradaSemenEEspelhar({
      async emTransacao() {
        abriu = true;
        throw new Error("não abrir");
      },
    }, pedido({ operacaoId: "" }), { async registrar() { throw new Error("espelho"); } });
    expect(semChave).toMatchObject({ ok: false, mensagem: MSG_OPERACAO_ENTRADA_OBRIGATORIA });
    expect(abriu).toBe(false);

    descartarOperacaoEntradaSemen("livre");
    const rascunho = {
      fazendaId: 10,
      assinatura: "10|interno|80|L1|2|100",
      origem: "interno",
      partida: "L1",
      quantidadeDoses: "2",
      custoUnitario: "50",
      dataEntrada: "2026-11-10",
      reprodutorTexto: "",
      centralOrigem: "",
      machoId: 80,
    };
    const primeira = operacaoEntradaSemenAtual("livre", rascunho);
    const segunda = operacaoEntradaSemenAtual("livre", { ...rascunho, assinatura: "outra", quantidadeDoses: "9" });
    expect(segunda).toBe(primeira);
    concluirOperacaoEntradaSemen("livre");
    const nova = operacaoEntradaSemenAtual("livre", rascunho);
    expect(nova).not.toBe(primeira);
    const outraFazenda = operacaoEntradaSemenAtual("livre", { ...rascunho, fazendaId: 20 });
    expect(outraFazenda).not.toBe(nova);
    descartarOperacaoEntradaSemen("livre");
  });
});
