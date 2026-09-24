import { TRPCError } from "@trpc/server";
import type { CompraDocumentoTipo } from "../shared/compraDocumentos";
import {
  isVendaDocumentoTipo,
  sanitizarNomeOriginalPdf,
  validarPdfVendaDocumento,
} from "./vendaDocumentos";

export {
  COMPRA_DOCUMENTO_MAX_BYTES,
  COMPRA_DOCUMENTO_TIPO_LABEL,
  COMPRA_DOCUMENTO_TIPOS,
  type CompraDocumentoTipo,
} from "../shared/compraDocumentos";

export const COMPRA_DOCUMENTO_STORAGE_PREFIX = "compra_doc";

export const MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA = "Compra não encontrada.";
export const MSG_COMPRA_DOC_DOCUMENTO_NAO_ENCONTRADO = "Documento não encontrado.";
export const MSG_COMPRA_DOC_JA_EXISTE =
  "Já existe um arquivo nesta categoria. Confirme a substituição.";
export const MSG_COMPRA_DOC_FALHOU = "Não foi possível salvar o documento.";
export const MSG_COMPRA_DOC_TIPO = "Tipo de documento inválido.";

export type CompraDocumentoRow = {
  id: number;
  userId: number;
  compraId: number;
  tipo: CompraDocumentoTipo;
  nomeOriginal: string;
  storagePath: string;
  uploadedAt: Date | null;
  uploadedByUserId: number | null;
  uploadedByNome: string | null;
};

export type CompraDocumentoPublico = {
  id: number;
  tipo: CompraDocumentoTipo;
  nomeOriginal: string;
  uploadedAt: Date | null;
  uploadedByNome: string | null;
};

export type CompraDocumentoCompraRef = {
  id: number;
  userId: number;
  status: string | null;
};

export type CompraDocumentosStore = {
  getCompra(userId: number, compraId: number): Promise<CompraDocumentoCompraRef | null>;
  getDocumento(userId: number, documentoId: number): Promise<CompraDocumentoRow | null>;
  getDocumentoPorTipo(
    userId: number,
    compraId: number,
    tipo: CompraDocumentoTipo,
  ): Promise<CompraDocumentoRow | null>;
  listDocumentos(userId: number, compraId: number): Promise<CompraDocumentoRow[]>;
  insertDocumento(row: Omit<CompraDocumentoRow, "id">): Promise<number>;
  updateDocumento(
    id: number,
    userId: number,
    patch: Pick<
      CompraDocumentoRow,
      "nomeOriginal" | "storagePath" | "uploadedAt" | "uploadedByUserId" | "uploadedByNome"
    >,
  ): Promise<boolean>;
  deleteDocumento(id: number, userId: number): Promise<boolean>;
};

export type CompraDocumentosServiceDeps = {
  store: CompraDocumentosStore;
  upload: (data: Buffer, contentType: string, ext: string, keyPrefix: string) => Promise<string>;
  readFile: (storagePath: string) => Promise<Buffer | null>;
};

function toTrpc(
  message: string,
  code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message });
}

export function isCompraDocumentoTipo(value: unknown): value is CompraDocumentoTipo {
  return isVendaDocumentoTipo(value);
}

export function isCompraDocumentoStoragePath(storagePath: string): boolean {
  return /^\/manus-storage\/compra_doc_[a-f0-9]+\.pdf$/i.test(storagePath);
}

export function compraStoragePathToKey(storagePath: string): string | null {
  const match = storagePath.match(/^\/manus-storage\/(compra_doc_[a-f0-9]+\.pdf)$/i);
  return match?.[1] ?? null;
}

export function toCompraDocumentoPublico(row: CompraDocumentoRow): CompraDocumentoPublico {
  return {
    id: row.id,
    tipo: row.tipo,
    nomeOriginal: row.nomeOriginal,
    uploadedAt: row.uploadedAt,
    uploadedByNome: row.uploadedByNome,
  };
}

export function createCompraDocumentosService(deps: CompraDocumentosServiceDeps) {
  async function assertCompraDoUsuario(userId: number, compraId: number) {
    const compra = await deps.store.getCompra(userId, compraId);
    if (!compra) toTrpc(MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA, "NOT_FOUND");
    return compra;
  }

  async function listarPublicos(userId: number, compraId: number): Promise<CompraDocumentoPublico[]> {
    await assertCompraDoUsuario(userId, compraId);
    const rows = await deps.store.listDocumentos(userId, compraId);
    return rows.map(toCompraDocumentoPublico);
  }

  async function anexar(
    userId: number,
    input: {
      compraId: number;
      tipo: CompraDocumentoTipo;
      data: Buffer;
      nomeOriginal: string;
      mimeType?: string;
      substituir?: boolean;
      uploadedByUserId: number;
      uploadedByNome?: string | null;
    },
  ) {
    if (!isCompraDocumentoTipo(input.tipo)) toTrpc(MSG_COMPRA_DOC_TIPO);
    const validacao = validarPdfVendaDocumento({
      data: input.data,
      nomeOriginal: input.nomeOriginal,
      mimeType: input.mimeType,
    });
    if (!validacao.ok) toTrpc(validacao.message);

    await assertCompraDoUsuario(userId, input.compraId);
    const existente = await deps.store.getDocumentoPorTipo(userId, input.compraId, input.tipo);
    if (existente && !input.substituir) toTrpc(MSG_COMPRA_DOC_JA_EXISTE);

    const nomeOriginal = sanitizarNomeOriginalPdf(input.nomeOriginal);
    const storagePath = await deps.upload(
      input.data,
      "application/pdf",
      "pdf",
      COMPRA_DOCUMENTO_STORAGE_PREFIX,
    );
    if (!isCompraDocumentoStoragePath(storagePath)) {
      toTrpc(MSG_COMPRA_DOC_FALHOU);
    }

    const uploadedAt = new Date();
    const uploadedByUserId = input.uploadedByUserId;
    const uploadedByNome = String(input.uploadedByNome ?? "").trim() || null;

    if (existente) {
      const ok = await deps.store.updateDocumento(existente.id, userId, {
        nomeOriginal,
        storagePath,
        uploadedAt,
        uploadedByUserId,
        uploadedByNome,
      });
      if (!ok) toTrpc(MSG_COMPRA_DOC_FALHOU);
      return {
        success: true as const,
        id: existente.id,
        substituido: true,
        arquivoAnteriorOrfao: existente.storagePath,
      };
    }

    const id = await deps.store.insertDocumento({
      userId,
      compraId: input.compraId,
      tipo: input.tipo,
      nomeOriginal,
      storagePath,
      uploadedAt,
      uploadedByUserId,
      uploadedByNome,
    });
    if (!Number.isFinite(id) || id <= 0) toTrpc(MSG_COMPRA_DOC_FALHOU);
    return { success: true as const, id, substituido: false, arquivoAnteriorOrfao: null as string | null };
  }

  async function excluir(userId: number, input: { compraId: number; documentoId: number }) {
    await assertCompraDoUsuario(userId, input.compraId);
    const doc = await deps.store.getDocumento(userId, input.documentoId);
    if (!doc || doc.compraId !== input.compraId) {
      toTrpc(MSG_COMPRA_DOC_DOCUMENTO_NAO_ENCONTRADO, "NOT_FOUND");
    }
    const ok = await deps.store.deleteDocumento(doc.id, userId);
    if (!ok) toTrpc(MSG_COMPRA_DOC_DOCUMENTO_NAO_ENCONTRADO, "NOT_FOUND");
    return {
      success: true as const,
      arquivoFisicoOrfao: doc.storagePath,
    };
  }

  async function carregarArquivo(userId: number, documentoId: number) {
    const doc = await deps.store.getDocumento(userId, documentoId);
    if (!doc) return null;
    const compra = await deps.store.getCompra(userId, doc.compraId);
    if (!compra) return null;
    const buffer = await deps.readFile(doc.storagePath);
    if (!buffer) return null;
    return {
      id: doc.id,
      compraId: doc.compraId,
      tipo: doc.tipo,
      nomeOriginal: doc.nomeOriginal,
      buffer,
    };
  }

  return { listarPublicos, anexar, excluir, carregarArquivo };
}
