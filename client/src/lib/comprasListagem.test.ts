import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FILTRO_TODOS,
  filtrarComprasListagem,
  filtrosSecundariosComprasVazios,
  intervaloDatasListagemInvalido,
  opcoesFornecedorCompra,
  opcoesStatusCompra,
  paginarComprasListagem,
  statusQueryComprasListagem,
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
});
