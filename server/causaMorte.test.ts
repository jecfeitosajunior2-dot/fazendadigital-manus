import { describe, expect, it } from "vitest";
import {
  CAUSA_MORTE_LABEL,
  CAUSAS_MORTE,
  MSG_CAUSA_MORTE_INVALIDA,
  MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA,
  BOTAO_CONFIRMAR_MORTE,
  TITULO_CONFIRMAR_MORTE,
  formatarCausaMorteExibicao,
  montarConfirmacaoMorte,
  montarMotivoMorte,
  parseCausaMorte,
  validarMotivoMortePersistido,
} from "../shared/causaMorte";

describe("Causa estruturada da Morte", () => {
  it("expõe as 7 opções aprovadas na ordem combinada", () => {
    expect(CAUSAS_MORTE).toEqual([
      "acidente",
      "doenca",
      "problema_parto",
      "intoxicacao",
      "ataque_animal",
      "desconhecida",
      "outro",
    ]);
    expect(CAUSA_MORTE_LABEL.doenca).toBe("Doença");
    expect(CAUSA_MORTE_LABEL.desconhecida).toBe("Causa desconhecida");
    expect(CAUSA_MORTE_LABEL.problema_parto).toBe("Problema no parto");
  });

  it("permite registrar Morte sem causa", () => {
    expect(montarMotivoMorte({ codigo: "", descricaoOutro: "" })).toEqual({
      ok: true,
      motivo: null,
    });
    expect(validarMotivoMortePersistido(null)).toEqual({ ok: true, motivo: null });
    expect(validarMotivoMortePersistido("")).toEqual({ ok: true, motivo: null });
  });

  it("persiste código estruturado e não a descrição de Outro", () => {
    expect(montarMotivoMorte({ codigo: "doenca", descricaoOutro: "texto escondido" })).toEqual({
      ok: true,
      motivo: "doenca",
    });
    expect(formatarCausaMorteExibicao("doenca")).toBe("Doença");
    expect(formatarCausaMorteExibicao("desconhecida")).toBe("Causa desconhecida");
  });

  it("exige descrição quando a causa é Outro", () => {
    expect(montarMotivoMorte({ codigo: "outro", descricaoOutro: "   " })).toEqual({
      ok: false,
      message: MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA,
    });
    expect(validarMotivoMortePersistido("outro")).toEqual({
      ok: false,
      message: MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA,
    });
    expect(montarMotivoMorte({ codigo: "outro", descricaoOutro: "Picada de cobra" })).toEqual({
      ok: true,
      motivo: "outro:Picada de cobra",
    });
    expect(formatarCausaMorteExibicao("outro:Picada de cobra")).toBe("Picada de cobra");
  });

  it("rejeita texto livre novo e preserva leitura de legado", () => {
    expect(validarMotivoMortePersistido("picada de cobra")).toEqual({
      ok: false,
      message: MSG_CAUSA_MORTE_INVALIDA,
    });
    expect(parseCausaMorte("picada de cobra")).toMatchObject({
      legado: true,
      texto: "picada de cobra",
      codigo: null,
    });
    expect(formatarCausaMorteExibicao("picada de cobra")).toBe("picada de cobra");
  });

  it("monta o modal de Morte sem causa e com causa estruturada", () => {
    expect(
      montarConfirmacaoMorte({
        identificacao: "01",
        dataISO: "2026-08-30",
      }),
    ).toEqual({
      title: TITULO_CONFIRMAR_MORTE,
      confirmText: BOTAO_CONFIRMAR_MORTE,
      texto:
        "O animal 01 será marcado como Morto em 30/08/2026. Essa ação ficará registrada no histórico.",
      causa: null,
    });

    expect(
      montarConfirmacaoMorte({
        identificacao: "01",
        dataISO: "2026-08-30",
        motivo: "doenca",
      }).causa,
    ).toBe("Doença");

    expect(
      montarConfirmacaoMorte({
        identificacao: "01",
        dataISO: "2026-08-30",
        motivo: "desconhecida",
      }).causa,
    ).toBe("Causa desconhecida");

    expect(
      montarConfirmacaoMorte({
        identificacao: "01",
        dataISO: "2026-08-30",
        motivo: "outro:Picada de cobra",
      }).causa,
    ).toBe("Picada de cobra");
  });
});
