import { describe, it, expect } from "vitest";
import {
  buildBrincoAtivoConflitoMessage,
  findActiveBrincoConflict,
  normalizeBrincoKey,
  resolveEffectiveStatus,
  validarBrincoAtivoImportacao,
} from "../shared/brincoAtivo";

describe("brincoAtivo", () => {
  it("normaliza brinco ignorando maiúsculas e espaços", () => {
    expect(normalizeBrincoKey("  ABC-123 ")).toBe("abc-123");
  });

  it("bloqueia dois animais ativos com o mesmo brinco", () => {
    const lista = [
      { id: 1, brinco: "100", status: "ativo" },
      { id: 2, brinco: "200", status: "ativo" },
    ];
    const conflito = findActiveBrincoConflict(lista, "100", {
      excludeAnimalId: 1,
      effectiveStatus: "ativo",
    });
    expect(conflito).toBeNull();

    const conflitoOutro = findActiveBrincoConflict(lista, "100", {
      effectiveStatus: "ativo",
    });
    expect(conflitoOutro?.id).toBe(1);
  });

  it("permite reutilizar brinco de animal inativo", () => {
    const lista = [{ id: 5, brinco: "100", status: "vendido" }];
    const conflito = findActiveBrincoConflict(lista, "100", { effectiveStatus: "ativo" });
    expect(conflito).toBeNull();
  });

  it("não valida unicidade quando o animal ficará inativo", () => {
    const lista = [{ id: 1, brinco: "100", status: "ativo" }];
    const conflito = findActiveBrincoConflict(lista, "100", {
      effectiveStatus: "vendido",
    });
    expect(conflito).toBeNull();
  });

  it("valida importação apenas entre linhas ativas", () => {
    const banco = new Set<string>();
    const planilha = new Set<string>();

    expect(
      validarBrincoAtivoImportacao({
        brinco: "300",
        statusEfetivo: "vendido",
        brincosAtivosBanco: banco,
        brincosAtivosPlanilha: planilha,
      }),
    ).toBeNull();

    const erro = validarBrincoAtivoImportacao({
      brinco: "400",
      statusEfetivo: "ativo",
      brincosAtivosBanco: banco,
      brincosAtivosPlanilha: planilha,
    });
    expect(erro).toBeNull();
    expect(planilha.has("400")).toBe(true);

    const duplicado = validarBrincoAtivoImportacao({
      brinco: "400",
      statusEfetivo: "ativo",
      brincosAtivosBanco: banco,
      brincosAtivosPlanilha: planilha,
    });
    expect(duplicado?.mensagem).toContain("duplicado entre animais ativos");
  });

  it("monta mensagem clara orientando como resolver o conflito", () => {
    const msg = buildBrincoAtivoConflitoMessage("12", { id: 205, brinco: "12" });
    expect(msg).toBe(
      "Já existe um animal ativo com o brinco visual 12 nesta fazenda.",
    );
  });

  it("permite mesmo brinco ativo em fazendas diferentes quando fazendaId é informado", () => {
    const lista = [
      { id: 1, brinco: "25", status: "ativo", fazendaId: 1 },
      { id: 2, brinco: "25", status: "ativo", fazendaId: 2 },
    ];
    const conflito = findActiveBrincoConflict(lista, "25", {
      fazendaId: 1,
      effectiveStatus: "ativo",
    });
    expect(conflito?.id).toBe(1);

    const livre = findActiveBrincoConflict(lista, "25", {
      fazendaId: 1,
      excludeAnimalId: 1,
      effectiveStatus: "ativo",
    });
    expect(livre).toBeNull();
  });

  it("resolve status efetivo com fallback ativo", () => {
    expect(resolveEffectiveStatus(undefined, "vendido")).toBe("vendido");
    expect(resolveEffectiveStatus("", undefined)).toBe("ativo");
  });
});
