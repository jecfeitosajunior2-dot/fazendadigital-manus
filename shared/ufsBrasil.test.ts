import { describe, expect, it } from "vitest";
import { normalizeUfBrasil } from "./ufsBrasil";

describe("normalizeUfBrasil", () => {
  it("padroniza UF em 2 letras ou devolve vazio", () => {
    expect(normalizeUfBrasil("ma")).toBe("MA");
    expect(normalizeUfBrasil(" TO ")).toBe("TO");
    expect(normalizeUfBrasil("")).toBeNull();
    expect(normalizeUfBrasil("XX")).toBeNull();
    expect(normalizeUfBrasil(null)).toBeNull();
  });
});
