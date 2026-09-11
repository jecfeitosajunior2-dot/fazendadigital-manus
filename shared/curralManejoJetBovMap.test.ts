import { describe, expect, it } from "vitest";

import {

  CURRAL_MANEJO_JETBOV_MAP,

  curralManejoIdsOrdenados,

  getCurralManejoJetBovEntry,

  isCurralManejoDisponivel,

  labelStatusCurralManejo,

  isManejoExibidoNoHubCurral,

  podeSelecionarManejoNoHub,

  primeiroManejoDisponivelNaOrdem,

  manejosCurralOperacionaisNaOrdem,

} from "./curralManejoJetBovMap";



describe("curralManejoJetBovMap", () => {

  it("manejos operacionais do curral estão disponíveis no hub", () => {

    const disponiveis = CURRAL_MANEJO_JETBOV_MAP.filter(e => e.statusCurral === "disponivel");

    expect(disponiveis.map(e => e.id)).toEqual([
      "pesagem",
      "sanitario",
      "troca-lote",
      "brinco-eletronico",
      "reprodutivo",
      "desmama",
      "castracao",
    ]);

    expect(isCurralManejoDisponivel("pesagem")).toBe(true);

    expect(isCurralManejoDisponivel("sanitario")).toBe(true);

    expect(isCurralManejoDisponivel("troca-lote")).toBe(true);

    expect(isCurralManejoDisponivel("reprodutivo")).toBe(true);

    expect(isCurralManejoDisponivel("brinco-eletronico")).toBe(true);

    expect(isCurralManejoDisponivel("desmama")).toBe(true);

    expect(isCurralManejoDisponivel("castracao")).toBe(true);

  });



  it("ordena hub na mesma sequência dos manejos pontuais", () => {

    expect(curralManejoIdsOrdenados()[0]).toBe("brinco-eletronico");

    expect(curralManejoIdsOrdenados()[1]).toBe("pesagem");

    expect(curralManejoIdsOrdenados()[2]).toBe("sanitario");

    expect(curralManejoIdsOrdenados()).not.toContain("baixa-animal");

  });



  it("movimentação do animal não aparece no hub do curral", () => {

    expect(isManejoExibidoNoHubCurral("baixa-animal")).toBe(false);

    expect(isManejoExibidoNoHubCurral("pesagem")).toBe(true);

  });



  it("primeiroManejoDisponivelNaOrdem respeita ordem de seleção", () => {

    expect(primeiroManejoDisponivelNaOrdem(["sanitario", "pesagem"])).toBe("sanitario");

    expect(primeiroManejoDisponivelNaOrdem(["troca-lote"])).toBe("troca-lote");

    expect(primeiroManejoDisponivelNaOrdem(["pesagem", "sanitario"])).toBe("pesagem");

  });



  it("manejosCurralOperacionaisNaOrdem mantém ordem e exclui indisponíveis", () => {

    expect(manejosCurralOperacionaisNaOrdem(["pesagem"])).toEqual(["pesagem"]);

    expect(manejosCurralOperacionaisNaOrdem(["sanitario", "pesagem"])).toEqual([

      "sanitario",

      "pesagem",

    ]);

    expect(
      manejosCurralOperacionaisNaOrdem(["pesagem", "sanitario", "troca-lote", "brinco-eletronico"]),
    ).toEqual(["pesagem", "sanitario", "troca-lote", "brinco-eletronico"]);

  });



  it("podeSelecionarManejoNoHub só permite manejos operacionais no curral", () => {

    expect(podeSelecionarManejoNoHub("pesagem")).toBe(true);

    expect(podeSelecionarManejoNoHub("sanitario")).toBe(true);

    expect(podeSelecionarManejoNoHub("troca-lote")).toBe(true);

    expect(podeSelecionarManejoNoHub("brinco-eletronico")).toBe(true);

    expect(podeSelecionarManejoNoHub("reprodutivo")).toBe(true);

    expect(podeSelecionarManejoNoHub("desmama")).toBe(true);

    expect(podeSelecionarManejoNoHub("castracao")).toBe(true);

    expect(podeSelecionarManejoNoHub("baixa-animal")).toBe(false);

  });



  it("expõe metadados JetBov por id", () => {

    const entry = getCurralManejoJetBovEntry("troca-lote");

    expect(entry?.labelJetBov).toContain("Troca");

    expect(labelStatusCurralManejo(entry!.statusCurral)).toBe("Disponível");

  });

});


