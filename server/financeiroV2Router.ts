import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { financeiroNucleoService } from "./financeiroNucleo";
import {
  FINANCEIRO_CONTA_TIPOS,
  FINANCEIRO_TITULO_TIPOS,
  origemTituloManualIdempotente,
} from "../shared/financeiroNucleo";
import { isDatabaseUnavailable } from "./localFallbackStore";
import { acessoFinanceiroNoBanco, fazendasDaConsultaFinanceiroNoBanco } from "./consultaFinanceiroDb";
import {
  erroFinanceiro,
  MSG_EXTRATO_SO_PRINCIPAL,
  PERMISSAO_CONFIRMAR_FINANCEIRO,
  PERMISSAO_CRIAR_FINANCEIRO,
  PERMISSAO_EDITAR_FINANCEIRO,
  PERMISSAO_ESTORNAR_FINANCEIRO,
  PERMISSAO_INATIVAR_FINANCEIRO,
  PERMISSAO_VER_FINANCEIRO,
  recusarFinanceiroSemMysql,
  type AcessoFinanceiro,
  type SessaoFinanceiro,
} from "./consultaFinanceiroAutorizada";

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

type CtxFinanceiro = { user: { id: number; sessionVersion?: number | null } };

async function titularDaConsulta(ctx: CtxFinanceiro): Promise<AcessoFinanceiro & { ok?: true }> {
  try {
    const acesso = await fazendasDaConsultaFinanceiroNoBanco({
      executorId: ctx.user.id,
      sessionVersionDaSessao: ctx.user.sessionVersion ?? null,
    });
    if (!acesso.ok) throw erroFinanceiro(acesso);
    return acesso;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isDatabaseUnavailable(error)) recusarFinanceiroSemMysql();
    throw error;
  }
}

function sessaoFinanceiro(ctx: CtxFinanceiro, permissaoId: string, exigirPrincipal = false): SessaoFinanceiro {
  return {
    executorId: ctx.user.id,
    sessionVersionDaSessao: ctx.user.sessionVersion ?? null,
    permissaoId,
    exigirPrincipal,
  };
}

async function donoDaOperacao(ctx: CtxFinanceiro, permissaoId: string, exigirPrincipal = false): Promise<AcessoFinanceiro> {
  try {
    return await acessoFinanceiroNoBanco(sessaoFinanceiro(ctx, permissaoId, exigirPrincipal));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isDatabaseUnavailable(error)) recusarFinanceiroSemMysql();
    throw error;
  }
}

async function gravarFinanceiro<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isDatabaseUnavailable(error)) recusarFinanceiroSemMysql();
    throw error;
  }
}

function mascararSaldo<T extends { saldoAtual?: unknown; saldoAbertura?: unknown }>(conta: T, papel: string): T {
  if (papel === "principal") return conta;
  return { ...conta, saldoAtual: null, saldoAbertura: null };
}

export const financeiroV2Router = router({
  contasList: protectedProcedure.query(async ({ ctx }) => {
    const acesso = await titularDaConsulta(ctx);
    const contas = await gravarFinanceiro(() => financeiroNucleoService.listarContas(acesso.titularUserId));
    return contas.map((conta) => mascararSaldo(conta, acesso.papel));
  }),

  contasGet: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const acesso = await titularDaConsulta(ctx);
      const conta = await gravarFinanceiro(() => financeiroNucleoService.obterConta(acesso.titularUserId, input.id));
      return mascararSaldo(conta, acesso.papel);
    }),

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
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CRIAR_FINANCEIRO, true);
      return gravarFinanceiro(() => financeiroNucleoService.criarContaFinanceira(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_CRIAR_FINANCEIRO, true),
      ));
    }),

  contasInativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), motivo: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_INATIVAR_FINANCEIRO, true);
      return gravarFinanceiro(() => financeiroNucleoService.inativarConta(
        acesso.titularUserId,
        input.id,
        input.motivo,
        sessaoFinanceiro(ctx, PERMISSAO_INATIVAR_FINANCEIRO, true),
      ));
    }),

  contasUpdate: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      nome: z.string().min(1).max(120),
      tipo: z.enum(FINANCEIRO_CONTA_TIPOS),
      banco: z.string().max(100).optional().nullable(),
      agencia: z.string().max(20).optional().nullable(),
      numeroConta: z.string().max(30).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_EDITAR_FINANCEIRO, true);
      return gravarFinanceiro(() => financeiroNucleoService.atualizarConta(
        acesso.titularUserId,
        input.id,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_EDITAR_FINANCEIRO, true),
      ));
    }),

  contasReativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_INATIVAR_FINANCEIRO, true);
      return gravarFinanceiro(() => financeiroNucleoService.reativarConta(
        acesso.titularUserId,
        input.id,
        sessaoFinanceiro(ctx, PERMISSAO_INATIVAR_FINANCEIRO, true),
      ));
    }),

  titulosList: protectedProcedure.query(async ({ ctx }) => {
    const acesso = await titularDaConsulta(ctx);
    return gravarFinanceiro(() => financeiroNucleoService.listarTitulos(acesso.titularUserId, acesso));
  }),

  titulosGet: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const acesso = await titularDaConsulta(ctx);
      return gravarFinanceiro(() => financeiroNucleoService.detalheTitulo(acesso.titularUserId, input.id, acesso));
    }),

  tituloHistoricoPagamentos: protectedProcedure
    .input(z.object({ tituloId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const acesso = await titularDaConsulta(ctx);
      return gravarFinanceiro(() => financeiroNucleoService.historicoPagamentosTitulo(
        acesso.titularUserId,
        input.tituloId,
        acesso,
      ));
    }),

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
      idempotencyKey: z.string().min(1).max(72),
    }))
    .mutation(async ({ ctx, input }) => {
      const origem = origemTituloManualIdempotente(input.tipo, input.idempotencyKey);
      if (!origem.ok) throw new TRPCError({ code: "BAD_REQUEST", message: origem.message });
      const { idempotencyKey: _chave, ...dados } = input;
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CRIAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.criarTitulo(acesso.titularUserId, {
        ...dados,
        origemTipo: origem.origemTipo,
        origemId: origem.origemId,
        origemItemChave: origem.origemItemChave,
      }, sessaoFinanceiro(ctx, PERMISSAO_CRIAR_FINANCEIRO)));
    }),

  titulosDefinirParcelas: protectedProcedure
    .input(z.object({
      tituloId: z.number().int().positive(),
      parcelas: z.array(parcelaInput).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_EDITAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.definirParcelas(
        acesso.titularUserId,
        input.tituloId,
        input.parcelas,
        sessaoFinanceiro(ctx, PERMISSAO_EDITAR_FINANCEIRO),
      ));
    }),

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
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_EDITAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.apropriar(
        acesso.titularUserId,
        input.tituloId,
        input.itens,
        sessaoFinanceiro(ctx, PERMISSAO_EDITAR_FINANCEIRO),
      ));
    }),

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
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CONFIRMAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.criarPagamento(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_CONFIRMAR_FINANCEIRO),
      ));
    }),

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
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CONFIRMAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.criarRecebimento(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_CONFIRMAR_FINANCEIRO),
      ));
    }),

  liquidacaoEstornar: protectedProcedure
    .input(z.object({
      liquidacaoId: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(80),
      dataLiquidacao: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_ESTORNAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.estornarLiquidacao(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_ESTORNAR_FINANCEIRO),
      ));
    }),

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
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CRIAR_FINANCEIRO, true);
      return gravarFinanceiro(() => financeiroNucleoService.criarTransferencia(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_CRIAR_FINANCEIRO, true),
      ));
    }),

  transferenciaEstornar: protectedProcedure
    .input(z.object({
      transferenciaId: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(80),
      dataTransferencia: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_ESTORNAR_FINANCEIRO, true);
      return gravarFinanceiro(() => financeiroNucleoService.estornarTransferencia(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_ESTORNAR_FINANCEIRO, true),
      ));
    }),

  movimentosExtrato: protectedProcedure
    .input(z.object({
      contaId: z.number().int().positive(),
      de: z.string().optional(),
      ate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const acesso = await titularDaConsulta(ctx);
      if (acesso.papel !== "principal") {
        throw new TRPCError({ code: "FORBIDDEN", message: MSG_EXTRATO_SO_PRINCIPAL });
      }
      return gravarFinanceiro(() => financeiroNucleoService.extrato(
        acesso.titularUserId,
        input.contaId,
        input.de,
        input.ate,
        sessaoFinanceiro(ctx, PERMISSAO_VER_FINANCEIRO, true),
      ));
    }),

  relatorioFinanceiro: protectedProcedure
    .input(z.object({
      de: z.string().min(8),
      ate: z.string().min(8),
      fazendaId: z.number().int().positive().optional().nullable(),
      contaId: z.number().int().positive().optional().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      const acesso = await titularDaConsulta(ctx);
      if (input.fazendaId && acesso.papel !== "principal" && !acesso.fazendaIds.includes(input.fazendaId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
      }
      return gravarFinanceiro(() => financeiroNucleoService.relatorioFinanceiro(acesso.titularUserId, input, acesso));
    }),

  categoriasList: protectedProcedure.query(async ({ ctx }) => {
    const acesso = await titularDaConsulta(ctx);
    return gravarFinanceiro(() => financeiroNucleoService.listarCategorias(acesso.titularUserId));
  }),

  categoriasCreate: protectedProcedure
    .input(z.object({
      nome: z.string().min(1).max(120),
      tipo: z.enum(["entrada", "saida"]),
      categoriaPaiId: z.number().int().positive().optional().nullable(),
      chaveSistema: z.string().max(60).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CRIAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.criarCategoria(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_CRIAR_FINANCEIRO),
      ));
    }),

  categoriasInativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_INATIVAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.inativarCategoria(
        acesso.titularUserId,
        input.id,
        sessaoFinanceiro(ctx, PERMISSAO_INATIVAR_FINANCEIRO),
      ));
    }),

  centrosList: protectedProcedure.query(async ({ ctx }) => {
    const acesso = await titularDaConsulta(ctx);
    return gravarFinanceiro(() => financeiroNucleoService.listarCentrosCusto(acesso.titularUserId, acesso));
  }),

  centrosCreate: protectedProcedure
    .input(z.object({
      nome: z.string().min(1).max(120),
      fazendaId: z.number().int().positive().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_CRIAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.criarCentroCusto(
        acesso.titularUserId,
        input,
        sessaoFinanceiro(ctx, PERMISSAO_CRIAR_FINANCEIRO),
      ));
    }),

  centrosInativar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const acesso = await donoDaOperacao(ctx, PERMISSAO_INATIVAR_FINANCEIRO);
      return gravarFinanceiro(() => financeiroNucleoService.inativarCentroCusto(
        acesso.titularUserId,
        input.id,
        sessaoFinanceiro(ctx, PERMISSAO_INATIVAR_FINANCEIRO),
      ));
    }),
});
