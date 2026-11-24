import { describe, expect, it } from "vitest";
import {
  conferirAreas,
  documentoBrConsistente,
  exibirAreaSalva,
  interpretarArea,
  paisInicial,
  prepararCamposFazenda,
} from "./fazendaCadastro";

describe("cadastro de fazenda", () => {
  it("usa Brasil quando a conta não tem país", () => {
    expect(paisInicial(null)).toBe("Brasil");
    expect(paisInicial("")).toBe("Brasil");
    expect(paisInicial("Uruguai")).toBe("Uruguai");
    expect(paisInicial("Chile")).toBe("Brasil");
  });

  it("entende 1.500,50 sem perder as casas", () => {
    expect(interpretarArea("1.500,50")).toMatchObject({ ok: true, valor: "1500.50", centavos: 150050 });
    expect(interpretarArea("1500.50")).toMatchObject({ valor: "1500.50" });
    expect(interpretarArea("1.500")).toMatchObject({ valor: "1500.00" });
    expect(exibirAreaSalva("1500.50")).toBe("1.500,50");
  });

  it("recusa área inválida e reserva maior que o total", () => {
    expect(interpretarArea("-1").ok).toBe(false);
    expect(interpretarArea("abc").ok).toBe(false);
    expect(interpretarArea("1,505").ok).toBe(false);
    const maior = conferirAreas("10,00", "10,01");
    expect(maior.erros.areaReserva).toMatch(/maior/);
    expect(maior.liquida).toBeNull();
    const certa = conferirAreas("1.500,50", "0,50");
    expect(certa.liquida).toBe(150000);
    expect(certa.total).toBe("1500.50");
  });

  it("não troca a unidade e não aceita estado incompatível", () => {
    const pronto = prepararCamposFazenda({
      nome: "Sítio",
      userId: 99,
      pais: "Brasil",
      estado: "ma",
      unidadeArea: "Alqueire",
      area: "1.500,50",
      areaReserva: "0,50",
      areaLiquida: "1",
    });
    expect(pronto.ok).toBe(true);
    if (!pronto.ok) return;
    expect(pronto.dados.userId).toBeUndefined();
    expect(pronto.dados.unidadeArea).toBe("Alqueire");
    expect(pronto.dados.area).toBe("1500.50");
    expect(pronto.dados.areaLiquida).toBe("1500.00");
    expect(prepararCamposFazenda({ pais: "Brasil", estado: "Montevideo" }).ok).toBe(false);
    expect(prepararCamposFazenda({ pais: "Uruguai", estado: "CA", cidade: "Canelones" }).ok).toBe(true);
  });

  it("só confere CPF e CNPJ quando há dígitos", () => {
    expect(documentoBrConsistente("")).toBe(true);
    expect(documentoBrConsistente("123")).toMatch(/incompleto/);
    expect(documentoBrConsistente("111.111.111-11")).toMatch(/não confere/);
    expect(documentoBrConsistente("529.982.247-25")).toBe(true);
    expect(prepararCamposFazenda({ pais: "Uruguai", cpfCnpj: "123" }).ok).toBe(true);
    expect(prepararCamposFazenda({ pais: "Brasil", cpfCnpj: "123" }).ok).toBe(false);
  });
});
