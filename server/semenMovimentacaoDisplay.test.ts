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
  groupSemenHistoricoParaExibicao,
  buildSemenHistoricoVisual,
  sortSemenHistoricoGrupos,
  formatSemenHistoricoCorrecaoLinha,
  isSemenMovimentacaoEstornoTecnico,
} from "../shared/semenMovimentacaoDisplay";
import { SEMEN_MOV_TIPO_ENTRADA, SEMEN_MOV_TIPO_ESTORNO_ENTRADA, SEMEN_MOV_TIPO_SAIDA_IA, SEMEN_MOV_TIPO_AJUSTE_ESTOQUE } from "../shared/semenEstoque";
import { packSemenAjusteObservacoes } from "../shared/semenEstoqueAjuste";
import { packReproObservacoes } from "../shared/reproRegistroMeta";

describe("formatSemenMovimentacaoTipoLabel", () => {
  it("SAIDA_IA → Uso em inseminação", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_SAIDA_IA)).toBe(
      "Uso em inseminação",
    );
  });

  it("AJUSTE_ESTOQUE → Ajuste de estoque, sem código interno", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_AJUSTE_ESTOQUE)).toBe("Ajuste de estoque");
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_AJUSTE_ESTOQUE)).not.toContain("AJUSTE_ESTOQUE");
  });

  it("ENTRADA → Entrada", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_ENTRADA)).toBe("Entrada");
  });

  it("ESTORNO_ENTRADA → Correção de lançamento, sem código interno", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(
      "Correção de lançamento",
    );
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).not.toContain("ESTORNO");
  });

  it("entrada com origem → Entrada corrigida", () => {
    expect(formatSemenMovimentacaoTipoLabel(SEMEN_MOV_TIPO_ENTRADA, 12)).toBe("Entrada corrigida");
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

  it("estorno usa linguagem humana", () => {
    expect(formatSemenMovimentacaoQuantidadeLabel(10, SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(
      "Estorno de 10 doses",
    );
  });
});

describe("groupSemenHistoricoParaExibicao", () => {
  it("agrupa original, estorno e nova entrada", () => {
    const grupos = groupSemenHistoricoParaExibicao([
      {
        id: 1,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        createdAt: "2026-08-20T10:00:00.000Z",
        grupoCorrecaoId: null,
        movimentacaoOrigemId: null,
      },
      {
        id: 2,
        tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
        createdAt: "2026-08-26T10:00:00.000Z",
        grupoCorrecaoId: "g1",
        movimentacaoOrigemId: 1,
      },
      {
        id: 3,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        createdAt: "2026-08-26T10:00:01.000Z",
        grupoCorrecaoId: "g1",
        movimentacaoOrigemId: 1,
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.kind).toBe("correcao");
    if (grupos[0]?.kind === "correcao") {
      expect(grupos[0].original.id).toBe(1);
      expect(grupos[0].estorno.id).toBe(2);
      expect(grupos[0].novaEntrada.id).toBe(3);
    }
  });
});

describe("buildSemenHistoricoVisual", () => {
  const original = {
    id: 1,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    createdAt: "2026-08-25T10:00:00.000Z",
    dataEntrada: "2026-08-25",
    grupoCorrecaoId: null as string | null,
    movimentacaoOrigemId: null as number | null,
    motivoCorrecao: null as string | null,
    custoTotal: "2000.00",
    custoUnitario: "200.00",
    quantidadeDoses: 10,
  };
  const estorno = {
    id: 2,
    tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
    createdAt: "2026-08-26T15:00:00.000Z",
    dataEntrada: "2026-08-26",
    grupoCorrecaoId: "g1",
    movimentacaoOrigemId: 1,
    motivoCorrecao: "Valor da nota informado errado",
    custoTotal: "2000.00",
    custoUnitario: "200.00",
    quantidadeDoses: 10,
  };
  const nova = {
    id: 3,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    createdAt: "2026-08-26T15:00:01.000Z",
    dataEntrada: "2026-08-25",
    grupoCorrecaoId: "g1",
    movimentacaoOrigemId: 1,
    motivoCorrecao: null as string | null,
    custoTotal: "1800.00",
    custoUnitario: "180.00",
    quantidadeDoses: 10,
  };
  const entradaNormal = {
    id: 4,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    createdAt: "2026-08-25T09:00:00.000Z",
    dataEntrada: "2026-08-25",
    grupoCorrecaoId: null as string | null,
    movimentacaoOrigemId: null as number | null,
    motivoCorrecao: null as string | null,
    custoTotal: "1000.00",
    custoUnitario: "100.00",
    quantidadeDoses: 10,
  };
  const saidaIa = {
    id: 5,
    tipo: SEMEN_MOV_TIPO_SAIDA_IA,
    createdAt: "2026-08-24T10:00:00.000Z",
    dataEntrada: "2026-08-24",
    grupoCorrecaoId: null as string | null,
    movimentacaoOrigemId: null as number | null,
    motivoCorrecao: null as string | null,
    custoTotal: "180.00",
    custoUnitario: "180.00",
    quantidadeDoses: 1,
  };

  it("não mostra o estorno técnico como item visual independente", () => {
    const ledger = [original, estorno, nova, entradaNormal];
    const visuais = buildSemenHistoricoVisual(ledger);
    expect(visuais.some(m => isSemenMovimentacaoEstornoTecnico(m.tipo))).toBe(false);
    expect(visuais.map(m => m.id)).not.toContain(2);
    expect(ledger).toHaveLength(4);
    expect(ledger.some(m => m.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(true);
  });

  it("associa motivo e data da correção à entrada original", () => {
    const visuais = buildSemenHistoricoVisual([original, estorno, nova, entradaNormal]);
    const orig = visuais.find(m => m.id === 1);
    expect(orig?.correcaoResumo).toBe(
      "Corrigida em 26/08/2026 · Motivo: Valor da nota informado errado",
    );
    expect(orig?.dataCorrecaoIso).toBe("2026-08-26");
    expect(orig?.motivoCorrecaoExport).toBe("Valor da nota informado errado");
    expect(orig?.custoTotal).toBe("2000.00");
    expect(orig?.custoUnitario).toBe("200.00");
  });

  it("usa a data de auditoria do estorno, não a data operacional da entrada corrigida", () => {
    const visuais = buildSemenHistoricoVisual([original, estorno, nova]);
    const orig = visuais.find(m => m.id === 1);
    expect(orig?.correcaoResumo).toContain("26/08/2026");
    expect(orig?.correcaoResumo).not.toContain("25/08/2026");
  });

  it("mostra a entrada corrigida válida antes da original no mesmo grupo", () => {
    const visuais = buildSemenHistoricoVisual([entradaNormal, estorno, original, nova]);
    expect(visuais.map(m => m.custoTotal)).toEqual(["1800.00", "2000.00", "1000.00"]);
    expect(visuais[0]?.id).toBe(3);
    expect(visuais[1]?.id).toBe(1);
    expect(visuais[1]?.correcaoResumo).toBe(
      "Corrigida em 26/08/2026 · Motivo: Valor da nota informado errado",
    );
    expect(visuais[2]?.id).toBe(4);
  });

  it("mantém grupos de correção distintos unidos", () => {
    const origA = {
      ...original,
      id: 10,
      createdAt: "2026-08-20T10:00:00.000Z",
      dataEntrada: "2026-08-20",
    };
    const estA = {
      ...estorno,
      id: 11,
      grupoCorrecaoId: "gA",
      movimentacaoOrigemId: 10,
      createdAt: "2026-08-22T10:00:00.000Z",
    };
    const novaA = {
      ...nova,
      id: 12,
      grupoCorrecaoId: "gA",
      movimentacaoOrigemId: 10,
      createdAt: "2026-08-22T10:00:01.000Z",
      dataEntrada: "2026-08-20",
      custoTotal: "1800.00",
    };
    const origB = {
      ...original,
      id: 20,
      createdAt: "2026-08-10T10:00:00.000Z",
      dataEntrada: "2026-08-10",
      custoTotal: "500.00",
    };
    const estB = {
      ...estorno,
      id: 21,
      grupoCorrecaoId: "gB",
      movimentacaoOrigemId: 20,
      createdAt: "2026-08-12T10:00:00.000Z",
      motivoCorrecao: "Quantidade digitada incorretamente",
    };
    const novaB = {
      ...nova,
      id: 22,
      grupoCorrecaoId: "gB",
      movimentacaoOrigemId: 20,
      createdAt: "2026-08-12T10:00:01.000Z",
      dataEntrada: "2026-08-10",
      custoTotal: "400.00",
    };

    const visuais = buildSemenHistoricoVisual([novaB, estA, origB, origA, novaA, estB]);
    expect(visuais.map(m => m.id)).toEqual([12, 10, 22, 20]);
    expect(visuais.map(m => m.custoTotal)).toEqual(["1800.00", "2000.00", "400.00", "500.00"]);
  });

  it("ordena globalmente pela data operacional, não pela data da correção", () => {
    const orig = {
      ...original,
      id: 1,
      dataEntrada: "2026-08-20",
      createdAt: "2026-08-20T10:00:00.000Z",
      custoTotal: "400.00",
      custoUnitario: "100.00",
      quantidadeDoses: 4,
    };
    const est = {
      ...estorno,
      id: 2,
      movimentacaoOrigemId: 1,
      createdAt: "2026-08-26T15:00:00.000Z",
      dataEntrada: "2026-08-26",
    };
    const corr = {
      ...nova,
      id: 3,
      dataEntrada: "2026-08-20",
      createdAt: "2026-08-26T15:00:01.000Z",
      custoTotal: "300.00",
      custoUnitario: "75.00",
      quantidadeDoses: 4,
    };
    const recente = {
      ...entradaNormal,
      id: 4,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T09:00:00.000Z",
      custoTotal: "200.00",
      custoUnitario: "100.00",
      quantidadeDoses: 2,
    };
    const antiga = {
      ...entradaNormal,
      id: 6,
      dataEntrada: "2026-08-15",
      createdAt: "2026-08-15T10:00:00.000Z",
      custoTotal: "50.00",
    };

    const visuais = buildSemenHistoricoVisual([orig, est, corr, recente, antiga]);
    expect(visuais.map(m => `${m.dataEntrada}:${m.custoTotal}`)).toEqual([
      "2026-08-26:200.00",
      "2026-08-20:300.00",
      "2026-08-20:400.00",
      "2026-08-15:50.00",
    ]);
  });

  it("não sobe o grupo para a data em que a correção foi executada", () => {
    const orig = {
      ...original,
      dataEntrada: "2026-08-01",
      createdAt: "2026-08-01T10:00:00.000Z",
    };
    const est = {
      ...estorno,
      createdAt: "2026-08-26T18:00:00.000Z",
      dataEntrada: "2026-08-26",
    };
    const corr = {
      ...nova,
      dataEntrada: "2026-08-01",
      createdAt: "2026-08-26T18:00:01.000Z",
    };
    const hoje = {
      ...entradaNormal,
      id: 9,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T08:00:00.000Z",
      custoTotal: "10.00",
    };
    const visuais = buildSemenHistoricoVisual([orig, est, corr, hoje]);
    expect(visuais.map(m => m.id)).toEqual([9, 3, 1]);
  });

  it("ordena o grupo pela data operacional corrigida quando a data muda", () => {
    const orig = {
      ...original,
      dataEntrada: "2026-08-20",
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    const est = { ...estorno, createdAt: "2026-08-26T12:00:00.000Z" };
    const corr = {
      ...nova,
      dataEntrada: "2026-08-18",
      createdAt: "2026-08-26T12:00:01.000Z",
    };
    const entre = {
      ...entradaNormal,
      id: 8,
      dataEntrada: "2026-08-19",
      createdAt: "2026-08-19T10:00:00.000Z",
      custoTotal: "90.00",
    };
    const visuais = buildSemenHistoricoVisual([orig, est, corr, entre]);
    expect(visuais.map(m => m.id)).toEqual([8, 3, 1]);
    expect(visuais[1]?.dataEntrada).toBe("2026-08-18");
    expect(visuais[2]?.dataEntrada).toBe("2026-08-20");
  });

  it("coloca uso em inseminação na ordenação por data operacional", () => {
    const orig = { ...original, dataEntrada: "2026-08-20", createdAt: "2026-08-20T10:00:00.000Z" };
    const est = { ...estorno, createdAt: "2026-08-26T15:00:00.000Z" };
    const corr = { ...nova, dataEntrada: "2026-08-20", createdAt: "2026-08-26T15:00:01.000Z" };
    const ia = {
      ...saidaIa,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T11:00:00.000Z",
    };
    const visuais = buildSemenHistoricoVisual([orig, est, corr, ia]);
    expect(visuais.map(m => m.id)).toEqual([5, 3, 1]);
    expect(visuais[0]?.tipo).toBe(SEMEN_MOV_TIPO_SAIDA_IA);
  });

  it("desempate na mesma data é estável independente da ordem de entrada", () => {
    const a = { ...entradaNormal, id: 31, dataEntrada: "2026-08-20", createdAt: "2026-08-20T12:00:00.000Z", custoTotal: "31.00" };
    const b = { ...entradaNormal, id: 32, dataEntrada: "2026-08-20", createdAt: "2026-08-20T08:00:00.000Z", custoTotal: "32.00" };
    const primeiro = buildSemenHistoricoVisual([a, b]).map(m => m.id);
    const segundo = buildSemenHistoricoVisual([b, a]).map(m => m.id);
    expect(primeiro).toEqual([31, 32]);
    expect(segundo).toEqual([31, 32]);
  });

  it("mantém SAIDA_IA visível", () => {
    const visuais = buildSemenHistoricoVisual([original, estorno, nova, saidaIa]);
    expect(visuais.some(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA && m.id === 5)).toBe(true);
  });

  it("não altera saldo/custo das linhas e não muta o ledger", () => {
    const ledger = [original, estorno, nova];
    const snapshot = JSON.stringify(ledger);
    const visuais = buildSemenHistoricoVisual(ledger);
    expect(JSON.stringify(ledger)).toBe(snapshot);
    expect(visuais.find(m => m.id === 1)?.quantidadeDoses).toBe(10);
    expect(visuais.find(m => m.id === 3)?.custoUnitario).toBe("180.00");
  });

  it("motivo Outro usa a descrição humana quando existir", () => {
    const visuais = buildSemenHistoricoVisual([
      original,
      { ...estorno, motivoCorrecao: "Conferência posterior da nota fiscal" },
      nova,
    ]);
    expect(visuais.find(m => m.id === 1)?.correcaoResumo).toBe(
      "Corrigida em 26/08/2026 · Motivo: Conferência posterior da nota fiscal",
    );
    expect(visuais.find(m => m.id === 1)?.correcaoResumo).not.toContain("Outro");
  });

  const cenarioTelaRelatorio = () => {
    const antiga = {
      ...entradaNormal,
      id: 6,
      dataEntrada: "2026-08-15",
      createdAt: "2026-08-15T10:00:00.000Z",
      custoTotal: "50.00",
    };
    const orig = {
      ...original,
      dataEntrada: "2026-08-20",
      createdAt: "2026-08-20T10:00:00.000Z",
      custoTotal: "400.00",
    };
    const est = { ...estorno, createdAt: "2026-08-26T15:00:00.000Z", dataEntrada: "2026-08-26" };
    const corr = {
      ...nova,
      dataEntrada: "2026-08-20",
      createdAt: "2026-08-26T15:00:01.000Z",
      custoTotal: "300.00",
    };
    const entrada26 = {
      ...entradaNormal,
      id: 7,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T09:00:00.000Z",
      custoTotal: "200.00",
    };
    const ia = {
      ...saidaIa,
      id: 8,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T11:00:00.000Z",
    };
    return [antiga, orig, est, corr, entrada26, ia] as const;
  };

  it("tela DESC: mais recente primeiro, grupo unido, corrigida antes da original (Teste A)", () => {
    const visuais = buildSemenHistoricoVisual(cenarioTelaRelatorio(), { ordem: "desc" });
    expect(visuais.map(m => m.id)).toEqual([8, 7, 3, 1, 6]);
    expect(visuais.map(m => formatSemenMovimentacaoTipoLabel(m.tipo, m.movimentacaoOrigemId))).toEqual([
      "Uso em inseminação",
      "Entrada",
      "Entrada corrigida",
      "Entrada",
      "Entrada",
    ]);
    expect(visuais[2]?.dataEntrada).toBe("2026-08-20");
    expect(visuais[3]?.dataEntrada).toBe("2026-08-20");
    expect(visuais[3]?.correcaoResumo).toContain("Corrigida em 26/08/2026");
  });

  it("relatório ASC: mais antigo primeiro, mesmos dados e labels (Teste B)", () => {
    const ledger = cenarioTelaRelatorio();
    const tela = buildSemenHistoricoVisual(ledger, { ordem: "desc" });
    const relatorio = buildSemenHistoricoVisual(ledger, { ordem: "asc" });
    expect(relatorio.map(m => m.id)).toEqual([6, 3, 1, 7, 8]);
    expect(relatorio.map(m => formatSemenMovimentacaoTipoLabel(m.tipo, m.movimentacaoOrigemId))).toEqual([
      "Entrada",
      "Entrada corrigida",
      "Entrada",
      "Entrada",
      "Uso em inseminação",
    ]);
    expect([...relatorio.map(m => m.id)].sort()).toEqual([...tela.map(m => m.id)].sort());
    expect(relatorio.some(m => isSemenMovimentacaoEstornoTecnico(m.tipo))).toBe(false);
    expect(ledger.some(m => m.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(true);
  });

  it("ASC também posiciona o grupo pela data operacional, não pela execução da correção (Teste C)", () => {
    const orig = { ...original, dataEntrada: "2026-08-20", createdAt: "2026-08-20T10:00:00.000Z" };
    const est = { ...estorno, createdAt: "2026-08-26T15:00:00.000Z", dataEntrada: "2026-08-26" };
    const corr = { ...nova, dataEntrada: "2026-08-20", createdAt: "2026-08-26T15:00:01.000Z" };
    const recente = {
      ...entradaNormal,
      id: 4,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T09:00:00.000Z",
    };
    const visuais = buildSemenHistoricoVisual([orig, est, corr, recente], { ordem: "asc" });
    expect(visuais.map(m => m.id)).toEqual([3, 1, 4]);
    expect(visuais[0]?.dataEntrada).toBe("2026-08-20");
    expect(visuais[1]?.dataEntrada).toBe("2026-08-20");
  });

  it("correção de data posiciona o grupo na data válida nova em DESC e ASC (Teste D)", () => {
    const orig = { ...original, dataEntrada: "2026-08-20", createdAt: "2026-08-20T10:00:00.000Z" };
    const est = { ...estorno, createdAt: "2026-08-26T12:00:00.000Z" };
    const corr = { ...nova, dataEntrada: "2026-08-18", createdAt: "2026-08-26T12:00:01.000Z" };
    const entre = {
      ...entradaNormal,
      id: 8,
      dataEntrada: "2026-08-19",
      createdAt: "2026-08-19T10:00:00.000Z",
      custoTotal: "90.00",
    };
    const ledger = [orig, est, corr, entre];
    expect(buildSemenHistoricoVisual(ledger, { ordem: "desc" }).map(m => m.id)).toEqual([8, 3, 1]);
    expect(buildSemenHistoricoVisual(ledger, { ordem: "asc" }).map(m => m.id)).toEqual([3, 1, 8]);
    const asc = buildSemenHistoricoVisual(ledger, { ordem: "asc" });
    expect(asc[0]?.dataEntrada).toBe("2026-08-18");
    expect(asc[1]?.dataEntrada).toBe("2026-08-20");
  });

  it("desempate ASC na mesma data também é estável (Teste E)", () => {
    const a = { ...entradaNormal, id: 31, dataEntrada: "2026-08-20", createdAt: "2026-08-20T12:00:00.000Z" };
    const b = { ...entradaNormal, id: 32, dataEntrada: "2026-08-20", createdAt: "2026-08-20T08:00:00.000Z" };
    expect(buildSemenHistoricoVisual([a, b], { ordem: "asc" }).map(m => m.id)).toEqual([32, 31]);
    expect(buildSemenHistoricoVisual([b, a], { ordem: "asc" }).map(m => m.id)).toEqual([32, 31]);
  });

  it("ASC não separa entrada corrigida da original (Teste F)", () => {
    const visuais = buildSemenHistoricoVisual(cenarioTelaRelatorio(), { ordem: "asc" });
    const idxCorr = visuais.findIndex(m => m.id === 3);
    const idxOrig = visuais.findIndex(m => m.id === 1);
    expect(idxCorr).toBeGreaterThanOrEqual(0);
    expect(idxOrig).toBe(idxCorr + 1);
  });

  it("ASC também oculta o estorno técnico (Teste G)", () => {
    const ledger = [...cenarioTelaRelatorio()];
    const visuais = buildSemenHistoricoVisual(ledger, { ordem: "asc" });
    expect(visuais.some(m => isSemenMovimentacaoEstornoTecnico(m.tipo))).toBe(false);
    expect(ledger.some(m => m.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(true);
  });

  it("sortSemenHistoricoGrupos não muta o array de grupos", () => {
    const grupos = groupSemenHistoricoParaExibicao([...cenarioTelaRelatorio()]);
    const snapshot = JSON.stringify(grupos);
    const sorted = sortSemenHistoricoGrupos(grupos, "asc");
    expect(JSON.stringify(grupos)).toBe(snapshot);
    expect(sorted).not.toBe(grupos);
  });
});

describe("formatSemenHistoricoCorrecaoLinha", () => {
  it("monta data e motivo", () => {
    expect(formatSemenHistoricoCorrecaoLinha("2026-08-26", "Lançamento duplicado")).toBe(
      "Corrigida em 26/08/2026 · Motivo: Lançamento duplicado",
    );
  });
});

describe("histórico visual do Ajuste de estoque", () => {
  it("P-10FAZ: tela mostra só custo/dose e motivo, sem saldo 6→6 nem valor", () => {
    const visuais = buildSemenHistoricoVisual(
      [
        {
          id: 9,
          tipo: SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
          dataEntrada: "2026-08-26",
          createdAt: "2026-08-26T15:00:00.000Z",
          quantidadeDoses: 6,
          custoTotal: "540.00",
          custoUnitario: "90.00",
          motivoCorrecao: "Correção de valor histórico",
          observacoes: packSemenAjusteObservacoes({
            saldoAnterior: 6,
            saldoNovo: 6,
            custoMedioAnterior: "100.00",
            custoMedioNovo: "90.00",
            valorAnterior: 2800,
            valorNovo: 540,
            observacao: null,
          }),
        },
      ],
      { ordem: "desc" },
    );
    const ajuste = visuais[0];
    expect(ajuste?.ajusteResumoTela?.linhaMudancas).toBe("Custo/dose: R$ 100,00 → R$ 90,00");
    expect(ajuste?.motivoCorrecaoExport).toBe("Correção de valor histórico");
    expect(ajuste?.ajusteResumoTela?.linhaMudancas).not.toContain("Saldo");
    expect(ajuste?.ajusteResumoTela?.linhaMudancas).not.toContain("2.800");
    expect(ajuste?.ajusteLinhas?.valor).toContain("2.800");
  });
});
