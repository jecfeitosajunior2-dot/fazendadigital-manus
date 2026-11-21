import { TRPCError } from "@trpc/server";
import type { ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import type { LinhaAnimalAtivo } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import { MSG_STATUS_ALTERACAO_DIRETA } from "../shared/animalBaixa";

export { MSG_STATUS_ALTERACAO_DIRETA };
import { ehBrincoDuplicadoNoMysql } from "./importacaoAnimalAutorizada";
import { findActiveBrincoConflict } from "../shared/brincoAtivo";
import { buildBrincoAtivoConflitoMessage } from "../shared/brincoAtivo";
import { MSG_PESO_ENTRADA_INVALIDO, isPesoEntradaInformadoInvalido } from "../shared/pesoEntrada";
import {
  coletarEvidenciasAlteracaoSexo,
  evidenciasVazias,
  precisaValidarAlteracaoSexo,
  validarAlteracaoSexoAnimal,
  type EvidenciasAlteracaoSexo,
  type ReproEvidenciaRow,
} from "../shared/validarAlteracaoSexoAnimal";

/** Permissão real do catálogo. */
export const PERMISSAO_EDITAR_ANIMAL = "animais.editar";

export const CAMPOS_EDICAO_CADASTRAL = [
  "nome",
  "raca",
  "categoria",
  "observacoes",
  "pelagem",
  "marca",
  "sexo",
  "dataNascimento",
  "dataEntrada",
  "dataRnd",
  "pesoEntrada",
  "produtorOrigem",
  "precoKg",
  "frete",
  "sisbov",
  "rgn",
  "rgd",
  "rastreadoNascimento",
  "pai",
  "mae",
] as const;

export const CAMPOS_EDICAO_ESTRUTURAL = [
  "fazendaId",
  "loteId",
  "pastoId",
  "status",
  "pesoAtual",
  "brinco",
  "brincoEletronico",
  "castrado",
  "dataDesmama",
  "maeId",
  "paiId",
] as const;

export const MSG_EDICAO_ESTRUTURAL =
  "Essa alteração mexe na fazenda, no lote ou no pasto. A edição cadastral não movimenta o animal.";
export const MSG_EDICAO_PESO_ATUAL =
  "O peso atual muda pela pesagem. Esta edição não altera esse peso.";
export const MSG_EDICAO_IDENTIFICACAO =
  "A troca de brinco ou RFID continua no manejo.";
export const MSG_EDICAO_MANEJO =
  "Castração e desmama continuam no manejo.";
export const MSG_EDICAO_GENEALOGIA =
  "O vínculo estruturado de pai ou mãe não muda nesta edição.";

export type MotivoEdicaoAnimal =
  | MotivoOperacional
  | "nao_encontrado"
  | "alteracao_estrutural"
  | "situacao_preservada"
  | "peso_invalido"
  | "brinco_duplicado"
  | "sexo_bloqueado";

export type RecusaEdicaoAnimal = {
  ok: false;
  motivo: MotivoEdicaoAnimal;
  campo?: string;
  mensagem?: string;
};

export type AnimalParaEdicao = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
  sexo: "macho" | "femea";
  castrado: boolean | number | null;
  brinco: string | null;
  brincoEletronico: string | null;
  pesoAtual: string | null;
  dataDesmama: string | null;
  maeId: number | null;
  paiId: number | null;
};

export type EdicaoAnimalInput = {
  id: number;
  brinco?: string | null;
  brincoEletronico?: string | null;
  nome?: string | null;
  raca?: string | null;
  sexo?: "macho" | "femea";
  dataNascimento?: string | null;
  pesoAtual?: string | null;
  loteId?: number | null;
  categoria?: string | null;
  status?: "ativo" | "vendido" | "morto" | "transferido";
  observacoes?: string | null;
  pelagem?: string | null;
  marca?: string | null;
  dataDesmama?: string | null;
  castrado?: boolean | null;
  dataEntrada?: string | null;
  pesoEntrada?: string | null;
  produtorOrigem?: string | null;
  precoKg?: string | null;
  frete?: string | null;
  sisbov?: string | null;
  dataRnd?: string | null;
  rgn?: string | null;
  rgd?: string | null;
  rastreadoNascimento?: boolean;
  maeId?: number | null;
  paiId?: number | null;
  pai?: string | null;
  mae?: string | null;
  fazendaId?: number | null;
  pastoId?: number | null;
};

export type ConsultaEdicaoAnimal = ConsultaAutorizacaoPersistida & {
  animal(id: number): Promise<AnimalParaEdicao | null>;
  loteFazenda(loteId: number, titularUserId: number): Promise<number | null>;
  animaisAtivos(titularUserId: number): Promise<LinhaAnimalAtivo[]>;
  lotesDoTitular(titularUserId: number): Promise<Array<{ id: number; fazendaId: number | null }>>;
  evidenciasSexo(titularUserId: number, animalId: number, castradoAtual: unknown): Promise<EvidenciasAlteracaoSexo>;
  atualizarAnimal(id: number, titularUserId: number, patch: Record<string, unknown>): Promise<void>;
};

export type IoEdicaoAnimal = {
  emTransacao<T>(fn: (tx: ConsultaEdicaoAnimal) => Promise<T>): Promise<T>;
  aposAtualizar?: () => Promise<void>;
};

export type PedidoEdicaoAnimal = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: EdicaoAnimalInput;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type SucessoEdicaoAnimal = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  fazendaId: number;
  patch: Record<string, unknown>;
};

export type ResultadoEdicaoAnimal = SucessoEdicaoAnimal | RecusaEdicaoAnimal;

export type EspelhoEdicaoAnimal = {
  atualizar(userId: number, id: number, patch: Record<string, unknown>): Promise<void>;
};

function recusa(motivo: MotivoEdicaoAnimal, mensagem?: string, campo?: string): RecusaEdicaoAnimal {
  return { ok: false, motivo, mensagem, campo };
}

function idOpcional(valor: number | null | undefined): number | null {
  if (valor == null) return null;
  if (!Number.isInteger(Number(valor)) || Number(valor) <= 0) return null;
  return Number(valor);
}

function resolveData(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  return valor;
}

function resolveStr(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  return valor;
}

function resolvePeso(valor: string | null | undefined): string | null | undefined {
  return resolveStr(valor);
}

function mesmoId(atual: number | null, informado: number | null | undefined): boolean {
  if (informado === undefined) return true;
  const esquerda = atual == null ? null : Number(atual);
  const direita = informado == null ? null : Number(informado);
  return esquerda === direita;
}

function mesmoTexto(atual: string | null, informado: string | null | undefined): boolean {
  if (informado === undefined) return true;
  const novo = resolveStr(informado) ?? null;
  const velho = atual == null || atual === "" ? null : atual;
  return novo === velho;
}

function mesmoPeso(atual: string | null, informado: string | null | undefined): boolean {
  if (informado === undefined) return true;
  const novo = resolvePeso(informado) ?? null;
  const velho = atual == null || atual === "" ? null : String(atual);
  if (novo === velho) return true;
  if (novo != null && velho != null && Number(novo) === Number(velho)) return true;
  return false;
}

function flagCastrado(valor: boolean | number | null | undefined): boolean | null | undefined {
  if (valor === undefined) return undefined;
  if (valor == null) return null;
  if (valor === true || valor === 1) return true;
  if (valor === false || valor === 0) return false;
  return null;
}

function mesmoCastrado(atual: boolean | number | null, informado: boolean | null | undefined): boolean {
  if (informado === undefined) return true;
  return flagCastrado(atual) === flagCastrado(informado);
}

function dataCurta(valor: string | null | undefined): string | null {
  if (valor == null || valor === "") return null;
  return String(valor).slice(0, 10);
}

/** A tela de editar reenvia a fazenda atual. Valor igual ao gravado não é movimentação. */
export function campoEstruturalAlterado(animal: AnimalParaEdicao, input: EdicaoAnimalInput): string | null {
  if (input.status !== undefined && input.status !== animal.status) return "status";
  if (!mesmoId(animal.fazendaId, input.fazendaId)) return "fazendaId";
  if (!mesmoId(animal.loteId, input.loteId)) return "loteId";
  if (!mesmoId(animal.pastoId, input.pastoId)) return "pastoId";
  if (!mesmoPeso(animal.pesoAtual, input.pesoAtual)) return "pesoAtual";
  if (!mesmoTexto(animal.brinco, input.brinco)) return "brinco";
  if (!mesmoTexto(animal.brincoEletronico, input.brincoEletronico)) return "brincoEletronico";
  if (!mesmoCastrado(animal.castrado, input.castrado)) return "castrado";
  if (input.dataDesmama !== undefined && dataCurta(resolveData(input.dataDesmama)) !== dataCurta(animal.dataDesmama)) {
    return "dataDesmama";
  }
  if (!mesmoId(animal.maeId, input.maeId)) return "maeId";
  if (!mesmoId(animal.paiId, input.paiId)) return "paiId";
  return null;
}

function mensagemEstrutural(campo: string): string {
  if (campo === "status") return MSG_STATUS_ALTERACAO_DIRETA;
  if (campo === "pesoAtual") return MSG_EDICAO_PESO_ATUAL;
  if (campo === "brinco" || campo === "brincoEletronico") return MSG_EDICAO_IDENTIFICACAO;
  if (campo === "castrado" || campo === "dataDesmama") return MSG_EDICAO_MANEJO;
  if (campo === "maeId" || campo === "paiId") return MSG_EDICAO_GENEALOGIA;
  return MSG_EDICAO_ESTRUTURAL;
}

function patchCadastral(input: EdicaoAnimalInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const textos: Array<[keyof EdicaoAnimalInput, string]> = [
    ["nome", "nome"],
    ["raca", "raca"],
    ["categoria", "categoria"],
    ["observacoes", "observacoes"],
    ["pelagem", "pelagem"],
    ["marca", "marca"],
    ["produtorOrigem", "produtorOrigem"],
    ["precoKg", "precoKg"],
    ["frete", "frete"],
    ["sisbov", "sisbov"],
    ["rgn", "rgn"],
    ["rgd", "rgd"],
    ["pai", "pai"],
    ["mae", "mae"],
  ];
  for (const [origem, destino] of textos) {
    const valor = resolveStr(input[origem] as string | null | undefined);
    if (valor !== undefined) patch[destino] = valor;
  }
  const datas: Array<[keyof EdicaoAnimalInput, string]> = [
    ["dataNascimento", "dataNascimento"],
    ["dataEntrada", "dataEntrada"],
    ["dataRnd", "dataRnd"],
  ];
  for (const [origem, destino] of datas) {
    const valor = resolveData(input[origem] as string | null | undefined);
    if (valor !== undefined) patch[destino] = valor;
  }
  const peso = resolvePeso(input.pesoEntrada);
  if (peso !== undefined) patch.pesoEntrada = peso;
  if (input.sexo !== undefined) patch.sexo = input.sexo;
  if (input.rastreadoNascimento !== undefined) patch.rastreadoNascimento = input.rastreadoNascimento;
  return patch;
}

export function erroEdicaoAnimal(resultado: RecusaEdicaoAnimal): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar animais." });
    case "nao_encontrado":
    case "sem_fazenda":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: "Animal não encontrado." });
    case "situacao_preservada":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_STATUS_ALTERACAO_DIRETA });
    case "peso_invalido":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_PESO_ENTRADA_INVALIDO });
    case "brinco_duplicado":
    case "sexo_bloqueado":
    case "alteracao_estrutural":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_EDICAO_ESTRUTURAL });
    default:
      return new TRPCError({ code: "FORBIDDEN", message: resultado.mensagem ?? "Edição recusada." });
  }
}

async function fazendaDoAnimal(
  tx: ConsultaEdicaoAnimal,
  animal: AnimalParaEdicao,
  titularUserId: number,
): Promise<number | null> {
  const direta = idOpcional(animal.fazendaId);
  if (direta != null) return direta;
  if (animal.loteId == null) return null;
  return tx.loteFazenda(animal.loteId, titularUserId);
}

/** Edita só o cadastro. Fazenda, lote, pasto e manejo ficam como estão. */
export async function editarAnimalAutorizado(
  io: IoEdicaoAnimal,
  pedido: PedidoEdicaoAnimal,
): Promise<ResultadoEdicaoAnimal> {
  if (isPesoEntradaInformadoInvalido(pedido.input.pesoEntrada)) {
    return recusa("peso_invalido", MSG_PESO_ENTRADA_INVALIDO, "pesoEntrada");
  }
  return io.emTransacao(async (tx) => {
    const animal = await tx.animal(pedido.input.id);
    if (!animal) return recusa("nao_encontrado", "Animal não encontrado.");

    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null) return recusa("sem_identidade");
    if (animal.userId !== usuario.titularUserId) return recusa("nao_encontrado", "Animal não encontrado.");

    const fazendaId = await fazendaDoAnimal(tx, animal, usuario.titularUserId);
    if (fazendaId == null) return recusa("fazenda_ausente", "Selecione uma fazenda.");

    const deciso = await autorizarOperacaoPersistida(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_EDITAR_ANIMAL,
      fazendaId,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (!deciso.ok) {
      if (deciso.motivo === "sem_fazenda" || deciso.motivo === "outro_titular" || deciso.motivo === "fazenda_inexistente") {
        return recusa(deciso.motivo, "Animal não encontrado.", "fazendaId");
      }
      return recusa(deciso.motivo);
    }

    const campo = campoEstruturalAlterado(animal, pedido.input);
    if (campo) {
      const mensagem = mensagemEstrutural(campo);
      if (campo === "status") return recusa("situacao_preservada", mensagem, campo);
      return recusa("alteracao_estrutural", mensagem, campo);
    }

    if (precisaValidarAlteracaoSexo(animal.sexo, pedido.input.sexo)) {
      const evidencias = await tx.evidenciasSexo(
        deciso.contexto.titularUserId,
        animal.id,
        animal.castrado,
      );
      const validacao = validarAlteracaoSexoAnimal({
        sexoAtual: animal.sexo,
        novoSexo: pedido.input.sexo,
        evidencias,
      });
      if (!validacao.permitido) return recusa("sexo_bloqueado", validacao.mensagem, "sexo");
    }

    const ativos = await tx.animaisAtivos(deciso.contexto.titularUserId);
    const lotes = await tx.lotesDoTitular(deciso.contexto.titularUserId);
    const loteFazendaById = new Map(lotes.map((lote) => [lote.id, lote.fazendaId]));
    const conflito = findActiveBrincoConflict(ativos, animal.brinco, {
      excludeAnimalId: animal.id,
      fazendaId,
      loteFazendaById,
      effectiveStatus: animal.status ?? "ativo",
    });
    if (conflito) {
      return recusa("brinco_duplicado", buildBrincoAtivoConflitoMessage(animal.brinco ?? "", conflito), "brinco");
    }

    const patch = patchCadastral(pedido.input);
    if (Object.keys(patch).length > 0) {
      try {
        await tx.atualizarAnimal(animal.id, deciso.contexto.titularUserId, patch);
      } catch (erro) {
        if (!ehBrincoDuplicadoNoMysql(erro)) throw erro;
        const brinco = typeof patch.brinco === "string" ? patch.brinco : (animal.brinco ?? "");
        return recusa("brinco_duplicado", buildBrincoAtivoConflitoMessage(brinco), "brinco");
      }
    }
    if (io.aposAtualizar) await io.aposAtualizar();
    return {
      ok: true as const,
      id: animal.id,
      userId: deciso.contexto.titularUserId,
      executorUserId: deciso.contexto.executorUserId,
      fazendaId,
      patch,
    };
  });
}

export async function concluirEdicaoNoEspelho(
  espelho: EspelhoEdicaoAnimal,
  resultado: ResultadoEdicaoAnimal,
): Promise<void> {
  if (!resultado.ok) return;
  try {
    await espelho.atualizar(resultado.userId, resultado.id, resultado.patch);
  } catch (erro) {
    console.warn("[animais.update] Espelho local não gravado:", erro);
  }
}

export async function editarEEspelharAnimal(
  io: IoEdicaoAnimal,
  pedido: PedidoEdicaoAnimal,
  espelho: EspelhoEdicaoAnimal,
): Promise<ResultadoEdicaoAnimal> {
  const resultado = await editarAnimalAutorizado(io, pedido);
  await concluirEdicaoNoEspelho(espelho, resultado);
  return resultado;
}

export function evidenciasDe(entrada: {
  animalId: number;
  castradoAtual: unknown;
  saudeTipos?: readonly string[];
  descendentes?: readonly { paiId?: number | null; maeId?: number | null }[];
  reproRegistros?: readonly ReproEvidenciaRow[];
}): EvidenciasAlteracaoSexo {
  if (
    (entrada.saudeTipos?.length ?? 0) === 0
    && (entrada.descendentes?.length ?? 0) === 0
    && (entrada.reproRegistros?.length ?? 0) === 0
  ) {
    return {
      ...evidenciasVazias(),
      castradoInicialExplicito: entrada.castradoAtual === true || entrada.castradoAtual === 1,
    };
  }
  return coletarEvidenciasAlteracaoSexo(entrada);
}
