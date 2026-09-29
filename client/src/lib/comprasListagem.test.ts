import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildExportSpreadsheetBuffer } from "@shared/buildExportSpreadsheet";
import {
  FILTRO_TODOS,
  COMPRAS_LISTAGEM_CABECALHOS,
  COMPRAS_LISTAGEM_EXPORT_HEADERS,
  comprasParaTotaisRodape,
  custoMedioKgCompraListagem,
  FILTRO_IDENTIFICACAO_PENDENTE,
  compraTemIdentificacaoPendente,
  compraVendaComprasListagemPath,
  filtrarComprasListagem,
  filtrosComprasDaQuery,
  filtrosSecundariosComprasVazios,
  formatarAnimaisCelulaCompras,
  formatarDataCompraListagem,
  formatarMoedaCelulaCompras,
  formatarPesoCelulaCompras,
  formatarPesoRodapeCompras,
  formatarQuantidadeRodapeCompras,
  formatarValorRodapeCompras,
  linhaCelulasComprasListagem,
  linhaTotaisExportComprasListagem,
  linhasExportComprasListagem,
  intervaloDatasListagemInvalido,
  modoTotaisRodapeCompras,
  nomeArquivoExportComprasListagem,
  opcoesFornecedorCompra,
  opcoesStatusCompra,
  ordenarComprasListagemPorData,
  paginarComprasListagem,
  pesoComercialCompraListagem,
  resumirComprasListagem,
  statusQueryComprasListagem,
  valorComercialCompraListagem,
  type CompraListagemRow,
} from "./comprasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const modulePages = readFileSync(resolve(here, "../pages/ModulePages.tsx"), "utf8");
const comprasPage = modulePages.slice(
  modulePages.indexOf("export function PurchasesPage"),
  modulePages.indexOf("const VENDA_FILTRO_SELECT_EMPTY"),
);
const vendasPage = modulePages.slice(modulePages.indexOf("export function SalesPage"));
const listagemServer = readFileSync(resolve(here, "../../../server/comprasListagem.ts"), "utf8");
const router = readFileSync(resolve(here, "../../../server/routers.ts"), "utf8");

const fazendaJ = 1;
const fazendaB = 2;
const fornecedorX = 10;
const fornecedorY = 11;

const compraA = {
  id: 9002,
  data: "2026-09-10",
  fornecedor: "Agro X",
  fornecedorId: fornecedorX,
  fazendaId: fazendaJ,
  quantidadeAnimais: 20,
  valorTotal: "10000",
  custoTotal: "10000",
  pesoTotal: "4400",
  status: "concluido",
};
const compraB = {
  id: 9003,
  data: "2026-09-20",
  fornecedor: "Agro Y",
  fornecedorId: fornecedorY,
  fazendaId: fazendaJ,
  quantidadeAnimais: 5,
  valorTotal: "2000",
  custoTotal: "2000",
  pesoTotal: "900",
  status: "cancelado",
};
const compraOutraFazenda = {
  id: 9004,
  data: "2026-09-15",
  fornecedor: "Agro X",
  fornecedorId: fornecedorX,
  fazendaId: fazendaB,
  quantidadeAnimais: 8,
  valorTotal: "3000",
  custoTotal: "3000",
  pesoTotal: "1600",
  status: "concluido",
};

const lista = [compraA, compraB, compraOutraFazenda];

describe("comprasListagem — filtros no padrão de Vendas", () => {
  it("A) sem filtros adicionais devolve a lista da fazenda", () => {
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaJ }).map(c => c.id)).toEqual([9002, 9003]);
  });

  it("B) Fazenda isola as compras", () => {
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaJ }).every(c => c.fazendaId === fazendaJ)).toBe(true);
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaB }).map(c => c.id)).toEqual([9004]);
  });

  it("C) Fornecedor filtra pelo ID, não pelo texto", () => {
    expect(
      filtrarComprasListagem(lista, { fazendaId: fazendaJ, fornecedorId: fornecedorX }).map(c => c.id),
    ).toEqual([9002]);
    expect(
      filtrarComprasListagem(
        [{ ...compraB, fornecedor: "Agro X", fornecedorId: fornecedorY }],
        { fornecedorId: fornecedorX },
      ),
    ).toEqual([]);
  });

  it("D) Data inicial abre o intervalo", () => {
    expect(
      filtrarComprasListagem(lista, { fazendaId: fazendaJ, periodoDe: "2026-09-15" }).map(c => c.id),
    ).toEqual([9003]);
  });

  it("E) Data final abre o intervalo", () => {
    expect(
      filtrarComprasListagem(lista, { fazendaId: fazendaJ, periodoAte: "2026-09-15" }).map(c => c.id),
    ).toEqual([9002]);
  });

  it("F) Data inicial + final recorta o período", () => {
    expect(
      filtrarComprasListagem(lista, {
        fazendaId: fazendaJ,
        periodoDe: "2026-09-01",
        periodoAte: "2026-09-12",
      }).map(c => c.id),
    ).toEqual([9002]);
    expect(intervaloDatasListagemInvalido("2026-09-20", "2026-09-10")).toBe(true);
    expect(intervaloDatasListagemInvalido("2026-09-10", "2026-09-20")).toBe(false);
  });

  it("G) Status usa só os valores reais", () => {
    expect(opcoesStatusCompra()).toEqual([
      { value: FILTRO_TODOS, label: "Todos" },
      { value: "concluido", label: "Concluída" },
      { value: "cancelado", label: "Cancelada" },
    ]);
    expect(
      filtrarComprasListagem(lista, { fazendaId: fazendaJ, status: "cancelado" }).map(c => c.id),
    ).toEqual([9003]);
    expect(statusQueryComprasListagem(FILTRO_TODOS)).toBeUndefined();
    expect(statusQueryComprasListagem("concluido")).toBe("concluido");
  });

  it("identificação pendente recorta só compras concluídas com animal em aberto", () => {
    const comPendente = { ...compraA, identificados: 0 };
    const jaRecebida = { ...compraA, id: 9010, identificados: 20 };
    const cancelada = { ...compraB, quantidadeAnimais: 8, identificados: 0 };
    expect(compraTemIdentificacaoPendente(comPendente)).toBe(true);
    expect(compraTemIdentificacaoPendente(jaRecebida)).toBe(false);
    expect(compraTemIdentificacaoPendente(cancelada)).toBe(false);
    expect(
      filtrarComprasListagem([comPendente, jaRecebida, cancelada], {
        fazendaId: fazendaJ,
        identificacao: FILTRO_IDENTIFICACAO_PENDENTE,
      }).map(c => c.id),
    ).toEqual([9002]);
    expect(filtrosComprasDaQuery("")).toBeNull();
    expect(filtrosComprasDaQuery("?identificacao=pendente&de=2026-09-01&ate=2026-09-30")).toEqual({
      periodoDe: "2026-09-01",
      periodoAte: "2026-09-30",
      fornecedorId: "",
      status: "",
      identificacao: FILTRO_IDENTIFICACAO_PENDENTE,
    });
    expect(
      filtrosComprasDaQuery(
        "?identificacao=pendente&de=2026-09-01&ate=2026-09-30&retorno=%2Fcompra-venda%2Fvisao-geral",
      ),
    ).toEqual({
      periodoDe: "2026-09-01",
      periodoAte: "2026-09-30",
      fornecedorId: "",
      status: "",
      identificacao: FILTRO_IDENTIFICACAO_PENDENTE,
    });
    expect(
      compraVendaComprasListagemPath({
        identificacao: FILTRO_IDENTIFICACAO_PENDENTE,
        de: "2026-09-01",
        ate: "2026-09-30",
      }),
    ).toBe("/compra-venda/compras?identificacao=pendente&de=2026-09-01&ate=2026-09-30");
    expect(comprasPage).toContain("parseRetornoCompraVendaVisaoGeral");
    expect(comprasPage).toContain('aria-label="Voltar"');
  });

  it("H) Fornecedor + datas + status combinam com AND", () => {
    expect(
      filtrarComprasListagem(lista, {
        fazendaId: fazendaJ,
        fornecedorId: fornecedorX,
        periodoDe: "2026-09-01",
        periodoAte: "2026-09-30",
        status: "concluido",
      }).map(c => c.id),
    ).toEqual([9002]);
    expect(
      filtrarComprasListagem(lista, {
        fazendaId: fazendaJ,
        fornecedorId: fornecedorX,
        periodoDe: "2026-09-01",
        periodoAte: "2026-09-30",
        status: "cancelado",
      }),
    ).toEqual([]);
  });

  it("I) Busca olha fornecedor e data", () => {
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaJ, busca: "agro y" }).map(c => c.id)).toEqual([
      9003,
    ]);
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaJ, busca: "2026-09-10" }).map(c => c.id)).toEqual([
      9002,
    ]);
  });

  it("J) Limpar volta ao estado inicial sem mexer na fazenda", () => {
    expect(filtrosSecundariosComprasVazios()).toEqual({
      periodoDe: "",
      periodoAte: "",
      fornecedorId: "",
      status: "",
      identificacao: "",
    });
    expect(comprasPage).toContain("limparFiltrosSecundarios");
    expect(comprasPage).toContain("setFazendaId");
    expect(comprasPage).not.toMatch(/limparFiltrosSecundarios[\s\S]{0,200}setFazendaId\(""\)/);
  });

  it("K) nenhum resultado devolve lista vazia", () => {
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaJ, busca: "xyz-inexistente" })).toEqual([]);
    expect(comprasPage).toContain("Nenhuma compra encontrada com os filtros aplicados.");
  });

  it("L) paginação corta o conjunto já filtrado", () => {
    const filtradas = filtrarComprasListagem(lista, { fazendaId: fazendaJ });
    expect(paginarComprasListagem(filtradas, 1, 1).map(c => c.id)).toEqual([9002]);
    expect(paginarComprasListagem(filtradas, 2, 1).map(c => c.id)).toEqual([9003]);
    expect(comprasPage).toContain("TablePaginationFooter");
    expect(comprasPage).toContain("totalItems={filtradas.length}");
  });

  it("M) isolamento por fazenda e userId no backend se mantém", () => {
    expect(listagemServer).toContain("eq(compras.userId, where.userId)");
    expect(listagemServer).toContain("eq(compras.fazendaId, where.fazendaId)");
    expect(router).toContain("comprasListInputSchema");
    expect(router).toContain("listarComprasDoUsuario(ctx.user.id, input)");
    expect(filtrarComprasListagem(lista, { fazendaId: fazendaJ }).some(c => c.fazendaId === fazendaB)).toBe(
      false,
    );
  });

  it("opções de fornecedor usam o ID real", () => {
    expect(
      opcoesFornecedorCompra([
        { id: fornecedorY, nome: "Agro Y" },
        { id: fornecedorX, nome: "Agro X" },
      ]),
    ).toEqual([
      { value: FILTRO_TODOS, label: "Todos" },
      { value: String(fornecedorX), label: "Agro X" },
      { value: String(fornecedorY), label: "Agro Y" },
    ]);
  });

  it("tela reusa o bloco de filtros de Vendas, sem clonar a tabela", () => {
    expect(comprasPage).toContain("Fazenda");
    expect(comprasPage).toContain("Fornecedor");
    expect(comprasPage).toContain("Data inicial");
    expect(comprasPage).toContain("Data final");
    expect(comprasPage).toContain("Buscar por fornecedor ou data");
    expect(comprasPage).toContain("Mais filtros");
    expect(comprasPage).toContain("Identificação");
    expect(comprasPage).toContain("opcoesIdentificacaoCompra");
    expect(comprasPage).toContain("Limpar");
    expect(comprasPage).toContain("Filtrar");
    expect(comprasPage).toContain("VendaFilterSelect");
    expect(comprasPage).toContain("FormDatePicker");
    expect(comprasPage).toContain("Nova Compra");
    expect(comprasPage).not.toContain("Gerenciar Fornecedores");
    expect(comprasPage).toContain('label="Ver detalhes"');
    expect(comprasPage).not.toContain("Recebimento");
    expect(comprasPage).not.toContain("useAt05Reader");
    expect(comprasPage).not.toContain("useTruTestBleReader");
    expect(vendasPage).toContain("Buscar por comprador ou data");
    expect(vendasPage).toContain("Mais filtros");
  });

  it("exportação sugere o nome com a fazenda, no padrão de Vendas", () => {
    expect(nomeArquivoExportComprasListagem("Fazenda J")).toBe("compras-fazenda-j");
    expect(nomeArquivoExportComprasListagem("Sítio São João")).toBe("compras-sitio-sao-joao");
    expect(nomeArquivoExportComprasListagem("")).toBe("compras");
    expect(comprasPage).toContain("nomeArquivoExportComprasListagem");
    expect(comprasPage).toContain("filename={exportFilenameBase}");
    expect(comprasPage).toContain('tituloQuadro = fazendaSelecionadaNome ? `Compras — ${fazendaSelecionadaNome}` : "Compras"');
    expect(comprasPage).toContain("{tituloQuadro}");
    expect(comprasPage).toContain("title={tituloQuadro}");
    expect(vendasPage).toContain("{tituloQuadro}");
    expect(comprasPage).toContain("disabled={exportDisabled}");
    expect(comprasPage).not.toContain('filename="compras"');
    expect(vendasPage).toContain("filename={exportFilenameBase}");
    expect(comprasPage).toContain("COMPRAS_LISTAGEM_EXPORT_HEADERS");
    expect(comprasPage).toContain("linhasExportComprasListagem(ordenadas");
    expect(comprasPage).toContain('spreadsheetSheetName="Compras"');
    expect(comprasPage).toContain("spreadsheetReportTitle={() => exportTitleLine}");
    expect(comprasPage).toContain("spreadsheetFooterRowCount={exportLinhas.length > 0 ? 1 : 0}");
    expect(comprasPage).toContain("pdfShowRegistrosSubtitle={false}");
    expect(comprasPage).toContain("pdfIncludeSpreadsheetTitle={false}");
    expect(comprasPage).toContain('exportTitleLine = `${(fazendaSelecionadaNome || "").trim() || "Fazenda"} — Compras`');
  });
});

describe("comprasListagem — rodapé no padrão de Vendas", () => {
  const compraC = {
    id: 9005,
    data: "2026-09-28",
    fornecedor: "Agro X",
    fornecedorId: fornecedorX,
    fazendaId: fazendaJ,
    quantidadeAnimais: 25,
    valorTotal: "117564.25",
    custoTotal: "117564.25",
    pesoTotal: "3477",
    status: "concluido",
  };
  const daJ = [compraA, compraB, compraC];

  it("1) a faixa de resumo aparece na Lista de Compras", () => {
    expect(comprasPage).toContain("totaisRodape");
    expect(comprasPage).toContain("Compras:");
    expect(comprasPage).toContain("Animais:");
    expect(comprasPage).toContain("Peso:");
    expect(comprasPage).toContain("Valor total");
    expect(comprasPage).toContain("Canceladas não incluídas nos totais");
    expect(comprasPage).toContain("bg-gray-50/60");
    expect(comprasPage).toContain("flex flex-wrap items-center justify-between");
    expect(comprasPage).toContain("TableHorizontalScroll");
  });

  it("2) quantidade de Compras é o recorte efetivo, não a página", () => {
    const filtradas = filtrarComprasListagem(daJ, { fazendaId: fazendaJ });
    const efetivas = comprasParaTotaisRodape(filtradas, FILTRO_TODOS);
    expect(resumirComprasListagem(efetivas).compras).toEqual({ kind: "known", value: 2 });
    expect(comprasPage).toContain("comprasParaTotaisRodape(filtradas");
    expect(comprasPage).toContain("resumirComprasListagem(linhas)");
  });

  it("3) animais somam a quantidade comercial", () => {
    const filtradas = filtrarComprasListagem(daJ, { fazendaId: fazendaJ });
    const efetivas = comprasParaTotaisRodape(filtradas, FILTRO_TODOS);
    expect(resumirComprasListagem(efetivas).animais).toEqual({ kind: "known", value: 45 });
  });

  it("4) peso usa só o peso adquirido/comercial da Compra", () => {
    const filtradas = filtrarComprasListagem(daJ, { fazendaId: fazendaJ });
    const efetivas = comprasParaTotaisRodape(filtradas, FILTRO_TODOS);
    expect(resumirComprasListagem(efetivas).peso).toEqual({ kind: "known", value: 7877 });
    expect(pesoComercialCompraListagem(compraA)).toBe(4400);
  });

  it("5) peso NÃO usa pesagens do Recebimento", () => {
    const comPesagemZootecnica = {
      ...compraA,
      pesoTotal: "4400",
      pesoEntrada: 9999,
      pesoAtual: 8888,
    } as CompraListagemRow & { pesoEntrada: number; pesoAtual: number };
    expect(pesoComercialCompraListagem(comPesagemZootecnica)).toBe(4400);
    const semPesoComercial = {
      ...compraA,
      pesoTotal: null,
      pesoEntrada: 9999,
      pesoAtual: 8888,
    } as CompraListagemRow & { pesoEntrada: number; pesoAtual: number };
    expect(resumirComprasListagem([semPesoComercial]).peso).toEqual({ kind: "unknown" });
    expect(listagemServer).not.toContain("pesoEntrada");
    expect(listagemServer).not.toContain("pesoAtual");
    expect(listagemServer).not.toContain("receberAnimal");
    expect(listagemServer).not.toContain("compraRecebimentos");
  });

  it("6) valor total usa o total comercial (custoTotal / valorTotal)", () => {
    const filtradas = filtrarComprasListagem(daJ, { fazendaId: fazendaJ });
    const efetivas = comprasParaTotaisRodape(filtradas, FILTRO_TODOS);
    expect(resumirComprasListagem(efetivas).valor).toEqual({ kind: "known", value: 127564.25 });
    expect(valorComercialCompraListagem({ ...compraA, custoTotal: "108000", valorTotal: "1" })).toBe(108000);
    expect(valorComercialCompraListagem({ ...compraA, custoTotal: null, valorTotal: "2500.5" })).toBe(2500.5);
  });

  it("7) compras canceladas não entram nos totais efetivos", () => {
    expect(modoTotaisRodapeCompras(FILTRO_TODOS)).toBe("efetivo");
    expect(modoTotaisRodapeCompras("concluido")).toBe("efetivo");
    expect(modoTotaisRodapeCompras("cancelado")).toBe("canceladas");
    const filtradas = filtrarComprasListagem(daJ, { fazendaId: fazendaJ });
    expect(comprasParaTotaisRodape(filtradas, FILTRO_TODOS).map(c => c.id)).toEqual([9002, 9005]);
    expect(comprasParaTotaisRodape(filtradas, "cancelado").map(c => c.id)).toEqual([9003]);
    expect(resumirComprasListagem(comprasParaTotaisRodape([compraB], FILTRO_TODOS))).toEqual({
      compras: { kind: "known", value: 0 },
      animais: { kind: "known", value: 0 },
      peso: { kind: "known", value: 0 },
      valor: { kind: "known", value: 0 },
    });
    expect(comprasPage).toContain("totaisRodape.excluidas > 0");
  });

  it("8) filtros atualizam o resumo do conjunto filtrado", () => {
    const soFornecedorX = filtrarComprasListagem(daJ, { fazendaId: fazendaJ, fornecedorId: fornecedorX });
    const resumo = resumirComprasListagem(comprasParaTotaisRodape(soFornecedorX, FILTRO_TODOS));
    expect(resumo.compras).toEqual({ kind: "known", value: 2 });
    expect(resumo.animais).toEqual({ kind: "known", value: 45 });
    expect(resumo.peso).toEqual({ kind: "known", value: 7877 });
    expect(resumo.valor).toEqual({ kind: "known", value: 127564.25 });

    const soAgroY = filtrarComprasListagem(daJ, { fazendaId: fazendaJ, busca: "agro y" });
    expect(resumirComprasListagem(comprasParaTotaisRodape(soAgroY, FILTRO_TODOS)).compras).toEqual({
      kind: "known",
      value: 0,
    });
    expect(resumirComprasListagem(comprasParaTotaisRodape(soAgroY, "cancelado")).compras).toEqual({
      kind: "known",
      value: 1,
    });
  });

  it("9) paginação não muda o total do conjunto filtrado", () => {
    const filtradas = filtrarComprasListagem(daJ, { fazendaId: fazendaJ });
    const resumoFiltrado = resumirComprasListagem(comprasParaTotaisRodape(filtradas, FILTRO_TODOS));
    const pagina1 = paginarComprasListagem(filtradas, 1, 1);
    const pagina2 = paginarComprasListagem(filtradas, 2, 1);
    expect(pagina1).toHaveLength(1);
    expect(pagina2).toHaveLength(1);
    expect(resumirComprasListagem(comprasParaTotaisRodape(pagina1, FILTRO_TODOS))).not.toEqual(resumoFiltrado);
    expect(comprasPage).toContain("comprasParaTotaisRodape(filtradas");
    expect(comprasPage).not.toContain("comprasParaTotaisRodape(pageItems");
    expect(comprasPage).toContain("totalItems={filtradas.length}");
  });

  it("10) formatação monetária pt-BR", () => {
    expect(formatarValorRodapeCompras({ kind: "known", value: 129564.25 }).replace(/\u00a0/g, " ")).toBe(
      "R$ 129.564,25",
    );
    expect(formatarValorRodapeCompras({ kind: "unknown" })).toBe("—");
  });

  it("11) peso formatado no padrão da listagem", () => {
    expect(formatarPesoRodapeCompras({ kind: "known", value: 8777 })).toBe("8.777 kg");
    expect(formatarPesoRodapeCompras({ kind: "known", value: 51.5 })).toBe("51,5 kg");
    expect(formatarQuantidadeRodapeCompras({ kind: "known", value: 50 })).toBe("50");
  });

  it("12) data da Compra aparece em dd/mm/aaaa", () => {
    expect(formatarDataCompraListagem("2026-09-28")).toBe("28/09/2026");
    expect(formatarDataCompraListagem("2026-09-24")).toBe("24/09/2026");
    expect(formatarDataCompraListagem("2026-09-28T00:00:00.000Z")).toBe("28/09/2026");
    expect(comprasPage).toContain("formatarDataCompraListagem(c.data)");
    expect(comprasPage).not.toMatch(/\{c\.data\}/);
  });

  it("13) nenhuma data é alterada no banco — só apresentação", () => {
    const persistida = "2026-09-28";
    expect(formatarDataCompraListagem(persistida)).toBe("28/09/2026");
    expect(persistida).toBe("2026-09-28");
    expect(comprasPage).not.toContain("compras.update");
    expect(comprasPage).not.toContain("compras.create");
    expect(listagemServer).not.toContain(".update(");
    expect(listagemServer).toContain(".select()");
  });

  it("14) paginação continua no rodapé, abaixo da faixa", () => {
    expect(comprasPage).toContain("TablePaginationFooter");
    expect(comprasPage).toContain('itemLabel="compras"');
    expect(comprasPage.indexOf("Compras:")).toBeLessThan(comprasPage.indexOf("TablePaginationFooter"));
    expect(comprasPage.indexOf("Canceladas não incluídas nos totais")).toBeLessThan(
      comprasPage.lastIndexOf("TablePaginationFooter"),
    );
  });

  it("15) ações existentes da listagem permanecem", () => {
    expect(comprasPage).toContain('label="Ver detalhes"');
    expect(comprasPage).toContain('label="Cancelar compra"');
    expect(comprasPage).toContain("compraVendaCompraDetalhePath");
    expect(comprasPage).toContain("setCancelarId");
    expect(comprasPage).toContain("Nova Compra");
    expect(comprasPage).toContain("Valor Total");
    expect(comprasPage).toContain("Ações");
    expect(comprasPage).not.toContain("Recebimento");
  });

  it("coluna Data tem a mesma seta de ordenação de Vendas", () => {
    expect(ordenarComprasListagemPorData(daJ, false).map(c => c.id)).toEqual([9005, 9003, 9002]);
    expect(ordenarComprasListagemPorData(daJ, true).map(c => c.id)).toEqual([9002, 9003, 9005]);
    expect(comprasPage).toContain("VendaSortIcon");
    expect(comprasPage).toContain("setSortAsc");
    expect(comprasPage).toContain("ordenarComprasListagemPorData(filtradas, sortAsc)");
    expect(comprasPage).toContain("paginarComprasListagem(ordenadas");
    expect(vendasPage).toContain("VendaSortIcon active asc={sortAsc}");
  });
});

describe("comprasListagem — colunas no padrão de Vendas", () => {
  const thead = (() => {
    const start = comprasPage.indexOf("<thead");
    const end = comprasPage.indexOf("</thead>");
    return comprasPage.slice(start, end);
  })();

  const compraComFrete: CompraListagemRow = {
    id: 9101,
    data: "2026-09-28",
    fornecedor: "Agro X",
    quantidadeAnimais: 2,
    precoUnitario: "10.25",
    valorAnimais: "3864.25",
    frete: "800",
    outrosCustos: "0",
    custoTotal: "4664.25",
    valorTotal: "4664.25",
    pesoTotal: "377",
    status: "concluido",
  } as CompraListagemRow & {
    precoUnitario: string;
    valorAnimais: string;
    frete: string;
    outrosCustos: string;
  };

  it("1) cabeçalhos na mesma ordem de Vendas, com Fornecedor no lugar de Comprador", () => {
    expect([...COMPRAS_LISTAGEM_CABECALHOS]).toEqual([
      "Data",
      "Fornecedor",
      "Animais",
      "Peso",
      "R$/kg médio",
      "Valor Total",
      "Status",
      "Ações",
    ]);
    let pos = -1;
    for (const cabecalho of COMPRAS_LISTAGEM_CABECALHOS) {
      const next = thead.indexOf(cabecalho, pos + 1);
      expect(next).toBeGreaterThan(pos);
      pos = next;
    }
    expect(vendasPage).toContain("Comprador");
    expect(vendasPage).toContain("R$/kg médio");
  });

  it("2) QTD não aparece mais como cabeçalho", () => {
    expect(thead).not.toMatch(/\bQtd\b/);
    expect(thead).not.toContain("QTD");
    expect(thead).toContain("Animais");
  });

  it("3) ANIMAIS usa a quantidade comercial, não o recebimento", () => {
    const compra = {
      ...compraComFrete,
      quantidadeAnimais: 40,
      identificados: 4,
    } as CompraListagemRow & { identificados: number };
    expect(formatarAnimaisCelulaCompras(compra)).toBe("40");
    expect(linhaCelulasComprasListagem(compra)[2]).toBe("40");
    expect(comprasPage).toContain("formatarAnimaisCelulaCompras");
    expect(comprasPage).not.toContain("identificados");
  });

  it("4) PESO usa o peso comercial da Compra", () => {
    expect(formatarPesoCelulaCompras({ ...compraComFrete, pesoTotal: "8400" })).toBe("8.400 kg");
    expect(formatarPesoCelulaCompras({ ...compraComFrete, pesoTotal: "377" })).toBe("377 kg");
    expect(formatarPesoCelulaCompras({ ...compraComFrete, pesoTotal: "51.5" })).toBe("51,5 kg");
  });

  it("5) PESO não usa pesagens do Recebimento", () => {
    const comZootecnia = {
      ...compraComFrete,
      pesoTotal: "377",
      pesoEntrada: 999,
      pesoAtual: 888,
    } as CompraListagemRow & { pesoEntrada: number; pesoAtual: number };
    expect(formatarPesoCelulaCompras(comZootecnia)).toBe("377 kg");
    expect(custoMedioKgCompraListagem(comZootecnia)).toBe(12.37);
    expect(comprasPage).toContain("formatarPesoCelulaCompras");
    expect(comprasPage).not.toContain("pesoEntrada");
    expect(comprasPage).not.toContain("pesoAtual");
  });

  it("6) R$/kg médio usa custo total / peso comercial", () => {
    expect(custoMedioKgCompraListagem({ ...compraA, custoTotal: "108000", pesoTotal: "8400" })).toBe(12.86);
    expect(custoMedioKgCompraListagem(compraComFrete)).toBe(12.37);
  });

  it("7) frete entra no R$/kg médio", () => {
    const semFrete = { ...compraComFrete, custoTotal: "3864.25", frete: "0" };
    expect(custoMedioKgCompraListagem(semFrete)).toBe(10.25);
    expect(custoMedioKgCompraListagem(compraComFrete)).toBe(12.37);
  });

  it("8) outros custos entram no R$/kg médio", () => {
    const comOutros = { ...compraComFrete, custoTotal: "4764.25", outrosCustos: "100" };
    expect(custoMedioKgCompraListagem(comOutros)).toBe(12.64);
  });

  it("9) preço negociado não é confundido com o custo médio/kg", () => {
    expect(custoMedioKgCompraListagem(compraComFrete)).not.toBe(10.25);
    expect(formatarMoedaCelulaCompras(custoMedioKgCompraListagem(compraComFrete)).replace(/\u00a0/g, " ")).toBe(
      "R$ 12,37",
    );
    expect(comprasPage).toContain("custoMedioKgCompraListagem");
    expect(comprasPage).not.toContain("precoUnitario");
  });

  it("10) peso zero/null não divide", () => {
    expect(custoMedioKgCompraListagem({ ...compraComFrete, pesoTotal: null })).toBeNull();
    expect(custoMedioKgCompraListagem({ ...compraComFrete, pesoTotal: undefined })).toBeNull();
    expect(custoMedioKgCompraListagem({ ...compraComFrete, pesoTotal: "0" })).toBeNull();
    expect(formatarPesoCelulaCompras({ ...compraComFrete, pesoTotal: null })).toBe("—");
    expect(formatarPesoCelulaCompras({ ...compraComFrete, pesoTotal: "0" })).toBe("—");
    expect(formatarMoedaCelulaCompras(null)).toBe("—");
  });

  it("11) formatação pt-BR das células", () => {
    const semNbsp = (linha: string[]) => linha.map(celula => celula.replace(/\u00a0/g, " "));
    expect(semNbsp(linhaCelulasComprasListagem(compraComFrete))).toEqual([
      "28/09/2026",
      "Agro X",
      "2",
      "377 kg",
      "R$ 12,37",
      "R$ 4.664,25",
      "Concluída",
    ]);
  });

  it("12) VALOR TOTAL continua sendo o custo total comercial", () => {
    expect(valorComercialCompraListagem(compraComFrete)).toBe(4664.25);
    expect(comprasPage).toContain("valorComercialCompraListagem");
  });

  it("13) rodapé permanece no padrão anterior", () => {
    expect(comprasPage).toContain("totaisRodape");
    expect(comprasPage).toContain("Compras:");
    expect(comprasPage).toContain("Canceladas não incluídas nos totais");
    expect(comprasPage).toContain("comprasParaTotaisRodape(filtradas");
  });

  it("14) filtros permanecem", () => {
    expect(comprasPage).toContain("filtrarComprasListagem");
    expect(comprasPage).toContain("Fornecedor");
    expect(comprasPage).toContain("Data inicial");
    expect(comprasPage).toContain("Filtrar");
  });

  it("15) paginação permanece", () => {
    expect(comprasPage).toContain("TablePaginationFooter");
    expect(comprasPage).toContain("totalItems={filtradas.length}");
    expect(comprasPage).toContain("paginarComprasListagem(ordenadas");
  });

  it("16) STATUS permanece", () => {
    expect(linhaCelulasComprasListagem({ ...compraComFrete, status: "cancelado" })[6]).toBe("Cancelada");
    expect(comprasPage).toContain("labelStatusComercialCompra");
  });

  it("17) AÇÕES permanecem", () => {
    expect(comprasPage).toContain('label="Ver detalhes"');
    expect(comprasPage).toContain('label="Cancelar compra"');
    expect(thead.indexOf("Ações")).toBeGreaterThan(thead.indexOf("Status"));
  });
});

describe("comprasListagem — Excel e PDF no padrão de Vendas", () => {
  const semNbsp = (linha: string[]) => linha.map(celula => celula.replace(/\u00a0/g, " "));
  const cancelada: CompraListagemRow = {
    id: 9201,
    data: "2026-09-19",
    fornecedor: "Agro X",
    quantidadeAnimais: 2,
    custoTotal: "4612.5",
    valorTotal: "4612.5",
    pesoTotal: "450",
    status: "cancelado",
  };

  it("cabeçalhos da exportação seguem a tabela, sem Ações", () => {
    expect([...COMPRAS_LISTAGEM_EXPORT_HEADERS]).toEqual([
      "Data",
      "Fornecedor",
      "Animais",
      "Peso",
      "R$/kg médio",
      "Valor Total",
      "Status",
    ]);
    expect(semNbsp(linhaCelulasComprasListagem(cancelada))).toEqual([
      "19/09/2026",
      "Agro X",
      "2",
      "450 kg",
      "R$ 10,25",
      "R$ 4.612,50",
      "Cancelada",
    ]);
  });

  it("totais da exportação repetem o rodapé: Todos zera cancelada; Cancelada soma o histórico", () => {
    expect(semNbsp(linhaTotaisExportComprasListagem([cancelada], FILTRO_TODOS))).toEqual([
      "Totais",
      "",
      "0",
      "0 kg",
      "",
      "R$ 0,00",
      "Canceladas não incluídas nos totais",
    ]);
    expect(semNbsp(linhaTotaisExportComprasListagem([cancelada], "cancelado"))).toEqual([
      "Totais (canceladas)",
      "",
      "2",
      "450 kg",
      "",
      "R$ 4.612,50",
      "",
    ]);
    const exportadas = linhasExportComprasListagem([cancelada], FILTRO_TODOS);
    expect(exportadas).toHaveLength(2);
    expect(exportadas[0]?.[6]).toBe("Cancelada");
    expect(exportadas[1]?.[0]).toBe("Totais");
  });

  it("Excel de compras centraliza as células e inclui a linha de totais do rodapé", async () => {
    const linhas = linhasExportComprasListagem([cancelada], FILTRO_TODOS);
    const buffer = await buildExportSpreadsheetBuffer([...COMPRAS_LISTAGEM_EXPORT_HEADERS], linhas, {
      reportTitle: "Fazenda J — Compras",
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
    expect(String(ws.getRow(1).getCell(1).value)).toBe("Fazenda J — Compras");
    expect(String(ws.getRow(3).getCell(7).value)).toBe("Cancelada");
    expect(ws.getRow(3).getCell(1).alignment?.horizontal).toBe("center");
    expect(ws.getRow(3).getCell(2).alignment?.horizontal).toBe("center");
    expect(String(ws.getRow(4).getCell(1).value)).toBe("Totais");
    expect(String(ws.getRow(4).getCell(3).value)).toBe("0");
    expect(String(ws.getRow(4).getCell(4).value)).toBe("0 kg");
    expect(String(ws.getRow(4).getCell(6).value).replace(/\u00a0/g, " ")).toBe("R$ 0,00");
    expect(String(ws.getRow(4).getCell(7).value)).toBe("Canceladas não incluídas nos totais");
  });
});
