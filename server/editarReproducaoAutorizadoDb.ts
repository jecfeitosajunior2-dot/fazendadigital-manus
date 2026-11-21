import { and, asc, eq, like, or, sql } from "drizzle-orm";
import {
  animais,
  fazendas,
  partoCrias,
  reproducaoRegistros,
  semenMovimentacoes,
  semenPartidas,
  usuarioFazendas,
  usuarioPermissoes,
  users,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { db } from "./db";
import type { ConsultaEditarReproducao, IoEditarReproducao, RegistroReproLinha } from "./editarReproducaoAutorizado";

type Executor = Pick<typeof db, "select" | "update" | "delete" | "transaction">;

function mapRegistro(linha: typeof reproducaoRegistros.$inferSelect): RegistroReproLinha {
  return {
    id: linha.id,
    userId: linha.userId,
    femeaId: linha.femeaId,
    machoId: linha.machoId,
    tipo: linha.tipo,
    dataCobertura: linha.dataCobertura,
    dataPrevistoParto: linha.dataPrevistoParto,
    resultado: linha.resultado,
    observacoes: linha.observacoes,
  };
}

function consultas(tx: Executor): ConsultaEditarReproducao {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linha] = await tx.select({
        id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role,
        papel: users.papel, titularUserId: users.titularUserId, situacao: users.situacao, sessionVersion: users.sessionVersion,
      }).from(users).where(eq(users.id, id)).for("update").limit(1);
      if (!linha) return null;
      return {
        id: linha.id, openId: linha.openId, name: linha.name, email: linha.email,
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel as PapelConta, titularUserId: linha.titularUserId,
        situacao: linha.situacao as SituacaoUsuario, sessionVersion: linha.sessionVersion,
      };
    },
    async permissoes(userId, titularUserId) {
      const linhas = await tx.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
        eq(usuarioPermissoes.userId, userId), eq(usuarioPermissoes.titularUserId, titularUserId),
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
    async espiarRegistro(id) {
      const [linha] = await tx.select().from(reproducaoRegistros).where(eq(reproducaoRegistros.id, id)).limit(1);
      return linha ? mapRegistro(linha) : null;
    },
    async espiarAnimal(id) {
      const [linha] = await tx.select({
        id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId,
      }).from(animais).where(eq(animais.id, id)).limit(1);
      return linha ?? null;
    },
    async travaRegistro(id) {
      const [linha] = await tx.select().from(reproducaoRegistros).where(eq(reproducaoRegistros.id, id)).for("update").limit(1);
      return linha ? mapRegistro(linha) : null;
    },
    async travaAnimal(id) {
      const [linha] = await tx.select({
        id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId,
      }).from(animais).where(eq(animais.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async registrosDoAnimal(userId, animalId) {
      const linhas = await tx.select().from(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.userId, userId),
        or(eq(reproducaoRegistros.femeaId, animalId), eq(reproducaoRegistros.machoId, animalId)),
      )).orderBy(asc(reproducaoRegistros.id)).for("update");
      return linhas.map(mapRegistro);
    },
    async espiarSaidasIa(userId, registroId) {
      const linhas = await tx.select({
        id: semenMovimentacoes.id,
        partidaId: semenMovimentacoes.partidaId,
        quantidadeDoses: semenMovimentacoes.quantidadeDoses,
      }).from(semenMovimentacoes).where(and(
        eq(semenMovimentacoes.userId, userId),
        eq(semenMovimentacoes.tipo, "SAIDA_IA"),
        like(semenMovimentacoes.observacoes, `%registro repro #${registroId}`),
      ));
      return linhas.map((linha) => ({
        id: linha.id,
        partidaId: linha.partidaId,
        quantidadeDoses: linha.quantidadeDoses,
      }));
    },
    async saidasIaDoRegistro(userId, registroId) {
      const linhas = await tx.select({
        id: semenMovimentacoes.id,
        partidaId: semenMovimentacoes.partidaId,
        quantidadeDoses: semenMovimentacoes.quantidadeDoses,
      }).from(semenMovimentacoes).where(and(
        eq(semenMovimentacoes.userId, userId),
        eq(semenMovimentacoes.tipo, "SAIDA_IA"),
        like(semenMovimentacoes.observacoes, `%registro repro #${registroId}`),
      )).for("update");
      return linhas.map((linha) => ({
        id: linha.id,
        partidaId: linha.partidaId,
        quantidadeDoses: linha.quantidadeDoses,
      }));
    },
    async espelhosDoRegistro(userId, registroId) {
      const linhas = await tx.select().from(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.userId, userId),
        like(reproducaoRegistros.observacoes, `%"roid":${registroId}%`),
      )).orderBy(asc(reproducaoRegistros.id)).for("update");
      return linhas.map(mapRegistro);
    },
    async travaPartida(id) {
      const [linha] = await tx.select({
        id: semenPartidas.id,
        userId: semenPartidas.userId,
        fazendaId: semenPartidas.fazendaId,
        saldoDoses: semenPartidas.saldoDoses,
      }).from(semenPartidas).where(eq(semenPartidas.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async partoTemCrias(registroId) {
      const [linha] = await tx.select({ n: sql<number>`count(*)` }).from(partoCrias).where(eq(partoCrias.partoRegistroId, registroId));
      return Number(linha?.n ?? 0) > 0;
    },
    async atualizarRegistro(input) {
      const resultado = await tx.update(reproducaoRegistros).set({
        tipo: input.tipo,
        dataCobertura: new Date(`${input.dataCobertura}T12:00:00`),
        dataPrevistoParto: input.dataPrevistoParto ? new Date(`${input.dataPrevistoParto}T12:00:00`) : null,
        resultado: input.resultado,
        observacoes: input.observacoes,
      }).where(and(eq(reproducaoRegistros.id, input.id), eq(reproducaoRegistros.userId, input.userId)));
      const pacote = resultado as { affectedRows?: number }[] | { affectedRows?: number };
      const linhas = Array.isArray(pacote) ? pacote[0]?.affectedRows : pacote.affectedRows;
      return Number(linhas ?? 0);
    },
    async excluirRegistro(id, userId) {
      const resultado = await tx.delete(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.id, id), eq(reproducaoRegistros.userId, userId),
      ));
      const pacote = resultado as { affectedRows?: number }[] | { affectedRows?: number };
      const linhas = Array.isArray(pacote) ? pacote[0]?.affectedRows : pacote.affectedRows;
      return Number(linhas ?? 0);
    },
  };
}

export function ioEditarReproducaoDrizzle(): IoEditarReproducao {
  return {
    emTransacao(fn) {
      return db.transaction((tx) => fn(consultas(tx as unknown as Executor)), { isolationLevel: "read committed" });
    },
  };
}
