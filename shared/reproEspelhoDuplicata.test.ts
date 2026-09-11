import { describe, expect, it } from "vitest";
import { anularReproObservacoesPersistidas } from "./reproEspelhoSubstituicao";
import {
  filterMatrizesSemEspelhoDuplicado,
  matrizTemEspelhoReproDuplicado,
} from "./reproEspelhoDuplicata";

describe("reproEspelhoDuplicata", () => {
  const existentes = [
    {
      femeaId: 12,
      machoId: 7,
      tipo: "Exposição à monta",
      dataCobertura: "2026-09-10",
    },
  ];

  it("detecta espelho duplicado", () => {
    expect(
      matrizTemEspelhoReproDuplicado(existentes, 12, 7, "Exposição à monta", "2026-09-10"),
    ).toBe(true);
    expect(
      matrizTemEspelhoReproDuplicado(existentes, 27, 7, "Exposição à monta", "2026-09-10"),
    ).toBe(false);
  });

  it("filtra matrizes elegíveis", () => {
    const { elegiveis, ignoradas } = filterMatrizesSemEspelhoDuplicado(
      existentes,
      [12, 27, 12],
      7,
      "Exposição à monta",
      "2026-09-10",
    );
    expect(elegiveis).toEqual([27]);
    expect(ignoradas).toEqual([12]);
  });

  it("ignora espelho anulado na detecção de duplicata", () => {
    const anuladoObs = anularReproObservacoesPersistidas(null, {
      anuladoEmISO: "2026-09-10",
      substituidoPorRegistroId: 100,
    });
    const comAnulado = [{ ...existentes[0], observacoes: anuladoObs }];
    expect(
      matrizTemEspelhoReproDuplicado(comAnulado, 12, 7, "Exposição à monta", "2026-09-10"),
    ).toBe(false);
    const { elegiveis } = filterMatrizesSemEspelhoDuplicado(
      comAnulado,
      [12],
      7,
      "Exposição à monta",
      "2026-09-10",
    );
    expect(elegiveis).toEqual([12]);
  });
});
