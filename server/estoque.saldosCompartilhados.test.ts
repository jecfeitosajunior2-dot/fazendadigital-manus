import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ehDeadlockEstoque, MSG_ESTOQUE_DISPUTADO } from "./estoqueConcorrencia";

const here = dirname(fileURLToPath(import.meta.url));

function texto(nome: string) {
  return readFileSync(resolve(here, nome), "utf8").replace(/\r\n/g, "\n");
}

function fatia(fonte: string, inicio: string, fim: string) {
  const i = fonte.indexOf(inicio);
  const j = fonte.indexOf(fim, i + inicio.length);
  return fonte.slice(i, j === -1 ? undefined : j);
}

describe("saldos compartilhados — travas e arquivo local", () => {
  it("reconhece deadlock e não trata isso como sucesso", () => {
    const erro = Object.assign(new Error("Deadlock found when trying to get lock"), {
      errno: 1213,
      code: "ER_LOCK_DEADLOCK",
    });
    expect(ehDeadlockEstoque(erro)).toBe(true);
    expect(ehDeadlockEstoque(new Error("estoque insuficiente"))).toBe(false);
    expect(MSG_ESTOQUE_DISPUTADO).toContain("Nada foi gravado");
  });

  it("nutrição trava o produto antes de baixar e de devolver", () => {
    for (const arquivo of ["nutricaoFornecimentos.ts", "nutricaoBatidas.ts"]) {
      const fonte = texto(arquivo);
      const debito = fatia(fonte, "async debitarEstoque", "async insertSaida");
      const credito = fatia(fonte, "async creditarEstoque", "async setEstornado");
      expect(debito).toContain('.for("update")');
      expect(credito).toContain('.for("update")');
      expect(fonte).toContain(".sort((a, b) => (a.estoqueId ?? 0) - (b.estoqueId ?? 0))");
      expect(fonte).toContain("recusarSeDeadlockEstoque");
    }
  });

  it("compra e transferência travam o produto e não concluem só no arquivo", () => {
    const compra = texto("compraInsumosMysql.ts");
    const transferencia = texto("transferenciaInsumosMysql.ts");
    expect(compra).toContain('.for("update")');
    expect(transferencia).toContain('.for("update")');
    expect(texto("compraInsumos.ts")).toContain(".sort((a, b) => a.estoqueId - b.estoqueId)");
    expect(texto("estoqueSaldoTx.ts")).toContain(".sort((a, b) => a.estoqueOrigemId - b.estoqueOrigemId)");
    expect(compra).not.toContain("localFallback");
    expect(transferencia).not.toContain("devLocalStore");
  });

  it("abastecimento da fazenda não baixa combustível no arquivo", () => {
    const roteador = texto("routers.ts");
    const abastece = fatia(roteador, "const abastecimentosRouter", "const pecaInput");
    expect(abastece).toContain("abastecimentosOperacao");
    expect(abastece).not.toContain("syncSaidaAbastecimentoLocal");
    expect(abastece).not.toContain("estornarSaidaAbastecimentoLocal");
    expect(abastece).not.toContain("localFallback");
    const servico = texto("abastecimentosOperacao.ts");
    expect(servico).toContain("MSG_ABAST_SEM_MYSQL");
    expect(servico).not.toContain("syncSaidaAbastecimentoLocal");
    const espelho = texto("abastecimentoEstoqueSync.ts");
    expect(espelho).toContain('.for("update")');
    const local = fatia(espelho, "export async function syncSaidaAbastecimentoLocal", "export async function estornarSaidaAbastecimentoLocal");
    expect(local.indexOf("throw new TRPCError")).toBeLessThan(local.indexOf("devLocalStore") === -1 ? local.length : local.indexOf("devLocalStore"));
    expect(local).not.toContain("devLocalStore.syncSaidaAbastecimento");
  });

  it("manutenção e o espelho sanitário não ajustam quantidade só no arquivo", () => {
    const roteador = texto("routers.ts");
    const baixa = fatia(roteador, "function aplicarBaixaEstoqueLocalPendente", "function pecasLocaisFromResolvidas");
    expect(baixa).toContain("PRECONDITION_FAILED");
    expect(baixa).not.toContain("ajustarQuantidadeEstoque");
    const saudeLocal = texto("localFallbackStore.ts");
    expect(saudeLocal).toContain("A baixa de estoque não pode ser feita só no arquivo local.");
    const trecho = fatia(saudeLocal, "export async function createLocalSaudeRegistro", "export async function");
    expect(trecho).not.toContain("ajustarQuantidadeEstoque");
    const estorno = fatia(roteador, "estornarMovimentacao: protectedProcedure", "deleteMovimentacao: protectedProcedure");
    expect(estorno).not.toContain("estornarMovimentacaoGrupo");
    expect(estorno).toContain("recusarEstoqueSemMysql()");
  });
});
