import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function modulo() {
  return readFileSync(resolve(here, "semenRouter.ts"), "utf8").replace(/\r\n/g, "\n");
}

describe("sêmen — treze rotas", () => {
  const bloco = modulo();

  it("mantém os nomes que as telas já chamam", () => {
    const nomes = [...bloco.matchAll(/\n  ([A-Za-z0-9]+): protectedProcedure/g)].map((achado) => achado[1]);
    expect(nomes).toEqual([
      "list",
      "getById",
      "getEntradaResumo",
      "registrarEntrada",
      "listDisponiveisParaInseminacao",
      "listReprodutoresExternosDisponiveis",
      "corrigirEntrada",
      "ajustarEstoque",
      "listUtilizado",
      "getUtilizado",
      "listCatalogoExternos",
      "createCatalogoExterno",
      "updateCatalogoExterno",
    ]);
  });

  it("consulta e catálogo usam o titular e não o arquivo", () => {
    const consulta = readFileSync(resolve(here, "consultaSemenAutorizada.ts"), "utf8");
    expect(consulta).toContain('PERMISSAO_CONSULTAR_SEMEN = "semen.visualizar"');
    expect(consulta).toContain('PERMISSAO_CATALOGO_SEMEN_CRIAR = "semen.criar"');
    expect(consulta).toContain('PERMISSAO_CATALOGO_SEMEN_EDITAR = "semen.editar"');
    expect(bloco).toContain("autorizarSemenNoBanco");
    expect(bloco).toContain("recusarSemenSemMysql()");
    expect(bloco).not.toContain("withDbFallback");
    expect(bloco).not.toContain("Local(");
    expect(bloco).toContain("registrarEntradaSemenEEspelhar");
    expect(bloco).toContain("corrigirEntradaSemenEEspelhar");
    expect(bloco).toContain("ajustarEstoqueSemenEEspelhar");
  });

  it("a identidade da partida continua no banco, sem fundir nomes", () => {
    const schema = readFileSync(resolve(here, "../drizzle/schema.ts"), "utf8");
    expect(schema).toContain("semen_partidas_uq");
    expect(schema).toContain("table.userId, table.fazendaId, table.reprodutorKey, table.partida");
    const proposta = readFileSync(resolve(here, "../drizzle/migrations/0069_semen_partidas_indice_unico.sql"), "utf8");
    expect(proposta).toContain("ADD UNIQUE KEY semen_partidas_uq (user_id, fazenda_id, reprodutor_key, partida)");
    expect(proposta).toContain("Ele não apaga partidas, saldos nem movimentos.");
  });
});
