/**
 * Sincronização Abastecimento ↔ Movimentação de estoque (Insumos).
 * Fonte de verdade: o abastecimento. A saída de estoque é reflexo automático.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db, abastecimentos, estoque, estoqueMovimentacoes, maquinas } from "./db";

export const DESTINO_ABASTECIMENTO_MAQUINA = "Abastecimento de máquina";
export const TIPO_SAIDA_ABASTECIMENTO = "Saída";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

const COMBUSTIVEL_KEYWORDS: Record<string, string[]> = {
  diesel: ["diesel", "s10", "s500", "óleo diesel", "oleo diesel"],
  gasolina: ["gasolina"],
  etanol: ["etanol", "álcool", "alcool"],
  arla: ["arla"],
};

function matchCombustivel(
  item: { nome: string | null; categoria: string | null },
  combustivel: string,
): boolean {
  const keywords = COMBUSTIVEL_KEYWORDS[combustivel] ?? [combustivel];
  const nome = (item.nome ?? "").toLowerCase();
  const cat = (item.categoria ?? "").toLowerCase();
  return keywords.some(k => nome.includes(k) || cat.includes(k));
}

export function isProdutoCombustivel(item: {
  nome?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
}): boolean {
  const nome = (item.nome ?? "").toLowerCase();
  const cat = `${item.categoria ?? ""} ${item.subcategoria ?? ""}`.toLowerCase();
  const blob = `${nome} ${cat}`;
  return Object.values(COMBUSTIVEL_KEYWORDS).some(keys => keys.some(k => blob.includes(k)));
}

async function findEstoqueCombustivel(
  executor: Executor,
  fazendaId: number,
  combustivel: string,
): Promise<{ id: number; quantidade: string | null; nome: string | null } | null> {
  const itens = await executor
    .select({
      id: estoque.id,
      nome: estoque.nome,
      categoria: estoque.categoria,
      quantidade: estoque.quantidade,
    })
    .from(estoque)
    .where(eq(estoque.fazendaId, fazendaId));
  const match = itens.find(i => matchCombustivel(i, combustivel));
  return match ?? null;
}

function grupoIdAbastecimento(abastecimentoId: number): string {
  return `abast-${abastecimentoId}`;
}

function friendlyStockError(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

async function findMovAtivaPorAbastecimento(
  executor: Executor,
  abastecimentoId: number,
) {
  const [row] = await executor
    .select()
    .from(estoqueMovimentacoes)
    .where(
      and(
        eq(estoqueMovimentacoes.abastecimentoId, abastecimentoId),
        or(eq(estoqueMovimentacoes.status, "ativa"), isNull(estoqueMovimentacoes.status)),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function nomeMaquina(executor: Executor, maquinaId: number): Promise<string> {
  const [m] = await executor
    .select({ nome: maquinas.nome })
    .from(maquinas)
    .where(eq(maquinas.id, maquinaId))
    .limit(1);
  return m?.nome?.trim() || `Máquina #${maquinaId}`;
}

export type SyncAbastecimentoInput = {
  abastecimentoId: number;
  maquinaId: number;
  fazendaId: number;
  combustivel: string;
  litros: number;
  dataISO: string;
  responsavel?: string | null;
  valorTotal?: string | null;
  observacoes?: string | null;
  userId?: number | null;
};

/**
 * Cria ou atualiza a saída vinculada ao abastecimento (idempotente).
 * Ajusta o saldo apenas pela diferença quando já existe movimentação ativa.
 */
export async function syncSaidaAbastecimento(
  input: SyncAbastecimentoInput,
  executor: Executor = db,
): Promise<number> {
  const litros = input.litros;
  if (!(litros > 0)) {
    friendlyStockError("Informe uma quantidade abastecida válida.");
  }

  const item = await findEstoqueCombustivel(executor, input.fazendaId, input.combustivel);
  if (!item) {
    friendlyStockError("Não há estoque disponível deste combustível na Fazenda selecionada.");
  }

  const maquinaNome = await nomeMaquina(executor, input.maquinaId);
  const descricao = `Abastecimento da máquina ${maquinaNome}`;
  const obsUser = input.observacoes?.trim();
  const observacoes = obsUser ? `${descricao} — ${obsUser}` : descricao;
  const grupoId = grupoIdAbastecimento(input.abastecimentoId);
  const registradoPor = input.responsavel?.trim() || null;
  const valor = input.valorTotal != null && input.valorTotal !== "" ? String(input.valorTotal) : null;

  const existente = await findMovAtivaPorAbastecimento(executor, input.abastecimentoId);

  if (existente) {
    const oldLitros = Math.abs(parseFloat(String(existente.quantidade ?? 0)));
    const sameProduct = existente.estoqueId === item.id;
    const saldoAtual = parseFloat(String(item.quantidade ?? 0));

    if (sameProduct) {
      const delta = litros - oldLitros;
      if (delta > 1e-9 && delta > saldoAtual + 1e-9) {
        const saldoFmt = saldoAtual.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        friendlyStockError(`Quantidade maior que o estoque disponível (${saldoFmt} L).`);
      }
      const novoSaldo = saldoAtual - delta;
      await executor
        .update(estoque)
        .set({ quantidade: String(Math.max(0, novoSaldo)) })
        .where(eq(estoque.id, item.id));
    } else {
      // Produto/fazenda mudou: devolve o antigo e baixa o novo
      const [oldItem] = await executor
        .select()
        .from(estoque)
        .where(eq(estoque.id, existente.estoqueId))
        .limit(1);
      if (oldItem) {
        const oldSaldo = parseFloat(String(oldItem.quantidade ?? 0));
        await executor
          .update(estoque)
          .set({ quantidade: String(oldSaldo + oldLitros) })
          .where(eq(estoque.id, oldItem.id));
      }
      const saldoNovo = parseFloat(String(item.quantidade ?? 0));
      // Re-read after possible concurrent changes — item.quantidade was before restore
      const [fresh] = await executor
        .select({ quantidade: estoque.quantidade })
        .from(estoque)
        .where(eq(estoque.id, item.id))
        .limit(1);
      const disponivel = parseFloat(String(fresh?.quantidade ?? saldoNovo));
      if (litros > disponivel + 1e-9) {
        const saldoFmt = disponivel.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        friendlyStockError(`Quantidade maior que o estoque disponível (${saldoFmt} L).`);
      }
      await executor
        .update(estoque)
        .set({ quantidade: String(Math.max(0, disponivel - litros)) })
        .where(eq(estoque.id, item.id));
    }

    await executor
      .update(estoqueMovimentacoes)
      .set({
        estoqueId: item.id,
        fazendaId: input.fazendaId,
        grupoId,
        tipo: TIPO_SAIDA_ABASTECIMENTO,
        dataMovimentacao: input.dataISO,
        quantidade: String(-litros),
        destino: DESTINO_ABASTECIMENTO_MAQUINA,
        manejo: maquinaNome,
        registradoPor: registradoPor ?? undefined,
        valor: valor ?? undefined,
        observacoes,
        abastecimentoId: input.abastecimentoId,
        status: "ativa",
        userId: input.userId ?? undefined,
      })
      .where(eq(estoqueMovimentacoes.id, existente.id));

    await executor
      .update(abastecimentos)
      .set({ movimentacaoEstoqueId: existente.id })
      .where(eq(abastecimentos.id, input.abastecimentoId));

    return existente.id;
  }

  // Nova saída
  const atual = parseFloat(String(item.quantidade ?? 0));
  if (litros > atual + 1e-9) {
    const saldoFmt = atual.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    friendlyStockError(`Quantidade maior que o estoque disponível (${saldoFmt} L).`);
  }

  const result = await executor.insert(estoqueMovimentacoes).values({
    estoqueId: item.id,
    fazendaId: input.fazendaId,
    grupoId,
    abastecimentoId: input.abastecimentoId,
    userId: input.userId ?? undefined,
    registradoPor: registradoPor ?? undefined,
    tipo: TIPO_SAIDA_ABASTECIMENTO,
    dataMovimentacao: input.dataISO,
    quantidade: String(-litros),
    destino: DESTINO_ABASTECIMENTO_MAQUINA,
    manejo: maquinaNome,
    valor: valor ?? undefined,
    observacoes,
    status: "ativa",
  });

  const movId = Number((result as { [0]?: { insertId?: number } })[0]?.insertId ?? 0);
  await executor
    .update(estoque)
    .set({ quantidade: String(Math.max(0, atual - litros)) })
    .where(eq(estoque.id, item.id));

  if (movId) {
    await executor
      .update(abastecimentos)
      .set({ movimentacaoEstoqueId: movId })
      .where(eq(abastecimentos.id, input.abastecimentoId));
  }

  return movId;
}

/**
 * Estorna a saída vinculada (restaura saldo e marca movimentação como estornada).
 * Idempotente se já estiver estornada / inexistente.
 */
export async function estornarSaidaAbastecimento(
  abastecimentoId: number,
  options?: { motivo?: string; userId?: number; registradoPor?: string },
  executor: Executor = db,
): Promise<void> {
  const ativa = await findMovAtivaPorAbastecimento(executor, abastecimentoId);
  if (!ativa) {
    await executor
      .update(abastecimentos)
      .set({ movimentacaoEstoqueId: null })
      .where(eq(abastecimentos.id, abastecimentoId));
    return;
  }

  const litros = Math.abs(parseFloat(String(ativa.quantidade ?? 0)));
  const [item] = await executor
    .select()
    .from(estoque)
    .where(eq(estoque.id, ativa.estoqueId))
    .limit(1);
  if (item && litros > 0) {
    const atual = parseFloat(String(item.quantidade ?? 0));
    await executor
      .update(estoque)
      .set({ quantidade: String(atual + litros) })
      .where(eq(estoque.id, item.id));
  }

  const grupoOriginal = ativa.grupoId?.trim() || grupoIdAbastecimento(abastecimentoId);
  const estornoGrupoId = `e-abast-${abastecimentoId}-${Date.now().toString(36)}`;
  const hoje = new Date().toISOString().slice(0, 10);

  await executor.insert(estoqueMovimentacoes).values({
    grupoId: estornoGrupoId,
    estoqueId: ativa.estoqueId,
    fazendaId: ativa.fazendaId ?? undefined,
    userId: options?.userId ?? undefined,
    registradoPor: options?.registradoPor ?? undefined,
    tipo: ativa.tipo || TIPO_SAIDA_ABASTECIMENTO,
    dataMovimentacao: hoje,
    quantidade: String(litros), // entrada = estorno da saída
    destino: ativa.destino || DESTINO_ABASTECIMENTO_MAQUINA,
    manejo: ativa.manejo || undefined,
    valor: ativa.valor != null ? String(ativa.valor) : undefined,
    observacoes: `Estorno do abastecimento #${abastecimentoId}`,
    status: "estorno",
    originalGrupoId: grupoOriginal,
    motivoEstorno: options?.motivo ?? "Exclusão ou alteração do abastecimento original",
    abastecimentoId,
  });

  await executor
    .update(estoqueMovimentacoes)
    .set({
      status: "estornada",
      motivoEstorno: options?.motivo ?? "Exclusão ou alteração do abastecimento original",
    })
    .where(eq(estoqueMovimentacoes.id, ativa.id));

  await executor
    .update(abastecimentos)
    .set({ movimentacaoEstoqueId: null })
    .where(eq(abastecimentos.id, abastecimentoId));
}

export const MSG_MOV_VINCULADA_EDITAR =
  "Esta movimentação foi gerada por um abastecimento de máquina. Para alterá-la, edite o abastecimento original.";

export const MSG_MOV_VINCULADA_EXCLUIR =
  "Esta movimentação está vinculada a um abastecimento. Exclua o abastecimento original para realizar o estorno corretamente.";

export const MSG_ORIENTACAO_COMBUSTIVEL_MANUAL =
  "Para abastecimento de máquinas cadastradas, utilize a tela Abastecimentos. A saída de estoque será gerada automaticamente.";
