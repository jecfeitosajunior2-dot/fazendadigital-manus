import { and, eq } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import {
  animalLoteMovimentacoes,
  animais,
  fazendas,
  lotes,
  pastos,
  users,
  usuarioFazendas,
  usuarioPermissoes,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type {
  ConsultaCadastroAnimal,
  IoCadastroAnimal,
  LinhaAnimalAtivo,
  LinhaFazendaCadastro,
  LinhaLoteCadastro,
  LinhaPastoCadastro,
  LinhaUsuarioCadastro,
} from "./cadastroAnimalAutorizado";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function ativo(valor: unknown): boolean {
  return valor !== false && valor !== 0;
}

function consulta(tx: Transacao): ConsultaCadastroAnimal {
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
        .where(and(
          eq(usuarioPermissoes.userId, userId),
          eq(usuarioPermissoes.titularUserId, titularUserId),
        ))
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
    async fazendasDoTitular(titularUserId): Promise<LinhaFazendaCadastro[]> {
      const linhas = await tx
        .select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.userId, titularUserId));
      return linhas;
    },
    async fazenda(id): Promise<LinhaFazendaCadastro | null> {
      const [linha] = await tx
        .select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas)
        .where(eq(fazendas.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async lote(id): Promise<LinhaLoteCadastro | null> {
      const [linha] = await tx
        .select({
          id: lotes.id,
          userId: lotes.userId,
          fazendaId: lotes.fazendaId,
          ativo: lotes.ativo,
        })
        .from(lotes)
        .where(eq(lotes.id, id))
        .for("update")
        .limit(1);
      if (!linha) return null;
      return { id: linha.id, userId: linha.userId, fazendaId: linha.fazendaId, ativo: ativo(linha.ativo) };
    },
    async pasto(id): Promise<LinhaPastoCadastro | null> {
      const [linha] = await tx
        .select({ id: pastos.id, userId: pastos.userId, fazendaId: pastos.fazendaId })
        .from(pastos)
        .where(eq(pastos.id, id))
        .for("update")
        .limit(1);
      return linha ?? null;
    },
    async animaisAtivos(titularUserId): Promise<LinhaAnimalAtivo[]> {
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
      return tx
        .select({ id: lotes.id, fazendaId: lotes.fazendaId })
        .from(lotes)
        .where(eq(lotes.userId, titularUserId));
    },
    async inserirAnimal(row) {
      const result = await tx.insert(animais).values(row);
      const insertedId = Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
      return insertedId;
    },
    async inserirMovimento(row) {
      await tx.insert(animalLoteMovimentacoes).values(row);
    },
  };
}

export function ioCadastroDrizzle(): IoCadastroAnimal {
  return {
    emTransacao(fn) {
      return db.transaction(
        async (tx) => fn(consulta(tx)),
        { isolationLevel: "read committed" },
      );
    },
  };
}
