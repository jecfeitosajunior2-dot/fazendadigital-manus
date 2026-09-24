import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { criarPdfMinimo } from "./vendaDocumentos";
import {
  MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
  MSG_COMPRA_DOC_DOCUMENTO_NAO_ENCONTRADO,
  MSG_COMPRA_DOC_JA_EXISTE,
  createCompraDocumentosService,
  toCompraDocumentoPublico,
  type CompraDocumentoCompraRef,
  type CompraDocumentoRow,
  type CompraDocumentoTipo,
  type CompraDocumentosStore,
} from "./compraDocumentos";

function criarStoreMemoria(seed?: {
  compras?: CompraDocumentoCompraRef[];
  documentos?: CompraDocumentoRow[];
}): CompraDocumentosStore & {
  compras: CompraDocumentoCompraRef[];
  documentos: CompraDocumentoRow[];
  nextId: number;
} {
  const state = {
    compras: seed?.compras ? [...seed.compras] : [{ id: 9001, userId: 7, status: "concluido" }],
    documentos: seed?.documentos ? [...seed.documentos] : [],
    nextId: (seed?.documentos?.reduce((max, row) => Math.max(max, row.id), 0) ?? 0) + 1,
  };

  const store: CompraDocumentosStore = {
    async getCompra(userId, compraId) {
      return state.compras.find(c => c.id === compraId && c.userId === userId) ?? null;
    },
    async getDocumento(userId, documentoId) {
      return state.documentos.find(d => d.id === documentoId && d.userId === userId) ?? null;
    },
    async getDocumentoPorTipo(userId, compraId, tipo) {
      return state.documentos.find(d => d.userId === userId && d.compraId === compraId && d.tipo === tipo) ?? null;
    },
    async listDocumentos(userId, compraId) {
      return state.documentos.filter(d => d.userId === userId && d.compraId === compraId);
    },
    async insertDocumento(row) {
      const existente = state.documentos.find(d => d.compraId === row.compraId && d.tipo === row.tipo);
      if (existente) throw new Error("unique compra_documentos_compra_tipo_uq");
      const id = state.nextId++;
      state.documentos.push({ ...row, id });
      return id;
    },
    async updateDocumento(id, userId, patch) {
      const idx = state.documentos.findIndex(d => d.id === id && d.userId === userId);
      if (idx < 0) return false;
      state.documentos[idx] = { ...state.documentos[idx], ...patch };
      return true;
    },
    async deleteDocumento(id, userId) {
      const idx = state.documentos.findIndex(d => d.id === id && d.userId === userId);
      if (idx < 0) return false;
      state.documentos.splice(idx, 1);
      return true;
    },
  };

  return Object.assign(store, state);
}

function servicoCom(store: CompraDocumentosStore, uploads: string[] = []) {
  let seq = 0;
  return createCompraDocumentosService({
    store,
    upload: async () => {
      const path = `/manus-storage/compra_doc_${(++seq).toString(16).padStart(16, "0")}.pdf`;
      uploads.push(path);
      return path;
    },
    readFile: async storagePath => {
      if (!storagePath.startsWith("/manus-storage/compra_doc_")) return null;
      return criarPdfMinimo();
    },
  });
}

const uploadBase = {
  compraId: 9001,
  data: criarPdfMinimo(),
  nomeOriginal: "gta-compra.pdf",
  mimeType: "application/pdf",
  uploadedByUserId: 7,
  uploadedByNome: "Pedro Gomes",
};

describe("documentos da compra", () => {
  it("anexa GTA e Nota Fiscal na compra correta", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await svc.anexar(7, { ...uploadBase, tipo: "gta" });
    await svc.anexar(7, { ...uploadBase, tipo: "nota_fiscal", nomeOriginal: "nf-compra.pdf" });
    expect(store.documentos.map(d => d.tipo).sort()).toEqual(["gta", "nota_fiscal"]);
    expect(store.documentos.every(d => d.compraId === 9001)).toBe(true);
    expect(toCompraDocumentoPublico(store.documentos[0]!)).not.toHaveProperty("storagePath");
  });

  it("unique (compra_id, tipo) bloqueia segundo GTA sem substituição", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await svc.anexar(7, { ...uploadBase, tipo: "gta" });
    await expect(svc.anexar(7, { ...uploadBase, tipo: "gta", nomeOriginal: "outra.pdf" })).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_JA_EXISTE,
    });
    expect(store.documentos).toHaveLength(1);
  });

  it("substituição atualiza o arquivo e mantém um único registro", async () => {
    const store = criarStoreMemoria();
    const uploads: string[] = [];
    const svc = servicoCom(store, uploads);
    const primeiro = await svc.anexar(7, { ...uploadBase, tipo: "gta" });
    const segundo = await svc.anexar(7, {
      ...uploadBase,
      tipo: "gta",
      nomeOriginal: "gta-nova.pdf",
      substituir: true,
    });
    expect(segundo.substituido).toBe(true);
    expect(segundo.id).toBe(primeiro.id);
    expect(store.documentos).toHaveLength(1);
    expect(store.documentos[0]?.nomeOriginal).toBe("gta-nova.pdf");
    expect(store.documentos[0]?.storagePath).toBe(uploads[1]);
  });

  it("exclusão remove só o documento", async () => {
    const store = criarStoreMemoria();
    const snapshot = { ...store.compras[0] };
    const svc = servicoCom(store);
    const { id } = await svc.anexar(7, { ...uploadBase, tipo: "nota_fiscal" });
    await svc.excluir(7, { compraId: 9001, documentoId: id });
    expect(store.documentos).toHaveLength(0);
    expect(store.compras[0]).toEqual(snapshot);
  });

  it("visualizar/baixar exige userId da compra", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    const { id } = await svc.anexar(7, { ...uploadBase, tipo: "gta" });
    await expect(svc.carregarArquivo(99, id)).resolves.toBeNull();
    await expect(svc.carregarArquivo(7, id)).resolves.toMatchObject({
      id,
      compraId: 9001,
      nomeOriginal: "gta-compra.pdf",
    });
  });

  it("usuário errado não lista, anexa nem exclui", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await expect(svc.listarPublicos(99, 9001)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
    });
    await expect(svc.anexar(99, { ...uploadBase, tipo: "gta" })).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
    });
    await expect(svc.excluir(99, { compraId: 9001, documentoId: 1 })).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
    });
    expect(store.documentos).toHaveLength(0);
  });

  it("compraId de outro usuário não lista, anexa nem baixa", async () => {
    const store = criarStoreMemoria({
      compras: [
        { id: 9001, userId: 7, status: "concluido" },
        { id: 9003, userId: 99, status: "concluido" },
      ],
    });
    const svc = servicoCom(store);
    const { id } = await svc.anexar(99, { ...uploadBase, compraId: 9003, tipo: "gta", uploadedByUserId: 99 });
    await expect(svc.listarPublicos(7, 9003)).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
    });
    await expect(svc.anexar(7, { ...uploadBase, compraId: 9003, tipo: "nota_fiscal" })).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
    });
    await expect(svc.excluir(7, { compraId: 9003, documentoId: id })).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_COMPRA_NAO_ENCONTRADA,
    });
    await expect(svc.carregarArquivo(7, id)).resolves.toBeNull();
    expect(store.documentos).toHaveLength(1);
    expect(store.documentos[0]?.userId).toBe(99);
  });

  it("documento da compra 9001 não aparece na compra 9002", async () => {
    const store = criarStoreMemoria({
      compras: [
        { id: 9001, userId: 7, status: "concluido" },
        { id: 9002, userId: 7, status: "concluido" },
      ],
    });
    const svc = servicoCom(store);
    await svc.anexar(7, { ...uploadBase, compraId: 9001, tipo: "gta" });
    expect(await svc.listarPublicos(7, 9002)).toEqual([]);
    expect(await svc.listarPublicos(7, 9001)).toHaveLength(1);
  });

  it("compra cancelada mantém documentos e permite visualizar", async () => {
    const store = criarStoreMemoria({
      compras: [{ id: 9001, userId: 7, status: "cancelado" }],
    });
    const svc = servicoCom(store);
    const { id } = await svc.anexar(7, { ...uploadBase, tipo: "gta" });
    store.compras[0] = { id: 9001, userId: 7, status: "cancelado" };
    const lista = await svc.listarPublicos(7, 9001);
    expect(lista).toHaveLength(1);
    await expect(svc.carregarArquivo(7, id)).resolves.toMatchObject({ compraId: 9001 });
  });

  it("exclusão inexistente não inventa compra", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await expect(svc.excluir(7, { compraId: 9001, documentoId: 999 })).rejects.toMatchObject({
      message: MSG_COMPRA_DOC_DOCUMENTO_NAO_ENCONTRADO,
    });
  });

  it("documento da venda não é lido pelo storage da compra", async () => {
    const store = criarStoreMemoria();
    const svc = createCompraDocumentosService({
      store,
      upload: async () => "/manus-storage/venda_doc_ffffffffffffffff.pdf",
      readFile: async () => criarPdfMinimo(),
    });
    await expect(svc.anexar(7, { ...uploadBase, tipo: "gta" })).rejects.toMatchObject({
      message: "Não foi possível salvar o documento.",
    });
    expect(store.documentos).toHaveLength(0);
  });

  it("não cria animal, pesagem ou movimentação", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await svc.anexar(7, { ...uploadBase, tipo: "gta" satisfies CompraDocumentoTipo });
    expect(JSON.stringify(store)).not.toMatch(/pesoAtual|animalId|loteDestinoId/);
  });

  it("backend sempre valida a compra pelo userId autenticado", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const svc = readFileSync(resolve(here, "compraDocumentos.ts"), "utf8");
    const http = readFileSync(resolve(here, "compraDocumentosHttp.ts"), "utf8");
    const routers = readFileSync(resolve(here, "routers.ts"), "utf8");
    const store = readFileSync(resolve(here, "compraDocumentosDb.ts"), "utf8");
    const schema = readFileSync(resolve(here, "../drizzle/schema.ts"), "utf8");
    const migration = readFileSync(resolve(here, "../drizzle/migrations/0039_compra_documentos.sql"), "utf8");
    const vendaSchema = schema.slice(schema.indexOf("export const vendaDocumentos"), schema.indexOf("export const compraDocumentos"));
    const compraSchema = schema.slice(schema.indexOf("export const compraDocumentos"), schema.indexOf("export const semenPartidas"));

    expect(svc).toContain("assertCompraDoUsuario");
    expect(svc).toContain("getCompra(userId, compraId)");
    expect(svc).toContain("getDocumento(userId, documentoId)");
    expect(http).toContain("verifySession");
    expect(http).toContain("carregarArquivo(user.id, documentoId)");
    expect(http).toContain("/api/compras/documentos/:id/arquivo");
    expect(routers).toContain("compraDocumentosService.anexar(ctx.user.id");
    expect(routers).toContain("compraDocumentosService.excluir(ctx.user.id");
    expect(store).toContain("eq(compras.userId, userId)");
    expect(store).toContain("eq(compraDocumentos.userId, userId)");
    expect(compraSchema).toContain('uniqueIndex("compra_documentos_compra_tipo_uq")');
    expect(compraSchema).toContain("table.compraId, table.tipo");
    expect(compraSchema).not.toContain(".references(");
    expect(compraSchema).not.toContain("onDelete");
    expect(migration).toContain("UNIQUE KEY `compra_documentos_compra_tipo_uq` (`compra_id`, `tipo`)");
    expect(migration).not.toContain("FOREIGN KEY");
    expect(vendaSchema).toContain("venda_id");
    expect(vendaSchema).not.toContain("compra_id");
  });
});
