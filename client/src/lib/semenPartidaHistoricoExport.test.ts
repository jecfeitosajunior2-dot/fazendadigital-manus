import { describe, expect, it } from "vitest";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
} from "@shared/semenEstoque";
import { buildSemenHistoricoVisual } from "@shared/semenMovimentacaoDisplay";
import {
  SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS,
  appendSemenPartidaHistoricoExportFooter,
  buildSemenPartidaHistoricoExportRows,
  buildSemenPartidaHistoricoExportTitle,
  semenPartidaHistoricoExportDisabled,
  semenPartidaHistoricoExportDisabledTitle,
  semenPartidaHistoricoExportFilenameBase,
} from "./semenPartidaHistoricoExport";

const original = {
  id: 1,
  tipo: SEMEN_MOV_TIPO_ENTRADA,
  tipoLabel: "Entrada",
  quantidadeLabel: "4 doses",
  createdAt: "2026-08-20T10:00:00.000Z",
  dataEntrada: "2026-08-20",
  grupoCorrecaoId: "g1" as string | null,
  movimentacaoOrigemId: null as number | null,
  motivoCorrecao: null as string | null,
  custoTotal: "400.00",
  custoUnitario: "100.00",
  quantidadeDoses: 4,
  jaCorrigida: true,
  contextoDisplay: null as string | null,
};
const estorno = {
  id: 2,
  tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  tipoLabel: "Correção de lançamento",
  quantidadeLabel: "Estorno de 4 doses",
  createdAt: "2026-08-26T15:00:00.000Z",
  dataEntrada: "2026-08-26",
  grupoCorrecaoId: "g1" as string | null,
  movimentacaoOrigemId: 1 as number | null,
  motivoCorrecao: "Valor da nota informado errado",
  custoTotal: "400.00",
  custoUnitario: "100.00",
  quantidadeDoses: 4,
  jaCorrigida: false,
  contextoDisplay: null as string | null,
};
const nova = {
  id: 3,
  tipo: SEMEN_MOV_TIPO_ENTRADA,
  tipoLabel: "Entrada corrigida",
  quantidadeLabel: "4 doses",
  createdAt: "2026-08-26T15:00:01.000Z",
  dataEntrada: "2026-08-20",
  grupoCorrecaoId: "g1" as string | null,
  movimentacaoOrigemId: 1 as number | null,
  motivoCorrecao: null as string | null,
  custoTotal: "300.00",
  custoUnitario: "75.00",
  quantidadeDoses: 4,
  jaCorrigida: false,
  contextoDisplay: null as string | null,
};
const recente = {
  id: 4,
  tipo: SEMEN_MOV_TIPO_ENTRADA,
  tipoLabel: "Entrada",
  quantidadeLabel: "2 doses",
  createdAt: "2026-08-26T09:00:00.000Z",
  dataEntrada: "2026-08-26",
  grupoCorrecaoId: null as string | null,
  movimentacaoOrigemId: null as number | null,
  motivoCorrecao: null as string | null,
  custoTotal: "200.00",
  custoUnitario: "100.00",
  quantidadeDoses: 2,
  jaCorrigida: false,
  contextoDisplay: null as string | null,
};

const saidaIa = {
  id: 5,
  tipo: SEMEN_MOV_TIPO_SAIDA_IA,
  tipoLabel: "Uso em inseminação",
  quantidadeLabel: "1 dose",
  createdAt: "2026-08-19T11:00:00.000Z",
  dataEntrada: "2026-08-19",
  grupoCorrecaoId: null as string | null,
  movimentacaoOrigemId: null as number | null,
  motivoCorrecao: null as string | null,
  custoTotal: "150.00",
  custoUnitario: "150.00",
  quantidadeDoses: 1,
  jaCorrigida: false,
  contextoDisplay: "Matriz 58 · Inseminador João" as string | null,
};

function visuaisExport(movimentacoes: Parameters<typeof buildSemenHistoricoVisual>[0]) {
  return buildSemenHistoricoVisual(movimentacoes, { ordem: "asc" });
}

function textoArquivo(rows: (string | number)[][]): string {
  return [...SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS, ...rows.flat()].map(String).join(" | ");
}

describe("exportação do histórico da partida", () => {
  it("P-10FAZ: relatório cronológico ASC (grupo 20/08, depois 26/08)", () => {
    const visuais = visuaisExport([original, estorno, nova, recente]);
    const rows = buildSemenPartidaHistoricoExportRows(visuais);

    expect(rows.map(r => `${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[4]}`)).toEqual([
      "20/08/2026|Entrada corrigida|4 doses|75|300",
      "20/08/2026|Entrada|4 doses|100|400",
      "26/08/2026|Entrada|2 doses|100|200",
    ]);
    expect(rows[1]?.[5]).toBe("Corrigida");
    expect(rows[1]?.[6]).toBe("26/08/2026");
    expect(rows[1]?.[7]).toBe("Valor da nota informado errado");
    expect(rows[0]?.[5]).toBe("—");
    expect(rows[2]?.[5]).toBe("—");
  });

  it("Teste B: 15/08 → grupo 20/08 → 26/08 entrada → 26/08 uso em inseminação", () => {
    const antiga = {
      ...recente,
      id: 6,
      dataEntrada: "2026-08-15",
      createdAt: "2026-08-15T10:00:00.000Z",
      tipoLabel: "Entrada",
      quantidadeLabel: "1 dose",
      custoTotal: "50.00",
      custoUnitario: "50.00",
      quantidadeDoses: 1,
    };
    const ia = {
      ...saidaIa,
      id: 8,
      dataEntrada: "2026-08-26",
      createdAt: "2026-08-26T11:00:00.000Z",
    };
    const visuais = visuaisExport([antiga, original, estorno, nova, recente, ia]);
    const rows = buildSemenPartidaHistoricoExportRows(visuais);
    expect(rows.map(r => `${r[0]}|${r[1]}`)).toEqual([
      "15/08/2026|Entrada",
      "20/08/2026|Entrada corrigida",
      "20/08/2026|Entrada",
      "26/08/2026|Entrada",
      "26/08/2026|Uso em inseminação",
    ]);
    expect(rows[4]?.[8]).toBe("Matriz 58 · Inseminador João");
  });

  it("não exporta ESTORNO_ENTRADA como linha", () => {
    const visuais = visuaisExport([original, estorno, nova, recente]);
    const rows = buildSemenPartidaHistoricoExportRows(visuais);
    const blob = textoArquivo(rows);
    expect(visuais.some(m => m.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(false);
    expect(blob).not.toContain("ESTORNO_ENTRADA");
    expect(blob).not.toContain("ESTORNO");
    expect(rows).toHaveLength(3);
  });

  it("Uso em inseminação usa nome humano e contexto, sem IDs técnicos", () => {
    const visuais = visuaisExport([original, estorno, nova, saidaIa]);
    const rows = buildSemenPartidaHistoricoExportRows(visuais);
    const ia = rows.find(r => String(r[1]).includes("inseminação"));
    expect(ia?.[1]).toBe("Uso em inseminação");
    expect(ia?.[2]).toBe("1 dose");
    expect(ia?.[3]).toBe(150);
    expect(ia?.[4]).toBe("");
    expect(ia?.[8]).toBe("Matriz 58 · Inseminador João");

    const blob = textoArquivo(rows);
    expect(blob).not.toContain("SAIDA_IA");
    expect(blob).not.toContain("animalId");
    expect(blob).not.toContain("userId");
    expect(blob).not.toContain("movimentacaoId");
    expect(blob).not.toContain("semenPartidaId");
  });

  it("motivo Outro exporta a descrição humana", () => {
    const visuais = visuaisExport([
      original,
      { ...estorno, motivoCorrecao: "Conferência posterior da nota fiscal" },
      nova,
    ]);
    const rows = buildSemenPartidaHistoricoExportRows(visuais);
    const orig = rows.find(r => r[5] === "Corrigida");
    expect(orig?.[7]).toBe("Conferência posterior da nota fiscal");
    expect(String(orig?.[7])).not.toBe("Outro");
  });

  it("usa o consolidado financeiro do ledger no rodapé, sem 3 × 83,33", () => {
    const visuais = visuaisExport([original, estorno, nova, recente]);
    const rowsSeisDoses = appendSemenPartidaHistoricoExportFooter(
      buildSemenPartidaHistoricoExportRows(visuais),
      { partida: "P-10FAZ", saldoDoses: 6, custoUnitario: "83.33" },
      [original, estorno, nova, recente],
    );
    expect(rowsSeisDoses[rowsSeisDoses.length - 1]?.[4]).toBe(500);

    const saidas = [5, 6, 7].map(id => ({
      ...saidaIa,
      id,
      createdAt: `2026-08-26T16:00:0${id}.000Z`,
      dataEntrada: "2026-08-26",
      custoTotal: "83.33",
      custoUnitario: "83.33",
    }));
    const rowsTresDoses = appendSemenPartidaHistoricoExportFooter(
      buildSemenPartidaHistoricoExportRows(visuais),
      { partida: "P-10FAZ", saldoDoses: 3, custoUnitario: "83.33" },
      [original, estorno, nova, recente, ...saidas],
    );
    const footer = rowsTresDoses[rowsTresDoses.length - 1];
    expect(footer?.[0]).toBe("Valor atual em estoque");
    expect(footer?.[2]).toBe("3 doses");
    expect(footer?.[3]).toBe(83.33);
    expect(footer?.[4]).toBe(250);
    expect(footer?.[4]).not.toBe(249.99);
    expect(buildSemenPartidaHistoricoExportTitle({ fazendaNome: "Fazenda J", partida: "P-10FAZ" })).toBe(
      "Fazenda J — Histórico de sêmen — P-10FAZ",
    );
  });

  it("I) Ajuste de estoque entra na ordem ASC, com Contexto humano e sem JSON", () => {
    const ajuste = {
      id: 9,
      tipo: SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
      tipoLabel: "Ajuste de estoque",
      quantidadeLabel: "6 → 6 doses",
      createdAt: "2026-08-26T18:00:00.000Z",
      dataEntrada: "2026-08-26",
      grupoCorrecaoId: null as string | null,
      movimentacaoOrigemId: null as number | null,
      motivoCorrecao: "Correção de valor histórico",
      motivoCorrecaoExport: "Correção de valor histórico",
      custoTotal: "540.00",
      custoUnitario: "90.00",
      quantidadeDoses: 6,
      jaCorrigida: false,
      contextoDisplay:
        "Saldo 6→6 · Custo médio R$ 138,89→R$ 90,00 · Valor R$ 833,34→R$ 540,00" as string | null,
    };
    const visuais = visuaisExport([original, estorno, nova, recente, ajuste]);
    const rows = buildSemenPartidaHistoricoExportRows(visuais);
    expect(rows.map(r => String(r[1]))).toEqual([
      "Entrada corrigida",
      "Entrada",
      "Entrada",
      "Ajuste de estoque",
    ]);
    const linha = rows[rows.length - 1];
    expect(linha?.[5]).toBe("—");
    expect(linha?.[7]).toBe("Correção de valor histórico");
    expect(linha?.[8]).toContain("Saldo 6→6");
    expect(linha?.[8]).toContain("R$ 90,00");
    const blob = textoArquivo(rows);
    expect(blob).not.toContain("AJUSTE_ESTOQUE");
    expect(blob).not.toContain("__fd_semen_ajuste");
    expect(blob).not.toContain("FIFO");
  });

  it("nome do arquivo identifica a partida", () => {
    expect(semenPartidaHistoricoExportFilenameBase("P-10FAZ")).toBe("historico-semen-p-10faz");
    expect(semenPartidaHistoricoExportFilenameBase("P-10FAZ")).not.toBe("export");
  });

  it("sem movimentações exportáveis desabilita o botão", () => {
    expect(buildSemenPartidaHistoricoExportRows([])).toEqual([]);
    expect(semenPartidaHistoricoExportDisabled({ loading: false, totalItems: 0 })).toBe(true);
    expect(semenPartidaHistoricoExportDisabledTitle({ totalItems: 0 })).toBe(
      "Nenhuma movimentação para exportar.",
    );
  });

  it("cabeçalhos operacionais da tabela", () => {
    expect([...SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS]).toEqual([
      "Data",
      "Tipo",
      "Quantidade",
      "Custo por dose",
      "Custo total",
      "Situação",
      "Data da correção",
      "Motivo da correção",
      "Contexto",
    ]);
    expect(SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS[8]).toBe("Contexto");
    expect(SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS[8]).not.toBe("ntexto");
    expect("Contexto".slice(2)).toBe("ntexto");
  });

  it("gera a célula de cabeçalho Contexto por extenso, sem quebrar em ntexto", async () => {
    const { buildExportSpreadsheetWorkbook } = await import("@shared/buildExportSpreadsheet");
    const visuais = visuaisExport([original, estorno, nova, recente]);
    const rows = appendSemenPartidaHistoricoExportFooter(
      buildSemenPartidaHistoricoExportRows(visuais),
      { partida: "P-10FAZ", saldoDoses: 6, custoUnitario: "83.33" },
      [original, estorno, nova, recente],
    );
    const wb = await buildExportSpreadsheetWorkbook(
      [...SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS],
      rows,
      {
        reportTitle: "Histórico de sêmen — P-10FAZ",
        blankAfterMeta: false,
        autoFilter: false,
        plainHeader: true,
        headerWrapText: false,
        columnWidths: [12, 22, 14, 16, 14, 14, 16, 28, 28],
        footerRowCount: 1,
        sheetName: "Histórico da partida",
      },
    );
    const ws = wb.getWorksheet("Histórico da partida")!;
    expect(ws.getCell("I2").value).toBe("Contexto");
    expect(String(ws.getCell("I2").value)).not.toBe("ntexto");
    expect(ws.getColumn(9).width).toBeGreaterThanOrEqual(18);
    expect(ws.getCell("I2").alignment?.wrapText).toBe(false);
  });
});
