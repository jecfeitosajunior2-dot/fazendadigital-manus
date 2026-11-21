/**
 * Parto com nascimento das crias.
 *
 * reproducao.criar já diz "Registrar reprodução ou parto". Ela autoriza o parto
 * e o cadastro das crias que nascem nele. animais.criar continua sendo só
 * "Cadastrar animal ou importar planilha" e não é exigida aqui: um funcionário
 * que pode registrar parto não precisa da permissão de importar animal.
 * Quem só tem animais.criar não registra parto.
 *
 * A cria nasce na conta do titular, na fazenda gravada na matriz.
 * Não há chave de idempotência. Dois partos diferentes no mesmo dia seguem.
 * O mesmo brinco ativo não nasce duas vezes. Sem MySQL, nada é criado no JSON.
 *
 * Ordem: espiar; lotes em ordem; identidade e fazenda; pastos; animais em ordem;
 * baixa; histórico do parto e das crias.
 */
import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa } from "../shared/animalBaixa";
import { buildEntradaInicialLoteMovimentacao, loteIdEfetivoParaHistorico } from "../shared/animalLoteMovimentacaoEntrada";
import { buildBrincoAtivoConflitoMessage, normalizeBrincoKey } from "../shared/brincoAtivo";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoBloqueadoReproPorCastracao,
  isReproTipoPermitidoParaAnimal,
  mensagemReproInelegivelAnimal,
  MSG_REPRO_MACHO_CASTRADO_REPRODUTOR,
} from "../shared/reproElegibilidade";
import { packReproObservacoes, validateReproResultadoForSave } from "../shared/reproRegistroMeta";
import { MSG_RFID_ATIVO_CONFLITO, normalizeRfidKey } from "../shared/rfidUnicidade";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import {
  MSG_REPRO_DATA_FUTURA,
  MSG_REPRO_DATA_INVALIDA,
  MSG_SEM_FAZENDA_MANEJO,
  MSG_SEM_PERMISSAO_REPRODUCAO,
} from "./registrarManejoAutorizado";
import {
  MSG_PARTO_BRINCO_DUPLICADO_LOTE,
  MSG_PARTO_CATEGORIA_INCOMPATIVEL,
  MSG_PARTO_CATEGORIA_OBRIGATORIA,
  MSG_PARTO_CRIAS_OBRIGATORIAS,
  MSG_PARTO_FEMEA_OBRIGATORIA,
  MSG_PARTO_NATIMORTO_SEM_CRIAS,
  resolvePaiIdFromRegistros,
  validateRegistrarPartoComCriasBusinessRules,
  type RegistrarPartoComCriasInput,
  type ReproRegistroPaiRef,
} from "./partoRegras";

export const PERMISSAO_PARTO = "reproducao.criar";
export const ORDEM_BLOQUEIO_PARTO =
  "espiar; lotes em ordem; identidade e fazenda; pastos; animais em ordem; baixa; histórico do parto e das crias";

export const MSG_PARTO_MATRIZ_AUSENTE = "Matriz não encontrada.";
export const MSG_PARTO_FAZENDA_DIVERGENTE = "O animal não pertence à Fazenda selecionada.";
export const MSG_PARTO_LOTE_INCOMPATIVEL = "O lote da cria não pertence à fazenda da matriz.";
export const MSG_PARTO_PASTO_INCOMPATIVEL = "O pasto da cria não pertence à fazenda da matriz.";
export const MSG_PARTO_REPRODUTOR_AUSENTE = "Reprodutor não encontrado.";
export const MSG_PARTO_REPRODUTOR_OUTRA_FAZENDA = "O reprodutor não pertence à mesma fazenda.";

const TENTATIVAS = 3;

export type AnimalPartoLinha = {
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
};

export type LotePartoLinha = { id: number; userId: number; fazendaId: number | null };
export type PastoPartoLinha = { id: number; userId: number; fazendaId: number | null };

export type RegistroPartoLinha = ReproRegistroPaiRef & {
  id: number;
  dataCobertura: string | Date;
};

export type CriaPartoEspelho = {
  animalId: number;
  ordem: number;
  pesagemId?: number;
  loteDestinoId: number | null;
  pastoId: number | null;
  fazendaId: number;
  brinco: string;
};

export type ConsultaParto = ConsultaAutorizacaoPersistida & {
  espiarAnimal(id: number): Promise<AnimalPartoLinha | null>;
  espiarRegistros(userId: number, femeaId: number): Promise<RegistroPartoLinha[]>;
  travaLote(id: number): Promise<LotePartoLinha | null>;
  travaPasto(id: number): Promise<PastoPartoLinha | null>;
  travaAnimal(id: number): Promise<AnimalPartoLinha | null>;
  travaRegistros(userId: number, femeaId: number): Promise<RegistroPartoLinha[]>;
  baixaAtiva(userId: number, animalId: number): Promise<{ dataBaixa: string | Date | null } | null>;
  brincoAtivo(userId: number, fazendaId: number, brinco: string): Promise<{ id: number } | null>;
  rfidAtivo(userId: number, rfid: string): Promise<{ id: number } | null>;
  inserirParto(row: {
    userId: number;
    femeaId: number;
    machoId: number | null;
    resultado: string;
    observacoes: string | null;
    dataCobertura: string;
  }): Promise<number>;
  fecharPrevisoes(userId: number, femeaId: number, dataParto: string): Promise<void>;
  inserirAnimal(row: {
    userId: number;
    brinco: string;
    brincoEletronico: string | null;
    nome: string | null;
    raca: string | null;
    sexo: "macho" | "femea";
    dataNascimento: string;
    pesoAtual: string | null;
    categoria: string;
    loteId: number | null;
    pastoId: number | null;
    fazendaId: number;
    maeId: number;
    paiId: number | null;
  }): Promise<number>;
  inserirMovimento(row: ReturnType<typeof buildEntradaInicialLoteMovimentacao>): Promise<void>;
  inserirVinculo(row: { userId: number; partoRegistroId: number; criaAnimalId: number; ordem: number }): Promise<void>;
  inserirPesagem(row: { userId: number; animalId: number; peso: string; data: string }): Promise<number>;
  aposTravas?(): Promise<void>;
  aposParto?(): Promise<void>;
  aposCria?(indice: number): Promise<void>;
  aposHistorico?(): Promise<void>;
};

export type IoParto = {
  emTransacao<T>(fn: (tx: ConsultaParto) => Promise<T>): Promise<T>;
};

export type PedidoParto = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: RegistrarPartoComCriasInput;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type RecusaParto = {
  ok: false;
  motivo: MotivoOperacional | "nao_encontrado" | "invalido";
  mensagem: string;
};

export type PartoOk = {
  ok: true;
  titularUserId: number;
  partoRegistroId: number;
  isNatimorto: boolean;
  paiId: number | null;
  crias: CriaPartoEspelho[];
};

class PartoContextoMudou extends Error {
  constructor() {
    super("A matriz mudou durante o parto.");
  }
}

function recusa(motivo: RecusaParto["motivo"], mensagem: string): RecusaParto {
  return { ok: false, motivo, mensagem };
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

export function erroRegistrarParto(resultado: RecusaParto): TRPCError {
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
      return new TRPCError({ code: "NOT_FOUND", message: MSG_PARTO_MATRIZ_AUSENTE });
  }
}

function idsPositivos(valores: Array<number | null | undefined>): number[] {
  return [...new Set(valores.filter((id): id is number => id != null && id > 0))].sort((a, b) => a - b);
}

async function executar<T>(trabalho: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    try {
      return await trabalho();
    } catch (error) {
      ultimo = error;
      if (error instanceof TRPCError) throw error;
      if ((error instanceof PartoContextoMudou || ehDeadlock(error)) && tentativa < TENTATIVAS - 1) continue;
      if (bancoIndisponivel(error)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      }
      throw error;
    }
  }
  throw ultimo;
}

export async function registrarPartoAutorizado(io: IoParto, pedido: PedidoParto): Promise<PartoOk | RecusaParto> {
  const negocio = validateRegistrarPartoComCriasBusinessRules(pedido.input);
  if (!negocio.ok) throw new TRPCError({ code: "BAD_REQUEST", message: negocio.message });
  const dataISO = validarDataParto(pedido.input.dataParto);
  if (!dataISO.ok) throw new TRPCError({ code: "BAD_REQUEST", message: dataISO.message });
  const resultado = validateReproResultadoForSave({
    sexo: "femea",
    tipo: "Parto",
    resultado: pedido.input.resultado,
    descricaoResultadoOutro: pedido.input.descricaoResultadoOutro,
  });
  if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.message });

  return executar(() => io.emTransacao((tx) => gravar(tx, pedido, dataISO.dataISO, negocio.isNatimorto)));
}

function validarDataParto(valor: string): { ok: true; dataISO: string } | { ok: false; message: string } {
  const dataISO = String(valor).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return { ok: false, message: MSG_REPRO_DATA_INVALIDA };
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (dataISO > hojeISO) return { ok: false, message: MSG_REPRO_DATA_FUTURA };
  return { ok: true, dataISO };
}

async function gravar(
  tx: ConsultaParto,
  pedido: PedidoParto,
  dataISO: string,
  isNatimorto: boolean,
): Promise<PartoOk | RecusaParto> {
  const espiada = await tx.espiarAnimal(pedido.input.femeaId);
  if (!espiada) return recusa("nao_encontrado", MSG_PARTO_MATRIZ_AUSENTE);
  const registrosEspiados = espiada.userId > 0
    ? await tx.espiarRegistros(espiada.userId, espiada.id)
    : [];
  const paiChutado = resolvePaiIdFromRegistros(registrosEspiados, dataISO, pedido.input.machoId);
  const lotes = idsPositivos([
    espiada.loteId,
    ...(pedido.input.crias ?? []).map((cria) => cria.loteId),
  ]);
  for (const loteId of lotes) await tx.travaLote(loteId);

  const authPedido: PedidoAutorizacaoPersistida = {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_PARTO,
    fazendaId: espiada.fazendaId,
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
    return recusa("nao_encontrado", MSG_PARTO_MATRIZ_AUSENTE);
  }
  const titular = auth.contexto.titularUserId;
  if (espiada.userId !== titular) return recusa("nao_encontrado", MSG_PARTO_MATRIZ_AUSENTE);

  const pastos = idsPositivos([
    espiada.pastoId,
    ...(pedido.input.crias ?? []).map((cria) => cria.pastoId),
  ]);
  const pastoPorId = new Map<number, PastoPartoLinha>();
  for (const pastoId of pastos) {
    const pasto = await tx.travaPasto(pastoId);
    if (!pasto || pasto.userId !== titular) return recusa("nao_encontrado", MSG_PARTO_PASTO_INCOMPATIVEL);
    pastoPorId.set(pastoId, pasto);
  }
  const lotePorId = new Map<number, LotePartoLinha>();
  for (const loteId of lotes) {
    const lote = await tx.travaLote(loteId);
    if (!lote || lote.userId !== titular) return recusa("nao_encontrado", MSG_PARTO_LOTE_INCOMPATIVEL);
    lotePorId.set(loteId, lote);
  }

  const animaisIds = idsPositivos([pedido.input.femeaId, pedido.input.machoId, paiChutado]);
  const animalPorId = new Map<number, AnimalPartoLinha>();
  for (const id of animaisIds) {
    const animal = await tx.travaAnimal(id);
    if (animal) animalPorId.set(id, animal);
  }
  const matriz = animalPorId.get(pedido.input.femeaId);
  if (!matriz || matriz.userId !== titular) return recusa("nao_encontrado", MSG_PARTO_MATRIZ_AUSENTE);
  if (
    matriz.fazendaId !== espiada.fazendaId
    || matriz.loteId !== espiada.loteId
    || matriz.pastoId !== espiada.pastoId
    || matriz.status !== espiada.status
  ) {
    throw new PartoContextoMudou();
  }
  if (matriz.fazendaId == null) return recusa("invalido", MSG_PARTO_FAZENDA_DIVERGENTE);
  if (pedido.input.fazendaId !== matriz.fazendaId) return recusa("invalido", MSG_PARTO_FAZENDA_DIVERGENTE);
  if (matriz.sexo !== "femea") return recusa("invalido", MSG_PARTO_FEMEA_OBRIGATORIA);
  const eleg = buildReproAnimalElegibilidadeInput(matriz);
  if (!isReproTipoPermitidoParaAnimal(eleg, "Parto")) {
    return recusa("invalido", mensagemReproInelegivelAnimal(eleg));
  }
  const baixa = await tx.baixaAtiva(titular, matriz.id);
  const manejo = avaliarManejoVsBaixa({ status: matriz.status, dataBaixa: baixa?.dataBaixa, dataEvento: dataISO });
  if (!manejo.permitido) return recusa("invalido", manejo.mensagem);

  const registros = await tx.travaRegistros(titular, matriz.id);
  const paiResolvido = resolvePaiIdFromRegistros(registros, dataISO, pedido.input.machoId);
  if (paiResolvido != null && !animalPorId.has(paiResolvido)) throw new PartoContextoMudou();
  let paiId: number | null = null;
  if (paiResolvido != null) {
    const pai = animalPorId.get(paiResolvido);
    if (!pai || pai.userId !== titular) return recusa("nao_encontrado", MSG_PARTO_REPRODUTOR_AUSENTE);
    if (pai.id === matriz.id || pai.sexo !== "macho") return recusa("invalido", MSG_PARTO_REPRODUTOR_AUSENTE);
    if (pai.fazendaId !== matriz.fazendaId) return recusa("invalido", MSG_PARTO_REPRODUTOR_OUTRA_FAZENDA);
    if (isMachoBloqueadoReproPorCastracao(buildReproAnimalElegibilidadeInput(pai))) {
      return recusa("invalido", MSG_REPRO_MACHO_CASTRADO_REPRODUTOR);
    }
    paiId = pai.id;
  }

  const criasEntrada = pedido.input.crias ?? [];
  const locais = criasEntrada.map((cria) => {
    const loteId = loteIdEfetivoParaHistorico(cria.loteId ?? matriz.loteId);
    const pastoId = loteIdEfetivoParaHistorico(cria.pastoId ?? matriz.pastoId);
    if (loteId != null) {
      const lote = lotePorId.get(loteId);
      if (!lote || (lote.fazendaId != null && lote.fazendaId !== matriz.fazendaId)) {
        return { erro: MSG_PARTO_LOTE_INCOMPATIVEL as string };
      }
    }
    if (pastoId != null) {
      const pasto = pastoPorId.get(pastoId);
      if (!pasto || pasto.fazendaId !== matriz.fazendaId) return { erro: MSG_PARTO_PASTO_INCOMPATIVEL as string };
    }
    return { loteId, pastoId };
  });
  const localRuim = locais.find((item) => "erro" in item);
  if (localRuim && "erro" in localRuim) return recusa("invalido", localRuim.erro);

  for (const cria of criasEntrada) {
    const ocupado = await tx.brincoAtivo(titular, matriz.fazendaId, cria.brinco);
    if (ocupado) return recusa("invalido", buildBrincoAtivoConflitoMessage(cria.brinco.trim()));
    if (normalizeRfidKey(cria.brincoEletronico)) {
      const chip = await tx.rfidAtivo(titular, normalizeRfidKey(cria.brincoEletronico));
      if (chip) return recusa("invalido", MSG_RFID_ATIVO_CONFLITO);
    }
  }

  if (tx.aposTravas) await tx.aposTravas();

  const executor = await tx.usuario(pedido.executorId);
  const usuarioNome = pedido.input.responsavel?.trim() || executor?.name?.trim() || "Usuário";
  const observacoes = packReproObservacoes(
    pedido.input.observacoes,
    undefined,
    pedido.input.responsavel,
    pedido.input.descricaoResultadoOutro,
  ) ?? null;

  const partoRegistroId = await tx.inserirParto({
    userId: titular,
    femeaId: matriz.id,
    machoId: paiId,
    resultado: pedido.input.resultado,
    observacoes,
    dataCobertura: dataISO,
  });
  await tx.fecharPrevisoes(titular, matriz.id, dataISO);
  if (tx.aposParto) await tx.aposParto();

  const crias: CriaPartoEspelho[] = [];
  for (let i = 0; i < criasEntrada.length; i++) {
    const cria = criasEntrada[i]!;
    const local = locais[i] as { loteId: number | null; pastoId: number | null };
    const animalId = await tx.inserirAnimal({
      userId: titular,
      brinco: cria.brinco.trim(),
      brincoEletronico: normalizeRfidKey(cria.brincoEletronico) || null,
      nome: cria.nome?.trim() || null,
      raca: cria.raca?.trim() || null,
      sexo: cria.sexo,
      dataNascimento: dataISO,
      pesoAtual: cria.pesoNascimento?.trim() || null,
      categoria: cria.categoria!.trim(),
      loteId: local.loteId,
      pastoId: local.pastoId,
      fazendaId: matriz.fazendaId,
      maeId: matriz.id,
      paiId,
    });
    if (local.loteId != null) {
      await tx.inserirMovimento(buildEntradaInicialLoteMovimentacao({
        userId: titular,
        animalId,
        loteDestinoId: local.loteId,
        pastoOrigemId: null,
        pastoDestinoId: local.pastoId,
        fazendaId: matriz.fazendaId,
        dataMovimentacao: dataISO,
        usuarioNome,
      }));
      if (tx.aposHistorico) await tx.aposHistorico();
    }
    await tx.inserirVinculo({ userId: titular, partoRegistroId, criaAnimalId: animalId, ordem: cria.ordem ?? i + 1 });
    let pesagemId: number | undefined;
    const peso = cria.pesoNascimento?.trim();
    if (peso) {
      pesagemId = await tx.inserirPesagem({
        userId: titular,
        animalId,
        peso,
        data: dataCivilParaColunaDate(dataISO),
      });
    }
    crias.push({
      animalId,
      ordem: cria.ordem ?? i + 1,
      pesagemId,
      loteDestinoId: local.loteId,
      pastoId: local.pastoId,
      fazendaId: matriz.fazendaId,
      brinco: cria.brinco.trim(),
    });
    if (tx.aposCria) await tx.aposCria(i);
  }

  return { ok: true, titularUserId: titular, partoRegistroId, isNatimorto, paiId, crias };
}

export const MENSAGENS_PARTO_REAPROVEITADAS = {
  MSG_PARTO_CRIAS_OBRIGATORIAS,
  MSG_PARTO_NATIMORTO_SEM_CRIAS,
  MSG_PARTO_BRINCO_DUPLICADO_LOTE,
  MSG_PARTO_CATEGORIA_OBRIGATORIA,
  MSG_PARTO_CATEGORIA_INCOMPATIVEL,
  MSG_REPRO_DATA_FUTURA,
  MSG_REPRO_DATA_INVALIDA,
  normalizeBrincoKey,
};
