import { and, eq, sql } from "drizzle-orm";
import { fazendas, semenMovimentacoes, semenPartidas, usuarioFazendas, usuarioPermissoes, users } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  type ConsultaCorrecaoAjusteSemen,
  type IoCorrecaoAjusteSemen,
  type MovimentoSemenLinha,
  type PartidaCorrecaoLinha,
} from "./correcaoAjusteSemenAutorizado";
import { db } from "./db";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "transaction">;

function insertId(result: unknown): number {
  const lista = result as { insertId?: number }[];
  const objeto = result as { insertId?: number };
  return Number(lista?.[0]?.insertId ?? objeto?.insertId ?? 0);
}

function texto(valor: string | number | null): string {
  return valor == null ? "0.00" : String(valor);
}

function consultas(tx: Executor): ConsultaCorrecaoAjusteSemen {
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
      const [linha] = await tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async espiarMovimento(id) {
      const [linha] = await tx.select().from(semenMovimentacoes).where(eq(semenMovimentacoes.id, id)).limit(1);
      return linha ? mapearMovimento(linha) : null;
    },
    async espiarPartida(id) {
      const [linha] = await tx.select({
        id: semenPartidas.id, userId: semenPartidas.userId, fazendaId: semenPartidas.fazendaId,
        saldoDoses: semenPartidas.saldoDoses, custoUnitario: semenPartidas.custoUnitario, status: semenPartidas.status,
      }).from(semenPartidas).where(eq(semenPartidas.id, id)).limit(1);
      return linha ? mapearPartida(linha) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linha] = await tx.select({
        id: semenPartidas.id, userId: semenPartidas.userId, fazendaId: semenPartidas.fazendaId,
        saldoDoses: semenPartidas.saldoDoses, custoUnitario: semenPartidas.custoUnitario, status: semenPartidas.status,
      }).from(semenPartidas).where(and(
        eq(semenPartidas.id, id), eq(semenPartidas.userId, titularUserId),
      )).for("update").limit(1);
      return linha ? mapearPartida(linha) : null;
    },
    async movimentos(partidaId, titularUserId) {
      const linhas = await tx.select().from(semenMovimentacoes).where(and(
        eq(semenMovimentacoes.partidaId, partidaId), eq(semenMovimentacoes.userId, titularUserId),
      ));
      return linhas.map(mapearMovimento);
    },
    async inserirMovimento(row) {
      const resultado = await tx.insert(semenMovimentacoes).values(row);
      return insertId(resultado);
    },
    async atualizarPartida(id, patch) {
      await tx.update(semenPartidas).set({
        saldoDoses: patch.saldoDoses,
        custoUnitario: patch.custoUnitario,
        status: patch.status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(semenPartidas.id, id));
    },
  };
}

function mapearPartida(linha: {
  id: number; userId: number; fazendaId: number; saldoDoses: number; custoUnitario: string | null; status: string;
}): PartidaCorrecaoLinha {
  return { ...linha, saldoDoses: Number(linha.saldoDoses) };
}

function mapearMovimento(linha: {
  id: number; partidaId: number; userId: number; fazendaId: number; tipo: string; dataEntrada: string;
  quantidadeDoses: number; custoTotal: string; custoUnitario: string; observacoes: string | null;
  movimentacaoOrigemId: number | null; grupoCorrecaoId: string | null; motivoCorrecao: string | null;
  createdAt: Date | null;
}): MovimentoSemenLinha {
  return {
    ...linha,
    quantidadeDoses: Number(linha.quantidadeDoses),
    custoTotal: texto(linha.custoTotal),
    custoUnitario: texto(linha.custoUnitario),
  };
}

export function ioCorrecaoAjusteSemenDrizzle(): IoCorrecaoAjusteSemen {
  return {
    async emTransacao(fn) {
      return db.transaction(async (tx) => fn(consultas(tx as unknown as Executor)), { isolationLevel: "read committed" });
    },
  };
}
