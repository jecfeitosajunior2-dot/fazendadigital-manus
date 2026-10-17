import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  FINANCEIRO_ORIGEM_MANUAL,
  FINANCEIRO_ORIGEM_MANUTENCAO,
} from "@shared/financeiroNucleo";
import { somarDinheiro } from "@shared/financeiroMoeda";
import {
  FINANCEIRO_CONTAS_A_PAGAR_PATH,
  FILTRO_ATIVOS,
  FILTRO_CANCELADO,
  FILTRO_VENCIDAS,
  FILTRO_SEM_FAZENDA,
  TEXTO_A_DEFINIR,
  PERIODO_SEM_VENCIMENTO,
  PERIODO_TODAS,
  contasAPagarDetalhePath,
  contasAPagarListagemPath,
  contasAPagarVoltarPath,
  detalhesDoUsuarioAutenticado,
  filtrarLinhasContasAPagar,
  filtrosContasAPagarDaQuery,
  filtrosContasAPagarTodasDatas,
  filtrosContasAPagarVazios,
  idsTitulosAPagar,
  linhaVencida,
  linhasDaListagemAPagar,
  mesAnterior,
  mesSeguinte,
  nomeFazendaDaLinha,
  opcoesFornecedorContasAPagar,
  opcoesOrigemContasAPagar,
  opcoesSituacaoContasAPagar,
  ordenarLinhasContasAPagar,
  paginarContasAPagar,
  parcelaVencidaEmAberto,
  periodoMesAnterior,
  periodoMesSeguinte,
  rotuloMesAno,
  rotuloOrigemTitulo,
  rotuloParcela,
  rotuloSituacaoLinha,
  rotuloSituacaoTitulo,
  vencimentoOuSaldoADefinir,
  type TituloV2DetalheOficial,
  type TituloV2ListaBruta,
} from "./contasAPagarListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
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
    tipo: "pagar",
    estado: "ativo",
    condicaoStatus: "definida",
    pessoaId: 5,
    contraparteNomeSnapshot: "Casa Agro",
    fazendaOrigemId: 1,
    origemTipo: FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
    origemId: 99,
    origemItemChave: "total",
    descricao: "Compra de ração",
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
    principalLiquidado: quitada ? Number(valor) : 0,
    quitada,
  };
}

const HOJE = "2026-10-16";

function todas(parcial: Partial<ReturnType<typeof filtrosContasAPagarVazios>> = {}) {
  return { ...filtrosContasAPagarTodasDatas(HOJE), ...parcial };
}

describe("contasAPagarListagem — dados oficiais do V2", () => {
  it("titulosList só entra na listagem quando o tipo é pagar", () => {
    const lista: TituloV2ListaBruta[] = [
      titulo({ id: 1, tipo: "pagar" }),
      titulo({ id: 2, tipo: "receber", pessoaId: 8 }),
      titulo({ id: 3, tipo: "pagar", pessoaId: 9 }),
    ];
    expect(idsTitulosAPagar(lista)).toEqual([1, 3]);
  });

  it("título parcelado vira uma linha por vencimento, sem repetir o total", () => {
    const detalhe = titulo({
      parcelas: [
        parcela(11, 1, "2026-10-10", "100.00", 100),
        parcela(12, 2, "2026-11-10", "100.00", 100),
        parcela(13, 3, "2026-12-10", "100.00", 100),
      ],
    });
    const linhas = linhasDaListagemAPagar([detalhe]);
    expect(linhas).toHaveLength(3);
    expect(linhas.map(l => l.vencimento)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(linhas.map(l => String(l.valor))).toEqual(["100.00", "100.00", "100.00"]);
    expect(linhas.every(l => String(l.valor) !== "300.00")).toBe(true);
    expect(somarDinheiro(...linhas.map(l => l.valor ?? 0))).toBe(300);
    expect(linhas.map(l => l.saldoAberto)).toEqual([100, 100, 100]);
    expect(linhas.every(l => l.situacao === "em_aberto")).toBe(true);
    expect(rotuloParcela(linhas[0]!)).toBe("1/3");
  });

  it("ativo sem parcelas mostra valor do título e A definir no resto", () => {
    const detalhe = titulo({
      condicaoStatus: "a_definir",
      situacao: "em_aberto",
      parcelas: [],
    });
    const [linha] = linhasDaListagemAPagar([detalhe]);
    expect(linha).toMatchObject({
      vencimento: null,
      valor: "300.00",
      saldoAberto: null,
      situacao: "em_aberto",
      estado: "ativo",
    });
    expect(linha!.valor).not.toBe(linha!.saldoAberto);
    expect(rotuloParcela(linha!)).toBe(TEXTO_A_DEFINIR);
    expect(vencimentoOuSaldoADefinir(linha!.vencimento)).toBe(true);
    expect(vencimentoOuSaldoADefinir(linha!.saldoAberto)).toBe(true);
    expect(rotuloSituacaoLinha(linha!)).toBe("Em aberto");
  });

  it("cancelado sem parcelas mostra Cancelado e preserva o valor, sem saldo", () => {
    const detalhe = titulo({
      estado: "cancelado",
      condicaoStatus: "a_definir",
      situacao: "em_aberto",
      parcelas: [],
    });
    const [linha] = linhasDaListagemAPagar([detalhe]);
    expect(linha).toMatchObject({
      valor: "300.00",
      saldoAberto: null,
      vencimento: null,
      situacao: "em_aberto",
      estado: "cancelado",
    });
    expect(rotuloSituacaoLinha(linha!)).toBe("Cancelado");
    expect(rotuloSituacaoLinha(linha!)).not.toBe("Em aberto");
    expect(linhaVencida(linha!, HOJE)).toBe(false);
  });

  it("ativo com uma parcela usa só os campos oficiais da parcela", () => {
    const detalhe = titulo({
      situacao: "em_aberto",
      parcelas: [parcela(31, 1, "2026-11-01", "300.00", 300)],
    });
    const [linha] = linhasDaListagemAPagar([detalhe]);
    expect(linha).toMatchObject({
      valor: "300.00",
      saldoAberto: 300,
      vencimento: "2026-11-01",
      totalParcelas: 1,
    });
    expect(rotuloParcela(linha!)).toBe("À vista");
    expect(rotuloSituacaoLinha(linha!)).toBe("Em aberto");
  });

  it("cancelado com parcelas mantém valores oficiais e situação Cancelado", () => {
    const detalhe = titulo({
      estado: "cancelado",
      situacao: "parcial",
      parcelas: [
        parcela(41, 1, "2026-09-01", "150.00", 50),
        parcela(42, 2, "2026-11-01", "150.00", 150),
      ],
    });
    const linhas = linhasDaListagemAPagar([detalhe]);
    expect(linhas.map(l => String(l.valor))).toEqual(["150.00", "150.00"]);
    expect(linhas.every(l => String(l.valor) !== "300.00")).toBe(true);
    expect(linhas.map(l => rotuloSituacaoLinha(l))).toEqual(["Cancelado", "Cancelado"]);
    expect(linhas.every(l => linhaVencida(l, HOJE) === false)).toBe(true);
  });

  it("usa saldo e situação oficiais, inclusive em título parcial com parcela vencida", () => {
    const detalhe = titulo({
      situacao: "parcial",
      parcelas: [
        parcela(21, 1, "2026-09-01", "150.00", 50, false),
        parcela(22, 2, "2026-11-01", "150.00", 150, false),
      ],
    });
    const linhas = linhasDaListagemAPagar([detalhe]);
    expect(linhas.map(l => l.situacao)).toEqual(["parcial", "parcial"]);
    expect(linhas.map(l => l.saldoAberto)).toEqual([50, 150]);
    expect(parcelaVencidaEmAberto(detalhe.parcelas[0]!, HOJE)).toBe(true);
    expect(parcelaVencidaEmAberto(detalhe.parcelas[1]!, HOJE)).toBe(false);
    const vencidas = filtrarLinhasContasAPagar(
      linhas,
      todas({ situacao: FILTRO_VENCIDAS }),
      HOJE,
    );
    expect(vencidas.map(l => l.parcelaId)).toEqual([21]);
    expect(vencidas[0]?.situacao).toBe("parcial");
    expect(vencidas[0]?.saldoAberto).toBe(50);
  });

  it("não mistura título a receber na listagem de pagar", () => {
    const linhas = linhasDaListagemAPagar([
      titulo({ id: 1, tipo: "receber", situacao: "em_aberto", parcelas: [parcela(1, 1, "2026-10-20", "80.00", 80)] }),
      titulo({ id: 2, tipo: "pagar", situacao: "vencido", parcelas: [parcela(2, 1, "2026-10-01", "40.00", 40)] }),
    ]);
    expect(linhas.map(l => l.tituloId)).toEqual([2]);
  });
});

describe("contasAPagarListagem — filtros e isolamento", () => {
  const linhas = linhasDaListagemAPagar([
    titulo({
      id: 1,
      pessoaId: 5,
      contraparteNomeSnapshot: "Casa Agro",
      fazendaOrigemId: 1,
      origemTipo: FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
      situacao: "vencido",
      parcelas: [parcela(11, 1, "2026-09-01", "100.00", 100)],
    }),
    titulo({
      id: 2,
      pessoaId: 7,
      contraparteNomeSnapshot: "Oficina Sul",
      fazendaOrigemId: 2,
      origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
      situacao: "em_aberto",
      parcelas: [parcela(12, 1, "2026-11-01", "80.00", 80)],
    }),
    titulo({
      id: 3,
      pessoaId: 5,
      contraparteNomeSnapshot: "Casa Agro",
      fazendaOrigemId: null,
      origemTipo: FINANCEIRO_ORIGEM_MANUAL,
      situacao: "liquidado",
      parcelas: [parcela(13, 1, "2026-08-01", "50.00", 0, true)],
    }),
  ]);

  it("filtra por fazenda, situação, fornecedor e origem", () => {
    const vazios = filtrosContasAPagarVazios(HOJE);
    expect(vazios.situacao).toBe(FILTRO_ATIVOS);
    expect(vazios.periodo).toEqual({ tipo: "mes", anoMes: "2026-10" });
    expect(filtrarLinhasContasAPagar(linhas, todas({ fazendaId: "1" }), HOJE).map(l => l.tituloId)).toEqual([1]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ fazendaId: FILTRO_SEM_FAZENDA }), HOJE).map(l => l.tituloId)).toEqual([3]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ situacao: "em_aberto" }), HOJE).map(l => l.tituloId)).toEqual([2]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ fornecedorId: "7" }), HOJE).map(l => l.tituloId)).toEqual([2]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO }), HOJE).map(l => l.tituloId)).toEqual([2]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ situacao: FILTRO_VENCIDAS }), HOJE).map(l => l.tituloId)).toEqual([1]);
  });

  it("filtro padrão esconde cancelados; Cancelado consulta o histórico", () => {
    const mistas = linhasDaListagemAPagar([
      titulo({ id: 10, estado: "ativo", situacao: "em_aberto", parcelas: [] }),
      titulo({ id: 11, estado: "cancelado", situacao: "em_aberto", parcelas: [] }),
      titulo({
        id: 12,
        estado: "cancelado",
        situacao: "vencido",
        parcelas: [parcela(99, 1, "2026-09-01", "40.00", 40)],
      }),
    ]);
    const padrao = filtrarLinhasContasAPagar(mistas, todas(), HOJE);
    expect(padrao.map(l => l.tituloId)).toEqual([10]);
    expect(padrao.every(l => rotuloSituacaoLinha(l) !== "Cancelado")).toBe(true);

    const historico = filtrarLinhasContasAPagar(
      mistas,
      todas({ situacao: FILTRO_CANCELADO }),
      HOJE,
    );
    expect(historico.map(l => l.tituloId)).toEqual([11, 12]);
    expect(historico.every(l => rotuloSituacaoLinha(l) === "Cancelado")).toBe(true);

    const emAberto = filtrarLinhasContasAPagar(
      mistas,
      todas({ situacao: "em_aberto" }),
      HOJE,
    );
    expect(emAberto.map(l => l.tituloId)).toEqual([10]);

    const vencidas = filtrarLinhasContasAPagar(
      mistas,
      todas({ situacao: FILTRO_VENCIDAS }),
      HOJE,
    );
    expect(vencidas).toEqual([]);
    expect(opcoesSituacaoContasAPagar()).toEqual([
      { value: FILTRO_ATIVOS, label: "Ativas" },
      { value: "em_aberto", label: "Em aberto" },
      { value: "parcial", label: "Parcialmente pagas" },
      { value: FILTRO_VENCIDAS, label: "Vencidas" },
      { value: "liquidado", label: "Pagas" },
      { value: FILTRO_CANCELADO, label: "Canceladas" },
    ]);
  });

  it("descarta título de outro usuário e mantém o do autenticado", () => {
    const misturado = [
      titulo({ id: 1, userId: 10 }),
      titulo({ id: 9, userId: 99, contraparteNomeSnapshot: "Outro dono" }),
    ];
    expect(detalhesDoUsuarioAutenticado(misturado, 10).map(t => t.id)).toEqual([1]);
    expect(detalhesDoUsuarioAutenticado(misturado, 99).map(t => t.id)).toEqual([9]);
  });

  it("rótulos de origem usam os identificadores oficiais", () => {
    expect(rotuloOrigemTitulo(FINANCEIRO_ORIGEM_COMPRA_INSUMOS)).toBe("Compra");
    expect(rotuloOrigemTitulo(FINANCEIRO_ORIGEM_MANUTENCAO)).toBe("Manutenção");
    expect(rotuloOrigemTitulo(FINANCEIRO_ORIGEM_MANUAL)).toBe("Manual");
    expect(rotuloOrigemTitulo("origem_nova_inventada")).toBe("origem_nova_inventada");
    expect(rotuloSituacaoTitulo("vencido")).toBe("Vencido");
    expect(opcoesOrigemContasAPagar(linhas).map(o => o.value)).toEqual([
      FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
      FINANCEIRO_ORIGEM_MANUAL,
      FINANCEIRO_ORIGEM_MANUTENCAO,
    ]);
    expect(opcoesFornecedorContasAPagar(linhas).map(o => o.label)).toEqual(["Casa Agro", "Oficina Sul"]);
    expect(nomeFazendaDaLinha(2, [{ id: 2, nome: "Sede" }])).toBe("Sede");
    expect(nomeFazendaDaLinha(null, [{ id: 2, nome: "Sede" }])).toBe("—");
  });

  it("ordena por vencimento e pagina sem duplicar linhas", () => {
    const ordenadas = ordenarLinhasContasAPagar(linhas);
    expect(ordenadas.map(l => l.tituloId)).toEqual([3, 1, 2]);
    expect(paginarContasAPagar(ordenadas, 2, 1).map(l => l.tituloId)).toEqual([1]);
  });
});

describe("contasAPagarListagem — período e pesquisa", () => {
  const parcelado = titulo({
    id: 20,
    pessoaId: 5,
    contraparteNomeSnapshot: "Casa Agro",
    documentoReferencia: "NF-12",
    origemTipo: FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
    origemId: 8,
    origemItemChave: "principal",
    descricao: "Compra de ração",
    valorOriginal: "300.00",
    situacao: "em_aberto",
    parcelas: [
      parcela(31, 1, "2026-10-10", "100.00", 100),
      parcela(32, 2, "2026-11-10", "100.00", 100),
      parcela(33, 3, "2026-12-10", "100.00", 100),
    ],
  });
  const semParcela = titulo({
    id: 21,
    condicaoStatus: "a_definir",
    documentoReferencia: "PED-9",
    descricao: "Frete da compra",
    parcelas: [],
  });
  const canceladoOutubro = titulo({
    id: 22,
    estado: "cancelado",
    situacao: "em_aberto",
    parcelas: [parcela(41, 1, "2026-10-05", "40.00", 40)],
  });
  const oficina = titulo({
    id: 23,
    pessoaId: 7,
    contraparteNomeSnapshot: "Oficina Sul",
    origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
    origemId: 54,
    descricao: "Revisão do trator",
    situacao: "em_aberto",
    parcelas: [parcela(51, 1, "2026-10-20", "80.00", 80)],
  });
  const linhas = linhasDaListagemAPagar([parcelado, semParcela, canceladoOutubro, oficina]);

  it("abre no mês atual e navega entre meses e anos", () => {
    expect(rotuloMesAno("2026-10")).toBe("Outubro de 2026");
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesSeguinte("2025-12")).toBe("2026-01");
    expect(periodoMesAnterior({ tipo: "todas" }, HOJE)).toEqual({ tipo: "mes", anoMes: "2026-09" });
    expect(periodoMesSeguinte({ tipo: "mes", anoMes: "2026-10" }, HOJE)).toEqual({
      tipo: "mes",
      anoMes: "2026-11",
    });

    const outubro = filtrarLinhasContasAPagar(linhas, filtrosContasAPagarVazios(HOJE), HOJE);
    expect(outubro.map(l => l.parcelaId ?? l.tituloId)).toEqual([31, 51]);
    expect(outubro.every(l => l.estado !== "cancelado")).toBe(true);
    expect(outubro.every(l => String(l.valor) !== "300.00")).toBe(true);

    const novembro = filtrarLinhasContasAPagar(
      linhas,
      { ...filtrosContasAPagarVazios(HOJE), periodo: { tipo: "mes", anoMes: "2026-11" } },
      HOJE,
    );
    expect(novembro.map(l => l.parcelaId)).toEqual([32]);
    expect(String(novembro[0]?.valor)).toBe("100.00");
  });

  it("Todas as datas e Sem vencimento definido não perdem título sem parcela", () => {
    const todasDatas = filtrarLinhasContasAPagar(linhas, todas(), HOJE);
    expect(todasDatas.map(l => l.tituloId)).toEqual([20, 20, 20, 21, 23]);
    expect(todasDatas.filter(l => l.tituloId === 20)).toHaveLength(3);
    expect(somarDinheiro(...todasDatas.filter(l => l.tituloId === 20).map(l => l.valor ?? 0))).toBe(300);

    const semVencimento = filtrarLinhasContasAPagar(
      linhas,
      { ...filtrosContasAPagarVazios(HOJE), periodo: { tipo: "sem_vencimento" } },
      HOJE,
    );
    expect(semVencimento).toHaveLength(1);
    expect(semVencimento[0]).toMatchObject({
      tituloId: 21,
      vencimento: null,
      valor: "300.00",
      saldoAberto: null,
    });
    expect(rotuloParcela(semVencimento[0]!)).toBe(TEXTO_A_DEFINIR);
  });

  it("pesquisa fornecedor, documento e origem junto com os outros filtros", () => {
    expect(filtrarLinhasContasAPagar(linhas, todas({ pesquisa: "casa agro" }), HOJE).map(l => l.tituloId)).toEqual([
      20, 20, 20, 21,
    ]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ pesquisa: "nf-12" }), HOJE).map(l => l.parcelaId)).toEqual([
      31, 32, 33,
    ]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ pesquisa: "compra 8" }), HOJE).map(l => l.tituloId)).toEqual([
      20, 20, 20,
    ]);
    expect(filtrarLinhasContasAPagar(linhas, todas({ pesquisa: "manutenção" }), HOJE).map(l => l.tituloId)).toEqual([23]);

    const combinado = filtrarLinhasContasAPagar(
      linhas,
      {
        ...filtrosContasAPagarVazios(HOJE),
        pesquisa: "ração",
        origemTipo: FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
      },
      HOJE,
    );
    expect(combinado.map(l => l.parcelaId)).toEqual([31]);
    expect(combinado.every(l => l.tituloId !== 22)).toBe(true);
  });
});

describe("contasAPagarListagem — tela, rota e compatibilidade", () => {
  it("rota e menu novos não substituem a Visão Geral", () => {
    expect(FINANCEIRO_CONTAS_A_PAGAR_PATH).toBe("/financeiro/contas-a-pagar");
    expect(menu).toContain('label: "Contas a Pagar"');
    expect(menu).toContain(FINANCEIRO_CONTAS_A_PAGAR_PATH);
    expect(menu).toContain('path: "/financeiro/visao-geral"');
    expect(app).toContain("ContasAPagarPage");
    expect(app).toContain("ContasAPagarDetalhePage");
    expect(app).toContain("FINANCEIRO_CONTAS_A_PAGAR_PATH");
    expect(app).toContain('path="/financeiro/visao-geral" component={FinancialManagementPage}');
  });

  it("a página consulta só o Financeiro V2 e permanece somente leitura", () => {
    expect(page).toContain("financeiroV2.titulosList");
    expect(page).toContain("financeiroV2.titulosGet");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("listMovimentacoes");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).not.toContain("titulosCreateManual");
    expect(page).not.toContain("titulosDefinirParcelas");
    expect(page).not.toContain("titulosApropriar");
    expect(page).not.toContain(".useMutation");
    expect(page).toContain("Somente consulta");
    expect(page).toContain("FILTRO_ATIVOS");
    expect(page).toContain("rotuloSituacaoLinha");
    expect(page).toContain("TEXTO_A_DEFINIR");
    expect(page).toContain("contasAPagarDetalhePath");
    expect(page).toContain("abrirDetalhe");
    expect(page).not.toContain("somenteVencidas");
    expect(page).toContain("Pesquisar");
    expect(page).toContain("Todas as datas");
    expect(page).toContain("Sem vencimento definido");
    expect(page).toContain("chevron_left");
    expect(page).not.toContain("derivarSituacaoTitulo");
  });

  it("preserva filtros da listagem no caminho de detalhe e volta", () => {
    const filtros = todas({
      situacao: FILTRO_VENCIDAS,
      fornecedorId: "18",
      pesquisa: "premix",
    });
    expect(contasAPagarListagemPath(filtros)).toBe(
      "/financeiro/contas-a-pagar?situacao=vencido&fornecedor=18&mes=todas&q=premix",
    );
    expect(contasAPagarDetalhePath(84, filtros)).toBe(
      "/financeiro/contas-a-pagar/84?situacao=vencido&fornecedor=18&mes=todas&q=premix",
    );
    expect(contasAPagarVoltarPath("?situacao=vencido&fornecedor=18&mes=todas&q=premix", HOJE)).toBe(
      contasAPagarListagemPath(filtros),
    );
    expect(filtrosContasAPagarDaQuery("", HOJE)).toMatchObject({
      situacao: FILTRO_ATIVOS,
      periodo: { tipo: "mes", anoMes: "2026-10" },
    });
    expect(filtrosContasAPagarDaQuery("situacao=parcial", HOJE).situacao).toBe("parcial");
    expect(filtrosContasAPagarDaQuery("vencidas=1", HOJE).situacao).toBe(FILTRO_VENCIDAS);
    expect(contasAPagarListagemPath(filtrosContasAPagarDaQuery("vencidas=1", HOJE))).toBe(
      "/financeiro/contas-a-pagar?situacao=vencido&mes=2026-10",
    );
    expect(contasAPagarVoltarPath("situacao=cancelado&fornecedor=18", HOJE)).toBe(
      "/financeiro/contas-a-pagar?situacao=cancelado&fornecedor=18&mes=2026-10",
    );
    expect(filtrosContasAPagarDaQuery(`mes=${PERIODO_TODAS}`, HOJE).periodo).toEqual({ tipo: "todas" });
    expect(filtrosContasAPagarDaQuery(`mes=${PERIODO_SEM_VENCIMENTO}`, HOJE).periodo).toEqual({
      tipo: "sem_vencimento",
    });
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
    expect(legado).toContain("trpc.financeiro.listMovimentacoes");
    expect(legado).not.toContain("financeiroV2");
    expect(dashboard).not.toContain("financeiroV2");
    expect(dashboard).not.toContain("ContasAPagarPage");
  });
});
