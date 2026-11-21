import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  animalBaixas,
  animalLoteMovimentacoes,
  animais,
  fazendas,
  lotes,
  partoCrias,
  pastos,
  pesagens,
  reproducaoRegistros,
  usuarioFazendas,
  usuarioPermissoes,
  users,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { db } from "./db";
import type { AnimalPartoLinha, ConsultaParto, IoParto, RegistroPartoLinha } from "./registrarPartoAutorizado";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "transaction">;

function insertId(resultado: unknown): number {
  const pacote = resultado as { insertId?: number }[] | { insertId?: number };
  const id = Array.isArray(pacote) ? pacote[0]?.insertId : pacote.insertId;
  return Number(id ?? 0);
}

function mapAnimal(linha: {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  sexo: string | null;
  categoria: string | null;
  status: string | null;
  dataNascimento: string | Date | null;
  castrado: boolean | null;
}): AnimalPartoLinha {
  return {
    id: linha.id,
    userId: linha.userId,
    fazendaId: linha.fazendaId,
    loteId: linha.loteId,
    pastoId: linha.pastoId,
    sexo: linha.sexo,
    categoria: linha.categoria,
    status: linha.status,
    dataNascimento: linha.dataNascimento,
    castrado: linha.castrado,
  };
}

const colunasAnimal = {
  id: animais.id,
  userId: animais.userId,
  fazendaId: animais.fazendaId,
  loteId: animais.loteId,
  pastoId: animais.pastoId,
  sexo: animais.sexo,
  categoria: animais.categoria,
  status: animais.status,
  dataNascimento: animais.dataNascimento,
  castrado: animais.castrado,
};

function consultas(tx: Executor): ConsultaParto {
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
    async espiarAnimal(id) {
      const [linha] = await tx.select(colunasAnimal).from(animais).where(eq(animais.id, id)).limit(1);
      return linha ? mapAnimal(linha) : null;
    },
    async espiarRegistros(userId, femeaId) {
      const linhas = await tx.select({
        id: reproducaoRegistros.id,
        tipo: reproducaoRegistros.tipo,
        machoId: reproducaoRegistros.machoId,
        dataCobertura: reproducaoRegistros.dataCobertura,
        resultado: reproducaoRegistros.resultado,
        createdAt: reproducaoRegistros.createdAt,
      }).from(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.femeaId, femeaId),
      )).orderBy(asc(reproducaoRegistros.id));
      return linhas as RegistroPartoLinha[];
    },
    async travaLote(id) {
      const [linha] = await tx.select({ id: lotes.id, userId: lotes.userId, fazendaId: lotes.fazendaId })
        .from(lotes).where(eq(lotes.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async travaPasto(id) {
      const [linha] = await tx.select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId })
        .from(pastos).where(eq(pastos.id, id)).for("update").limit(1);
      return linha ?? null;
    },
    async travaAnimal(id) {
      const [linha] = await tx.select(colunasAnimal).from(animais).where(eq(animais.id, id)).for("update").limit(1);
      return linha ? mapAnimal(linha) : null;
    },
    async travaRegistros(userId, femeaId) {
      const linhas = await tx.select({
        id: reproducaoRegistros.id,
        tipo: reproducaoRegistros.tipo,
        machoId: reproducaoRegistros.machoId,
        dataCobertura: reproducaoRegistros.dataCobertura,
        resultado: reproducaoRegistros.resultado,
        createdAt: reproducaoRegistros.createdAt,
      }).from(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.femeaId, femeaId),
      )).orderBy(asc(reproducaoRegistros.id)).for("update");
      return linhas as RegistroPartoLinha[];
    },
    async baixaAtiva(userId, animalId) {
      const [linha] = await tx.select({ dataBaixa: animalBaixas.dataBaixa }).from(animalBaixas).where(and(
        eq(animalBaixas.userId, userId),
        eq(animalBaixas.animalId, animalId),
        eq(animalBaixas.status, "ativa"),
      )).for("update").limit(1);
      return linha ?? null;
    },
    async brincoAtivo(userId, fazendaId, brinco) {
      const chave = brinco.trim().toLowerCase();
      const [linha] = await tx.select({ id: animais.id }).from(animais).where(and(
        eq(animais.userId, userId),
        eq(animais.status, "ativo"),
        sql`LOWER(TRIM(${animais.brinco})) = ${chave}`,
        or(eq(animais.fazendaId, fazendaId), isNull(animais.fazendaId)),
      )).for("update").limit(1);
      return linha ?? null;
    },
    async rfidAtivo(userId, rfid) {
      const [linha] = await tx.select({ id: animais.id }).from(animais).where(and(
        eq(animais.userId, userId),
        eq(animais.status, "ativo"),
        sql`TRIM(${animais.brincoEletronico}) = ${rfid}`,
      )).for("update").limit(1);
      return linha ?? null;
    },
    async inserirParto(row) {
      const resultado = await tx.insert(reproducaoRegistros).values({
        userId: row.userId,
        femeaId: row.femeaId,
        machoId: row.machoId,
        tipo: "Parto",
        resultado: row.resultado,
        observacoes: row.observacoes,
        dataCobertura: new Date(`${row.dataCobertura}T12:00:00`),
      });
      return insertId(resultado);
    },
    async fecharPrevisoes(userId, femeaId, dataParto) {
      await tx.update(reproducaoRegistros).set({
        dataPartoReal: new Date(`${dataParto}T12:00:00`),
      }).where(and(
        eq(reproducaoRegistros.userId, userId),
        eq(reproducaoRegistros.femeaId, femeaId),
        isNotNull(reproducaoRegistros.dataPrevistoParto),
        isNull(reproducaoRegistros.dataPartoReal),
      ));
    },
    async inserirAnimal(row) {
      const resultado = await tx.insert(animais).values({
        userId: row.userId,
        brinco: row.brinco,
        brincoEletronico: row.brincoEletronico,
        nome: row.nome,
        raca: row.raca,
        sexo: row.sexo,
        dataNascimento: row.dataNascimento,
        pesoAtual: row.pesoAtual,
        categoria: row.categoria,
        loteId: row.loteId,
        pastoId: row.pastoId,
        fazendaId: row.fazendaId,
        maeId: row.maeId,
        paiId: row.paiId,
        status: "ativo",
        rastreadoNascimento: true,
      });
      return insertId(resultado);
    },
    async inserirMovimento(row) {
      await tx.insert(animalLoteMovimentacoes).values(row);
    },
    async inserirVinculo(row) {
      await tx.insert(partoCrias).values(row);
    },
    async inserirPesagem(row) {
      const resultado = await tx.insert(pesagens).values({
        userId: row.userId,
        animalId: row.animalId,
        peso: row.peso,
        data: row.data,
        observacoes: "Peso ao nascimento",
      });
      return insertId(resultado);
    },
  };
}

export function ioRegistrarPartoDrizzle(): IoParto {
  return {
    emTransacao(fn) {
      return db.transaction((tx) => fn(consultas(tx as unknown as Executor)), { isolationLevel: "read committed" });
    },
  };
}
