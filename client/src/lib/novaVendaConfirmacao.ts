/**
 * Orquestra a confirmação da Nova Venda.
 * Comercial: só a rota comercial, sem ven- e sem condição no payload.
 * Integrado: intenção persistida + rota integrada, sem fallback comercial.
 * Manutenção: nenhuma rota; aviso no servidor e na tela.
 */
import type { IntencaoConfirmacaoVendaFinanceiro } from "@shared/vendaFinanceiro";
import {
  MSG_VENDA_CONFIRMACAO_MANUTENCAO,
  isEstadoConfirmacaoVenda,
  type EstadoConfirmacaoVenda,
} from "@shared/vendaIntegracao";
import {
  parcelasDoRascunhoNovaVenda,
  validarRascunhoCondicaoNovaVenda,
  type RascunhoCondicaoNovaVenda,
} from "./novaVendaCondicao";
import {
  decidirChaveConfirmacaoVenda,
  gravarTentativaPendenciaVenda,
  marcarConfirmacaoVendaConcluida,
  marcarErroDefinitivoConfirmacaoVenda,
  marcarTimeoutConfirmacaoVenda,
  montarTentativaConfirmacaoVenda,
  payloadDaTentativaVenda,
  prepararRetryConfirmacaoVenda,
  prepararVerificacaoConfirmacaoVenda,
  vendaRecusaDefinitiva,
  vendaResultadoDesconhecido,
  type ArmazenamentoPendenciaVenda,
  type CoordenacaoPendenciaVenda,
  type PayloadConfirmacaoVendaIntegrada,
  type TentativaConfirmacaoVenda,
} from "./novaVendaPendencia";

export type PayloadConfirmacaoNovaVendaComercial = {
  fazendaId: number;
  data: string;
  compradorId: number;
  formaPrecificacao: "kg" | "cabeca" | "arroba";
  precoPadrao?: number | null;
  observacoes?: string;
  itens: Array<{ animalId: number; pesoVenda?: number | null; precoUnitario: number }>;
};

export type ResultadoConfirmacaoNovaVenda =
  | { ok: true; fluxo: "comercial"; vendaId: number }
  | { ok: true; fluxo: "integrado"; vendaId: number; tituloId: number; idempotente: boolean }
  | { ok: false; motivo: "validacao" | "travada" | "outra_aba" | "negocio" | "desconhecido" | "ids" | "flag"; message: string };

export type EstadoFlagConfirmacaoVenda =
  | { estado: "pendente" }
  | { estado: "falha" }
  | { estado: "pronta"; integracaoAtiva: boolean; modo?: EstadoConfirmacaoVenda };

export const MSG_VENDA_CONFIRMACAO_SEM_FALLBACK =
  "A confirmação integrada falhou. A rota comercial não é usada como alternativa.";
export const MSG_VENDA_CONFIRMACAO_IDS_INVALIDOS =
  "A confirmação voltou sem identificadores válidos da venda e do título. A tentativa foi preservada.";
export const MSG_VENDA_CONFIRMACAO_TIMEOUT =
  "Não foi possível confirmar se a venda foi gravada. A chave e o payload originais foram preservados.";
export const MSG_VENDA_CONFIRMACAO_FLAG_PENDENTE =
  "Aguarde o servidor informar se a venda entra no Financeiro. A venda ainda não foi enviada.";
export const MSG_VENDA_CONFIRMACAO_FLAG_INDISPONIVEL =
  "Não foi possível falar com o servidor sobre o tipo de confirmação. A venda não foi enviada. Tente de novo.";

export { MSG_VENDA_CONFIRMACAO_MANUTENCAO };

export function modoDaFlagConfirmacaoVenda(flag: Extract<EstadoFlagConfirmacaoVenda, { estado: "pronta" }>): EstadoConfirmacaoVenda {
  if (isEstadoConfirmacaoVenda(flag.modo)) return flag.modo;
  return flag.integracaoAtiva === true ? "integrado" : "comercial";
}

export function decidirFluxoConfirmacaoNovaVenda(integracaoAtiva: boolean): "comercial" | "integrado" {
  return integracaoAtiva === true ? "integrado" : "comercial";
}

export function estadoConsultaFlagConfirmacaoVenda(query: {
  isPending?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  data?: boolean | EstadoConfirmacaoVenda | { estado?: unknown };
}): EstadoFlagConfirmacaoVenda {
  if (query.isError === true) return { estado: "falha" };
  if (query.isSuccess !== true) return { estado: "pendente" };
  const bruto = query.data;
  if (isEstadoConfirmacaoVenda(bruto)) {
    return { estado: "pronta", modo: bruto, integracaoAtiva: bruto === "integrado" };
  }
  if (bruto && typeof bruto === "object" && isEstadoConfirmacaoVenda(bruto.estado)) {
    return { estado: "pronta", modo: bruto.estado, integracaoAtiva: bruto.estado === "integrado" };
  }
  if (typeof bruto === "boolean") {
    return {
      estado: "pronta",
      modo: bruto === true ? "integrado" : "comercial",
      integracaoAtiva: bruto === true,
    };
  }
  return { estado: "pendente" };
}

export function mensagemFlagConfirmacaoVenda(flag: EstadoFlagConfirmacaoVenda): string {
  if (flag.estado === "falha") return MSG_VENDA_CONFIRMACAO_FLAG_INDISPONIVEL;
  if (flag.estado === "pronta" && modoDaFlagConfirmacaoVenda(flag) === "manutencao") {
    return MSG_VENDA_CONFIRMACAO_MANUTENCAO;
  }
  return MSG_VENDA_CONFIRMACAO_FLAG_PENDENTE;
}

function normalizarFlagPronta(input: {
  integracaoAtiva?: boolean;
  modo?: EstadoConfirmacaoVenda;
}): Extract<EstadoFlagConfirmacaoVenda, { estado: "pronta" }> {
  if (isEstadoConfirmacaoVenda(input.modo)) {
    return { estado: "pronta", modo: input.modo, integracaoAtiva: input.modo === "integrado" };
  }
  const integrada = input.integracaoAtiva === true;
  return { estado: "pronta", modo: integrada ? "integrado" : "comercial", integracaoAtiva: integrada };
}

function flagDaConfirmacao(input: {
  flag?: EstadoFlagConfirmacaoVenda;
  integracaoAtiva?: boolean;
}): EstadoFlagConfirmacaoVenda {
  if (input.flag) {
    if (input.flag.estado !== "pronta") return input.flag;
    return normalizarFlagPronta(input.flag);
  }
  if (typeof input.integracaoAtiva === "boolean") {
    return normalizarFlagPronta({ integracaoAtiva: input.integracaoAtiva });
  }
  return { estado: "pendente" };
}

export function montarIntencaoNovaVenda(input: {
  fazendaId: number;
  data: string;
  compradorId: number;
  formaPrecificacao: string;
  precoPadrao?: number | null;
  observacoes?: string | null;
  itens: PayloadConfirmacaoNovaVendaComercial["itens"];
  rascunho: RascunhoCondicaoNovaVenda;
}): { ok: true; intencao: IntencaoConfirmacaoVendaFinanceiro } | { ok: false; message: string } {
  const validado = validarRascunhoCondicaoNovaVenda({
    fazendaId: input.fazendaId,
    data: input.data,
    compradorId: input.compradorId,
    formaPrecificacao: input.formaPrecificacao,
    itens: input.itens,
    rascunho: input.rascunho,
  });
  if (!validado.ok) return { ok: false, message: validado.message };
  return {
    ok: true,
    intencao: {
      fazendaId: input.fazendaId,
      data: input.data,
      compradorId: input.compradorId,
      formaPrecificacao: input.formaPrecificacao,
      precoPadrao: input.precoPadrao ?? null,
      observacoes: input.observacoes ?? null,
      itens: input.itens,
      condicao: input.rascunho.condicao,
      parcelas: parcelasDoRascunhoNovaVenda(input.rascunho),
    },
  };
}

function codigoDoErro(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const comData = error as { data?: { code?: string }; code?: string };
  return comData.data?.code ?? comData.code;
}

function mensagemDoErro(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const texto = String((error as { message?: unknown }).message ?? "").trim();
    if (texto) return texto;
  }
  return fallback;
}

export async function executarConfirmacaoNovaVenda(input: {
  flag?: EstadoFlagConfirmacaoVenda;
  integracaoAtiva?: boolean;
  userId: number;
  abaToken: string;
  comercial: PayloadConfirmacaoNovaVendaComercial;
  rascunho: RascunhoCondicaoNovaVenda;
  confirmarComercial: (payload: PayloadConfirmacaoNovaVendaComercial) => Promise<{ vendaId: number }>;
  confirmarIntegrada: (payload: PayloadConfirmacaoVendaIntegrada) => Promise<{
    vendaId: number;
    tituloId: number;
    idempotente?: boolean;
  }>;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
  gerarUuid?: () => string;
}): Promise<ResultadoConfirmacaoNovaVenda> {
  const flag = flagDaConfirmacao(input);
  if (flag.estado !== "pronta") {
    return { ok: false, motivo: "flag", message: mensagemFlagConfirmacaoVenda(flag) };
  }
  const modo = modoDaFlagConfirmacaoVenda(flag);
  if (modo === "manutencao") {
    return { ok: false, motivo: "flag", message: MSG_VENDA_CONFIRMACAO_MANUTENCAO };
  }
  if (modo === "comercial" || decidirFluxoConfirmacaoNovaVenda(flag.integracaoAtiva) === "comercial") {
    const result = await input.confirmarComercial(input.comercial);
    return { ok: true, fluxo: "comercial", vendaId: result.vendaId };
  }

  const intencao = montarIntencaoNovaVenda({
    ...input.comercial,
    rascunho: input.rascunho,
  });
  if (!intencao.ok) return { ok: false, motivo: "validacao", message: intencao.message };

  const chave = decidirChaveConfirmacaoVenda({
    userId: input.userId,
    intencao: intencao.intencao,
    storage: input.storage,
    gerarUuid: input.gerarUuid,
  });
  if (!chave.ok) {
    return {
      ok: false,
      motivo: chave.motivo === "travada" ? "travada" : "validacao",
      message: chave.motivo === "travada"
        ? "Esta tentativa ficou travada com comprador, animais, preços e condição originais até o resultado oficial."
        : "Não foi possível preparar a chave desta confirmação.",
    };
  }

  const montada = montarTentativaConfirmacaoVenda({
    userId: input.userId,
    idempotencyKey: chave.chave,
    intencao: intencao.intencao,
    estado: "enviando",
    abaToken: input.abaToken,
  });
  if (!montada.ok) return { ok: false, motivo: "validacao", message: "Não foi possível montar a intenção da venda." };

  const gravada = await gravarTentativaPendenciaVenda({
    tentativa: montada.tentativa,
    storage: input.storage,
    coordenacao: input.coordenacao,
  });
  if (!gravada.ok) {
    return {
      ok: false,
      motivo: gravada.motivo === "outra_aba" ? "outra_aba" : "travada",
      message: gravada.motivo === "outra_aba"
        ? "Outra aba já está tratando esta mesma tentativa. A chave e o payload originais foram preservados."
        : "Esta tentativa ficou travada com comprador, animais, preços e condição originais até o resultado oficial.",
    };
  }

  return enviarConfirmacaoIntegrada({
    tentativa: montada.tentativa,
    confirmarIntegrada: input.confirmarIntegrada,
    storage: input.storage,
    coordenacao: input.coordenacao,
  });
}

async function enviarConfirmacaoIntegrada(input: {
  tentativa: TentativaConfirmacaoVenda;
  confirmarIntegrada: (payload: PayloadConfirmacaoVendaIntegrada) => Promise<{
    vendaId: number;
    tituloId: number;
    idempotente?: boolean;
  }>;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<ResultadoConfirmacaoNovaVenda> {
  const payload = payloadDaTentativaVenda(input.tentativa);
  try {
    const result = await input.confirmarIntegrada(payload);
    if (!Number.isInteger(result.vendaId) || result.vendaId <= 0
      || !Number.isInteger(result.tituloId) || result.tituloId <= 0) {
      await marcarTimeoutConfirmacaoVenda({
        userId: input.tentativa.userId,
        idempotencyKey: payload.idempotencyKey,
        storage: input.storage,
        coordenacao: input.coordenacao,
      });
      return { ok: false, motivo: "ids", message: MSG_VENDA_CONFIRMACAO_IDS_INVALIDOS };
    }
    const limpa = await marcarConfirmacaoVendaConcluida({
      userId: input.tentativa.userId,
      idempotencyKey: payload.idempotencyKey,
      vendaId: result.vendaId,
      tituloId: result.tituloId,
      storage: input.storage,
      coordenacao: input.coordenacao,
    });
    if (!limpa.ok) {
      return { ok: false, motivo: "outra_aba", message: "Outra aba já está tratando esta mesma tentativa. A chave e o payload originais foram preservados." };
    }
    return {
      ok: true,
      fluxo: "integrado",
      vendaId: result.vendaId,
      tituloId: result.tituloId,
      idempotente: result.idempotente === true,
    };
  } catch (error) {
    const codigo = codigoDoErro(error);
    const message = mensagemDoErro(error, MSG_VENDA_CONFIRMACAO_TIMEOUT);
    if (vendaRecusaDefinitiva(codigo)) {
      await marcarErroDefinitivoConfirmacaoVenda({
        userId: input.tentativa.userId,
        idempotencyKey: payload.idempotencyKey,
        storage: input.storage,
        coordenacao: input.coordenacao,
      });
      return { ok: false, motivo: "negocio", message };
    }
    await marcarTimeoutConfirmacaoVenda({
      userId: input.tentativa.userId,
      idempotencyKey: payload.idempotencyKey,
      storage: input.storage,
      coordenacao: input.coordenacao,
    });
    return {
      ok: false,
      motivo: vendaResultadoDesconhecido({ codigo, mensagem: message }) ? "desconhecido" : "desconhecido",
      message: MSG_VENDA_CONFIRMACAO_TIMEOUT,
    };
  }
}

export async function executarVerificacaoConfirmacaoNovaVenda(input: {
  flag?: EstadoFlagConfirmacaoVenda;
  integracaoAtiva?: boolean;
  tentativa: TentativaConfirmacaoVenda;
  intencaoAtual: IntencaoConfirmacaoVendaFinanceiro;
  confirmarIntegrada: (payload: PayloadConfirmacaoVendaIntegrada) => Promise<{
    vendaId: number;
    tituloId: number;
    idempotente?: boolean;
  }>;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<ResultadoConfirmacaoNovaVenda> {
  const flag = flagDaConfirmacao(input);
  if (flag.estado !== "pronta") {
    return { ok: false, motivo: "flag", message: mensagemFlagConfirmacaoVenda(flag) };
  }
  if (modoDaFlagConfirmacaoVenda(flag) === "manutencao") {
    return { ok: false, motivo: "flag", message: MSG_VENDA_CONFIRMACAO_MANUTENCAO };
  }
  const preparo = prepararVerificacaoConfirmacaoVenda({
    tentativa: input.tentativa,
    integracaoAtiva: flag.integracaoAtiva,
  });
  if (!preparo.ok) {
    return { ok: false, motivo: "flag", message: preparo.mensagem };
  }
  const retry = prepararRetryConfirmacaoVenda({
    tentativa: input.tentativa,
    intencaoAtual: input.intencaoAtual,
  });
  if (!retry.ok) {
    return {
      ok: false,
      motivo: "travada",
      message: "Esta tentativa ficou travada com comprador, animais, preços e condição originais até o resultado oficial.",
    };
  }
  const enviando = await gravarTentativaPendenciaVenda({
    tentativa: { ...input.tentativa, estado: "enviando" },
    storage: input.storage,
    coordenacao: input.coordenacao,
  });
  if (!enviando.ok) {
    return {
      ok: false,
      motivo: enviando.motivo === "outra_aba" ? "outra_aba" : "travada",
      message: "Outra aba já está tratando esta mesma tentativa. A chave e o payload originais foram preservados.",
    };
  }
  return enviarConfirmacaoIntegrada({
    tentativa: { ...input.tentativa, estado: "enviando" },
    confirmarIntegrada: async payload => {
      if (payload.idempotencyKey !== retry.payload.idempotencyKey) {
        throw new Error(MSG_VENDA_CONFIRMACAO_SEM_FALLBACK);
      }
      return input.confirmarIntegrada(retry.payload);
    },
    storage: input.storage,
    coordenacao: input.coordenacao,
  });
}
