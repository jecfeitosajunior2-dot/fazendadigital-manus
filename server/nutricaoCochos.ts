import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { lotes, nutricaoCochos, nutricaoFornecimentos, pastos } from "../drizzle/schema";
import {
  formatarIdentificacaoCocho,
  MSG_COCHO_FAZENDA_FIXA,
  MSG_COCHO_JA_ATIVO,
  MSG_COCHO_JA_INATIVO,
  MSG_COCHO_NAO_ENCONTRADO,
  normalizarCodigoCocho,
  type NutricaoCochoInput,
  type NutricaoCochoPastoRef,
  type NutricaoCochoStatus,
  validarCochoInput,
} from "../shared/nutricaoCochos";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type CochoPersistido = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  codigo: string | null;
  tipo: string;
  pastoId: number | null;
  localizacaoDescricao: string | null;
  comprimentoMetros: string | null;
  larguraMetros: string | null;
  capacidadeKg: string | null;
  ladosAcesso: number | null;
  coberto: boolean;
  observacoes: string | null;
  status: NutricaoCochoStatus;
};

export type CochoFornecimentoResumo = {
  id: number;
  cochoId: number;
  data: string;
  hora: string | null;
  loteId: number;
  origemNomeSnapshot: string | null;
  quantidadeFornecidaKg: string;
  status: string;
};

export type CochosStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  find(userId: number, id: number): Promise<CochoPersistido | null>;
  list(userId: number, fazendaId: number): Promise<CochoPersistido[]>;
  getPasto(userId: number, pastoId: number): Promise<NutricaoCochoPastoRef | null>;
  listPastos(userId: number, fazendaId: number): Promise<NutricaoCochoPastoRef[]>;
  codigoEmUso(userId: number, fazendaId: number, codigo: string, exceptId?: number): Promise<boolean>;
  insert(row: Omit<CochoPersistido, "id">): Promise<number>;
  update(id: number, userId: number, patch: Omit<CochoPersistido, "id" | "userId" | "fazendaId" | "status">): Promise<void>;
  setStatus(id: number, userId: number, status: NutricaoCochoStatus): Promise<void>;
  listFornecimentos(userId: number, cochoId: number): Promise<CochoFornecimentoResumo[]>;
  getLoteNome(userId: number, loteId: number): Promise<string | null>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function toStatus(value: string | null | undefined): NutricaoCochoStatus {
  return value === "inativo" ? "inativo" : "ativo";
}

function dec(value?: number | null): string | null {
  return value != null && Number.isFinite(value) ? String(value) : null;
}

function payloadDe(userId: number, input: NutricaoCochoInput): Omit<CochoPersistido, "id" | "status"> {
  return {
    userId,
    fazendaId: input.fazendaId,
    nome: input.nome.trim(),
    codigo: normalizarCodigoCocho(input.codigo),
    tipo: input.tipo,
    pastoId: Number(input.pastoId) > 0 ? Number(input.pastoId) : null,
    localizacaoDescricao: input.localizacaoDescricao?.trim() || null,
    comprimentoMetros: dec(input.comprimentoMetros),
    larguraMetros: dec(input.larguraMetros),
    capacidadeKg: dec(input.capacidadeKg),
    ladosAcesso: input.ladosAcesso != null ? Number(input.ladosAcesso) : null,
    coberto: Boolean(input.coberto),
    observacoes: input.observacoes?.trim() || null,
  };
}

export function createNutricaoCochosService(store: CochosStore) {
  async function validarOuErro(userId: number, input: NutricaoCochoInput, exceptId?: number) {
    const pastoId = Number(input.pastoId) > 0 ? Number(input.pastoId) : null;
    const pasto = pastoId ? await store.getPasto(userId, pastoId) : null;
    const codigo = normalizarCodigoCocho(input.codigo);
    const codigoEmUso = codigo
      ? await store.codigoEmUso(userId, input.fazendaId, codigo, exceptId)
      : false;
    const check = validarCochoInput(input, { pasto, codigoEmUso });
    if (!check.ok) toTrpc(check.message);
  }

  async function comLocalizacao(userId: number, row: CochoPersistido) {
    const pasto = row.pastoId ? await store.getPasto(userId, row.pastoId) : null;
    return { ...row, pastoNome: pasto?.nome ?? null };
  }

  async function ultimoDe(forns: CochoFornecimentoResumo[], userId: number) {
    const ultimo = forns[0] ?? null;
    if (!ultimo) return null;
    const loteNome = await store.getLoteNome(userId, ultimo.loteId);
    return { ...ultimo, loteNome: loteNome ?? `Lote ${ultimo.loteId}` };
  }

  return {
    async listar(
      userId: number,
      input: { fazendaId: number; tipo?: string; status?: NutricaoCochoStatus; search?: string },
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      let rows = await store.list(userId, input.fazendaId);
      if (input.tipo) rows = rows.filter(r => r.tipo === input.tipo);
      if (input.status) rows = rows.filter(r => r.status === input.status);
      const q = input.search?.trim().toLowerCase();
      if (q) {
        rows = rows.filter(r =>
          r.nome.toLowerCase().includes(q) || (r.codigo ?? "").toLowerCase().includes(q),
        );
      }
      const out = [];
      for (const row of rows) {
        const loc = await comLocalizacao(userId, row);
        const forns = await store.listFornecimentos(userId, row.id);
        out.push({
          ...loc,
          identificacao: formatarIdentificacaoCocho(row.nome, row.codigo),
          ultimoFornecimento: await ultimoDe(forns, userId),
        });
      }
      return out;
    },

    async obter(userId: number, id: number) {
      const row = await store.find(userId, id);
      if (!row) toTrpc(MSG_COCHO_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, row.fazendaId);
      const loc = await comLocalizacao(userId, row);
      const forns = await store.listFornecimentos(userId, row.id);
      const historico = [];
      for (const f of forns) {
        const loteNome = await store.getLoteNome(userId, f.loteId);
        historico.push({ ...f, loteNome: loteNome ?? `Lote ${f.loteId}` });
      }
      return {
        ...loc,
        identificacao: formatarIdentificacaoCocho(row.nome, row.codigo),
        ultimoFornecimento: historico[0] ?? null,
        fornecimentos: historico,
      };
    },

    async listarPastos(userId: number, fazendaId: number) {
      await store.assertFazenda(userId, fazendaId);
      return store.listPastos(userId, fazendaId);
    },

    async criar(userId: number, input: NutricaoCochoInput) {
      await store.assertFazenda(userId, input.fazendaId);
      await validarOuErro(userId, input);
      const id = await store.insert({ ...payloadDe(userId, input), status: "ativo" });
      return { success: true as const, id };
    },

    async editar(userId: number, id: number, input: NutricaoCochoInput) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_COCHO_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (input.fazendaId !== atual.fazendaId) toTrpc(MSG_COCHO_FAZENDA_FIXA);
      await validarOuErro(userId, input, id);
      const patch = payloadDe(userId, input);
      await store.update(id, userId, {
        nome: patch.nome,
        codigo: patch.codigo,
        tipo: patch.tipo,
        pastoId: patch.pastoId,
        localizacaoDescricao: patch.localizacaoDescricao,
        comprimentoMetros: patch.comprimentoMetros,
        larguraMetros: patch.larguraMetros,
        capacidadeKg: patch.capacidadeKg,
        ladosAcesso: patch.ladosAcesso,
        coberto: patch.coberto,
        observacoes: patch.observacoes,
      });
      return { success: true as const, id };
    },

    async inativar(userId: number, id: number) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_COCHO_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status === "inativo") toTrpc(MSG_COCHO_JA_INATIVO);
      await store.setStatus(id, userId, "inativo");
      return { success: true as const, status: "inativo" as const };
    },

    async reativar(userId: number, id: number) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_COCHO_NAO_ENCONTRADO, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status === "ativo") toTrpc(MSG_COCHO_JA_ATIVO);
      await store.setStatus(id, userId, "ativo");
      return { success: true as const, status: "ativo" as const };
    },
  };
}

function toCochoRow(row: typeof nutricaoCochos.$inferSelect): CochoPersistido {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    nome: row.nome,
    codigo: row.codigo ?? null,
    tipo: row.tipo,
    pastoId: row.pastoId ?? null,
    localizacaoDescricao: row.localizacaoDescricao ?? null,
    comprimentoMetros: row.comprimentoMetros == null ? null : String(row.comprimentoMetros),
    larguraMetros: row.larguraMetros == null ? null : String(row.larguraMetros),
    capacidadeKg: row.capacidadeKg == null ? null : String(row.capacidadeKg),
    ladosAcesso: row.ladosAcesso ?? null,
    coberto: Boolean(row.coberto),
    observacoes: row.observacoes ?? null,
    status: toStatus(row.status),
  };
}

export const nutricaoCochosStore: CochosStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
  },
  async find(userId, id) {
    const [row] = await db.select().from(nutricaoCochos).where(and(
      eq(nutricaoCochos.id, id), eq(nutricaoCochos.userId, userId),
    )).limit(1);
    return row ? toCochoRow(row) : null;
  },
  async list(userId, fazendaId) {
    const rows = await db.select().from(nutricaoCochos).where(and(
      eq(nutricaoCochos.userId, userId), eq(nutricaoCochos.fazendaId, fazendaId),
    )).orderBy(desc(nutricaoCochos.id));
    return rows.map(toCochoRow);
  },
  async getPasto(userId, pastoId) {
    const [row] = await db.select().from(pastos).where(and(
      eq(pastos.id, pastoId), eq(pastos.userId, userId),
    )).limit(1);
    if (!row) return null;
    return { id: row.id, userId: row.userId, fazendaId: row.fazendaId, nome: row.nome };
  },
  async listPastos(userId, fazendaId) {
    const rows = await db.select().from(pastos).where(and(
      eq(pastos.userId, userId), eq(pastos.fazendaId, fazendaId),
    ));
    return rows.map(r => ({ id: r.id, userId: r.userId, fazendaId: r.fazendaId, nome: r.nome }));
  },
  async codigoEmUso(userId, fazendaId, codigo, exceptId) {
    const rows = await db.select().from(nutricaoCochos).where(and(
      eq(nutricaoCochos.userId, userId),
      eq(nutricaoCochos.fazendaId, fazendaId),
    ));
    const alvo = codigo.trim().toLowerCase();
    return rows.some(r => r.id !== exceptId && (r.codigo ?? "").trim().toLowerCase() === alvo);
  },
  async insert(row) {
    const result = await db.insert(nutricaoCochos).values(row);
    const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar o cocho." });
    }
    return id;
  },
  async update(id, userId, patch) {
    await db.update(nutricaoCochos).set(patch).where(and(
      eq(nutricaoCochos.id, id), eq(nutricaoCochos.userId, userId),
    ));
  },
  async setStatus(id, userId, status) {
    await db.update(nutricaoCochos).set({ status }).where(and(
      eq(nutricaoCochos.id, id), eq(nutricaoCochos.userId, userId),
    ));
  },
  async listFornecimentos(userId, cochoId) {
    const rows = await db.select().from(nutricaoFornecimentos).where(and(
      eq(nutricaoFornecimentos.userId, userId),
      eq(nutricaoFornecimentos.cochoId, cochoId),
    )).orderBy(desc(nutricaoFornecimentos.data), desc(nutricaoFornecimentos.id));
    return rows.map(r => ({
      id: r.id,
      cochoId: r.cochoId ?? cochoId,
      data: r.data,
      hora: r.hora ?? null,
      loteId: r.loteId,
      origemNomeSnapshot: r.origemNomeSnapshot ?? null,
      quantidadeFornecidaKg: String(r.quantidadeFornecidaKg),
      status: r.status,
    }));
  },
  async getLoteNome(userId, loteId) {
    const [row] = await db.select().from(lotes).where(and(
      eq(lotes.id, loteId), eq(lotes.userId, userId),
    )).limit(1);
    return row?.nome ?? null;
  },
};

export const nutricaoCochosService = createNutricaoCochosService(nutricaoCochosStore);
