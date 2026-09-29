import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatDateBR } from "./date-utils";
import { formatarMetricaPeso, formatarMetricaValor } from "./compraVendaResumo";
import {
  LIMITE_OPERACOES_RECENTES_PAINEL,
  agruparSeriesTemporaisPainel,
  formatarEixoYValorPainel,
  granularidadeSeriePainel,
  intervaloTicksEixoXPainel,
  linhasTooltipSeriePainel,
  mediaPonderadaKgPainel,
  destinoAtencaoIdentificacao,
  destinoAtencaoPendencia,
  destinoAtencaoRecebimento,
  resumirAtencaoComprasPainel,
  resumoAtencaoPendencia,
  textoAtencaoPendencia,
  tituloAtencaoPendencia,
  rotuloAcaoAtencaoPainel,
  resumirPainelCompras,
  resumirPainelVendas,
  resumirPerfilComprasPainel,
  resumirPerfilVendasPainel,
} from "./compraVendaPainel";
import type { CompraListagemRow } from "./comprasListagem";
import type { VendaListagemRow } from "./vendasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/CompraVendaVisaoGeralPage.tsx"), "utf8");
const periodoSetembro = { de: "2026-09-01", ate: "2026-09-30" };

function compra(parcial: Partial<CompraListagemRow> & Pick<CompraListagemRow, "id">): CompraListagemRow {
  return {
    data: "2026-09-10",
    fornecedor: "Casa",
    quantidadeAnimais: 10,
    valorTotal: "1000",
    custoTotal: "1000",
    pesoTotal: 200,
    status: "concluido",
    ...parcial,
  };
}

function venda(parcial: Partial<VendaListagemRow> & Pick<VendaListagemRow, "id">): VendaListagemRow {
  return {
    data: "2026-09-12",
    comprador: "João",
    quantidadeAnimais: 4,
    quantidade: 4,
    valorTotal: "2000",
    valorTotalNumero: 2000,
    pesoTotal: 400,
    status: "concluido",
    ...parcial,
  };
}

describe("painel comercial Compra e Venda", () => {
  it("compra concluída entra nos totais", () => {
    const resumo = resumirPainelCompras(
      [compra({ id: 1, quantidadeAnimais: 40, custoTotal: "108000", valorTotal: "105000", pesoTotal: 8400 })],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 108000 });
    expect(resumo.animais).toEqual({ kind: "known", value: 40 });
    expect(resumo.peso).toEqual({ kind: "known", value: 8400 });
  });

  it("compra cancelada não entra", () => {
    const resumo = resumirPainelCompras(
      [
        compra({ id: 1, custoTotal: "1000", pesoTotal: 200 }),
        compra({ id: 2, status: "cancelado", custoTotal: "108000", quantidadeAnimais: 40, pesoTotal: 8400 }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 1000 });
    expect(resumo.animais).toEqual({ kind: "known", value: 10 });
    expect(resumo.recentes.map(r => r.id)).toEqual([1]);
  });

  it("venda concluída entra e cancelada não entra", () => {
    const resumo = resumirPainelVendas(
      [
        venda({ id: 10, valorTotalNumero: 5000, pesoTotal: 500, quantidadeAnimais: 5, quantidade: 5 }),
        venda({
          id: 11,
          status: "cancelado",
          valorTotalNumero: 9000,
          pesoTotal: 900,
          quantidadeAnimais: 9,
          quantidade: 9,
        }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 5000 });
    expect(resumo.animais).toEqual({ kind: "known", value: 5 });
    expect(resumo.peso).toEqual({ kind: "known", value: 500 });
    expect(resumo.recentes.map(r => r.id)).toEqual([10]);
  });

  it("animais comprados usam a quantidade comercial, não o recebimento", () => {
    const resumo = resumirPainelCompras(
      [compra({ id: 3, quantidadeAnimais: 40, identificacao: { identificados: 20 } } as CompraListagemRow)],
      periodoSetembro,
    );
    expect(resumo.animais).toEqual({ kind: "known", value: 40 });
  });

  it("peso comprado usa pesoTotal da Compra e ignora pesagem individual", () => {
    const resumo = resumirPainelCompras(
      [
        compra({
          id: 4,
          pesoTotal: 8400,
          pesoRecebimento: 12,
          pesoAtual: 300,
        } as CompraListagemRow & { pesoRecebimento: number; pesoAtual: number }),
      ],
      periodoSetembro,
    );
    expect(resumo.peso).toEqual({ kind: "known", value: 8400 });
  });

  it("R$/kg médio de compra inclui frete/outros no custoTotal e é ponderado", () => {
    const simplesNaoPonderada = (12.86 + 10) / 2;
    const resumo = resumirPainelCompras(
      [
        compra({ id: 5, custoTotal: "108000", valorTotal: "105000", pesoTotal: 8400 }),
        compra({ id: 6, custoTotal: "10000", valorTotal: "10000", pesoTotal: 1000 }),
      ],
      periodoSetembro,
    );
    expect(resumo.custoMedioKg).toEqual({ kind: "known", value: 12.55 });
    expect(resumo.custoMedioKg.kind === "known" && resumo.custoMedioKg.value).not.toBe(simplesNaoPonderada);
    expect(mediaPonderadaKgPainel([{ valor: 108000, peso: 8400 }])).toEqual({
      kind: "known",
      value: 12.86,
    });
  });

  it("peso zero/null não gera divisão por zero", () => {
    expect(mediaPonderadaKgPainel([{ valor: 1000, peso: 0 }])).toEqual({ kind: "unknown" });
    expect(mediaPonderadaKgPainel([{ valor: 1000, peso: null }])).toEqual({ kind: "unknown" });
    const resumo = resumirPainelCompras(
      [compra({ id: 7, custoTotal: "1000", pesoTotal: null })],
      periodoSetembro,
    );
    expect(resumo.custoMedioKg).toEqual({ kind: "unknown" });
    expect(formatarMetricaValor(resumo.custoMedioKg)).toBe("—");
  });

  it("período filtra corretamente e últimas operações respeitam o recorte", () => {
    const resumo = resumirPainelCompras(
      [
        compra({ id: 8, data: "2026-08-31", custoTotal: "999", pesoTotal: 10 }),
        compra({ id: 9, data: "2026-09-15", custoTotal: "2000", pesoTotal: 20, fornecedor: "Setembro" }),
        compra({ id: 10, data: "2026-10-01", custoTotal: "888", pesoTotal: 8 }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 2000 });
    expect(resumo.recentes.map(r => r.parceiro)).toEqual(["Setembro"]);
  });

  it("últimas operações não exibem canceladas e limitam a 5", () => {
    const compras = Array.from({ length: 7 }, (_, i) =>
      compra({
        id: 100 + i,
        data: `2026-09-${String(10 + i).padStart(2, "0")}`,
        fornecedor: `F${i}`,
        status: i === 0 ? "cancelado" : "concluido",
      }),
    );
    const resumo = resumirPainelCompras(compras, periodoSetembro);
    expect(resumo.recentes).toHaveLength(LIMITE_OPERACOES_RECENTES_PAINEL);
    expect(resumo.recentes.every(r => r.id !== 100)).toBe(true);
    expect(resumo.recentes[0]?.id).toBe(106);
  });

  it("datas YYYY-MM-DD aparecem em dd/mm/yyyy sem deslocar o dia", () => {
    expect(formatDateBR("2026-09-28")).toBe("28/09/2026");
    expect(formatDateBR("2026-01-01")).toBe("01/01/2026");
    const resumo = resumirPainelVendas([venda({ id: 20, data: "2026-09-28" })], periodoSetembro);
    expect(formatDateBR(resumo.recentes[0]?.data)).toBe("28/09/2026");
  });

  it("sem operações no período: dinheiro e cabeças zerados, R$/kg em —", () => {
    const resumo = resumirPainelCompras(
      [compra({ id: 30, data: "2026-01-01" })],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 0 });
    expect(resumo.animais).toEqual({ kind: "known", value: 0 });
    expect(resumo.peso).toEqual({ kind: "known", value: 0 });
    expect(resumo.custoMedioKg).toEqual({ kind: "unknown" });
    expect(formatarMetricaPeso(resumo.peso)).toBe("0 kg");
  });

  it("compra pendente fica de fora do efetivo, como no rodapé da lista", () => {
    const resumo = resumirPainelCompras(
      [compra({ id: 40, status: "pendente", custoTotal: "5000", quantidadeAnimais: 8 })],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 0 });
    expect(resumo.animais).toEqual({ kind: "known", value: 0 });
  });

  it("TESTE A — duas compras com peso: média ponderada, não média simples dos R$/kg", () => {
    const resumo = resumirPainelCompras(
      [
        compra({ id: 201, custoTotal: "1000", valorTotal: "1000", pesoTotal: 100 }),
        compra({ id: 202, custoTotal: "3000", valorTotal: "3000", pesoTotal: 200 }),
      ],
      periodoSetembro,
    );
    expect(resumo.custoMedioKg).toEqual({ kind: "known", value: 13.33 });
    expect(resumo.custoMedioKg).not.toEqual({ kind: "known", value: 12.5 });
  });

  it("TESTE B — compra sem peso entra no total e nos animais, mas não no R$/kg", () => {
    const resumo = resumirPainelCompras(
      [
        compra({ id: 203, custoTotal: "1000", valorTotal: "1000", pesoTotal: 100, quantidadeAnimais: 5 }),
        compra({ id: 204, custoTotal: "500", valorTotal: "500", pesoTotal: null, quantidadeAnimais: 1 }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 1500 });
    expect(resumo.peso).toEqual({ kind: "known", value: 100 });
    expect(resumo.custoMedioKg).toEqual({ kind: "known", value: 10 });
    expect(resumo.custoMedioKg).not.toEqual({ kind: "known", value: 15 });
  });

  it("TESTE C — peso zero não entra no R$/kg e não gera divisão inválida", () => {
    const resumo = resumirPainelCompras(
      [compra({ id: 205, custoTotal: "500", valorTotal: "500", pesoTotal: 0 })],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 500 });
    expect(resumo.custoMedioKg).toEqual({ kind: "unknown" });
    expect(formatarMetricaValor(resumo.custoMedioKg)).toBe("—");
    expect(resumo.custoMedioKg.kind).not.toBe("known");
  });

  it("TESTE D — todas as compras sem peso: valor comercial permanece, peso 0 kg e R$/kg —", () => {
    const resumo = resumirPainelCompras(
      [
        compra({ id: 206, custoTotal: "2100", valorTotal: "2100", pesoTotal: null }),
        compra({ id: 207, custoTotal: "400", valorTotal: "400", pesoTotal: null }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 2500 });
    expect(resumo.peso).toEqual({ kind: "known", value: 0 });
    expect(formatarMetricaPeso(resumo.peso)).toBe("0 kg");
    expect(resumo.custoMedioKg).toEqual({ kind: "unknown" });
    expect(formatarMetricaValor(resumo.custoMedioKg)).toBe("—");
  });

  it("TESTE E — compra cancelada com peso não entra em nenhum agregado", () => {
    const resumo = resumirPainelCompras(
      [
        compra({
          id: 208,
          status: "cancelado",
          custoTotal: "10000",
          valorTotal: "10000",
          pesoTotal: 1000,
          quantidadeAnimais: 20,
          fornecedor: "Cancelada",
        }),
        compra({ id: 209, custoTotal: "1000", valorTotal: "1000", pesoTotal: 100, quantidadeAnimais: 2 }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 1000 });
    expect(resumo.animais).toEqual({ kind: "known", value: 2 });
    expect(resumo.peso).toEqual({ kind: "known", value: 100 });
    expect(resumo.custoMedioKg).toEqual({ kind: "known", value: 10 });
    expect(resumo.recentes.map(r => r.id)).toEqual([209]);
  });

  it("TESTE F — venda sem peso entra no total, mas não no R$/kg médio venda", () => {
    const resumo = resumirPainelVendas(
      [
        venda({ id: 301, valorTotalNumero: 2000, valorTotal: "2000", pesoTotal: 200, quantidadeAnimais: 2, quantidade: 2 }),
        venda({ id: 302, valorTotalNumero: 800, valorTotal: "800", pesoTotal: null, quantidadeAnimais: 1, quantidade: 1 }),
      ],
      periodoSetembro,
    );
    expect(resumo.valor).toEqual({ kind: "known", value: 2800 });
    expect(resumo.peso).toEqual({ kind: "known", value: 200 });
    expect(resumo.custoMedioKg).toEqual({ kind: "known", value: 10 });
    expect(resumo.custoMedioKg).not.toEqual({ kind: "known", value: 14 });
  });

  it("tela monta 8 indicadores, tabelas com Animais/Peso e linhas clicáveis, sem lucro", () => {
    expect(page).toContain("Compras no período");
    expect(page).toContain("Vendas no período");
    expect(page).toContain("Animais comprados");
    expect(page).toContain("Animais vendidos");
    expect(page).toContain("Peso comprado");
    expect(page).toContain("Peso vendido");
    expect(page).toContain("Custo médio/kg");
    expect(page).toContain("Preço médio/kg");
    expect(page.indexOf('label="Compras no período"')).toBeLessThan(page.indexOf('label="Custo médio/kg"'));
    expect(page.indexOf('label="Custo médio/kg"')).toBeLessThan(page.indexOf('label="Animais comprados"'));
    expect(page.indexOf('label="Animais comprados"')).toBeLessThan(page.indexOf('label="Peso comprado"'));
    expect(page).toContain("resumoCompras.valor");
    expect(page).toContain("resumoVendas.custoMedioKg");
    expect(page).toContain("min-[380px]:grid-cols-2");
    expect(page).toContain("Peso médio/animal");
    expect(page).toContain("Custo médio/animal");
    expect(page).toContain("Valor médio/animal");
    expect(page).toContain("Como foram as operações");
    expect(page).toContain("PerfilCard");
    expect(page).toContain("md:grid-cols-2");
    expect(page).toContain("perfilCompras.medioPorKg");
    expect(page).toContain("perfilVendas.medioPorKg");
    expect(page).toContain("Compras e vendas ao longo do tempo");
    expect(page).toContain("Alertas e Pendências");
    expect(page).toContain("resumoAtencaoPendencia");
    expect(page).toContain("destinoAtencaoPendencia");
    expect(page).toContain("tituloAtencaoPendencia");
    expect(page).toContain("comprasComRecebimentoPendente > 0");
    expect(page).toContain("auto-fill");
    expect(page).not.toContain("Compras com recebimento pendente");
    expect(page).not.toContain("Animais pendentes de identificação");
    expect(page).not.toContain("Nenhuma pendência no período.");
    expect(page).not.toContain("Tudo certo");
    expect(page).not.toContain("Compras sem peso informado");
    expect(page).toContain("Operações recentes");
    expect(page).toContain("Ver todas");
    expect(page).toContain("compraVendaComprasListagemPath");
    expect(page).toContain("comRetornoCompraVendaVisaoGeral(COMPRA_VENDA_COMPRAS_PATH");
    expect(page).toContain("comRetornoCompraVendaVisaoGeral(COMPRA_VENDA_VENDAS_PATH");
    expect(page).toContain("COMPRA_VENDA_COMPRAS_PATH");
    expect(page).toContain("COMPRA_VENDA_VENDAS_PATH");
    expect(page).toContain("Nenhuma compra ou venda registrada no período.");
    expect(page).toContain("formatarEixoYValorPainel");
    expect(page).toContain("ALTURA_GRAFICO_DESKTOP_PX = 186");
    expect(page).toContain("LARGURA_EIXO_Y_PX = 88");
    expect(page).toContain("EixoYTickPainel");
    expect(page).toContain("linhasTooltipSeriePainel");
    expect(page).not.toContain("shared={false}");
    expect(page).toContain("var(--fd-serie-compra)");
    expect(page).toContain("var(--fd-serie-venda)");
    expect(page).not.toContain("#64748B");
    expect(page).not.toContain("scale=\"log\"");
    expect(page).toContain("overflow-x-hidden");
    expect(page).toContain("intervaloTicksEixoXPainel");
    expect(page).not.toContain("<Legend");
    expect(page).not.toContain("Documentação pendente");
    expect(page).toContain(">Animais<");
    expect(page).toContain(">Peso<");
    expect(page).toContain("compraVendaCompraDetalhePath");
    expect(page).toContain("compraVendaVendaDetalhePath");
    expect(page).toContain("resumirPainelCompras");
    expect(page).toContain("resumirPainelVendas");
    expect(page).toContain("xl:grid-cols-4");
    expect(page).toContain("w-full max-w-full min-w-0");
    expect(page).toContain("box-border");
    expect(page).toContain("pb-8");
    expect(page).not.toContain("overflow-y-auto");
    expect(page).toContain("table-fixed");
    expect(page).toContain("colgroup");
    expect(page).toContain("w-[5.75rem]");
    expect(page).toContain("rotuloAcaoAtencaoPainel");
    expect(page).toContain("COMPRA_VENDA_COMPRAS_PATH");
    expect(page).toContain("compraVendaCompraRecebimentoPath");
    expect(page).toContain("comRetornoCompraVendaVisaoGeral");
    expect(page).toContain("alturaMinimaBarraSerie");
    expect(page).not.toContain("yAxisId");
    expect(page).not.toContain("100vw");
    expect(page).not.toContain("h-screen");
    expect(page).toContain("hidden lg:table");
    expect(page).toContain("lg:hidden");
    expect(page).toContain("OperacaoRecenteCard");
    expect(page).toContain("Custo médio/kg");
    expect(page).toContain("Preço médio/kg");
    expect(page).toContain("minTickGap");
    expect(page).toContain("FazendaOverviewSelect");
    expect(page).toContain("persistRebanhoFazendaId");
    expect(page).toContain("FormDatePicker");
    expect(page).toContain('aria-label="Data inicial"');
    expect(page).toContain('aria-label="Data final"');
    expect(page).not.toContain("Resumo das operações comerciais da fazenda.");
    expect(page).not.toContain("lg:justify-between");
    expect(page).not.toContain(">Compra e Venda<");
    expect(page).not.toContain("Todas as Fazendas");
    expect(page).not.toContain("Lucro");
    expect(page).not.toContain("Margem");
    expect(page).not.toContain("Prejuízo");
    expect(page).not.toContain("Qtd");
  });
});

describe("perfil, série e atenção do painel comercial", () => {
  it("conta operações e exclui canceladas", () => {
    const perfil = resumirPerfilComprasPainel(
      [
        compra({ id: 1, quantidadeAnimais: 10 }),
        compra({ id: 2, quantidadeAnimais: 20, status: "cancelado" }),
      ],
      periodoSetembro,
    );
    expect(perfil.operacoes).toBe(1);
  });

  it("calcula animais por operação", () => {
    const perfil = resumirPerfilComprasPainel(
      [
        compra({ id: 1, quantidadeAnimais: 10 }),
        compra({ id: 2, quantidadeAnimais: 20 }),
      ],
      periodoSetembro,
    );
    expect(perfil.animaisPorOperacao).toEqual({ kind: "known", value: 15 });
  });

  it("peso médio por animal usa só operações com peso válido", () => {
    const perfil = resumirPerfilComprasPainel(
      [
        compra({ id: 1, quantidadeAnimais: 10, pesoTotal: 200 }),
        compra({ id: 2, quantidadeAnimais: 10, pesoTotal: null, custoTotal: "500" }),
      ],
      periodoSetembro,
    );
    expect(perfil.pesoMedioPorAnimal).toEqual({ kind: "known", value: 20 });
  });

  it("custo médio por animal e valor médio por animal", () => {
    const compras = resumirPerfilComprasPainel(
      [
        compra({ id: 1, quantidadeAnimais: 10, custoTotal: "1000", pesoTotal: 100 }),
        compra({ id: 2, quantidadeAnimais: 20, custoTotal: "3000", pesoTotal: 200 }),
      ],
      periodoSetembro,
    );
    const vendas = resumirPerfilVendasPainel(
      [
        venda({ id: 1, quantidadeAnimais: 4, quantidade: 4, valorTotalNumero: 400, pesoTotal: 40 }),
        venda({ id: 2, quantidadeAnimais: 6, quantidade: 6, valorTotalNumero: 900, pesoTotal: 90 }),
      ],
      periodoSetembro,
    );
    expect(compras.medioPorAnimal).toEqual({ kind: "known", value: 133.33 });
    expect(vendas.medioPorAnimal).toEqual({ kind: "known", value: 130 });
  });

  it("custo e preço médio por kg reutilizam a regra oficial", () => {
    const lista = [
      compra({ id: 1, custoTotal: "1000", pesoTotal: 100 }),
      compra({ id: 2, custoTotal: "500", pesoTotal: null }),
    ];
    const cards = resumirPainelCompras(lista, periodoSetembro);
    const perfil = resumirPerfilComprasPainel(lista, periodoSetembro);
    expect(perfil.medioPorKg).toEqual(cards.custoMedioKg);
    expect(perfil.medioPorKg).toEqual({ kind: "known", value: 10 });

    const vendas = [
      venda({ id: 1, valorTotalNumero: 2000, pesoTotal: 200 }),
      venda({ id: 2, valorTotalNumero: 800, pesoTotal: null }),
    ];
    expect(resumirPerfilVendasPainel(vendas, periodoSetembro).medioPorKg).toEqual(
      resumirPainelVendas(vendas, periodoSetembro).custoMedioKg,
    );
  });

  it("gráfico agrupa por dia em período curto e por mês em período longo", () => {
    expect(granularidadeSeriePainel({ de: "2026-09-01", ate: "2026-09-30" })).toBe("dia");
    expect(granularidadeSeriePainel({ de: "2026-01-01", ate: "2026-12-31" })).toBe("mes");
  });

  it("eixo Y abrevia só o rótulo, sem mudar o número da barra", () => {
    expect(formatarEixoYValorPainel(0)).toBe("R$ 0");
    expect(formatarEixoYValorPainel(120000)).toBe("R$ 120 mil");
    expect(formatarEixoYValorPainel(90000)).toBe("R$ 90 mil");
    expect(formatarEixoYValorPainel(1500)).toBe("R$ 1,5 mil");
    expect(formatarEixoYValorPainel(527)).toBe("R$ 527");
    expect(formatarEixoYValorPainel(1_200_000)).toBe("R$ 1,2 mi");
  });

  it("tooltip mostra Compras e Vendas com valor completo, inclusive zero", () => {
    const linhas = linhasTooltipSeriePainel({
      labelTooltip: "24/09/2026",
      compras: 108000,
      vendas: 0,
    });
    expect(linhas.data).toBe("24/09/2026");
    expect(linhas.compras.replace(/\u00a0/g, " ")).toBe("Compras: R$ 108.000,00");
    expect(linhas.vendas.replace(/\u00a0/g, " ")).toBe("Vendas: R$ 0,00");
  });

  it("eixo X reduz labels sem apagar dias do período", () => {
    expect(intervaloTicksEixoXPainel(30, "dia", false)).toBe(3);
    expect(intervaloTicksEixoXPainel(30, "dia", true)).toBe(5);
    expect(intervaloTicksEixoXPainel(12, "mes", false)).toBe(0);
    expect(intervaloTicksEixoXPainel(6, "dia", false)).toBe(0);
  });

  it("compras e vendas ficam em séries independentes e cancelada não entra no gráfico", () => {
    const serie = agruparSeriesTemporaisPainel(
      [
        compra({ id: 1, data: "2026-09-10", custoTotal: "1000", pesoTotal: 100 }),
        compra({ id: 2, data: "2026-09-10", status: "cancelado", custoTotal: "9000", pesoTotal: 900 }),
      ],
      [venda({ id: 3, data: "2026-09-10", valorTotalNumero: 400, pesoTotal: 40 })],
      periodoSetembro,
    );
    const ponto = serie.pontos.find(p => p.chave === "2026-09-10");
    expect(serie.temOperacao).toBe(true);
    expect(ponto?.compras).toBe(1000);
    expect(ponto?.vendas).toBe(400);
    expect(ponto?.compras).not.toBe(ponto!.vendas - ponto!.compras);
    expect(serie.pontos.every(p => Number.isFinite(p.compras) && Number.isFinite(p.vendas))).toBe(true);
  });

  it("compra parcialmente recebida aparece como pendente e a total não aparece", () => {
    const atencao = resumirAtencaoComprasPainel(
      [
        compra({ id: 1, quantidadeAnimais: 40, identificados: 20 }),
        compra({ id: 2, quantidadeAnimais: 5, identificados: 5 }),
      ],
      periodoSetembro,
    );
    expect(atencao.comprasComRecebimentoPendente).toBe(1);
    expect(atencao.animaisPendentes).toBe(20);
    expect(atencao.destinoRecebimentoId).toBe(1);
  });

  it("animais pendentes são derivados da quantidade comercial menos os vinculados", () => {
    const atencao = resumirAtencaoComprasPainel(
      [compra({ id: 8, quantidadeAnimais: 40, identificados: 20 })],
      periodoSetembro,
    );
    expect(atencao.animaisPendentes).toBe(20);
  });

  it("compra cancelada não gera alerta de recebimento", () => {
    const atencao = resumirAtencaoComprasPainel(
      [compra({ id: 1, status: "cancelado", quantidadeAnimais: 40, identificados: 0, pesoTotal: null })],
      periodoSetembro,
    );
    expect(atencao.comprasComRecebimentoPendente).toBe(0);
    expect(atencao.animaisPendentes).toBe(0);
  });

  it("várias compras pendentes não escolhem uma compra e apontam para a lista", () => {
    const atencao = resumirAtencaoComprasPainel(
      [
        compra({ id: 1, quantidadeAnimais: 10, identificados: 0 }),
        compra({ id: 2, quantidadeAnimais: 8, identificados: 1 }),
      ],
      periodoSetembro,
    );
    expect(atencao.comprasComRecebimentoPendente).toBe(2);
    expect(atencao.destinoRecebimentoId).toBeNull();
    expect(destinoAtencaoRecebimento(atencao)).toEqual({ tipo: "lista-compras" });
    expect(destinoAtencaoIdentificacao(atencao)).toEqual({ tipo: "lista-compras" });
    expect(destinoAtencaoPendencia(atencao)).toEqual({ tipo: "lista-compras" });
    expect(rotuloAcaoAtencaoPainel(destinoAtencaoRecebimento(atencao))).toBe("Ver compras →");
    expect(resumoAtencaoPendencia(atencao)).toBe("2 compras · 17 animais");
    expect(tituloAtencaoPendencia()).toBe("Aguardando entrada");
    expect(textoAtencaoPendencia(atencao)).toBe(
      "Animais comprados que ainda não deram entrada individual no rebanho.",
    );
  });

  it("uma compra pendente aponta para o recebimento", () => {
    const atencao = resumirAtencaoComprasPainel(
      [compra({ id: 7, quantidadeAnimais: 10, identificados: 0 })],
      periodoSetembro,
    );
    expect(destinoAtencaoRecebimento(atencao)).toEqual({ tipo: "recebimento", compraId: 7 });
    expect(destinoAtencaoIdentificacao(atencao)).toEqual({ tipo: "recebimento", compraId: 7 });
    expect(destinoAtencaoPendencia(atencao)).toEqual({ tipo: "recebimento", compraId: 7 });
    expect(rotuloAcaoAtencaoPainel(destinoAtencaoRecebimento(atencao))).toBe("Continuar recebimento →");
    expect(resumoAtencaoPendencia(atencao)).toBe("1 compra · 10 animais");
  });

  it("zero pendências gera estado calmo e período/fazenda isolam os blocos", () => {
    const zerado = resumirAtencaoComprasPainel(
      [compra({ id: 1, quantidadeAnimais: 4, identificados: 4, pesoTotal: 100 })],
      periodoSetembro,
    );
    expect(zerado).toEqual({
      comprasComRecebimentoPendente: 0,
      animaisPendentes: 0,
      destinoRecebimentoId: null,
    });
    expect(resumoAtencaoPendencia(zerado)).toBe("0 compras · 0 animais");
    expect(textoAtencaoPendencia(zerado)).toBe("Nenhuma compra aguardando entrada no rebanho.");
    expect(destinoAtencaoPendencia(zerado)).toBeNull();

    const fora = resumirPerfilComprasPainel(
      [compra({ id: 9, data: "2026-08-01", quantidadeAnimais: 99, identificados: 1, pesoTotal: null })],
      periodoSetembro,
    );
    const atencaoFora = resumirAtencaoComprasPainel(
      [compra({ id: 9, data: "2026-08-01", quantidadeAnimais: 99, identificados: 1, pesoTotal: null })],
      periodoSetembro,
    );
    const serieFora = agruparSeriesTemporaisPainel(
      [compra({ id: 9, data: "2026-08-01" })],
      [venda({ id: 10, data: "2026-08-01" })],
      periodoSetembro,
    );
    expect(fora.operacoes).toBe(0);
    expect(fora.animaisPorOperacao).toEqual({ kind: "unknown" });
    expect(atencaoFora.comprasComRecebimentoPendente).toBe(0);
    expect(serieFora.temOperacao).toBe(false);
    expect(resumirPainelCompras([compra({ id: 9, data: "2026-08-01" })], periodoSetembro).recentes).toHaveLength(0);
  });

  it("sem operação as médias ficam em — e nada vira NaN ou Infinity", () => {
    const perfil = resumirPerfilComprasPainel([], periodoSetembro);
    expect(perfil.operacoes).toBe(0);
    expect(perfil.medioPorKg).toEqual({ kind: "unknown" });
    expect(perfil.medioPorAnimal).toEqual({ kind: "unknown" });
    expect(perfil.pesoMedioPorAnimal).toEqual({ kind: "unknown" });
    expect(Number.isFinite(perfil.operacoes)).toBe(true);
  });
});
