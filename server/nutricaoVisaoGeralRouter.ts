import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoVisaoGeralService } from "./nutricaoVisaoGeral";

export const nutricaoVisaoGeralRouter = router({
  carregar: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      loteId: z.number().int().positive().nullable().optional(),
    }))
    .query(({ ctx, input }) => nutricaoVisaoGeralService.carregar(ctx.user.id, input)),
});
