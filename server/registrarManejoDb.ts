import { and, eq, or, isNull } from "drizzle-orm";
import { animais, fazendas, lotes, pastos, saudeRegistros, reproducaoRegistros, usuarioFazendas, usuarioPermissoes, users, animalBaixas } from "../drizzle/schema";
import { db } from "./db";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { ConsultaManejo, IoManejo } from "./registrarManejoAutorizado";

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

function insertId(result: unknown): number {
  const lista = result as { insertId?: number }[];
  const objeto = result as { insertId?: number };
  return Number(lista?.[0]?.insertId ?? objeto?.insertId ?? 0);
}

function afetou(result: unknown): boolean {
  return Number((result as { affectedRows?: number }[])[0]?.affectedRows ?? 0) > 0;
}

function consultas(tx: Executor): ConsultaManejo {
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
      const linhas = await tx
        .select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
        .from(usuarioFazendas)
        .innerJoin(users, eq(users.id, usuarioFazendas.userId))
        .where(and(eq(usuarioFazendas.userId, userId), eq(users.titularUserId, titularUserId)))
        .for("update");
      return linhas;
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
    async tiposSaude(animalId, titularUserId) {
      return tx.select({ tipo: saudeRegistros.tipo }).from(saudeRegistros).where(and(
        eq(saudeRegistros.userId, titularUserId),
        eq(saudeRegistros.animalId, animalId),
      ));
    },
    async inserirSaude(row) {
      const result = await tx.insert(saudeRegistros).values({
        userId: row.userId,
        animalId: row.animalId,
        tipo: row.tipo,
        descricao: row.descricao,
        medicamento: row.medicamento,
        veterinario: row.veterinario,
        dataRegistro: row.dataRegistro,
        observacoes: row.observacoes,
        status: "ativo",
      });
      return insertId(result);
    },
    async marcarCastrado(id, titularUserId) {
      const result = await tx.update(animais).set({ castrado: true }).where(and(
        eq(animais.id, id),
        eq(animais.userId, titularUserId),
        eq(animais.status, "ativo"),
        or(isNull(animais.castrado), eq(animais.castrado, false)),
      ));
      return afetou(result);
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
  };
}

function dataMeioDia(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

export function ioManejoDrizzle(): IoManejo {
  return {
    async emTransacao(fn) {
      return db.transaction(
        async (tx) => fn(consultas(tx as unknown as Executor)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
