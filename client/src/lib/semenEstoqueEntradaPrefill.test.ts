import { describe, expect, it } from "vitest";
import { SEMEN_ORIGEM_EXTERNO, SEMEN_ORIGEM_INTERNO } from "@shared/semenEstoque";
import { buildSemenEntradaPrefillFromPartida } from "./semenEstoqueEntradaPrefill";
import { semenPartidaDetalhePath } from "./semenRoutes";

describe("ações da listagem de estoque de sêmen", () => {
  it("G) Ver detalhes aponta para a partida correta", () => {
    expect(semenPartidaDetalhePath(5)).toBe("/reproducao/estoque-semen/5");
    expect(semenPartidaDetalhePath(4)).toBe("/reproducao/estoque-semen/4");
  });

  it("H) Nova entrada recebe partida, reprodutor e central da linha", () => {
    const prefill = buildSemenEntradaPrefillFromPartida({
      origemReprodutor: SEMEN_ORIGEM_INTERNO,
      machoId: 13,
      reprodutorTexto: "28",
      reprodutorDisplay: "28",
      partida: "28-GE",
      centralOrigem: "GE",
    });
    expect(prefill).toEqual({
      origem: SEMEN_ORIGEM_INTERNO,
      machoId: 13,
      reprodutorTexto: "28",
      reprodutorDisplay: "28",
      partida: "28-GE",
      centralOrigem: "GE",
    });
  });

  it("H) partida externa GSC-7117 pré-preenche reprodutor e lote", () => {
    const prefill = buildSemenEntradaPrefillFromPartida({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      machoId: null,
      reprodutorTexto: "GSC-7117",
      reprodutorDisplay: "GSC-7117",
      partida: "Sem lote",
      centralOrigem: "Alta",
    });
    expect(prefill?.origem).toBe(SEMEN_ORIGEM_EXTERNO);
    expect(prefill?.partida).toBe("Sem lote");
    expect(prefill?.reprodutorTexto).toBe("GSC-7117");
    expect(prefill?.centralOrigem).toBe("Alta");
    expect(prefill?.machoId).toBeNull();
  });

  it("não monta prefill se a origem da partida for inválida", () => {
    expect(
      buildSemenEntradaPrefillFromPartida({
        origemReprodutor: "outro",
        machoId: null,
        reprodutorDisplay: "X",
        partida: "Y",
      }),
    ).toBeNull();
  });
});
