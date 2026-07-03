import { promises as fs } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), ".local-data");
const fazendasFile = path.join(dataDir, "fazendas.json");
const pastosFile = path.join(dataDir, "pastos.json");
const benfeitoriasFile = path.join(dataDir, "benfeitorias.json");
const animaisFile = path.join(dataDir, "animais.json");

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

    const ultimoPeso = animal.pesoAtual
      ? Number(animal.pesoAtual)
      : (animal.pesoEntrada ? Number(animal.pesoEntrada) : null);

    return {
      ...animal,
      loteNome: null,
      pastoNome: null,
      idadeMeses,
      diasNaFazenda,
      ultimoPeso,
      ganhoKg: null,
      gmd: null,
      emCarencia: false,
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

  return filtered;
}
