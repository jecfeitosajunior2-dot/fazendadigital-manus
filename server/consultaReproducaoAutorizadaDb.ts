import { and, desc, eq } from "drizzle-orm";
import { animais, fazendas, lotes, pastos, reproducaoRegistros, usuarioFazendas, usuarioPermissoes, users } from "../drizzle/schema";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { db } from "./db";
import type { ConsultaReproducao, IoConsultaReproducao } from "./consultaReproducaoAutorizada";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "transaction">;

function afetados(result: unknown): number {
  const lista = result as { affectedRows?: number }[];
  const objeto = result as { affectedRows?: number };
  return Number(lista?.[0]?.affectedRows ?? objeto?.affectedRows ?? 0);
}

function consultas(tx: Executor): ConsultaReproducao {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linha] = await tx.select({
        id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role,
        papel: users.papel, titularUserId: users.titularUserId, situacao: users.situacao, sessionVersion: users.sessionVersion,
      }).from(users).where(eq(users.id, id)).for("update").limit(1);
      if (!linha) return null;
      return {
        ...linha,
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel as PapelConta,
        situacao: linha.situacao as SituacaoUsuario,
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
      const [linha] = await tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async lotes(titularUserId) {
      return tx.select({
        id: lotes.id, userId: lotes.userId, fazendaId: lotes.fazendaId, pastoAtualId: lotes.pastoAtualId,
      }).from(lotes).where(eq(lotes.userId, titularUserId));
    },
    async pastos(titularUserId) {
      return tx.select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId }).from(pastos).where(eq(pastos.userId, titularUserId));
    },
    async registros(titularUserId) {
      const linhas = await tx.select({
        id: reproducaoRegistros.id,
        userId: reproducaoRegistros.userId,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        tipo: reproducaoRegistros.tipo,
        dataCobertura: reproducaoRegistros.dataCobertura,
        dataPrevistoParto: reproducaoRegistros.dataPrevistoParto,
        dataPartoReal: reproducaoRegistros.dataPartoReal,
        resultado: reproducaoRegistros.resultado,
        filhotes: reproducaoRegistros.filhotes,
        observacoes: reproducaoRegistros.observacoes,
        createdAt: reproducaoRegistros.createdAt,
        animalUserId: animais.userId,
        animalFazendaId: animais.fazendaId,
        animalLoteId: animais.loteId,
      }).from(reproducaoRegistros)
        .leftJoin(animais, and(eq(animais.id, reproducaoRegistros.femeaId), eq(animais.userId, reproducaoRegistros.userId)))
        .where(eq(reproducaoRegistros.userId, titularUserId))
        .orderBy(desc(reproducaoRegistros.createdAt), desc(reproducaoRegistros.id));
      return linhas.map((linha) => ({
        ...linha,
        machoId: linha.machoId ?? null,
        resultado: linha.resultado ?? null,
        filhotes: linha.filhotes ?? null,
        observacoes: linha.observacoes ?? null,
        createdAt: linha.createdAt ?? null,
        animalUserId: linha.animalUserId ?? null,
        animalFazendaId: linha.animalFazendaId ?? null,
        animalLoteId: linha.animalLoteId ?? null,
      }));
    },
    async lerConfig(fazendaId, titularUserId) {
      const [linha] = await tx.select({ configReproPipeline: fazendas.configReproPipeline }).from(fazendas).where(and(
        eq(fazendas.id, fazendaId),
        eq(fazendas.userId, titularUserId),
      )).limit(1);
      if (!linha) return undefined;
      return linha.configReproPipeline ?? null;
    },
    async gravarConfig(fazendaId, titularUserId, serializado) {
      const result = await tx.update(fazendas).set({ configReproPipeline: serializado }).where(and(
        eq(fazendas.id, fazendaId),
        eq(fazendas.userId, titularUserId),
      ));
      if (afetados(result) > 0) return 1;
      const [linha] = await tx.select({ id: fazendas.id }).from(fazendas).where(and(
        eq(fazendas.id, fazendaId),
        eq(fazendas.userId, titularUserId),
      )).limit(1);
      return linha ? 1 : 0;
    },
  };
}

export function ioConsultaReproducaoDrizzle(): IoConsultaReproducao {
  return {
    async emTransacao(fn) {
      return db.transaction(async (tx) => fn(consultas(tx as unknown as Executor)), { isolationLevel: "read committed" });
    },
  };
}
