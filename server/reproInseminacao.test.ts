import { describe, expect, it } from "vitest";
import {
  assertCustoDoseInseminacaoCreate,
  custoDoseInseminacaoExternaInformado,
  formatReproEccDisplay,
  MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO,
  parseReproEccInput,
  resolveOrigemSemenInseminacao,
  sanitizeReproEccInputString,
  validateReproCustoDoseInseminacaoExterna,
  validateReproEcc,
} from "../shared/reproInseminacao";
import { parseSemenCustoTotal, SEMEN_ORIGEM_EXTERNO, SEMEN_ORIGEM_INTERNO } from "../shared/semenEstoque";
import { buildReproReprodutorPayload } from "../shared/reproReprodutorPersist";
import {
  formatInseminacaoDetalhesParts,
  formatReproDetalhesTabela,
  packReproObservacoes,
  unpackReproObservacoes,
} from "../shared/reproRegistroMeta";

describe("validateReproEcc", () => {
  it("aceita 1, 3.5 e 5", () => {
    expect(validateReproEcc(1)).toEqual({ ok: true, value: 1 });
    expect(validateReproEcc("3,5")).toEqual({ ok: true, value: 3.5 });
    expect(validateReproEcc(5)).toEqual({ ok: true, value: 5 });
  });

  it("rejeita 0.9, 5.1 e texto", () => {
    expect(validateReproEcc(0.9).ok).toBe(false);
    expect(validateReproEcc(5.1).ok).toBe(false);
    expect(validateReproEcc("abc").ok).toBe(false);
  });

  it("ausência é válida", () => {
    expect(validateReproEcc("")).toEqual({ ok: true });
    expect(validateReproEcc(null)).toEqual({ ok: true });
  });
});

describe("validateReproCustoDoseInseminacaoExterna", () => {
  it("teste A/I — vazio, zero, negativo e inválido bloqueiam", () => {
    expect(validateReproCustoDoseInseminacaoExterna(undefined).ok).toBe(false);
    expect(validateReproCustoDoseInseminacaoExterna(null).ok).toBe(false);
    expect(validateReproCustoDoseInseminacaoExterna(0).ok).toBe(false);
    expect(validateReproCustoDoseInseminacaoExterna(-10).ok).toBe(false);
    expect(validateReproCustoDoseInseminacaoExterna(Number.NaN).ok).toBe(false);
    expect(validateReproCustoDoseInseminacaoExterna(undefined)).toEqual({
      ok: false,
      message: MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO,
    });
  });

  it("teste B/J — custo positivo é aceito, inclusive centavos", () => {
    expect(validateReproCustoDoseInseminacaoExterna(90)).toEqual({ ok: true, value: 90 });
    expect(validateReproCustoDoseInseminacaoExterna(90.5)).toEqual({ ok: true, value: 90.5 });
    expect(validateReproCustoDoseInseminacaoExterna(138.89)).toEqual({ ok: true, value: 138.89 });
  });

  it("normaliza 90,50 / 90.50 e rejeita texto", () => {
    expect(parseSemenCustoTotal("90,50")).toBe(90.5);
    expect(parseSemenCustoTotal("90.50")).toBe(90.5);
    expect(validateReproCustoDoseInseminacaoExterna(parseSemenCustoTotal("90,50")).ok).toBe(true);
    expect(validateReproCustoDoseInseminacaoExterna(parseSemenCustoTotal("abc")).ok).toBe(false);
    expect(validateReproCustoDoseInseminacaoExterna(parseSemenCustoTotal("")).ok).toBe(false);
  });
});

describe("origem + custo no create (backend)", () => {
  it("detecta externo por reprodutorSemen sem machoId", () => {
    expect(
      resolveOrigemSemenInseminacao({
        tipo: "Inseminação",
        sexoAnimal: "femea",
        reprodutorSemen: "GSI-2222",
      }),
    ).toBe(SEMEN_ORIGEM_EXTERNO);
  });

  it("detecta interno por machoId", () => {
    expect(
      resolveOrigemSemenInseminacao({
        tipo: "Inseminação",
        sexoAnimal: "femea",
        machoId: 7,
        reprodutorSemen: "16",
      }),
    ).toBe(SEMEN_ORIGEM_INTERNO);
  });

  it("teste H — mutation externa sem custo é rejeitada", () => {
    const origem = resolveOrigemSemenInseminacao({
      tipo: "Inseminação",
      sexoAnimal: "femea",
      reprodutorSemen: "GSI-2222",
    });
    expect(assertCustoDoseInseminacaoCreate(origem, undefined)).toEqual({
      ok: false,
      message: MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO,
    });
    expect(assertCustoDoseInseminacaoCreate(origem, 0).ok).toBe(false);
  });

  it("teste D — interna sem custo não é bloqueada", () => {
    const origem = resolveOrigemSemenInseminacao({
      tipo: "Inseminação",
      sexoAnimal: "femea",
      machoId: 7,
    });
    expect(assertCustoDoseInseminacaoCreate(origem, undefined)).toEqual({ ok: true });
  });

  it("Cio/Diagnóstico/Parto não exigem custo", () => {
    for (const tipo of ["Cio", "Diagnóstico de prenhez", "Parto", "Aborto", "Outro"]) {
      const origem = resolveOrigemSemenInseminacao({
        tipo,
        sexoAnimal: "femea",
        reprodutorSemen: "GSI-2222",
      });
      expect(origem).toBeNull();
      expect(assertCustoDoseInseminacaoCreate(origem, undefined).ok).toBe(true);
    }
  });
});

describe("custoDoseInseminacaoExternaInformado (frontend Salvar)", () => {
  it("teste A — externo vazio desabilita", () => {
    expect(custoDoseInseminacaoExternaInformado(true, "")).toBe(false);
    expect(custoDoseInseminacaoExternaInformado(true, "   ")).toBe(false);
    expect(custoDoseInseminacaoExternaInformado(true, "abc")).toBe(false);
    expect(custoDoseInseminacaoExternaInformado(true, "-10")).toBe(false);
    expect(custoDoseInseminacaoExternaInformado(true, "0")).toBe(false);
  });

  it("teste B/J — 90,00 e 90,50 habilitam", () => {
    expect(custoDoseInseminacaoExternaInformado(true, "90,00")).toBe(true);
    expect(custoDoseInseminacaoExternaInformado(true, "90,50")).toBe(true);
    expect(custoDoseInseminacaoExternaInformado(true, "R$ 90,00")).toBe(true);
  });

  it("teste D — interno sem custo permanece livre", () => {
    expect(custoDoseInseminacaoExternaInformado(false, "")).toBe(true);
  });
});

describe("formatReproEccDisplay", () => {
  it("formata decimal pt-BR", () => {
    expect(formatReproEccDisplay(3.5)).toBe("3,5");
  });
});

describe("Inseminação — payload interno", () => {
  it("matriz 15 / touro 7 — machoId estruturado, nunca brinco como PK", () => {
    const repro = buildReproReprodutorPayload({
      tipo: "Inseminação",
      animalSexo: "femea",
      machoId: 7,
      machoLabel: "16",
      origem: "interno",
    });
    expect(repro).toEqual({ machoId: 7, reprodutorSemen: "16" });
    expect(repro.machoId).not.toBe(16);

    const packed = packReproObservacoes(
      "obs livre",
      repro.reprodutorSemen,
      undefined,
      undefined,
      null,
      {
        partidaSemen: "L23081",
        inseminador: "João Silva",
        ecc: 3.5,
      },
    );
    const meta = unpackReproObservacoes(packed);
    expect(meta.reprodutorSemen).toBe("16");
    expect(meta.partidaSemen).toBe("L23081");
    expect(meta.inseminador).toBe("João Silva");
    expect(meta.ecc).toBe(3.5);
    expect(meta.observacoes).toBe("obs livre");
  });
});

describe("Inseminação — payload externo", () => {
  it("sem machoId, demais campos preservados", () => {
    const repro = buildReproReprodutorPayload({
      tipo: "Inseminação",
      animalSexo: "femea",
      textoExterno: "GSC-7117",
      origem: "externo",
    });
    expect(repro).toEqual({ reprodutorSemen: "GSC-7117" });
    expect(repro.machoId).toBeUndefined();

    const meta = unpackReproObservacoes(
      packReproObservacoes(undefined, repro.reprodutorSemen, undefined, undefined, null, {
        partidaSemen: "P-889",
        inseminador: "Carlos",
        ecc: 3,
      }),
    );
    expect(meta.partidaSemen).toBe("P-889");
    expect(meta.inseminador).toBe("Carlos");
    expect(meta.ecc).toBe(3);
  });
});

describe("snapshot de custo por IA", () => {
  it("teste C — 90 e 105 permanecem independentes", () => {
    const ia90 = unpackReproObservacoes(
      packReproObservacoes(undefined, "GSI-2222", undefined, undefined, null, {
        custoDoseSemen: 90,
      }),
    );
    const ia105 = unpackReproObservacoes(
      packReproObservacoes(undefined, "GSI-2222", undefined, undefined, null, {
        custoDoseSemen: 105,
      }),
    );
    expect(ia90.custoDoseSemen).toBe(90);
    expect(ia105.custoDoseSemen).toBe(105);
  });

  it("teste E — legado sem custo fica null, sem R$ 0,00", () => {
    const meta = unpackReproObservacoes(
      packReproObservacoes(undefined, "GSI-2222"),
    );
    expect(meta.custoDoseSemen).toBeNull();
    const detalhes = formatInseminacaoDetalhesParts(meta, {});
    expect(detalhes.join(" · ")).not.toMatch(/Custo da dose/);
    expect(detalhes.join(" · ")).not.toMatch(/R\$\s*0/);
  });
});

describe("Inseminação — troca de origem", () => {
  it("interno → externo remove machoId", () => {
    const interno = buildReproReprodutorPayload({
      tipo: "Inseminação",
      animalSexo: "femea",
      machoId: 7,
      machoLabel: "16",
      origem: "interno",
    });
    expect(interno.machoId).toBe(7);

    const externo = buildReproReprodutorPayload({
      tipo: "Inseminação",
      animalSexo: "femea",
      textoExterno: "GSC-7117",
      origem: "externo",
    });
    expect(externo.machoId).toBeUndefined();
  });

  it("externo → interno não reaproveita texto como machoId", () => {
    const interno = buildReproReprodutorPayload({
      tipo: "Inseminação",
      animalSexo: "femea",
      machoId: 7,
      machoLabel: "16",
      origem: "interno",
      textoExterno: "GSC-7117",
    });
    expect(interno).toEqual({ machoId: 7, reprodutorSemen: "16" });
  });
});

describe("Inseminação — legado", () => {
  it("registro antigo só com reprodutorSemen continua legível", () => {
    const packed = packReproObservacoes(undefined, "ABC");
    const meta = unpackReproObservacoes(packed);
    expect(meta.reprodutorSemen).toBe("ABC");
    expect(meta.partidaSemen).toBeNull();
    expect(meta.inseminador).toBeNull();
    expect(meta.ecc).toBeNull();
  });
});

describe("formatInseminacaoDetalhesParts / histórico", () => {
  const metaCompleta = unpackReproObservacoes(
    packReproObservacoes(undefined, "16", undefined, undefined, null, {
      partidaSemen: "L23081",
      inseminador: "João Silva",
      ecc: 3.5,
    }),
  );

  it("com todos os campos", () => {
    const parts = formatInseminacaoDetalhesParts(
      metaCompleta,
      { dataPrevistoParto: "2027-06-04" },
      iso => iso.split("-").reverse().join("/"),
    );
    expect(parts).toEqual([
      "Reprodutor: 16",
      "Partida: L23081",
      "Inseminador: João Silva",
      "ECC: 3,5",
      "Previsão de parto: 04/06/2027",
    ]);
  });

  it("apenas reprodutor", () => {
    const meta = unpackReproObservacoes(packReproObservacoes(undefined, "16"));
    expect(formatInseminacaoDetalhesParts(meta, {})).toEqual(["Reprodutor: 16"]);
  });

  it("partida sem inseminador", () => {
    const meta = unpackReproObservacoes(
      packReproObservacoes(undefined, "16", undefined, undefined, null, {
        partidaSemen: "L23081",
      }),
    );
    const parts = formatInseminacaoDetalhesParts(meta, {});
    expect(parts).toContain("Partida: L23081");
    expect(parts.some(p => p.startsWith("Inseminador:"))).toBe(false);
  });

  it("ECC ausente não gera linha vazia", () => {
    const parts = formatInseminacaoDetalhesParts(metaCompleta, {});
    expect(parts.some(p => p.includes("undefined"))).toBe(false);
    expect(parts.some(p => p.includes("null"))).toBe(false);
  });

  it("formatReproDetalhesTabela integra Inseminação", () => {
    const detalhes = formatReproDetalhesTabela(
      { tipo: "Inseminação", dataPrevistoParto: "2027-06-04" },
      metaCompleta,
      iso => iso,
    );
    expect(detalhes).toContain("Reprodutor: 16");
    expect(detalhes).toContain("Partida: L23081");
    expect(detalhes).not.toContain("undefined");
  });

  it("legado ABC", () => {
    const meta = unpackReproObservacoes(packReproObservacoes(undefined, "ABC"));
    const detalhes = formatReproDetalhesTabela({ tipo: "Inseminação" }, meta);
    expect(detalhes).toBe("Reprodutor: ABC");
  });

  it("teste A/D — P-10FAZ legado não aparece como Reprodutor", () => {
    const meta = unpackReproObservacoes(
      `\n__fd_repro__${JSON.stringify({
        r: "P-10FAZ",
        ps: "P-10FAZ",
        cds: 90,
      })}__end__`,
    );
    const detalhes = formatReproDetalhesTabela(
      { tipo: "Inseminação", dataPrevistoParto: "2027-06-05" },
      meta,
      iso => String(iso).split("-").reverse().join("/"),
    );
    expect(detalhes).toContain("Reprodutor: Não informado");
    expect(detalhes).toContain("Partida: P-10FAZ");
    expect(detalhes).toMatch(/Custo da dose: R\$\s*90,00/);
    expect(detalhes).not.toContain("Reprodutor: P-10FAZ");
    expect(detalhes).not.toMatch(/machoId|animalId|reprodutor_key|semenPartidaId/i);
  });

  it("teste B — GSC-7117 / Sem lote permanece", () => {
    const meta = unpackReproObservacoes(
      packReproObservacoes(undefined, "GSC-7117", undefined, undefined, null, {
        partidaSemen: "Sem lote",
        custoDoseSemen: 138.89,
        inseminador: "Junior",
      }),
    );
    const detalhes = formatReproDetalhesTabela({ tipo: "Inseminação" }, meta);
    expect(detalhes).toContain("Reprodutor: GSC-7117");
    expect(detalhes).toContain("Partida: Sem lote");
    expect(detalhes).toContain("Inseminador: Junior");
    expect(detalhes).toContain("138,89");
  });

  it("teste C — interno usa brinco do macho e nunca a partida", () => {
    const meta = unpackReproObservacoes(
      `\n__fd_repro__${JSON.stringify({
        r: "P-10FAZ",
        ps: "P-10FAZ",
        cds: 150,
      })}__end__`,
    );
    const detalhes = formatReproDetalhesTabela(
      { tipo: "Inseminação", machoId: 16 },
      meta,
      undefined,
      { macho: { brinco: "16", nome: "Touro Teste" } },
    );
    expect(detalhes).toContain("Reprodutor: 16");
    expect(detalhes).toContain("Partida: P-10FAZ");
    expect(detalhes).not.toContain("Reprodutor: P-10FAZ");
    expect(detalhes).not.toContain("#16");
  });

  it("não altera Cobertura — continua usando o texto persistido", () => {
    const meta = unpackReproObservacoes(
      `\n__fd_repro__${JSON.stringify({ r: "P-10FAZ" })}__end__`,
    );
    const detalhes = formatReproDetalhesTabela({ tipo: "Cobertura" }, meta);
    expect(detalhes).toBe("P-10FAZ");
  });
});

describe("parseReproEccInput", () => {
  it("aceita vírgula decimal", () => {
    expect(parseReproEccInput("3,5")).toBe(3.5);
  });

  it("aceita ponto decimal", () => {
    expect(parseReproEccInput("3.5")).toBe(3.5);
  });
});

describe("sanitizeReproEccInputString", () => {
  it('"3,5" permanece "3,5" sem %', () => {
    expect(sanitizeReproEccInputString("3,5")).toBe("3,5");
    expect(sanitizeReproEccInputString("3,5")).not.toContain("%");
  });

  it("remove % da digitação e autofill", () => {
    expect(sanitizeReproEccInputString("3,5%")).toBe("3,5");
    expect(validateReproEcc("3,5%")).toEqual({ ok: true, value: 3.5 });
  });

  it("display do histórico nunca contém %", () => {
    expect(formatReproEccDisplay(3.5)).toBe("3,5");
    expect(formatReproEccDisplay(3.5)).not.toContain("%");
  });
});
