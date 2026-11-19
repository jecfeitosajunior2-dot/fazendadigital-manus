import { TRPCError } from "@trpc/server";
import type { ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * O catálogo não separa edição cadastral de movimentação de pasto.
 * Não existe lotes.movimentar nem pastos.mover.
 * lotes.editar é a permissão de escrita do lote que já cita mover animais.
 * pastos.editar só altera o cadastro do pasto.
 * Enquanto não houver uma permissão própria, esta rota usa lotes.editar.
 * Isso junta, na mesma permissão, o cadastro do lote e a troca de pasto.
 */
export const PERMISSAO_MOVIMENTAR_LOTE = "lotes.editar";

export const MSG_DATA_FUTURA = "A data de entrada no pasto não pode ser futura.";
export const MSG_LOTE_AUSENTE = "Lote não encontrado";
export const MSG_PASTO_AUSENTE = "Pasto não encontrado";
export const MSG_PASTO_OUTRA_FAZENDA = "O pasto precisa pertencer à mesma fazenda do lote.";
export const MSG_ANIMAL_OUTRA_FAZENDA =
  "Há animal ativo deste lote em outra fazenda. A movimentação de pasto não transfere o animal.";
export const MSG_LOTE_MUDOU = "O lote mudou durante a movimentação. Tente novamente.";

export class LoteMudouDuranteMovimentacao extends Error {
  constructor() {
    super(MSG_LOTE_MUDOU);
    this.name = "LoteMudouDuranteMovimentacao";
  }
}

export type MotivoMovimentacaoLote =
  | MotivoOperacional
  | "nao_encontrado"
  | "pasto_inexistente"
  | "pasto_outro_titular"
  | "pasto_incompativel"
  | "animal_outra_fazenda"
  | "data_futura";

export type RecusaMovimentacaoLote = {
  ok: false;
  motivo: MotivoMovimentacaoLote;
  mensagem?: string;
};

export type LoteParaMover = {
  id: number;
  userId: number;
  fazendaId: number | null;
  pastoAtualId: number | null;
  dataEntradaPasto: string | null;
};

export type PastoParaMover = {
  id: number;
  userId: number;
  fazendaId: number | null;
  nome: string | null;
};

export type AnimalDoLote = {
  id: number;
  fazendaId: number | null;
  pastoId: number | null;
  status: string | null;
};

export type EstadiaPasto = {
  id: number;
  dataEntrada: string;
};

export type MovimentacaoLoteInput = {
  loteId: number;
  pastoId: number | null;
  observacoes?: string;
  dataEntrada?: string;
};

export type EspelhoMovimentacaoLote = {
  loteId: number;
  pastoId: number | null;
  dataEntrada: string;
  observacoes?: string;
};

export type ConsultaMovimentacaoLote = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<LoteParaMover | null>;
  pasto(id: number): Promise<PastoParaMover | null>;
  animaisAtivos(loteId: number, titularUserId: number): Promise<AnimalDoLote[]>;
  contarAtivos(loteId: number, titularUserId: number): Promise<number>;
  estadiaAberta(loteId: number, pastoDestinoId: number): Promise<EstadiaPasto | null>;
  fecharEstadia(id: number, dataSaida: string, diasNoPasto: number): Promise<void>;
  inserirMovimento(row: {
    userId: number;
    loteId: number;
    pastoOrigemId: number | null;
    pastoDestinoId: number | null;
    dataEntrada: string;
    dataSaida?: string | null;
    diasNoPasto?: number | null;
    qtdAnimais: number;
    observacoes?: string | null;
  }): Promise<void>;
  atualizarLote(id: number, titularUserId: number, patch: Record<string, unknown>): Promise<void>;
  atualizarAnimais(ids: number[], titularUserId: number, patch: Record<string, unknown>): Promise<void>;
  sincronizarStatusPasto(pastoId: number, titularUserId: number): Promise<void>;
  marcarPastoAtivo(pastoId: number, titularUserId: number): Promise<void>;
};

export type IoMovimentacaoLote = {
  emTransacao<T>(fn: (tx: ConsultaMovimentacaoLote) => Promise<T>): Promise<T>;
  aposTravarAnimais?: () => Promise<void>;
  aposHistorico?: () => Promise<void>;
  aposLote?: () => Promise<void>;
  aposAnimais?: () => Promise<void>;
  aposOcupacao?: () => Promise<void>;
};

export type PedidoMovimentacaoLote = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: MovimentacaoLoteInput;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type SucessoMovimentacaoLote = {
  ok: true;
  movimentou: boolean;
  id: number;
  userId: number;
  executorUserId: number;
  fazendaId: number | null;
  pastoAtualId: number | null;
  espelho: EspelhoMovimentacaoLote;
};

export type ResultadoMovimentacaoLote = SucessoMovimentacaoLote | RecusaMovimentacaoLote;

export type EspelhoMovimentacao = {
  mover(userId: number, dados: EspelhoMovimentacaoLote): Promise<void>;
};

/** Mesma conta de dias da rota antiga. Não inventa outra regra. */
export function diasEntrePasto(inicio: string | Date, fim: string | Date = new Date()): number {
  const a = new Date(inicio);
  const b = new Date(fim);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function hojeMovimentacaoLote(agora = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

function recusa(motivo: MotivoMovimentacaoLote, mensagem?: string): RecusaMovimentacaoLote {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function idPositivo(valor: number | null | undefined): number | null {
  if (valor == null) return null;
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) return null;
  return Number(valor);
}

export function erroMovimentacaoLote(resultado: RecusaMovimentacaoLote): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para movimentar o lote." });
    case "nao_encontrado":
    case "sem_fazenda":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: MSG_LOTE_AUSENTE });
    case "pasto_inexistente":
    case "pasto_outro_titular":
      return new TRPCError({ code: "NOT_FOUND", message: MSG_PASTO_AUSENTE });
    case "fazenda_ausente":
      return new TRPCError({ code: "BAD_REQUEST", message: "Este lote não está ligado a uma fazenda." });
    case "data_futura":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_DATA_FUTURA });
    case "pasto_incompativel":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_PASTO_OUTRA_FAZENDA });
    case "animal_outra_fazenda":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_ANIMAL_OUTRA_FAZENDA });
    default:
      return new TRPCError({ code: "FORBIDDEN", message: resultado.mensagem ?? "Movimentação recusada." });
  }
}

async function fecharOrigem(
  tx: ConsultaMovimentacaoLote,
  lote: LoteParaMover,
  origem: number,
  data: string,
  qtdAnimais: number,
  titularUserId: number,
) {
  const aberta = await tx.estadiaAberta(lote.id, origem);
  const dataEntrada = aberta?.dataEntrada ?? lote.dataEntradaPasto ?? data;
  const dias = diasEntrePasto(dataEntrada, data);
  if (aberta) {
    await tx.fecharEstadia(aberta.id, data, dias);
  } else {
    await tx.inserirMovimento({
      userId: titularUserId,
      loteId: lote.id,
      pastoOrigemId: null,
      pastoDestinoId: origem,
      dataEntrada,
      dataSaida: data,
      diasNoPasto: dias,
      qtdAnimais,
      observacoes: null,
    });
  }
}

/**
 * Ordem de trava desta rota. Dois pastos entram pelo id, do menor para o maior,
 * para duas movimentações não se travarem ao contrário.
 * Esta rota trava um lote. Rotas antigas que mexem em dois lotes ou no animal
 * fora daqui não seguem esta ordem. A concorrência com elas continua aberta.
 */
export const ORDEM_BLOQUEIO_MOVIMENTACAO_LOTE = [
  "lote movimentado",
  "usuário, permissões, vínculos e fazenda do lote",
  "pastos de origem e destino, pelo id crescente",
  "animais ativos do lote, pelo id crescente",
  "estadia aberta do histórico",
] as const;

/**
 * Status gravado em pastos.status nesta movimentação.
 * Ocupado (`ativo`) se ainda há lote do titular com pastoAtualId neste pasto,
 * ou animal ativo do titular com pastoId neste pasto.
 * Sem os dois, fica `descanso`. Animal inativo não ocupa.
 * O mapa calcula outro selo na leitura, só com animais ativos, e não grava esta coluna.
 * A conta antiga olhava só o lote e rodava antes de o lote sair, então a origem não esvaziava.
 */
async function atualizarOcupacao(
  tx: ConsultaMovimentacaoLote,
  io: IoMovimentacaoLote,
  origem: number | null,
  destino: number | null,
  titularUserId: number,
) {
  if (origem != null) await tx.sincronizarStatusPasto(origem, titularUserId);
  if (destino != null && destino !== origem) await tx.sincronizarStatusPasto(destino, titularUserId);
  if (io.aposOcupacao) await io.aposOcupacao();
}

export async function movimentarLotePastoAutorizado(
  io: IoMovimentacaoLote,
  pedido: PedidoMovimentacaoLote,
): Promise<ResultadoMovimentacaoLote> {
  const data = pedido.input.dataEntrada ?? hojeMovimentacaoLote();
  if (data > hojeMovimentacaoLote()) return recusa("data_futura", MSG_DATA_FUTURA);

  return io.emTransacao(async (tx) => {
    const lote = await tx.lote(pedido.input.loteId);
    if (!lote) return recusa("nao_encontrado", MSG_LOTE_AUSENTE);

    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null) return recusa("sem_identidade");
    if (lote.userId !== usuario.titularUserId) return recusa("nao_encontrado", MSG_LOTE_AUSENTE);

    const fazendaId = idPositivo(lote.fazendaId);
    if (fazendaId == null) return recusa("fazenda_ausente", "Este lote não está ligado a uma fazenda.");

    const deciso = await autorizarOperacaoPersistida(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_MOVIMENTAR_LOTE,
      fazendaId,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (!deciso.ok) {
      if (deciso.motivo === "sem_fazenda" || deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente") {
        return recusa(deciso.motivo, MSG_LOTE_AUSENTE);
      }
      return recusa(deciso.motivo);
    }

    const origem = lote.pastoAtualId ?? null;
    const destino = pedido.input.pastoId;
    const espelho: EspelhoMovimentacaoLote = {
      loteId: lote.id,
      pastoId: destino,
      dataEntrada: data,
      ...(pedido.input.observacoes !== undefined ? { observacoes: pedido.input.observacoes } : {}),
    };
    if (destino === origem) {
      return {
        ok: true as const,
        movimentou: false,
        id: lote.id,
        userId: deciso.contexto.titularUserId,
        executorUserId: deciso.contexto.executorUserId,
        fazendaId,
        pastoAtualId: origem,
        espelho,
      };
    }

    const pastosIds = [...new Set([origem, destino].filter((id): id is number => id != null))].sort((a, b) => a - b);
    const pastos = new Map<number, PastoParaMover | null>();
    for (const id of pastosIds) pastos.set(id, await tx.pasto(id));

    let pastoDestino: PastoParaMover | null = null;
    if (destino != null) {
      pastoDestino = pastos.get(destino) ?? null;
      if (!pastoDestino) return recusa("pasto_inexistente", MSG_PASTO_AUSENTE);
      if (pastoDestino.userId !== deciso.contexto.titularUserId) return recusa("pasto_outro_titular", MSG_PASTO_AUSENTE);
      if (pastoDestino.fazendaId !== fazendaId) return recusa("pasto_incompativel", MSG_PASTO_OUTRA_FAZENDA);
    }

    const ativos = await tx.animaisAtivos(lote.id, deciso.contexto.titularUserId);
    const divergente = ativos.find((animal) => animal.fazendaId != null && animal.fazendaId !== fazendaId);
    if (divergente) return recusa("animal_outra_fazenda", MSG_ANIMAL_OUTRA_FAZENDA);
    if (io.aposTravarAnimais) await io.aposTravarAnimais();
    const quantidadeAgora = await tx.contarAtivos(lote.id, deciso.contexto.titularUserId);
    if (quantidadeAgora !== ativos.length) throw new LoteMudouDuranteMovimentacao();

    const titularUserId = deciso.contexto.titularUserId;
    if (origem != null) {
      await fecharOrigem(tx, lote, origem, data, ativos.length, titularUserId);
    }

    if (destino == null) {
      if (io.aposHistorico) await io.aposHistorico();
      await tx.atualizarLote(lote.id, titularUserId, {
        pastoAtualId: null,
        dataEntradaPasto: null,
      });
      if (io.aposLote) await io.aposLote();
      await tx.atualizarAnimais(ativos.map((animal) => animal.id), titularUserId, { pastoId: null });
      if (io.aposAnimais) await io.aposAnimais();
      await atualizarOcupacao(tx, io, origem, null, titularUserId);
      return {
        ok: true as const,
        movimentou: true,
        id: lote.id,
        userId: titularUserId,
        executorUserId: deciso.contexto.executorUserId,
        fazendaId,
        pastoAtualId: null,
        espelho,
      };
    }

    await tx.inserirMovimento({
      userId: titularUserId,
      loteId: lote.id,
      pastoOrigemId: origem,
      pastoDestinoId: destino,
      dataEntrada: data,
      dataSaida: null,
      diasNoPasto: null,
      qtdAnimais: ativos.length,
      observacoes: pedido.input.observacoes ?? null,
    });
    if (io.aposHistorico) await io.aposHistorico();
    await tx.atualizarLote(lote.id, titularUserId, {
      pastoAtualId: destino,
      dataEntradaPasto: data,
      localizacao: pastoDestino?.nome ?? null,
    });
    if (io.aposLote) await io.aposLote();
    await tx.atualizarAnimais(ativos.map((animal) => animal.id), titularUserId, {
      pastoId: destino,
    });
    if (io.aposAnimais) await io.aposAnimais();
    await atualizarOcupacao(tx, io, origem, destino, titularUserId);
    return {
      ok: true as const,
      movimentou: true,
      id: lote.id,
      userId: titularUserId,
      executorUserId: deciso.contexto.executorUserId,
      fazendaId,
      pastoAtualId: destino,
      espelho,
    };
  });
}

export async function concluirMovimentacaoNoEspelho(
  espelho: EspelhoMovimentacao,
  resultado: ResultadoMovimentacaoLote,
): Promise<void> {
  if (!resultado.ok || !resultado.movimentou) return;
  try {
    await espelho.mover(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[lotes.moveToPasto] Espelho local não gravado:", erro);
  }
}

export async function movimentarEEspelharLote(
  io: IoMovimentacaoLote,
  pedido: PedidoMovimentacaoLote,
  espelho: EspelhoMovimentacao,
): Promise<ResultadoMovimentacaoLote> {
  const resultado = await movimentarLotePastoAutorizado(io, pedido);
  await concluirMovimentacaoNoEspelho(espelho, resultado);
  return resultado;
}
