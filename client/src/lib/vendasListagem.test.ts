import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildExportSpreadsheetBuffer } from "@shared/buildExportSpreadsheet";
import {
  FILTRO_TODOS,
  filtrarVendasListagem,
  isVendaStatus,
  labelStatusVenda,
  linhaPdfVendasListagem,
  linhaTotaisExportVendasListagem,
  linhasExportVendasListagem,
  modoTotaisRodapeVendas,
  opcoesStatusVenda,
  precoMedioKgVendaListagem,
  resumirVendasListagem,
  statusQueryVendasListagem,
  VENDAS_LISTAGEM_EXPORT_HEADERS,
  vendasParaTotaisRodape,
  VENDA_STATUS,
} from "./vendasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const modulePages = readFileSync(resolve(here, "../pages/ModulePages.tsx"), "utf8");
const comprasPage = modulePages.slice(
  modulePages.indexOf("export function PurchasesPage"),
  modulePages.indexOf("const VENDA_FILTRO_SELECT_EMPTY"),
);
const vendasPage = modulePages.slice(modulePages.indexOf("export function SalesPage"));

const vendaValidada = {
  id: 1,
  data: "2026-09-19",
  comprador: "Frigorífico São Paulo",
  fazendaNome: "Fazenda J",
  status: "concluido",
  formaPrecificacao: "kg",
  quantidadeAnimais: 2,
  pesoTotal: 450,
  valorTotalNumero: 4612.5,
};

describe("vendasListagem", () => {
  it("reconhece só os status reais do schema", () => {
    expect(VENDA_STATUS).toEqual(["pendente", "concluido", "cancelado"]);
    expect(isVendaStatus("concluido")).toBe(true);
    expect(isVendaStatus("confirmado")).toBe(false);
    expect(labelStatusVenda("concluido")).toBe("Concluída");
  });

  it("filtro da listagem oferece só Todos, Concluída e Cancelada", () => {
    expect(opcoesStatusVenda()).toEqual([
      { value: FILTRO_TODOS, label: "Todos" },
      { value: "concluido", label: "Concluída" },
      { value: "cancelado", label: "Cancelada" },
    ]);
  });

  it("R$/kg médio usa valorTotal / pesoTotal só na modalidade kg", () => {
    expect(precoMedioKgVendaListagem(vendaValidada)).toBe(10.25);
    expect(precoMedioKgVendaListagem({ ...vendaValidada, formaPrecificacao: "cabeca" })).toBeNull();
    expect(precoMedioKgVendaListagem({ ...vendaValidada, formaPrecificacao: "arroba" })).toBeNull();
    expect(precoMedioKgVendaListagem({ ...vendaValidada, formaPrecificacao: null })).toBeNull();
    expect(precoMedioKgVendaListagem({ ...vendaValidada, pesoTotal: null })).toBeNull();
  });

  it("PDF da listagem segue a mesma sequência da tabela, incluindo R$/kg médio e Status", () => {
    expect([...VENDAS_LISTAGEM_EXPORT_HEADERS]).toEqual([
      "Data",
      "Comprador",
      "Animais",
      "Peso",
      "R$/kg médio",
      "Valor Total",
      "Status",
    ]);
    const semNbsp = (linha: string[]) => linha.map(celula => celula.replace(/\u00a0/g, " "));
    expect(semNbsp(linhaPdfVendasListagem({ ...vendaValidada, quantidade: 2, status: "cancelado" }))).toEqual([
      "19/09/2026",
      "Frigorífico São Paulo",
      "2",
      "450 kg",
      "R$ 10,25",
      "R$ 4.612,50",
      "Cancelada",
    ]);
    expect(semNbsp(linhaPdfVendasListagem({ ...vendaValidada, formaPrecificacao: "cabeca", pesoTotal: null }))).toEqual([
      "19/09/2026",
      "Frigorífico São Paulo",
      "2",
      "—",
      "—",
      "R$ 4.612,50",
      "Concluída",
    ]);
  });

  it("totais da exportação repetem o rodapé: Todos zera cancelada; Cancelada soma o histórico", () => {
    const cancelada = { ...vendaValidada, quantidade: 2, status: "cancelado" };
    const semNbsp = (linha: string[]) => linha.map(celula => celula.replace(/\u00a0/g, " "));
    expect(semNbsp(linhaTotaisExportVendasListagem([cancelada], FILTRO_TODOS))).toEqual([
      "Totais",
      "",
      "0",
      "0 kg",
      "",
      "R$ 0,00",
      "Canceladas não incluídas nos totais",
    ]);
    expect(semNbsp(linhaTotaisExportVendasListagem([cancelada], "cancelado"))).toEqual([
      "Totais (canceladas)",
      "",
      "2",
      "450 kg",
      "",
      "R$ 4.612,50",
      "",
    ]);
    const exportadas = linhasExportVendasListagem([cancelada], FILTRO_TODOS);
    expect(exportadas).toHaveLength(2);
    expect(exportadas[0]?.[6]).toBe("Cancelada");
    expect(exportadas[1]?.[0]).toBe("Totais");
  });

  it("Excel de vendas centraliza as células e inclui a linha de totais do rodapé", async () => {
    const cancelada = { ...vendaValidada, quantidade: 2, status: "cancelado" };
    const linhas = linhasExportVendasListagem([cancelada], FILTRO_TODOS);
    const buffer = await buildExportSpreadsheetBuffer([...VENDAS_LISTAGEM_EXPORT_HEADERS], linhas, {
      reportTitle: "Fazenda J — Vendas",
      blankAfterMeta: false,
      autoFilter: false,
      plainHeader: true,
      textColIndexes: [0, 1, 2, 3, 4, 5, 6],
      columnAligns: ["center", "center", "center", "center", "center", "center", "center"],
      footerRowCount: 1,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0]!;
    expect(String(ws.getRow(1).getCell(1).value)).toBe("Fazenda J — Vendas");
    expect(String(ws.getRow(3).getCell(7).value)).toBe("Cancelada");
    expect(ws.getRow(3).getCell(1).alignment?.horizontal).toBe("center");
    expect(ws.getRow(3).getCell(2).alignment?.horizontal).toBe("center");
    expect(String(ws.getRow(4).getCell(1).value)).toBe("Totais");
    expect(String(ws.getRow(4).getCell(3).value)).toBe("0");
    expect(String(ws.getRow(4).getCell(4).value)).toBe("0 kg");
    expect(String(ws.getRow(4).getCell(6).value).replace(/\u00a0/g, " ")).toBe("R$ 0,00");
    expect(String(ws.getRow(4).getCell(7).value)).toBe("Canceladas não incluídas nos totais");
  });

  it("cards somam as vendas já filtradas, sem hardcode", () => {
    const resumo = resumirVendasListagem([vendaValidada]);
    expect(resumo.vendas).toEqual({ kind: "known", value: 1 });
    expect(resumo.animais).toEqual({ kind: "known", value: 2 });
    expect(resumo.peso).toEqual({ kind: "known", value: 450 });
    expect(resumo.valor).toEqual({ kind: "known", value: 4612.5 });
  });

  it("filtros de período, comprador, status e busca são combinados", () => {
    const outra = {
      id: 2,
      data: "2026-08-01",
      comprador: "Outro",
      fazendaNome: "Fazenda B",
      status: "pendente",
      quantidadeAnimais: 1,
      valorTotalNumero: 100,
    };
    const lista = [vendaValidada, outra];

    expect(filtrarVendasListagem(lista, { periodoDe: "2026-09-01", periodoAte: "2026-09-30" }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem(lista, { comprador: "Frigorífico São Paulo" }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem(lista, { status: "pendente" }).map(v => v.id)).toEqual([2]);
    expect(filtrarVendasListagem(lista, { busca: "frigor" }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem(lista, { comprador: FILTRO_TODOS, status: FILTRO_TODOS })).toHaveLength(2);
  });

  it("isola vendas pela fazenda e não busca mais por nome de fazenda", () => {
    const daJ = { ...vendaValidada, fazendaId: 1 };
    const daB = {
      id: 2,
      data: "2026-08-01",
      comprador: "Outro",
      fazendaId: 2,
      fazendaNome: "Fazenda B",
      status: "pendente",
      quantidadeAnimais: 1,
      valorTotalNumero: 100,
    };
    expect(filtrarVendasListagem([daJ, daB], { fazendaId: 1 }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem([daJ, daB], { fazendaId: 2 }).map(v => v.id)).toEqual([2]);
    expect(filtrarVendasListagem([daJ], { busca: "fazenda" })).toEqual([]);
    expect(filtrarVendasListagem([daJ], { busca: "2026-09-19" }).map(v => v.id)).toEqual([1]);
  });

  it("rodapé efetivo soma só concluídas, mesmo quando a lista filtrada tem só cancelada", () => {
    const cancelada = {
      ...vendaValidada,
      id: 3,
      status: "cancelado",
      quantidadeAnimais: 5,
      pesoTotal: 900,
      valorTotalNumero: 1000,
    };
    const pendente = {
      ...vendaValidada,
      id: 4,
      status: "pendente",
      quantidadeAnimais: 1,
      pesoTotal: 100,
      valorTotalNumero: 200,
    };

    expect(modoTotaisRodapeVendas(FILTRO_TODOS)).toBe("efetivo");
    expect(modoTotaisRodapeVendas("concluido")).toBe("efetivo");
    expect(modoTotaisRodapeVendas("cancelado")).toBe("canceladas");
    expect(modoTotaisRodapeVendas("pendente")).toBe("pendentes");

    expect(vendasParaTotaisRodape([vendaValidada, cancelada], FILTRO_TODOS).map(v => v.id)).toEqual([1]);
    expect(vendasParaTotaisRodape([cancelada], FILTRO_TODOS)).toEqual([]);
    expect(resumirVendasListagem(vendasParaTotaisRodape([cancelada], FILTRO_TODOS))).toEqual({
      vendas: { kind: "known", value: 0 },
      animais: { kind: "known", value: 0 },
      peso: { kind: "known", value: 0 },
      valor: { kind: "known", value: 0 },
    });
    expect(vendasParaTotaisRodape([cancelada], "cancelado").map(v => v.id)).toEqual([3]);
    expect(vendasParaTotaisRodape([vendaValidada, cancelada, pendente], "concluido").map(v => v.id)).toEqual([1]);
    expect(vendasParaTotaisRodape([vendaValidada, pendente], FILTRO_TODOS).map(v => v.id)).toEqual([1]);
    expect(vendasParaTotaisRodape([pendente], "pendente").map(v => v.id)).toEqual([4]);
    expect(vendasParaTotaisRodape([])).toEqual([]);
  });

  it("mapeia o Select visual para o valor persistido enviado ao vendas.list", () => {
    expect(statusQueryVendasListagem("")).toBeUndefined();
    expect(statusQueryVendasListagem(FILTRO_TODOS)).toBeUndefined();
    expect(statusQueryVendasListagem("pendente")).toBe("pendente");
    expect(statusQueryVendasListagem("concluido")).toBe("concluido");
    expect(statusQueryVendasListagem("cancelado")).toBe("cancelado");
    expect(statusQueryVendasListagem("Cancelada")).toBeUndefined();
    expect(statusQueryVendasListagem("concluida")).toBeUndefined();
    expect(labelStatusVenda("pendente")).toBe("Pendente");
    expect(labelStatusVenda("concluido")).toBe("Concluída");
    expect(labelStatusVenda("cancelado")).toBe("Cancelada");
  });

  it("filtro de status: cancelada só em Todos/Cancelada; concluída só em Todos/Concluída; pendente só em Todos/Pendente", () => {
    const cancelada = { ...vendaValidada, id: 1, status: "cancelado" };
    const concluida = { ...vendaValidada, id: 2, status: "concluido" };
    const pendente = { ...vendaValidada, id: 3, status: "pendente", pesoTotal: null };
    const lista = [cancelada, concluida, pendente];
    const ids = (status?: string) => filtrarVendasListagem(lista, { status }).map(v => v.id);

    expect(ids()).toEqual([1, 2, 3]);
    expect(ids(FILTRO_TODOS)).toEqual([1, 2, 3]);
    expect(ids("cancelado")).toEqual([1]);
    expect(ids("concluido")).toEqual([2]);
    expect(ids("pendente")).toEqual([3]);
    expect(ids("concluido")).not.toContain(1);
    expect(ids("pendente")).not.toContain(1);
  });

  it("rodapé Todos zera o efetivo se só há cancelada; Cancelada soma o histórico", () => {
    const cancelada = { ...vendaValidada, id: 1, status: "cancelado" };
    expect(resumirVendasListagem(vendasParaTotaisRodape([cancelada], FILTRO_TODOS))).toEqual({
      vendas: { kind: "known", value: 0 },
      animais: { kind: "known", value: 0 },
      peso: { kind: "known", value: 0 },
      valor: { kind: "known", value: 0 },
    });
    expect(resumirVendasListagem(vendasParaTotaisRodape([cancelada], "cancelado"))).toEqual({
      vendas: { kind: "known", value: 1 },
      animais: { kind: "known", value: 2 },
      peso: { kind: "known", value: 450 },
      valor: { kind: "known", value: 4612.5 },
    });
    expect(modoTotaisRodapeVendas("cancelado")).toBe("canceladas");
    expect(modoTotaisRodapeVendas(FILTRO_TODOS)).toBe("efetivo");
  });

  it("paginação e totais usam o conjunto já filtrado, não a página isolada", () => {
    const lista = Array.from({ length: 12 }, (_, i) => ({
      ...vendaValidada,
      id: i + 1,
      status: i === 0 ? "cancelado" : "concluido",
    }));
    const filtradas = filtrarVendasListagem(lista, { status: "concluido" });
    expect(filtradas).toHaveLength(11);
    expect(filtradas.every(v => v.status === "concluido")).toBe(true);
    expect(filtradas.map(v => v.id)).not.toContain(1);

    const pageSize = 10;
    expect(filtradas.slice(0, pageSize)).toHaveLength(10);
    expect(filtradas.slice(pageSize)).toHaveLength(1);
    expect(resumirVendasListagem(vendasParaTotaisRodape(filtradas, "concluido")).vendas).toEqual({
      kind: "known",
      value: 11,
    });
    expect(resumirVendasListagem(vendasParaTotaisRodape(filtradas, "concluido")).animais).toEqual({
      kind: "known",
      value: 22,
    });
  });

  it("mistura concluída + cancelada: Todos soma só a concluída; filtro Cancelada isola o histórico", () => {
    const cancelada = { ...vendaValidada, id: 3, status: "cancelado" };
    const todos = [vendaValidada, cancelada];
    const efetivas = vendasParaTotaisRodape(todos, FILTRO_TODOS);
    expect(resumirVendasListagem(efetivas)).toEqual({
      vendas: { kind: "known", value: 1 },
      animais: { kind: "known", value: 2 },
      peso: { kind: "known", value: 450 },
      valor: { kind: "known", value: 4612.5 },
    });
    expect(resumirVendasListagem(vendasParaTotaisRodape(todos, "cancelado")).valor).toEqual({
      kind: "known",
      value: 4612.5,
    });
  });

  it("1) rodapé de Vendas apresenta Vendas: X no mesmo recorte de Animais/Peso/Valor", () => {
    expect(vendasPage).toContain("Vendas:");
    expect(vendasPage).toContain("totaisRodape.resumo.vendas");
    expect(vendasPage.indexOf("Vendas:")).toBeLessThan(vendasPage.indexOf("Animais:"));
    expect(vendasPage).toContain("vendasParaTotaisRodape(filtradas");
    expect(vendasPage).toContain("resumirVendasListagem(linhas)");
  });

  it("2-4) a contagem usa o mesmo conjunto: concluída entra, cancelada sai no efetivo", () => {
    const cancelada = { ...vendaValidada, id: 3, status: "cancelado", quantidadeAnimais: 8, pesoTotal: 200, valorTotalNumero: 900 };
    const linhas = vendasParaTotaisRodape([vendaValidada, cancelada], FILTRO_TODOS);
    const resumo = resumirVendasListagem(linhas);
    expect(linhas).toHaveLength(resumo.vendas.kind === "known" ? resumo.vendas.value : -1);
    expect(resumo.vendas).toEqual({ kind: "known", value: 1 });
    expect(resumo.animais).toEqual({ kind: "known", value: 2 });
    expect(resumo.peso).toEqual({ kind: "known", value: 450 });
    expect(resumo.valor).toEqual({ kind: "known", value: 4612.5 });
  });

  it("5) aviso de canceladas permanece só no recorte efetivo", () => {
    expect(vendasPage).toContain("Canceladas não incluídas nos totais");
    expect(vendasPage).toContain('totaisRodape.modo === "efetivo" && totaisRodape.excluidas > 0');
  });

  it("6) filtro Cancelada resume o conjunto cancelado, inclusive Vendas: X", () => {
    const canceladas = [
      { ...vendaValidada, id: 10, status: "cancelado" },
      { ...vendaValidada, id: 11, status: "cancelado", quantidadeAnimais: 4, pesoTotal: 100, valorTotalNumero: 500 },
      { ...vendaValidada, id: 12, status: "cancelado", quantidadeAnimais: 1, pesoTotal: 50, valorTotalNumero: 200 },
    ];
    const resumo = resumirVendasListagem(vendasParaTotaisRodape(canceladas, "cancelado"));
    expect(resumo.vendas).toEqual({ kind: "known", value: 3 });
    expect(resumo.animais).toEqual({ kind: "known", value: 7 });
  });

  it("7-10) filtros de fazenda, comprador, período e busca atualizam a quantidade", () => {
    const daJ = { ...vendaValidada, fazendaId: 1, comprador: "Frigorífico São Paulo", data: "2026-09-19" };
    const daB = {
      ...vendaValidada,
      id: 2,
      fazendaId: 2,
      comprador: "Outro",
      data: "2026-08-01",
      quantidadeAnimais: 1,
      valorTotalNumero: 100,
    };
    const lista = [daJ, daB];
    const contar = (filtros: Parameters<typeof filtrarVendasListagem>[1]) =>
      resumirVendasListagem(vendasParaTotaisRodape(filtrarVendasListagem(lista, filtros), FILTRO_TODOS)).vendas;

    expect(contar({ fazendaId: 1 })).toEqual({ kind: "known", value: 1 });
    expect(contar({ comprador: "Outro" })).toEqual({ kind: "known", value: 1 });
    expect(contar({ periodoDe: "2026-09-01", periodoAte: "2026-09-30" })).toEqual({ kind: "known", value: 1 });
    expect(contar({ busca: "frigor" })).toEqual({ kind: "known", value: 1 });
    expect(contar({})).toEqual({ kind: "known", value: 2 });
  });

  it("11-13) paginação não muda o rodapé; Mostrando usa as linhas filtradas", () => {
    const lista = [
      { ...vendaValidada, id: 1, status: "concluido" },
      { ...vendaValidada, id: 2, status: "cancelado" },
      { ...vendaValidada, id: 3, status: "concluido", quantidadeAnimais: 3, pesoTotal: 100, valorTotalNumero: 300 },
    ];
    const filtradas = filtrarVendasListagem(lista, {});
    const resumoPagina1 = resumirVendasListagem(vendasParaTotaisRodape(filtradas, FILTRO_TODOS));
    const resumoPagina2 = resumirVendasListagem(vendasParaTotaisRodape(filtradas, FILTRO_TODOS));
    expect(resumoPagina1).toEqual(resumoPagina2);
    expect(resumoPagina1.vendas).toEqual({ kind: "known", value: 2 });
    expect(filtradas).toHaveLength(3);
    expect(vendasPage).toContain("totalItems={filtradas.length}");
    expect(vendasPage).toContain('itemLabel="vendas"');
    expect(vendasPage).not.toContain("vendasParaTotaisRodape(pageItems");
  });

  it("14) Compras permanece com Compras: X e não foi mexida nesta tarefa", () => {
    expect(comprasPage).toContain("Compras:");
    expect(comprasPage).toContain("comprasParaTotaisRodape(filtradas");
    expect(comprasPage).not.toContain("totaisRodape.resumo.vendas");
    expect(comprasPage.indexOf("Compras:")).toBeLessThan(comprasPage.indexOf("Animais:"));
  });
});
