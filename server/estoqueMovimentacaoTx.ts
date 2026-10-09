import { produtoControlaSaldo } from "../shared/estoqueControle";
import { decidirPatchSaldo } from "../shared/estoqueSaldo";

export type EstoqueItemParaMovimentacao = {
  id: number;
  fazendaId: number | null;
  produtoId?: number | null;
  quantidade: string | number | null;
  controlarSaldo: boolean | null;
  valorUnitario: string | number | null;
  valorTotalEstoque?: string | number | null;
  capitalInicializadoEm?: Date | string | null;
  nome: string | null;
};

export type MovimentacaoEstoqueInsert = {
  grupoId?: string | null;
  operacaoId?: number | null;
  estoqueId: number;
  fazendaId?: number | null;
  userId: number;
  registradoPor: string;
  tipo?: string | null;
  dataMovimentacao: string;
  quantidade: string;
  dataValidade?: string | null;
  destino?: string | null;
  manejo?: string | null;
  notaFiscal?: string | null;
  frete?: string | null;
  fornecedor?: string | null;
  valor?: string | null;
  valorEstoqueMovimentado?: string | null;
  observacoes?: string | null;
  status: "ativa" | "estorno";
  originalGrupoId?: string | null;
  motivoEstorno?: string | null;
  abastecimentoId?: number | null;
  nutricaoFornecimentoId?: number | null;
  nutricaoBatidaId?: number | null;
  unidadeEstoqueSnapshot?: string | null;
  conteudoPorUnidadeSnapshot?: string | number | null;
  unidadeConteudoSnapshot?: string | null;
  quantidadeFisicaSnapshot?: string | number | null;
  unidadeFisicaSnapshot?: string | null;
};

export type EstoqueMovimentacaoExecutor = {
  findEstoque(id: number): Promise<EstoqueItemParaMovimentacao | null>;
  insertMovimentacao(values: MovimentacaoEstoqueInsert): Promise<number>;
  updateEstoque(id: number, patch: {
    quantidade: string;
    valorUnitario?: string;
    valorTotalEstoque?: string;
  }): Promise<void>;
};

export type CriarMovimentacaoEstoqueInput = {
  estoqueId: number;
  fazendaId: number;
  grupoId?: string | null;
  operacaoId?: number | null;
  tipo?: string;
  dataMovimentacao: string;
  quantidade: string;
  dataValidade?: string;
  destino?: string;
  manejo?: string;
  notaFiscal?: string;
  frete?: string;
  fornecedor?: string;
  valor?: string;
  observacoes?: string;
  userId: number;
  registradoPor: string;
  modo?: "direto" | "unidades";
  sinal?: "entrada" | "saida";
  quantidadeUnidades?: string;
  quantidadePorUnidade?: string;
  unidadeLancamento?: string;
};

export async function criarMovimentacaoEstoqueNoTx(
  exec: EstoqueMovimentacaoExecutor,
  input: CriarMovimentacaoEstoqueInput,
): Promise<{ id: number; grupoId: string | null }> {
  const qty = parseFloat(String(input.quantidade).replace(",", "."));
  if (Number.isNaN(qty) || qty === 0) {
    throw new Error("Informe uma quantidade válida.");
  }
  if (!input.fazendaId) {
    throw new Error("Informe a fazenda da movimentação.");
  }
  if (!input.userId || !input.registradoPor) {
    throw new Error("Usuário autenticado inválido para registrar movimentação.");
  }

  const item = await exec.findEstoque(input.estoqueId);
  if (!item) {
    throw new Error("Produto não encontrado.");
  }

  const controlaSaldo = produtoControlaSaldo(item.controlarSaldo);
  if (!controlaSaldo && qty < 0) {
    throw new Error(
      "Este produto é de uso imediato e não possui saldo controlado. Registre uma compra para lançar custo; saídas, transferências e ajustes de saída não se aplicam.",
    );
  }

  const patchDecidido = decidirPatchSaldo({
    quantidade: item.quantidade,
    controlarSaldo: item.controlarSaldo,
    valorUnitario: item.valorUnitario,
    valorTotalEstoque: item.valorTotalEstoque,
    capitalInicializadoEm: item.capitalInicializadoEm,
  }, qty > 0
    ? { tipoOp: "entrada", quantidade: qty, valorInformado: input.valor, tipoMov: input.tipo }
    : { tipoOp: "saida", quantidade: Math.abs(qty) });

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

  const valorEstoqueMovimentado = patchDecidido.valorEstoqueMovimentado ?? undefined;
  const patch: { quantidade: string; valorUnitario?: string; valorTotalEstoque?: string } = {
    quantidade: patchDecidido.quantidade,
    valorUnitario: patchDecidido.valorUnitario,
    valorTotalEstoque: patchDecidido.valorTotalEstoque,
  };

  const id = await exec.insertMovimentacao({
    grupoId: input.grupoId || undefined,
    operacaoId: input.operacaoId ?? undefined,
    estoqueId: input.estoqueId,
    fazendaId: input.fazendaId ?? item.fazendaId ?? undefined,
    userId: input.userId,
    registradoPor: input.registradoPor,
    tipo: input.tipo || undefined,
    dataMovimentacao: input.dataMovimentacao,
    quantidade: String(qty),
    dataValidade: input.dataValidade || undefined,
    destino: input.destino || undefined,
    manejo: input.manejo || undefined,
    notaFiscal: input.notaFiscal || undefined,
    frete: input.frete || undefined,
    fornecedor: input.fornecedor || undefined,
    valor: input.valor || undefined,
    valorEstoqueMovimentado,
    observacoes,
    status: "ativa",
  });

  await exec.updateEstoque(input.estoqueId, patch);

  return { id, grupoId: input.grupoId ?? null };
}
