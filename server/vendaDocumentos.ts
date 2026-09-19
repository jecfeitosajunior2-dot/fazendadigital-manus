import { TRPCError } from "@trpc/server";
import {
  VENDA_DOCUMENTO_MAX_BYTES,
  type VendaDocumentoTipo,
} from "../shared/vendaDocumentos";

export {
  VENDA_DOCUMENTO_MAX_BYTES,
  VENDA_DOCUMENTO_TIPO_LABEL,
  VENDA_DOCUMENTO_TIPOS,
  type VendaDocumentoTipo,
} from "../shared/vendaDocumentos";

export const VENDA_DOCUMENTO_STORAGE_PREFIX = "venda_doc";

export const MSG_VENDA_DOC_VENDA_NAO_ENCONTRADA = "Venda não encontrada.";
export const MSG_VENDA_DOC_DOCUMENTO_NAO_ENCONTRADO = "Documento não encontrado.";
export const MSG_VENDA_DOC_ARQUIVO_INVALIDO = "Envie um arquivo PDF válido.";
export const MSG_VENDA_DOC_TAMANHO = "O PDF deve ter no máximo 10 MB.";
export const MSG_VENDA_DOC_JA_EXISTE =
  "Já existe um arquivo nesta categoria. Confirme a substituição.";
export const MSG_VENDA_DOC_FALHOU = "Não foi possível salvar o documento.";
export const MSG_VENDA_DOC_TIPO = "Tipo de documento inválido.";

export type VendaDocumentoRow = {
  id: number;
  userId: number;
  vendaId: number;
  tipo: VendaDocumentoTipo;
  nomeOriginal: string;
  storagePath: string;
  uploadedAt: Date | null;
  uploadedByUserId: number | null;
  uploadedByNome: string | null;
};

export type VendaDocumentoPublico = {
  id: number;
  tipo: VendaDocumentoTipo;
  nomeOriginal: string;
  uploadedAt: Date | null;
  uploadedByNome: string | null;
};

export type VendaDocumentoVendaRef = {
  id: number;
  userId: number;
  status: string | null;
};

export type VendaDocumentosStore = {
  getVenda(userId: number, vendaId: number): Promise<VendaDocumentoVendaRef | null>;
  getDocumento(userId: number, documentoId: number): Promise<VendaDocumentoRow | null>;
  getDocumentoPorTipo(
    userId: number,
    vendaId: number,
    tipo: VendaDocumentoTipo,
  ): Promise<VendaDocumentoRow | null>;
  listDocumentos(userId: number, vendaId: number): Promise<VendaDocumentoRow[]>;
  insertDocumento(
    row: Omit<VendaDocumentoRow, "id">,
  ): Promise<number>;
  updateDocumento(
    id: number,
    userId: number,
    patch: Pick<VendaDocumentoRow, "nomeOriginal" | "storagePath" | "uploadedAt" | "uploadedByUserId" | "uploadedByNome">,
  ): Promise<boolean>;
  deleteDocumento(id: number, userId: number): Promise<boolean>;
};

export type VendaDocumentosServiceDeps = {
  store: VendaDocumentosStore;
  upload: (data: Buffer, contentType: string, ext: string, keyPrefix: string) => Promise<string>;
  readFile: (storagePath: string) => Promise<Buffer | null>;
};

function toTrpc(
  message: string,
  code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message });
}

export function isVendaDocumentoTipo(value: unknown): value is VendaDocumentoTipo {
  return value === "gta" || value === "nota_fiscal";
}

export function sanitizarNomeOriginalPdf(nome: string): string {
  const base = String(nome ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.trim() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "");
  if (!cleaned) return "documento.pdf";
  return cleaned.slice(0, 255);
}

export function temAssinaturaPdf(data: Buffer): boolean {
  if (!data.length) return false;
  const head = data.subarray(0, 16).toString("latin1");
  return head.startsWith("%PDF") || /^\s{0,8}%PDF/.test(head);
}

function mimeDeclaradoAceitavel(mimeType?: string): boolean {
  const mime = String(mimeType ?? "").trim().toLowerCase();
  if (!mime) return true;
  if (mime.startsWith("application/pdf")) return true;
  if (mime === "application/x-pdf") return true;
  if (mime === "application/octet-stream") return true;
  return false;
}

export function validarPdfVendaDocumento(input: {
  data: Buffer;
  nomeOriginal?: string;
  mimeType?: string;
}): { ok: true } | { ok: false; message: string } {
  const data = input.data;
  if (!data || !Buffer.isBuffer(data) || data.length === 0) {
    return { ok: false, message: MSG_VENDA_DOC_ARQUIVO_INVALIDO };
  }
  if (data.length > VENDA_DOCUMENTO_MAX_BYTES) {
    return { ok: false, message: MSG_VENDA_DOC_TAMANHO };
  }
  if (!mimeDeclaradoAceitavel(input.mimeType)) {
    return { ok: false, message: MSG_VENDA_DOC_ARQUIVO_INVALIDO };
  }
  if (!temAssinaturaPdf(data)) {
    return { ok: false, message: MSG_VENDA_DOC_ARQUIVO_INVALIDO };
  }
  return { ok: true };
}

export function isVendaDocumentoStoragePath(storagePath: string): boolean {
  return /^\/manus-storage\/venda_doc_[a-f0-9]+\.pdf$/i.test(storagePath);
}

export function storagePathToKey(storagePath: string): string | null {
  const match = storagePath.match(/^\/manus-storage\/(venda_doc_[a-f0-9]+\.pdf)$/i);
  return match?.[1] ?? null;
}

export function toVendaDocumentoPublico(row: VendaDocumentoRow): VendaDocumentoPublico {
  return {
    id: row.id,
    tipo: row.tipo,
    nomeOriginal: row.nomeOriginal,
    uploadedAt: row.uploadedAt,
    uploadedByNome: row.uploadedByNome,
  };
}

export function createVendaDocumentosService(deps: VendaDocumentosServiceDeps) {
  async function assertVendaDoUsuario(userId: number, vendaId: number) {
    const venda = await deps.store.getVenda(userId, vendaId);
    if (!venda) toTrpc(MSG_VENDA_DOC_VENDA_NAO_ENCONTRADA, "NOT_FOUND");
    return venda;
  }

  async function listarPublicos(userId: number, vendaId: number): Promise<VendaDocumentoPublico[]> {
    await assertVendaDoUsuario(userId, vendaId);
    const rows = await deps.store.listDocumentos(userId, vendaId);
    return rows.map(toVendaDocumentoPublico);
  }

  async function anexar(
    userId: number,
    input: {
      vendaId: number;
      tipo: VendaDocumentoTipo;
      data: Buffer;
      nomeOriginal: string;
      mimeType?: string;
      substituir?: boolean;
      uploadedByUserId: number;
      uploadedByNome?: string | null;
    },
  ) {
    if (!isVendaDocumentoTipo(input.tipo)) toTrpc(MSG_VENDA_DOC_TIPO);
    const validacao = validarPdfVendaDocumento({
      data: input.data,
      nomeOriginal: input.nomeOriginal,
      mimeType: input.mimeType,
    });
    if (!validacao.ok) toTrpc(validacao.message);

    await assertVendaDoUsuario(userId, input.vendaId);
    const existente = await deps.store.getDocumentoPorTipo(userId, input.vendaId, input.tipo);
    if (existente && !input.substituir) toTrpc(MSG_VENDA_DOC_JA_EXISTE);

    const nomeOriginal = sanitizarNomeOriginalPdf(input.nomeOriginal);
    const storagePath = await deps.upload(
      input.data,
      "application/pdf",
      "pdf",
      VENDA_DOCUMENTO_STORAGE_PREFIX,
    );
    if (!isVendaDocumentoStoragePath(storagePath)) {
      toTrpc(MSG_VENDA_DOC_FALHOU);
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
      if (!ok) toTrpc(MSG_VENDA_DOC_FALHOU);
      return {
        success: true as const,
        id: existente.id,
        substituido: true,
        arquivoAnteriorOrfao: existente.storagePath,
      };
    }

    const id = await deps.store.insertDocumento({
      userId,
      vendaId: input.vendaId,
      tipo: input.tipo,
      nomeOriginal,
      storagePath,
      uploadedAt,
      uploadedByUserId,
      uploadedByNome,
    });
    if (!Number.isFinite(id) || id <= 0) toTrpc(MSG_VENDA_DOC_FALHOU);
    return { success: true as const, id, substituido: false, arquivoAnteriorOrfao: null as string | null };
  }

  async function excluir(userId: number, input: { vendaId: number; documentoId: number }) {
    await assertVendaDoUsuario(userId, input.vendaId);
    const doc = await deps.store.getDocumento(userId, input.documentoId);
    if (!doc || doc.vendaId !== input.vendaId) {
      toTrpc(MSG_VENDA_DOC_DOCUMENTO_NAO_ENCONTRADO, "NOT_FOUND");
    }
    const ok = await deps.store.deleteDocumento(doc.id, userId);
    if (!ok) toTrpc(MSG_VENDA_DOC_DOCUMENTO_NAO_ENCONTRADO, "NOT_FOUND");
    return {
      success: true as const,
      arquivoFisicoOrfao: doc.storagePath,
    };
  }

  async function carregarArquivo(userId: number, documentoId: number) {
    const doc = await deps.store.getDocumento(userId, documentoId);
    if (!doc) return null;
    const venda = await deps.store.getVenda(userId, doc.vendaId);
    if (!venda) return null;
    const buffer = await deps.readFile(doc.storagePath);
    if (!buffer) return null;
    return {
      id: doc.id,
      vendaId: doc.vendaId,
      tipo: doc.tipo,
      nomeOriginal: doc.nomeOriginal,
      buffer,
    };
  }

  return { listarPublicos, anexar, excluir, carregarArquivo };
}

export function criarPdfMinimo(extraBytes = 0): Buffer {
  const header = Buffer.from("%PDF-1.4\n% minimal test file\n", "latin1");
  if (extraBytes <= 0) return header;
  return Buffer.concat([header, Buffer.alloc(extraBytes, 32)]);
}
