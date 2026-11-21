import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  animais,
  animalBaixas,
  fazendas,
  lotes,
  pastos,
  reproducaoOperacoes,
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
import {
  InseminacaoAindaPendente,
  textoMovimentoInseminacao,
  type ConsultaInseminacao,
  type IoInseminacao,
  type PartidaSemenLinha,
  type ReservaInseminacao,
} from "./inseminacaoSemenAutorizado";

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

function dataMeioDia(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
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

function mapearPartida(linha: {
  id: number;
  userId: number;
  fazendaId: number;
  origemReprodutor: string;
  reprodutorKey: string;
  machoId: number | null;
  reprodutorTexto: string | null;
  partida: string;
  centralOrigem: string | null;
  saldoDoses: number;
  custoUnitario: string | null;
}): PartidaSemenLinha {
  return {
    id: linha.id,
    userId: linha.userId,
    fazendaId: linha.fazendaId,
    origemReprodutor: linha.origemReprodutor,
    reprodutorKey: linha.reprodutorKey,
    machoId: linha.machoId,
    reprodutorTexto: linha.reprodutorTexto,
    partida: linha.partida,
    centralOrigem: linha.centralOrigem,
    saldoDoses: Number(linha.saldoDoses),
    custoUnitario: linha.custoUnitario,
  };
}

const colunasPartida = {
  id: semenPartidas.id,
  userId: semenPartidas.userId,
  fazendaId: semenPartidas.fazendaId,
  origemReprodutor: semenPartidas.origemReprodutor,
  reprodutorKey: semenPartidas.reprodutorKey,
  machoId: semenPartidas.machoId,
  reprodutorTexto: semenPartidas.reprodutorTexto,
  partida: semenPartidas.partida,
  centralOrigem: semenPartidas.centralOrigem,
  saldoDoses: semenPartidas.saldoDoses,
  custoUnitario: semenPartidas.custoUnitario,
};

function consultas(tx: Executor): ConsultaInseminacao {
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
      return tx
        .select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
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
      const [linha] = await tx.select({
        id: lotes.id,
        userId: lotes.userId,
        fazendaId: lotes.fazendaId,
      }).from(lotes).where(eq(lotes.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async pasto(id) {
      const [linha] = await tx.select({
        id: pastos.id,
        userId: pastos.userId,
        fazendaId: pastos.fazendaId,
      }).from(pastos).where(eq(pastos.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async espiar(id) {
      const [linha] = await tx.select({
        id: animais.id,
        userId: animais.userId,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        pastoId: animais.pastoId,
        status: animais.status,
        sexo: animais.sexo,
        castrado: animais.castrado,
        categoria: animais.categoria,
        dataNascimento: animais.dataNascimento,
      }).from(animais).where(eq(animais.id, id)).limit(1);
      if (!linha) return null;
      return { ...linha, dataNascimento: dataTexto(linha.dataNascimento) };
    },
    async animal(id, titularUserId) {
      const [linha] = await tx.select({
        id: animais.id,
        userId: animais.userId,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        pastoId: animais.pastoId,
        status: animais.status,
        sexo: animais.sexo,
        castrado: animais.castrado,
        categoria: animais.categoria,
        dataNascimento: animais.dataNascimento,
      }).from(animais).where(and(eq(animais.id, id), eq(animais.userId, titularUserId))).for("update").limit(1);
      if (!linha) return null;
      return { ...linha, dataNascimento: dataTexto(linha.dataNascimento) };
    },
    async baixaAtiva(animalId) {
      const [linha] = await tx.select({ dataBaixa: animalBaixas.dataBaixa }).from(animalBaixas).where(and(
        eq(animalBaixas.animalId, animalId),
        eq(animalBaixas.status, "ativa"),
      )).for("update").limit(1);
      if (!linha) return null;
      return { dataBaixa: dataTexto(linha.dataBaixa) };
    },
    async espiarPartida(id) {
      const [linha] = await tx.select(colunasPartida).from(semenPartidas).where(eq(semenPartidas.id, id)).limit(1);
      return linha ? mapearPartida(linha) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linha] = await tx.select(colunasPartida).from(semenPartidas).where(and(
        eq(semenPartidas.id, id),
        eq(semenPartidas.userId, titularUserId),
      )).for("update").limit(1);
      return linha ? mapearPartida(linha) : null;
    },
    async inserirReproducao(row) {
      const result = await tx.insert(reproducaoRegistros).values({
        userId: row.userId,
        femeaId: row.femeaId,
        machoId: row.machoId,
        tipo: row.tipo,
        dataCobertura: dataMeioDia(row.dataCobertura),
        dataPrevistoParto: row.dataPrevistoParto ? dataMeioDia(row.dataPrevistoParto) : undefined,
        resultado: row.resultado,
        observacoes: row.observacoes,
      });
      return insertId(result);
    },
    async inserirMovimento(row) {
      const result = await tx.insert(semenMovimentacoes).values({
        partidaId: row.partidaId,
        userId: row.userId,
        fazendaId: row.fazendaId,
        tipo: row.tipo,
        dataEntrada: row.dataEntrada,
        quantidadeDoses: row.quantidadeDoses,
        custoTotal: row.custoTotal,
        custoUnitario: row.custoUnitario,
        observacoes: row.observacoes,
      });
      return insertId(result);
    },
    async atualizarPartida(id, patch) {
      await tx.update(semenPartidas).set({
        saldoDoses: patch.saldoDoses,
        custoUnitario: patch.custoUnitario,
        status: patch.status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(semenPartidas.id, id));
    },
    async reservarOperacao(row): Promise<ReservaInseminacao> {
      try {
        await tx.insert(reproducaoOperacoes).values({
          userId: row.userId,
          chave: row.chave,
          fazendaId: row.fazendaId,
          executorUserId: row.executorUserId,
          conteudoHash: row.conteudoHash,
        });
        return { situacao: "nova" };
      } catch (error) {
        if (!chaveDuplicada(error)) throw error;
        const [linha] = await tx.select({
          conteudoHash: reproducaoOperacoes.conteudoHash,
          registroPrincipalId: reproducaoOperacoes.registroPrincipalId,
        }).from(reproducaoOperacoes).where(and(
          eq(reproducaoOperacoes.userId, row.userId),
          eq(reproducaoOperacoes.chave, row.chave),
        )).for("update").limit(1);
        if (!linha || linha.conteudoHash !== row.conteudoHash) return { situacao: "divergente" };
        if (linha.registroPrincipalId == null) throw new InseminacaoAindaPendente();
        return { situacao: "repetida", registroPrincipalId: linha.registroPrincipalId };
      }
    },
    async concluirOperacao(row) {
      const result = await tx.update(reproducaoOperacoes).set({
        registroPrincipalId: row.registroPrincipalId,
      }).where(and(
        eq(reproducaoOperacoes.userId, row.userId),
        eq(reproducaoOperacoes.chave, row.chave),
        isNull(reproducaoOperacoes.registroPrincipalId),
      ));
      if (afetados(result) !== 1) throw new Error("inseminação não vinculada");
    },
    async movimentoDaInseminacao(userId, registroId, animalId) {
      const texto = textoMovimentoInseminacao(animalId, registroId);
      const linhas = await tx.select({ id: semenMovimentacoes.id }).from(semenMovimentacoes).where(and(
        eq(semenMovimentacoes.userId, userId),
        eq(semenMovimentacoes.tipo, "SAIDA_IA"),
        eq(semenMovimentacoes.observacoes, texto),
      )).limit(2);
      return linhas.length === 1 ? linhas[0].id : null;
    },
  };
}

export function ioInseminacaoSemenDrizzle(): IoInseminacao {
  return {
    async emTransacao(fn) {
      return db.transaction(
        async (tx) => fn(consultas(tx as unknown as Executor)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
