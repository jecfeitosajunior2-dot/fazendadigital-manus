import { describe, expect, it } from "vitest";
import {
  MSG_VENDA_DOC_ARQUIVO_INVALIDO,
  MSG_VENDA_DOC_DOCUMENTO_NAO_ENCONTRADO,
  MSG_VENDA_DOC_JA_EXISTE,
  MSG_VENDA_DOC_TAMANHO,
  MSG_VENDA_DOC_VENDA_NAO_ENCONTRADA,
  VENDA_DOCUMENTO_MAX_BYTES,
  createVendaDocumentosService,
  criarPdfMinimo,
  sanitizarNomeOriginalPdf,
  temAssinaturaPdf,
  toVendaDocumentoPublico,
  validarPdfVendaDocumento,
  type VendaDocumentoRow,
  type VendaDocumentoTipo,
  type VendaDocumentoVendaRef,
  type VendaDocumentosStore,
} from "./vendaDocumentos";

function criarStoreMemoria(seed?: {
  vendas?: VendaDocumentoVendaRef[];
  documentos?: VendaDocumentoRow[];
}): VendaDocumentosStore & {
  vendas: VendaDocumentoVendaRef[];
  documentos: VendaDocumentoRow[];
  vendaPatches: unknown[];
  nextId: number;
} {
  const state = {
    vendas: seed?.vendas ? [...seed.vendas] : [{ id: 1, userId: 1, status: "concluido" }],
    documentos: seed?.documentos ? [...seed.documentos] : [],
    vendaPatches: [] as unknown[],
    nextId: (seed?.documentos?.reduce((max, row) => Math.max(max, row.id), 0) ?? 0) + 1,
  };

  const store: VendaDocumentosStore = {
    async getVenda(userId, vendaId) {
      return state.vendas.find(v => v.id === vendaId && v.userId === userId) ?? null;
    },
    async getDocumento(userId, documentoId) {
      return state.documentos.find(d => d.id === documentoId && d.userId === userId) ?? null;
    },
    async getDocumentoPorTipo(userId, vendaId, tipo) {
      return state.documentos.find(d => d.userId === userId && d.vendaId === vendaId && d.tipo === tipo) ?? null;
    },
    async listDocumentos(userId, vendaId) {
      return state.documentos.filter(d => d.userId === userId && d.vendaId === vendaId);
    },
    async insertDocumento(row) {
      const existente = state.documentos.find(d => d.vendaId === row.vendaId && d.tipo === row.tipo);
      if (existente) throw new Error("unique venda_documentos_venda_tipo_uq");
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

function servicoCom(store: VendaDocumentosStore, uploads: string[] = []) {
  let seq = 0;
  return createVendaDocumentosService({
    store,
    upload: async () => {
      const path = `/manus-storage/venda_doc_${(++seq).toString(16).padStart(16, "0")}.pdf`;
      uploads.push(path);
      return path;
    },
    readFile: async storagePath => {
      if (!storagePath.startsWith("/manus-storage/venda_doc_")) return null;
      return criarPdfMinimo();
    },
  });
}

const uploadBase = {
  vendaId: 1,
  data: criarPdfMinimo(),
  nomeOriginal: "gta-teste.pdf",
  mimeType: "application/pdf",
  uploadedByUserId: 1,
  uploadedByNome: "Administrador",
};

describe("validação de PDF da venda", () => {
  it("aceita PDF válido de GTA", () => {
    expect(validarPdfVendaDocumento({ data: criarPdfMinimo(), mimeType: "application/pdf" })).toEqual({
      ok: true,
    });
    expect(temAssinaturaPdf(criarPdfMinimo())).toBe(true);
  });

  it("rejeita arquivo que não é PDF", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(validarPdfVendaDocumento({ data: png, nomeOriginal: "foto.png" })).toEqual({
      ok: false,
      message: MSG_VENDA_DOC_ARQUIVO_INVALIDO,
    });
  });

  it("rejeita falso .pdf sem assinatura %PDF", () => {
    const fake = Buffer.from("isto nao e um pdf mas o nome e gta.pdf", "utf8");
    expect(validarPdfVendaDocumento({ data: fake, nomeOriginal: "gta.pdf", mimeType: "application/pdf" })).toEqual({
      ok: false,
      message: MSG_VENDA_DOC_ARQUIVO_INVALIDO,
    });
  });

  it("rejeita arquivo acima de 10 MB mesmo com assinatura PDF", () => {
    const grande = criarPdfMinimo(VENDA_DOCUMENTO_MAX_BYTES);
    expect(grande.length).toBeGreaterThan(VENDA_DOCUMENTO_MAX_BYTES);
    expect(validarPdfVendaDocumento({ data: grande })).toEqual({
      ok: false,
      message: MSG_VENDA_DOC_TAMANHO,
    });
  });

  it("não confia só no MIME: image/jpeg com %PDF ainda passa pela assinatura, mas MIME de imagem é recusado", () => {
    expect(
      validarPdfVendaDocumento({ data: criarPdfMinimo(), mimeType: "image/jpeg" }),
    ).toEqual({ ok: false, message: MSG_VENDA_DOC_ARQUIVO_INVALIDO });
  });

  it("sanitiza nome original sem usar caminho", () => {
    expect(sanitizarNomeOriginalPdf("C:\\\\docs\\\\GTA 123.pdf")).toBe("GTA 123.pdf");
  });
});

describe("anexar / substituir / excluir documentos da venda", () => {
  it("anexa PDF de GTA válido", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    const result = await svc.anexar(1, { ...uploadBase, tipo: "gta" });
    expect(result.success).toBe(true);
    expect(store.documentos).toHaveLength(1);
    expect(store.documentos[0]?.tipo).toBe("gta");
    expect(store.documentos[0]?.nomeOriginal).toBe("gta-teste.pdf");
    expect(toVendaDocumentoPublico(store.documentos[0]!)).not.toHaveProperty("storagePath");
  });

  it("anexa PDF de Nota Fiscal válido", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await svc.anexar(1, { ...uploadBase, tipo: "nota_fiscal", nomeOriginal: "nf-teste.pdf" });
    expect(store.documentos[0]?.tipo).toBe("nota_fiscal");
    expect(store.documentos[0]?.nomeOriginal).toBe("nf-teste.pdf");
  });

  it("permite GTA e Nota Fiscal na mesma venda", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await svc.anexar(1, { ...uploadBase, tipo: "gta" });
    await svc.anexar(1, { ...uploadBase, tipo: "nota_fiscal", nomeOriginal: "nf.pdf" });
    expect(store.documentos.map(d => d.tipo).sort()).toEqual(["gta", "nota_fiscal"]);
  });

  it("rejeita segundo arquivo do mesmo tipo sem substituição (unique)", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await svc.anexar(1, { ...uploadBase, tipo: "gta" });
    await expect(svc.anexar(1, { ...uploadBase, tipo: "gta", nomeOriginal: "outra.pdf" })).rejects.toMatchObject({
      message: MSG_VENDA_DOC_JA_EXISTE,
    });
    expect(store.documentos).toHaveLength(1);
    expect(store.documentos[0]?.nomeOriginal).toBe("gta-teste.pdf");
  });

  it("substituição atualiza metadados e mantém o arquivo antigo só como órfão", async () => {
    const store = criarStoreMemoria();
    const uploads: string[] = [];
    const svc = servicoCom(store, uploads);
    const primeiro = await svc.anexar(1, { ...uploadBase, tipo: "gta" });
    const pathAntigo = store.documentos[0]?.storagePath;
    const segundo = await svc.anexar(1, {
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
    expect(segundo.arquivoAnteriorOrfao).toBe(pathAntigo);
    expect(pathAntigo).not.toBe(uploads[1]);
  });

  it("se o upload da substituição falha, o documento antigo continua válido", async () => {
    const store = criarStoreMemoria();
    const svcOk = servicoCom(store);
    await svcOk.anexar(1, { ...uploadBase, tipo: "gta" });
    const pathAntigo = store.documentos[0]?.storagePath;
    const svcFalha = createVendaDocumentosService({
      store,
      upload: async () => {
        throw new Error("storage indisponível");
      },
      readFile: async () => criarPdfMinimo(),
    });
    await expect(
      svcFalha.anexar(1, { ...uploadBase, tipo: "gta", substituir: true, nomeOriginal: "nova.pdf" }),
    ).rejects.toThrow("storage indisponível");
    expect(store.documentos).toHaveLength(1);
    expect(store.documentos[0]?.storagePath).toBe(pathAntigo);
    expect(store.documentos[0]?.nomeOriginal).toBe("gta-teste.pdf");
  });

  it("não grava registro nem chama storage quando o PDF é inválido", async () => {
    const store = criarStoreMemoria();
    const uploads: string[] = [];
    const svc = servicoCom(store, uploads);
    await expect(
      svc.anexar(1, { ...uploadBase, tipo: "gta", data: Buffer.from("nao-pdf") }),
    ).rejects.toMatchObject({ message: MSG_VENDA_DOC_ARQUIVO_INVALIDO });
    expect(store.documentos).toHaveLength(0);
    expect(uploads).toHaveLength(0);
  });

  it("usuário sem acesso não anexa", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await expect(svc.anexar(99, { ...uploadBase, tipo: "gta" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_VENDA_DOC_VENDA_NAO_ENCONTRADA,
    });
    expect(store.documentos).toHaveLength(0);
  });

  it("usuário sem acesso não visualiza/baixa", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    const { id } = await svc.anexar(1, { ...uploadBase, tipo: "gta" });
    await expect(svc.carregarArquivo(99, id)).resolves.toBeNull();
    await expect(svc.carregarArquivo(1, id)).resolves.toMatchObject({
      id,
      nomeOriginal: "gta-teste.pdf",
    });
  });

  it("exclusão remove só o documento e não altera a venda", async () => {
    const store = criarStoreMemoria();
    const snapshotVenda = { ...store.vendas[0] };
    const svc = servicoCom(store);
    const { id } = await svc.anexar(1, { ...uploadBase, tipo: "gta" });
    const result = await svc.excluir(1, { vendaId: 1, documentoId: id });
    expect(result.success).toBe(true);
    expect(store.documentos).toHaveLength(0);
    expect(store.vendas[0]).toEqual(snapshotVenda);
    expect(store.vendaPatches).toHaveLength(0);
  });

  it("venda cancelada mantém os documentos e permite visualizar", async () => {
    const store = criarStoreMemoria({
      vendas: [{ id: 7, userId: 1, status: "cancelado" }],
    });
    const svc = servicoCom(store);
    const { id } = await svc.anexar(1, { ...uploadBase, vendaId: 7, tipo: "nota_fiscal" });
    store.vendas[0] = { id: 7, userId: 1, status: "cancelado" };
    const lista = await svc.listarPublicos(1, 7);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.tipo).toBe("nota_fiscal");
    await expect(svc.carregarArquivo(1, id)).resolves.toMatchObject({ vendaId: 7 });
  });

  it("exclusão de documento inexistente não inventa venda", async () => {
    const store = criarStoreMemoria();
    const svc = servicoCom(store);
    await expect(svc.excluir(1, { vendaId: 1, documentoId: 999 })).rejects.toMatchObject({
      message: MSG_VENDA_DOC_DOCUMENTO_NAO_ENCONTRADO,
    });
  });
});

describe("metadados públicos", () => {
  it("nunca expõe o caminho físico do storage", () => {
    const publico = toVendaDocumentoPublico({
      id: 3,
      userId: 1,
      vendaId: 1,
      tipo: "gta" satisfies VendaDocumentoTipo,
      nomeOriginal: "gta.pdf",
      storagePath: "/manus-storage/venda_doc_abc.pdf",
      uploadedAt: new Date("2026-09-19T12:00:00Z"),
      uploadedByUserId: 1,
      uploadedByNome: "Admin",
    });
    expect(JSON.stringify(publico)).not.toContain("manus-storage");
    expect(JSON.stringify(publico)).not.toContain("storagePath");
  });
});
