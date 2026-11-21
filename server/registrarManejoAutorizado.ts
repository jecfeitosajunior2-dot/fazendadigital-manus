/**
 * Castração e registro reprodutivo de um só animal.
 * A rota deixa de chamar o serviço antigo nesses dois caminhos.
 * A inseminação com uma matriz e consumo de sêmen tem caminho próprio.
 * O parto com crias e a estação ou cobertura em grupo têm caminho próprio.
 */
import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa } from "../shared/animalBaixa";
import {
  MSG_CASTRACAO_DUPLICADA,
  MSG_CASTRACAO_GENERICO,
  jaPossuiCastracaoRegistrada,
  montarPersistenciaCastracao,
  validarAnimalParaCastracao,
  validarCastracaoInput,
  type MetodoCastracao,
} from "../shared/castracaoManejo";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoBloqueadoReproPorCastracao,
  isReproTipoPermitidoParaAnimal,
  mensagemReproInelegivelAnimal,
} from "../shared/reproElegibilidade";
import { isMachoEventoComAlvoMatrizes } from "./reproducaoCreateInput";
import { packReproObservacoes, validateReproResultadoForSave } from "../shared/reproRegistroMeta";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

export const PERMISSAO_CASTRACAO = "saude.criar";
export const PERMISSAO_REPRODUCAO = "reproducao.criar";
export const ORDEM_BLOQUEIO_MANEJO =
  "espiar; lotes em ordem; identidade e permissão; pasto; animais em ordem; baixa ativa; histórico";

export const MSG_SEM_PERMISSAO_CASTRACAO =
  "Você não tem permissão para registrar castração ou lançamento de saúde.";
export const MSG_SEM_PERMISSAO_REPRODUCAO =
  "Você não tem permissão para registrar reprodução.";
export const MSG_SEM_FAZENDA_MANEJO = "Você não tem acesso a esta fazenda.";
export const MSG_ANIMAL_MANEJO_AUSENTE = "Animal não encontrado.";
export const MSG_FAZENDA_ANIMAL_DIVERGENTE = "O animal não pertence à Fazenda selecionada.";
export const MSG_REPRODUTOR_AUSENTE = "Reprodutor não encontrado.";
export const MSG_REPRODUTOR_OUTRA_FAZENDA = "O reprodutor não pertence à mesma fazenda.";
export const MSG_REPRO_FAZENDA_OBRIGATORIA = "Selecione uma Fazenda.";
export const MSG_REPRO_DATA_INVALIDA = "Data do manejo reprodutivo inválida.";
export const MSG_REPRO_DATA_FUTURA = "A data do manejo reprodutivo não pode ser futura.";
export const MSG_REPRO_TIPO = "Informe o tipo do manejo reprodutivo.";
export const MSG_REPRO_GENERICO = "Não foi possível registrar o manejo reprodutivo.";
export const MSG_CONFLITO_MANEJO =
  "A gravação encontrou outra operação ao mesmo tempo. Tente novamente.";

const TENTATIVAS = 3;

export class ConflitoManejoAnimal extends Error {
  constructor() {
    super(MSG_CONFLITO_MANEJO);
    this.name = "ConflitoManejoAnimal";
  }
}

class AnimalMudouDuranteManejo extends Error {}
class CastracaoDuplicada extends Error {}

export type AnimalManejoLinha = {
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

export type ConsultaManejo = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  pasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  espiar(id: number): Promise<AnimalManejoLinha | null>;
  animal(id: number, titularUserId: number): Promise<AnimalManejoLinha | null>;
  baixaAtiva(animalId: number): Promise<{ dataBaixa: string | null } | null>;
  tiposSaude(animalId: number, titularUserId: number): Promise<Array<{ tipo: string | null }>>;
  inserirSaude(row: {
    userId: number;
    animalId: number;
    tipo: string;
    descricao?: string;
    medicamento?: string;
    veterinario?: string;
    dataRegistro: string;
    observacoes?: string;
  }): Promise<number>;
  marcarCastrado(id: number, titularUserId: number): Promise<boolean>;
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
};

export type IoManejo = {
  emTransacao<T>(fn: (tx: ConsultaManejo) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposRegistro?: () => Promise<void>;
};

type PedidoBase = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  executorNome?: string | null;
};

export type PedidoCastracao = PedidoBase & {
  input: {
    fazendaId: number;
    animalId: number;
    dataCastracao: string;
    metodo: MetodoCastracao;
    descricaoMetodo?: string | null;
    observacoes?: string | null;
  };
};

export type PedidoReproducaoSimples = PedidoBase & {
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
  };
};

export type MotivoManejo =
  | MotivoOperacional
  | "nao_encontrado"
  | "animal_invalido"
  | "duplicada"
  | "conflito"
  | "caminho_matriz";

export type RecusaManejo = { ok: false; motivo: MotivoManejo; mensagem?: string };
export type SucessoManejo = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
};

function dataCoberturaValida(valor: string): { ok: true; dataISO: string } | { ok: false; message: string } {
  const dataISO = valor.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return { ok: false, message: MSG_REPRO_DATA_INVALIDA };
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (dataISO > hojeISO) return { ok: false, message: MSG_REPRO_DATA_FUTURA };
  return { ok: true, dataISO };
}

function recusa(motivo: MotivoManejo, mensagem?: string): RecusaManejo {
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
      if (erro instanceof AnimalMudouDuranteManejo || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  throw new ConflitoManejoAnimal();
}

function mudou(antes: AnimalManejoLinha, depois: AnimalManejoLinha): boolean {
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

async function travar(
  tx: ConsultaManejo,
  io: IoManejo,
  pedido: PedidoBase,
  ids: number[],
  permissaoId: string,
): Promise<{ titularUserId: number; executorUserId: number; animais: Map<number, AnimalManejoLinha> } | RecusaManejo> {
  const vistos = new Map<number, AnimalManejoLinha>();
  for (const id of ids) {
    const linha = await tx.espiar(id);
    if (!linha) return recusa("nao_encontrado", MSG_ANIMAL_MANEJO_AUSENTE);
    vistos.set(id, linha);
  }
  for (const loteId of idsOrdenados([...vistos.values()].map((linha) => linha.loteId))) {
    await tx.lote(loteId);
  }
  const principal = vistos.get(ids[0])!;
  if (principal.fazendaId == null) return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  const decisao = await autorizarOperacaoPersistida(tx, {
    ...pedido,
    permissaoId,
    fazendaId: principal.fazendaId,
  });
  if (!decisao.ok) {
    if (decisao.motivo === "sem_fazenda") return recusa(decisao.motivo, MSG_SEM_FAZENDA_MANEJO);
    return recusa(decisao.motivo);
  }
  await io.aposIdentidade?.();
  for (const pastoId of idsOrdenados([...vistos.values()].map((linha) => linha.pastoId))) {
    await tx.pasto(pastoId);
  }
  const travados = new Map<number, AnimalManejoLinha>();
  for (const id of idsOrdenados(ids)) {
    const linha = await tx.animal(id, decisao.contexto.titularUserId);
    if (!linha) return recusa("nao_encontrado", MSG_ANIMAL_MANEJO_AUSENTE);
    travados.set(id, linha);
  }
  for (const [id, antes] of vistos) {
    if (mudou(antes, travados.get(id)!)) throw new AnimalMudouDuranteManejo();
  }
  return {
    titularUserId: decisao.contexto.titularUserId,
    executorUserId: decisao.contexto.executorUserId,
    animais: travados,
  };
}

function erroComum(resultado: RecusaManejo, semPermissao: string, generico: string): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_ANIMAL_MANEJO_AUSENTE });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_MANEJO });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? generico });
  }
}

export function erroCastracao(resultado: RecusaManejo): TRPCError {
  return erroComum(resultado, MSG_SEM_PERMISSAO_CASTRACAO, MSG_CASTRACAO_GENERICO);
}

export function erroReproducaoSimples(resultado: RecusaManejo): TRPCError {
  return erroComum(resultado, MSG_SEM_PERMISSAO_REPRODUCAO, MSG_REPRO_GENERICO);
}

async function castrarNaTransacao(
  tx: ConsultaManejo,
  io: IoManejo,
  pedido: PedidoCastracao,
  dataISO: string,
): Promise<SucessoManejo | RecusaManejo> {
  const trava = await travar(tx, io, pedido, [pedido.input.animalId], PERMISSAO_CASTRACAO);
  if ("ok" in trava) return trava;
  const animal = trava.animais.get(pedido.input.animalId)!;
  if (animal.fazendaId !== pedido.input.fazendaId) {
    return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  }
  const elegivel = validarAnimalParaCastracao({
    sexo: animal.sexo,
    status: animal.status,
    castrado: animal.castrado,
  });
  if (!elegivel.ok) return recusa("animal_invalido", elegivel.message);
  const historico = await tx.tiposSaude(animal.id, trava.titularUserId);
  if (jaPossuiCastracaoRegistrada(historico)) return recusa("duplicada", MSG_CASTRACAO_DUPLICADA);
  const persist = montarPersistenciaCastracao(pedido.input);
  const veterinario = pedido.executorNome?.trim() || undefined;
  const id = await tx.inserirSaude({
    userId: trava.titularUserId,
    animalId: animal.id,
    tipo: persist.tipo,
    descricao: persist.descricao,
    medicamento: persist.medicamento,
    veterinario,
    dataRegistro: dataCivilParaColunaDate(dataISO),
    observacoes: persist.observacoes,
  });
  const marcou = await tx.marcarCastrado(animal.id, trava.titularUserId);
  if (!marcou) throw new CastracaoDuplicada();
  await io.aposRegistro?.();
  return { ok: true, id, userId: trava.titularUserId, executorUserId: trava.executorUserId };
}

export async function castrarAnimalAutorizado(
  io: IoManejo,
  pedido: PedidoCastracao,
): Promise<SucessoManejo | RecusaManejo> {
  const campos = validarCastracaoInput(pedido.input);
  if (!campos.ok) return recusa("animal_invalido", campos.message);
  const dataISO = pedido.input.dataCastracao.trim().slice(0, 10);
  try {
    return await repetir(() => io.emTransacao((tx) => castrarNaTransacao(tx, io, pedido, dataISO)));
  } catch (erro) {
    if (erro instanceof CastracaoDuplicada) return recusa("duplicada", MSG_CASTRACAO_DUPLICADA);
    if (erro instanceof ConflitoManejoAnimal) return recusa("conflito", erro.message);
    throw erro;
  }
}

export async function castrarEEspelharAnimal(
  io: IoManejo,
  pedido: PedidoCastracao,
  espelho: {
    castrar(userId: number, dados: {
      animalId: number;
      tipo: string;
      descricao?: string;
      medicamento?: string;
      veterinario?: string;
      dataRegistro: string;
      observacoes?: string;
    }): Promise<void>;
  },
): Promise<SucessoManejo | RecusaManejo> {
  const resultado = await castrarAnimalAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  const persist = montarPersistenciaCastracao(pedido.input);
  try {
    await espelho.castrar(resultado.userId, {
      animalId: pedido.input.animalId,
      tipo: persist.tipo,
      descricao: persist.descricao,
      medicamento: persist.medicamento,
      veterinario: pedido.executorNome?.trim() || undefined,
      dataRegistro: pedido.input.dataCastracao.trim().slice(0, 10),
      observacoes: persist.observacoes,
    });
  } catch (erro) {
    console.warn("[saude.registrarCastracao] espelho fora", erro);
  }
  return resultado;
}

async function reproduzirNaTransacao(
  tx: ConsultaManejo,
  io: IoManejo,
  pedido: PedidoReproducaoSimples,
  dataISO: string,
): Promise<SucessoManejo | RecusaManejo> {
  const machoId = pedido.input.machoId != null && pedido.input.machoId > 0
    && pedido.input.machoId !== pedido.input.animalId
    ? pedido.input.machoId
    : null;
  const trava = await travar(
    tx,
    io,
    pedido,
    machoId == null ? [pedido.input.animalId] : [pedido.input.animalId, machoId],
    PERMISSAO_REPRODUCAO,
  );
  if ("ok" in trava) return trava;
  const animal = trava.animais.get(pedido.input.animalId)!;
  if (animal.fazendaId !== pedido.input.fazendaId) {
    return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  }
  if (isMachoEventoComAlvoMatrizes(pedido.input.tipo, animal.sexo)) {
    return recusa("caminho_matriz");
  }
  const elegibilidade = buildReproAnimalElegibilidadeInput(animal);
  if (!isReproTipoPermitidoParaAnimal(elegibilidade, pedido.input.tipo)) {
    return recusa("animal_invalido", mensagemReproInelegivelAnimal(elegibilidade));
  }
  const resultadoTipo = validateReproResultadoForSave({
    sexo: animal.sexo,
    tipo: pedido.input.tipo,
    resultado: pedido.input.resultado,
    descricaoResultadoOutro: pedido.input.descricaoResultadoOutro,
  });
  if (!resultadoTipo.ok) return recusa("animal_invalido", resultadoTipo.message);
  const baixa = await tx.baixaAtiva(animal.id);
  const manejo = avaliarManejoVsBaixa({
    status: animal.status,
    dataBaixa: baixa?.dataBaixa,
    dataEvento: dataISO,
  });
  if (!manejo.permitido) return recusa("animal_invalido", manejo.mensagem);
  if (machoId != null) {
    const macho = trava.animais.get(machoId);
    if (!macho) return recusa("nao_encontrado", MSG_REPRODUTOR_AUSENTE);
    if (macho.fazendaId !== animal.fazendaId) return recusa("animal_invalido", MSG_REPRODUTOR_OUTRA_FAZENDA);
    const machoElegivel = buildReproAnimalElegibilidadeInput(macho);
    if (isMachoBloqueadoReproPorCastracao(machoElegivel)) {
      return recusa("animal_invalido", mensagemReproInelegivelAnimal(machoElegivel));
    }
    const baixaMacho = await tx.baixaAtiva(macho.id);
    const manejoMacho = avaliarManejoVsBaixa({
      status: macho.status,
      dataBaixa: baixaMacho?.dataBaixa,
      dataEvento: dataISO,
    });
    if (!manejoMacho.permitido) return recusa("animal_invalido", manejoMacho.mensagem);
  }
  const observacoes = packReproObservacoes(
    pedido.input.observacoes,
    pedido.input.reprodutorSemen,
    pedido.input.responsavel,
    pedido.input.descricaoResultadoOutro,
  ) ?? undefined;
  const id = await tx.inserirReproducao({
    userId: trava.titularUserId,
    femeaId: animal.id,
    machoId: machoId ?? undefined,
    tipo: pedido.input.tipo.trim(),
    dataCobertura: dataCivilParaColunaDate(dataISO),
    dataPrevistoParto: pedido.input.dataPrevistoParto
      ? dataCivilParaColunaDate(pedido.input.dataPrevistoParto)
      : undefined,
    resultado: pedido.input.resultado?.trim() || undefined,
    observacoes,
  });
  await io.aposRegistro?.();
  return { ok: true, id, userId: trava.titularUserId, executorUserId: trava.executorUserId };
}

export async function registrarReproducaoSimplesAutorizado(
  io: IoManejo,
  pedido: PedidoReproducaoSimples,
): Promise<SucessoManejo | RecusaManejo> {
  const fazendaId = pedido.input.fazendaId;
  if (fazendaId == null || !Number.isFinite(fazendaId) || fazendaId <= 0) {
    return recusa("animal_invalido", MSG_REPRO_FAZENDA_OBRIGATORIA);
  }
  if (!pedido.input.tipo.trim()) return recusa("animal_invalido", MSG_REPRO_TIPO);
  const data = dataCoberturaValida(pedido.input.dataCobertura);
  if (!data.ok) return recusa("animal_invalido", data.message);
  try {
    return await repetir(() => io.emTransacao((tx) => reproduzirNaTransacao(tx, io, pedido, data.dataISO)));
  } catch (erro) {
    if (erro instanceof ConflitoManejoAnimal) return recusa("conflito", erro.message);
    throw erro;
  }
}

export async function registrarReproducaoSimplesEEspelhar(
  io: IoManejo,
  pedido: PedidoReproducaoSimples,
  espelho: {
    reproduzir(userId: number, dados: {
      femeaId: number;
      machoId?: number;
      tipo: string;
      dataCobertura: string;
      dataPrevistoParto?: string;
      resultado?: string;
      observacoes?: string;
    }): Promise<void>;
  },
): Promise<SucessoManejo | RecusaManejo> {
  const resultado = await registrarReproducaoSimplesAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.reproduzir(resultado.userId, {
      femeaId: pedido.input.animalId,
      machoId: pedido.input.machoId ?? undefined,
      tipo: pedido.input.tipo.trim(),
      dataCobertura: pedido.input.dataCobertura.trim().slice(0, 10),
      dataPrevistoParto: pedido.input.dataPrevistoParto ?? undefined,
      resultado: pedido.input.resultado ?? undefined,
      observacoes: packReproObservacoes(
        pedido.input.observacoes,
        pedido.input.reprodutorSemen,
        pedido.input.responsavel,
        pedido.input.descricaoResultadoOutro,
      ) ?? undefined,
    });
  } catch (erro) {
    console.warn("[reproducao.create] espelho fora", erro);
  }
  return resultado;
}
