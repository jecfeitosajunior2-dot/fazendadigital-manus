import { describe, expect, it } from "vitest";
import {
  MSG_PARTO_BRINCO_DUPLICADO_LOTE,
  MSG_PARTO_CATEGORIA_INCOMPATIVEL,
  MSG_PARTO_CATEGORIA_OBRIGATORIA,
  MSG_PARTO_CRIAS_OBRIGATORIAS,
  MSG_PARTO_NATIMORTO_SEM_CRIAS,
  resolvePaiIdFromRegistros,
  validateRegistrarPartoComCriasBusinessRules,
} from "./registrarPartoComCrias";

describe("resolvePaiIdFromRegistros", () => {
  it("prioriza machoId explícito", () => {
    const pai = resolvePaiIdFromRegistros(
      [{ tipo: "Inseminação", machoId: 10, dataCobertura: "2025-01-01" }],
      "2025-10-01",
      99,
    );
    expect(pai).toBe(99);
  });

  it("usa última concepção com macho cadastrado", () => {
    const pai = resolvePaiIdFromRegistros(
      [
        { tipo: "Inseminação", machoId: null, dataCobertura: "2025-02-01" },
        { tipo: "Cobertura", machoId: 42, dataCobertura: "2025-03-01" },
        { tipo: "Cobertura", machoId: 7, dataCobertura: "2025-01-01" },
      ],
      "2025-10-01",
    );
    expect(pai).toBe(42);
  });

  it("ignora concepções posteriores à data do parto", () => {
    const pai = resolvePaiIdFromRegistros(
      [
        { tipo: "Cobertura", machoId: 5, dataCobertura: "2025-11-01" },
        { tipo: "Inseminação", machoId: 3, dataCobertura: "2025-04-01" },
      ],
      "2025-10-01",
    );
    expect(pai).toBe(3);
  });

  it("retorna null quando pai interno desconhecido", () => {
    const pai = resolvePaiIdFromRegistros(
      [{ tipo: "Inseminação", machoId: null, dataCobertura: "2025-01-01" }],
      "2025-10-01",
    );
    expect(pai).toBeNull();
  });
});

describe("validateRegistrarPartoComCriasBusinessRules", () => {
  const base = {
    femeaId: 1,
    fazendaId: 1,
    dataParto: "2025-08-01",
    resultado: "Normal" as const,
  };

  it("exige crias quando não é natimorto", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({ ...base, crias: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_CRIAS_OBRIGATORIAS);
  });

  it("rejeita crias em natimorto", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      resultado: "Natimorto",
      crias: [{ brinco: "101", sexo: "macho" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_NATIMORTO_SEM_CRIAS);
  });

  it("rejeita brincos duplicados no lote", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      crias: [
        { brinco: "101", sexo: "macho" },
        { brinco: "101", sexo: "femea" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_BRINCO_DUPLICADO_LOTE);
  });

  it("aceita parto normal com uma cria", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      crias: [{ brinco: "201", sexo: "femea", categoria: "Bezerra" }],
    });
    expect(r).toEqual({ ok: true, isNatimorto: false });
  });

  it("exige categoria em cada cria", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      crias: [{ brinco: "201", sexo: "femea" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_CATEGORIA_OBRIGATORIA);
  });

  it("rejeita macho com categoria Bezerra", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      crias: [{ brinco: "301", sexo: "macho", categoria: "Bezerra" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_CATEGORIA_INCOMPATIVEL);
  });

  it("rejeita femea com categoria Bezerro", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      crias: [{ brinco: "302", sexo: "femea", categoria: "Bezerro" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_CATEGORIA_INCOMPATIVEL);
  });

  it("aceita macho com categoria Bezerro", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      crias: [{ brinco: "303", sexo: "macho", categoria: "Bezerro" }],
    });
    expect(r).toEqual({ ok: true, isNatimorto: false });
  });

  it("exige crias para Com assistência", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      resultado: "Com assistência",
      crias: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_PARTO_CRIAS_OBRIGATORIAS);
  });

  it("aceita natimorto sem crias", () => {
    const r = validateRegistrarPartoComCriasBusinessRules({
      ...base,
      resultado: "Natimorto",
    });
    expect(r).toEqual({ ok: true, isNatimorto: true });
  });
});
