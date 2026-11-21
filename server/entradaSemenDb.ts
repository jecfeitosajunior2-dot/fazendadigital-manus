import { and, eq, isNull, sql } from "drizzle-orm";
import {
  animais,
  fazendas,
  lotes,
  pastos,
  semenEntradaOperacoes,
  semenMovimentacoes,
  semenPartidas,
  usuarioFazendas,
  usuarioPermissoes,
  users,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { db } from "./db";
import {
  EntradaAindaPendente,
  type ConsultaEntradaSemen,
  type IoEntradaSemen,
  type PartidaEntradaLinha,
  type ReservaEntrada,
} from "./entradaSemenAutorizado";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "transaction">;

function dataTexto(valor: unknown): string | null {
  if (valor == null || valor === "") return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  return String(valor).slice(0, 10);
}

function afetados(result: unknown): number {
  const lista = result as { affectedRows?: number }[];
  const objeto = result as { affectedRows?: number };
  return Number(lista?.[0]?.affectedRows ?? objeto?.affectedRows ?? 0);
}

function chaveDuplicada(error: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; code?: string; cause?: unknown };
    if (item.errno === 1062 || item.code === "ER_DUP_ENTRY") return true;
    atual = item.cause;
  }
  return false;
}

function insertId(result: unknown): number {
  const lista = result as { insertId?: number }[];
  const objeto = result as { insertId?: number };
  return Number(lista?.[0]?.insertId ?? objeto?.insertId ?? 0);
}

function consultas(tx: Executor): ConsultaEntradaSemen {
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
    async lote(id) {
      const [linha] = await tx.select({ id: lotes.id, userId: lotes.userId, fazendaId: lotes.fazendaId }).from(lotes).where(eq(lotes.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async pasto(id) {
      const [linha] = await tx.select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId }).from(pastos).where(eq(pastos.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async espiar(id) {
      const [linha] = await tx.select({
        id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId, loteId: animais.loteId, pastoId: animais.pastoId,
        status: animais.status, sexo: animais.sexo, castrado: animais.castrado, categoria: animais.categoria,
        dataNascimento: animais.dataNascimento, brinco: animais.brinco, nome: animais.nome,
      }).from(animais).where(eq(animais.id, id)).limit(1);
      if (!linha) return null;
      return { ...linha, dataNascimento: dataTexto(linha.dataNascimento) };
    },
    async animal(id, titularUserId) {
      const [linha] = await tx.select({
        id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId, loteId: animais.loteId, pastoId: animais.pastoId,
        status: animais.status, sexo: animais.sexo, castrado: animais.castrado, categoria: animais.categoria,
        dataNascimento: animais.dataNascimento, brinco: animais.brinco, nome: animais.nome,
      }).from(animais).where(and(eq(animais.id, id), eq(animais.userId, titularUserId))).for("update").limit(1);
      if (!linha) return null;
      return { ...linha, dataNascimento: dataTexto(linha.dataNascimento) };
    },
    async espiarPartida(titularUserId, fazendaId, reprodutorKey, partida) {
      const [linha] = await tx.select({
        id: semenPartidas.id, userId: semenPartidas.userId, fazendaId: semenPartidas.fazendaId,
        reprodutorKey: semenPartidas.reprodutorKey, partida: semenPartidas.partida, saldoDoses: semenPartidas.saldoDoses,
        custoUnitario: semenPartidas.custoUnitario, centralOrigem: semenPartidas.centralOrigem,
        reprodutorTexto: semenPartidas.reprodutorTexto, status: semenPartidas.status,
      }).from(semenPartidas).where(and(
        eq(semenPartidas.userId, titularUserId),
        eq(semenPartidas.fazendaId, fazendaId),
        eq(semenPartidas.reprodutorKey, reprodutorKey),
        eq(semenPartidas.partida, partida),
      )).limit(1);
      return linha ? mapear(linha) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linha] = await tx.select({
        id: semenPartidas.id, userId: semenPartidas.userId, fazendaId: semenPartidas.fazendaId,
        reprodutorKey: semenPartidas.reprodutorKey, partida: semenPartidas.partida, saldoDoses: semenPartidas.saldoDoses,
        custoUnitario: semenPartidas.custoUnitario, centralOrigem: semenPartidas.centralOrigem,
        reprodutorTexto: semenPartidas.reprodutorTexto, status: semenPartidas.status,
      }).from(semenPartidas).where(and(eq(semenPartidas.id, id), eq(semenPartidas.userId, titularUserId))).for("update").limit(1);
      return linha ? mapear(linha) : null;
    },
    async inserirPartida(row) {
      const result = await tx.insert(semenPartidas).values(row);
      return insertId(result);
    },
    async atualizarPartida(id, patch) {
      await tx.update(semenPartidas).set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(semenPartidas.id, id));
    },
    async inserirMovimento(row) {
      const result = await tx.insert(semenMovimentacoes).values(row);
      return insertId(result);
    },
    async reservarOperacao(row): Promise<ReservaEntrada> {
      try {
        await tx.insert(semenEntradaOperacoes).values({
          userId: row.userId,
          chave: row.chave,
          fazendaId: row.fazendaId,
          executorUserId: row.executorUserId,
          conteudoHash: row.conteudoHash,
          novaEntrada: false,
        });
        return { situacao: "nova" };
      } catch (error) {
        if (!chaveDuplicada(error)) throw error;
        const [linha] = await tx.select({
          conteudoHash: semenEntradaOperacoes.conteudoHash,
          partidaId: semenEntradaOperacoes.partidaId,
          movimentacaoId: semenEntradaOperacoes.movimentacaoId,
          saldoAtual: semenEntradaOperacoes.saldoAtual,
          custoMedioAtual: semenEntradaOperacoes.custoMedioAtual,
          novaEntrada: semenEntradaOperacoes.novaEntrada,
        }).from(semenEntradaOperacoes).where(and(
          eq(semenEntradaOperacoes.userId, row.userId),
          eq(semenEntradaOperacoes.chave, row.chave),
        )).for("update").limit(1);
        if (!linha || linha.conteudoHash !== row.conteudoHash) return { situacao: "divergente" };
        if (linha.partidaId == null || linha.movimentacaoId == null || linha.saldoAtual == null) {
          throw new EntradaAindaPendente();
        }
        return {
          situacao: "repetida",
          partidaId: linha.partidaId,
          movimentacaoId: linha.movimentacaoId,
          saldoAtual: linha.saldoAtual,
          custoMedioAtual: linha.custoMedioAtual,
          novaEntrada: linha.novaEntrada,
        };
      }
    },
    async concluirOperacao(row) {
      const result = await tx.update(semenEntradaOperacoes).set({
        partidaId: row.partidaId,
        movimentacaoId: row.movimentacaoId,
        saldoAtual: row.saldoAtual,
        custoMedioAtual: row.custoMedioAtual,
        novaEntrada: row.novaEntrada,
      }).where(and(
        eq(semenEntradaOperacoes.userId, row.userId),
        eq(semenEntradaOperacoes.chave, row.chave),
        isNull(semenEntradaOperacoes.partidaId),
      ));
      if (afetados(result) !== 1) throw new Error("entrada de sêmen não vinculada");
    },
  };
}

function mapear(linha: {
  id: number; userId: number; fazendaId: number; reprodutorKey: string; partida: string;
  saldoDoses: number; custoUnitario: string | null; centralOrigem: string | null;
  reprodutorTexto: string | null; status: string;
}): PartidaEntradaLinha {
  return { ...linha, saldoDoses: Number(linha.saldoDoses) };
}

export function ioEntradaSemenDrizzle(): IoEntradaSemen {
  return {
    async emTransacao(fn) {
      return db.transaction(async (tx) => fn(consultas(tx as unknown as Executor)), { isolationLevel: "read committed" });
    },
  };
}
