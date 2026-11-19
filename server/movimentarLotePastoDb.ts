import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import { animais, fazendas, lotePastoMovimentacoes, lotes, pastos, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { ConsultaMovimentacaoLote, IoMovimentacaoLote, LoteParaMover } from "./movimentarLotePastoAutorizado";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function consulta(tx: Transacao): ConsultaMovimentacaoLote {
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
    async lote(id): Promise<LoteParaMover | null> {
      const [linha] = await tx
        .select({
          id: lotes.id,
          userId: lotes.userId,
          fazendaId: lotes.fazendaId,
          pastoAtualId: lotes.pastoAtualId,
          dataEntradaPasto: lotes.dataEntradaPasto,
        })
        .from(lotes)
        .where(eq(lotes.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async pasto(id) {
      const [linha] = await tx
        .select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId, nome: pastos.nome })
        .from(pastos)
        .where(eq(pastos.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async animaisAtivos(loteId, titularUserId) {
      return tx
        .select({
          id: animais.id,
          fazendaId: animais.fazendaId,
          pastoId: animais.pastoId,
          status: animais.status,
        })
        .from(animais)
        .where(and(eq(animais.userId, titularUserId), eq(animais.loteId, loteId), eq(animais.status, "ativo")))
        .orderBy(asc(animais.id))
        .for("update");
    },
    async contarAtivos(loteId, titularUserId) {
      const [linha] = await tx
        .select({ quantidade: sql<number>`COUNT(*)` })
        .from(animais)
        .where(and(eq(animais.userId, titularUserId), eq(animais.loteId, loteId), eq(animais.status, "ativo")));
      return Number(linha?.quantidade ?? 0);
    },
    async estadiaAberta(loteId, pastoDestinoId) {
      const [linha] = await tx
        .select({ id: lotePastoMovimentacoes.id, dataEntrada: lotePastoMovimentacoes.dataEntrada })
        .from(lotePastoMovimentacoes)
        .where(and(
          eq(lotePastoMovimentacoes.loteId, loteId),
          eq(lotePastoMovimentacoes.pastoDestinoId, pastoDestinoId),
          isNull(lotePastoMovimentacoes.dataSaida),
        ))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async fecharEstadia(id, dataSaida, diasNoPasto) {
      await tx.update(lotePastoMovimentacoes).set({ dataSaida, diasNoPasto }).where(eq(lotePastoMovimentacoes.id, id));
    },
    async inserirMovimento(row) {
      await tx.insert(lotePastoMovimentacoes).values(row);
    },
    async atualizarLote(id, titularUserId, patch) {
      await tx.update(lotes).set(patch).where(and(eq(lotes.id, id), eq(lotes.userId, titularUserId)));
    },
    async atualizarAnimais(ids, titularUserId, patch) {
      if (ids.length === 0) return;
      await tx.update(animais).set(patch).where(and(
        eq(animais.userId, titularUserId),
        inArray(animais.id, ids),
        eq(animais.status, "ativo"),
      ));
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
    async marcarPastoAtivo(pastoId, titularUserId) {
      await tx.update(pastos).set({ status: "ativo" }).where(and(
        eq(pastos.id, pastoId),
        eq(pastos.userId, titularUserId),
      ));
    },
  };
}

export function ioMovimentarLotePastoDrizzle(): IoMovimentacaoLote {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
}
