import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { financeiroNucleoService } from "./financeiroNucleo";
import { FINANCEIRO_CONTA_TIPOS, FINANCEIRO_TITULO_TIPOS } from "../shared/financeiroNucleo";

const alocacaoInput = z.object({
  parcelaId: z.number().int().positive(),
  principalLiquidado: z.number().nonnegative(),
  desconto: z.number().nonnegative().optional(),
  juros: z.number().nonnegative().optional(),
  multa: z.number().nonnegative().optional(),
});

const parcelaInput = z.object({
  numero: z.number().int().positive(),
  vencimento: z.string().min(8),
  valorOriginal: z.number().positive(),
});

export const financeiroV2Router = router({
  contasList: protectedProcedure.query(({ ctx }) =>
    financeiroNucleoService.listarContas(ctx.user.id),
  ),

  contasGet: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => financeiroNucleoService.obterConta(ctx.user.id, input.id)),

  contasCreate: protectedProcedure
    .input(z.object({
      nome: z.string().min(1).max(120),
      tipo: z.enum(FINANCEIRO_CONTA_TIPOS),
      banco: z.string().max(100).optional().nullable(),
      agencia: z.string().max(20).optional().nullable(),
      numeroConta: z.string().max(30).optional().nullable(),
      saldoAbertura: z.number().nonnegative(),
      dataSaldoAbertura: z.string().min(8),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarContaFinanceira(ctx.user.id, input)),

  contasInativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), motivo: z.string().max(255).optional() }))
    .mutation(({ ctx, input }) => financeiroNucleoService.inativarConta(ctx.user.id, input.id, input.motivo)),

  titulosList: protectedProcedure.query(({ ctx }) =>
    financeiroNucleoService.listarTitulos(ctx.user.id),
  ),

  titulosGet: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => financeiroNucleoService.detalheTitulo(ctx.user.id, input.id)),

  titulosCreateManual: protectedProcedure
    .input(z.object({
      tipo: z.enum(FINANCEIRO_TITULO_TIPOS),
      pessoaId: z.number().int().positive(),
      descricao: z.string().min(1).max(255),
      dataCompetencia: z.string().min(8),
      valorOriginal: z.number().positive(),
      documentoReferencia: z.string().max(80).optional().nullable(),
      observacoes: z.string().optional().nullable(),
      fazendaOrigemId: z.number().int().positive().optional().nullable(),
      parcelas: z.array(parcelaInput).optional(),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarTitulo(ctx.user.id, {
      ...input,
      origemTipo: "manual",
    })),

  titulosDefinirParcelas: protectedProcedure
    .input(z.object({
      tituloId: z.number().int().positive(),
      parcelas: z.array(parcelaInput).min(1),
    }))
    .mutation(({ ctx, input }) =>
      financeiroNucleoService.definirParcelas(ctx.user.id, input.tituloId, input.parcelas),
    ),

  titulosApropriar: protectedProcedure
    .input(z.object({
      tituloId: z.number().int().positive(),
      itens: z.array(z.object({
        valor: z.number().positive(),
        fazendaId: z.number().int().positive().optional().nullable(),
        categoriaId: z.number().int().positive().optional().nullable(),
        centroCustoId: z.number().int().positive().optional().nullable(),
        origemDetalheTipo: z.string().max(40).optional().nullable(),
        origemDetalheId: z.number().int().positive().optional().nullable(),
        observacoes: z.string().optional().nullable(),
      })),
    }))
    .mutation(({ ctx, input }) =>
      financeiroNucleoService.apropriar(ctx.user.id, input.tituloId, input.itens),
    ),

  liquidacaoPagar: protectedProcedure
    .input(z.object({
      contaId: z.number().int().positive(),
      dataLiquidacao: z.string().min(8),
      valorMovimentado: z.number().positive(),
      idempotencyKey: z.string().min(1).max(80),
      formaPagamento: z.string().max(40).optional().nullable(),
      referencia: z.string().max(80).optional().nullable(),
      observacoes: z.string().optional().nullable(),
      alocacoes: z.array(alocacaoInput).min(1),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarPagamento(ctx.user.id, input)),

  liquidacaoReceber: protectedProcedure
    .input(z.object({
      contaId: z.number().int().positive(),
      dataLiquidacao: z.string().min(8),
      valorMovimentado: z.number().positive(),
      idempotencyKey: z.string().min(1).max(80),
      formaPagamento: z.string().max(40).optional().nullable(),
      referencia: z.string().max(80).optional().nullable(),
      observacoes: z.string().optional().nullable(),
      alocacoes: z.array(alocacaoInput).min(1),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarRecebimento(ctx.user.id, input)),

  liquidacaoEstornar: protectedProcedure
    .input(z.object({
      liquidacaoId: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(80),
      dataLiquidacao: z.string().min(8),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.estornarLiquidacao(ctx.user.id, input)),

  transferenciaCreate: protectedProcedure
    .input(z.object({
      contaOrigemId: z.number().int().positive(),
      contaDestinoId: z.number().int().positive(),
      dataTransferencia: z.string().min(8),
      valor: z.number().positive(),
      idempotencyKey: z.string().min(1).max(80),
      descricao: z.string().max(255).optional().nullable(),
      referencia: z.string().max(80).optional().nullable(),
      observacoes: z.string().optional().nullable(),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarTransferencia(ctx.user.id, input)),

  transferenciaEstornar: protectedProcedure
    .input(z.object({
      transferenciaId: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(80),
      dataTransferencia: z.string().min(8),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.estornarTransferencia(ctx.user.id, input)),

  movimentosExtrato: protectedProcedure
    .input(z.object({
      contaId: z.number().int().positive(),
      de: z.string().optional(),
      ate: z.string().optional(),
    }))
    .query(({ ctx, input }) =>
      financeiroNucleoService.extrato(ctx.user.id, input.contaId, input.de, input.ate),
    ),

  categoriasList: protectedProcedure.query(({ ctx }) =>
    financeiroNucleoService.listarCategorias(ctx.user.id),
  ),

  categoriasCreate: protectedProcedure
    .input(z.object({
      nome: z.string().min(1).max(120),
      tipo: z.enum(["entrada", "saida"]),
      categoriaPaiId: z.number().int().positive().optional().nullable(),
      chaveSistema: z.string().max(60).optional().nullable(),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarCategoria(ctx.user.id, input)),

  categoriasInativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => financeiroNucleoService.inativarCategoria(ctx.user.id, input.id)),

  centrosList: protectedProcedure.query(({ ctx }) =>
    financeiroNucleoService.listarCentrosCusto(ctx.user.id),
  ),

  centrosCreate: protectedProcedure
    .input(z.object({
      nome: z.string().min(1).max(120),
      fazendaId: z.number().int().positive().optional().nullable(),
    }))
    .mutation(({ ctx, input }) => financeiroNucleoService.criarCentroCusto(ctx.user.id, input)),

  centrosInativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => financeiroNucleoService.inativarCentroCusto(ctx.user.id, input.id)),
});
