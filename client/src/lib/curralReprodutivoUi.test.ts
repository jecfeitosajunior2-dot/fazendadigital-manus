import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ABORTO_RESULTADOS_CURRAL,
  CIO_RESULTADOS_CURRAL,
  curralResultadoToggleGridClass,
  getCurralResultadoToggleOptions,
  isDgResultadoCurralAvancado,
  isDgResultadoCurralPrincipal,
  maisDetalhesResumoCurral,
  mapSemenDisponivelParaOpcaoCurral,
  PARTO_RESULTADOS_CURRAL,
  partidaSemenCurralObrigatoria,
  reprodutorExternoCurralEstaEmEstoque,
  showCioResultadoCurral,
  showDgResultadoAvancadoCurral,
  getCurralReproPosRegistroUnicoToast,
  getCurralReproRegistrarButtonLabel,
  getCurralReproRodape,
  getReproMachoTipoHint,
  isMatrizJaRegistradaCoberturaCurral,
  orderReproTipoOptionsMachoCurral,
  usesCurralReproMultiRegistro,
  usesCurralResultadoToggle,
} from "./curralReprodutivoUi";

const panelSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/curral/CurralReprodutivoPanel.tsx"),
  "utf8",
);

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

  it("prioriza Estação de monta antes de Cobertura realizada no curral", () => {
    expect(
      orderReproTipoOptionsMachoCurral([
        "Cobertura realizada",
        "Exame andrológico",
        "Estação de monta",
      ]),
    ).toEqual(["Estação de monta", "Cobertura realizada", "Exame andrológico"]);
  });

  it("rotula botão de registro conforme o tipo", () => {
    expect(getCurralReproRegistrarButtonLabel("Estação de monta", false)).toBe(
      "Registrar estação",
    );
    expect(getCurralReproRegistrarButtonLabel("Cobertura realizada", false)).toBe(
      "Registrar cobertura",
    );
    expect(getCurralReproRegistrarButtonLabel("Exame andrológico", true)).toBe("Salvando…");
  });

  it("exibe hints para tipos masculinos de monta e cobertura", () => {
    expect(getReproMachoTipoHint("Estação de monta")).toContain("exposição");
    expect(getReproMachoTipoHint("Cobertura realizada")).toContain("brete");
    expect(getReproMachoTipoHint("Exame andrológico")).toBeNull();
  });

  it("orienta permanência no animal após registro único no curral", () => {
    expect(getCurralReproPosRegistroUnicoToast("Exame andrológico · Apto", "macho")).toContain(
      "conclua o touro",
    );
    expect(getCurralReproPosRegistroUnicoToast("Diagnóstico de prenhez · Prenha", "femea")).toContain(
      "conclua o animal",
    );
  });

  it("diferencia rodapé de estação de monta e cobertura por lote", () => {
    expect(getCurralReproRodape("Estação de monta", "", 0)).toContain("exposição");
    expect(getCurralReproRodape("Cobertura realizada", "lote", 0)).toContain("cobertas");
    expect(getCurralReproRodape("Cobertura realizada", "individual", 0)).toContain(
      "cada matriz",
    );
  });
});

describe("curral — sêmen externo só com estoque", () => {
  const gsc = {
    reprodutorKey: "e:gsc-7117",
    reprodutorTexto: "GSC-7117",
    saldoDoses: 20,
  };

  it("mapeia disponível do estoque para a lista do curral", () => {
    const opcao = mapSemenDisponivelParaOpcaoCurral(gsc);
    expect(opcao.reprodutorKey).toBe("e:gsc-7117");
    expect(opcao.reprodutorTexto).toBe("GSC-7117");
    expect(opcao.centralPadrao).toBe("20 doses");
    expect(opcao.ativo).toBe(true);
  });

  it("só aceita reprodutor externo que tem dose", () => {
    expect(reprodutorExternoCurralEstaEmEstoque("GSC-7117", [gsc])).toBe(true);
    expect(reprodutorExternoCurralEstaEmEstoque("KREMEL-063", [gsc])).toBe(false);
    expect(reprodutorExternoCurralEstaEmEstoque("GSC-7117", [{ ...gsc, saldoDoses: 0 }])).toBe(
      false,
    );
  });

  it("IA externa exige partida; touro da fazenda só se tiver estoque", () => {
    expect(
      partidaSemenCurralObrigatoria({
        isInseminacao: true,
        origemExterna: true,
        temPartidasEstoque: false,
      }),
    ).toBe(true);
    expect(
      partidaSemenCurralObrigatoria({
        isInseminacao: true,
        origemExterna: false,
        temPartidasEstoque: false,
      }),
    ).toBe(false);
    expect(
      partidaSemenCurralObrigatoria({
        isInseminacao: true,
        origemExterna: false,
        temPartidasEstoque: true,
      }),
    ).toBe(true);
    expect(
      partidaSemenCurralObrigatoria({
        isInseminacao: false,
        origemExterna: true,
        temPartidasEstoque: true,
      }),
    ).toBe(false);
  });

  it("painel do curral lista só estoque, mostra custo e não pede digitação", () => {
    expect(panelSrc).toContain("listReprodutoresExternosDisponiveis");
    expect(panelSrc).not.toContain("listCatalogoExternos");
    expect(panelSrc).toContain("Custo da dose:");
    expect(panelSrc).toContain("· estoque");
    expect(panelSrc).not.toContain("informe o custo aqui");
    expect(panelSrc).not.toContain("showCustoManualCurral");
    expect(panelSrc).not.toContain("placeholder=\"R$ 0,00\"");
    expect(panelSrc).toContain("MSG_CURRAL_SEMEN_EXTERNO_SEM_ESTOQUE");
    expect(panelSrc).toContain("filterMachosReprodutoresCandidatos");
    expect(panelSrc).toContain("AnimalAutocomplete");
  });
});
