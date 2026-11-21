/**
 * Confirmação e cancelamento de venda no modelo multiusuário.
 *
 * A permissão vendas.confirmar autoriza a baixa comercial do tipo venda
 * desta confirmação. Ela não exige animais.inativar.
 * Morte e transferência externa continuam na rota de manejo, com animais.inativar.
 * O cancelamento usa vendas.cancelar e só estorna a baixa desta venda.
 *
 * A autorização relê o funcionário e a fazenda no banco.
 * Titular, papel, permissões e fazendas enviados pela tela não decidem nada.
 * O dono gravado na venda, na baixa e no título é o titular.
 * O nome de quem clicou continua em usuarioNome e canceladoPorNome.
 *
 * A gravação em si permanece na transação que já existia:
 * venda, itens, baixas, animais e título nascem ou caem juntos.
 * Esta etapa só escolhe o titular e segura a identidade enquanto isso acontece.
 * Se o banco cair, não há confirmação nem cancelamento no JSON.
 *
 * Ordem: identidade e fazenda primeiro; a transação comercial existente
 * segue com os animais em ordem de identificador, as baixas e o título.
 * Um deadlock refaz a autorização e a gravação inteiras.
 * A chave da confirmação integrada continua idempotente no motor já existente.
 */
import { TRPCError } from "@trpc/server";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const MSG_VENDA_CANCELAR_MOTIVO = "Informe o motivo do cancelamento.";
const MSG_VENDA_CANCELAR_NAO_ENCONTRADA = "Venda não encontrada.";

export const PERMISSAO_VENDAS_CONFIRMAR = "vendas.confirmar";
export const PERMISSAO_VENDAS_CANCELAR = "vendas.cancelar";

export const MSG_SEM_PERMISSAO_CONFIRMAR_VENDA = "Você não tem permissão para confirmar a venda.";
export const MSG_SEM_PERMISSAO_CANCELAR_VENDA = "Você não tem permissão para cancelar a venda.";

export const ORDEM_BLOQUEIO_VENDA =
  "identidade e fazenda; depois a transação comercial existente com animais em ordem, baixas e título";

const TENTATIVAS = 3;

export type VendaEspiada = {
  id: number;
  userId: number;
  fazendaId: number | null;
  status: string | null;
};

export type ConsultaVendaOperacao = ConsultaAutorizacaoPersistida & {
  espiarVenda(id: number): Promise<VendaEspiada | null>;
  transacaoAtual?: { transaction: (...args: any[]) => Promise<unknown> };
};

export type IoVendaOperacao = {
  emTransacao<T>(fn: (tx: ConsultaVendaOperacao) => Promise<T>): Promise<T>;
};

export type PedidoConfirmarVenda = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  fazendaId: number;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type PedidoCancelarVenda = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  vendaId: number;
  motivo: string;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

function bancoIndisponivel(error: unknown): boolean {
  const partes: string[] = [];
  const vistos = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !vistos.has(atual)) {
    vistos.add(atual);
    const item = atual as { code?: string; errno?: string | number; message?: string; cause?: unknown };
    partes.push(String(item.code || ""), String(item.errno || ""), String(item.message || ""));
    atual = item.cause;
  }
  const texto = partes.join(" ");
  return ["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].some((codigo) =>
    texto.includes(codigo),
  );
}

function ehDeadlock(error: unknown): boolean {
  const vistos = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !vistos.has(atual)) {
    vistos.add(atual);
    const item = atual as { errno?: number; code?: string; message?: string; cause?: unknown };
    if (item.errno === 1213 || item.code === "ER_LOCK_DEADLOCK") return true;
    if (/deadlock found when trying to get lock/i.test(String(item.message ?? ""))) return true;
    atual = item.cause;
  }
  return false;
}

function erroVenda(motivo: MotivoOperacional, operacao: "confirmar" | "cancelar"): TRPCError {
  const semPermissao = operacao === "confirmar"
    ? MSG_SEM_PERMISSAO_CONFIRMAR_VENDA
    : MSG_SEM_PERMISSAO_CANCELAR_VENDA;
  switch (motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "fazenda_ausente":
      return new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma fazenda." });
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({
        code: "NOT_FOUND",
        message: operacao === "cancelar" ? MSG_VENDA_CANCELAR_NAO_ENCONTRADA : "Registro não encontrado.",
      });
    default:
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
  }
}

async function executar<T>(trabalho: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    try {
      return await trabalho();
    } catch (error) {
      ultimo = error;
      if (error instanceof TRPCError) throw error;
      if (ehDeadlock(error) && tentativa < TENTATIVAS - 1) continue;
      if (bancoIndisponivel(error)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      }
      throw error;
    }
  }
  throw ultimo;
}

function pedidoAuth(
  pedido: PedidoConfirmarVenda | PedidoCancelarVenda,
  permissaoId: string,
  fazendaId: number,
): PedidoAutorizacaoPersistida {
  return {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  };
}

export async function confirmarVendaAutorizada<T>(
  io: IoVendaOperacao,
  pedido: PedidoConfirmarVenda,
  persistir: (titularUserId: number, tx: ConsultaVendaOperacao) => Promise<T>,
): Promise<T> {
  return executar(() => io.emTransacao(async (tx) => {
    const auth = await autorizarOperacaoPersistida(
      tx,
      pedidoAuth(pedido, PERMISSAO_VENDAS_CONFIRMAR, pedido.fazendaId),
    );
    if (!auth.ok) throw erroVenda(auth.motivo, "confirmar");
    return persistir(auth.contexto.titularUserId, tx);
  }));
}

export async function cancelarVendaAutorizada<T>(
  io: IoVendaOperacao,
  pedido: PedidoCancelarVenda,
  persistir: (titularUserId: number, tx: ConsultaVendaOperacao) => Promise<T>,
): Promise<T> {
  const motivo = String(pedido.motivo ?? "").trim();
  if (!motivo) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_VENDA_CANCELAR_MOTIVO });
  }
  return executar(() => io.emTransacao(async (tx) => {
    const venda = await tx.espiarVenda(pedido.vendaId);
    if (!venda || venda.fazendaId == null) {
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_VENDA_CANCELAR_NAO_ENCONTRADA });
    }
    const auth = await autorizarOperacaoPersistida(
      tx,
      pedidoAuth(pedido, PERMISSAO_VENDAS_CANCELAR, venda.fazendaId),
    );
    if (!auth.ok) throw erroVenda(auth.motivo, "cancelar");
    if (venda.userId !== auth.contexto.titularUserId) {
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_VENDA_CANCELAR_NAO_ENCONTRADA });
    }
    return persistir(auth.contexto.titularUserId, tx);
  }));
}
