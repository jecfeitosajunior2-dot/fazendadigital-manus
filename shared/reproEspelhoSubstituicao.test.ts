import { describe, expect, it } from "vitest";
import { packReproObservacoes } from "./reproRegistroMeta";
import {
  anularReproObservacoesPersistidas,
  findRegistroEspelhoDuplicadoAtivoId,
  getSubstituirEspelhoCurralDialogCopy,
  isReproRegistroAnulado,
  listMatrizesComEspelhoDuplicadoAtivo,
} from "./reproEspelhoSubstituicao";

describe("reproEspelhoSubstituicao", () => {
  const ativo = {
    id: 50,
    femeaId: 12,
    machoId: 7,
    tipo: "Exposição à monta",
    dataCobertura: "2026-09-10",
    observacoes: null,
  };

  const anuladoObs = anularReproObservacoesPersistidas(null, {
    anuladoEmISO: "2026-09-10",
    substituidoPorRegistroId: 100,
  });

  it("detecta registro anulado nos metadados", () => {
    expect(isReproRegistroAnulado(anuladoObs)).toBe(true);
    expect(isReproRegistroAnulado(null)).toBe(false);
  });

  it("ignora espelho anulado na busca de duplicata ativa", () => {
    const registros = [{ ...ativo, observacoes: anuladoObs }];
    expect(
      findRegistroEspelhoDuplicadoAtivoId(
        registros,
        12,
        7,
        "Exposição à monta",
        "2026-09-10",
      ),
    ).toBeNull();
    expect(
      findRegistroEspelhoDuplicadoAtivoId(
        [ativo],
        12,
        7,
        "Exposição à monta",
        "2026-09-10",
      ),
    ).toBe(50);
  });

  it("lista matrizes com duplicata ativa", () => {
    expect(
      listMatrizesComEspelhoDuplicadoAtivo(
        [ativo],
        [12, 27],
        7,
        "Exposição à monta",
        "2026-09-10",
      ),
    ).toEqual([12]);
    expect(
      listMatrizesComEspelhoDuplicadoAtivo(
        [{ ...ativo, observacoes: anuladoObs }],
        [12],
        7,
        "Exposição à monta",
        "2026-09-10",
      ),
    ).toEqual([]);
  });

  it("preserva metadados ao anular", () => {
    const obs = packReproObservacoes(undefined, "Touro 77", undefined, undefined, undefined, {
      espelhoAutomatico: true,
      registroOrigemId: 99,
    });
    const anulado = anularReproObservacoesPersistidas(obs, {
      anuladoEmISO: "2026-09-11",
      substituidoPorRegistroId: 200,
    });
    expect(anulado).toContain('"anu":1');
    expect(anulado).toContain('"spr":200');
    expect(anulado).toContain('"esp":1');
  });

  it("fornece textos do diálogo de substituição", () => {
    expect(getSubstituirEspelhoCurralDialogCopy("Exposição à monta").title).toBe(
      "Substituir registro de hoje?",
    );
    expect(getSubstituirEspelhoCurralDialogCopy("Cobertura").description).toContain("cobertura");
  });
});
