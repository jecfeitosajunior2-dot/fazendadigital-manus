import { and, eq, sql } from "drizzle-orm";
import { animalLoteMovimentacoes, animais, compraGrupos, compras, lotes, pastos, pesagens } from "../drizzle/schema";
import { normalizeBrincoKey } from "../shared/brincoAtivo";
import { normalizeRfidKey } from "../shared/rfidUnicidade";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import { db } from "./db";
import {
  createReceberAnimalCompraService,
  type ReceberAnimalCompraGrupo,
  type ReceberAnimalCompraStore,
  type ReceberAnimalCompraTx,
} from "./receberAnimalCompra";

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function txFromDrizzle(tx: typeof db): ReceberAnimalCompraTx {
  return {
    async getCompra(userId, compraId) {
      const [row] = await tx
        .select({
          id: compras.id,
          userId: compras.userId,
          fazendaId: compras.fazendaId,
          status: compras.status,
          pesoTotal: compras.pesoTotal,
        })
        .from(compras)
        .where(and(eq(compras.id, compraId), eq(compras.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async lockGrupo(userId, compraId, grupoId) {
      await tx.execute(sql`
        SELECT \`id\` FROM \`compra_grupos\`
        WHERE \`id\` = ${grupoId} AND \`user_id\` = ${userId} AND \`compra_id\` = ${compraId}
        FOR UPDATE
      `);
      const [row] = await tx
        .select({
          id: compraGrupos.id,
          userId: compraGrupos.userId,
          compraId: compraGrupos.compraId,
          categoria: compraGrupos.categoria,
          sexo: compraGrupos.sexo,
          quantidade: compraGrupos.quantidade,
        })
        .from(compraGrupos)
        .where(
          and(
            eq(compraGrupos.id, grupoId),
            eq(compraGrupos.userId, userId),
            eq(compraGrupos.compraId, compraId),
          ),
        )
        .limit(1);
      if (!row || (row.sexo !== "macho" && row.sexo !== "femea")) return null;
      return row as ReceberAnimalCompraGrupo;
    },

    async countIdentificadosNoGrupo(userId, compraId, grupoId) {
      const rows = await tx
        .select({ id: animais.id })
        .from(animais)
        .where(
          and(
            eq(animais.userId, userId),
            eq(animais.compraId, compraId),
            eq(animais.compraGrupoId, grupoId),
          ),
        );
      return rows.length;
    },

    async findBrincoAtivoConflito(userId, brinco, fazendaId) {
      const key = normalizeBrincoKey(brinco);
      if (!key) return null;
      const [row] = await tx
        .select({ id: animais.id })
        .from(animais)
        .where(
          and(
            eq(animais.userId, userId),
            eq(animais.status, "ativo"),
            eq(animais.fazendaId, fazendaId),
            sql`LOWER(TRIM(${animais.brinco})) = ${key}`,
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async findRfidConflito(userId, rfid) {
      const key = normalizeRfidKey(rfid);
      if (!key) return null;
      const [row] = await tx
        .select({ id: animais.id, status: animais.status })
        .from(animais)
        .where(and(eq(animais.userId, userId), sql`TRIM(${animais.brincoEletronico}) = ${key}`))
        .limit(1);
      return row ?? null;
    },

    async findLote(userId, loteId) {
      const [row] = await tx
        .select({
          id: lotes.id,
          userId: lotes.userId,
          fazendaId: lotes.fazendaId,
          nome: lotes.nome,
          ativo: lotes.ativo,
          pastoAtualId: lotes.pastoAtualId,
        })
        .from(lotes)
        .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async findPasto(userId, pastoId) {
      const [row] = await tx
        .select({
          id: pastos.id,
          userId: pastos.userId,
          fazendaId: pastos.fazendaId,
          nome: pastos.nome,
        })
        .from(pastos)
        .where(and(eq(pastos.id, pastoId), eq(pastos.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async insertAnimal(row) {
      const result = await tx.insert(animais).values({
        userId: row.userId,
        fazendaId: row.fazendaId,
        sexo: row.sexo,
        categoria: row.categoria,
        brinco: row.brinco,
        nome: row.nome,
        brincoEletronico: row.brincoEletronico,
        raca: row.raca,
        status: row.status,
        dataEntrada: row.dataEntrada,
        observacoes: row.observacoes,
        compraId: row.compraId,
        compraGrupoId: row.compraGrupoId,
        loteId: row.loteId,
        pastoId: row.pastoId,
        pesoAtual: row.pesoAtual,
      });
      return insertIdOf(result);
    },

    async insertPesagem(row) {
      const result = await tx.insert(pesagens).values({
        userId: row.userId,
        animalId: row.animalId,
        peso: row.peso,
        data: dataCivilParaColunaDate(row.data),
        observacoes: row.observacoes,
      });
      return insertIdOf(result);
    },

    async insertMovimentacao(row) {
      const result = await tx.insert(animalLoteMovimentacoes).values({
        userId: row.userId,
        animalId: row.animalId,
        loteOrigemId: row.loteOrigemId,
        loteDestinoId: row.loteDestinoId,
        pastoOrigemId: row.pastoOrigemId,
        pastoDestinoId: row.pastoDestinoId,
        fazendaId: row.fazendaId,
        dataMovimentacao: row.dataMovimentacao,
        usuarioNome: row.usuarioNome,
        observacoes: row.observacoes,
      });
      return insertIdOf(result);
    },
  };
}

export const receberAnimalCompraStore: ReceberAnimalCompraStore = {
  transaction(fn) {
    return db.transaction(tx => fn(txFromDrizzle(tx as unknown as typeof db)));
  },
};

export const receberAnimalCompra = createReceberAnimalCompraService(receberAnimalCompraStore);
