import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSG_EXCLUSAO_FISICA_INDISPONIVEL } from "../shared/animalExclusao";
import { recusarExclusaoFisicaAnimal } from "./exclusaoFisicaAnimal";

const here = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(here, "..");

function blocoDaRota(): string {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const marca = fonte.indexOf("recusarExclusaoFisicaAnimal();");
  const inicio = fonte.lastIndexOf("delete: protectedProcedure", marca);
  return fonte.slice(inicio, fonte.indexOf("gerarModeloPlanilha:", marca));
}

function arquivosServidor(): string[] {
  const pasta = resolve(here);
  const achados: string[] = [];
  const visitar = (diretorio: string) => {
    for (const nome of readdirSync(diretorio)) {
      const caminho = join(diretorio, nome);
      if (statSync(caminho).isDirectory()) {
        visitar(caminho);
        continue;
      }
      if (!nome.endsWith(".ts") || nome.endsWith(".test.ts")) continue;
      achados.push(caminho);
    }
  };
  visitar(pasta);
  return achados;
}

describe("bloqueio da exclusão física", () => {
  it("recusa antes de gravar, com ou sem banco", () => {
    expect(() => recusarExclusaoFisicaAnimal()).toThrowError(expect.objectContaining({
      code: "PRECONDITION_FAILED",
      message: MSG_EXCLUSAO_FISICA_INDISPONIVEL,
    }));
  });

  it("a rota não consulta, não apaga e não mexe no espelho", () => {
    const bloco = blocoDaRota();
    expect(bloco).toContain(".input(z.object({ id: z.number() }))");
    expect(bloco).toContain("recusarExclusaoFisicaAnimal()");
    expect(bloco).not.toContain("ctx");
    expect(bloco).not.toContain("excluirEEspelharAnimal");
    expect(bloco).not.toContain("deleteLocalAnimal");
    expect(bloco).not.toContain("isDatabaseUnavailable");
    expect(bloco).not.toContain("db.");
    expect(bloco).not.toContain("success: true");
  });

  it("a lista mostra a mesma frase e não chama a lixeira", () => {
    const tela = readFileSync(resolve(raiz, "client/src/pages/GenericPage.tsx"), "utf8");
    expect(tela).toContain("MSG_EXCLUSAO_FISICA_INDISPONIVEL");
    expect(tela).toContain("toast.error(MSG_EXCLUSAO_FISICA_INDISPONIVEL)");
    expect(tela).not.toContain("animais.delete");
    expect(tela).not.toContain("Animal excluído com sucesso");
  });

  it("só restam os caminhos já conhecidos de apagar animal", () => {
    const permitidos = new Set([
      "baixarAnimalAutorizado.ts",
      "baixarAnimalDb.ts",
      "desfazerRecebimentoCompraDb.ts",
      "registrarPartoComCrias.ts",
      "localFallbackStore.ts",
    ]);
    const marcas = [/\.delete\(\s*animais\s*\)/, /deleteLocalAnimal\s*\(/, /excluirAnimal\s*\(/];
    const encontrados = new Set<string>();
    for (const arquivo of arquivosServidor()) {
      const texto = readFileSync(arquivo, "utf8");
      if (!marcas.some((marca) => marca.test(texto))) continue;
      encontrados.add(relative(here, arquivo).replaceAll("\\", "/"));
    }
    expect([...encontrados].sort()).toEqual([...permitidos].sort());
    expect(blocoDaRota()).not.toMatch(/\.delete\(\s*animais\s*\)/);
  });
});
