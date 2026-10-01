import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoDietasService } from "./nutricaoDietas";
import { NUTRICAO_DIETA_STATUS } from "../shared/nutricaoDietas";

const ingredienteInput = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().positive(),
});

const dietaInput = z.object({
  fazendaId: z.number().int().positive(),
  nome: z.string().min(1).max(100),
  tipo: z.string().min(1),
  descricao: z.string().max(2000).optional().nullable(),
  categoriaAnimal: z.string().max(50).optional().nullable(),
  objetivo: z.string().max(40).optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFim: z.string().optional().nullable(),
  baseQuantidade: z.number().positive(),
  ingredientes: z.array(ingredienteInput).min(1),
});

export const nutricaoDietasRouter = router({
  list: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      status: z.enum(NUTRICAO_DIETA_STATUS).optional(),
      search: z.string().optional(),
    }))
    .query(({ ctx, input }) => nutricaoDietasService.listar(ctx.user.id, input)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoDietasService.obter(ctx.user.id, input.id)),

  listProdutosFormulacao: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      nutricaoDietasService.listarProdutosFormulacao(ctx.user.id, input.fazendaId),
    ),

  create: protectedProcedure
    .input(dietaInput)
    .mutation(({ ctx, input }) => nutricaoDietasService.criar(ctx.user.id, input)),

  update: protectedProcedure
    .input(dietaInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return nutricaoDietasService.editar(ctx.user.id, id, rest);
    }),

  inativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoDietasService.inativar(ctx.user.id, input.id)),

  reativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoDietasService.reativar(ctx.user.id, input.id)),
});
