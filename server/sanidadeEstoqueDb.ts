import { and, eq } from "drizzle-orm";
import {
  animalBaixas,
  animais,
  estoque,
  fazendas,
  lotes,
  pastos,
  saudeRegistros,
  users,
  usuarioFazendas,
  usuarioPermissoes,
} from "../drizzle/schema";
import { db } from "./db";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { ConsultaSanidade, EstoqueSanidadeLinha, IoSanidade } from "./sanidadeEstoqueAutorizado";
import { criarSaudeEstoqueTx } from "./saudeEstoqueMysql";

type Executor = Pick<typeof db, "select" | "insert" | "update">;

function dataTexto(valor: unknown): string | null {
  if (valor == null || valor === "") return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  return String(valor).slice(0, 10);
}

function linhaEstoque(linha: {
  id: number;
  nome: string | null;
  quantidade: string | null;
  unidade: string | null;
  valorUnitario: string | null;
  valorTotalEstoque: string | null;
  capitalInicializadoEm: Date | null;
  fazendaId: number | null;
  categoria: string | null;
  situacao: string | null;
  embalagens: string | null;
}): EstoqueSanidadeLinha {
  return linha;
}

const colunasEstoque = {
  id: estoque.id,
  nome: estoque.nome,
  quantidade: estoque.quantidade,
  unidade: estoque.unidade,
  valorUnitario: estoque.valorUnitario,
  valorTotalEstoque: estoque.valorTotalEstoque,
  capitalInicializadoEm: estoque.capitalInicializadoEm,
  fazendaId: estoque.fazendaId,
  categoria: estoque.categoria,
  situacao: estoque.situacao,
  embalagens: estoque.embalagens,
};

function consultas(tx: Executor): ConsultaSanidade {
  const saude = criarSaudeEstoqueTx(tx);
  return {
    ...saude,
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
    async espiarAnimal(id) {
      const [linha] = await tx.select({
        id: animais.id,
        userId: animais.userId,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        pastoId: animais.pastoId,
        status: animais.status,
      }).from(animais).where(eq(animais.id, id)).limit(1);
      return linha ?? null;
    },
    async animal(id, titularUserId) {
      const [linha] = await tx.select({
        id: animais.id,
        userId: animais.userId,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        pastoId: animais.pastoId,
        status: animais.status,
      }).from(animais).where(and(eq(animais.id, id), eq(animais.userId, titularUserId))).for("update").limit(1);
      return linha ?? null;
    },
    async baixaAtiva(animalId) {
      const [linha] = await tx.select({ dataBaixa: animalBaixas.dataBaixa }).from(animalBaixas).where(and(
        eq(animalBaixas.animalId, animalId),
        eq(animalBaixas.status, "ativa"),
      )).for("update").limit(1);
      if (!linha) return null;
      return { dataBaixa: dataTexto(linha.dataBaixa) };
    },
    async espiarEstoque(id) {
      const [linha] = await tx.select(colunasEstoque).from(estoque).where(eq(estoque.id, id)).limit(1);
      return linha ? linhaEstoque(linha) : null;
    },
    async travarEstoque(id) {
      const [linha] = await tx.select(colunasEstoque).from(estoque).where(eq(estoque.id, id)).for("update").limit(1);
      return linha ? linhaEstoque(linha) : null;
    },
    async espiarRegistro(id) {
      const [linha] = await tx.select({
        id: saudeRegistros.id,
        userId: saudeRegistros.userId,
        animalId: saudeRegistros.animalId,
        estoqueId: saudeRegistros.estoqueId,
        status: saudeRegistros.status,
      }).from(saudeRegistros).where(eq(saudeRegistros.id, id)).limit(1);
      return linha ?? null;
    },
    async travarRegistro(id) {
      await tx.select({ id: saudeRegistros.id }).from(saudeRegistros).where(eq(saudeRegistros.id, id)).for("update").limit(1);
    },
  };
}

export function ioSanidadeDrizzle(): IoSanidade {
  return {
    async emTransacao(fn) {
      return db.transaction(
        async (tx) => fn(consultas(tx as unknown as Executor)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
