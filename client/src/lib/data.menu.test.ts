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
  it("Manejo contém só Registros de Manejo", () => {
    expect(childLabels("Manejo")).toEqual(["Registros de Manejo"]);
    expect(childPaths("Manejo")).toEqual(["/manejo/registros"]);
    expect(menuItems.map(i => i.label)).not.toContain("Saúde");
    expect(childLabels("Manejo")).not.toContain("Saúde");
    expect(childPaths("Manejo")).not.toContain("/saude/registros");
  });

  it("Reprodução contém apenas Controle de sêmen, sem cadastro separado", () => {
    expect(childLabels("Reprodução")).toEqual(["Controle de Sêmen"]);
    expect(childPaths("Reprodução")).toEqual(["/reproducao/estoque-semen"]);
    expect(childLabels("Reprodução")).not.toContain("Cadastro de sêmen");
    expect(childPaths("Reprodução")).not.toContain("/reproducao/cadastro-semen");
    expect(childLabels("Reprodução")).not.toContain("Estoque de sêmen");
    expect(childLabels("Reprodução")).not.toContain("Visão Geral");
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
    expect(childLabels("Reprodução")).toEqual(["Controle de Sêmen"]);
  });
});

describe("rotas oficiais — manejo reprodutivo e estoque", () => {
  it("rota oficial do manejo reprodutivo permanece em Manejo", () => {
    expect(MANEJO_REPRODUTIVO_PATH).toBe("/manejo/registros/cadastro?tipo=reprodutivo");
  });

  it("Controle de sêmen abre em Estoque; Utilizado continua como aba", () => {
    expect(childPaths("Reprodução")).toEqual(["/reproducao/estoque-semen"]);
    expect(childPaths("Reprodução")).not.toContain("/reproducao/semen-utilizado");
  });
});

describe("menu lateral — Compra e Venda", () => {
  it("mantém apenas Visão Geral, Compras e Vendas", () => {
    expect(childLabels("Compra e Venda")).toEqual(["Visão Geral", "Compras", "Vendas"]);
    expect(childPaths("Compra e Venda")).toEqual([
      "/compra-venda/visao-geral",
      "/compra-venda/compras",
      "/compra-venda/vendas",
    ]);
  });

  it("não adiciona Compradores na sidebar nem em Cadastros", () => {
    expect(childLabels("Compra e Venda")).not.toContain("Compradores");
    expect(menuItems.map(i => i.label)).not.toContain("Cadastros");
  });

  it("não implementa Sessão no Curral nesta etapa", () => {
    expect(childLabels("Compra e Venda")).not.toContain("Sessão no Curral");
    expect(childPaths("Compra e Venda").join(" ")).not.toMatch(/curral|rfid|at05/i);
  });
});

describe("menu lateral — Financeiro", () => {
  it("aponta só para as páginas oficiais do V2", () => {
    expect(childLabels("Financeiro")).toEqual([
      "Visão Geral",
      "Contas a Receber",
      "Contas a Pagar",
      "Caixa e Bancos",
      "Relatórios",
      "Pessoas",
    ]);
    expect(childPaths("Financeiro")).toEqual([
      "/financeiro/visao-geral",
      "/financeiro/contas-a-receber",
      "/financeiro/contas-a-pagar",
      "/financeiro/v2/contas",
      "/financeiro/relatorios",
      "/financeiro/pessoas",
    ]);
    expect(childPaths("Financeiro")).not.toContain("/financeiro/contas");
    expect(childPaths("Financeiro")).not.toContain("/financeiro/movimentacao");
    expect(childPaths("Financeiro")).not.toContain("/financeiro/categorias");
  });
});

describe("menu lateral — Relatórios independentes", () => {
  it("não aparece no menu principal", () => {
    expect(menuItems.map(i => i.label)).not.toContain("Relatórios");
    expect(menuItems.flatMap(i => i.children?.map(c => c.path) ?? [])).not.toContain("/relatorios/visao-geral");
    expect(menuItems.flatMap(i => i.children?.map(c => c.path) ?? [])).not.toContain("/relatorios/gerenciais");
    expect(menuItems.flatMap(i => i.children?.map(c => c.path) ?? [])).not.toContain("/relatorios/evolucao");
    expect(menuItems.flatMap(i => i.children?.map(c => c.path) ?? [])).not.toContain("/relatorios/reprodutivos");
    expect(menuItems.flatMap(i => i.children?.map(c => c.path) ?? [])).not.toContain("/relatorios/operacionais");
  });

  it("Financeiro → Relatórios permanece", () => {
    expect(childLabels("Financeiro")).toContain("Relatórios");
    expect(childPaths("Financeiro")).toContain("/financeiro/relatorios");
  });

  it("Painel de Controle permanece", () => {
    expect(menuItems[0]).toMatchObject({ label: "Painel de Controle", path: "/admin/overview" });
  });
});

describe("menu lateral — Nutrição", () => {
  it("é o grupo com mais atalhos — precisa caber na rolagem da tela", () => {
    const tamanhos = menuItems.map(item => ({
      label: item.label,
      filhos: item.children?.length ?? 0,
    }));
    const maior = Math.max(...tamanhos.map(t => t.filhos));
    expect(childLabels("Nutrição")).toHaveLength(maior);
    expect(maior).toBeGreaterThanOrEqual(7);
  });
});
