import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoCochosService } from "./nutricaoCochos";
import type { SessaoNutricao } from "./nutricaoOperacaoAutorizada";
import { NUTRICAO_COCHO_STATUS, NUTRICAO_COCHO_TIPOS } from "../shared/nutricaoCochos";

function sessaoDe(user: { id: number; sessionVersion?: number | null }, permissaoId: SessaoNutricao["permissaoId"]): SessaoNutricao {
  return {
    executorId: user.id,
    sessionVersionDaSessao: user.sessionVersion ?? null,
    permissaoId,
  };
}

const tipos = NUTRICAO_COCHO_TIPOS.map(t => t.value) as [string, ...string[]];

const cochoInput = z.object({
  fazendaId: z.number().int().positive(),
  nome: z.string().min(1).max(100),
  codigo: z.string().max(30).nullable().optional(),
  tipo: z.enum(tipos as ["mineral", "suplementacao", "racao_dieta", "creep_feeding", "outro"]),
  pastoId: z.number().int().positive().nullable().optional(),
  localizacaoDescricao: z.string().max(200).nullable().optional(),
  comprimentoMetros: z.number().positive().nullable().optional(),
  larguraMetros: z.number().positive().nullable().optional(),
  capacidadeKg: z.number().positive().nullable().optional(),
  ladosAcesso: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
  coberto: z.boolean().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

export const nutricaoCochosRouter = router({
  list: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      tipo: z.enum(tipos as ["mineral", "suplementacao", "racao_dieta", "creep_feeding", "outro"]).optional(),
      status: z.enum(NUTRICAO_COCHO_STATUS).optional(),
      search: z.string().optional(),
    }))
    .query(({ ctx, input }) => nutricaoCochosService.listar(ctx.user.id, input, sessaoDe(ctx.user, "nutricao.visualizar"))),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoCochosService.obter(ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.visualizar"))),

  listPastos: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoCochosService.listarPastos(ctx.user.id, input.fazendaId, sessaoDe(ctx.user, "nutricao.visualizar"))),

  create: protectedProcedure
    .input(cochoInput)
    .mutation(({ ctx, input }) => nutricaoCochosService.criar(ctx.user.id, input, sessaoDe(ctx.user, "nutricao.criar"))),

  update: protectedProcedure
    .input(cochoInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return nutricaoCochosService.editar(ctx.user.id, id, rest, sessaoDe(ctx.user, "nutricao.editar"));
    }),

  inativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoCochosService.inativar(ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.inativar"))),

  reativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => nutricaoCochosService.reativar(ctx.user.id, input.id, sessaoDe(ctx.user, "nutricao.inativar"))),
});
