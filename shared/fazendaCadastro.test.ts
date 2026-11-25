import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  conferirAreas,
  conferirPastagem,
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

  it("guarda a pastagem sem descontar da área total nem mexer na reserva", () => {
    const pronto = prepararCamposFazenda({
      area: "1.500,50",
      areaPastagem: "800,00",
      areaLiquida: "1",
    });
    expect(pronto.ok).toBe(true);
    if (!pronto.ok) return;
    expect(pronto.dados.area).toBe("1500.50");
    expect(pronto.dados.areaPastagem).toBe("800.00");
    expect(pronto.dados.areaReserva).toBeUndefined();
    expect(pronto.dados.areaLiquida).toBeUndefined();
    expect(conferirPastagem("10,00", "10,01").erros.areaPastagem).toMatch(/pastagem/);
    expect(prepararCamposFazenda({ area: "10,00", areaPastagem: "10,01" }).ok).toBe(false);
    expect(prepararCamposFazenda({ areaPastagem: "" }).ok).toBe(true);
  });

  it("só confere CPF e CNPJ quando há dígitos", () => {
    expect(documentoBrConsistente("")).toBe(true);
    expect(documentoBrConsistente("123")).toMatch(/incompleto/);
    expect(documentoBrConsistente("111.111.111-11")).toMatch(/não confere/);
    expect(documentoBrConsistente("529.982.247-25")).toBe(true);
    expect(prepararCamposFazenda({ pais: "Uruguai", cpfCnpj: "123" }).ok).toBe(true);
    expect(prepararCamposFazenda({ pais: "Brasil", cpfCnpj: "123" }).ok).toBe(false);
  });

  it("o cadastro simples pede pastagem e esconde sigla, reserva e área líquida", () => {
    const pagina = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../client/src/pages/FarmRegistrationPage.tsx"),
      "utf8",
    );
    expect(pagina).toContain("Área de Pastagem (ha)");
    expect(pagina).toContain('unidadeArea: form.unidadeArea || "Hectare"');
    expect(pagina).not.toContain("Unidade de Medida da Área");
    expect(pagina).not.toContain(">País<");
    expect(pagina).not.toContain("Argentina");
    expect(pagina).not.toContain("Fora do Brasil");
    expect(pagina).toContain('pais: "Brasil"');
    expect(pagina).toContain("Nome do Proprietário");
    expect(pagina).toContain("areaPastagem: form.areaPastagem");
    expect(pagina).not.toContain("Sigla da Fazenda");
    expect(pagina).not.toContain("Área de Reserva");
    expect(pagina).not.toContain("Área Líquida da Fazenda");
    expect(pagina).not.toContain("sigla: form.sigla");
    expect(pagina).not.toContain("areaReserva: form.areaReserva");
    expect(pagina).not.toContain(">Observação<");
    expect(pagina).not.toContain("observacoes: form.observacoes");
    expect(pagina).not.toContain("Ex. Fazenda Santa Maria");
    expect(pagina).not.toContain("Dono do imóvel");
    expect(pagina).not.toContain("Ex. 1.500,50");
    expect(pagina).not.toContain("-16.6869");
    expect(pagina).toContain('placeholder="Selecione"');
    expect(pagina).not.toContain("Avaliação Patrimonial");
    expect(pagina).not.toContain("Valor estimado do hectare");
    expect(pagina).not.toContain("Responsável Operacional");
    expect(pagina).not.toContain("valorHectare: parseCurrencyBrl");
    expect(pagina).not.toContain("responsavelOperacionalNome: form.responsavelOperacionalNome");
    expect(pagina).not.toContain(">Latitude<");
    expect(pagina).not.toContain(">Longitude<");
    expect(pagina).not.toContain("latitude: form.latitude");
    expect(pagina).not.toContain("longitude: form.longitude");
    expect(pagina).not.toContain("Distância da sede do município");
    expect(pagina).not.toContain('title="Localização"');
    expect(pagina).not.toContain("distanciaMunicipio: form.distanciaMunicipio");
    expect(pagina).toContain("Código da fazenda");
    expect(pagina).toContain("codigoSisbov: form.codigoSisbov");
    expect(pagina).not.toContain("possuiSisbov: form.possuiSisbov");
    expect(pagina).not.toContain("RadioGroup");
  });
});
