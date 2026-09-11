import { describe, expect, it } from "vitest";
import { packReproObservacoes, shouldShowReproRegistroNaFichaAnimal } from "./reproRegistroMeta";

describe("shouldShowReproRegistroNaFichaAnimal", () => {
  const touroId = 7;
  const matrizId = 27;

  it("mantém eventos do touro como animal principal", () => {
    expect(
      shouldShowReproRegistroNaFichaAnimal(
        { femeaId: touroId, machoId: touroId, observacoes: null },
        touroId,
        "macho",
      ),
    ).toBe(true);
  });

  it("oculta espelho automático na ficha do touro", () => {
    const obs = packReproObservacoes(undefined, "77", undefined, undefined, undefined, {
      espelhoAutomatico: true,
      registroOrigemId: 100,
    });
    expect(
      shouldShowReproRegistroNaFichaAnimal(
        { femeaId: matrizId, machoId: touroId, observacoes: obs },
        touroId,
        "macho",
      ),
    ).toBe(false);
  });

  it("mantém espelho automático na ficha da matriz", () => {
    const obs = packReproObservacoes(undefined, "77", undefined, undefined, undefined, {
      espelhoAutomatico: true,
      registroOrigemId: 100,
    });
    expect(
      shouldShowReproRegistroNaFichaAnimal(
        { femeaId: matrizId, machoId: touroId, observacoes: obs },
        matrizId,
        "femea",
      ),
    ).toBe(true);
  });

  it("mantém inseminação da matriz na ficha do touro reprodutor", () => {
    expect(
      shouldShowReproRegistroNaFichaAnimal(
        { femeaId: matrizId, machoId: touroId, observacoes: null },
        touroId,
        "macho",
      ),
    ).toBe(true);
  });

  it("oculta registro anulado na ficha da matriz", () => {
    const obs = packReproObservacoes(undefined, "77", undefined, undefined, undefined, {
      espelhoAutomatico: true,
      anulado: true,
      anuladoEmISO: "2026-09-10",
    });
    expect(
      shouldShowReproRegistroNaFichaAnimal(
        { femeaId: matrizId, machoId: touroId, observacoes: obs },
        matrizId,
        "femea",
      ),
    ).toBe(false);
  });
});
