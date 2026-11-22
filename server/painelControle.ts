import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  animalLoteMovimentacoes,
  animais,
  benfeitorias,
  compras,
  estoque,
  estoqueMovimentacoes,
  fazendas,
  lotes,
  maquinas,
  manutencoes,
  pastos,
  reproducaoRegistros,
  saudeRegistros,
  vendas,
} from "../drizzle/schema";
import {
  agregarAlertasPainel,
  agregarEstoquePainel,
  agregarOcupacaoPainel,
  agregarRebanhoPainel,
  animalNasFazendasPainel,
  type AutorizacaoBlocoPainel,
  type AutorizacaoPainel,
  emptyPainelComercial,
  emptyPainelFinanceiro,
  haRegistrosSemFazendaNoRelatorioV2,
  indicadoresFinanceirosDoRelatorioV2,
  montarPainelOverview,
  MSG_PAINEL_FAZENDA_NEGADA,
  operacaoComercialVisivelPainel,
  PAINEL_COMERCIAL_RECENTES,
  periodoMesCorrentePainel,
  resolverEscopoFazendasPainel,
  type PainelComercial,
  type PainelFazendaRef,
  type PainelFinanceiro,
  type PainelOperacaoRecente,
  type PainelOverview,
} from "../shared/painelControle";
import { filtrarMovimentacoesEstoque, filtrarProdutosEstoque } from "../shared/estoqueIsolamento";
import { buildLoteFazendaContext } from "./animaisPorFazenda";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { compraVisivelNoEscopo } from "./consultaCompraAutorizada";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { vendaVisivelNoEscopo } from "./consultaVendaAutorizada";
import { db } from "./db";
import { financeiroNucleoService } from "./financeiroNucleo";
import { acessoFinanceiroNoBanco } from "./consultaFinanceiroDb";
import {
  MSG_EXTRATO_SO_PRINCIPAL,
  PERMISSAO_VER_FINANCEIRO,
  type AcessoFinanceiro,
} from "./consultaFinanceiroAutorizada";
import type { RelatorioFinanceiroV2 } from "../shared/financeiroRelatoriosV2";
import { isDatabaseUnavailable } from "./localFallbackStore";

type BancoPainel = typeof db;

const PERMISSOES_PAINEL = [
  "animais.visualizar",
  "lotes.visualizar",
  "pastos.visualizar",
  "fazendas.visualizar",
  "estoque.visualizar",
  "saude.visualizar",
  "reproducao.visualizar",
  "manutencoes.visualizar",
  "maquinas.visualizar",
  "benfeitorias.visualizar",
  "compras.visualizar",
  "vendas.visualizar",
] as const;

type PermissaoPainel = (typeof PERMISSOES_PAINEL)[number];

type AcessosPainel = {
  titularUserId: number;
  papel: string;
  fazendas: PainelFazendaRef[];
  concedidas: Record<PermissaoPainel, number[] | null>;
};

export const MSG_PAINEL_SEM_MYSQL =
  "O Painel precisa do banco oficial. Nada foi lido do arquivo local.";

function recorteFazendas(ids: number[] | null, selecionada: number | null): number[] | null {
  if (ids == null) return null;
  if (selecionada == null) return ids;
  return ids.includes(selecionada) ? [selecionada] : [];
}

function estadoRecorte(ids: number[] | null, selecionada: number | null): AutorizacaoBlocoPainel {
  if (ids == null) return "sem_permissao";
  if (selecionada != null && !ids.includes(selecionada)) return "sem_permissao";
  return "autorizado";
}

function sessaoInvalida(): TRPCError {
  return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
}

async function resolverAcessosPainel(
  banco: BancoPainel,
  executorId: number,
  sessionVersion: number | null,
): Promise<AcessosPainel> {
  return banco.transaction(async (tx) => {
    const consulta = consultaEstoqueNaTransacao(tx);
    const usuario = await consulta.usuario(executorId);
    if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo") throw sessaoInvalida();
    if (sessionVersion != null && sessionVersion !== usuario.sessionVersion) throw sessaoInvalida();
    const fazendasTitular = await consulta.fazendasDoTitular(usuario.titularUserId);
    const concedidas = {} as AcessosPainel["concedidas"];
    for (const permissaoId of PERMISSOES_PAINEL) {
      const ids: number[] = [];
      let negada = false;
      for (const fazenda of fazendasTitular) {
        const decisao = await autorizarOperacaoPersistida(consulta, {
          executorId,
          sessionVersionDaSessao: sessionVersion,
          permissaoId,
          fazendaId: fazenda.id,
        });
        if (!decisao.ok) {
          if (decisao.motivo === "sem_identidade") throw sessaoInvalida();
          if (decisao.motivo === "sem_permissao" || decisao.motivo === "permissao_invalida") {
            negada = true;
            break;
          }
          continue;
        }
        ids.push(fazenda.id);
      }
      concedidas[permissaoId] = negada ? null : ids;
    }
    const detalhes = await tx
      .select({ id: fazendas.id, nome: fazendas.nome, area: fazendas.area })
      .from(fazendas)
      .where(eq(fazendas.userId, usuario.titularUserId));
    const areaLiberada = new Set(concedidas["fazendas.visualizar"] ?? []);
    const uniao = new Set<number>();
    if (usuario.papel === "principal") {
      for (const fazenda of detalhes) if (fazenda.id > 0) uniao.add(fazenda.id);
    } else {
      for (const ids of Object.values(concedidas)) {
        if (!ids) continue;
        for (const id of ids) uniao.add(id);
      }
    }
    const lista = detalhes
      .filter((row) => row.id > 0 && uniao.has(row.id))
      .map((row) => ({
        id: row.id,
        nome: row.nome,
        area: usuario.papel === "principal" || areaLiberada.has(row.id) ? Number(row.area) || 0 : 0,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return {
      titularUserId: usuario.titularUserId,
      papel: usuario.papel,
      fazendas: lista,
      concedidas,
    };
  }, { isolationLevel: "read committed" });
}

function valorOperacaoPainel(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type IoFinanceiroPainel = {
  autorizar(pedido: {
    executorId: number;
    sessionVersionDaSessao: number | null;
  }): Promise<AcessoFinanceiro>;
  relatorio(
    titularUserId: number,
    input: { de: string; ate: string; fazendaId?: number | null },
    escopo: AcessoFinanceiro,
  ): Promise<RelatorioFinanceiroV2>;
};

function ioFinanceiroPainel(): IoFinanceiroPainel {
  return {
    autorizar(pedido) {
      return acessoFinanceiroNoBanco({
        executorId: pedido.executorId,
        sessionVersionDaSessao: pedido.sessionVersionDaSessao,
        permissaoId: PERMISSAO_VER_FINANCEIRO,
      });
    },
    relatorio(titularUserId, input, escopo) {
      return financeiroNucleoService.relatorioFinanceiro(titularUserId, input, escopo);
    },
  };
}

export async function financeiroDoPainel(
  io: IoFinanceiroPainel,
  pedido: {
    executorId: number;
    sessionVersionDaSessao: number | null;
    fazendaSelecionadaId: number | null;
    referencia?: Date;
  },
): Promise<PainelFinanceiro> {
  let acesso: AcessoFinanceiro;
  try {
    acesso = await io.autorizar({
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") throw error;
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      return emptyPainelFinanceiro(pedido.referencia, "sem_permissao");
    }
    if (isDatabaseUnavailable(error)) return emptyPainelFinanceiro(pedido.referencia, "indisponivel");
    throw error;
  }
  if (
    pedido.fazendaSelecionadaId != null
    && acesso.papel !== "principal"
    && !acesso.fazendaIds.includes(pedido.fazendaSelecionadaId)
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_PAINEL_FAZENDA_NEGADA });
  }
  try {
    const periodo = periodoMesCorrentePainel(pedido.referencia);
    const rel = await io.relatorio(acesso.titularUserId, {
      de: periodo.de,
      ate: periodo.ate,
      fazendaId: pedido.fazendaSelecionadaId,
    }, acesso);
    const consolidado = pedido.fazendaSelecionadaId == null
      ? rel
      : await io.relatorio(acesso.titularUserId, {
        de: periodo.de,
        ate: periodo.ate,
        fazendaId: null,
      }, acesso);
    const indicadores = indicadoresFinanceirosDoRelatorioV2(rel.visao, {
      fazendaSelecionadaId: pedido.fazendaSelecionadaId,
      periodo,
      temRegistrosSemFazenda: haRegistrosSemFazendaNoRelatorioV2(consolidado),
    });
    if (acesso.papel === "principal") return indicadores;
    return {
      ...indicadores,
      saldoCaixaAutorizado: false,
      saldoCaixaBancos: 0,
      avisoCaixa: MSG_EXTRATO_SO_PRINCIPAL,
    };
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) throw error;
    console.warn("[painel] Financeiro V2 indisponível no resumo:", error);
    return emptyPainelFinanceiro(pedido.referencia, "indisponivel");
  }
}


type OpcoesPainel = {
  banco?: BancoPainel;
  financeiro?: IoFinanceiroPainel;
};

export type StatsPainel = {
  totalAnimais: number | null;
  totalLotes: number | null;
  totalMaquinas: number | null;
  totalBenfeitorias: number | null;
  totalReceitas: null;
  totalDespesas: null;
  saldoTotal: null;
};

function bancoDe(opcoes?: OpcoesPainel): BancoPainel {
  return opcoes?.banco ?? db;
}

function falhaPainel(error: unknown): never {
  if (
    error instanceof TRPCError
    && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN" || error.code === "PRECONDITION_FAILED")
  ) {
    throw error;
  }
  if (isDatabaseUnavailable(error)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_PAINEL_SEM_MYSQL });
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function contextoLotes(banco: BancoPainel, titularUserId: number) {
  const [lotesList, pastosList] = await Promise.all([
    banco
      .select({ id: lotes.id, fazendaId: lotes.fazendaId, pastoAtualId: lotes.pastoAtualId })
      .from(lotes)
      .where(eq(lotes.userId, titularUserId)),
    banco
      .select({ id: pastos.id, fazendaId: pastos.fazendaId })
      .from(pastos)
      .where(eq(pastos.userId, titularUserId)),
  ]);
  return buildLoteFazendaContext(lotesList, pastosList).loteFazendaById;
}

async function carregarComercialPainel(
  banco: BancoPainel,
  acessos: AcessosPainel,
  comprasIds: number[] | null,
  vendasIds: number[] | null,
  fazendaSelecionadaId: number | null,
): Promise<PainelComercial> {
  const escopoCompra = {
    titularUserId: acessos.titularUserId,
    fazendaIds: comprasIds ?? [],
    papel: acessos.papel,
  };
  const escopoVenda = {
    titularUserId: acessos.titularUserId,
    fazendaIds: vendasIds ?? [],
    papel: acessos.papel,
  };
  const comprasVisiveis: PainelOperacaoRecente[] = [];
  const vendasVisiveis: PainelOperacaoRecente[] = [];
  if (comprasIds != null && (comprasIds.length > 0 || acessos.papel === "principal")) {
    const filtro = acessos.papel === "principal" && fazendaSelecionadaId == null
      ? eq(compras.userId, acessos.titularUserId)
      : and(eq(compras.userId, acessos.titularUserId), inArray(compras.fazendaId, comprasIds));
    const rows = await banco
      .select({
        id: compras.id,
        data: compras.data,
        fornecedor: compras.fornecedor,
        valorTotal: compras.valorTotal,
        custoTotal: compras.custoTotal,
        status: compras.status,
        fazendaId: compras.fazendaId,
      })
      .from(compras)
      .where(filtro)
      .orderBy(desc(compras.data), desc(compras.id))
      .limit(20);
    for (const row of rows) {
      if (!compraVisivelNoEscopo(row.fazendaId, escopoCompra)) continue;
      if (!operacaoComercialVisivelPainel(row, fazendaSelecionadaId)) continue;
      if (comprasVisiveis.length >= PAINEL_COMERCIAL_RECENTES) break;
      comprasVisiveis.push({
        id: row.id,
        tipo: "compra",
        data: row.data ?? null,
        parceiro: String(row.fornecedor ?? "").trim() || "—",
        valor: valorOperacaoPainel(row.custoTotal ?? row.valorTotal),
      });
    }
  }
  if (vendasIds != null && (vendasIds.length > 0 || acessos.papel === "principal")) {
    const filtro = acessos.papel === "principal" && fazendaSelecionadaId == null
      ? eq(vendas.userId, acessos.titularUserId)
      : and(eq(vendas.userId, acessos.titularUserId), inArray(vendas.fazendaId, vendasIds));
    const rows = await banco
      .select({
        id: vendas.id,
        data: vendas.data,
        comprador: vendas.comprador,
        valorTotal: vendas.valorTotal,
        status: vendas.status,
        fazendaId: vendas.fazendaId,
      })
      .from(vendas)
      .where(filtro)
      .orderBy(desc(vendas.data), desc(vendas.id))
      .limit(20);
    for (const row of rows) {
      if (!vendaVisivelNoEscopo(row.fazendaId, escopoVenda)) continue;
      if (!operacaoComercialVisivelPainel(row, fazendaSelecionadaId)) continue;
      if (vendasVisiveis.length >= PAINEL_COMERCIAL_RECENTES) break;
      vendasVisiveis.push({
        id: row.id,
        tipo: "venda",
        data: row.data ?? null,
        parceiro: String(row.comprador ?? "").trim() || "—",
        valor: valorOperacaoPainel(row.valorTotal),
      });
    }
  }
  return { compras: comprasVisiveis, vendas: vendasVisiveis };
}

async function carregarPainelMysql(
  banco: BancoPainel,
  acessos: AcessosPainel,
  escopo: Extract<ReturnType<typeof resolverEscopoFazendasPainel>, { ok: true }>,
): Promise<PainelOverview> {
  const selecionada = escopo.fazendaSelecionadaId;
  const titular = acessos.titularUserId;
  const animaisIds = recorteFazendas(acessos.concedidas["animais.visualizar"], selecionada);
  const lotesIds = recorteFazendas(acessos.concedidas["lotes.visualizar"], selecionada);
  const pastosIds = recorteFazendas(acessos.concedidas["pastos.visualizar"], selecionada);
  const estoqueIds = recorteFazendas(acessos.concedidas["estoque.visualizar"], selecionada);
  const saudeIds = recorteFazendas(acessos.concedidas["saude.visualizar"], selecionada);
  const reproIds = recorteFazendas(acessos.concedidas["reproducao.visualizar"], selecionada);
  const manutIds = recorteFazendas(acessos.concedidas["manutencoes.visualizar"], selecionada);
  const comprasIds = recorteFazendas(acessos.concedidas["compras.visualizar"], selecionada);
  const vendasIds = recorteFazendas(acessos.concedidas["vendas.visualizar"], selecionada);
  const autorizacao: AutorizacaoPainel = {
    rebanho: estadoRecorte(acessos.concedidas["animais.visualizar"], selecionada),
    estoque: estadoRecorte(acessos.concedidas["estoque.visualizar"], selecionada),
    lotes: estadoRecorte(acessos.concedidas["lotes.visualizar"], selecionada),
    pastos: estadoRecorte(acessos.concedidas["pastos.visualizar"], selecionada),
    area: estadoRecorte(acessos.concedidas["fazendas.visualizar"], selecionada),
    sanidade: estadoRecorte(acessos.concedidas["saude.visualizar"], selecionada),
    reproducao: estadoRecorte(acessos.concedidas["reproducao.visualizar"], selecionada),
    manutencao: estadoRecorte(acessos.concedidas["manutencoes.visualizar"], selecionada),
    compras: estadoRecorte(acessos.concedidas["compras.visualizar"], selecionada),
    vendas: estadoRecorte(acessos.concedidas["vendas.visualizar"], selecionada),
  };

  const loteFazendaById = await contextoLotes(banco, titular);
  const animaisAtivos = animaisIds == null
    ? []
    : await banco
      .select({
        id: animais.id,
        sexo: animais.sexo,
        categoria: animais.categoria,
        dataNascimento: animais.dataNascimento,
        pesoAtual: animais.pesoAtual,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        brinco: animais.brinco,
        nome: animais.nome,
      })
      .from(animais)
      .where(and(eq(animais.userId, titular), eq(animais.status, "ativo")));
  const visiveis = animaisIds == null
    ? []
    : animaisAtivos.filter((animal) => animalNasFazendasPainel(animal, animaisIds, loteFazendaById));
  const animalIds = visiveis.map((animal) => animal.id);
  const animalPorId = new Map(visiveis.map((animal) => [animal.id, animal]));

  const fazendaIds = estoqueIds ?? [];
  const produtos = fazendaIds.length === 0
    ? []
    : filtrarProdutosEstoque(
      await banco.select({
        id: estoque.id,
        fazendaId: estoque.fazendaId,
        nome: estoque.nome,
        quantidade: estoque.quantidade,
        quantidadeMinima: estoque.quantidadeMinima,
        unidade: estoque.unidade,
        monitorarEstoque: estoque.monitorarEstoque,
        controlarSaldo: estoque.controlarSaldo,
        valorUnitario: estoque.valorUnitario,
        valorTotalEstoque: estoque.valorTotalEstoque,
        capitalInicializadoEm: estoque.capitalInicializadoEm,
      }).from(estoque).where(inArray(estoque.fazendaId, fazendaIds)),
      fazendaIds,
    );
  const movs = fazendaIds.length === 0
    ? []
    : filtrarMovimentacoesEstoque(
      await banco
        .select({
          nome: estoque.nome,
          dataValidade: estoqueMovimentacoes.dataValidade,
          fazendaId: estoqueMovimentacoes.fazendaId,
          produtoFazendaId: estoque.fazendaId,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoque.id, estoqueMovimentacoes.estoqueId))
        .where(and(inArray(estoque.fazendaId, fazendaIds), isNotNull(estoqueMovimentacoes.dataValidade))),
      fazendaIds,
    );

  const animaisSaude = await animaisSemHistoricoFora(banco, titular, animalIds, saudeIds);
  const animaisRepro = await animaisSemHistoricoFora(banco, titular, animalIds, reproIds);
  const saudeAlertas = animaisSaude.length === 0
    ? []
    : await banco
      .select({
        tipo: saudeRegistros.tipo,
        medicamento: saudeRegistros.medicamento,
        proximaData: saudeRegistros.proximaData,
      })
      .from(saudeRegistros)
      .where(and(
        eq(saudeRegistros.userId, titular),
        inArray(saudeRegistros.animalId, animaisSaude),
        isNotNull(saudeRegistros.proximaData),
      ));
  const saudeRecente = animaisSaude.length === 0
    ? []
    : await banco
      .select({
        id: saudeRegistros.id,
        animalId: saudeRegistros.animalId,
        tipo: saudeRegistros.tipo,
        medicamento: saudeRegistros.medicamento,
        dataRegistro: saudeRegistros.dataRegistro,
      })
      .from(saudeRegistros)
      .where(and(eq(saudeRegistros.userId, titular), inArray(saudeRegistros.animalId, animaisSaude)))
      .orderBy(desc(saudeRegistros.createdAt))
      .limit(6);
  const partosRows = animaisRepro.length === 0
    ? []
    : await banco
      .select({
        femeaId: reproducaoRegistros.femeaId,
        dataPrevistoParto: reproducaoRegistros.dataPrevistoParto,
        dataPartoReal: reproducaoRegistros.dataPartoReal,
      })
      .from(reproducaoRegistros)
      .where(and(
        eq(reproducaoRegistros.userId, titular),
        inArray(reproducaoRegistros.femeaId, animaisRepro),
        isNotNull(reproducaoRegistros.dataPrevistoParto),
      ));

  const maquinasEscopo = await listarMaquinasPainel(banco, titular, manutIds);
  const maquinaIds = maquinasEscopo.map((item) => item.id);
  const manutRows = maquinaIds.length === 0
    ? []
    : await banco
      .select({
        tipo: manutencoes.tipo,
        status: manutencoes.status,
        proximaManutencao: manutencoes.proximaManutencao,
      })
      .from(manutencoes)
      .where(and(
        eq(manutencoes.userId, titular),
        inArray(manutencoes.maquinaId, maquinaIds),
        ne(manutencoes.status, "concluida"),
        isNotNull(manutencoes.proximaManutencao),
      ));

  const pastosRows = await listarPastosPainel(banco, titular, pastosIds);
  const pastoIds = pastosRows.map((pasto) => pasto.id);
  const lotesNoPasto = pastoIds.length === 0
    ? []
    : await banco
      .select({ id: lotes.id, pastoAtualId: lotes.pastoAtualId })
      .from(lotes)
      .where(and(eq(lotes.userId, titular), inArray(lotes.pastoAtualId, pastoIds)));
  const loteIdsPasto = lotesNoPasto.map((lote) => lote.id);
  const contagemPorLote = loteIdsPasto.length === 0 || animaisIds == null
    ? []
    : await banco
      .select({ loteId: animais.loteId, qtd: sql<number>`COUNT(*)` })
      .from(animais)
      .where(and(
        eq(animais.userId, titular),
        eq(animais.status, "ativo"),
        inArray(animais.loteId, loteIdsPasto),
      ))
      .groupBy(animais.loteId);
  const qtdPorLote = new Map(contagemPorLote.map((row) => [Number(row.loteId), Number(row.qtd)]));
  const qtdPorPasto = new Map<number, number>();
  for (const lote of lotesNoPasto) {
    if (lote.pastoAtualId == null) continue;
    const fazendaLote = loteFazendaById.get(lote.id) ?? null;
    if (animaisIds != null && (fazendaLote == null || !animaisIds.includes(fazendaLote))) continue;
    qtdPorPasto.set(
      lote.pastoAtualId,
      (qtdPorPasto.get(lote.pastoAtualId) ?? 0) + (qtdPorLote.get(lote.id) ?? 0),
    );
  }
  const totalLotes = lotesIds == null
    ? 0
    : [...loteFazendaById.entries()].filter(([, fazendaId]) => fazendaId != null && lotesIds.includes(fazendaId)).length;

  const estoqueResumo = agregarEstoquePainel(autorizacao.estoque === "autorizado" ? produtos : []);
  const painel = montarPainelOverview({
    escopo,
    totalLotes: autorizacao.lotes === "autorizado" ? totalLotes : 0,
    totalPastos: autorizacao.pastos === "autorizado" ? pastosRows.length : 0,
    rebanho: agregarRebanhoPainel(autorizacao.rebanho === "autorizado" ? visiveis : []),
    estoque: autorizacao.estoque === "autorizado" ? estoqueResumo : { valorTotal: 0, totalProdutos: 0, baixo: [] },
    alertas: agregarAlertasPainel({
      estoqueBaixo: autorizacao.estoque === "autorizado" ? estoqueResumo.baixo : [],
      movimentacoes: autorizacao.estoque === "autorizado" ? movs : [],
      saude: autorizacao.sanidade === "autorizado" ? saudeAlertas : [],
      partos: autorizacao.reproducao === "autorizado"
        ? partosRows.map((row) => ({ ...row, femea: animalPorId.get(row.femeaId) ?? null }))
        : [],
      manutencoes: autorizacao.manutencao === "autorizado" ? manutRows : [],
    }),
    ocupacao: autorizacao.pastos === "autorizado"
      ? agregarOcupacaoPainel(pastosRows.map((pasto) => ({ ...pasto, qtdAnimais: qtdPorPasto.get(pasto.id) ?? 0 })))
      : [],
    saudeRecente: autorizacao.sanidade === "autorizado"
      ? saudeRecente.map((item) => ({
        id: item.id,
        animalId: item.animalId,
        tipo: item.tipo,
        medicamento: item.medicamento ?? null,
        dataRegistro: item.dataRegistro ?? null,
      }))
      : [],
    comercial: await carregarComercialPainel(banco, acessos, comprasIds, vendasIds, selecionada),
    autorizacao,
  });
  if (autorizacao.area !== "autorizado") painel.areaTotal = 0;
  else {
    const areaIds = new Set(recorteFazendas(acessos.concedidas["fazendas.visualizar"], selecionada) ?? []);
    painel.areaTotal = painel.fazendas
      .filter((fazenda) => areaIds.has(fazenda.id) && (selecionada == null || fazenda.id === selecionada))
      .reduce((soma, fazenda) => soma + (Number(fazenda.area) || 0), 0);
  }
  if (autorizacao.compras !== "autorizado") painel.comercial.compras = [];
  if (autorizacao.vendas !== "autorizado") painel.comercial.vendas = [];
  return painel;
}

async function listarPastosPainel(banco: BancoPainel, titularUserId: number, fazendaIds: number[] | null) {
  if (fazendaIds == null || fazendaIds.length === 0) return [];
  return banco
    .select({ id: pastos.id, nome: pastos.nome, capacidade: pastos.capacidade })
    .from(pastos)
    .where(and(eq(pastos.userId, titularUserId), inArray(pastos.fazendaId, fazendaIds)));
}

async function listarMaquinasPainel(banco: BancoPainel, titularUserId: number, fazendaIds: number[] | null) {
  if (fazendaIds == null || fazendaIds.length === 0) return [];
  return banco
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.userId, titularUserId), inArray(maquinas.fazendaId, fazendaIds)));
}

async function animaisSemHistoricoFora(
  banco: BancoPainel,
  titularUserId: number,
  animalIds: number[],
  fazendasEvento: number[] | null,
): Promise<number[]> {
  if (fazendasEvento == null || animalIds.length === 0) return [];
  const permitidas = new Set(fazendasEvento);
  const movimentos = await banco
    .select({
      animalId: animalLoteMovimentacoes.animalId,
      fazendaId: animalLoteMovimentacoes.fazendaId,
      fazendaOrigemId: animalLoteMovimentacoes.fazendaOrigemId,
    })
    .from(animalLoteMovimentacoes)
    .where(and(
      eq(animalLoteMovimentacoes.userId, titularUserId),
      inArray(animalLoteMovimentacoes.animalId, animalIds),
    ));
  const fora = new Set<number>();
  for (const movimento of movimentos) {
    const destinoFora = movimento.fazendaId != null && !permitidas.has(movimento.fazendaId);
    const origemFora = movimento.fazendaOrigemId != null && !permitidas.has(movimento.fazendaOrigemId);
    if (destinoFora || origemFora) fora.add(movimento.animalId);
  }
  return animalIds.filter((id) => !fora.has(id));
}

async function contarOnde(
  banco: BancoPainel,
  tabela: typeof animais | typeof lotes | typeof maquinas | typeof benfeitorias,
  titularUserId: number,
  fazendaIds: number[] | null,
  papel: string,
): Promise<number | null> {
  if (fazendaIds == null) return null;
  if (papel === "principal") {
    const [linha] = await banco
      .select({ count: sql<number>`COUNT(*)` })
      .from(tabela)
      .where(eq(tabela.userId, titularUserId));
    return Number(linha?.count || 0);
  }
  if (fazendaIds.length === 0) return 0;
  if (tabela === animais) {
    const linhas = await banco
      .select({ fazendaId: animais.fazendaId, loteId: animais.loteId })
      .from(animais)
      .where(eq(animais.userId, titularUserId));
    const loteFazendaById = await contextoLotes(banco, titularUserId);
    return linhas.filter((animal) => animalNasFazendasPainel(animal, fazendaIds, loteFazendaById)).length;
  }
  if (tabela === lotes) {
    const loteFazendaById = await contextoLotes(banco, titularUserId);
    return [...loteFazendaById.values()].filter((fazendaId) => fazendaId != null && fazendaIds.includes(fazendaId)).length;
  }
  const [linha] = await banco
    .select({ count: sql<number>`COUNT(*)` })
    .from(tabela)
    .where(and(eq(tabela.userId, titularUserId), inArray(tabela.fazendaId, fazendaIds)));
  return Number(linha?.count || 0);
}

export async function carregarStatsPainel(
  executorId: number,
  sessionVersion?: number | null,
  opcoes?: OpcoesPainel,
): Promise<StatsPainel> {
  try {
    const banco = bancoDe(opcoes);
    const acessos = await resolverAcessosPainel(banco, executorId, sessionVersion ?? null);
    const [totalAnimais, totalLotes, totalMaquinas, totalBenfeitorias] = await Promise.all([
      contarOnde(banco, animais, acessos.titularUserId, acessos.concedidas["animais.visualizar"], acessos.papel),
      contarOnde(banco, lotes, acessos.titularUserId, acessos.concedidas["lotes.visualizar"], acessos.papel),
      contarOnde(banco, maquinas, acessos.titularUserId, acessos.concedidas["maquinas.visualizar"], acessos.papel),
      contarOnde(banco, benfeitorias, acessos.titularUserId, acessos.concedidas["benfeitorias.visualizar"], acessos.papel),
    ]);
    return {
      totalAnimais,
      totalLotes,
      totalMaquinas,
      totalBenfeitorias,
      totalReceitas: null,
      totalDespesas: null,
      saldoTotal: null,
    };
  } catch (error) {
    falhaPainel(error);
  }
}

export async function carregarPainelControle(
  userId: number,
  fazendaId?: number | null,
  sessionVersion?: number | null,
  opcoes?: OpcoesPainel,
): Promise<PainelOverview> {
  try {
    const banco = bancoDe(opcoes);
    const acessos = await resolverAcessosPainel(banco, userId, sessionVersion ?? null);
    const escopo = resolverEscopoFazendasPainel({
      fazendaId,
      fazendasAutorizadas: acessos.fazendas,
    });
    if (!escopo.ok) {
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_PAINEL_FAZENDA_NEGADA });
    }
    const operacional = await carregarPainelMysql(banco, acessos, escopo);
    const financeiro = await financeiroDoPainel(opcoes?.financeiro ?? ioFinanceiroPainel(), {
      executorId: userId,
      sessionVersionDaSessao: sessionVersion ?? null,
      fazendaSelecionadaId: escopo.fazendaSelecionadaId,
    });
    return { ...operacional, financeiro };
  } catch (error) {
    falhaPainel(error);
  }
}
