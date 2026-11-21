import { TRPCError } from "@trpc/server";
import { hojeISODate, MSG_SAIDA_TRANSFERENCIA_DUPLICADA } from "../shared/animalBaixa";
import {
  MSG_BAIXA_ANIMAL_INATIVO,
  MSG_BAIXA_FAZENDA_DIVERGENTE,
  MSG_TRANSFERENCIA_GENERICO,
  MSG_TRANSFERENCIA_LOTE_FAZENDA,
  MSG_TRANSFERENCIA_LOTE_INATIVO,
  MSG_TRANSFERENCIA_MESMA_FAZENDA,
  MSG_TRANSFERENCIA_PASTO_FAZENDA,
  validarTransferenciaInternaInput,
} from "../shared/transferenciaInternaAnimal";
import { buildBrincoAtivoConflitoMessage, normalizeBrincoKey } from "../shared/brincoAtivo";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { ehBrincoDuplicadoNoMysql } from "./importacaoAnimalAutorizada";
import type { MotivoOperacional } from "./contextoOperacional";
import {
  AnimaisMudaramDuranteMovimentacao,
  DeadlockMovimentacaoAnimais,
  MSG_DEADLOCK_ANIMAIS,
  type ConsultaAnimaisLote,
  type IoAnimaisLote,
  type LoteAnimais,
} from "./movimentarAnimaisLoteAutorizado";

/**
 * O catálogo já tem esta permissão: "Transferir animal entre fazendas".
 * lotes.editar não autoriza esta rota.
 */
export const PERMISSAO_TRANSFERIR_ANIMAL = "animais.transferir";

export const MSG_ANIMAL_TRANSFERENCIA_AUSENTE = "Animal não encontrado.";
export const MSG_LOTE_TRANSFERENCIA_AUSENTE = "Lote de destino não encontrado.";
export const MSG_SEM_PERMISSAO_TRANSFERENCIA = "Sem permissão para transferir o animal entre fazendas.";
export const MSG_SEM_FAZENDA_TRANSFERENCIA = "Sem acesso a uma das fazendas desta transferência.";

/**
 * Lotes primeiro, como nas movimentações já homologadas.
 * As duas fazendas entram pelo id, da menor para a maior, para não cruzar origem e destino.
 * A edição cadastral ainda trava o animal antes da identidade. A transação inteira se repete.
 */
export const ORDEM_BLOQUEIO_TRANSFERENCIA_FAZENDA = [
  "lotes envolvidos, pelo id crescente",
  "usuário, permissões e vínculos",
  "fazendas de origem e de destino, pelo id crescente",
  "pastos envolvidos, pelo id crescente",
  "animal envolvido",
  "histórico novo, só inserção",
] as const;

const TENTATIVAS = 3;

export type MotivoTransferenciaFazenda =
  | MotivoOperacional
  | "nao_encontrado"
  | "lote_inativo"
  | "animal_invalido"
  | "fazendas_diferentes"
  | "data_futura"
  | "pasto_incompativel"
  | "brinco_duplicado"
  | "conflito";

export type RecusaTransferenciaFazenda = {
  ok: false;
  motivo: MotivoTransferenciaFazenda;
  mensagem?: string;
};

export type PedidoTransferenciaFazenda = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  executorNome: string;
  input: {
    fazendaOrigemId: number;
    fazendaDestinoId: number;
    animalId: number;
    loteDestinoId: number | null;
    pastoDestinoId?: number | null;
    dataTransferencia: string;
    observacoes?: string | null;
  };
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type EspelhoTransferenciaFazenda = {
  fazendaOrigemId: number;
  fazendaDestinoId: number;
  animalId: number;
  loteDestinoId: number;
  pastoDestinoId: number | null;
  dataTransferencia: string;
  observacoes: string | null;
  usuarioNome: string | null;
};

export type SucessoTransferenciaFazenda = {
  ok: true;
  status: "ativo";
  fazendaId: number;
  loteId: number;
  loteDestinoNome: string;
  userId: number;
  executorUserId: number;
  espelho: EspelhoTransferenciaFazenda;
};

export type ResultadoTransferenciaFazenda = SucessoTransferenciaFazenda | RecusaTransferenciaFazenda;

function recusa(motivo: MotivoTransferenciaFazenda, mensagem?: string): RecusaTransferenciaFazenda {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function ehDeadlock(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const candidato = atual as { errno?: number; code?: string; cause?: unknown };
    if (candidato.errno === 1213 || candidato.code === "ER_LOCK_DEADLOCK") return true;
    atual = candidato.cause;
  }
  return false;
}

async function repetir<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    try {
      return await fn();
    } catch (erro) {
      ultimo = erro;
      if (erro instanceof AnimaisMudaramDuranteMovimentacao || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  if (ultimo instanceof AnimaisMudaramDuranteMovimentacao || ehDeadlock(ultimo)) {
    throw new DeadlockMovimentacaoAnimais();
  }
  throw ultimo;
}

function idsUnicos(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((id): id is number => id != null && Number.isFinite(id)))].sort((a, b) => a - b);
}

function loteEstaAtivo(lote: LoteAnimais): boolean {
  return lote.ativo !== false && lote.ativo !== 0;
}

function pastoInformado(valor: number | null | undefined): number | null {
  return valor != null && valor > 0 ? valor : null;
}

async function travarLotes(tx: ConsultaAnimaisLote, ids: Array<number | null | undefined>) {
  const mapa = new Map<number, LoteAnimais | null>();
  for (const id of idsUnicos(ids)) mapa.set(id, await tx.lote(id));
  return mapa;
}

async function sessaoInvalida(tx: ConsultaAnimaisLote, executorId: number): Promise<boolean> {
  const usuario = await tx.usuario(executorId);
  return !usuario || usuario.titularUserId == null || usuario.situacao !== "ativo";
}

export function erroTransferenciaFazenda(resultado: RecusaTransferenciaFazenda): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_TRANSFERENCIA });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_TRANSFERENCIA });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({
        code: "NOT_FOUND",
        message: resultado.mensagem ?? MSG_LOTE_TRANSFERENCIA_AUSENTE,
      });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_DEADLOCK_ANIMAIS });
    default:
      return new TRPCError({
        code: "BAD_REQUEST",
        message: resultado.mensagem ?? MSG_TRANSFERENCIA_GENERICO,
      });
  }
}

export async function transferirAnimalFazendaAutorizado(
  io: IoAnimaisLote,
  pedido: PedidoTransferenciaFazenda,
): Promise<ResultadoTransferenciaFazenda> {
  const previa = validarTransferenciaInternaInput({
    fazendaOrigemId: pedido.input.fazendaOrigemId,
    fazendaDestinoId: pedido.input.fazendaDestinoId,
    animalId: pedido.input.animalId,
    loteDestinoId: pedido.input.loteDestinoId,
    loteDestinoFazendaId: pedido.input.fazendaDestinoId,
    loteDestinoAtivo: true,
    dataTransferencia: pedido.input.dataTransferencia,
    hojeISO: hojeISODate(),
  });
  if (!previa.ok) {
    const motivo = previa.message.includes("futura") ? "data_futura" : "animal_invalido";
    return recusa(motivo, previa.message);
  }
  return repetir(() => io.emTransacao((tx) => transferirNaTransacao(tx, io, pedido, previa.dataISO)));
}

async function transferirNaTransacao(
  tx: ConsultaAnimaisLote,
  io: IoAnimaisLote,
  pedido: PedidoTransferenciaFazenda,
  dataISO: string,
): Promise<ResultadoTransferenciaFazenda> {
  const espiados = await tx.espiar([pedido.input.animalId]);
  const foto = espiados[0] ?? null;
  const lotes = await travarLotes(tx, [pedido.input.loteDestinoId, foto?.loteId]);
  const destino = pedido.input.loteDestinoId == null ? null : lotes.get(pedido.input.loteDestinoId) ?? null;
  if (!destino) {
    if (await sessaoInvalida(tx, pedido.executorId)) return recusa("sem_identidade");
    return recusa("nao_encontrado", MSG_LOTE_TRANSFERENCIA_AUSENTE);
  }
  if (destino.fazendaId == null) return recusa("fazendas_diferentes", MSG_TRANSFERENCIA_LOTE_FAZENDA);
  if (!foto) {
    if (await sessaoInvalida(tx, pedido.executorId)) return recusa("sem_identidade");
    return recusa("nao_encontrado", MSG_ANIMAL_TRANSFERENCIA_AUSENTE);
  }
  if (foto.fazendaId == null) {
    const sessao = await autorizarPar(tx, pedido, [destino.fazendaId]);
    if (!sessao.ok) return sessao;
    return recusa("animal_invalido", MSG_BAIXA_FAZENDA_DIVERGENTE);
  }

  const fazendas = [
    { id: foto.fazendaId, papel: "origem" as const },
    { id: destino.fazendaId, papel: "destino" as const },
  ].sort((a, b) => a.id - b.id);
  let titularUserId = 0;
  let executorUserId = pedido.executorId;
  for (const fazenda of fazendas) {
    const deciso = await autorizarOperacaoPersistida(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_TRANSFERIR_ANIMAL,
      fazendaId: fazenda.id,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (!deciso.ok) {
      if (fazenda.papel === "origem" && (deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente")) {
        return recusa(deciso.motivo, MSG_ANIMAL_TRANSFERENCIA_AUSENTE);
      }
      if (fazenda.papel === "destino" && (deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente")) {
        return recusa(deciso.motivo, MSG_LOTE_TRANSFERENCIA_AUSENTE);
      }
      return recusa(deciso.motivo);
    }
    titularUserId = deciso.contexto.titularUserId;
    executorUserId = deciso.contexto.executorUserId;
  }
  if (destino.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_TRANSFERENCIA_AUSENTE);
  if (!loteEstaAtivo(destino)) return recusa("lote_inativo", MSG_TRANSFERENCIA_LOTE_INATIVO);
  if (pedido.input.fazendaDestinoId !== destino.fazendaId) {
    return recusa("fazendas_diferentes", MSG_TRANSFERENCIA_LOTE_FAZENDA);
  }
  if (io.aposIdentidade) await io.aposIdentidade();

  const pastoDestinoId = destino.pastoAtualId;
  const pastoCliente = pastoInformado(pedido.input.pastoDestinoId);
  if (pastoDestinoId != null && pastoCliente != null && pastoCliente !== pastoDestinoId) {
    return recusa("pasto_incompativel", MSG_TRANSFERENCIA_PASTO_FAZENDA);
  }
  const pastos = new Map<number, { id: number; userId: number; fazendaId: number | null } | null>();
  for (const id of idsUnicos([pastoDestinoId, foto.pastoId])) {
    pastos.set(id, await tx.pasto(id));
  }
  if (pastoDestinoId != null) {
    const pasto = pastos.get(pastoDestinoId) ?? null;
    if (!pasto || pasto.userId !== titularUserId || pasto.fazendaId !== destino.fazendaId) {
      return recusa("pasto_incompativel", MSG_TRANSFERENCIA_PASTO_FAZENDA);
    }
  }

  const animais = await tx.animais([pedido.input.animalId], titularUserId);
  const animal = animais[0] ?? null;
  if (!animal) return recusa("nao_encontrado", MSG_ANIMAL_TRANSFERENCIA_AUSENTE);
  if (
    animal.loteId !== foto.loteId
    || animal.pastoId !== foto.pastoId
    || animal.fazendaId !== foto.fazendaId
  ) {
    throw new AnimaisMudaramDuranteMovimentacao();
  }
  if (animal.fazendaId == null || animal.fazendaId !== pedido.input.fazendaOrigemId) {
    return recusa("animal_invalido", MSG_BAIXA_FAZENDA_DIVERGENTE);
  }
  if (animal.fazendaId === destino.fazendaId) {
    return recusa("fazendas_diferentes", MSG_TRANSFERENCIA_MESMA_FAZENDA);
  }
  if (animal.status !== "ativo") return recusa("animal_invalido", MSG_BAIXA_ANIMAL_INATIVO);
  const baixa = await tx.baixaAtiva(animal.id, titularUserId);
  if (baixa) return recusa("animal_invalido", MSG_SAIDA_TRANSFERENCIA_DUPLICADA);
  const brinco = animal.brinco?.trim() || "";
  if (normalizeBrincoKey(brinco) && tx.brincoAtivoNaFazenda) {
    const ocupado = await tx.brincoAtivoNaFazenda(titularUserId, destino.fazendaId, brinco, animal.id);
    if (ocupado) return recusa("brinco_duplicado", buildBrincoAtivoConflitoMessage(brinco));
  }

  const usuarioNome = pedido.executorNome.trim() || "Usuário";
  const observacoes = pedido.input.observacoes?.trim() || null;
  try {
    await tx.atualizarAnimais([animal.id], titularUserId, {
      fazendaId: destino.fazendaId,
      loteId: destino.id,
      pastoId: pastoDestinoId,
    });
  } catch (erro) {
    if (ehBrincoDuplicadoNoMysql(erro)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: buildBrincoAtivoConflitoMessage(brinco || "informado"),
      });
    }
    throw erro;
  }
  if (io.aposAnimais) await io.aposAnimais();
  await tx.inserirHistorico([{
    userId: titularUserId,
    animalId: animal.id,
    loteOrigemId: animal.loteId,
    loteDestinoId: destino.id,
    pastoOrigemId: animal.pastoId,
    pastoDestinoId,
    fazendaId: destino.fazendaId,
    fazendaOrigemId: animal.fazendaId,
    dataMovimentacao: dataISO,
    usuarioNome,
    observacoes,
  }]);
  if (io.aposHistorico) await io.aposHistorico();
  for (const id of idsUnicos([animal.pastoId, pastoDestinoId])) {
    await tx.sincronizarStatusPasto(id, titularUserId);
  }
  if (io.aposOcupacao) await io.aposOcupacao();

  return {
    ok: true,
    status: "ativo",
    fazendaId: destino.fazendaId,
    loteId: destino.id,
    loteDestinoNome: destino.nome,
    userId: titularUserId,
    executorUserId,
    espelho: {
      fazendaOrigemId: animal.fazendaId,
      fazendaDestinoId: destino.fazendaId,
      animalId: animal.id,
      loteDestinoId: destino.id,
      pastoDestinoId,
      dataTransferencia: dataISO,
      observacoes,
      usuarioNome,
    },
  };
}

async function autorizarPar(
  tx: ConsultaAnimaisLote,
  pedido: PedidoTransferenciaFazenda,
  fazendaIds: number[],
): Promise<ResultadoTransferenciaFazenda | { ok: true }> {
  for (const fazendaId of idsUnicos(fazendaIds)) {
    const deciso = await autorizarOperacaoPersistida(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_TRANSFERIR_ANIMAL,
      fazendaId,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (!deciso.ok) return recusa(deciso.motivo);
  }
  return { ok: true };
}

export async function transferirEEspelharAnimalFazenda(
  io: IoAnimaisLote,
  pedido: PedidoTransferenciaFazenda,
  espelho: { transferir(userId: number, dados: EspelhoTransferenciaFazenda): Promise<void> },
): Promise<ResultadoTransferenciaFazenda> {
  const resultado = await transferirAnimalFazendaAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.transferir(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[animais.transferirEntreFazendas] Espelho local não gravado:", erro);
  }
  return resultado;
}
