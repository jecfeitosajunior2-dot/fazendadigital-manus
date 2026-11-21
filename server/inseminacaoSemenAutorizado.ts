/**
 * Inseminação de uma matriz que consome uma dose de sêmen.
 * A mesma solicitação, reenviada com a mesma chave, não consome outra dose.
 * O diagnóstico sem partida, a estação e o espelho de várias matrizes ficam como estavam.
 * A conta da dose continua em applySemenSaidaIa: uma dose por registro.
 */
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa } from "../shared/animalBaixa";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoBloqueadoReproPorCastracao,
  isMachoReprodutivamenteMaduro,
  isReproTipoPermitidoParaAnimal,
  mensagemReproInelegivelAnimal,
  MSG_REPRO_INELEGIVEL,
  MSG_REPRO_MACHO_CASTRADO_REPRODUTOR,
} from "../shared/reproElegibilidade";
import {
  assertCustoDoseInseminacaoCreate,
  resolveOrigemSemenInseminacao,
  validateReproEcc,
} from "../shared/reproInseminacao";
import { packReproObservacoes, validateReproResultadoForSave } from "../shared/reproRegistroMeta";
import {
  applySemenSaidaIa,
  MSG_SEMEN_PARTIDA_INCOMPATIVEL,
  MSG_SEMEN_PARTIDA_NAO_ENCONTRADA,
  MSG_SEMEN_SEM_DOSES,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  validateSemenPartidaReprodutorCompat,
} from "../shared/semenEstoque";
import { SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO } from "../shared/semenUtilizado";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import {
  MSG_ANIMAL_MANEJO_AUSENTE,
  MSG_FAZENDA_ANIMAL_DIVERGENTE,
  MSG_REPRODUTOR_AUSENTE,
  MSG_REPRODUTOR_OUTRA_FAZENDA,
  MSG_REPRO_DATA_FUTURA,
  MSG_REPRO_DATA_INVALIDA,
  MSG_REPRO_FAZENDA_OBRIGATORIA,
  MSG_REPRO_GENERICO,
  MSG_SEM_FAZENDA_MANEJO,
  MSG_SEM_PERMISSAO_REPRODUCAO,
  PERMISSAO_REPRODUCAO,
} from "./registrarManejoAutorizado";
const MSG_REPRO_MACHO_IGUAL_MATRIZ = "O reprodutor não pode ser a mesma matriz do evento.";
const MSG_REPRO_MACHO_NAO_E_MACHO = "O reprodutor selecionado não é macho.";

export { PERMISSAO_REPRODUCAO };
export const ORDEM_BLOQUEIO_INSEMINACAO =
  "espiar; lote; identidade; pasto; animal e touro; partida; operação; histórico e dose";
export const MSG_OPERACAO_IA_OBRIGATORIA =
  "Esta inseminação precisa de uma identificação da operação. Atualize a tela e tente de novo. Nada foi gravado.";
export const MSG_OPERACAO_IA_DIVERGENTE =
  "Esta operação já foi registrada com outros dados. Nada foi alterado.";
const UUID_OPERACAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MSG_CONFLITO_INSEMINACAO =
  "A gravação encontrou outra operação ao mesmo tempo. Tente novamente.";

const TENTATIVAS = 3;
const TIPO_INSEMINACAO = "Inseminação";

export class ConflitoInseminacaoSemen extends Error {
  constructor() {
    super(MSG_CONFLITO_INSEMINACAO);
    this.name = "ConflitoInseminacaoSemen";
  }
}

class AnimalMudouDuranteInseminacao extends Error {}

export class InseminacaoAindaPendente extends Error {
  constructor() {
    super("inseminação pendente");
    this.name = "InseminacaoAindaPendente";
  }
}

export type AnimalInseminacaoLinha = {
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
};

export type PartidaSemenLinha = {
  id: number;
  userId: number;
  fazendaId: number;
  origemReprodutor: string;
  reprodutorKey: string;
  machoId: number | null;
  reprodutorTexto: string | null;
  partida: string;
  centralOrigem: string | null;
  saldoDoses: number;
  custoUnitario: string | number | null;
};

export type ConsultaInseminacao = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  pasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  espiar(id: number): Promise<AnimalInseminacaoLinha | null>;
  animal(id: number, titularUserId: number): Promise<AnimalInseminacaoLinha | null>;
  baixaAtiva(animalId: number): Promise<{ dataBaixa: string | null } | null>;
  espiarPartida(id: number): Promise<PartidaSemenLinha | null>;
  travarPartida(id: number, titularUserId: number): Promise<PartidaSemenLinha | null>;
  inserirReproducao(row: {
    userId: number;
    femeaId: number;
    machoId?: number;
    tipo: string;
    dataCobertura: string;
    dataPrevistoParto?: string;
    resultado?: string;
    observacoes?: string;
  }): Promise<number>;
  inserirMovimento(row: {
    partidaId: number;
    userId: number;
    fazendaId: number;
    tipo: string;
    dataEntrada: string;
    quantidadeDoses: number;
    custoTotal: string;
    custoUnitario: string;
    observacoes: string;
  }): Promise<number>;
  atualizarPartida(id: number, patch: {
    saldoDoses: number;
    custoUnitario: string | null;
    status: string;
  }): Promise<void>;
  reservarOperacao(row: {
    userId: number;
    chave: string;
    fazendaId: number;
    executorUserId: number;
    conteudoHash: string;
  }): Promise<ReservaInseminacao>;
  concluirOperacao(row: { userId: number; chave: string; registroPrincipalId: number }): Promise<void>;
  movimentoDaInseminacao(userId: number, registroId: number, animalId: number): Promise<number | null>;
};

export type ReservaInseminacao =
  | { situacao: "nova" }
  | { situacao: "repetida"; registroPrincipalId: number }
  | { situacao: "divergente" };

export type IoInseminacao = {
  emTransacao<T>(fn: (tx: ConsultaInseminacao) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposHistorico?: () => Promise<void>;
  aposRegistro?: () => Promise<void>;
};

export type PedidoInseminacao = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  executorNome?: string | null;
  input: {
    animalId: number;
    fazendaId?: number | null;
    machoId?: number | null;
    tipo: string;
    dataCobertura: string;
    dataPrevistoParto?: string | null;
    resultado?: string | null;
    reprodutorSemen?: string | null;
    descricaoResultadoOutro?: string | null;
    responsavel?: string | null;
    observacoes?: string | null;
    semenPartidaId: number;
    custoDoseSemen?: number | null;
    centralOrigem?: string | null;
    inseminador?: string | null;
    ecc?: number | null;
    operacaoId?: string | null;
  };
};

export type MotivoInseminacao = MotivoOperacional | "nao_encontrado" | "animal_invalido" | "conflito" | "invalido";
export type RecusaInseminacao = { ok: false; motivo: MotivoInseminacao; mensagem?: string };
export type SucessoInseminacao = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  movimentacaoId: number;
  repetida: boolean;
};

function recusa(motivo: MotivoInseminacao, mensagem?: string): RecusaInseminacao {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

class RecusaDentroDaInseminacao extends Error {
  constructor(readonly resultado: RecusaInseminacao) {
    super(resultado.mensagem ?? resultado.motivo);
    this.name = "RecusaDentroDaInseminacao";
  }
}

export function normalizarOperacaoInseminacao(valor: unknown): string | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  return UUID_OPERACAO.test(texto) ? texto : null;
}

export function textoMovimentoInseminacao(animalId: number, registroId: number): string {
  return `Inseminação — matriz #${animalId} · registro repro #${registroId}`;
}

export function hashConteudoInseminacao(entrada: PedidoInseminacao["input"], dataISO: string): string {
  const texto = [
    entrada.fazendaId ?? "",
    TIPO_INSEMINACAO,
    dataISO,
    entrada.animalId,
    entrada.machoId ?? "",
    entrada.semenPartidaId,
    SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO,
    entrada.custoDoseSemen ?? "",
    (entrada.centralOrigem ?? "").trim(),
    (entrada.inseminador ?? "").trim(),
    entrada.ecc ?? "",
    (entrada.reprodutorSemen ?? "").trim(),
    (entrada.resultado ?? "").trim(),
    (entrada.descricaoResultadoOutro ?? "").trim(),
    (entrada.responsavel ?? "").trim(),
    (entrada.observacoes ?? "").trim(),
    (entrada.dataPrevistoParto ?? "").trim().slice(0, 10),
  ].join("|");
  return createHash("sha256").update(texto).digest("hex");
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
      if (erro instanceof AnimalMudouDuranteInseminacao || erro instanceof InseminacaoAindaPendente || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  throw new ConflitoInseminacaoSemen();
}

function mudou(antes: AnimalInseminacaoLinha, depois: AnimalInseminacaoLinha): boolean {
  return antes.loteId !== depois.loteId
    || antes.pastoId !== depois.pastoId
    || antes.fazendaId !== depois.fazendaId
    || antes.status !== depois.status
    || antes.sexo !== depois.sexo
    || Boolean(antes.castrado) !== Boolean(depois.castrado);
}

function idsOrdenados(valores: Array<number | null | undefined>): number[] {
  return [...new Set(valores.filter((id): id is number => id != null))].sort((a, b) => a - b);
}

function dataCoberturaValida(valor: string): { ok: true; dataISO: string } | { ok: false; message: string } {
  const dataISO = valor.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return { ok: false, message: MSG_REPRO_DATA_INVALIDA };
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (dataISO > hojeISO) return { ok: false, message: MSG_REPRO_DATA_FUTURA };
  return { ok: true, dataISO };
}

async function travar(
  tx: ConsultaInseminacao,
  io: IoInseminacao,
  pedido: PedidoInseminacao,
  ids: number[],
  fazendasExtras: number[],
): Promise<{ titularUserId: number; executorUserId: number; animais: Map<number, AnimalInseminacaoLinha> } | RecusaInseminacao> {
  const vistos = new Map<number, AnimalInseminacaoLinha>();
  for (const id of ids) {
    const linha = await tx.espiar(id);
    if (!linha) {
      return recusa("nao_encontrado", id === pedido.input.animalId ? MSG_ANIMAL_MANEJO_AUSENTE : MSG_REPRODUTOR_AUSENTE);
    }
    vistos.set(id, linha);
  }
  for (const loteId of idsOrdenados([...vistos.values()].map((linha) => linha.loteId))) {
    await tx.lote(loteId);
  }
  const principal = vistos.get(pedido.input.animalId)!;
  if (principal.fazendaId == null) return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  const fazendas = idsOrdenados([principal.fazendaId, ...fazendasExtras]);
  let executorUserId = 0;
  let titularUserId = 0;
  for (const fazendaId of fazendas) {
    const decisao = await autorizarOperacaoPersistida(tx, {
      ...pedido,
      permissaoId: PERMISSAO_REPRODUCAO,
      fazendaId,
    });
    if (!decisao.ok) {
      if (decisao.motivo === "sem_fazenda") return recusa(decisao.motivo, MSG_SEM_FAZENDA_MANEJO);
      return recusa(decisao.motivo);
    }
    executorUserId = decisao.contexto.executorUserId;
    titularUserId = decisao.contexto.titularUserId;
  }
  await io.aposIdentidade?.();
  for (const pastoId of idsOrdenados([...vistos.values()].map((linha) => linha.pastoId))) {
    await tx.pasto(pastoId);
  }
  const travados = new Map<number, AnimalInseminacaoLinha>();
  for (const id of idsOrdenados(ids)) {
    const linha = await tx.animal(id, titularUserId);
    if (!linha) {
      return recusa("nao_encontrado", id === pedido.input.animalId ? MSG_ANIMAL_MANEJO_AUSENTE : MSG_REPRODUTOR_AUSENTE);
    }
    travados.set(id, linha);
  }
  for (const [id, antes] of vistos) {
    if (mudou(antes, travados.get(id)!)) throw new AnimalMudouDuranteInseminacao();
  }
  return { titularUserId, executorUserId, animais: travados };
}

function custoSnapshot(valor: string | number | null): number | null {
  const numero = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

async function inseminarNaTransacao(
  tx: ConsultaInseminacao,
  io: IoInseminacao,
  pedido: PedidoInseminacao,
  dataISO: string,
  operacaoId: string,
): Promise<SucessoInseminacao | RecusaInseminacao> {
  const previa = await tx.espiarPartida(pedido.input.semenPartidaId);
  if (!previa) return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  const machoId = pedido.input.machoId != null && pedido.input.machoId > 0
    ? pedido.input.machoId
    : null;
  if (machoId === pedido.input.animalId) return recusa("animal_invalido", MSG_REPRO_MACHO_IGUAL_MATRIZ);
  const trava = await travar(
    tx,
    io,
    pedido,
    machoId == null ? [pedido.input.animalId] : [pedido.input.animalId, machoId],
    [previa.fazendaId],
  );
  if ("ok" in trava) return trava;
  const animal = trava.animais.get(pedido.input.animalId)!;
  if (animal.fazendaId !== pedido.input.fazendaId) {
    return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  }
  const elegibilidade = buildReproAnimalElegibilidadeInput(animal);
  if (!isReproTipoPermitidoParaAnimal(elegibilidade, TIPO_INSEMINACAO)) {
    return recusa("animal_invalido", mensagemReproInelegivelAnimal(elegibilidade));
  }
  const resultadoTipo = validateReproResultadoForSave({
    sexo: animal.sexo,
    tipo: TIPO_INSEMINACAO,
    resultado: pedido.input.resultado,
    descricaoResultadoOutro: pedido.input.descricaoResultadoOutro,
  });
  if (!resultadoTipo.ok) return recusa("animal_invalido", resultadoTipo.message);
  if (pedido.input.ecc != null) {
    const ecc = validateReproEcc(pedido.input.ecc);
    if (!ecc.ok) return recusa("animal_invalido", ecc.message);
  }
  const baixa = await tx.baixaAtiva(animal.id);
  const manejo = avaliarManejoVsBaixa({
    status: animal.status,
    dataBaixa: baixa?.dataBaixa,
    dataEvento: dataISO,
  });
  if (!manejo.permitido) return recusa("animal_invalido", manejo.mensagem);
  const origem = resolveOrigemSemenInseminacao({
    tipo: TIPO_INSEMINACAO,
    sexoAnimal: animal.sexo,
    machoId,
    reprodutorSemen: pedido.input.reprodutorSemen,
  });
  if (origem == null) return recusa("animal_invalido", MSG_REPRO_INELEGIVEL);
  const custoInformado = assertCustoDoseInseminacaoCreate(origem, pedido.input.custoDoseSemen);
  if (!custoInformado.ok) return recusa("animal_invalido", custoInformado.message);
  if (origem === SEMEN_ORIGEM_INTERNO) {
    const touro = machoId == null ? null : trava.animais.get(machoId);
    if (!touro) return recusa("nao_encontrado", MSG_REPRODUTOR_AUSENTE);
    if (touro.sexo !== "macho") return recusa("animal_invalido", MSG_REPRO_MACHO_NAO_E_MACHO);
    if (touro.fazendaId !== animal.fazendaId) return recusa("animal_invalido", MSG_REPRODUTOR_OUTRA_FAZENDA);
    const touroElegivel = buildReproAnimalElegibilidadeInput(touro);
    if (isMachoBloqueadoReproPorCastracao(touroElegivel)) {
      return recusa("animal_invalido", MSG_REPRO_MACHO_CASTRADO_REPRODUTOR);
    }
    if (!isMachoReprodutivamenteMaduro(touroElegivel)) {
      return recusa("animal_invalido", MSG_REPRO_INELEGIVEL);
    }
    const baixaTouro = await tx.baixaAtiva(touro.id);
    const manejoTouro = avaliarManejoVsBaixa({
      status: touro.status,
      dataBaixa: baixaTouro?.dataBaixa,
      dataEvento: dataISO,
    });
    if (!manejoTouro.permitido) return recusa("animal_invalido", manejoTouro.mensagem);
  }
  const partida = await tx.travarPartida(previa.id, trava.titularUserId);
  if (!partida) return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  if (partida.fazendaId !== animal.fazendaId) {
    return recusa("animal_invalido", MSG_SEMEN_PARTIDA_INCOMPATIVEL);
  }
  const compativel = validateSemenPartidaReprodutorCompat({
    origem,
    partidaMachoId: partida.machoId,
    partidaReprodutorKey: partida.reprodutorKey,
    machoId: origem === SEMEN_ORIGEM_INTERNO ? machoId : null,
    reprodutorTexto: origem === SEMEN_ORIGEM_EXTERNO ? pedido.input.reprodutorSemen : null,
  });
  if (!compativel) return recusa("animal_invalido", MSG_SEMEN_PARTIDA_INCOMPATIVEL);
  const reserva = await tx.reservarOperacao({
    userId: trava.titularUserId,
    chave: operacaoId,
    fazendaId: animal.fazendaId!,
    executorUserId: trava.executorUserId,
    conteudoHash: hashConteudoInseminacao(pedido.input, dataISO),
  });
  if (reserva.situacao === "divergente") return recusa("invalido", MSG_OPERACAO_IA_DIVERGENTE);
  if (reserva.situacao === "repetida") {
    const movimentacaoId = await tx.movimentoDaInseminacao(trava.titularUserId, reserva.registroPrincipalId, animal.id);
    if (movimentacaoId == null) throw new InseminacaoAindaPendente();
    return {
      ok: true,
      id: reserva.registroPrincipalId,
      userId: trava.titularUserId,
      executorUserId: trava.executorUserId,
      movimentacaoId,
      repetida: true,
    };
  }
  let saida: ReturnType<typeof applySemenSaidaIa>;
  try {
    saida = applySemenSaidaIa({
      saldoAnterior: Number(partida.saldoDoses),
      custoUnitario: partida.custoUnitario,
      quantidadeSaida: SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : MSG_SEMEN_SEM_DOSES;
    throw new RecusaDentroDaInseminacao(recusa("animal_invalido", mensagem));
  }
  const custo = custoSnapshot(partida.custoUnitario);
  const observacoes = packReproObservacoes(
    pedido.input.observacoes,
    pedido.input.reprodutorSemen,
    pedido.input.responsavel,
    pedido.input.descricaoResultadoOutro,
    null,
    {
      partidaSemen: partida.partida,
      inseminador: pedido.input.inseminador,
      ecc: pedido.input.ecc,
      semenPartidaId: partida.id,
      custoDoseSemen: custo,
      centralOrigem: partida.centralOrigem ?? pedido.input.centralOrigem,
    },
  );
  const id = await tx.inserirReproducao({
    userId: trava.titularUserId,
    femeaId: animal.id,
    machoId: origem === SEMEN_ORIGEM_INTERNO && machoId != null ? machoId : undefined,
    tipo: TIPO_INSEMINACAO,
    dataCobertura: dataCivilParaColunaDate(dataISO),
    dataPrevistoParto: pedido.input.dataPrevistoParto
      ? dataCivilParaColunaDate(pedido.input.dataPrevistoParto)
      : undefined,
    resultado: pedido.input.resultado?.trim() || undefined,
    observacoes,
  });
  await io.aposHistorico?.();
  const movimentacaoId = await tx.inserirMovimento({
    partidaId: partida.id,
    userId: trava.titularUserId,
    fazendaId: animal.fazendaId!,
    tipo: SEMEN_MOV_TIPO_SAIDA_IA,
    dataEntrada: dataISO,
    quantidadeDoses: SEMEN_UTILIZADO_IA_DOSES_POR_REGISTRO,
    custoTotal: custo != null ? custo.toFixed(2) : "0.00",
    custoUnitario: String(partida.custoUnitario ?? "0"),
    observacoes: textoMovimentoInseminacao(animal.id, id),
  });
  await tx.atualizarPartida(partida.id, {
    saldoDoses: saida.novoSaldo,
    custoUnitario: saida.novoCustoUnitario,
    status: saida.status,
  });
  await io.aposRegistro?.();
  await tx.concluirOperacao({
    userId: trava.titularUserId,
    chave: operacaoId,
    registroPrincipalId: id,
  });
  return {
    ok: true,
    id,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
    movimentacaoId,
    repetida: false,
  };
}

export async function lancarInseminacaoSemenAutorizado(
  io: IoInseminacao,
  pedido: PedidoInseminacao,
): Promise<SucessoInseminacao | RecusaInseminacao> {
  const fazendaId = pedido.input.fazendaId;
  if (fazendaId == null || !Number.isFinite(fazendaId) || fazendaId <= 0) {
    return recusa("animal_invalido", MSG_REPRO_FAZENDA_OBRIGATORIA);
  }
  if (pedido.input.tipo.trim() !== TIPO_INSEMINACAO) {
    return recusa("animal_invalido", MSG_REPRO_GENERICO);
  }
  if (!Number.isInteger(pedido.input.semenPartidaId) || pedido.input.semenPartidaId <= 0) {
    return recusa("nao_encontrado", MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  }
  const data = dataCoberturaValida(pedido.input.dataCobertura);
  if (!data.ok) return recusa("animal_invalido", data.message);
  const operacaoId = normalizarOperacaoInseminacao(pedido.input.operacaoId);
  if (!operacaoId) return recusa("invalido", MSG_OPERACAO_IA_OBRIGATORIA);
  try {
    return await repetir(() => io.emTransacao((tx) => inseminarNaTransacao(tx, io, pedido, data.dataISO, operacaoId)));
  } catch (erro) {
    if (erro instanceof RecusaDentroDaInseminacao) return erro.resultado;
    if (erro instanceof ConflitoInseminacaoSemen) return recusa("conflito", erro.message);
    throw erro;
  }
}

export async function lancarInseminacaoSemenEEspelhar(
  io: IoInseminacao,
  pedido: PedidoInseminacao,
  espelho: {
    inseminar(userId: number, dados: {
      femeaId: number;
      machoId?: number;
      tipo: string;
      dataCobertura: string;
      dataPrevistoParto?: string;
      resultado?: string;
      observacoes?: string;
    }): Promise<void>;
  },
): Promise<SucessoInseminacao | RecusaInseminacao> {
  const resultado = await lancarInseminacaoSemenAutorizado(io, pedido);
  if (!resultado.ok || resultado.repetida) return resultado;
  try {
    await espelho.inseminar(resultado.userId, {
      femeaId: pedido.input.animalId,
      machoId: pedido.input.machoId ?? undefined,
      tipo: TIPO_INSEMINACAO,
      dataCobertura: pedido.input.dataCobertura.trim().slice(0, 10),
      dataPrevistoParto: pedido.input.dataPrevistoParto ?? undefined,
      resultado: pedido.input.resultado ?? undefined,
    });
  } catch (erro) {
    console.warn("[reproducao.create] espelho fora", erro);
  }
  return resultado;
}

export function erroInseminacaoSemen(resultado: RecusaInseminacao): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_REPRODUCAO });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_ANIMAL_MANEJO_AUSENTE });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_INSEMINACAO });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_REPRO_GENERICO });
  }
}
