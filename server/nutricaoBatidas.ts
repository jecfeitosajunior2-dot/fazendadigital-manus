import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  estoque,
  estoqueMovimentacoes,
  lotes,
  nutricaoBatidaIngredientes,
  nutricaoBatidas,
  nutricaoDietaIngredientes,
  nutricaoDietas,
  nutricaoFornecimentos,
} from "../drizzle/schema";
import { produtoControlaSaldo } from "../shared/estoqueControle";
import {
  alocarCustoBatidaNoFornecimento,
  batidaDisponivelParaDistribuicao,
  calcularPreviewBatida,
  calcularQuantidadeDistribuidaKg,
  calcularSaldoBatida,
  labelSituacaoBatida,
  MSG_BATIDA_COM_FORN,
  MSG_BATIDA_JA_ESTORNADA,
  MSG_BATIDA_MOTIVO,
  MSG_BATIDA_NAO_ENCONTRADA,
  MSG_BATIDA_SALDO,
  NUTRICAO_BATIDA_MANEJO,
  NUTRICAO_BATIDA_TIPO_SAIDA,
  normalizarHoraFornecimento,
  podeEstornarBatida,
  situacaoDistribuicaoBatida,
  validarBatidaInput,
  type NutricaoBatidaInput,
  type NutricaoBatidaStatus,
  type NutricaoBatidaSituacao,
} from "../shared/nutricaoBatidas";
import type { NutricaoFornEstoqueRef } from "../shared/nutricaoFornecimentos";
import {
  hojeISODateLocal,
  normalizarDataCivil,
  type NutricaoPlanDietaRef,
} from "../shared/nutricaoPlanejamento";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type BatidaPersistida = {
  id: number;
  userId: number;
  fazendaId: number;
  dietaId: number;
  data: string;
  hora: string | null;
  quantidadePreparadaKg: string;
  dietaNomeSnapshot: string | null;
  custoTotalSnapshot: string | null;
  custoKgSnapshot: string | null;
  custoCompleto: boolean;
  observacoes: string | null;
  status: NutricaoBatidaStatus;
  motivoEstorno: string | null;
  observacaoEstorno: string | null;
  estornadoEm?: Date | string | null;
};

export type BatidaIngPersistido = {
  batidaId: number;
  produtoId: number;
  produtoNomeSnapshot: string | null;
  proporcaoSnapshot: string | null;
  quantidadeKg: string;
  quantidadeUnidade: string;
  unidadeSnapshot: string | null;
  custoUnitarioSnapshot: string | null;
  custoTotalSnapshot: string | null;
  custoConhecido: boolean;
  ordem: number;
};

export type BatidaMovPersistido = {
  id: number;
  batidaId: number;
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

export type BatidaFornVinculado = {
  id: number;
  batidaId?: number;
  data: string;
  hora: string | null;
  loteId: number;
  loteNome?: string | null;
  cochoNomeSnapshot: string | null;
  quantidadeFornecidaKg: string;
  status: string;
};

export type BatidaTx = {
  insertBatida(row: Omit<BatidaPersistida, "id">): Promise<number>;
  insertIngredientes(rows: BatidaIngPersistido[]): Promise<void>;
  debitarEstoque(estoqueId: number, quantidadeUnidade: number): Promise<void>;
  insertSaida(row: {
    batidaId: number;
    grupoId: string;
    estoqueId: number;
    fazendaId: number;
    userId: number;
    registradoPor: string;
    data: string;
    quantidadeUnidade: number;
    valorTotal?: number | null;
    unidadeEstoqueSnapshot?: string | null;
    conteudoPorUnidadeSnapshot?: string | number | null;
    unidadeConteudoSnapshot?: string | null;
    quantidadeFisicaSnapshot?: string | number | null;
    unidadeFisicaSnapshot?: string | null;
  }): Promise<number>;
  listMovimentacoesAtivas(batidaId: number): Promise<BatidaMovPersistido[]>;
  marcarEstornadas(ids: number[]): Promise<void>;
  insertEstorno(row: {
    batidaId: number;
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
  contarFornecimentosConfirmados(batidaId: number): Promise<number>;
};

export type BatidaStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  listProdutosFazenda(fazendaId: number): Promise<NutricaoFornEstoqueRef[]>;
  getDieta(userId: number, dietaId: number): Promise<NutricaoPlanDietaRef | null>;
  find(userId: number, id: number): Promise<BatidaPersistida | null>;
  list(userId: number, fazendaId: number): Promise<BatidaPersistida[]>;
  listIngredientes(batidaId: number): Promise<BatidaIngPersistido[]>;
  listMovimentacoes(batidaId: number): Promise<BatidaMovPersistido[]>;
  listFornecimentos(batidaId: number): Promise<BatidaFornVinculado[]>;
  getLoteNome(userId: number, loteId: number): Promise<string | null>;
  transaction<T>(fn: (tx: BatidaTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function enriquecer(row: BatidaPersistida, fornecimentos: BatidaFornVinculado[]) {
  const preparada = Number(row.quantidadePreparadaKg);
  const distribuida = calcularQuantidadeDistribuidaKg(
    fornecimentos.map(f => ({ quantidadeFornecidaKg: Number(f.quantidadeFornecidaKg), status: f.status })),
  );
  const saldo = calcularSaldoBatida(preparada, distribuida);
  const situacao = situacaoDistribuicaoBatida(preparada, distribuida);
  return {
    ...row,
    quantidadePreparadaKgNum: preparada,
    quantidadeDistribuidaKg: distribuida,
    saldoDisponivelKg: saldo,
    situacao,
    situacaoLabel: labelSituacaoBatida(situacao),
    podeEstornar: podeEstornarBatida(row.status, fornecimentos.filter(f => f.status === "confirmado").length).ok,
    disponivelDistribuicao: batidaDisponivelParaDistribuicao({
      status: row.status,
      saldoDisponivelKg: saldo,
    }),
  };
}

export function createNutricaoBatidasService(store: BatidaStore) {
  async function previewDe(userId: number, input: NutricaoBatidaInput, hojeISO: string) {
    await store.assertFazenda(userId, input.fazendaId);
    const produtos = await store.listProdutosFazenda(input.fazendaId);
    const produtosPorId = new Map(produtos.map(p => [p.produtoId, p]));
    const dieta = input.dietaId ? await store.getDieta(userId, input.dietaId) : null;
    const check = validarBatidaInput(input, { dieta, produtosPorId, hojeISO });
    const preview = calcularPreviewBatida({
      quantidadePreparadaKg: input.quantidadePreparadaKg,
      dieta,
      produtosPorId,
    });
    return { check, preview, dieta, produtos };
  }

  return {
    async listar(
      userId: number,
      input: {
        fazendaId: number;
        dietaId?: number;
        status?: NutricaoBatidaStatus;
        situacao?: NutricaoBatidaSituacao;
        dataInicio?: string;
        dataFim?: string;
      },
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      let rows = await store.list(userId, input.fazendaId);
      if (input.dietaId) rows = rows.filter(r => r.dietaId === input.dietaId);
      if (input.status) rows = rows.filter(r => r.status === input.status);
      if (input.dataInicio) rows = rows.filter(r => r.data >= input.dataInicio!);
      if (input.dataFim) rows = rows.filter(r => r.data <= input.dataFim!);
      const out = [];
      for (const row of rows) {
        const forns = await store.listFornecimentos(row.id);
        const item = enriquecer(row, forns);
        if (input.situacao && item.situacao !== input.situacao) continue;
        out.push(item);
      }
      return out;
    },

    async listarDisponiveis(userId: number, fazendaId: number) {
      const rows = await this.listar(userId, { fazendaId, status: "confirmado" });
      return rows.filter(r => r.disponivelDistribuicao);
    },

    async obter(userId: number, id: number) {
      const row = await store.find(userId, id);
      if (!row) toTrpc(MSG_BATIDA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, row.fazendaId);
      const ingredientes = await store.listIngredientes(row.id);
      const movimentacoes = await store.listMovimentacoes(row.id);
      const fornecimentos = await store.listFornecimentos(row.id);
      const produtos = await store.listProdutosFazenda(row.fazendaId);
      const nomePorEstoque = new Map(produtos.map(p => [p.estoqueId, p.nome]));
      const fornsComLote = [];
      for (const f of fornecimentos) {
        const loteNome = f.loteNome ?? (await store.getLoteNome(userId, f.loteId)) ?? `Lote #${f.loteId}`;
        fornsComLote.push({ ...f, loteNome });
      }
      return {
        ...enriquecer(row, fornecimentos),
        ingredientes,
        movimentacoes: movimentacoes.map(m => ({
          ...m,
          produtoNome: m.produtoNome ?? nomePorEstoque.get(m.estoqueId) ?? `Estoque #${m.estoqueId}`,
        })),
        fornecimentos: fornsComLote,
        custoAlocadoAosLotes: fornsComLote
          .filter(f => f.status === "confirmado")
          .map(f => ({
            fornecimentoId: f.id,
            ...alocarCustoBatidaNoFornecimento(
              { custoCompleto: row.custoCompleto, custoPorKgSnapshot: row.custoKgSnapshot == null ? null : Number(row.custoKgSnapshot) },
              Number(f.quantidadeFornecidaKg),
            ),
          })),
      };
    },

    async preview(userId: number, input: NutricaoBatidaInput, hojeISO = hojeISODateLocal()) {
      const { check, preview } = await previewDe(userId, input, hojeISO);
      return { ok: check.ok, message: check.ok ? null : check.message, preview };
    },

    async confirmar(
      userId: number,
      registradoPor: string,
      input: NutricaoBatidaInput,
      hojeISO = hojeISODateLocal(),
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      const { check, preview, dieta } = await previewDe(userId, input, hojeISO);
      if (!check.ok) toTrpc(check.message);
      if (!preview.podeConfirmar) toTrpc(preview.motivoBloqueio ?? MSG_BATIDA_SALDO);

      const id = await store.transaction(async tx => {
        const batidaId = await tx.insertBatida({
          userId,
          fazendaId: input.fazendaId,
          dietaId: input.dietaId,
          data: normalizarDataCivil(input.data)!,
          hora: normalizarHoraFornecimento(input.hora ?? null),
          quantidadePreparadaKg: String(input.quantidadePreparadaKg),
          dietaNomeSnapshot: dieta?.nome ?? preview.dietaNome,
          custoTotalSnapshot: preview.custo.custoTotal != null ? String(preview.custo.custoTotal) : null,
          custoKgSnapshot: preview.custo.custoPorKg != null ? String(preview.custo.custoPorKg) : null,
          custoCompleto: preview.custo.completo,
          observacoes: input.observacoes?.trim() || null,
          status: "confirmado",
          motivoEstorno: null,
          observacaoEstorno: null,
        });

        await tx.insertIngredientes(preview.baixas.map((b, ordem) => ({
          batidaId,
          produtoId: b.produtoId,
          produtoNomeSnapshot: b.nome,
          proporcaoSnapshot: b.proporcao != null ? String(b.proporcao) : null,
          quantidadeKg: String(b.quantidadeKg),
          quantidadeUnidade: String(b.quantidadeUnidade),
          unidadeSnapshot: b.unidade,
          custoUnitarioSnapshot: b.custoUnitarioPorKg != null ? String(b.custoUnitarioPorKg) : null,
          custoTotalSnapshot: b.custoTotal != null ? String(b.custoTotal) : null,
          custoConhecido: b.custoConhecido,
          ordem,
        })));

        const grupoId = `bat-${batidaId}`;
        for (const baixa of preview.baixas) {
          if (!(baixa.quantidadeUnidade > 0) || !baixa.estoqueId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: preview.motivoBloqueio ?? MSG_BATIDA_SALDO });
          }
          await tx.debitarEstoque(baixa.estoqueId, baixa.quantidadeUnidade);
          await tx.insertSaida({
            batidaId,
            grupoId,
            estoqueId: baixa.estoqueId,
            fazendaId: input.fazendaId,
            userId,
            registradoPor,
            data: normalizarDataCivil(input.data)!,
            quantidadeUnidade: baixa.quantidadeUnidade,
            valorTotal: baixa.custoTotal,
            unidadeEstoqueSnapshot: baixa.snapshotConversao?.unidadeEstoqueSnapshot ?? null,
            conteudoPorUnidadeSnapshot: baixa.snapshotConversao?.conteudoPorUnidadeSnapshot ?? null,
            unidadeConteudoSnapshot: baixa.snapshotConversao?.unidadeConteudoSnapshot ?? null,
            quantidadeFisicaSnapshot: baixa.snapshotConversao?.quantidadeFisicaSnapshot ?? null,
            unidadeFisicaSnapshot: baixa.snapshotConversao?.unidadeFisicaSnapshot ?? null,
          });
        }
        return batidaId;
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
      if (!atual) toTrpc(MSG_BATIDA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status === "estornado") toTrpc(MSG_BATIDA_JA_ESTORNADA);
      const motivo = input.motivo.trim();
      if (!motivo) toTrpc(MSG_BATIDA_MOTIVO);

      await store.transaction(async tx => {
        const confirmados = await tx.contarFornecimentosConfirmados(atual.id);
        const lock = podeEstornarBatida(atual.status, confirmados);
        if (!lock.ok) toTrpc(lock.message);
        const movs = await tx.listMovimentacoesAtivas(atual.id);
        if (movs.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não há movimentações ativas para estornar." });
        }
        const grupoId = `e-bat-${atual.id}`;
        const originalGrupoId = `bat-${atual.id}`;
        for (const mov of movs) {
          const qtd = Math.abs(Number(mov.quantidade));
          await tx.creditarEstoque(mov.estoqueId, qtd);
          const fisicaOrig = mov.quantidadeFisicaSnapshot == null ? null : Number(mov.quantidadeFisicaSnapshot);
          await tx.insertEstorno({
            batidaId: atual.id,
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

function toBatidaRow(row: typeof nutricaoBatidas.$inferSelect): BatidaPersistida {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    dietaId: row.dietaId,
    data: row.data,
    hora: row.hora ?? null,
    quantidadePreparadaKg: String(row.quantidadePreparadaKg),
    dietaNomeSnapshot: row.dietaNomeSnapshot ?? null,
    custoTotalSnapshot: row.custoTotalSnapshot == null ? null : String(row.custoTotalSnapshot),
    custoKgSnapshot: row.custoKgSnapshot == null ? null : String(row.custoKgSnapshot),
    custoCompleto: Boolean(row.custoCompleto),
    observacoes: row.observacoes ?? null,
    status: row.status === "estornado" ? "estornado" : "confirmado",
    motivoEstorno: row.motivoEstorno ?? null,
    observacaoEstorno: row.observacaoEstorno ?? null,
    estornadoEm: row.estornadoEm ?? null,
  };
}

export const nutricaoBatidasStore: BatidaStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
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
  async find(userId, id) {
    const [row] = await db.select().from(nutricaoBatidas).where(and(
      eq(nutricaoBatidas.id, id), eq(nutricaoBatidas.userId, userId),
    )).limit(1);
    return row ? toBatidaRow(row) : null;
  },
  async list(userId, fazendaId) {
    const rows = await db.select().from(nutricaoBatidas).where(and(
      eq(nutricaoBatidas.userId, userId), eq(nutricaoBatidas.fazendaId, fazendaId),
    )).orderBy(desc(nutricaoBatidas.data), desc(nutricaoBatidas.id));
    return rows.map(toBatidaRow);
  },
  async listIngredientes(batidaId) {
    const rows = await db.select().from(nutricaoBatidaIngredientes).where(
      eq(nutricaoBatidaIngredientes.batidaId, batidaId),
    );
    return rows.map(r => ({
      batidaId: r.batidaId,
      produtoId: r.produtoId,
      produtoNomeSnapshot: r.produtoNomeSnapshot,
      proporcaoSnapshot: r.proporcaoSnapshot == null ? null : String(r.proporcaoSnapshot),
      quantidadeKg: String(r.quantidadeKg),
      quantidadeUnidade: String(r.quantidadeUnidade),
      unidadeSnapshot: r.unidadeSnapshot,
      custoUnitarioSnapshot: r.custoUnitarioSnapshot == null ? null : String(r.custoUnitarioSnapshot),
      custoTotalSnapshot: r.custoTotalSnapshot == null ? null : String(r.custoTotalSnapshot),
      custoConhecido: Boolean(r.custoConhecido),
      ordem: r.ordem,
    }));
  },
  async listMovimentacoes(batidaId) {
    const rows = await db.select().from(estoqueMovimentacoes).where(
      eq(estoqueMovimentacoes.nutricaoBatidaId, batidaId),
    );
    return rows.map(r => ({
      id: r.id,
      batidaId,
      estoqueId: r.estoqueId,
      quantidade: String(r.quantidade),
      tipo: r.tipo ?? null,
      status: r.status ?? "ativa",
    }));
  },
  async listFornecimentos(batidaId) {
    const rows = await db.select().from(nutricaoFornecimentos).where(
      eq(nutricaoFornecimentos.batidaId, batidaId),
    );
    return rows.map(r => ({
      id: r.id,
      data: r.data,
      hora: r.hora ?? null,
      loteId: r.loteId,
      cochoNomeSnapshot: r.cochoNomeSnapshot ?? null,
      quantidadeFornecidaKg: String(r.quantidadeFornecidaKg),
      status: r.status,
    }));
  },
  async getLoteNome(userId, loteId) {
    const [row] = await db.select({ nome: lotes.nome }).from(lotes).where(and(
      eq(lotes.id, loteId), eq(lotes.userId, userId),
    )).limit(1);
    return row?.nome ?? null;
  },
  transaction(fn) {
    return db.transaction(async tx => fn({
      async insertBatida(row) {
        const result = await tx.insert(nutricaoBatidas).values({
          userId: row.userId,
          fazendaId: row.fazendaId,
          dietaId: row.dietaId,
          data: row.data,
          hora: row.hora,
          quantidadePreparadaKg: row.quantidadePreparadaKg,
          dietaNomeSnapshot: row.dietaNomeSnapshot,
          custoTotalSnapshot: row.custoTotalSnapshot,
          custoKgSnapshot: row.custoKgSnapshot,
          custoCompleto: row.custoCompleto,
          observacoes: row.observacoes,
          status: row.status,
          motivoEstorno: row.motivoEstorno,
          observacaoEstorno: row.observacaoEstorno,
        });
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (!Number.isFinite(id) || id <= 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar a batida." });
        }
        return id;
      },
      async insertIngredientes(rows) {
        if (!rows.length) return;
        await tx.insert(nutricaoBatidaIngredientes).values(rows);
      },
      async debitarEstoque(estoqueId, quantidadeUnidade) {
        const [item] = await tx.select().from(estoque).where(eq(estoque.id, estoqueId));
        if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: MSG_BATIDA_SALDO });
        const atual = Number(item.quantidade ?? 0);
        if (!produtoControlaSaldo(item.controlarSaldo)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_BATIDA_SALDO });
        }
        const novo = atual - quantidadeUnidade;
        if (novo < -1e-9) throw new TRPCError({ code: "BAD_REQUEST", message: MSG_BATIDA_SALDO });
        await tx.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, estoqueId));
      },
      async insertSaida(row) {
        const result = await tx.insert(estoqueMovimentacoes).values({
          grupoId: row.grupoId,
          estoqueId: row.estoqueId,
          fazendaId: row.fazendaId,
          userId: row.userId,
          registradoPor: row.registradoPor,
          tipo: NUTRICAO_BATIDA_TIPO_SAIDA,
          dataMovimentacao: row.data,
          quantidade: String(-Math.abs(row.quantidadeUnidade)),
          manejo: NUTRICAO_BATIDA_MANEJO,
          valor: row.valorTotal != null ? String(row.valorTotal) : undefined,
          status: "ativa",
          nutricaoBatidaId: row.batidaId,
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
      async listMovimentacoesAtivas(batidaId) {
        const rows = await tx.select().from(estoqueMovimentacoes).where(and(
          eq(estoqueMovimentacoes.nutricaoBatidaId, batidaId),
          eq(estoqueMovimentacoes.status, "ativa"),
        ));
        return rows.map(r => ({
          id: r.id,
          batidaId,
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
          tipo: NUTRICAO_BATIDA_TIPO_SAIDA,
          dataMovimentacao: row.data,
          quantidade: String(Math.abs(row.quantidadeUnidade)),
          manejo: NUTRICAO_BATIDA_MANEJO,
          status: "estorno",
          originalGrupoId: row.originalGrupoId,
          motivoEstorno: row.motivo,
          nutricaoBatidaId: row.batidaId,
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
        await tx.update(nutricaoBatidas).set({
          status: "estornado",
          motivoEstorno: patch.motivoEstorno,
          observacaoEstorno: patch.observacaoEstorno,
          estornadoPorUserId: patch.estornadoPorUserId,
          estornadoEm: new Date(),
        }).where(eq(nutricaoBatidas.id, id));
      },
      async contarFornecimentosConfirmados(batidaId) {
        await tx.execute(sql`SELECT id FROM nutricao_batidas WHERE id = ${batidaId} FOR UPDATE`);
        const rows = await tx.select({ id: nutricaoFornecimentos.id }).from(nutricaoFornecimentos).where(and(
          eq(nutricaoFornecimentos.batidaId, batidaId),
          eq(nutricaoFornecimentos.status, "confirmado"),
        ));
        return rows.length;
      },
    }));
  },
};

export const nutricaoBatidasService = createNutricaoBatidasService(nutricaoBatidasStore);
