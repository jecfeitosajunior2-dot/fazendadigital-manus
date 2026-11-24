import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACOES_MENU_FAZENDA,
  COLUNAS_LISTA_FAZENDAS,
  MSG_EXCLUIR_FAZENDA_BLOQUEADA,
  MSG_INATIVAR_FAZENDA_INDISPONIVEL,
  areaTotalHa,
  caminhoSubdivisoesDaFazenda,
  fazendaDaLista,
  fazendaIdDaBusca,
  modoExclusaoBloqueada,
  municipioUf,
  pastagemHaCadastrada,
  quantidadeSubdivisoes,
} from "./fazendasListagem";

const aqui = dirname(fileURLToPath(import.meta.url));
const paginas = readFileSync(resolve(aqui, "../pages/ModulePages.tsx"), "utf8");
const lista = paginas.slice(
  paginas.indexOf("function FarmRowActions"),
  paginas.indexOf("export function SubdivisionsPage"),
);

describe("colunas da lista de fazendas", () => {
  it("segue as seis colunas nesta ordem", () => {
    expect(COLUNAS_LISTA_FAZENDAS).toEqual([
      "Nome",
      "Município/UF",
      "Área Total (ha)",
      "Pastagem (ha)",
      "Subdivisões",
      "Ações",
    ]);
  });

  it("junta município e UF", () => {
    expect(municipioUf("Balsas", "MA")).toBe("Balsas/MA");
    expect(municipioUf("  Balsas ", " ma ")).toBe("Balsas/ma");
    expect(municipioUf("Balsas", "")).toBe("Balsas");
    expect(municipioUf("", "MA")).toBe("MA");
    expect(municipioUf(null, null)).toBe("—");
  });

  it("mostra a área total com duas casas e não estima pastagem", () => {
    expect(areaTotalHa("1500.5")).toBe("1.500,50");
    expect(areaTotalHa(10)).toBe("10,00");
    expect(areaTotalHa("")).toBe("—");
    expect(areaTotalHa(null)).toBe("—");
    expect(pastagemHaCadastrada()).toBe("—");
  });

  it("ordena o menu em Editar, Inativar e Excluir, sem operação falsa", () => {
    const menu = lista.slice(0, lista.indexOf("MÓDULO FAZENDAS"));
    expect(ACOES_MENU_FAZENDA).toEqual(["Editar", "Inativar", "Excluir"]);
    expect(menu.indexOf("{editar}")).toBeGreaterThan(-1);
    expect(menu.indexOf("{editar}")).toBeLessThan(menu.indexOf(": inativar"));
    expect(menu.indexOf(": inativar")).toBeLessThan(menu.indexOf("{excluir}"));
    expect(menu).not.toContain("Pastos");
    expect(menu).not.toContain("disabled");
    expect(menu).toContain("focus:text-white");
    expect(menu).toContain("onSituacao");
    expect(menu).toContain("onExcluir");
    expect(menu).toContain("Reativar");
    expect(menu).not.toContain("MSG_INATIVAR_FAZENDA_INDISPONIVEL");
    expect(menu).not.toContain("MSG_EXCLUIR_FAZENDA_BLOQUEADA");
    expect(menu).not.toContain("Nada é alterado");
    expect(menu).toContain('setLocation(`/fazendas/cadastro?id=${fazenda.id}`)');
    expect(menu).toContain("h-10 w-10");
    expect(menu).toContain("more_vert");
    expect(MSG_INATIVAR_FAZENDA_INDISPONIVEL).toContain("Nada é alterado");
    expect(MSG_EXCLUIR_FAZENDA_BLOQUEADA).toContain("bloqueada");
  });

  it("abre só a subdivisão da fazenda que já está na conta", () => {
    expect(caminhoSubdivisoesDaFazenda(4)).toBe("/fazendas/subdivisoes?fazendaId=4");
    expect(fazendaIdDaBusca("?fazendaId=4")).toBe(4);
    expect(fazendaIdDaBusca("fazendaId=0")).toBeNull();
    expect(fazendaIdDaBusca("fazendaId=1e2")).toBeNull();
    const conta = [{ id: 4, nome: "Da conta" }];
    expect(fazendaDaLista(conta, 4)?.nome).toBe("Da conta");
    expect(fazendaDaLista(conta, 9)).toBeNull();
    expect(lista).toContain("caminhoSubdivisoesDaFazenda");
    const pagina = readFileSync(resolve(aqui, "../pages/SubdivisoesPage.tsx"), "utf8");
    expect(pagina).toContain("fazendaDaLista");
    expect(pagina).not.toContain("fazendas.get");
  });

  it("inativa sem apagar e a exclusão física continua recusada", () => {
    const operacao = readFileSync(resolve(aqui, "../../../server/fazendasOperacao.ts"), "utf8");
    expect(operacao).toContain("async definirSituacao");
    expect(operacao).toContain("SET situacao");
    expect(operacao).toContain("MSG_FAZENDA_EXCLUSAO_BLOQUEADA");
    const excluir = operacao.slice(operacao.indexOf("async excluir"), operacao.indexOf("};", operacao.indexOf("async excluir")));
    expect(excluir).toContain("throw new TRPCError");
    expect(excluir).not.toContain(".delete(");
    const lista = readFileSync(resolve(aqui, "../pages/ModulePages.tsx"), "utf8");
    const pagina = lista.slice(lista.indexOf("export function FarmsListPage"), lista.indexOf("export function SubdivisionsPage"));
    expect(pagina).toContain("definirSituacao");
    expect(pagina).not.toContain("handleDeleteFazenda");
    expect(pagina).not.toContain("fazendas.delete.useMutation");
    const avisos = readFileSync(resolve(aqui, "../components/FazendaListaAvisos.tsx"), "utf8");
    expect(avisos).toContain("Inativar fazenda");
    expect(avisos).toContain("Reativar fazenda");
    expect(avisos).toContain("Não é possível excluir a fazenda");
    expect(avisos).toContain("Entendi");
    expect(avisos).toContain("subdivisões vinculadas");
    expect(avisos).not.toContain("#DC2626");
  });

  it("só cita subdivisões quando esse é o único vínculo conferido", () => {
    expect(modoExclusaoBloqueada([{ key: "subdivisoes", label: "subdivisões", qtd: 2 }])).toEqual({
      modo: "subdivisoes",
      quantidade: 2,
    });
    expect(modoExclusaoBloqueada([
      { key: "subdivisoes", label: "subdivisões", qtd: 2 },
      { key: "animais", label: "animais", qtd: 1 },
    ]).modo).toBe("vinculos");
    expect(modoExclusaoBloqueada([])).toEqual({ modo: "sem-vinculo" });
  });

  it("conta subdivisões sem transformar a contagem em hectare", () => {
    expect(quantidadeSubdivisoes(0)).toBe("0");
    expect(quantidadeSubdivisoes(3)).toBe("3");
    expect(quantidadeSubdivisoes(null)).toBe("—");
    expect(quantidadeSubdivisoes(1.5)).toBe("—");
  });
});
