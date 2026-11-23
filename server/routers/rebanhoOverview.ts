import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import {
  animais, animalBaixas, lotes, pastos, pesagens, saudeRegistros, estoque,
} from "../../drizzle/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import z from "zod";
import { buildFimCarenciaPorAnimal } from "../../shared/carenciaAnimal";
import { computeRebanhoOverview } from "../rebanhoOverviewCompute";
import { loginPermitido } from "../_core/identidadeSessao";
import { montarAcesso } from "../acessoFazendas";
import { consultaEstoqueNaTransacao } from "../consultaEstoqueDb";

export const MSG_REBANHO_SEM_MYSQL =
  "A visão do rebanho precisa do banco. Nada foi completado com o arquivo local.";

function textoErro(erro: unknown) {
  return erro instanceof Error
    ? `${erro.message} ${String((erro as { code?: string }).code ?? "")}`
    : String(erro);
}

export const rebanhoOverviewRouter = router({
  overview: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const escopo = await db.transaction(async (tx) => {
          const consulta = consultaEstoqueNaTransacao(tx);
          const usuario = await consulta.usuario(ctx.user.id);
          if (!usuario || !loginPermitido(usuario.situacao) || usuario.titularUserId == null) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
          }
          if (ctx.user.sessionVersion != null && ctx.user.sessionVersion !== usuario.sessionVersion) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
          }
          const titular = Number(usuario.titularUserId);
          const permissoes = await consulta.permissoes(usuario.id, titular);
          const principal = usuario.papel === "principal" && usuario.id === titular;
          if (!principal && !permissoes.includes("animais.visualizar")) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para consultar o rebanho." });
          }
          const fazendasDoTitular = await consulta.fazendasDoTitular(titular);
          const vinculos = await consulta.vinculos(usuario.id, titular);
          const acesso = montarAcesso({
            identidade: {
              id: usuario.id,
              openId: usuario.openId,
              name: usuario.name,
              email: usuario.email,
              role: usuario.role,
              papel: usuario.papel,
              titularUserId: titular,
              situacao: usuario.situacao,
              sessionVersion: usuario.sessionVersion,
            },
            fazendasDoTitular,
            vinculos,
          });
          if (!acesso) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
          let fazendasIds = acesso.papel === "principal"
            ? fazendasDoTitular.map((row) => row.id)
            : acesso.fazendasAutorizadas;
          if (input?.fazendaId != null) {
            if (!fazendasIds.includes(input.fazendaId)) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Fazenda não encontrada." });
            }
            fazendasIds = [input.fazendaId];
          }
          return { titular, fazendasIds };
        }, { isolationLevel: "read committed" });

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const lista = escopo.fazendasIds.length
          ? await db.select().from(animais).where(and(
            eq(animais.userId, escopo.titular),
            eq(animais.status, "ativo"),
            inArray(animais.fazendaId, escopo.fazendasIds),
          ))
          : [];

        const animalIds = lista.map(a => a.id);
        const loteIds = [...new Set(lista.map(a => a.loteId).filter(Boolean) as number[])];
        const todasPesagens = animalIds.length
          ? await db.select().from(pesagens)
            .where(and(eq(pesagens.userId, escopo.titular), inArray(pesagens.animalId, animalIds)))
            .orderBy(pesagens.animalId, pesagens.data)
          : [];
        const pesagensPorAnimal = new Map<number, typeof todasPesagens>();
        for (const p of todasPesagens) {
          if (!pesagensPorAnimal.has(p.animalId)) pesagensPorAnimal.set(p.animalId, []);
          pesagensPorAnimal.get(p.animalId)!.push(p);
        }
        const saudeAll = animalIds.length
          ? await db.select({
            animalId: saudeRegistros.animalId,
            medicamento: saudeRegistros.medicamento,
            dataRegistro: saudeRegistros.dataRegistro,
            proximaData: saudeRegistros.proximaData,
          }).from(saudeRegistros)
            .where(and(eq(saudeRegistros.userId, escopo.titular), inArray(saudeRegistros.animalId, animalIds)))
            .orderBy(desc(saudeRegistros.dataRegistro))
          : [];
        const medicamentosCarencia = await db.select({
          nome: estoque.nome,
          carenciaAbateDias: estoque.carenciaAbateDias,
        }).from(estoque).where(eq(estoque.possuiCarencia, true));
        const medCarenciaMap = new Map(
          medicamentosCarencia.map(m => [m.nome.toLowerCase().trim(), m.carenciaAbateDias || 0]),
        );
        const fimCarenciaPorAnimal = buildFimCarenciaPorAnimal(saudeAll, medCarenciaMap, hoje);
        const lotesRows = loteIds.length
          ? await db.select({ id: lotes.id, nome: lotes.nome, pastoAtualId: lotes.pastoAtualId })
            .from(lotes)
            .where(and(eq(lotes.userId, escopo.titular), inArray(lotes.id, loteIds)))
          : [];
        const pastoIdsSuperlot = [...new Set(lotesRows.map(l => l.pastoAtualId).filter(Boolean) as number[])];
        const pastosCapacidade = pastoIdsSuperlot.length
          ? await db.select({ id: pastos.id, capacidade: pastos.capacidade })
            .from(pastos)
            .where(and(eq(pastos.userId, escopo.titular), inArray(pastos.id, pastoIdsSuperlot)))
          : [];
        const pastoCapacidadeMap = new Map<number, number | null>(
          pastosCapacidade.map(p => [p.id, p.capacidade ?? null]),
        );
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const inicioMesStr = inicioMes.toISOString().slice(0, 10);
        const saidas = escopo.fazendasIds.length
          ? await db.select({ count: sql<number>`count(*)` }).from(animalBaixas).where(and(
            eq(animalBaixas.userId, escopo.titular),
            sql`${animalBaixas.dataBaixa} >= ${inicioMesStr}`,
            inArray(animalBaixas.fazendaId, escopo.fazendasIds),
          ))
          : [{ count: 0 }];
        return computeRebanhoOverview({
          lista: lista.map(a => ({
            id: a.id,
            brinco: a.brinco,
            categoria: a.categoria,
            sexo: a.sexo,
            raca: a.raca,
            loteId: a.loteId,
            dataNascimento: a.dataNascimento,
            dataEntrada: a.dataEntrada,
            pesoAtual: a.pesoAtual,
          })),
          pesagensPorAnimal,
          emCarenciaAnimalIds: new Set(fimCarenciaPorAnimal.keys()),
          lotesRows,
          pastoCapacidadeMap,
          saidasCount: Number(saidas[0]?.count ?? 0),
          hoje,
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(textoErro(err))) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_REBANHO_SEM_MYSQL });
        }
        throw err;
      }
    }),
});
