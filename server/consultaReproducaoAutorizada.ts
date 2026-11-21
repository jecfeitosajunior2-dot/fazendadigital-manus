/**
 * Consulta do histórico reprodutivo e da régua da fazenda.
 * A lista usa reproducao.visualizar. A régua usa visualizar para ler
 * e reproducao.editar para gravar. O funcionário vê o que é do titular,
 * nas fazendas concedidas. O principal continua vendo a conta inteira.
 * Sem MySQL, não há leitura nem gravação no JSON.
 *
 * A régua não muda de regra: os quatro parâmetros e o padrão continuam os mesmos.
 * Não há coluna de versão. Duas gravações da mesma fazenda se sucedem;
 * a última confirmação fica. Fazendas diferentes não se misturam.
 */
import { TRPCError } from "@trpc/server";
import {
  mergeReproPipelineConfig,
  parseReproPipelineConfigJson,
  serializeReproPipelineConfigJson,
  type ReproPipelineConfig,
  type ReproPipelineConfigInput,
} from "../shared/reproPipelineConfig";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import { autorizarOperacao, type MotivoOperacional } from "./contextoOperacional";
import { loginPermitido, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

export const PERMISSAO_VER_REPRODUCAO = "reproducao.visualizar";
export const PERMISSAO_EDITAR_REGUA = "reproducao.editar";

export const MSG_SEM_PERMISSAO_VER_REPRODUCAO = "Você não tem permissão para consultar reprodução.";
export const MSG_SEM_PERMISSAO_REGUA = "Você não tem permissão para alterar a régua reprodutiva.";
export const MSG_FAZENDA_REPRO_AUSENTE = "Fazenda não encontrada.";

const TENTATIVAS = 3;

export type RegistroReproLista = {
  id: number;
  userId: number;
  femeaId: number;
  machoId: number | null;
  tipo: string;
  dataCobertura: Date | string;
  dataPrevistoParto: Date | string | null;
  dataPartoReal: Date | string | null;
  resultado: string | null;
  filhotes: number | null;
  observacoes: string | null;
  createdAt: Date | string | null;
};

type RegistroComAnimal = RegistroReproLista & {
  animalUserId: number | null;
  animalFazendaId: number | null;
  animalLoteId: number | null;
};

export type ConsultaReproducao = ConsultaAutorizacaoPersistida & {
  lotes(titularUserId: number): Promise<Array<{ id: number; userId: number; fazendaId: number | null; pastoAtualId: number | null }>>;
  pastos(titularUserId: number): Promise<Array<{ id: number; userId: number; fazendaId: number | null }>>;
  registros(titularUserId: number): Promise<RegistroComAnimal[]>;
  lerConfig(fazendaId: number, titularUserId: number): Promise<string | null | undefined>;
  gravarConfig(fazendaId: number, titularUserId: number, serializado: string): Promise<number>;
  aposGravar?: () => Promise<void>;
};

export type IoConsultaReproducao = {
  emTransacao<T>(fn: (tx: ConsultaReproducao) => Promise<T>): Promise<T>;
};

export type PedidoConsulta = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  fazendaId?: number | null;
  config?: ReproPipelineConfigInput | null;
};

export type RecusaConsulta = { ok: false; motivo: MotivoOperacional | "nao_encontrado"; mensagem: string };
export type ListaOk = { ok: true; titularUserId: number; registros: RegistroReproLista[] };
export type PipelineOk = { ok: true; titularUserId: number; config: ReproPipelineConfig; serializado: string };

function recusa(motivo: RecusaConsulta["motivo"], mensagem: string): RecusaConsulta {
  return { ok: false, motivo, mensagem };
}

function bancoIndisponivel(error: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { code?: string; message?: string; cause?: unknown };
    if (["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].includes(String(item.code ?? ""))) return true;
    atual = item.cause;
  }
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

async function executar<T>(trabalho: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    try {
      return await trabalho();
    } catch (error) {
      ultimo = error;
      if (error instanceof TRPCError) throw error;
      if (ehDeadlock(error) && tentativa < TENTATIVAS - 1) continue;
      if (bancoIndisponivel(error)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      }
      throw error;
    }
  }
  throw ultimo;
}

export function erroConsultaReproducao(resultado: RecusaConsulta): TRPCError {
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
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem || MSG_FAZENDA_REPRO_AUSENTE });
  }
}

function identidadeDe(usuario: NonNullable<Awaited<ReturnType<ConsultaReproducao["usuario"]>>>): IdentidadeUsuario | null {
  if (!loginPermitido(usuario.situacao)) return null;
  if (!usuario.titularUserId) return null;
  return {
    id: usuario.id,
    openId: usuario.openId,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    papel: usuario.papel,
    titularUserId: usuario.titularUserId,
    situacao: usuario.situacao,
    sessionVersion: usuario.sessionVersion,
  };
}

function fazendaDoLote(
  lote: { fazendaId: number | null; pastoAtualId: number | null },
  pastoFazenda: Map<number, number>,
): number | null {
  if (lote.fazendaId != null) return Number(lote.fazendaId);
  if (lote.pastoAtualId != null) return pastoFazenda.get(Number(lote.pastoAtualId)) ?? null;
  return null;
}

function visivel(
  registro: RegistroComAnimal,
  principal: boolean,
  titular: number,
  autorizadas: Set<number>,
  loteFazenda: Map<number, number | null>,
  loteIds: Set<number>,
): boolean {
  if (registro.userId !== titular) return false;
  if (principal) return true;
  if (registro.animalUserId == null || registro.animalUserId !== titular) return false;
  if (registro.animalLoteId != null && !loteIds.has(registro.animalLoteId)) return false;
  const direta = registro.animalFazendaId != null ? Number(registro.animalFazendaId) : null;
  const doLote = registro.animalLoteId != null ? loteFazenda.get(registro.animalLoteId) ?? null : null;
  if (direta != null && doLote != null && direta !== doLote) return false;
  if (direta != null && registro.animalLoteId != null && doLote == null) return false;
  const efetiva = direta ?? doLote;
  return efetiva != null && autorizadas.has(efetiva);
}

function limpar(registro: RegistroComAnimal): RegistroReproLista {
  return {
    id: registro.id,
    userId: registro.userId,
    femeaId: registro.femeaId,
    machoId: registro.machoId,
    tipo: registro.tipo,
    dataCobertura: registro.dataCobertura,
    dataPrevistoParto: registro.dataPrevistoParto,
    dataPartoReal: registro.dataPartoReal,
    resultado: registro.resultado,
    filhotes: registro.filhotes,
    observacoes: registro.observacoes,
    createdAt: registro.createdAt,
  };
}

async function prepararLista(tx: ConsultaReproducao, pedido: PedidoConsulta) {
  const usuario = await tx.usuario(pedido.executorId);
  const identidade = usuario ? identidadeDe(usuario) : null;
  if (!identidade) return recusa("sem_identidade", "Sessão inválida.");
  if (pedido.sessionVersionDaSessao != null && pedido.sessionVersionDaSessao !== identidade.sessionVersion) {
    return recusa("sem_identidade", "Sessão inválida.");
  }
  const permissoes = await tx.permissoes(identidade.id, identidade.titularUserId);
  const vinculos = await tx.vinculos(identidade.id, identidade.titularUserId);
  const fazendas = await tx.fazendasDoTitular(identidade.titularUserId);
  if (identidade.papel !== "principal" && !permissoes.includes(PERMISSAO_VER_REPRODUCAO)) {
    return recusa("sem_permissao", MSG_SEM_PERMISSAO_VER_REPRODUCAO);
  }
  const autorizadas = new Set<number>();
  for (const fazenda of fazendas) {
    const deciso = autorizarOperacao({
      identidade,
      permissoes,
      permissaoId: PERMISSAO_VER_REPRODUCAO,
      fazendasDoTitular: fazendas,
      vinculos,
      fazendaId: fazenda.id,
      fazenda,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (deciso.ok) autorizadas.add(fazenda.id);
  }
  return { ok: true as const, identidade, autorizadas };
}

export async function listarReproducaoAutorizada(
  io: IoConsultaReproducao,
  pedido: PedidoConsulta,
): Promise<ListaOk | RecusaConsulta> {
  return executar(() => io.emTransacao(async (tx) => {
    const base = await prepararLista(tx, pedido);
    if (!base.ok) return base;
    const lotes = await tx.lotes(base.identidade.titularUserId);
    const pastos = await tx.pastos(base.identidade.titularUserId);
    const pastoFazenda = new Map<number, number>();
    for (const pasto of pastos) {
      if (pasto.userId === base.identidade.titularUserId && pasto.fazendaId != null) {
        pastoFazenda.set(pasto.id, Number(pasto.fazendaId));
      }
    }
    const loteFazenda = new Map<number, number | null>();
    const loteIds = new Set<number>();
    for (const lote of lotes) {
      if (lote.userId !== base.identidade.titularUserId) continue;
      loteIds.add(lote.id);
      loteFazenda.set(lote.id, fazendaDoLote(lote, pastoFazenda));
    }
    const rows = await tx.registros(base.identidade.titularUserId);
    const registros = rows
      .filter((row) => visivel(row, base.identidade.papel === "principal", base.identidade.titularUserId, base.autorizadas, loteFazenda, loteIds))
      .map(limpar);
    return { ok: true, titularUserId: base.identidade.titularUserId, registros };
  }));
}

async function autorizarFazenda(
  tx: ConsultaReproducao,
  pedido: PedidoConsulta,
  permissaoId: string,
  semPermissao: string,
): Promise<{ ok: true; titularUserId: number } | RecusaConsulta> {
  const fazendaId = pedido.fazendaId;
  if (fazendaId == null || !Number.isInteger(fazendaId) || fazendaId <= 0) {
    return recusa("nao_encontrado", MSG_FAZENDA_REPRO_AUSENTE);
  }
  const auth = await autorizarOperacaoPersistida(tx, {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  });
  if (!auth.ok) {
    if (auth.motivo === "sem_fazenda") return recusa("sem_fazenda", MSG_SEM_FAZENDA_MANEJO);
    if (auth.motivo === "sem_permissao" || auth.motivo === "reservado_ao_principal") return recusa(auth.motivo, semPermissao);
    if (auth.motivo === "sem_identidade") return recusa("sem_identidade", "Sessão inválida.");
    return recusa("nao_encontrado", MSG_FAZENDA_REPRO_AUSENTE);
  }
  return { ok: true, titularUserId: auth.contexto.titularUserId };
}

export async function lerPipelineAutorizado(
  io: IoConsultaReproducao,
  pedido: PedidoConsulta,
): Promise<PipelineOk | RecusaConsulta> {
  return executar(() => io.emTransacao(async (tx) => {
    const auth = await autorizarFazenda(tx, pedido, PERMISSAO_VER_REPRODUCAO, MSG_SEM_PERMISSAO_VER_REPRODUCAO);
    if (!auth.ok) return auth;
    const bruto = await tx.lerConfig(pedido.fazendaId!, auth.titularUserId);
    if (bruto === undefined) return recusa("nao_encontrado", MSG_FAZENDA_REPRO_AUSENTE);
    const config = parseReproPipelineConfigJson(bruto);
    return { ok: true, titularUserId: auth.titularUserId, config, serializado: serializeReproPipelineConfigJson(config) };
  }));
}

export async function gravarPipelineAutorizado(
  io: IoConsultaReproducao,
  pedido: PedidoConsulta,
): Promise<PipelineOk | RecusaConsulta> {
  const config = mergeReproPipelineConfig(pedido.config);
  const serializado = serializeReproPipelineConfigJson(config);
  return executar(() => io.emTransacao(async (tx) => {
    const auth = await autorizarFazenda(tx, pedido, PERMISSAO_EDITAR_REGUA, MSG_SEM_PERMISSAO_REGUA);
    if (!auth.ok) return auth;
    const alteradas = await tx.gravarConfig(pedido.fazendaId!, auth.titularUserId, serializado);
    if (alteradas !== 1) return recusa("nao_encontrado", MSG_FAZENDA_REPRO_AUSENTE);
    if (tx.aposGravar) await tx.aposGravar();
    return { ok: true, titularUserId: auth.titularUserId, config, serializado };
  }));
}
