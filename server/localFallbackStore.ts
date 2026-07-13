import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFimCarenciaPorAnimal, toDateOnlyISO } from "../shared/carenciaAnimal";

const dataDir = path.resolve(process.cwd(), ".local-data");
const fazendasFile = path.join(dataDir, "fazendas.json");
const pastosFile = path.join(dataDir, "pastos.json");
const benfeitoriasFile = path.join(dataDir, "benfeitorias.json");
const lotesFile = path.join(dataDir, "lotes.json");
const animaisFile = path.join(dataDir, "animais.json");
const pesagensFile = path.join(dataDir, "pesagens.json");
const saudeRegistrosFile = path.join(dataDir, "saude-registros.json");
const reproducaoRegistrosFile = path.join(dataDir, "reproducao-registros.json");
const historicoBrincosFile = path.join(dataDir, "historico-brincos.json");

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
    "Access denied for user",
    "Failed query:",
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

export async function enrichLocalLote(lote: LocalLote, userId: number) {
  const animais = await listLocalAnimais(userId);
  const fazendas = await listLocalFazendas(userId);
  const qtdAnimais = animais.filter(a => a.loteId === lote.id && a.status === "ativo").length;
  const fazendaNome = lote.fazendaId
    ? (fazendas.find(f => f.id === lote.fazendaId)?.nome ?? null)
    : null;
  return {
    ...lote,
    qtdAnimais,
    pastoNome: null,
    pastoCapacidade: null,
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
  if (input?.fazendaId) lista = lista.filter(a => a.fazendaId === input.fazendaId);
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
  pastoIdFilter?: number,
): { subdivisoes: MapaSubdivisaoRow[]; semSubdivisao: MapaLoteRow[] } {
  const porPasto = new Map<number, LocalLote[]>();
  const semSubdivisaoLotes: LocalLote[] = [];

  for (const lote of lotesList) {
    const pastoAtualId = lote.pastoAtualId != null ? Number(lote.pastoAtualId) : null;
    if (pastoAtualId) {
      const arr = porPasto.get(pastoAtualId) ?? [];
      arr.push(lote);
      porPasto.set(pastoAtualId, arr);
    } else {
      semSubdivisaoLotes.push(lote);
    }
  }

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
          dataEntradaPasto: l.dataEntradaPasto ?? null,
          totalAnimais: totalPorLote.get(l.id) ?? 0,
        })),
      };
    })
    .filter((s): s is MapaSubdivisaoRow => s != null)
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
    .filter(l => !q || l.nome.toLowerCase().includes(q))
    .map(l => ({
      loteId: l.id,
      loteNome: l.nome,
      loteSigla: l.sigla ?? null,
      dataEntradaPasto: l.dataEntradaPasto ?? null,
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
  let lotesList = (await listLocalLotes(userId)).filter(l => l.fazendaId === input.fazendaId);
  if (input.pastoId) {
    lotesList = lotesList.filter(l => Number(l.pastoAtualId) === input.pastoId);
  }

  if (lotesList.length === 0 && pastosList.length === 0) {
    return { subdivisoes: [], semSubdivisao: [] };
  }

  const totalPorLote = await buildLocalTotalPorLote(userId, lotesList.map(l => l.id));
  const q = input.search?.trim().toLowerCase() ?? '';
  return buildMapaSubdivisoesFromLocal(pastosList, lotesList, totalPorLote, q, input.pastoId);
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

  const resultadoPorFazenda = fazendasList.map(fazenda => {
    const lotesF = lotesList.filter(l => l.fazendaId === fazenda.id);
    const pastosF = pastosList.filter(p => p.fazendaId === fazenda.id);
    const { subdivisoes, semSubdivisao } = buildMapaSubdivisoesFromLocal(pastosF, lotesF, totalPorLote, q);
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
