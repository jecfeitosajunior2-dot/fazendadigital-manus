import { describe, expect, it } from "vitest";
import {
  formatCoberturaAlvoDetalhes,
  type CoberturaAlvoPersistido,
} from "../shared/reproCoberturaAlvo";
import { packReproObservacoes, unpackReproObservacoes } from "../shared/reproRegistroMeta";

describe("formatCoberturaAlvoDetalhes", () => {
  it("formata matriz individual", () => {
    const meta = {
      observacoes: null,
      reprodutorSemen: null,
      responsavel: null,
      descricaoResultadoOutro: null,
      coberturaAlvo: {
        selectionMode: "individual" as const,
        animalIds: [27],
        labelsBrinco: ["27"],
      },
    };
    expect(formatCoberturaAlvoDetalhes("Cobertura realizada", meta)).toBe("Matriz: 27");
  });

  it("formata múltiplas matrizes com lote de origem", () => {
    const meta = {
      observacoes: null,
      reprodutorSemen: null,
      responsavel: null,
      descricaoResultadoOutro: null,
      coberturaAlvo: {
        selectionMode: "lote" as const,
        animalIds: [27, 35, 42],
        labelsBrinco: ["27", "35", "42"],
        loteId: 5,
        labelLoteNome: "Novilhos",
      },
    };
    expect(formatCoberturaAlvoDetalhes("Cobertura realizada", meta)).toBe(
      "Matrizes: 27, 35, 42 · Lote de origem: Novilhos",
    );
  });

  it("preserva legado texto livre", () => {
    const meta = {
      observacoes: null,
      reprodutorSemen: "01",
      responsavel: null,
      descricaoResultadoOutro: null,
      coberturaAlvo: null,
    };
    expect(formatCoberturaAlvoDetalhes("Cobertura realizada", meta)).toBe(
      "Matriz / Lote atendido: 01",
    );
  });

  it("preserva legado lote somente", () => {
    const meta = {
      observacoes: null,
      reprodutorSemen: null,
      responsavel: null,
      descricaoResultadoOutro: null,
      coberturaAlvo: {
        selectionMode: "lote" as const,
        animalIds: [],
        labelsBrinco: [],
        tipo: "lote" as const,
        loteId: 5,
        labelLoteNome: "Novilhos",
      },
    };
    expect(formatCoberturaAlvoDetalhes("Cobertura realizada", meta)).toBe("Lote: Novilhos");
  });

  it("preserva legado matriz individual antiga (cai/clb)", () => {
    const meta = {
      observacoes: null,
      reprodutorSemen: null,
      responsavel: null,
      descricaoResultadoOutro: null,
      coberturaAlvo: {
        selectionMode: "individual" as const,
        animalIds: [27],
        labelsBrinco: ["27"],
        tipo: "animal" as const,
        animalId: 27,
        labelBrinco: "27",
      },
    };
    expect(formatCoberturaAlvoDetalhes("Cobertura realizada", meta)).toBe("Matriz: 27");
  });
});

describe("pack/unpack cobertura matrizes", () => {
  it("persiste e restaura múltiplas matrizes com contexto de lote", () => {
    const alvo: CoberturaAlvoPersistido = {
      selectionMode: "lote",
      animalIds: [27, 35],
      labelsBrinco: ["27", "35"],
      loteId: 5,
      labelLoteNome: "Novilhos",
    };
    const packed = packReproObservacoes(undefined, undefined, undefined, undefined, alvo);
    const meta = unpackReproObservacoes(packed);
    expect(meta.coberturaAlvo?.animalIds).toEqual([27, 35]);
    expect(meta.coberturaAlvo?.labelsBrinco).toEqual(["27", "35"]);
    expect(meta.coberturaAlvo?.selectionMode).toBe("lote");
    expect(meta.coberturaAlvo?.labelLoteNome).toBe("Novilhos");
  });
});
