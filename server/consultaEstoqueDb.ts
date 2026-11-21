import { and, eq } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import { fazendas, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { ConsultaAutorizacaoPersistida, LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  autorizarMovimentoEstoque,
  fazendasDaConsultaEstoque,
  type IoEstoque,
} from "./consultaEstoqueAutorizada";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function consulta(tx: Transacao): ConsultaAutorizacaoPersistida {
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
      const linhas = await tx
        .select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.userId, titularUserId));
      return [...linhas].sort((a, b) => a.id - b.id);
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
  };
}

export function consultaEstoqueNaTransacao(tx: Transacao): ConsultaAutorizacaoPersistida {
  return consulta(tx);
}

function ioBanco(): IoEstoque {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
}

export function fazendasDaConsultaEstoqueNoBanco(
  pedido: Parameters<typeof fazendasDaConsultaEstoque>[1],
) {
  return fazendasDaConsultaEstoque(ioBanco(), pedido);
}

export function autorizarMovimentoEstoqueNoBanco(
  pedido: Parameters<typeof autorizarMovimentoEstoque>[1],
) {
  return autorizarMovimentoEstoque(ioBanco(), pedido);
}
