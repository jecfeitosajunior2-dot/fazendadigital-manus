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
} from "./curralManejoJetBovMap";

describe("curralManejoJetBovMap", () => {
  it("pesagem é o único manejo disponível no curral por enquanto", () => {
    const disponiveis = CURRAL_MANEJO_JETBOV_MAP.filter(e => e.statusCurral === "disponivel");
    expect(disponiveis.map(e => e.id)).toEqual(["pesagem"]);
    expect(isCurralManejoDisponivel("pesagem")).toBe(true);
    expect(isCurralManejoDisponivel("sanitario")).toBe(false);
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
    expect(primeiroManejoDisponivelNaOrdem(["sanitario", "pesagem"])).toBe("pesagem");
    expect(primeiroManejoDisponivelNaOrdem(["sanitario"])).toBe(null);
    expect(primeiroManejoDisponivelNaOrdem(["pesagem", "sanitario"])).toBe("pesagem");
  });

  it("podeSelecionarManejoNoHub bloqueia pontual_apenas", () => {
    expect(podeSelecionarManejoNoHub("baixa-animal")).toBe(false);
    expect(podeSelecionarManejoNoHub("sanitario")).toBe(true);
  });

  it("expõe metadados JetBov por id", () => {
    const entry = getCurralManejoJetBovEntry("troca-lote");
    expect(entry?.labelJetBov).toContain("Troca");
    expect(labelStatusCurralManejo(entry!.statusCurral)).toBe("Em breve");
  });
});
