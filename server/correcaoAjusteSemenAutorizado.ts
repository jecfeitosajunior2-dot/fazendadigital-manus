/**
 * Correção de entrada e ajuste manual do estoque de sêmen.
 * A partida é travada depois da identidade e antes de recalcular saldo e custo.
 * A entrada e a inseminação de uma matriz não mudam aqui.
 * Correção não reescreve movimento antigo: estorna e lança a entrada corrigida.
 * Ajuste não reescreve o passado: vale para o saldo travado agora.
 */
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { toDateOnlyISO } from "../shared/carenciaAnimal";
import {
  buildSemenAjusteMovimentacao,
  evaluateSemenAjusteEstoque,
  validateSemenAjusteMotivo,
} from "../shared/semenEstoqueAjuste";
import {
  MSG_SEMEN_CORRECAO_NAO_ENCONTRADA,
  evaluateSemenCorrecaoEntrada,
  validateSemenCorrecaoDados,
  validateSemenCorrecaoMotivo,
  withSemenCorrecaoFields,
} from "../shared/semenEstoqueLedger";
import { calcularValorAtualEstoqueSemen } from "../shared/semenEstoqueValor";
import { MSG_SEMEN_PARTIDA_NAO_ENCONTRADA } from "../shared/semenEstoque";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

export const PERMISSAO_SEMEN_EDITAR = "semen.editar";
export const ORDEM_BLOQUEIO_CORRECAO_AJUSTE_SEMEN =
  "espiar; identidade; partida; histórico e saldo";
export const MSG_SEM_PERMISSAO_SEMEN_EDITAR =
  "Você não tem permissão para corrigir entrada ou ajustar o estoque de sêmen.";
export const MSG_CONFLITO_CORRECAO_AJUSTE_SEMEN =
  "A gravação encontrou outra operação ao mesmo tempo. Tente novamente.";

const TENTATIVAS = 3;

export class ConflitoCorrecaoAjusteSemen extends Error {
  constructor() {
    super(MSG_CONFLITO_CORRECAO_AJUSTE_SEMEN);
    this.name = "ConflitoCorrecaoAjusteSemen";
  }
}

export type PartidaCorrecaoLinha = {
  id: number;
  userId: number;
  fazendaId: number;
  saldoDoses: number;
  custoUnitario: string | number | null;
  status: string;
};

export type MovimentoSemenLinha = {
  id: number;
  partidaId: number;
  userId: number;
  fazendaId: number;
  tipo: string;
  dataEntrada: string;
  quantidadeDoses: number;
  custoTotal: string;
  custoUnitario: string;
  observacoes: string | null;
  movimentacaoOrigemId: number | null;
  grupoCorrecaoId: string | null;
  motivoCorrecao: string | null;
  createdAt: string | Date | null;
};

export type ConsultaCorrecaoAjusteSemen = ConsultaAutorizacaoPersistida & {
  espiarMovimento(id: number): Promise<MovimentoSemenLinha | null>;
  espiarPartida(id: number): Promise<PartidaCorrecaoLinha | null>;
  travarPartida(id: number, titularUserId: number): Promise<PartidaCorrecaoLinha | null>;
  movimentos(partidaId: number, titularUserId: number): Promise<MovimentoSemenLinha[]>;
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
    movimentacaoOrigemId: number | null;
    grupoCorrecaoId: string | null;
    motivoCorrecao: string | null;
  }): Promise<number>;
  atualizarPartida(id: number, patch: {
    saldoDoses: number;
    custoUnitario: string | null;
    status: string;
  }): Promise<void>;
};

export type IoCorrecaoAjusteSemen = {
  emTransacao<T>(fn: (tx: ConsultaCorrecaoAjusteSemen) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposPartida?: () => Promise<void>;
  aposMovimento?: () => Promise<void>;
  aposSaldo?: () => Promise<void>;
};

type PedidoBase = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId">;

export type PedidoCorrecaoSemen = PedidoBase & {
  input: {
    movimentacaoId: number;
    quantidadeDoses: unknown;
    custoTotal: unknown;
    dataEntrada?: unknown;
    motivoCodigo: unknown;
    motivoDescricao?: unknown;
  };
};

export type PedidoAjusteSemen = PedidoBase & {
  input: {
    partidaId: number;
    modo: unknown;
    saldoNovo?: unknown;
    valorNovo?: unknown;
    motivoCodigo: unknown;
    motivoDescricao?: unknown;
    observacao?: unknown;
  };
};

export type MotivoCorrecaoAjuste = MotivoOperacional | "nao_encontrado" | "invalido" | "conflito";
export type RecusaCorrecaoAjuste = { ok: false; motivo: MotivoCorrecaoAjuste; mensagem?: string };

export type SucessoCorrecao = {
  ok: true;
  partidaId: number;
  estornoId: number;
  novaEntradaId: number;
  saldoAtual: number;
  custoMedioAtual: string | null;
  userId: number;
  executorUserId: number;
};

export type SucessoAjuste = {
  ok: true;
  partidaId: number;
  movimentacaoId: number;
  saldoAtual: number;
  custoMedioAtual: string | null;
  valorAtualEstoque: number;
  userId: number;
  executorUserId: number;
};

function recusa(motivo: MotivoCorrecaoAjuste, mensagem?: string): RecusaCorrecaoAjuste {
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
      if (ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  throw new ConflitoCorrecaoAjusteSemen();
}

async function autorizarPartida(
  tx: ConsultaCorrecaoAjusteSemen,
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoBase,
  previa: PartidaCorrecaoLinha | null,
): Promise<{ titularUserId: number; executorUserId: number; fazendaId: number } | RecusaCorrecaoAjuste> {
  if (!previa) return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  const decisao = await autorizarOperacaoPersistida(tx, {
    ...pedido,
    permissaoId: PERMISSAO_SEMEN_EDITAR,
    fazendaId: previa.fazendaId,
  });
  if (!decisao.ok) {
    if (decisao.motivo === "sem_fazenda") return recusa(decisao.motivo, MSG_SEM_FAZENDA_MANEJO);
    return recusa(decisao.motivo);
  }
  await io.aposIdentidade?.();
  const partida = await tx.travarPartida(previa.id, decisao.contexto.titularUserId);
  if (!partida || partida.fazendaId !== previa.fazendaId) {
    return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  }
  await io.aposPartida?.();
  return {
    titularUserId: decisao.contexto.titularUserId,
    executorUserId: decisao.contexto.executorUserId,
    fazendaId: partida.fazendaId,
  };
}

async function corrigirNaTransacao(
  tx: ConsultaCorrecaoAjusteSemen,
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoCorrecaoSemen,
  motivoTexto: string,
  dados: { quantidadeDoses: number; custoTotal: number; custoUnitario: string; dataEntrada: string },
): Promise<SucessoCorrecao | RecusaCorrecaoAjuste> {
  const espiada = await tx.espiarMovimento(pedido.input.movimentacaoId);
  if (!espiada) return recusa("nao_encontrado", MSG_SEMEN_CORRECAO_NAO_ENCONTRADA);
  const previa = await tx.espiarPartida(espiada.partidaId);
  const trava = await autorizarPartida(tx, io, pedido, previa);
  if ("ok" in trava) return trava;
  const movimentos = await tx.movimentos(espiada.partidaId, trava.titularUserId);
  const original = movimentos.find((linha) => linha.id === pedido.input.movimentacaoId) ?? null;
  if (!original) return recusa("nao_encontrado", MSG_SEMEN_CORRECAO_NAO_ENCONTRADA);
  const partida = await tx.travarPartida(espiada.partidaId, trava.titularUserId);
  if (!partida) return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  const agora = new Date();
  const maxId = movimentos.reduce((maior, linha) => Math.max(maior, linha.id), 0);
  const evaluated = evaluateSemenCorrecaoEntrada({
    original: withSemenCorrecaoFields(original),
    movimentacoes: movimentos.map(withSemenCorrecaoFields),
    saldoAtual: partida.saldoDoses,
    dadosNovos: dados,
    dataCorrecao: toDateOnlyISO(agora),
    nowIso: agora.toISOString(),
    nextEstornoId: maxId + 1,
    nextEntradaId: maxId + 2,
    grupoCorrecaoId: randomUUID(),
    motivoTexto,
  });
  if (!evaluated.ok) return recusa("invalido", evaluated.message);
  const estornoId = await tx.inserirMovimento({
    partidaId: partida.id,
    userId: trava.titularUserId,
    fazendaId: trava.fazendaId,
    tipo: evaluated.estorno.tipo,
    dataEntrada: evaluated.estorno.dataEntrada,
    quantidadeDoses: evaluated.estorno.quantidadeDoses,
    custoTotal: evaluated.estorno.custoTotal,
    custoUnitario: evaluated.estorno.custoUnitario,
    observacoes: evaluated.estorno.observacoes,
    movimentacaoOrigemId: evaluated.estorno.movimentacaoOrigemId,
    grupoCorrecaoId: evaluated.estorno.grupoCorrecaoId,
    motivoCorrecao: evaluated.estorno.motivoCorrecao,
  });
  const novaEntradaId = await tx.inserirMovimento({
    partidaId: partida.id,
    userId: trava.titularUserId,
    fazendaId: trava.fazendaId,
    tipo: evaluated.novaEntrada.tipo,
    dataEntrada: evaluated.novaEntrada.dataEntrada,
    quantidadeDoses: evaluated.novaEntrada.quantidadeDoses,
    custoTotal: evaluated.novaEntrada.custoTotal,
    custoUnitario: evaluated.novaEntrada.custoUnitario,
    observacoes: evaluated.novaEntrada.observacoes,
    movimentacaoOrigemId: evaluated.novaEntrada.movimentacaoOrigemId,
    grupoCorrecaoId: evaluated.novaEntrada.grupoCorrecaoId,
    motivoCorrecao: evaluated.novaEntrada.motivoCorrecao,
  });
  await io.aposMovimento?.();
  await tx.atualizarPartida(partida.id, evaluated.estadoFinal);
  await io.aposSaldo?.();
  return {
    ok: true,
    partidaId: partida.id,
    estornoId,
    novaEntradaId,
    saldoAtual: evaluated.estadoFinal.saldoDoses,
    custoMedioAtual: evaluated.estadoFinal.custoUnitario,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
  };
}

async function ajustarNaTransacao(
  tx: ConsultaCorrecaoAjusteSemen,
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoAjusteSemen,
  motivoTexto: string,
): Promise<SucessoAjuste | RecusaCorrecaoAjuste> {
  const previa = await tx.espiarPartida(pedido.input.partidaId);
  const trava = await autorizarPartida(tx, io, pedido, previa);
  if ("ok" in trava) return trava;
  const partida = await tx.travarPartida(pedido.input.partidaId, trava.titularUserId);
  if (!partida || partida.fazendaId !== trava.fazendaId) {
    return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  }
  const movimentos = await tx.movimentos(partida.id, trava.titularUserId);
  const valorAtual = calcularValorAtualEstoqueSemen(movimentos.map(withSemenCorrecaoFields));
  const estado = evaluateSemenAjusteEstoque({
    saldoAtual: partida.saldoDoses,
    custoMedioAtual: partida.custoUnitario,
    valorAtual,
    modo: pedido.input.modo,
    saldoNovo: pedido.input.saldoNovo,
    valorNovo: pedido.input.valorNovo,
  });
  if (!estado.ok) return recusa("invalido", estado.message);
  const draft = buildSemenAjusteMovimentacao({
    estado: estado.value,
    dataOperacional: toDateOnlyISO(new Date()),
    motivoTexto,
    observacao: String(pedido.input.observacao ?? "").trim() || null,
  });
  const movimentacaoId = await tx.inserirMovimento({
    partidaId: partida.id,
    userId: trava.titularUserId,
    fazendaId: trava.fazendaId,
    tipo: draft.tipo,
    dataEntrada: draft.dataEntrada,
    quantidadeDoses: draft.quantidadeDoses,
    custoTotal: draft.custoTotal,
    custoUnitario: draft.custoUnitario,
    observacoes: draft.observacoes,
    movimentacaoOrigemId: null,
    grupoCorrecaoId: null,
    motivoCorrecao: draft.motivoCorrecao,
  });
  await io.aposMovimento?.();
  await tx.atualizarPartida(partida.id, {
    saldoDoses: estado.value.saldoNovo,
    custoUnitario: estado.value.custoMedioNovo,
    status: estado.value.status,
  });
  await io.aposSaldo?.();
  return {
    ok: true,
    partidaId: partida.id,
    movimentacaoId,
    saldoAtual: estado.value.saldoNovo,
    custoMedioAtual: estado.value.custoMedioNovo,
    valorAtualEstoque: estado.value.valorNovo,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
  };
}

export async function corrigirEntradaSemenAutorizado(
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoCorrecaoSemen,
): Promise<SucessoCorrecao | RecusaCorrecaoAjuste> {
  const motivo = validateSemenCorrecaoMotivo(pedido.input.motivoCodigo, pedido.input.motivoDescricao);
  if (!motivo.ok) return recusa("invalido", motivo.message);
  const dados = validateSemenCorrecaoDados({
    quantidadeDoses: pedido.input.quantidadeDoses,
    custoTotal: pedido.input.custoTotal,
    dataEntrada: pedido.input.dataEntrada,
  });
  if (!dados.ok) return recusa("invalido", dados.message);
  try {
    return await repetir(() => io.emTransacao((tx) => corrigirNaTransacao(tx, io, pedido, motivo.texto, dados.value)));
  } catch (erro) {
    if (erro instanceof ConflitoCorrecaoAjusteSemen) return recusa("conflito", erro.message);
    throw erro;
  }
}

export async function ajustarEstoqueSemenAutorizado(
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoAjusteSemen,
): Promise<SucessoAjuste | RecusaCorrecaoAjuste> {
  const motivo = validateSemenAjusteMotivo(pedido.input.motivoCodigo, pedido.input.motivoDescricao);
  if (!motivo.ok) return recusa("invalido", motivo.message);
  try {
    return await repetir(() => io.emTransacao((tx) => ajustarNaTransacao(tx, io, pedido, motivo.texto)));
  } catch (erro) {
    if (erro instanceof ConflitoCorrecaoAjusteSemen) return recusa("conflito", erro.message);
    throw erro;
  }
}

async function espelhar<T extends { ok: true; userId: number }>(
  resultado: T | RecusaCorrecaoAjuste,
  espelho: { registrar(userId: number, confirmado: T): Promise<void> },
  aviso: string,
): Promise<T | RecusaCorrecaoAjuste> {
  if (!resultado.ok) return resultado;
  try {
    await espelho.registrar(resultado.userId, resultado);
  } catch (erro) {
    console.warn(aviso, erro);
  }
  return resultado;
}

export async function corrigirEntradaSemenEEspelhar(
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoCorrecaoSemen,
  espelho: { registrar(userId: number, confirmado: SucessoCorrecao): Promise<void> },
): Promise<SucessoCorrecao | RecusaCorrecaoAjuste> {
  return espelhar(await corrigirEntradaSemenAutorizado(io, pedido), espelho, "[semen.corrigirEntrada] espelho fora");
}

export async function ajustarEstoqueSemenEEspelhar(
  io: IoCorrecaoAjusteSemen,
  pedido: PedidoAjusteSemen,
  espelho: { registrar(userId: number, confirmado: SucessoAjuste): Promise<void> },
): Promise<SucessoAjuste | RecusaCorrecaoAjuste> {
  return espelhar(await ajustarEstoqueSemenAutorizado(io, pedido), espelho, "[semen.ajustarEstoque] espelho fora");
}

export function erroCorrecaoAjusteSemen(resultado: RecusaCorrecaoAjuste): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_SEMEN_EDITAR });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_SEMEN_PARTIDA_NAO_ENCONTRADA });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_CORRECAO_AJUSTE_SEMEN });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? "Não foi possível gravar o estoque de sêmen." });
  }
}
