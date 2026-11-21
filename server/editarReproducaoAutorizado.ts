/**
 * Edição e exclusão de um registro reprodutivo.
 *
 * reproducao.editar cobre correção cadastral: data, previsão, observação e responsável,
 * sem trocar matriz, touro, partida, consumo ou resultado.
 * reproducao.inativar cobre a exclusão do lançamento. Não exige animais.inativar.
 *
 * Uma inseminação que já consumiu dose não é apagada por aqui.
 * O estoque não tem um estorno de aplicação, e devolver a dose só porque o
 * lançamento sumiu faria sêmen usado aparecer de novo como disponível.
 * Parto e estação de monta em lote ficam para a etapa própria: a exclusão deles para.
 *
 * Ordem: identidade e fazenda; registro; animais por id; partida; histórico.
 * Sem MySQL, nada é gravado no JSON.
 */
import { TRPCError } from "@trpc/server";
import {
  packReproObservacoes,
  unpackReproObservacoes,
  type ReproObservacoesMeta,
} from "../shared/reproRegistroMeta";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

export const PERMISSAO_REPRO_EDITAR = "reproducao.editar";
export const PERMISSAO_REPRO_INATIVAR = "reproducao.inativar";

export const MSG_SEM_PERMISSAO_EDITAR_REPRO = "Você não tem permissão para alterar o registro reprodutivo.";
export const MSG_SEM_PERMISSAO_EXCLUIR_REPRO = "Você não tem permissão para excluir o lançamento de reprodução.";
export const MSG_REPRO_NAO_ENCONTRADO = "Registro reprodutivo não encontrado.";
export const MSG_REPRO_SEM_FAZENDA = "O animal deste registro não tem fazenda definida. Nada foi alterado.";
export const MSG_REPRO_DATA_INVALIDA = "Informe uma data válida.";
export const MSG_REPRO_MUDAR_MATRIZ = "A matriz deste lançamento não pode ser trocada por aqui. O registro não foi alterado.";
export const MSG_REPRO_MUDAR_PARTIDA = "A partida de sêmen não pode ser trocada por aqui. A dose aplicada continua na partida original.";
export const MSG_REPRO_EDICAO_ESTRUTURAL = "Essa alteração mexe no tipo, no touro ou no resultado. O registro não foi alterado.";
export const MSG_REPRO_DATA_COM_SEMEN = "A data desta inseminação não pode mudar enquanto a dose aplicada estiver ligada ao lançamento.";
export const MSG_REPRO_DATA_COM_HISTORICO = "A data não pode mudar porque este animal já tem outro evento reprodutivo. O registro não foi alterado.";
export const MSG_REPRO_EXCLUSAO_DOSE = "Esta inseminação consumiu uma dose. Excluir o lançamento não devolve a dose ao estoque. O registro e o saldo permanecem como estão.";
export const MSG_REPRO_EXCLUSAO_POSTERIOR = "Há um evento reprodutivo posterior neste animal. O lançamento não foi excluído.";
export const MSG_REPRO_EXCLUSAO_PARTO = "O parto fica para uma etapa própria. Nenhum nascimento foi apagado.";
export const MSG_REPRO_EXCLUSAO_ESTACAO = "A estação de monta em lote fica para uma etapa própria. Nenhum registro foi apagado.";
export const MSG_REPRO_EXCLUSAO_ESPELHO = "Este lançamento está ligado a cópias nas matrizes. Elas não foram apagadas.";

export const ORDEM_BLOQUEIO_REPRO_EDICAO =
  "identidade e fazenda; registro; animais por id; partida de sêmen; histórico";

const TENTATIVAS = 3;

export type RegistroReproLinha = {
  id: number;
  userId: number;
  femeaId: number;
  machoId: number | null;
  tipo: string;
  dataCobertura: Date | string;
  dataPrevistoParto: Date | string | null;
  resultado: string | null;
  observacoes: string | null;
};

export type AnimalReproLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
};

export type PartidaReproLinha = {
  id: number;
  userId: number;
  fazendaId: number;
  saldoDoses: number;
};

export type SaidaIaLinha = {
  id: number;
  partidaId: number;
  quantidadeDoses: number;
};

export type EspelhoRepro = {
  tipo: string;
  dataCobertura: string;
  dataPrevistoParto: string | null;
  resultado?: string;
  observacoes?: string;
};

export type ConsultaEditarReproducao = ConsultaAutorizacaoPersistida & {
  espiarRegistro(id: number): Promise<RegistroReproLinha | null>;
  espiarAnimal(id: number): Promise<AnimalReproLinha | null>;
  travaRegistro(id: number): Promise<RegistroReproLinha | null>;
  travaAnimal(id: number): Promise<AnimalReproLinha | null>;
  registrosDoAnimal(userId: number, animalId: number): Promise<RegistroReproLinha[]>;
  espiarSaidasIa(userId: number, registroId: number): Promise<SaidaIaLinha[]>;
  saidasIaDoRegistro(userId: number, registroId: number): Promise<SaidaIaLinha[]>;
  espelhosDoRegistro(userId: number, registroId: number): Promise<RegistroReproLinha[]>;
  travaPartida(id: number): Promise<PartidaReproLinha | null>;
  partoTemCrias(registroId: number): Promise<boolean>;
  atualizarRegistro(input: {
    id: number;
    userId: number;
    tipo: string;
    dataCobertura: string;
    dataPrevistoParto: string | null;
    resultado: string | null;
    observacoes: string | null;
  }): Promise<number>;
  excluirRegistro(id: number, userId: number): Promise<number>;
  aposTravas?(): Promise<void>;
};

export type IoEditarReproducao = {
  emTransacao<T>(fn: (tx: ConsultaEditarReproducao) => Promise<T>): Promise<T>;
};

type PedidoBase = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  registroId: number;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type PedidoEditarReproducao = PedidoBase & {
  tipo: string;
  dataCobertura: string;
  dataPrevistoParto?: string | null;
  resultado?: string;
  reprodutorSemen?: string;
  responsavel?: string;
  observacoes?: string;
  femeaId?: number | null;
  machoId?: number | null;
  semenPartidaId?: number | null;
};

export type RecusaRepro = {
  ok: false;
  motivo: MotivoOperacional | "nao_encontrado" | "estrutural" | "dose" | "posterior" | "parto" | "estacao" | "espelho" | "invalido";
  mensagem: string;
};

export type EdicaoReproOk = {
  ok: true;
  titularUserId: number;
  espelho: EspelhoRepro;
};

export type ExclusaoReproOk = {
  ok: true;
  titularUserId: number;
  registroId: number;
};

function texto(valor: string | null | undefined): string {
  return String(valor ?? "").trim();
}

function isoData(valor: Date | string | null | undefined): string {
  if (valor == null || valor === "") return "";
  if (valor instanceof Date) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  const match = String(valor).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function dataValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

function bancoIndisponivel(error: unknown): boolean {
  const partes: string[] = [];
  const vistos = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !vistos.has(atual)) {
    vistos.add(atual);
    const item = atual as { code?: string; errno?: string | number; message?: string; cause?: unknown };
    partes.push(String(item.code || ""), String(item.errno || ""), String(item.message || ""));
    atual = item.cause;
  }
  const junto = partes.join(" ");
  return ["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].some((codigo) =>
    junto.includes(codigo),
  );
}

function ehDeadlock(error: unknown): boolean {
  const vistos = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !vistos.has(atual)) {
    vistos.add(atual);
    const item = atual as { errno?: number; code?: string; message?: string; cause?: unknown };
    if (item.errno === 1213 || item.code === "ER_LOCK_DEADLOCK") return true;
    if (/deadlock found when trying to get lock/i.test(String(item.message ?? ""))) return true;
    atual = item.cause;
  }
  return false;
}

function recusa(motivo: RecusaRepro["motivo"], mensagem: string): RecusaRepro {
  return { ok: false, motivo, mensagem };
}

export function erroEditarReproducao(resultado: RecusaRepro): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: resultado.mensagem });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "fazenda_ausente":
      return new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_SEM_FAZENDA });
    case "invalido":
    case "estrutural":
    case "dose":
    case "posterior":
    case "parto":
    case "estacao":
    case "espelho":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem });
    default:
      return new TRPCError({ code: "NOT_FOUND", message: MSG_REPRO_NAO_ENCONTRADO });
  }
}

function pedidoAuth(pedido: PedidoBase, permissaoId: string, fazendaId: number | null): PedidoAutorizacaoPersistida {
  return {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  };
}

function erroDeMotivo(motivo: MotivoOperacional, operacao: "editar" | "excluir"): RecusaRepro {
  const semPermissao = operacao === "editar" ? MSG_SEM_PERMISSAO_EDITAR_REPRO : MSG_SEM_PERMISSAO_EXCLUIR_REPRO;
  if (motivo === "sem_fazenda") return recusa("sem_fazenda", MSG_SEM_FAZENDA_MANEJO);
  if (motivo === "fazenda_ausente") return recusa("fazenda_ausente", MSG_REPRO_SEM_FAZENDA);
  if (motivo === "sem_identidade") return recusa("sem_identidade", "Sessão inválida.");
  if (motivo === "sem_permissao" || motivo === "reservado_ao_principal") return recusa(motivo, semPermissao);
  if (motivo === "outro_titular" || motivo === "fazenda_inexistente") return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
  return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
}

function consumiuDose(meta: ReproObservacoesMeta, saidas: SaidaIaLinha[]): boolean {
  return meta.semenPartidaId != null || saidas.length > 0;
}

function repack(meta: ReproObservacoesMeta, observacoes: string, responsavel: string): string | null {
  return packReproObservacoes(
    observacoes,
    meta.reprodutorSemen,
    responsavel,
    meta.descricaoResultadoOutro,
    meta.coberturaAlvo,
    {
      partidaSemen: meta.partidaSemen,
      inseminador: meta.inseminador,
      ecc: meta.ecc,
      semenPartidaId: meta.semenPartidaId,
      custoDoseSemen: meta.custoDoseSemen,
      centralOrigem: meta.centralOrigem,
      registroOrigemId: meta.registroOrigemId,
      espelhoAutomatico: meta.espelhoAutomatico,
      anulado: meta.anulado,
      anuladoEmISO: meta.anuladoEmISO,
      substituidoPorRegistroId: meta.substituidoPorRegistroId,
    },
  ) ?? null;
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

async function preparar(
  tx: ConsultaEditarReproducao,
  pedido: PedidoBase,
  permissaoId: string,
  operacao: "editar" | "excluir",
): Promise<{ ok: true; titularUserId: number; registro: RegistroReproLinha; animal: AnimalReproLinha; meta: ReproObservacoesMeta; saidas: SaidaIaLinha[] } | RecusaRepro> {
  const espiado = await tx.espiarRegistro(pedido.registroId);
  if (!espiado) return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
  const animalEspiado = await tx.espiarAnimal(espiado.femeaId);
  if (!animalEspiado) return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
  const auth = await autorizarOperacaoPersistida(tx, pedidoAuth(pedido, permissaoId, animalEspiado.fazendaId));
  if (!auth.ok) return erroDeMotivo(auth.motivo, operacao);
  const registro = await tx.travaRegistro(pedido.registroId);
  if (!registro || registro.userId !== auth.contexto.titularUserId) {
    return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
  }
  const ids = [registro.femeaId, registro.machoId].filter((id): id is number => id != null && id > 0);
  const unicos = [...new Set(ids)].sort((a, b) => a - b);
  let animal: AnimalReproLinha | null = null;
  for (const id of unicos) {
    const linha = await tx.travaAnimal(id);
    if (!linha || linha.userId !== auth.contexto.titularUserId) {
      return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
    }
    if (id === registro.femeaId) animal = linha;
  }
  if (!animal || animal.fazendaId == null || animal.fazendaId !== animalEspiado.fazendaId) {
    return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
  }
  const meta = unpackReproObservacoes(registro.observacoes);
  const espiadas = await tx.espiarSaidasIa(auth.contexto.titularUserId, registro.id);
  const partidas = [...new Set(
    [meta.semenPartidaId, ...espiadas.map((saida) => saida.partidaId)].filter((id): id is number => id != null && id > 0),
  )].sort((a, b) => a - b);
  for (const partidaId of partidas) {
    const partida = await tx.travaPartida(partidaId);
    if (!partida || partida.userId !== auth.contexto.titularUserId || partida.fazendaId !== animal.fazendaId) {
      return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
    }
  }
  const saidas = await tx.saidasIaDoRegistro(auth.contexto.titularUserId, registro.id);
  const partidaDaDose = meta.semenPartidaId ?? saidas[0]?.partidaId ?? null;
  if (saidas.some((saida) => saida.partidaId !== partidaDaDose)) {
    return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
  }
  if (tx.aposTravas) await tx.aposTravas();
  return { ok: true, titularUserId: auth.contexto.titularUserId, registro, animal, meta, saidas };
}

export async function editarReproducaoAutorizada(
  io: IoEditarReproducao,
  pedido: PedidoEditarReproducao,
): Promise<EdicaoReproOk | RecusaRepro> {
  const data = texto(pedido.dataCobertura);
  if (!dataValida(data)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_DATA_INVALIDA });
  }
  if (pedido.dataPrevistoParto && !dataValida(pedido.dataPrevistoParto)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_DATA_INVALIDA });
  }
  return executar(() => io.emTransacao(async (tx) => {
    const base = await preparar(tx, pedido, PERMISSAO_REPRO_EDITAR, "editar");
    if (!base.ok) return base;
    const { registro, meta, saidas, titularUserId } = base;
    if (pedido.femeaId != null && pedido.femeaId !== registro.femeaId) {
      return recusa("estrutural", MSG_REPRO_MUDAR_MATRIZ);
    }
    if (pedido.machoId != null && pedido.machoId !== (registro.machoId ?? 0)) {
      return recusa("estrutural", MSG_REPRO_MUDAR_MATRIZ);
    }
    if (pedido.semenPartidaId != null && pedido.semenPartidaId !== (meta.semenPartidaId ?? 0)) {
      return recusa("estrutural", MSG_REPRO_MUDAR_PARTIDA);
    }
    if (texto(pedido.tipo) !== texto(registro.tipo)) {
      return recusa("estrutural", MSG_REPRO_EDICAO_ESTRUTURAL);
    }
    if (pedido.resultado !== undefined && texto(pedido.resultado) !== texto(registro.resultado)) {
      return recusa("estrutural", MSG_REPRO_EDICAO_ESTRUTURAL);
    }
    if (pedido.reprodutorSemen !== undefined && texto(pedido.reprodutorSemen) !== texto(meta.reprodutorSemen)) {
      return recusa("estrutural", MSG_REPRO_EDICAO_ESTRUTURAL);
    }
    if (pedido.observacoes != null && pedido.observacoes.includes("__fd_repro__")) {
      return recusa("estrutural", MSG_REPRO_EDICAO_ESTRUTURAL);
    }
    const dataAtual = isoData(registro.dataCobertura);
    const previsaoAtual = isoData(registro.dataPrevistoParto);
    const previsaoNova = pedido.dataPrevistoParto === undefined ? previsaoAtual : (pedido.dataPrevistoParto ?? "");
    const mudaData = data !== dataAtual || previsaoNova !== previsaoAtual;
    if (mudaData) {
      if (consumiuDose(meta, saidas)) return recusa("dose", MSG_REPRO_DATA_COM_SEMEN);
      if (registro.tipo === "Parto" || registro.tipo === "Estação de monta") {
        return recusa(registro.tipo === "Parto" ? "parto" : "estacao", registro.tipo === "Parto" ? MSG_REPRO_EXCLUSAO_PARTO : MSG_REPRO_EXCLUSAO_ESTACAO);
      }
      const outros = await tx.registrosDoAnimal(titularUserId, registro.femeaId);
      if (outros.some((item) => item.id !== registro.id)) {
        return recusa("posterior", MSG_REPRO_DATA_COM_HISTORICO);
      }
    }
    const observacoes = pedido.observacoes === undefined ? texto(meta.observacoes) : texto(pedido.observacoes);
    const responsavel = pedido.responsavel === undefined ? texto(meta.responsavel) : texto(pedido.responsavel);
    const observacoesNovas = repack(meta, observacoes, responsavel);
    const atualizados = await tx.atualizarRegistro({
      id: registro.id,
      userId: titularUserId,
      tipo: registro.tipo,
      dataCobertura: data,
      dataPrevistoParto: previsaoNova || null,
      resultado: registro.resultado,
      observacoes: observacoesNovas,
    });
    if (atualizados !== 1) return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
    return {
      ok: true as const,
      titularUserId,
      espelho: {
        tipo: registro.tipo,
        dataCobertura: data,
        dataPrevistoParto: previsaoNova || null,
        resultado: registro.resultado ?? undefined,
        observacoes: observacoesNovas ?? undefined,
      },
    };
  }));
}

export async function excluirReproducaoAutorizada(
  io: IoEditarReproducao,
  pedido: PedidoBase,
): Promise<ExclusaoReproOk | RecusaRepro> {
  return executar(() => io.emTransacao(async (tx) => {
    const base = await preparar(tx, pedido, PERMISSAO_REPRO_INATIVAR, "excluir");
    if (!base.ok) return base;
    const { registro, meta, saidas, titularUserId } = base;
    if (registro.tipo === "Parto" || await tx.partoTemCrias(registro.id)) {
      return recusa("parto", MSG_REPRO_EXCLUSAO_PARTO);
    }
    if (registro.tipo === "Estação de monta" || (meta.coberturaAlvo?.animalIds.length ?? 0) > 0) {
      return recusa("estacao", MSG_REPRO_EXCLUSAO_ESTACAO);
    }
    if (meta.espelhoAutomatico || meta.registroOrigemId != null) {
      return recusa("espelho", MSG_REPRO_EXCLUSAO_ESPELHO);
    }
    const copias = await tx.espelhosDoRegistro(titularUserId, registro.id);
    if (copias.some((copia) => unpackReproObservacoes(copia.observacoes).registroOrigemId === registro.id)) {
      return recusa("espelho", MSG_REPRO_EXCLUSAO_ESPELHO);
    }
    if (consumiuDose(meta, saidas)) return recusa("dose", MSG_REPRO_EXCLUSAO_DOSE);
    const outros = await tx.registrosDoAnimal(titularUserId, registro.femeaId);
    const dataAtual = isoData(registro.dataCobertura);
    if (outros.some((item) => item.id !== registro.id && isoData(item.dataCobertura) > dataAtual)) {
      return recusa("posterior", MSG_REPRO_EXCLUSAO_POSTERIOR);
    }
    const apagados = await tx.excluirRegistro(registro.id, titularUserId);
    if (apagados !== 1) return recusa("nao_encontrado", MSG_REPRO_NAO_ENCONTRADO);
    return { ok: true as const, titularUserId, registroId: registro.id };
  }));
}
