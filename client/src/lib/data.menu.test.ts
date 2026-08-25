import { describe, expect, it } from "vitest";
import { MANEJO_REPRODUTIVO_PATH } from "@/const";
import { menuItems } from "./data";

function findMenuGroup(label: string) {
  return menuItems.find(item => item.label === label);
}

function childLabels(groupLabel: string): string[] {
  const group = findMenuGroup(groupLabel);
  return group?.children?.map(c => c.label) ?? [];
}

function childPaths(groupLabel: string): string[] {
  const group = findMenuGroup(groupLabel);
  return group?.children?.map(c => c.path).filter(Boolean) as string[];
}

describe("menu lateral — Manejo vs Reprodução", () => {
  it("Manejo contém Registros de Manejo", () => {
    expect(childLabels("Manejo")).toContain("Registros de Manejo");
    expect(childPaths("Manejo")).toContain("/manejo/registros");
  });

  it("Reprodução contém Estoque de sêmen", () => {
    expect(childLabels("Reprodução")).toContain("Estoque de sêmen");
    expect(childPaths("Reprodução")).toContain("/reproducao/estoque-semen");
  });

  it("Reprodução NÃO contém Registrar manejo", () => {
    expect(childLabels("Reprodução")).not.toContain("Registrar manejo");
    expect(childPaths("Reprodução")).not.toContain(MANEJO_REPRODUTIVO_PATH);
  });

  it("Reprodução NÃO contém Registros de Manejo", () => {
    expect(childLabels("Reprodução")).not.toContain("Registros de Manejo");
    expect(childPaths("Reprodução")).not.toContain("/manejo/registros");
  });

  it("Reprodução tem apenas recursos de apoio (sem duplicar Manejo)", () => {
    expect(childLabels("Reprodução")).toEqual(["Estoque de sêmen"]);
  });
});

describe("rotas oficiais — manejo reprodutivo e estoque", () => {
  it("rota oficial do manejo reprodutivo permanece em Manejo", () => {
    expect(MANEJO_REPRODUTIVO_PATH).toBe("/manejo/registros/cadastro?tipo=reprodutivo");
  });

  it("rota oficial do estoque de sêmen permanece em Reprodução", () => {
    expect(childPaths("Reprodução")).toContain("/reproducao/estoque-semen");
  });
});
