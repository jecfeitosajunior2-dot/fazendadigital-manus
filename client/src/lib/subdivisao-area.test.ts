import { describe, it, expect } from "vitest";
import {
  areaObrigatoriaParaTipo,
  convertAreaInputToHectares,
  formatHectaresForStorage,
  incluirAreaPadraoParaTipo,
  mensagemConfirmarIncluirAreaTotal,
} from "@/lib/subdivisao-area";

describe("subdivisao-area", () => {
  it("área obrigatória para pasto e opcional para curral", () => {
    expect(areaObrigatoriaParaTipo("Pasto")).toBe(true);
    expect(areaObrigatoriaParaTipo("Curral")).toBe(false);
    expect(areaObrigatoriaParaTipo("Outro")).toBe(false);
  });

  it("incluirArea padrão conforme o tipo", () => {
    expect(incluirAreaPadraoParaTipo("Pasto")).toBe(true);
    expect(incluirAreaPadraoParaTipo("Curral")).toBe(false);
  });

  it("converte m² para hectare", () => {
    expect(convertAreaInputToHectares("500", "m2")).toBe(0.05);
    expect(convertAreaInputToHectares("0,05", "ha")).toBe(0.05);
  });

  it("monta mensagem de confirmação para incluir área", () => {
    const msg = mensagemConfirmarIncluirAreaTotal("Curral", "Manejo", 0.05);
    expect(msg).toContain("Curral");
    expect(msg).toContain("Manejo");
    expect(msg).toContain("0,05 ha");
  });
});
