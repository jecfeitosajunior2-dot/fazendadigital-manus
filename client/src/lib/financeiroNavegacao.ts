import { FINANCEIRO_CONTAS_A_PAGAR_PATH } from "./contasAPagarListagem";
import { FINANCEIRO_CONTAS_A_RECEBER_PATH } from "./contasAReceberListagem";
import { FINANCEIRO_CONTAS_V2_PATH } from "./contasFinanceirasV2";
import { FINANCEIRO_PESSOAS_PATH } from "./pessoasListagem";
import { FINANCEIRO_RELATORIOS_PATH } from "@shared/financeiroRelatoriosV2";

export const FINANCEIRO_VISAO_GERAL_PATH = "/financeiro/visao-geral";
export const FINANCEIRO_CAIXA_OFICIAL_PATH = FINANCEIRO_CONTAS_V2_PATH;

export const FINANCEIRO_ROTAS_LEGADO_OPERACIONAIS = [
  "/financeiro/contas",
  "/financeiro/movimentacao",
  "/financeiro/categorias",
] as const;

export const MSG_RELATORIO_FINANCEIRO_INDISPONIVEL =
  "Relatório financeiro ainda não disponível.";

export const MSG_VISAO_GERAL_FINANCEIRO_NEUTRA =
  "Os números oficiais do caixa ficam em Contas a Receber, Contas a Pagar e Caixa e Bancos.";

export const FINANCEIRO_MENU_OFICIAL = [
  { label: "Visão Geral", path: FINANCEIRO_VISAO_GERAL_PATH },
  { label: "Contas a Receber", path: FINANCEIRO_CONTAS_A_RECEBER_PATH },
  { label: "Contas a Pagar", path: FINANCEIRO_CONTAS_A_PAGAR_PATH },
  { label: "Caixa e Bancos", path: FINANCEIRO_CAIXA_OFICIAL_PATH },
  { label: "Relatórios", path: FINANCEIRO_RELATORIOS_PATH },
  { label: "Pessoas", path: FINANCEIRO_PESSOAS_PATH },
] as const;
