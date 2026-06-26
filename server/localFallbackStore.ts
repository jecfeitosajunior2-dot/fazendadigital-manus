import { promises as fs } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), ".local-data");
const fazendasFile = path.join(dataDir, "fazendas.json");

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
