import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function ler(nome: string) {
  return readFileSync(resolve(here, nome), "utf8").replace(/\r\n/g, "\n");
}

function fatia(texto: string, inicio: string, fim: string) {
  const de = texto.indexOf(inicio);
  const ate = texto.indexOf(fim, de + inicio.length);
  return texto.slice(de, ate);
}

describe("compras homologação multiusuário", () => {
  const routers = ler("routers.ts");
  const compras = fatia(routers, "const comprasRouter = router({", "const vendasRouter = router({");

  it("as onze rotas continuam no roteador de compras", () => {
    for (const nome of [
      "list:",
      "get:",
      "listarRecebimentos:",
      "cancelar:",
      "create:",
      "confirmarNaoIdentificados:",
      "documentosAnexar:",
      "documentosExcluir:",
      "receberAnimal:",
      "desfazerRecebimento:",
      "delete:",
    ]) {
      expect(compras).toContain(nome);
    }
  });

  it("consultas usam o titular e as fazendas concedidas", () => {
    expect(compras).toContain("fazendasDaConsultaCompraNoBanco");
    expect(compras).toContain("listarComprasAutorizadas(");
    expect(compras).toContain("getCompraDetalhe(acesso.titularUserId, input.id, acesso)");
    expect(compras).toContain("listarRecebimentosCompra(acesso.titularUserId, input.compraId, acesso)");
    expect(compras).not.toContain("listarComprasDoUsuario(ctx.user.id");
  });

  it("cadastro antigo sem fazenda não grava", () => {
    const create = fatia(compras, "create:", "confirmarNaoIdentificados:");
    expect(create).toContain("MSG_CADASTRO_COMPRA_SEM_FAZENDA");
    expect(create).not.toContain("db.insert");
  });

  it("confirmação, cancelamento e recebimento passam a sessão do executor", () => {
    expect(compras).toContain("confirmarCompraNaoIdentificados(ctx.user.id, input, {");
    expect(compras).toContain("cancelarCompraComercial(ctx.user.id, {");
    expect(compras).toContain("receberAnimalCompra(ctx.user.id, input");
    expect(compras).toContain("executorId: ctx.user.id");
    expect(compras).toContain("sessionVersionDaSessao: ctx.user.sessionVersion ?? null");
  });

  it("desfazer recebimento continua bloqueado", () => {
    const estorno = fatia(compras, "desfazerRecebimento:", "delete:");
    expect(estorno).toContain("recusarEstornoRecebimentoAutorizado");
    expect(estorno).not.toContain("desfazerRecebimentoCompra");
  });

  it("exclusão de rascunho passa pelo titular antes da regra comercial", () => {
    expect(compras).toContain("titularParaExcluirCompra(");
    expect(compras).toContain("excluirCompraLegada(titular, input.id)");
  });

  it("o roteador de compras não devolve sucesso pelo arquivo local", () => {
    expect(compras).not.toContain("localFallback");
    expect(compras).not.toContain("withDbFallback");
    expect(compras).not.toContain("buildLocal");
    expect(compras).toContain("recusarCompraSemMysql");
  });

  it("o recebimento de animal grava o titular e o executor em papéis diferentes", () => {
    const servico = ler("receberAnimalCompra.ts");
    expect(servico).toContain("recebidoPorUserId: executor");
    expect(servico).toContain("userId: dono");
    expect(servico).toContain("tx.autorizarDono");
    const banco = ler("receberAnimalCompraDb.ts");
    expect(banco).toContain("PERMISSAO_CONFIRMAR_COMPRAS");
    expect(banco).toContain('.for("update")');
    expect(banco).toContain("isMysqlDuplicateKey");
  });

  it("o estorno de insumos procura a operação pelo titular", () => {
    const servico = ler("compraInsumos.ts");
    const estorno = fatia(servico, "async estornarOperacao(", "export type CompraInsumosService");
    expect(estorno).toContain("await tx.autorizarDono(contexto)");
    expect(estorno).toContain("tx.lockOperacao(dono, operacaoId)");
    expect(estorno).toContain("cancelarTituloNoTx(tx.fin, dono,");
    expect(estorno).toContain("updateMovimentacaoEstornada(mov.id, motivo, userId, registradoPor)");
    expect(routers).toContain("permissaoId: PERMISSAO_ESTORNAR_ESTOQUE");
    expect(ler("compraInsumosMysql.ts")).toContain('.for("update")');
  });
});
