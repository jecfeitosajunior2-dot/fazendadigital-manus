import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MSG_SEMEN_AJUSTE_MOTIVO } from "../shared/semenEstoqueAjuste";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  PERMISSAO_SEMEN_EDITAR,
  ajustarEstoqueSemenEEspelhar,
  corrigirEntradaSemenEEspelhar,
  type IoCorrecaoAjusteSemen,
  type PedidoAjusteSemen,
  type PedidoCorrecaoSemen,
} from "./correcaoAjusteSemenAutorizado";

const ioFechado: IoCorrecaoAjusteSemen = {
  async emTransacao() {
    throw new Error("a transação não deveria abrir");
  },
};

function correcao(extra: Partial<PedidoCorrecaoSemen["input"]> = {}): PedidoCorrecaoSemen {
  return {
    executorId: 1,
    sessionVersionDaSessao: 1,
    input: {
      movimentacaoId: 900,
      quantidadeDoses: 4,
      custoTotal: 400,
      dataEntrada: "2026-11-10",
      motivoCodigo: "quantidade_digitada_incorretamente",
      ...extra,
    },
  };
}

function ajuste(extra: Partial<PedidoAjusteSemen["input"]> = {}): PedidoAjusteSemen {
  return {
    executorId: 1,
    sessionVersionDaSessao: 1,
    input: {
      partidaId: 500,
      modo: "quantidade",
      saldoNovo: 8,
      motivoCodigo: "conferencia_fisica_estoque",
      ...extra,
    },
  };
}

describe("correção e ajuste de sêmen", () => {
  it("recusa data e motivo antes de abrir o banco", async () => {
    const futura = await corrigirEntradaSemenEEspelhar(ioFechado, correcao({ dataEntrada: "2099-01-01" }), {
      async registrar() { throw new Error("espelho não deveria rodar"); },
    });
    expect(futura.ok).toBe(false);
    const semMotivo = await ajustarEstoqueSemenEEspelhar(ioFechado, ajuste({ motivoCodigo: "" }), {
      async registrar() { throw new Error("espelho não deveria rodar"); },
    });
    expect(semMotivo).toMatchObject({ ok: false, mensagem: MSG_SEMEN_AJUSTE_MOTIVO });
  });

  it("usa a permissão de editar o estoque", () => {
    expect(PERMISSAO_SEMEN_EDITAR).toBe("semen.editar");
    expect(permissaoPorId("semen.editar")?.descricao).toMatch(/corrigir entrada/i);
    expect(permissaoPorId("semen.editar")?.descricao).toMatch(/ajustar estoque/i);
    expect(permissaoPorId("semen.criar")?.id).toBe("semen.criar");
  });

  it("as telas continuam nas mesmas rotas e o espelho não roda sem o banco", async () => {
    const corrigir = readFileSync(new URL("../client/src/components/semen/CorrigirLancamentoSemenDialog.tsx", import.meta.url), "utf8");
    const ajustar = readFileSync(new URL("../client/src/components/semen/AjustarEstoqueSemenDialog.tsx", import.meta.url), "utf8");
    expect(corrigir).toContain("trpc.semen.corrigirEntrada.useMutation");
    expect(ajustar).toContain("trpc.semen.ajustarEstoque.useMutation");
    const rota = readFileSync(new URL("./semenRouter.ts", import.meta.url), "utf8");
    const trecho = rota.slice(rota.indexOf("corrigirEntrada:"), rota.indexOf("listUtilizado:"));
    expect(trecho).toContain("corrigirEntradaSemenEEspelhar");
    expect(trecho).toContain("ajustarEstoqueSemenEEspelhar");
    expect(trecho).toContain("Banco de dados indisponível.");
    expect(trecho).not.toContain("corrigirEntradaSemenLocal");
    expect(trecho).not.toContain("ajustarEstoqueSemenLocal");
    let espelhou = false;
    const io: IoCorrecaoAjusteSemen = {
      async emTransacao() {
        const erro = new Error("connect ECONNREFUSED 127.0.0.1:3306");
        (erro as { code?: string }).code = "ECONNREFUSED";
        throw erro;
      },
    };
    await expect(corrigirEntradaSemenEEspelhar(io, correcao(), {
      async registrar() { espelhou = true; },
    })).rejects.toThrow(/ECONNREFUSED/);
    expect(espelhou).toBe(false);
  });
});
