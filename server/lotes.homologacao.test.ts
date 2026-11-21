import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function moduloLotes() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8").replace(/\r\n/g, "\n");
  const inicio = fonte.indexOf("const lotesRouter = router({");
  const fim = fonte.indexOf("const saudeRouter = router({", inicio);
  return fonte.slice(inicio, fim);
}

const ROTAS = [
  "gerenciamento",
  "mapaRebanho",
  "list",
  "listByPasto",
  "listMovimentacoes",
  "moveToPasto",
  "getById",
  "create",
  "update",
  "incluirAnimais",
  "movimentarAnimais",
  "ultimaMovimentacaoPorAnimais",
  "transferirAnimaisAlocacao",
  "listHistoricoMovimentacoesAnimais",
  "removerAnimais",
  "verificarExclusao",
  "excluir",
  "inativar",
  "mapaRebanhoV2",
  "mapaRebanhoHistorico",
  "mapaRebanhoGeral",
  "excluirMovimentacao",
  "cancelarEstadiaSinteticaLote",
] as const;

describe("lotes — homologação das 23 rotas", () => {
  const bloco = moduloLotes();

  it("lista as 23 rotas reais, sem sobra e sem falta", () => {
    const nomes = [...bloco.matchAll(/\n  ([A-Za-z0-9]+): protectedProcedure/g)].map((achado) => achado[1]);
    expect(nomes).toEqual([...ROTAS]);
  });

  it("consulta recusa o MySQL caído e não completa pelo JSON", () => {
    expect(bloco).toContain("recusarLoteSemMysql()");
    expect(bloco).toContain('"lotes.visualizar"');
    expect(bloco).toContain("eventoHistoricoVisivel");
    for (const proibido of [
      "listLocalLotes",
      "listLocalLotesGerenciamento",
      "getLocalLote",
      "buildLocalMapaRebanhoV2",
      "buildLocalMapaRebanhoGeral",
      "listLocalMapaRebanhoHistorico",
      "excluirLocalLotePastoMovimentacao",
      "cancelarLocalEstadiaSinteticaLote",
      "executarExclusaoLote",
      "executarInativacaoLote",
      "avaliarExclusaoLote(",
      "deveUsarEspelhoQuandoBancoCai",
    ]) {
      expect(bloco, proibido).not.toContain(proibido);
    }
  });

  it("exclusão física, histórico e estadia sintética continuam bloqueados", () => {
    expect(bloco).toContain("recusarExclusaoFisicaLote()");
    expect(bloco).toContain("recusarExclusaoHistoricoLote()");
    expect(bloco).toContain("recusarEstadiaSinteticaLote()");
    expect(bloco).toContain('"lotes.inativar"');
    expect(bloco).toContain("avaliarExclusaoLoteDb");
    expect(bloco).toContain('.for("update")');
    expect(bloco).not.toContain("db.delete(lotes)");
    expect(bloco).not.toContain("db.delete(lotePastoMovimentacoes)");
  });

  it("a alocação não transfere entre fazendas e a transferência olha o brinco", () => {
    const alocacao = readFileSync(resolve(here, "movimentarAnimaisLoteAutorizado.ts"), "utf8");
    const transferencia = readFileSync(resolve(here, "transferirAnimalFazendaAutorizado.ts"), "utf8");
    expect(alocacao).toContain("MSG_FAZENDA_ALOCACAO");
    expect(alocacao).toContain("brincoImpedeAssumirFazenda");
    expect(transferencia).toContain("brincoAtivoNaFazenda");
    expect(transferencia).toContain("ehBrincoDuplicadoNoMysql");
    expect(transferencia).toContain('PERMISSAO_TRANSFERIR_ANIMAL = "animais.transferir"');
  });
});
