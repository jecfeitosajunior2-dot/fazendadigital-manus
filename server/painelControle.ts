import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  animais,
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
import { loadLoteFazendaContextForUser } from "./animaisPorFazenda";
import { db } from "./db";
import { financeiroNucleoService } from "./financeiroNucleo";
import { devLocalStore } from "./devLocalStore";
import {
  isDatabaseUnavailable,
  listLocalAnimais,
  listLocalFazendas,
  listLocalLotes,
  listLocalMaquinas,
  listLocalManutencoes,
  listLocalPastos,
  listLocalReproducaoRegistros,
  listLocalSaudeRegistros,
} from "./localFallbackStore";

async function listarFazendasAutorizadasPainel(userId: number): Promise<PainelFazendaRef[]> {
  const mapa = new Map<number, PainelFazendaRef>();
  try {
    const rows = await db
      .select({ id: fazendas.id, nome: fazendas.nome, area: fazendas.area })
      .from(fazendas)
      .where(eq(fazendas.userId, userId));
    for (const row of rows) {
      if (row.id > 0) {
        mapa.set(row.id, { id: row.id, nome: row.nome, area: Number(row.area) || 0 });
      }
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  const locais = await listLocalFazendas(userId);
  for (const fazenda of locais) {
    if (fazenda.id > 0 && !mapa.has(fazenda.id)) {
      mapa.set(fazenda.id, {
        id: fazenda.id,
        nome: fazenda.nome,
        area: Number(fazenda.area) || 0,
      });
    }
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function valorOperacaoPainel(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function carregarFinanceiroPainel(
  userId: number,
  fazendaSelecionadaId: number | null,
): Promise<PainelFinanceiro> {
  try {
    const periodo = periodoMesCorrentePainel();
    const rel = await financeiroNucleoService.relatorioFinanceiro(userId, {
      de: periodo.de,
      ate: periodo.ate,
      fazendaId: fazendaSelecionadaId,
    });
    const consolidado = fazendaSelecionadaId == null
      ? rel
      : await financeiroNucleoService.relatorioFinanceiro(userId, {
        de: periodo.de,
        ate: periodo.ate,
        fazendaId: null,
      });
    return indicadoresFinanceirosDoRelatorioV2(rel.visao, {
      fazendaSelecionadaId,
      periodo,
      temRegistrosSemFazenda: haRegistrosSemFazendaNoRelatorioV2(consolidado),
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") throw error;
    console.warn("[painel] Financeiro V2 indisponível no resumo:", error);
    return emptyPainelFinanceiro();
  }
}

async function carregarComercialPainel(
  userId: number,
  fazendaSelecionadaId: number | null,
): Promise<PainelComercial> {
  try {
    const compraWhere = [eq(compras.userId, userId)];
    const vendaWhere = [eq(vendas.userId, userId)];
    if (fazendaSelecionadaId != null) {
      compraWhere.push(eq(compras.fazendaId, fazendaSelecionadaId));
      vendaWhere.push(eq(vendas.fazendaId, fazendaSelecionadaId));
    }
    const [compraRows, vendaRows] = await Promise.all([
      db
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
        .where(and(...compraWhere))
        .orderBy(desc(compras.data), desc(compras.id))
        .limit(20),
      db
        .select({
          id: vendas.id,
          data: vendas.data,
          comprador: vendas.comprador,
          valorTotal: vendas.valorTotal,
          status: vendas.status,
          fazendaId: vendas.fazendaId,
        })
        .from(vendas)
        .where(and(...vendaWhere))
        .orderBy(desc(vendas.data), desc(vendas.id))
        .limit(20),
    ]);

    const comprasVisiveis: PainelOperacaoRecente[] = compraRows
      .filter(row => operacaoComercialVisivelPainel(row, fazendaSelecionadaId))
      .slice(0, PAINEL_COMERCIAL_RECENTES)
      .map(row => ({
        id: row.id,
        tipo: "compra" as const,
        data: row.data ?? null,
        parceiro: String(row.fornecedor ?? "").trim() || "—",
        valor: valorOperacaoPainel(row.custoTotal ?? row.valorTotal),
      }));
    const vendasVisiveis: PainelOperacaoRecente[] = vendaRows
      .filter(row => operacaoComercialVisivelPainel(row, fazendaSelecionadaId))
      .slice(0, PAINEL_COMERCIAL_RECENTES)
      .map(row => ({
        id: row.id,
        tipo: "venda" as const,
        data: row.data ?? null,
        parceiro: String(row.comprador ?? "").trim() || "—",
        valor: valorOperacaoPainel(row.valorTotal),
      }));
    return { compras: comprasVisiveis, vendas: vendasVisiveis };
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      console.warn("[painel] Compra/venda recente indisponível:", error);
    }
    return emptyPainelComercial();
  }
}

async function anexarFinanceiroComercial(
  userId: number,
  escopo: Extract<ReturnType<typeof resolverEscopoFazendasPainel>, { ok: true }>,
  base: PainelOverview,
): Promise<PainelOverview> {
  const [financeiro, comercial] = await Promise.all([
    carregarFinanceiroPainel(userId, escopo.fazendaSelecionadaId),
    carregarComercialPainel(userId, escopo.fazendaSelecionadaId),
  ]);
  return { ...base, financeiro, comercial };
}

function montarDeFontes(input: {
  escopo: Extract<ReturnType<typeof resolverEscopoFazendasPainel>, { ok: true }>;
  animaisAtivos: Parameters<typeof agregarRebanhoPainel>[0];
  produtos: Parameters<typeof agregarEstoquePainel>[0];
  movimentacoes: { nome?: string | null; dataValidade?: string | Date | null }[];
  saudeAlertas: { tipo?: string | null; medicamento?: string | null; proximaData?: string | Date | null }[];
  partos: Parameters<typeof agregarAlertasPainel>[0]["partos"];
  manutencoes: Parameters<typeof agregarAlertasPainel>[0]["manutencoes"];
  pastos: { id: number; nome: string; capacidade?: number | null; qtdAnimais?: number | null }[];
  totalLotes: number;
  saudeRecente: PainelOverview["saudeRecente"];
}): PainelOverview {
  const estoqueResumo = agregarEstoquePainel(input.produtos);
  return montarPainelOverview({
    escopo: input.escopo,
    totalLotes: input.totalLotes,
    totalPastos: input.pastos.length,
    rebanho: agregarRebanhoPainel(input.animaisAtivos),
    estoque: estoqueResumo,
    alertas: agregarAlertasPainel({
      estoqueBaixo: estoqueResumo.baixo,
      movimentacoes: input.movimentacoes,
      saude: input.saudeAlertas,
      partos: input.partos,
      manutencoes: input.manutencoes,
    }),
    ocupacao: agregarOcupacaoPainel(input.pastos),
    saudeRecente: input.saudeRecente,
  });
}

async function carregarPainelMysql(
  userId: number,
  escopo: Extract<ReturnType<typeof resolverEscopoFazendasPainel>, { ok: true }>,
): Promise<PainelOverview> {
  const fazendaIds = escopo.fazendaIds;
  if (fazendaIds.length === 0) {
    return montarPainelOverview({
      escopo,
      totalLotes: 0,
      totalPastos: 0,
      rebanho: agregarRebanhoPainel([]),
      estoque: { valorTotal: 0, totalProdutos: 0, baixo: [] },
      alertas: agregarAlertasPainel({
        estoqueBaixo: [],
        movimentacoes: [],
        saude: [],
        partos: [],
        manutencoes: [],
      }),
      ocupacao: [],
      saudeRecente: [],
    });
  }

  const { loteFazendaById } = await loadLoteFazendaContextForUser(userId);
  const animaisAtivos = await db
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
    .where(and(eq(animais.userId, userId), eq(animais.status, "ativo")));

  const visiveis = animaisAtivos.filter(a => animalNasFazendasPainel(a, fazendaIds, loteFazendaById));
  const animalIds = visiveis.map(a => a.id);
  const animalPorId = new Map(visiveis.map(a => [a.id, a]));

  const produtos = await db
    .select()
    .from(estoque)
    .where(inArray(estoque.fazendaId, fazendaIds));

  const movs = await db
    .select({
      nome: estoque.nome,
      dataValidade: estoqueMovimentacoes.dataValidade,
      fazendaId: estoqueMovimentacoes.fazendaId,
      produtoFazendaId: estoque.fazendaId,
    })
    .from(estoqueMovimentacoes)
    .innerJoin(estoque, eq(estoque.id, estoqueMovimentacoes.estoqueId))
    .where(and(inArray(estoque.fazendaId, fazendaIds), isNotNull(estoqueMovimentacoes.dataValidade)));

  const saudeAlertas = animalIds.length
    ? await db
        .select({
          tipo: saudeRegistros.tipo,
          medicamento: saudeRegistros.medicamento,
          proximaData: saudeRegistros.proximaData,
        })
        .from(saudeRegistros)
        .where(and(
          eq(saudeRegistros.userId, userId),
          inArray(saudeRegistros.animalId, animalIds),
          isNotNull(saudeRegistros.proximaData),
        ))
    : [];

  const saudeRecente = animalIds.length
    ? await db
        .select({
          id: saudeRegistros.id,
          animalId: saudeRegistros.animalId,
          tipo: saudeRegistros.tipo,
          medicamento: saudeRegistros.medicamento,
          dataRegistro: saudeRegistros.dataRegistro,
        })
        .from(saudeRegistros)
        .where(and(eq(saudeRegistros.userId, userId), inArray(saudeRegistros.animalId, animalIds)))
        .orderBy(desc(saudeRegistros.createdAt))
        .limit(6)
    : [];

  const partosRows = animalIds.length
    ? await db
        .select({
          femeaId: reproducaoRegistros.femeaId,
          dataPrevistoParto: reproducaoRegistros.dataPrevistoParto,
          dataPartoReal: reproducaoRegistros.dataPartoReal,
        })
        .from(reproducaoRegistros)
        .where(and(
          eq(reproducaoRegistros.userId, userId),
          inArray(reproducaoRegistros.femeaId, animalIds),
          isNotNull(reproducaoRegistros.dataPrevistoParto),
        ))
    : [];

  const maquinasEscopo = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.userId, userId), inArray(maquinas.fazendaId, fazendaIds)));
  const maquinaIds = maquinasEscopo.map(m => m.id);

  const manutRows = maquinaIds.length
    ? await db
        .select({
          tipo: manutencoes.tipo,
          status: manutencoes.status,
          proximaManutencao: manutencoes.proximaManutencao,
        })
        .from(manutencoes)
        .where(and(
          eq(manutencoes.userId, userId),
          inArray(manutencoes.maquinaId, maquinaIds),
          ne(manutencoes.status, "concluida"),
          isNotNull(manutencoes.proximaManutencao),
        ))
    : [];

  const pastosRows = await db
    .select({
      id: pastos.id,
      nome: pastos.nome,
      capacidade: pastos.capacidade,
    })
    .from(pastos)
    .where(and(eq(pastos.userId, userId), inArray(pastos.fazendaId, fazendaIds)));

  const pastoIds = pastosRows.map(p => p.id);
  const lotesNoPasto = pastoIds.length
    ? await db
        .select({
          id: lotes.id,
          pastoAtualId: lotes.pastoAtualId,
        })
        .from(lotes)
        .where(and(
          eq(lotes.userId, userId),
          inArray(lotes.pastoAtualId, pastoIds),
        ))
    : [];

  const loteIdsPasto = lotesNoPasto.map(l => l.id);
  const contagemPorLote = loteIdsPasto.length
    ? await db
        .select({
          loteId: animais.loteId,
          qtd: sql<number>`COUNT(*)`,
        })
        .from(animais)
        .where(and(
          eq(animais.userId, userId),
          eq(animais.status, "ativo"),
          inArray(animais.loteId, loteIdsPasto),
        ))
        .groupBy(animais.loteId)
    : [];
  const qtdPorLote = new Map(contagemPorLote.map(r => [Number(r.loteId), Number(r.qtd)]));
  const qtdPorPasto = new Map<number, number>();
  for (const lote of lotesNoPasto) {
    if (lote.pastoAtualId == null) continue;
    qtdPorPasto.set(
      lote.pastoAtualId,
      (qtdPorPasto.get(lote.pastoAtualId) ?? 0) + (qtdPorLote.get(lote.id) ?? 0),
    );
  }

  const totalLotes = [...loteFazendaById.entries()]
    .filter(([, fid]) => fid != null && fazendaIds.includes(fid))
    .length;

  return montarDeFontes({
    escopo,
    animaisAtivos: visiveis,
    produtos,
    movimentacoes: movs,
    saudeAlertas,
    partos: partosRows.map(r => ({
      ...r,
      femea: animalPorId.get(r.femeaId) ?? null,
    })),
    manutencoes: manutRows,
    pastos: pastosRows.map(p => ({
      ...p,
      qtdAnimais: qtdPorPasto.get(p.id) ?? 0,
    })),
    totalLotes,
    saudeRecente: saudeRecente.map(s => ({
      id: s.id,
      animalId: s.animalId,
      tipo: s.tipo,
      medicamento: s.medicamento ?? null,
      dataRegistro: s.dataRegistro ?? null,
    })),
  });
}

async function carregarPainelLocal(
  userId: number,
  escopo: Extract<ReturnType<typeof resolverEscopoFazendasPainel>, { ok: true }>,
): Promise<PainelOverview> {
  const fazendaIds = escopo.fazendaIds;
  if (fazendaIds.length === 0) {
    return montarPainelOverview({
      escopo,
      totalLotes: 0,
      totalPastos: 0,
      rebanho: agregarRebanhoPainel([]),
      estoque: { valorTotal: 0, totalProdutos: 0, baixo: [] },
      alertas: agregarAlertasPainel({
        estoqueBaixo: [],
        movimentacoes: [],
        saude: [],
        partos: [],
        manutencoes: [],
      }),
      ocupacao: [],
      saudeRecente: [],
    });
  }

  const [animaisLocais, lotesLocais, pastosLocais, saude, repro, manut, maqs] = await Promise.all([
    listLocalAnimais(userId),
    listLocalLotes(userId),
    listLocalPastos(userId),
    listLocalSaudeRegistros(userId),
    listLocalReproducaoRegistros(userId),
    listLocalManutencoes(userId),
    listLocalMaquinas(userId),
  ]);

  const loteFazendaById = new Map<number, number | null>();
  const pastoFazenda = new Map(pastosLocais.map(p => [p.id, p.fazendaId ?? null]));
  for (const lote of lotesLocais) {
    loteFazendaById.set(
      lote.id,
      lote.fazendaId ?? (lote.pastoAtualId != null ? pastoFazenda.get(lote.pastoAtualId) ?? null : null),
    );
  }

  const visiveis = animaisLocais.filter(
    a => a.status === "ativo" && animalNasFazendasPainel(
      { fazendaId: a.fazendaId ?? null, loteId: a.loteId ?? null },
      fazendaIds,
      loteFazendaById,
    ),
  );
  const animalIds = new Set(visiveis.map(a => a.id));
  const animalPorId = new Map(visiveis.map(a => [a.id, a]));

  const produtos = filtrarProdutosEstoque(devLocalStore.listEstoque(), fazendaIds);
  const movs = filtrarMovimentacoesEstoque(
    devLocalStore.listMovimentacoes().map(m => ({
      ...m,
      nome: produtos.find(p => p.id === m.estoqueId)?.nome,
      produtoFazendaId: produtos.find(p => p.id === m.estoqueId)?.fazendaId ?? null,
    })),
    fazendaIds,
  );

  const maquinaIds = new Set(
    maqs.filter(m => m.fazendaId != null && fazendaIds.includes(Number(m.fazendaId))).map(m => m.id),
  );
  const pastosEscopo = pastosLocais.filter(p => fazendaIds.includes(Number(p.fazendaId)));
  const qtdPorPasto = new Map<number, number>();
  for (const lote of lotesLocais) {
    if (lote.pastoAtualId == null) continue;
    const qtd = visiveis.filter(a => a.loteId === lote.id).length;
    qtdPorPasto.set(lote.pastoAtualId, (qtdPorPasto.get(lote.pastoAtualId) ?? 0) + qtd);
  }

  return montarDeFontes({
    escopo,
    animaisAtivos: visiveis,
    produtos,
    movimentacoes: movs,
    saudeAlertas: saude.filter(s => animalIds.has(s.animalId)),
    partos: repro
      .filter(r => animalIds.has(r.femeaId))
      .map(r => {
        const femea = animalPorId.get(r.femeaId);
        return {
          femeaId: r.femeaId,
          dataPrevistoParto: r.dataPrevistoParto,
          dataPartoReal: r.dataPartoReal,
          femea: femea ? { brinco: femea.brinco ?? null, nome: femea.nome ?? null } : null,
        };
      }),
    manutencoes: manut.filter(m => maquinaIds.has(m.maquinaId)),
    pastos: pastosEscopo.map(p => ({
      id: p.id,
      nome: p.nome,
      capacidade: p.capacidade ?? null,
      qtdAnimais: qtdPorPasto.get(p.id) ?? 0,
    })),
    totalLotes: lotesLocais.filter(l => {
      const fid = loteFazendaById.get(l.id);
      return fid != null && fazendaIds.includes(fid);
    }).length,
    saudeRecente: saude
      .filter(s => animalIds.has(s.animalId))
      .slice(0, 6)
      .map(s => ({
        id: s.id,
        animalId: s.animalId,
        tipo: s.tipo,
        medicamento: s.medicamento ?? null,
        dataRegistro: s.dataRegistro ?? null,
      })),
  });
}

export async function carregarPainelControle(
  userId: number,
  fazendaId?: number | null,
): Promise<PainelOverview> {
  const fazendasAutorizadas = await listarFazendasAutorizadasPainel(userId);
  const escopo = resolverEscopoFazendasPainel({ fazendaId, fazendasAutorizadas });
  if (!escopo.ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_PAINEL_FAZENDA_NEGADA });
  }

  try {
    const operacional = await carregarPainelMysql(userId, escopo);
    return anexarFinanceiroComercial(userId, escopo, operacional);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const operacional = await carregarPainelLocal(userId, escopo);
    return anexarFinanceiroComercial(userId, escopo, operacional);
  }
}

export { listarFazendasAutorizadasPainel };
