/**
 * Entrada de sêmen na partida do titular.
 * A partida existente é travada antes de somar saldo e custo.
 * A mesma solicitação, reenviada com a mesma chave, não soma de novo.
 * A inseminação homologada não muda aqui.
 */
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoBloqueadoReproPorCastracao,
  isMachoReprodutivamenteMaduro,
  MSG_REPRO_INELEGIVEL,
  MSG_REPRO_MACHO_CASTRADO_REPRODUTOR,
} from "../shared/reproElegibilidade";
import {
  applySemenEntradaAgregacao,
  MSG_SEMEN_PARTIDA_NAO_ENCONTRADA,
  resolveSemenMachoDisplayLabel,
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_ORIGEM_INTERNO,
  validateSemenEntradaInput,
  type SemenEntradaValidada,
} from "../shared/semenEstoque";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

export const PERMISSAO_SEMEN_CRIAR = "semen.criar";
export const ORDEM_BLOQUEIO_ENTRADA_SEMEN =
  "espiar; lote; identidade; pasto; touro; partida; operação; entrada e saldo";
export const MSG_OPERACAO_ENTRADA_OBRIGATORIA =
  "Esta entrada precisa de uma identificação da operação. Atualize a tela e tente de novo. Nada foi gravado.";
export const MSG_OPERACAO_ENTRADA_DIVERGENTE =
  "Esta operação já foi registrada com outros dados. Nada foi alterado.";
const UUID_OPERACAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MSG_SEM_PERMISSAO_ENTRADA_SEMEN =
  "Você não tem permissão para registrar entrada de sêmen.";
export const MSG_CONFLITO_ENTRADA_SEMEN =
  "A gravação encontrou outra operação ao mesmo tempo. Tente novamente.";
const MSG_SEMEN_MACHO_NAO_E_MACHO = "O reprodutor selecionado não é macho.";
const MSG_SEMEN_MACHO_INATIVO =
  "O reprodutor selecionado deve estar ativo para entrada de sêmen.";

const TENTATIVAS = 3;

export class ConflitoEntradaSemen extends Error {
  constructor() {
    super(MSG_CONFLITO_ENTRADA_SEMEN);
    this.name = "ConflitoEntradaSemen";
  }
}

class AnimalMudouDuranteEntrada extends Error {}

/** A outra transação ainda não concluiu a mesma chave. A tentativa inteira recomeça. */
export class EntradaAindaPendente extends Error {
  constructor() {
    super("entrada pendente");
    this.name = "EntradaAindaPendente";
  }
}

class RecusaDentroDaEntrada extends Error {
  constructor(readonly resultado: RecusaEntrada) {
    super(resultado.mensagem ?? resultado.motivo);
    this.name = "RecusaDentroDaEntrada";
  }
}

export type AnimalEntradaLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
  sexo: string | null;
  castrado: boolean | number | null;
  categoria: string | null;
  dataNascimento: string | null;
  brinco: string | null;
  nome: string | null;
};

export type PartidaEntradaLinha = {
  id: number;
  userId: number;
  fazendaId: number;
  reprodutorKey: string;
  partida: string;
  saldoDoses: number;
  custoUnitario: string | number | null;
  centralOrigem: string | null;
  reprodutorTexto: string | null;
  status: string;
};

export type ConsultaEntradaSemen = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  pasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  espiar(id: number): Promise<AnimalEntradaLinha | null>;
  animal(id: number, titularUserId: number): Promise<AnimalEntradaLinha | null>;
  espiarPartida(titularUserId: number, fazendaId: number, reprodutorKey: string, partida: string): Promise<PartidaEntradaLinha | null>;
  travarPartida(id: number, titularUserId: number): Promise<PartidaEntradaLinha | null>;
  inserirPartida(row: {
    userId: number;
    fazendaId: number;
    origemReprodutor: string;
    reprodutorKey: string;
    machoId: number | null;
    reprodutorTexto: string | null;
    partida: string;
    centralOrigem: string | null;
    saldoDoses: number;
    custoUnitario: string | null;
    status: string;
    observacoes: string | null;
  }): Promise<number>;
  atualizarPartida(id: number, patch: {
    saldoDoses: number;
    custoUnitario: string | null;
    status: string;
    centralOrigem: string | null;
    reprodutorTexto: string | null;
  }): Promise<void>;
  inserirMovimento(row: {
    partidaId: number;
    userId: number;
    fazendaId: number;
    tipo: string;
    dataEntrada: string;
    quantidadeDoses: number;
    custoTotal: string;
    custoUnitario: string;
    observacoes: string | null;
  }): Promise<number>;
  reservarOperacao(row: {
    userId: number;
    chave: string;
    fazendaId: number;
    executorUserId: number;
    conteudoHash: string;
  }): Promise<ReservaEntrada>;
  concluirOperacao(row: {
    userId: number;
    chave: string;
    partidaId: number;
    movimentacaoId: number;
    saldoAtual: number;
    custoMedioAtual: string | null;
    novaEntrada: boolean;
  }): Promise<void>;
};

export type ReservaEntrada =
  | { situacao: "nova" }
  | {
    situacao: "repetida";
    partidaId: number;
    movimentacaoId: number;
    saldoAtual: number;
    custoMedioAtual: string | null;
    novaEntrada: boolean;
  }
  | { situacao: "divergente" };

export type IoEntradaSemen = {
  emTransacao<T>(fn: (tx: ConsultaEntradaSemen) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposPartida?: () => Promise<void>;
  aposSaldo?: () => Promise<void>;
  aposRegistro?: () => Promise<void>;
};

export type PedidoEntradaSemen = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  fazendaId: number;
  input: {
    origemReprodutor: unknown;
    machoId?: unknown;
    reprodutorTexto?: unknown;
    partida?: unknown;
    centralOrigem?: unknown;
    quantidadeDoses: unknown;
    custoTotal: unknown;
    dataEntrada?: unknown;
    observacoes?: unknown;
    operacaoId?: unknown;
  };
};

export type MotivoEntrada = MotivoOperacional | "nao_encontrado" | "animal_invalido" | "conflito" | "invalido";
export type RecusaEntrada = { ok: false; motivo: MotivoEntrada; mensagem?: string };
export type SucessoEntrada = {
  ok: true;
  partidaId: number;
  movimentacaoId: number;
  novaEntrada: boolean;
  saldoAtual: number;
  custoMedioAtual: string | null;
  userId: number;
  executorUserId: number;
  repetida: boolean;
};

function recusa(motivo: MotivoEntrada, mensagem?: string): RecusaEntrada {
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

async function repetir<T>(operacao: () => Promise<T>): Promise<T> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    try {
      return await operacao();
    } catch (erro) {
      if (erro instanceof AnimalMudouDuranteEntrada || erro instanceof EntradaAindaPendente || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  throw new ConflitoEntradaSemen();
}

function mudou(antes: AnimalEntradaLinha, depois: AnimalEntradaLinha): boolean {
  return antes.loteId !== depois.loteId
    || antes.pastoId !== depois.pastoId
    || antes.fazendaId !== depois.fazendaId
    || antes.status !== depois.status
    || antes.sexo !== depois.sexo
    || Boolean(antes.castrado) !== Boolean(depois.castrado);
}

async function travarTouro(
  tx: ConsultaEntradaSemen,
  io: IoEntradaSemen,
  pedido: PedidoEntradaSemen,
  entrada: SemenEntradaValidada,
): Promise<{ titularUserId: number; executorUserId: number; texto: string | null } | RecusaEntrada> {
  const antes = entrada.machoId == null ? null : await tx.espiar(entrada.machoId);
  if (entrada.origem === SEMEN_ORIGEM_INTERNO && !antes) {
    return recusa("nao_encontrado", "Selecione um animal válido.");
  }
  if (antes?.loteId != null) await tx.lote(antes.loteId);
  const decisao = await autorizarOperacaoPersistida(tx, {
    ...pedido,
    permissaoId: PERMISSAO_SEMEN_CRIAR,
    fazendaId: pedido.fazendaId,
  });
  if (!decisao.ok) {
    if (decisao.motivo === "sem_fazenda") return recusa(decisao.motivo, MSG_SEM_FAZENDA_MANEJO);
    return recusa(decisao.motivo);
  }
  await io.aposIdentidade?.();
  if (antes?.pastoId != null) await tx.pasto(antes.pastoId);
  let texto = entrada.reprodutorTexto;
  if (antes && entrada.machoId != null) {
    const touro = await tx.animal(entrada.machoId, decisao.contexto.titularUserId);
    if (!touro) return recusa("nao_encontrado", "Selecione um animal válido.");
    if (mudou(antes, touro)) throw new AnimalMudouDuranteEntrada();
    if (touro.fazendaId !== pedido.fazendaId) {
      return recusa("animal_invalido", MSG_SEM_FAZENDA_MANEJO);
    }
    if (touro.sexo !== "macho") return recusa("animal_invalido", MSG_SEMEN_MACHO_NAO_E_MACHO);
    if (touro.status !== "ativo") return recusa("animal_invalido", MSG_SEMEN_MACHO_INATIVO);
    const elegivel = buildReproAnimalElegibilidadeInput(touro);
    if (isMachoBloqueadoReproPorCastracao(elegivel)) {
      return recusa("animal_invalido", MSG_REPRO_MACHO_CASTRADO_REPRODUTOR);
    }
    if (!isMachoReprodutivamenteMaduro(elegivel)) return recusa("animal_invalido", MSG_REPRO_INELEGIVEL);
    texto = resolveSemenMachoDisplayLabel({ brinco: touro.brinco, nome: touro.nome });
  }
  return {
    titularUserId: decisao.contexto.titularUserId,
    executorUserId: decisao.contexto.executorUserId,
    texto,
  };
}

export function normalizarOperacaoId(valor: unknown): string | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  return UUID_OPERACAO.test(texto) ? texto : null;
}

export function hashConteudoEntrada(entrada: SemenEntradaValidada, fazendaId: number): string {
  const texto = [
    fazendaId,
    entrada.origem,
    entrada.reprodutorKey,
    entrada.machoId ?? "",
    entrada.partida,
    entrada.centralOrigem ?? "",
    entrada.quantidadeDoses,
    entrada.custoTotal.toFixed(2),
    entrada.custoUnitario,
    entrada.dataEntrada.slice(0, 10),
    (entrada.observacoes ?? "").trim(),
  ].join("|");
  return createHash("sha256").update(texto).digest("hex");
}

function chaveDuplicada(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; code?: string; cause?: unknown };
    if (item.errno === 1062 || item.code === "ER_DUP_ENTRY") return true;
    atual = item.cause;
  }
  return false;
}

async function criarPartida(
  tx: ConsultaEntradaSemen,
  io: IoEntradaSemen,
  pedido: PedidoEntradaSemen,
  entrada: SemenEntradaValidada,
  trava: { titularUserId: number; executorUserId: number; texto: string | null },
): Promise<SucessoEntrada> {
  const agreg = applySemenEntradaAgregacao({
    saldoAnterior: 0,
    custoUnitarioAnterior: null,
    quantidadeEntrada: entrada.quantidadeDoses,
    custoTotalEntrada: entrada.custoTotal,
  });
  const partidaId = await tx.inserirPartida({
    userId: trava.titularUserId,
    fazendaId: pedido.fazendaId,
    origemReprodutor: entrada.origem,
    reprodutorKey: entrada.reprodutorKey,
    machoId: entrada.machoId,
    reprodutorTexto: trava.texto,
    partida: entrada.partida,
    centralOrigem: entrada.centralOrigem,
    saldoDoses: agreg.novoSaldo,
    custoUnitario: agreg.novoCustoUnitario,
    status: agreg.status,
    observacoes: entrada.observacoes,
  });
  await io.aposSaldo?.();
  const movimentacaoId = await tx.inserirMovimento({
    partidaId,
    userId: trava.titularUserId,
    fazendaId: pedido.fazendaId,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    dataEntrada: entrada.dataEntrada,
    quantidadeDoses: entrada.quantidadeDoses,
    custoTotal: entrada.custoTotal.toFixed(2),
    custoUnitario: entrada.custoUnitario,
    observacoes: entrada.observacoes,
  });
  await io.aposRegistro?.();
  return {
    ok: true,
    partidaId,
    movimentacaoId,
    novaEntrada: true,
    saldoAtual: agreg.novoSaldo,
    custoMedioAtual: agreg.novoCustoUnitario,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
    repetida: false,
  };
}

async function somarNaPartida(
  tx: ConsultaEntradaSemen,
  io: IoEntradaSemen,
  pedido: PedidoEntradaSemen,
  entrada: SemenEntradaValidada,
  trava: { titularUserId: number; executorUserId: number; texto: string | null },
  previa: PartidaEntradaLinha,
): Promise<SucessoEntrada> {
  const partida = await tx.travarPartida(previa.id, trava.titularUserId);
  if (!partida || partida.fazendaId !== pedido.fazendaId || partida.reprodutorKey !== entrada.reprodutorKey || partida.partida !== entrada.partida) {
    throw new RecusaDentroDaEntrada(recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA));
  }
  await io.aposPartida?.();
  const agreg = applySemenEntradaAgregacao({
    saldoAnterior: Number(partida.saldoDoses),
    custoUnitarioAnterior: partida.custoUnitario,
    quantidadeEntrada: entrada.quantidadeDoses,
    custoTotalEntrada: entrada.custoTotal,
  });
  await tx.atualizarPartida(partida.id, {
    saldoDoses: agreg.novoSaldo,
    custoUnitario: agreg.novoCustoUnitario,
    status: agreg.status,
    centralOrigem: entrada.centralOrigem ?? partida.centralOrigem,
    reprodutorTexto: trava.texto ?? partida.reprodutorTexto,
  });
  await io.aposSaldo?.();
  const movimentacaoId = await tx.inserirMovimento({
    partidaId: partida.id,
    userId: trava.titularUserId,
    fazendaId: pedido.fazendaId,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    dataEntrada: entrada.dataEntrada,
    quantidadeDoses: entrada.quantidadeDoses,
    custoTotal: entrada.custoTotal.toFixed(2),
    custoUnitario: entrada.custoUnitario,
    observacoes: entrada.observacoes,
  });
  await io.aposRegistro?.();
  return {
    ok: true,
    partidaId: partida.id,
    movimentacaoId,
    novaEntrada: false,
    saldoAtual: agreg.novoSaldo,
    custoMedioAtual: agreg.novoCustoUnitario,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
    repetida: false,
  };
}

async function entrarNaTransacao(
  tx: ConsultaEntradaSemen,
  io: IoEntradaSemen,
  pedido: PedidoEntradaSemen,
  entrada: SemenEntradaValidada,
  operacaoId: string,
): Promise<SucessoEntrada | RecusaEntrada> {
  const trava = await travarTouro(tx, io, pedido, entrada);
  if ("ok" in trava) return trava;
  const reserva = await tx.reservarOperacao({
    userId: trava.titularUserId,
    chave: operacaoId,
    fazendaId: pedido.fazendaId,
    executorUserId: trava.executorUserId,
    conteudoHash: hashConteudoEntrada(entrada, pedido.fazendaId),
  });
  if (reserva.situacao === "divergente") return recusa("invalido", MSG_OPERACAO_ENTRADA_DIVERGENTE);
  if (reserva.situacao === "repetida") {
    return {
      ok: true,
      partidaId: reserva.partidaId,
      movimentacaoId: reserva.movimentacaoId,
      novaEntrada: reserva.novaEntrada,
      saldoAtual: reserva.saldoAtual,
      custoMedioAtual: reserva.custoMedioAtual,
      userId: trava.titularUserId,
      executorUserId: trava.executorUserId,
      repetida: true,
    };
  }
  const previa = await tx.espiarPartida(
    trava.titularUserId,
    pedido.fazendaId,
    entrada.reprodutorKey,
    entrada.partida,
  );
  let gravado: SucessoEntrada;
  if (!previa) {
    try {
      gravado = await criarPartida(tx, io, pedido, entrada, trava);
    } catch (erro) {
      if (!chaveDuplicada(erro)) throw erro;
      const achada = await tx.espiarPartida(
        trava.titularUserId,
        pedido.fazendaId,
        entrada.reprodutorKey,
        entrada.partida,
      );
      if (!achada) throw erro;
      gravado = await somarNaPartida(tx, io, pedido, entrada, trava, achada);
    }
  } else {
    gravado = await somarNaPartida(tx, io, pedido, entrada, trava, previa);
  }
  await tx.concluirOperacao({
    userId: trava.titularUserId,
    chave: operacaoId,
    partidaId: gravado.partidaId,
    movimentacaoId: gravado.movimentacaoId,
    saldoAtual: gravado.saldoAtual,
    custoMedioAtual: gravado.custoMedioAtual,
    novaEntrada: gravado.novaEntrada,
  });
  return gravado;
}

export async function registrarEntradaSemenAutorizado(
  io: IoEntradaSemen,
  pedido: PedidoEntradaSemen,
): Promise<SucessoEntrada | RecusaEntrada> {
  if (!Number.isFinite(pedido.fazendaId) || pedido.fazendaId <= 0) {
    return recusa("animal_invalido", "Fazenda inválida.");
  }
  const validacao = validateSemenEntradaInput(pedido.input);
  if (!validacao.ok) return recusa("animal_invalido", validacao.message);
  const operacaoId = normalizarOperacaoId(pedido.input.operacaoId);
  if (!operacaoId) return recusa("invalido", MSG_OPERACAO_ENTRADA_OBRIGATORIA);
  try {
    return await repetir(() => io.emTransacao((tx) => entrarNaTransacao(tx, io, pedido, validacao.value, operacaoId)));
  } catch (erro) {
    if (erro instanceof RecusaDentroDaEntrada) return erro.resultado;
    if (erro instanceof ConflitoEntradaSemen) return recusa("conflito", erro.message);
    throw erro;
  }
}

export async function registrarEntradaSemenEEspelhar(
  io: IoEntradaSemen,
  pedido: PedidoEntradaSemen,
  espelho: {
    registrar(userId: number, confirmado: {
      partidaId: number;
      saldoAtual: number;
      custoMedioAtual: string | null;
      novaEntrada: boolean;
    }): Promise<void>;
  },
): Promise<SucessoEntrada | RecusaEntrada> {
  const resultado = await registrarEntradaSemenAutorizado(io, pedido);
  if (!resultado.ok || resultado.repetida) return resultado;
  try {
    await espelho.registrar(resultado.userId, {
      partidaId: resultado.partidaId,
      saldoAtual: resultado.saldoAtual,
      custoMedioAtual: resultado.custoMedioAtual,
      novaEntrada: resultado.novaEntrada,
    });
  } catch (erro) {
    console.warn("[semen.registrarEntrada] espelho fora", erro);
  }
  return resultado;
}

export function erroEntradaSemen(resultado: RecusaEntrada): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_ENTRADA_SEMEN });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_SEMEN_PARTIDA_NAO_ENCONTRADA });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_ENTRADA_SEMEN });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? "Não foi possível registrar a entrada de sêmen." });
  }
}
