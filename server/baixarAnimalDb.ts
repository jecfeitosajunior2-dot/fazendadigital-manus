import { and, eq, or, sql } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import {
  animalBaixas,
  animalLoteMovimentacoes,
  animais,
  compraRecebimentos,
  fazendas,
  historicoBrincos,
  lotes,
  partoCrias,
  pastos,
  pesagens,
  reproducaoRegistros,
  saudeRegistros,
  semenPartidas,
  users,
  usuarioFazendas,
  usuarioPermissoes,
  vendaItens,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { ConsultaBaixaAnimal, IoBaixaAnimal, NovaBaixaAnimal } from "./baixarAnimalAutorizado";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

async function existe(consulta: Promise<unknown[]>): Promise<boolean> {
  const linhas = await consulta;
  return linhas.length > 0;
}

function consulta(tx: Transacao): ConsultaBaixaAnimal {
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
        .select({ id: lotes.id, userId: lotes.userId, fazendaId: lotes.fazendaId })
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
    async espiar(id) {
      const [linha] = await tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
          brinco: animais.brinco,
        })
        .from(animais)
        .where(eq(animais.id, id))
        .limit(1);
      return linha ?? null;
    },
    async animal(id, titularUserId) {
      const [linha] = await tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
          brinco: animais.brinco,
        })
        .from(animais)
        .where(and(eq(animais.id, id), eq(animais.userId, titularUserId)))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async baixaAtiva(animalId) {
      const [linha] = await tx
        .select({ id: animalBaixas.id, vendaId: animalBaixas.vendaId })
        .from(animalBaixas)
        .where(and(eq(animalBaixas.animalId, animalId), eq(animalBaixas.status, "ativa")))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async inserirBaixa(row: NovaBaixaAnimal) {
      const insert = await tx.insert(animalBaixas).values({
        userId: row.userId,
        animalId: row.animalId,
        fazendaId: row.fazendaId,
        tipo: row.tipo,
        dataBaixa: row.dataBaixa,
        destino: row.destino,
        motivo: row.motivo,
        observacoes: row.observacoes,
        usuarioNome: row.usuarioNome,
        vendaId: null,
        status: "ativa",
      });
      const id = Number((insert as { insertId?: number }[])[0]?.insertId ?? 0);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Falha ao registrar a baixa.");
      return id;
    },
    async atualizarStatus(id, titularUserId, status) {
      await tx.update(animais).set({ status: status as "morto" | "transferido" | "vendido" | "ativo" }).where(and(
        eq(animais.id, id),
        eq(animais.userId, titularUserId),
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
    async temRastro(animalId, titularUserId) {
      const dono = eq(pesagens.userId, titularUserId);
      const consultas = [
        tx.select({ id: pesagens.id }).from(pesagens).where(and(dono, eq(pesagens.animalId, animalId))).limit(1),
        tx.select({ id: saudeRegistros.id }).from(saudeRegistros).where(and(eq(saudeRegistros.userId, titularUserId), eq(saudeRegistros.animalId, animalId))).limit(1),
        tx.select({ id: reproducaoRegistros.id }).from(reproducaoRegistros).where(and(
          eq(reproducaoRegistros.userId, titularUserId),
          or(eq(reproducaoRegistros.femeaId, animalId), eq(reproducaoRegistros.machoId, animalId)),
        )).limit(1),
        tx.select({ id: animalBaixas.id }).from(animalBaixas).where(and(eq(animalBaixas.userId, titularUserId), eq(animalBaixas.animalId, animalId))).limit(1),
        tx.select({ id: animalLoteMovimentacoes.id }).from(animalLoteMovimentacoes).where(and(eq(animalLoteMovimentacoes.userId, titularUserId), eq(animalLoteMovimentacoes.animalId, animalId))).limit(1),
        tx.select({ id: historicoBrincos.id }).from(historicoBrincos).where(and(eq(historicoBrincos.userId, titularUserId), eq(historicoBrincos.animalId, animalId))).limit(1),
        tx.select({ id: vendaItens.id }).from(vendaItens).where(and(eq(vendaItens.userId, titularUserId), eq(vendaItens.animalId, animalId))).limit(1),
        tx.select({ id: animais.id }).from(animais).where(and(
          eq(animais.userId, titularUserId),
          or(eq(animais.maeId, animalId), eq(animais.paiId, animalId)),
        )).limit(1),
        tx.select({ id: partoCrias.id }).from(partoCrias).where(and(eq(partoCrias.userId, titularUserId), eq(partoCrias.criaAnimalId, animalId))).limit(1),
        tx.select({ id: semenPartidas.id }).from(semenPartidas).where(and(eq(semenPartidas.userId, titularUserId), eq(semenPartidas.machoId, animalId))).limit(1),
        tx.select({ id: compraRecebimentos.id }).from(compraRecebimentos).where(and(eq(compraRecebimentos.userId, titularUserId), eq(compraRecebimentos.animalId, animalId))).limit(1),
      ];
      for (const item of consultas) {
        if (await existe(item)) return true;
      }
      return false;
    },
    async excluirAnimal(id, titularUserId) {
      await tx.delete(animais).where(and(eq(animais.id, id), eq(animais.userId, titularUserId)));
    },
  };
}

export function ioBaixaDrizzle(): IoBaixaAnimal {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
}
