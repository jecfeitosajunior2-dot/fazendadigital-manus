import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function modulo() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8").replace(/\r\n/g, "\n");
  const inicio = fonte.indexOf("const pesagensRouter = router({");
  const fim = fonte.indexOf("const nutricaoRouter = router({", inicio);
  return fonte.slice(inicio, fim);
}

describe("pesagens — três rotas", () => {
  const bloco = modulo();

  it("são list, create e delete", () => {
    const nomes = [...bloco.matchAll(/\n  ([A-Za-z0-9]+): protectedProcedure/g)].map((achado) => achado[1]);
    expect(nomes).toEqual(["list", "create", "delete"]);
  });

  it("a consulta usa o titular e recusa o arquivo quando o banco cai", () => {
    const lista = bloco.slice(bloco.indexOf("list:"), bloco.indexOf("create:"));
    const consulta = readFileSync(resolve(here, "consultaPesagemAutorizada.ts"), "utf8");
    expect(lista).toContain("listarPesagensNoBanco");
    expect(lista).toContain("recusarPesagemSemMysql()");
    expect(consulta).toContain('PERMISSAO_CONSULTAR_PESAGEM = "pesagens.visualizar"');
    expect(lista).not.toContain("listLocalPesagens");
    expect(lista).not.toContain("pesagens.userId, ctx.user.id");
    expect(bloco).toContain("pesarEEspelharAnimal");
  });

  it("a exclusão física não chega ao banco", () => {
    expect(bloco).toContain("recusarExclusaoFisicaPesagem()");
    expect(bloco).not.toContain("db.delete(pesagens)");
    expect(bloco).not.toContain("deleteLocalPesagem");
    expect(bloco).not.toContain("localFallback");
  });
});
