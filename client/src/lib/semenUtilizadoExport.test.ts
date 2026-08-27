import { describe, expect, it } from "vitest";
import {
  SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS,
  SEMEN_UTILIZADO_DETALHE_EXPORT_CURRENCY_COLS,
  SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS,
  SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL,
  SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS,
  SEMEN_UTILIZADO_EXPORT_HEADERS,
  SEMEN_UTILIZADO_EXPORT_TOTAIS_LABEL,
  SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS,
  buildSemenUtilizadoDetalheExcelRows,
  buildSemenUtilizadoDetalheExportIdentificacao,
  buildSemenUtilizadoDetalheExportRows,
  buildSemenUtilizadoDetalheExportTitle,
  buildSemenUtilizadoDetalheTotalGeralRow,
  buildSemenUtilizadoExportRows,
  isSemenUtilizadoDetalheTotalGeralRow,
  isSemenUtilizadoExportTotaisRow,
  semenUtilizadoDetalheExportFilenameBase,
  semenUtilizadoExportFilenameBase,
} from "./semenUtilizadoExport";
import { SEMEN_ORIGEM_EXTERNO } from "@shared/semenEstoque";
import { calcularSemenUtilizadoTotalGeral, type SemenUtilizadoGrupo, type SemenUtilizadoUso } from "@shared/semenUtilizado";
import { EXCEL_FMT_MOEDA_BRL } from "@shared/parseMoedaBr";

const grupo: SemenUtilizadoGrupo = {
  key: "externo|e:gsc-7117|P-01",
  origem: SEMEN_ORIGEM_EXTERNO,
  machoId: null,
  reprodutorKey: "e:gsc-7117",
  reprodutorDisplay: "GSC-7117",
  partida: "P-01",
  central: "Alta",
  dosesUtilizadas: 3,
  matrizes: 2,
  custoMedioUso: 100,
  custoTotalUtilizado: 300,
  usosComCusto: 3,
  usosSemCusto: 0,
  ultimoUso: "2026-08-26",
  ultimoRegistroId: 3,
};

describe("exportação Sêmen utilizado", () => {
  it("teste J — listagem exporta utilização e custos, sem inventário", () => {
    const headers = SEMEN_UTILIZADO_EXPORT_HEADERS.join(" ");
    expect(headers).toContain("Doses utilizadas");
    expect(headers).toContain("Custo médio");
    expect(headers).toContain("Custo total");
    expect(headers).not.toContain("Custo médio/uso");
    expect(headers).not.toContain("Custo total utilizado");
    expect(headers).not.toContain("Saldo");
    expect(headers).not.toContain("Valor em estoque");
    expect(headers).not.toContain("Ajuste");
    expect(headers).not.toContain("ESTORNO");

    const rows = buildSemenUtilizadoExportRows([grupo]);
    expect(rows[0]).toEqual(["GSC-7117", "P-01", "Alta", 3, 2, 100, 300, "26/08/2026"]);
    expect(rows[1]).toEqual([SEMEN_UTILIZADO_EXPORT_TOTAIS_LABEL, "", "", "", "", "", 300, ""]);
    expect(isSemenUtilizadoExportTotaisRow(rows[1]!)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("Saldo");
    expect(JSON.stringify(rows)).not.toContain("ESTORNO_ENTRADA");
  });

  it("custo ausente não vira zero na média nem no total", () => {
    const rows = buildSemenUtilizadoExportRows([
      { ...grupo, custoMedioUso: null, custoTotalUtilizado: null, usosComCusto: 0, usosSemCusto: 3 },
    ]);
    expect(rows[0]?.[5]).toBe("—");
    expect(rows[0]?.[6]).toBe("—");
    expect(rows[0]?.[5]).not.toBe(0);
    expect(rows[0]?.[6]).not.toBe(0);
  });

  it("exporta soma real dos snapshots, não doses × média arredondada", () => {
    const rows = buildSemenUtilizadoExportRows([
      {
        ...grupo,
        dosesUtilizadas: 4,
        matrizes: 4,
        custoMedioUso: 85,
        custoTotalUtilizado: 339.99,
        usosComCusto: 4,
        usosSemCusto: 0,
      },
    ]);
    expect(rows[0]?.[5]).toBe(85);
    expect(rows[0]?.[6]).toBe(339.99);
    expect(rows[0]?.[6]).not.toBe(340);
  });

  it("teste K — detalhe exporta histórico de IA, sem ledger técnico nem coluna Contexto", () => {
    const uso: SemenUtilizadoUso = {
      registroId: 1,
      femeaId: 15,
      matrizBrinco: "58",
      dataIso: "2026-08-26",
      createdAtIso: "2026-08-26T12:00:00.000Z",
      inseminador: "João",
      custoDose: 90,
      resultado: "Realizado",
      origem: SEMEN_ORIGEM_EXTERNO,
      machoId: null,
      reprodutorKey: "e:gsc-7117",
      reprodutorDisplay: "GSC-7117",
      partida: "P-01",
      central: "Alta",
      fazendaId: 1,
    };
    const headers = SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS.join(" ");
    expect(SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS).toEqual([
      "Data",
      "Matriz",
      "Inseminador",
      "Custo da dose",
      "Resultado",
    ]);
    expect(headers).not.toContain("Contexto");
    expect(headers).not.toContain("Saldo");
    expect(headers).not.toContain("SAIDA_IA");
    expect(SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS).toEqual([
      "center",
      "center",
      "center",
      "center",
      "center",
    ]);
    const rows = buildSemenUtilizadoDetalheExportRows([uso]);
    expect(rows[0]).toEqual(["26/08/2026", "Matriz 58", "João", 90, "Realizado"]);
    expect(JSON.stringify(rows)).not.toContain("Animal #15");
    expect(JSON.stringify(rows)).not.toContain("SAIDA_IA");
    expect(JSON.stringify(rows)).not.toContain("Inseminação");
  });

  it("detalhe exporta cada IA da mesma matriz em linha própria, custo ausente como — e ordem ASC", () => {
    const base = {
      origem: SEMEN_ORIGEM_EXTERNO,
      machoId: null,
      reprodutorKey: "e:gsc-7117",
      reprodutorDisplay: "GSC-7117",
      partida: "Sem lote",
      central: "Alta",
      fazendaId: 1,
      resultado: "Realizado",
    } as const;

    const usos: SemenUtilizadoUso[] = [
      {
        ...base,
        registroId: 50,
        femeaId: 15,
        matrizBrinco: "58",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T18:00:00.000Z",
        inseminador: "Junior",
        custoDose: 138.89,
      },
      {
        ...base,
        registroId: 48,
        femeaId: 99,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T16:00:00.000Z",
        inseminador: "Paulo",
        custoDose: 138.89,
      },
      {
        ...base,
        registroId: 47,
        femeaId: 99,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T15:00:00.000Z",
        inseminador: "Paulo",
        custoDose: 200,
      },
      {
        ...base,
        registroId: 49,
        femeaId: 14,
        matrizBrinco: "57",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T17:00:00.000Z",
        inseminador: "João",
        custoDose: 138.89,
      },
      {
        ...base,
        registroId: 40,
        femeaId: 14,
        matrizBrinco: "57",
        dataIso: "2026-08-24",
        createdAtIso: "2026-08-24T12:00:00.000Z",
        inseminador: null,
        custoDose: null,
      },
    ];

    const rows = buildSemenUtilizadoDetalheExportRows(usos);
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r[0])).toEqual([
      "24/08/2026",
      "26/08/2026",
      "26/08/2026",
      "26/08/2026",
      "26/08/2026",
    ]);
    expect(rows.filter(r => r[1] === "Matriz 27")).toHaveLength(2);
    expect(rows.find(r => r[1] === "Matriz 27" && r[3] === 200)).toBeTruthy();
    expect(rows.find(r => r[1] === "Matriz 27" && r[3] === 138.89)).toBeTruthy();
    expect(rows[0]?.[1]).toBe("Matriz 57");
    expect(rows[0]?.[2]).toBe("—");
    expect(rows[0]?.[3]).toBe("—");
    expect(rows[0]?.[3]).not.toBe(0);
    expect(JSON.stringify(rows)).not.toContain("Animal #");
    expect(JSON.stringify(rows)).not.toContain("ID 15");
    expect(JSON.stringify(rows)).not.toContain("R$ 0,00");
  });

  it("nome do arquivo da listagem não usa estoque", () => {
    expect(semenUtilizadoExportFilenameBase("Fazenda J")).toBe("semen-utilizado-fazenda-j");
    expect(semenUtilizadoExportFilenameBase("Fazenda J")).not.toContain("estoque");
  });

  it("listagem exporta ASC por último uso ISO, com desempate reprodutor e partida", () => {
    const rows = buildSemenUtilizadoExportRows([
      { ...grupo, key: "n", reprodutorDisplay: "Não informado", partida: "P-10FAZ", ultimoUso: "2026-08-27" },
      { ...grupo, key: "g", reprodutorDisplay: "GSC-7117", partida: "Sem lote", ultimoUso: "2026-08-26" },
      { ...grupo, key: "28", reprodutorDisplay: "28", partida: "28-GE", ultimoUso: "2026-08-26" },
      { ...grupo, key: "16t", reprodutorDisplay: "16", partida: "Teste", ultimoUso: "2026-08-25" },
      { ...grupo, key: "16s", reprodutorDisplay: "16", partida: "Sem lote", ultimoUso: "2026-08-25" },
      { ...grupo, key: "16p", reprodutorDisplay: "16", partida: "P-10FAZ", ultimoUso: "2026-08-25" },
      { ...grupo, key: "k", reprodutorDisplay: "KREM-663", partida: "Sem lote", ultimoUso: "2026-08-24" },
    ]);
    const dataRows = rows.filter(r => !isSemenUtilizadoExportTotaisRow(r));
    expect(dataRows.map(r => `${r[0]}|${r[1]}|${r[7]}`)).toEqual([
      "KREM-663|Sem lote|24/08/2026",
      "16|P-10FAZ|25/08/2026",
      "16|Sem lote|25/08/2026",
      "16|Teste|25/08/2026",
      "28|28-GE|26/08/2026",
      "GSC-7117|Sem lote|26/08/2026",
      "Não informado|P-10FAZ|27/08/2026",
    ]);
    expect(rows.at(-1)?.[0]).toBe(SEMEN_UTILIZADO_EXPORT_TOTAIS_LABEL);
  });

  it("não ordena pelo texto DD/MM/AAAA", () => {
    const rows = buildSemenUtilizadoExportRows([
      { ...grupo, key: "set", ultimoUso: "2026-09-01", reprodutorDisplay: "Setembro" },
      { ...grupo, key: "ago", ultimoUso: "2026-08-27", reprodutorDisplay: "Agosto" },
    ]);
    expect(rows.filter(r => !isSemenUtilizadoExportTotaisRow(r)).map(r => r[7])).toEqual([
      "27/08/2026",
      "01/09/2026",
    ]);
  });

  it("central e custos ausentes saem como — e Reprodutor fica centralizado no Excel", () => {
    const rows = buildSemenUtilizadoExportRows([
      { ...grupo, central: null, custoMedioUso: null, custoTotalUtilizado: null },
    ]);
    expect(rows[0]?.[2]).toBe("—");
    expect(rows[0]?.[5]).toBe("—");
    expect(rows[0]?.[6]).toBe("—");
    expect(rows[0]?.[5]).not.toBe(0);
    expect(rows.at(-1)?.[6]).toBe("—");
    expect(rows.at(-1)?.[6]).not.toBe(0);
    expect(SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS).toEqual([
      "center",
      "center",
      "center",
      "center",
      "center",
      "center",
      "center",
      "center",
    ]);
    expect(SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS[0]).toBe("center");
  });

  it("PDF da listagem centraliza todas as colunas e não herda left do Excel", () => {
    expect(SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS).toHaveLength(SEMEN_UTILIZADO_EXPORT_HEADERS.length);
    expect([...SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS]).toEqual([
      "center",
      "center",
      "center",
      "center",
      "center",
      "center",
      "center",
      "center",
    ]);
    expect(SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS[0]).toBe("center");
    expect(SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS[1]).toBe("center");
    expect(SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS[0]).toBe("center");
    expect(SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS.every(align => align === "center")).toBe(true);
  });

  it("rodapé soma o custo total filtrado e não inventa R$ 0,00", () => {
    const rows = buildSemenUtilizadoExportRows([
      { ...grupo, key: "a", custoTotalUtilizado: 150 },
      { ...grupo, key: "b", custoTotalUtilizado: 339.99 },
      { ...grupo, key: "c", custoTotalUtilizado: null },
    ]);
    expect(rows.at(-1)).toEqual([SEMEN_UTILIZADO_EXPORT_TOTAIS_LABEL, "", "", "", "", "", 489.99, ""]);
    expect(buildSemenUtilizadoExportRows([])).toEqual([]);
  });
});

function usoP10faz(partial: Partial<SemenUtilizadoUso> & Pick<SemenUtilizadoUso, "registroId" | "femeaId" | "matrizBrinco" | "dataIso" | "createdAtIso">): SemenUtilizadoUso {
  return {
    origem: SEMEN_ORIGEM_EXTERNO,
    machoId: null,
    reprodutorKey: "e:p-10faz",
    reprodutorDisplay: "Não informado",
    partida: "P-10FAZ",
    central: "",
    fazendaId: 1,
    inseminador: null,
    custoDose: null,
    resultado: null,
    ...partial,
  };
}

describe("exportação Histórico de utilizações", () => {
  it("teste A — título inclui Fazenda, tipo, reprodutor e partida sem IDs", () => {
    const titulo = buildSemenUtilizadoDetalheExportTitle({
      fazendaNome: "Fazenda J",
      reprodutor: "Não informado",
      partida: "P-10FAZ",
    });
    expect(titulo).toBe(
      "Fazenda J — Histórico de utilizações de sêmen — Não informado — P-10FAZ",
    );
    expect(titulo).not.toContain("fazendaId");
    expect(titulo).not.toContain("userId");
    expect(titulo).not.toMatch(/\b1\b.*P-10FAZ.*P-10FAZ/);
  });

  it("não confunde reprodutor com partida no título", () => {
    expect(
      buildSemenUtilizadoDetalheExportTitle({
        fazendaNome: "Fazenda J",
        reprodutor: "Não informado",
        partida: "P-10FAZ",
      }),
    ).not.toBe("Fazenda J — Histórico de utilizações de sêmen — P-10FAZ — P-10FAZ");
    expect(
      buildSemenUtilizadoDetalheExportTitle({
        fazendaNome: "Fazenda J",
        reprodutor: "GSC-7117",
        partida: "Sem lote",
      }),
    ).toBe("Fazenda J — Histórico de utilizações de sêmen — GSC-7117 — Sem lote");
  });

  it("identifica reprodutor e partida sem repetir lote nem usar ID técnico", () => {
    expect(
      buildSemenUtilizadoDetalheExportIdentificacao({
        reprodutor: "Não informado",
        partida: "P-10FAZ",
      }),
    ).toBe("Reprodutor: Não informado · Partida: P-10FAZ");
    expect(
      buildSemenUtilizadoDetalheExportIdentificacao({
        reprodutor: "GSC-7117",
        partida: "Sem lote",
      }),
    ).toBe("Reprodutor: GSC-7117 · Partida: Sem lote");
    expect(
      buildSemenUtilizadoDetalheExportIdentificacao({
        reprodutor: "Não informado",
        partida: "P-10FAZ",
      }),
    ).not.toBe("Reprodutor: P-10FAZ · Partida: P-10FAZ");
    expect(
      buildSemenUtilizadoDetalheExportIdentificacao({
        reprodutor: "Não informado",
        partida: "P-10FAZ",
      }),
    ).not.toMatch(/e:p-10faz/i);
  });

  it("teste B — nome do arquivo inclui Fazenda e identificação humana", () => {
    expect(
      semenUtilizadoDetalheExportFilenameBase("Fazenda J", "Não informado", "P-10FAZ"),
    ).toBe("Fazenda_J_Historico_Utilizacoes_Semen_Nao_informado_P-10FAZ");
    expect(
      semenUtilizadoDetalheExportFilenameBase("Fazenda J", "GSC-7117", "Sem lote"),
    ).toBe("Fazenda_J_Historico_Utilizacoes_Semen_GSC-7117_Sem_lote");
    const nome = semenUtilizadoDetalheExportFilenameBase("Fazenda J", "Não informado", "P-10FAZ");
    expect(nome).not.toMatch(/e:p-10faz/i);
    expect(nome).not.toContain("fazendaId");
    expect(nome).not.toMatch(/\bid\b/i);
  });

  it("sanitiza acentos, barras e caracteres inválidos no nome do arquivo", () => {
    expect(
      semenUtilizadoDetalheExportFilenameBase("Fazenda  J/Oeste", 'Touro<>:"/\\|?*', "P  01"),
    ).toBe("Fazenda_J_Oeste_Historico_Utilizacoes_Semen_Touro_P_01");
  });

  it("testes D–H — Excel separa dias, preserva uma linha por IA e ausências como —", () => {
    const usos: SemenUtilizadoUso[] = [
      usoP10faz({
        registroId: 32,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:00:00.000Z",
        inseminador: "Pedro",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
      usoP10faz({
        registroId: 33,
        femeaId: 57,
        matrizBrinco: "57",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:01:00.000Z",
        inseminador: "Pedro",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
      usoP10faz({
        registroId: 34,
        femeaId: 58,
        matrizBrinco: "58",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:02:00.000Z",
        inseminador: "João",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
      usoP10faz({
        registroId: 38,
        femeaId: 58,
        matrizBrinco: "58",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T11:00:00.000Z",
        custoDose: 90,
      }),
      usoP10faz({
        registroId: 39,
        femeaId: 12,
        matrizBrinco: "12",
        dataIso: "2026-08-27",
        createdAtIso: "2026-08-27T09:00:00.000Z",
        inseminador: "João",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
      usoP10faz({
        registroId: 40,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-27",
        createdAtIso: "2026-08-27T09:01:00.000Z",
        inseminador: "Pedro",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
      usoP10faz({
        registroId: 41,
        femeaId: 57,
        matrizBrinco: "57",
        dataIso: "2026-08-27",
        createdAtIso: "2026-08-27T09:02:00.000Z",
        custoDose: 90,
      }),
      usoP10faz({
        registroId: 42,
        femeaId: 58,
        matrizBrinco: "58",
        dataIso: "2026-08-27",
        createdAtIso: "2026-08-27T09:03:00.000Z",
        inseminador: "Junior",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
    ];

    const pdf = buildSemenUtilizadoDetalheExportRows(usos);
    expect(pdf).toHaveLength(8);
    expect(pdf.map(r => r[0])).toEqual([
      "26/08/2026",
      "26/08/2026",
      "26/08/2026",
      "26/08/2026",
      "27/08/2026",
      "27/08/2026",
      "27/08/2026",
      "27/08/2026",
    ]);
    expect(pdf.filter(r => r[1] === "Matriz 58")).toHaveLength(3);

    const excel = buildSemenUtilizadoDetalheExcelRows(usos);
    expect(excel.rows).toHaveLength(11);
    expect(excel.rowMeta.filter(m => m.section)).toHaveLength(3);
    expect(excel.rows[0]).toEqual(["26/08/2026", "", "Custo total", 339.99, ""]);
    expect(excel.rowMeta[0]).toEqual({ section: true });
    expect(excel.rows[1]).toEqual(["26/08/2026", "Matriz 27", "Pedro", 83.33, "Realizado"]);
    expect(excel.rows[4]).toEqual(["26/08/2026", "Matriz 58", "—", 90, "—"]);
    expect(excel.rows[5]).toEqual(["27/08/2026", "", "Custo total", 339.99, ""]);
    expect(excel.rowMeta[5]).toEqual({ section: true });
    expect(excel.rows[6]?.[1]).toBe("Matriz 12");
    expect(excel.rows.filter(r => r[1] === "Matriz 58")).toHaveLength(3);
    expect(excel.rows.filter(r => r[1] !== "" && r[0] === "26/08/2026")).toHaveLength(4);
    expect(excel.rows.at(-1)?.[0]).toBe(SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL);
    expect(isSemenUtilizadoDetalheTotalGeralRow(excel.rows.at(-1)!)).toBe(true);
    expect(excel.rowMeta.at(-1)).toEqual({ section: true });
    expect(JSON.stringify(excel.rows)).not.toContain("Saldo");
    expect(JSON.stringify(excel.rows)).not.toContain("R$ 0,00");
    expect(JSON.stringify(excel.rows.at(-1))).not.toContain("Custo médio");
    expect(excel.rows.some(r => r.includes(0))).toBe(false);
  });

  it("teste I/J — planilha abre, centraliza, formata custo e não mescla linhas de IA", async () => {
    const usos: SemenUtilizadoUso[] = [
      usoP10faz({
        registroId: 32,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:00:00.000Z",
        inseminador: "Pedro",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
      usoP10faz({
        registroId: 38,
        femeaId: 58,
        matrizBrinco: "58",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T11:00:00.000Z",
        custoDose: 90,
      }),
      usoP10faz({
        registroId: 39,
        femeaId: 12,
        matrizBrinco: "12",
        dataIso: "2026-08-27",
        createdAtIso: "2026-08-27T09:00:00.000Z",
        inseminador: "João",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
    ];
    const excel = buildSemenUtilizadoDetalheExcelRows(usos);
    const { buildExportSpreadsheetWorkbook, buildExportSpreadsheetBuffer } = await import(
      "@shared/buildExportSpreadsheet"
    );
    const titulo = buildSemenUtilizadoDetalheExportTitle({
      fazendaNome: "Fazenda J",
      reprodutor: "Não informado",
      partida: "P-10FAZ",
    });
    const wb = await buildExportSpreadsheetWorkbook(
      [...SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS],
      excel.rows,
      {
        reportTitle: titulo,
        blankAfterMeta: false,
        autoFilter: false,
        plainHeader: true,
        currencyColIndexes: [...SEMEN_UTILIZADO_DETALHE_EXPORT_CURRENCY_COLS],
        currencyNumFmt: EXCEL_FMT_MOEDA_BRL,
        currencyAsNumber: true,
        columnAligns: [...SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS],
        columnWidths: [14, 16, 18, 16, 16],
        rowMeta: excel.rowMeta,
        sheetName: "Utilizações",
      },
    );
    const ws = wb.getWorksheet("Utilizações")!;
    expect(ws.getCell("A1").value).toBe(titulo);
    expect(ws.getCell("A1").alignment?.horizontal).toBe("center");
    expect(String(ws.getCell("A2").value)).toBe("Data");
    expect(ws.getCell("A2").alignment?.horizontal).toBe("center");
    expect(ws.getCell("B2").alignment?.horizontal).toBe("center");
    expect(ws.getCell("A3").value).toBe("26/08/2026");
    expect(ws.getCell("A3").font?.bold).toBe(true);
    expect(JSON.stringify(ws.getCell("A3").fill)).toContain("FFEEF1F2");
    expect(ws.getCell("C3").value).toBe("Custo total");
    expect(ws.getCell("D3").value).toBe(173.33);
    expect(ws.getCell("D3").numFmt).toBe(EXCEL_FMT_MOEDA_BRL);
    expect(EXCEL_FMT_MOEDA_BRL).toBe('"R$" #,##0.00');
    expect(ws.getCell("A4").value).toBe("26/08/2026");
    expect(ws.getCell("B4").value).toBe("Matriz 27");
    expect(ws.getCell("A4").alignment?.horizontal).toBe("center");
    expect(ws.getCell("B4").alignment?.horizontal).toBe("center");
    expect(ws.getCell("C4").alignment?.horizontal).toBe("center");
    expect(ws.getCell("D4").value).toBe(83.33);
    expect(ws.getCell("D4").numFmt).toBe(EXCEL_FMT_MOEDA_BRL);
    expect(ws.getCell("D4").numFmt).not.toContain("#.##0,00");
    expect(ws.getCell("D4").alignment?.horizontal).toBe("center");
    expect(ws.getCell("E4").alignment?.horizontal).toBe("center");
    expect(ws.getCell("C5").value).toBe("—");
    expect(ws.getCell("D5").value).toBe(90);
    expect(ws.getCell("E5").value).toBe("—");
    expect(ws.getCell("A6").value).toBe("27/08/2026");
    expect(ws.getCell("A6").font?.bold).toBe(true);
    expect(ws.getCell("D6").value).toBe(83.33);
    expect(ws.getCell("B7").value).toBe("Matriz 12");
    expect(ws.getCell("A8").value).toBe(SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL);
    expect(ws.getCell("A8").font?.bold).toBe(true);
    expect(JSON.stringify(ws.getCell("A8").fill)).toContain("FFEEF1F2");
    expect(ws.getCell("B8").value).toBe("");
    expect(ws.getCell("C8").value).toBe("");
    expect(ws.getCell("D8").value).toBe(256.66);
    expect(ws.getCell("D8").numFmt).toBe(EXCEL_FMT_MOEDA_BRL);
    expect(ws.getCell("A8").alignment?.horizontal).toBe("center");
    expect(ws.getCell("B8").alignment?.horizontal).toBe("center");
    expect(ws.getCell("D8").alignment?.horizontal).toBe("center");
    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    expect(merges).toEqual(["A1:E1"]);
    expect(ws.autoFilter == null).toBe(true);

    const buffer = await buildExportSpreadsheetBuffer(
      [...SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS],
      excel.rows,
      {
        reportTitle: titulo,
        blankAfterMeta: false,
        autoFilter: false,
        plainHeader: true,
        currencyColIndexes: [...SEMEN_UTILIZADO_DETALHE_EXPORT_CURRENCY_COLS],
        currencyAsNumber: true,
        rowMeta: excel.rowMeta,
        sheetName: "Utilizações",
      },
    );
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("custo total do dia usa snapshots reais e vira — quando nenhum custo existe", () => {
    const excel = buildSemenUtilizadoDetalheExcelRows([
      usoP10faz({
        registroId: 1,
        femeaId: 12,
        matrizBrinco: "12",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:00:00.000Z",
      }),
      usoP10faz({
        registroId: 2,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:01:00.000Z",
        custoDose: 83.33,
        resultado: "Realizado",
      }),
    ]);
    expect(excel.rows[0]?.[2]).toBe("Custo total");
    expect(excel.rows[0]?.[3]).toBe(83.33);
    expect(excel.rows[0]?.[3]).not.toBe(0);

    const semCusto = buildSemenUtilizadoDetalheExcelRows([
      usoP10faz({
        registroId: 3,
        femeaId: 12,
        matrizBrinco: "12",
        dataIso: "2026-08-27",
        createdAtIso: "2026-08-27T10:00:00.000Z",
      }),
    ]);
    expect(semCusto.rows[0]?.[3]).toBe("—");
    expect(semCusto.rows[0]?.[3]).not.toBe(0);
    expect(semCusto.rows.at(-1)?.[0]).toBe(SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL);
    expect(semCusto.rows.at(-1)?.[3]).toBe("—");
    expect(semCusto.rows.at(-1)?.[3]).not.toBe(0);
  });

  it("testes A–H — Total geral conta IAs, matrizes por femeaId e snapshots, sem custo médio", () => {
    const usos: SemenUtilizadoUso[] = [
      usoP10faz({
        registroId: 1,
        femeaId: 57,
        matrizBrinco: "57",
        dataIso: "2026-08-24",
        createdAtIso: "2026-08-24T10:00:00.000Z",
      }),
      usoP10faz({
        registroId: 2,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:00:00.000Z",
        custoDose: 200,
      }),
      usoP10faz({
        registroId: 3,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T11:00:00.000Z",
        custoDose: 138.89,
      }),
      usoP10faz({
        registroId: 4,
        femeaId: 58,
        matrizBrinco: "58",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T12:00:00.000Z",
        custoDose: 138.89,
      }),
      usoP10faz({
        registroId: 5,
        femeaId: 57,
        matrizBrinco: "57",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T13:00:00.000Z",
        custoDose: 138.89,
      }),
    ];

    expect(calcularSemenUtilizadoTotalGeral(usos)).toEqual({
      totalUtilizacoes: 5,
      totalMatrizes: 3,
      custoTotal: 616.67,
    });
    expect(buildSemenUtilizadoDetalheTotalGeralRow(usos)).toEqual([
      SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL,
      "",
      "",
      616.67,
      "",
    ]);
    expect(JSON.stringify(buildSemenUtilizadoDetalheTotalGeralRow(usos))).not.toContain("Custo médio");
    expect(JSON.stringify(buildSemenUtilizadoDetalheTotalGeralRow(usos))).not.toContain("utilizações");
    expect(JSON.stringify(buildSemenUtilizadoDetalheTotalGeralRow(usos))).not.toContain("matrizes");

    const excel = buildSemenUtilizadoDetalheExcelRows(usos);
    expect(excel.rows[0]).toEqual(["24/08/2026", "", "Custo total", "—", ""]);
    expect(excel.rows[2]?.[0]).toBe("26/08/2026");
    expect(excel.rows[2]?.[2]).toBe("Custo total");
    expect(excel.rows[2]?.[3]).toBe(616.67);
    expect(excel.rows.at(-1)).toEqual([
      SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL,
      "",
      "",
      616.67,
      "",
    ]);
    expect(excel.rowMeta.at(-1)).toEqual({ section: true });
    expect(excel.rows.filter(r => r[2] === "Custo total")).toHaveLength(2);

    const soDia26 = usos.filter(u => u.dataIso === "2026-08-26");
    expect(calcularSemenUtilizadoTotalGeral(soDia26)).toEqual({
      totalUtilizacoes: 4,
      totalMatrizes: 3,
      custoTotal: 616.67,
    });

    const semCusto = [
      usoP10faz({
        registroId: 10,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-24",
        createdAtIso: "2026-08-24T10:00:00.000Z",
      }),
      usoP10faz({
        registroId: 11,
        femeaId: 27,
        matrizBrinco: "27",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T10:00:00.000Z",
      }),
      usoP10faz({
        registroId: 12,
        femeaId: 58,
        matrizBrinco: "58",
        dataIso: "2026-08-26",
        createdAtIso: "2026-08-26T11:00:00.000Z",
      }),
    ];
    expect(calcularSemenUtilizadoTotalGeral(semCusto)).toEqual({
      totalUtilizacoes: 3,
      totalMatrizes: 2,
      custoTotal: null,
    });
    expect(buildSemenUtilizadoDetalheTotalGeralRow(semCusto)[3]).toBe("—");
    expect(buildSemenUtilizadoDetalheTotalGeralRow(semCusto)[3]).not.toBe(0);
    expect(buildSemenUtilizadoDetalheExcelRows([])).toEqual({ rows: [], rowMeta: [] });
  });
});
