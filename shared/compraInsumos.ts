import {
  dinheiroIgual,
  dinheiroNaoNegativo,
  dinheiroPositivo,
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  persistirValor,
  somarDinheiro,
  subtrairDinheiro,
  toCentavos,
} from "./financeiroNucleo";

export { FINANCEIRO_ORIGEM_COMPRA_INSUMOS };

export const ESTOQUE_OPERACAO_TIPO_ENTRADA = "Entrada";
export const ESTOQUE_OPERACAO_MOTIVO_COMPRA = "Compra";
export const ESTOQUE_OPERACAO_STATUS_CONFIRMADA = "confirmada";
export const ESTOQUE_OPERACAO_STATUS_ESTORNADA = "estornada";

export const COMPRA_INSUMOS_CHAVE_PRINCIPAL = "principal";
export const COMPRA_INSUMOS_CHAVE_MERCADORIAS = "mercadorias";
export const COMPRA_INSUMOS_CHAVE_FRETE = "frete";

export const MSG_COMPRA_FORNECEDOR_OBRIGATORIO = "Selecione o fornecedor da compra.";
export const MSG_COMPRA_FORNECEDOR_INVALIDO = "Fornecedor não encontrado neste cadastro.";
export const MSG_COMPRA_FORNECEDOR_TIPO = "Esta pessoa não está cadastrada como fornecedor.";
export const MSG_COMPRA_FAZENDA_INVALIDA = "Fazenda não encontrada neste cadastro.";
export const MSG_COMPRA_FRETE_CREDOR = "Informe o credor do frete.";
export const MSG_COMPRA_FRETE_CREDOR_INVALIDO = "Credor do frete não encontrado neste cadastro.";
export const MSG_COMPRA_FRETE_SEM_MERCADORIAS = "Informe o valor dos produtos para ratear o frete.";
export const MSG_COMPRA_VALOR_OBRIGATORIO = "Informe o valor da compra.";
export const MSG_COMPRA_ITENS = "A compra precisa ter pelo menos um produto.";
export const MSG_COMPRA_ITEM_DUPLICADO = "O mesmo produto não pode aparecer duas vezes na compra.";
export const MSG_COMPRA_ITEM_QUANTIDADE = "Informe uma quantidade válida.";
export const MSG_COMPRA_ITEM_FAZENDA = "Há produto que não pertence à Fazenda da compra.";
export const MSG_COMPRA_TOTAIS = "Os totais da compra não fecham. Revise valores e frete.";
export const MSG_COMPRA_IDEMPOTENCY = "Informe a chave de confirmação da compra.";
export const MSG_COMPRA_ESTORNO_COM_PAGAMENTO =
  "Esta compra possui pagamento financeiro registrado. Estorne ou regularize o pagamento antes de estornar a compra.";
export const MSG_COMPRA_JA_ESTORNADA = "Esta compra já foi estornada.";
export const MSG_COMPRA_LINHA_ISOLADA =
  "Esta compra está vinculada ao Financeiro. Estorne a operação inteira; não é possível desfazer só um item.";
export const MSG_COMPRA_EDITAR_INTEGRADA =
  "Esta compra já está vinculada ao Financeiro. Estorne a compra para corrigir e registre novamente.";

export type PessoaFornecedorSnapshot = {
  id: number;
  nome: string;
  ativo: boolean;
  tipo: string;
};

export type CompraInsumosItemComercial = {
  estoqueId: number;
  quantidade: number;
  valorMercadoria: number;
};

export type CompraInsumosValores = {
  valorMercadorias: number;
  valorFrete: number;
  valorComercialTotal: number;
};

export type CompraInsumosLinhaRateada = {
  estoqueId: number;
  quantidade: number;
  valorMercadoria: number;
  valorFrete: number;
  valorTotal: number;
};

export type TituloCompraInsumosPlano = {
  pessoaId: number;
  contraparteNomeSnapshot: string;
  valorOriginal: number;
  origemItemChave: string;
  descricao: string;
};

export function pessoaAdequadaComoFornecedor(pessoa: PessoaFornecedorSnapshot | null | undefined): pessoa is PessoaFornecedorSnapshot {
  return Boolean(pessoa && pessoa.ativo && pessoa.tipo === "fornecedor");
}

export function calcularValoresCompraInsumos(
  valorMercadorias: number | string,
  valorFrete: number | string,
): CompraInsumosValores {
  const mercadorias = dinheiroNaoNegativo(valorMercadorias) ? Number(persistirValor(valorMercadorias)) : NaN;
  const frete = dinheiroNaoNegativo(valorFrete) ? Number(persistirValor(valorFrete)) : NaN;
  return {
    valorMercadorias: mercadorias,
    valorFrete: frete,
    valorComercialTotal: somarDinheiro(mercadorias, frete),
  };
}

/**
 * Mesma regra econômica da tela atual: rateio proporcional ao valor da mercadoria.
 * O último item participante recebe o residual para fechar os centavos.
 */
export function ratearFreteCompraInsumos(
  itens: Array<{ valorMercadoria: number }>,
  valorFrete: number,
): number[] {
  const freteCentavos = toCentavos(valorFrete);
  if (!Number.isFinite(freteCentavos) || freteCentavos <= 0) {
    return itens.map(() => 0);
  }
  const participantes = itens
    .map((item, index) => ({ index, centavos: toCentavos(item.valorMercadoria) }))
    .filter(item => Number.isFinite(item.centavos) && item.centavos > 0);
  const subtotal = participantes.reduce((acc, item) => acc + item.centavos, 0);
  const shares = itens.map(() => 0);
  if (subtotal <= 0) return shares;

  let alocado = 0;
  participantes.forEach((item, pos) => {
    const ultimo = pos === participantes.length - 1;
    const share = ultimo
      ? freteCentavos - alocado
      : Math.round((freteCentavos * item.centavos) / subtotal);
    shares[item.index] = share;
    alocado += share;
  });
  return shares.map(c => c / 100);
}

export function montarLinhasCompraInsumos(
  itens: CompraInsumosItemComercial[],
  valorFrete: number,
): CompraInsumosLinhaRateada[] {
  const shares = ratearFreteCompraInsumos(itens, valorFrete);
  return itens.map((item, i) => {
    const frete = shares[i] ?? 0;
    return {
      estoqueId: item.estoqueId,
      quantidade: item.quantidade,
      valorMercadoria: Number(persistirValor(item.valorMercadoria)),
      valorFrete: Number(persistirValor(frete)),
      valorTotal: somarDinheiro(item.valorMercadoria, frete),
    };
  });
}

export function validarTotaisCompraInsumos(
  linhas: Array<{ valorTotal: number | string; valorFrete: number | string; valorMercadoria?: number | string }>,
  operacao: CompraInsumosValores,
): boolean {
  const somaValor = somarDinheiro(...linhas.map(l => l.valorTotal));
  const somaFrete = somarDinheiro(...linhas.map(l => l.valorFrete));
  const somaMercadorias = somarDinheiro(
    ...linhas.map(l => l.valorMercadoria ?? subtrairDinheiro(l.valorTotal, l.valorFrete)),
  );
  return (
    dinheiroIgual(somaValor, operacao.valorComercialTotal)
    && dinheiroIgual(somaFrete, operacao.valorFrete)
    && dinheiroIgual(somaMercadorias, operacao.valorMercadorias)
    && dinheiroIgual(operacao.valorComercialTotal, somarDinheiro(operacao.valorMercadorias, operacao.valorFrete))
  );
}

export function validarConfirmacaoCompraInsumos(input: {
  fornecedor: PessoaFornecedorSnapshot | null;
  freteCredor: PessoaFornecedorSnapshot | null;
  valorFrete: number;
  itens: CompraInsumosItemComercial[];
}): { ok: true } | { ok: false; message: string } {
  if (!input.itens.length) return { ok: false, message: MSG_COMPRA_ITENS };
  const ids = new Set<number>();
  let mercadorias = 0;
  for (const item of input.itens) {
    if (ids.has(item.estoqueId)) return { ok: false, message: MSG_COMPRA_ITEM_DUPLICADO };
    ids.add(item.estoqueId);
    if (!(item.quantidade > 0)) return { ok: false, message: MSG_COMPRA_ITEM_QUANTIDADE };
    if (!dinheiroNaoNegativo(item.valorMercadoria)) return { ok: false, message: MSG_COMPRA_VALOR_OBRIGATORIO };
    mercadorias += toCentavos(item.valorMercadoria);
  }
  if (!input.fornecedor) return { ok: false, message: MSG_COMPRA_FORNECEDOR_OBRIGATORIO };
  if (!pessoaAdequadaComoFornecedor(input.fornecedor)) {
    return { ok: false, message: MSG_COMPRA_FORNECEDOR_TIPO };
  }
  const frete = toCentavos(input.valorFrete);
  if (!Number.isFinite(frete) || frete < 0) return { ok: false, message: MSG_COMPRA_TOTAIS };
  if (frete > 0 && mercadorias <= 0) return { ok: false, message: MSG_COMPRA_FRETE_SEM_MERCADORIAS };
  if (frete > 0) {
    if (!input.freteCredor) return { ok: false, message: MSG_COMPRA_FRETE_CREDOR };
    if (!pessoaAdequadaComoFornecedor(input.freteCredor)) {
      return { ok: false, message: MSG_COMPRA_FRETE_CREDOR_INVALIDO };
    }
  }
  if (mercadorias + Math.max(0, frete) <= 0) return { ok: false, message: MSG_COMPRA_VALOR_OBRIGATORIO };
  return { ok: true };
}

export function planejarTitulosCompraInsumos(input: {
  fornecedor: PessoaFornecedorSnapshot;
  freteCredor: PessoaFornecedorSnapshot | null;
  valores: CompraInsumosValores;
}): TituloCompraInsumosPlano[] {
  const { fornecedor, valores } = input;
  const freteCredor = valores.valorFrete > 0 ? input.freteCredor ?? fornecedor : null;
  if (!(valores.valorFrete > 0) || !freteCredor || freteCredor.id === fornecedor.id) {
    return [{
      pessoaId: fornecedor.id,
      contraparteNomeSnapshot: fornecedor.nome,
      valorOriginal: valores.valorComercialTotal,
      origemItemChave: COMPRA_INSUMOS_CHAVE_PRINCIPAL,
      descricao: `Compra de insumos — ${fornecedor.nome}`,
    }];
  }
  return [
    {
      pessoaId: fornecedor.id,
      contraparteNomeSnapshot: fornecedor.nome,
      valorOriginal: valores.valorMercadorias,
      origemItemChave: COMPRA_INSUMOS_CHAVE_MERCADORIAS,
      descricao: `Compra de insumos — ${fornecedor.nome}`,
    },
    {
      pessoaId: freteCredor.id,
      contraparteNomeSnapshot: freteCredor.nome,
      valorOriginal: valores.valorFrete,
      origemItemChave: COMPRA_INSUMOS_CHAVE_FRETE,
      descricao: `Frete da compra de insumos — ${freteCredor.nome}`,
    },
  ];
}

export function chaveGrupoPorOperacaoId(operacaoId: number | null | undefined): string | null {
  const id = Number(operacaoId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return `op:${id}`;
}

export function grupoIdCompativelOperacao(operacaoId: number): string {
  return `op${operacaoId}`.slice(0, 40);
}

export function isMysqlDuplicateKey(error: unknown): boolean {
  const err = error as { errno?: number; code?: string; message?: string };
  return err?.errno === 1062 || err?.code === "ER_DUP_ENTRY" || /duplicate/i.test(String(err?.message ?? ""));
}
