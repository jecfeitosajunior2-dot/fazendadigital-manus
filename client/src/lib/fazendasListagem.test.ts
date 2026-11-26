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
  caminhoFichaFazenda,
  caminhoSubdivisoesDaFazenda,
  corSituacaoFazenda,
  fazendaCombinaBusca,
  fazendaDaLista,
  fazendaIdDaBusca,
  modoExclusaoBloqueada,
  municipioUf,
  ordenarFazendasPorNome,
  pastagemHaCadastrada,
  quantidadeSubdivisoes,
  rotuloSituacaoFazenda,
} from "./fazendasListagem";

const aqui = dirname(fileURLToPath(import.meta.url));
const paginas = readFileSync(resolve(aqui, "../pages/ModulePages.tsx"), "utf8");
const lista = paginas.slice(
  paginas.indexOf("function FarmRowActions"),
  paginas.indexOf("export function SubdivisionsPage"),
);

describe("colunas da lista de fazendas", () => {
  it("segue as sete colunas nesta ordem", () => {
    expect(COLUNAS_LISTA_FAZENDAS).toEqual([
      "Nome",
      "Município/UF",
      "Área Total (ha)",
      "Pastagem (ha)",
      "Subdivisões",
      "Situação",
      "Ações",
    ]);
    const pagina = lista.slice(lista.indexOf("export function FarmsListPage"));
    expect(pagina.indexOf("Subdivisões")).toBeLessThan(pagina.indexOf(">Situação<") === -1
      ? pagina.indexOf("rotuloSituacaoFazenda")
      : pagina.indexOf("Situação"));
    expect(pagina).toContain("quantidadeSubdivisoes");
  });

  it("mostra Ativa ou Inativa sem tratar o nome como situação", () => {
    expect(rotuloSituacaoFazenda("ativo")).toBe("Ativa");
    expect(rotuloSituacaoFazenda("inativo")).toBe("Inativa");
    expect(rotuloSituacaoFazenda(null)).toBe("Ativa");
    expect(rotuloSituacaoFazenda(undefined)).toBe("Ativa");
    expect(corSituacaoFazenda("ativo")).toBe("#16A34A");
    expect(corSituacaoFazenda(null)).toBe("#16A34A");
    expect(corSituacaoFazenda("inativo")).toBe("#D97706");
    const pagina = lista.slice(lista.indexOf("export function FarmsListPage"));
    expect(pagina).toContain("rotuloSituacaoFazenda");
    expect(pagina).toContain("corSituacaoFazenda");
    expect(pagina).not.toContain('ml-2 text-gray-400">Inativa');
  });

  it("ordena o nome de A até Z e inverte no clique da seta", () => {
    const fazendas = [
      { nome: "Sítio Revisão Cadastro" },
      { nome: "Fazenda da Prévia" },
      { nome: "Água Boa" },
    ];
    expect(ordenarFazendasPorNome(fazendas).map((fazenda) => fazenda.nome)).toEqual([
      "Água Boa",
      "Fazenda da Prévia",
      "Sítio Revisão Cadastro",
    ]);
    expect(ordenarFazendasPorNome(fazendas, false).map((fazenda) => fazenda.nome)).toEqual([
      "Sítio Revisão Cadastro",
      "Fazenda da Prévia",
      "Água Boa",
    ]);
    const pagina = lista.slice(lista.indexOf("export function FarmsListPage"));
    expect(pagina).toContain("ordenarFazendasPorNome");
    expect(pagina).toContain("arrow_drop_up");
    expect(pagina).toContain("arrow_drop_down");
    expect(pagina).toContain('coluna === "Nome"');
  });

  it("busca pelo nome e pelo município desta conta", () => {
    const balsas = { nome: "Fazenda da Prévia", cidade: "Balsas", estado: "MA" };
    const sitio = { nome: "Sítio Revisão Cadastro", cidade: "Balsas", estado: "MA" };
    expect(fazendaCombinaBusca(balsas, "")).toBe(true);
    expect(fazendaCombinaBusca(balsas, "prévia")).toBe(true);
    expect(fazendaCombinaBusca(balsas, "Balsas/MA")).toBe(true);
    expect(fazendaCombinaBusca(sitio, "prévia")).toBe(false);
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
    expect(pastagemHaCadastrada("12.50")).toBe("12,50");
    expect(pastagemHaCadastrada(null)).toBe("—");
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

  it("abre a ficha da fazenda que já está na conta", () => {
    const pagina = lista.slice(lista.indexOf("export function FarmsListPage"));
    expect(caminhoFichaFazenda(4)).toBe("/fazendas/ficha?id=4&aba=dados");
    expect(caminhoFichaFazenda(4, "subdivisoes")).toBe("/fazendas/ficha?id=4&aba=subdivisoes");
    expect(pagina).toContain('caminhoFichaFazenda(f.id, "subdivisoes")');
    expect(pagina).toContain("caminhoFichaFazenda(f.id)");
  });

  it("abre só a subdivisão da fazenda que já está na conta", () => {
    expect(caminhoSubdivisoesDaFazenda(4)).toBe("/fazendas/subdivisoes?fazendaId=4");
    expect(fazendaIdDaBusca("?fazendaId=4")).toBe(4);
    expect(fazendaIdDaBusca("fazendaId=0")).toBeNull();
    expect(fazendaIdDaBusca("fazendaId=1e2")).toBeNull();
    const conta = [{ id: 4, nome: "Da conta" }];
    expect(fazendaDaLista(conta, 4)?.nome).toBe("Da conta");
    expect(fazendaDaLista(conta, 9)).toBeNull();
    const cadastro = lista.slice(lista.indexOf("export function FarmsListPage"));
    expect(cadastro).not.toContain("caminhoSubdivisoesDaFazenda");
    expect(cadastro).not.toContain("BotaoQuantidadeSubdivisoes");
    const pagina = readFileSync(resolve(aqui, "../pages/SubdivisoesPage.tsx"), "utf8");
    expect(pagina).toContain("fazendaDaLista");
    expect(pagina).not.toContain("fazendas.get");
  });

  it("inativa sem apagar e a exclusão física continua recusada", () => {
    const operacao = readFileSync(resolve(aqui, "../../../server/fazendasOperacao.ts"), "utf8");
    expect(operacao).toContain("async definirSituacao");
    expect(operacao).toContain("SET situacao");
    expect(operacao).toContain("tx.delete(fazendas)");
    const excluir = operacao.slice(operacao.indexOf("async excluir"), operacao.indexOf("};", operacao.indexOf("async excluir")));
    expect(excluir).toContain("throw new TRPCError");
    expect(excluir).toContain("tx.delete(fazendas)");
    const lista = readFileSync(resolve(aqui, "../pages/ModulePages.tsx"), "utf8");
    const pagina = lista.slice(lista.indexOf("export function FarmsListPage"), lista.indexOf("export function SubdivisionsPage"));
    expect(pagina).toContain("definirSituacao");
    expect(pagina).toContain("fazendas.delete.useMutation");
    const avisos = readFileSync(resolve(aqui, "../components/FazendaListaAvisos.tsx"), "utf8");
    expect(avisos).toContain("Inativar fazenda");
    expect(avisos).toContain("Reativar fazenda");
    expect(avisos).toContain("volta a ficar ativa.");
    expect(avisos).not.toContain("operações autorizadas");
    expect(avisos).not.toContain("deixará de estar disponível para novas operações.");
    expect(avisos).toContain("ficará inativa.");
    expect(avisos).toContain("Os cadastros e históricos vinculados serão preservados.");
    expect(avisos).toContain("Não é possível excluir a fazenda");
    expect(avisos).toContain("não pode ser excluída.");
    expect(avisos).toContain("</Nome> será excluída.</p>");
    expect(avisos).not.toContain("Esta ação não tem volta.");
    expect(avisos).toContain("Entendi");
    expect(avisos).not.toContain("subdivisões vinculadas");
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
