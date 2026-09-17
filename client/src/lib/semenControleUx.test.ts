import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEMEN_REPRODUCAO_TABS } from "@/components/semen/SemenReproducaoTabs";
import {
  CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL,
  CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR,
  CADASTRAR_SEMEN_EXTERNO_TITULO,
} from "@/components/semen/CadastrarSemenExternoDialog";
import { SEMEN_REPRODUTOR_CADASTRAR_ENTRADA_LABEL } from "@/components/SemenReprodutorExternoField";
import { menuItems } from "./data";
import { SEMEN_ESTOQUE_PATH, SEMEN_UTILIZADO_PATH } from "./semenRoutes";
import { SEMEN_UTILIZADO_EXPORT_HEADERS, SEMEN_UTILIZADO_TITULO } from "./semenUtilizadoExport";
import { formatSemenCustoTotalDisplay, parseSemenCustoTotal } from "@shared/semenEstoque";
import { aggregateSemenUtilizado, type SemenUtilizadoUso } from "@shared/semenUtilizado";
import { SEMEN_ORIGEM_EXTERNO } from "@shared/semenEstoque";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

function childPaths(groupLabel: string): string[] {
  return (
    menuItems
      .find(item => item.label === groupLabel)
      ?.children?.map(c => c.path)
      .filter(Boolean) as string[]
  ) ?? [];
}

function childLabels(groupLabel: string): string[] {
  return menuItems.find(item => item.label === groupLabel)?.children?.map(c => c.label) ?? [];
}

describe("Controle de sêmen — revisão UX", () => {
  it("Reprodução possui apenas Controle de sêmen no menu", () => {
    expect(childLabels("Reprodução")).toEqual(["Controle de Sêmen"]);
    expect(childPaths("Reprodução")).toEqual([SEMEN_ESTOQUE_PATH]);
    expect(childLabels("Reprodução")).not.toContain("Visão Geral");
  });

  it("abre inicialmente em Estoque e a ordem das abas é Estoque | Utilizado", () => {
    expect(SEMEN_REPRODUCAO_TABS.map(t => t.label)).toEqual(["Estoque", "Utilizado"]);
    expect(SEMEN_REPRODUCAO_TABS[0]?.path).toBe(SEMEN_ESTOQUE_PATH);
    expect(SEMEN_REPRODUCAO_TABS[1]?.path).toBe(SEMEN_UTILIZADO_PATH);
    expect(childPaths("Reprodução")[0]).toBe(SEMEN_ESTOQUE_PATH);
  });

  it("aba Utilizado não mostra + Novo Reprodutor", () => {
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    expect(page).not.toContain("Novo Reprodutor");
    expect(page).not.toContain("Novo reprod.");
    expect(page).not.toContain("CadastrarSemenExternoDialog");
    expect(page).toContain("ListExportButtons");
    expect(page).toContain("formatSemenUtilizadoRodapeConsulta");
    expect(page).toContain("Doses utilizadas");
    expect(page).toContain("Custo médio/dose");
    expect(page).toContain("Custo total");
    expect(page).toContain("SEMEN_UTILIZADO_TITULO");
    expect(page).not.toContain("Relatório de consumo");
    expect(page).not.toContain("Partidas e entradas ficam na aba Estoque");
    expect(page).toContain("FormSelect");
    expect(page).not.toMatch(/<select[\s\S]*Filtrar por reprodutor/);
  });

  it("modal Novo Reprodutor usa Reprodutor* e Central padrão", () => {
    expect(CADASTRAR_SEMEN_EXTERNO_TITULO).toBe("Novo Reprodutor");
    expect(CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR).toBe("Reprodutor");
    expect(CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL).toBe("Central padrão");
    const modal = readSrc("../components/semen/CadastrarSemenExternoDialog.tsx");
    expect(modal).not.toContain("Identificação reutilizável");
    expect(modal).not.toContain("CADASTRAR_SEMEN_EXTERNO_HINT");
  });

  it("Nova entrada seleciona tipo em Origem do reprodutor e o cadastro no campo Reprodutor", () => {
    const dialog = readSrc("../components/semen/NovaEntradaSemenDialog.tsx");
    expect(dialog).toContain("Nova Entrada de Sêmen");
    expect(dialog).toContain("Origem do Reprodutor");
    expect(SEMEN_REPRODUTOR_CADASTRAR_ENTRADA_LABEL).toBe("+ Cadastrar Reprodutor");
    expect(dialog).toContain("Selecione a origem");
    expect(dialog).toContain('label="Reprodutor"');
    expect(dialog).toContain("Animal do rebanho");
    expect(dialog).toContain("Sêmen / Reprodutor externo");
    expect(dialog).toContain("Quantidade de doses");
    expect(dialog).toContain("Custo/dose");
    expect(dialog).toContain('label="Custo total"');
    expect(dialog).toContain("Valores e Data");
    expect(dialog).not.toContain("Data de entrada");
    expect(dialog).toContain("semenEntradaModalLayout.opCard");
    expect(dialog).toContain("showHint={false}");
    const externo = readSrc("../components/SemenReprodutorExternoField.tsx");
    expect(externo).toContain("createPortal");
    expect(externo).toContain("[data-slot=dialog-content]");
    expect(externo).toContain("handlePick");
  });

  it("custo total da entrada é Doses × Custo unitário", () => {
    const doses = 10;
    const unit = parseSemenCustoTotal("150,00");
    expect(unit).toBe(150);
    expect(formatSemenCustoTotalDisplay(doses * unit!)).toBe("R$ 1.500,00");
  });

  it("tabela Utilizado mostra CUSTO MÉDIO/DOSE", () => {
    expect(SEMEN_UTILIZADO_EXPORT_HEADERS).toEqual([
      "Reprodutor",
      "Partida",
      "Central",
      "Doses utilizadas",
      "Matrizes",
      "Custo médio/dose",
      "Custo total",
      "Último uso",
    ]);
    const page = readSrc("../pages/SemenUtilizadoPage.tsx");
    expect(page).toContain("Doses utilizadas");
    expect(page).toContain("Custo médio/dose");
    expect(page).toContain("Custo total");
    expect(SEMEN_UTILIZADO_TITULO).toBe("Sêmen Utilizado");
    expect(page).toContain("buildSemenUtilizadoExportRows(grupos, totaisConsulta)");
    expect(page).toContain("paginateSemenEstoqueList(grupos");
    expect(page).not.toContain("sortSemenUtilizadoGruposExport");
    expect(page).not.toContain("sortSemenEstoqueByReprodutor");
    expect(page).not.toContain("Ordenar por reprodutor");
    expect(page).not.toContain("arrow_drop_up");
    expect(page).toContain("queryFiltros");
    expect(readSrc("../components/semen/NovaEntradaSemenDialog.tsx")).toContain(
      "CadastrarSemenExternoDialog",
    );
  });

  it("Matrizes = distintas e Doses utilizadas = soma dos usos", () => {
    const uso = (id: number, femeaId: number, custo: number): SemenUtilizadoUso => ({
      registroId: id,
      femeaId,
      matrizBrinco: String(femeaId),
      dataIso: "2026-08-20",
      createdAtIso: "2026-08-20T10:00:00.000Z",
      inseminador: null,
      custoDose: custo,
      resultado: null,
      origem: SEMEN_ORIGEM_EXTERNO,
      machoId: null,
      reprodutorKey: "e:gsc",
      reprodutorDisplay: "GSC",
      partida: "P-01",
      central: "Alta",
      fazendaId: 1,
    });
    const grupos = aggregateSemenUtilizado([
      uso(1, 10, 100),
      uso(2, 10, 100),
      uso(3, 11, 100),
    ]);
    expect(grupos[0]?.dosesUtilizadas).toBe(3);
    expect(grupos[0]?.matrizes).toBe(2);
  });

  it("não move evento reprodutivo para este módulo", () => {
    const data = readSrc("./data.ts");
    const repro = data.slice(data.indexOf('label: "Reprodução"'), data.indexOf('label: "Nutrição"'));
    expect(repro).toContain("Controle de Sêmen");
    expect(repro).not.toContain("reprodutivo");
    expect(repro).not.toContain("/manejo/registros");
  });
});
