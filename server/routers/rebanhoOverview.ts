import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  animais, lotes, pastos, pesagens, saudeRegistros, estoque,
} from "../../drizzle/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import z from "zod";
import { isDatabaseUnavailable, buildLocalRebanhoOverview } from "../localFallbackStore";
import { buildFimCarenciaPorAnimal } from "../../shared/carenciaAnimal";
import { filterAnimaisPorFazenda, loadLoteFazendaContextForUser } from "../animaisPorFazenda";
import { computeRebanhoOverview } from "../rebanhoOverviewCompute";

export const rebanhoOverviewRouter = router({
  overview: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.user.id;
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const conditions: ReturnType<typeof eq>[] = [
          eq(animais.userId, userId),
          eq(animais.status, "ativo"),
        ];
        let lista = await db.select().from(animais).where(and(...conditions));
        if (input?.fazendaId) {
          const { loteFazendaById } = await loadLoteFazendaContextForUser(userId);
          lista = filterAnimaisPorFazenda(lista, input.fazendaId, loteFazendaById);
        }

        const animalIds = lista.map(a => a.id);
        const loteIds = [...new Set(lista.map(a => a.loteId).filter(Boolean) as number[])];

        const todasPesagens = animalIds.length
          ? await db.select()
              .from(pesagens)
              .where(and(eq(pesagens.userId, userId), inArray(pesagens.animalId, animalIds)))
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
            })
              .from(saudeRegistros)
              .where(and(eq(saudeRegistros.userId, userId), inArray(saudeRegistros.animalId, animalIds)))
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
          ? await db.select({
              id: lotes.id,
              nome: lotes.nome,
              pastoAtualId: lotes.pastoAtualId,
            })
              .from(lotes)
              .where(inArray(lotes.id, loteIds))
          : [];

        const pastoIdsSuperlot = [...new Set(
          lotesRows.map(l => l.pastoAtualId).filter(Boolean) as number[],
        )];
        const pastosCapacidade = pastoIdsSuperlot.length
          ? await db.select({ id: pastos.id, capacidade: pastos.capacidade })
              .from(pastos)
              .where(inArray(pastos.id, pastoIdsSuperlot))
          : [];
        const pastoCapacidadeMap = new Map<number, number | null>(
          pastosCapacidade.map(p => [p.id, p.capacidade ?? null]),
        );

        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const inicioMesStr = inicioMes.toISOString().slice(0, 10);
        const saidas = await db.select({ count: sql<number>`count(*)` })
          .from(animais)
          .where(and(
            eq(animais.userId, userId),
            sql`status IN ('vendido','morto','transferido')`,
            sql`updatedAt >= ${inicioMesStr}`,
          ));
        const saidasCount = Number(saidas[0]?.count ?? 0);

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
          saidasCount,
          hoje,
        });
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          return buildLocalRebanhoOverview(ctx.user.id, input?.fazendaId);
        }
        throw err;
      }
    }),
});
