import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { espelharPastoDepoisDoCommit } from "./routers";

const here = dirname(fileURLToPath(import.meta.url));

function blocoPastos() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const inicio = fonte.indexOf("const pastosRouter");
  return fonte.slice(inicio, fonte.indexOf("const brincosRouter"));
}

describe("homologação dos pastos", () => {
  it("o espelho só corre depois da confirmação e a falha dele não derruba a gravação", async () => {
    const ordem: string[] = [];
    await expect((async () => {
      ordem.push("banco");
      throw new Error("rollback");
    })()).rejects.toThrow("rollback");
    expect(ordem).toEqual(["banco"]);

    await espelharPastoDepoisDoCommit(async () => {
      ordem.push("espelho");
    });
    expect(ordem).toEqual(["banco", "espelho"]);

    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(espelharPastoDepoisDoCommit(async () => {
      throw new Error("arquivo ocupado");
    })).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("as seis rotas permitidas não usam o arquivo como substituto do banco", () => {
    const bloco = blocoPastos();
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("deveUsarEspelhoQuandoBancoCai");
    expect(bloco).not.toContain("pastosDoEspelhoDoPrincipal");
    expect(bloco).not.toContain("criarPastoNoEspelhoDoPrincipal");
    expect(bloco).not.toContain("editarPastoNoEspelhoDoPrincipal");
    expect(bloco).not.toContain("importarCoordenadasNoEspelhoDoPrincipal");
    expect(bloco).toContain("recusarPastoSemMysql()");
    const painel = bloco.slice(bloco.indexOf("listWithDetails:"));
    expect(painel).not.toContain("listLocal");
    expect(painel).not.toContain("catch");
  });

  it("a exclusão continua bloqueada e não apaga vínculo", () => {
    const bloco = blocoPastos();
    const exclusao = bloco.slice(bloco.indexOf("delete: protectedProcedure"), bloco.indexOf("importarCoordenadas:"));
    expect(exclusao).toContain("PRECONDITION_FAILED");
    expect(exclusao).not.toContain("db.delete");
    expect(exclusao).not.toContain("ON DELETE CASCADE");
    expect(exclusao).not.toContain("localFallback");
  });
});
