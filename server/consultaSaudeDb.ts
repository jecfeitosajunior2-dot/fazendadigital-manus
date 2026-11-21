import { and, desc, eq, inArray } from "drizzle-orm";
import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import {
  animalLoteMovimentacoes,
  animais,
  estoqueMovimentacoes,
  fazendas,
  saudeRegistros,
  users,
  usuarioFazendas,
  usuarioPermissoes,
} from "../drizzle/schema";
import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import type { ConsultaListaSaude, IoListaSaude, PedidoListaSaude } from "./consultaSaudeAutorizada";
import { listarSaudeAutorizada } from "./consultaSaudeAutorizada";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function texto(valor: unknown): string | null {
  return valor == null ? null : String(valor);
}

function consulta(tx: Transacao): ConsultaListaSaude {
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
    async registros(titularUserId, animalId) {
      const filtros = [eq(saudeRegistros.userId, titularUserId)];
      if (animalId != null) filtros.push(eq(saudeRegistros.animalId, animalId));
      const linhas = await tx
        .select({
          id: saudeRegistros.id,
          userId: saudeRegistros.userId,
          animalId: saudeRegistros.animalId,
          tipo: saudeRegistros.tipo,
          descricao: saudeRegistros.descricao,
          medicamento: saudeRegistros.medicamento,
          dosagem: saudeRegistros.dosagem,
          viaAplicacao: saudeRegistros.viaAplicacao,
          estoqueId: saudeRegistros.estoqueId,
          quantidadeConsumo: saudeRegistros.quantidadeConsumo,
          valorUnitario: saudeRegistros.valorUnitario,
          veterinario: saudeRegistros.veterinario,
          custo: saudeRegistros.custo,
          dataRegistro: saudeRegistros.dataRegistro,
          proximaData: saudeRegistros.proximaData,
          observacoes: saudeRegistros.observacoes,
          estoqueMovimentacaoId: saudeRegistros.estoqueMovimentacaoId,
          status: saudeRegistros.status,
          estornadoEm: saudeRegistros.estornadoEm,
          motivoEstorno: saudeRegistros.motivoEstorno,
          createdAt: saudeRegistros.createdAt,
          fazendaDoMovimentoId: estoqueMovimentacoes.fazendaId,
        })
        .from(saudeRegistros)
        .leftJoin(estoqueMovimentacoes, eq(estoqueMovimentacoes.id, saudeRegistros.estoqueMovimentacaoId))
        .where(and(...filtros))
        .orderBy(desc(saudeRegistros.createdAt));
      return linhas.map((linha) => ({
        ...linha,
        quantidadeConsumo: texto(linha.quantidadeConsumo),
        valorUnitario: texto(linha.valorUnitario),
        custo: texto(linha.custo),
        fazendaDoMovimentoId: linha.fazendaDoMovimentoId,
      }));
    },
    async animaisDosRegistros(titularUserId, ids) {
      if (ids.length === 0) return [];
      return tx
        .select({
          id: animais.id,
          userId: animais.userId,
          fazendaId: animais.fazendaId,
          brinco: animais.brinco,
          brincoEletronico: animais.brincoEletronico,
        })
        .from(animais)
        .where(and(eq(animais.userId, titularUserId), inArray(animais.id, ids)));
    },
    async movimentosDosAnimais(titularUserId, ids) {
      if (ids.length === 0) return [];
      const linhas = await tx
        .select({
          animalId: animalLoteMovimentacoes.animalId,
          data: animalLoteMovimentacoes.dataMovimentacao,
          fazendaOrigemId: animalLoteMovimentacoes.fazendaOrigemId,
          fazendaDestinoId: animalLoteMovimentacoes.fazendaId,
        })
        .from(animalLoteMovimentacoes)
        .where(and(
          eq(animalLoteMovimentacoes.userId, titularUserId),
          inArray(animalLoteMovimentacoes.animalId, ids),
        ));
      return linhas;
    },
  };
}

export function listarSaudeNoBanco(pedido: PedidoListaSaude) {
  const io: IoListaSaude = {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consulta(tx)), { isolationLevel: "read committed" });
    },
  };
  return listarSaudeAutorizada(io, pedido);
}
