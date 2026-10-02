import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deveEsticarPaginaPeloMenu } from "./sidebarScroll";

const here = dirname(fileURLToPath(import.meta.url));
const sidebarSrc = readFileSync(resolve(here, "../components/Sidebar.tsx"), "utf8");
const tableSrc = readFileSync(resolve(here, "../components/TableHorizontalScroll.tsx"), "utf8");

describe("rolagem do menu e das tabelas — Nutrição", () => {
  it("esticar a página quando só Nutrição está aberta e o menu passa da tela", () => {
    expect(
      deveEsticarPaginaPeloMenu({
        contentH: 900,
        leftover: 700,
        openGroups: 1,
      }),
    ).toBe(true);
  });

  it("não estica a página quando o menu cabe na tela", () => {
    expect(
      deveEsticarPaginaPeloMenu({
        contentH: 400,
        leftover: 700,
        openGroups: 1,
      }),
    ).toBe(false);
  });

  it("o menu do desktop rola por dentro se ainda faltar espaço", () => {
    expect(sidebarSrc).toContain("deveEsticarPaginaPeloMenu");
    expect(sidebarSrc).toContain("min-h-0 flex-1 overflow-y-auto pb-2 scrollbar-thin");
  });

  it("a tabela não engole a rolagem vertical da página", () => {
    expect(tableSrc).toContain("root.scrollTop += dy");
    expect(tableSrc).toContain("overflowY !== \"hidden\"");
  });
});
