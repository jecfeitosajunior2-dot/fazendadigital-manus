import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applySemenEntradaAgregacao,
  applySemenSaidaIa,
  buildSemenReprodutorKey,
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
  type SemenStatus,
  validateSemenPartidaReprodutorCompat,
} from "../shared/semenEstoque";
import { createLocalReproducaoRegistro } from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";
import type {
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

const dataDir = path.resolve(process.cwd(), ".local-data");
const partidasFile = path.join(dataDir, "semen-partidas.json");
const movimentacoesFile = path.join(dataDir, "semen-movimentacoes.json");

/** Transação real só é garantida no MySQL; fallback local não é atômico. */
export const MSG_SEMEN_LOCAL_NAO_ATOMICO =
  "Modo local: persistência em arquivo JSON sem transação atômica.";

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
  const movimentacoes = await readJsonFile<SemenMovimentacaoRow[]>(movimentacoesFile, []);
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
export function __seedSemenLocalStoreForTests(seed: Partial<LocalStore>): void {
  memoryStore = {
    partidas: seed.partidas ?? [],
    movimentacoes: seed.movimentacoes ?? [],
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

  return store.partidas
    .filter(p => p.userId === userId && p.fazendaId === input.fazendaId)
    .filter(p => {
      if (input.status && input.status !== "todos" && p.status !== input.status) return false;
      if (!search) return true;
      return (
        p.partida.toLowerCase().includes(search) ||
        (p.reprodutorTexto ?? "").toLowerCase().includes(search) ||
        (p.centralOrigem ?? "").toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      const ua = String(a.updatedAt ?? a.createdAt ?? "");
      const ub = String(b.updatedAt ?? b.createdAt ?? "");
      if (ua !== ub) return ub.localeCompare(ua);
      return b.id - a.id;
    })
    .map(enrichLocalPartida);
}

export async function listSemenPartidasDisponiveisInseminacaoLocal(
  userId: number,
  input: {
    fazendaId: number;
    origem: SemenOrigemReprodutor;
    machoId?: number;
    reprodutorTexto?: string;
  },
): Promise<SemenPartidaDisponivelInseminacao[]> {
  await assertFazendaDoUsuario(userId, input.fazendaId);
  const store = await loadStore();

  let reprodutorKey: string | null = null;
  if (input.origem === SEMEN_ORIGEM_INTERNO) {
    const machoId = Number(input.machoId);
    if (!Number.isFinite(machoId) || machoId <= 0) return [];
  } else {
    const reprodutorTexto = input.reprodutorTexto?.trim();
    if (!reprodutorTexto) return [];
    try {
      reprodutorKey = buildSemenReprodutorKey({
        origem: SEMEN_ORIGEM_EXTERNO,
        reprodutorTexto,
      });
    } catch {
      return [];
    }
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

  return { ...enrichLocalPartida(row), movimentacoes };
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
