import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  lotes,
  nutricaoBatidas,
  nutricaoCochoLeituras,
  nutricaoDietas,
  nutricaoFornecimentos,
  nutricaoPlanejamentos,
} from "../drizzle/schema";
import { parseDiasSemana, hojeISODateLocal, normalizarDataCivil, type NutricaoPlanDietaRef, type NutricaoPlanPesagemRef, type NutricaoPlanProdutoRef } from "../shared/nutricaoPlanejamento";
import {
  montarPainelNutricao,
  type PeriodoCivil,
  type VgBatida,
  type VgForn,
  type VgLeitura,
  type VgLote,
  type VgPlan,
} from "../shared/nutricaoVisaoGeral";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";
import { nutricaoPlanejamentoStore } from "./nutricaoPlanejamento";

export type VgStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  getLote(userId: number, loteId: number): Promise<VgLote | null>;
  listFornecimentos(userId: number, fazendaId: number): Promise<VgForn[]>;
  listPlanejamentos(userId: number, fazendaId: number): Promise<VgPlan[]>;
  listLeituras(userId: number, fazendaId: number): Promise<VgLeitura[]>;
  listBatidas(userId: number, fazendaId: number): Promise<VgBatida[]>;
  listLotes(userId: number, fazendaId: number): Promise<VgLote[]>;
  listProdutos(fazendaId: number): Promise<NutricaoPlanProdutoRef[]>;
  listDietas(userId: number, fazendaId: number): Promise<NutricaoPlanDietaRef[]>;
  listAnimaisAtivosLote(userId: number, loteId: number): Promise<number[]>;
  listPesagens(userId: number, animalIds: number[]): Promise<NutricaoPlanPesagemRef[]>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

export function createNutricaoVisaoGeralService(store: VgStore) {
  return {
    async carregar(
      userId: number,
      input: { fazendaId: number; de: string; ate: string; loteId?: number | null },
      hojeISO = hojeISODateLocal(),
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      const de = normalizarDataCivil(input.de);
      const ate = normalizarDataCivil(input.ate);
      if (!de || !ate) toTrpc("Informe o período com datas civis válidas.");
      if (de > ate) toTrpc("A data final não pode ser anterior à inicial.");
      const loteId = Number(input.loteId) > 0 ? Number(input.loteId) : null;
      if (loteId) {
        const lote = await store.getLote(userId, loteId);
        if (!lote || lote.fazendaId !== input.fazendaId) toTrpc("Este lote não pertence à fazenda selecionada.");
      }

      const [fornecimentos, planejamentos, leituras, batidas, lotes, produtos, dietas] = await Promise.all([
        store.listFornecimentos(userId, input.fazendaId),
        store.listPlanejamentos(userId, input.fazendaId),
        store.listLeituras(userId, input.fazendaId),
        store.listBatidas(userId, input.fazendaId),
        store.listLotes(userId, input.fazendaId),
        store.listProdutos(input.fazendaId),
        store.listDietas(userId, input.fazendaId),
      ]);

      const periodo: PeriodoCivil = { de, ate };
      const loteIdsPlan = [...new Set(planejamentos.map(p => p.loteId))];
      const animaisPorLote = new Map<number, number[]>();
      for (const id of loteIdsPlan) {
        animaisPorLote.set(id, await store.listAnimaisAtivosLote(userId, id));
      }
      const animalIds = [...animaisPorLote.values()].flat();
      const pesagens = animalIds.length ? await store.listPesagens(userId, animalIds) : [];

      return montarPainelNutricao({
        periodo,
        hojeISO,
        loteId,
        fornecimentos,
        planejamentos,
        leituras,
        batidas,
        lotes,
        produtos,
        dietas,
        animaisPorLote,
        pesagens,
      });
    },
  };
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const nutricaoVisaoGeralStore: VgStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
  },
  async getLote(userId, loteId) {
    const lote = await nutricaoPlanejamentoStore.getLote(userId, loteId);
    if (!lote) return null;
    return { id: lote.id, nome: lote.nome, fazendaId: lote.fazendaId ?? 0 };
  },
  async listFornecimentos(userId, fazendaId) {
    const rows = await db.select().from(nutricaoFornecimentos).where(and(
      eq(nutricaoFornecimentos.userId, userId),
      eq(nutricaoFornecimentos.fazendaId, fazendaId),
    ));
    return rows.map((row): VgForn => ({
      id: row.id,
      fazendaId: row.fazendaId,
      loteId: row.loteId,
      planejamentoId: row.planejamentoId ?? null,
      cochoId: row.cochoId ?? null,
      cochoNomeSnapshot: row.cochoNomeSnapshot ?? null,
      tipoOrigem: row.tipoOrigem,
      produtoId: row.produtoId ?? null,
      dietaId: row.dietaId ?? null,
      origemOperacional: row.origemOperacional,
      batidaId: row.batidaId ?? null,
      data: row.data,
      hora: row.hora ?? null,
      quantidadeFornecidaKg: Number(row.quantidadeFornecidaKg),
      populacaoSnapshot: row.populacaoSnapshot,
      origemNomeSnapshot: row.origemNomeSnapshot ?? null,
      custoTotalSnapshot: num(row.custoTotalSnapshot),
      custoPorKgSnapshot: num(row.custoPorKgSnapshot),
      custoCompleto: Boolean(row.custoCompleto),
      status: row.status,
      planejamentoMetaSnapshot: row.planejamentoMetaSnapshot ?? null,
    }));
  },
  async listPlanejamentos(userId, fazendaId) {
    const rows = await db.select().from(nutricaoPlanejamentos).where(and(
      eq(nutricaoPlanejamentos.userId, userId),
      eq(nutricaoPlanejamentos.fazendaId, fazendaId),
    ));
    const [produtos, dietas] = await Promise.all([
      nutricaoPlanejamentoStore.listProdutosFazenda(fazendaId),
      db.select({ id: nutricaoDietas.id, nome: nutricaoDietas.nome }).from(nutricaoDietas).where(and(
        eq(nutricaoDietas.userId, userId),
        eq(nutricaoDietas.fazendaId, fazendaId),
      )),
    ]);
    const nomeProduto = new Map(produtos.map(p => [p.produtoId, p.nome]));
    const nomeDieta = new Map(dietas.map(d => [d.id, d.nome]));
    return rows.map((row): VgPlan => ({
      id: row.id,
      fazendaId: row.fazendaId,
      loteId: row.loteId,
      tipoOrigem: row.tipoOrigem,
      produtoId: row.produtoId ?? null,
      dietaId: row.dietaId ?? null,
      modalidadeMeta: row.modalidadeMeta,
      valorMeta: num(row.valorMeta),
      frequencia: row.frequencia,
      tratosPorDia: row.tratosPorDia ?? null,
      frequenciaIntervaloDias: row.frequenciaIntervaloDias ?? null,
      frequenciaDiasSemana: parseDiasSemana(row.frequenciaDiasSemana),
      dataInicio: row.dataInicio,
      dataFim: row.dataFim ?? null,
      status: row.status,
      origemNome: row.tipoOrigem === "dieta"
        ? (nomeDieta.get(row.dietaId ?? 0) ?? row.nome ?? `Dieta #${row.dietaId}`)
        : (nomeProduto.get(row.produtoId ?? 0) ?? row.nome ?? `Produto #${row.produtoId}`),
    }));
  },
  async listLeituras(userId, fazendaId) {
    const rows = await db.select().from(nutricaoCochoLeituras).where(and(
      eq(nutricaoCochoLeituras.userId, userId),
      eq(nutricaoCochoLeituras.fazendaId, fazendaId),
    ));
    return rows.map((row): VgLeitura => ({
      id: row.id,
      fazendaId: row.fazendaId,
      cochoId: row.cochoId,
      loteId: row.loteId ?? null,
      fornecimentoId: row.fornecimentoId ?? null,
      data: row.data,
      hora: row.hora ?? null,
      sobraKg: row.sobraKg == null ? null : Number(row.sobraKg),
      status: row.status,
      escore: row.escore ?? null,
      cochoNomeSnapshot: row.cochoNomeSnapshot ?? null,
      loteNomeSnapshot: row.loteNomeSnapshot ?? null,
    }));
  },
  async listBatidas(userId, fazendaId) {
    const rows = await db.select().from(nutricaoBatidas).where(and(
      eq(nutricaoBatidas.userId, userId),
      eq(nutricaoBatidas.fazendaId, fazendaId),
    ));
    return rows.map((row): VgBatida => ({
      id: row.id,
      fazendaId: row.fazendaId,
      dietaId: row.dietaId,
      dietaNomeSnapshot: row.dietaNomeSnapshot ?? null,
      data: row.data,
      quantidadePreparadaKg: Number(row.quantidadePreparadaKg),
      status: row.status,
    }));
  },
  async listLotes(userId, fazendaId) {
    const rows = await db.select().from(lotes).where(and(
      eq(lotes.userId, userId),
      eq(lotes.fazendaId, fazendaId),
    ));
    return rows.map(l => ({ id: l.id, nome: l.nome, fazendaId: l.fazendaId ?? fazendaId }));
  },
  async listProdutos(fazendaId) {
    return nutricaoPlanejamentoStore.listProdutosFazenda(fazendaId);
  },
  async listDietas(userId, fazendaId) {
    return nutricaoPlanejamentoStore.listDietasFazenda(userId, fazendaId);
  },
  async listAnimaisAtivosLote(userId, loteId) {
    return nutricaoPlanejamentoStore.listAnimaisAtivosLote(userId, loteId);
  },
  async listPesagens(userId, animalIds) {
    return nutricaoPlanejamentoStore.listPesagensAnimais(userId, animalIds);
  },
};

export const nutricaoVisaoGeralService = createNutricaoVisaoGeralService(nutricaoVisaoGeralStore);
