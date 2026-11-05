/**
 * Harness isolado 3E.12B — tRPC com modo INTEGRADO injetado.
 * Não altera constantes de produção. Aborta se DATABASE_URL não for o schema descartável.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { z } from "zod";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { createContext } from "../server/_core/context";
import { protectedProcedure, router } from "../server/_core/trpc";
import {
  confirmarVendaComercialSePermitida,
  confirmarVendaIntegradaSeAtiva,
} from "../server/vendaConfirmacaoIntegrada";
import { createConfirmarVendaFinanceiroMysqlStore } from "../server/confirmarVendaFinanceiroMysql";
import { createCancelarVendaFinanceiroService } from "../server/cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "../server/cancelarVendaFinanceiroMysql";

const TESTE = "fazenda_digital_test_integracao_3e12b";
const PROTEGIDOS = [
  "fazenda_digital",
  "fazenda_digital_restore_3e11b_20261026",
  "fazenda_digital_homolog_3c47",
  "fazenda_digital_homolog_3b2a3",
  "fazenda_digital_test_boot_3e11e2",
] as const;

const rawUrl = process.env.DATABASE_URL ?? "";
if (!rawUrl) {
  console.error("[3e12b-harness] DATABASE_URL ausente");
  process.exit(1);
}
const parsed = new URL(rawUrl);
const dbName = (parsed.pathname || "").replace(/^\//, "").split("?")[0];
if (dbName !== TESTE || (PROTEGIDOS as readonly string[]).includes(dbName)) {
  console.error(`[3e12b-harness] ABORT: DATABASE_URL aponta para ${dbName}`);
  process.exit(1);
}

const pool = mysql.createPool({
  host: parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: TESTE,
  connectionLimit: 8,
});
const db = drizzle(pool, { schema, mode: "default" });
const store = createConfirmarVendaFinanceiroMysqlStore(db);
const canc = createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(db));
const CFG = { estado: "integrado" as const };

const vendas = router({
  estadoConfirmacaoVenda: protectedProcedure.query(() => "integrado" as const),
  integracaoConfirmacaoAtiva: protectedProcedure.query(() => true),
  confirmar: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        data: z.string(),
        compradorId: z.number().int().positive(),
        formaPrecificacao: z.enum(["kg", "cabeca", "arroba"]),
        precoPadrao: z.number().positive().nullable().optional(),
        observacoes: z.string().optional(),
        itens: z.array(z.object({
          animalId: z.number().int().positive(),
          pesoVenda: z.number().positive().nullable().optional(),
          precoUnitario: z.number().positive(),
        })).min(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      confirmarVendaComercialSePermitida(ctx.user.id, { ...input, usuarioNome: ctx.user.name }, CFG),
    ),
  confirmarIntegrada: protectedProcedure
    .input(
      z.object({
        idempotencyKey: z.string().min(8).max(80),
        fazendaId: z.number().int().positive(),
        data: z.string(),
        compradorId: z.number().int().positive(),
        formaPrecificacao: z.enum(["kg", "cabeca"]),
        precoPadrao: z.number().positive().nullable().optional(),
        observacoes: z.string().nullable().optional(),
        itens: z.array(z.object({
          animalId: z.number().int().positive(),
          pesoVenda: z.number().positive().nullable().optional(),
          precoUnitario: z.number().positive(),
        })).min(1),
        condicao: z.enum(["a_vista", "a_prazo", "parcelado", "definir_depois"]),
        parcelas: z.array(z.object({
          numero: z.number().int().positive(),
          vencimento: z.string(),
          valorOriginal: z.number().positive(),
        })).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      confirmarVendaIntegradaSeAtiva(store, ctx.user.id, { ...input, usuarioNome: ctx.user.name }, CFG),
    ),
  cancelar: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), motivo: z.string().trim().min(1).max(255) }))
    .mutation(({ ctx, input }) =>
      canc.cancelar(ctx.user.id, {
        vendaId: input.id,
        motivo: input.motivo,
        canceladoPorUserId: ctx.user.id,
        canceladoPorNome: ctx.user.name,
      }),
    ),
});

const appRouter = router({ vendas });
const probe = await pool.query("SELECT DATABASE() AS db, CURRENT_USER() AS usr");
const meta = (Array.isArray(probe[0]) ? probe[0][0] : probe[0]) as { db?: string; usr?: string };
if (meta?.db !== TESTE) {
  console.error(`[3e12b-harness] ABORT: DATABASE()=${meta?.db}`);
  process.exit(1);
}

const app = express();
app.use(cookieParser());
app.use(express.json({ limit: "4mb" }));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: TESTE, modo: "integrado-injetado", harness: "3e12b" });
});
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

const PORT = Number(process.env.PORT || 3101);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`3E12B harness INTEGRADO injetado on http://127.0.0.1:${PORT} db=${TESTE}`);
});
