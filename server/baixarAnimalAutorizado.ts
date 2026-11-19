import { TRPCError } from "@trpc/server";
import { hojeISODate, MSG_BAIXA_ANIMAL_INATIVO, MSG_BAIXA_FAZENDA_DIVERGENTE, MSG_BAIXA_GENERICO, mensagemSaidaDuplicada, validarBaixaAnimalInput, type TipoBaixaAnimal } from "../shared/animalBaixa";
import { MSG_ANIMAL_EXCLUSAO_BLOQUEADA } from "../shared/animalExclusao";
import { autorizarOperacaoPersistida, type ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * O catálogo já junta as duas ações: "Excluir animal ou registrar baixa".
 * A baixa de venda não usa esta permissão. Ela continua na confirmação da venda.
 */
export const PERMISSAO_BAIXA_ANIMAL = "animais.inativar";

export const MSG_ANIMAL_BAIXA_AUSENTE = "Animal não encontrado.";
export const MSG_SEM_PERMISSAO_BAIXA = "Sem permissão para registrar a baixa do animal.";
export const MSG_SEM_PERMISSAO_EXCLUIR = "Sem permissão para excluir o animal.";
export const MSG_SEM_FAZENDA_ANIMAL = "Sem acesso à fazenda deste animal.";
export const MSG_CONFLITO_BAIXA = "A baixa encontrou outra gravação ao mesmo tempo. Tente novamente.";

/**
 * O lote entra primeiro, como nas movimentações já homologadas.
 * A edição cadastral ainda trava o animal antes da identidade.
 * Esse encontro pode gerar deadlock. A transação inteira se repete.
 * A confirmação e o cancelamento de venda não entram nesta ordem.
 */
export const ORDEM_BLOQUEIO_BAIXA_ANIMAL = [
  "lote do animal, se houver",
  "usuário, permissões, vínculos e fazenda do animal",
  "pasto do animal, se houver",
  "animal",
  "baixa ativa, se houver",
  "registro da baixa e status, ou exclusão do cadastro limpo",
] as const;

const TENTATIVAS = 3;

export class AnimalMudouDuranteBaixa extends Error {
  constructor() {
    super(MSG_CONFLITO_BAIXA);
    this.name = "AnimalMudouDuranteBaixa";
  }
}

export class ConflitoBaixaAnimal extends Error {
  constructor() {
    super(MSG_CONFLITO_BAIXA);
    this.name = "ConflitoBaixaAnimal";
  }
}

export class BaixaDuplicada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "BaixaDuplicada";
  }
}

export type AnimalBaixaLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
  brinco: string | null;
};

export type NovaBaixaAnimal = {
  userId: number;
  animalId: number;
  fazendaId: number;
  tipo: Exclude<TipoBaixaAnimal, "venda">;
  dataBaixa: string;
  destino: string | null;
  motivo: string | null;
  observacoes: string | null;
  usuarioNome: string | null;
};

export type ConsultaBaixaAnimal = ConsultaAutorizacaoPersistida & {
  lote(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  pasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  espiar(id: number): Promise<AnimalBaixaLinha | null>;
  animal(id: number, titularUserId: number): Promise<AnimalBaixaLinha | null>;
  baixaAtiva(animalId: number): Promise<{ id: number; vendaId: number | null } | null>;
  inserirBaixa(row: NovaBaixaAnimal): Promise<number>;
  atualizarStatus(id: number, titularUserId: number, status: string): Promise<void>;
  sincronizarStatusPasto(pastoId: number, titularUserId: number): Promise<void>;
  temRastro(animalId: number, titularUserId: number): Promise<boolean>;
  excluirAnimal(id: number, titularUserId: number): Promise<void>;
};

export type IoBaixaAnimal = {
  emTransacao<T>(fn: (tx: ConsultaBaixaAnimal) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposRegistro?: () => Promise<void>;
  aposOcupacao?: () => Promise<void>;
};

export type PedidoBaixaAnimal = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  executorNome: string;
  input: {
    fazendaId: number;
    animalId: number;
    dataBaixa: string;
    tipo: TipoBaixaAnimal;
    destino?: string | null;
    motivo?: string | null;
    observacoes?: string | null;
  };
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type PedidoExclusaoAnimal = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  animalId: number;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type MotivoBaixaAnimal =
  | MotivoOperacional
  | "nao_encontrado"
  | "animal_invalido"
  | "duplicada"
  | "venda_comercial"
  | "exclusao_bloqueada"
  | "conflito";

export type RecusaBaixaAnimal = { ok: false; motivo: MotivoBaixaAnimal; mensagem?: string };

export type SucessoBaixaAnimal = {
  ok: true;
  id: number;
  status: "morto" | "transferido";
  userId: number;
  executorUserId: number;
  espelho: {
    animalId: number;
    fazendaId: number;
    tipo: Exclude<TipoBaixaAnimal, "venda">;
    dataBaixa: string;
    destino: string | null;
    motivo: string | null;
    observacoes: string | null;
    usuarioNome: string | null;
  };
};

export type SucessoExclusaoAnimal = { ok: true; userId: number; animalId: number };

function recusa(motivo: MotivoBaixaAnimal, mensagem?: string): RecusaBaixaAnimal {
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

export function ehBaixaDuplicadaNoBanco(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const candidato = atual as { errno?: number; code?: string; message?: string; cause?: unknown };
    const texto = String(candidato.message ?? "");
    if (
      candidato.errno === 1062
      || candidato.code === "ER_DUP_ENTRY"
      || texto.includes("animal_baixas_animal_ativa_uq")
      || texto.includes("animal_baixas_animal_uq")
    ) return true;
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
      if (erro instanceof AnimalMudouDuranteBaixa || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  if (ultimo instanceof AnimalMudouDuranteBaixa || ehDeadlock(ultimo)) throw new ConflitoBaixaAnimal();
  throw ultimo;
}

async function sessaoInvalida(tx: ConsultaBaixaAnimal, executorId: number): Promise<boolean> {
  const usuario = await tx.usuario(executorId);
  return !usuario || usuario.titularUserId == null || usuario.situacao !== "ativo";
}

async function autorizarNaFazenda(
  tx: ConsultaBaixaAnimal,
  pedido: PedidoBaixaAnimal | PedidoExclusaoAnimal,
  fazendaId: number,
) {
  return autorizarOperacaoPersistida(tx, {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_BAIXA_ANIMAL,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  });
}

async function prepararAnimal(
  tx: ConsultaBaixaAnimal,
  io: IoBaixaAnimal,
  pedido: PedidoBaixaAnimal | PedidoExclusaoAnimal,
  animalId: number,
): Promise<
  | { ok: true; animal: AnimalBaixaLinha; titularUserId: number; executorUserId: number }
  | RecusaBaixaAnimal
> {
  const foto = await tx.espiar(animalId);
  if (foto?.loteId != null) await tx.lote(foto.loteId);
  if (!foto) {
    if (await sessaoInvalida(tx, pedido.executorId)) return recusa("sem_identidade");
    return recusa("nao_encontrado", MSG_ANIMAL_BAIXA_AUSENTE);
  }
  if (foto.fazendaId == null) return recusa("fazenda_ausente", MSG_BAIXA_FAZENDA_DIVERGENTE);
  const deciso = await autorizarNaFazenda(tx, pedido, foto.fazendaId);
  if (!deciso.ok) {
    if (deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente") {
      return recusa(deciso.motivo, MSG_ANIMAL_BAIXA_AUSENTE);
    }
    return recusa(deciso.motivo);
  }
  if (foto.userId !== deciso.contexto.titularUserId) return recusa("nao_encontrado", MSG_ANIMAL_BAIXA_AUSENTE);
  if (io.aposIdentidade) await io.aposIdentidade();
  if (foto.pastoId != null) await tx.pasto(foto.pastoId);
  const animal = await tx.animal(animalId, deciso.contexto.titularUserId);
  if (!animal) return recusa("nao_encontrado", MSG_ANIMAL_BAIXA_AUSENTE);
  if (
    animal.loteId !== foto.loteId
    || animal.pastoId !== foto.pastoId
    || animal.fazendaId !== foto.fazendaId
    || animal.status !== foto.status
  ) {
    throw new AnimalMudouDuranteBaixa();
  }
  return {
    ok: true,
    animal,
    titularUserId: deciso.contexto.titularUserId,
    executorUserId: deciso.contexto.executorUserId,
  };
}

export function erroBaixaAnimal(resultado: RecusaBaixaAnimal): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_BAIXA });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_ANIMAL });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_ANIMAL_BAIXA_AUSENTE });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_BAIXA });
    case "exclusao_bloqueada":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_ANIMAL_EXCLUSAO_BLOQUEADA });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_BAIXA_GENERICO });
  }
}

export function erroExclusaoAnimal(resultado: RecusaBaixaAnimal): TRPCError {
  if (resultado.motivo === "sem_permissao" || resultado.motivo === "reservado_ao_principal") {
    return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_EXCLUIR });
  }
  return erroBaixaAnimal(resultado);
}

export async function baixarAnimalAutorizado(
  io: IoBaixaAnimal,
  pedido: PedidoBaixaAnimal,
): Promise<SucessoBaixaAnimal | RecusaBaixaAnimal> {
  const previa = validarBaixaAnimalInput({
    ...pedido.input,
    hojeISO: hojeISODate(),
  });
  if (!previa.ok) {
    const motivo = pedido.input.tipo === "venda" ? "venda_comercial" : "animal_invalido";
    return recusa(motivo, previa.message);
  }
  try {
    return await repetir(() => io.emTransacao((tx) => baixarNaTransacao(tx, io, pedido, previa)));
  } catch (erro) {
    if (erro instanceof BaixaDuplicada) return recusa("duplicada", erro.message);
    throw erro;
  }
}

async function baixarNaTransacao(
  tx: ConsultaBaixaAnimal,
  io: IoBaixaAnimal,
  pedido: PedidoBaixaAnimal,
  previa: { dataISO: string; tipo: TipoBaixaAnimal; status: "vendido" | "morto" | "transferido" },
): Promise<SucessoBaixaAnimal | RecusaBaixaAnimal> {
  if (previa.tipo !== "morte" && previa.tipo !== "transferencia") {
    return recusa("venda_comercial", mensagemSaidaDuplicada("venda"));
  }
  const status = previa.tipo === "morte" ? "morto" as const : "transferido" as const;
  const preparado = await prepararAnimal(tx, io, pedido, pedido.input.animalId);
  if (!preparado.ok) return preparado;
  const { animal, titularUserId, executorUserId } = preparado;
  if (animal.fazendaId == null || animal.fazendaId !== pedido.input.fazendaId) {
    return recusa("animal_invalido", MSG_BAIXA_FAZENDA_DIVERGENTE);
  }
  if (animal.status !== "ativo") return recusa("animal_invalido", MSG_BAIXA_ANIMAL_INATIVO);
  const existente = await tx.baixaAtiva(animal.id);
  if (existente) return recusa("duplicada", mensagemSaidaDuplicada(previa.tipo));
  const tipo = previa.tipo;
  const destino = previa.tipo === "transferencia" ? pedido.input.destino?.trim() || null : null;
  const motivo = pedido.input.motivo?.trim() || null;
  const observacoes = pedido.input.observacoes?.trim() || null;
  const usuarioNome = pedido.executorNome.trim() || null;
  let id = 0;
  try {
    id = await tx.inserirBaixa({
      userId: titularUserId,
      animalId: animal.id,
      fazendaId: animal.fazendaId,
      tipo,
      dataBaixa: previa.dataISO,
      destino,
      motivo,
      observacoes,
      usuarioNome,
    });
  } catch (erro) {
    if (ehBaixaDuplicadaNoBanco(erro)) throw new BaixaDuplicada(mensagemSaidaDuplicada(tipo));
    throw erro;
  }
  await tx.atualizarStatus(animal.id, titularUserId, status);
  if (io.aposRegistro) await io.aposRegistro();
  if (animal.pastoId != null) await tx.sincronizarStatusPasto(animal.pastoId, titularUserId);
  if (io.aposOcupacao) await io.aposOcupacao();
  return {
    ok: true,
    id,
    status,
    userId: titularUserId,
    executorUserId,
    espelho: {
      animalId: animal.id,
      fazendaId: animal.fazendaId,
      tipo,
      dataBaixa: previa.dataISO,
      destino,
      motivo,
      observacoes,
      usuarioNome,
    },
  };
}

/**
 * Serviço antigo da lixeira. A rota animais.delete não chama mais esta função.
 * Permanece para revisão, quando sanidade, reprodução e compra travarem o animal.
 * Não transforma a exclusão em morte nem em transferência.
 */
export async function excluirAnimalAutorizado(
  io: IoBaixaAnimal,
  pedido: PedidoExclusaoAnimal,
): Promise<SucessoExclusaoAnimal | RecusaBaixaAnimal> {
  return repetir(() => io.emTransacao((tx) => excluirNaTransacao(tx, io, pedido)));
}

async function excluirNaTransacao(
  tx: ConsultaBaixaAnimal,
  io: IoBaixaAnimal,
  pedido: PedidoExclusaoAnimal,
): Promise<SucessoExclusaoAnimal | RecusaBaixaAnimal> {
  const preparado = await prepararAnimal(tx, io, pedido, pedido.animalId);
  if (!preparado.ok) return preparado;
  const { animal, titularUserId } = preparado;
  if (animal.status !== "ativo" || await tx.temRastro(animal.id, titularUserId)) {
    return recusa("exclusao_bloqueada", MSG_ANIMAL_EXCLUSAO_BLOQUEADA);
  }
  await tx.excluirAnimal(animal.id, titularUserId);
  if (io.aposRegistro) await io.aposRegistro();
  return { ok: true, userId: titularUserId, animalId: animal.id };
}

export async function baixarEEspelharAnimal(
  io: IoBaixaAnimal,
  pedido: PedidoBaixaAnimal,
  espelho: { baixar(userId: number, dados: SucessoBaixaAnimal["espelho"]): Promise<void> },
): Promise<SucessoBaixaAnimal | RecusaBaixaAnimal> {
  const resultado = await baixarAnimalAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.baixar(resultado.userId, resultado.espelho);
  } catch (erro) {
    console.warn("[animais.registrarBaixa] Espelho local não gravado:", erro);
  }
  return resultado;
}

export async function excluirEEspelharAnimal(
  io: IoBaixaAnimal,
  pedido: PedidoExclusaoAnimal,
  espelho: { excluir(userId: number, animalId: number): Promise<void> },
): Promise<SucessoExclusaoAnimal | RecusaBaixaAnimal> {
  const resultado = await excluirAnimalAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.excluir(resultado.userId, resultado.animalId);
  } catch (erro) {
    console.warn("[animais.delete] Espelho local não gravado:", erro);
  }
  return resultado;
}
