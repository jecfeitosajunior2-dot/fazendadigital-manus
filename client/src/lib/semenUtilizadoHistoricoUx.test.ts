import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS,
  buildSemenUtilizadoDetalheExcelRows,
  buildSemenUtilizadoDetalheExportIdentificacao,
  buildSemenUtilizadoDetalheExportRows,
} from "./semenUtilizadoExport";
import { SEMEN_ORIGEM_EXTERNO } from "@shared/semenEstoque";
import {
  SEMEN_UTILIZADO_COLUNA_STATUS,
  SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO,
  formatSemenUtilizadoDiaResumo,
  formatSemenUtilizadoHistoricoCabecalho,
  groupSemenUtilizadoUsosPorDia,
  semenUtilizadoDiasAbertosIniciais,
  sortSemenUtilizadoUsosExport,
  type SemenUtilizadoUso,
} from "@shared/semenUtilizado";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

function uso(partial: Partial<SemenUtilizadoUso> & Pick<SemenUtilizadoUso, "registroId" | "femeaId" | "dataIso">): SemenUtilizadoUso {
  return {
    matrizBrinco: String(partial.femeaId),
    createdAtIso: `${partial.dataIso}T10:00:00.000Z`,
    inseminador: null,
    custoDose: 83.33,
    resultado: "Realizado",
    origem: SEMEN_ORIGEM_EXTERNO,
    machoId: null,
    reprodutorKey: "e:nao-informado",
    reprodutorDisplay: "Não informado",
    partida: "P-10FAZ",
    central: null,
    fazendaId: 1,
    ...partial,
  };
}

describe("Histórico de utilizações — clareza final", () => {
  it("cabeçalho identifica Reprodutor e Partida e mantém Não informado", () => {
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    expect(page).toContain("SEMEN_UTILIZADO_HISTORICO_TITULO");
    expect(page).not.toContain("Histórico de utilizações");
    expect(page).toContain("formatSemenUtilizadoHistoricoCabecalho");
    expect(page).toContain("cabecalho.reprodutorLinha");
    expect(page).toContain("cabecalho.partidaLinha");
    expect(page).not.toContain("{grupo.reprodutorDisplay} · {grupo.partida}");

    const cabecalho = formatSemenUtilizadoHistoricoCabecalho({
      reprodutorDisplay: "Não informado",
      partida: "P-10FAZ",
    });
    expect(cabecalho.reprodutorLinha).toBe("Reprodutor: Não informado");
    expect(cabecalho.partidaLinha).toBe("Partida: P-10FAZ");
    expect(cabecalho.reprodutor).not.toBe("P-10FAZ");
  });

  it("coluna operacional chama Status, não Resultado", () => {
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    expect(SEMEN_UTILIZADO_COLUNA_STATUS).toBe("Status");
    expect(page).toContain("SEMEN_UTILIZADO_COLUNA_STATUS");
    expect(page).not.toContain(">Resultado<");
    expect(SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS).toEqual([
      "Data",
      "Matriz",
      "Inseminador",
      "Custo da dose",
      "Status",
    ]);
    expect(SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS).not.toContain("Resultado");
  });

  it("resumo do dia usa matrizes distintas, soma real de doses e custo histórico", () => {
    const dias = groupSemenUtilizadoUsosPorDia([
      uso({ registroId: 1, femeaId: 10, dataIso: "2026-08-27", custoDose: 83.33 }),
      uso({ registroId: 2, femeaId: 10, dataIso: "2026-08-27", createdAtIso: "2026-08-27T11:00:00.000Z", custoDose: 83.33 }),
      uso({ registroId: 3, femeaId: 20, dataIso: "2026-08-27", custoDose: 90 }),
      uso({ registroId: 4, femeaId: 30, dataIso: "2026-08-26", custoDose: 83.33 }),
    ]);
    expect(dias.map(d => d.dataIso)).toEqual(["2026-08-27", "2026-08-26"]);
    expect(dias[0]?.matrizes).toBe(2);
    expect(dias[0]?.doses).toBe(3);
    expect(dias[0]?.custoTotal).toBe(256.66);
    expect(
      formatSemenUtilizadoDiaResumo({
        matrizes: dias[0]!.matrizes,
        doses: dias[0]!.doses,
        custoTotal: dias[0]!.custoTotal,
      }),
    ).toBe("2 matrizes · 3 doses · Custo total R$ 256,66");
    expect(SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO).toBe(1);
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    expect(page).toContain("formatSemenUtilizadoDiaResumo");
    expect(page).not.toMatch(/<p className="text-gray-500">Doses<\/p>/);
  });

  it("acordeão abre só o dia mais recente e o link da matriz permanece", () => {
    const dias = groupSemenUtilizadoUsosPorDia([
      uso({ registroId: 2, femeaId: 10, dataIso: "2026-08-27" }),
      uso({ registroId: 1, femeaId: 20, dataIso: "2026-08-26" }),
    ]);
    expect(semenUtilizadoDiasAbertosIniciais(dias)).toEqual(["2026-08-27"]);
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    expect(page).toContain("semenUtilizadoDiasAbertosIniciais");
    expect(page).toContain("aria-expanded");
    expect(page).toContain("getFichaAnimalPath(uso.femeaId, \"reproducao\")");
    expect(page).toContain("formatSemenUtilizadoMatrizLabel");
    expect(page).not.toContain("Nova inseminação");
    expect(page).not.toContain("Nova Entrada");
    expect(page).not.toContain("Ajustar estoque");
    expect(page).not.toContain("Corrigir lançamento");
  });

  it("exportação do detalhe mantém ordem antiga→recente, custo histórico e Status", () => {
    const usos = [
      uso({ registroId: 2, femeaId: 10, dataIso: "2026-08-27", custoDose: 83.33, resultado: "Realizado" }),
      uso({ registroId: 1, femeaId: 20, dataIso: "2026-08-26", custoDose: 90, resultado: "Realizado" }),
    ];
    const tela = groupSemenUtilizadoUsosPorDia(usos).map(d => d.dataIso);
    const excel = sortSemenUtilizadoUsosExport(usos).map(u => u.dataIso);
    expect(tela).toEqual(["2026-08-27", "2026-08-26"]);
    expect(excel).toEqual(["2026-08-26", "2026-08-27"]);

    expect(
      buildSemenUtilizadoDetalheExportIdentificacao({
        reprodutor: "Não informado",
        partida: "P-10FAZ",
      }),
    ).toBe("Reprodutor: Não informado · Partida: P-10FAZ");

    const rows = buildSemenUtilizadoDetalheExportRows(usos);
    expect(rows[0]).toEqual(["26/08/2026", "Matriz 20", "—", 90, "Realizado"]);
    expect(rows[1]).toEqual(["27/08/2026", "Matriz 10", "—", 83.33, "Realizado"]);
    expect(JSON.stringify(rows)).not.toContain("custoUnitario");

    const planilha = buildSemenUtilizadoDetalheExcelRows(usos);
    expect(planilha.rows[0]).toEqual(["26/08/2026", "", "Custo total", 90, ""]);
    expect(planilha.rows[1]?.[3]).toBe(90);
  });

  it("não cria migration nem toca Estoque ou Manejo Reprodutivo", () => {
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    const shared = readFileSync(resolve(here, "../../../shared/semenUtilizado.ts"), "utf8");
    expect(page).not.toContain("drizzle");
    expect(shared).not.toContain("drizzle");
    expect(page).not.toContain("SemenEstoquePage");
    expect(page).not.toContain("ManejoPages");
    const migrations = readdirSync(resolve(here, "../../../drizzle/migrations"));
    expect(migrations.some(f => /semen_utilizado_historico|utilizado_status/i.test(f))).toBe(false);
  });
});
