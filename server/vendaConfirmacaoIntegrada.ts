/**
 * Porta das rotas de confirmação. O estado do servidor decide o caminho
 * antes de qualquer transação: comercial, integrado ou manutenção.
 * Produção permanece comercial. Nada aqui liga a integração.
 */
import { TRPCError } from "@trpc/server";
import {
  autorizarRotaConfirmacaoVenda,
  estadoConfirmacaoVenda as estadoPelaConfig,
  integracaoConfirmacaoVendaAtiva as integracaoPelaConfig,
  type ConfiguracaoConfirmacaoVenda,
  type EstadoConfirmacaoVenda,
  type RotaConfirmacaoVenda,
} from "../shared/vendaIntegracao";
import {
  confirmarVendaComercial,
  type ConfirmarVendaInput,
} from "./confirmarVenda";
import {
  createConfirmarVendaFinanceiroService,
  type ConfirmarVendaFinanceiroInput,
  type ConfirmarVendaFinanceiroStore,
} from "./confirmarVendaFinanceiro";

export function integracaoConfirmacaoVendaAtiva(
  config?: ConfiguracaoConfirmacaoVenda | null,
): boolean {
  return integracaoPelaConfig(config);
}

export function estadoConfirmacaoVenda(
  config?: ConfiguracaoConfirmacaoVenda | null,
): EstadoConfirmacaoVenda {
  return estadoPelaConfig(config);
}

function recusarSeRotaNegada(
  rota: RotaConfirmacaoVenda,
  config?: ConfiguracaoConfirmacaoVenda | null,
): void {
  const decisao = autorizarRotaConfirmacaoVenda(rota, config);
  if (!decisao.ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: decisao.message,
    });
  }
}

export async function confirmarVendaComercialSePermitida(
  userId: number,
  input: ConfirmarVendaInput,
  config?: ConfiguracaoConfirmacaoVenda | null,
) {
  recusarSeRotaNegada("comercial", config);
  return confirmarVendaComercial(userId, input);
}

export async function confirmarVendaIntegradaSeAtiva(
  store: ConfirmarVendaFinanceiroStore,
  userId: number,
  input: ConfirmarVendaFinanceiroInput,
  config?: ConfiguracaoConfirmacaoVenda | null,
) {
  recusarSeRotaNegada("integrada", config);
  return createConfirmarVendaFinanceiroService(store).confirmar(userId, input);
}
