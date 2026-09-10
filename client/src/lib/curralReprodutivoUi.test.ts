import { describe, expect, it } from "vitest";
import {
  ABORTO_RESULTADOS_CURRAL,
  CIO_RESULTADOS_CURRAL,
  curralResultadoToggleGridClass,
  getCurralResultadoToggleOptions,
  isDgResultadoCurralAvancado,
  isDgResultadoCurralPrincipal,
  maisDetalhesResumoCurral,
  PARTO_RESULTADOS_CURRAL,
  showCioResultadoCurral,
  showDgResultadoAvancadoCurral,
  isMatrizJaRegistradaCoberturaCurral,
  usesCurralReproMultiRegistro,
  usesCurralResultadoToggle,
} from "./curralReprodutivoUi";

describe("curralReprodutivoUi", () => {
  it("identifica resultados principais e avançados do DG", () => {
    expect(isDgResultadoCurralPrincipal("Prenha")).toBe(true);
    expect(isDgResultadoCurralPrincipal("Vazia")).toBe(true);
    expect(isDgResultadoCurralPrincipal("Inconclusivo")).toBe(false);

    expect(isDgResultadoCurralAvancado("Inconclusivo")).toBe(true);
    expect(isDgResultadoCurralAvancado("Repetir")).toBe(true);
    expect(isDgResultadoCurralAvancado("Prenha")).toBe(false);
  });

  it("exibe resultado avançado do DG fora de Mais detalhes quando principal vazio", () => {
    expect(showDgResultadoAvancadoCurral("Diagnóstico de prenhez", "")).toBe(true);
    expect(showDgResultadoAvancadoCurral("Diagnóstico de prenhez", "Inconclusivo")).toBe(true);
    expect(showDgResultadoAvancadoCurral("Diagnóstico de prenhez", "Prenha")).toBe(false);
    expect(showDgResultadoAvancadoCurral("Parto", "")).toBe(false);
  });

  it("mapeia tipos que usam botões de resultado no curral", () => {
    expect(usesCurralResultadoToggle("Parto")).toBe(true);
    expect(usesCurralResultadoToggle("Aborto")).toBe(true);
    expect(usesCurralResultadoToggle("Cio")).toBe(false);
    expect(showCioResultadoCurral("Cio")).toBe(true);
  });

  it("retorna opções de toggle por tipo", () => {
    expect(getCurralResultadoToggleOptions("Cio")).toEqual(CIO_RESULTADOS_CURRAL);
    expect(getCurralResultadoToggleOptions("Parto")).toEqual(PARTO_RESULTADOS_CURRAL);
    expect(getCurralResultadoToggleOptions("Aborto")).toEqual(ABORTO_RESULTADOS_CURRAL);
    expect(getCurralResultadoToggleOptions("Diagnóstico de prenhez")).toEqual([
      "Inconclusivo",
      "Repetir",
      "Outro",
    ]);
  });

  it("define colunas do grid conforme quantidade de opções", () => {
    expect(curralResultadoToggleGridClass(2)).toBe("grid-cols-2");
    expect(curralResultadoToggleGridClass(3)).toBe("grid-cols-3");
    expect(curralResultadoToggleGridClass(4)).toBe("grid-cols-2");
  });

  it("resume conteúdo de Mais detalhes", () => {
    expect(maisDetalhesResumoCurral("Inseminação")).toContain("Inseminador");
    expect(maisDetalhesResumoCurral("Cio")).toContain("Observações");
  });

  it("identifica tipos com multi-registro no curral", () => {
    expect(usesCurralReproMultiRegistro("Cobertura realizada")).toBe(true);
    expect(usesCurralReproMultiRegistro("Estação de monta")).toBe(true);
    expect(usesCurralReproMultiRegistro("Exame andrológico")).toBe(false);
  });

  it("detecta matriz já registrada na cobertura do touro", () => {
    expect(isMatrizJaRegistradaCoberturaCurral(12, [12, 27])).toBe(true);
    expect(isMatrizJaRegistradaCoberturaCurral(15, [12, 27])).toBe(false);
    expect(isMatrizJaRegistradaCoberturaCurral(12, new Set([12]))).toBe(true);
  });
});
