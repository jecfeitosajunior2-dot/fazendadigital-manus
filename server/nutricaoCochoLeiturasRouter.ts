import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoCochoLeiturasService } from "./nutricaoCochoLeituras";
import type { SessaoNutricao } from "./nutricaoOperacaoAutorizada";

function sessaoDe(user: { id: number; sessionVersion?: number | null }, permissaoId: SessaoNutricao["permissaoId"]): SessaoNutricao {
  return {
    executorId: user.id,
    sessionVersionDaSessao: user.sessionVersion ?? null,
    permissaoId,
  };
}

const leituraInput = z.object({
  fazendaId: z.number().int().positive(),
  cochoId: z.number().int().positive(),
  loteId: z.number().int().positive().nullable().optional(),
  fornecimentoId: z.number().int().positive().nullable().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  sobraKg: z.number().min(0).nullable().optional(),
  escore: z.string().max(40).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

export const nutricaoCochoLeiturasRouter = router({
  list: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      cochoId: z.number().int().positive().optional(),
      loteId: z.number().int().positive().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(({ ctx, input }) => nutricaoCochoLeiturasService.listar(
      ctx.user.id, input, sessaoDe(ctx.user, "nutricao.visualizar"),
    )),

  listPorCocho: protectedProcedure
    .input(z.object({ cochoId: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoCochoLeiturasService.listarPorCocho(
      ctx.user.id, input.cochoId, sessaoDe(ctx.user, "nutricao.visualizar"),
    )),

  listFornecimentosRef: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      cochoId: z.number().int().positive(),
    }))
    .query(({ ctx, input }) =>
      nutricaoCochoLeiturasService.listarFornecimentosRef(
        ctx.user.id, input.fazendaId, input.cochoId, sessaoDe(ctx.user, "nutricao.visualizar"),
      ),
    ),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoCochoLeiturasService.obter(
      ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.visualizar"),
    )),

  preview: protectedProcedure
    .input(leituraInput.extend({ novaLeitura: z.boolean().optional() }))
    .query(({ ctx, input }) => {
      const { novaLeitura, ...rest } = input;
      return nutricaoCochoLeiturasService.preview(
        ctx.user.id, rest, undefined, novaLeitura !== false, sessaoDe(ctx.user, "nutricao.visualizar"),
      );
    }),

  create: protectedProcedure
    .input(leituraInput.extend({ chaveOperacao: z.string().min(8).max(80) }))
    .mutation(({ ctx, input }) => nutricaoCochoLeiturasService.criar(
      ctx.user.id, input, undefined, sessaoDe(ctx.user, "nutricao.criar"),
    )),

  update: protectedProcedure
    .input(leituraInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return nutricaoCochoLeiturasService.editar(
        ctx.user.id, id, rest, undefined, sessaoDe(ctx.user, "nutricao.editar"),
      );
    }),

  cancelar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoCochoLeiturasService.cancelar(
      ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.cancelar"),
    )),
});
