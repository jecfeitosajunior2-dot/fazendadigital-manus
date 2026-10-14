import { describe, expect, it } from "vitest";
import {
  anexarIdentificacaoAnimalSaude,
  destinosAcoesHubSanitario,
  destinosPaginaRegistrosSanitarios,
  podeEstornarRegistroSanitario,
  ROTA_CADASTRO_SANITARIO,
  ROTA_REGISTROS_SANITARIOS,
  rotuloAnimalSanitarioLista,
} from "./saudeListaDisplay";

describe("identificação do animal na lista sanitária", () => {
  it("A. brinco visual tem prioridade", () => {
    expect(rotuloAnimalSanitarioLista({
      animalId: 1,
      brincoVisual: "12",
      rfid: "982000123",
    })).toBe("Brinco 12");
  });

  it("B. sem brinco visual, usa RFID", () => {
    expect(rotuloAnimalSanitarioLista({
      animalId: 30,
      brincoVisual: null,
      rfid: "963001122",
    })).toBe("RFID 963001122");
  });

  it("C. sem brinco e sem RFID, cai no ID interno", () => {
    expect(rotuloAnimalSanitarioLista({
      animalId: 7,
      brincoVisual: "  ",
      rfid: "",
    })).toBe("Animal #7");
  });
});

describe("ação de estorno na lista sanitária", () => {
  it("D. registro ativo oferece Estornar", () => {
    expect(podeEstornarRegistroSanitario("ativo")).toBe(true);
    expect(podeEstornarRegistroSanitario(null)).toBe(true);
  });

  it("E. registro estornado não oferece Estornar", () => {
    expect(podeEstornarRegistroSanitario("estornado")).toBe(false);
    expect(podeEstornarRegistroSanitario("ESTORNADO")).toBe(false);
  });
});

describe("navegação oficial do Sanitário no Manejo", () => {
  it("F. Ver registros vai para /saude/registros", () => {
    expect(destinosAcoesHubSanitario().verRegistros).toBe("/saude/registros");
    expect(destinosAcoesHubSanitario().verRegistros).toBe(ROTA_REGISTROS_SANITARIOS);
  });

  it("G. + Novo Registro e Registrar usam o formulário oficial", () => {
    expect(destinosAcoesHubSanitario().registrar).toBe(ROTA_CADASTRO_SANITARIO);
    expect(destinosPaginaRegistrosSanitarios().novoRegistro).toBe(
      "/manejo/registros/cadastro?tipo=sanitario",
    );
  });
});

describe("anexo de identificação sem N+1", () => {
  it("preenche brinco e RFID em uma passada", () => {
    const anexados = anexarIdentificacaoAnimalSaude(
      [{ id: 26, animalId: 1 }],
      [{ id: 1, brinco: "12", brincoEletronico: "982000123" }],
    );
    expect(anexados).toHaveLength(1);
    expect(anexados[0]?.brincoVisual).toBe("12");
    expect(anexados[0]?.rfid).toBe("982000123");
    expect(rotuloAnimalSanitarioLista(anexados[0]!)).toBe("Brinco 12");
  });
});
