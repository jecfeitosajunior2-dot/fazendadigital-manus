import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  animais,
  estoque,
  estoqueMovimentacoes,
  lotes,
  nutricaoBatidas,
  nutricaoDietaIngredientes,
  nutricaoCochos,
  nutricaoDietas,
  nutricaoFornecimentoIngredientes,
  nutricaoFornecimentos,
  nutricaoPlanejamentos,
} from "../drizzle/schema";
import { produtoControlaSaldo } from "../shared/estoqueControle";
import {
  calcularPreviewFornecimento,
  MSG_FORN_BATIDA_SALDO,
  MSG_FORN_JA_ESTORNADO,
  MSG_FORN_MOTIVO,
  MSG_FORN_NAO_EDITAR,
  MSG_FORN_NAO_ENCONTRADO,
  MSG_FORN_SALDO,
  MSG_FORN_SALDO_DIETA,
  NUTRICAO_FORN_MANEJO,
  NUTRICAO_FORN_TIPO_SAIDA,
  normalizarHoraFornecimento,
  oferecidoPorCabeca,
  planejamentoVigenteNaData,
  validarFornecimentoInput,
  formatarIdentificacaoCocho,
  type NutricaoFornBatidaRef,
  type NutricaoFornEstoqueRef,
  type NutricaoFornInput,
  type NutricaoFornPlanejamentoRef,
  type NutricaoFornStatus,
} from "../shared/nutricaoFornecimentos";
import {
  calcularQuantidadeDistribuidaKg,
  calcularSaldoBatida,
} from "../shared/nutricaoBatidas";
import type { NutricaoCochoRef } from "../shared/nutricaoCochos";
import {
  formatarMetaPlan,
  hojeISODateLocal,
  normalizarDataCivil,
  origemNormalizada,
  type NutricaoPlanDietaRef,
  type NutricaoPlanLoteRef,
} from "../shared/nutricaoPlanejamento";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type FornPersistido = {
  id: number;
  userId: number;
  fazendaId: number;
  loteId: number;
  planejamentoId: number | null;
  cochoId: number | null;
  cochoNomeSnapshot: string | null;
  tipoOrigem: string;
  produtoId: number | null;
  dietaId: number | null;
  origemOperacional: string;
  batidaId: number | null;
  data: string;
  hora: string | null;
  quantidadeFornecidaKg: string;
  populacaoSnapshot: number;
  origemNomeSnapshot: string | null;
  custoUnitarioSnapshot: string | null;
  custoTotalSnapshot: string | null;
  custoPorKgSnapshot: string | null;
  custoCompleto: boolean;
  planejamentoMetaSnapshot: string | null;
  planejamentoModalidadeSnapshot: string | null;
  planejamentoNecessidadeKgSnapshot: string | null;
  observacoes: string | null;
  status: NutricaoFornStatus;
  motivoEstorno: string | null;
  observacaoEstorno: string | null;
  estornadoEm?: Date | string | null;
};

export type FornIngPersistido = {
  fornecimentoId: number;
  produtoId: number;
  produtoNomeSnapshot: string | null;
  quantidadeKg: string;
  quantidadeUnidade: string;
  unidadeSnapshot: string | null;
  proporcaoSnapshot: string | null;
  custoUnitarioSnapshot: string | null;
  custoTotalSnapshot: string | null;
  custoConhecido: boolean;
  ordem: number;
};

export type FornMovPersistido = {
  id: number;
  fornecimentoId: number;
  estoqueId: number;
  quantidade: string;
  tipo: string | null;
  status: string;
  produtoNome?: string | null;
  unidadeEstoqueSnapshot?: string | null;
  conteudoPorUnidadeSnapshot?: string | null;
  unidadeConteudoSnapshot?: string | null;
  quantidadeFisicaSnapshot?: string | null;
  unidadeFisicaSnapshot?: string | null;
};

export type FornTx = {
  insertFornecimento(row: Omit<FornPersistido, "id">): Promise<number>;
  insertIngredientes(rows: FornIngPersistido[]): Promise<void>;
  debitarEstoque(estoqueId: number, quantidadeUnidade: number): Promise<void>;
  insertSaida(row: {
    fornecimentoId: number;
    grupoId: string;
    estoqueId: number;
    fazendaId: number;
    userId: number;
    registradoPor: string;
    data: string;
    quantidadeUnidade: number;
    valorTotal?: number | null;
    destino?: string | null;
    unidadeEstoqueSnapshot?: string | null;
    conteudoPorUnidadeSnapshot?: string | number | null;
    unidadeConteudoSnapshot?: string | null;
    quantidadeFisicaSnapshot?: string | number | null;
    unidadeFisicaSnapshot?: string | null;
  }): Promise<number>;
  listMovimentacoesAtivas(fornecimentoId: number): Promise<FornMovPersistido[]>;
  marcarEstornadas(ids: number[]): Promise<void>;
  insertEstorno(row: {
    fornecimentoId: number;
    grupoId: string;
    originalGrupoId: string;
    estoqueId: number;
    fazendaId: number;
    userId: number;
    registradoPor: string;
    data: string;
    quantidadeUnidade: number;
    motivo: string;
    unidadeEstoqueSnapshot?: string | null;
    conteudoPorUnidadeSnapshot?: string | number | null;
    unidadeConteudoSnapshot?: string | null;
    quantidadeFisicaSnapshot?: string | number | null;
    unidadeFisicaSnapshot?: string | null;
  }): Promise<void>;
  creditarEstoque(estoqueId: number, quantidadeUnidade: number): Promise<void>;
  setEstornado(id: number, patch: { motivoEstorno: string; observacaoEstorno: string | null; estornadoPorUserId: number }): Promise<void>;
  lockBatida(id: number): Promise<NutricaoFornBatidaRef | null>;
};

export type FornStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  getLote(userId: number, loteId: number): Promise<NutricaoPlanLoteRef | null>;
  listAnimaisAtivosLote(userId: number, loteId: number): Promise<number[]>;
  listProdutosFazenda(fazendaId: number): Promise<NutricaoFornEstoqueRef[]>;
  getDieta(userId: number, dietaId: number): Promise<NutricaoPlanDietaRef | null>;
  getPlanejamento(userId: number, id: number): Promise<NutricaoFornPlanejamentoRef | null>;
  getCocho(userId: number, id: number): Promise<NutricaoCochoRef | null>;
  getBatida(userId: number, id: number): Promise<NutricaoFornBatidaRef | null>;
  listPlanejamentosLote(userId: number, fazendaId: number, loteId: number): Promise<NutricaoFornPlanejamentoRef[]>;
  find(userId: number, id: number): Promise<FornPersistido | null>;
  list(userId: number, fazendaId: number): Promise<FornPersistido[]>;
  listIngredientes(fornecimentoId: number): Promise<FornIngPersistido[]>;
  listMovimentacoes(fornecimentoId: number): Promise<FornMovPersistido[]>;
  transaction<T>(fn: (tx: FornTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

export function createNutricaoFornecimentosService(store: FornStore) {
  async function ctxDe(userId: number, input: NutricaoFornInput) {
    const lote = await store.getLote(userId, input.loteId);
    const origem = origemNormalizada(input);
    const produtos = await store.listProdutosFazenda(input.fazendaId);
    const produto = origem.produtoId ? produtos.find(p => p.produtoId === origem.produtoId) ?? null : null;
    const dieta = origem.dietaId ? await store.getDieta(userId, origem.dietaId) : null;
    const planejamento = input.planejamentoId
      ? await store.getPlanejamento(userId, input.planejamentoId)
      : null;
    const cocho = Number(input.cochoId) > 0
      ? await store.getCocho(userId, Number(input.cochoId))
      : null;
    const batida = Number(input.batidaId) > 0
      ? await store.getBatida(userId, Number(input.batidaId))
      : null;
    return { lote, produto, dieta, planejamento, produtos, cocho, batida };
  }

  async function previewDe(userId: number, input: NutricaoFornInput, hojeISO: string) {
    await store.assertFazenda(userId, input.fazendaId);
    const ctx = await ctxDe(userId, input);
    const check = validarFornecimentoInput(input, { ...ctx, hojeISO });
    const animalIds = ctx.lote ? await store.listAnimaisAtivosLote(userId, input.loteId) : [];
    const produtosPorId = new Map(ctx.produtos.map(p => [p.produtoId, p]));
    const preview = calcularPreviewFornecimento({
      quantidadeKg: input.quantidadeFornecidaKg,
      tipoOrigem: input.tipoOrigem,
      animalIds,
      produto: ctx.produto,
      dieta: ctx.dieta,
      produtosPorId,
      planejamento: ctx.planejamento,
      origemOperacional: input.origemOperacional,
      batida: ctx.batida,
    });
    return { check, preview, ctx, animalIds };
  }

  return {
    async listar(
      userId: number,
      input: {
        fazendaId: number;
        loteId?: number;
        tipoOrigem?: string;
        status?: NutricaoFornStatus;
        dataInicio?: string;
        dataFim?: string;
      },
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      let rows = await store.list(userId, input.fazendaId);
      if (input.loteId) rows = rows.filter(r => r.loteId === input.loteId);
      if (input.tipoOrigem) rows = rows.filter(r => r.tipoOrigem === input.tipoOrigem);
      if (input.status) rows = rows.filter(r => r.status === input.status);
      if (input.dataInicio) rows = rows.filter(r => r.data >= input.dataInicio!);
      if (input.dataFim) rows = rows.filter(r => r.data <= input.dataFim!);
      const out = [];
      for (const row of rows) {
        const lote = await store.getLote(userId, row.loteId);
        out.push({
          ...row,
          loteNome: lote?.nome ?? `Lote #${row.loteId}`,
          oferecidoPorCabeca: oferecidoPorCabeca(Number(row.quantidadeFornecidaKg), row.populacaoSnapshot),
        });
      }
      return out;
    },

    async obter(userId: number, id: number) {
      const row = await store.find(userId, id);
      if (!row) toTrpc(MSG_FORN_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, row.fazendaId);
      const lote = await store.getLote(userId, row.loteId);
      const ingredientes = await store.listIngredientes(row.id);
      const movimentacoes = await store.listMovimentacoes(row.id);
      const produtos = await store.listProdutosFazenda(row.fazendaId);
      const nomePorEstoque = new Map(produtos.map(p => [p.estoqueId, p.nome]));
      return {
        ...row,
        loteNome: lote?.nome ?? `Lote #${row.loteId}`,
        oferecidoPorCabeca: oferecidoPorCabeca(Number(row.quantidadeFornecidaKg), row.populacaoSnapshot),
        ingredientes,
        movimentacoes: movimentacoes.map(m => ({
          ...m,
          produtoNome: m.produtoNome ?? nomePorEstoque.get(m.estoqueId) ?? `Estoque #${m.estoqueId}`,
        })),
      };
    },

    async listarPlanejamentos(userId: number, fazendaId: number, loteId: number, data: string) {
      await store.assertFazenda(userId, fazendaId);
      const todos = await store.listPlanejamentosLote(userId, fazendaId, loteId);
      return todos.filter(p => planejamentoVigenteNaData(p, data));
    },

    async preview(userId: number, input: NutricaoFornInput, hojeISO = hojeISODateLocal()) {
      const { check, preview } = await previewDe(userId, input, hojeISO);
      return { ok: check.ok, message: check.ok ? null : check.message, preview };
    },

    async confirmar(
      userId: number,
      registradoPor: string,
      input: NutricaoFornInput,
      hojeISO = hojeISODateLocal(),
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      const { check, preview, ctx } = await previewDe(userId, input, hojeISO);
      if (!check.ok) toTrpc(check.message);
      if (!preview.podeConfirmar) toTrpc(preview.motivoBloqueio ?? MSG_FORN_SALDO);
      const origem = origemNormalizada(input);
      const op = input.origemOperacional === "batida" ? "batida" : "direta";
      const origemNome = op === "batida"
        ? (ctx.batida?.dietaNomeSnapshot ?? ctx.dieta?.nome ?? "Dieta")
        : origem.tipoOrigem === "dieta" ? (ctx.dieta?.nome ?? "Dieta") : (ctx.produto?.nome ?? "Produto");

      const id = await store.transaction(async tx => {
        let custo = preview.custo;
        if (op === "batida") {
          const locked = await tx.lockBatida(Number(input.batidaId));
          if (!locked || locked.status !== "confirmado") {
            throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FORN_BATIDA_SALDO });
          }
          if (input.quantidadeFornecidaKg > locked.saldoDisponivelKg + 1e-9) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FORN_BATIDA_SALDO });
          }
          if (locked.custoCompleto && locked.custoPorKgSnapshot != null) {
            custo = {
              completo: true,
              custoTotal: Number((input.quantidadeFornecidaKg * locked.custoPorKgSnapshot).toFixed(2)),
              custoPorKg: locked.custoPorKgSnapshot,
              mensagem: null,
            };
          } else {
            custo = { completo: false, custoTotal: null, custoPorKg: null, mensagem: "Custo incompleto" };
          }
        }

        const fornId = await tx.insertFornecimento({
          userId,
          fazendaId: input.fazendaId,
          loteId: input.loteId,
          planejamentoId: input.planejamentoId ?? null,
          cochoId: Number(input.cochoId) > 0 ? Number(input.cochoId) : null,
          cochoNomeSnapshot: ctx.cocho
            ? formatarIdentificacaoCocho(ctx.cocho.nome, ctx.cocho.codigo)
            : null,
          tipoOrigem: origem.tipoOrigem ?? input.tipoOrigem,
          produtoId: origem.produtoId,
          dietaId: origem.dietaId,
          origemOperacional: op,
          batidaId: op === "batida" ? Number(input.batidaId) : null,
          data: normalizarDataCivil(input.data)!,
          hora: normalizarHoraFornecimento(input.hora ?? null),
          quantidadeFornecidaKg: String(input.quantidadeFornecidaKg),
          populacaoSnapshot: preview.animaisAtuais,
          origemNomeSnapshot: origemNome,
          custoUnitarioSnapshot: custo.custoPorKg != null ? String(custo.custoPorKg) : null,
          custoTotalSnapshot: custo.custoTotal != null ? String(custo.custoTotal) : null,
          custoPorKgSnapshot: custo.custoPorKg != null ? String(custo.custoPorKg) : null,
          custoCompleto: custo.completo,
          planejamentoMetaSnapshot: preview.planejamento?.metaLabel ?? null,
          planejamentoModalidadeSnapshot: preview.planejamento?.modalidade ?? null,
          planejamentoNecessidadeKgSnapshot:
            preview.planejamento?.necessidadeKg != null ? String(preview.planejamento.necessidadeKg) : null,
          observacoes: input.observacoes?.trim() || null,
          status: "confirmado",
          motivoEstorno: null,
          observacaoEstorno: null,
        });

        if (op === "batida") {
          return fornId;
        }

        if (origem.tipoOrigem === "dieta") {
          await tx.insertIngredientes(preview.baixas.map((b, ordem) => ({
            fornecimentoId: fornId,
            produtoId: b.produtoId,
            produtoNomeSnapshot: b.nome,
            quantidadeKg: String(b.quantidadeKg),
            quantidadeUnidade: String(b.quantidadeUnidade),
            unidadeSnapshot: b.unidade,
            proporcaoSnapshot: b.proporcao != null ? String(b.proporcao) : null,
            custoUnitarioSnapshot: b.custoUnitarioPorKg != null ? String(b.custoUnitarioPorKg) : null,
            custoTotalSnapshot: b.custoTotal != null ? String(b.custoTotal) : null,
            custoConhecido: b.custoConhecido,
            ordem,
          })));
        }

        const grupoId = `forn-${fornId}`;
        for (const baixa of preview.baixas) {
          if (!(baixa.quantidadeUnidade > 0) || !baixa.estoqueId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: preview.motivoBloqueio ?? MSG_FORN_SALDO_DIETA });
          }
          await tx.debitarEstoque(baixa.estoqueId, baixa.quantidadeUnidade);
          await tx.insertSaida({
            fornecimentoId: fornId,
            grupoId,
            estoqueId: baixa.estoqueId,
            fazendaId: input.fazendaId,
            userId,
            registradoPor,
            data: normalizarDataCivil(input.data)!,
            quantidadeUnidade: baixa.quantidadeUnidade,
            valorTotal: baixa.custoTotal,
            destino: ctx.lote?.nome ?? null,
            unidadeEstoqueSnapshot: baixa.snapshotConversao?.unidadeEstoqueSnapshot ?? null,
            conteudoPorUnidadeSnapshot: baixa.snapshotConversao?.conteudoPorUnidadeSnapshot ?? null,
            unidadeConteudoSnapshot: baixa.snapshotConversao?.unidadeConteudoSnapshot ?? null,
            quantidadeFisicaSnapshot: baixa.snapshotConversao?.quantidadeFisicaSnapshot ?? null,
            unidadeFisicaSnapshot: baixa.snapshotConversao?.unidadeFisicaSnapshot ?? null,
          });
        }
        return fornId;
      });

      return { success: true as const, id };
    },

    async estornar(
      userId: number,
      registradoPor: string,
      input: { id: number; motivo: string; observacao?: string | null },
      hojeISO = hojeISODateLocal(),
    ) {
      const atual = await store.find(userId, input.id);
      if (!atual) toTrpc(MSG_FORN_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status === "estornado") toTrpc(MSG_FORN_JA_ESTORNADO);
      const motivo = input.motivo.trim();
      if (!motivo) toTrpc(MSG_FORN_MOTIVO);

      await store.transaction(async tx => {
        if (atual.origemOperacional === "batida") {
          await tx.setEstornado(atual.id, {
            motivoEstorno: motivo.slice(0, 255),
            observacaoEstorno: input.observacao?.trim() || null,
            estornadoPorUserId: userId,
          });
          return;
        }
        const movs = await tx.listMovimentacoesAtivas(atual.id);
        if (movs.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não há movimentações ativas para estornar." });
        }
        const grupoId = `e-forn-${atual.id}`;
        const originalGrupoId = `forn-${atual.id}`;
        for (const mov of movs) {
          const qtd = Math.abs(Number(mov.quantidade));
          await tx.creditarEstoque(mov.estoqueId, qtd);
          const fisicaOrig = mov.quantidadeFisicaSnapshot == null ? null : Number(mov.quantidadeFisicaSnapshot);
          await tx.insertEstorno({
            fornecimentoId: atual.id,
            grupoId,
            originalGrupoId,
            estoqueId: mov.estoqueId,
            fazendaId: atual.fazendaId,
            userId,
            registradoPor,
            data: hojeISO,
            quantidadeUnidade: qtd,
            motivo,
            unidadeEstoqueSnapshot: mov.unidadeEstoqueSnapshot ?? null,
            conteudoPorUnidadeSnapshot: mov.conteudoPorUnidadeSnapshot ?? null,
            unidadeConteudoSnapshot: mov.unidadeConteudoSnapshot ?? null,
            quantidadeFisicaSnapshot: fisicaOrig == null || Number.isNaN(fisicaOrig) ? null : Math.abs(fisicaOrig),
            unidadeFisicaSnapshot: mov.unidadeFisicaSnapshot ?? null,
          });
        }
        await tx.marcarEstornadas(movs.map(m => m.id));
        await tx.setEstornado(atual.id, {
          motivoEstorno: motivo.slice(0, 255),
          observacaoEstorno: input.observacao?.trim() || null,
          estornadoPorUserId: userId,
        });
      });
      return { success: true as const, status: "estornado" as const };
    },

    recusarEdicao() {
      toTrpc(MSG_FORN_NAO_EDITAR);
    },
  };
}

async function dietaComIngredientes(userId: number, dietaId: number): Promise<NutricaoPlanDietaRef | null> {
  const [dieta] = await db
    .select()
    .from(nutricaoDietas)
    .where(and(eq(nutricaoDietas.id, dietaId), eq(nutricaoDietas.userId, userId)))
    .limit(1);
  if (!dieta) return null;
  const ings = await db.select().from(nutricaoDietaIngredientes).where(eq(nutricaoDietaIngredientes.dietaId, dieta.id));
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

async function carregarBatidaRef(userId: number, id: number): Promise<NutricaoFornBatidaRef | null> {
  const [row] = await db.select().from(nutricaoBatidas).where(and(
    eq(nutricaoBatidas.id, id), eq(nutricaoBatidas.userId, userId),
  )).limit(1);
  if (!row) return null;
  const forns = await db.select({
    quantidadeFornecidaKg: nutricaoFornecimentos.quantidadeFornecidaKg,
    status: nutricaoFornecimentos.status,
  }).from(nutricaoFornecimentos).where(eq(nutricaoFornecimentos.batidaId, id));
  const distribuida = calcularQuantidadeDistribuidaKg(
    forns.map(f => ({ quantidadeFornecidaKg: Number(f.quantidadeFornecidaKg), status: f.status })),
  );
  const preparada = Number(row.quantidadePreparadaKg);
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    dietaId: row.dietaId,
    dietaNomeSnapshot: row.dietaNomeSnapshot ?? "",
    quantidadePreparadaKg: preparada,
    quantidadeDistribuidaKg: distribuida,
    saldoDisponivelKg: calcularSaldoBatida(preparada, distribuida),
    status: row.status,
    custoCompleto: Boolean(row.custoCompleto),
    custoPorKgSnapshot: row.custoKgSnapshot == null ? null : Number(row.custoKgSnapshot),
    custoTotalSnapshot: row.custoTotalSnapshot == null ? null : Number(row.custoTotalSnapshot),
  };
}

function toFornRow(row: typeof nutricaoFornecimentos.$inferSelect): FornPersistido {
  return {
    id: row.id,
    userId: row.userId,
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
    quantidadeFornecidaKg: String(row.quantidadeFornecidaKg),
    populacaoSnapshot: row.populacaoSnapshot,
    origemNomeSnapshot: row.origemNomeSnapshot ?? null,
    custoUnitarioSnapshot: row.custoUnitarioSnapshot == null ? null : String(row.custoUnitarioSnapshot),
    custoTotalSnapshot: row.custoTotalSnapshot == null ? null : String(row.custoTotalSnapshot),
    custoPorKgSnapshot: row.custoPorKgSnapshot == null ? null : String(row.custoPorKgSnapshot),
    custoCompleto: Boolean(row.custoCompleto),
    planejamentoMetaSnapshot: row.planejamentoMetaSnapshot ?? null,
    planejamentoModalidadeSnapshot: row.planejamentoModalidadeSnapshot ?? null,
    planejamentoNecessidadeKgSnapshot:
      row.planejamentoNecessidadeKgSnapshot == null ? null : String(row.planejamentoNecessidadeKgSnapshot),
    observacoes: row.observacoes ?? null,
    status: row.status === "estornado" ? "estornado" : "confirmado",
    motivoEstorno: row.motivoEstorno ?? null,
    observacaoEstorno: row.observacaoEstorno ?? null,
    estornadoEm: row.estornadoEm ?? null,
  };
}

export const nutricaoFornecimentosStore: FornStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
  },
  async getLote(userId, loteId) {
    const [row] = await db.select().from(lotes).where(and(eq(lotes.id, loteId), eq(lotes.userId, userId))).limit(1);
    if (!row) return null;
    return { id: row.id, userId: row.userId, fazendaId: row.fazendaId ?? null, ativo: row.ativo !== false, nome: row.nome };
  },
  async listAnimaisAtivosLote(userId, loteId) {
    const rows = await db.select({ id: animais.id }).from(animais).where(and(
      eq(animais.userId, userId), eq(animais.loteId, loteId), eq(animais.status, "ativo"),
    ));
    return rows.map(r => r.id);
  },
  async listProdutosFazenda(fazendaId) {
    const rows = await db.select().from(estoque).where(eq(estoque.fazendaId, fazendaId));
    return rows
      .filter(r => r.produtoId != null && r.produtoId > 0 && (r.situacao ?? "ativo") !== "inativo")
      .map(r => ({
        estoqueId: r.id,
        produtoId: Number(r.produtoId),
        nome: r.nome,
        unidade: r.unidade ?? null,
        valorUnitario: r.valorUnitario ?? null,
        quantidade: r.quantidade ?? null,
        controlarSaldo: produtoControlaSaldo(r.controlarSaldo),
        embalagens: r.embalagens ?? null,
        vinculadoFazenda: true,
      }));
  },
  async getDieta(userId, dietaId) {
    return dietaComIngredientes(userId, dietaId);
  },
  async getBatida(userId, id) {
    return carregarBatidaRef(userId, id);
  },
  async getCocho(userId, id) {
    const [row] = await db.select().from(nutricaoCochos).where(and(
      eq(nutricaoCochos.id, id), eq(nutricaoCochos.userId, userId),
    )).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      fazendaId: row.fazendaId,
      nome: row.nome,
      codigo: row.codigo ?? null,
      status: row.status,
    };
  },
  async getPlanejamento(userId, id) {
    const [row] = await db.select().from(nutricaoPlanejamentos).where(and(
      eq(nutricaoPlanejamentos.id, id), eq(nutricaoPlanejamentos.userId, userId),
    )).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      fazendaId: row.fazendaId,
      loteId: row.loteId,
      tipoOrigem: row.tipoOrigem,
      produtoId: row.produtoId,
      dietaId: row.dietaId,
      modalidadeMeta: row.modalidadeMeta,
      valorMeta: row.valorMeta == null ? null : Number(row.valorMeta),
      status: row.status,
      dataInicio: row.dataInicio,
      dataFim: row.dataFim,
    };
  },
  async listPlanejamentosLote(userId, fazendaId, loteId) {
    const rows = await db.select().from(nutricaoPlanejamentos).where(and(
      eq(nutricaoPlanejamentos.userId, userId),
      eq(nutricaoPlanejamentos.fazendaId, fazendaId),
      eq(nutricaoPlanejamentos.loteId, loteId),
    ));
    return rows.map(row => ({
      id: row.id,
      fazendaId: row.fazendaId,
      loteId: row.loteId,
      tipoOrigem: row.tipoOrigem,
      produtoId: row.produtoId,
      dietaId: row.dietaId,
      modalidadeMeta: row.modalidadeMeta,
      valorMeta: row.valorMeta == null ? null : Number(row.valorMeta),
      status: row.status,
      dataInicio: row.dataInicio,
      dataFim: row.dataFim,
    }));
  },
  async find(userId, id) {
    const [row] = await db.select().from(nutricaoFornecimentos).where(and(
      eq(nutricaoFornecimentos.id, id), eq(nutricaoFornecimentos.userId, userId),
    )).limit(1);
    return row ? toFornRow(row) : null;
  },
  async list(userId, fazendaId) {
    const rows = await db.select().from(nutricaoFornecimentos).where(and(
      eq(nutricaoFornecimentos.userId, userId), eq(nutricaoFornecimentos.fazendaId, fazendaId),
    )).orderBy(desc(nutricaoFornecimentos.data), desc(nutricaoFornecimentos.id));
    return rows.map(toFornRow);
  },
  async listIngredientes(fornecimentoId) {
    const rows = await db.select().from(nutricaoFornecimentoIngredientes).where(
      eq(nutricaoFornecimentoIngredientes.fornecimentoId, fornecimentoId),
    );
    return rows.map(r => ({
      fornecimentoId: r.fornecimentoId,
      produtoId: r.produtoId,
      produtoNomeSnapshot: r.produtoNomeSnapshot,
      quantidadeKg: String(r.quantidadeKg),
      quantidadeUnidade: String(r.quantidadeUnidade),
      unidadeSnapshot: r.unidadeSnapshot,
      proporcaoSnapshot: r.proporcaoSnapshot == null ? null : String(r.proporcaoSnapshot),
      custoUnitarioSnapshot: r.custoUnitarioSnapshot == null ? null : String(r.custoUnitarioSnapshot),
      custoTotalSnapshot: r.custoTotalSnapshot == null ? null : String(r.custoTotalSnapshot),
      custoConhecido: Boolean(r.custoConhecido),
      ordem: r.ordem,
    }));
  },
  async listMovimentacoes(fornecimentoId) {
    const rows = await db.select().from(estoqueMovimentacoes).where(
      eq(estoqueMovimentacoes.nutricaoFornecimentoId, fornecimentoId),
    );
    return rows.map(r => ({
      id: r.id,
      fornecimentoId,
      estoqueId: r.estoqueId,
      quantidade: String(r.quantidade),
      tipo: r.tipo ?? null,
      status: r.status ?? "ativa",
    }));
  },
  transaction(fn) {
    return db.transaction(async tx => fn({
      async insertFornecimento(row) {
        const result = await tx.insert(nutricaoFornecimentos).values({
          userId: row.userId,
          fazendaId: row.fazendaId,
          loteId: row.loteId,
          planejamentoId: row.planejamentoId,
          cochoId: row.cochoId,
          cochoNomeSnapshot: row.cochoNomeSnapshot,
          tipoOrigem: row.tipoOrigem,
          produtoId: row.produtoId,
          dietaId: row.dietaId,
          origemOperacional: row.origemOperacional,
          batidaId: row.batidaId,
          data: row.data,
          hora: row.hora,
          quantidadeFornecidaKg: row.quantidadeFornecidaKg,
          populacaoSnapshot: row.populacaoSnapshot,
          origemNomeSnapshot: row.origemNomeSnapshot,
          custoUnitarioSnapshot: row.custoUnitarioSnapshot,
          custoTotalSnapshot: row.custoTotalSnapshot,
          custoPorKgSnapshot: row.custoPorKgSnapshot,
          custoCompleto: row.custoCompleto,
          planejamentoMetaSnapshot: row.planejamentoMetaSnapshot,
          planejamentoModalidadeSnapshot: row.planejamentoModalidadeSnapshot,
          planejamentoNecessidadeKgSnapshot: row.planejamentoNecessidadeKgSnapshot,
          observacoes: row.observacoes,
          status: row.status,
          motivoEstorno: row.motivoEstorno,
          observacaoEstorno: row.observacaoEstorno,
        });
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (!Number.isFinite(id) || id <= 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar o fornecimento." });
        }
        return id;
      },
      async insertIngredientes(rows) {
        if (!rows.length) return;
        await tx.insert(nutricaoFornecimentoIngredientes).values(rows);
      },
      async debitarEstoque(estoqueId, quantidadeUnidade) {
        const [item] = await tx.select().from(estoque).where(eq(estoque.id, estoqueId));
        if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FORN_SALDO });
        const atual = Number(item.quantidade ?? 0);
        if (!produtoControlaSaldo(item.controlarSaldo)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FORN_SALDO });
        }
        const novo = atual - quantidadeUnidade;
        if (novo < -1e-9) throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FORN_SALDO });
        await tx.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, estoqueId));
      },
      async insertSaida(row) {
        const result = await tx.insert(estoqueMovimentacoes).values({
          grupoId: row.grupoId,
          estoqueId: row.estoqueId,
          fazendaId: row.fazendaId,
          userId: row.userId,
          registradoPor: row.registradoPor,
          tipo: NUTRICAO_FORN_TIPO_SAIDA,
          dataMovimentacao: row.data,
          quantidade: String(-Math.abs(row.quantidadeUnidade)),
          destino: row.destino ?? undefined,
          manejo: NUTRICAO_FORN_MANEJO,
          valor: row.valorTotal != null ? String(row.valorTotal) : undefined,
          status: "ativa",
          nutricaoFornecimentoId: row.fornecimentoId,
          unidadeEstoqueSnapshot: row.unidadeEstoqueSnapshot ?? undefined,
          conteudoPorUnidadeSnapshot:
            row.conteudoPorUnidadeSnapshot != null ? String(row.conteudoPorUnidadeSnapshot) : undefined,
          unidadeConteudoSnapshot: row.unidadeConteudoSnapshot ?? undefined,
          quantidadeFisicaSnapshot:
            row.quantidadeFisicaSnapshot != null ? String(row.quantidadeFisicaSnapshot) : undefined,
          unidadeFisicaSnapshot: row.unidadeFisicaSnapshot ?? undefined,
        });
        return Number((result as any)[0]?.insertId ?? (result as any).insertId);
      },
      async listMovimentacoesAtivas(fornecimentoId) {
        const rows = await tx.select().from(estoqueMovimentacoes).where(and(
          eq(estoqueMovimentacoes.nutricaoFornecimentoId, fornecimentoId),
          eq(estoqueMovimentacoes.status, "ativa"),
        ));
        return rows.map(r => ({
          id: r.id,
          fornecimentoId,
          estoqueId: r.estoqueId,
          quantidade: String(r.quantidade),
          tipo: r.tipo ?? null,
          status: r.status ?? "ativa",
          unidadeEstoqueSnapshot: r.unidadeEstoqueSnapshot ?? null,
          conteudoPorUnidadeSnapshot: r.conteudoPorUnidadeSnapshot == null ? null : String(r.conteudoPorUnidadeSnapshot),
          unidadeConteudoSnapshot: r.unidadeConteudoSnapshot ?? null,
          quantidadeFisicaSnapshot: r.quantidadeFisicaSnapshot == null ? null : String(r.quantidadeFisicaSnapshot),
          unidadeFisicaSnapshot: r.unidadeFisicaSnapshot ?? null,
        }));
      },
      async marcarEstornadas(ids) {
        if (!ids.length) return;
        await tx.update(estoqueMovimentacoes).set({ status: "estornada" }).where(inArray(estoqueMovimentacoes.id, ids));
      },
      async insertEstorno(row) {
        await tx.insert(estoqueMovimentacoes).values({
          grupoId: row.grupoId,
          estoqueId: row.estoqueId,
          fazendaId: row.fazendaId,
          userId: row.userId,
          registradoPor: row.registradoPor,
          tipo: NUTRICAO_FORN_TIPO_SAIDA,
          dataMovimentacao: row.data,
          quantidade: String(Math.abs(row.quantidadeUnidade)),
          manejo: NUTRICAO_FORN_MANEJO,
          status: "estorno",
          originalGrupoId: row.originalGrupoId,
          motivoEstorno: row.motivo,
          nutricaoFornecimentoId: row.fornecimentoId,
          unidadeEstoqueSnapshot: row.unidadeEstoqueSnapshot ?? undefined,
          conteudoPorUnidadeSnapshot:
            row.conteudoPorUnidadeSnapshot != null ? String(row.conteudoPorUnidadeSnapshot) : undefined,
          unidadeConteudoSnapshot: row.unidadeConteudoSnapshot ?? undefined,
          quantidadeFisicaSnapshot:
            row.quantidadeFisicaSnapshot != null ? String(row.quantidadeFisicaSnapshot) : undefined,
          unidadeFisicaSnapshot: row.unidadeFisicaSnapshot ?? undefined,
        });
      },
      async creditarEstoque(estoqueId, quantidadeUnidade) {
        const [item] = await tx.select().from(estoque).where(eq(estoque.id, estoqueId));
        if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: "Produto não encontrado." });
        const atual = Number(item.quantidade ?? 0);
        await tx.update(estoque).set({ quantidade: String(atual + quantidadeUnidade) }).where(eq(estoque.id, estoqueId));
      },
      async setEstornado(id, patch) {
        await tx.update(nutricaoFornecimentos).set({
          status: "estornado",
          motivoEstorno: patch.motivoEstorno,
          observacaoEstorno: patch.observacaoEstorno,
          estornadoPorUserId: patch.estornadoPorUserId,
          estornadoEm: new Date(),
        }).where(eq(nutricaoFornecimentos.id, id));
      },
      async lockBatida(id) {
        await tx.execute(sql`SELECT id FROM nutricao_batidas WHERE id = ${id} FOR UPDATE`);
        const [row] = await tx.select().from(nutricaoBatidas).where(eq(nutricaoBatidas.id, id)).limit(1);
        if (!row) return null;
        const forns = await tx.select({
          quantidadeFornecidaKg: nutricaoFornecimentos.quantidadeFornecidaKg,
          status: nutricaoFornecimentos.status,
        }).from(nutricaoFornecimentos).where(eq(nutricaoFornecimentos.batidaId, id));
        const distribuida = calcularQuantidadeDistribuidaKg(
          forns.map(f => ({ quantidadeFornecidaKg: Number(f.quantidadeFornecidaKg), status: f.status })),
        );
        const preparada = Number(row.quantidadePreparadaKg);
        return {
          id: row.id,
          userId: row.userId,
          fazendaId: row.fazendaId,
          dietaId: row.dietaId,
          dietaNomeSnapshot: row.dietaNomeSnapshot ?? "",
          quantidadePreparadaKg: preparada,
          quantidadeDistribuidaKg: distribuida,
          saldoDisponivelKg: calcularSaldoBatida(preparada, distribuida),
          status: row.status,
          custoCompleto: Boolean(row.custoCompleto),
          custoPorKgSnapshot: row.custoKgSnapshot == null ? null : Number(row.custoKgSnapshot),
          custoTotalSnapshot: row.custoTotalSnapshot == null ? null : Number(row.custoTotalSnapshot),
        };
      },
    }));
  },
};

export const nutricaoFornecimentosService = createNutricaoFornecimentosService(nutricaoFornecimentosStore);
