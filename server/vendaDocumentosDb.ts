import { promises as fs } from "node:fs";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { vendaDocumentos, vendas } from "../drizzle/schema";
import { db } from "./db";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import {
  MSG_SEM_PERMISSAO_CRIAR_VENDAS,
  MSG_SEM_PERMISSAO_VER_VENDAS,
  PERMISSAO_VISUALIZAR_VENDAS,
  erroVendaConsulta,
} from "./consultaVendaAutorizada";
import { autorizarVendaNaTransacao } from "./consultaVendaDb";
import { env } from "./_core/env";
import { getLocalManusStoragePath } from "./_core/localManusStorage";
import { uploadToStorage } from "./_core/storage";
import {
  createVendaDocumentosService,
  isVendaDocumentoTipo,
  storagePathToKey,
  type VendaDocumentoRow,
  type VendaDocumentosStore,
} from "./vendaDocumentos";

function rowFromDb(row: typeof vendaDocumentos.$inferSelect): VendaDocumentoRow | null {
  if (!isVendaDocumentoTipo(row.tipo)) return null;
  return {
    id: row.id,
    userId: row.userId,
    vendaId: row.vendaId,
    tipo: row.tipo,
    nomeOriginal: row.nomeOriginal,
    storagePath: row.storagePath,
    uploadedAt: row.uploadedAt ?? null,
    uploadedByUserId: row.uploadedByUserId ?? null,
    uploadedByNome: row.uploadedByNome ?? null,
  };
}

export const vendaDocumentosStore: VendaDocumentosStore = {
  async getVenda(userId, vendaId) {
    const [venda] = await db
      .select({ id: vendas.id, userId: vendas.userId, status: vendas.status })
      .from(vendas)
      .where(and(eq(vendas.id, vendaId), eq(vendas.userId, userId)))
      .limit(1);
    return venda ?? null;
  },

  async getDocumento(userId, documentoId) {
    const [row] = await db
      .select()
      .from(vendaDocumentos)
      .where(and(eq(vendaDocumentos.id, documentoId), eq(vendaDocumentos.userId, userId)))
      .limit(1);
    return row ? rowFromDb(row) : null;
  },

  async getDocumentoPorTipo(userId, vendaId, tipo) {
    const [row] = await db
      .select()
      .from(vendaDocumentos)
      .where(
        and(
          eq(vendaDocumentos.userId, userId),
          eq(vendaDocumentos.vendaId, vendaId),
          eq(vendaDocumentos.tipo, tipo),
        ),
      )
      .limit(1);
    return row ? rowFromDb(row) : null;
  },

  async listDocumentos(userId, vendaId) {
    const rows = await db
      .select()
      .from(vendaDocumentos)
      .where(and(eq(vendaDocumentos.userId, userId), eq(vendaDocumentos.vendaId, vendaId)));
    return rows.map(rowFromDb).filter((row): row is VendaDocumentoRow => row != null);
  },

  async insertDocumento(row) {
    const result = await db.insert(vendaDocumentos).values({
      userId: row.userId,
      vendaId: row.vendaId,
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
      .update(vendaDocumentos)
      .set({
        nomeOriginal: patch.nomeOriginal,
        storagePath: patch.storagePath,
        uploadedAt: patch.uploadedAt ?? new Date(),
        uploadedByUserId: patch.uploadedByUserId,
        uploadedByNome: patch.uploadedByNome,
      })
      .where(and(eq(vendaDocumentos.id, id), eq(vendaDocumentos.userId, userId)));
    const affected = Number(
      (result as { affectedRows?: number }[])[0]?.affectedRows ??
        (result as { affectedRows?: number }).affectedRows ??
        0,
    );
    return affected > 0;
  },

  async deleteDocumento(id, userId) {
    const result = await db
      .delete(vendaDocumentos)
      .where(and(eq(vendaDocumentos.id, id), eq(vendaDocumentos.userId, userId)));
    const affected = Number(
      (result as { affectedRows?: number }[])[0]?.affectedRows ??
        (result as { affectedRows?: number }).affectedRows ??
        0,
    );
    return affected > 0;
  },

  async autorizarDono(contexto) {
    return db.transaction(async (tx) => {
      const [peek] = await tx
        .select({ fazendaId: vendas.fazendaId, userId: vendas.userId })
        .from(vendas)
        .where(eq(vendas.id, contexto.vendaId))
        .limit(1);
      if (!peek?.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });
      }
      if (peek.fazendaId == null) {
        const usuario = await consultaEstoqueNaTransacao(tx as never).usuario(contexto.executorId);
        const sessaoOk = contexto.sessionVersionDaSessao == null
          || contexto.sessionVersionDaSessao === usuario?.sessionVersion;
        if (
          !usuario
          || !sessaoOk
          || usuario.situacao !== "ativo"
          || usuario.papel !== "principal"
          || usuario.titularUserId !== peek.userId
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_CRIAR_VENDAS });
        }
        return usuario.titularUserId;
      }
      const acesso = await autorizarVendaNaTransacao(tx as never, {
        executorId: contexto.executorId,
        sessionVersionDaSessao: contexto.sessionVersionDaSessao,
        fazendaId: peek.fazendaId,
        permissaoId: contexto.permissaoId,
      }, MSG_SEM_PERMISSAO_CRIAR_VENDAS);
      if (!acesso.ok) throw erroVendaConsulta(acesso, MSG_SEM_PERMISSAO_CRIAR_VENDAS);
      if (peek.userId !== acesso.titularUserId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });
      }
      return acesso.titularUserId;
    });
  },

  async resolverDonoArquivo(contexto) {
    const [doc] = await db
      .select({ vendaId: vendaDocumentos.vendaId })
      .from(vendaDocumentos)
      .where(eq(vendaDocumentos.id, contexto.documentoId))
      .limit(1);
    if (!doc) return null;
    try {
      return await db.transaction(async (tx) => {
        const [peek] = await tx
          .select({ fazendaId: vendas.fazendaId, userId: vendas.userId })
          .from(vendas)
          .where(eq(vendas.id, doc.vendaId))
          .limit(1);
        if (!peek?.userId) return null;
        if (peek.fazendaId == null) {
          const usuario = await consultaEstoqueNaTransacao(tx as never).usuario(contexto.executorId);
          const sessaoOk = contexto.sessionVersionDaSessao == null
            || contexto.sessionVersionDaSessao === usuario?.sessionVersion;
          if (
            !usuario
            || !sessaoOk
            || usuario.situacao !== "ativo"
            || usuario.papel !== "principal"
            || usuario.titularUserId !== peek.userId
          ) return null;
          return usuario.titularUserId;
        }
        const acesso = await autorizarVendaNaTransacao(tx as never, {
          executorId: contexto.executorId,
          sessionVersionDaSessao: contexto.sessionVersionDaSessao,
          fazendaId: peek.fazendaId,
          permissaoId: PERMISSAO_VISUALIZAR_VENDAS,
        }, MSG_SEM_PERMISSAO_VER_VENDAS);
        if (!acesso.ok || peek.userId !== acesso.titularUserId) return null;
        return acesso.titularUserId;
      });
    } catch {
      return null;
    }
  },
};

export async function readVendaDocumentoStorageFile(storagePath: string): Promise<Buffer | null> {
  const key = storagePathToKey(storagePath);
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

export const vendaDocumentosService = createVendaDocumentosService({
  store: vendaDocumentosStore,
  upload: uploadToStorage,
  readFile: readVendaDocumentoStorageFile,
});

export type { VendaDocumentoTipo };
