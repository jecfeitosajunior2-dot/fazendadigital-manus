import { and, desc, eq, gt, inArray, like, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { toDateOnlyISO } from "../shared/carenciaAnimal";
import {
  applySemenEntradaAgregacao,
  applySemenSaidaIa,
  formatSemenReprodutorDisplay,
  formatSemenStatusLabel,
  resolveSemenMachoDisplayLabel,
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  type SemenEntradaValidada,
  type SemenOrigemReprodutor,
  type SemenPartidaDisponivelInseminacao,
  type SemenReprodutorExternoDisponivel,
  type SemenStatus,
  validateSemenPartidaReprodutorCompat,
  aggregateSemenReprodutoresExternosDisponiveis,
  resolveSemenReprodutorKeyExternoConsulta,
  MSG_SEMEN_PARTIDA_INCOMPATIVEL,
  MSG_SEMEN_PARTIDA_NAO_ENCONTRADA,
} from "../shared/semenEstoque";
import {
  evaluateSemenCorrecaoEntrada,
  validateSemenCorrecaoDados,
  validateSemenCorrecaoMotivo,
  withSemenCorrecaoFields,
} from "../shared/semenEstoqueLedger";
import { sortSemenPartidasByMovimentacoes } from "../shared/semenPartidaSort";
import { calcularValorAtualEstoqueSemen, calcularValorAtualEstoqueSemenPorPartida } from "../shared/semenEstoqueValor";
import {
  buildSemenAjusteMovimentacao,
  evaluateSemenAjusteEstoque,
  validateSemenAjusteMotivo,
} from "../shared/semenEstoqueAjuste";
import { animais, db, reproducaoRegistros, semenMovimentacoes, semenPartidas } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";
import { validateSemenMachoInterno } from "./validateSemenMachoId";
import {
  enrichSemenMovimentacoesDisplayDb,
  type SemenMovimentacaoComDisplay,
} from "./semenMovimentacaoEnrich";

export type SemenPartidaRow = typeof semenPartidas.$inferSelect;
export type SemenMovimentacaoRow = typeof semenMovimentacoes.$inferSelect;

export type SemenPartidaListItem = SemenPartidaRow & {
  reprodutorDisplay: string;
  statusLabel: string;
  valorAtualEstoque: number;
};

function readMysqlInsertId(result: unknown): number {
  const row = result as { insertId?: number; [0]?: { insertId?: number } };
  return Number(row?.[0]?.insertId ?? row?.insertId ?? 0);
}

export type SemenPartidaDetalhe = SemenPartidaListItem & {
  movimentacoes: SemenMovimentacaoComDisplay[];
};

export type SemenRegistrarEntradaResult = {
  partidaId: number;
  movimentacaoId: number;
  novaEntrada: boolean;
  saldoAtual: number;
  custoMedioAtual: string | null;
};

/** Resumo de uma movimentação de entrada + estado atual consolidado da partida. */
export type SemenEntradaResumo = {
  movimentacaoId: number;
  partidaId: number;
  fazendaId: number;
  dataEntrada: string;
  quantidadeDoses: number;
  custoTotal: string;
  custoUnitario: string;
  reprodutorDisplay: string;
  partida: string;
  centralOrigem: string | null;
  origemReprodutor: string;
  saldoAtual: number;
  custoMedioAtual: string | null;
  statusAtual: SemenStatus;
  statusLabel: string;
};

async function enrichPartidasComDisplay(
  userId: number,
  rows: SemenPartidaRow[],
): Promise<SemenPartidaListItem[]> {
  if (!rows.length) return [];

  const machoIds = [
    ...new Set(rows.filter(r => r.machoId != null).map(r => r.machoId as number)),
  ];
  const machoMap = new Map<number, string>();

  if (machoIds.length) {
    const machos = await db
      .select({ id: animais.id, brinco: animais.brinco, nome: animais.nome })
      .from(animais)
      .where(and(eq(animais.userId, userId), inArray(animais.id, machoIds)));
    for (const m of machos) {
      machoMap.set(m.id, resolveSemenMachoDisplayLabel({ brinco: m.brinco, nome: m.nome }));
    }
  }

  return rows.map(row => ({
    ...row,
    reprodutorDisplay: formatSemenReprodutorDisplay({
      origem: row.origemReprodutor,
      reprodutorTexto: row.reprodutorTexto,
      machoDisplay: row.machoId != null ? machoMap.get(row.machoId) ?? row.reprodutorTexto : null,
    }),
    statusLabel: formatSemenStatusLabel(row.status as SemenStatus),
    valorAtualEstoque: 0,
  }));
}

function withValorAtualEstoqueSemen(
  partidas: SemenPartidaListItem[],
  movimentacoes: Array<Parameters<typeof calcularValorAtualEstoqueSemenPorPartida>[0][number]>,
): SemenPartidaListItem[] {
  const valores = calcularValorAtualEstoqueSemenPorPartida(movimentacoes);
  return partidas.map(p => ({
    ...p,
    valorAtualEstoque: valores.get(p.id) ?? 0,
  }));
}

/** Lista filtrada, ordenada por última movimentação (antes da paginação no cliente). */
export async function listSemenPartidasDb(
  userId: number,
  input: {
    fazendaId: number;
    search?: string;
    status?: SemenStatus | "todos";
  },
): Promise<SemenPartidaListItem[]> {
  await assertFazendaDoUsuario(userId, input.fazendaId);

  const conditions = [
    eq(semenPartidas.userId, userId),
    eq(semenPartidas.fazendaId, input.fazendaId),
  ];

  if (input.status && input.status !== "todos") {
    conditions.push(eq(semenPartidas.status, input.status));
  }

  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(semenPartidas.partida, pattern),
        like(semenPartidas.reprodutorTexto, pattern),
        like(semenPartidas.centralOrigem, pattern),
      )!,
    );
  }

  const rows = await db.select().from(semenPartidas).where(and(...conditions));

  if (!rows.length) return [];

  const movimentacoes = await db
    .select({
      id: semenMovimentacoes.id,
      partidaId: semenMovimentacoes.partidaId,
      tipo: semenMovimentacoes.tipo,
      quantidadeDoses: semenMovimentacoes.quantidadeDoses,
      custoTotal: semenMovimentacoes.custoTotal,
      dataEntrada: semenMovimentacoes.dataEntrada,
      createdAt: semenMovimentacoes.createdAt,
      movimentacaoOrigemId: semenMovimentacoes.movimentacaoOrigemId,
    })
    .from(semenMovimentacoes)
    .where(
      and(
        eq(semenMovimentacoes.userId, userId),
        inArray(
          semenMovimentacoes.partidaId,
          rows.map(r => r.id),
        ),
      ),
    );

  const sorted = sortSemenPartidasByMovimentacoes(rows, movimentacoes);
  const enriched = await enrichPartidasComDisplay(userId, sorted);
  return withValorAtualEstoqueSemen(enriched, movimentacoes);
}

export async function listSemenPartidasDisponiveisInseminacaoDb(
  userId: number,
  input: {
    fazendaId: number;
    origem: SemenOrigemReprodutor;
    machoId?: number;
    reprodutorTexto?: string;
    reprodutorKey?: string;
  },
): Promise<SemenPartidaDisponivelInseminacao[]> {
  await assertFazendaDoUsuario(userId, input.fazendaId);

  const conditions = [
    eq(semenPartidas.userId, userId),
    eq(semenPartidas.fazendaId, input.fazendaId),
    gt(semenPartidas.saldoDoses, 0),
  ];

  if (input.origem === SEMEN_ORIGEM_INTERNO) {
    const machoId = Number(input.machoId);
    if (!Number.isFinite(machoId) || machoId <= 0) return [];
    conditions.push(eq(semenPartidas.origemReprodutor, SEMEN_ORIGEM_INTERNO));
    conditions.push(eq(semenPartidas.machoId, machoId));
  } else {
    const reprodutorKey = resolveSemenReprodutorKeyExternoConsulta({
      reprodutorKey: input.reprodutorKey,
      reprodutorTexto: input.reprodutorTexto,
    });
    if (!reprodutorKey) return [];
    conditions.push(eq(semenPartidas.origemReprodutor, SEMEN_ORIGEM_EXTERNO));
    conditions.push(eq(semenPartidas.reprodutorKey, reprodutorKey));
  }

  const rows = await db
    .select()
    .from(semenPartidas)
    .where(and(...conditions))
    .orderBy(desc(semenPartidas.updatedAt), desc(semenPartidas.id));

  const enriched = await enrichPartidasComDisplay(userId, rows);
  return enriched.map(row => ({
    id: row.id,
    partida: row.partida,
    centralOrigem: row.centralOrigem,
    saldoDoses: row.saldoDoses,
    custoUnitario: row.custoUnitario,
    reprodutorDisplay: row.reprodutorDisplay,
  }));
}

export async function listSemenReprodutoresExternosDisponiveisDb(
  userId: number,
  fazendaId: number,
): Promise<SemenReprodutorExternoDisponivel[]> {
  await assertFazendaDoUsuario(userId, fazendaId);

  const rows = await db
    .select({
      origemReprodutor: semenPartidas.origemReprodutor,
      reprodutorKey: semenPartidas.reprodutorKey,
      reprodutorTexto: semenPartidas.reprodutorTexto,
      saldoDoses: semenPartidas.saldoDoses,
    })
    .from(semenPartidas)
    .where(
      and(
        eq(semenPartidas.userId, userId),
        eq(semenPartidas.fazendaId, fazendaId),
        eq(semenPartidas.origemReprodutor, SEMEN_ORIGEM_EXTERNO),
        gt(semenPartidas.saldoDoses, 0),
      ),
    );

  return aggregateSemenReprodutoresExternosDisponiveis(rows);
}

export type RegistrarInseminacaoComSemenParams = {
  fazendaId: number;
  femeaId: number;
  machoId: number | null;
  dataCobertura: Date;
  dataPrevistoParto?: Date | null;
  resultado?: string | null;
  observacoes?: string | null;
  inseminador?: string;
  ecc?: number;
  semenPartidaId: number;
  origemReprodutor: SemenOrigemReprodutor;
  machoIdReprodutor?: number | null;
  reprodutorTextoExterno?: string | null;
};

export type RegistrarInseminacaoComSemenResult = {
  id: number;
  movimentacaoId: number;
};

export async function registrarInseminacaoComSemenDb(
  userId: number,
  params: RegistrarInseminacaoComSemenParams,
  packObservacoes: (
    observacoes: string | null | undefined,
    extras: {
      partidaSemen: string;
      inseminador?: string;
      ecc?: number;
      semenPartidaId: number;
      custoDoseSemen: number | null;
      centralOrigem?: string | null;
    },
  ) => string | null,
): Promise<RegistrarInseminacaoComSemenResult> {
  await assertFazendaDoUsuario(userId, params.fazendaId);

  return db.transaction(async tx => {
    const locked = await tx
      .select()
      .from(semenPartidas)
      .where(
        and(eq(semenPartidas.id, params.semenPartidaId), eq(semenPartidas.userId, userId)),
      )
      .for("update");

    const partida = locked[0];
    if (!partida) {
      throw new Error(MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
    }
    if (partida.fazendaId !== params.fazendaId) {
      throw new Error(MSG_SEMEN_PARTIDA_INCOMPATIVEL);
    }

    const compat = validateSemenPartidaReprodutorCompat({
      origem: params.origemReprodutor,
      partidaMachoId: partida.machoId,
      partidaReprodutorKey: partida.reprodutorKey,
      machoId: params.machoIdReprodutor,
      reprodutorTexto: params.reprodutorTextoExterno,
    });
    if (!compat) {
      throw new Error(MSG_SEMEN_PARTIDA_INCOMPATIVEL);
    }

    const saida = applySemenSaidaIa({
      saldoAnterior: partida.saldoDoses,
      custoUnitario: partida.custoUnitario,
    });

    const custoUnitarioStr = partida.custoUnitario ?? "0";
    const custoUnitarioNum = parseFloat(String(custoUnitarioStr).replace(",", "."));
    const custoDoseSnapshot =
      Number.isFinite(custoUnitarioNum) && custoUnitarioNum > 0 ? custoUnitarioNum : null;

    const observacoesPersistidas = packObservacoes(params.observacoes, {
      partidaSemen: partida.partida,
      inseminador: params.inseminador,
      ecc: params.ecc,
      semenPartidaId: params.semenPartidaId,
      custoDoseSemen: custoDoseSnapshot,
      centralOrigem: partida.centralOrigem,
    });

    const reproResult = await tx.insert(reproducaoRegistros).values({
      userId,
      femeaId: params.femeaId,
      machoId: params.machoId,
      tipo: "Inseminação",
      resultado: params.resultado ?? null,
      observacoes: observacoesPersistidas,
      dataCobertura: params.dataCobertura,
      dataPrevistoParto: params.dataPrevistoParto ?? null,
    });

    const reproId = readMysqlInsertId(reproResult);
    const dataMov = params.dataCobertura.toISOString().slice(0, 10);
    const custoTotalStr = custoDoseSnapshot != null ? custoDoseSnapshot.toFixed(2) : "0.00";

    const movResult = await tx.insert(semenMovimentacoes).values({
      partidaId: partida.id,
      userId,
      fazendaId: params.fazendaId,
      tipo: SEMEN_MOV_TIPO_SAIDA_IA,
      dataEntrada: dataMov,
      quantidadeDoses: 1,
      custoTotal: custoTotalStr,
      custoUnitario: custoUnitarioStr,
      observacoes: `Inseminação — matriz #${params.femeaId} · registro repro #${reproId}`,
    });

    const movimentacaoId = readMysqlInsertId(movResult);

    await tx
      .update(semenPartidas)
      .set({
        saldoDoses: saida.novoSaldo,
        custoUnitario: saida.novoCustoUnitario,
        status: saida.status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(semenPartidas.id, partida.id));

    return { id: reproId, movimentacaoId };
  });
}

export async function getSemenPartidaByIdDb(
  userId: number,
  partidaId: number,
): Promise<SemenPartidaDetalhe | null> {
  const [row] = await db
    .select()
    .from(semenPartidas)
    .where(and(eq(semenPartidas.id, partidaId), eq(semenPartidas.userId, userId)))
    .limit(1);

  if (!row) return null;

  const [enriched] = await enrichPartidasComDisplay(userId, [row]);

  const movimentacoesRaw = await db
    .select()
    .from(semenMovimentacoes)
    .where(and(eq(semenMovimentacoes.partidaId, partidaId), eq(semenMovimentacoes.userId, userId)))
    .orderBy(desc(semenMovimentacoes.dataEntrada), desc(semenMovimentacoes.id));

  const movimentacoes = await enrichSemenMovimentacoesDisplayDb(userId, movimentacoesRaw);

  return {
    ...enriched,
    movimentacoes,
    valorAtualEstoque: calcularValorAtualEstoqueSemen(movimentacoesRaw),
  };
}

function buildSemenEntradaResumo(
  mov: SemenMovimentacaoRow,
  partidaEnriched: SemenPartidaListItem,
): SemenEntradaResumo {
  return {
    movimentacaoId: mov.id,
    partidaId: partidaEnriched.id,
    fazendaId: partidaEnriched.fazendaId,
    dataEntrada: mov.dataEntrada,
    quantidadeDoses: mov.quantidadeDoses,
    custoTotal: mov.custoTotal,
    custoUnitario: mov.custoUnitario,
    reprodutorDisplay: partidaEnriched.reprodutorDisplay,
    partida: partidaEnriched.partida,
    centralOrigem: partidaEnriched.centralOrigem,
    origemReprodutor: partidaEnriched.origemReprodutor,
    saldoAtual: partidaEnriched.saldoDoses,
    custoMedioAtual: partidaEnriched.custoUnitario,
    statusAtual: partidaEnriched.status as SemenStatus,
    statusLabel: partidaEnriched.statusLabel,
  };
}

export async function getSemenEntradaResumoDb(
  userId: number,
  movimentacaoId: number,
): Promise<SemenEntradaResumo | null> {
  const [mov] = await db
    .select()
    .from(semenMovimentacoes)
    .where(
      and(eq(semenMovimentacoes.id, movimentacaoId), eq(semenMovimentacoes.userId, userId)),
    )
    .limit(1);

  if (!mov || mov.tipo !== SEMEN_MOV_TIPO_ENTRADA) return null;

  const [partida] = await db
    .select()
    .from(semenPartidas)
    .where(and(eq(semenPartidas.id, mov.partidaId), eq(semenPartidas.userId, userId)))
    .limit(1);

  if (!partida) return null;

  const [enriched] = await enrichPartidasComDisplay(userId, [partida]);
  return buildSemenEntradaResumo(mov, enriched);
}

export async function registrarEntradaSemenDb(
  userId: number,
  fazendaId: number,
  entrada: SemenEntradaValidada,
): Promise<SemenRegistrarEntradaResult> {
  await assertFazendaDoUsuario(userId, fazendaId);

  let reprodutorTexto = entrada.reprodutorTexto;
  let machoId = entrada.machoId;

  if (entrada.origem === SEMEN_ORIGEM_INTERNO && machoId != null) {
    const validado = await validateSemenMachoInterno(userId, fazendaId, machoId);
    machoId = validado.machoId;
    reprodutorTexto = validado.reprodutorTexto;
  }

  return db.transaction(async tx => {
    const [existente] = await tx
      .select()
      .from(semenPartidas)
      .where(
        and(
          eq(semenPartidas.userId, userId),
          eq(semenPartidas.fazendaId, fazendaId),
          eq(semenPartidas.reprodutorKey, entrada.reprodutorKey),
          eq(semenPartidas.partida, entrada.partida),
        ),
      )
      .limit(1);

    const custoTotalStr = entrada.custoTotal.toFixed(2);

    if (existente) {
      const agreg = applySemenEntradaAgregacao({
        saldoAnterior: existente.saldoDoses,
        custoUnitarioAnterior: existente.custoUnitario,
        quantidadeEntrada: entrada.quantidadeDoses,
        custoTotalEntrada: entrada.custoTotal,
      });

      await tx
        .update(semenPartidas)
        .set({
          saldoDoses: agreg.novoSaldo,
          custoUnitario: agreg.novoCustoUnitario,
          status: agreg.status,
          centralOrigem: entrada.centralOrigem ?? existente.centralOrigem,
          reprodutorTexto: reprodutorTexto ?? existente.reprodutorTexto,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(semenPartidas.id, existente.id));

      const movResult = await tx.insert(semenMovimentacoes).values({
        partidaId: existente.id,
        userId,
        fazendaId,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        dataEntrada: entrada.dataEntrada,
        quantidadeDoses: entrada.quantidadeDoses,
        custoTotal: custoTotalStr,
        custoUnitario: entrada.custoUnitario,
        observacoes: entrada.observacoes,
      });

      const movimentacaoId = readMysqlInsertId(movResult);

      return {
        partidaId: existente.id,
        movimentacaoId,
        novaEntrada: false,
        saldoAtual: agreg.novoSaldo,
        custoMedioAtual: agreg.novoCustoUnitario,
      };
    }

    const agreg = applySemenEntradaAgregacao({
      saldoAnterior: 0,
      custoUnitarioAnterior: null,
      quantidadeEntrada: entrada.quantidadeDoses,
      custoTotalEntrada: entrada.custoTotal,
    });

    const insertResult = await tx.insert(semenPartidas).values({
      userId,
      fazendaId,
      origemReprodutor: entrada.origem,
      reprodutorKey: entrada.reprodutorKey,
      machoId,
      reprodutorTexto,
      partida: entrada.partida,
      centralOrigem: entrada.centralOrigem,
      saldoDoses: agreg.novoSaldo,
      custoUnitario: agreg.novoCustoUnitario,
      status: agreg.status,
      observacoes: entrada.observacoes,
    });

    const partidaId = readMysqlInsertId(insertResult);

    const movResult = await tx.insert(semenMovimentacoes).values({
      partidaId,
      userId,
      fazendaId,
      tipo: SEMEN_MOV_TIPO_ENTRADA,
      dataEntrada: entrada.dataEntrada,
      quantidadeDoses: entrada.quantidadeDoses,
      custoTotal: custoTotalStr,
      custoUnitario: entrada.custoUnitario,
      observacoes: entrada.observacoes,
    });

    const movimentacaoId = readMysqlInsertId(movResult);

    return {
      partidaId,
      movimentacaoId,
      novaEntrada: true,
      saldoAtual: agreg.novoSaldo,
      custoMedioAtual: agreg.novoCustoUnitario,
    };
  });
}

export type SemenCorrigirEntradaInput = {
  movimentacaoId: number;
  quantidadeDoses: unknown;
  custoTotal: unknown;
  dataEntrada?: unknown;
  motivoCodigo: unknown;
  motivoDescricao?: unknown;
};

export type SemenCorrigirEntradaResult = {
  partidaId: number;
  estornoId: number;
  novaEntradaId: number;
  saldoAtual: number;
  custoMedioAtual: string | null;
};

export type SemenAjustarEstoqueInput = {
  partidaId: number;
  modo: unknown;
  saldoNovo?: unknown;
  valorNovo?: unknown;
  motivoCodigo: unknown;
  motivoDescricao?: unknown;
  observacao?: unknown;
};

export type SemenAjustarEstoqueResult = {
  partidaId: number;
  movimentacaoId: number;
  saldoAtual: number;
  custoMedioAtual: string | null;
  valorAtualEstoque: number;
};

export async function corrigirEntradaSemenDb(
  userId: number,
  input: SemenCorrigirEntradaInput,
): Promise<SemenCorrigirEntradaResult> {
  const motivo = validateSemenCorrecaoMotivo(input.motivoCodigo, input.motivoDescricao);
  if (!motivo.ok) throw new Error(motivo.message);
  const dados = validateSemenCorrecaoDados({
    quantidadeDoses: input.quantidadeDoses,
    custoTotal: input.custoTotal,
    dataEntrada: input.dataEntrada,
  });
  if (!dados.ok) throw new Error(dados.message);

  return db.transaction(async tx => {
    const [original] = await tx
      .select()
      .from(semenMovimentacoes)
      .where(and(eq(semenMovimentacoes.id, input.movimentacaoId), eq(semenMovimentacoes.userId, userId)))
      .limit(1);

    if (!original) {
      throw new Error("Movimentação de entrada não encontrada.");
    }

    const locked = await tx
      .select()
      .from(semenPartidas)
      .where(and(eq(semenPartidas.id, original.partidaId), eq(semenPartidas.userId, userId)))
      .for("update");

    const partida = locked[0];
    if (!partida) {
      throw new Error(MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
    }

    const movimentacoes = await tx
      .select()
      .from(semenMovimentacoes)
      .where(and(eq(semenMovimentacoes.partidaId, partida.id), eq(semenMovimentacoes.userId, userId)));

    const now = new Date();
    const maxId = movimentacoes.reduce((m, row) => Math.max(m, row.id), 0);
    const evaluated = evaluateSemenCorrecaoEntrada({
      original: withSemenCorrecaoFields(original),
      movimentacoes: movimentacoes.map(withSemenCorrecaoFields),
      saldoAtual: partida.saldoDoses,
      dadosNovos: dados.value,
      dataCorrecao: toDateOnlyISO(now),
      nowIso: now.toISOString(),
      nextEstornoId: maxId + 1,
      nextEntradaId: maxId + 2,
      grupoCorrecaoId: randomUUID(),
      motivoTexto: motivo.texto,
    });
    if (!evaluated.ok) throw new Error(evaluated.message);

    const estornoResult = await tx.insert(semenMovimentacoes).values({
      partidaId: partida.id,
      userId,
      fazendaId: partida.fazendaId,
      tipo: evaluated.estorno.tipo,
      dataEntrada: evaluated.estorno.dataEntrada,
      quantidadeDoses: evaluated.estorno.quantidadeDoses,
      custoTotal: evaluated.estorno.custoTotal,
      custoUnitario: evaluated.estorno.custoUnitario,
      observacoes: evaluated.estorno.observacoes,
      movimentacaoOrigemId: evaluated.estorno.movimentacaoOrigemId,
      grupoCorrecaoId: evaluated.estorno.grupoCorrecaoId,
      motivoCorrecao: evaluated.estorno.motivoCorrecao,
    });
    const estornoId = readMysqlInsertId(estornoResult);

    const novaResult = await tx.insert(semenMovimentacoes).values({
      partidaId: partida.id,
      userId,
      fazendaId: partida.fazendaId,
      tipo: evaluated.novaEntrada.tipo,
      dataEntrada: evaluated.novaEntrada.dataEntrada,
      quantidadeDoses: evaluated.novaEntrada.quantidadeDoses,
      custoTotal: evaluated.novaEntrada.custoTotal,
      custoUnitario: evaluated.novaEntrada.custoUnitario,
      observacoes: evaluated.novaEntrada.observacoes,
      movimentacaoOrigemId: evaluated.novaEntrada.movimentacaoOrigemId,
      grupoCorrecaoId: evaluated.novaEntrada.grupoCorrecaoId,
      motivoCorrecao: evaluated.novaEntrada.motivoCorrecao,
    });
    const novaEntradaId = readMysqlInsertId(novaResult);

    await tx
      .update(semenPartidas)
      .set({
        saldoDoses: evaluated.estadoFinal.saldoDoses,
        custoUnitario: evaluated.estadoFinal.custoUnitario,
        status: evaluated.estadoFinal.status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(semenPartidas.id, partida.id));

    return {
      partidaId: partida.id,
      estornoId,
      novaEntradaId,
      saldoAtual: evaluated.estadoFinal.saldoDoses,
      custoMedioAtual: evaluated.estadoFinal.custoUnitario,
    };
  });
}

export async function ajustarEstoqueSemenDb(
  userId: number,
  input: SemenAjustarEstoqueInput,
): Promise<SemenAjustarEstoqueResult> {
  const motivo = validateSemenAjusteMotivo(input.motivoCodigo, input.motivoDescricao);
  if (!motivo.ok) throw new Error(motivo.message);

  return db.transaction(async tx => {
    const locked = await tx
      .select()
      .from(semenPartidas)
      .where(and(eq(semenPartidas.id, input.partidaId), eq(semenPartidas.userId, userId)))
      .for("update");

    const partida = locked[0];
    if (!partida) {
      throw new Error(MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
    }

    const movimentacoes = await tx
      .select()
      .from(semenMovimentacoes)
      .where(and(eq(semenMovimentacoes.partidaId, partida.id), eq(semenMovimentacoes.userId, userId)));

    const valorAtual = calcularValorAtualEstoqueSemen(movimentacoes.map(withSemenCorrecaoFields));
    const estado = evaluateSemenAjusteEstoque({
      saldoAtual: partida.saldoDoses,
      custoMedioAtual: partida.custoUnitario,
      valorAtual,
      modo: input.modo,
      saldoNovo: input.saldoNovo,
      valorNovo: input.valorNovo,
    });
    if (!estado.ok) throw new Error(estado.message);

    const now = new Date();
    const draft = buildSemenAjusteMovimentacao({
      estado: estado.value,
      dataOperacional: toDateOnlyISO(now),
      motivoTexto: motivo.texto,
      observacao: String(input.observacao ?? "").trim() || null,
    });

    const movResult = await tx.insert(semenMovimentacoes).values({
      partidaId: partida.id,
      userId,
      fazendaId: partida.fazendaId,
      tipo: draft.tipo,
      dataEntrada: draft.dataEntrada,
      quantidadeDoses: draft.quantidadeDoses,
      custoTotal: draft.custoTotal,
      custoUnitario: draft.custoUnitario,
      observacoes: draft.observacoes,
      motivoCorrecao: draft.motivoCorrecao,
    });
    const movimentacaoId = readMysqlInsertId(movResult);

    await tx
      .update(semenPartidas)
      .set({
        saldoDoses: estado.value.saldoNovo,
        custoUnitario: estado.value.custoMedioNovo,
        status: estado.value.status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(semenPartidas.id, partida.id));

    return {
      partidaId: partida.id,
      movimentacaoId,
      saldoAtual: estado.value.saldoNovo,
      custoMedioAtual: estado.value.custoMedioNovo,
      valorAtualEstoque: estado.value.valorNovo,
    };
  });
}
