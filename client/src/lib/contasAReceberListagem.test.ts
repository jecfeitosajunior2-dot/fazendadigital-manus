import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FINANCEIRO_ORIGEM_MANUAL, FINANCEIRO_ORIGEM_VENDA_ANIMAIS } from "@shared/financeiroNucleo";
import { somarDinheiro } from "@shared/financeiroMoeda";
import {
  FILTRO_ATIVOS,
  FILTRO_CANCELADO,
  FILTRO_SEM_FAZENDA,
  FILTRO_VENCIDAS,
  PERIODO_SEM_VENCIMENTO,
  PERIODO_TODAS,
  TEXTO_A_DEFINIR,
  clienteDaLinha,
  contasAReceberDetalhePath,
  contasAReceberListagemPath,
  detalhesDoUsuarioAutenticado,
  filtrarLinhasContasAReceber,
  filtrosContasAReceberDaQuery,
  filtrosContasAReceberTodasDatas,
  filtrosContasAReceberVazios,
  idsTitulosAReceber,
  linhaVencida,
  linhasDaListagemAReceber,
  listagemAReceberNaoUsaRotaAPagar,
  montarListagemAReceber,
  opcoesClienteContasAReceber,
  opcoesSituacaoContasAReceber,
  rotuloParcela,
  rotuloSituacaoLinhaReceber,
  textoListagemOrigemVendaAnimais,
  vencimentoOuSaldoADefinir,
  FINANCEIRO_CONTAS_A_RECEBER_PATH,
} from "./contasAReceberListagem";
import type { TituloV2DetalheOficial, TituloV2ListaBruta } from "./contasAPagarListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAReceberPage.tsx"), "utf8");
const pagarPage = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const menu = readFileSync(resolve(here, "./data.ts"), "utf8");
const legado = readFileSync(resolve(here, "../pages/FinancialManagementPage.tsx"), "utf8");
const dashboard = readFileSync(resolve(here, "../pages/DashboardPage.tsx"), "utf8");
const v2Router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");

function titulo(parcial: Partial<TituloV2DetalheOficial> = {}): TituloV2DetalheOficial {
  return {
    id: 1,
    userId: 10,
    tipo: "receber",
    estado: "ativo",
    condicaoStatus: "definida",
    pessoaId: 5,
    contraparteNomeSnapshot: "Frigorífico Norte",
    fazendaOrigemId: 1,
    origemTipo: FINANCEIRO_ORIGEM_MANUAL,
    origemId: null,
    origemItemChave: null,
    descricao: "Venda de bezerros",
    dataCompetencia: "2026-10-01",
    valorOriginal: "300.00",
    situacao: "em_aberto",
    parcelas: [],
    ...parcial,
  };
}

function parcela(
  id: number,
  numero: number,
  vencimento: string,
  valor: string,
  saldo: number,
  quitada = false,
) {
  return {
    id,
    tituloId: 1,
    numero,
    vencimento,
    valorOriginal: valor,
    saldoPrincipal: saldo,
    principalLiquidado: Number(valor) - saldo,
    quitada,
  };
}

const HOJE = "2026-10-16";

function todas(parcial: Partial<ReturnType<typeof filtrosContasAReceberVazios>> = {}) {
  return { ...filtrosContasAReceberTodasDatas(HOJE), ...parcial };
}

describe("contasAReceberListagem — dados oficiais do V2", () => {
  it("titulosList só entra na listagem quando o tipo é receber", () => {
    const lista: TituloV2ListaBruta[] = [
      titulo({ id: 1, tipo: "receber" }),
      titulo({ id: 2, tipo: "pagar", pessoaId: 8 }),
      titulo({ id: 3, tipo: "receber", pessoaId: 9 }),
    ];
    expect(idsTitulosAReceber(lista)).toEqual([1, 3]);
  });

  it("não mistura título a pagar na listagem de receber", () => {
    const linhas = linhasDaListagemAReceber([
      titulo({ id: 1, tipo: "pagar", situacao: "em_aberto", parcelas: [parcela(1, 1, "2026-10-20", "80.00", 80)] }),
      titulo({ id: 2, tipo: "receber", situacao: "vencido", parcelas: [parcela(2, 1, "2026-10-01", "40.00", 40)] }),
    ]);
    expect(linhas.map(l => l.tituloId)).toEqual([2]);
    expect(linhas.every(l => clienteDaLinha(l) === "Frigorífico Norte")).toBe(true);
  });

  it("título parcelado vira uma linha por vencimento oficial", () => {
    const detalhe = titulo({
      parcelas: [
        parcela(11, 1, "2026-10-10", "100.00", 100),
        parcela(12, 2, "2026-11-10", "100.00", 100),
        parcela(13, 3, "2026-12-10", "100.00", 100),
      ],
    });
    const linhas = linhasDaListagemAReceber([detalhe]);
    expect(linhas).toHaveLength(3);
    expect(linhas.map(l => l.vencimento)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(linhas.map(l => String(l.valor))).toEqual(["100.00", "100.00", "100.00"]);
    expect(somarDinheiro(...linhas.map(l => l.valor ?? 0))).toBe(300);
    expect(rotuloParcela(linhas[0]!)).toBe("1/3");
  });

  it("ativo sem parcelas permanece localizável, com A definir no vencimento e saldo", () => {
    const detalhe = titulo({
      condicaoStatus: "a_definir",
      situacao: "em_aberto",
      parcelas: [],
    });
    const [linha] = linhasDaListagemAReceber([detalhe]);
    expect(linha).toMatchObject({
      vencimento: null,
      valor: "300.00",
      saldoAberto: null,
      principalLiquidado: null,
      situacao: "em_aberto",
      estado: "ativo",
      descricao: "Venda de bezerros",
    });
    expect(rotuloParcela(linha!)).toBe(TEXTO_A_DEFINIR);
    expect(vencimentoOuSaldoADefinir(linha!.vencimento)).toBe(true);
    expect(rotuloSituacaoLinhaReceber(linha!)).toBe("Em aberto");
  });

  it("recebimento parcial usa saldo e principal oficiais da parcela", () => {
    const detalhe = titulo({
      situacao: "parcial",
      parcelas: [
        { ...parcela(21, 1, "2026-09-01", "150.00", 50, false), principalLiquidado: 100 },
        parcela(22, 2, "2026-11-01", "150.00", 150, false),
      ],
    });
    const linhas = linhasDaListagemAReceber([detalhe]);
    expect(linhas.map(l => l.saldoAberto)).toEqual([50, 150]);
    expect(linhas.map(l => l.principalLiquidado)).toEqual([100, 0]);
    expect(linhas.map(l => rotuloSituacaoLinhaReceber(l))).toEqual(["Parcial", "Em aberto"]);
    const vencidas = filtrarLinhasContasAReceber(linhas, todas({ situacao: FILTRO_VENCIDAS }), HOJE);
    expect(vencidas.map(l => l.parcelaId)).toEqual([21]);
  });

  it("título liquidado mostra Recebida e saldo zero", () => {
    const detalhe = titulo({
      situacao: "liquidado",
      parcelas: [parcela(31, 1, "2026-10-01", "300.00", 0, true)],
    });
    const [linha] = linhasDaListagemAReceber([detalhe]);
    expect(linha).toMatchObject({ saldoAberto: 0, principalLiquidado: 300, situacao: "liquidado" });
    expect(rotuloSituacaoLinhaReceber(linha!)).toBe("Recebida");
    expect(linhaVencida(linha!, HOJE)).toBe(false);
  });

  it("título vencido em aberto entra no filtro de vencidas", () => {
    const detalhe = titulo({
      situacao: "vencido",
      parcelas: [parcela(41, 1, "2026-09-01", "80.00", 80)],
    });
    const linhas = linhasDaListagemAReceber([detalhe]);
    expect(linhaVencida(linhas[0]!, HOJE)).toBe(true);
    expect(filtrarLinhasContasAReceber(linhas, todas({ situacao: FILTRO_VENCIDAS }), HOJE)).toHaveLength(1);
  });

  it("cancelado fica fora das ativas e só aparece no histórico", () => {
    const linhas = linhasDaListagemAReceber([
      titulo({ id: 10, estado: "ativo", situacao: "em_aberto", parcelas: [] }),
      titulo({ id: 11, estado: "cancelado", situacao: "em_aberto", parcelas: [] }),
    ]);
    expect(filtrarLinhasContasAReceber(linhas, todas(), HOJE).map(l => l.tituloId)).toEqual([10]);
    expect(
      filtrarLinhasContasAReceber(linhas, todas({ situacao: FILTRO_CANCELADO }), HOJE).map(l => l.tituloId),
    ).toEqual([11]);
    expect(rotuloSituacaoLinhaReceber(linhas.find(l => l.tituloId === 11)!)).toBe("Cancelado");
  });
});

describe("contasAReceberListagem — filtros, isolamento e navegação", () => {
  const linhas = linhasDaListagemAReceber([
    titulo({
      id: 1,
      pessoaId: 5,
      fazendaOrigemId: 1,
      descricao: "Venda de bezerros",
      situacao: "vencido",
      parcelas: [parcela(11, 1, "2026-09-01", "100.00", 100)],
    }),
    titulo({
      id: 2,
      pessoaId: 7,
      contraparteNomeSnapshot: "Laticínio Sul",
      fazendaOrigemId: 2,
      descricao: "Leite do mês",
      situacao: "em_aberto",
      parcelas: [parcela(12, 1, "2026-11-01", "80.00", 80)],
    }),
    titulo({
      id: 3,
      pessoaId: 5,
      fazendaOrigemId: null,
      descricao: "Adiantamento",
      situacao: "liquidado",
      parcelas: [parcela(13, 1, "2026-08-01", "50.00", 0, true)],
    }),
  ]);

  it("filtra por fazenda, situação, cliente e descrição", () => {
    expect(filtrarLinhasContasAReceber(linhas, todas({ fazendaId: "1" }), HOJE).map(l => l.tituloId)).toEqual([1]);
    expect(
      filtrarLinhasContasAReceber(linhas, todas({ fazendaId: FILTRO_SEM_FAZENDA }), HOJE).map(l => l.tituloId),
    ).toEqual([3]);
    expect(filtrarLinhasContasAReceber(linhas, todas({ situacao: "em_aberto" }), HOJE).map(l => l.tituloId)).toEqual([2]);
    expect(filtrarLinhasContasAReceber(linhas, todas({ fornecedorId: "7" }), HOJE).map(l => l.tituloId)).toEqual([2]);
    expect(filtrarLinhasContasAReceber(linhas, todas({ pesquisa: "leite" }), HOJE).map(l => l.tituloId)).toEqual([2]);
    const venda = linhasDaListagemAReceber([
      titulo({
        id: 40,
        origemTipo: FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
        origemId: 123,
        descricao: "Lote confirmado",
        parcelas: [parcela(40, 1, "2026-11-01", "500.00", 500)],
      }),
    ]);
    expect(textoListagemOrigemVendaAnimais(FINANCEIRO_ORIGEM_VENDA_ANIMAIS, 123)).toBe(
      "Venda de Animais · Venda 123",
    );
    expect(filtrarLinhasContasAReceber(venda, todas({ pesquisa: "Venda 123" }), HOJE).map(l => l.tituloId)).toEqual([40]);
    expect(filtrarLinhasContasAReceber(venda, todas({ pesquisa: "venda de animais" }), HOJE).map(l => l.tituloId)).toEqual([40]);
    expect(filtrarLinhasContasAReceber(linhas, todas({ pesquisa: "Venda 123" }), HOJE)).toEqual([]);
    expect(page).toContain("textoListagemOrigemVendaAnimais");
    expect(opcoesClienteContasAReceber(linhas).map(o => o.label)).toEqual(["Frigorífico Norte", "Laticínio Sul"]);
    expect(opcoesSituacaoContasAReceber()).toEqual([
      { value: FILTRO_ATIVOS, label: "Ativas" },
      { value: "em_aberto", label: "Em aberto" },
      { value: "parcial", label: "Parcialmente recebidas" },
      { value: FILTRO_VENCIDAS, label: "Vencidas" },
      { value: "liquidado", label: "Recebidas" },
      { value: FILTRO_CANCELADO, label: "Canceladas" },
    ]);
  });

  it("descarta título de outro usuário e mantém o do autenticado", () => {
    const misturado = [
      titulo({ id: 1, userId: 10 }),
      titulo({ id: 9, userId: 99, contraparteNomeSnapshot: "Outro dono" }),
    ];
    expect(detalhesDoUsuarioAutenticado(misturado, 10).map(t => t.id)).toEqual([1]);
    expect(
      montarListagemAReceber(misturado, 10, todas(), HOJE).map(l => l.tituloId),
    ).toEqual([1]);
    expect(montarListagemAReceber(misturado, 99, todas(), HOJE).map(l => l.tituloId)).toEqual([9]);
  });

  it("Todas as datas e Sem vencimento definido não escondem título sem parcela", () => {
    const mistas = linhasDaListagemAReceber([
      titulo({
        id: 20,
        parcelas: [
          parcela(31, 1, "2026-10-10", "100.00", 100),
          parcela(32, 2, "2026-11-10", "100.00", 100),
        ],
      }),
      titulo({ id: 21, condicaoStatus: "a_definir", parcelas: [] }),
    ]);
    const todasDatas = filtrarLinhasContasAReceber(mistas, todas(), HOJE);
    expect(todasDatas.map(l => l.tituloId)).toEqual([20, 20, 21]);
    const semVencimento = filtrarLinhasContasAReceber(
      mistas,
      { ...filtrosContasAReceberVazios(HOJE), periodo: { tipo: "sem_vencimento" } },
      HOJE,
    );
    expect(semVencimento).toHaveLength(1);
    expect(semVencimento[0]).toMatchObject({ tituloId: 21, vencimento: null });
  });

  it("preserva filtros na URL e abre o detalhe do título", () => {
    const filtros = todas({
      situacao: FILTRO_VENCIDAS,
      fornecedorId: "18",
      pesquisa: "bezerros",
    });
    expect(contasAReceberListagemPath(filtros)).toBe(
      "/financeiro/contas-a-receber?situacao=vencido&cliente=18&mes=todas&q=bezerros",
    );
    expect(contasAReceberDetalhePath(84, filtros)).toBe(
      "/financeiro/contas-a-receber/84?situacao=vencido&cliente=18&mes=todas&q=bezerros",
    );
    expect(filtrosContasAReceberDaQuery("cliente=18&mes=todas", HOJE).fornecedorId).toBe("18");
    expect(filtrosContasAReceberDaQuery(`mes=${PERIODO_SEM_VENCIMENTO}`, HOJE).periodo).toEqual({
      tipo: "sem_vencimento",
    });
    expect(filtrosContasAReceberDaQuery(`mes=${PERIODO_TODAS}`, HOJE).periodo).toEqual({ tipo: "todas" });
    expect(page).toContain("contasAReceberDetalhePath");
    expect(page).toContain("abrirDetalhe");
    expect(app).toContain("ContasAReceberDetalhePage");
    expect(app).toContain("FINANCEIRO_CONTAS_A_RECEBER_PATH}/:id");
  });
});

describe("contasAReceberListagem — tela, rota e ausência do legado", () => {
  it("rota e menu novos não substituem Contas a Pagar nem a Visão Geral", () => {
    expect(FINANCEIRO_CONTAS_A_RECEBER_PATH).toBe("/financeiro/contas-a-receber");
    expect(listagemAReceberNaoUsaRotaAPagar()).toBe(true);
    expect(menu).toContain('label: "Contas a Receber"');
    expect(menu).toContain(FINANCEIRO_CONTAS_A_RECEBER_PATH);
    expect(menu).toContain('label: "Contas a Pagar"');
    expect(app).toContain("ContasAReceberPage");
    expect(app).toContain("ContasAPagarPage");
    expect(app).toContain("FINANCEIRO_CONTAS_A_RECEBER_PATH");
    expect(app).toContain('path="/financeiro/visao-geral" component={FinanceiroVisaoGeralPage}');
  });

  it("a página consulta o Financeiro V2 e cadastra receita sem receber na lista", () => {
    expect(page).toContain("financeiroV2.titulosList");
    expect(page).toContain("financeiroV2.titulosGet");
    expect(page).toContain("idsTitulosAReceber");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("listMovimentacoes");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).not.toContain("liquidacaoReceber");
    expect(page).toContain("titulosCreateManual");
    expect(page).toContain("Nova receita");
    expect(page).toContain("O recebimento é registrado no detalhe do título");
    expect(page).not.toContain("Recebimento ainda não está disponível");
    expect(page).toContain("Pesquisar descrição");
    expect(page).toContain("Todas as datas");
    expect(page).toContain("Sem vencimento definido");
    expect(page).toContain("Valor recebido");
    expect(page).toContain("Saldo a receber");
    expect(pagarPage).toContain("Contas a Pagar");
    expect(pagarPage).toContain("abrirDetalhe");
  });

  it("procedures oficiais isolam pelo usuário autenticado", () => {
    expect(v2Router).toContain("titulosList: protectedProcedure.query(({ ctx }) =>");
    expect(v2Router).toContain("financeiroNucleoService.listarTitulos(ctx.user.id)");
    expect(v2Router).toContain("financeiroNucleoService.detalheTitulo(ctx.user.id, input.id)");
    expect(nucleo).toContain(".where(eq(financeiroTitulos.userId, userId))");
    expect(nucleo).toContain("assertUser(titulo.userId, userId)");
  });

  it("não altera o Financeiro legado nem o Dashboard", () => {
    expect(legado).toContain("trpc.financeiro.listContas");
    expect(legado).not.toContain("financeiroV2");
    expect(dashboard).not.toContain("financeiroV2");
    expect(dashboard).not.toContain("ContasAReceberPage");
  });
});
