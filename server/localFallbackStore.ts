import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFimCarenciaPorAnimal, toDateOnlyISO } from "../shared/carenciaAnimal";
import { mensagemExclusaoLoteBloqueada } from "../shared/loteExclusaoBloqueada";
import type { AvaliacaoExclusaoLote } from "../shared/loteExclusaoBloqueada";
import {
  agruparLotesPorLocalizacaoVigente,
  movimentacaoExibivelHistorico,
  resolverLocalizacaoAtualLote,
  type MovimentacaoPastoLoteRef,
} from "../shared/localizacaoAtualLote";

const dataDir = path.resolve(process.cwd(), ".local-data");
const fazendasFile = path.join(dataDir, "fazendas.json");
const pastosFile = path.join(dataDir, "pastos.json");
const benfeitoriasFile = path.join(dataDir, "benfeitorias.json");
const maquinasFile = path.join(dataDir, "maquinas.json");
const abastecimentosFile = path.join(dataDir, "abastecimentos.json");
const manutencoesFile = path.join(dataDir, "manutencoes.json");
const lotesFile = path.join(dataDir, "lotes.json");
const animaisFile = path.join(dataDir, "animais.json");
const pesagensFile = path.join(dataDir, "pesagens.json");
const saudeRegistrosFile = path.join(dataDir, "saude-registros.json");
const reproducaoRegistrosFile = path.join(dataDir, "reproducao-registros.json");
const historicoBrincosFile = path.join(dataDir, "historico-brincos.json");
const animalLoteMovimentacoesFile = path.join(dataDir, "animal-lote-movimentacoes.json");
const lotePastoMovimentacoesFile = path.join(dataDir, "lote-pasto-movimentacoes.json");

export function isDatabaseUnavailable(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const item = current as { code?: string; errno?: string | number; message?: string; cause?: unknown };
    parts.push(String(item.code || ""));
    parts.push(String(item.errno || ""));
    parts.push(String(item.message || current));
    current = item.cause;
  }
  const text = parts.join(" ");
  return [
    "ECONNREFUSED",
    "PROTOCOL_CONNECTION_LOST",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ECONNRESET",
    "EHOSTUNREACH",
    "Access denied for user",
    "Failed query:",
    "Unable to acquire a connection",
    "Pool is closed",
    "cannot enqueue",
    "Connection lost",
    "Too many connections",
  ].some(marker => text.includes(marker));
}

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

export type LocalFazenda = Record<string, any> & {
  id: number;
  userId: number;
  nome: string;
  createdAt: string;
  updatedAt: string;
};

async function readFazendas(): Promise<LocalFazenda[]> {
  return readJsonFile<LocalFazenda[]>(fazendasFile, []);
}

async function writeFazendas(rows: LocalFazenda[]): Promise<void> {
  await writeJsonFile(fazendasFile, rows);
}

export async function listLocalFazendas(userId: number): Promise<LocalFazenda[]> {
  const rows = await readFazendas();
  const matched = rows.filter(row => row.userId === userId);
  // Em modo offline/preview, registros antigos podem ter outro userId — não esconder tudo.
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getLocalFazenda(userId: number, id: number): Promise<LocalFazenda | null> {
  const rows = await readFazendas();
  const exact = rows.find(row => row.userId === userId && row.id === id);
  if (exact) return exact;

  // Em modo local/preview, alguns registros podem ter sido gravados com um
  // userId antigo enquanto a sessão atual usa outro id fixo. Para não perder
  // dados na tela de edição, aceitamos o mesmo id da fazenda como fallback.
  return rows.find(row => row.id === id) ?? null;
}

export async function createLocalFazenda(userId: number, input: Record<string, any> & { nome: string }): Promise<{ id: number }> {
  const rows = await readFazendas();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await writeFazendas(rows);
  return { id };
}

export async function updateLocalFazenda(userId: number, id: number, input: Record<string, any>): Promise<void> {
  const rows = await readFazendas();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const now = new Date().toISOString();
  if (index === -1) {
    rows.push({
      id,
      userId,
      nome: input.nome ?? `Fazenda ${id}`,
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    rows[index] = {
      ...rows[index],
      ...input,
      updatedAt: now,
    };
  }
  await writeFazendas(rows);
}

export async function deleteLocalFazenda(userId: number, id: number): Promise<void> {
  const rows = await readFazendas();
  await writeFazendas(rows.filter(row => !(row.userId === userId && row.id === id)));
}

export type LocalPasto = Record<string, any> & {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  createdAt: string;
  updatedAt: string;
};

async function readPastos(): Promise<LocalPasto[]> {
  return readJsonFile<LocalPasto[]>(pastosFile, []);
}

async function writePastos(rows: LocalPasto[]): Promise<void> {
  await writeJsonFile(pastosFile, rows);
}

export async function listLocalPastos(userId: number): Promise<LocalPasto[]> {
  const rows = await readPastos();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function listLocalPastosByFazenda(userId: number, fazendaId: number): Promise<LocalPasto[]> {
  const rows = await readPastos();
  const matched = rows.filter(row => row.userId === userId && row.fazendaId === fazendaId);
  const visible = matched.length > 0 ? matched : rows.filter(row => row.fazendaId === fazendaId);
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createLocalPasto(
  userId: number,
  input: Record<string, any> & { fazendaId: number; nome: string },
): Promise<{ id: number }> {
  const rows = await readPastos();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    status: "ativo",
    incluirArea: true,
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await writePastos(rows);
  return { id };
}

export async function updateLocalPasto(userId: number, id: number, input: Record<string, any>): Promise<void> {
  const rows = await readPastos();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const now = new Date().toISOString();
  if (index === -1) {
    rows.push({
      id,
      userId,
      fazendaId: input.fazendaId ?? 0,
      nome: input.nome ?? `Subdivisão ${id}`,
      status: "ativo",
      incluirArea: true,
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    rows[index] = {
      ...rows[index],
      ...input,
      updatedAt: now,
    };
  }
  await writePastos(rows);
}

export async function deleteLocalPasto(userId: number, id: number): Promise<void> {
  const rows = await readPastos();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writePastos(rows.filter(row => row.id !== id));
    return;
  }
  await writePastos(remaining);
}

export type LocalBenfeitoria = Record<string, any> & {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  createdAt: string;
  updatedAt: string;
};

async function readBenfeitorias(): Promise<LocalBenfeitoria[]> {
  return readJsonFile<LocalBenfeitoria[]>(benfeitoriasFile, []);
}

async function writeBenfeitorias(rows: LocalBenfeitoria[]): Promise<void> {
  await writeJsonFile(benfeitoriasFile, rows);
}

export async function listLocalBenfeitorias(userId: number): Promise<LocalBenfeitoria[]> {
  const rows = await readBenfeitorias();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getLocalBenfeitoria(userId: number, id: number): Promise<LocalBenfeitoria | null> {
  const rows = await readBenfeitorias();
  return rows.find(row => row.userId === userId && row.id === id)
    ?? rows.find(row => row.id === id)
    ?? null;
}

export async function createLocalBenfeitoria(
  userId: number,
  input: Record<string, any> & { fazendaId: number; nome: string },
): Promise<{ id: number }> {
  const rows = await readBenfeitorias();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    status: "ativo",
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await writeBenfeitorias(rows);
  return { id };
}

export async function updateLocalBenfeitoria(userId: number, id: number, input: Record<string, any>): Promise<void> {
  const rows = await readBenfeitorias();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const now = new Date().toISOString();
  if (index === -1) {
    rows.push({
      id,
      userId,
      fazendaId: input.fazendaId ?? 0,
      nome: input.nome ?? `Benfeitoria ${id}`,
      status: "ativo",
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    rows[index] = { ...rows[index], ...input, updatedAt: now };
  }
  await writeBenfeitorias(rows);
}

export async function deleteLocalBenfeitoria(userId: number, id: number): Promise<void> {
  const rows = await readBenfeitorias();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeBenfeitorias(rows.filter(row => row.id !== id));
    return;
  }
  await writeBenfeitorias(remaining);
}

export type LocalMaquina = Record<string, any> & {
  id: number;
  userId: number;
  nome: string;
  fazendaId?: number | null;
  status?: string | null;
  dataDesativacao?: string | null;
  placa?: string | null;
  createdAt: string;
  updatedAt: string;
};

async function readMaquinas(): Promise<LocalMaquina[]> {
  return readJsonFile<LocalMaquina[]>(maquinasFile, []);
}

async function writeMaquinas(rows: LocalMaquina[]): Promise<void> {
  await writeJsonFile(maquinasFile, rows);
}

export async function listLocalMaquinas(userId: number): Promise<LocalMaquina[]> {
  const rows = await readMaquinas();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getLocalMaquina(userId: number, id: number): Promise<LocalMaquina | null> {
  const rows = await readMaquinas();
  return rows.find(row => row.userId === userId && row.id === id)
    ?? rows.find(row => row.id === id)
    ?? null;
}

export async function createLocalMaquina(
  userId: number,
  input: Record<string, any> & { nome: string },
): Promise<{ id: number }> {
  const rows = await readMaquinas();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    status: "ativo",
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await writeMaquinas(rows);
  return { id };
}

export async function updateLocalMaquina(userId: number, id: number, input: Record<string, any>): Promise<void> {
  const rows = await readMaquinas();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const now = new Date().toISOString();
  const normalized: Record<string, any> = { ...input };
  for (const key of Object.keys(normalized)) {
    const val = normalized[key];
    if (val instanceof Date) {
      normalized[key] = Number.isNaN(val.getTime()) ? null : val.toISOString();
    }
  }
  if (index === -1) {
    rows.push({
      id,
      userId,
      nome: normalized.nome ?? `Máquina ${id}`,
      status: "ativo",
      ...normalized,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    rows[index] = { ...rows[index], ...normalized, updatedAt: now };
  }
  await writeMaquinas(rows);
}

export async function deleteLocalMaquina(userId: number, id: number): Promise<void> {
  const rows = await readMaquinas();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeMaquinas(rows.filter(row => row.id !== id));
    return;
  }
  await writeMaquinas(remaining);
}

export type LocalAbastecimento = Record<string, any> & {
  id: number;
  userId: number;
  maquinaId: number;
  data: string;
  combustivel: string;
  litros: string;
  valorLitro?: string | null;
  valorTotal?: string | null;
  horimetro?: string | null;
  responsavel?: string | null;
  abastecidoNaFazenda?: boolean | null;
  fazendaId?: number | null;
  movimentacaoEstoqueId?: number | null;
  /** registrado | estornado */
  status?: string | null;
  observacoes?: string | null;
  createdAt: string;
  updatedAt: string;
};

async function readAbastecimentos(): Promise<LocalAbastecimento[]> {
  return readJsonFile<LocalAbastecimento[]>(abastecimentosFile, []);
}

async function writeAbastecimentos(rows: LocalAbastecimento[]): Promise<void> {
  await writeJsonFile(abastecimentosFile, rows);
}

export async function listLocalAbastecimentos(
  userId: number,
  opts?: { maquinaId?: number },
): Promise<LocalAbastecimento[]> {
  const rows = await readAbastecimentos();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible
    .filter(row => (opts?.maquinaId == null ? true : Number(row.maquinaId) === opts.maquinaId))
    .sort((a, b) => {
      const byData = String(b.data || "").localeCompare(String(a.data || ""));
      if (byData !== 0) return byData;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

export async function getLocalAbastecimento(
  userId: number,
  id: number,
): Promise<LocalAbastecimento | null> {
  const rows = await readAbastecimentos();
  return rows.find(row => row.userId === userId && row.id === id)
    ?? rows.find(row => row.id === id)
    ?? null;
}

export async function createLocalAbastecimento(
  userId: number,
  input: Record<string, any> & { maquinaId: number; data: string; combustivel: string; litros: string },
): Promise<{ id: number }> {
  const rows = await readAbastecimentos();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    ...input,
    status: input.status ?? "registrado",
    createdAt: now,
    updatedAt: now,
  });
  await writeAbastecimentos(rows);
  return { id };
}

export async function updateLocalAbastecimento(
  userId: number,
  id: number,
  input: Record<string, any>,
): Promise<void> {
  const rows = await readAbastecimentos();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const now = new Date().toISOString();
  const normalized: Record<string, any> = { ...input };
  for (const key of Object.keys(normalized)) {
    const val = normalized[key];
    if (val instanceof Date) {
      normalized[key] = Number.isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
    }
  }
  if (index === -1) {
    const fallback = rows.findIndex(row => row.id === id);
    if (fallback === -1) {
      rows.push({
        id,
        userId,
        maquinaId: Number(normalized.maquinaId || 0),
        data: String(normalized.data || now.slice(0, 10)),
        combustivel: String(normalized.combustivel || "diesel"),
        litros: String(normalized.litros || "0"),
        ...normalized,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      rows[fallback] = { ...rows[fallback], ...normalized, updatedAt: now };
    }
  } else {
    rows[index] = { ...rows[index], ...normalized, updatedAt: now };
  }
  await writeAbastecimentos(rows);
}

export async function deleteLocalAbastecimento(userId: number, id: number): Promise<void> {
  const rows = await readAbastecimentos();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeAbastecimentos(rows.filter(row => row.id !== id));
    return;
  }
  await writeAbastecimentos(remaining);
}

export type LocalManutencaoPeca = {
  estoqueId?: number | null;
  nome: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
};

export type LocalManutencao = Record<string, any> & {
  id: number;
  userId: number;
  maquinaId: number;
  tipo: string;
  descricao?: string | null;
  data: string;
  horimetro?: string | null;
  proximaManutencao?: string | null;
  status?: string | null;
  prestadorNome?: string | null;
  prestadorContato?: string | null;
  valorMaoObra?: string | null;
  valorPecas?: string | null;
  valorTotal?: string | null;
  custo?: string | null;
  observacoes?: string | null;
  pecas: LocalManutencaoPeca[];
  createdAt: string;
  updatedAt: string;
};

async function readManutencoes(): Promise<LocalManutencao[]> {
  return readJsonFile<LocalManutencao[]>(manutencoesFile, []);
}

async function writeManutencoes(rows: LocalManutencao[]): Promise<void> {
  await writeJsonFile(manutencoesFile, rows);
}

export async function listLocalManutencoes(
  userId: number,
  opts?: { maquinaId?: number },
): Promise<LocalManutencao[]> {
  const rows = await readManutencoes();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible
    .filter(row => (opts?.maquinaId == null ? true : Number(row.maquinaId) === opts.maquinaId))
    .sort((a, b) => {
      const byData = String(b.data || "").localeCompare(String(a.data || ""));
      if (byData !== 0) return byData;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

export async function getLocalManutencao(
  userId: number,
  id: number,
): Promise<LocalManutencao | null> {
  const rows = await readManutencoes();
  return (
    rows.find(row => row.userId === userId && row.id === id) ??
    rows.find(row => row.id === id) ??
    null
  );
}

export async function createLocalManutencao(
  userId: number,
  input: {
    maquinaId: number;
    tipo: string;
    data: string;
    descricao?: string;
    horimetro?: string;
    proximaManutencao?: string;
    status?: string;
    prestadorNome?: string;
    prestadorContato?: string;
    valorMaoObra?: string;
    valorPecas?: string;
    valorTotal?: string;
    custo?: string;
    observacoes?: string;
    pecas?: LocalManutencaoPeca[];
  },
): Promise<{ id: number }> {
  const rows = await readManutencoes();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    maquinaId: input.maquinaId,
    tipo: input.tipo,
    data: input.data,
    descricao: input.descricao ?? null,
    horimetro: input.horimetro ?? null,
    proximaManutencao: input.proximaManutencao ?? null,
    status: input.status ?? "concluida",
    prestadorNome: input.prestadorNome ?? null,
    prestadorContato: input.prestadorContato ?? null,
    valorMaoObra: input.valorMaoObra ?? "0",
    valorPecas: input.valorPecas ?? "0",
    valorTotal: input.valorTotal ?? "0",
    custo: input.custo ?? input.valorTotal ?? "0",
    observacoes: input.observacoes ?? null,
    pecas: input.pecas ?? [],
    createdAt: now,
    updatedAt: now,
  });
  await writeManutencoes(rows);
  return { id };
}

export async function updateLocalManutencao(
  userId: number,
  id: number,
  input: Partial<Omit<LocalManutencao, "id" | "userId" | "createdAt">>,
): Promise<void> {
  const rows = await readManutencoes();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const fallback = index >= 0 ? index : rows.findIndex(row => row.id === id);
  const now = new Date().toISOString();
  if (fallback < 0) {
    rows.push({
      id,
      userId,
      maquinaId: Number(input.maquinaId ?? 0),
      tipo: String(input.tipo ?? "Corretiva"),
      data: String(input.data ?? now.slice(0, 10)),
      descricao: input.descricao ?? null,
      horimetro: input.horimetro ?? null,
      proximaManutencao: input.proximaManutencao ?? null,
      status: input.status ?? "concluida",
      prestadorNome: input.prestadorNome ?? null,
      prestadorContato: input.prestadorContato ?? null,
      valorMaoObra: input.valorMaoObra ?? "0",
      valorPecas: input.valorPecas ?? "0",
      valorTotal: input.valorTotal ?? "0",
      custo: input.custo ?? input.valorTotal ?? "0",
      observacoes: input.observacoes ?? null,
      pecas: input.pecas ?? [],
      createdAt: now,
      updatedAt: now,
    });
    await writeManutencoes(rows);
    return;
  }
  rows[fallback] = {
    ...rows[fallback],
    ...input,
    id: rows[fallback].id,
    userId: rows[fallback].userId,
    updatedAt: now,
  };
  await writeManutencoes(rows);
}

export async function deleteLocalManutencao(userId: number, id: number): Promise<void> {
  const rows = await readManutencoes();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeManutencoes(rows.filter(row => row.id !== id));
    return;
  }
  await writeManutencoes(remaining);
}

export type LocalLote = Record<string, any> & {
  id: number;
  userId: number;
  nome: string;
  sigla?: string | null;
  dataCriacao?: string | null;
  descricao?: string | null;
  localizacao?: string | null;
  capacidade?: number | null;
  fazendaId?: number | null;
  pastoAtualId?: number | null;
  dataEntradaPasto?: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

async function readLotes(): Promise<LocalLote[]> {
  return readJsonFile<LocalLote[]>(lotesFile, []);
}

async function writeLotes(rows: LocalLote[]): Promise<void> {
  await writeJsonFile(lotesFile, rows);
}

export async function listLocalLotes(userId: number): Promise<LocalLote[]> {
  const rows = await readLotes();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getLocalLote(userId: number, id: number): Promise<LocalLote | null> {
  const rows = await listLocalLotes(userId);
  return rows.find(row => row.id === id) ?? null;
}

async function buildLocalLoteNomeMap(userId: number): Promise<Map<number, string>> {
  const lotes = await listLocalLotes(userId);
  return new Map(lotes.map(l => [l.id, String(l.nome)]));
}

export async function enrichLocalAnimal(
  userId: number,
  animal: Record<string, any>,
): Promise<Record<string, unknown>> {
  const loteNomeMap = await buildLocalLoteNomeMap(userId);
  const loteId = animal.loteId != null ? Number(animal.loteId) : null;

  let diasNaFazenda: number | null = null;
  if (animal.dataNascimento) {
    const nasc = new Date(animal.dataNascimento);
    diasNaFazenda = Math.floor((Date.now() - nasc.getTime()) / (1000 * 60 * 60 * 24));
  } else if (animal.dataEntrada) {
    const entrada = new Date(animal.dataEntrada);
    diasNaFazenda = Math.floor((Date.now() - entrada.getTime()) / (1000 * 60 * 60 * 24));
  } else if (animal.createdAt) {
    diasNaFazenda = Math.floor((Date.now() - new Date(animal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    ...animal,
    loteNome: loteId ? (loteNomeMap.get(loteId) ?? null) : null,
    pastoNome: null,
    diasNaFazenda,
  };
}

export async function createLocalLote(
  userId: number,
  input: Record<string, any> & { nome: string },
): Promise<{ id: number }> {
  const rows = await readLotes();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  const sigla = typeof input.sigla === "string" && input.sigla.trim() ? input.sigla.trim() : null;
  rows.push({
    id,
    userId,
    nome: input.nome,
    sigla,
    dataCriacao: input.dataCriacao ?? now.slice(0, 10),
    descricao: input.descricao ?? null,
    localizacao: input.localizacao ?? null,
    capacidade: input.capacidade ?? null,
    fazendaId: input.fazendaId ?? null,
    pastoAtualId: input.pastoAtualId ?? null,
    dataEntradaPasto: input.dataEntradaPasto ?? null,
    ativo: input.ativo ?? true,
    createdAt: now,
    updatedAt: now,
  });
  await writeLotes(rows);
  return { id };
}

export type LocalLotePastoMovimentacao = {
  id: number;
  userId: number;
  loteId: number;
  pastoOrigemId: number | null;
  pastoDestinoId: number | null;
  dataEntrada: string;
  dataSaida: string | null;
  diasNoPasto: number | null;
  qtdAnimais: number | null;
  observacoes: string | null;
  createdAt: string;
};

function diasEntrePasto(inicio: string, fim: string): number {
  const a = new Date(`${inicio.slice(0, 10)}T12:00:00`);
  const b = new Date(`${fim.slice(0, 10)}T12:00:00`);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

function nextLocalRowId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

async function readLotePastoMovimentacoes(): Promise<LocalLotePastoMovimentacao[]> {
  return readJsonFile<LocalLotePastoMovimentacao[]>(lotePastoMovimentacoesFile, []);
}

async function writeLotePastoMovimentacoes(rows: LocalLotePastoMovimentacao[]): Promise<void> {
  await writeJsonFile(lotePastoMovimentacoesFile, rows);
}

async function countLocalAnimaisNoLote(userId: number, loteId: number): Promise<number> {
  const animais = await readAnimais();
  const byUser = animais.filter(row => row.userId === userId);
  const pool = byUser.length > 0 ? byUser : animais;
  return pool.filter(a => Number(a.loteId) === loteId).length;
}

async function syncLocalAnimaisDoLote(
  userId: number,
  loteId: number,
  patch: { pastoId?: number | null; fazendaId?: number | null },
): Promise<void> {
  const animais = await readAnimais();
  const byUser = animais.filter(row => row.userId === userId);
  const now = new Date().toISOString();
  let changed = false;

  for (let i = 0; i < animais.length; i++) {
    const a = animais[i];
    const sameUser = a.userId === userId || byUser.length === 0;
    if (sameUser && Number(a.loteId) === loteId && a.status === "ativo") {
      animais[i] = {
        ...a,
        ...(patch.pastoId !== undefined ? { pastoId: patch.pastoId } : {}),
        ...(patch.fazendaId !== undefined ? { fazendaId: patch.fazendaId } : {}),
        updatedAt: now,
      };
      changed = true;
    }
  }

  if (changed) await writeAnimais(animais);
}

/** Move/define subdivisão do lote no armazenamento local (quando o MySQL está offline). */
export async function moveLocalLoteToPasto(
  userId: number,
  input: { loteId: number; pastoId: number | null; dataEntrada?: string; observacoes?: string },
): Promise<{ success: true; localFallback: true }> {
  const rows = await readLotes();
  const byUser = rows.filter(row => row.userId === userId);
  const searchPool = byUser.length > 0 ? byUser : rows;
  const lote = searchPool.find(row => row.id === input.loteId);
  if (!lote) throw new Error("Lote não encontrado");

  const index = rows.findIndex(row => row.id === lote.id);
  if (index < 0) throw new Error("Lote não encontrado");

  const hojeLimite = new Date().toISOString().slice(0, 10);
  const hoje = input.dataEntrada ?? hojeLimite;
  if (hoje > hojeLimite) {
    throw new Error("A data de entrada no pasto não pode ser futura.");
  }

  const pastoOrigemId = lote.pastoAtualId ?? null;
  const qtdAnimais = await countLocalAnimaisNoLote(userId, lote.id);
  const movs = await readLotePastoMovimentacoes();
  const now = new Date().toISOString();

  if (input.pastoId === pastoOrigemId) {
    return { success: true, localFallback: true };
  }

  const fecharEstadiaAnterior = () => {
    if (!pastoOrigemId) return;
    const abertaIdx = movs.findIndex(
      m =>
        m.loteId === lote.id
        && m.pastoDestinoId === pastoOrigemId
        && m.dataSaida == null,
    );
    const dataEntrada = abertaIdx >= 0
      ? movs[abertaIdx].dataEntrada
      : (lote.dataEntradaPasto ?? hoje);
    const dias = diasEntrePasto(dataEntrada, hoje);

    if (abertaIdx >= 0) {
      movs[abertaIdx] = {
        ...movs[abertaIdx],
        dataSaida: hoje,
        diasNoPasto: dias,
      };
    } else {
      movs.push({
        id: nextLocalRowId(movs),
        userId,
        loteId: lote.id,
        pastoOrigemId: null,
        pastoDestinoId: pastoOrigemId,
        dataEntrada,
        dataSaida: hoje,
        diasNoPasto: dias,
        qtdAnimais,
        observacoes: null,
        createdAt: now,
      });
    }
  };

  if (input.pastoId === null) {
    fecharEstadiaAnterior();
    await writeLotePastoMovimentacoes(movs);
    rows[index] = {
      ...rows[index],
      pastoAtualId: null,
      dataEntradaPasto: null,
      fazendaId: null,
      localizacao: null,
      updatedAt: now,
    };
    await writeLotes(rows);
    await syncLocalAnimaisDoLote(userId, lote.id, { pastoId: null });
    return { success: true, localFallback: true };
  }

  const pastos = await listLocalPastos(userId);
  const pasto = pastos.find(p => p.id === input.pastoId);
  if (!pasto) throw new Error("Pasto não encontrado");

  fecharEstadiaAnterior();

  movs.push({
    id: nextLocalRowId(movs),
    userId,
    loteId: lote.id,
    pastoOrigemId,
    pastoDestinoId: input.pastoId,
    dataEntrada: hoje,
    dataSaida: null,
    diasNoPasto: null,
    qtdAnimais,
    observacoes: input.observacoes ?? null,
    createdAt: now,
  });
  await writeLotePastoMovimentacoes(movs);

  rows[index] = {
    ...rows[index],
    pastoAtualId: input.pastoId,
    fazendaId: pasto.fazendaId,
    dataEntradaPasto: hoje,
    localizacao: pasto.nome,
    updatedAt: now,
  };
  await writeLotes(rows);

  try {
    await updateLocalPasto(userId, input.pastoId, { status: "ativo" });
  } catch {
    // Pasto pode não existir no arquivo local com o mesmo userId — lote já foi atualizado.
  }

  await syncLocalAnimaisDoLote(userId, lote.id, {
    pastoId: input.pastoId,
    fazendaId: pasto.fazendaId,
  });

  return { success: true, localFallback: true };
}

export async function listLocalMapaRebanhoHistorico(
  userId: number,
  input: { fazendaId: number; loteId?: number; pastoId?: number; limit?: number },
) {
  const limit = input.limit ?? 50;
  const lotes = await listLocalLotes(userId);
  const loteNomeMap = new Map(lotes.map(l => [l.id, String(l.nome)]));
  const pastos = await listLocalPastos(userId);
  const pastoNomeMap = new Map(pastos.map(p => [p.id, String(p.nome)]));

  let movs = await readLotePastoMovimentacoes();
  movs = movs.filter(m => m.userId === userId);

  if (input.loteId) {
    const lote = lotes.find(l => l.id === input.loteId);
    if (!lote) return [];
    movs = movs.filter(m => m.loteId === input.loteId);
  } else {
    const loteIdsFazenda = new Set(
      lotes.filter(l => Number(l.fazendaId) === input.fazendaId).map(l => l.id),
    );
    if (loteIdsFazenda.size === 0) return [];
    movs = movs.filter(m => loteIdsFazenda.has(m.loteId));
  }

  if (input.pastoId) {
    movs = movs.filter(
      m => m.pastoOrigemId === input.pastoId || m.pastoDestinoId === input.pastoId,
    );
  }

  movs.sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada));

  const hoje = new Date().toISOString().slice(0, 10);
  movs = movs.filter(m => movimentacaoExibivelHistorico(m, hoje));

  const mapped = movs.slice(0, limit).map(r => ({
    id: r.id,
    loteId: r.loteId,
    loteNome: loteNomeMap.get(r.loteId) ?? "—",
    pastoOrigemId: r.pastoOrigemId,
    pastoOrigemNome: r.pastoOrigemId ? (pastoNomeMap.get(r.pastoOrigemId) ?? "—") : null,
    pastoDestinoId: r.pastoDestinoId,
    pastoDestinoNome: r.pastoDestinoId ? (pastoNomeMap.get(r.pastoDestinoId) ?? "—") : null,
    dataEntrada: r.dataEntrada,
    dataSaida: r.dataSaida,
    diasNoPasto: r.diasNoPasto,
    qtdAnimais: r.qtdAnimais,
    observacoes: r.observacoes,
  }));

  // Estadia atual no lote sem movimentação aberta correspondente (legado / inconsistência)
  if (input.loteId) {
    const lote = lotes.find(l => l.id === input.loteId);
    if (lote) {
      const movsLote = (await readLotePastoMovimentacoes())
        .filter(m => m.userId === userId && m.loteId === lote.id)
        .map(m => ({
          pastoDestinoId: m.pastoDestinoId,
          dataEntrada: m.dataEntrada,
          dataSaida: m.dataSaida,
        }));
      const loc = resolverLocalizacaoAtualLote(lote, movsLote, hoje);
      const hasOpenMov = mapped.some(m => m.loteId === lote.id && m.dataSaida == null);
      if (!hasOpenMov && loc.pastoId && loc.dataEntradaPasto) {
        const qtd = await countLocalAnimaisNoLote(userId, lote.id);
        mapped.unshift({
          id: 0,
          loteId: lote.id,
          loteNome: loteNomeMap.get(lote.id) ?? String(lote.nome),
          pastoOrigemId: null,
          pastoOrigemNome: null,
          pastoDestinoId: loc.pastoId,
          pastoDestinoNome: pastoNomeMap.get(loc.pastoId) ?? "—",
          dataEntrada: loc.dataEntradaPasto,
          dataSaida: null,
          diasNoPasto: diasEntrePasto(loc.dataEntradaPasto, hoje),
          qtdAnimais: qtd,
          observacoes: null,
        });
      }
    }
  }

  return mapped;
}

export async function excluirLocalLotePastoMovimentacao(
  userId: number,
  movimentacaoId: number,
): Promise<{ ok: true }> {
  const movs = await readLotePastoMovimentacoes();
  const idx = movs.findIndex(m => m.id === movimentacaoId && m.userId === userId);
  if (idx < 0) throw new Error("Movimentação não encontrada.");

  const mov = movs[idx];
  const dataSaidaStr = mov.dataSaida ? String(mov.dataSaida).slice(0, 10) : null;
  if (!dataSaidaStr) {
    throw new Error(
      "Não é possível excluir a movimentação atual. Use Mover Lote para corrigir a localização do Lote.",
    );
  }

  movs.splice(idx, 1);
  await writeLotePastoMovimentacoes(movs);
  return { ok: true };
}

/** Cancela estadia sintética (id 0) derivada dos campos atuais do lote. */
export async function cancelarLocalEstadiaSinteticaLote(
  userId: number,
  loteId: number,
): Promise<{ ok: true }> {
  const lotes = await readLotes();
  const idx = lotes.findIndex(l => l.id === loteId && l.userId === userId);
  if (idx < 0) throw new Error("Lote não encontrado.");

  const lote = lotes[idx];
  const now = new Date().toISOString();
  lotes[idx] = {
    ...lote,
    pastoAtualId: null,
    dataEntradaPasto: null,
    localizacao: null,
    updatedAt: now,
  };
  await writeLotes(lotes);
  await syncLocalAnimaisDoLote(userId, loteId, { pastoId: null });
  return { ok: true };
}

export async function avaliarExclusaoLocalLote(
  userId: number,
  loteId: number,
): Promise<AvaliacaoExclusaoLote> {
  const lote = await getLocalLote(userId, loteId);
  if (!lote) throw new Error("Lote não encontrado.");

  const animais = await readAnimais();
  const byUser = animais.filter(row => row.userId === userId);
  const searchPool = byUser.length > 0 ? byUser : animais;
  const qtdAnimais = searchPool.filter(a => Number(a.loteId) === loteId).length;

  let fazendaNome: string | null = null;
  if (lote.fazendaId) {
    const fazendas = await listLocalFazendas(userId);
    fazendaNome = fazendas.find(f => f.id === lote.fazendaId)?.nome ?? null;
  }

  if (qtdAnimais > 0) {
    return {
      situacao: "bloqueado_animais",
      loteId,
      nomeLote: String(lote.nome),
      fazendaId: lote.fazendaId ?? null,
      fazendaNome,
      qtdAnimais,
    };
  }

  return {
    situacao: "pode_excluir",
    loteId,
    nomeLote: String(lote.nome),
    fazendaId: lote.fazendaId ?? null,
    fazendaNome,
    qtdAnimais: 0,
  };
}

export async function excluirLocalLote(
  userId: number,
  id: number,
): Promise<{ success: true; nomeLote: string; localFallback: true }> {
  const lote = await getLocalLote(userId, id);
  if (!lote) throw new Error("Lote não encontrado.");

  const avaliacao = await avaliarExclusaoLocalLote(userId, id);
  if (avaliacao.situacao === "bloqueado_animais") {
    throw new Error(mensagemExclusaoLoteBloqueada(String(lote.nome), avaliacao.qtdAnimais));
  }

  const rows = await readLotes();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    const fallbackRemaining = rows.filter(row => row.id !== id);
    await writeLotes(fallbackRemaining);
    return { success: true, nomeLote: String(lote.nome), localFallback: true };
  }
  await writeLotes(remaining);
  return { success: true, nomeLote: String(lote.nome), localFallback: true };
}

export async function inativarLocalLote(
  userId: number,
  id: number,
): Promise<{ success: true; nomeLote: string; localFallback: true }> {
  const avaliacao = await avaliarExclusaoLocalLote(userId, id);
  if (avaliacao.situacao === "bloqueado_animais") {
    throw new Error(mensagemExclusaoLoteBloqueada(avaliacao.nomeLote, avaliacao.qtdAnimais));
  }

  const result = await updateLocalLote(userId, id, { ativo: false });
  if (!result.success) throw new Error("Não foi possível inativar o Lote.");
  return { success: true, nomeLote: avaliacao.nomeLote, localFallback: true };
}

export async function updateLocalLote(
  userId: number,
  id: number,
  input: {
    nome?: string;
    sigla?: string | null;
    dataCriacao?: string;
    descricao?: string;
    localizacao?: string;
    capacidade?: number;
    ativo?: boolean;
    pastoAtualId?: number | null;
  },
): Promise<{ success: true; localFallback: true }> {
  const rows = await readLotes();
  const byUser = rows.filter(row => row.userId === userId);
  const searchPool = byUser.length > 0 ? byUser : rows;
  const lote = searchPool.find(row => row.id === id);
  if (!lote) throw new Error("Lote não encontrado.");

  const index = rows.findIndex(row => row.id === lote.id);
  if (index < 0) throw new Error("Lote não encontrado.");

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.nome !== undefined) patch.nome = input.nome;
  if (input.sigla !== undefined) patch.sigla = input.sigla;
  if (input.dataCriacao !== undefined) patch.dataCriacao = input.dataCriacao;
  if (input.descricao !== undefined) patch.descricao = input.descricao;
  if (input.localizacao !== undefined) patch.localizacao = input.localizacao;
  if (input.capacidade !== undefined) patch.capacidade = input.capacidade;
  if (input.ativo !== undefined) patch.ativo = input.ativo;
  if (input.pastoAtualId !== undefined) patch.pastoAtualId = input.pastoAtualId;

  rows[index] = { ...rows[index], ...patch };
  await writeLotes(rows);

  if (input.pastoAtualId !== undefined) {
    let fazendaIdAnimais: number | null | undefined;
    if (input.pastoAtualId != null) {
      const pastosRows = await listLocalPastos(userId);
      const pasto = pastosRows.find(p => p.id === input.pastoAtualId);
      fazendaIdAnimais = pasto?.fazendaId ?? null;
    }
    await syncLocalAnimaisDoLote(userId, id, {
      pastoId: input.pastoAtualId,
      ...(fazendaIdAnimais != null ? { fazendaId: fazendaIdAnimais } : {}),
    });
  }

  return { success: true, localFallback: true };
}

export async function enrichLocalLote(lote: LocalLote, userId: number) {
  const animais = await listLocalAnimais(userId);
  const fazendas = await listLocalFazendas(userId);
  const pastosRows = await listLocalPastos(userId);
  const qtdAnimais = animais.filter(a => a.loteId === lote.id && a.status === "ativo").length;
  const fazendaNome = lote.fazendaId
    ? (fazendas.find(f => f.id === lote.fazendaId)?.nome ?? null)
    : null;
  const pasto = lote.pastoAtualId
    ? pastosRows.find(p => p.id === lote.pastoAtualId)
    : null;
  return {
    ...lote,
    qtdAnimais,
    pastoNome: pasto?.nome ?? null,
    pastoCapacidade: pasto?.capacidade ?? null,
    fazendaNome,
    diasNoPasto: null,
  };
}

export async function listLocalLotesGerenciamento(
  userId: number,
  input?: { fazendaId?: number; search?: string },
) {
  const {
    calcularIdadeMeses,
    adicionarAnimalAoResumo,
    criarResumoSexoFaixa,
  } = await import("../shared/lote-faixas-idade");

  const lotesList = await listLocalLotes(userId);
  const fazendas = await listLocalFazendas(userId);
  const fazendaNomeMap = new Map(fazendas.map(f => [f.id, f.nome]));
  const animaisAtivos = (await listLocalAnimais(userId)).filter(a => a.status === "ativo" && a.loteId);

  const resumoPorLote = new Map<number, ReturnType<typeof criarResumoSexoFaixa>>();
  const totalPorLote = new Map<number, number>();
  const hoje = new Date();

  for (const animal of animaisAtivos) {
    if (!animal.loteId) continue;
    const idade = calcularIdadeMeses(animal.dataNascimento, hoje);
    const atual = resumoPorLote.get(animal.loteId) ?? criarResumoSexoFaixa();
    resumoPorLote.set(animal.loteId, adicionarAnimalAoResumo(atual, animal.sexo, idade));
    totalPorLote.set(animal.loteId, (totalPorLote.get(animal.loteId) ?? 0) + 1);
  }

  let resultado = lotesList.map(lote => {
    const fazendaId = lote.fazendaId ?? null;
    const resumo = resumoPorLote.get(lote.id) ?? criarResumoSexoFaixa();
    const totalAnimaisLote = totalPorLote.get(lote.id) ?? 0;
    const capacidade = lote.capacidade ?? null;
    const pctOcupacao = capacidade && capacidade > 0
      ? Math.round((totalAnimaisLote / capacidade) * 100)
      : null;
    const superlotado = capacidade !== null && capacidade > 0 && totalAnimaisLote > capacidade;
    return {
      id: lote.id,
      nome: lote.nome,
      fazendaId,
      fazendaNome: fazendaId ? (fazendaNomeMap.get(fazendaId) ?? null) : null,
      ativo: lote.ativo ?? true,
      machos: resumo.machos,
      femeas: resumo.femeas,
      machosSemIdade: resumo.machosSemIdade,
      femeasSemIdade: resumo.femeasSemIdade,
      capacidade,
      totalAnimais: totalAnimaisLote,
      pctOcupacao,
      superlotado,
    };
  });

  if (input?.fazendaId) {
    resultado = resultado.filter(l => l.fazendaId === input.fazendaId);
  }
  if (input?.search?.trim()) {
    const q = input.search.trim().toLowerCase();
    resultado = resultado.filter(l => l.nome.toLowerCase().includes(q));
  }

  return resultado;
}

export type LocalAnimal = Record<string, any> & {
  id: number;
  userId: number;
  sexo: "macho" | "femea";
  status: "ativo" | "vendido" | "morto" | "transferido";
  createdAt: string;
  updatedAt: string;
};

async function readAnimais(): Promise<LocalAnimal[]> {
  return readJsonFile<LocalAnimal[]>(animaisFile, []);
}

async function writeAnimais(rows: LocalAnimal[]): Promise<void> {
  await writeJsonFile(animaisFile, rows);
}

export async function listLocalAnimais(userId: number): Promise<LocalAnimal[]> {
  const rows = await readAnimais();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getLocalAnimal(userId: number, id: number): Promise<LocalAnimal | null> {
  const rows = await readAnimais();
  return rows.find(row => row.userId === userId && row.id === id)
    ?? rows.find(row => row.id === id)
    ?? null;
}

export async function createLocalAnimal(
  userId: number,
  input: Record<string, any>,
): Promise<{ id: number }> {
  const rows = await readAnimais();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    status: "ativo",
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await writeAnimais(rows);
  return { id };
}

export async function updateLocalAnimal(
  userId: number,
  id: number,
  input: Record<string, any>,
): Promise<void> {
  const rows = await readAnimais();
  const index = rows.findIndex(row => row.userId === userId && row.id === id);
  const now = new Date().toISOString();
  if (index === -1) {
    rows.push({
      id,
      userId,
      sexo: input.sexo ?? "macho",
      status: input.status ?? "ativo",
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    rows[index] = {
      ...rows[index],
      ...input,
      updatedAt: now,
    };
  }
  await writeAnimais(rows);
}

export type LocalAnimalLoteMovimentacao = {
  id: number;
  userId: number;
  animalId: number;
  loteOrigemId: number;
  loteDestinoId: number;
  pastoOrigemId: number | null;
  pastoDestinoId: number | null;
  fazendaId: number | null;
  dataMovimentacao: string;
  usuarioNome: string;
  createdAt: string;
};

async function readAnimalLoteMovimentacoes(): Promise<LocalAnimalLoteMovimentacao[]> {
  return readJsonFile<LocalAnimalLoteMovimentacao[]>(animalLoteMovimentacoesFile, []);
}

async function writeAnimalLoteMovimentacoes(rows: LocalAnimalLoteMovimentacao[]): Promise<void> {
  await writeJsonFile(animalLoteMovimentacoesFile, rows);
}

/** Histórico unificado de subdivisões do animal (modo local / MySQL offline). */
export async function listLocalHistoricoPastosAnimal(userId: number, animalId: number) {
  const { buildHistoricoSubdivisaoAnimal } = await import("../shared/historicoSubdivisaoAnimal");
  const animais = await readAnimais();
  const byUser = animais.filter(row => row.userId === userId);
  const pool = byUser.length > 0 ? byUser : animais;
  const animal = pool.find(a => a.id === animalId);
  if (!animal) return [];

  const transfers = (await readAnimalLoteMovimentacoes())
    .filter(row => row.animalId === animalId && (row.userId === userId || byUser.length === 0));

  const loteIds = new Set<number>();
  if (animal.loteId) loteIds.add(Number(animal.loteId));
  for (const transfer of transfers) {
    loteIds.add(transfer.loteOrigemId);
    loteIds.add(transfer.loteDestinoId);
  }
  if (loteIds.size === 0) return [];

  const lotePastoMovs = (await readLotePastoMovimentacoes()).filter(
    row => row.userId === userId && loteIds.has(row.loteId),
  );

  const pastos = await listLocalPastos(userId);
  const pastoMap: Record<number, string> = {};
  for (const pasto of pastos) pastoMap[pasto.id] = String(pasto.nome);

  return buildHistoricoSubdivisaoAnimal({
    currentLoteId: animal.loteId != null ? Number(animal.loteId) : null,
    transfers,
    lotePastoMovs,
    pastoMap,
  });
}

/** Transfere animais entre lotes da mesma fazenda (MySQL offline). */
export async function movimentarAnimaisLocalLote(
  userId: number,
  input: {
    loteOrigemId: number;
    loteDestinoId: number;
    animalIds: number[];
    dataMovimentacao: string;
  },
  usuarioNome: string,
): Promise<{ success: true; count: number; loteDestinoNome: string; localFallback: true }> {
  if (input.loteOrigemId === input.loteDestinoId) {
    throw new Error("O lote de destino deve ser diferente do lote de origem.");
  }

  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (input.dataMovimentacao > hojeISO) {
    throw new Error("A data da movimentação não pode ser futura.");
  }

  const loteOrigem = await getLocalLote(userId, input.loteOrigemId);
  if (!loteOrigem) throw new Error("Lote de origem não encontrado.");

  const loteDestino = await getLocalLote(userId, input.loteDestinoId);
  if (!loteDestino) throw new Error("Lote de destino não encontrado.");
  if (loteDestino.ativo === false) {
    throw new Error("O lote de destino não está ativo.");
  }
  if (
    loteOrigem.fazendaId != null
    && loteDestino.fazendaId != null
    && Number(loteOrigem.fazendaId) !== Number(loteDestino.fazendaId)
  ) {
    throw new Error("A transferência entre lotes só é permitida dentro da mesma fazenda.");
  }

  const rows = await readAnimais();
  const byUser = rows.filter(row => row.userId === userId);
  const searchPool = byUser.length > 0 ? byUser : rows;
  const wanted = new Set(input.animalIds);
  const valid = searchPool.filter(
    a => wanted.has(a.id) && Number(a.loteId) === Number(input.loteOrigemId),
  );
  if (valid.length === 0) {
    throw new Error("Nenhum animal selecionado pertence ao lote de origem.");
  }

  const validIds = new Set(valid.map(a => a.id));
  const pastosRows = await listLocalPastos(userId);
  const { buildPastoFazendaMap, resolveAnimalLocalizacaoFromLote } = await import("./animaisPorFazenda");
  const pastoFazendaMap = buildPastoFazendaMap(pastosRows);
  const { fazendaId: fazendaIdDestino, pastoId: pastoDestinoId } = resolveAnimalLocalizacaoFromLote(
    loteDestino,
    pastoFazendaMap,
  );
  const fazendaIdHistorico = loteOrigem.fazendaId ?? loteDestino.fazendaId ?? fazendaIdDestino ?? null;
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    if (!validIds.has(rows[i].id)) continue;
    rows[i] = {
      ...rows[i],
      loteId: input.loteDestinoId,
      pastoId: pastoDestinoId,
      ...(fazendaIdDestino != null ? { fazendaId: fazendaIdDestino } : {}),
      updatedAt: now,
    };
  }
  await writeAnimais(rows);

  const historico = await readAnimalLoteMovimentacoes();
  let nextId = historico.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  for (const animalId of validIds) {
    historico.push({
      id: nextId++,
      userId,
      animalId,
      loteOrigemId: input.loteOrigemId,
      loteDestinoId: input.loteDestinoId,
      pastoOrigemId: loteOrigem.pastoAtualId ?? null,
      pastoDestinoId,
      fazendaId: fazendaIdHistorico,
      dataMovimentacao: input.dataMovimentacao,
      usuarioNome,
      createdAt: now,
    });
  }
  await writeAnimalLoteMovimentacoes(historico);

  return {
    success: true,
    count: validIds.size,
    loteDestinoNome: loteDestino.nome,
    localFallback: true,
  };
}

/** Associa animais sem lote a um lote da mesma fazenda (MySQL offline). */
export async function incluirAnimaisLocalLote(
  userId: number,
  input: { loteId: number; animalIds: number[] },
): Promise<{ success: true; count: number; localFallback: true }> {
  const lote = await getLocalLote(userId, input.loteId);
  if (!lote) throw new Error("Lote não encontrado.");
  if (lote.ativo === false) {
    throw new Error("Este Lote está inativo e não aceita novos animais.");
  }

  const pastosRows = await listLocalPastos(userId);
  const { animalCompativelComFazendaLote, buildPastoFazendaMap, resolveAnimalLocalizacaoFromLote } = await import("./animaisPorFazenda");
  const pastoFazendaMap = buildPastoFazendaMap(pastosRows);
  const { fazendaId: fazendaIdLote, pastoId: pastoIdLote } = resolveAnimalLocalizacaoFromLote(lote, pastoFazendaMap);
  if (!fazendaIdLote) {
    throw new Error("Este lote não possui fazenda vinculada. Defina a fazenda do lote antes de adicionar animais.");
  }

  const rows = await readAnimais();
  const byUser = rows.filter(row => row.userId === userId);
  const searchPool = byUser.length > 0 ? byUser : rows;
  const wanted = new Set(input.animalIds);
  const found = searchPool.filter(a => wanted.has(a.id));
  if (found.length === 0) {
    throw new Error("Nenhum animal válido foi encontrado para inclusão.");
  }

  const validos: number[] = [];
  let erroAmigavel: string | null = null;
  for (const animal of found) {
    if (animal.status && animal.status !== "ativo") {
      if (!erroAmigavel) erroAmigavel = "Só é possível adicionar animais ativos ao lote.";
      continue;
    }
    if (!animalCompativelComFazendaLote(animal, fazendaIdLote)) {
      if (!erroAmigavel) {
        erroAmigavel = "Este animal pertence a outra fazenda e não pode ser incluído neste lote.";
      }
      continue;
    }
    if (animal.loteId != null) {
      if (!erroAmigavel) {
        erroAmigavel = "Este animal já pertence a outro lote. Use a transferência entre lotes para movimentá-lo.";
      }
      continue;
    }
    validos.push(animal.id);
  }

  if (validos.length === 0) {
    throw new Error(erroAmigavel || "Nenhum animal válido para inclusão neste lote.");
  }

  const validIds = new Set(validos);
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i++) {
    if (!validIds.has(rows[i].id)) continue;
    rows[i] = {
      ...rows[i],
      loteId: input.loteId,
      pastoId: pastoIdLote,
      fazendaId: fazendaIdLote,
      updatedAt: now,
    };
  }
  await writeAnimais(rows);
  return { success: true, count: validos.length, localFallback: true };
}

export async function deleteLocalAnimal(userId: number, id: number): Promise<void> {
  const rows = await readAnimais();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeAnimais(rows.filter(row => row.id !== id));
    return;
  }
  await writeAnimais(remaining);
}

export type LocalPesagem = {
  id: number;
  userId: number;
  animalId: number;
  peso: string;
  data: string;
  observacoes?: string | null;
  createdAt: string;
};

async function readPesagens(): Promise<LocalPesagem[]> {
  return readJsonFile<LocalPesagem[]>(pesagensFile, []);
}

async function writePesagens(rows: LocalPesagem[]): Promise<void> {
  await writeJsonFile(pesagensFile, rows);
}

function normalizePesagemData(data: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const parsed = new Date(data);
  if (Number.isNaN(parsed.getTime())) return data.slice(0, 10);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function listLocalPesagens(
  userId: number,
  animalId?: number,
): Promise<LocalPesagem[]> {
  const rows = await readPesagens();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  const filtered = animalId ? visible.filter(row => row.animalId === animalId) : visible;
  return filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createLocalPesagem(
  userId: number,
  input: { animalId: number; peso: string; data: string; observacoes?: string },
): Promise<{ id: number }> {
  const rows = await readPesagens();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    animalId: input.animalId,
    peso: input.peso,
    data: normalizePesagemData(input.data),
    observacoes: input.observacoes ?? null,
    createdAt: now,
  });
  await writePesagens(rows);
  await updateLocalAnimal(userId, input.animalId, { pesoAtual: input.peso });
  return { id };
}

export async function deleteLocalPesagem(userId: number, id: number): Promise<void> {
  const rows = await readPesagens();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writePesagens(rows.filter(row => row.id !== id));
    return;
  }
  await writePesagens(remaining);
}

export type LocalSaudeRegistro = {
  id: number;
  userId: number;
  animalId: number;
  tipo: string;
  descricao?: string | null;
  medicamento?: string | null;
  dosagem?: string | null;
  veterinario?: string | null;
  custo?: string | null;
  dataRegistro: string;
  proximaData?: string | null;
  observacoes?: string | null;
  createdAt: string;
};

async function readSaudeRegistros(): Promise<LocalSaudeRegistro[]> {
  return readJsonFile<LocalSaudeRegistro[]>(saudeRegistrosFile, []);
}

async function writeSaudeRegistros(rows: LocalSaudeRegistro[]): Promise<void> {
  await writeJsonFile(saudeRegistrosFile, rows);
}

function normalizeLocalDateField(data: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const parsed = new Date(data);
  if (Number.isNaN(parsed.getTime())) return data.slice(0, 10);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function listLocalSaudeRegistros(
  userId: number,
  animalId?: number,
): Promise<LocalSaudeRegistro[]> {
  const rows = await readSaudeRegistros();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  const filtered = animalId ? visible.filter(row => row.animalId === animalId) : visible;
  return filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createLocalSaudeRegistro(
  userId: number,
  input: {
    animalId: number;
    tipo: string;
    descricao?: string;
    medicamento?: string;
    dosagem?: string;
    veterinario?: string;
    custo?: string;
    dataRegistro: string;
    proximaData?: string;
    observacoes?: string;
  },
): Promise<{ id: number }> {
  const rows = await readSaudeRegistros();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    animalId: input.animalId,
    tipo: input.tipo,
    descricao: input.descricao ?? null,
    medicamento: input.medicamento ?? null,
    dosagem: input.dosagem ?? null,
    veterinario: input.veterinario ?? null,
    custo: input.custo ?? null,
    dataRegistro: normalizeLocalDateField(input.dataRegistro),
    proximaData: input.proximaData ? normalizeLocalDateField(input.proximaData) : null,
    observacoes: input.observacoes ?? null,
    createdAt: now,
  });
  await writeSaudeRegistros(rows);
  return { id };
}

export async function deleteLocalSaudeRegistro(userId: number, id: number): Promise<void> {
  const rows = await readSaudeRegistros();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeSaudeRegistros(rows.filter(row => row.id !== id));
    return;
  }
  await writeSaudeRegistros(remaining);
}

function buildLocalPesagensPorAnimal(
  pesagensList: LocalPesagem[],
): Map<number, LocalPesagem[]> {
  const map = new Map<number, LocalPesagem[]>();
  for (const p of pesagensList) {
    if (!map.has(p.animalId)) map.set(p.animalId, []);
    map.get(p.animalId)!.push(p);
  }
  for (const pesos of map.values()) {
    pesos.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }
  return map;
}

export async function listLocalAnimaisEnriched(
  userId: number,
  input?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let lista = await listLocalAnimais(userId);

  if (input?.sexo && input.sexo !== "") {
    lista = lista.filter(a => a.sexo === input.sexo);
  }
  if (input?.status && input.status !== "") {
    lista = lista.filter(a => a.status === input.status);
  }
  if (input?.loteId) lista = lista.filter(a => a.loteId === input.loteId);
  if (input?.raca && input.raca !== "") lista = lista.filter(a => a.raca === input.raca);
  if (input?.categoria && input.categoria !== "") lista = lista.filter(a => a.categoria === input.categoria);
  if (input?.fazendaId) {
    const { buildLoteFazendaContext, filterAnimaisPorFazenda } = await import("./animaisPorFazenda");
    const { loteFazendaById } = buildLoteFazendaContext(
      await listLocalLotes(userId),
      await listLocalPastos(userId),
    );
    lista = filterAnimaisPorFazenda(lista, Number(input.fazendaId), loteFazendaById);
  }
  if (input?.dataNascimentoInicio) {
    lista = lista.filter(a => a.dataNascimento && a.dataNascimento >= String(input.dataNascimentoInicio));
  }
  if (input?.dataNascimentoFim) {
    lista = lista.filter(a => a.dataNascimento && a.dataNascimento <= String(input.dataNascimentoFim));
  }
  if (input?.dataEntradaDe) {
    lista = lista.filter(a => a.dataEntrada && a.dataEntrada >= String(input.dataEntradaDe));
  }
  if (input?.dataEntradaAte) {
    lista = lista.filter(a => a.dataEntrada && a.dataEntrada <= String(input.dataEntradaAte));
  }
  if (input?.somenteSisbov) lista = lista.filter(a => !!a.sisbov?.trim());
  if (input?.marcadores && Array.isArray(input.marcadores) && input.marcadores.length > 0) {
    const marcas = new Set(input.marcadores as string[]);
    lista = lista.filter(a => a.marca && marcas.has(a.marca));
  }
  if (input?.search && String(input.search).trim()) {
    const q = String(input.search).trim().toLowerCase();
    lista = lista.filter(a =>
      (a.brinco ?? "").toLowerCase().includes(q) ||
      (a.brincoEletronico ?? "").toLowerCase().includes(q) ||
      (a.nome ?? "").toLowerCase().includes(q) ||
      (a.raca ?? "").toLowerCase().includes(q) ||
      (a.sisbov ?? "").toLowerCase().includes(q),
    );
  }
  if (input?.brincoEletronico && String(input.brincoEletronico).trim()) {
    const q = String(input.brincoEletronico).trim().toLowerCase();
    lista = lista.filter(a => (a.brincoEletronico ?? "").toLowerCase().includes(q));
  }
  if (input?.rgn && String(input.rgn).trim()) {
    const q = String(input.rgn).trim().toLowerCase();
    lista = lista.filter(a => (a.rgn ?? "").toLowerCase().includes(q));
  }
  if (input?.rgd && String(input.rgd).trim()) {
    const q = String(input.rgd).trim().toLowerCase();
    lista = lista.filter(a => (a.rgd ?? "").toLowerCase().includes(q));
  }

  const loteNomeMap = await buildLocalLoteNomeMap(userId);
  const pesagensPorAnimal = buildLocalPesagensPorAnimal(await listLocalPesagens(userId));
  const localSaude = await listLocalSaudeRegistros(userId);
  const fimCarenciaPorAnimal = buildFimCarenciaPorAnimal(
    localSaude.map(s => ({
      animalId: s.animalId,
      medicamento: s.medicamento,
      dataRegistro: s.dataRegistro,
      proximaData: s.proximaData,
    })),
    new Map(),
    hoje,
  );

  const resultado = lista.map(animal => {
    let idadeMeses: number | null = null;
    if (animal.dataNascimento) {
      const nasc = new Date(animal.dataNascimento);
      idadeMeses = Math.floor((hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    }

    let diasNaFazenda: number | null = null;
    if (animal.dataNascimento) {
      const nasc = new Date(animal.dataNascimento);
      diasNaFazenda = Math.floor((hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24));
    } else if (animal.dataEntrada) {
      const entrada = new Date(animal.dataEntrada);
      diasNaFazenda = Math.floor((hoje.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24));
    }

    const pesos = pesagensPorAnimal.get(animal.id) || [];
    const ultimoPeso =
      pesos.length > 0
        ? Number(pesos[pesos.length - 1].peso)
        : animal.pesoAtual
          ? Number(animal.pesoAtual)
          : animal.pesoEntrada
            ? Number(animal.pesoEntrada)
            : null;
    const primeiroPeso =
      pesos.length > 0 ? Number(pesos[0].peso) : animal.pesoEntrada ? Number(animal.pesoEntrada) : null;

    let ganhoKg: number | null = null;
    if (ultimoPeso !== null && primeiroPeso !== null && ultimoPeso !== primeiroPeso) {
      ganhoKg = Math.round((ultimoPeso - primeiroPeso) * 100) / 100;
    }

    let gmd: number | null = null;
    if (pesos.length >= 2) {
      const p1 = pesos[0];
      const p2 = pesos[pesos.length - 1];
      const d1 = new Date(p1.data);
      const d2 = new Date(p2.data);
      const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      gmd = Math.round(((Number(p2.peso) - Number(p1.peso)) / dias) * 1000) / 1000;
    } else if (diasNaFazenda && diasNaFazenda > 0 && ganhoKg !== null) {
      gmd = Math.round((ganhoKg / diasNaFazenda) * 1000) / 1000;
    }

    const loteId = animal.loteId != null ? Number(animal.loteId) : null;

    return {
      ...animal,
      loteNome: loteId ? (loteNomeMap.get(loteId) ?? null) : null,
      pastoNome: null,
      idadeMeses,
      diasNaFazenda,
      ultimoPeso,
      ganhoKg,
      gmd,
      emCarencia: fimCarenciaPorAnimal.has(animal.id),
      fimCarenciaAte: fimCarenciaPorAnimal.has(animal.id)
        ? toDateOnlyISO(fimCarenciaPorAnimal.get(animal.id)!)
        : null,
    };
  });

  let filtered = resultado;
  if (input?.apenasEmCarencia) filtered = filtered.filter(a => a.emCarencia === true);
  if (input?.apenasSemLote) filtered = filtered.filter(a => !a.loteId);
  if (input?.apenasSemPesagem) filtered = filtered.filter(a => a.ultimoPeso === null);
  if (input?.pesoMin !== undefined || input?.pesoMax !== undefined) {
    filtered = filtered.filter(a => {
      const peso = a.ultimoPeso;
      if (peso === null || peso === undefined) return false;
      if (input!.pesoMin !== undefined && peso < Number(input!.pesoMin)) return false;
      if (input!.pesoMax !== undefined && peso > Number(input!.pesoMax)) return false;
      return true;
    });
  }
  if (input?.idadeMesesMin !== undefined || input?.idadeMesesMax !== undefined) {
    filtered = filtered.filter(a => {
      if (a.idadeMeses === null || a.idadeMeses === undefined) return false;
      if (input!.idadeMesesMin !== undefined && a.idadeMeses < Number(input!.idadeMesesMin)) return false;
      if (input!.idadeMesesMax !== undefined && a.idadeMeses > Number(input!.idadeMesesMax)) return false;
      return true;
    });
  }
  if (input?.semDataNascimento) {
    filtered = filtered.filter(a => !a.dataNascimento);
  }

  return filtered;
}

export type LocalHistoricoBrinco = Record<string, any> & {
  id: number;
  userId: number;
  animalId: number;
  brincoNovo: string;
  motivo: "perda" | "danificado" | "reidentificacao" | "erro_cadastro" | "outro";
  dataAlteracao: string;
  createdAt: string;
};

async function readHistoricoBrincos(): Promise<LocalHistoricoBrinco[]> {
  return readJsonFile<LocalHistoricoBrinco[]>(historicoBrincosFile, []);
}

async function writeHistoricoBrincos(rows: LocalHistoricoBrinco[]): Promise<void> {
  await writeJsonFile(historicoBrincosFile, rows);
}

export async function listLocalHistoricoBrincos(
  userId: number,
  animalId: number,
): Promise<LocalHistoricoBrinco[]> {
  const rows = await readHistoricoBrincos();
  const matched = rows.filter(row => row.userId === userId && row.animalId === animalId);
  const visible = matched.length > 0
    ? matched
    : rows.filter(row => row.animalId === animalId);
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createLocalHistoricoBrinco(
  userId: number,
  input: Record<string, any>,
): Promise<{ id: number }> {
  const rows = await readHistoricoBrincos();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    ...input,
    createdAt: now,
  });
  await writeHistoricoBrincos(rows);
  return { id };
}

export async function deleteLocalHistoricoBrinco(userId: number, id: number): Promise<void> {
  const rows = await readHistoricoBrincos();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeHistoricoBrincos(rows.filter(row => row.id !== id));
    return;
  }
  await writeHistoricoBrincos(remaining);
}

export function mergeHistoricoBrincosLists(
  dbRows: LocalHistoricoBrinco[],
  localRows: LocalHistoricoBrinco[],
): LocalHistoricoBrinco[] {
  const byId = new Map<number, LocalHistoricoBrinco>();
  for (const row of dbRows) byId.set(row.id, row);
  for (const row of localRows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

export type LocalReproducaoRegistro = {
  id: number;
  userId: number;
  femeaId: number;
  machoId?: number | null;
  tipo: string;
  dataCobertura: string;
  dataPrevistoParto?: string | null;
  dataPartoReal?: string | null;
  resultado?: string | null;
  filhotes?: number | null;
  observacoes?: string | null;
  createdAt: string;
};

async function readReproducaoRegistros(): Promise<LocalReproducaoRegistro[]> {
  return readJsonFile<LocalReproducaoRegistro[]>(reproducaoRegistrosFile, []);
}

async function writeReproducaoRegistros(rows: LocalReproducaoRegistro[]): Promise<void> {
  await writeJsonFile(reproducaoRegistrosFile, rows);
}

export async function listLocalReproducaoRegistros(userId: number): Promise<LocalReproducaoRegistro[]> {
  const rows = await readReproducaoRegistros();
  const matched = rows.filter(row => row.userId === userId);
  const visible = matched.length > 0 ? matched : rows;
  return visible.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createLocalReproducaoRegistro(
  userId: number,
  input: {
    femeaId: number;
    machoId?: number;
    tipo: string;
    dataCobertura: string;
    dataPrevistoParto?: string;
    resultado?: string;
    observacoes?: string;
  },
): Promise<{ id: number }> {
  const rows = await readReproducaoRegistros();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const now = new Date().toISOString();
  rows.push({
    id,
    userId,
    femeaId: input.femeaId,
    machoId: input.machoId ?? null,
    tipo: input.tipo,
    dataCobertura: normalizeLocalDateField(input.dataCobertura),
    dataPrevistoParto: input.dataPrevistoParto
      ? normalizeLocalDateField(input.dataPrevistoParto)
      : null,
    resultado: input.resultado ?? null,
    observacoes: input.observacoes ?? null,
    createdAt: now,
  });
  await writeReproducaoRegistros(rows);
  return { id };
}

export async function updateLocalReproducaoRegistro(
  userId: number,
  id: number,
  input: {
    tipo: string;
    dataCobertura: string;
    dataPrevistoParto?: string | null;
    resultado?: string;
    observacoes?: string;
  },
): Promise<void> {
  const rows = await readReproducaoRegistros();
  const idx = rows.findIndex(row => row.userId === userId && row.id === id);
  const targetIdx = idx !== -1 ? idx : rows.findIndex(row => row.id === id);
  if (targetIdx === -1) throw new Error("Registro reprodutivo não encontrado");
  rows[targetIdx] = {
    ...rows[targetIdx],
    tipo: input.tipo,
    dataCobertura: normalizeLocalDateField(input.dataCobertura),
    dataPrevistoParto: input.dataPrevistoParto
      ? normalizeLocalDateField(input.dataPrevistoParto)
      : null,
    resultado: input.resultado ?? null,
    observacoes: input.observacoes ?? null,
  };
  await writeReproducaoRegistros(rows);
}

export async function deleteLocalReproducaoRegistro(userId: number, id: number): Promise<void> {
  const rows = await readReproducaoRegistros();
  const remaining = rows.filter(row => !(row.userId === userId && row.id === id));
  if (remaining.length === rows.length) {
    await writeReproducaoRegistros(rows.filter(row => row.id !== id));
    return;
  }
  await writeReproducaoRegistros(remaining);
}

type MapaLoteRow = {
  loteId: number;
  loteNome: string;
  loteSigla: string | null;
  dataEntradaPasto: string | null;
  totalAnimais: number;
};

type MapaSubdivisaoRow = {
  pastoId: number;
  pastoNome: string;
  pastoSigla: string | null;
  pastoStatus: string;
  areaHa: string | null;
  capacidade: number | null;
  taxaLotacao: number | null;
  totalAnimais: number;
  diasVazio: number | null;
  lotes: MapaLoteRow[];
};

function buildMapaSubdivisoesFromLocal(
  pastosList: LocalPasto[],
  lotesList: LocalLote[],
  totalPorLote: Map<number, number>,
  q: string,
  movimentacoesPorLote: Map<number, MovimentacaoPastoLoteRef[]>,
  hojeISO: string,
  pastoIdFilter?: number,
): { subdivisoes: MapaSubdivisaoRow[]; semSubdivisao: MapaLoteRow[] } {
  const { porPasto, semSubdivisao: semSubdivisaoLotes, localizacaoPorLoteId } =
    agruparLotesPorLocalizacaoVigente(lotesList, movimentacoesPorLote, hojeISO);

  const pastosComLote = new Set(porPasto.keys());

  const subdivisoes = [...porPasto.entries()]
    .map(([pastoId, lotesGrupo]) => {
      const pasto = pastosList.find(p => p.id === pastoId);
      if (!pasto) return null;
      const totalAnimais = lotesGrupo.reduce((s, l) => s + (totalPorLote.get(l.id) ?? 0), 0);
      const areaNum = pasto.area != null && pasto.area !== '' ? Number(pasto.area) : null;
      const taxaLotacao = areaNum && areaNum > 0
        ? Math.round((totalAnimais / areaNum) * 100) / 100
        : null;
      return {
        pastoId,
        pastoNome: pasto.nome,
        pastoSigla: pasto.sigla ?? null,
        pastoStatus: totalAnimais > 0 ? 'ativo' : 'vazio',
        areaHa: pasto.area != null ? String(pasto.area) : null,
        capacidade: pasto.capacidade ?? null,
        taxaLotacao,
        totalAnimais,
        diasVazio: null as number | null,
        lotes: lotesGrupo.map(l => ({
          loteId: l.id,
          loteNome: l.nome,
          loteSigla: l.sigla ?? null,
          dataEntradaPasto: localizacaoPorLoteId.get(l.id)?.dataEntradaPasto ?? null,
          totalAnimais: totalPorLote.get(l.id) ?? 0,
        })),
      };
    })
    .filter((s): s is MapaSubdivisaoRow => s != null)
    .filter(s => !pastoIdFilter || s.pastoId === pastoIdFilter)
    .filter(s => !q || s.pastoNome.toLowerCase().includes(q) || s.lotes.some(l => l.loteNome.toLowerCase().includes(q)))
    .sort((a, b) => a.pastoNome.localeCompare(b.pastoNome, 'pt-BR'));

  const pastosVazios = pastosList
    .filter(p => !pastosComLote.has(p.id))
    .filter(p => !pastoIdFilter || p.id === pastoIdFilter)
    .filter(p => !q || p.nome.toLowerCase().includes(q))
    .map(p => ({
      pastoId: p.id,
      pastoNome: p.nome,
      pastoSigla: p.sigla ?? null,
      pastoStatus: 'vazio' as const,
      areaHa: p.area != null ? String(p.area) : null,
      capacidade: p.capacidade ?? null,
      taxaLotacao: 0,
      totalAnimais: 0,
      diasVazio: null as number | null,
      lotes: [] as MapaLoteRow[],
    }));

  const semSubdivisao = semSubdivisaoLotes
    .filter(l => !pastoIdFilter)
    .filter(l => !q || l.nome.toLowerCase().includes(q))
    .map(l => ({
      loteId: l.id,
      loteNome: l.nome,
      loteSigla: l.sigla ?? null,
      dataEntradaPasto: localizacaoPorLoteId.get(l.id)?.dataEntradaPasto ?? null,
      totalAnimais: totalPorLote.get(l.id) ?? 0,
    }));

  return {
    subdivisoes: [...subdivisoes, ...pastosVazios].sort((a, b) => a.pastoNome.localeCompare(b.pastoNome, 'pt-BR')),
    semSubdivisao,
  };
}

async function buildLocalTotalPorLote(userId: number, loteIds: number[]): Promise<Map<number, number>> {
  const totalPorLote = new Map<number, number>();
  if (loteIds.length === 0) return totalPorLote;
  const loteIdSet = new Set(loteIds);
  const animaisAtivos = (await listLocalAnimais(userId)).filter(
    a => a.status === 'ativo' && a.loteId != null && loteIdSet.has(Number(a.loteId)),
  );
  for (const a of animaisAtivos) {
    const loteId = Number(a.loteId);
    totalPorLote.set(loteId, (totalPorLote.get(loteId) ?? 0) + 1);
  }
  return totalPorLote;
}

export async function buildLocalMapaRebanhoV2(
  userId: number,
  input: { fazendaId: number; pastoId?: number; search?: string },
): Promise<{ subdivisoes: MapaSubdivisaoRow[]; semSubdivisao: MapaLoteRow[] }> {
  const fazendas = await listLocalFazendas(userId);
  if (!fazendas.some(f => f.id === input.fazendaId)) {
    return { subdivisoes: [], semSubdivisao: [] };
  }

  const pastosList = await listLocalPastosByFazenda(userId, input.fazendaId);
  const lotesList = (await listLocalLotes(userId)).filter(l => l.fazendaId === input.fazendaId);

  if (lotesList.length === 0 && pastosList.length === 0) {
    return { subdivisoes: [], semSubdivisao: [] };
  }

  const movsRaw = await readLotePastoMovimentacoes();
  const movimentacoesPorLote = new Map<number, MovimentacaoPastoLoteRef[]>();
  for (const m of movsRaw.filter(row => row.userId === userId)) {
    const arr = movimentacoesPorLote.get(m.loteId) ?? [];
    arr.push({
      pastoDestinoId: m.pastoDestinoId,
      dataEntrada: m.dataEntrada,
      dataSaida: m.dataSaida,
    });
    movimentacoesPorLote.set(m.loteId, arr);
  }

  const hojeISO = new Date().toISOString().slice(0, 10);
  let lotesParaMapa = lotesList;
  if (input.pastoId) {
    const { porPasto } = agruparLotesPorLocalizacaoVigente(lotesList, movimentacoesPorLote, hojeISO);
    lotesParaMapa = porPasto.get(input.pastoId) ?? [];
  }

  const totalPorLote = await buildLocalTotalPorLote(userId, lotesList.map(l => l.id));
  const q = input.search?.trim().toLowerCase() ?? '';
  return buildMapaSubdivisoesFromLocal(
    pastosList,
    lotesParaMapa,
    totalPorLote,
    q,
    movimentacoesPorLote,
    hojeISO,
    input.pastoId,
  );
}

export async function buildLocalMapaRebanhoGeral(
  userId: number,
  input?: { search?: string },
): Promise<{
  fazendaId: number;
  fazendaNome: string;
  subdivisoes: MapaSubdivisaoRow[];
  semSubdivisao: MapaLoteRow[];
  totalAnimais: number;
}[]> {
  const fazendasList = await listLocalFazendas(userId);
  if (fazendasList.length === 0) return [];

  const pastosList = await listLocalPastos(userId);
  const lotesList = await listLocalLotes(userId);
  const totalPorLote = await buildLocalTotalPorLote(userId, lotesList.map(l => l.id));
  const q = input?.search?.trim().toLowerCase() ?? '';
  const hojeISO = new Date().toISOString().slice(0, 10);
  const movsRaw = await readLotePastoMovimentacoes();
  const movimentacoesPorLote = new Map<number, MovimentacaoPastoLoteRef[]>();
  for (const m of movsRaw.filter(row => row.userId === userId)) {
    const arr = movimentacoesPorLote.get(m.loteId) ?? [];
    arr.push({
      pastoDestinoId: m.pastoDestinoId,
      dataEntrada: m.dataEntrada,
      dataSaida: m.dataSaida,
    });
    movimentacoesPorLote.set(m.loteId, arr);
  }

  const resultadoPorFazenda = fazendasList.map(fazenda => {
    const lotesF = lotesList.filter(l => l.fazendaId === fazenda.id);
    const pastosF = pastosList.filter(p => p.fazendaId === fazenda.id);
    const { subdivisoes, semSubdivisao } = buildMapaSubdivisoesFromLocal(
      pastosF,
      lotesF,
      totalPorLote,
      q,
      movimentacoesPorLote,
      hojeISO,
    );
    const totalAnimais = lotesF.reduce((s, l) => s + (totalPorLote.get(l.id) ?? 0), 0);
    return {
      fazendaId: fazenda.id,
      fazendaNome: fazenda.nome,
      subdivisoes,
      semSubdivisao,
      totalAnimais,
    };
  });

  return q
    ? resultadoPorFazenda.filter(
      f => f.subdivisoes.length > 0 || f.semSubdivisao.length > 0 || f.fazendaNome.toLowerCase().includes(q),
    )
    : resultadoPorFazenda;
}

export async function buildLocalRebanhoOverview(userId: number, fazendaId?: number) {
  const { computeRebanhoOverview } = await import("./rebanhoOverviewCompute");
  const { buildLoteFazendaContext, filterAnimaisPorFazenda } = await import("./animaisPorFazenda");

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const lotesAll = await listLocalLotes(userId);
  const pastosAll = await listLocalPastos(userId);
  let lista = (await listLocalAnimais(userId)).filter(a => a.status === "ativo");

  if (fazendaId != null) {
    const { loteFazendaById } = buildLoteFazendaContext(lotesAll, pastosAll);
    lista = filterAnimaisPorFazenda(lista, fazendaId, loteFazendaById);
  }

  const animalIds = new Set(lista.map(a => a.id));
  const pesagensAll = (await listLocalPesagens(userId)).filter(p => animalIds.has(p.animalId));
  const pesagensPorAnimal = buildLocalPesagensPorAnimal(pesagensAll);

  const saudeAll = (await listLocalSaudeRegistros(userId))
    .filter(s => animalIds.has(s.animalId))
    .map(s => ({
      animalId: s.animalId,
      medicamento: s.medicamento,
      dataRegistro: s.dataRegistro,
      proximaData: s.proximaData,
    }));

  const fimCarenciaPorAnimal = buildFimCarenciaPorAnimal(saudeAll, new Map(), hoje);

  const loteIds = [...new Set(lista.map(a => a.loteId).filter(Boolean) as number[])];
  const lotesRows = lotesAll
    .filter(l => loteIds.includes(l.id))
    .map(l => ({ id: l.id, nome: l.nome, pastoAtualId: l.pastoAtualId ?? null }));

  const pastoIds = [...new Set(lotesRows.map(l => l.pastoAtualId).filter(Boolean) as number[])];
  const pastoCapacidadeMap = new Map<number, number | null>(
    pastosAll
      .filter(p => pastoIds.includes(p.id))
      .map(p => [p.id, p.capacidade ?? null]),
  );

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesStr = inicioMes.toISOString().slice(0, 10);
  const saidasCount = (await listLocalAnimais(userId)).filter(a =>
    ["vendido", "morto", "transferido"].includes(String(a.status))
    && String(a.updatedAt ?? "") >= inicioMesStr,
  ).length;

  return computeRebanhoOverview({
    lista: lista.map(a => ({
      id: a.id,
      brinco: a.brinco ?? null,
      categoria: a.categoria ?? null,
      sexo: a.sexo ?? null,
      raca: a.raca ?? null,
      loteId: a.loteId ?? null,
      dataNascimento: a.dataNascimento ?? null,
      dataEntrada: a.dataEntrada ?? null,
      pesoAtual: a.pesoAtual ?? null,
    })),
    pesagensPorAnimal,
    emCarenciaAnimalIds: new Set(fimCarenciaPorAnimal.keys()),
    lotesRows,
    pastoCapacidadeMap,
    saidasCount,
    hoje,
  });
}
