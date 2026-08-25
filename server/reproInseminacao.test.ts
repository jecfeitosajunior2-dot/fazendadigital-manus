import { describe, expect, it } from "vitest";
import {
  formatReproEccDisplay,
  parseReproEccInput,
  sanitizeReproEccInputString,
  validateReproEcc,
} from "../shared/reproInseminacao";
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
