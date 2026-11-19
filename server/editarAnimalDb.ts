import { and, eq, or } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import { animais, fazendas, lotes, reproducaoRegistros, saudeRegistros, users, usuarioFazendas, usuarioPermissoes } from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { evidenciasDe, type AnimalParaEdicao, type ConsultaEdicaoAnimal, type IoEdicaoAnimal } from "./editarAnimalAutorizado";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function consulta(tx: Transacao): ConsultaEdicaoAnimal {
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
    async animal(id): Promise<AnimalParaEdicao | null> {
      const [linha] = await tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
          status: animais.status,
          sexo: animais.sexo,
          castrado: animais.castrado,
          brinco: animais.brinco,
          brincoEletronico: animais.brincoEletronico,
          pesoAtual: animais.pesoAtual,
          dataDesmama: animais.dataDesmama,
          maeId: animais.maeId,
          paiId: animais.paiId,
        })
        .from(animais)
        .where(eq(animais.id, id))
        .for("update")
        .limit(1);
      if (!linha || (linha.sexo !== "macho" && linha.sexo !== "femea")) return null;
      return {
        id: linha.id,
        userId: linha.userId,
        fazendaId: linha.fazendaId,
        loteId: linha.loteId,
        pastoId: linha.pastoId,
        status: linha.status,
        sexo: linha.sexo,
        castrado: linha.castrado,
        brinco: linha.brinco,
        brincoEletronico: linha.brincoEletronico,
        pesoAtual: linha.pesoAtual == null ? null : String(linha.pesoAtual),
        dataDesmama: linha.dataDesmama,
        maeId: linha.maeId,
        paiId: linha.paiId,
      };
    },
    async loteFazenda(loteId, titularUserId) {
      const [linha] = await tx
        .select({ fazendaId: lotes.fazendaId })
        .from(lotes)
        .where(and(eq(lotes.id, loteId), eq(lotes.userId, titularUserId)))
        .for("update")
        .limit(1);
      return linha?.fazendaId ?? null;
    },
    async animaisAtivos(titularUserId) {
      return tx
        .select({
          id: animais.id,
          brinco: animais.brinco,
          brincoEletronico: animais.brincoEletronico,
          status: animais.status,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
        })
        .from(animais)
        .where(and(eq(animais.userId, titularUserId), eq(animais.status, "ativo")));
    },
    async lotesDoTitular(titularUserId) {
      return tx.select({ id: lotes.id, fazendaId: lotes.fazendaId }).from(lotes).where(eq(lotes.userId, titularUserId));
    },
    async evidenciasSexo(titularUserId, animalId, castradoAtual) {
      const saude = await tx.select({ tipo: saudeRegistros.tipo }).from(saudeRegistros).where(and(
        eq(saudeRegistros.userId, titularUserId),
        eq(saudeRegistros.animalId, animalId),
      ));
      const comoPai = await tx.select({ id: animais.id }).from(animais).where(and(
        eq(animais.userId, titularUserId),
        eq(animais.paiId, animalId),
      )).limit(1);
      const comoMae = await tx.select({ id: animais.id }).from(animais).where(and(
        eq(animais.userId, titularUserId),
        eq(animais.maeId, animalId),
      )).limit(1);
      const repro = await tx.select({
        tipo: reproducaoRegistros.tipo,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        observacoes: reproducaoRegistros.observacoes,
      }).from(reproducaoRegistros).where(and(
        eq(reproducaoRegistros.userId, titularUserId),
        or(
          eq(reproducaoRegistros.femeaId, animalId),
          eq(reproducaoRegistros.machoId, animalId),
          eq(reproducaoRegistros.tipo, "Cobertura realizada"),
        ),
      ));
      return evidenciasDe({
        animalId,
        castradoAtual,
        saudeTipos: saude.map((linha) => linha.tipo),
        descendentes: [
          ...(comoPai.length > 0 ? [{ paiId: animalId }] : []),
          ...(comoMae.length > 0 ? [{ maeId: animalId }] : []),
        ],
        reproRegistros: repro,
      });
    },
    async atualizarAnimal(id, titularUserId, patch) {
      await tx.update(animais).set(patch).where(and(eq(animais.id, id), eq(animais.userId, titularUserId)));
    },
  };
}

export function ioEditarAnimalDrizzle(): IoEdicaoAnimal {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
}
