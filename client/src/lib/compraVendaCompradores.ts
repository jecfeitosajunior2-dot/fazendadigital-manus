/** Rotas de Compra e Venda. Compradores não entram no menu lateral. */
export const COMPRA_VENDA_VISAO_GERAL_PATH = "/compra-venda/visao-geral";
export const COMPRA_VENDA_COMPRAS_PATH = "/compra-venda/compras";
export const COMPRA_VENDA_VENDA_NOVA_PATH = "/compra-venda/vendas/nova";
export const COMPRA_VENDA_VENDAS_PATH = "/compra-venda/vendas";
export const COMPRA_VENDA_COMPRADORES_PATH = "/compra-venda/vendas/compradores";

export function compraVendaVendaDetalhePath(id: number): string {
  return `/compra-venda/vendas/${id}`;
}

export type PessoaCompradorOpcao = {
  id: number;
  nome: string;
};

/** Resolve o nome persistido em `vendas.comprador` a partir da pessoa selecionada. */
export function nomeCompradorPorId(
  pessoas: ReadonlyArray<PessoaCompradorOpcao>,
  compradorId: string,
): string {
  if (!compradorId.trim()) return "";
  const id = Number(compradorId);
  if (!Number.isFinite(id) || id <= 0) return "";
  return pessoas.find(p => p.id === id)?.nome.trim() ?? "";
}

export function opcoesComprador(
  pessoas: ReadonlyArray<PessoaCompradorOpcao>,
): Array<{ value: string; label: string }> {
  return pessoas.map(p => ({ value: String(p.id), label: p.nome }));
}
