import { describe, expect, it } from "vitest";
import { CONSULTA_COMPRADORES_NOVA_VENDA } from "./compradoresListagem";
import {
  alterarUfComprador,
  compradorFormFromPessoa,
  emptyCompradorForm,
  opcoesCidadeComprador,
  payloadPessoaCliente,
  pessoaAposInativar,
  pessoaAposReativar,
  placeholderCidadeComprador,
} from "./compradoresCadastro";

describe("cadastro de comprador — novos campos", () => {
  it("criar com somente dados obrigatórios deixa os novos campos vazios", () => {
    const payload = payloadPessoaCliente({
      ...emptyCompradorForm(),
      nome: "Paulo Gomes Joe",
      documento: "123.456.789-00",
    });
    expect(payload).toMatchObject({
      nome: "Paulo Gomes Joe",
      tipo: "cliente",
      documento: "123.456.789-00",
    });
    expect(payload.propriedadeEstabelecimento).toBe("");
    expect(payload.nomeContato).toBe("");
    expect(payload.cidade).toBe("");
    expect(payload.uf).toBe("");
    expect("fazendaId" in payload).toBe(false);
  });

  it("criar com todos os novos campos e editar depois", () => {
    const criado = payloadPessoaCliente({
      ...emptyCompradorForm(),
      nome: "José Antônio da Silva",
      documento: "123.456.789-00",
      propriedadeEstabelecimento: "Fazenda Boa Esperança",
      nomeContato: "João da Silva",
      cidade: "Balsas",
      uf: "ma",
      telefone: "(99) 99999-0000",
      email: "jose@exemplo.com",
      endereco: "Rua A, 10",
      observacoes: "Retira na terça",
    });
    expect(criado).toMatchObject({
      tipo: "cliente",
      propriedadeEstabelecimento: "Fazenda Boa Esperança",
      nomeContato: "João da Silva",
      cidade: "Balsas",
      uf: "MA",
    });

    const editado = payloadPessoaCliente({
      ...emptyCompradorForm(),
      nome: criado.nome,
      documento: criado.documento ?? "",
      propriedadeEstabelecimento: "Unidade Balsas",
      nomeContato: "Maria Souza",
      cidade: "Carolina",
      uf: "TO",
    });
    expect(editado.propriedadeEstabelecimento).toBe("Unidade Balsas");
    expect(editado.nomeContato).toBe("Maria Souza");
    expect(editado.cidade).toBe("Carolina");
    expect(editado.uf).toBe("TO");
  });

  it("comprador antigo com campos NULL continua editável vazio", () => {
    const form = compradorFormFromPessoa({
      nome: "Frigorífico São Paulo",
      documento: null,
      propriedadeEstabelecimento: null,
      nomeContato: null,
      cidade: null,
      uf: null,
    });
    expect(form.propriedadeEstabelecimento).toBe("");
    expect(form.nomeContato).toBe("");
    expect(form.cidade).toBe("");
    expect(form.uf).toBe("");
    expect(payloadPessoaCliente({ ...form, documento: "12.345.678/0001-90" }).uf).toBe("");
  });

  it("inativar e reativar não apagam os novos campos", () => {
    const cadastro = {
      id: 20,
      nome: "Cooperativa X",
      propriedadeEstabelecimento: "Fazenda Boa Esperança",
      nomeContato: "João da Silva",
      cidade: "Balsas",
      uf: "MA",
      ativo: true,
    };
    const inativo = pessoaAposInativar(cadastro);
    expect(inativo.ativo).toBe(false);
    expect(inativo.propriedadeEstabelecimento).toBe("Fazenda Boa Esperança");
    expect(inativo.nomeContato).toBe("João da Silva");
    expect(inativo.cidade).toBe("Balsas");
    expect(inativo.uf).toBe("MA");

    const reativado = pessoaAposReativar(inativo);
    expect(reativado.ativo).toBe(true);
    expect(reativado.propriedadeEstabelecimento).toBe("Fazenda Boa Esperança");
    expect(reativado.nomeContato).toBe("João da Silva");
    expect(reativado.cidade).toBe("Balsas");
    expect(reativado.uf).toBe("MA");
  });

  it("Select de cidade depende da UF e preserva cidade antiga fora da lista", () => {
    expect(alterarUfComprador("MA")).toEqual({ uf: "MA", cidade: "" });
    expect(placeholderCidadeComprador("", false)).toBe("Selecione o estado primeiro");
    expect(placeholderCidadeComprador("MA", true)).toBe("Carregando...");
    expect(placeholderCidadeComprador("MA", false)).toBe("Selecione a cidade");
    expect(opcoesCidadeComprador(["Balsas", "Carolina"], "Balsas")).toEqual(["Balsas", "Carolina"]);
    expect(opcoesCidadeComprador(["Balsas", "Carolina"], "Povoado Velho")).toEqual([
      "Povoado Velho",
      "Balsas",
      "Carolina",
    ]);
  });

  it("comprador recém-criado no fluxo da Nova Venda continua cliente ativo consultável", () => {
    const criado = { id: 88, ...payloadPessoaCliente({
      ...emptyCompradorForm(),
      nome: "Leilão Norte",
      documento: "12.345.678/0001-90",
      propriedadeEstabelecimento: "Unidade Balsas",
    }), ativo: true };
    expect(criado.tipo).toBe("cliente");
    expect(criado.id).toBe(88);
    expect(CONSULTA_COMPRADORES_NOVA_VENDA).toEqual({ tipo: "cliente" });
    expect("incluirInativos" in CONSULTA_COMPRADORES_NOVA_VENDA).toBe(false);
    expect(criado.ativo).toBe(true);
  });
});
