import { describe, expect, it } from "vitest";
import {
  assertDataDesmamaNaoFutura,
  filtrarAnimaisElegiveisDesmama,
  isAnimalAtivoDesmama,
  isRegistroDesmama,
  jaPossuiDesmamaRegistrada,
  jaPossuiPesagemIgual,
  MSG_DESMAMA_DUPLICADA,
  MSG_DESMAMA_INATIVO,
  MSG_DESMAMA_PESO,
  observacaoPesagemDesmama,
  parsePesoKgDesmama,
  podeSalvarDesmama,
  pesosNumericamenteIguais,
  temDataDesmama,
  validarAnimalParaDesmama,
  validarDesmamaInput,
} from "../shared/desmamaManejo";

describe("desmamaManejo", () => {
  it("aceita macho e fêmea ativos ainda sem desmama", () => {
    const dataEvento = "2026-08-29";
    const out = filtrarAnimaisElegiveisDesmama(
      [
        { id: 1, sexo: "macho", status: "ativo", dataDesmama: null, dataNascimento: "2026-01-29" },
        { id: 2, sexo: "femea", status: "ativo", dataDesmama: null, dataNascimento: "2026-01-29" },
        { id: 3, sexo: "macho", status: "vendido", dataDesmama: null, dataNascimento: "2026-01-29" },
        { id: 4, sexo: "femea", status: "ativo", dataDesmama: "2026-01-10", dataNascimento: "2026-01-29" },
      ],
      dataEvento,
    );
    expect(out.map(a => a.id)).toEqual([1, 2]);
  });

  it("bloqueia inativo e desmama duplicada no animal", () => {
    const inativo = validarAnimalParaDesmama({ status: "morto" }, "2026-08-29");
    expect(inativo.ok).toBe(false);
    if (!inativo.ok) expect(inativo.message).toBe(MSG_DESMAMA_INATIVO);

    const duplicado = validarAnimalParaDesmama({
      status: "ativo",
      dataDesmama: "2026-08-29",
      dataNascimento: "2026-01-29",
    }, "2026-08-29");
    expect(duplicado.ok).toBe(false);
    if (!duplicado.ok) expect(duplicado.message).toBe(MSG_DESMAMA_DUPLICADA);

    expect(
      validarAnimalParaDesmama(
        { status: "ativo", dataNascimento: "2026-01-29" },
        "2026-08-29",
      ).ok,
    ).toBe(true);
    expect(isAnimalAtivoDesmama("Ativo")).toBe(true);
  });

  it("reconhece evento legado de Desmama e dataDesmama", () => {
    expect(isRegistroDesmama("Desmama")).toBe(true);
    expect(isRegistroDesmama("desmama")).toBe(true);
    expect(isRegistroDesmama("Castração")).toBe(false);
    expect(temDataDesmama("2026-08-29")).toBe(true);
    expect(temDataDesmama("")).toBe(false);
    expect(temDataDesmama(null)).toBe(false);
    expect(
      jaPossuiDesmamaRegistrada({
        dataDesmama: null,
        registrosEvento: [{ tipo: "Inseminação" }, { tipo: "Desmama" }],
      }),
    ).toBe(true);
    expect(jaPossuiDesmamaRegistrada({ dataDesmama: "2025-12-01", registrosEvento: [] })).toBe(
      true,
    );
    expect(jaPossuiDesmamaRegistrada({ dataDesmama: null, registrosEvento: [] })).toBe(false);
  });

  it("exige fazenda, animal e data válida; peso é opcional", () => {
    expect(
      validarDesmamaInput({
        fazendaId: 1,
        animalId: 2,
        dataDesmama: "2026-08-29",
      }).ok,
    ).toBe(true);
    expect(
      podeSalvarDesmama({
        fazendaId: 1,
        animalId: 2,
        dataDesmama: "2026-08-29",
        pesoKg: "",
      }),
    ).toBe(true);
    expect(assertDataDesmamaNaoFutura("2099-01-01", "2026-08-29").ok).toBe(false);
  });

  it("rejeita peso inválido e aceita decimal pt-BR", () => {
    expect(parsePesoKgDesmama("").ok).toBe(true);
    expect(parsePesoKgDesmama("   ").ok).toBe(true);
    expect(parsePesoKgDesmama("-10").ok).toBe(false);
    expect(parsePesoKgDesmama("0").ok).toBe(false);
    expect(parsePesoKgDesmama("abc").ok).toBe(false);
    const ok = parsePesoKgDesmama("210");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.peso).toBe("210.00");
    const br = parsePesoKgDesmama("210,5");
    expect(br.ok).toBe(true);
    if (br.ok) expect(br.peso).toBe("210.50");
    const invalid = validarDesmamaInput({
      fazendaId: 1,
      animalId: 2,
      dataDesmama: "2026-08-29",
      pesoKg: "0",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.message).toBe(MSG_DESMAMA_PESO);
  });

  it("detecta pesagem duplicada na mesma data com o mesmo peso", () => {
    expect(pesosNumericamenteIguais("210.00", "210")).toBe(true);
    expect(pesosNumericamenteIguais("210", "211")).toBe(false);
    expect(
      jaPossuiPesagemIgual(
        [{ data: "2026-08-29", peso: "210.00" }],
        "2026-08-29",
        "210.00",
      ),
    ).toBe(true);
    expect(
      jaPossuiPesagemIgual([{ data: "2026-08-29", peso: "180" }], "2026-08-29", "210.00"),
    ).toBe(false);
    expect(
      jaPossuiPesagemIgual([{ data: "2026-08-28", peso: "210.00" }], "2026-08-29", "210.00"),
    ).toBe(false);
  });

  it("marca origem Desmama na pesagem quando não há observação", () => {
    expect(observacaoPesagemDesmama("")).toBe("Desmama");
    expect(observacaoPesagemDesmama("Desmama convencional.")).toBe("Desmama convencional.");
  });
});
