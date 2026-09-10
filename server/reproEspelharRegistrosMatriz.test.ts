import { describe, expect, it } from "vitest";
import { resolveTipoEspelhoMatriz } from "./reproEspelharRegistrosMatriz";
import { packReproObservacoes, unpackReproObservacoes } from "../shared/reproRegistroMeta";

describe("resolveTipoEspelhoMatriz", () => {
  it("cobertura realizada espelha como Cobertura na matriz", () => {
    expect(resolveTipoEspelhoMatriz("Cobertura realizada")).toBe("Cobertura");
  });

  it("estação de monta espelha como Exposição à monta", () => {
    expect(resolveTipoEspelhoMatriz("Estação de monta")).toBe("Exposição à monta");
  });

  it("ignora tipos sem espelho", () => {
    expect(resolveTipoEspelhoMatriz("Exame andrológico")).toBeNull();
  });
});

describe("metadata espelho automático", () => {
  it("persiste registroOrigemId e flag espelho", () => {
    const raw = packReproObservacoes(undefined, "Touro 55", undefined, undefined, undefined, {
      registroOrigemId: 42,
      espelhoAutomatico: true,
    });
    const meta = unpackReproObservacoes(raw);
    expect(meta.registroOrigemId).toBe(42);
    expect(meta.espelhoAutomatico).toBe(true);
    expect(meta.reprodutorSemen).toBe("Touro 55");
  });
});
