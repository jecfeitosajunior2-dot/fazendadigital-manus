/**
 * Adaptador Drizzle da confirmação integrada.
 * Não usa o db operacional por padrão. Não é procedure pública.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  animalBaixas,
  animais,
  fazendas,
  lotes,
  pessoas,
  vendaItens,
  vendas,
} from "../drizzle/schema";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
} from "../shared/vendaFinanceiro";
import type { FinanceiroDrizzleTx, FinParcelaRow, FinTituloRow } from "./financeiroNucleo";
import type { FinanceiroCondicaoStatus, FinanceiroTituloTipo } from "../shared/financeiroNucleo";
import {
  anexarNucleoFinanceiroNaVenda,
  type ConfirmarVendaFinanceiroStore,
  type ConfirmarVendaFinanceiroTx,
  type VendaFinanceiroRow,
} from "./confirmarVendaFinanceiro";

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

function mysqlExecuteRows(result: unknown): Array<Record<string, unknown>> {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  const raw = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
}

function mysqlDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function mapVendaFromLock(row: Record<string, unknown>): VendaFinanceiroRow {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    fazendaId: row.fazendaId == null ? null : Number(row.fazendaId),
    compradorId: row.compradorId == null ? null : Number(row.compradorId),
    comprador: row.comprador == null ? null : String(row.comprador),
    data: mysqlDateStr(row.data),
    formaPrecificacao: row.formaPrecificacao == null ? null : String(row.formaPrecificacao),
    precoPadrao: row.precoPadrao == null ? null : String(row.precoPadrao),
    quantidadeAnimais: row.quantidadeAnimais == null ? null : Number(row.quantidadeAnimais),
    pesoTotal: row.pesoTotal == null ? null : String(row.pesoTotal),
    valorTotal: row.valorTotal == null ? null : String(row.valorTotal),
    observacoes: row.observacoes == null ? null : String(row.observacoes),
    status: row.status == null ? null : String(row.status),
    idempotencyKey: row.idempotencyKey == null ? null : String(row.idempotencyKey),
  };
}

function mapTituloFromLock(row: Record<string, unknown>): FinTituloRow {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    tipo: String(row.tipo) as FinanceiroTituloTipo,
    estado: String(row.estado) as "ativo" | "cancelado",
    condicaoStatus: String(row.condicaoStatus) as FinanceiroCondicaoStatus,
    pessoaId: Number(row.pessoaId),
    contraparteNomeSnapshot: String(row.contraparteNomeSnapshot ?? ""),
    fazendaOrigemId: row.fazendaOrigemId == null ? null : Number(row.fazendaOrigemId),
    origemTipo: String(row.origemTipo),
    origemId: row.origemId == null ? null : Number(row.origemId),
    origemItemChave: row.origemItemChave == null ? null : String(row.origemItemChave),
    descricao: String(row.descricao ?? ""),
    dataCompetencia: mysqlDateStr(row.dataCompetencia),
    valorOriginal: String(row.valorOriginal),
    documentoReferencia: row.documentoReferencia == null ? null : String(row.documentoReferencia),
    observacoes: row.observacoes == null ? null : String(row.observacoes),
  };
}

function mapParcelaFromLock(row: Record<string, unknown>): FinParcelaRow {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    tituloId: Number(row.tituloId),
    numero: Number(row.numero),
    vencimento: mysqlDateStr(row.vencimento),
    valorOriginal: String(row.valorOriginal),
  };
}

export function createConfirmarVendaFinanceiroTxFromDrizzle(
  drizzleTx: FinanceiroDrizzleTx,
  loteFazendaById: Map<number, number | null>,
): ConfirmarVendaFinanceiroTx {
  const comercial: Omit<ConfirmarVendaFinanceiroTx, "fin"> = {
    loteFazendaById,
    async findFazenda(userId, id) {
      const [row] = await drizzleTx
        .select({ id: fazendas.id, nome: fazendas.nome })
        .from(fazendas)
        .where(and(eq(fazendas.userId, userId), eq(fazendas.id, id)))
        .limit(1);
      return row ?? null;
    },
    async findPessoa(userId, id) {
      const [row] = await drizzleTx
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          tipo: pessoas.tipo,
          ativo: pessoas.ativo,
        })
        .from(pessoas)
        .where(and(eq(pessoas.userId, userId), eq(pessoas.id, id)))
        .limit(1);
      if (!row) return null;
      return { id: row.id, nome: row.nome, tipo: row.tipo, ativo: row.ativo !== false };
    },
    async findVendaPorIdempotency(userId, key) {
      const result = await drizzleTx.execute(sql`
        SELECT
          id,
          user_id AS userId,
          fazenda_id AS fazendaId,
          comprador_id AS compradorId,
          comprador,
          data,
          forma_precificacao AS formaPrecificacao,
          preco_padrao AS precoPadrao,
          quantidade_animais AS quantidadeAnimais,
          peso_total AS pesoTotal,
          valor_total AS valorTotal,
          observacoes,
          status,
          idempotency_key AS idempotencyKey
        FROM vendas
        WHERE user_id = ${userId} AND idempotency_key = ${key}
        ORDER BY id
        LIMIT 1
        FOR UPDATE
      `);
      const row = mysqlExecuteRows(result)[0];
      return row ? mapVendaFromLock(row) : null;
    },
    async listVendaItens(userId, vendaId) {
      const result = await drizzleTx.execute(sql`
        SELECT
          animal_id AS animalId,
          peso_venda AS pesoVenda,
          preco_unitario AS precoUnitario,
          valor_item AS valorItem,
          forma_precificacao AS formaPrecificacao,
          brinco_snapshot AS brincoSnapshot,
          lote_nome_snapshot AS loteNomeSnapshot
        FROM venda_itens
        WHERE user_id = ${userId} AND venda_id = ${vendaId}
        ORDER BY id
        FOR UPDATE
      `);
      return mysqlExecuteRows(result).map(row => ({
        animalId: Number(row.animalId),
        pesoVenda: row.pesoVenda == null ? null : String(row.pesoVenda),
        precoUnitario: String(row.precoUnitario ?? "0"),
        valorItem: String(row.valorItem ?? "0"),
        formaPrecificacao: row.formaPrecificacao === "cabeca" ? "cabeca" as const : "kg" as const,
        brincoSnapshot: row.brincoSnapshot == null ? null : String(row.brincoSnapshot),
        loteNomeSnapshot: row.loteNomeSnapshot == null ? null : String(row.loteNomeSnapshot),
      }));
    },
    async lockTituloPrincipalDaVenda(userId, vendaId) {
      const result = await drizzleTx.execute(sql`
        SELECT
          id,
          user_id AS userId,
          tipo,
          estado,
          condicao_status AS condicaoStatus,
          pessoa_id AS pessoaId,
          contraparte_nome_snapshot AS contraparteNomeSnapshot,
          fazenda_origem_id AS fazendaOrigemId,
          origem_tipo AS origemTipo,
          origem_id AS origemId,
          origem_item_chave AS origemItemChave,
          descricao,
          DATE_FORMAT(data_competencia, '%Y-%m-%d') AS dataCompetencia,
          valor_original AS valorOriginal,
          documento_referencia AS documentoReferencia,
          observacoes
        FROM financeiro_titulos
        WHERE user_id = ${userId}
          AND origem_tipo = ${FINANCEIRO_ORIGEM_VENDA_ANIMAIS}
          AND origem_id = ${vendaId}
          AND origem_item_chave = ${FINANCEIRO_ORIGEM_ITEM_PRINCIPAL}
        ORDER BY id
        FOR UPDATE
      `);
      const rows = mysqlExecuteRows(result);
      if (rows.length !== 1) return null;
      return mapTituloFromLock(rows[0]!);
    },
    async lockParcelasDoTitulo(userId, tituloId) {
      const result = await drizzleTx.execute(sql`
        SELECT
          id,
          user_id AS userId,
          titulo_id AS tituloId,
          numero,
          DATE_FORMAT(vencimento, '%Y-%m-%d') AS vencimento,
          valor_original AS valorOriginal
        FROM financeiro_parcelas
        WHERE user_id = ${userId} AND titulo_id = ${tituloId}
        ORDER BY numero
        FOR UPDATE
      `);
      return mysqlExecuteRows(result).map(mapParcelaFromLock);
    },
    async listAnimais(userId, ids) {
      const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
      if (!unique.length) return [];
      // Leitura bloqueante: o estado usado na confirmação é este resultado.
      // userId isola o dono; fazenda é validada depois com os dados travados
      // (animal pode pertencer via lote, não só por animais.fazendaId).
      const rows = await drizzleTx
        .select({
          id: animais.id,
          brinco: animais.brinco,
          status: animais.status,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
        })
        .from(animais)
        .where(and(eq(animais.userId, userId), inArray(animais.id, unique)))
        .orderBy(asc(animais.id))
        .for("update");
      const loteIds = [...new Set(rows.map(row => row.loteId).filter((id): id is number => id != null))];
      if (loteIds.length) {
        const loteResult = await drizzleTx.execute(sql`
          SELECT id, fazenda_id AS fazendaId
          FROM lotes
          WHERE id IN (${sql.join(loteIds.map(id => sql`${id}`), sql`, `)})
          FOR UPDATE
        `);
        for (const lote of mysqlExecuteRows(loteResult)) {
          loteFazendaById.set(Number(lote.id), lote.fazendaId == null ? null : Number(lote.fazendaId));
        }
      }
      return rows;
    },
    async listBaixasAtivas(animalIds) {
      if (!animalIds.length) return [];
      return drizzleTx
        .select({ animalId: animalBaixas.animalId })
        .from(animalBaixas)
        .where(and(inArray(animalBaixas.animalId, animalIds), eq(animalBaixas.status, "ativa")));
    },
    async listLotes(ids) {
      if (!ids.length) return [];
      return drizzleTx
        .select({ id: lotes.id, nome: lotes.nome })
        .from(lotes)
        .where(inArray(lotes.id, ids));
    },
    async insertVenda(row) {
      const result = await drizzleTx.insert(vendas).values({
        userId: row.userId,
        fazendaId: row.fazendaId,
        compradorId: row.compradorId,
        comprador: row.comprador,
        data: row.data,
        formaPrecificacao: row.formaPrecificacao === "cabeca" ? "cabeca" : "kg",
        precoPadrao: row.precoPadrao != null ? String(row.precoPadrao) : null,
        quantidadeAnimais: row.quantidadeAnimais,
        pesoTotal: row.pesoTotal != null ? String(row.pesoTotal) : null,
        valorTotal: row.valorTotal != null ? String(row.valorTotal) : null,
        observacoes: row.observacoes,
        status: "concluido",
        idempotencyKey: row.idempotencyKey,
      });
      return insertIdOf(result);
    },
    async insertItens(vendaId, userId, itens) {
      if (!itens.length) return;
      await drizzleTx.insert(vendaItens).values(itens.map(item => ({
        userId,
        vendaId,
        animalId: item.animalId,
        brincoSnapshot: item.brincoSnapshot ?? null,
        loteNomeSnapshot: item.loteNomeSnapshot ?? null,
        pesoVenda: item.pesoVenda != null ? String(item.pesoVenda) : null,
        formaPrecificacao: item.formaPrecificacao === "cabeca" ? "cabeca" : "kg",
        precoUnitario: String(item.precoUnitario),
        valorItem: String(item.valorItem),
      })));
    },
    async insertBaixas(rows) {
      if (!rows.length) return;
      await drizzleTx.insert(animalBaixas).values(rows.map(row => ({
        userId: row.userId,
        animalId: row.animalId,
        fazendaId: row.fazendaId,
        tipo: "venda" as const,
        dataBaixa: row.dataBaixa,
        destino: row.destino,
        motivo: row.motivo,
        usuarioNome: row.usuarioNome,
        vendaId: row.vendaId,
        status: "ativa" as const,
      })));
    },
    async marcarAnimaisVendidos(userId, ids) {
      if (!ids.length) return 0;
      const result = await drizzleTx
        .update(animais)
        .set({ status: "vendido" })
        .where(and(eq(animais.userId, userId), inArray(animais.id, ids), eq(animais.status, "ativo")));
      return affectedRowsOf(result);
    },
  };
  return anexarNucleoFinanceiroNaVenda(drizzleTx, comercial);
}

export function createConfirmarVendaFinanceiroMysqlStore(
  drizzleDb: { transaction: (fn: (tx: FinanceiroDrizzleTx) => Promise<unknown>) => Promise<unknown> },
): ConfirmarVendaFinanceiroStore {
  return {
    transaction(fn) {
      return drizzleDb.transaction(async drizzleTx => {
        // Sem SELECT desbloqueado no início: em REPEATABLE READ isso congelaria
        // o snapshot e a recuperação não veria título/itens já gravados.
        const loteFazendaById = new Map<number, number | null>();
        return fn(createConfirmarVendaFinanceiroTxFromDrizzle(drizzleTx, loteFazendaById));
      }) as Promise<ReturnType<typeof fn>>;
    },
  };
}
