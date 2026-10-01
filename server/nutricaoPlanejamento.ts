import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  animais,
  estoque,
  lotes,
  nutricaoDietaIngredientes,
  nutricaoDietas,
  nutricaoPlanejamentos,
  pesagens,
} from "../drizzle/schema";
import {
  calcularProjecaoPlanejamento,
  diaAnteriorCivil,
  formatarMetaPlan,
  hojeISODateLocal,
  mesmaOrigemNutricional,
  MSG_PLAN_CONFLITO,
  MSG_PLAN_DIETA,
  MSG_PLAN_MATERIAL_INICIADO,
  MSG_PLAN_NAO_ENCONTRADO,
  MSG_PLAN_OWNERSHIP,
  mudouCampoMaterial,
  normalizarDataCivil,
  origemNormalizada,
  parseDiasSemana,
  periodosSobrepostos,
  podeEditarMaterialmente,
  serializarDiasSemana,
  situacaoTemporal,
  validarPlanejamentoInput,
  type NutricaoPlanDietaRef,
  type NutricaoPlanInput,
  type NutricaoPlanLoteRef,
  type NutricaoPlanPesagemRef,
  type NutricaoPlanProdutoRef,
  type NutricaoPlanSituacao,
  type NutricaoPlanStatusAdmin,
} from "../shared/nutricaoPlanejamento";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type NutricaoPlanPersistido = {
  id: number;
  userId: number;
  fazendaId: number;
  loteId: number;
  tipoOrigem: string;
  produtoId: number | null;
  dietaId: number | null;
  modalidadeMeta: string;
  valorMeta: string | null;
  frequencia: string;
  tratosPorDia: number | null;
  frequenciaIntervaloDias: number | null;
  frequenciaDiasSemana: string | null;
  nome: string | null;
  observacoes: string | null;
  dataInicio: string;
  dataFim: string | null;
  status: NutricaoPlanStatusAdmin;
};

export type NutricaoPlanTx = {
  insert(row: Omit<NutricaoPlanPersistido, "id">): Promise<number>;
  update(id: number, userId: number, patch: Partial<Omit<NutricaoPlanPersistido, "id" | "userId">>): Promise<void>;
};

export type NutricaoPlanStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  listProdutosFazenda(fazendaId: number): Promise<NutricaoPlanProdutoRef[]>;
  listDietasFazenda(userId: number, fazendaId: number): Promise<NutricaoPlanDietaRef[]>;
  getDieta(userId: number, dietaId: number): Promise<NutricaoPlanDietaRef | null>;
  getLote(userId: number, loteId: number): Promise<NutricaoPlanLoteRef | null>;
  listLotesFazenda(userId: number, fazendaId: number): Promise<NutricaoPlanLoteRef[]>;
  listAnimaisAtivosLote(userId: number, loteId: number): Promise<number[]>;
  listPesagensAnimais(userId: number, animalIds: number[]): Promise<NutricaoPlanPesagemRef[]>;
  find(userId: number, id: number): Promise<NutricaoPlanPersistido | null>;
  list(userId: number, fazendaId: number): Promise<NutricaoPlanPersistido[]>;
  transaction<T>(fn: (tx: NutricaoPlanTx) => Promise<T>): Promise<T>;
};

function produtoNome(produtos: NutricaoPlanProdutoRef[], produtoId: number): string | undefined {
  return produtos.find(p => p.produtoId === produtoId)?.nome;
}

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function toStatus(value: string | null | undefined): NutricaoPlanStatusAdmin {
  if (value === "encerrado" || value === "cancelado") return value;
  return "ativo";
}

function toRowInput(userId: number, input: NutricaoPlanInput, status: NutricaoPlanStatusAdmin): Omit<NutricaoPlanPersistido, "id"> {
  const origem = origemNormalizada(input);
  return {
    userId,
    fazendaId: input.fazendaId,
    loteId: input.loteId,
    tipoOrigem: origem.tipoOrigem ?? input.tipoOrigem,
    produtoId: origem.produtoId,
    dietaId: origem.dietaId,
    modalidadeMeta: input.modalidadeMeta,
    valorMeta: input.modalidadeMeta === "ad_libitum" || input.valorMeta == null ? null : String(input.valorMeta),
    frequencia: input.frequencia,
    tratosPorDia: input.tratosPorDia != null ? Number(input.tratosPorDia) : null,
    frequenciaIntervaloDias: input.frequenciaIntervaloDias != null ? Number(input.frequenciaIntervaloDias) : null,
    frequenciaDiasSemana: serializarDiasSemana(input.frequenciaDiasSemana),
    nome: input.nome?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
    dataInicio: normalizarDataCivil(input.dataInicio)!,
    dataFim: normalizarDataCivil(input.dataFim ?? null),
    status,
  };
}

export function createNutricaoPlanejamentoService(store: NutricaoPlanStore) {
  async function contextoValidacao(userId: number, input: NutricaoPlanInput) {
    const lote = await store.getLote(userId, input.loteId);
    const origem = origemNormalizada(input);
    let produto: NutricaoPlanProdutoRef | null = null;
    let dieta: NutricaoPlanDietaRef | null = null;
    if (origem.tipoOrigem === "produto" && origem.produtoId) {
      const produtos = await store.listProdutosFazenda(input.fazendaId);
      produto = produtos.find(p => p.produtoId === origem.produtoId) ?? null;
    }
    if (origem.tipoOrigem === "dieta" && origem.dietaId) {
      dieta = await store.getDieta(userId, origem.dietaId);
    }
    return { lote, produto, dieta };
  }

  async function assertSemConflito(
    userId: number,
    input: NutricaoPlanInput,
    ignoreId?: number,
  ) {
    const existentes = await store.list(userId, input.fazendaId);
    const origem = origemNormalizada(input);
    for (const atual of existentes) {
      if (ignoreId && atual.id === ignoreId) continue;
      if (atual.loteId !== input.loteId) continue;
      if (atual.status === "cancelado") continue;
      if (!origem.tipoOrigem || !mesmaOrigemNutricional(atual, { ...origem, tipoOrigem: origem.tipoOrigem })) continue;
      if (periodosSobrepostos(atual.dataInicio, atual.dataFim, input.dataInicio, input.dataFim ?? null)) {
        toTrpc(MSG_PLAN_CONFLITO);
      }
    }
  }

  async function montarProjecao(
    userId: number,
    plan: {
      fazendaId: number;
      loteId: number;
      tipoOrigem: string;
      produtoId?: number | null;
      dietaId?: number | null;
      modalidadeMeta: string;
      valorMeta?: number | string | null;
      tratosPorDia?: number | null;
    },
    hojeISO: string,
  ) {
    const produtos = await store.listProdutosFazenda(plan.fazendaId);
    const produtosPorId = new Map(produtos.map(p => [p.produtoId, p]));
    const animalIds = await store.listAnimaisAtivosLote(userId, plan.loteId);
    const pesagensAnimais = await store.listPesagensAnimais(userId, animalIds);
    const produto = plan.produtoId ? produtosPorId.get(plan.produtoId) ?? null : null;
    const dieta = plan.dietaId ? await store.getDieta(userId, plan.dietaId) : null;
    return calcularProjecaoPlanejamento({
      modalidadeMeta: plan.modalidadeMeta,
      valorMeta: plan.valorMeta == null || plan.valorMeta === "" ? null : Number(plan.valorMeta),
      tratosPorDia: plan.tratosPorDia,
      tipoOrigem: plan.tipoOrigem,
      animalIds,
      pesagens: pesagensAnimais,
      hojeISO,
      produto,
      dieta,
      produtosPorId,
    });
  }

  async function hidratar(userId: number, plan: NutricaoPlanPersistido, hojeISO: string) {
    const lote = await store.getLote(userId, plan.loteId);
    const produtos = await store.listProdutosFazenda(plan.fazendaId);
    const produto = plan.produtoId ? produtos.find(p => p.produtoId === plan.produtoId) ?? null : null;
    const dieta = plan.dietaId ? await store.getDieta(userId, plan.dietaId) : null;
    const projecao = await montarProjecao(userId, plan, hojeISO);
    const situacao = situacaoTemporal({
      status: plan.status,
      dataInicio: plan.dataInicio,
      dataFim: plan.dataFim,
      hojeISO,
    });
    const origemNome = plan.tipoOrigem === "dieta" ? (dieta?.nome ?? "Dieta") : (produto?.nome ?? "Produto");
    return {
      ...plan,
      valorMeta: plan.valorMeta == null ? null : Number(plan.valorMeta),
      frequenciaDiasSemana: parseDiasSemana(plan.frequenciaDiasSemana),
      loteNome: lote?.nome ?? `Lote #${plan.loteId}`,
      origemNome,
      metaLabel: formatarMetaPlan(plan.modalidadeMeta, plan.valorMeta == null ? null : Number(plan.valorMeta)),
      situacao,
      projecao: {
        ...projecao,
        autonomiaDieta: projecao.autonomiaDieta
          ? {
              ...projecao.autonomiaDieta,
              limitanteNome: projecao.autonomiaDieta.limitanteProdutoId
                ? (produtoNome(produtos, projecao.autonomiaDieta.limitanteProdutoId) ?? null)
                : null,
            }
          : null,
      },
    };
  }

  return {
    async listar(
      userId: number,
      input: { fazendaId: number; loteId?: number; situacao?: NutricaoPlanSituacao; search?: string },
      hojeISO = hojeISODateLocal(),
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      const rows = await store.list(userId, input.fazendaId);
      const hidratados = [];
      for (const row of rows) {
        if (input.loteId && row.loteId !== input.loteId) continue;
        const item = await hidratar(userId, row, hojeISO);
        if (input.situacao && item.situacao !== input.situacao) continue;
        if (input.search) {
          const q = input.search.trim().toLowerCase();
          const blob = `${item.loteNome} ${item.origemNome} ${item.nome ?? ""}`.toLowerCase();
          if (!blob.includes(q)) continue;
        }
        hidratados.push(item);
      }
      return hidratados;
    },

    async obter(userId: number, id: number, hojeISO = hojeISODateLocal()) {
      const row = await store.find(userId, id);
      if (!row) toTrpc(MSG_PLAN_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, row.fazendaId);
      return hidratar(userId, row, hojeISO);
    },

    async listarLotes(userId: number, fazendaId: number) {
      await store.assertFazenda(userId, fazendaId);
      return store.listLotesFazenda(userId, fazendaId);
    },

    async listarProdutos(userId: number, fazendaId: number) {
      await store.assertFazenda(userId, fazendaId);
      return store.listProdutosFazenda(fazendaId);
    },

    async listarDietas(userId: number, fazendaId: number) {
      await store.assertFazenda(userId, fazendaId);
      return store.listDietasFazenda(userId, fazendaId);
    },

    async preview(userId: number, input: NutricaoPlanInput, hojeISO = hojeISODateLocal()) {
      await store.assertFazenda(userId, input.fazendaId);
      return montarProjecao(userId, {
        ...input,
        valorMeta: input.valorMeta,
      }, hojeISO);
    },

    async criar(userId: number, input: NutricaoPlanInput, hojeISO = hojeISODateLocal()) {
      await store.assertFazenda(userId, input.fazendaId);
      const ctx = await contextoValidacao(userId, input);
      const check = validarPlanejamentoInput(input, ctx);
      if (!check.ok) toTrpc(check.message);
      await assertSemConflito(userId, input);
      const id = await store.transaction(async tx => tx.insert(toRowInput(userId, input, "ativo")));
      return { success: true as const, id, situacao: situacaoTemporal({
        status: "ativo",
        dataInicio: input.dataInicio,
        dataFim: input.dataFim ?? null,
        hojeISO,
      }) };
    },

    async editar(userId: number, id: number, input: NutricaoPlanInput, hojeISO = hojeISODateLocal()) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_PLAN_NAO_ENCONTRADO, "NOT_FOUND");
      if (atual.userId !== userId) toTrpc(MSG_PLAN_OWNERSHIP, "FORBIDDEN");
      await store.assertFazenda(userId, atual.fazendaId);
      if (input.fazendaId !== atual.fazendaId) toTrpc("A fazenda do planejamento não pode ser alterada.");
      if (atual.status === "cancelado" || atual.status === "encerrado") {
        toTrpc("Planejamento encerrado ou cancelado não pode ser editado.");
      }
      const material = mudouCampoMaterial(atual, input);
      if (material && !podeEditarMaterialmente(atual.dataInicio, hojeISO)) {
        toTrpc(MSG_PLAN_MATERIAL_INICIADO);
      }
      const ctx = await contextoValidacao(userId, input);
      const check = validarPlanejamentoInput(input, ctx);
      if (!check.ok) toTrpc(check.message);
      await assertSemConflito(userId, input, id);
      await store.transaction(async tx => {
        const row = toRowInput(userId, input, atual.status);
        const { userId: _u, ...patch } = row;
        await tx.update(id, userId, patch);
      });
      return { success: true as const, id };
    },

    async substituir(userId: number, id: number, input: NutricaoPlanInput, hojeISO = hojeISODateLocal()) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_PLAN_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status !== "ativo") toTrpc("Só é possível substituir planejamento ativo.");
      if (podeEditarMaterialmente(atual.dataInicio, hojeISO)) {
        return this.editar(userId, id, input, hojeISO);
      }
      const novoInicio = normalizarDataCivil(input.dataInicio) ?? hojeISO;
      const fimAnterior = diaAnteriorCivil(novoInicio);
      if (!fimAnterior || fimAnterior < atual.dataInicio) {
        toTrpc(MSG_PLAN_MATERIAL_INICIADO);
      }
      const novoInput: NutricaoPlanInput = { ...input, fazendaId: atual.fazendaId, dataInicio: novoInicio };
      const ctx = await contextoValidacao(userId, novoInput);
      const check = validarPlanejamentoInput(novoInput, ctx);
      if (!check.ok) toTrpc(check.message);
      const novoId = await store.transaction(async tx => {
        await tx.update(id, userId, { status: "encerrado", dataFim: fimAnterior });
        return tx.insert(toRowInput(userId, novoInput, "ativo"));
      });
      return { success: true as const, id: novoId, encerradoId: id, dataFimAnterior: fimAnterior };
    },

    async encerrar(userId: number, id: number, hojeISO = hojeISODateLocal()) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_PLAN_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      const dataFim = hojeISO < atual.dataInicio
        ? atual.dataInicio
        : (atual.dataFim && atual.dataFim < hojeISO ? atual.dataFim : hojeISO);
      await store.transaction(async tx => {
        await tx.update(id, userId, { status: "encerrado", dataFim });
      });
      return { success: true as const, status: "encerrado" as const, dataFim };
    },

    async cancelar(userId: number, id: number) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_PLAN_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      await store.transaction(async tx => {
        await tx.update(id, userId, { status: "cancelado" });
      });
      return { success: true as const, status: "cancelado" as const };
    },
  };
}

function toPlanRow(row: typeof nutricaoPlanejamentos.$inferSelect): NutricaoPlanPersistido {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    loteId: row.loteId,
    tipoOrigem: row.tipoOrigem,
    produtoId: row.produtoId ?? null,
    dietaId: row.dietaId ?? null,
    modalidadeMeta: row.modalidadeMeta,
    valorMeta: row.valorMeta == null ? null : String(row.valorMeta),
    frequencia: row.frequencia,
    tratosPorDia: row.tratosPorDia ?? null,
    frequenciaIntervaloDias: row.frequenciaIntervaloDias ?? null,
    frequenciaDiasSemana: row.frequenciaDiasSemana ?? null,
    nome: row.nome ?? null,
    observacoes: row.observacoes ?? null,
    dataInicio: row.dataInicio,
    dataFim: row.dataFim ?? null,
    status: toStatus(row.status),
  };
}

async function dietaComIngredientes(
  userId: number,
  dietaId: number,
): Promise<NutricaoPlanDietaRef | null> {
  const [dieta] = await db
    .select()
    .from(nutricaoDietas)
    .where(and(eq(nutricaoDietas.id, dietaId), eq(nutricaoDietas.userId, userId)))
    .limit(1);
  if (!dieta) return null;
  const ings = await db
    .select()
    .from(nutricaoDietaIngredientes)
    .where(eq(nutricaoDietaIngredientes.dietaId, dieta.id));
  return {
    id: dieta.id,
    userId: dieta.userId,
    fazendaId: dieta.fazendaId,
    nome: dieta.nome,
    status: dieta.status,
    dataInicio: dieta.dataInicio ?? null,
    dataFim: dieta.dataFim ?? null,
    baseQuantidade: Number(dieta.baseQuantidade),
    ingredientes: ings.map(i => ({ produtoId: i.produtoId, quantidadeKg: Number(i.quantidade) })),
  };
}

export const nutricaoPlanejamentoStore: NutricaoPlanStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
  },

  async listProdutosFazenda(fazendaId) {
    const rows = await db
      .select({
        produtoId: estoque.produtoId,
        nome: estoque.nome,
        unidade: estoque.unidade,
        valorUnitario: estoque.valorUnitario,
        quantidade: estoque.quantidade,
        controlarSaldo: estoque.controlarSaldo,
        embalagens: estoque.embalagens,
        situacao: estoque.situacao,
      })
      .from(estoque)
      .where(eq(estoque.fazendaId, fazendaId));
    return rows
      .filter(r => r.produtoId != null && r.produtoId > 0 && (r.situacao ?? "ativo") !== "inativo")
      .map(r => ({
        produtoId: Number(r.produtoId),
        nome: r.nome,
        unidade: r.unidade ?? null,
        valorUnitario: r.valorUnitario ?? null,
        quantidade: r.quantidade ?? null,
        controlarSaldo: r.controlarSaldo !== false,
        embalagens: r.embalagens ?? null,
        vinculadoFazenda: true,
      }));
  },

  async listDietasFazenda(userId, fazendaId) {
    const rows = await db
      .select()
      .from(nutricaoDietas)
      .where(and(
        eq(nutricaoDietas.userId, userId),
        eq(nutricaoDietas.fazendaId, fazendaId),
        eq(nutricaoDietas.status, "ativa"),
      ))
      .orderBy(desc(nutricaoDietas.updatedAt));
    const out: NutricaoPlanDietaRef[] = [];
    for (const dieta of rows) {
      const full = await dietaComIngredientes(userId, dieta.id);
      if (full) out.push(full);
    }
    return out;
  },

  async getDieta(userId, dietaId) {
    return dietaComIngredientes(userId, dietaId);
  },

  async getLote(userId, loteId) {
    const [row] = await db
      .select()
      .from(lotes)
      .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      fazendaId: row.fazendaId ?? null,
      ativo: row.ativo !== false,
      nome: row.nome,
    };
  },

  async listLotesFazenda(userId, fazendaId) {
    const rows = await db
      .select()
      .from(lotes)
      .where(and(eq(lotes.userId, userId), eq(lotes.fazendaId, fazendaId), eq(lotes.ativo, true)))
      .orderBy(desc(lotes.updatedAt));
    return rows.map(row => ({
      id: row.id,
      userId: row.userId,
      fazendaId: row.fazendaId ?? null,
      ativo: row.ativo !== false,
      nome: row.nome,
    }));
  },

  async listAnimaisAtivosLote(userId, loteId) {
    const rows = await db
      .select({ id: animais.id })
      .from(animais)
      .where(and(eq(animais.userId, userId), eq(animais.loteId, loteId), eq(animais.status, "ativo")));
    return rows.map(r => r.id);
  },

  async listPesagensAnimais(userId, animalIds) {
    if (animalIds.length === 0) return [];
    const rows = await db
      .select({
        animalId: pesagens.animalId,
        peso: pesagens.peso,
        data: pesagens.data,
      })
      .from(pesagens)
      .where(and(eq(pesagens.userId, userId), inArray(pesagens.animalId, animalIds)));
    return rows
      .map(r => ({
        animalId: r.animalId,
        peso: Number(r.peso),
        data: r.data,
      }))
      .filter(r => Number.isFinite(r.peso) && r.peso > 0);
  },

  async find(userId, id) {
    const [row] = await db
      .select()
      .from(nutricaoPlanejamentos)
      .where(and(eq(nutricaoPlanejamentos.id, id), eq(nutricaoPlanejamentos.userId, userId)))
      .limit(1);
    return row ? toPlanRow(row) : null;
  },

  async list(userId, fazendaId) {
    const rows = await db
      .select()
      .from(nutricaoPlanejamentos)
      .where(and(eq(nutricaoPlanejamentos.userId, userId), eq(nutricaoPlanejamentos.fazendaId, fazendaId)))
      .orderBy(desc(nutricaoPlanejamentos.dataInicio), desc(nutricaoPlanejamentos.id));
    return rows.map(toPlanRow);
  },

  transaction(fn) {
    return db.transaction(async tx => fn({
      async insert(row) {
        const result = await tx.insert(nutricaoPlanejamentos).values(row);
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (!Number.isFinite(id) || id <= 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar o planejamento." });
        }
        return id;
      },
      async update(id, userId, patch) {
        await tx
          .update(nutricaoPlanejamentos)
          .set(patch)
          .where(and(eq(nutricaoPlanejamentos.id, id), eq(nutricaoPlanejamentos.userId, userId)));
      },
    }));
  },
};

export const nutricaoPlanejamentoService = createNutricaoPlanejamentoService(nutricaoPlanejamentoStore);
