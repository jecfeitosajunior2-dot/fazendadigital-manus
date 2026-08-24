import { describe, expect, it } from "vitest";
import {
  getFichaAnimalPath,
  parseFichaAnimalTab,
  isFichaAnimalTab,
} from "./fichaAnimalRoute";

describe("fichaAnimalRoute", () => {
  it("monta rota com id interno", () => {
    expect(getFichaAnimalPath(15)).toBe("/rebanho/detalhes-animal?id=15");
  });

  it("inclui tab reprodução no deep link", () => {
    expect(getFichaAnimalPath(15, "reproducao")).toBe(
      "/rebanho/detalhes-animal?id=15&tab=reproducao",
    );
  });

  it("valida tabs permitidas", () => {
    expect(isFichaAnimalTab("reproducao")).toBe(true);
    expect(isFichaAnimalTab("invalida")).toBe(false);
    expect(parseFichaAnimalTab("reproducao")).toBe("reproducao");
    expect(parseFichaAnimalTab(null)).toBe("identificacao");
    expect(parseFichaAnimalTab("xyz")).toBe("identificacao");
  });
});
