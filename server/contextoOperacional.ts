import type { IdentidadeUsuario, PapelConta } from "./_core/identidadeSessao";
import { montarAcesso, type FazendaConhecida, type VinculoFazenda } from "./acessoFazendas";
import { podeExecutarOperacao, type DecisaoAutorizacao, type PedidoAutorizacao } from "./autorizacao";
import { permissaoExigeFazenda, permissaoPorId } from "./catalogoPermissoes";

/**
 * Contexto de uma operação do dia a dia.
 * titularUserId é o dono da conta. executorUserId é quem fez a ação.
 * Não troca o significado de userId nas tabelas: animal e lote usam o titular;
 * movimentação de estoque, canceladoPor e executorUserId continuam sendo quem agiu;
 * usuario_fazendas.userId continua sendo quem recebeu o acesso.
 */
export type ContextoOperacional = {
  executorUserId: number;
  titularUserId: number;
  papel: PapelConta;
  fazendaId?: number;
  permissao: string;
};

export type MotivoOperacional =
  | DecisaoAutorizacao
  | "fazenda_ausente"
  | "fazenda_inexistente"
  | "AUDITORIA_HISTORICA_INDISPONIVEL";

export type ResultadoOperacional =
  | { ok: true; contexto: ContextoOperacional }
  | { ok: false; motivo: MotivoOperacional };

export type EntradaOperacional = {
  identidade: IdentidadeUsuario | null;
  /** Cópias gravadas no servidor. O principal não depende desta lista. */
  permissoes: readonly string[];
  permissaoId: string;
  fazendasDoTitular: readonly FazendaConhecida[];
  vinculos: readonly VinculoFazenda[];
  /** Id pedido pela operação. Só vale se a permissão exige fazenda. */
  fazendaId?: number | null;
  /** Linha carregada no servidor para esse id. Null quando o id não existe. */
  fazenda?: FazendaConhecida | null;
  /** Ignorado. O titular vem da identidade. */
  titularInformadoPeloCliente?: number | null;
  /** Ignorado. O papel vem da identidade. */
  papelInformadoPeloCliente?: string | null;
  /** Ignorado. A lista do navegador não autoriza. */
  permissoesInformadasPeloCliente?: readonly string[] | null;
  /** Ignorado. O acesso à fazenda não vem do navegador. */
  fazendasInformadasPeloCliente?: readonly number[] | null;
  /**
   * Versão vista na sessão já validada.
   * Se vier e divergir da identidade recarregada, a operação recusa.
   */
  sessionVersionDaSessao?: number | null;
};

/**
 * A leitura feita antes do BEGIN não fecha a corrida.
 * Na fase que ligar venda, compra, estoque, financeiro ou oficina,
 * a transação precisa repetir autorizarOperacao com linhas lidas de novo.
 */
export const CONTRATO_REVALIDACAO_OPERACIONAL = {
  revalidarDentroDaTransacao: true,
  consultaAnteriorNaoEliminaCorrida: true,
  isolamento: "READ COMMITTED",
  ordemDeBloqueio: [
    "users do executor",
    "usuario_permissoes do executor",
    "usuario_fazendas do executor",
    "fazenda pedida",
    "registro operacional",
  ],
} as const;

function recusa(motivo: MotivoOperacional): ResultadoOperacional {
  return { ok: false, motivo };
}

function pedidoDe(entrada: EntradaOperacional, acesso: PedidoAutorizacao["acesso"]): PedidoAutorizacao {
  return {
    acesso,
    permissoes: entrada.permissoes,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
  };
}

/** Autoriza uma operação com a identidade já carregada no servidor. Não grava nada. */
export function autorizarOperacao(entrada: EntradaOperacional): ResultadoOperacional {
  const definicao = permissaoPorId(entrada.permissaoId);
  if (!definicao) return recusa("permissao_invalida");

  const acesso = montarAcesso({
    identidade: entrada.identidade,
    fazendasDoTitular: [...entrada.fazendasDoTitular],
    vinculos: [...entrada.vinculos],
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    fazendasInformadasPeloCliente: entrada.fazendasInformadasPeloCliente
      ? [...entrada.fazendasInformadasPeloCliente]
      : null,
  });
  if (!acesso) return recusa("sem_identidade");

  if (
    entrada.sessionVersionDaSessao != null
    && entrada.sessionVersionDaSessao !== entrada.identidade?.sessionVersion
  ) {
    return recusa("sem_identidade");
  }

  const exigeFazenda = permissaoExigeFazenda(definicao);
  let fazenda: FazendaConhecida | null = null;
  if (exigeFazenda) {
    const fazendaId = entrada.fazendaId;
    if (!Number.isInteger(fazendaId) || (fazendaId ?? 0) <= 0) return recusa("fazenda_ausente");
    const carregada = entrada.fazenda ?? null;
    if (!carregada || carregada.id !== fazendaId) return recusa("fazenda_inexistente");
    fazenda = { id: carregada.id, userId: carregada.userId };
  }

  const decisao = podeExecutarOperacao(pedidoDe(entrada, acesso), definicao.id, fazenda);
  if (decisao === "permitido" && definicao.id === "auditoria.visualizar" && acesso.papel !== "principal") {
    return recusa("AUDITORIA_HISTORICA_INDISPONIVEL");
  }
  if (decisao !== "permitido") return recusa(decisao);

  const contexto: ContextoOperacional = {
    executorUserId: acesso.executorUserId,
    titularUserId: acesso.titularUserId,
    papel: acesso.papel,
    permissao: definicao.id,
  };
  if (exigeFazenda && fazenda) contexto.fazendaId = fazenda.id;
  return { ok: true, contexto };
}
