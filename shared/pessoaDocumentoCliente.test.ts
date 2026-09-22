import { describe, expect, it } from "vitest";
import {
  MSG_COMPRADOR_DOC_DUPLICADO,
  MSG_COMPRADOR_DOC_INATIVO,
  MSG_COMPRADOR_DOC_INVALIDO,
  avaliarDocumentoClienteCreate,
  avaliarDocumentoClienteUpdate,
  documentoPodeSalvarComprador,
  encontrarCompradorMesmoDocumento,
} from "./pessoaDocumentoCliente";

const CPF_VALIDO = "529.982.247-25";
const CPF_VALIDO_DIGITS = "52998224725";
const CNPJ_VALIDO = "11.444.777/0001-61";
const CPF_OUTRO = "390.533.447-05";

function row(partial: Partial<{ id: number; userId: number; tipo: string; documento: string | null; ativo: boolean }>) {
  return {
    id: partial.id ?? 1,
    userId: partial.userId ?? 1,
    tipo: partial.tipo ?? "cliente",
    documento: partial.documento ?? null,
    ativo: partial.ativo ?? true,
  };
}

describe("documento de comprador", () => {
  it("1. CPF válido → aceita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: CPF_VALIDO, existentes: [],
    })).toEqual({ ok: true });
  });

  it("2. CPF inválido → rejeita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: "123.456.789-00", existentes: [],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_INVALIDO });
  });

  it("3. CNPJ válido → aceita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: CNPJ_VALIDO, existentes: [],
    })).toEqual({ ok: true });
  });

  it("4. CNPJ inválido → rejeita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: "12.345.678/0001-90", existentes: [],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_INVALIDO });
  });

  it("5. todos os dígitos iguais → rejeita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: "111.111.111-11", existentes: [],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_INVALIDO });
  });

  it("6. documento vazio em comprador → rejeita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: "", existentes: [],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_INVALIDO });
    expect(documentoPodeSalvarComprador({ documento: "", editando: false })).toBe(false);
  });

  it("7 e 8. máscara não interfere; com e sem pontuação são o mesmo", () => {
    const existentes = [row({ id: 10, documento: CPF_VALIDO })];
    expect(encontrarCompradorMesmoDocumento(existentes, 1, CPF_VALIDO_DIGITS)?.id).toBe(10);
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "cliente", documento: CPF_VALIDO_DIGITS, existentes,
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_DUPLICADO });
  });

  it("9. duplicado no mesmo usuário → rejeita", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1,
      tipo: "cliente",
      documento: CPF_VALIDO,
      existentes: [row({ id: 2, documento: CPF_VALIDO })],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_DUPLICADO });
  });

  it("10. mesmo documento em usuários diferentes → permitido", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 2,
      tipo: "cliente",
      documento: CPF_VALIDO,
      existentes: [row({ id: 2, userId: 1, documento: CPF_VALIDO })],
    })).toEqual({ ok: true });
  });

  it("11. editar mantendo o próprio documento → permitido", () => {
    expect(avaliarDocumentoClienteUpdate({
      userId: 1,
      id: 7,
      tipoAtual: "cliente",
      documentoAtual: CPF_VALIDO,
      documentoNovo: CPF_VALIDO_DIGITS,
      documentoInformado: true,
      existentes: [row({ id: 7, documento: CPF_VALIDO })],
    })).toEqual({ ok: true });
  });

  it("12. editar para documento de outro comprador → rejeita", () => {
    expect(avaliarDocumentoClienteUpdate({
      userId: 1,
      id: 7,
      tipoAtual: "cliente",
      documentoAtual: CPF_VALIDO,
      documentoNovo: CNPJ_VALIDO,
      documentoInformado: true,
      existentes: [
        row({ id: 7, documento: CPF_VALIDO }),
        row({ id: 8, documento: CNPJ_VALIDO }),
      ],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_DUPLICADO });
  });

  it("13. duplicado inativo → rejeita e orienta reativação", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1,
      tipo: "cliente",
      documento: CPF_VALIDO,
      existentes: [row({ id: 9, documento: CPF_VALIDO, ativo: false })],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_INATIVO });
  });

  it("14. fornecedor/funcionário → comportamento antigo preservado", () => {
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "fornecedor", documento: "", existentes: [],
    })).toEqual({ ok: true });
    expect(avaliarDocumentoClienteCreate({
      userId: 1, tipo: "funcionario", documento: "111.111.111-11", existentes: [],
    })).toEqual({ ok: true });
  });

  it("15. legado inválido + edição de outro campo → permitido", () => {
    expect(avaliarDocumentoClienteUpdate({
      userId: 1,
      id: 17,
      tipoAtual: "cliente",
      documentoAtual: "11.111.111/1111-11",
      documentoNovo: "11.111.111/1111-11",
      documentoInformado: true,
      existentes: [row({ id: 17, documento: "11.111.111/1111-11" })],
    })).toEqual({ ok: true });
    expect(documentoPodeSalvarComprador({
      documento: "11.111.111/1111-11",
      documentoOriginal: "11.111.111/1111-11",
      editando: true,
    })).toBe(true);
    expect(avaliarDocumentoClienteUpdate({
      userId: 1,
      id: 18,
      tipoAtual: "cliente",
      documentoAtual: null,
      documentoNovo: "",
      documentoInformado: true,
      existentes: [row({ id: 18, documento: null })],
    })).toEqual({ ok: true });
    expect(documentoPodeSalvarComprador({
      documento: "",
      documentoOriginal: "",
      editando: true,
    })).toBe(true);
  });

  it("16. legado inválido + alteração do documento → novo precisa ser válido", () => {
    expect(avaliarDocumentoClienteUpdate({
      userId: 1,
      id: 17,
      tipoAtual: "cliente",
      documentoAtual: "11.111.111/1111-11",
      documentoNovo: "123.456.789-00",
      documentoInformado: true,
      existentes: [row({ id: 17, documento: "11.111.111/1111-11" })],
    })).toEqual({ ok: false, message: MSG_COMPRADOR_DOC_INVALIDO });
    expect(avaliarDocumentoClienteUpdate({
      userId: 1,
      id: 17,
      tipoAtual: "cliente",
      documentoAtual: "11.111.111/1111-11",
      documentoNovo: CPF_OUTRO,
      documentoInformado: true,
      existentes: [row({ id: 17, documento: "11.111.111/1111-11" })],
    })).toEqual({ ok: true });
  });
});
