import { and, eq } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import { fazendas, lotes, pastos, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaPastoCadastro, LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { ConsultaCadastroLote, IoCadastroLote } from "./cadastroLoteAutorizado";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function consulta(tx: Transacao): ConsultaCadastroLote {
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
        .where(and(
          eq(usuarioPermissoes.userId, userId),
          eq(usuarioPermissoes.titularUserId, titularUserId),
        ))
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
      return tx
        .select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.userId, titularUserId));
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
    async pasto(id): Promise<LinhaPastoCadastro | null> {
      const [linha] = await tx
        .select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId })
        .from(pastos)
        .where(eq(pastos.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async inserirLote(row) {
      const result = await tx.insert(lotes).values(row);
      return Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
    },
  };
}

export function ioCadastroLoteDrizzle(): IoCadastroLote {
  return {
    emTransacao(fn) {
      return db.transaction(
        async (tx) => fn(consulta(tx)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
