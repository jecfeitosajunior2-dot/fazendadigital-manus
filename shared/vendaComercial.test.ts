import { describe, expect, it } from "vitest";
import {
  arredondarMoeda,
  avaliarInclusaoAnimalVenda,
  calcularPesoCarne,
  calcularValorItem,
  mensagemAnimaisIndisponiveis,
  MSG_VENDA_ANIMAL_DUPLICADO,
  MSG_VENDA_PESO_OBRIGATORIO,
  MSG_VENDA_RFID_NAO_ENCONTRADO,
  MSG_VENDA_RFID_SEM_FAZENDA,
  MSG_VENDA_RENDIMENTO_INVALIDO,
  parseRendimentoCarcaca,
  resumirItensVenda,
} from "./vendaComercial";

describe("vendaComercial", () => {
  it("calcula R$/kg com arredondamento monetário (teste E: 391 × 20,50 = 8.015,50)", () => {
    expect(calcularValorItem({ forma: "kg", pesoVenda: 391, precoUnitario: 20.5 })).toEqual({
      ok: true,
      valor: 8015.5,
      pesoCobrado: 391,
    });
  });

  it("calcula R$/cabeça ignorando peso (teste F)", () => {
    expect(calcularValorItem({ forma: "cabeca", pesoVenda: 400, precoUnitario: 3000 })).toEqual({
      ok: true,
      valor: 3000,
      pesoCobrado: 400,
    });
  });

  it("exige peso em R$/kg", () => {
    expect(calcularValorItem({ forma: "kg", pesoVenda: null, precoUnitario: 20 })).toEqual({
      ok: false,
      message: MSG_VENDA_PESO_OBRIGATORIO,
    });
  });

  it("soma quantidade, peso e valor dos itens (teste G)", () => {
    const resumo = resumirItensVenda([
      { pesoVenda: 391, valorItem: 8015.5 },
      { pesoVenda: 300, valorItem: 3000 },
    ]);
    expect(resumo.quantidade).toBe(2);
    expect(resumo.pesoTotal).toBe(691);
    expect(resumo.valorTotal).toBe(11015.5);
    expect(resumo.precoMedioKg).toBe(arredondarMoeda(11015.5 / 691));
  });

  it("não inventa peso quando nenhum item tem peso", () => {
    expect(resumirItensVenda([{ valorItem: 3000 }]).pesoTotal).toBeNull();
  });

  it("expõe mensagem de duplicidade para a UI", () => {
    expect(MSG_VENDA_ANIMAL_DUPLICADO).toBe("Este animal já está incluído nesta Venda.");
  });

  it("não aplica rendimento quando o campo está em branco", () => {
    expect(parseRendimentoCarcaca("")).toEqual({ ok: true, valor: null });
    expect(parseRendimentoCarcaca("52")).toEqual({ ok: true, valor: 52 });
    expect(parseRendimentoCarcaca("0")).toEqual({ ok: false, message: MSG_VENDA_RENDIMENTO_INVALIDO });
    expect(calcularPesoCarne(100, null)).toBe(100);
    expect(calcularPesoCarne(100, 52)).toBe(52);
    expect(calcularValorItem({
      forma: "kg",
      pesoVenda: 100,
      precoUnitario: 20.5,
      rendimentoCarcaca: 52,
    })).toEqual({ ok: true, valor: 1066, pesoCobrado: 52 });
  });

  it("lista brincos na concorrência", () => {
    expect(mensagemAnimaisIndisponiveis(["10", "28"])).toBe(
      "Os animais 10, 28 não estão mais disponíveis para Venda.",
    );
  });

  it("RFID exige Fazenda antes de localizar o animal", () => {
    expect(avaliarInclusaoAnimalVenda({ animal: null, fazendaId: 0, idsNaVenda: [] })).toEqual({
      ok: false,
      message: MSG_VENDA_RFID_SEM_FAZENDA,
    });
  });

  it("RFID desconhecido não entra na Venda", () => {
    expect(avaliarInclusaoAnimalVenda({ animal: null, fazendaId: 1, idsNaVenda: [] })).toEqual({
      ok: false,
      message: MSG_VENDA_RFID_NAO_ENCONTRADO,
    });
  });

  it("RFID de outra Fazenda é bloqueado", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 2, fazendaNome: "Fazenda B", status: "ativo" },
      fazendaId: 1,
      idsNaVenda: [],
    })).toEqual({
      ok: false,
      message: "O animal 255 pertence à Fazenda B.",
    });
  });

  it("RFID de animal inativo é bloqueado com o status", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 1, status: "vendido" },
      fazendaId: 1,
      idsNaVenda: [],
    })).toEqual({
      ok: false,
      message: "O animal 255 não está disponível para Venda.",
      detalhe: "Status atual: Vendido.",
    });
  });

  it("RFID duplicado na mesma Venda é bloqueado", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 1, status: "ativo" },
      fazendaId: 1,
      idsNaVenda: [9],
    })).toEqual({
      ok: false,
      message: "O animal 255 já está incluído nesta Venda.",
    });
  });

  it("RFID válido da mesma Fazenda é aceito", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 1, status: "ativo" },
      fazendaId: 1,
      idsNaVenda: [],
    })).toEqual({ ok: true, brinco: "255" });
  });
});
