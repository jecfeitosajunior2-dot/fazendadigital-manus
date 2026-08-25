import { describe, expect, it } from "vitest";
import {
  buildSemenMovimentacaoDisplay,
  buildSemenMovimentacoesDisplay,
  buildSemenReproContextMapsFromRows,
  collectSemenMovimentacaoReproRegistroIds,
  formatSemenMovimentacaoContexto,
  formatSemenMovimentacaoQuantidadeLabel,
  formatSemenMovimentacaoTipoLabel,
  parseSemenMovimentacaoReproRegistroId,
  shouldShowSemenMovimentacaoCustoTotal,
} from "../shared/semenMovimentacaoDisplay";
import { SEMEN_MOV_TIPO_ENTRADA, SEMEN_MOV_TIPO_SAIDA_IA } from "../shared/semenEstoque";
import { packReproObservacoes } from "../shared/reproRegistroMeta";

describe("formatSemenMovimentacaoTipoLabel", () => {
  it("SAIDA_IA → Uso em inseminação", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_SAIDA_IA)).toBe(
      "Uso em inseminação",
    );
  });

  it("ENTRADA → Entrada", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_ENTRADA)).toBe("Entrada");
  });
});

describe("shouldShowSemenMovimentacaoCustoTotal", () => {
  it("entrada mostra custo total", () => {
    expect(shouldShowSemenMovimentacaoCustoTotal(SEMEN_MOV_TIPO_ENTRADA)).toBe(true);
  });

  it("uso em inseminação não mostra custo total", () => {
    expect(shouldShowSemenMovimentacaoCustoTotal(SEMEN_MOV_TIPO_SAIDA_IA)).toBe(false);
  });
});

describe("formatSemenMovimentacaoContexto", () => {
  it("com inseminador", () => {
    expect(
      formatSemenMovimentacaoContexto({ matrizBrinco: "58", inseminador: "João" }),
    ).toBe("Matriz 58 · Inseminador João");
  });

  it("sem inseminador", () => {
    expect(formatSemenMovimentacaoContexto({ matrizBrinco: "58" })).toBe("Matriz 58");
  });
});

describe("buildSemenMovimentacaoDisplay", () => {
  const reproById = new Map([
    [
      27,
      {
        femeaId: 15,
        inseminador: "João",
      },
    ],
  ]);
  const brincoByAnimalId = new Map([[15, "58"]]);

  it("SAIDA_IA com vínculo estrutural → Matriz 58 · Inseminador João", () => {
    const display = buildSemenMovimentacaoDisplay(
      {
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        quantidadeDoses: 1,
        observacoes: "Inseminação — matriz #15 · registro repro #27",
      },
      reproById,
      brincoByAnimalId,
    );

    expect(display.tipoLabel).toBe("Uso em inseminação");
    expect(display.quantidadeLabel).toBe("1 dose");
    expect(display.contextoDisplay).toBe("Matriz 58 · Inseminador João");
    expect(display.contextoDisplay).not.toContain("#15");
    expect(display.contextoDisplay).not.toContain("#27");
  });

  it("sem inseminador → Matriz 58", () => {
    const reproSemInseminador = new Map([[27, { femeaId: 15, inseminador: null }]]);
    const display = buildSemenMovimentacaoDisplay(
      {
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        quantidadeDoses: 1,
        observacoes: "Inseminação — matriz #15 · registro repro #27",
      },
      reproSemInseminador,
      brincoByAnimalId,
    );
    expect(display.contextoDisplay).toBe("Matriz 58");
  });

  it("legado sem vínculo → sem contexto e sem PK na UI", () => {
    const display = buildSemenMovimentacaoDisplay(
      {
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        quantidadeDoses: 1,
        observacoes: "texto legado sem referência",
      },
      reproById,
      brincoByAnimalId,
    );
    expect(display.tipoLabel).toBe("Uso em inseminação");
    expect(display.contextoDisplay).toBeNull();
  });

  it("ENTRADA não gera contexto", () => {
    const display = buildSemenMovimentacaoDisplay(
      { tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 15 },
      reproById,
      brincoByAnimalId,
    );
    expect(display.tipoLabel).toBe("Entrada");
    expect(display.contextoDisplay).toBeNull();
  });
});

describe("collectSemenMovimentacaoReproRegistroIds", () => {
  it("coleta IDs únicos para enriquecimento em batch", () => {
    expect(
      collectSemenMovimentacaoReproRegistroIds([
        {
          tipo: SEMEN_MOV_TIPO_SAIDA_IA,
          observacoes: "Inseminação — matriz #15 · registro repro #27",
        },
        {
          tipo: SEMEN_MOV_TIPO_SAIDA_IA,
          observacoes: "Inseminação — matriz #20 · registro repro #27",
        },
        { tipo: SEMEN_MOV_TIPO_ENTRADA, observacoes: null },
      ]),
    ).toEqual([27]);
  });
});

describe("buildSemenReproContextMapsFromRows", () => {
  it("monta mapas a partir de registros e animais", () => {
    const observacoes = packReproObservacoes(null, undefined, undefined, undefined, undefined, {
      inseminador: "João",
    });
    const { reproById, brincoByAnimalId } = buildSemenReproContextMapsFromRows({
      registros: [{ id: 27, femeaId: 15, observacoes }],
      animais: [{ id: 15, brinco: "58" }],
    });
    expect(reproById.get(27)).toEqual({ femeaId: 15, inseminador: "João" });
    expect(brincoByAnimalId.get(15)).toBe("58");
  });
});

describe("buildSemenMovimentacoesDisplay", () => {
  it("enriquece várias movimentações sem repetir lógica", () => {
    const reproById = new Map([[27, { femeaId: 15, inseminador: "João" }]]);
    const brincoByAnimalId = new Map([[15, "58"]]);
    const rows = buildSemenMovimentacoesDisplay(
      [
        {
          id: 1,
          tipo: SEMEN_MOV_TIPO_SAIDA_IA,
          quantidadeDoses: 1,
          observacoes: "Inseminação — matriz #15 · registro repro #27",
        },
      ],
      reproById,
      brincoByAnimalId,
    );
    expect(rows[0]?.contextoDisplay).toBe("Matriz 58 · Inseminador João");
  });
});

describe("parseSemenMovimentacaoReproRegistroId", () => {
  it("extrai repro id da referência técnica persistida", () => {
    expect(parseSemenMovimentacaoReproRegistroId("Inseminação — matriz #15 · registro repro #27")).toBe(
      27,
    );
  });
});

describe("formatSemenMovimentacaoQuantidadeLabel", () => {
  it("singular e plural", () => {
    expect(formatSemenMovimentacaoQuantidadeLabel(1)).toBe("1 dose");
    expect(formatSemenMovimentacaoQuantidadeLabel(2)).toBe("2 doses");
  });
});
