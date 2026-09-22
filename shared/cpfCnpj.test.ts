import { describe, expect, it } from "vitest";
import {
  documentosCpfCnpjIguais,
  isCnpjValido,
  isCpfCnpjValido,
  isCpfValido,
  mesmoDocumentoDigitado,
  normalizeCpfCnpj,
} from "./cpfCnpj";

const CPF_VALIDO = "529.982.247-25";
const CNPJ_VALIDO = "11.444.777/0001-61";

describe("cpfCnpj", () => {
  it("normaliza removendo máscara e espaços", () => {
    expect(normalizeCpfCnpj(" 529.982.247-25 ")).toBe("52998224725");
    expect(normalizeCpfCnpj("11.444.777/0001-61")).toBe("11444777000161");
    expect(normalizeCpfCnpj(null)).toBe("");
  });

  it("aceita CPF e CNPJ válidos, com ou sem máscara", () => {
    expect(isCpfValido(CPF_VALIDO)).toBe(true);
    expect(isCpfValido("52998224725")).toBe(true);
    expect(isCnpjValido(CNPJ_VALIDO)).toBe(true);
    expect(isCnpjValido("11444777000161")).toBe(true);
    expect(isCpfCnpjValido(CPF_VALIDO)).toBe(true);
    expect(isCpfCnpjValido(CNPJ_VALIDO)).toBe(true);
  });

  it("rejeita inválido, tamanho errado e dígitos iguais", () => {
    expect(isCpfValido("123.456.789-00")).toBe(false);
    expect(isCnpjValido("12.345.678/0001-90")).toBe(false);
    expect(isCpfValido("111.111.111-11")).toBe(false);
    expect(isCnpjValido("11.111.111/1111-11")).toBe(false);
    expect(isCpfCnpjValido("123")).toBe(false);
    expect(isCpfCnpjValido("")).toBe(false);
  });

  it("máscara não muda a comparação", () => {
    expect(documentosCpfCnpjIguais(CPF_VALIDO, "52998224725")).toBe(true);
    expect(documentosCpfCnpjIguais(CNPJ_VALIDO, "11444777000161")).toBe(true);
    expect(documentosCpfCnpjIguais(CPF_VALIDO, CNPJ_VALIDO)).toBe(false);
    expect(documentosCpfCnpjIguais("", "")).toBe(false);
    expect(mesmoDocumentoDigitado("", null)).toBe(true);
    expect(mesmoDocumentoDigitado(CPF_VALIDO, "52998224725")).toBe(true);
  });
});
