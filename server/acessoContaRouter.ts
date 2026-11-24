import { TRPCError } from "@trpc/server";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { criarAdministracaoDaAplicacao } from "./administracaoDb";
import { criarConsultasDaAplicacao } from "./administracaoConsultaDb";
import { protectedProcedure, router } from "./_core/trpc";
import { createMysqlPool } from "./_core/mysqlPool";
import { env } from "./_core/env";

const MENSAGENS: Record<string, string> = {
  sem_permissao: "Sem permissão para administrar os acessos desta conta.",
  sem_identidade: "Sessão inválida.",
  outro_titular: "Este usuário pertence a outra conta.",
  auto_modificacao: "O usuário não altera o próprio acesso por aqui.",
  alvo_protegido: "O titular não é alterado por esta tela.",
  hierarquia_recusada: "Não é possível criar outro titular por esta tela.",
  senha_invalida: "A senha precisa ter entre 8 e 80 caracteres.",
  senha_ausente: "Informe a senha inicial.",
  email_duplicado: "Este e-mail já está em uso.",
  email_invalido: "Informe um e-mail válido.",
  nome_invalido: "Informe o nome.",
  concessao_duplicada: "Essa permissão já foi concedida.",
  vinculo_existente: "Essa fazenda já foi concedida.",
  vinculo_ausente: "Essa concessão não está ativa.",
  permissao_ausente: "Essa permissão não está concedida.",
  permissao_invalida: "Permissão desconhecida.",
  acima_do_teto: "Essa permissão está acima do que você pode conceder.",
  sem_fazenda: "A fazenda não pertence a esta conta.",
  alvo_invalido: "Usuário não encontrado nesta conta.",
  ja_inativo: "Este usuário já está inativo.",
};

let pool: Pool | null = null;

function servicos() {
  if (!env.DATABASE_URL) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Banco indisponível." });
  }
  if (!pool) pool = createMysqlPool(4);
  return {
    gravar: criarAdministracaoDaAplicacao(pool),
    ler: criarConsultasDaAplicacao(pool),
  };
}

function recusar(motivo: string): never {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: MENSAGENS[motivo] ?? "Operação recusada.",
  });
}

function exigirOk<T extends { ok: boolean; motivo?: string }>(resultado: T): asserts resultado is T & { ok: true } {
  if (!resultado.ok) recusar(resultado.motivo ?? "recusada");
}

export const acessoRouter = router({
  listarUsuarios: protectedProcedure.query(async ({ ctx }) => {
    const resultado = await servicos().ler.listarUsuarios(ctx.user.id, { tamanho: 50 });
    exigirOk(resultado);
    return { itens: resultado.itens, total: resultado.total };
  }),

  catalogo: protectedProcedure.query(async ({ ctx }) => {
    const resultado = await servicos().ler.consultarDelegacao(ctx.user.id);
    exigirOk(resultado);
    return { catalogo: resultado.catalogo };
  }),

  permissoes: protectedProcedure
    .input(z.object({ usuarioId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const resultado = await servicos().ler.consultarPermissoes(ctx.user.id, input.usuarioId);
      exigirOk(resultado);
      return { efetivas: resultado.efetivas };
    }),

  fazendas: protectedProcedure
    .input(z.object({ usuarioId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const resultado = await servicos().ler.consultarFazendasDoUsuario(ctx.user.id, input.usuarioId);
      exigirOk(resultado);
      return resultado;
    }),

  criarUsuario: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email().max(255),
      papel: z.enum(["comum", "secundario"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.criarUsuario(ctx.user.id, {
        name: input.name,
        email: input.email,
        papel: input.papel,
      });
      exigirOk(resultado);
      return { id: resultado.id };
    }),

  definirSenha: protectedProcedure
    .input(z.object({
      usuarioId: z.number().int().positive(),
      senha: z.string().min(8).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.definirSenhaAcesso(ctx.user.id, input.usuarioId, input.senha);
      exigirOk(resultado);
      return { ok: true as const };
    }),

  concederFazenda: protectedProcedure
    .input(z.object({
      usuarioId: z.number().int().positive(),
      fazendaId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.concederFazenda(ctx.user.id, input.usuarioId, input.fazendaId);
      exigirOk(resultado);
      return { ok: true as const };
    }),

  revogarFazenda: protectedProcedure
    .input(z.object({
      usuarioId: z.number().int().positive(),
      fazendaId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.revogarFazenda(ctx.user.id, input.usuarioId, input.fazendaId);
      exigirOk(resultado);
      return { ok: true as const };
    }),

  concederPermissao: protectedProcedure
    .input(z.object({
      usuarioId: z.number().int().positive(),
      permissao: z.string().min(3).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.concederPermissao(ctx.user.id, input.usuarioId, input.permissao);
      exigirOk(resultado);
      return { ok: true as const };
    }),

  revogarPermissao: protectedProcedure
    .input(z.object({
      usuarioId: z.number().int().positive(),
      permissao: z.string().min(3).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.revogarPermissao(ctx.user.id, input.usuarioId, input.permissao);
      exigirOk(resultado);
      return { ok: true as const };
    }),

  inativarUsuario: protectedProcedure
    .input(z.object({ usuarioId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await servicos().gravar.inativarUsuario(ctx.user.id, input.usuarioId);
      exigirOk(resultado);
      return { ok: true as const };
    }),
});
