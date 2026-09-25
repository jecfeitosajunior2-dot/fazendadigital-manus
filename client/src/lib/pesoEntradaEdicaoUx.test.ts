import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NewAnimalPage.tsx"), "utf8");

describe("Editar Animal — peso na entrada da Compra", () => {
  it("localiza a pesagem do recebimento e não usa pesoAtual", () => {
    expect(page).toContain("resolverExibicaoPesoEntrada");
    expect(page).toContain("pesoEntradaNoUpdateAnimal");
    expect(page).toContain("textoAuxiliarPesoEntrada");
    expect(page).toContain("pesagens.list");
    expect(page).toContain("animalDeCompra");
    expect(page).not.toContain("ORDER BY data ASC");
    expect(page).not.toMatch(/pesoAtual.*pesoEntrada/);
    expect(page).not.toContain("set('pesoEntrada', formatarPesoEntradaExibicao");
  });

  it("render e salvamento não reescrevem a pesagem histórica", () => {
    expect(page).not.toContain("pesagens.create");
    expect(page).not.toContain("pesagens.update");
    expect(page).toContain("pesoEntrada: pesoEntradaNoUpdateAnimal(exibicaoPesoEntrada, form.pesoEntrada)");
    expect(page).toContain("readOnly");
    expect(page).toContain("textoAuxiliarPesoEntrada(exibicaoPesoEntrada)");
  });
});
