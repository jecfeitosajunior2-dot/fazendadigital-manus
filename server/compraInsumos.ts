import { TRPCError } from "@trpc/server";
import {
  ESTOQUE_OPERACAO_MOTIVO_COMPRA,
  ESTOQUE_OPERACAO_STATUS_CONFIRMADA,
  ESTOQUE_OPERACAO_STATUS_ESTORNADA,
  ESTOQUE_OPERACAO_TIPO_ENTRADA,
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  MSG_COMPRA_ESTORNO_COM_PAGAMENTO,
  MSG_COMPRA_FAZENDA_INVALIDA,
  MSG_COMPRA_FORNECEDOR_INVALIDO,
  MSG_COMPRA_FORNECEDOR_OBRIGATORIO,
  MSG_COMPRA_FORNECEDOR_TIPO,
  MSG_COMPRA_FRETE_CREDOR,
  MSG_COMPRA_FRETE_CREDOR_INVALIDO,
  MSG_COMPRA_IDEMPOTENCY,
  MSG_COMPRA_ITEM_FAZENDA,
  MSG_COMPRA_JA_ESTORNADA,
  MSG_COMPRA_TOTAIS,
  calcularValoresCompraInsumos,
  grupoIdCompativelOperacao,
  isMysqlDuplicateKey,
  montarLinhasCompraInsumos,
  pessoaAdequadaComoFornecedor,
  planejarTitulosCompraInsumos,
  validarConfirmacaoCompraInsumos,
  validarTotaisCompraInsumos,
  type CompraInsumosItemComercial,
  type PessoaFornecedorSnapshot,
} from "../shared/compraInsumos";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  apropriarNoTx,
  cancelarTituloNoTx,
  criarTituloNoTx,
  listarTitulosPorOrigemNoTx,
  tituloTemLiquidacaoEfetiva,
  type FinanceiroNucleoTx,
} from "./financeiroNucleo";
import { EstoqueCapitalError } from "../shared/estoqueCapital";
import { decidirPatchSaldo } from "../shared/estoqueSaldo";
import { avaliarEstornoEstoque } from "./estoqueEstorno";
import { criarMovimentacaoEstoqueNoTx, type EstoqueMovimentacaoExecutor } from "./estoqueMovimentacaoTx";

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

export type EstoqueOperacaoRow = {
  id: number;
  userId: number;
  fazendaId: number;
  tipo: string;
  motivo: string;
  dataOperacao: string;
  fornecedorId: number | null;
  fornecedorNomeSnapshot: string | null;
  numeroNf: string | null;
  referencia: string | null;
  valorMercadorias: string;
  valorFrete: string;
  valorTotal: string;
  freteCredorId: number | null;
  freteCredorNomeSnapshot: string | null;
  status: string;
  estornadaEm: Date | null;
  motivoEstorno: string | null;
  idempotencyKey: string;
};

export type CompraInsumosMovRow = {
  id: number;
  operacaoId: number | null;
  estoqueId: number;
  quantidade: string;
  valor: string | null;
  valorEstoqueMovimentado?: string | null;
  frete: string | null;
  status: string | null;
};

export type CompraInsumosTx = EstoqueMovimentacaoExecutor & {
  findFazenda(userId: number, id: number): Promise<{ id: number } | null>;
  findPessoa(userId: number, id: number): Promise<PessoaFornecedorSnapshot | null>;
  findOperacaoPorIdempotency(userId: number, key: string): Promise<EstoqueOperacaoRow | null>;
  findOperacao(userId: number, id: number): Promise<EstoqueOperacaoRow | null>;
  lockOperacao(userId: number, id: number): Promise<EstoqueOperacaoRow | null>;
  insertOperacao(row: Omit<EstoqueOperacaoRow, "id" | "estornadaEm" | "motivoEstorno">): Promise<number>;
  updateOperacaoEstornada(userId: number, id: number, motivo: string, em: Date): Promise<void>;
  listMovimentacoesOperacao(operacaoId: number): Promise<Array<CompraInsumosMovRow & {
    fazendaId?: number | null;
    tipo?: string | null;
    dataValidade?: string | null;
    destino?: string | null;
    manejo?: string | null;
    notaFiscal?: string | null;
    fornecedor?: string | null;
    observacoes?: string | null;
    grupoId?: string | null;
    nome?: string | null;
    unidade?: string | null;
  }>>;
  updateMovimentacaoEstornada(
    id: number,
    motivo: string,
    updatedByUserId: number,
    updatedByNome: string,
  ): Promise<void>;
  fin: FinanceiroNucleoTx;
};

export type CompraInsumosStore = {
  transaction<T>(fn: (tx: CompraInsumosTx) => Promise<T>): Promise<T>;
};

export type ConfirmarCompraInsumosInput = {
  idempotencyKey: string;
  fazendaId: number;
  dataOperacao: string;
  fornecedorId: number;
  numeroNf?: string | null;
  referencia?: string | null;
  valorFrete: number;
  freteCredorId?: number | null;
  itens: Array<{
    estoqueId: number;
    quantidade: string;
    valorMercadoria: number;
    dataValidade?: string | null;
  }>;
};

export type EstornarOperacaoEstoqueInput = {
  itemIds: number[];
  motivo: string;
  registradoPor: string;
  userId: number;
};

function parseQuantidadeItem(raw: string): number {
  const n = parseFloat(String(raw).replace(",", "."));
  return n;
}

async function resolverPessoaFornecedor(
  tx: CompraInsumosTx,
  userId: number,
  pessoaId: number | null | undefined,
  msgs: { ausente: string; invalido: string; tipo: string },
): Promise<PessoaFornecedorSnapshot> {
  if (pessoaId == null || pessoaId <= 0) toTrpc(msgs.ausente);
  const pessoa = await tx.findPessoa(userId, pessoaId);
  if (!pessoa) toTrpc(msgs.invalido, "NOT_FOUND");
  if (!pessoaAdequadaComoFornecedor(pessoa)) toTrpc(msgs.tipo);
  return pessoa;
}

async function integrarTitulosCompra(
  tx: CompraInsumosTx,
  userId: number,
  operacao: { id: number; fazendaId: number; dataOperacao: string; numeroNf: string | null },
  fornecedor: PessoaFornecedorSnapshot,
  freteCredor: PessoaFornecedorSnapshot | null,
  valores: ReturnType<typeof calcularValoresCompraInsumos>,
) {
  const existentes = await listarTitulosPorOrigemNoTx(tx.fin, userId, FINANCEIRO_ORIGEM_COMPRA_INSUMOS, operacao.id);
  if (existentes.length) return existentes.map(t => t.id);

  const planos = planejarTitulosCompraInsumos({ fornecedor, freteCredor, valores });
  const ids: number[] = [];
  for (const plano of planos) {
    const criado = await criarTituloNoTx(tx.fin, userId, {
      tipo: "pagar",
      pessoaId: plano.pessoaId,
      descricao: plano.descricao,
      dataCompetencia: operacao.dataOperacao,
      valorOriginal: plano.valorOriginal,
      documentoReferencia: operacao.numeroNf,
      fazendaOrigemId: operacao.fazendaId,
      origemTipo: FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
      origemId: operacao.id,
      origemItemChave: plano.origemItemChave,
    });
    await apropriarNoTx(tx.fin, userId, criado.id, [{
      valor: plano.valorOriginal,
      fazendaId: operacao.fazendaId,
    }]);
    ids.push(criado.id);
  }
  return ids;
}

export function createCompraInsumosService(store: CompraInsumosStore) {
  return {
    async confirmarCompraInsumos(
      userId: number,
      registradoPor: string,
      input: ConfirmarCompraInsumosInput,
    ) {
      const idem = input.idempotencyKey.trim();
      if (idem.length < 8 || idem.length > 80) toTrpc(MSG_COMPRA_IDEMPOTENCY);

      const itensComerciais: CompraInsumosItemComercial[] = input.itens.map(item => ({
        estoqueId: item.estoqueId,
        quantidade: parseQuantidadeItem(item.quantidade),
        valorMercadoria: item.valorMercadoria,
      }));

      return store.transaction(async tx => {
        const existente = await tx.findOperacaoPorIdempotency(userId, idem);
        if (existente) {
          const titulos = await listarTitulosPorOrigemNoTx(tx.fin, userId, FINANCEIRO_ORIGEM_COMPRA_INSUMOS, existente.id);
          return {
            success: true as const,
            operacaoId: existente.id,
            tituloIds: titulos.map(t => t.id),
            idempotente: true,
          };
        }

        const fazenda = await tx.findFazenda(userId, input.fazendaId);
        if (!fazenda) toTrpc(MSG_COMPRA_FAZENDA_INVALIDA, "FORBIDDEN");

        const fornecedor = await resolverPessoaFornecedor(tx, userId, input.fornecedorId, {
          ausente: MSG_COMPRA_FORNECEDOR_OBRIGATORIO,
          invalido: MSG_COMPRA_FORNECEDOR_INVALIDO,
          tipo: MSG_COMPRA_FORNECEDOR_TIPO,
        });

        const frete = Number(input.valorFrete ?? 0);
        let freteCredor: PessoaFornecedorSnapshot | null = null;
        if (frete > 0) {
          freteCredor = await resolverPessoaFornecedor(tx, userId, input.freteCredorId, {
            ausente: MSG_COMPRA_FRETE_CREDOR,
            invalido: MSG_COMPRA_FRETE_CREDOR_INVALIDO,
            tipo: MSG_COMPRA_FRETE_CREDOR_INVALIDO,
          });
        }

        const validacao = validarConfirmacaoCompraInsumos({
          fornecedor,
          freteCredor,
          valorFrete: frete,
          itens: itensComerciais,
        });
        if (!validacao.ok) toTrpc(validacao.message);

        for (const item of input.itens) {
          const produto = await tx.findEstoque(item.estoqueId);
          if (!produto) toTrpc("Produto não encontrado.", "NOT_FOUND");
          if (Number(produto.fazendaId) !== Number(input.fazendaId)) toTrpc(MSG_COMPRA_ITEM_FAZENDA);
        }

        const linhas = montarLinhasCompraInsumos(itensComerciais, frete);
        const mercadorias = linhas.reduce((acc, l) => acc + l.valorMercadoria, 0);
        const valores = calcularValoresCompraInsumos(mercadorias, frete);
        if (!validarTotaisCompraInsumos(linhas, valores)) toTrpc(MSG_COMPRA_TOTAIS);

        let operacaoId: number;
        try {
          operacaoId = await tx.insertOperacao({
            userId,
            fazendaId: input.fazendaId,
            tipo: ESTOQUE_OPERACAO_TIPO_ENTRADA,
            motivo: ESTOQUE_OPERACAO_MOTIVO_COMPRA,
            dataOperacao: input.dataOperacao,
            fornecedorId: fornecedor.id,
            fornecedorNomeSnapshot: fornecedor.nome,
            numeroNf: input.numeroNf?.trim() || null,
            referencia: input.referencia?.trim() || null,
            valorMercadorias: persistirValor(valores.valorMercadorias),
            valorFrete: persistirValor(valores.valorFrete),
            valorTotal: persistirValor(valores.valorComercialTotal),
            freteCredorId: frete > 0 ? (freteCredor?.id ?? fornecedor.id) : null,
            freteCredorNomeSnapshot: frete > 0 ? (freteCredor?.nome ?? fornecedor.nome) : null,
            status: ESTOQUE_OPERACAO_STATUS_CONFIRMADA,
            idempotencyKey: idem,
          });
        } catch (error) {
          if (isMysqlDuplicateKey(error)) {
            const dup = await tx.findOperacaoPorIdempotency(userId, idem);
            if (dup) {
              const titulos = await listarTitulosPorOrigemNoTx(tx.fin, userId, FINANCEIRO_ORIGEM_COMPRA_INSUMOS, dup.id);
              return {
                success: true as const,
                operacaoId: dup.id,
                tituloIds: titulos.map(t => t.id),
                idempotente: true,
              };
            }
          }
          throw error;
        }

        const grupoId = grupoIdCompativelOperacao(operacaoId);
        const movIds: number[] = [];
        for (const linha of linhas) {
          const itemInput = input.itens.find(i => i.estoqueId === linha.estoqueId)!;
          const criado = await criarMovimentacaoEstoqueNoTx(tx, {
            estoqueId: linha.estoqueId,
            fazendaId: input.fazendaId,
            grupoId,
            operacaoId,
            tipo: ESTOQUE_OPERACAO_MOTIVO_COMPRA,
            dataMovimentacao: input.dataOperacao,
            quantidade: String(linha.quantidade),
            dataValidade: itemInput.dataValidade || undefined,
            fornecedor: fornecedor.nome,
            notaFiscal: input.numeroNf?.trim() || undefined,
            frete: linha.valorFrete > 0 ? persistirValor(linha.valorFrete) : undefined,
            valor: persistirValor(linha.valorTotal),
            userId,
            registradoPor,
          });
          movIds.push(criado.id);
        }

        const persistidas = await tx.listMovimentacoesOperacao(operacaoId);
        if (!validarTotaisCompraInsumos(
          persistidas.map(m => ({
            valorTotal: Number(m.valor ?? 0),
            valorFrete: Number(m.frete ?? 0),
          })),
          valores,
        )) {
          toTrpc(MSG_COMPRA_TOTAIS);
        }

        const tituloIds = await integrarTitulosCompra(
          tx,
          userId,
          {
            id: operacaoId,
            fazendaId: input.fazendaId,
            dataOperacao: input.dataOperacao,
            numeroNf: input.numeroNf?.trim() || null,
          },
          fornecedor,
          freteCredor,
          valores,
        );

        return {
          success: true as const,
          operacaoId,
          movimentacaoIds: movIds,
          tituloIds,
          idempotente: false,
        };
      });
    },

    async validarEstornoOperacao(userId: number, operacaoId: number) {
      return store.transaction(async tx => {
        const operacao = await tx.findOperacao(userId, operacaoId);
        if (!operacao) return { podeEstornar: false, mensagem: "Operação não encontrada." };
        if (operacao.status === ESTOQUE_OPERACAO_STATUS_ESTORNADA) {
          return { podeEstornar: false, jaEstornada: true, mensagem: MSG_COMPRA_JA_ESTORNADA };
        }
        const titulos = await listarTitulosPorOrigemNoTx(tx.fin, userId, FINANCEIRO_ORIGEM_COMPRA_INSUMOS, operacao.id);
        for (const titulo of titulos) {
          if (await tituloTemLiquidacaoEfetiva(tx.fin, userId, titulo.id)) {
            return { podeEstornar: false, mensagem: MSG_COMPRA_ESTORNO_COM_PAGAMENTO };
          }
        }
        return { podeEstornar: true, jaEstornada: false, mensagem: null as string | null };
      });
    },

    async estornarOperacao(userId: number, operacaoId: number, motivo: string, registradoPor: string) {
      return store.transaction(async tx => {
        const operacao = await tx.lockOperacao(userId, operacaoId);
        if (!operacao) toTrpc("Operação não encontrada.", "NOT_FOUND");
        if (operacao.status === ESTOQUE_OPERACAO_STATUS_ESTORNADA) toTrpc(MSG_COMPRA_JA_ESTORNADA);

        const originais = (await tx.listMovimentacoesOperacao(operacao.id))
          .filter(m => (m.status || "ativa") === "ativa");
        if (!originais.length) toTrpc(MSG_COMPRA_JA_ESTORNADA);

        const titulos = await listarTitulosPorOrigemNoTx(tx.fin, userId, FINANCEIRO_ORIGEM_COMPRA_INSUMOS, operacao.id);
        for (const titulo of titulos) {
          if (await tituloTemLiquidacaoEfetiva(tx.fin, userId, titulo.id)) {
            toTrpc(MSG_COMPRA_ESTORNO_COM_PAGAMENTO);
          }
        }
        for (const titulo of titulos) {
          if (titulo.estado !== "cancelado") {
            await cancelarTituloNoTx(tx.fin, userId, titulo.id, motivo);
          }
        }

        const saldos = new Map<number, { quantidade: number; nome: string; unidade: string | null }>();
        for (const mov of originais) {
          const item = await tx.findEstoque(mov.estoqueId);
          if (!item) toTrpc("Produto não encontrado.", "NOT_FOUND");
          saldos.set(mov.estoqueId, {
            quantidade: Number(item.quantidade ?? 0),
            nome: item.nome ?? `Produto #${mov.estoqueId}`,
            unidade: null,
          });
        }
        const insuficientes = avaliarEstornoEstoque(
          originais.map(o => ({
            estoqueId: o.estoqueId,
            quantidade: o.quantidade,
            nome: o.nome,
            unidade: o.unidade,
          })),
          saldos,
        );
        if (insuficientes.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão.",
          });
        }

        const originalGrupoId = originais.map(m => m.grupoId?.trim()).find(Boolean) || grupoIdCompativelOperacao(operacao.id);
        const estornoGrupoId = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const hoje = new Date().toISOString().slice(0, 10);
        const idsCriados: number[] = [];

        for (const mov of originais) {
          const qty = Number(mov.quantidade);
          const qtyInversa = -qty;
          const item = await tx.findEstoque(mov.estoqueId);
          if (!item) toTrpc("Produto não encontrado.", "NOT_FOUND");
          let patch;
          try {
            patch = decidirPatchSaldo({
              quantidade: item.quantidade,
              controlarSaldo: item.controlarSaldo,
              valorUnitario: item.valorUnitario,
              valorTotalEstoque: item.valorTotalEstoque,
              capitalInicializadoEm: item.capitalInicializadoEm,
            }, {
              tipoOp: "estorno",
              quantidadeOriginal: qty,
              valorSnapshot: mov.valorEstoqueMovimentado,
            });
          } catch (error) {
            if (error instanceof EstoqueCapitalError) toTrpc(error.message);
            throw error;
          }
          await tx.updateEstoque(mov.estoqueId, {
            quantidade: patch.quantidade,
            valorUnitario: patch.valorUnitario,
            valorTotalEstoque: patch.valorTotalEstoque,
          });
          const valorEstoqueMovimentado = patch.valorEstoqueMovimentado ?? undefined;
          const id = await tx.insertMovimentacao({
            grupoId: estornoGrupoId,
            operacaoId: operacao.id,
            estoqueId: mov.estoqueId,
            fazendaId: mov.fazendaId ?? undefined,
            userId,
            registradoPor,
            tipo: mov.tipo || ESTOQUE_OPERACAO_MOTIVO_COMPRA,
            dataMovimentacao: hoje,
            quantidade: String(qtyInversa),
            dataValidade: mov.dataValidade || undefined,
            destino: mov.destino || undefined,
            manejo: mov.manejo || undefined,
            notaFiscal: mov.notaFiscal || undefined,
            frete: mov.frete != null ? String(mov.frete) : undefined,
            fornecedor: mov.fornecedor || undefined,
            valor: mov.valor != null ? String(mov.valor) : undefined,
            valorEstoqueMovimentado,
            observacoes: mov.observacoes || undefined,
            status: "estorno",
            originalGrupoId,
            motivoEstorno: motivo,
          });
          idsCriados.push(id);
          await tx.updateMovimentacaoEstornada(mov.id, motivo, userId, registradoPor);
        }

        await tx.updateOperacaoEstornada(userId, operacao.id, motivo, new Date());
        return {
          success: true as const,
          originalGrupoId,
          estornoGrupoId,
          ids: idsCriados,
          operacaoId: operacao.id,
        };
      });
    },
  };
}

export type CompraInsumosService = ReturnType<typeof createCompraInsumosService>;
