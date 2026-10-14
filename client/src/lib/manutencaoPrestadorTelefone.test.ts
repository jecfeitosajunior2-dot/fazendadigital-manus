import { describe, expect, it } from "vitest";
import { formatPhoneBR } from "./utils";
import {
  telefoneAoSelecionarPrestador,
  telefoneAoSincronizarPrestador,
  telefoneDoCadastroPessoa,
  telefonePrestadorParaExibicao,
  telefonePrestadorParaOs,
} from "./manutencaoPrestadorTelefone";

describe("máscara de telefone do prestador", () => {
  it("formata celular com 11 dígitos", () => {
    expect(formatPhoneBR("99935413077")).toBe("(99) 93541-3077");
    expect(telefonePrestadorParaExibicao("99935413077")).toBe("(99) 93541-3077");
  });

  it("formata telefone fixo com 10 dígitos", () => {
    expect(formatPhoneBR("1133334444")).toBe("(11) 3333-4444");
    expect(telefonePrestadorParaExibicao("1133334444")).toBe("(11) 3333-4444");
  });

  it("aceita número armazenado sem máscara", () => {
    expect(telefonePrestadorParaExibicao("99935413077")).toBe("(99) 93541-3077");
  });

  it("aceita número armazenado com máscara", () => {
    expect(telefonePrestadorParaExibicao("(99) 93541-3077")).toBe("(99) 93541-3077");
    expect(telefonePrestadorParaExibicao("(11) 3333-4444")).toBe("(11) 3333-4444");
  });

  it("não duplica DDD e não aceita letras na digitação", () => {
    expect(formatPhoneBR("(99) 93541-3077")).toBe("(99) 93541-3077");
    expect(formatPhoneBR("99abc93541def3077")).toBe("(99) 93541-3077");
    expect(formatPhoneBR("telefone")).toBe("");
  });

  it("permite número incompleto enquanto digita e apagar", () => {
    expect(formatPhoneBR("9")).toBe("(9");
    expect(formatPhoneBR("99")).toBe("(99");
    expect(formatPhoneBR("999")).toBe("(99) 9");
    expect(formatPhoneBR("99935")).toBe("(99) 935");
    expect(formatPhoneBR("9993541")).toBe("(99) 9354-1");
    expect(formatPhoneBR("(99) 9354-1")).toBe("(99) 9354-1");
    expect(formatPhoneBR("(99")).toBe("(99");
    expect(formatPhoneBR("")).toBe("");
  });
});

describe("preenchimento e preservação", () => {
  it("preenche o telefone ao selecionar prestador cadastrado", () => {
    const pessoa = { id: 7, nome: "Oficina Central", telefone: "99935413077", email: "oficina@ex.com" };
    expect(telefoneAoSelecionarPrestador(pessoa.telefone)).toBe("(99) 93541-3077");
    expect(telefoneDoCadastroPessoa(pessoa.telefone)).toBe("(99) 93541-3077");
  });

  it("não usa e-mail do cadastro no campo Telefone", () => {
    expect(telefoneAoSelecionarPrestador(null)).toBe("");
    expect(telefoneDoCadastroPessoa("")).toBe("");
  });

  it("edição manual vale só para a OS e não altera o cadastro", () => {
    const pessoa = { id: 7, nome: "Oficina Central", telefone: "99935413077" };
    const telefoneOriginal = pessoa.telefone;
    const telefoneOs = formatPhoneBR("11988887777");

    expect(telefoneOs).toBe("(11) 98888-7777");
    expect(telefonePrestadorParaOs(telefoneOs)).toBe("(11) 98888-7777");
    expect(pessoa.telefone).toBe(telefoneOriginal);
  });

  it("ao abrir OS existente, preserva o telefone gravado e não sobrescreve com o cadastro", () => {
    const sincronizado = telefoneAoSincronizarPrestador({
      telefoneOs: "11988887777",
      telefoneCadastro: "99935413077",
    });
    expect(sincronizado).toBe("(11) 98888-7777");
  });

  it("completa o telefone pelo cadastro só se a OS ainda não tiver", () => {
    expect(
      telefoneAoSincronizarPrestador({
        telefoneOs: "",
        telefoneCadastro: "(99) 93541-3077",
      }),
    ).toBe("(99) 93541-3077");
  });

  it("mantém compatibilidade com OS antiga sem máscara ou com texto histórico", () => {
    expect(telefonePrestadorParaExibicao("99935413077")).toBe("(99) 93541-3077");
    expect(telefonePrestadorParaExibicao("oficina@fazenda.com")).toBe("oficina@fazenda.com");
    expect(telefonePrestadorParaOs("oficina@fazenda.com")).toBe("oficina@fazenda.com");
    expect(telefonePrestadorParaOs("")).toBeUndefined();
  });
});
