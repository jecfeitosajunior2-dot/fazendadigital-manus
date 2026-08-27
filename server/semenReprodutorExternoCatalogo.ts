import { and, eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractSemenUtilizadoUsos } from "../shared/semenUtilizado";
import {
  MSG_SEMEN_CATALOGO_IDENTIDADE_IMUTAVEL,
  MSG_SEMEN_CATALOGO_NAO_ENCONTRADO,
  canChangeSemenReprodutorExternoTexto,
  historicoReprodutoresExternosDePartidas,
  historicoReprodutoresExternosDeUsos,
  mergeSemenReprodutorExternoCatalogo,
  mergeSemenReprodutorExternoHistorico,
  resolveSemenReprodutorExternoCreate,
  type SemenReprodutorExternoCadastro,
  type SemenReprodutorExternoCatalogoItem,
  type SemenReprodutorExternoCreateInput,
  type SemenReprodutorExternoCreateResult,
} from "../shared/semenReprodutorExternoCatalogo";
import { db, reproducaoRegistros, animais, semenPartidas, semenReprodutoresExternos } from "./db";
import { listLocalAnimais, listLocalReproducaoRegistros } from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";
import { listSemenPartidasCentralLocal } from "./semenEstoqueLocal";

const dataDir = path.resolve(process.cwd(), ".local-data");
const catalogoFile = path.join(dataDir, "semen-reprodutores-externos.json");

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

function isoNow(): string {
  return new Date().toISOString();
}

function toIso(value: string | Date | null | undefined): string {
  if (!value) return isoNow();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapCadastroRow(row: {
  id: number;
  userId: number;
  fazendaId: number;
  reprodutorKey: string;
  reprodutorTexto: string;
  centralPadrao?: string | null;
  observacoes?: string | null;
  ativo: boolean | number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}): SemenReprodutorExternoCadastro {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    reprodutorKey: row.reprodutorKey,
    reprodutorTexto: row.reprodutorTexto,
    centralPadrao: row.centralPadrao ?? null,
    observacoes: row.observacoes ?? null,
    ativo: Boolean(row.ativo),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

async function loadCadastradosLocal(userId: number, fazendaId: number): Promise<SemenReprodutorExternoCadastro[]> {
  const rows = await readJsonFile<SemenReprodutorExternoCadastro[]>(catalogoFile, []);
  return rows.filter(r => r.userId === userId && r.fazendaId === fazendaId);
}

async function loadHistoricoLocal(userId: number, fazendaId: number) {
  const [registrosAll, animaisAll, partidas] = await Promise.all([
    listLocalReproducaoRegistros(userId),
    listLocalAnimais(userId),
    listSemenPartidasCentralLocal(userId),
  ]);
  const registros = registrosAll.filter(
    r => r.userId === userId && String(r.tipo ?? "").trim() === "Inseminação",
  );
  const animaisRows = animaisAll
    .filter(a => a.userId === userId)
    .map(a => ({
      id: a.id,
      brinco: a.brinco ?? null,
      nome: a.nome ?? null,
      fazendaId: a.fazendaId ?? null,
    }));
  const usos = extractSemenUtilizadoUsos(registros, animaisRows, partidas).filter(
    u => u.fazendaId === fazendaId,
  );
  return mergeSemenReprodutorExternoHistorico(
    historicoReprodutoresExternosDeUsos(usos),
    historicoReprodutoresExternosDePartidas(
      partidas
        .filter(p => p.reprodutorKey)
        .map(p => ({
          origemReprodutor: p.origemReprodutor,
          reprodutorKey: String(p.reprodutorKey),
          reprodutorTexto: p.reprodutorTexto,
          centralOrigem: p.centralOrigem,
        })),
    ),
  );
}

async function loadHistoricoDb(userId: number, fazendaId: number) {
  const [registros, animaisRows, partidas] = await Promise.all([
    db
      .select({
        id: reproducaoRegistros.id,
        tipo: reproducaoRegistros.tipo,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        dataCobertura: reproducaoRegistros.dataCobertura,
        createdAt: reproducaoRegistros.createdAt,
        resultado: reproducaoRegistros.resultado,
        observacoes: reproducaoRegistros.observacoes,
      })
      .from(reproducaoRegistros)
      .where(and(eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.tipo, "Inseminação"))),
    db
      .select({
        id: animais.id,
        brinco: animais.brinco,
        nome: animais.nome,
        fazendaId: animais.fazendaId,
      })
      .from(animais)
      .where(eq(animais.userId, userId)),
    db
      .select({
        id: semenPartidas.id,
        origemReprodutor: semenPartidas.origemReprodutor,
        reprodutorKey: semenPartidas.reprodutorKey,
        reprodutorTexto: semenPartidas.reprodutorTexto,
        centralOrigem: semenPartidas.centralOrigem,
        fazendaId: semenPartidas.fazendaId,
      })
      .from(semenPartidas)
      .where(and(eq(semenPartidas.userId, userId), eq(semenPartidas.fazendaId, fazendaId))),
  ]);
  const usos = extractSemenUtilizadoUsos(registros, animaisRows, partidas).filter(
    u => u.fazendaId === fazendaId,
  );
  return mergeSemenReprodutorExternoHistorico(
    historicoReprodutoresExternosDeUsos(usos),
    historicoReprodutoresExternosDePartidas(partidas),
  );
}

export async function listSemenReprodutorExternoCatalogoLocal(
  userId: number,
  fazendaId: number,
  incluirInativos = false,
): Promise<SemenReprodutorExternoCatalogoItem[]> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const [cadastrados, historico] = await Promise.all([
    loadCadastradosLocal(userId, fazendaId),
    loadHistoricoLocal(userId, fazendaId),
  ]);
  const merged = mergeSemenReprodutorExternoCatalogo(cadastrados, historico);
  return incluirInativos ? merged : merged.filter(i => i.ativo);
}

export async function listSemenReprodutorExternoCatalogoDb(
  userId: number,
  fazendaId: number,
  incluirInativos = false,
): Promise<SemenReprodutorExternoCatalogoItem[]> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const [rows, historico] = await Promise.all([
    db
      .select()
      .from(semenReprodutoresExternos)
      .where(
        and(eq(semenReprodutoresExternos.userId, userId), eq(semenReprodutoresExternos.fazendaId, fazendaId)),
      ),
    loadHistoricoDb(userId, fazendaId),
  ]);
  const merged = mergeSemenReprodutorExternoCatalogo(rows.map(mapCadastroRow), historico);
  return incluirInativos ? merged : merged.filter(i => i.ativo);
}

async function persistCadastroLocal(row: SemenReprodutorExternoCadastro): Promise<void> {
  const rows = await readJsonFile<SemenReprodutorExternoCadastro[]>(catalogoFile, []);
  const idx = rows.findIndex(r => r.id === row.id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  await writeJsonFile(catalogoFile, rows);
}

export async function createSemenReprodutorExternoCatalogoLocal(
  userId: number,
  fazendaId: number,
  input: SemenReprodutorExternoCreateInput,
): Promise<SemenReprodutorExternoCreateResult> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const catalogo = await listSemenReprodutorExternoCatalogoLocal(userId, fazendaId, true);
  const resolved = resolveSemenReprodutorExternoCreate(input, catalogo);
  if (resolved.status !== "created") return resolved;
  const rows = await readJsonFile<SemenReprodutorExternoCadastro[]>(catalogoFile, []);
  const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const now = isoNow();
  const row: SemenReprodutorExternoCadastro = {
    id,
    userId,
    fazendaId,
    reprodutorKey: resolved.item.reprodutorKey,
    reprodutorTexto: resolved.item.reprodutorTexto,
    centralPadrao: resolved.item.centralPadrao,
    observacoes: resolved.item.observacoes,
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };
  await persistCadastroLocal(row);
  return {
    status: "created",
    item: { ...resolved.item, id, origem: "cadastro" },
  };
}

export async function createSemenReprodutorExternoCatalogoDb(
  userId: number,
  fazendaId: number,
  input: SemenReprodutorExternoCreateInput,
): Promise<SemenReprodutorExternoCreateResult> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const catalogo = await listSemenReprodutorExternoCatalogoDb(userId, fazendaId, true);
  const resolved = resolveSemenReprodutorExternoCreate(input, catalogo);
  if (resolved.status !== "created") return resolved;
  const result = await db.insert(semenReprodutoresExternos).values({
    userId,
    fazendaId,
    reprodutorKey: resolved.item.reprodutorKey,
    reprodutorTexto: resolved.item.reprodutorTexto,
    centralPadrao: resolved.item.centralPadrao,
    observacoes: resolved.item.observacoes,
    ativo: true,
  });
  const id = Number((result as [{ insertId?: number }])[0]?.insertId ?? 0);
  return {
    status: "created",
    item: { ...resolved.item, id, origem: "cadastro" },
  };
}

export type SemenReprodutorExternoUpdateInput = {
  reprodutorTexto?: string;
  centralPadrao?: string | null;
  observacoes?: string | null;
  ativo?: boolean;
};

async function applyUpdateToCadastro(
  current: SemenReprodutorExternoCadastro,
  input: SemenReprodutorExternoUpdateInput,
): Promise<SemenReprodutorExternoCadastro> {
  const nextTexto = input.reprodutorTexto != null ? String(input.reprodutorTexto).trim() : current.reprodutorTexto;
  if (nextTexto && !canChangeSemenReprodutorExternoTexto(current.reprodutorKey, nextTexto)) {
    throw new Error(MSG_SEMEN_CATALOGO_IDENTIDADE_IMUTAVEL);
  }
  return {
    ...current,
    reprodutorTexto: nextTexto || current.reprodutorTexto,
    centralPadrao:
      input.centralPadrao !== undefined ? String(input.centralPadrao ?? "").trim() || null : current.centralPadrao,
    observacoes:
      input.observacoes !== undefined ? String(input.observacoes ?? "").trim() || null : current.observacoes,
    ativo: input.ativo ?? current.ativo,
    updatedAt: isoNow(),
  };
}

export async function updateSemenReprodutorExternoCatalogoLocal(
  userId: number,
  fazendaId: number,
  key: string,
  input: SemenReprodutorExternoUpdateInput,
): Promise<SemenReprodutorExternoCatalogoItem> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const catalogo = await listSemenReprodutorExternoCatalogoLocal(userId, fazendaId, true);
  const found = catalogo.find(i => i.reprodutorKey === key);
  if (!found) throw new Error(MSG_SEMEN_CATALOGO_NAO_ENCONTRADO);
  const now = isoNow();
  let row = (await loadCadastradosLocal(userId, fazendaId)).find(r => r.reprodutorKey === key);
  if (!row) {
    const rows = await readJsonFile<SemenReprodutorExternoCadastro[]>(catalogoFile, []);
    const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    row = {
      id,
      userId,
      fazendaId,
      reprodutorKey: found.reprodutorKey,
      reprodutorTexto: found.reprodutorTexto,
      centralPadrao: found.centralPadrao,
      observacoes: found.observacoes,
      ativo: found.ativo,
      createdAt: now,
      updatedAt: now,
    };
  }
  const updated = await applyUpdateToCadastro(row, input);
  await persistCadastroLocal(updated);
  return {
    id: updated.id,
    reprodutorKey: updated.reprodutorKey,
    reprodutorTexto: updated.reprodutorTexto,
    centralPadrao: updated.centralPadrao,
    observacoes: updated.observacoes,
    ativo: updated.ativo,
    origem: "cadastro",
    ultimoUso: found.ultimoUso,
  };
}

export async function updateSemenReprodutorExternoCatalogoDb(
  userId: number,
  fazendaId: number,
  key: string,
  input: SemenReprodutorExternoUpdateInput,
): Promise<SemenReprodutorExternoCatalogoItem> {
  await assertFazendaDoUsuario(userId, fazendaId);
  const catalogo = await listSemenReprodutorExternoCatalogoDb(userId, fazendaId, true);
  const found = catalogo.find(i => i.reprodutorKey === key);
  if (!found) throw new Error(MSG_SEMEN_CATALOGO_NAO_ENCONTRADO);
  const [existing] = await db
    .select()
    .from(semenReprodutoresExternos)
    .where(
      and(
        eq(semenReprodutoresExternos.userId, userId),
        eq(semenReprodutoresExternos.fazendaId, fazendaId),
        eq(semenReprodutoresExternos.reprodutorKey, key),
      ),
    )
    .limit(1);
  const current = existing
    ? mapCadastroRow(existing)
    : {
        id: 0,
        userId,
        fazendaId,
        reprodutorKey: found.reprodutorKey,
        reprodutorTexto: found.reprodutorTexto,
        centralPadrao: found.centralPadrao,
        observacoes: found.observacoes,
        ativo: found.ativo,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      };
  const updated = await applyUpdateToCadastro(current, input);
  if (existing) {
    await db
      .update(semenReprodutoresExternos)
      .set({
        reprodutorTexto: updated.reprodutorTexto,
        centralPadrao: updated.centralPadrao,
        observacoes: updated.observacoes,
        ativo: updated.ativo,
      })
      .where(eq(semenReprodutoresExternos.id, existing.id));
    return { ...found, ...updated, id: existing.id, origem: "cadastro" };
  }
  const result = await db.insert(semenReprodutoresExternos).values({
    userId,
    fazendaId,
    reprodutorKey: updated.reprodutorKey,
    reprodutorTexto: updated.reprodutorTexto,
    centralPadrao: updated.centralPadrao,
    observacoes: updated.observacoes,
    ativo: updated.ativo,
  });
  const id = Number((result as [{ insertId?: number }])[0]?.insertId ?? 0);
  return { ...found, ...updated, id, origem: "cadastro" };
}
