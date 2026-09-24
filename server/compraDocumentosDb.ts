import { promises as fs } from "node:fs";
import { and, eq } from "drizzle-orm";
import { compraDocumentos, compras } from "../drizzle/schema";
import { db } from "./db";
import { env } from "./_core/env";
import { getLocalManusStoragePath } from "./_core/localManusStorage";
import { uploadToStorage } from "./_core/storage";
import {
  compraStoragePathToKey,
  createCompraDocumentosService,
  isCompraDocumentoTipo,
  type CompraDocumentoRow,
  type CompraDocumentosStore,
} from "./compraDocumentos";

function rowFromDb(row: typeof compraDocumentos.$inferSelect): CompraDocumentoRow | null {
  if (!isCompraDocumentoTipo(row.tipo)) return null;
  return {
    id: row.id,
    userId: row.userId,
    compraId: row.compraId,
    tipo: row.tipo,
    nomeOriginal: row.nomeOriginal,
    storagePath: row.storagePath,
    uploadedAt: row.uploadedAt ?? null,
    uploadedByUserId: row.uploadedByUserId ?? null,
    uploadedByNome: row.uploadedByNome ?? null,
  };
}

export const compraDocumentosStore: CompraDocumentosStore = {
  async getCompra(userId, compraId) {
    const [compra] = await db
      .select({ id: compras.id, userId: compras.userId, status: compras.status })
      .from(compras)
      .where(and(eq(compras.id, compraId), eq(compras.userId, userId)))
      .limit(1);
    return compra ?? null;
  },

  async getDocumento(userId, documentoId) {
    const [row] = await db
      .select()
      .from(compraDocumentos)
      .where(and(eq(compraDocumentos.id, documentoId), eq(compraDocumentos.userId, userId)))
      .limit(1);
    return row ? rowFromDb(row) : null;
  },

  async getDocumentoPorTipo(userId, compraId, tipo) {
    const [row] = await db
      .select()
      .from(compraDocumentos)
      .where(
        and(
          eq(compraDocumentos.userId, userId),
          eq(compraDocumentos.compraId, compraId),
          eq(compraDocumentos.tipo, tipo),
        ),
      )
      .limit(1);
    return row ? rowFromDb(row) : null;
  },

  async listDocumentos(userId, compraId) {
    const rows = await db
      .select()
      .from(compraDocumentos)
      .where(and(eq(compraDocumentos.userId, userId), eq(compraDocumentos.compraId, compraId)));
    return rows.map(rowFromDb).filter((row): row is CompraDocumentoRow => row != null);
  },

  async insertDocumento(row) {
    const result = await db.insert(compraDocumentos).values({
      userId: row.userId,
      compraId: row.compraId,
      tipo: row.tipo,
      nomeOriginal: row.nomeOriginal,
      storagePath: row.storagePath,
      uploadedAt: row.uploadedAt ?? new Date(),
      uploadedByUserId: row.uploadedByUserId,
      uploadedByNome: row.uploadedByNome,
    });
    return Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
  },

  async updateDocumento(id, userId, patch) {
    const result = await db
      .update(compraDocumentos)
      .set({
        nomeOriginal: patch.nomeOriginal,
        storagePath: patch.storagePath,
        uploadedAt: patch.uploadedAt ?? new Date(),
        uploadedByUserId: patch.uploadedByUserId,
        uploadedByNome: patch.uploadedByNome,
      })
      .where(and(eq(compraDocumentos.id, id), eq(compraDocumentos.userId, userId)));
    const affected = Number(
      (result as { affectedRows?: number }[])[0]?.affectedRows ??
        (result as { affectedRows?: number }).affectedRows ??
        0,
    );
    return affected > 0;
  },

  async deleteDocumento(id, userId) {
    const result = await db
      .delete(compraDocumentos)
      .where(and(eq(compraDocumentos.id, id), eq(compraDocumentos.userId, userId)));
    const affected = Number(
      (result as { affectedRows?: number }[])[0]?.affectedRows ??
        (result as { affectedRows?: number }).affectedRows ??
        0,
    );
    return affected > 0;
  },
};

export async function readCompraDocumentoStorageFile(storagePath: string): Promise<Buffer | null> {
  const key = compraStoragePathToKey(storagePath);
  if (!key) return null;
  const local = getLocalManusStoragePath(key);
  if (local) return fs.readFile(local);

  const forgeBaseUrl = env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
  const forgeKey = env.BUILT_IN_FORGE_API_KEY;
  if (!forgeBaseUrl || !forgeKey) return null;
  try {
    const forgeUrl = new URL("v1/storage/presign/get", `${forgeBaseUrl}/`);
    forgeUrl.searchParams.set("path", key);
    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${forgeKey}` },
    });
    if (!forgeResp.ok) return null;
    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) return null;
    const fileResp = await fetch(url);
    if (!fileResp.ok) return null;
    return Buffer.from(await fileResp.arrayBuffer());
  } catch {
    return null;
  }
}

export const compraDocumentosService = createCompraDocumentosService({
  store: compraDocumentosStore,
  upload: uploadToStorage,
  readFile: readCompraDocumentoStorageFile,
});
