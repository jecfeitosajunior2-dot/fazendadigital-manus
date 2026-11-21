import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL, MSG_ESTORNO_RECEBIMENTO_MOTIVO } from "../shared/compraRecebimentoEstorno";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  PERMISSAO_DESFAZER_RECEBIMENTO,
  recusarEstornoRecebimentoAutorizado,
  type IoEstornoRecebimento,
} from "./estornoRecebimentoBloqueado";
import { mensagemErroDesfazerRecebimento } from "../client/src/lib/compraRecebimentoDesfazer";

const here = dirname(fileURLToPath(import.meta.url));

describe("estorno de recebimento bloqueado", () => {
  it("motivo inválido não abre transação", async () => {
    let abriu = false;
    const io: IoEstornoRecebimento = {
      async emTransacao() {
        abriu = true;
        throw new Error("não deveria abrir");
      },
    };
    const resultado = await recusarEstornoRecebimentoAutorizado(io, {
      executorId: 1,
      recebimentoId: 1,
      motivo: "motivo-que-nao-existe",
    });
    expect(resultado).toMatchObject({ ok: false, motivo: "invalido", mensagem: MSG_ESTORNO_RECEBIMENTO_MOTIVO });
    expect(abriu).toBe(false);
  });

  it("usa a permissão já existente de desfazer recebimento", () => {
    const definicao = permissaoPorId(PERMISSAO_DESFAZER_RECEBIMENTO);
    expect(definicao?.id).toBe("compras.desfazer_recebimento");
    expect(definicao?.descricao).toMatch(/desfazer recebimento/i);
    expect(permissaoPorId("compras.criar")?.id).not.toBe(PERMISSAO_DESFAZER_RECEBIMENTO);
  });

  it("a rota recusa antes de apagar e a tela mostra a frase do servidor", () => {
    const router = readFileSync(resolve(here, "routers.ts"), "utf8");
    const inicio = router.indexOf("desfazerRecebimento: protectedProcedure");
    const bloco = router.slice(inicio, router.indexOf("delete: protectedProcedure", inicio));
    expect(bloco).toContain("recusarEstornoRecebimentoAutorizado");
    expect(bloco).toContain("Banco de dados indisponível.");
    expect(bloco).not.toContain("desfazerRecebimentoCompra");
    expect(bloco).not.toContain(".delete(");
    const pagina = readFileSync(resolve(here, "../client/src/pages/CompraRecebimentoPage.tsx"), "utf8");
    expect(pagina).toContain("trpc.compras.desfazerRecebimento.useMutation");
    expect(pagina).toContain("submitError={desfazerErro}");
    expect(pagina).toContain("mensagemErroDesfazerRecebimento");
    expect(mensagemErroDesfazerRecebimento(new Error(MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL)))
      .toBe(MSG_ESTORNO_RECEBIMENTO_INDISPONIVEL);
  });

  it("banco indisponível não grava espelho", async () => {
    let gravou = false;
    const io: IoEstornoRecebimento = {
      async emTransacao() {
        const erro = new Error("connect ECONNREFUSED 127.0.0.1:3306") as Error & { code?: string };
        erro.code = "ECONNREFUSED";
        throw erro;
      },
    };
    await expect(recusarEstornoRecebimentoAutorizado(io, {
      executorId: 1,
      recebimentoId: 700,
      motivo: "lancamento_incorreto",
    })).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(gravou).toBe(false);
  });
});
