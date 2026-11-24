import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const paginas = readFileSync(resolve(here, "../pages/ModulePages.tsx"), "utf8");
const exportacao = readFileSync(resolve(here, "../components/ListExportButtons.tsx"), "utf8");
const css = readFileSync(resolve(here, "../index.css"), "utf8");
const menu = readFileSync(resolve(here, "../components/Sidebar.tsx"), "utf8");
const inicio = paginas.indexOf("export function FarmsListPage");
const fim = paginas.indexOf("export function SubdivisionsPage");
const fazendas = paginas.slice(inicio, fim);

describe("tipografia só da lista de fazendas", () => {
  it("aplica Inter nos pontos pedidos", () => {
    expect(fazendas).toContain('fontSize: "24px"');
    expect(fazendas).toContain('fontWeight: 600, color: "#172033"');
    expect(fazendas).toContain('fontSize: "12px", fontWeight: 500');
    expect(fazendas).toContain('fontSize: "14px", fontWeight: 400');
    expect(fazendas).toContain("backgroundColor: \"#4ECDC4\"");
    expect(fazendas).toContain("min-h-[44px]");
    expect(fazendas).toContain("Nova Fazenda");
    expect(fazendas).not.toContain("ListExportButtons");
  });

  it("não troca a fonte global, o menu nem o botão de exportar das outras listas", () => {
    expect(css).toContain("font-family: 'Inter'");
    expect(menu).not.toContain("#172033");
    expect(exportacao).toContain("export default function ListExportButtons");
    expect(exportacao).toContain('backgroundColor: "#2563eb"');
    expect(paginas).toContain("<ListExportButtons");
  });
});
