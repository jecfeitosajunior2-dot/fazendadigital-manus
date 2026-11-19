import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import {
  animalBaixas,
  animais,
  animalLoteMovimentacoes,
  fazendas,
  lotes,
  pastos,
  users,
  usuarioFazendas,
  usuarioPermissoes,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { ConsultaAnimaisLote, IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function consulta(tx: Transacao): ConsultaAnimaisLote {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linha] = await tx
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          papel: users.papel,
          titularUserId: users.titularUserId,
          situacao: users.situacao,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, id))
        .for("update")
        .limit(1);
      if (!linha) return null;
      return {
        id: linha.id,
        openId: linha.openId,
        name: linha.name,
        email: linha.email,
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel as PapelConta,
        titularUserId: linha.titularUserId,
        situacao: linha.situacao as SituacaoUsuario,
        sessionVersion: linha.sessionVersion,
      };
    },
    async permissoes(userId, titularUserId) {
      const linhas = await tx
        .select({ permissao: usuarioPermissoes.permissao })
        .from(usuarioPermissoes)
        .where(and(eq(usuarioPermissoes.userId, userId), eq(usuarioPermissoes.titularUserId, titularUserId)))
        .for("update");
      return linhas.map((linha) => linha.permissao);
    },
    async vinculos(userId, titularUserId) {
      const linhas = await tx
        .select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
        .from(usuarioFazendas)
        .innerJoin(users, eq(users.id, usuarioFazendas.userId))
        .where(and(eq(usuarioFazendas.userId, userId), eq(users.titularUserId, titularUserId)))
        .for("update");
      return linhas.map((linha) => ({ userId: linha.userId, fazendaId: linha.fazendaId }));
    },
    async fazendasDoTitular(titularUserId) {
      return tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.userId, titularUserId));
    },
    async fazenda(id) {
      const [linha] = await tx
        .select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async lote(id) {
      const [linha] = await tx
        .select({
          id: lotes.id,
          userId: lotes.userId,
          nome: lotes.nome,
          fazendaId: lotes.fazendaId,
          pastoAtualId: lotes.pastoAtualId,
          ativo: lotes.ativo,
        })
        .from(lotes)
        .where(eq(lotes.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async pasto(id) {
      const [linha] = await tx
        .select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId })
        .from(pastos)
        .where(eq(pastos.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async espiar(ids) {
      if (ids.length === 0) return [];
      return tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
        })
        .from(animais)
        .where(inArray(animais.id, ids))
        .orderBy(asc(animais.id));
    },
    async animais(ids, titularUserId) {
      if (ids.length === 0) return [];
      return tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
        })
        .from(animais)
        .where(and(eq(animais.userId, titularUserId), inArray(animais.id, ids)))
        .orderBy(asc(animais.id))
        .for("update");
    },
    async baixaAtiva(animalId, titularUserId) {
      const [linha] = await tx
        .select({ dataBaixa: animalBaixas.dataBaixa })
        .from(animalBaixas)
        .where(and(
          eq(animalBaixas.userId, titularUserId),
          eq(animalBaixas.animalId, animalId),
          eq(animalBaixas.status, "ativa"),
        ))
        .limit(1);
      return linha?.dataBaixa ?? null;
    },
    async atualizarAnimais(ids, titularUserId, patch) {
      if (ids.length === 0) return;
      await tx.update(animais).set(patch).where(and(
        eq(animais.userId, titularUserId),
        inArray(animais.id, ids),
      ));
    },
    async inserirHistorico(rows) {
      if (rows.length === 0) return;
      await tx.insert(animalLoteMovimentacoes).values(rows);
    },
    async sincronizarStatusPasto(pastoId, titularUserId) {
      const [lotesOcupando] = await tx
        .select({ quantidade: sql<number>`COUNT(*)` })
        .from(lotes)
        .where(and(eq(lotes.pastoAtualId, pastoId), eq(lotes.userId, titularUserId)));
      const [animaisOcupando] = await tx
        .select({ quantidade: sql<number>`COUNT(*)` })
        .from(animais)
        .where(and(
          eq(animais.userId, titularUserId),
          eq(animais.pastoId, pastoId),
          eq(animais.status, "ativo"),
        ));
      const ocupa = Number(lotesOcupando?.quantidade ?? 0) > 0 || Number(animaisOcupando?.quantidade ?? 0) > 0;
      await tx.update(pastos).set({ status: ocupa ? "ativo" : "descanso" }).where(and(
        eq(pastos.id, pastoId),
        eq(pastos.userId, titularUserId),
      ));
    },
  };
}

export function ioAnimaisLoteDrizzle(): IoAnimaisLote {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
}
