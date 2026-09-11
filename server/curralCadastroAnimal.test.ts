import { describe, expect, it } from "vitest";
import {
  buildPayloadCadastroSuperficialCurral,
  categoriaPadraoCadastroCurral,
  validarCadastroSuperficialCurral,
} from "../shared/curralCadastroAnimal";

describe("curralCadastroAnimal", () => {
  it("categoria padrão por sexo", () => {
    expect(categoriaPadraoCadastroCurral("macho")).toBe("Bezerro");
    expect(categoriaPadraoCadastroCurral("femea")).toBe("Bezerra");
  });

  it("valida campos mínimos", () => {
    expect(validarCadastroSuperficialCurral({ fazendaId: 1, brinco: "55", sexo: "macho", categoria: "Bezerro" }).ok).toBe(
      true,
    );
    expect(validarCadastroSuperficialCurral({ fazendaId: 1, brinco: "", sexo: "macho", categoria: "Bezerro" }).ok).toBe(
      false,
    );
  });

  it("monta payload com data de entrada da sessão", () => {
    expect(
      buildPayloadCadastroSuperficialCurral({
        fazendaId: 1,
        dataEntrada: "2026-09-11",
        brinco: "55",
        sexo: "macho",
        categoria: "Bezerro",
        brincoEletronico: "ABC123",
        loteId: 3,
        pesoEntrada: "200",
      }),
    ).toMatchObject({
      brinco: "55",
      brincoEletronico: "ABC123",
      sexo: "macho",
      dataEntrada: "2026-09-11",
      loteId: 3,
      pesoEntrada: "200",
      observacoes: "Cadastro curral.",
    });
  });
});
