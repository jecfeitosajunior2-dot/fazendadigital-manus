import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoVisaoGeralService } from "./nutricaoVisaoGeral";
import type { SessaoNutricao } from "./nutricaoOperacaoAutorizada";

function sessaoDe(user: { id: number; sessionVersion?: number | null }, permissaoId: SessaoNutricao["permissaoId"]): SessaoNutricao {
  return {
    executorId: user.id,
    sessionVersionDaSessao: user.sessionVersion ?? null,
    permissaoId,
  };
}

export const nutricaoVisaoGeralRouter = router({
  carregar: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      loteId: z.number().int().positive().nullable().optional(),
    }))
    .query(({ ctx, input }) => nutricaoVisaoGeralService.carregar(
      ctx.user.id,
      input,
      undefined,
      sessaoDe(ctx.user, "nutricao.visualizar"),
    )),
});
