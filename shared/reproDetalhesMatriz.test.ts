import { describe, expect, it } from "vitest";
import {
  formatReproDetalhesTabela,
  packReproObservacoes,
  unpackReproObservacoes,
} from "./reproRegistroMeta";

describe("repro detalhes ficha matriz", () => {
  it("formata espelho de exposição à monta com touro e indicador automático", () => {
    const obs = packReproObservacoes(undefined, "17", undefined, undefined, undefined, {
      espelhoAutomatico: true,
      registroOrigemId: 100,
    });
    const meta = unpackReproObservacoes(obs);
    const detalhes = formatReproDetalhesTabela(
      { tipo: "Exposição à monta", machoId: 7 },
      meta,
    );
    expect(detalhes).toBe("Touro: 17");
    expect(detalhes).not.toContain("Espelho automático");
    expect(detalhes).not.toContain("ref. registro");
  });

  it("mantém cobertura legada com texto de sêmen sem prefixo touro", () => {
    const obs = packReproObservacoes(undefined, "P-10FAZ");
    const meta = unpackReproObservacoes(obs);
    const detalhes = formatReproDetalhesTabela({ tipo: "Cobertura" }, meta);
    expect(detalhes).toBe("P-10FAZ");
  });
});
