import { describe, expect, it } from "vitest";
import {
  animalElegivelParaManejoNaData,
  avaliarManejoVsBaixa,
  formatarDataBaixa,
  mensagemSaidaDuplicada,
  BOTAO_CONFIRMAR_TRANSFERENCIA_EXTERNA,
  MSG_BAIXA_DATA_FUTURA,
  MSG_BAIXA_DUPLICADA,
  MSG_MANEJO_BAIXA_LEGADA,
  MSG_SAIDA_VENDA_DUPLICADA,
  MSG_TRANSFERENCIA_EXTERNA_DESTINO,
  MSG_VENDA_VIA_MANEJO_BLOQUEADA,
  montarConfirmacaoTransferenciaExterna,
  tipoBaixaParaStatus,
  TITULO_CONFIRMAR_TRANSFERENCIA_EXTERNA,
  validarBaixaAnimalInput,
} from "../shared/animalBaixa";
import { MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA } from "../shared/causaMorte";

describe("Baixa do Animal", () => {
  it.each([
    ["venda", "vendido"],
    ["morte", "morto"],
    ["transferencia", "transferido"],
  ] as const)("mapeia %s para status %s", (tipo, status) => {
    expect(tipoBaixaParaStatus(tipo)).toBe(status);
  });

  it("valida data operacional obrigatória e não futura", () => {
    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "",
        tipo: "venda",
        hojeISO: "2026-08-20",
      }),
    ).toEqual({ ok: false, message: "Data da baixa é obrigatória." });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-21",
        tipo: "venda",
        hojeISO: "2026-08-20",
      }),
    ).toEqual({ ok: false, message: MSG_BAIXA_DATA_FUTURA });
  });

  it("bloqueia nova Venda pelo fluxo de Manejo e preserva o mapeamento legado", () => {
    expect(tipoBaixaParaStatus("venda")).toBe("vendido");
    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "venda",
        hojeISO: "2026-08-20",
      }),
    ).toEqual({ ok: false, message: MSG_VENDA_VIA_MANEJO_BLOQUEADA });
  });

  it("permite manejo anterior ou no mesmo dia da baixa", () => {
    expect(
      animalElegivelParaManejoNaData({
        status: "morto",
        dataBaixa: "2026-08-20",
        dataEvento: "2026-08-18",
      }),
    ).toBe(true);
    expect(
      animalElegivelParaManejoNaData({
        status: "morto",
        dataBaixa: "2026-08-20",
        dataEvento: "2026-08-20",
      }),
    ).toBe(true);
  });

  it("bloqueia manejo posterior e informa a data real da baixa", () => {
    expect(
      avaliarManejoVsBaixa({
        status: "vendido",
        dataBaixa: "2026-08-20",
        dataEvento: "2026-08-21",
      }),
    ).toEqual({
      permitido: false,
      codigo: "MANEJO_APOS_BAIXA",
      mensagem: "Não é possível registrar este manejo porque o animal foi baixado em 20/08/2026.",
    });
  });

  it("bloqueia legado inativo sem inventar data", () => {
    expect(
      avaliarManejoVsBaixa({
        status: "transferido",
        dataBaixa: null,
        dataEvento: "2026-08-18",
      }),
    ).toEqual({
      permitido: false,
      codigo: "BAIXA_LEGADA_SEM_DATA",
      mensagem: MSG_MANEJO_BAIXA_LEGADA,
    });
  });

  it("mantém mensagens e apresentação estáveis", () => {
    expect(MSG_BAIXA_DUPLICADA).toContain("já possui uma baixa");
    expect(formatarDataBaixa(null)).toBe("—");
    expect(formatarDataBaixa("2026-08-20")).toBe("20/08/2026");
  });

  it("aceita Morte sem causa e valida causa estruturada", () => {
    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "morte",
        hojeISO: "2026-08-20",
      }),
    ).toMatchObject({ ok: true, tipo: "morte", status: "morto" });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "morte",
        motivo: "doenca",
        hojeISO: "2026-08-20",
      }),
    ).toMatchObject({ ok: true, tipo: "morte" });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "morte",
        motivo: "outro",
        hojeISO: "2026-08-20",
      }),
    ).toEqual({ ok: false, message: MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "morte",
        motivo: "outro:Picada de cobra",
        hojeISO: "2026-08-20",
      }),
    ).toMatchObject({ ok: true, tipo: "morte" });
  });

  it("exige destino na transferência externa", () => {
    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "transferencia",
        hojeISO: "2026-08-20",
      }),
    ).toEqual({ ok: false, message: MSG_TRANSFERENCIA_EXTERNA_DESTINO });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "transferencia",
        destino: "Fazenda São José",
        hojeISO: "2026-08-20",
      }),
    ).toMatchObject({ ok: true, tipo: "transferencia", status: "transferido" });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "transferencia",
        destino: "Fazenda São José",
        motivo: "doenca",
        hojeISO: "2026-08-20",
      }),
    ).toMatchObject({ ok: true, tipo: "transferencia" });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "transferencia",
        destino: "     ",
        hojeISO: "2026-08-20",
      }),
    ).toEqual({ ok: false, message: MSG_TRANSFERENCIA_EXTERNA_DESTINO });

    expect(
      validarBaixaAnimalInput({
        fazendaId: 1,
        animalId: 2,
        dataBaixa: "2026-08-20",
        tipo: "transferencia",
        destino: "  Fazenda Santa Maria  ",
        hojeISO: "2026-08-20",
      }),
    ).toMatchObject({ ok: true, tipo: "transferencia", status: "transferido" });
  });

  it("usa mensagem específica por tipo de saída duplicada", () => {
    expect(mensagemSaidaDuplicada("venda")).toBe(MSG_SAIDA_VENDA_DUPLICADA);
    expect(mensagemSaidaDuplicada("transferencia")).toContain("não pode ser transferido");
  });

  it("monta o modal da Transferência externa com destino e data", () => {
    expect(
      montarConfirmacaoTransferenciaExterna({
        identificacao: "28",
        destino: "Fazenda Santa Maria",
        dataISO: "2026-08-31",
      }),
    ).toEqual({
      ok: true,
      title: TITULO_CONFIRMAR_TRANSFERENCIA_EXTERNA,
      confirmText: BOTAO_CONFIRMAR_TRANSFERENCIA_EXTERNA,
      texto:
        "O animal 28 será marcado como Transferido e enviado para Fazenda Santa Maria em 31/08/2026. Essa ação ficará registrada no histórico.",
    });

    expect(
      montarConfirmacaoTransferenciaExterna({
        identificacao: "28",
        destino: "   ",
        dataISO: "2026-08-31",
      }),
    ).toEqual({ ok: false, message: MSG_TRANSFERENCIA_EXTERNA_DESTINO });

    expect(
      montarConfirmacaoTransferenciaExterna({
        identificacao: "28",
        destino: "  Fazenda Santa Maria  ",
        dataISO: "2026-08-31",
      }),
    ).toMatchObject({
      ok: true,
      texto:
        "O animal 28 será marcado como Transferido e enviado para Fazenda Santa Maria em 31/08/2026. Essa ação ficará registrada no histórico.",
    });
  });

  it("bloqueia manejo posterior à Transferência externa e permite retroativo", () => {
    expect(
      animalElegivelParaManejoNaData({
        status: "transferido",
        dataBaixa: "2026-08-31",
        dataEvento: "2026-08-30",
      }),
    ).toBe(true);
    expect(
      animalElegivelParaManejoNaData({
        status: "transferido",
        dataBaixa: "2026-08-31",
        dataEvento: "2026-09-01",
      }),
    ).toBe(false);
  });
});
