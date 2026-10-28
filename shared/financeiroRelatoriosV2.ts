/**
 * Relatórios Financeiro V2 — só agrega fatos oficiais.
 * Não inventa vencimento, fazenda em movimento nem saldo por conta×fazenda.
 */
import { fromCentavos, toCentavos } from "./financeiroMoeda";
import {
  derivarSaldoParcela,
  derivarSituacaoTitulo,
  type FinanceiroDirecao,
  type FinanceiroLiquidacaoTipo,
  type FinanceiroNatureza,
  type TituloSituacaoDerivada,
} from "./financeiroNucleo";

export const FINANCEIRO_RELATORIOS_PATH = "/financeiro/relatorios";
export const MSG_RELATORIO_SALDO_CONSOLIDADO =
  "O saldo de Caixa e Bancos é consolidado. As contas financeiras não têm fazenda.";
export const MSG_RELATORIO_TRANSFERENCIA_FORA_RESULTADO =
  "Transferências entre contas próprias não entram no resultado financeiro.";

export type RelatorioFiltroV2 = {
  de: string;
  ate: string;
  fazendaId?: number | null;
  contaId?: number | null;
  hojeISO: string;
};

export type RelatorioContaEntrada = {
  id: number;
  nome: string;
  ativa: boolean;
  saldoAtual: number | string;
};

export type RelatorioTituloEntrada = {
  id: number;
  userId: number;
  tipo: "pagar" | "receber";
  estado: "ativo" | "cancelado";
  condicaoStatus: "a_definir" | "definida";
  pessoaId: number;
  contraparteNomeSnapshot: string;
  fazendaOrigemId: number | null;
  origemTipo: string;
  origemId: number | null;
  descricao: string;
  valorOriginal: number | string;
  parcelas: Array<{
    id: number;
    numero: number;
    vencimento: string;
    valorOriginal: number | string;
    alocacoes: Array<{
      tipoLiquidacao: FinanceiroLiquidacaoTipo;
      principalLiquidado: number | string;
    }>;
  }>;
};

export type RelatorioMovimentoEntrada = {
  id: number;
  contaId: number;
  contaNome: string;
  dataMovimento: string;
  direcao: FinanceiroDirecao;
  natureza: FinanceiroNatureza;
  valor: number | string;
  descricao: string;
  liquidacaoId: number | null;
  transferenciaId: number | null;
  fazendaOrigemId: number | null;
};

export type RelatorioLinhaTitulo = {
  tituloId: number;
  tipo: "pagar" | "receber";
  pessoa: string;
  fazendaOrigemId: number | null;
  origemTipo: string;
  descricao: string;
  vencimento: string | null;
  valorOriginal: number;
  valorLiquidado: number;
  saldoPendente: number;
  situacao: TituloSituacaoDerivada | "cancelado";
  parcelaId: number | null;
  parcelaNumero: number | null;
};

export type RelatorioLinhaMovimento = {
  movimentoId: number;
  data: string;
  descricao: string;
  tipo: "entrada" | "saida" | "transferencia";
  natureza: FinanceiroNatureza;
  contaNome: string;
  fazendaOrigemId: number | null;
  valor: number;
  transferenciaId: number | null;
};

function iso(data: string) {
  return String(data).slice(0, 10);
}

function noPeriodo(data: string, de: string, ate: string) {
  const d = iso(data);
  return d >= iso(de) && d <= iso(ate);
}

function ehTransferencia(natureza: FinanceiroNatureza) {
  return natureza === "transferencia_saida" || natureza === "transferencia_entrada";
}

function tituloPassaFazenda(fazendaOrigemId: number | null, filtro?: number | null) {
  if (filtro == null) return true;
  return fazendaOrigemId === filtro;
}

function movimentoPassaFiltros(mov: RelatorioMovimentoEntrada, filtro: RelatorioFiltroV2) {
  if (filtro.contaId != null && mov.contaId !== filtro.contaId) return false;
  if (!noPeriodo(mov.dataMovimento, filtro.de, filtro.ate)) return false;
  if (filtro.fazendaId != null) {
    if (ehTransferencia(mov.natureza)) return false;
    return mov.fazendaOrigemId === filtro.fazendaId;
  }
  return true;
}

export function montarRelatorioFinanceiroV2(input: {
  contas: RelatorioContaEntrada[];
  titulos: RelatorioTituloEntrada[];
  movimentos: RelatorioMovimentoEntrada[];
  filtro: RelatorioFiltroV2;
}) {
  const { filtro } = input;
  const contasFiltradas = filtro.contaId == null
    ? input.contas
    : input.contas.filter(c => c.id === filtro.contaId);
  const saldoCaixaBancos = fromCentavos(
    contasFiltradas.reduce((acc, c) => acc + toCentavos(c.saldoAtual), 0),
  );

  const titulos = input.titulos.filter(t => tituloPassaFazenda(t.fazendaOrigemId, filtro.fazendaId));

  const linhasReceber: RelatorioLinhaTitulo[] = [];
  const linhasPagar: RelatorioLinhaTitulo[] = [];
  const previstos: Array<{ tipo: "receber" | "pagar"; vencimento: string; saldo: number }> = [];
  let semVencimentoReceber = 0;
  let semVencimentoPagar = 0;

  for (const titulo of titulos) {
    const parcelasDetalhe = titulo.parcelas.map(p => ({
      ...derivarSaldoParcela(p.valorOriginal, p.alocacoes),
      id: p.id,
      numero: p.numero,
      vencimento: iso(p.vencimento),
    }));
    const situacao = titulo.estado === "cancelado"
      ? "cancelado" as const
      : derivarSituacaoTitulo({
        estado: titulo.estado,
        tipo: titulo.tipo,
        condicaoStatus: titulo.condicaoStatus,
        parcelas: parcelasDetalhe,
        hojeISO: filtro.hojeISO,
      });

    const dest = titulo.tipo === "receber" ? linhasReceber : linhasPagar;

    if (titulo.estado === "cancelado") {
      dest.push({
        tituloId: titulo.id,
        tipo: titulo.tipo,
        pessoa: titulo.contraparteNomeSnapshot,
        fazendaOrigemId: titulo.fazendaOrigemId,
        origemTipo: titulo.origemTipo,
        descricao: titulo.descricao,
        vencimento: null,
        valorOriginal: fromCentavos(toCentavos(titulo.valorOriginal)),
        valorLiquidado: fromCentavos(parcelasDetalhe.reduce((a, p) => a + toCentavos(p.principalLiquidado), 0)),
        saldoPendente: 0,
        situacao,
        parcelaId: null,
        parcelaNumero: null,
      });
      continue;
    }

    if (titulo.condicaoStatus === "a_definir" || parcelasDetalhe.length === 0) {
      const pendente = fromCentavos(toCentavos(titulo.valorOriginal));
      if (titulo.tipo === "receber") semVencimentoReceber += toCentavos(pendente);
      else semVencimentoPagar += toCentavos(pendente);
      dest.push({
        tituloId: titulo.id,
        tipo: titulo.tipo,
        pessoa: titulo.contraparteNomeSnapshot,
        fazendaOrigemId: titulo.fazendaOrigemId,
        origemTipo: titulo.origemTipo,
        descricao: titulo.descricao,
        vencimento: null,
        valorOriginal: pendente,
        valorLiquidado: 0,
        saldoPendente: pendente,
        situacao,
        parcelaId: null,
        parcelaNumero: null,
      });
      continue;
    }

    for (const parcela of parcelasDetalhe) {
      dest.push({
        tituloId: titulo.id,
        tipo: titulo.tipo,
        pessoa: titulo.contraparteNomeSnapshot,
        fazendaOrigemId: titulo.fazendaOrigemId,
        origemTipo: titulo.origemTipo,
        descricao: titulo.descricao,
        vencimento: parcela.vencimento,
        valorOriginal: parcela.valorOriginal,
        valorLiquidado: parcela.principalLiquidado,
        saldoPendente: parcela.saldoPrincipal,
        situacao,
        parcelaId: parcela.id,
        parcelaNumero: parcela.numero,
      });
      if (toCentavos(parcela.saldoPrincipal) > 0) {
        previstos.push({
          tipo: titulo.tipo,
          vencimento: parcela.vencimento,
          saldo: toCentavos(parcela.saldoPrincipal),
        });
      }
    }
  }

  function resumoTipo(linhas: RelatorioLinhaTitulo[], tipo: "pagar" | "receber") {
    const ativas = linhas.filter(l => l.situacao !== "cancelado");
    const pendentes = ativas.filter(l => toCentavos(l.saldoPendente) > 0);
    const vencidas = pendentes.filter(l => l.vencimento && l.vencimento < filtro.hojeISO);
    const aVencer = pendentes.filter(l => l.vencimento && l.vencimento >= filtro.hojeISO);
    const titulosIds = new Set(ativas.map(l => l.tituloId));
    return {
      totalPendente: fromCentavos(pendentes.reduce((a, l) => a + toCentavos(l.saldoPendente), 0)),
      totalVencido: fromCentavos(vencidas.reduce((a, l) => a + toCentavos(l.saldoPendente), 0)),
      aVencer: fromCentavos(aVencer.reduce((a, l) => a + toCentavos(l.saldoPendente), 0)),
      semVencimento: fromCentavos(tipo === "receber" ? semVencimentoReceber : semVencimentoPagar),
      quantidadeTitulos: titulosIds.size,
      quantidadeParcelasPendentes: pendentes.filter(l => l.parcelaId != null).length,
      linhas,
    };
  }

  const movimentosPeriodo = input.movimentos.filter(m => movimentoPassaFiltros(m, filtro));
  const realizados: RelatorioLinhaMovimento[] = [];
  const transferenciasVistas = new Set<number>();
  let entradasCent = 0;
  let saidasCent = 0;

  for (const mov of movimentosPeriodo) {
    const valor = fromCentavos(toCentavos(mov.valor));
    if (ehTransferencia(mov.natureza)) {
      if (mov.transferenciaId != null) {
        if (transferenciasVistas.has(mov.transferenciaId)) continue;
        transferenciasVistas.add(mov.transferenciaId);
      }
      realizados.push({
        movimentoId: mov.id,
        data: iso(mov.dataMovimento),
        descricao: mov.descricao,
        tipo: "transferencia",
        natureza: mov.natureza,
        contaNome: mov.contaNome,
        fazendaOrigemId: null,
        valor,
        transferenciaId: mov.transferenciaId,
      });
      continue;
    }
    if (mov.direcao === "entrada") entradasCent += toCentavos(valor);
    else saidasCent += toCentavos(valor);
    realizados.push({
      movimentoId: mov.id,
      data: iso(mov.dataMovimento),
      descricao: mov.descricao,
      tipo: mov.direcao,
      natureza: mov.natureza,
      contaNome: mov.contaNome,
      fazendaOrigemId: mov.fazendaOrigemId,
      valor,
      transferenciaId: null,
    });
  }

  realizados.sort((a, b) => a.data.localeCompare(b.data) || a.movimentoId - b.movimentoId);

  const previstosPeriodo = previstos.filter(p => noPeriodo(p.vencimento, filtro.de, filtro.ate));
  const previstoReceber = fromCentavos(
    previstosPeriodo.filter(p => p.tipo === "receber").reduce((a, p) => a + p.saldo, 0),
  );
  const previstoPagar = fromCentavos(
    previstosPeriodo.filter(p => p.tipo === "pagar").reduce((a, p) => a + p.saldo, 0),
  );

  const podeProjetarSaldo = filtro.fazendaId == null && filtro.contaId == null;
  const previstosFuturos = previstos.filter(p => p.vencimento >= filtro.hojeISO);
  const saldoProjetado = podeProjetarSaldo
    ? fromCentavos(
      toCentavos(saldoCaixaBancos)
      + previstosFuturos.filter(p => p.tipo === "receber").reduce((a, p) => a + p.saldo, 0)
      - previstosFuturos.filter(p => p.tipo === "pagar").reduce((a, p) => a + p.saldo, 0),
    )
    : null;

  const receber = resumoTipo(linhasReceber, "receber");
  const pagar = resumoTipo(linhasPagar, "pagar");

  return {
    visao: {
      saldoCaixaBancos,
      saldoConsolidadoSemFazenda: true,
      totalAReceber: receber.totalPendente,
      totalAPagar: pagar.totalPendente,
      recebimentosPeriodo: fromCentavos(
        movimentosPeriodo
          .filter(m => !ehTransferencia(m.natureza) && m.direcao === "entrada")
          .reduce((a, m) => a + toCentavos(m.valor), 0),
      ),
      pagamentosPeriodo: fromCentavos(
        movimentosPeriodo
          .filter(m => !ehTransferencia(m.natureza) && m.direcao === "saida")
          .reduce((a, m) => a + toCentavos(m.valor), 0),
      ),
      resultadoRealizado: fromCentavos(entradasCent - saidasCent),
    },
    fluxoRealizado: {
      entradas: fromCentavos(entradasCent),
      saidas: fromCentavos(saidasCent),
      resultado: fromCentavos(entradasCent - saidasCent),
      linhas: realizados,
    },
    fluxoPrevisto: {
      recebimentos: previstoReceber,
      pagamentos: previstoPagar,
      resultado: fromCentavos(toCentavos(previstoReceber) - toCentavos(previstoPagar)),
      semVencimentoReceber: fromCentavos(semVencimentoReceber),
      semVencimentoPagar: fromCentavos(semVencimentoPagar),
      saldoProjetado,
      linhas: previstosPeriodo
        .map(p => ({ tipo: p.tipo, vencimento: p.vencimento, saldo: fromCentavos(p.saldo) }))
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    },
    receber: {
      ...receber,
      recebidoPeriodo: fromCentavos(
        movimentosPeriodo
          .filter(m => m.natureza === "recebimento")
          .reduce((a, m) => a + toCentavos(m.valor), 0),
      ),
    },
    pagar: {
      ...pagar,
      pagoPeriodo: fromCentavos(
        movimentosPeriodo
          .filter(m => m.natureza === "pagamento")
          .reduce((a, m) => a + toCentavos(m.valor), 0),
      ),
    },
  };
}

export type RelatorioFinanceiroV2 = ReturnType<typeof montarRelatorioFinanceiroV2>;
