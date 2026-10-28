/**
 * Cadastro manual de receita (Contas a Receber).
 * Reusa a validação da despesa e titulosCreateManual com tipo receber.
 * Não recebe e não mexe no caixa.
 */

import {
  MSG_DESPESA_DATA,
  MSG_DESPESA_DESCRICAO,
  MSG_DESPESA_FORNECEDOR,
  aplicarModalidadeDespesa,
  aplicarQuantidadeDespesa,
  fornecedoresAtivosDespesa,
  mensagemErroDespesaManual,
  rascunhoDespesaVazio,
  redistribuirParcelasDespesa,
  validarDespesaManual,
  type ErrosDespesaManual,
  type FazendaDespesaV2,
  type FornecedorDespesaV2,
  type ModalidadeDespesaManual,
  type PayloadDespesaManual,
  type RascunhoDespesaManual,
} from "./contasAPagarDespesa";
import { FINANCEIRO_CONTAS_A_RECEBER_PATH } from "./contasAReceberListagem";
import { FINANCEIRO_PESSOAS_PATH } from "./pessoasListagem";

export const MSG_RECEITA_DESCRICAO = "Informe a descrição da receita.";
export const MSG_RECEITA_DATA = "Informe a data de emissão.";
export const MSG_RECEITA_PAGADOR = "Selecione o pagador.";
export const MSG_RECEITA_CADASTRADA = "Receita cadastrada. O recebimento é feito no detalhe.";
export const MSG_RECEITA_ERRO = "Não foi possível cadastrar a receita.";
export const MSG_RECEITA_OCUPADA = "Aguarde o cadastro em andamento.";
export const MSG_RECEITA_SEM_CAIXA = "A receita entra em aberto. Nada entra no caixa agora.";

export type PagadorReceitaV2 = FornecedorDespesaV2;
export type FazendaReceitaV2 = FazendaDespesaV2;
export type RascunhoReceitaManual = RascunhoDespesaManual;
export type ErrosReceitaManual = ErrosDespesaManual;
export type ModalidadeReceitaManual = ModalidadeDespesaManual;
export type PayloadReceitaManual = Omit<PayloadDespesaManual, "tipo"> & { tipo: "receber" };

export const rascunhoReceitaVazio = rascunhoDespesaVazio;
export { novaChaveIdempotenciaTituloManual, PREFIXO_CHAVE_TITULO_MANUAL } from "./contasAPagarDespesa";
export const aplicarModalidadeReceita = aplicarModalidadeDespesa;
export const aplicarQuantidadeReceita = aplicarQuantidadeDespesa;
export const redistribuirParcelasReceita = redistribuirParcelasDespesa;
export const pagadoresAtivosReceita = fornecedoresAtivosDespesa;

export function caminhoNovaPessoaReceita(retorno = FINANCEIRO_CONTAS_A_RECEBER_PATH): string {
  return `${FINANCEIRO_PESSOAS_PATH}?retorno=${encodeURIComponent(retorno)}`;
}

export function validarReceitaManual(input: {
  rascunho: RascunhoReceitaManual;
  pagadores: readonly PagadorReceitaV2[];
  fazendas: readonly FazendaReceitaV2[];
}): { ok: true; payload: PayloadReceitaManual } | { ok: false; erros: ErrosReceitaManual } {
  const resultado = validarDespesaManual({
    rascunho: input.rascunho,
    fornecedores: input.pagadores,
    fazendas: input.fazendas,
  });
  if (!resultado.ok) {
    const erros = { ...resultado.erros };
    if (erros.pessoaId === MSG_DESPESA_FORNECEDOR) erros.pessoaId = MSG_RECEITA_PAGADOR;
    if (erros.descricao === MSG_DESPESA_DESCRICAO) erros.descricao = MSG_RECEITA_DESCRICAO;
    if (erros.dataCompetencia === MSG_DESPESA_DATA) erros.dataCompetencia = MSG_RECEITA_DATA;
    return { ok: false, erros };
  }
  return { ok: true, payload: { ...resultado.payload, tipo: "receber" } };
}

export function mensagemErroReceitaManual(codigo?: string, detalhe?: string): string {
  const texto = mensagemErroDespesaManual(codigo, detalhe);
  if (texto.includes("despesa")) return texto.replace("despesa", "receita");
  return texto === "Não foi possível cadastrar a despesa." ? MSG_RECEITA_ERRO : texto;
}
