import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { animalBaixas, animais, fazendas, lotes, pastos, reproducaoOperacoes, reproducaoRegistros, usuarioFazendas, usuarioPermissoes, users } from "../drizzle/schema";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { db } from "./db";
import type { AnimalColetivoLinha, ConsultaColetiva, IoColetiva, LoteColetivoLinha, RegistroColetivoLinha, ReservaOperacao } from "./registrarReproducaoColetivaAutorizado";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "transaction">;

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

function dataMeioDia(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function animalDe(linha: {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  sexo: string | null;
  categoria: string | null;
  status: string | null;
  dataNascimento: string | Date | null;
  castrado: boolean | number | null;
  brinco: string | null;
  nome: string | null;
}): AnimalColetivoLinha {
  return linha;
}

function consultas(tx: Executor): ConsultaColetiva {
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
    async espiarAnimal(id) {
      const [linha] = await tx.select({
        id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId, loteId: animais.loteId,
        pastoId: animais.pastoId, sexo: animais.sexo, categoria: animais.categoria, status: animais.status,
        dataNascimento: animais.dataNascimento, castrado: animais.castrado, brinco: animais.brinco, nome: animais.nome,
      }).from(animais).where(eq(animais.id, id)).limit(1);
      return linha ? animalDe(linha) : null;
    },
    async travaLote(id): Promise<LoteColetivoLinha | null> {
      const [linha] = await tx.select({
        id: lotes.id, userId: lotes.userId, fazendaId: lotes.fazendaId, pastoAtualId: lotes.pastoAtualId,
        ativo: lotes.ativo, nome: lotes.nome,
      }).from(lotes).where(eq(lotes.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async travaPasto(id) {
      const [linha] = await tx.select({
        id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId,
      }).from(pastos).where(eq(pastos.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async travaAnimal(id) {
      const [linha] = await tx.select({
        id: animais.id, userId: animais.userId, fazendaId: animais.fazendaId, loteId: animais.loteId,
        pastoId: animais.pastoId, sexo: animais.sexo, categoria: animais.categoria, status: animais.status,
        dataNascimento: animais.dataNascimento, castrado: animais.castrado, brinco: animais.brinco, nome: animais.nome,
      }).from(animais).where(eq(animais.id, id)).for("update").limit(1);
      return linha ? animalDe(linha) : null;
    },
    async baixaAtiva(userId, animalId) {
      const [linha] = await tx.select({ dataBaixa: animalBaixas.dataBaixa }).from(animalBaixas).where(and(
        eq(animalBaixas.userId, userId),
        eq(animalBaixas.animalId, animalId),
        eq(animalBaixas.status, "ativa"),
      )).for("update").limit(1);
      return linha ?? null;
    },
    async travaRegistros(userId, femeaIds): Promise<RegistroColetivoLinha[]> {
      if (femeaIds.length === 0) return [];
      return tx.select({
        id: reproducaoRegistros.id,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        tipo: reproducaoRegistros.tipo,
        dataCobertura: reproducaoRegistros.dataCobertura,
        observacoes: reproducaoRegistros.observacoes,
        resultado: reproducaoRegistros.resultado,
      }).from(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.userId, userId),
        inArray(reproducaoRegistros.femeaId, femeaIds),
      )).orderBy(asc(reproducaoRegistros.id)).for("update");
    },
    async inserirRegistro(row) {
      const result = await tx.insert(reproducaoRegistros).values({
        userId: row.userId,
        femeaId: row.femeaId,
        machoId: row.machoId,
        tipo: row.tipo,
        dataCobertura: dataMeioDia(row.dataCobertura),
        resultado: row.resultado,
        observacoes: row.observacoes,
      });
      return insertId(result);
    },
    async atualizarObservacoes(id, userId, observacoes) {
      await tx.update(reproducaoRegistros).set({ observacoes }).where(and(
        eq(reproducaoRegistros.id, id),
        eq(reproducaoRegistros.userId, userId),
      ));
    },
    async reservarOperacao(row): Promise<ReservaOperacao> {
      try {
        await tx.insert(reproducaoOperacoes).values({
          userId: row.userId,
          chave: row.chave,
          fazendaId: row.fazendaId,
          executorUserId: row.executorUserId,
          conteudoHash: row.conteudoHash,
          espelhosMatriz: 0,
          matrizesIgnoradas: 0,
        });
        return { situacao: "nova" };
      } catch (error) {
        if (!chaveDuplicada(error)) throw error;
        const [linha] = await tx.select({
          conteudoHash: reproducaoOperacoes.conteudoHash,
          registroPrincipalId: reproducaoOperacoes.registroPrincipalId,
          espelhosMatriz: reproducaoOperacoes.espelhosMatriz,
          matrizesIgnoradas: reproducaoOperacoes.matrizesIgnoradas,
        }).from(reproducaoOperacoes).where(and(
          eq(reproducaoOperacoes.userId, row.userId),
          eq(reproducaoOperacoes.chave, row.chave),
        )).for("update").limit(1);
        if (!linha || linha.registroPrincipalId == null || linha.conteudoHash !== row.conteudoHash) {
          return { situacao: "divergente" };
        }
        return {
          situacao: "repetida",
          registroPrincipalId: linha.registroPrincipalId,
          espelhosMatriz: linha.espelhosMatriz,
          matrizesIgnoradas: linha.matrizesIgnoradas,
        };
      }
    },
    async concluirOperacao(row) {
      const result = await tx.update(reproducaoOperacoes).set({
        registroPrincipalId: row.registroPrincipalId,
        espelhosMatriz: row.espelhosMatriz,
        matrizesIgnoradas: row.matrizesIgnoradas,
      }).where(and(
        eq(reproducaoOperacoes.userId, row.userId),
        eq(reproducaoOperacoes.chave, row.chave),
        isNull(reproducaoOperacoes.registroPrincipalId),
      ));
      if (afetados(result) !== 1) throw new Error("operação reprodutiva não vinculada");
    },
  };
}

export function ioRegistrarReproducaoColetivaDrizzle(): IoColetiva {
  return {
    async emTransacao(fn) {
      return db.transaction(
        async (tx) => fn(consultas(tx as unknown as Executor)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
