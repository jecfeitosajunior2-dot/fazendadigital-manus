/**
 * Estação de monta e cobertura realizada com várias matrizes.
 *
 * O modelo real é um registro do touro e uma cópia na ficha de cada matriz.
 * A estação vira "Exposição à monta". A cobertura vira "Cobertura".
 * Não há data de término nem mais de um touro no mesmo lançamento.
 * Não consome sêmen. A inseminação com dose continua individual.
 * animais.criar não é exigida. reproducao.criar cobre o lançamento e as cópias.
 *
 * Cada operação coletiva traz um UUID. A mesma chave do titular, com o mesmo
 * conteúdo, devolve o resultado original. Outro manejo no mesmo dia usa outra chave.
 * A chave e o evento do touro entram na mesma transação.
 *
 * Matriz incompatível recusa o lançamento inteiro, como a validação antiga.
 * Matriz que já tem o mesmo touro, tipo e dia é ignorada no lote.
 * Uma matriz só, no modo individual, recusa com a mensagem de duplicata.
 * A substituição anula a cópia anterior e grava outra, sem apagar histórico.
 *
 * Ordem: espiar; lotes em ordem; identidade e fazenda; pastos; animais em ordem;
 * histórico reprodutivo; operação.
 */
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa } from "../shared/animalBaixa";
import {
  MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO,
  MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS,
  MSG_REPRO_LOTE_INELEGIVEL,
  MSG_REPRO_MATRIZ_INELEGIVEL,
  type CoberturaAlvoPersistido,
  type CoberturaSelecaoModo,
} from "../shared/reproCoberturaAlvo";
import {
  buildReproAnimalElegibilidadeInput,
  isFemeaReprodutivamenteMadura,
  isReproTipoPermitidoParaAnimal,
  mensagemReproInelegivelAnimal,
} from "../shared/reproElegibilidade";
import {
  filterMatrizesSemEspelhoDuplicado,
  formatMsgMatrizJaRegistradaNesteTouro,
  type ReproEspelhoDuplicataRegistroRef,
} from "../shared/reproEspelhoDuplicata";
import { packReproObservacoes, validateReproResultadoForSave } from "../shared/reproRegistroMeta";
import { anularReproObservacoesPersistidas, findRegistroEspelhoDuplicadoAtivoId } from "../shared/reproEspelhoSubstituicao";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import {
  MSG_FAZENDA_ANIMAL_DIVERGENTE,
  MSG_REPRO_DATA_FUTURA,
  MSG_REPRO_DATA_INVALIDA,
  MSG_REPRO_FAZENDA_OBRIGATORIA,
  MSG_SEM_FAZENDA_MANEJO,
  MSG_SEM_PERMISSAO_REPRODUCAO,
} from "./registrarManejoAutorizado";

export const PERMISSAO_COLETIVA = "reproducao.criar";
export const ORDEM_BLOQUEIO_COLETIVA =
  "espiar; lotes em ordem; identidade e fazenda; pastos; animais em ordem; histórico reprodutivo; operação";

export const MSG_INSEMINACAO_COLETIVA =
  "A inseminação com sêmen é individual. Registre uma matriz por vez. Nenhuma dose foi consumida.";
export const MSG_COLETIVA_SOMENTE =
  "O lançamento em grupo vale para estação de monta ou cobertura realizada.";
export const MSG_REPRODUTOR_COLETIVO_AUSENTE = "Selecione um animal válido.";
export const MSG_OPERACAO_OBRIGATORIA =
  "Este lançamento em grupo precisa de uma identificação da operação. Atualize a tela e tente de novo. Nada foi gravado.";
export const MSG_OPERACAO_DIVERGENTE =
  "Esta operação já foi registrada com outros dados. Nada foi alterado.";

const UUID_OPERACAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TENTATIVAS = 3;

export type AnimalColetivoLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  sexo: string | null;
  categoria: string | null;
  status: string | null;
  dataNascimento: string | Date | null;
  castrado: boolean | number | null;
  brinco: string | null;
  nome: string | null;
};

export type LoteColetivoLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  pastoAtualId: number | null;
  ativo: boolean | number | null;
  nome: string | null;
};

export type RegistroColetivoLinha = ReproEspelhoDuplicataRegistroRef & {
  id: number;
  resultado?: string | null;
};

export type RegistroColetivoEspelho = {
  femeaId: number;
  machoId: number;
  tipo: string;
  dataCobertura: string;
  resultado?: string;
  observacoes?: string;
};

export type ConsultaColetiva = ConsultaAutorizacaoPersistida & {
  espiarAnimal(id: number): Promise<AnimalColetivoLinha | null>;
  travaLote(id: number): Promise<LoteColetivoLinha | null>;
  travaPasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  travaAnimal(id: number): Promise<AnimalColetivoLinha | null>;
  baixaAtiva(userId: number, animalId: number): Promise<{ dataBaixa: string | Date | null } | null>;
  travaRegistros(userId: number, femeaIds: number[]): Promise<RegistroColetivoLinha[]>;
  inserirRegistro(row: RegistroColetivoEspelho & { userId: number }): Promise<number>;
  atualizarObservacoes(id: number, userId: number, observacoes: string): Promise<void>;
  reservarOperacao(row: {
    userId: number;
    chave: string;
    fazendaId: number;
    executorUserId: number;
    conteudoHash: string;
  }): Promise<ReservaOperacao>;
  concluirOperacao(row: {
    userId: number;
    chave: string;
    registroPrincipalId: number;
    espelhosMatriz: number;
    matrizesIgnoradas: number;
  }): Promise<void>;
  aposTravas?: () => Promise<void>;
  aposPrincipal?: () => Promise<void>;
  aposEspelho?: (indice: number) => Promise<void>;
};

export type IoColetiva = {
  emTransacao<T>(fn: (tx: ConsultaColetiva) => Promise<T>): Promise<T>;
};

export type PedidoColetivo = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  input: {
    animalId: number;
    fazendaId?: number | null;
    tipo: string;
    dataCobertura: string;
    resultado?: string | null;
    reprodutorSemen?: string | null;
    descricaoResultadoOutro?: string | null;
    responsavel?: string | null;
    observacoes?: string | null;
    semenPartidaId?: number | null;
    coberturaSelecaoModo?: CoberturaSelecaoModo | null;
    coberturaMatrizIds?: number[] | null;
    coberturaLoteId?: number | null;
    substituirEspelhosMatrizIds?: number[] | null;
    operacaoId?: string | null;
  };
};

export type ReservaOperacao =
  | { situacao: "nova" }
  | { situacao: "repetida"; registroPrincipalId: number; espelhosMatriz: number; matrizesIgnoradas: number }
  | { situacao: "divergente" };

export type RecusaColetiva = { ok: false; motivo: MotivoOperacional | "nao_encontrado" | "invalido"; mensagem: string };
export type ColetivaOk = {
  ok: true;
  titularUserId: number;
  id: number;
  espelhosMatriz: number;
  matrizesIgnoradas: number;
  repetida: boolean;
  principal: RegistroColetivoEspelho;
  copias: RegistroColetivoEspelho[];
};

export function normalizarOperacaoId(valor: string | null | undefined): string | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  return UUID_OPERACAO.test(texto) ? texto : null;
}

export function hashConteudoColetivo(entrada: {
  fazendaId: number;
  tipo: string;
  dataCobertura: string;
  animalId: number;
  modo: string;
  loteId: number | null;
  matrizIds: readonly number[];
  substituirIds: readonly number[];
  resultado: string | null;
  responsavel: string | null;
  observacoes: string | null;
  descricaoResultadoOutro: string | null;
}): string {
  const texto = [
    entrada.fazendaId,
    entrada.tipo.trim(),
    entrada.dataCobertura.slice(0, 10),
    entrada.animalId,
    entrada.modo,
    entrada.loteId ?? "",
    [...entrada.matrizIds].sort((a, b) => a - b).join(","),
    [...entrada.substituirIds].sort((a, b) => a - b).join(","),
    (entrada.resultado ?? "").trim(),
    (entrada.responsavel ?? "").trim(),
    (entrada.observacoes ?? "").trim(),
    (entrada.descricaoResultadoOutro ?? "").trim(),
  ].join("|");
  return createHash("sha256").update(texto).digest("hex");
}

class ContextoColetivoMudou extends Error {}

function recusa(motivo: RecusaColetiva["motivo"], mensagem: string): RecusaColetiva {
  return { ok: false, motivo, mensagem };
}

function idsPositivos(valores: Array<number | null | undefined>): number[] {
  return [...new Set(valores.filter((id): id is number => id != null && id > 0))].sort((a, b) => a - b);
}

function bancoIndisponivel(error: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !vistos(visto, atual)) {
    const item = atual as { code?: string; message?: string; cause?: unknown };
    const code = String(item.code ?? "");
    if (["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].includes(code)) return true;
    if (/banco de dados indisponível/i.test(String(item.message ?? ""))) return true;
    atual = item.cause;
  }
  return false;
}

function vistos(visto: Set<unknown>, atual: object): boolean {
  if (visto.has(atual)) return true;
  visto.add(atual);
  return false;
}

function ehDeadlock(error: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; code?: string; message?: string; cause?: unknown };
    if (item.errno === 1213 || item.code === "ER_LOCK_DEADLOCK") return true;
    if (/deadlock found when trying to get lock/i.test(String(item.message ?? ""))) return true;
    atual = item.cause;
  }
  return false;
}

export function erroReproducaoColetiva(resultado: RecusaColetiva): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: resultado.mensagem });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "invalido":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem });
    default:
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem });
  }
}

function validarData(valor: string): { ok: true; dataISO: string } | { ok: false; message: string } {
  const dataISO = String(valor).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return { ok: false, message: MSG_REPRO_DATA_INVALIDA };
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (dataISO > hojeISO) return { ok: false, message: MSG_REPRO_DATA_FUTURA };
  return { ok: true, dataISO };
}

function tipoEspelhoDe(tipo: string): "Cobertura" | "Exposição à monta" | null {
  if (tipo === "Cobertura realizada") return "Cobertura";
  if (tipo === "Estação de monta") return "Exposição à monta";
  return null;
}

function rotulo(animal: { id: number; brinco?: string | null; nome?: string | null }): string {
  return animal.brinco?.trim() || animal.nome?.trim() || String(animal.id);
}

function naFazenda(
  animal: { fazendaId: number | null; loteId: number | null },
  fazendaId: number,
  loteFazenda: Map<number, number | null>,
): boolean {
  if (animal.fazendaId != null && Number(animal.fazendaId) === fazendaId) return true;
  if (animal.loteId != null) return loteFazenda.get(Number(animal.loteId)) === fazendaId;
  return false;
}

function fazendaDoLote(lote: LoteColetivoLinha, pastoFazenda: Map<number, number>): number | null {
  if (lote.fazendaId != null) return Number(lote.fazendaId);
  if (lote.pastoAtualId != null) return pastoFazenda.get(Number(lote.pastoAtualId)) ?? null;
  return null;
}

function mesmoContexto(antes: AnimalColetivoLinha, depois: AnimalColetivoLinha): boolean {
  return antes.fazendaId === depois.fazendaId
    && antes.loteId === depois.loteId
    && antes.pastoId === depois.pastoId
    && antes.status === depois.status;
}

async function executar<T>(trabalho: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    try {
      return await trabalho();
    } catch (error) {
      ultimo = error;
      if (error instanceof TRPCError) throw error;
      if ((error instanceof ContextoColetivoMudou || ehDeadlock(error)) && tentativa < TENTATIVAS - 1) continue;
      if (bancoIndisponivel(error)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      }
      throw error;
    }
  }
  throw ultimo;
}

export async function registrarReproducaoColetivaAutorizada(
  io: IoColetiva,
  pedido: PedidoColetivo,
): Promise<ColetivaOk | RecusaColetiva> {
  const tipo = pedido.input.tipo.trim();
  if (tipo === "Inseminação" && pedido.input.semenPartidaId != null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_INSEMINACAO_COLETIVA });
  }
  if (tipo !== "Estação de monta" && tipo !== "Cobertura realizada") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_COLETIVA_SOMENTE });
  }
  const fazendaId = pedido.input.fazendaId;
  if (fazendaId == null || !Number.isFinite(fazendaId) || fazendaId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_FAZENDA_OBRIGATORIA });
  }
  const data = validarData(pedido.input.dataCobertura);
  if (!data.ok) throw new TRPCError({ code: "BAD_REQUEST", message: data.message });
  const resultado = validateReproResultadoForSave({
    sexo: "macho",
    tipo,
    resultado: pedido.input.resultado,
    descricaoResultadoOutro: pedido.input.descricaoResultadoOutro,
  });
  if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.message });
  if (!normalizarOperacaoId(pedido.input.operacaoId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_OPERACAO_OBRIGATORIA });
  }

  return executar(() => io.emTransacao((tx) => gravar(tx, pedido, tipo, fazendaId, data.dataISO)));
}

async function gravar(
  tx: ConsultaColetiva,
  pedido: PedidoColetivo,
  tipo: string,
  fazendaId: number,
  dataISO: string,
): Promise<ColetivaOk | RecusaColetiva> {
  const modo: CoberturaSelecaoModo | null = tipo === "Estação de monta"
    ? "lote"
    : pedido.input.coberturaSelecaoModo ?? null;
  if (!modo) return recusa("invalido", MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO);
  if (modo === "lote" && (pedido.input.coberturaLoteId == null || pedido.input.coberturaLoteId <= 0)) {
    return recusa("invalido", MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO);
  }
  const matrizIds = idsPositivos(pedido.input.coberturaMatrizIds ?? []);
  if (matrizIds.length === 0) return recusa("invalido", MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS);

  const touroEspiado = await tx.espiarAnimal(pedido.input.animalId);
  if (!touroEspiado) return recusa("nao_encontrado", MSG_REPRODUTOR_COLETIVO_AUSENTE);
  const espiados = new Map<number, AnimalColetivoLinha>([[touroEspiado.id, touroEspiado]]);
  for (const id of matrizIds) {
    const matriz = await tx.espiarAnimal(id);
    if (matriz) espiados.set(matriz.id, matriz);
  }

  const loteIds = idsPositivos([
    touroEspiado.loteId,
    modo === "lote" ? pedido.input.coberturaLoteId : null,
    ...[...espiados.values()].map((animal) => animal.loteId),
  ]);
  const lotePorId = new Map<number, LoteColetivoLinha>();
  for (const loteId of loteIds) {
    const lote = await tx.travaLote(loteId);
    if (lote) lotePorId.set(lote.id, lote);
  }

  const authPedido: PedidoAutorizacaoPersistida = {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_COLETIVA,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  };
  const auth = await autorizarOperacaoPersistida(tx, authPedido);
  if (!auth.ok) {
    if (auth.motivo === "sem_fazenda") return recusa("sem_fazenda", MSG_SEM_FAZENDA_MANEJO);
    if (auth.motivo === "sem_permissao" || auth.motivo === "reservado_ao_principal") {
      return recusa(auth.motivo, MSG_SEM_PERMISSAO_REPRODUCAO);
    }
    if (auth.motivo === "sem_identidade") return recusa("sem_identidade", "Sessão inválida.");
    return recusa("nao_encontrado", MSG_REPRODUTOR_COLETIVO_AUSENTE);
  }
  const titular = auth.contexto.titularUserId;
  if (touroEspiado.userId !== titular) return recusa("nao_encontrado", MSG_REPRODUTOR_COLETIVO_AUSENTE);

  const pastoIds = idsPositivos([
    ...[...lotePorId.values()].map((lote) => lote.pastoAtualId),
    ...[...espiados.values()].map((animal) => animal.pastoId),
  ]);
  const pastoFazenda = new Map<number, number>();
  for (const pastoId of pastoIds) {
    const pasto = await tx.travaPasto(pastoId);
    if (pasto?.fazendaId != null && pasto.userId === titular) pastoFazenda.set(pasto.id, Number(pasto.fazendaId));
  }
  const loteFazenda = new Map<number, number | null>();
  for (const lote of lotePorId.values()) {
    if (lote.userId !== titular) continue;
    loteFazenda.set(lote.id, fazendaDoLote(lote, pastoFazenda));
  }

  const animalPorId = new Map<number, AnimalColetivoLinha>();
  for (const id of idsPositivos([pedido.input.animalId, ...matrizIds])) {
    const animal = await tx.travaAnimal(id);
    if (animal) animalPorId.set(animal.id, animal);
  }
  for (const [id, antes] of espiados) {
    const depois = animalPorId.get(id);
    if (!depois || !mesmoContexto(antes, depois)) throw new ContextoColetivoMudou();
  }

  const touro = animalPorId.get(pedido.input.animalId);
  if (!touro || touro.userId !== titular) return recusa("nao_encontrado", MSG_REPRODUTOR_COLETIVO_AUSENTE);
  if (!naFazenda(touro, fazendaId, loteFazenda)) return recusa("invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  if (touro.sexo !== "macho") return recusa("invalido", MSG_COLETIVA_SOMENTE);
  const elegTouro = buildReproAnimalElegibilidadeInput(touro);
  if (!isReproTipoPermitidoParaAnimal(elegTouro, tipo)) {
    return recusa("invalido", mensagemReproInelegivelAnimal(elegTouro));
  }
  const baixaTouro = await tx.baixaAtiva(titular, touro.id);
  const manejoTouro = avaliarManejoVsBaixa({ status: touro.status, dataBaixa: baixaTouro?.dataBaixa, dataEvento: dataISO });
  if (!manejoTouro.permitido) return recusa("invalido", manejoTouro.mensagem);

  let loteContexto: { id: number; nome: string } | null = null;
  if (modo === "lote") {
    const loteId = pedido.input.coberturaLoteId;
    const lote = loteId != null ? lotePorId.get(loteId) : undefined;
    if (!lote || lote.userId !== titular || lote.ativo === false || lote.ativo === 0) {
      return recusa("invalido", MSG_REPRO_LOTE_INELEGIVEL);
    }
    if (fazendaDoLote(lote, pastoFazenda) !== fazendaId) return recusa("invalido", MSG_REPRO_LOTE_INELEGIVEL);
    loteContexto = { id: lote.id, nome: lote.nome?.trim() || `Lote #${lote.id}` };
  }

  const labels: string[] = [];
  for (const matrizId of matrizIds) {
    const matriz = animalPorId.get(matrizId);
    if (!matriz || matriz.userId !== titular) return recusa("nao_encontrado", MSG_REPRO_MATRIZ_INELEGIVEL);
    if (!naFazenda(matriz, fazendaId, loteFazenda)) return recusa("invalido", MSG_REPRO_MATRIZ_INELEGIVEL);
    const baixa = await tx.baixaAtiva(titular, matriz.id);
    const manejo = avaliarManejoVsBaixa({ status: matriz.status, dataBaixa: baixa?.dataBaixa, dataEvento: dataISO });
    if (!manejo.permitido) return recusa("invalido", manejo.mensagem);
    const paraElegibilidade = manejo.permitido && matriz.status !== "ativo"
      ? { ...matriz, status: "ativo" }
      : matriz;
    if (paraElegibilidade.sexo !== "femea" || !isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(paraElegibilidade))) {
      return recusa("invalido", MSG_REPRO_MATRIZ_INELEGIVEL);
    }
    if (loteContexto && matriz.loteId !== loteContexto.id) return recusa("invalido", MSG_REPRO_MATRIZ_INELEGIVEL);
    labels.push(rotulo(matriz));
  }

  const registros = await tx.travaRegistros(titular, idsPositivos([touro.id, ...matrizIds]));
  const tipoEspelho = tipoEspelhoDe(tipo)!;
  const filtradas = filterMatrizesSemEspelhoDuplicado(registros, matrizIds, touro.id, tipoEspelho, dataISO);
  const substituir = new Set((pedido.input.substituirEspelhosMatrizIds ?? []).filter((id) => matrizIds.includes(id)));
  if (modo === "individual" && matrizIds.length === 1 && filtradas.ignoradas.includes(matrizIds[0]!) && !substituir.has(matrizIds[0]!)) {
    return recusa("invalido", formatMsgMatrizJaRegistradaNesteTouro(labels[0] ?? String(matrizIds[0])));
  }
  const gravarIds = [
    ...filtradas.elegiveis,
    ...filtradas.ignoradas.filter((id) => substituir.has(id)),
  ];
  const ignoradas = filtradas.ignoradas.filter((id) => !substituir.has(id));
  const chave = normalizarOperacaoId(pedido.input.operacaoId)!;
  const conteudoHash = hashConteudoColetivo({
    fazendaId,
    tipo,
    dataCobertura: dataISO,
    animalId: touro.id,
    modo,
    loteId: loteContexto?.id ?? null,
    matrizIds,
    substituirIds: [...substituir],
    resultado: pedido.input.resultado ?? null,
    responsavel: pedido.input.responsavel ?? null,
    observacoes: pedido.input.observacoes ?? null,
    descricaoResultadoOutro: pedido.input.descricaoResultadoOutro ?? null,
  });
  const reserva = await tx.reservarOperacao({
    userId: titular,
    chave,
    fazendaId,
    executorUserId: pedido.executorId,
    conteudoHash,
  });
  if (reserva.situacao === "divergente") return recusa("invalido", MSG_OPERACAO_DIVERGENTE);
  if (reserva.situacao === "repetida") {
    return {
      ok: true,
      titularUserId: titular,
      id: reserva.registroPrincipalId,
      espelhosMatriz: reserva.espelhosMatriz,
      matrizesIgnoradas: reserva.matrizesIgnoradas,
      repetida: true,
      principal: { femeaId: touro.id, machoId: touro.id, tipo, dataCobertura: dataISO },
      copias: [],
    };
  }

  if (tx.aposTravas) await tx.aposTravas();

  const alvo: CoberturaAlvoPersistido = {
    selectionMode: modo,
    animalIds: matrizIds,
    labelsBrinco: labels,
    ...(loteContexto ? { loteId: loteContexto.id, labelLoteNome: loteContexto.nome } : {}),
  };
  const observacoesPrincipal = packReproObservacoes(
    pedido.input.observacoes,
    undefined,
    pedido.input.responsavel,
    pedido.input.descricaoResultadoOutro,
    alvo,
  ) ?? undefined;
  const principal: RegistroColetivoEspelho = {
    femeaId: touro.id,
    machoId: touro.id,
    tipo,
    dataCobertura: dataISO,
    resultado: pedido.input.resultado ?? undefined,
    observacoes: observacoesPrincipal,
  };
  const id = await tx.inserirRegistro({ ...principal, userId: titular });
  if (tx.aposPrincipal) await tx.aposPrincipal();

  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  for (const matrizId of substituir) {
    const registroId = findRegistroEspelhoDuplicadoAtivoId(registros, matrizId, touro.id, tipoEspelho, dataISO);
    if (registroId == null) continue;
    const row = registros.find((item) => item.id === registroId);
    await tx.atualizarObservacoes(registroId, titular, anularReproObservacoesPersistidas(row?.observacoes, {
      substituidoPorRegistroId: id,
      anuladoEmISO: hojeISO,
    }));
  }

  const copias: RegistroColetivoEspelho[] = [];
  for (let indice = 0; indice < gravarIds.length; indice++) {
    const matrizId = gravarIds[indice]!;
    const copia: RegistroColetivoEspelho = {
      femeaId: matrizId,
      machoId: touro.id,
      tipo: tipoEspelho,
      dataCobertura: dataISO,
      resultado: "Realizado",
      observacoes: packReproObservacoes(undefined, rotulo(touro), undefined, undefined, undefined, {
        registroOrigemId: id,
        espelhoAutomatico: true,
      }) ?? undefined,
    };
    await tx.inserirRegistro({ ...copia, userId: titular });
    copias.push(copia);
    if (tx.aposEspelho) await tx.aposEspelho(indice);
  }

  await tx.concluirOperacao({
    userId: titular,
    chave,
    registroPrincipalId: id,
    espelhosMatriz: copias.length,
    matrizesIgnoradas: ignoradas.length,
  });

  return {
    ok: true,
    titularUserId: titular,
    id,
    espelhosMatriz: copias.length,
    matrizesIgnoradas: ignoradas.length,
    repetida: false,
    principal,
    copias,
  };
}
