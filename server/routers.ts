import { z } from "zod";
import bcrypt from "bcryptjs";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { db } from "./db";
import {
  users, animais, lotes, saudeRegistros, reproducaoRegistros,
  maquinas, abastecimentos, manutencoes, pesagens, batidas,
  benfeitorias, estoque, estoqueMovimentacoes, contasFinanceiras, movimentacoes,
  compras, vendas, fazendas, pastos, lotePastoMovimentacoes
} from "../drizzle/schema";
import { eq, desc, and, sql, isNull, inArray } from "drizzle-orm";
import { createSession, clearAuthCookie } from "./_core/cookies";
import { resolveImageSlots } from "./_core/storage";

const imageSlotInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("keep"), path: z.string() }),
  z.object({ type: z.literal("new"), data: z.string(), mimeType: z.string() }),
]);

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Support login by email OR by openId
      const { or } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(
        or(eq(users.openId, input.username), eq(users.email, input.username))
      ).limit(1);
      if (!user) throw new Error("Usuário não encontrado");
      // Check password: use passwordHash if available, otherwise fallback to admin123
      let valid = false;
      if (user.passwordHash) {
        valid = await bcrypt.compare(input.password, user.passwordHash);
      } else {
        valid = input.password === "admin123";
      }
      if (!valid) throw new Error("Senha incorreta");
      const token = await createSession({ id: user.id, openId: user.openId, name: user.name, email: user.email || "", role: user.role || "user" });
      ctx.res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
      return { success: true, user: { id: user.id, openId: user.openId, name: user.name, email: user.email, role: user.role } };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    clearAuthCookie(ctx.res);
    return { success: true };
  }),
});

// ─── ANIMAIS ROUTER ───────────────────────────────────────────────────────────
const animaisRouter = router({
  list: protectedProcedure
    .input(z.object({ sexo: z.string().optional(), status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(animais.userId, ctx.user.id)];
      if (input?.sexo && input.sexo !== "") conditions.push(eq(animais.sexo, input.sexo as any));
      if (input?.status && input.status !== "") conditions.push(eq(animais.status, input.status as any));
      return db.select().from(animais).where(and(...conditions)).orderBy(desc(animais.createdAt));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [animal] = await db.select().from(animais).where(and(eq(animais.id, input.id), eq(animais.userId, ctx.user.id))).limit(1);
      return animal;
    }),

  create: protectedProcedure
    .input(z.object({
      brinco: z.string().optional(),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["macho", "femea"]),
      dataNascimento: z.string().optional(),
      pesoAtual: z.string().optional(),
      loteId: z.number().optional(),
      categoria: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(animais).values({
        userId: ctx.user.id,
        brinco: input.brinco,
        nome: input.nome,
        raca: input.raca,
        sexo: input.sexo,
        dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : undefined,
        pesoAtual: input.pesoAtual,
        loteId: input.loteId,
        categoria: input.categoria,
        observacoes: input.observacoes,
      });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      brinco: z.string().optional(),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["macho", "femea"]).optional(),
      dataNascimento: z.string().optional(),
      pesoAtual: z.string().optional(),
      loteId: z.number().optional(),
      categoria: z.string().optional(),
      status: z.enum(["ativo", "vendido", "morto", "transferido"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataNascimento, ...rest } = input;
      await db.update(animais).set({
        ...rest,
        dataNascimento: dataNascimento ? new Date(dataNascimento) : undefined,
      }).where(and(eq(animais.id, id), eq(animais.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(animais).where(and(eq(animais.id, input.id), eq(animais.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── LOTES / PASTOS HELPERS ───────────────────────────────────────────────────
function diasEntre(inicio: string | Date, fim: string | Date = new Date()): number {
  const a = new Date(inicio);
  const b = new Date(fim);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function countAnimaisLote(loteId: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(animais)
    .where(and(eq(animais.loteId, loteId), eq(animais.status, "ativo")));
  return Number(row?.count ?? 0);
}

async function syncPastoStatus(pastoId: number, userId: number) {
  const [ocupacao] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(lotes)
    .where(and(eq(lotes.pastoAtualId, pastoId), eq(lotes.userId, userId)));
  const temLotes = Number(ocupacao?.count ?? 0) > 0;
  await db.update(pastos).set({ status: temLotes ? "ativo" : "descanso" })
    .where(and(eq(pastos.id, pastoId), eq(pastos.userId, userId)));
}

async function enrichLote(lote: typeof lotes.$inferSelect) {
  const qtdAnimais = await countAnimaisLote(lote.id);
  let pastoNome: string | null = null;
  let pastoCapacidade: number | null = null;
  let fazendaNome: string | null = null;
  if (lote.pastoAtualId) {
    const [pasto] = await db.select().from(pastos).where(eq(pastos.id, lote.pastoAtualId)).limit(1);
    pastoNome = pasto?.nome ?? null;
    pastoCapacidade = pasto?.capacidade ?? null;
    if (pasto?.fazendaId) {
      const [fazenda] = await db.select({ nome: fazendas.nome }).from(fazendas).where(eq(fazendas.id, pasto.fazendaId)).limit(1);
      fazendaNome = fazenda?.nome ?? null;
    }
  }
  const diasNoPasto = lote.dataEntradaPasto ? diasEntre(lote.dataEntradaPasto) : null;
  return { ...lote, qtdAnimais, pastoNome, pastoCapacidade, fazendaNome, diasNoPasto };
}

// ─── LOTES ROUTER ─────────────────────────────────────────────────────────────
const lotesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const lotesList = await db.select().from(lotes).where(eq(lotes.userId, ctx.user.id)).orderBy(desc(lotes.createdAt));
    return Promise.all(lotesList.map(enrichLote));
  }),

  listByPasto: protectedProcedure
    .input(z.object({ pastoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const lotesList = await db.select().from(lotes).where(
        and(eq(lotes.pastoAtualId, input.pastoId), eq(lotes.userId, ctx.user.id))
      );
      return Promise.all(lotesList.map(enrichLote));
    }),

  listMovimentacoes: protectedProcedure
    .input(z.object({ loteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select().from(lotePastoMovimentacoes).where(
        and(eq(lotePastoMovimentacoes.loteId, input.loteId), eq(lotePastoMovimentacoes.userId, ctx.user.id))
      ).orderBy(desc(lotePastoMovimentacoes.dataEntrada));
      const pastoIds = [...new Set(rows.flatMap(r => [r.pastoOrigemId, r.pastoDestinoId].filter(Boolean) as number[]))];
      const pastoMap: Record<number, string> = {};
      if (pastoIds.length) {
        const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome }).from(pastos).where(inArray(pastos.id, pastoIds));
        pastosRows.forEach(p => { pastoMap[p.id] = p.nome; });
      }
      return rows.map(r => ({
        ...r,
        pastoOrigemNome: r.pastoOrigemId ? pastoMap[r.pastoOrigemId] ?? null : null,
        pastoDestinoNome: r.pastoDestinoId ? pastoMap[r.pastoDestinoId] ?? null : null,
      }));
    }),

  moveToPasto: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      pastoId: z.number().nullable(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [lote] = await db.select().from(lotes).where(
        and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id))
      ).limit(1);
      if (!lote) throw new Error("Lote não encontrado");

      const hoje = hojeISO();
      const qtdAnimais = await countAnimaisLote(lote.id);
      const pastoOrigemId = lote.pastoAtualId ?? null;

      if (input.pastoId === pastoOrigemId) {
        return { success: true };
      }

      // Fecha estadia anterior
      if (pastoOrigemId) {
        const [aberta] = await db.select().from(lotePastoMovimentacoes).where(
          and(
            eq(lotePastoMovimentacoes.loteId, lote.id),
            eq(lotePastoMovimentacoes.pastoDestinoId, pastoOrigemId),
            isNull(lotePastoMovimentacoes.dataSaida),
          )
        ).limit(1);

        const dataEntrada = aberta?.dataEntrada ?? lote.dataEntradaPasto ?? hoje;
        const dias = diasEntre(dataEntrada, hoje);

        if (aberta) {
          await db.update(lotePastoMovimentacoes).set({ dataSaida: hoje, diasNoPasto: dias })
            .where(eq(lotePastoMovimentacoes.id, aberta.id));
        } else {
          await db.insert(lotePastoMovimentacoes).values({
            userId: ctx.user.id,
            loteId: lote.id,
            pastoOrigemId: null,
            pastoDestinoId: pastoOrigemId,
            dataEntrada,
            dataSaida: hoje,
            diasNoPasto: dias,
            qtdAnimais,
          });
        }
        await syncPastoStatus(pastoOrigemId, ctx.user.id);
      }

      if (input.pastoId === null) {
        await db.update(lotes).set({
          pastoAtualId: null,
          dataEntradaPasto: null,
          fazendaId: null,
        }).where(eq(lotes.id, lote.id));
        return { success: true };
      }

      const [pasto] = await db.select().from(pastos).where(
        and(eq(pastos.id, input.pastoId), eq(pastos.userId, ctx.user.id))
      ).limit(1);
      if (!pasto) throw new Error("Pasto não encontrado");

      await db.insert(lotePastoMovimentacoes).values({
        userId: ctx.user.id,
        loteId: lote.id,
        pastoOrigemId,
        pastoDestinoId: input.pastoId,
        dataEntrada: hoje,
        qtdAnimais,
        observacoes: input.observacoes,
      });

      await db.update(lotes).set({
        pastoAtualId: input.pastoId,
        fazendaId: pasto.fazendaId,
        dataEntradaPasto: hoje,
        localizacao: pasto.nome,
      }).where(eq(lotes.id, lote.id));

      await db.update(pastos).set({ status: "ativo" })
        .where(and(eq(pastos.id, input.pastoId), eq(pastos.userId, ctx.user.id)));

      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      nome: z.string(),
      descricao: z.string().optional(),
      localizacao: z.string().optional(),
      capacidade: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(lotes).values({ userId: ctx.user.id, ...input });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      localizacao: z.string().optional(),
      capacidade: z.number().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(lotes).set(rest).where(and(eq(lotes.id, id), eq(lotes.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(lotes).where(and(eq(lotes.id, input.id), eq(lotes.userId, ctx.user.id)));
      return { success: true };
    }),
});
const saudeRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(saudeRegistros.userId, ctx.user.id)];
      if (input?.animalId) conditions.push(eq(saudeRegistros.animalId, input.animalId));
      return db.select().from(saudeRegistros).where(and(...conditions)).orderBy(desc(saudeRegistros.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      tipo: z.string(),
      descricao: z.string().optional(),
      medicamento: z.string().optional(),
      dosagem: z.string().optional(),
      veterinario: z.string().optional(),
      custo: z.string().optional(),
      dataRegistro: z.string(),
      proximaData: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dataRegistro, proximaData, ...rest } = input;
      const result = await db.insert(saudeRegistros).values({
        userId: ctx.user.id,
        ...rest,
        dataRegistro: new Date(dataRegistro),
        proximaData: proximaData ? new Date(proximaData) : undefined,
      });
      return { success: true, id: (result as any).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(saudeRegistros).where(and(eq(saudeRegistros.id, input.id), eq(saudeRegistros.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── REPRODUCAO ROUTER ────────────────────────────────────────────────────────
const reproducaoRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(reproducaoRegistros).where(eq(reproducaoRegistros.userId, ctx.user.id)).orderBy(desc(reproducaoRegistros.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({
      femeaId: z.number(),
      machoId: z.number().optional(),
      tipo: z.string(),
      dataCobertura: z.string(),
      dataPrevistoParto: z.string().optional(),
      resultado: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dataCobertura, dataPrevistoParto, ...rest } = input;
      const result = await db.insert(reproducaoRegistros).values({
        userId: ctx.user.id,
        ...rest,
        dataCobertura: new Date(dataCobertura),
        dataPrevistoParto: dataPrevistoParto ? new Date(dataPrevistoParto) : undefined,
      });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      resultado: z.string().optional(),
      dataPartoReal: z.string().optional(),
      filhotes: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataPartoReal, ...rest } = input;
      await db.update(reproducaoRegistros).set({
        ...rest,
        dataPartoReal: dataPartoReal ? new Date(dataPartoReal) : undefined,
      }).where(and(eq(reproducaoRegistros.id, id), eq(reproducaoRegistros.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(reproducaoRegistros).where(and(eq(reproducaoRegistros.id, input.id), eq(reproducaoRegistros.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── MAQUINAS ROUTER ──────────────────────────────────────────────────────────
const maquinasInputFields = {
  fazendaId: z.number(),
  nome: z.string().optional(),
  tipo: z.string(),
  marca: z.string(),
  ano: z.number().optional(),
  anoAquisicao: z.number().optional(),
  modelo: z.string().optional(),
  placa: z.string().optional(),
  valor: z.string().optional(),
  vidaUtil: z.string().optional(),
  dataDesativacao: z.string().optional(),
  estado: z.enum(["novo", "usado"]).optional(),
  horimetro: z.string().optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

const maquinasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(maquinas).where(eq(maquinas.userId, ctx.user.id)).orderBy(desc(maquinas.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(maquinas).where(
        and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id))
      );
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object(maquinasInputFields))
    .mutation(async ({ ctx, input }) => {
      const { dataDesativacao, imageSlots, nome, valor, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      try {
        const result = await db.insert(maquinas).values({
          userId: ctx.user.id,
          ...rest,
          nome: nome?.trim() || "Sem apelido",
          valor: valor && valor !== "0" && valor !== "0.00" ? valor : undefined,
          dataDesativacao: dataDesativacao ? new Date(dataDesativacao) : undefined,
          imagem1: img1,
          imagem2: img2,
          imagem3: img3,
        });
        return { success: true, id: (result as { insertId?: number }).insertId };
      } catch (err) {
        console.error("[maquinas.create]", err);
        throw new Error("Não foi possível salvar o maquinário. Verifique se o banco está atualizado e tente novamente.");
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...maquinasInputFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataDesativacao, imageSlots, nome, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      await db.update(maquinas).set({
        ...rest,
        ...(nome !== undefined ? { nome: nome.trim() || "Sem apelido" } : {}),
        dataDesativacao: dataDesativacao ? new Date(dataDesativacao) : null,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      }).where(and(eq(maquinas.id, id), eq(maquinas.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(maquinas).where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── ABASTECIMENTOS ROUTER ────────────────────────────────────────────────────
const abastecimentosRouter = router({
  list: protectedProcedure
    .input(z.object({ maquinaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(abastecimentos.userId, ctx.user.id)];
      if (input?.maquinaId) conditions.push(eq(abastecimentos.maquinaId, input.maquinaId));
      return db.select().from(abastecimentos).where(and(...conditions)).orderBy(desc(abastecimentos.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      maquinaId: z.number(),
      data: z.string(),
      combustivel: z.enum(["diesel", "gasolina", "etanol", "arla"]),
      litros: z.string(),
      valorLitro: z.string().optional(),
      valorTotal: z.string().optional(),
      horimetro: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(abastecimentos).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(abastecimentos).where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── MANUTENCOES ROUTER ───────────────────────────────────────────────────────
const manutencoesRouter = router({
  list: protectedProcedure
    .input(z.object({ maquinaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(manutencoes.userId, ctx.user.id)];
      if (input?.maquinaId) conditions.push(eq(manutencoes.maquinaId, input.maquinaId));
      return db.select().from(manutencoes).where(and(...conditions)).orderBy(desc(manutencoes.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      maquinaId: z.number(),
      tipo: z.string(),
      descricao: z.string().optional(),
      data: z.string(),
      custo: z.string().optional(),
      oficina: z.string().optional(),
      horimetro: z.string().optional(),
      proximaManutencao: z.string().optional(),
      status: z.enum(["agendada", "em_andamento", "concluida"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, proximaManutencao, ...rest } = input;
      const result = await db.insert(manutencoes).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
        proximaManutencao: proximaManutencao ? new Date(proximaManutencao) : undefined,
      });
      return { success: true, id: (result as any).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(manutencoes).where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── PESAGENS ROUTER ──────────────────────────────────────────────────────────
const pesagensRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(pesagens.userId, ctx.user.id)];
      if (input?.animalId) conditions.push(eq(pesagens.animalId, input.animalId));
      return db.select().from(pesagens).where(and(...conditions)).orderBy(desc(pesagens.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      peso: z.string(),
      data: z.string(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(pesagens).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
      });
      // Update animal's current weight
      await db.update(animais).set({ pesoAtual: input.peso }).where(and(eq(animais.id, input.animalId), eq(animais.userId, ctx.user.id)));
      return { success: true, id: (result as any).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(pesagens).where(and(eq(pesagens.id, input.id), eq(pesagens.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── NUTRICAO ROUTER ──────────────────────────────────────────────────────────
const nutricaoRouter = router({
  listBatidas: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(batidas).where(eq(batidas.userId, ctx.user.id)).orderBy(desc(batidas.createdAt));
  }),

  createBatida: protectedProcedure
    .input(z.object({
      data: z.string(),
      quantidade: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(batidas).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any).insertId };
    }),

  deleteBatida: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(batidas).where(and(eq(batidas.id, input.id), eq(batidas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── BENFEITORIAS ROUTER ──────────────────────────────────────────────────────
const benfeitoriasInputFields = {
  fazendaId: z.number(),
  nome: z.string(),
  anoConstrucao: z.number(),
  percentualAtividade: z.number().optional(),
  tipo: z.string().optional(),
  vidaUtil: z.string().optional(),
  localizacao: z.string().optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  dataInstalacao: z.string().optional(),
  valorEstimado: z.string().optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

const benfeitoriasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id)).orderBy(desc(benfeitorias.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(benfeitorias).where(
        and(eq(benfeitorias.id, input.id), eq(benfeitorias.userId, ctx.user.id))
      );
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object(benfeitoriasInputFields))
    .mutation(async ({ ctx, input }) => {
      const { dataInstalacao, imageSlots, percentualAtividade, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      const result = await db.insert(benfeitorias).values({
        userId: ctx.user.id,
        ...rest,
        percentualAtividade: percentualAtividade != null ? String(percentualAtividade) : undefined,
        dataInstalacao: dataInstalacao ? new Date(dataInstalacao) : undefined,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...benfeitoriasInputFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataInstalacao, imageSlots, percentualAtividade, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      await db.update(benfeitorias).set({
        ...rest,
        percentualAtividade: percentualAtividade != null ? String(percentualAtividade) : undefined,
        dataInstalacao: dataInstalacao ? new Date(dataInstalacao) : undefined,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      }).where(and(eq(benfeitorias.id, id), eq(benfeitorias.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(benfeitorias).where(and(eq(benfeitorias.id, input.id), eq(benfeitorias.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── ESTOQUE ROUTER ───────────────────────────────────────────────────────────
const estoqueInputFields = {
  nome: z.string(),
  categoria: z.string(),
  subcategoria: z.string(),
  unidade: z.string(),
  quantidadeMinima: z.string().optional(),
  quantidadeMaxima: z.string().optional(),
  fabricante: z.string().optional(),
  identificadorUnico: z.string().optional(),
  produzidoNaFazenda: z.boolean().optional(),
  monitorarEstoque: z.boolean(),
  situacao: z.enum(["ativo", "inativo"]).optional(),
  embalagens: z.array(z.object({
    nome: z.string(),
    volume: z.number().optional(),
    unidade: z.string().optional(),
  })).optional(),
  possuiCarencia: z.boolean().optional(),
  carenciaAbateDias: z.number().nullish(),
  carenciaAbateUnidade: z.enum(["d", "h"]).nullish(),
  carenciaLeiteDias: z.number().nullish(),
  observacoesCarencia: z.string().nullish(),
  quantidade: z.string().optional(),
  valorUnitario: z.string().optional(),
  localizacao: z.string().optional(),
  observacoes: z.string().optional(),
};

const estoqueRouter = router({
  list: protectedProcedure.query(async () => {
    return db.select().from(estoque).orderBy(desc(estoque.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(estoque).where(eq(estoque.id, input.id));
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object(estoqueInputFields))
    .mutation(async ({ input }) => {
      const { embalagens, ...rest } = input;
      const result = await db.insert(estoque).values({
        ...rest,
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : undefined,
      });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...estoqueInputFields }))
    .mutation(async ({ input }) => {
      const { id, embalagens, ...rest } = input;
      await db.update(estoque).set({
        ...rest,
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : undefined,
      }).where(eq(estoque.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.estoqueId, input.id));
      await db.delete(estoque).where(eq(estoque.id, input.id));
      return { success: true };
    }),

  resumo: protectedProcedure.query(async () => {
    const itens = await db.select().from(estoque);
    const monitorados = itens.filter(i => i.monitorarEstoque);
    const abaixoLimite = monitorados.filter(i => {
      const q = Number(i.quantidade ?? 0);
      const min = Number(i.quantidadeMinima ?? 0);
      return min > 0 && q <= min;
    });
    return {
      totalMonitorados: monitorados.length,
      totalAbaixoLimite: abaixoLimite.length,
    };
  }),

  listMovimentacoes: protectedProcedure.query(async () => {
    const rows = await db
      .select({
        id: estoqueMovimentacoes.id,
        estoqueId: estoqueMovimentacoes.estoqueId,
        dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
        quantidade: estoqueMovimentacoes.quantidade,
        dataValidade: estoqueMovimentacoes.dataValidade,
        observacoes: estoqueMovimentacoes.observacoes,
        nome: estoque.nome,
        categoria: estoque.categoria,
        fabricante: estoque.fabricante,
        unidade: estoque.unidade,
      })
      .from(estoqueMovimentacoes)
      .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
      .orderBy(desc(estoqueMovimentacoes.dataMovimentacao), desc(estoqueMovimentacoes.id));
    return rows;
  }),

  getMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select({
          id: estoqueMovimentacoes.id,
          estoqueId: estoqueMovimentacoes.estoqueId,
          dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
          quantidade: estoqueMovimentacoes.quantidade,
          dataValidade: estoqueMovimentacoes.dataValidade,
          observacoes: estoqueMovimentacoes.observacoes,
          nome: estoque.nome,
          unidade: estoque.unidade,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
        .where(eq(estoqueMovimentacoes.id, input.id));
      return row ?? null;
    }),

  createMovimentacao: protectedProcedure
    .input(z.object({
      estoqueId: z.number(),
      dataMovimentacao: z.string(),
      quantidade: z.string(),
      dataValidade: z.string().optional(),
      observacoes: z.string().optional(),
      modo: z.enum(["direto", "unidades"]).optional(),
      sinal: z.enum(["entrada", "saida"]).optional(),
      quantidadeUnidades: z.string().optional(),
      quantidadePorUnidade: z.string().optional(),
      unidadeLancamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const qty = parseFloat(input.quantidade.replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) {
        throw new Error("Informe uma quantidade válida.");
      }
      const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
      if (!item) throw new Error("Produto não encontrado.");

      const atual = Number(item.quantidade ?? 0);
      const novo = atual + qty;
      if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");

      let observacoes = input.observacoes;
      if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
        observacoes = JSON.stringify({
          modo: input.modo,
          sinal: input.sinal,
          unidades: input.quantidadeUnidades,
          porUnidade: input.quantidadePorUnidade,
          unidade: input.unidadeLancamento,
          total: qty,
        });
      }

      const result = await db.insert(estoqueMovimentacoes).values({
        estoqueId: input.estoqueId,
        dataMovimentacao: input.dataMovimentacao,
        quantidade: String(qty),
        dataValidade: input.dataValidade || undefined,
        observacoes,
      });

      await db.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, input.estoqueId));

      return { success: true, id: (result as { insertId?: number }).insertId };
    }),

  updateMovimentacao: protectedProcedure
    .input(z.object({
      id: z.number(),
      estoqueId: z.number(),
      dataMovimentacao: z.string(),
      quantidade: z.string(),
      dataValidade: z.string().optional(),
      observacoes: z.string().optional(),
      modo: z.enum(["direto", "unidades"]).optional(),
      sinal: z.enum(["entrada", "saida"]).optional(),
      quantidadeUnidades: z.string().optional(),
      quantidadePorUnidade: z.string().optional(),
      unidadeLancamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const qty = parseFloat(input.quantidade.replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) {
        throw new Error("Informe uma quantidade válida.");
      }

      const [mov] = await db
        .select()
        .from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.id, input.id));
      if (!mov) throw new Error("Movimentação não encontrada.");

      const oldQty = Number(mov.quantidade);
      const oldEstoqueId = mov.estoqueId;

      if (oldEstoqueId === input.estoqueId) {
        const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
        if (!item) throw new Error("Produto não encontrado.");
        const base = Number(item.quantidade ?? 0) - oldQty;
        const novo = base + qty;
        if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
        await db.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, input.estoqueId));
      } else {
        const [oldItem] = await db.select().from(estoque).where(eq(estoque.id, oldEstoqueId));
        const [newItem] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
        if (!oldItem || !newItem) throw new Error("Produto não encontrado.");
        const oldStock = Number(oldItem.quantidade ?? 0) - oldQty;
        const newStock = Number(newItem.quantidade ?? 0) + qty;
        if (newStock < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
        await db.update(estoque).set({ quantidade: String(oldStock) }).where(eq(estoque.id, oldEstoqueId));
        await db.update(estoque).set({ quantidade: String(newStock) }).where(eq(estoque.id, input.estoqueId));
      }

      let observacoes = input.observacoes;
      if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
        observacoes = JSON.stringify({
          modo: input.modo,
          sinal: input.sinal,
          unidades: input.quantidadeUnidades,
          porUnidade: input.quantidadePorUnidade,
          unidade: input.unidadeLancamento,
          total: qty,
        });
      }

      await db.update(estoqueMovimentacoes).set({
        estoqueId: input.estoqueId,
        dataMovimentacao: input.dataMovimentacao,
        quantidade: String(qty),
        dataValidade: input.dataValidade || null,
        observacoes: observacoes ?? null,
      }).where(eq(estoqueMovimentacoes.id, input.id));

      return { success: true };
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [mov] = await db
        .select()
        .from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.id, input.id));
      if (!mov) throw new Error("Movimentação não encontrada.");

      const [item] = await db.select().from(estoque).where(eq(estoque.id, mov.estoqueId));
      if (item) {
        const atual = Number(item.quantidade ?? 0);
        const revertido = atual - Number(mov.quantidade);
        await db.update(estoque).set({ quantidade: String(revertido) }).where(eq(estoque.id, mov.estoqueId));
      }

      await db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.id, input.id));
      return { success: true };
    }),
});

// ─── FINANCEIRO ROUTER ────────────────────────────────────────────────────────
const financeiroRouter = router({
  listContas: protectedProcedure.query(async () => {
    return db.select().from(contasFinanceiras).orderBy(desc(contasFinanceiras.createdAt));
  }),

  createConta: protectedProcedure
    .input(z.object({
      nome: z.string(),
      tipo: z.string().optional(),
      banco: z.string().optional(),
      saldoInicial: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await db.insert(contasFinanceiras).values({
        nome: input.nome,
        tipo: input.tipo,
        banco: input.banco,
        saldoInicial: input.saldoInicial || "0",
        saldoAtual: input.saldoInicial || "0",
      });
      return { success: true, id: (result as any).insertId };
    }),

  listMovimentacoes: protectedProcedure.query(async () => {
    return db.select().from(movimentacoes).orderBy(desc(movimentacoes.createdAt));
  }),

  createMovimentacao: protectedProcedure
    .input(z.object({
      contaId: z.number().optional(),
      tipo: z.enum(["receita", "despesa"]),
      descricao: z.string(),
      valor: z.string(),
      data: z.string(),
      status: z.enum(["pendente", "confirmado", "cancelado"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(movimentacoes).values({
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any).insertId };
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(movimentacoes).where(eq(movimentacoes.id, input.id));
      return { success: true };
    }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const [receitas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "receita"));
    const [despesas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "despesa"));
    const totalReceitas = parseFloat(receitas?.total || "0");
    const totalDespesas = parseFloat(despesas?.total || "0");
    return {
      totalReceitas,
      totalDespesas,
      saldoTotal: totalReceitas - totalDespesas,
    };
  }),
});

// ─── DASHBOARD ROUTER ─────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalAnimaisResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(animais).where(eq(animais.userId, ctx.user.id));
    const [totalLotesResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(lotes).where(eq(lotes.userId, ctx.user.id));
    const [totalMaquinasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(maquinas).where(eq(maquinas.userId, ctx.user.id));
    const [totalBenfeitoriasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id));

    const [receitas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "receita"));
    const [despesas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "despesa"));

    return {
      totalAnimais: Number(totalAnimaisResult?.count || 0),
      totalLotes: Number(totalLotesResult?.count || 0),
      totalMaquinas: Number(totalMaquinasResult?.count || 0),
      totalBenfeitorias: Number(totalBenfeitoriasResult?.count || 0),
      totalReceitas: parseFloat(receitas?.total || "0"),
      totalDespesas: parseFloat(despesas?.total || "0"),
      saldoTotal: parseFloat(receitas?.total || "0") - parseFloat(despesas?.total || "0"),
    };
  }),
});

// ─── COMPRAS ROUTER ─────────────────────────────────────────────────────────
const comprasRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(compras).where(eq(compras.userId, ctx.user.id)).orderBy(desc(compras.createdAt))
  ),
  create: protectedProcedure
    .input(z.object({
      fornecedor: z.string().optional(),
      data: z.string(),
      quantidadeAnimais: z.number().optional(),
      valorTotal: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(compras).values({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(compras).where(and(eq(compras.id, input.id), eq(compras.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── VENDAS ROUTER ───────────────────────────────────────────────────────────
const vendasRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(vendas).where(eq(vendas.userId, ctx.user.id)).orderBy(desc(vendas.createdAt))
  ),
  create: protectedProcedure
    .input(z.object({
      comprador: z.string().optional(),
      data: z.string(),
      quantidadeAnimais: z.number().optional(),
      valorTotal: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(vendas).values({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(vendas).where(and(eq(vendas.id, input.id), eq(vendas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── FAZENDAS ROUTER ────────────────────────────────────────────────────────
const fazendaFields = {
  sigla: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  unidadeArea: z.string().optional(),
  area: z.string().optional(),
  areaReserva: z.string().optional(),
  areaLiquida: z.string().optional(),
  endereco: z.string().optional(),
  cep: z.string().optional(),
  telefone: z.string().optional(),
  responsavel: z.string().optional(),
  atividadeCria: z.boolean().optional(),
  atividadeRecria: z.boolean().optional(),
  atividadeEngorda: z.boolean().optional(),
  atividadeConfinamento: z.boolean().optional(),
  cpfCnpj: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  registroIncra: z.string().optional(),
  nirf: z.string().optional(),
  possuiSisbov: z.boolean().optional(),
  razaoSocial: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  distanciaMunicipio: z.string().optional(),
  valorHectare: z.string().optional(),
  melhoramentoGenetico: z.string().optional(),
  observacoes: z.string().optional(),
};

const fazendasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(fazendas).where(eq(fazendas.userId, ctx.user.id)).orderBy(desc(fazendas.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(fazendas).where(and(eq(fazendas.id, input.id), eq(fazendas.userId, ctx.user.id)));
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object({ nome: z.string(), ...fazendaFields }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(fazendas).values({ userId: ctx.user.id, ...input });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().optional(), ...fazendaFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(fazendas).set(rest).where(and(eq(fazendas.id, id), eq(fazendas.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(fazendas).where(and(eq(fazendas.id, input.id), eq(fazendas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── PASTOS ROUTER ──────────────────────────────────────────────────────────
const pastosRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(pastos).where(eq(pastos.userId, ctx.user.id)).orderBy(desc(pastos.createdAt));
  }),

  listByFazenda: protectedProcedure
    .input(z.object({ fazendaId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(pastos).where(
        and(eq(pastos.fazendaId, input.fazendaId), eq(pastos.userId, ctx.user.id))
      ).orderBy(desc(pastos.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      nome: z.string(),
      sigla: z.string().optional(),
      tipo: z.string().optional(),
      tipoPastagem: z.string().optional(),
      area: z.string().optional(),
      incluirArea: z.boolean().optional(),
      capacidade: z.number().optional(),
      status: z.enum(["ativo", "descanso", "vazio"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(pastos).values({ userId: ctx.user.id, ...input });
      return { success: true, id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      sigla: z.string().optional(),
      tipo: z.string().optional(),
      tipoPastagem: z.string().optional(),
      area: z.string().optional(),
      incluirArea: z.boolean().optional(),
      capacidade: z.number().optional(),
      status: z.enum(["ativo", "descanso", "vazio"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(pastos).set(rest).where(and(eq(pastos.id, id), eq(pastos.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(pastos).where(and(eq(pastos.id, input.id), eq(pastos.userId, ctx.user.id)));
      return { success: true };
    }),

  listWithDetails: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(pastos.userId, ctx.user.id)];
      if (input?.fazendaId) conditions.push(eq(pastos.fazendaId, input.fazendaId));

      const pastosList = await db.select().from(pastos).where(and(...conditions)).orderBy(desc(pastos.createdAt));
      const fazendaIds = [...new Set(pastosList.map(p => p.fazendaId))];
      const fazendaMap: Record<number, string> = {};
      if (fazendaIds.length) {
        const fazRows = await db.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas).where(inArray(fazendas.id, fazendaIds));
        fazRows.forEach(f => { fazendaMap[f.id] = f.nome; });
      }

      return Promise.all(pastosList.map(async (pasto) => {
        const lotesNoPasto = await db.select().from(lotes).where(
          and(eq(lotes.pastoAtualId, pasto.id), eq(lotes.userId, ctx.user.id))
        );
        const lotesEnriched = await Promise.all(lotesNoPasto.map(enrichLote));
        const qtdAnimais = lotesEnriched.reduce((s, l) => s + (l.qtdAnimais ?? 0), 0);
        const capacidade = pasto.capacidade ?? 0;
        const pctOcupacao = capacidade > 0 ? Math.min(100, Math.round((qtdAnimais / capacidade) * 100)) : null;

        const [ultimaSaida] = await db.select().from(lotePastoMovimentacoes).where(
          and(eq(lotePastoMovimentacoes.pastoOrigemId, pasto.id), eq(lotePastoMovimentacoes.userId, ctx.user.id))
        ).orderBy(desc(lotePastoMovimentacoes.dataSaida)).limit(1);

        const diasDescanso = !lotesNoPasto.length && ultimaSaida?.dataSaida
          ? diasEntre(ultimaSaida.dataSaida)
          : null;

        const diasPastejo = lotesEnriched.length
          ? Math.max(...lotesEnriched.map(l => l.diasNoPasto ?? 0))
          : null;

        return {
          ...pasto,
          fazendaNome: fazendaMap[pasto.fazendaId] ?? null,
          qtdAnimais,
          qtdLotes: lotesNoPasto.length,
          pctOcupacao,
          diasPastejo,
          diasDescanso,
          lotes: lotesEnriched,
        };
      }));
    }),
});

// ─── APP ROUTER ───────────────────────────────────────────────────────────────
export const appRouter = router({
  auth: authRouter,
  animais: animaisRouter,
  lotes: lotesRouter,
  saude: saudeRouter,
  reproducao: reproducaoRouter,
  maquinas: maquinasRouter,
  abastecimentos: abastecimentosRouter,
  manutencoes: manutencoesRouter,
  pesagens: pesagensRouter,
  nutricao: nutricaoRouter,
  benfeitorias: benfeitoriasRouter,
  estoque: estoqueRouter,
  financeiro: financeiroRouter,
  dashboard: dashboardRouter,
  compras: comprasRouter,
  vendas: vendasRouter,
  fazendas: fazendasRouter,
  pastos: pastosRouter,
});

export type AppRouter = typeof appRouter;
