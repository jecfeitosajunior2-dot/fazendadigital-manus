import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function modulo() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8").replace(/\r\n/g, "\n");
  const inicio = fonte.indexOf("const saudeRouter = router({");
  const fim = fonte.indexOf("const reproducaoRouter = router({", inicio);
  return fonte.slice(inicio, fim);
}

describe("sanidade — quatro rotas", () => {
  const bloco = modulo();

  it("são list, create, delete e registrarCastracao", () => {
    const nomes = [...bloco.matchAll(/\n  ([A-Za-z0-9]+): protectedProcedure/g)].map((achado) => achado[1]);
    expect(nomes).toEqual(["list", "create", "delete", "registrarCastracao"]);
  });

  it("a consulta usa o titular e recusa o arquivo quando o banco cai", () => {
    const lista = bloco.slice(bloco.indexOf("list:"), bloco.indexOf("create:"));
    const consulta = readFileSync(resolve(here, "consultaSaudeAutorizada.ts"), "utf8");
    expect(lista).toContain("listarSaudeNoBanco");
    expect(lista).toContain("recusarSaudeSemMysql()");
    expect(consulta).toContain('PERMISSAO_CONSULTAR_SAUDE = "saude.visualizar"');
    expect(lista).not.toContain("listLocalSaudeRegistros");
    expect(lista).not.toContain("saudeRegistros.userId, ctx.user.id");
    expect(bloco).toContain("lancarSanidadeEEspelhar");
    expect(bloco).toContain("estornarSanidadeAutorizado");
    expect(bloco).toContain("castrarEEspelharAnimal");
    expect(bloco).not.toContain("deleteLocalSaudeRegistro");
    expect(bloco).not.toContain("localFallback");
  });

  it("a carência da lista de animais ainda não separa o estorno", () => {
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8").replace(/\r\n/g, "\n");
    const inicio = fonte.indexOf("Busca últimos registros de saúde");
    const trecho = fonte.slice(inicio, inicio + 700);
    expect(trecho).toContain("saudeRegistros.userId, identidade.titularUserId");
    expect(trecho).not.toContain("saudeRegistros.status");
    const formula = readFileSync(resolve(here, "../shared/carenciaAnimal.ts"), "utf8");
    expect(formula).not.toContain("estornado");
  });
});
