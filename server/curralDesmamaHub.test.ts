import { describe, expect, it } from "vitest";
import {
  aplicarOrdemDesmamaJetBov,
  CURRAL_DESMAMA_ORDEM_JETBOV,
  manejosDesmamaJetBovFaltando,
} from "../shared/curralDesmamaHub";

describe("curralDesmamaHub", () => {
  it("lista manejos JetBov faltando na seleção", () => {
    expect(manejosDesmamaJetBovFaltando(["desmama"])).toEqual(["pesagem", "troca-lote"]);
    expect(manejosDesmamaJetBovFaltando(CURRAL_DESMAMA_ORDEM_JETBOV)).toEqual([]);
  });

  it("aplica bloco pesagem → desmama → troca de lote", () => {
    expect(aplicarOrdemDesmamaJetBov(["reprodutivo", "desmama"])).toEqual([
      "reprodutivo",
      "pesagem",
      "desmama",
      "troca-lote",
    ]);
    expect(aplicarOrdemDesmamaJetBov(["pesagem", "desmama", "sanitario"])).toEqual([
      "pesagem",
      "desmama",
      "troca-lote",
      "sanitario",
    ]);
  });

  it("sem desmama na ordem não altera", () => {
    expect(aplicarOrdemDesmamaJetBov(["pesagem", "sanitario"])).toEqual([
      "pesagem",
      "sanitario",
    ]);
  });
});
