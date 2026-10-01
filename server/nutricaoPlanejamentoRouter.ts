import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoPlanejamentoService } from "./nutricaoPlanejamento";
import { NUTRICAO_PLAN_SITUACOES } from "../shared/nutricaoPlanejamento";

const planejamentoInput = z.object({
  fazendaId: z.number().int().positive(),
  loteId: z.number().int().positive(),
  tipoOrigem: z.enum(["produto", "dieta"]),
  produtoId: z.number().int().positive().nullable().optional(),
  dietaId: z.number().int().positive().nullable().optional(),
  modalidadeMeta: z.enum(["g_cab_dia", "kg_cab_dia", "pct_pv_dia", "ad_libitum"]),
  valorMeta: z.number().positive().nullable().optional(),
  frequencia: z.enum(["diaria", "dias_semana", "a_cada_x_dias", "conforme_necessidade"]),
  tratosPorDia: z.number().int().positive().nullable().optional(),
  frequenciaIntervaloDias: z.number().int().positive().nullable().optional(),
  frequenciaDiasSemana: z.array(z.number().int().min(1).max(7)).nullable().optional(),
  nome: z.string().max(100).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const nutricaoPlanejamentoRouter = router({
  list: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      loteId: z.number().int().positive().optional(),
      situacao: z.enum(NUTRICAO_PLAN_SITUACOES).optional(),
      search: z.string().optional(),
    }))
    .query(({ ctx, input }) => nutricaoPlanejamentoService.listar(ctx.user.id, input)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoPlanejamentoService.obter(ctx.user.id, input.id)),

  listLotes: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoPlanejamentoService.listarLotes(ctx.user.id, input.fazendaId)),

  listProdutos: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoPlanejamentoService.listarProdutos(ctx.user.id, input.fazendaId)),

  listDietas: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoPlanejamentoService.listarDietas(ctx.user.id, input.fazendaId)),

  preview: protectedProcedure
    .input(planejamentoInput)
    .query(({ ctx, input }) => nutricaoPlanejamentoService.preview(ctx.user.id, input)),

  create: protectedProcedure
    .input(planejamentoInput)
    .mutation(({ ctx, input }) => nutricaoPlanejamentoService.criar(ctx.user.id, input)),

  update: protectedProcedure
    .input(planejamentoInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return nutricaoPlanejamentoService.editar(ctx.user.id, id, rest);
    }),

  substituir: protectedProcedure
    .input(planejamentoInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return nutricaoPlanejamentoService.substituir(ctx.user.id, id, rest);
    }),

  encerrar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoPlanejamentoService.encerrar(ctx.user.id, input.id)),

  cancelar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoPlanejamentoService.cancelar(ctx.user.id, input.id)),
});
