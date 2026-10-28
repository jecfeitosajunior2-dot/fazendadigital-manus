/**
 * Cadastro manual de despesa (Contas a Pagar).
 * Usa titulosCreateManual. Não paga e não mexe no caixa.
 */

import { dinheiroPositivo, fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  MSG_FIN_FAZENDA_INVALIDA,
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_PESSOA_INVALIDA,
  MSG_FIN_VALOR_POSITIVO,
  validarSomaParcelas,
} from "@shared/financeiroNucleo";
import {
  MSG_CONDICAO_NUMERO_DUPLICADO,
  MSG_CONDICAO_QUANTIDADE,
  MSG_CONDICAO_VENCIMENTO,
  aplicarModalidadeCondicao,
  aplicarQuantidadeParcelas,
  parseValorParcela,
  vencimentoISOValido,
  type LinhaRascunhoParcela,
  type ParcelaDefinicaoV2,
} from "./contasAPagarCondicao";
import { FINANCEIRO_CONTAS_A_PAGAR_PATH } from "./contasAPagarListagem";
import { FINANCEIRO_PESSOAS_PATH } from "./pessoasListagem";

export const MSG_DESPESA_DESCRICAO = "Informe a descrição da despesa.";
export const MSG_DESPESA_DATA = "Informe a data de emissão.";
export const MSG_DESPESA_FORNECEDOR = "Selecione o fornecedor.";
export const MSG_DESPESA_CADASTRADA = "Despesa cadastrada. O pagamento é feito no detalhe.";
export const MSG_DESPESA_ERRO = "Não foi possível cadastrar a despesa.";
export const MSG_DESPESA_OCUPADA = "Aguarde o cadastro em andamento.";
export const MSG_DESPESA_SEM_CAIXA = "A despesa entra em aberto. Nada é debitado do caixa agora.";
export const PREFIXO_CHAVE_TITULO_MANUAL = "man-";

export function novaChaveIdempotenciaTituloManual(
  uuid: () => string = () => crypto.randomUUID(),
): string {
  return `${PREFIXO_CHAVE_TITULO_MANUAL}${uuid()}`;
}

export type ModalidadeDespesaManual = "unico" | "parcelado" | "a_definir";

export type FornecedorDespesaV2 = {
  id: number;
  nome: string;
  ativo?: boolean | null;
};

export type FazendaDespesaV2 = {
  id: number;
  nome: string;
};

export type RascunhoDespesaManual = {
  pessoaId: string;
  fazendaOrigemId: string;
  descricao: string;
  valorOriginal: string;
  dataCompetencia: string;
  observacoes: string;
  modalidade: ModalidadeDespesaManual;
  quantidade: number;
  linhas: LinhaRascunhoParcela[];
};

export type ErrosDespesaManual = {
  pessoaId?: string;
  fazendaOrigemId?: string;
  descricao?: string;
  valorOriginal?: string;
  dataCompetencia?: string;
  quantidade?: string;
  geral?: string;
  linhas?: Record<number, { valor?: string; vencimento?: string }>;
};

export type PayloadDespesaManual = {
  tipo: "pagar";
  pessoaId: number;
  descricao: string;
  dataCompetencia: string;
  valorOriginal: number;
  observacoes: string | null;
  fazendaOrigemId: number | null;
  parcelas?: ParcelaDefinicaoV2[];
};

export function rascunhoDespesaVazio(dataCompetencia: string): RascunhoDespesaManual {
  return {
    pessoaId: "",
    fazendaOrigemId: "",
    descricao: "",
    valorOriginal: "",
    dataCompetencia,
    observacoes: "",
    modalidade: "unico",
    quantidade: 1,
    linhas: [{ numero: 1, valor: "", vencimento: dataCompetencia }],
  };
}

export function aplicarModalidadeDespesa(
  rascunho: RascunhoDespesaManual,
  modalidade: ModalidadeDespesaManual,
): RascunhoDespesaManual {
  if (modalidade === "a_definir") {
    return { ...rascunho, modalidade, quantidade: 0, linhas: [] };
  }
  const valor = parseValorParcela(rascunho.valorOriginal);
  const base = aplicarModalidadeCondicao(
    {
      modalidade: rascunho.modalidade === "parcelado" ? "parcelado" : "unico",
      quantidade: Math.max(rascunho.quantidade, modalidade === "parcelado" ? 2 : 1),
      linhas: rascunho.linhas,
    },
    modalidade,
    valor.ok ? valor.valor : 0,
  );
  return { ...rascunho, modalidade, quantidade: base.quantidade, linhas: base.linhas };
}

export function aplicarQuantidadeDespesa(
  rascunho: RascunhoDespesaManual,
  quantidade: number,
): RascunhoDespesaManual {
  const valor = parseValorParcela(rascunho.valorOriginal);
  const aplicado = aplicarQuantidadeParcelas(
    { modalidade: "parcelado", quantidade: rascunho.quantidade, linhas: rascunho.linhas },
    quantidade,
    valor.ok ? valor.valor : 0,
  );
  return { ...rascunho, modalidade: "parcelado", quantidade: aplicado.quantidade, linhas: aplicado.linhas };
}

export function redistribuirParcelasDespesa(rascunho: RascunhoDespesaManual): RascunhoDespesaManual {
  if (rascunho.modalidade === "a_definir") return rascunho;
  const valor = parseValorParcela(rascunho.valorOriginal);
  if (rascunho.modalidade === "unico") {
    return {
      ...rascunho,
      quantidade: 1,
      linhas: [{
        numero: 1,
        valor: valor.ok ? valor.valor.toFixed(2).replace(".", ",") : rascunho.valorOriginal,
        vencimento: rascunho.linhas[0]?.vencimento || rascunho.dataCompetencia,
      }],
    };
  }
  return aplicarQuantidadeDespesa(rascunho, rascunho.quantidade);
}

export function fornecedoresAtivosDespesa(
  pessoas: readonly FornecedorDespesaV2[],
): FornecedorDespesaV2[] {
  return pessoas.filter(pessoa => pessoa.ativo !== false);
}

export function caminhoNovoFornecedorDespesa(retorno = FINANCEIRO_CONTAS_A_PAGAR_PATH): string {
  return `${FINANCEIRO_PESSOAS_PATH}?novo=fornecedor&retorno=${encodeURIComponent(retorno)}`;
}

export function validarDespesaManual(input: {
  rascunho: RascunhoDespesaManual;
  fornecedores: readonly FornecedorDespesaV2[];
  fazendas: readonly FazendaDespesaV2[];
}): { ok: true; payload: PayloadDespesaManual } | { ok: false; erros: ErrosDespesaManual } {
  const erros: ErrosDespesaManual = { linhas: {} };
  const rascunho = input.rascunho;
  const pessoaId = Number(rascunho.pessoaId);
  const fornecedores = fornecedoresAtivosDespesa(input.fornecedores);
  const fornecedor = fornecedores.find(p => p.id === pessoaId);

  if (!Number.isInteger(pessoaId) || pessoaId <= 0) erros.pessoaId = MSG_DESPESA_FORNECEDOR;
  else if (!fornecedor) erros.pessoaId = MSG_FIN_PESSOA_INVALIDA;

  let fazendaOrigemId: number | null = null;
  if (rascunho.fazendaOrigemId.trim()) {
    const id = Number(rascunho.fazendaOrigemId);
    if (!Number.isInteger(id) || id <= 0 || !input.fazendas.some(f => f.id === id)) {
      erros.fazendaOrigemId = MSG_FIN_FAZENDA_INVALIDA;
    } else {
      fazendaOrigemId = id;
    }
  }

  const descricao = rascunho.descricao.trim();
  if (!descricao) erros.descricao = MSG_DESPESA_DESCRICAO;
  else if (descricao.length > 255) erros.descricao = "A descrição pode ter no máximo 255 caracteres.";

  const valor = parseValorParcela(rascunho.valorOriginal);
  if (!valor.ok || !dinheiroPositivo(valor.valor)) erros.valorOriginal = MSG_FIN_VALOR_POSITIVO;

  if (!vencimentoISOValido(rascunho.dataCompetencia)) erros.dataCompetencia = MSG_DESPESA_DATA;

  let parcelas: ParcelaDefinicaoV2[] | undefined;
  if (rascunho.modalidade !== "a_definir") {
    if (rascunho.modalidade === "parcelado" && (rascunho.quantidade < 2 || rascunho.linhas.length < 2)) {
      erros.quantidade = MSG_CONDICAO_QUANTIDADE;
    }
    const numeros = rascunho.linhas.map(linha => linha.numero);
    if (new Set(numeros).size !== numeros.length) erros.geral = MSG_CONDICAO_NUMERO_DUPLICADO;

    parcelas = [];
    for (const linha of rascunho.linhas) {
      const linhaErro: { valor?: string; vencimento?: string } = {};
      const parsed = parseValorParcela(linha.valor);
      if (!parsed.ok) linhaErro.valor = MSG_FIN_VALOR_POSITIVO;
      if (!vencimentoISOValido(linha.vencimento)) linhaErro.vencimento = MSG_CONDICAO_VENCIMENTO;
      if (linhaErro.valor || linhaErro.vencimento) {
        erros.linhas![linha.numero] = linhaErro;
      } else if (parsed.ok) {
        parcelas.push({
          numero: linha.numero,
          vencimento: linha.vencimento.trim(),
          valorOriginal: parsed.valor,
        });
      }
    }
    if (valor.ok && parcelas.length === rascunho.linhas.length && parcelas.length > 0) {
      if (!validarSomaParcelas(valor.valor, parcelas)) {
        erros.geral = erros.geral ?? MSG_FIN_PARCELAS_SOMA;
      }
    }
  }

  if (
    erros.pessoaId
    || erros.fazendaOrigemId
    || erros.descricao
    || erros.valorOriginal
    || erros.dataCompetencia
    || erros.quantidade
    || erros.geral
    || Object.keys(erros.linhas ?? {}).length
    || !valor.ok
  ) {
    return { ok: false, erros };
  }

  return {
    ok: true,
    payload: {
      tipo: "pagar",
      pessoaId,
      descricao,
      dataCompetencia: rascunho.dataCompetencia.trim(),
      valorOriginal: fromCentavos(toCentavos(valor.valor)),
      observacoes: rascunho.observacoes.trim() || null,
      fazendaOrigemId,
      ...(parcelas && parcelas.length > 0 ? { parcelas } : {}),
    },
  };
}

export function mensagemErroDespesaManual(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return "Você não tem permissão para cadastrar esta despesa.";
  if (codigo === "NOT_FOUND") return MSG_FIN_PESSOA_INVALIDA;
  return detalhe?.trim() || MSG_DESPESA_ERRO;
}
