import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoDietasService } from "./nutricaoDietas";
import type { SessaoNutricao } from "./nutricaoOperacaoAutorizada";
import { NUTRICAO_DIETA_FORMAS_USO, NUTRICAO_DIETA_STATUS } from "../shared/nutricaoDietas";

function sessaoDe(user: { id: number; sessionVersion?: number | null }, permissaoId: SessaoNutricao["permissaoId"]): SessaoNutricao {
  return {
    executorId: user.id,
    sessionVersionDaSessao: user.sessionVersion ?? null,
    permissaoId,
  };
}

const ingredienteInput = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().positive(),
});

const dietaInput = z.object({
  fazendaId: z.number().int().positive(),
  nome: z.string().min(1).max(100),
  tipo: z.string().min(1),
  formaUso: z.enum(NUTRICAO_DIETA_FORMAS_USO.map(f => f.value) as [string, ...string[]]),
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
    .query(({ ctx, input }) => nutricaoDietasService.listar(ctx.user.id, input, sessaoDe(ctx.user, "nutricao.visualizar"))),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoDietasService.obter(ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.visualizar"))),

  listProdutosFormulacao: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      nutricaoDietasService.listarProdutosFormulacao(ctx.user.id, input.fazendaId, sessaoDe(ctx.user, "nutricao.visualizar")),
    ),

  create: protectedProcedure
    .input(dietaInput)
    .mutation(({ ctx, input }) => nutricaoDietasService.criar(ctx.user.id, input, sessaoDe(ctx.user, "nutricao.criar"))),

  update: protectedProcedure
    .input(dietaInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return nutricaoDietasService.editar(ctx.user.id, id, rest, sessaoDe(ctx.user, "nutricao.editar"));
    }),

  inativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoDietasService.inativar(ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.inativar"))),

  reativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoDietasService.reativar(ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.inativar"))),
});
