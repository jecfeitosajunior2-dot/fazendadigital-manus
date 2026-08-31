import { describe, expect, it } from "vitest";
import {
  MSG_RFID_BASTAO_INDISPONIVEL,
  decidirAplicacaoRfidLido,
  deveMostrarLeituraRfidCadastro,
  textoStatusLeitorRfid,
} from "./rfidLeituraCadastro";

describe("leitura RFID no cadastro inicial", () => {
  it("só aparece no Novo Animal", () => {
    expect(deveMostrarLeituraRfidCadastro(false)).toBe(true);
    expect(deveMostrarLeituraRfidCadastro(true)).toBe(false);
  });

  it("preenche campo vazio sem confirmação", () => {
    expect(decidirAplicacaoRfidLido("", "963000400291061")).toBe("aplicar");
    expect(decidirAplicacaoRfidLido("   ", " 963000400291061 ")).toBe("aplicar");
  });

  it("não substitui o mesmo RFID já informado", () => {
    expect(decidirAplicacaoRfidLido("963000400291061", "963000400291061")).toBe("manter");
  });

  it("pede confirmação se já houver outro RFID no campo", () => {
    expect(decidirAplicacaoRfidLido("111", "963000400291061")).toBe("confirmar");
  });

  it("ignora leitura vazia", () => {
    expect(decidirAplicacaoRfidLido("111", "")).toBe("manter");
  });

  it("explica navegador sem Web Serial", () => {
    expect(textoStatusLeitorRfid("unsupported")).toBe(MSG_RFID_BASTAO_INDISPONIVEL);
  });

  it("usa textos operacionais, sem jargão técnico", () => {
    expect(textoStatusLeitorRfid("disconnected")).toBe("Leitor desconectado");
    expect(textoStatusLeitorRfid("connected")).toBe("Leitor conectado");
    expect(textoStatusLeitorRfid("capturing")).toBe("Aguardando leitura...");
  });
});
