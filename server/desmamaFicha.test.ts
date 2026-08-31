import { describe, expect, it } from "vitest";
import { FICHA_ANIMAL_TABS } from "../client/src/lib/fichaAnimalRoute";
import {
  formatPesoKgDesmamaFicha,
  isObservacaoPesagemOrigemDesmama,
  montarBlocoDesmamaFicha,
  observacaoDesmamaParaBloco,
} from "../shared/desmamaManejo";

describe("bloco Desmama na ficha (aba Pesagens)", () => {
  it("A) desmama com peso associado na mesma data", () => {
    const bloco = montarBlocoDesmamaFicha({
      dataDesmama: "2026-08-29",
      pesagens: [
        { id: 10, data: "2026-08-29", peso: "180.00", observacoes: "Desmama" },
      ],
    });
    expect(bloco).toMatchObject({
      dataISO: "2026-08-29",
      pesoKg: 180,
      pesoFormatado: "180,0 kg",
      observacoes: null,
    });
  });

  it("B) pesagem posterior não altera Peso à desmama", () => {
    const bloco = montarBlocoDesmamaFicha({
      dataDesmama: "2026-08-29",
      pesagens: [
        { id: 20, data: "2026-09-15", peso: "195.00", observacoes: null },
        { id: 10, data: "2026-08-29", peso: "180.00", observacoes: "Desmama" },
      ],
    });
    expect(bloco?.pesoKg).toBe(180);
    expect(bloco?.pesoFormatado).toBe("180,0 kg");
  });

  it("C) desmama sem peso → bloco existe com —", () => {
    const bloco = montarBlocoDesmamaFicha({
      dataDesmama: "2026-08-29",
      pesagens: [],
    });
    expect(bloco).toMatchObject({
      dataISO: "2026-08-29",
      pesoKg: null,
      pesoFormatado: "—",
      observacoes: null,
    });
  });

  it("D) sem dataDesmama → não monta bloco", () => {
    expect(
      montarBlocoDesmamaFicha({
        dataDesmama: null,
        pesagens: [{ id: 1, data: "2026-08-29", peso: "180", observacoes: "Desmama" }],
      }),
    ).toBeNull();
  });

  it("E) observação do usuário aparece; marcador técnico some", () => {
    expect(observacaoDesmamaParaBloco("Desmama")).toBeNull();
    expect(observacaoDesmamaParaBloco("Desmama convencional.")).toBe("Desmama convencional.");
    const bloco = montarBlocoDesmamaFicha({
      dataDesmama: "2026-08-29",
      pesagens: [
        {
          id: 3,
          data: "2026-08-29",
          peso: "180",
          observacoes: "Desmama convencional.",
        },
      ],
    });
    expect(bloco?.observacoes).toBe("Desmama convencional.");
  });

  it("F) legado: data sem pesagem de origem → peso — e não inventa", () => {
    const bloco = montarBlocoDesmamaFicha({
      dataDesmama: "2024-03-10",
      pesagens: [
        { id: 8, data: "2024-03-10", peso: "210", observacoes: "Curral" },
        { id: 9, data: "2024-03-12", peso: "215", observacoes: null },
      ],
    });
    expect(bloco).toMatchObject({
      dataISO: "2024-03-10",
      pesoKg: null,
      pesoFormatado: "—",
    });
  });

  it("não usa pesoAtual nem a última pesagem do animal", () => {
    const bloco = montarBlocoDesmamaFicha({
      dataDesmama: "2026-08-29",
      pesagens: [{ id: 99, data: "2026-09-20", peso: "240", observacoes: "Rotina" }],
    });
    expect(bloco?.pesoKg).toBeNull();
    expect(bloco?.pesoFormatado).toBe("—");
  });

  it("reconhece origem Desmama na observação da pesagem", () => {
    expect(isObservacaoPesagemOrigemDesmama("Desmama")).toBe(true);
    expect(isObservacaoPesagemOrigemDesmama("desmama convencional.")).toBe(true);
    expect(isObservacaoPesagemOrigemDesmama("Curral")).toBe(false);
    expect(isObservacaoPesagemOrigemDesmama("")).toBe(false);
  });

  it("formata peso ou traço", () => {
    expect(formatPesoKgDesmamaFicha(180)).toBe("180,0 kg");
    expect(formatPesoKgDesmamaFicha(null)).toBe("—");
    expect(formatPesoKgDesmamaFicha(0)).toBe("—");
  });

  it("G) abas da ficha permanecem sem aba Desmama", () => {
    expect(FICHA_ANIMAL_TABS).toEqual([
      "identificacao",
      "pesagens",
      "saude",
      "reproducao",
      "pastos",
      "observacoes",
    ]);
    expect(FICHA_ANIMAL_TABS.includes("desmama" as (typeof FICHA_ANIMAL_TABS)[number])).toBe(
      false,
    );
  });
});
