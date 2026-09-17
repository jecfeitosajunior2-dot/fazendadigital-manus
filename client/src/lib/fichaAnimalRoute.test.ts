import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getFichaAnimalPath,
  parseFichaAnimalTab,
  isFichaAnimalTab,
} from "./fichaAnimalRoute";

const here = dirname(fileURLToPath(import.meta.url));

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

  it("histórico reprodutivo da ficha usa coluna Desfecho", () => {
    const page = readFileSync(resolve(here, "../pages/CattleDetailPageExpanded.tsx"), "utf8");
    expect(page).toContain("Histórico Reprodutivo");
    expect(page).toMatch(/uppercase tracking-wide whitespace-nowrap">\s*Desfecho\s*</);
    expect(page).not.toMatch(/uppercase tracking-wide whitespace-nowrap">\s*Resultado\s*</);
    expect(page).not.toMatch(/uppercase tracking-wide whitespace-nowrap">\s*Status\s*</);
  });
});
