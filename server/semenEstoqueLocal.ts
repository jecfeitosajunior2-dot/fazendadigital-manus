import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applySemenEntradaAgregacao,
  applySemenSaidaIa,
  formatSemenReprodutorDisplay,
  formatSemenStatusLabel,
  MSG_SEMEN_PARTIDA_INCOMPATIVEL,
  MSG_SEMEN_PARTIDA_NAO_ENCONTRADA,
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  type SemenEntradaValidada,
  type SemenOrigemReprodutor,
  type SemenPartidaDisponivelInseminacao,
  type SemenReprodutorExternoDisponivel,
  type SemenStatus,
  validateSemenPartidaReprodutorCompat,
  aggregateSemenReprodutoresExternosDisponiveis,
  resolveSemenReprodutorKeyExternoConsulta,
} from "../shared/semenEstoque";
import { toDateOnlyISO } from "../shared/carenciaAnimal";
import {
  evaluateSemenCorrecaoEntrada,
  SEMEN_CORRECAO_LINK_VAZIO,
  validateSemenCorrecaoDados,
  validateSemenCorrecaoMotivo,
  withSemenCorrecaoFields,
  type SemenCorrecaoLinkFields,
} from "../shared/semenEstoqueLedger";
import {
  buildSemenAjusteMovimentacao,
  evaluateSemenAjusteEstoque,
  validateSemenAjusteMotivo,
} from "../shared/semenEstoqueAjuste";
import { randomUUID } from "node:crypto";
import { createLocalReproducaoRegistro } from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";
import type {
  SemenAjustarEstoqueInput,
  SemenAjustarEstoqueResult,
  SemenCorrigirEntradaInput,
  SemenCorrigirEntradaResult,
  SemenEntradaResumo,
  SemenMovimentacaoRow,
  SemenPartidaDetalhe,
  SemenPartidaListItem,
  SemenPartidaRow,
  SemenRegistrarEntradaResult,
  RegistrarInseminacaoComSemenParams,
  RegistrarInseminacaoComSemenResult,
} from "./semenEstoqueDb";
import { validateSemenMachoInterno } from "./validateSemenMachoId";
import { enrichSemenMovimentacoesDisplayLocal } from "./semenMovimentacaoEnrich";
import { sortSemenPartidasByMovimentacoes } from "../shared/semenPartidaSort";
import { calcularValorAtualEstoqueSemen, calcularValorAtualEstoqueSemenPorPartida } from "../shared/semenEstoqueValor";

const dataDir = path.resolve(process.cwd(), ".local-data");
const partidasFile = path.join(dataDir, "semen-partidas.json");
const movimentacoesFile = path.join(dataDir, "semen-movimentacoes.json");

/** Transação real só é garantida no MySQL; fallback local não é atômico. */
export const MSG_SEMEN_LOCAL_NAO_ATOMICO =
  "Modo local: persistência em arquivo JSON sem transação atômica.";

type SemenMovimentacaoSeed = Omit<SemenMovimentacaoRow, keyof SemenCorrecaoLinkFields> &
  Partial<SemenCorrecaoLinkFields>;

type LocalStore = {
  partidas: SemenPartidaRow[];
  movimentacoes: SemenMovimentacaoRow[];
  nextPartidaId: number;
  nextMovId: number;
};

let memoryStore: LocalStore | null = null;

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile<T>(file: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function loadStore(): Promise<LocalStore> {
  if (memoryStore) return memoryStore;

  const partidas = await readJsonFile<SemenPartidaRow[]>(partidasFile, []);
  const movimentacoesRaw = await readJsonFile<SemenMovimentacaoSeed[]>(movimentacoesFile, []);
  const movimentacoes = movimentacoesRaw.map(withSemenCorrecaoFields);
  const maxPartidaId = partidas.reduce((m, p) => Math.max(m, p.id), 0);
  const maxMovId = movimentacoes.reduce((m, p) => Math.max(m, p.id), 0);

  memoryStore = {
    partidas,
    movimentacoes,
    nextPartidaId: maxPartidaId + 1,
    nextMovId: maxMovId + 1,
  };
  return memoryStore;
}

/** Resumo mínimo para enriquecer central em Sêmen utilizado (sem saldo). */
export async function listSemenPartidasCentralLocal(
  userId: number,
): Promise<
  {
    id: number;
    centralOrigem: string | null;
    reprodutorTexto: string | null;
    reprodutorKey: string | null;
    origemReprodutor: string | null;
    machoId: number | null;
  }[]
> {
  const store = await loadStore();
  return store.partidas
    .filter(p => p.userId === userId)
    .map(p => ({
      id: p.id,
      centralOrigem: p.centralOrigem ?? null,
      reprodutorTexto: p.reprodutorTexto ?? null,
      reprodutorKey: p.reprodutorKey ?? null,
      origemReprodutor: p.origemReprodutor ?? null,
      machoId: p.machoId ?? null,
    }));
}

async function persistStore(store: LocalStore): Promise<void> {
  await writeJsonFile(partidasFile, store.partidas);
  await writeJsonFile(movimentacoesFile, store.movimentacoes);
}

/** Apenas para testes. */
export function __resetSemenLocalStoreForTests(): void {
  memoryStore = {
    partidas: [],
    movimentacoes: [],
    nextPartidaId: 1,
    nextMovId: 1,
  };
}

/** Apenas para testes — injeta estado em memória. */
export function __seedSemenLocalStoreForTests(seed: {
  partidas?: SemenPartidaRow[];
  movimentacoes?: SemenMovimentacaoSeed[];
  nextPartidaId?: number;
  nextMovId?: number;
}): void {
  memoryStore = {
    partidas: seed.partidas ?? [],
    movimentacoes: (seed.movimentacoes ?? []).map(withSemenCorrecaoFields),
    nextPartidaId: seed.nextPartidaId ?? 1,
    nextMovId: seed.nextMovId ?? 1,
  };
}

function enrichLocalPartida(row: SemenPartidaRow): SemenPartidaListItem {
  return {
    ...row,
    reprodutorDisplay: formatSemenReprodutorDisplay({
      origem: row.origemReprodutor,
      reprodutorTexto: row.reprodutorTexto,
      machoDisplay: row.origemReprodutor === SEMEN_ORIGEM_INTERNO ? row.reprodutorTexto : null,
    }),
    statusLabel: formatSemenStatusLabel(row.status as SemenStatus),
    valorAtualEstoque: 0,
  };
}

export async function listSemenPartidasLocal(
  userId: number,
  input: {
    fazendaId: number;
    search?: string;
    status?: SemenStatus | "todos";
  },
): Promise<SemenPartidaListItem[]> {
  await assertFazendaDoUsuario(userId, input.fazendaId);
  const store = await loadStore();
  const search = input.search?.trim().toLowerCase();

  const filtradas = store.partidas
    .filter(p => p.userId === userId && p.fazendaId === input.fazendaId)
    .filter(p => {
      if (input.status && input.status !== "todos" && p.status !== input.status) return false;
      if (!search) return true;
      return (
        p.partida.toLowerCase().includes(search) ||
        (p.reprodutorTexto ?? "").toLowerCase().includes(search) ||
        (p.centralOrigem ?? "").toLowerCase().includes(search)
      );
    });

  const sorted = sortSemenPartidasByMovimentacoes(filtradas, store.movimentacoes).map(enrichLocalPartida);
  const valores = calcularValorAtualEstoqueSemenPorPartida(
    store.movimentacoes.filter(m => m.userId === userId),
  );
  return sorted.map(p => ({
    ...p,
    valorAtualEstoque: valores.get(p.id) ?? 0,
  }));
}

export async function listSemenPartidasDisponiveisInseminacaoLocal(
  userId: number,
  input: {
    fazendaId: number;
    origem: SemenOrigemReprodutor;
    machoId?: number;
    reprodutorTexto?: string;
    reprodutorKey?: string;
  },
): Promise<SemenPartidaDisponivelInseminacao[]> {
  await assertFazendaDoUsuario(userId, input.fazendaId);
  const store = await loadStore();

  let reprodutorKey: string | null = null;
  if (input.origem === SEMEN_ORIGEM_INTERNO) {
    const machoId = Number(input.machoId);
    if (!Number.isFinite(machoId) || machoId <= 0) return [];
  } else {
    reprodutorKey = resolveSemenReprodutorKeyExternoConsulta({
      reprodutorKey: input.reprodutorKey,
      reprodutorTexto: input.reprodutorTexto,
    });
    if (!reprodutorKey) return [];
  }

  return store.partidas
    .filter(p => {
      if (p.userId !== userId || p.fazendaId !== input.fazendaId) return false;
      if (!(p.saldoDoses > 0)) return false;
      if (input.origem === SEMEN_ORIGEM_INTERNO) {
        return p.origemReprodutor === SEMEN_ORIGEM_INTERNO && p.machoId === input.machoId;
      }
      return p.origemReprodutor === SEMEN_ORIGEM_EXTERNO && p.reprodutorKey === reprodutorKey;
    })
    .sort((a, b) => {
      const ua = String(a.updatedAt ?? a.createdAt ?? "");
      const ub = String(b.updatedAt ?? b.createdAt ?? "");
      if (ua !== ub) return ub.localeCompare(ua);
      return b.id - a.id;
    })
    .map(p => {
      const enriched = enrichLocalPartida(p);
      return {
        id: enriched.id,
        partida: enriched.partida,
        centralOrigem: enriched.centralOrigem,
        saldoDoses: enriched.saldoDoses,
        custoUnitario: enriched.custoUnitario,
        reprodutorDisplay: enriched.reprodutorDisplay,
      };
    });
}

export async function listSemenReprodutoresExternosDisponiveisLocal(
  userId: number,
  fazendaId: number,
): Promise<SemenReprodutorExternoDisponivel[]> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const store = await loadStore();
  return aggregateSemenReprodutoresExternosDisponiveis(
    store.partidas.filter(p => p.userId === userId && p.fazendaId === fazendaId),
  );
}

export async function registrarInseminacaoComSemenLocal(
  userId: number,
  params: RegistrarInseminacaoComSemenParams,
  packObservacoes: (
    observacoes: string | null | undefined,
    extras: {
      partidaSemen: string;
      inseminador?: string;
      ecc?: number;
      semenPartidaId: number;
      custoDoseSemen: number | null;
      centralOrigem?: string | null;
    },
  ) => string | null,
): Promise<RegistrarInseminacaoComSemenResult> {
  await assertFazendaDoUsuario(userId, params.fazendaId);
  const store = await loadStore();
  const partida = store.partidas.find(
    p => p.id === params.semenPartidaId && p.userId === userId,
  );
  if (!partida) throw new Error(MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);
  if (partida.fazendaId !== params.fazendaId) throw new Error(MSG_SEMEN_PARTIDA_INCOMPATIVEL);

  const compat = validateSemenPartidaReprodutorCompat({
    origem: params.origemReprodutor,
    partidaMachoId: partida.machoId,
    partidaReprodutorKey: partida.reprodutorKey,
    machoId: params.machoIdReprodutor,
    reprodutorTexto: params.reprodutorTextoExterno,
  });
  if (!compat) throw new Error(MSG_SEMEN_PARTIDA_INCOMPATIVEL);

  const saida = applySemenSaidaIa({
    saldoAnterior: partida.saldoDoses,
    custoUnitario: partida.custoUnitario,
  });

  const custoUnitarioStr = partida.custoUnitario ?? "0";
  const custoUnitarioNum = parseFloat(String(custoUnitarioStr).replace(",", "."));
  const custoDoseSnapshot =
    Number.isFinite(custoUnitarioNum) && custoUnitarioNum > 0 ? custoUnitarioNum : null;

  const observacoesPersistidas = packObservacoes(params.observacoes, {
    partidaSemen: partida.partida,
    inseminador: params.inseminador,
    ecc: params.ecc,
    semenPartidaId: params.semenPartidaId,
    custoDoseSemen: custoDoseSnapshot,
    centralOrigem: partida.centralOrigem,
  });

  const repro = await createLocalReproducaoRegistro(userId, {
    femeaId: params.femeaId,
    machoId: params.machoId ?? undefined,
    tipo: "Inseminação",
    dataCobertura: params.dataCobertura.toISOString().slice(0, 10),
    dataPrevistoParto: params.dataPrevistoParto
      ? params.dataPrevistoParto.toISOString().slice(0, 10)
      : undefined,
    resultado: params.resultado ?? undefined,
    observacoes: observacoesPersistidas ?? undefined,
  });

  const now = new Date().toISOString();
  partida.saldoDoses = saida.novoSaldo;
  partida.custoUnitario = saida.novoCustoUnitario;
  partida.status = saida.status;
  partida.updatedAt = now as unknown as Date;

  const movId = store.nextMovId++;
  const dataMov = params.dataCobertura.toISOString().slice(0, 10);
  const custoTotalStr = custoDoseSnapshot != null ? custoDoseSnapshot.toFixed(2) : "0.00";

  store.movimentacoes.push({
    id: movId,
    partidaId: partida.id,
    userId,
    fazendaId: params.fazendaId,
    tipo: SEMEN_MOV_TIPO_SAIDA_IA,
    dataEntrada: dataMov,
    quantidadeDoses: 1,
    custoTotal: custoTotalStr,
    custoUnitario: custoUnitarioStr,
    observacoes: `Inseminação — matriz #${params.femeaId} · registro repro #${repro.id}`,
    createdAt: now as unknown as Date,
    ...SEMEN_CORRECAO_LINK_VAZIO,
  });

  await persistStore(store);
  return { id: repro.id, movimentacaoId: movId };
}

export async function getSemenPartidaByIdLocal(
  userId: number,
  partidaId: number,
): Promise<SemenPartidaDetalhe | null> {
  const store = await loadStore();
  const row = store.partidas.find(p => p.id === partidaId && p.userId === userId);
  if (!row) return null;

  const movimentacoesRaw = store.movimentacoes
    .filter(m => m.partidaId === partidaId && m.userId === userId)
    .sort((a, b) => {
      if (a.dataEntrada !== b.dataEntrada) return b.dataEntrada.localeCompare(a.dataEntrada);
      return b.id - a.id;
    });

  const movimentacoes = await enrichSemenMovimentacoesDisplayLocal(userId, movimentacoesRaw);

  return {
    ...enrichLocalPartida(row),
    movimentacoes,
    valorAtualEstoque: calcularValorAtualEstoqueSemen(movimentacoesRaw),
  };
}

export async function getSemenEntradaResumoLocal(
  userId: number,
  movimentacaoId: number,
): Promise<SemenEntradaResumo | null> {
  const store = await loadStore();
  const mov = store.movimentacoes.find(m => m.id === movimentacaoId && m.userId === userId);
  if (!mov || mov.tipo !== SEMEN_MOV_TIPO_ENTRADA) return null;

  const partida = store.partidas.find(p => p.id === mov.partidaId && p.userId === userId);
  if (!partida) return null;

  const enriched = enrichLocalPartida(partida);
  return {
    movimentacaoId: mov.id,
    partidaId: enriched.id,
    fazendaId: enriched.fazendaId,
    dataEntrada: mov.dataEntrada,
    quantidadeDoses: mov.quantidadeDoses,
    custoTotal: mov.custoTotal,
    custoUnitario: mov.custoUnitario,
    reprodutorDisplay: enriched.reprodutorDisplay,
    partida: enriched.partida,
    centralOrigem: enriched.centralOrigem,
    origemReprodutor: enriched.origemReprodutor,
    saldoAtual: enriched.saldoDoses,
    custoMedioAtual: enriched.custoUnitario,
    statusAtual: enriched.status as SemenStatus,
    statusLabel: enriched.statusLabel,
  };
}

export async function registrarEntradaSemenLocal(
  userId: number,
  fazendaId: number,
  entrada: SemenEntradaValidada,
): Promise<SemenRegistrarEntradaResult> {
  await assertFazendaDoUsuario(userId, fazendaId);

  let reprodutorTexto = entrada.reprodutorTexto;
  let machoId = entrada.machoId;

  if (entrada.origem === SEMEN_ORIGEM_INTERNO && machoId != null) {
    const validado = await validateSemenMachoInterno(userId, fazendaId, machoId);
    machoId = validado.machoId;
    reprodutorTexto = validado.reprodutorTexto;
  }

  const store = await loadStore();
  const now = new Date().toISOString();
  const custoTotalStr = entrada.custoTotal.toFixed(2);

  const existente = store.partidas.find(
    p =>
      p.userId === userId &&
      p.fazendaId === fazendaId &&
      p.reprodutorKey === entrada.reprodutorKey &&
      p.partida === entrada.partida,
  );

  if (existente) {
    const agreg = applySemenEntradaAgregacao({
      saldoAnterior: existente.saldoDoses,
      custoUnitarioAnterior: existente.custoUnitario,
      quantidadeEntrada: entrada.quantidadeDoses,
      custoTotalEntrada: entrada.custoTotal,
    });

    existente.saldoDoses = agreg.novoSaldo;
    existente.custoUnitario = agreg.novoCustoUnitario;
    existente.status = agreg.status;
    existente.centralOrigem = entrada.centralOrigem ?? existente.centralOrigem;
    existente.reprodutorTexto = reprodutorTexto ?? existente.reprodutorTexto;
    existente.updatedAt = now as unknown as Date;

    const movId = store.nextMovId++;
    store.movimentacoes.push({
      id: movId,
      partidaId: existente.id,
      userId,
      fazendaId,
      tipo: SEMEN_MOV_TIPO_ENTRADA,
      dataEntrada: entrada.dataEntrada,
      quantidadeDoses: entrada.quantidadeDoses,
      custoTotal: custoTotalStr,
      custoUnitario: entrada.custoUnitario,
      observacoes: entrada.observacoes,
      createdAt: now as unknown as Date,
      ...SEMEN_CORRECAO_LINK_VAZIO,
    });

    await persistStore(store);
    return {
      partidaId: existente.id,
      movimentacaoId: movId,
      novaEntrada: false,
      saldoAtual: agreg.novoSaldo,
      custoMedioAtual: agreg.novoCustoUnitario,
    };
  }

  const partidaId = store.nextPartidaId++;
  const agreg = applySemenEntradaAgregacao({
    saldoAnterior: 0,
    custoUnitarioAnterior: null,
    quantidadeEntrada: entrada.quantidadeDoses,
    custoTotalEntrada: entrada.custoTotal,
  });

  store.partidas.push({
    id: partidaId,
    userId,
    fazendaId,
    origemReprodutor: entrada.origem,
    reprodutorKey: entrada.reprodutorKey,
    machoId,
    reprodutorTexto,
    partida: entrada.partida,
    centralOrigem: entrada.centralOrigem,
    saldoDoses: agreg.novoSaldo,
    custoUnitario: agreg.novoCustoUnitario,
    status: agreg.status,
    observacoes: entrada.observacoes,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  });

  const movId = store.nextMovId++;
  store.movimentacoes.push({
    id: movId,
    partidaId,
    userId,
    fazendaId,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    dataEntrada: entrada.dataEntrada,
    quantidadeDoses: entrada.quantidadeDoses,
    custoTotal: custoTotalStr,
    custoUnitario: entrada.custoUnitario,
    observacoes: entrada.observacoes,
    createdAt: now as unknown as Date,
    ...SEMEN_CORRECAO_LINK_VAZIO,
  });

  await persistStore(store);
  return {
    partidaId,
    movimentacaoId: movId,
    novaEntrada: true,
    saldoAtual: agreg.novoSaldo,
    custoMedioAtual: agreg.novoCustoUnitario,
  };
}

/**
 * Semântica equivalente ao MySQL.
 * Limitação: persistência em dois arquivos JSON não é atômica (ver MSG_SEMEN_LOCAL_NAO_ATOMICO).
 */
export async function corrigirEntradaSemenLocal(
  userId: number,
  input: SemenCorrigirEntradaInput,
): Promise<SemenCorrigirEntradaResult> {
  const motivo = validateSemenCorrecaoMotivo(input.motivoCodigo, input.motivoDescricao);
  if (!motivo.ok) throw new Error(motivo.message);
  const dados = validateSemenCorrecaoDados({
    quantidadeDoses: input.quantidadeDoses,
    custoTotal: input.custoTotal,
    dataEntrada: input.dataEntrada,
  });
  if (!dados.ok) throw new Error(dados.message);

  const store = await loadStore();
  const original = store.movimentacoes.find(m => m.id === input.movimentacaoId && m.userId === userId);
  if (!original) throw new Error("Movimentação de entrada não encontrada.");

  const partida = store.partidas.find(p => p.id === original.partidaId && p.userId === userId);
  if (!partida) throw new Error(MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);

  const daPartida = store.movimentacoes.filter(m => m.partidaId === partida.id && m.userId === userId);
  const now = new Date();
  const nowIso = now.toISOString();
  const estornoId = store.nextMovId++;
  const novaEntradaId = store.nextMovId++;

  const evaluated = evaluateSemenCorrecaoEntrada({
    original: withSemenCorrecaoFields(original),
    movimentacoes: daPartida.map(withSemenCorrecaoFields),
    saldoAtual: partida.saldoDoses,
    dadosNovos: dados.value,
    dataCorrecao: toDateOnlyISO(now),
    nowIso,
    nextEstornoId: estornoId,
    nextEntradaId: novaEntradaId,
    grupoCorrecaoId: randomUUID(),
    motivoTexto: motivo.texto,
  });
  if (!evaluated.ok) {
    store.nextMovId -= 2;
    throw new Error(evaluated.message);
  }

  const createdAt = nowIso as unknown as Date;
  store.movimentacoes.push({
    id: estornoId,
    partidaId: partida.id,
    userId,
    fazendaId: partida.fazendaId,
    tipo: evaluated.estorno.tipo,
    dataEntrada: evaluated.estorno.dataEntrada,
    quantidadeDoses: evaluated.estorno.quantidadeDoses,
    custoTotal: evaluated.estorno.custoTotal,
    custoUnitario: evaluated.estorno.custoUnitario,
    observacoes: evaluated.estorno.observacoes,
    createdAt,
    movimentacaoOrigemId: evaluated.estorno.movimentacaoOrigemId,
    grupoCorrecaoId: evaluated.estorno.grupoCorrecaoId,
    motivoCorrecao: evaluated.estorno.motivoCorrecao,
  });
  store.movimentacoes.push({
    id: novaEntradaId,
    partidaId: partida.id,
    userId,
    fazendaId: partida.fazendaId,
    tipo: evaluated.novaEntrada.tipo,
    dataEntrada: evaluated.novaEntrada.dataEntrada,
    quantidadeDoses: evaluated.novaEntrada.quantidadeDoses,
    custoTotal: evaluated.novaEntrada.custoTotal,
    custoUnitario: evaluated.novaEntrada.custoUnitario,
    observacoes: evaluated.novaEntrada.observacoes,
    createdAt,
    movimentacaoOrigemId: evaluated.novaEntrada.movimentacaoOrigemId,
    grupoCorrecaoId: evaluated.novaEntrada.grupoCorrecaoId,
    motivoCorrecao: evaluated.novaEntrada.motivoCorrecao,
  });

  partida.saldoDoses = evaluated.estadoFinal.saldoDoses;
  partida.custoUnitario = evaluated.estadoFinal.custoUnitario;
  partida.status = evaluated.estadoFinal.status;
  partida.updatedAt = createdAt;

  await persistStore(store);
  return {
    partidaId: partida.id,
    estornoId,
    novaEntradaId,
    saldoAtual: evaluated.estadoFinal.saldoDoses,
    custoMedioAtual: evaluated.estadoFinal.custoUnitario,
  };
}

/**
 * Semântica equivalente ao MySQL.
 * Limitação: persistência em dois arquivos JSON não é atômica (ver MSG_SEMEN_LOCAL_NAO_ATOMICO).
 */
export async function ajustarEstoqueSemenLocal(
  userId: number,
  input: SemenAjustarEstoqueInput,
): Promise<SemenAjustarEstoqueResult> {
  const motivo = validateSemenAjusteMotivo(input.motivoCodigo, input.motivoDescricao);
  if (!motivo.ok) throw new Error(motivo.message);

  const store = await loadStore();
  const partida = store.partidas.find(p => p.id === input.partidaId && p.userId === userId);
  if (!partida) throw new Error(MSG_SEMEN_PARTIDA_NAO_ENCONTRADA);

  const daPartida = store.movimentacoes.filter(m => m.partidaId === partida.id && m.userId === userId);
  const valorAtual = calcularValorAtualEstoqueSemen(daPartida.map(withSemenCorrecaoFields));
  const estado = evaluateSemenAjusteEstoque({
    saldoAtual: partida.saldoDoses,
    custoMedioAtual: partida.custoUnitario,
    valorAtual,
    modo: input.modo,
    saldoNovo: input.saldoNovo,
    valorNovo: input.valorNovo,
  });
  if (!estado.ok) throw new Error(estado.message);

  const now = new Date();
  const nowIso = now.toISOString();
  const movId = store.nextMovId++;
  const draft = buildSemenAjusteMovimentacao({
    estado: estado.value,
    dataOperacional: toDateOnlyISO(now),
    motivoTexto: motivo.texto,
    observacao: String(input.observacao ?? "").trim() || null,
  });

  store.movimentacoes.push({
    id: movId,
    partidaId: partida.id,
    userId,
    fazendaId: partida.fazendaId,
    tipo: draft.tipo,
    dataEntrada: draft.dataEntrada,
    quantidadeDoses: draft.quantidadeDoses,
    custoTotal: draft.custoTotal,
    custoUnitario: draft.custoUnitario,
    observacoes: draft.observacoes,
    createdAt: nowIso as unknown as Date,
    ...SEMEN_CORRECAO_LINK_VAZIO,
    motivoCorrecao: draft.motivoCorrecao,
  });

  partida.saldoDoses = estado.value.saldoNovo;
  partida.custoUnitario = estado.value.custoMedioNovo;
  partida.status = estado.value.status;
  partida.updatedAt = nowIso as unknown as Date;

  await persistStore(store);
  return {
    partidaId: partida.id,
    movimentacaoId: movId,
    saldoAtual: estado.value.saldoNovo,
    custoMedioAtual: estado.value.custoMedioNovo,
    valorAtualEstoque: estado.value.valorNovo,
  };
}
