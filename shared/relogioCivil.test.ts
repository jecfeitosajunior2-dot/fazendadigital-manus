import { describe, expect, it } from "vitest";
import { formatRelogioCivilEstorno } from "./relogioCivil";

describe("formatRelogioCivilEstorno", () => {
  it("2026-10-13 19:25:37 → 13/10/2026 às 19:25 sem Date", () => {
    expect(formatRelogioCivilEstorno("2026-10-13 19:25:37")).toBe("13/10/2026 às 19:25");
  });

  it("aceita T no meio e ignora fuso no texto", () => {
    expect(formatRelogioCivilEstorno("2026-10-13T19:25:37")).toBe("13/10/2026 às 19:25");
  });

  it("rejeita valor que não é relógio civil", () => {
    expect(formatRelogioCivilEstorno("13/10/2026 19:25")).toBe("—");
    expect(formatRelogioCivilEstorno("")).toBe("—");
    expect(formatRelogioCivilEstorno(null)).toBe("—");
  });
});
