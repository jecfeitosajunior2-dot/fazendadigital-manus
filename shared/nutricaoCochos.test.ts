import { describe, expect, it } from "vitest";
import {
  formatarIdentificacaoCocho,
  formatarLocalizacaoCocho,
  textoSecundarioPastoCochoDetalhe,
  MSG_COCHO_CAPACIDADE,
  MSG_COCHO_COMPRIMENTO,
  MSG_COCHO_FAZENDA,
  MSG_COCHO_LADOS,
  MSG_COCHO_LARGURA,
  MSG_COCHO_NOME,
  MSG_COCHO_PASTO,
  MSG_COCHO_TIPO,
  MSG_FORN_COCHO_FAZENDA,
  MSG_FORN_COCHO_INATIVO,
  validarCochoInput,
  validarCochoNoFornecimento,
} from "./nutricaoCochos";

const base = {
  fazendaId: 1,
  nome: "Cocho Pasto 444",
  tipo: "mineral",
};

describe("nutricaoCochos — validação", () => {
  it("1: cria cocho válido", () => {
    expect(validarCochoInput(base)).toEqual({ ok: true });
  });

  it("2: fazenda obrigatória", () => {
    expect(validarCochoInput({ ...base, fazendaId: 0 })).toMatchObject({ message: MSG_COCHO_FAZENDA });
  });

  it("3: nome obrigatório", () => {
    expect(validarCochoInput({ ...base, nome: "  " })).toMatchObject({ message: MSG_COCHO_NOME });
  });

  it("4: tipo obrigatório", () => {
    expect(validarCochoInput({ ...base, tipo: "" })).toMatchObject({ message: MSG_COCHO_TIPO });
  });

  it("7: pasto de outra fazenda é bloqueado", () => {
    expect(validarCochoInput(
      { ...base, pastoId: 9 },
      { pasto: { id: 9, userId: 10, fazendaId: 2, nome: "444" } },
    )).toMatchObject({ message: MSG_COCHO_PASTO });
  });

  it("8/9: sem pasto e só com descrição é permitido", () => {
    expect(validarCochoInput({ ...base, pastoId: null, localizacaoDescricao: "Praça de alimentação" }))
      .toEqual({ ok: true });
  });

  it("10/11/12: medidas zero/negativas bloqueiam", () => {
    expect(validarCochoInput({ ...base, comprimentoMetros: 0 })).toMatchObject({ message: MSG_COCHO_COMPRIMENTO });
    expect(validarCochoInput({ ...base, larguraMetros: -1 })).toMatchObject({ message: MSG_COCHO_LARGURA });
    expect(validarCochoInput({ ...base, capacidadeKg: 0 })).toMatchObject({ message: MSG_COCHO_CAPACIDADE });
  });

  it("13: lados inválidos bloqueiam", () => {
    expect(validarCochoInput({ ...base, ladosAcesso: 3 })).toMatchObject({ message: MSG_COCHO_LADOS });
    expect(validarCochoInput({ ...base, ladosAcesso: 2 })).toEqual({ ok: true });
  });
});

describe("nutricaoCochos — fornecimento", () => {
  it("22: cocho de outra fazenda é bloqueado", () => {
    expect(validarCochoNoFornecimento(
      { fazendaId: 1, cochoId: 5 },
      { id: 5, userId: 10, fazendaId: 2, nome: "C01", status: "ativo" },
    )).toMatchObject({ message: MSG_FORN_COCHO_FAZENDA });
  });

  it("23: cocho inativo é bloqueado em novo fornecimento", () => {
    expect(validarCochoNoFornecimento(
      { fazendaId: 1, cochoId: 5 },
      { id: 5, userId: 10, fazendaId: 1, nome: "C01", status: "inativo" },
    )).toMatchObject({ message: MSG_FORN_COCHO_INATIVO });
  });

  it("20: fornecimento sem cocho continua válido", () => {
    expect(validarCochoNoFornecimento({ fazendaId: 1, cochoId: null })).toEqual({ ok: true });
  });

  it("snapshot mínimo identifica o cocho", () => {
    expect(formatarIdentificacaoCocho("Cocho Pasto 444", "C01")).toBe("Cocho Pasto 444 (C01)");
    expect(formatarLocalizacaoCocho("Pasto 444", "bebedouro norte")).toBe("Pasto 444 — bebedouro norte");
  });
});

describe("detalhe do Cocho — Pasto sem duplicidade visual", () => {
  it("1: nome e secundário iguais renderizam uma única vez", () => {
    expect(textoSecundarioPastoCochoDetalhe("444", "444")).toBeNull();
    expect(textoSecundarioPastoCochoDetalhe(" 444 ", "444")).toBeNull();
  });

  it("2: nome e secundário diferentes renderizam os dois", () => {
    expect(textoSecundarioPastoCochoDetalhe("Pasto Sede", "444")).toBe("444");
  });

  it("3: secundário vazio/null renderiza somente o nome", () => {
    expect(textoSecundarioPastoCochoDetalhe("Pasto Sede", null)).toBeNull();
    expect(textoSecundarioPastoCochoDetalhe("Pasto Sede", "")).toBeNull();
    expect(textoSecundarioPastoCochoDetalhe("Pasto Sede", "   ")).toBeNull();
  });
});
