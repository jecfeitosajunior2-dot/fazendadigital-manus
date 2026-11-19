import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa } from "../shared/animalBaixa";
import {
  hojeISODateLocal,
  MSG_DESMAMA_DUPLICADA,
  MSG_DESMAMA_GENERICO,
  observacaoAoVincularPesagemDesmama,
  observacaoPesagemDesmama,
  resolverDataNascimentoDesmama,
  resolverPesagemDesmama,
  toISODateOnly,
  validarAnimalParaDesmama,
  validarDesmamaInput,
  type PesagemDesmamaRow,
} from "../shared/desmamaManejo";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * A pesagem e a desmama usam a mesma permissão do catálogo.
 * Não existe uma permissão só de desmama. A desmama grava ou reaproveita uma pesagem.
 */
export const PERMISSAO_PESAGEM = "pesagens.criar";

export const MSG_ANIMAL_PESAGEM_AUSENTE = "Animal não encontrado.";
export const MSG_PESO_INVALIDO = "Informe um peso válido maior que zero.";
export const MSG_PESAGEM_DATA_INVALIDA = "Data da pesagem inválida.";
export const MSG_PESAGEM_DATA_FUTURA = "A data da pesagem não pode ser futura.";
export const MSG_SEM_PERMISSAO_PESAGEM = "Sem permissão para registrar a pesagem.";
export const MSG_SEM_PERMISSAO_DESMAMA = "Sem permissão para registrar a desmama.";
export const MSG_SEM_FAZENDA_PESAGEM = "Sem acesso à fazenda deste animal.";
export const MSG_FAZENDA_ANIMAL_AUSENTE = "O animal não está em uma fazenda.";
export const MSG_CONFLITO_PESAGEM = "A gravação encontrou outra operação ao mesmo tempo. Tente novamente.";
export const MSG_PESAGEM_GENERICO = "Não foi possível registrar a pesagem.";

const TENTATIVAS = 3;

export const ORDEM_BLOQUEIO_PESAGEM = [
  "espiar o animal, sem trava",
  "lote atual, se houver",
  "identidade, permissão, vínculos e fazenda do animal",
  "pasto atual, se houver",
  "animal",
  "baixa ativa, se houver",
  "pesagem e atualização do peso",
] as const;

export class AnimalMudouDurantePesagem extends Error {
  constructor() {
    super("O animal mudou durante a pesagem.");
    this.name = "AnimalMudouDurantePesagem";
  }
}

export class ConflitoPesagemAnimal extends Error {
  constructor() {
    super(MSG_CONFLITO_PESAGEM);
    this.name = "ConflitoPesagemAnimal";
  }
}

export class DesmamaDuplicada extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesmamaDuplicada";
  }
}

export type AnimalPesagemLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
  dataDesmama: string | null;
  dataNascimento: string | null;
  pesoAtual: string | null;
  categoria: string | null;
};

export type NovaPesagem = {
  userId: number;
  animalId: number;
  peso: string;
  data: string;
  observacoes: string | null;
};

export type AtualizacaoDesmama = {
  dataDesmama: string;
  dataNascimento?: string;
  pesoAtual?: string;
};

export type ConsultaPesagemAnimal = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  pasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  espiar(id: number): Promise<AnimalPesagemLinha | null>;
  animal(id: number, titularUserId: number): Promise<AnimalPesagemLinha | null>;
  baixaAtiva(animalId: number): Promise<{ dataBaixa: string | null } | null>;
  eventosDesmama(animalId: number, titularUserId: number): Promise<Array<{ tipo: string | null }>>;
  pesagensDoAnimal(animalId: number, titularUserId: number): Promise<PesagemDesmamaRow[]>;
  inserirPesagem(row: NovaPesagem): Promise<number>;
  atualizarPeso(id: number, titularUserId: number, peso: string): Promise<boolean>;
  atualizarDesmama(id: number, titularUserId: number, patch: AtualizacaoDesmama): Promise<boolean>;
  atualizarObservacaoPesagem(id: number, animalId: number, titularUserId: number, observacoes: string): Promise<void>;
};

export type IoPesagemAnimal = {
  emTransacao<T>(fn: (tx: ConsultaPesagemAnimal) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposRegistro?: () => Promise<void>;
};

export type PedidoPesagem = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: {
    animalId: number;
    peso: string;
    data: string;
    observacoes?: string | null;
  };
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type PedidoDesmama = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: {
    fazendaId: number;
    animalId: number;
    dataDesmama: string;
    pesoKg?: string | null;
    observacoes?: string | null;
    idadeMeses?: number | null;
  };
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type MotivoPesagem =
  | MotivoOperacional
  | "nao_encontrado"
  | "peso_invalido"
  | "data_invalida"
  | "manejo_bloqueado"
  | "desmama_recusada"
  | "duplicada"
  | "conflito";

export type RecusaPesagem = { ok: false; motivo: MotivoPesagem; mensagem?: string };

export type SucessoPesagem = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  peso: string;
  espelho: { animalId: number; peso: string; data: string; observacoes?: string };
};

export type EspelhoDesmama = {
  animalId: number;
  dataDesmama: string;
  dataNascimento: string | null;
  pesoAtual: string | null;
  novaPesagem: { animalId: number; peso: string; data: string; observacoes?: string } | null;
  pesagemObservacao: { id: number; observacoes: string } | null;
};

export type SucessoDesmama = {
  ok: true;
  userId: number;
  executorUserId: number;
  pesagemCriada: boolean;
  pesagemReutilizada: boolean;
  pesagemVinculada: boolean;
  espelho: EspelhoDesmama;
};

function recusa(motivo: MotivoPesagem, mensagem?: string): RecusaPesagem {
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
      if (erro instanceof AnimalMudouDurantePesagem || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  if (ultimo instanceof AnimalMudouDurantePesagem || ehDeadlock(ultimo)) throw new ConflitoPesagemAnimal();
  throw ultimo;
}

function validarPesoData(peso: string, data: string, hojeISO: string): { ok: true; peso: string; dataISO: string } | RecusaPesagem {
  const dataISO = String(data ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return recusa("data_invalida", MSG_PESAGEM_DATA_INVALIDA);
  if (dataISO > hojeISO) return recusa("data_invalida", MSG_PESAGEM_DATA_FUTURA);
  const texto = String(peso ?? "").trim();
  if (!texto) return recusa("peso_invalido", MSG_PESO_INVALIDO);
  let normalizado = texto;
  if (texto.includes(",")) normalizado = texto.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero <= 0) return recusa("peso_invalido", MSG_PESO_INVALIDO);
  return { ok: true, peso: (Math.round(numero * 100) / 100).toFixed(2), dataISO };
}

async function sessaoInvalida(tx: ConsultaPesagemAnimal, executorId: number): Promise<boolean> {
  const usuario = await tx.usuario(executorId);
  return !usuario || usuario.titularUserId == null || usuario.situacao !== "ativo";
}

async function preparar(
  tx: ConsultaPesagemAnimal,
  io: IoPesagemAnimal,
  pedido: PedidoPesagem | PedidoDesmama,
  animalId: number,
): Promise<{ ok: true; animal: AnimalPesagemLinha; titularUserId: number; executorUserId: number } | RecusaPesagem> {
  const foto = await tx.espiar(animalId);
  if (foto?.loteId != null) await tx.lote(foto.loteId);
  if (!foto) {
    if (await sessaoInvalida(tx, pedido.executorId)) return recusa("sem_identidade");
    return recusa("nao_encontrado", MSG_ANIMAL_PESAGEM_AUSENTE);
  }
  if (foto.fazendaId == null) {
    if (await sessaoInvalida(tx, pedido.executorId)) return recusa("sem_identidade");
    return recusa("fazenda_ausente", MSG_FAZENDA_ANIMAL_AUSENTE);
  }
  const deciso = await autorizarOperacaoPersistida(tx, {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_PESAGEM,
    fazendaId: foto.fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) {
    if (deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente") {
      return recusa(deciso.motivo, MSG_ANIMAL_PESAGEM_AUSENTE);
    }
    if (deciso.motivo === "sem_fazenda") return recusa(deciso.motivo, MSG_SEM_FAZENDA_PESAGEM);
    return recusa(deciso.motivo);
  }
  if (foto.userId !== deciso.contexto.titularUserId) return recusa("nao_encontrado", MSG_ANIMAL_PESAGEM_AUSENTE);
  if (io.aposIdentidade) await io.aposIdentidade();
  if (foto.pastoId != null) await tx.pasto(foto.pastoId);
  const animal = await tx.animal(animalId, deciso.contexto.titularUserId);
  if (!animal) return recusa("nao_encontrado", MSG_ANIMAL_PESAGEM_AUSENTE);
  if (
    animal.loteId !== foto.loteId
    || animal.pastoId !== foto.pastoId
    || animal.fazendaId !== foto.fazendaId
    || animal.status !== foto.status
  ) {
    throw new AnimalMudouDurantePesagem();
  }
  return {
    ok: true,
    animal,
    titularUserId: deciso.contexto.titularUserId,
    executorUserId: deciso.contexto.executorUserId,
  };
}

export function erroPesagem(resultado: RecusaPesagem): TRPCError {
  return erroComum(resultado, MSG_SEM_PERMISSAO_PESAGEM, MSG_PESAGEM_GENERICO);
}

export function erroDesmama(resultado: RecusaPesagem): TRPCError {
  return erroComum(resultado, MSG_SEM_PERMISSAO_DESMAMA, MSG_DESMAMA_GENERICO);
}

function erroComum(resultado: RecusaPesagem, semPermissao: string, generico: string): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_PESAGEM });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_ANIMAL_PESAGEM_AUSENTE });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_PESAGEM });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? generico });
  }
}

export async function pesarAnimalAutorizado(
  io: IoPesagemAnimal,
  pedido: PedidoPesagem,
): Promise<SucessoPesagem | RecusaPesagem> {
  const previa = validarPesoData(pedido.input.peso, pedido.input.data, hojeISODateLocal());
  if (!previa.ok) return previa;
  return repetir(() => io.emTransacao((tx) => pesarNaTransacao(tx, io, pedido, previa.peso, previa.dataISO)));
}

async function pesarNaTransacao(
  tx: ConsultaPesagemAnimal,
  io: IoPesagemAnimal,
  pedido: PedidoPesagem,
  peso: string,
  dataISO: string,
): Promise<SucessoPesagem | RecusaPesagem> {
  const preparado = await preparar(tx, io, pedido, pedido.input.animalId);
  if (!preparado.ok) return preparado;
  const { animal, titularUserId, executorUserId } = preparado;
  const baixa = await tx.baixaAtiva(animal.id);
  const avaliacao = avaliarManejoVsBaixa({
    status: animal.status,
    dataBaixa: baixa?.dataBaixa ?? null,
    dataEvento: dataISO,
  });
  if (!avaliacao.permitido) return recusa("manejo_bloqueado", avaliacao.mensagem);
  const observacoes = pedido.input.observacoes?.trim() || null;
  const id = await tx.inserirPesagem({
    userId: titularUserId,
    animalId: animal.id,
    peso,
    data: dataISO,
    observacoes,
  });
  const gravou = await tx.atualizarPeso(animal.id, titularUserId, peso);
  if (!gravou) throw new Error("Falha ao gravar a pesagem.");
  if (io.aposRegistro) await io.aposRegistro();
  return {
    ok: true,
    id,
    userId: titularUserId,
    executorUserId,
    peso,
    espelho: {
      animalId: animal.id,
      peso,
      data: dataISO,
      ...(observacoes ? { observacoes } : {}),
    },
  };
}

export async function desmamarAnimalAutorizado(
  io: IoPesagemAnimal,
  pedido: PedidoDesmama,
): Promise<SucessoDesmama | RecusaPesagem> {
  const campos = validarDesmamaInput({
    fazendaId: pedido.input.fazendaId,
    animalId: pedido.input.animalId,
    dataDesmama: pedido.input.dataDesmama,
    pesoKg: pedido.input.pesoKg,
  });
  if (!campos.ok) return recusa("desmama_recusada", campos.message);
  try {
    return await repetir(() => io.emTransacao((tx) => desmamarNaTransacao(tx, io, pedido, campos.dataISO, campos.peso)));
  } catch (erro) {
    if (erro instanceof DesmamaDuplicada) return recusa("duplicada", erro.message);
    throw erro;
  }
}

async function desmamarNaTransacao(
  tx: ConsultaPesagemAnimal,
  io: IoPesagemAnimal,
  pedido: PedidoDesmama,
  dataISO: string,
  pesoInformado?: string,
): Promise<SucessoDesmama | RecusaPesagem> {
  const preparado = await preparar(tx, io, pedido, pedido.input.animalId);
  if (!preparado.ok) return preparado;
  const { animal, titularUserId, executorUserId } = preparado;
  if (animal.fazendaId == null || animal.fazendaId !== pedido.input.fazendaId) {
    return recusa("desmama_recusada", "O animal não pertence à Fazenda selecionada.");
  }
  const eventos = await tx.eventosDesmama(animal.id, titularUserId);
  const nascimento = resolverDataNascimentoDesmama({
    dataNascimento: animal.dataNascimento,
    idadeMesesInformada: pedido.input.idadeMeses,
    dataEvento: dataISO,
  });
  const elegivel = validarAnimalParaDesmama({
    status: animal.status,
    dataDesmama: animal.dataDesmama,
    dataNascimento: nascimento ?? animal.dataNascimento,
    categoria: animal.categoria,
    registrosEvento: eventos,
    fazendaAnimalId: animal.fazendaId,
    fazendaSelecionadaId: pedido.input.fazendaId,
  }, dataISO);
  if (!elegivel.ok) return recusa("desmama_recusada", elegivel.message);
  const historico = await tx.pesagensDoAnimal(animal.id, titularUserId);
  const resolucao = resolverPesagemDesmama({ dataISO, pesoInformado, historico });
  const observacoes = pedido.input.observacoes?.trim() || undefined;
  const dataNascimentoPersistir = !toISODateOnly(animal.dataNascimento) && nascimento ? nascimento : undefined;
  let pesagemVinculada = false;
  let obsVinculo: string | null = null;
  if (resolucao.pesagemIdVincular != null) {
    const row = historico.find((item) => item.id === resolucao.pesagemIdVincular);
    obsVinculo = observacaoAoVincularPesagemDesmama(row?.observacoes, observacoes);
    pesagemVinculada = obsVinculo !== (row?.observacoes ?? "").trim();
  }
  const patch: AtualizacaoDesmama = { dataDesmama: dataISO };
  if (dataNascimentoPersistir) patch.dataNascimento = dataNascimentoPersistir;
  if (resolucao.criarPesagem && resolucao.peso) patch.pesoAtual = resolucao.peso;
  const gravou = await tx.atualizarDesmama(animal.id, titularUserId, patch);
  if (!gravou) throw new DesmamaDuplicada(MSG_DESMAMA_DUPLICADA);
  let novaPesagem: EspelhoDesmama["novaPesagem"] = null;
  let pesagemObservacao: EspelhoDesmama["pesagemObservacao"] = null;
  if (resolucao.criarPesagem && resolucao.peso) {
    const texto = observacaoPesagemDesmama(observacoes) ?? null;
    await tx.inserirPesagem({
      userId: titularUserId,
      animalId: animal.id,
      peso: resolucao.peso,
      data: dataISO,
      observacoes: texto,
    });
    novaPesagem = {
      animalId: animal.id,
      peso: resolucao.peso,
      data: dataISO,
      ...(texto ? { observacoes: texto } : {}),
    };
  } else if (resolucao.pesagemIdVincular != null && obsVinculo != null && pesagemVinculada) {
    await tx.atualizarObservacaoPesagem(resolucao.pesagemIdVincular, animal.id, titularUserId, obsVinculo);
    pesagemObservacao = { id: resolucao.pesagemIdVincular, observacoes: obsVinculo };
  }
  if (io.aposRegistro) await io.aposRegistro();
  return {
    ok: true,
    userId: titularUserId,
    executorUserId,
    pesagemCriada: resolucao.criarPesagem,
    pesagemReutilizada: resolucao.pesagemReutilizada,
    pesagemVinculada: pesagemVinculada || (resolucao.pesagemIdVincular != null && !resolucao.criarPesagem),
    espelho: {
      animalId: animal.id,
      dataDesmama: dataISO,
      dataNascimento: dataNascimentoPersistir ?? null,
      pesoAtual: resolucao.criarPesagem && resolucao.peso ? resolucao.peso : null,
      novaPesagem,
      pesagemObservacao,
    },
  };
}

export async function pesarEEspelharAnimal(
  io: IoPesagemAnimal,
  pedido: PedidoPesagem,
  espelho: { pesar(userId: number, dados: SucessoPesagem["espelho"]): Promise<void> },
): Promise<SucessoPesagem | RecusaPesagem> {
  const resultado = await pesarAnimalAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.pesar(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[pesagens.create] Espelho local não gravado:", erro);
  }
  return resultado;
}

export async function desmamarEEspelharAnimal(
  io: IoPesagemAnimal,
  pedido: PedidoDesmama,
  espelho: { desmamar(userId: number, dados: EspelhoDesmama): Promise<void> },
): Promise<SucessoDesmama | RecusaPesagem> {
  const resultado = await desmamarAnimalAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.desmamar(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[animais.registrarDesmama] Espelho local não gravado:", erro);
  }
  return resultado;
}
