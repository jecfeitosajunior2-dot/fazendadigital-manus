import { describe, expect, it } from "vitest";
import {
  CADASTRAR_SEMEN_EXTERNO_HINT,
  CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL,
  CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR,
  CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_CENTRAL,
  CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_REPRODUTOR,
  CADASTRAR_SEMEN_EXTERNO_TITULO,
  buildCadastrarSemenExternoSubmitInput,
  canSaveCadastrarSemenExterno,
} from "./CadastrarSemenExternoDialog";

describe("modal Novo Sêmen", () => {
  it("teste A/B — título, texto e campos iguais nos dois fluxos", () => {
    expect(CADASTRAR_SEMEN_EXTERNO_TITULO).toBe("Novo sêmen");
    expect(CADASTRAR_SEMEN_EXTERNO_TITULO).not.toBe("Cadastrar sêmen / reprodutor");
    expect(CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR).toBe("Reprodutor / sêmen");
    expect(CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL).toBe("Central padrão");
    expect(CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_REPRODUTOR).toBe("Ex.: ABS 1234");
    expect(CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_CENTRAL).toBe("Ex.: Alta");
    expect(CADASTRAR_SEMEN_EXTERNO_HINT).toBe(
      "Cadastro reutilizável. Partida e custo ficam no manejo da inseminação.",
    );
    const campos = `${CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR} ${CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL}`;
    expect(campos).not.toMatch(/observa/i);
    expect(campos).not.toMatch(/partida|lote|custo|quantidade|saldo/i);
  });

  it("teste C — cadastro mínimo envia só o texto, sem observação", () => {
    const payload = buildCadastrarSemenExternoSubmitInput({
      reprodutorTexto: "ABS 1234",
      centralPadrao: "   ",
    });
    expect(payload).toEqual({ reprodutorTexto: "ABS 1234" });
    expect(payload).not.toHaveProperty("observacoes");
    expect(payload).not.toHaveProperty("partida");
    expect(payload).not.toHaveProperty("custo");
  });

  it("teste D — Central padrão opcional entra só quando preenchida", () => {
    expect(
      buildCadastrarSemenExternoSubmitInput({
        reprodutorTexto: "GSC-TESTE",
        centralPadrao: "  Alta  ",
      }),
    ).toEqual({ reprodutorTexto: "GSC-TESTE", centralPadrao: "Alta" });
  });

  it("Salvar fica bloqueado com vazio ou só espaços", () => {
    expect(canSaveCadastrarSemenExterno("")).toBe(false);
    expect(canSaveCadastrarSemenExterno("   ")).toBe(false);
    expect(canSaveCadastrarSemenExterno("ABS 1234")).toBe(true);
  });
});
