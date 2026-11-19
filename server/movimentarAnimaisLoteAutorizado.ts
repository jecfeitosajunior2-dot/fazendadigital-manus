import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa, isStatusAnimalBaixado } from "../shared/animalBaixa";
import { buildEntradaInicialLoteMovimentacao } from "../shared/animalLoteMovimentacaoEntrada";
import {
  assertDataMovimentacaoNaoFutura,
  hojeISODateLocal,
  isLoteDestinoMesmaFazenda,
  isMesmoLoteDestino,
  MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM,
  MSG_TROCA_LOTE_DESTINO_INATIVO,
  MSG_TROCA_LOTE_FAZENDA,
  MSG_TROCA_LOTE_MESMO_LOTE,
  MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM,
} from "../shared/transferirAnimaisEntreLotes";
import type { ConsultaAutorizacaoPersistida, LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * O catálogo ainda não separa edição cadastral de movimentação de animais.
 * Não existe lotes.movimentar. Enquanto isso, entrada e troca usam lotes.editar.
 * A permissão não foi ampliada.
 */
export const PERMISSAO_ANIMAIS_LOTE = "lotes.editar";

export const MSG_LOTE_INCLUSAO_AUSENTE = "Lote não encontrado.";
export const MSG_LOTE_DESTINO_AUSENTE = "Lote de destino não encontrado.";
export const MSG_LOTE_ORIGEM_AUSENTE = "Lote de origem não encontrado.";
export const MSG_LOTE_INATIVO_INCLUSAO = "Este Lote está inativo e não aceita novos animais.";
export const MSG_LOTE_SEM_FAZENDA = "Este lote não possui fazenda vinculada. Defina a fazenda do lote antes de adicionar animais.";
export const MSG_NENHUM_ANIMAL_INCLUSAO = "Nenhum animal válido foi encontrado para inclusão.";
export const MSG_SO_ATIVO = "Só é possível adicionar animais ativos ao lote.";
export const MSG_ANIMAL_OUTRA_FAZENDA_INCLUSAO = "Este animal pertence a outra fazenda e não pode ser incluído neste lote.";
export const MSG_ANIMAL_JA_TEM_LOTE = "Este animal já pertence a outro lote. Use a transferência entre lotes para movimentá-lo.";
export const MSG_NENHUM_VALIDO_INCLUSAO = "Nenhum animal válido para inclusão neste lote.";
export const MSG_NENHUM_ANIMAL_TROCA = "Nenhum animal válido foi encontrado para a troca de lote.";
export const MSG_FAZENDAS_DIFERENTES = "A transferência entre lotes só é permitida dentro da mesma fazenda.";
export const MSG_PASTO_LOTE = "O pasto do lote precisa pertencer à mesma fazenda.";
export const MSG_CONFLITO_ANIMAIS = "Os animais mudaram durante a movimentação. Tente novamente.";
export const MSG_DEADLOCK_ANIMAIS = "A movimentação encontrou outra gravação ao mesmo tempo. Tente novamente.";
export const MSG_SAIDA_NAO_SUPORTADA = "Estas rotas não retiram o animal sem um lote de destino.";
export const MSG_NENHUM_NO_LOTE = "Nenhum animal selecionado pertence a este lote.";
export const MSG_LOTE_DESTINO_ALOCACAO = "Lote de destino não encontrado.";
export const MSG_LOTE_INATIVO_ALOCACAO = "O lote de destino não está ativo.";
export const MSG_LOTE_FORA_SUBDIVISAO = "O lote de destino não pertence à subdivisão selecionada.";
export const MSG_NENHUM_ALOCACAO = "Nenhum animal válido para transferência.";
export const MSG_FAZENDA_ALOCACAO = "A transferência entre fazendas não é feita nesta alocação.";
/**
 * A tabela de histórico exige lote de destino.
 * A retirada só tira o vínculo do lote e não inventa uma linha sem destino.
 */

/**
 * Ordem desta entrada e desta troca.
 * Dois lotes e vários animais entram pelo id, do menor para o maior.
 * Combina com a movimentação de pasto do lote: lote, identidade, pasto, animal.
 * A edição cadastral do animal continua travando o animal antes da identidade.
 * Esse encontro pode gerar deadlock. A operação repete a transação inteira.
 * A retirada e a alocação seguem a mesma ordem.
 * A transferência entre fazendas trava os lotes primeiro e as duas fazendas pelo id crescente.
 */
export const ORDEM_BLOQUEIO_ANIMAIS_LOTE = [
  "lotes envolvidos, pelo id crescente",
  "usuário, permissões, vínculos e fazenda",
  "pastos envolvidos, pelo id crescente",
  "animais envolvidos, pelo id crescente",
  "histórico novo, só inserção",
] as const;

const TENTATIVAS = 3;

export class AnimaisMudaramDuranteMovimentacao extends Error {
  constructor() {
    super(MSG_CONFLITO_ANIMAIS);
    this.name = "AnimaisMudaramDuranteMovimentacao";
  }
}

export class DeadlockMovimentacaoAnimais extends Error {
  constructor() {
    super(MSG_DEADLOCK_ANIMAIS);
    this.name = "DeadlockMovimentacaoAnimais";
  }
}

export type MotivoAnimaisLote =
  | MotivoOperacional
  | "nao_encontrado"
  | "lote_inativo"
  | "animal_invalido"
  | "fazendas_diferentes"
  | "mesmo_lote"
  | "data_futura"
  | "pasto_incompativel"
  | "conflito"
  | "saida_nao_suportada";

export type RecusaAnimaisLote = {
  ok: false;
  motivo: MotivoAnimaisLote;
  mensagem?: string;
};

export type LoteAnimais = {
  id: number;
  userId: number;
  nome: string;
  fazendaId: number | null;
  pastoAtualId: number | null;
  ativo: boolean | number | null;
};

export type PastoAnimais = {
  id: number;
  userId: number;
  fazendaId: number | null;
};

export type AnimalLoteLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
};

export type HistoricoAnimalLote = {
  userId: number;
  animalId: number;
  loteOrigemId: number | null;
  loteDestinoId: number;
  pastoOrigemId: number | null;
  pastoDestinoId: number | null;
  fazendaId: number | null;
  /** Preenchida só na transferência entre fazendas. As outras rotas deixam em branco. */
  fazendaOrigemId?: number | null;
  dataMovimentacao: string;
  usuarioNome: string;
  observacoes: string | null;
};

export type ConsultaAnimaisLote = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<LoteAnimais | null>;
  pasto(id: number): Promise<PastoAnimais | null>;
  /** Leitura sem trava, só para saber lote e pasto antes de bloquear. */
  espiar(ids: number[]): Promise<AnimalLoteLinha[]>;
  animais(ids: number[], titularUserId: number): Promise<AnimalLoteLinha[]>;
  baixaAtiva(animalId: number, titularUserId: number): Promise<string | null>;
  atualizarAnimais(ids: number[], titularUserId: number, patch: Record<string, unknown>): Promise<void>;
  inserirHistorico(rows: HistoricoAnimalLote[]): Promise<void>;
  sincronizarStatusPasto(pastoId: number, titularUserId: number): Promise<void>;
};

export type IoAnimaisLote = {
  emTransacao<T>(fn: (tx: ConsultaAnimaisLote) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposAnimais?: () => Promise<void>;
  aposHistorico?: () => Promise<void>;
  aposOcupacao?: () => Promise<void>;
};

export type PedidoInclusaoAnimais = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  executorNome: string;
  input: { loteId: number; animalIds: number[] };
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type PedidoTrocaAnimais = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  executorNome: string;
  input: {
    loteOrigemId?: number;
    loteDestinoId: number;
    animalIds: number[];
    dataMovimentacao: string;
    responsavel?: string;
    observacoes?: string;
  };
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type SucessoInclusao = {
  ok: true;
  count: number;
  userId: number;
  executorUserId: number;
  espelho: { loteId: number; animalIds: number[]; usuarioNome: string; dataMovimentacao: string };
};

export type SucessoTroca = {
  ok: true;
  count: number;
  loteDestinoNome: string;
  userId: number;
  executorUserId: number;
  espelho: PedidoTrocaAnimais["input"] & { usuarioNome: string };
};

export type ResultadoInclusao = SucessoInclusao | RecusaAnimaisLote;
export type ResultadoTroca = SucessoTroca | RecusaAnimaisLote;

function recusa(motivo: MotivoAnimaisLote, mensagem?: string): RecusaAnimaisLote {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function nomeDe(usuario: LinhaUsuarioCadastro, informado: string): string {
  const pedido = informado.trim();
  if (pedido) return pedido;
  const nome = (usuario.name ?? "").trim();
  if (nome) return nome;
  return (usuario.email ?? "").trim() || "Usuário";
}

function idsUnicos(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isFinite(id)))].sort((a, b) => a - b);
}

function loteEstaAtivo(lote: LoteAnimais): boolean {
  return lote.ativo !== false && lote.ativo !== 0;
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
  if (ultimo instanceof AnimaisMudaramDuranteMovimentacao) {
    throw new DeadlockMovimentacaoAnimais();
  }
  if (ehDeadlock(ultimo)) throw new DeadlockMovimentacaoAnimais();
  throw ultimo;
}

async function travarLotes(tx: ConsultaAnimaisLote, ids: number[]) {
  const mapa = new Map<number, LoteAnimais | null>();
  for (const id of idsUnicos(ids)) mapa.set(id, await tx.lote(id));
  return mapa;
}

async function travarPastos(tx: ConsultaAnimaisLote, ids: Array<number | null | undefined>) {
  const mapa = new Map<number, PastoAnimais | null>();
  for (const id of idsUnicos(ids.filter((item): item is number => item != null))) {
    mapa.set(id, await tx.pasto(id));
  }
  return mapa;
}

function pastoCompativel(
  pasto: PastoAnimais | null,
  titularUserId: number,
  fazendaId: number | null,
): RecusaAnimaisLote | null {
  if (!pasto) return recusa("pasto_incompativel", MSG_PASTO_LOTE);
  if (pasto.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_INCLUSAO_AUSENTE);
  if (fazendaId != null && pasto.fazendaId != null && pasto.fazendaId !== fazendaId) {
    return recusa("pasto_incompativel", MSG_PASTO_LOTE);
  }
  return null;
}

async function ocupar(
  tx: ConsultaAnimaisLote,
  io: IoAnimaisLote,
  pastoIds: Array<number | null | undefined>,
  titularUserId: number,
) {
  for (const id of idsUnicos(pastoIds.filter((item): item is number => item != null))) {
    await tx.sincronizarStatusPasto(id, titularUserId);
  }
  if (io.aposOcupacao) await io.aposOcupacao();
}

async function sessaoSeLoteAusente(
  tx: ConsultaAnimaisLote,
  executorId: number,
  mensagem = MSG_LOTE_INCLUSAO_AUSENTE,
): Promise<RecusaAnimaisLote> {
  const usuario = await tx.usuario(executorId);
  if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo") return recusa("sem_identidade");
  return recusa("nao_encontrado", mensagem);
}

export function erroAnimaisLote(resultado: RecusaAnimaisLote): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para alterar o lote." });
    case "nao_encontrado":
    case "sem_fazenda":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_LOTE_INCLUSAO_AUSENTE });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_ANIMAIS });
    default:
      return new TRPCError({
        code: "BAD_REQUEST",
        message: resultado.mensagem ?? "Não foi possível movimentar os animais.",
      });
  }
}

export async function incluirAnimaisLoteAutorizado(
  io: IoAnimaisLote,
  pedido: PedidoInclusaoAnimais,
): Promise<ResultadoInclusao> {
  try {
    return await repetir(() => io.emTransacao((tx) => incluirNaTransacao(tx, io, pedido)));
  } catch (erro) {
    if (erro instanceof DeadlockMovimentacaoAnimais) throw erro;
    throw erro;
  }
}

async function incluirNaTransacao(
  tx: ConsultaAnimaisLote,
  io: IoAnimaisLote,
  pedido: PedidoInclusaoAnimais,
): Promise<ResultadoInclusao> {
  const lotes = await travarLotes(tx, [pedido.input.loteId]);
  const lote = lotes.get(pedido.input.loteId) ?? null;
  if (!lote) return sessaoSeLoteAusente(tx, pedido.executorId);

  const fazendaId = lote.fazendaId;
  if (fazendaId == null) return recusa("fazenda_ausente", MSG_LOTE_SEM_FAZENDA);

  const deciso = await autorizarOperacaoPersistida(tx, {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_ANIMAIS_LOTE,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) return recusa(deciso.motivo);
  const titularUserId = deciso.contexto.titularUserId;
  if (lote.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_INCLUSAO_AUSENTE);
  if (!loteEstaAtivo(lote)) return recusa("lote_inativo", MSG_LOTE_INATIVO_INCLUSAO);
  if (io.aposIdentidade) await io.aposIdentidade();

  const pastos = await travarPastos(tx, [lote.pastoAtualId]);
  if (lote.pastoAtualId != null) {
    const erroPasto = pastoCompativel(pastos.get(lote.pastoAtualId) ?? null, titularUserId, fazendaId);
    if (erroPasto) return erroPasto;
  }

  const animais = await tx.animais(idsUnicos(pedido.input.animalIds), titularUserId);
  if (animais.length === 0) return recusa("animal_invalido", MSG_NENHUM_ANIMAL_INCLUSAO);

  const validos: AnimalLoteLinha[] = [];
  let erroAmigavel: string | null = null;
  for (const animal of animais) {
    if (animal.status !== "ativo") {
      if (!erroAmigavel) erroAmigavel = MSG_SO_ATIVO;
      continue;
    }
    if (animal.fazendaId != null && animal.fazendaId !== fazendaId) {
      if (!erroAmigavel) erroAmigavel = MSG_ANIMAL_OUTRA_FAZENDA_INCLUSAO;
      continue;
    }
    if (animal.loteId != null) {
      if (!erroAmigavel) erroAmigavel = MSG_ANIMAL_JA_TEM_LOTE;
      continue;
    }
    validos.push(animal);
  }
  if (validos.length === 0) return recusa("animal_invalido", erroAmigavel ?? MSG_NENHUM_VALIDO_INCLUSAO);

  const pastoDestinoId = lote.pastoAtualId;
  const dataMovimentacao = hojeISODateLocal();
  const usuarioNome = nomeDe(
    { name: pedido.executorNome, email: null } as LinhaUsuarioCadastro,
    pedido.executorNome,
  );
  const ids = validos.map((animal) => animal.id);
  await tx.atualizarAnimais(ids, titularUserId, { loteId: lote.id, pastoId: pastoDestinoId });
  const semFazenda = validos.filter((animal) => animal.fazendaId == null).map((animal) => animal.id);
  if (semFazenda.length > 0) await tx.atualizarAnimais(semFazenda, titularUserId, { fazendaId });
  if (io.aposAnimais) await io.aposAnimais();

  await tx.inserirHistorico(validos.map((animal) => buildEntradaInicialLoteMovimentacao({
    userId: titularUserId,
    animalId: animal.id,
    loteDestinoId: lote.id,
    pastoOrigemId: animal.pastoId,
    pastoDestinoId,
    fazendaId,
    dataMovimentacao,
    usuarioNome,
  })));
  if (io.aposHistorico) await io.aposHistorico();
  await ocupar(tx, io, [pastoDestinoId, ...validos.map((animal) => animal.pastoId)], titularUserId);

  return {
    ok: true,
    count: validos.length,
    userId: titularUserId,
    executorUserId: deciso.contexto.executorUserId,
    espelho: { loteId: lote.id, animalIds: ids, usuarioNome, dataMovimentacao },
  };
}

export async function movimentarAnimaisLoteAutorizado(
  io: IoAnimaisLote,
  pedido: PedidoTrocaAnimais,
): Promise<ResultadoTroca> {
  const data = assertDataMovimentacaoNaoFutura(pedido.input.dataMovimentacao);
  if (!data.ok) return recusa("data_futura", data.message);
  if (pedido.input.loteOrigemId != null && pedido.input.loteOrigemId === pedido.input.loteDestinoId) {
    return recusa("mesmo_lote", MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM);
  }
  return repetir(() => io.emTransacao((tx) => trocarNaTransacao(tx, io, pedido)));
}

async function trocarNaTransacao(
  tx: ConsultaAnimaisLote,
  io: IoAnimaisLote,
  pedido: PedidoTrocaAnimais,
): Promise<ResultadoTroca> {
  const idsPedido = idsUnicos(pedido.input.animalIds);
  const espiados = await tx.espiar(idsPedido);
  const lotes = await travarLotes(tx, [
    pedido.input.loteDestinoId,
    ...(pedido.input.loteOrigemId != null ? [pedido.input.loteOrigemId] : []),
    ...espiados.map((animal) => animal.loteId),
  ].filter((id): id is number => id != null));
  const destino = lotes.get(pedido.input.loteDestinoId) ?? null;
  if (!destino) return sessaoSeLoteAusente(tx, pedido.executorId, MSG_LOTE_DESTINO_AUSENTE);
  const origem = pedido.input.loteOrigemId != null ? (lotes.get(pedido.input.loteOrigemId) ?? null) : null;
  if (pedido.input.loteOrigemId != null && !origem) {
    return sessaoSeLoteAusente(tx, pedido.executorId, MSG_LOTE_ORIGEM_AUSENTE);
  }

  const fazendaId = destino.fazendaId ?? origem?.fazendaId ?? null;
  if (fazendaId == null) return recusa("fazenda_ausente", MSG_LOTE_SEM_FAZENDA);
  const deciso = await autorizarOperacaoPersistida(tx, {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_ANIMAIS_LOTE,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) return recusa(deciso.motivo);
  const titularUserId = deciso.contexto.titularUserId;
  if (destino.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_DESTINO_AUSENTE);
  if (origem && origem.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_ORIGEM_AUSENTE);
  if (
    origem?.fazendaId != null
    && destino.fazendaId != null
    && origem.fazendaId !== destino.fazendaId
  ) {
    return recusa("fazendas_diferentes", MSG_FAZENDAS_DIFERENTES);
  }
  if (!loteEstaAtivo(destino)) return recusa("lote_inativo", MSG_TROCA_LOTE_DESTINO_INATIVO);
  if (io.aposIdentidade) await io.aposIdentidade();

  const pastos = await travarPastos(tx, [
    destino.pastoAtualId,
    origem?.pastoAtualId,
    ...espiados.map((animal) => animal.pastoId),
  ]);
  if (destino.pastoAtualId != null) {
    const erroPasto = pastoCompativel(pastos.get(destino.pastoAtualId) ?? null, titularUserId, fazendaId);
    if (erroPasto) return erroPasto;
  }

  const animais = await tx.animais(idsPedido, titularUserId);
  const foto = new Map(espiados.filter((animal) => animal.userId === titularUserId).map((animal) => [animal.id, animal]));
  for (const animal of animais) {
    const antes = foto.get(animal.id);
    if (!antes || antes.loteId !== animal.loteId || antes.pastoId !== animal.pastoId) {
      throw new AnimaisMudaramDuranteMovimentacao();
    }
    if (animal.loteId != null && !lotes.has(animal.loteId)) throw new AnimaisMudaramDuranteMovimentacao();
    if (animal.pastoId != null && !pastos.has(animal.pastoId)) throw new AnimaisMudaramDuranteMovimentacao();
  }
  const selecionados = pedido.input.loteOrigemId != null
    ? animais.filter((animal) => animal.loteId === pedido.input.loteOrigemId)
    : animais;
  if (selecionados.length === 0) {
    return recusa(
      "animal_invalido",
      pedido.input.loteOrigemId != null ? MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM : MSG_NENHUM_ANIMAL_TROCA,
    );
  }

  for (const animal of selecionados) {
    if (isStatusAnimalBaixado(animal.status)) {
      const dataBaixa = await tx.baixaAtiva(animal.id, titularUserId);
      const avaliacao = avaliarManejoVsBaixa({
        status: animal.status,
        dataBaixa,
        dataEvento: pedido.input.dataMovimentacao,
      });
      if (!avaliacao.permitido) return recusa("animal_invalido", avaliacao.mensagem);
    }
    if (isMesmoLoteDestino(animal.loteId, pedido.input.loteDestinoId)) {
      return recusa("mesmo_lote", MSG_TROCA_LOTE_MESMO_LOTE);
    }
    const loteDoAnimal = animal.loteId != null ? lotes.get(animal.loteId) : null;
    const fazendaAnimal = animal.fazendaId ?? loteDoAnimal?.fazendaId ?? null;
    if (!isLoteDestinoMesmaFazenda(fazendaAnimal, fazendaId)) {
      return recusa("fazendas_diferentes", MSG_TROCA_LOTE_FAZENDA);
    }
    if (animal.fazendaId != null && animal.fazendaId !== fazendaId) {
      return recusa("fazendas_diferentes", MSG_TROCA_LOTE_FAZENDA);
    }
  }

  const pastoDestinoId = destino.pastoAtualId;
  const usuarioNome = (pedido.input.responsavel?.trim() || nomeDe(
    { name: pedido.executorNome, email: null } as LinhaUsuarioCadastro,
    pedido.executorNome,
  ));
  const observacoes = pedido.input.observacoes?.trim() || null;
  const ids = selecionados.map((animal) => animal.id);
  await tx.atualizarAnimais(ids, titularUserId, { loteId: destino.id, pastoId: pastoDestinoId });
  const semFazenda = selecionados.filter((animal) => animal.fazendaId == null).map((animal) => animal.id);
  if (semFazenda.length > 0) await tx.atualizarAnimais(semFazenda, titularUserId, { fazendaId });
  if (io.aposAnimais) await io.aposAnimais();

  await tx.inserirHistorico(selecionados.map((animal) => ({
    userId: titularUserId,
    animalId: animal.id,
    loteOrigemId: animal.loteId != null && animal.loteId > 0 ? animal.loteId : null,
    loteDestinoId: destino.id,
    pastoOrigemId: (animal.loteId != null ? lotes.get(animal.loteId)?.pastoAtualId : null) ?? animal.pastoId ?? null,
    pastoDestinoId,
    fazendaId,
    dataMovimentacao: pedido.input.dataMovimentacao,
    usuarioNome,
    observacoes,
  })));
  if (io.aposHistorico) await io.aposHistorico();
  await ocupar(
    tx,
    io,
    [pastoDestinoId, origem?.pastoAtualId, ...selecionados.map((animal) => animal.pastoId)],
    titularUserId,
  );

  return {
    ok: true,
    count: ids.length,
    loteDestinoNome: destino.nome,
    userId: titularUserId,
    executorUserId: deciso.contexto.executorUserId,
    espelho: { ...pedido.input, animalIds: ids, usuarioNome },
  };
}

export async function incluirEEspelharAnimais(
  io: IoAnimaisLote,
  pedido: PedidoInclusaoAnimais,
  espelho: { incluir(userId: number, dados: SucessoInclusao["espelho"]): Promise<void> },
): Promise<ResultadoInclusao> {
  const resultado = await incluirAnimaisLoteAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.incluir(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[lotes.incluirAnimais] Espelho local não gravado:", erro);
  }
  return resultado;
}

export async function movimentarEEspelharAnimais(
  io: IoAnimaisLote,
  pedido: PedidoTrocaAnimais,
  espelho: { mover(userId: number, dados: SucessoTroca["espelho"]): Promise<void> },
): Promise<ResultadoTroca> {
  const resultado = await movimentarAnimaisLoteAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.mover(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[lotes.movimentarAnimais] Espelho local não gravado:", erro);
  }
  return resultado;
}

type PedidoCliente = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  executorNome: string;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type PedidoRetiradaAnimais = PedidoCliente & {
  input: { loteId: number; animalIds: number[] };
};

export type PedidoAlocacaoAnimais = PedidoCliente & {
  input: {
    animalIds: number[];
    loteDestinoId: number;
    pastoDestinoId: number;
    fazendaDestinoId: number;
    dataMovimentacao: string;
  };
};

export type SucessoRetirada = {
  ok: true;
  count: number;
  userId: number;
  executorUserId: number;
  espelho: { animalIds: number[] };
};

export type SucessoAlocacao = {
  ok: true;
  count: number;
  loteDestinoNome: string;
  userId: number;
  executorUserId: number;
  espelho: PedidoTrocaAnimais["input"] & { usuarioNome: string };
};

export type ResultadoRetirada = SucessoRetirada | RecusaAnimaisLote;
export type ResultadoAlocacao = SucessoAlocacao | RecusaAnimaisLote;

function pedidoAutorizacao(pedido: PedidoCliente, fazendaId: number) {
  return {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_ANIMAIS_LOTE,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  };
}

export async function removerAnimaisLoteAutorizado(
  io: IoAnimaisLote,
  pedido: PedidoRetiradaAnimais,
): Promise<ResultadoRetirada> {
  return repetir(() => io.emTransacao((tx) => retirarNaTransacao(tx, io, pedido)));
}

async function retirarNaTransacao(
  tx: ConsultaAnimaisLote,
  io: IoAnimaisLote,
  pedido: PedidoRetiradaAnimais,
): Promise<ResultadoRetirada> {
  const idsPedido = idsUnicos(pedido.input.animalIds);
  const espiados = await tx.espiar(idsPedido);
  const lotes = await travarLotes(tx, [
    pedido.input.loteId,
    ...espiados.map((animal) => animal.loteId),
  ].filter((id): id is number => id != null));
  const lote = lotes.get(pedido.input.loteId) ?? null;
  if (!lote) return sessaoSeLoteAusente(tx, pedido.executorId, MSG_LOTE_INCLUSAO_AUSENTE);
  if (lote.fazendaId == null) return recusa("fazenda_ausente", MSG_LOTE_SEM_FAZENDA);
  const deciso = await autorizarOperacaoPersistida(tx, pedidoAutorizacao(pedido, lote.fazendaId));
  if (!deciso.ok) return recusa(deciso.motivo);
  const titularUserId = deciso.contexto.titularUserId;
  if (lote.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_INCLUSAO_AUSENTE);
  if (io.aposIdentidade) await io.aposIdentidade();

  const pastos = await travarPastos(tx, espiados.map((animal) => animal.pastoId));
  const animais = await tx.animais(idsPedido, titularUserId);
  const foto = new Map(espiados.filter((animal) => animal.userId === titularUserId).map((animal) => [animal.id, animal]));
  for (const animal of animais) {
    const antes = foto.get(animal.id);
    if (!antes || antes.loteId !== animal.loteId || antes.pastoId !== animal.pastoId) {
      throw new AnimaisMudaramDuranteMovimentacao();
    }
  }
  const selecionados = animais.filter((animal) => animal.loteId === lote.id);
  if (selecionados.length === 0) return recusa("animal_invalido", MSG_NENHUM_NO_LOTE);
  for (const animal of selecionados) {
    if (isStatusAnimalBaixado(animal.status)) {
      const avaliacao = avaliarManejoVsBaixa({
        status: animal.status,
        dataBaixa: await tx.baixaAtiva(animal.id, titularUserId),
        dataEvento: hojeISODateLocal(),
      });
      if (!avaliacao.permitido) return recusa("animal_invalido", avaliacao.mensagem);
    }
  }
  const ids = selecionados.map((animal) => animal.id);
  await tx.atualizarAnimais(ids, titularUserId, { loteId: null });
  if (io.aposAnimais) await io.aposAnimais();
  if (io.aposHistorico) await io.aposHistorico();
  await ocupar(tx, io, selecionados.map((animal) => animal.pastoId), titularUserId);
  return {
    ok: true,
    count: ids.length,
    userId: titularUserId,
    executorUserId: deciso.contexto.executorUserId,
    espelho: { animalIds: ids },
  };
}

export async function alocarAnimaisAutorizado(
  io: IoAnimaisLote,
  pedido: PedidoAlocacaoAnimais,
): Promise<ResultadoAlocacao> {
  const data = assertDataMovimentacaoNaoFutura(pedido.input.dataMovimentacao);
  if (!data.ok) return recusa("data_futura", data.message);
  return repetir(() => io.emTransacao((tx) => alocarNaTransacao(tx, io, pedido)));
}

async function alocarNaTransacao(
  tx: ConsultaAnimaisLote,
  io: IoAnimaisLote,
  pedido: PedidoAlocacaoAnimais,
): Promise<ResultadoAlocacao> {
  const idsPedido = idsUnicos(pedido.input.animalIds);
  const espiados = await tx.espiar(idsPedido);
  const lotes = await travarLotes(tx, [
    pedido.input.loteDestinoId,
    ...espiados.map((animal) => animal.loteId),
  ].filter((id): id is number => id != null));
  const destino = lotes.get(pedido.input.loteDestinoId) ?? null;
  if (!destino) return sessaoSeLoteAusente(tx, pedido.executorId, MSG_LOTE_DESTINO_ALOCACAO);
  if (destino.fazendaId == null) return recusa("fazenda_ausente", MSG_LOTE_SEM_FAZENDA);
  const deciso = await autorizarOperacaoPersistida(tx, pedidoAutorizacao(pedido, destino.fazendaId));
  if (!deciso.ok) return recusa(deciso.motivo);
  const titularUserId = deciso.contexto.titularUserId;
  if (destino.userId !== titularUserId) return recusa("nao_encontrado", MSG_LOTE_DESTINO_ALOCACAO);
  if (!loteEstaAtivo(destino)) return recusa("lote_inativo", MSG_LOTE_INATIVO_ALOCACAO);
  if (pedido.input.fazendaDestinoId !== destino.fazendaId) {
    return recusa("fazendas_diferentes", MSG_FAZENDA_ALOCACAO);
  }
  if (destino.pastoAtualId != null && pedido.input.pastoDestinoId !== destino.pastoAtualId) {
    return recusa("pasto_incompativel", MSG_LOTE_FORA_SUBDIVISAO);
  }
  if (io.aposIdentidade) await io.aposIdentidade();

  const pastos = await travarPastos(tx, [
    destino.pastoAtualId,
    ...espiados.map((animal) => animal.pastoId),
  ]);
  if (destino.pastoAtualId != null) {
    const erroPasto = pastoCompativel(pastos.get(destino.pastoAtualId) ?? null, titularUserId, destino.fazendaId);
    if (erroPasto) return { ...erroPasto, mensagem: MSG_LOTE_FORA_SUBDIVISAO };
  }
  const animais = await tx.animais(idsPedido, titularUserId);
  const foto = new Map(espiados.filter((animal) => animal.userId === titularUserId).map((animal) => [animal.id, animal]));
  for (const animal of animais) {
    const antes = foto.get(animal.id);
    if (!antes || antes.loteId !== animal.loteId || antes.pastoId !== animal.pastoId || antes.fazendaId !== animal.fazendaId) {
      throw new AnimaisMudaramDuranteMovimentacao();
    }
  }
  const selecionados = animais.filter((animal) => animal.loteId != null && animal.loteId !== destino.id);
  if (selecionados.length === 0) return recusa("animal_invalido", MSG_NENHUM_ALOCACAO);
  for (const animal of selecionados) {
    if (animal.fazendaId != null && animal.fazendaId !== destino.fazendaId) {
      return recusa("fazendas_diferentes", MSG_FAZENDA_ALOCACAO);
    }
    if (isStatusAnimalBaixado(animal.status)) {
      const avaliacao = avaliarManejoVsBaixa({
        status: animal.status,
        dataBaixa: await tx.baixaAtiva(animal.id, titularUserId),
        dataEvento: pedido.input.dataMovimentacao,
      });
      if (!avaliacao.permitido) return recusa("animal_invalido", avaliacao.mensagem);
    }
  }
  const pastoDestinoId = destino.pastoAtualId;
  const usuarioNome = nomeDe({ name: pedido.executorNome, email: null } as LinhaUsuarioCadastro, pedido.executorNome);
  const ids = selecionados.map((animal) => animal.id);
  await tx.atualizarAnimais(ids, titularUserId, { loteId: destino.id, pastoId: pastoDestinoId });
  const semFazenda = selecionados.filter((animal) => animal.fazendaId == null).map((animal) => animal.id);
  if (semFazenda.length > 0) await tx.atualizarAnimais(semFazenda, titularUserId, { fazendaId: destino.fazendaId });
  if (io.aposAnimais) await io.aposAnimais();
  await tx.inserirHistorico(selecionados.map((animal) => ({
    userId: titularUserId,
    animalId: animal.id,
    loteOrigemId: animal.loteId,
    loteDestinoId: destino.id,
    pastoOrigemId: (animal.loteId != null ? lotes.get(animal.loteId)?.pastoAtualId : null) ?? animal.pastoId ?? null,
    pastoDestinoId,
    fazendaId: destino.fazendaId,
    dataMovimentacao: pedido.input.dataMovimentacao,
    usuarioNome,
    observacoes: null,
  })));
  if (io.aposHistorico) await io.aposHistorico();
  await ocupar(tx, io, [pastoDestinoId, ...selecionados.map((animal) => animal.pastoId)], titularUserId);
  return {
    ok: true,
    count: ids.length,
    loteDestinoNome: destino.nome,
    userId: titularUserId,
    executorUserId: deciso.contexto.executorUserId,
    espelho: {
      loteDestinoId: destino.id,
      animalIds: ids,
      dataMovimentacao: pedido.input.dataMovimentacao,
      usuarioNome,
    },
  };
}

export async function retirarEEspelharAnimais(
  io: IoAnimaisLote,
  pedido: PedidoRetiradaAnimais,
  espelho: { retirar(userId: number, animalIds: number[]): Promise<void> },
): Promise<ResultadoRetirada> {
  const resultado = await removerAnimaisLoteAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.retirar(resultado.userId, resultado.espelho.animalIds);
  } catch (erro) {
    console.warn("[lotes.removerAnimais] Espelho local não gravado:", erro);
  }
  return resultado;
}

export async function alocarEEspelharAnimais(
  io: IoAnimaisLote,
  pedido: PedidoAlocacaoAnimais,
  espelho: { mover(userId: number, dados: SucessoAlocacao["espelho"]): Promise<void> },
): Promise<ResultadoAlocacao> {
  const resultado = await alocarAnimaisAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.mover(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[lotes.transferirAnimaisAlocacao] Espelho local não gravado:", erro);
  }
  return resultado;
}
