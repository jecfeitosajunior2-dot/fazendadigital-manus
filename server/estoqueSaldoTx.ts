/**
 * Camada única de escrita de saldo de estoque.
 * Routers e consumidores não calculam quantidade/capital sozinhos.
 */
import { and, eq } from "drizzle-orm";
import { estoque, estoqueMovimentacoes, estoqueOperacoes } from "../drizzle/schema";
import {
  capitalEstaInicializado,
  MSG_TRANSFERENCIA_CAPITAL_ASSIMETRICA,
  MSG_TRANSFERENCIA_MESMA_FAZENDA,
  persistirQuantidadeEstoque,
} from "../shared/estoqueCapital";
import { decidirPatchSaldo, type ItemSaldo, type PatchSaldo } from "../shared/estoqueSaldo";
import {
  ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA,
  ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA,
  validarTransferenciaInsumosInput,
} from "../shared/estoqueTransferencia";
import type {
  CriarMovimentacaoEstoqueInput,
  EstoqueItemParaMovimentacao,
  EstoqueMovimentacaoExecutor,
  MovimentacaoEstoqueInsert,
} from "./estoqueMovimentacaoTx";

export type ResultadoSaldo = PatchSaldo & { estoqueId: number };

export function itemParaSaldo(item: EstoqueItemParaMovimentacao): ItemSaldo {
  return {
    quantidade: item.quantidade,
    controlarSaldo: item.controlarSaldo,
    valorUnitario: item.valorUnitario,
    valorTotalEstoque: item.valorTotalEstoque,
    capitalInicializadoEm: item.capitalInicializadoEm,
  };
}

export async function aplicarPatchSaldoNoTx(
  exec: Pick<EstoqueMovimentacaoExecutor, "findEstoque" | "updateEstoque">,
  estoqueId: number,
  op: Parameters<typeof decidirPatchSaldo>[1],
): Promise<ResultadoSaldo> {
  const item = await exec.findEstoque(estoqueId);
  if (!item) throw new Error("Produto não encontrado.");
  const patch = decidirPatchSaldo(itemParaSaldo(item), op);
  await exec.updateEstoque(estoqueId, {
    quantidade: patch.quantidade,
    valorUnitario: patch.valorUnitario,
    valorTotalEstoque: patch.valorTotalEstoque,
  });
  return { ...patch, estoqueId };
}

export async function aplicarEntradaEstoqueNoTx(
  exec: EstoqueMovimentacaoExecutor,
  input: CriarMovimentacaoEstoqueInput,
) {
  return criarMovimentacaoPeloSaldo(exec, input, "entrada");
}

export async function aplicarSaidaEstoqueNoTx(
  exec: EstoqueMovimentacaoExecutor,
  input: CriarMovimentacaoEstoqueInput,
) {
  return criarMovimentacaoPeloSaldo(exec, input, "saida");
}

async function criarMovimentacaoPeloSaldo(
  exec: EstoqueMovimentacaoExecutor,
  input: CriarMovimentacaoEstoqueInput,
  sentido: "entrada" | "saida",
): Promise<{ id: number; grupoId: string | null; valorEstoqueMovimentado: string | null; usaCapital: boolean }> {
  const qtyAbs = Math.abs(parseFloat(String(input.quantidade).replace(",", ".")));
  if (!Number.isFinite(qtyAbs) || qtyAbs === 0) {
    throw new Error("Informe uma quantidade válida.");
  }
  if (!input.fazendaId) throw new Error("Informe a fazenda da movimentação.");
  if (!input.userId || !input.registradoPor) {
    throw new Error("Usuário autenticado inválido para registrar movimentação.");
  }

  const item = await exec.findEstoque(input.estoqueId);
  if (!item) throw new Error("Produto não encontrado.");

  const op = sentido === "entrada"
    ? { tipoOp: "entrada" as const, quantidade: qtyAbs, valorInformado: input.valor, tipoMov: input.tipo }
    : { tipoOp: "saida" as const, quantidade: qtyAbs };
  const patch = decidirPatchSaldo(itemParaSaldo(item), op);

  let observacoes = input.observacoes;
  if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
    observacoes = JSON.stringify({
      modo: input.modo,
      sinal: input.sinal,
      unidades: input.quantidadeUnidades,
      porUnidade: input.quantidadePorUnidade,
      unidade: input.unidadeLancamento,
      total: sentido === "entrada" ? qtyAbs : -qtyAbs,
    });
  }

  const extras = input as CriarMovimentacaoEstoqueInput & Partial<MovimentacaoEstoqueInsert>;
  const id = await exec.insertMovimentacao({
    grupoId: input.grupoId || undefined,
    operacaoId: input.operacaoId ?? extras.operacaoId ?? undefined,
    estoqueId: input.estoqueId,
    fazendaId: input.fazendaId ?? item.fazendaId ?? undefined,
    userId: input.userId,
    registradoPor: input.registradoPor,
    tipo: input.tipo || undefined,
    dataMovimentacao: input.dataMovimentacao,
    quantidade: String(sentido === "entrada" ? qtyAbs : -qtyAbs),
    dataValidade: input.dataValidade || undefined,
    destino: input.destino || undefined,
    manejo: input.manejo || undefined,
    notaFiscal: input.notaFiscal || undefined,
    frete: input.frete || undefined,
    fornecedor: input.fornecedor || undefined,
    valor: input.valor || undefined,
    valorEstoqueMovimentado: patch.valorEstoqueMovimentado ?? undefined,
    observacoes,
    status: "ativa",
    abastecimentoId: extras.abastecimentoId,
    nutricaoFornecimentoId: extras.nutricaoFornecimentoId,
    nutricaoBatidaId: extras.nutricaoBatidaId,
    unidadeEstoqueSnapshot: extras.unidadeEstoqueSnapshot,
    conteudoPorUnidadeSnapshot: extras.conteudoPorUnidadeSnapshot,
    unidadeConteudoSnapshot: extras.unidadeConteudoSnapshot,
    quantidadeFisicaSnapshot: extras.quantidadeFisicaSnapshot,
    unidadeFisicaSnapshot: extras.unidadeFisicaSnapshot,
  });

  await exec.updateEstoque(input.estoqueId, {
    quantidade: patch.quantidade,
    valorUnitario: patch.valorUnitario,
    valorTotalEstoque: patch.valorTotalEstoque,
  });

  return {
    id,
    grupoId: input.grupoId ?? null,
    valorEstoqueMovimentado: patch.valorEstoqueMovimentado,
    usaCapital: patch.usaCapital,
  };
}

export async function estornarMovimentacaoEstoqueNoTx(
  exec: EstoqueMovimentacaoExecutor & {
    marcarMovimentacaoEstornada?(id: number, motivo: string): Promise<void>;
  },
  input: {
    estoqueId: number;
    quantidadeOriginal: number | string;
    valorSnapshot?: number | string | null;
    grupoId?: string | null;
    originalGrupoId?: string | null;
    tipo?: string | null;
    dataMovimentacao: string;
    fazendaId?: number | null;
    userId: number;
    registradoPor: string;
    motivoEstorno: string;
    destino?: string | null;
    manejo?: string | null;
    valorComercial?: string | null;
    observacoes?: string | null;
    originalMovId?: number;
    extras?: Partial<MovimentacaoEstoqueInsert>;
  },
): Promise<{ id: number; valorEstoqueMovimentado: string | null; usaCapital: boolean }> {
  const patch = await aplicarPatchSaldoNoTx(exec, input.estoqueId, {
    tipoOp: "estorno",
    quantidadeOriginal: input.quantidadeOriginal,
    valorSnapshot: input.valorSnapshot,
  });
  const qOrig = Number(String(input.quantidadeOriginal).replace(",", "."));
  const id = await exec.insertMovimentacao({
    grupoId: input.grupoId || undefined,
    estoqueId: input.estoqueId,
    fazendaId: input.fazendaId ?? undefined,
    userId: input.userId,
    registradoPor: input.registradoPor,
    tipo: input.tipo || undefined,
    dataMovimentacao: input.dataMovimentacao,
    quantidade: String(-qOrig),
    destino: input.destino || undefined,
    manejo: input.manejo || undefined,
    valor: input.valorComercial || undefined,
    valorEstoqueMovimentado: patch.valorEstoqueMovimentado ?? undefined,
    observacoes: input.observacoes || undefined,
    status: "estorno",
    originalGrupoId: input.originalGrupoId || undefined,
    motivoEstorno: input.motivoEstorno,
    ...input.extras,
  });
  if (input.originalMovId && exec.marcarMovimentacaoEstornada) {
    await exec.marcarMovimentacaoEstornada(input.originalMovId, input.motivoEstorno);
  }
  return {
    id,
    valorEstoqueMovimentado: patch.valorEstoqueMovimentado,
    usaCapital: patch.usaCapital,
  };
}

export type TransferenciaSaldoExecutor = EstoqueMovimentacaoExecutor & {
  findFazenda(userId: number, id: number): Promise<{ id: number; nome: string | null } | null>;
  findEstoquePorProdutoFazenda(produtoId: number, fazendaId: number): Promise<EstoqueItemParaMovimentacao | null>;
  insertEstoqueDestino(origem: EstoqueItemParaMovimentacao, fazendaDestinoId: number, inicializarCapital: boolean): Promise<number>;
  findOperacaoPorIdem(userId: number, key: string): Promise<{ id: number; status: string } | null>;
  insertOperacao(row: {
    userId: number;
    fazendaId: number;
    fazendaDestinoId: number;
    tipo: string;
    motivo: string;
    dataOperacao: string;
    status: string;
    idempotencyKey: string;
    valorMercadorias: string;
    valorFrete: string;
    valorTotal: string;
  }): Promise<number>;
};

export async function transferirEstoqueNoTx(
  exec: TransferenciaSaldoExecutor,
  input: {
    userId: number;
    registradoPor: string;
    idempotencyKey: string;
    fazendaOrigemId: number;
    fazendaDestinoId: number;
    dataOperacao: string;
    itens: { estoqueOrigemId: number; quantidade: string }[];
  },
): Promise<{ id: number; idempotent: boolean; itemCount: number }> {
  const erro = validarTransferenciaInsumosInput(input);
  if (erro) throw new Error(erro);
  if (input.fazendaOrigemId === input.fazendaDestinoId) {
    throw new Error(MSG_TRANSFERENCIA_MESMA_FAZENDA);
  }

  const existente = await exec.findOperacaoPorIdem(input.userId, input.idempotencyKey);
  if (existente) return { id: existente.id, idempotent: true, itemCount: input.itens.length };

  const origemFaz = await exec.findFazenda(input.userId, input.fazendaOrigemId);
  const destFaz = await exec.findFazenda(input.userId, input.fazendaDestinoId);
  if (!origemFaz || !destFaz) throw new Error("Fazenda não encontrada.");

  const destNome = destFaz.nome?.trim() || `Fazenda #${input.fazendaDestinoId}`;
  const operacaoId = await exec.insertOperacao({
    userId: input.userId,
    fazendaId: input.fazendaOrigemId,
    fazendaDestinoId: input.fazendaDestinoId,
    tipo: ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA,
    motivo: ESTOQUE_OPERACAO_MOTIVO_TRANSFERENCIA,
    dataOperacao: input.dataOperacao,
    status: "confirmada",
    idempotencyKey: input.idempotencyKey,
    valorMercadorias: "0.00",
    valorFrete: "0.00",
    valorTotal: "0.00",
  });

  let itemIdx = 0;
  for (const item of input.itens) {
    itemIdx += 1;
    const origem = await exec.findEstoque(item.estoqueOrigemId);
    if (!origem) throw new Error("Produto de origem não encontrado.");
    if (Number(origem.fazendaId) !== input.fazendaOrigemId) {
      throw new Error("O produto não pertence à fazenda de origem.");
    }
    const produtoId = (origem as EstoqueItemParaMovimentacao & { produtoId?: number | null }).produtoId;
    let destino = produtoId
      ? await exec.findEstoquePorProdutoFazenda(Number(produtoId), input.fazendaDestinoId)
      : null;

    const origemInit = capitalEstaInicializado(origem);
    const destInit = destino ? capitalEstaInicializado(destino) : origemInit;
    if (origemInit !== destInit && destino) {
      throw new Error(MSG_TRANSFERENCIA_CAPITAL_ASSIMETRICA);
    }

    if (!destino) {
      const novoId = await exec.insertEstoqueDestino(origem, input.fazendaDestinoId, origemInit);
      destino = await exec.findEstoque(novoId);
      if (!destino) throw new Error("Não foi possível criar o estoque de destino.");
    }

    const qtd = Math.abs(Number(String(item.quantidade).replace(",", ".")));
    const grupoId = `tr-${operacaoId}-${itemIdx}`;
    const saida = await aplicarSaidaEstoqueNoTx(exec, {
      estoqueId: origem.id,
      fazendaId: input.fazendaOrigemId,
      grupoId,
      operacaoId,
      tipo: ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA,
      dataMovimentacao: input.dataOperacao,
      quantidade: String(-qtd),
      destino: destNome,
      userId: input.userId,
      registradoPor: input.registradoPor,
    });

    const valorEntrada = saida.usaCapital ? saida.valorEstoqueMovimentado ?? "0" : undefined;
    await aplicarEntradaEstoqueNoTx(exec, {
      estoqueId: destino.id,
      fazendaId: input.fazendaDestinoId,
      grupoId,
      operacaoId,
      tipo: ESTOQUE_OPERACAO_TIPO_TRANSFERENCIA,
      dataMovimentacao: input.dataOperacao,
      quantidade: String(qtd),
      valor: valorEntrada,
      destino: destNome,
      userId: input.userId,
      registradoPor: input.registradoPor,
    });
  }

  return { id: operacaoId, idempotent: false, itemCount: input.itens.length };
}

export function persistirQuantidadeLegado(q: number): string {
  return persistirQuantidadeEstoque(q);
}

/** Executor mínimo a partir de um tx Drizzle que já tem estoque. */
export function executorPatchDrizzle(tx: DrizzleLike): Pick<EstoqueMovimentacaoExecutor, "findEstoque" | "updateEstoque"> {
  return {
    async findEstoque(id) {
      const [row] = await tx.select().from(estoque).where(eq(estoque.id, id));
      return row ? mapEstoqueParaMovimentacao(row) : null;
    },
    async updateEstoque(id, patch) {
      await tx.update(estoque).set(patch).where(eq(estoque.id, id));
    },
  };
}

type DrizzleLike = {
  select: typeof import("./db").db.select;
  insert: typeof import("./db").db.insert;
  update: typeof import("./db").db.update;
};

export function mapEstoqueParaMovimentacao(row: typeof estoque.$inferSelect): EstoqueItemParaMovimentacao & { produtoId: number | null } {
  return {
    id: row.id,
    fazendaId: row.fazendaId ?? null,
    quantidade: row.quantidade,
    controlarSaldo: row.controlarSaldo ?? null,
    valorUnitario: row.valorUnitario,
    valorTotalEstoque: row.valorTotalEstoque,
    capitalInicializadoEm: row.capitalInicializadoEm,
    nome: row.nome,
    produtoId: row.produtoId ?? null,
  };
}

export function criarExecutorSaldoDrizzle(tx: DrizzleLike): TransferenciaSaldoExecutor {
  return {
    async findEstoque(id) {
      const [row] = await tx.select().from(estoque).where(eq(estoque.id, id));
      return row ? mapEstoqueParaMovimentacao(row) : null;
    },
    async insertMovimentacao(values) {
      const result = await tx.insert(estoqueMovimentacoes).values(values as typeof estoqueMovimentacoes.$inferInsert);
      return Number((result as { insertId?: number }[])[0]?.insertId ?? 0);
    },
    async updateEstoque(id, patch) {
      await tx.update(estoque).set(patch).where(eq(estoque.id, id));
    },
    async findFazenda() {
      return null;
    },
    async findEstoquePorProdutoFazenda(produtoId, fazendaId) {
      const [row] = await tx.select().from(estoque).where(and(
        eq(estoque.produtoId, produtoId),
        eq(estoque.fazendaId, fazendaId),
      ));
      return row ? mapEstoqueParaMovimentacao(row) : null;
    },
    async insertEstoqueDestino(origem, fazendaDestinoId, inicializarCapital) {
      const result = await tx.insert(estoque).values({
        produtoId: (origem as { produtoId?: number | null }).produtoId ?? undefined,
        fazendaId: fazendaDestinoId,
        nome: origem.nome ?? "Produto",
        quantidade: "0",
        controlarSaldo: origem.controlarSaldo ?? true,
        valorUnitario: origem.valorUnitario != null ? String(origem.valorUnitario) : null,
        valorTotalEstoque: inicializarCapital ? "0.00" : null,
        capitalInicializadoEm: inicializarCapital ? new Date() : null,
      });
      return Number((result as { insertId?: number }[])[0]?.insertId ?? 0);
    },
    async findOperacaoPorIdem() {
      return null;
    },
    async insertOperacao() {
      throw new Error("insertOperacao precisa do executor de transferência.");
    },
  };
}
