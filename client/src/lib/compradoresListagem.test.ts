import { describe, expect, it } from "vitest";
import {
  CONSULTA_COMPRADORES_ADMIN,
  CONSULTA_COMPRADORES_NOVA_VENDA,
  acoesCompradorListagem,
  alterarBuscaCompradores,
  aplicarFiltrosCompradores,
  compradorEstaAtivo,
  compradoresDisponiveisNovaVenda,
  compradoresExibidosNaTabela,
  estadoInicialFiltrosCompradores,
  filtrarCompradoresListagem,
  limparFiltrosCompradores,
  paginarCompradoresListagem,
  selecionarStatusCompradores,
  textoOuTraco,
} from "./compradoresListagem";

const ativo = {
  id: 1,
  nome: "Frigorífico São Paulo",
  documento: "12.345.678/0001-90",
  telefone: "(11) 98888-0001",
  email: "contato@frigo.com",
  ativo: true,
};

const inativo = {
  id: 2,
  nome: "Açougue Central",
  documento: "123.456.789-00",
  telefone: "(11) 3333-4444",
  email: null,
  ativo: false,
};

describe("compradoresListagem", () => {
  it("comprador ativo aparece em Todos e Ativos, não em Inativos", () => {
    const lista = [ativo, inativo];
    expect(filtrarCompradoresListagem(lista, { status: "todos" }).map(c => c.id)).toEqual([1, 2]);
    expect(filtrarCompradoresListagem(lista, { status: "ativos" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { status: "inativos" }).map(c => c.id)).toEqual([2]);
    expect(compradorEstaAtivo(ativo)).toBe(true);
    expect(compradorEstaAtivo(inativo)).toBe(false);
  });

  it("busca por nome, CPF/CNPJ e telefone", () => {
    const lista = [ativo, inativo];
    expect(filtrarCompradoresListagem(lista, { busca: "frigor" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "12345678000190" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "0001-90" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "988880001" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "(11) 3333" }).map(c => c.id)).toEqual([2]);
    expect(filtrarCompradoresListagem(lista, { busca: "xyz" })).toEqual([]);
  });

  it("busca também por propriedade, contato e cidade — não por UF isolada", () => {
    const lista = [
      { ...ativo, propriedadeEstabelecimento: "Fazenda Boa Esperança", nomeContato: "João da Silva", cidade: "Balsas", uf: "MA" },
      { ...inativo, propriedadeEstabelecimento: "Unidade Industrial 01", nomeContato: "Maria Souza", cidade: "Carolina", uf: "TO" },
    ];
    expect(filtrarCompradoresListagem(lista, { busca: "boa esperança" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "joão da silva" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "balsas" }).map(c => c.id)).toEqual([1]);
    expect(filtrarCompradoresListagem(lista, { busca: "carolina" }).map(c => c.id)).toEqual([2]);
    expect(filtrarCompradoresListagem(lista, { busca: "TO" })).toEqual([]);
  });

  it("dados ausentes viram traço e Limpar equivale a Todos sem busca", () => {
    expect(textoOuTraco(null)).toBe("—");
    expect(textoOuTraco("")).toBe("—");
    expect(textoOuTraco("  ")).toBe("—");
    expect(textoOuTraco("contato@frigo.com")).toBe("contato@frigo.com");
    expect(filtrarCompradoresListagem([ativo, inativo], { busca: "", status: "todos" })).toHaveLength(2);
  });

  it("ativo oferece Inativar e inativo oferece Reativar, sem as duas juntas", () => {
    expect(acoesCompradorListagem(true)).toEqual({ editar: true, inativar: true, reativar: false });
    expect(acoesCompradorListagem(false)).toEqual({ editar: true, inativar: false, reativar: true });
  });

  it("Nova Venda usa só ativos; a listagem admin pede inativos sem misturar as consultas", () => {
    expect(CONSULTA_COMPRADORES_NOVA_VENDA).toEqual({ tipo: "cliente" });
    expect("incluirInativos" in CONSULTA_COMPRADORES_NOVA_VENDA).toBe(false);
    expect(CONSULTA_COMPRADORES_ADMIN).toEqual({ tipo: "cliente", incluirInativos: true });
    expect(compradoresDisponiveisNovaVenda([ativo, inativo]).map(c => c.id)).toEqual([1]);
  });

  it("comprador reativado some de Inativos e volta à Nova Venda", () => {
    const reativado = { ...inativo, ativo: true };
    expect(filtrarCompradoresListagem([inativo], { status: "inativos" }).map(c => c.id)).toEqual([2]);
    expect(compradoresDisponiveisNovaVenda([inativo])).toEqual([]);
    expect(filtrarCompradoresListagem([reativado], { status: "todos" }).map(c => c.id)).toEqual([2]);
    expect(filtrarCompradoresListagem([reativado], { status: "ativos" }).map(c => c.id)).toEqual([2]);
    expect(filtrarCompradoresListagem([reativado], { status: "inativos" })).toEqual([]);
    expect(compradoresDisponiveisNovaVenda([reativado]).map(c => c.id)).toEqual([2]);
  });

  it("mudar só o rascunho do Select não filtra a tabela — era o bug do navegador", () => {
    const frigoInativo = { ...inativo, id: 1, nome: "Frigorífico São Paulo" };
    const pauloAtivo = { ...ativo, id: 2, nome: "Paulo Gomes Joe" };
    const lista = [frigoInativo, pauloAtivo];
    let estado = estadoInicialFiltrosCompradores();
    estado = {
      ...estado,
      rascunho: { ...estado.rascunho, status: "ativos" },
    };
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual([
      "Frigorífico São Paulo",
      "Paulo Gomes Joe",
    ]);
  });

  it("fluxo da tela: Todos → Ativos → Inativos → Todos, com Filtrar e Limpar", () => {
    const frigoInativo = { ...inativo, id: 1, nome: "Frigorífico São Paulo" };
    const pauloAtivo = { ...ativo, id: 2, nome: "Paulo Gomes Joe" };
    const lista = [frigoInativo, pauloAtivo];

    let estado = estadoInicialFiltrosCompradores();
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual([
      "Frigorífico São Paulo",
      "Paulo Gomes Joe",
    ]);

    estado = selecionarStatusCompradores(estado, "ativos");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual(["Paulo Gomes Joe"]);
    expect(estado.page).toBe(1);

    estado = selecionarStatusCompradores(estado, "inativos");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual(["Frigorífico São Paulo"]);

    estado = selecionarStatusCompradores(estado, "todos");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual([
      "Frigorífico São Paulo",
      "Paulo Gomes Joe",
    ]);

    estado = selecionarStatusCompradores(estado, "ativos");
    estado = alterarBuscaCompradores(estado, "Paulo");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual(["Paulo Gomes Joe"]);

    estado = alterarBuscaCompradores(estado, "Frigorífico");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado)).toEqual([]);

    estado = selecionarStatusCompradores(estado, "inativos");
    estado = alterarBuscaCompradores(estado, "Frigorífico");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado).map(c => c.nome)).toEqual(["Frigorífico São Paulo"]);

    estado = alterarBuscaCompradores(estado, "Paulo Gomes Joe");
    estado = aplicarFiltrosCompradores(estado);
    expect(compradoresExibidosNaTabela(lista, estado)).toEqual([]);

    estado = limparFiltrosCompradores();
    expect(estado.rascunho).toEqual({ busca: "", status: "todos" });
    expect(estado.aplicados).toEqual({ busca: "", status: "todos" });
    expect(estado.page).toBe(1);
    expect(compradoresExibidosNaTabela(lista, estado)).toHaveLength(2);
    expect(paginarCompradoresListagem(compradoresExibidosNaTabela(lista, estado), estado.page, 10)).toHaveLength(2);
  });

  it("paginação corta a lista já filtrada", () => {
    const lista = Array.from({ length: 12 }, (_, i) => ({
      ...ativo,
      id: i + 1,
      nome: `Comprador ${i + 1}`,
    }));
    const filtradas = filtrarCompradoresListagem(lista, { status: "ativos" });
    expect(paginarCompradoresListagem(filtradas, 1, 10)).toHaveLength(10);
    expect(paginarCompradoresListagem(filtradas, 2, 10).map(c => c.id)).toEqual([11, 12]);
  });
});
