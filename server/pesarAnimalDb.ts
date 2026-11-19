import { and, eq, isNull } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import { animalBaixas, animais, fazendas, lotes, pastos, pesagens, reproducaoRegistros, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { db } from "./db";
import type { AtualizacaoDesmama, ConsultaPesagemAnimal, IoPesagemAnimal, NovaPesagem } from "./pesarAnimalAutorizado";

type Transacao = MySqlTransaction<any, any, any, any>;

function dataTexto(valor: unknown): string | null {
  if (valor == null || valor === "") return null;
  const texto = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

function consulta(tx: Transacao): ConsultaPesagemAnimal {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linha] = await tx
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          papel: users.papel,
          titularUserId: users.titularUserId,
          situacao: users.situacao,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, id))
        .for("update")
        .limit(1);
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
      const linhas = await tx
        .select({ permissao: usuarioPermissoes.permissao })
        .from(usuarioPermissoes)
        .where(and(eq(usuarioPermissoes.userId, userId), eq(usuarioPermissoes.titularUserId, titularUserId)))
        .for("update");
      return linhas.map((linha) => linha.permissao);
    },
    async vinculos(userId, titularUserId) {
      const linhas = await tx
        .select({ userId: usuarioFazendas.userId, fazendaId: usuarioFazendas.fazendaId })
        .from(usuarioFazendas)
        .innerJoin(users, eq(users.id, usuarioFazendas.userId))
        .where(and(eq(usuarioFazendas.userId, userId), eq(users.titularUserId, titularUserId)))
        .for("update");
      return linhas.map((linha) => ({ userId: linha.userId, fazendaId: linha.fazendaId }));
    },
    async fazendasDoTitular(titularUserId) {
      return tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas).where(eq(fazendas.userId, titularUserId));
    },
    async fazenda(id) {
      const [linha] = await tx
        .select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async lote(id) {
      const [linha] = await tx
        .select({ id: lotes.id, userId: lotes.userId, fazendaId: lotes.fazendaId })
        .from(lotes)
        .where(eq(lotes.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async pasto(id) {
      const [linha] = await tx
        .select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId })
        .from(pastos)
        .where(eq(pastos.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async espiar(id) {
      const [linha] = await tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
          dataDesmama: animais.dataDesmama,
          dataNascimento: animais.dataNascimento,
          pesoAtual: animais.pesoAtual,
          categoria: animais.categoria,
        })
        .from(animais)
        .where(eq(animais.id, id))
        .limit(1);
      if (!linha) return null;
      return {
        ...linha,
        dataDesmama: dataTexto(linha.dataDesmama),
        dataNascimento: dataTexto(linha.dataNascimento),
        pesoAtual: linha.pesoAtual == null ? null : String(linha.pesoAtual),
        categoria: linha.categoria == null ? null : String(linha.categoria),
      };
    },
    async animal(id, titularUserId) {
      const [linha] = await tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
          dataDesmama: animais.dataDesmama,
          dataNascimento: animais.dataNascimento,
          pesoAtual: animais.pesoAtual,
          categoria: animais.categoria,
        })
        .from(animais)
        .where(and(eq(animais.id, id), eq(animais.userId, titularUserId)))
        .for("update")
        .limit(1);
      if (!linha) return null;
      return {
        ...linha,
        dataDesmama: dataTexto(linha.dataDesmama),
        dataNascimento: dataTexto(linha.dataNascimento),
        pesoAtual: linha.pesoAtual == null ? null : String(linha.pesoAtual),
        categoria: linha.categoria == null ? null : String(linha.categoria),
      };
    },
    async baixaAtiva(animalId) {
      const [linha] = await tx
        .select({ dataBaixa: animalBaixas.dataBaixa })
        .from(animalBaixas)
        .where(and(eq(animalBaixas.animalId, animalId), eq(animalBaixas.status, "ativa")))
        .for("update")
        .limit(1);
      if (!linha) return null;
      return { dataBaixa: dataTexto(linha.dataBaixa) };
    },
    async eventosDesmama(animalId, titularUserId) {
      return tx
        .select({ tipo: reproducaoRegistros.tipo })
        .from(reproducaoRegistros)
        .where(and(eq(reproducaoRegistros.userId, titularUserId), eq(reproducaoRegistros.femeaId, animalId)));
    },
    async pesagensDoAnimal(animalId, titularUserId) {
      const linhas = await tx
        .select({
          id: pesagens.id,
          data: pesagens.data,
          peso: pesagens.peso,
          observacoes: pesagens.observacoes,
        })
        .from(pesagens)
        .where(and(eq(pesagens.userId, titularUserId), eq(pesagens.animalId, animalId)));
      return linhas.map((linha) => ({
        id: linha.id,
        data: dataTexto(linha.data),
        peso: linha.peso == null ? null : String(linha.peso),
        observacoes: linha.observacoes,
      }));
    },
    async inserirPesagem(row: NovaPesagem) {
      const insert = await tx.insert(pesagens).values({
        userId: row.userId,
        animalId: row.animalId,
        peso: row.peso,
        data: dataCivilParaColunaDate(row.data),
        observacoes: row.observacoes,
        compraRecebimentoId: null,
      });
      const id = Number((insert as { insertId?: number }[])[0]?.insertId ?? 0);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Falha ao gravar a pesagem.");
      return id;
    },
    async atualizarPeso(id, titularUserId, peso) {
      const result = await tx.update(animais).set({ pesoAtual: peso }).where(and(
        eq(animais.id, id),
        eq(animais.userId, titularUserId),
      ));
      return Number((result as { affectedRows?: number }[])[0]?.affectedRows ?? 0) > 0;
    },
    async atualizarDesmama(id, titularUserId, patch: AtualizacaoDesmama) {
      const result = await tx.update(animais).set({
        dataDesmama: patch.dataDesmama,
        ...(patch.dataNascimento ? { dataNascimento: patch.dataNascimento } : {}),
        ...(patch.pesoAtual ? { pesoAtual: patch.pesoAtual } : {}),
      }).where(and(
        eq(animais.id, id),
        eq(animais.userId, titularUserId),
        eq(animais.status, "ativo"),
        isNull(animais.dataDesmama),
      ));
      return Number((result as { affectedRows?: number }[])[0]?.affectedRows ?? 0) > 0;
    },
    async atualizarObservacaoPesagem(id, animalId, titularUserId, observacoes) {
      await tx.update(pesagens).set({ observacoes }).where(and(
        eq(pesagens.id, id),
        eq(pesagens.animalId, animalId),
        eq(pesagens.userId, titularUserId),
      ));
    },
  };
}

export function ioPesagemDrizzle(): IoPesagemAnimal {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
}
