import { and, eq } from "drizzle-orm";
import { fazendas, usuarioFazendas, usuarioPermissoes, users, vendas } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { db } from "./db";
import type { ConsultaVendaOperacao, IoVendaOperacao } from "./vendaOperacaoAutorizado";

type Executor = Pick<typeof db, "select" | "transaction">;

function consultas(tx: Executor): ConsultaVendaOperacao {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linha] = await tx.select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        papel: users.papel,
        titularUserId: users.titularUserId,
        situacao: users.situacao,
        sessionVersion: users.sessionVersion,
      }).from(users).where(eq(users.id, id)).for("update").limit(1);
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
      const linhas = await tx.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
        eq(usuarioPermissoes.userId, userId),
        eq(usuarioPermissoes.titularUserId, titularUserId),
      )).for("update");
      return linhas.map((linha) => linha.permissao);
    },
    async vinculos(userId, titularUserId) {
      return tx.select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
        .from(usuarioFazendas)
        .innerJoin(users, eq(users.id, usuarioFazendas.userId))
        .where(and(eq(usuarioFazendas.userId, userId), eq(users.titularUserId, titularUserId)))
        .for("update");
    },
    async fazendasDoTitular(titularUserId) {
      return tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.userId, titularUserId));
    },
    async fazenda(id) {
      const [linha] = await tx.select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas).where(eq(fazendas.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async espiarVenda(id) {
      const [linha] = await tx.select({
        id: vendas.id,
        userId: vendas.userId,
        fazendaId: vendas.fazendaId,
        status: vendas.status,
      }).from(vendas).where(eq(vendas.id, id)).limit(1);
      return linha ?? null;
    },
    transacaoAtual: tx,
  };
}

export function ioVendaOperacaoDrizzle(): IoVendaOperacao {
  return {
    emTransacao(fn) {
      return db.transaction(
        (tx) => fn(consultas(tx as unknown as Executor)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
