import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manejo e visão do rebanho sem arquivo local", () => {
  const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const visao = readFileSync(new URL("./routers/rebanhoOverview.ts", import.meta.url), "utf8");
  const manejo = rotas.slice(rotas.indexOf("registrarPontualBrinco"), rotas.indexOf("semenRouter"));

  it("o manejo pontual não grava no arquivo e exige o índice do brinco ativo", () => {
    expect(manejo).toContain("registrarBrincoPontual");
    expect(manejo).toContain("titularId");
    expect(manejo).toContain("Nada foi gravado no arquivo local.");
    expect(manejo).not.toContain("localFallback");
    expect(manejo).not.toContain("updateLocalAnimal");
    expect(manejo).not.toContain("runLocal");
    const troca = readFileSync(new URL("./registrarBrincoPontual.ts", import.meta.url), "utf8");
    expect(troca).toContain("animais_brinco_ativo_fazenda_uq");
  });

  it("a visão filtra titular e fazenda antes de somar e não completa com o arquivo", () => {
    expect(visao).toContain('permissoes.includes("animais.visualizar")');
    expect(visao).toContain("inArray(animais.fazendaId, escopo.fazendasIds)");
    expect(visao).toContain("eq(animais.userId, escopo.titular)");
    expect(visao).toContain("Nada foi completado com o arquivo local.");
    expect(visao).not.toContain("buildLocalRebanhoOverview");
    expect(visao).not.toContain("isDatabaseUnavailable");
  });
});
