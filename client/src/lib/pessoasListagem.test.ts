import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPRA_VENDA_COMPRADORES_LEGADO_PATH,
  CONSULTA_PESSOAS_ADMIN,
  FINANCEIRO_PESSOAS_PATH,
  COLUNAS_LISTA_PARCEIROS,
  acoesPessoaListagem,
  filtrarPessoasPorStatus,
  ordenarParceirosPorNome,
  parceiroCombinaBusca,
  pessoaEstaAtiva,
  rotuloPapelPessoa,
  rotuloTipoParceiro,
  tituloInativarPessoa,
  tituloReativarPessoa,
} from "./pessoasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const pessoasPage = readFileSync(resolve(here, "../pages/FinancialPeoplePage.tsx"), "utf8");
const avisosParceiro = readFileSync(resolve(here, "../components/ParceiroListaAvisos.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const modulePages = readFileSync(resolve(here, "../pages/ModulePages.tsx"), "utf8");
const vendasPage = modulePages.slice(modulePages.indexOf("export function SalesPage"));

const ativo = { id: 1, nome: "Frigorífico", tipo: "cliente", ativo: true };
const inativo = { id: 2, nome: "Agro X", tipo: "fornecedor", ativo: false };

describe("pessoasListagem — cadastro central no lugar de Gerenciar Compradores", () => {
  it("a tela de Parceiros mostra a busca e o quadro das sete colunas", () => {
    expect(CONSULTA_PESSOAS_ADMIN).toEqual({ incluirInativos: true });
    expect(COLUNAS_LISTA_PARCEIROS).toEqual([
      "Nome",
      "Tipo",
      "CPF/CNPJ",
      "E-mail",
      "Telefone",
      "Situação",
      "Ações",
    ]);
    expect(pessoasPage).toContain("Parceiros (Clientes/Fornecedores e Funcionários)");
    expect(pessoasPage).toContain("Novo Parceiro");
    expect(pessoasPage).toContain("Cadastrar Parceiro");
    expect(pessoasPage).toContain("Editar Parceiro");
    expect(pessoasPage).toContain("Descartar alterações?");
    expect(pessoasPage).toContain("FINANCEIRO_PESSOAS_CADASTRO_PATH");
    expect(pessoasPage).not.toContain("<Dialog");
    expect(app).toContain('path="/financeiro/pessoas/cadastro"');
    expect(pessoasPage).toContain("Inscrição Estadual");
    expect(pessoasPage).toContain(">Nome</");
    expect(pessoasPage).toContain(">CEP</");
    expect(pessoasPage).not.toContain("Nome ou razão social");
    expect(pessoasPage).not.toContain("Informações complementares");
    expect(pessoasPage).toContain("Buscar parceiro");
    expect(pessoasPage).toContain("ordenarParceirosPorNome");
    expect(pessoasPage).toContain("arrow_drop_up");
    expect(pessoasPage).toContain("arrow_drop_down");
    expect(pessoasPage).toContain("COLUNAS_LISTA_PARCEIROS");
    expect(pessoasPage).toContain("parceiroCombinaBusca");
    expect(pessoasPage).toContain("CONSULTA_PESSOAS_ADMIN");
    expect(pessoasPage).not.toContain("Nova Pessoa");
    expect(pessoasPage).toContain("ParceiroListaAvisos");
    expect(pessoasPage).toContain("Excluir");
    expect(avisosParceiro).toContain("será excluído.");
    expect(avisosParceiro).toContain("não pode ser excluído.");
    expect(avisosParceiro).toContain("ficará inativo.");
    expect(avisosParceiro).toContain("volta a ficar ativo.");
    expect(pessoasPage).not.toContain("Voltar para Insumos");
    expect(pessoasPage).not.toContain("FinancialTabs");
  });

  it("busca pelo nome, tipo, documento, e-mail e telefone", () => {
    const frigorifico = {
      nome: "Frigorífico São Paulo",
      tipo: "cliente",
      documento: "12345678000199",
      email: "compra@frigorifico.example",
      telefone: "99999999999",
    };
    expect(rotuloTipoParceiro("cliente")).toBe("Cliente");
    expect(rotuloTipoParceiro("fornecedor")).toBe("Fornecedor");
    expect(rotuloTipoParceiro("funcionario")).toBe("Funcionário");
    expect(parceiroCombinaBusca(frigorifico, "")).toBe(true);
    expect(parceiroCombinaBusca(frigorifico, "frigor")).toBe(true);
    expect(parceiroCombinaBusca(frigorifico, "cliente")).toBe(true);
    expect(parceiroCombinaBusca(frigorifico, "12345678")).toBe(true);
    expect(parceiroCombinaBusca(frigorifico, "compra@")).toBe(true);
    expect(parceiroCombinaBusca(frigorifico, "99999")).toBe(true);
    expect(parceiroCombinaBusca(frigorifico, "vaqueiro")).toBe(false);
    expect(ordenarParceirosPorNome([
      { nome: "Sítio" },
      { nome: "Água Boa" },
      { nome: "Pedro Gomes" },
    ]).map((parceiro) => parceiro.nome)).toEqual(["Água Boa", "Pedro Gomes", "Sítio"]);
    expect(ordenarParceirosPorNome([
      { nome: "Sítio" },
      { nome: "Água Boa" },
      { nome: "Pedro Gomes" },
    ], false).map((parceiro) => parceiro.nome)).toEqual(["Sítio", "Pedro Gomes", "Água Boa"]);
  });

  it("ativo oferece Inativar e inativo oferece Reativar", () => {
    expect(pessoaEstaAtiva(ativo)).toBe(true);
    expect(pessoaEstaAtiva(inativo)).toBe(false);
    expect(acoesPessoaListagem(true)).toEqual({ editar: true, inativar: true, reativar: false, excluir: true });
    expect(acoesPessoaListagem(false)).toEqual({ editar: true, inativar: false, reativar: true, excluir: true });
    expect(filtrarPessoasPorStatus([ativo, inativo], "todos").map(p => p.id)).toEqual([1, 2]);
    expect(filtrarPessoasPorStatus([ativo, inativo], "ativos").map(p => p.id)).toEqual([1]);
    expect(filtrarPessoasPorStatus([ativo, inativo], "inativos").map(p => p.id)).toEqual([2]);
  });

  it("rótulos de inativar/reativar usam o papel da ficha", () => {
    expect(rotuloPapelPessoa("cliente")).toBe("comprador");
    expect(rotuloPapelPessoa("fornecedor")).toBe("fornecedor");
    expect(tituloInativarPessoa("cliente")).toBe("Inativar comprador?");
    expect(tituloReativarPessoa("fornecedor")).toBe("Reativar fornecedor");
  });

  it("Vendas não tem mais Gerenciar Compradores; a rota antiga vai para Pessoas", () => {
    expect(FINANCEIRO_PESSOAS_PATH).toBe("/financeiro/pessoas");
    expect(COMPRA_VENDA_COMPRADORES_LEGADO_PATH).toBe("/compra-venda/vendas/compradores");
    expect(vendasPage).not.toContain("Gerenciar Compradores");
    expect(vendasPage).not.toContain("COMPRA_VENDA_COMPRADORES");
    expect(app).not.toContain("VendasCompradoresPage");
    expect(app).toContain("COMPRA_VENDA_COMPRADORES_LEGADO_PATH");
    expect(app).toContain("FINANCEIRO_PESSOAS_PATH");
    expect(app).toContain("RedirectTo to={FINANCEIRO_PESSOAS_PATH}");
  });
});
