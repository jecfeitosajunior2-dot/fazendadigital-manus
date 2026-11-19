import { TRPCError } from "@trpc/server";
import type { ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * Permissão real do catálogo.
 * A descrição dela também cita incluir e mover animais.
 * Esta rota não faz isso: incluir, trocar animais e mudar de pasto
 * continuam nas rotas próprias, que esta fase não altera.
 */
export const PERMISSAO_EDITAR_LOTE = "lotes.editar";

export const CAMPOS_EDICAO_LOTE_CADASTRAL = [
  "nome",
  "sigla",
  "dataCriacao",
  "descricao",
  "localizacao",
  "capacidade",
] as const;

export const CAMPOS_EDICAO_LOTE_ESTRUTURAL = [
  "fazendaId",
  "pastoAtualId",
  "dataEntradaPasto",
  "ativo",
] as const;

export const MSG_EDICAO_LOTE_FAZENDA =
  "Essa alteração mudaria a fazenda do lote. A edição cadastral não transfere o lote.";
export const MSG_EDICAO_LOTE_PASTO =
  "Essa alteração mudaria o pasto do lote. A troca de pasto continua na movimentação.";
export const MSG_EDICAO_LOTE_SITUACAO =
  "A situação do lote não muda nesta edição. Inativar o lote continua no fluxo próprio.";

export type MotivoEdicaoLote =
  | MotivoOperacional
  | "nao_encontrado"
  | "alteracao_estrutural"
  | "situacao_preservada";

export type RecusaEdicaoLote = {
  ok: false;
  motivo: MotivoEdicaoLote;
  campo?: string;
  mensagem?: string;
};

export type LoteParaEdicao = {
  id: number;
  userId: number;
  fazendaId: number | null;
  pastoAtualId: number | null;
  dataEntradaPasto: string | null;
  ativo: boolean | number | null;
};

/**
 * A tela Editar Lote envia id, nome, sigla e dataCriacao.
 * Fazenda e pasto não vão nessa gravação: a troca de pasto usa lotes.moveToPasto.
 * Se alguém reenviar fazenda ou pasto iguais aos do banco, a edição segue.
 * Se o valor for outro, a requisição inteira é recusada.
 */
export type EdicaoLoteInput = {
  id: number;
  nome?: string;
  sigla?: string;
  dataCriacao?: string;
  descricao?: string;
  localizacao?: string;
  capacidade?: number;
  ativo?: boolean;
  pastoAtualId?: number | null;
  dataEntradaPasto?: string | null;
  fazendaId?: number | null;
};

export type ConsultaEdicaoLote = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<LoteParaEdicao | null>;
  atualizarLote(id: number, titularUserId: number, patch: Record<string, unknown>): Promise<void>;
};

export type IoEdicaoLote = {
  emTransacao<T>(fn: (tx: ConsultaEdicaoLote) => Promise<T>): Promise<T>;
  aposAtualizar?: () => Promise<void>;
};

export type PedidoEdicaoLote = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: EdicaoLoteInput;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type SucessoEdicaoLote = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  fazendaId: number;
  patch: Record<string, unknown>;
};

export type ResultadoEdicaoLote = SucessoEdicaoLote | RecusaEdicaoLote;

export type EspelhoEdicaoLote = {
  atualizar(userId: number, id: number, patch: Record<string, unknown>): Promise<void>;
};

function recusa(motivo: MotivoEdicaoLote, mensagem?: string, campo?: string): RecusaEdicaoLote {
  return { ok: false, motivo, mensagem, campo };
}

function idOpcional(valor: number | null | undefined): number | null {
  if (valor == null) return null;
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) return null;
  return Number(valor);
}

function mesmoId(atual: number | null, informado: number | null | undefined): boolean {
  if (informado === undefined) return true;
  const esquerda = atual == null ? null : Number(atual);
  const direita = informado == null ? null : Number(informado);
  return esquerda === direita;
}

function flagAtivo(valor: boolean | number | null | undefined): boolean | null | undefined {
  if (valor === undefined) return undefined;
  if (valor == null) return null;
  if (valor === true || valor === 1) return true;
  if (valor === false || valor === 0) return false;
  return null;
}

function dataCurta(valor: string | null | undefined): string | null {
  if (valor == null || valor === "") return null;
  return String(valor).slice(0, 10);
}

/** Valor igual ao gravado não é movimentação nem inativação. */
export function campoEstruturalLote(lote: LoteParaEdicao, input: EdicaoLoteInput): string | null {
  if (!mesmoId(lote.fazendaId, input.fazendaId)) return "fazendaId";
  if (!mesmoId(lote.pastoAtualId, input.pastoAtualId)) return "pastoAtualId";
  if (input.dataEntradaPasto !== undefined && dataCurta(input.dataEntradaPasto) !== dataCurta(lote.dataEntradaPasto)) {
    return "dataEntradaPasto";
  }
  if (input.ativo !== undefined && flagAtivo(lote.ativo) !== flagAtivo(input.ativo)) return "ativo";
  return null;
}

function mensagemEstrutural(campo: string): string {
  if (campo === "fazendaId") return MSG_EDICAO_LOTE_FAZENDA;
  if (campo === "pastoAtualId" || campo === "dataEntradaPasto") return MSG_EDICAO_LOTE_PASTO;
  return MSG_EDICAO_LOTE_SITUACAO;
}

/** Mesma sigla do update antigo: vazio vira nulo, o restante só perde espaços nas pontas. */
export function patchCadastralLote(input: EdicaoLoteInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.nome !== undefined) patch.nome = input.nome;
  if (input.sigla !== undefined) {
    patch.sigla = input.sigla.trim() === "" ? null : input.sigla.trim();
  }
  if (input.dataCriacao !== undefined) patch.dataCriacao = input.dataCriacao;
  if (input.descricao !== undefined) patch.descricao = input.descricao;
  if (input.localizacao !== undefined) patch.localizacao = input.localizacao;
  if (input.capacidade !== undefined) patch.capacidade = input.capacidade;
  return patch;
}

export function erroEdicaoLote(resultado: RecusaEdicaoLote): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar lotes." });
    case "nao_encontrado":
    case "sem_fazenda":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
    case "fazenda_ausente":
      return new TRPCError({ code: "BAD_REQUEST", message: "Este lote não está ligado a uma fazenda." });
    case "situacao_preservada":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_EDICAO_LOTE_SITUACAO });
    case "alteracao_estrutural":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_EDICAO_LOTE_FAZENDA });
    default:
      return new TRPCError({ code: "FORBIDDEN", message: resultado.mensagem ?? "Edição recusada." });
  }
}

/** Edita só o cadastro do lote. Não mexe em animais, pasto nem histórico. */
export async function editarLoteAutorizado(
  io: IoEdicaoLote,
  pedido: PedidoEdicaoLote,
): Promise<ResultadoEdicaoLote> {
  return io.emTransacao(async (tx) => {
    const lote = await tx.lote(pedido.input.id);
    if (!lote) return recusa("nao_encontrado", "Lote não encontrado.");

    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null) return recusa("sem_identidade");
    if (lote.userId !== usuario.titularUserId) return recusa("nao_encontrado", "Lote não encontrado.");

    const fazendaId = idOpcional(lote.fazendaId);
    if (fazendaId == null) return recusa("fazenda_ausente", "Este lote não está ligado a uma fazenda.");

    const deciso = await autorizarOperacaoPersistida(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_EDITAR_LOTE,
      fazendaId,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (!deciso.ok) {
      if (deciso.motivo === "sem_fazenda" || deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente") {
        return recusa(deciso.motivo, "Lote não encontrado.", "fazendaId");
      }
      return recusa(deciso.motivo);
    }

    const campo = campoEstruturalLote(lote, pedido.input);
    if (campo) {
      const mensagem = mensagemEstrutural(campo);
      if (campo === "ativo") return recusa("situacao_preservada", mensagem, campo);
      return recusa("alteracao_estrutural", mensagem, campo);
    }

    const patch = patchCadastralLote(pedido.input);
    if (Object.keys(patch).length > 0) {
      await tx.atualizarLote(lote.id, deciso.contexto.titularUserId, patch);
    }
    if (io.aposAtualizar) await io.aposAtualizar();
    return {
      ok: true as const,
      id: lote.id,
      userId: deciso.contexto.titularUserId,
      executorUserId: deciso.contexto.executorUserId,
      fazendaId,
      patch,
    };
  });
}

export async function concluirEdicaoLoteNoEspelho(
  espelho: EspelhoEdicaoLote,
  resultado: ResultadoEdicaoLote,
): Promise<void> {
  if (!resultado.ok) return;
  try {
    await espelho.atualizar(resultado.userId, resultado.id, resultado.patch);
  } catch (erro) {
    console.warn("[lotes.update] Espelho local não gravado:", erro);
  }
}

export async function editarEEspelharLote(
  io: IoEdicaoLote,
  pedido: PedidoEdicaoLote,
  espelho: EspelhoEdicaoLote,
): Promise<ResultadoEdicaoLote> {
  const resultado = await editarLoteAutorizado(io, pedido);
  await concluirEdicaoLoteNoEspelho(espelho, resultado);
  return resultado;
}
