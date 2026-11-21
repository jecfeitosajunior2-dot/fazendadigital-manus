import { and, desc, eq, inArray } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import {
  animalLoteMovimentacoes,
  animais,
  fazendas,
  pesagens,
  users,
  usuarioFazendas,
  usuarioPermissoes,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { ConsultaListaPesagens, IoListaPesagens, PedidoListaPesagens } from "./consultaPesagemAutorizada";
import { listarPesagensAutorizadas } from "./consultaPesagemAutorizada";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function consulta(tx: Transacao): ConsultaListaPesagens {
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
    async pesagens(titularUserId, animalId) {
      const filtros = [eq(pesagens.userId, titularUserId)];
      if (animalId != null) filtros.push(eq(pesagens.animalId, animalId));
      return tx.select().from(pesagens).where(and(...filtros)).orderBy(desc(pesagens.createdAt));
    },
    async animaisDasPesagens(titularUserId, ids) {
      if (ids.length === 0) return [];
      return tx
        .select({ id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId })
        .from(animais)
        .where(and(eq(animais.userId, titularUserId), inArray(animais.id, ids)));
    },
    async movimentosDosAnimais(titularUserId, ids) {
      if (ids.length === 0) return [];
      const linhas = await tx
        .select({
          animalId: animalLoteMovimentacoes.animalId,
          data: animalLoteMovimentacoes.dataMovimentacao,
          fazendaOrigemId: animalLoteMovimentacoes.fazendaOrigemId,
          fazendaDestinoId: animalLoteMovimentacoes.fazendaId,
        })
        .from(animalLoteMovimentacoes)
        .where(and(
          eq(animalLoteMovimentacoes.userId, titularUserId),
          inArray(animalLoteMovimentacoes.animalId, ids),
        ));
      return linhas;
    },
  };
}

export function listarPesagensNoBanco(pedido: PedidoListaPesagens) {
  const io: IoListaPesagens = {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
  return listarPesagensAutorizadas(io, pedido);
}
