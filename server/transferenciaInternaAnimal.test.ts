import { describe, expect, it } from "vitest";
import {
  MSG_TRANSFERENCIA_DESTINO_OBRIGATORIA,
  MSG_TRANSFERENCIA_LOTE_OBRIGATORIO,
  MSG_TRANSFERENCIA_MESMA_FAZENDA,
  validarTransferenciaInternaInput,
} from "../shared/transferenciaInternaAnimal";

describe("Transferência interna entre Fazendas", () => {
  const base = {
    fazendaOrigemId: 1,
    fazendaDestinoId: 2,
    animalId: 10,
    loteDestinoId: 8,
    loteDestinoFazendaId: 2,
    loteDestinoAtivo: true,
    dataTransferencia: "2026-08-30",
    hojeISO: "2026-08-30",
  };

  it("mantém o animal ativo e exige destino diferente da origem", () => {
    expect(
      validarTransferenciaInternaInput({
        ...base,
        fazendaDestinoId: 1,
      }),
    ).toEqual({ ok: false, message: MSG_TRANSFERENCIA_MESMA_FAZENDA });

    expect(validarTransferenciaInternaInput(base)).toEqual({
      ok: true,
      dataISO: "2026-08-30",
      fazendaOrigemId: 1,
      fazendaDestinoId: 2,
      loteDestinoId: 8,
      pastoDestinoId: null,
    });
  });

  it("exige Fazenda e Lote de destino", () => {
    expect(
      validarTransferenciaInternaInput({
        ...base,
        fazendaDestinoId: null,
      }),
    ).toEqual({ ok: false, message: MSG_TRANSFERENCIA_DESTINO_OBRIGATORIA });

    expect(
      validarTransferenciaInternaInput({
        ...base,
        loteDestinoId: null,
      }),
    ).toEqual({ ok: false, message: MSG_TRANSFERENCIA_LOTE_OBRIGATORIO });
  });

  it("não trata transferência interna como baixa", () => {
    const ok = validarTransferenciaInternaInput(base);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.fazendaDestinoId).not.toBe(ok.fazendaOrigemId);
    }
  });
});
