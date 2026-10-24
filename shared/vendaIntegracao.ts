/**
 * Fonte única do estado de confirmação de vendas e da flag integrada.
 * Produção permanece COMERCIAL. Integração desligada. Sem env.
 * Testes injetam comercial | integrado | manutencao.
 */
export const ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "comercial" as const;

/** Compatível com fases anteriores: true só se a produção estiver em INTEGRADO. */
export const INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false;

export const ESTADOS_CONFIRMACAO_VENDA = ["comercial", "integrado", "manutencao"] as const;
export type EstadoConfirmacaoVenda = (typeof ESTADOS_CONFIRMACAO_VENDA)[number];

export const MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA =
  "A confirmação integrada com o Financeiro ainda não está ligada.";
export const MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA =
  "A confirmação comercial antiga não pode ser usada enquanto a integração com o Financeiro estiver ligada.";
export const MSG_VENDA_CONFIRMACAO_MANUTENCAO =
  "Novas confirmações de venda estão temporariamente indisponíveis. Tente de novo daqui a pouco.";

export type ConfiguracaoConfirmacaoVenda = {
  estado?: EstadoConfirmacaoVenda;
  integracaoAtiva?: boolean;
};

export type ConfiguracaoConfirmacaoVendaResolvida = {
  estado: EstadoConfirmacaoVenda;
  integracaoAtiva: boolean;
};

export type RotaConfirmacaoVenda = "comercial" | "integrada";

export function isEstadoConfirmacaoVenda(value: unknown): value is EstadoConfirmacaoVenda {
  return value === "comercial" || value === "integrado" || value === "manutencao";
}

function estadoDaProducao(): EstadoConfirmacaoVenda {
  return ESTADO_CONFIRMACAO_VENDA_PRODUCAO === "comercial"
    || ESTADO_CONFIRMACAO_VENDA_PRODUCAO === "integrado"
    || ESTADO_CONFIRMACAO_VENDA_PRODUCAO === "manutencao"
    ? ESTADO_CONFIRMACAO_VENDA_PRODUCAO
    : "comercial";
}

/** Produção: constantes. Testes injetam estado ou a flag antiga. Nada lê env. */
export function configuracaoConfirmacaoVenda(
  override?: ConfiguracaoConfirmacaoVenda | null,
): ConfiguracaoConfirmacaoVendaResolvida {
  if (override && isEstadoConfirmacaoVenda(override.estado)) {
    return {
      estado: override.estado,
      integracaoAtiva: override.estado === "integrado",
    };
  }
  if (override && typeof override.integracaoAtiva === "boolean") {
    const estado: EstadoConfirmacaoVenda = override.integracaoAtiva === true ? "integrado" : "comercial";
    return { estado, integracaoAtiva: estado === "integrado" };
  }
  const estado = estadoDaProducao();
  return { estado, integracaoAtiva: estado === "integrado" };
}

export function estadoConfirmacaoVenda(
  config?: ConfiguracaoConfirmacaoVenda | null,
): EstadoConfirmacaoVenda {
  return configuracaoConfirmacaoVenda(config).estado;
}

export function integracaoConfirmacaoVendaAtiva(
  config?: ConfiguracaoConfirmacaoVenda | null,
): boolean {
  return configuracaoConfirmacaoVenda(config).integracaoAtiva === true;
}

export function autorizarRotaConfirmacaoVenda(
  rota: RotaConfirmacaoVenda,
  config?: ConfiguracaoConfirmacaoVenda | null,
): { ok: true } | { ok: false; message: string } {
  const { estado } = configuracaoConfirmacaoVenda(config);
  if (estado === "manutencao") {
    return { ok: false, message: MSG_VENDA_CONFIRMACAO_MANUTENCAO };
  }
  const ativa = estado === "integrado";
  if (rota === "comercial") {
    if (ativa) return { ok: false, message: MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA };
    return { ok: true };
  }
  if (!ativa) return { ok: false, message: MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA };
  return { ok: true };
}
