import fs from "node:fs";
import path from "node:path";
import { buildDevRebanhoSeed, REBANHO_SEED_VERSION, type DevAnimal, type DevLote } from "./devAnimaisSeed";
import { REBANHO_OVERVIEW_DEMO } from "../shared/rebanhoOverviewDemo";
import { avaliarEstornoEstoque } from "./estoqueEstorno";

const DATA_DIR = path.resolve(process.cwd(), ".dev-data");
const DATA_FILE = path.join(DATA_DIR, "local.json");

type DevFazenda = {
  id: number;
  userId: number;
  nome: string;
  sigla: string | null;
  cidade: string | null;
  estado: string | null;
  createdAt: Date | null;
};

type DevEstoque = {
  id: number;
  produtoId: number | null;
  fazendaId: number | null;
  nome: string;
  categoria: string | null;
  subcategoria: string | null;
  unidade: string | null;
  quantidade: string | null;
  quantidadeMinima: string | null;
  quantidadeMaxima: string | null;
  fabricante: string | null;
  identificadorUnico: string | null;
  produzidoNaFazenda: boolean | null;
  monitorarEstoque: boolean | null;
  situacao: string | null;
  embalagens: string | null;
  possuiCarencia: boolean | null;
  carenciaAbateDias: number | null;
  carenciaAbateUnidade: string | null;
  carenciaLeiteDias: number | null;
  observacoesCarencia: string | null;
  valorUnitario: string | null;
  localizacao: string | null;
  observacoes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type DevProdutoCatalogo = {
  id: number;
  nome: string;
  categoria: string | null;
  subcategoria: string | null;
  unidade: string | null;
  fabricante: string | null;
  identificadorUnico: string | null;
  produzidoNaFazenda: boolean | null;
  monitorarEstoque: boolean | null;
  situacao: string | null;
  embalagens: string | null;
  possuiCarencia: boolean | null;
  carenciaAbateDias: number | null;
  carenciaAbateUnidade: string | null;
  carenciaLeiteDias: number | null;
  observacoesCarencia: string | null;
  observacoes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type DevMovimentacao = {
  id: number;
  grupoId: string | null;
  estoqueId: number;
  fazendaId: number | null;
  userId: number | null;
  registradoPor: string | null;
  tipo: string | null;
  dataMovimentacao: string;
  quantidade: string;
  dataValidade: string | null;
  destino: string | null;
  manejo: string | null;
  notaFiscal: string | null;
  frete: string | null;
  fornecedor: string | null;
  valor: string | null;
  observacoes: string | null;
  status: "ativa" | "estornada" | "estorno" | null;
  originalGrupoId: string | null;
  motivoEstorno: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  updatedByUserId: number | null;
  updatedByNome: string | null;
};

type DevContaFinanceira = {
  id: number;
  nome: string;
  tipo: string | null;
  banco: string | null;
  saldoInicial: string | null;
  saldoAtual: string | null;
  ativa: boolean | null;
  createdAt: Date | null;
};

type DevMovimentacaoFinanceira = {
  id: number;
  contaId: number | null;
  categoriaId: number | null;
  tipo: "receita" | "despesa";
  descricao: string;
  valor: string;
  data: string;
  status: "pendente" | "confirmado" | "cancelado" | null;
  observacoes: string | null;
  createdAt: Date | null;
};

export type DevPessoaTipo = "fornecedor" | "cliente" | "funcionario";

type DevPessoa = {
  id: number;
  userId: number;
  nome: string;
  tipo: DevPessoaTipo;
  funcao: string | null;
  documento: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  ativo: boolean;
  createdAt: Date | null;
};

type StoreData = {
  nextFazendaId: number;
  nextEstoqueId: number;
  nextProdutoCatalogoId: number;
  nextMovId: number;
  nextContaId: number;
  nextFinMovId: number;
  nextPessoaId: number;
  nextAnimalId: number;
  nextLoteId: number;
  fazendas: DevFazenda[];
  produtosCatalogo: DevProdutoCatalogo[];
  estoque: DevEstoque[];
  movimentacoes: DevMovimentacao[];
  contas: DevContaFinanceira[];
  financeiroMovimentacoes: DevMovimentacaoFinanceira[];
  pessoas: DevPessoa[];
  animais: DevAnimal[];
  lotes: DevLote[];
  rebanhoSeedVersion?: number;
};

function now() {
  return new Date();
}

function defaultStore(): StoreData {
  const createdAt = now();
  const rebanho = buildDevRebanhoSeed(0);
  const diasAtras = (d: number) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    return dt.toISOString().slice(0, 10);
  };
  return {
    nextFazendaId: 2,
    nextEstoqueId: 4,
    nextProdutoCatalogoId: 4,
    nextMovId: 4,
    nextContaId: 4,
    nextFinMovId: 9,
    nextPessoaId: 6,
    nextAnimalId: rebanho.nextAnimalId,
    nextLoteId: rebanho.nextLoteId,
    animais: rebanho.animais,
    lotes: rebanho.lotes,
    fazendas: [
      {
        id: 1,
        userId: 0,
        nome: "Minha Fazenda",
        sigla: "MF",
        cidade: "Local",
        estado: "GO",
        createdAt,
      },
    ],
    produtosCatalogo: [],
    estoque: [
      {
        id: 1,
        produtoId: 1,
        fazendaId: 1,
        nome: "Diesel S10",
        categoria: "Combustível",
        subcategoria: "Diesel",
        unidade: "L",
        quantidade: "500",
        quantidadeMinima: "100",
        quantidadeMaxima: null,
        fabricante: null,
        identificadorUnico: null,
        produzidoNaFazenda: false,
        monitorarEstoque: true,
        situacao: "ativo",
        embalagens: null,
        possuiCarencia: false,
        carenciaAbateDias: null,
        carenciaAbateUnidade: "d",
        carenciaLeiteDias: null,
        observacoesCarencia: null,
        valorUnitario: "6.50",
        localizacao: "Tanque",
        observacoes: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 2,
        produtoId: 2,
        fazendaId: 1,
        nome: "Sal Mineral",
        categoria: "Nutrição",
        subcategoria: "Mineral",
        unidade: "kg",
        quantidade: "120",
        quantidadeMinima: "50",
        quantidadeMaxima: null,
        fabricante: null,
        identificadorUnico: null,
        produzidoNaFazenda: false,
        monitorarEstoque: true,
        situacao: "ativo",
        embalagens: null,
        possuiCarencia: false,
        carenciaAbateDias: null,
        carenciaAbateUnidade: "d",
        carenciaLeiteDias: null,
        observacoesCarencia: null,
        valorUnitario: "2.80",
        localizacao: "Depósito",
        observacoes: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 3,
        produtoId: 3,
        fazendaId: 1,
        nome: "Vacina Aftosa",
        categoria: "Sanidade",
        subcategoria: "Vacina",
        unidade: "dose",
        quantidade: "80",
        quantidadeMinima: "20",
        quantidadeMaxima: null,
        fabricante: null,
        identificadorUnico: null,
        produzidoNaFazenda: false,
        monitorarEstoque: true,
        situacao: "ativo",
        embalagens: null,
        possuiCarencia: true,
        carenciaAbateDias: 21,
        carenciaAbateUnidade: "d",
        carenciaLeiteDias: null,
        observacoesCarencia: null,
        valorUnitario: "12.00",
        localizacao: "Geladeira",
        observacoes: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    movimentacoes: [
      {
        id: 1,
        grupoId: "seed-mov-1",
        estoqueId: 1,
        fazendaId: 1,
        userId: null,
        registradoPor: null,
        tipo: "entrada",
        dataMovimentacao: diasAtras(10),
        quantidade: "500",
        dataValidade: null,
        destino: "Tanque principal",
        manejo: null,
        notaFiscal: "NF-10234",
        frete: null,
        fornecedor: "Posto Rural",
        valor: "3250.00",
        observacoes: "Abastecimento inicial",
        status: "ativa",
        originalGrupoId: null,
        motivoEstorno: null,
        createdAt,
        updatedAt: null,
        updatedByUserId: null,
        updatedByNome: null,
      },
      {
        id: 2,
        grupoId: "seed-mov-2",
        estoqueId: 1,
        fazendaId: 1,
        userId: null,
        registradoPor: null,
        tipo: "saida",
        dataMovimentacao: diasAtras(3),
        quantidade: "-80",
        dataValidade: null,
        destino: "Trator",
        manejo: "Abastecimento",
        notaFiscal: null,
        frete: null,
        fornecedor: null,
        valor: null,
        observacoes: null,
        status: "ativa",
        originalGrupoId: null,
        motivoEstorno: null,
        createdAt,
        updatedAt: null,
        updatedByUserId: null,
        updatedByNome: null,
      },
      {
        id: 3,
        grupoId: "seed-mov-3",
        estoqueId: 2,
        fazendaId: 1,
        userId: null,
        registradoPor: null,
        tipo: "entrada",
        dataMovimentacao: diasAtras(7),
        quantidade: "200",
        dataValidade: null,
        destino: "Depósito",
        manejo: null,
        notaFiscal: "NF-8871",
        frete: "150.00",
        fornecedor: "Nutrição Animal Ltda",
        valor: "560.00",
        observacoes: null,
        status: "ativa",
        originalGrupoId: null,
        motivoEstorno: null,
        createdAt,
        updatedAt: null,
        updatedByUserId: null,
        updatedByNome: null,
      },
    ],
    contas: [
      { id: 1, nome: "Conta Principal", tipo: "corrente", banco: "Banco do Brasil", saldoInicial: "45000.00", saldoAtual: "45000.00", ativa: true, createdAt },
      { id: 2, nome: "Caixa Fazenda", tipo: "caixa", banco: null, saldoInicial: "3200.00", saldoAtual: "3200.00", ativa: true, createdAt },
      { id: 3, nome: "Poupança", tipo: "poupanca", banco: "Caixa", saldoInicial: "120000.00", saldoAtual: "120000.00", ativa: true, createdAt },
    ],
    financeiroMovimentacoes: [
      { id: 1, contaId: 1, categoriaId: null, tipo: "receita", descricao: "Venda de novilhas", valor: "28500.00", data: diasAtras(3), status: "confirmado", observacoes: null, createdAt },
      { id: 2, contaId: 1, categoriaId: null, tipo: "receita", descricao: "Venda de bezerros", valor: "12400.00", data: diasAtras(12), status: "confirmado", observacoes: null, createdAt },
      { id: 3, contaId: 1, categoriaId: null, tipo: "despesa", descricao: "Compra de sal mineral", valor: "2800.00", data: diasAtras(5), status: "confirmado", observacoes: null, createdAt },
      { id: 4, contaId: 1, categoriaId: null, tipo: "despesa", descricao: "Ração confinamento", valor: "15600.00", data: diasAtras(8), status: "confirmado", observacoes: null, createdAt },
      { id: 5, contaId: 1, categoriaId: null, tipo: "despesa", descricao: "Manutenção de cercas", valor: "4200.00", data: diasAtras(15), status: "pendente", observacoes: null, createdAt },
      { id: 6, contaId: 2, categoriaId: null, tipo: "despesa", descricao: "Combustível diesel", valor: "1950.00", data: diasAtras(2), status: "confirmado", observacoes: null, createdAt },
      { id: 7, contaId: 3, categoriaId: null, tipo: "receita", descricao: "Arrendamento de pasto", valor: "8000.00", data: diasAtras(20), status: "confirmado", observacoes: null, createdAt },
      { id: 8, contaId: 1, categoriaId: null, tipo: "despesa", descricao: "Vacinas do rebanho", valor: "6300.00", data: diasAtras(25), status: "confirmado", observacoes: null, createdAt },
    ],
    pessoas: [
      { id: 1, userId: 0, nome: "Posto Rural", tipo: "fornecedor", funcao: "Combustível", documento: null, telefone: null, email: null, observacoes: null, ativo: true, createdAt },
      { id: 2, userId: 0, nome: "Nutrição Animal Ltda", tipo: "fornecedor", funcao: "Insumos", documento: null, telefone: null, email: null, observacoes: null, ativo: true, createdAt },
      { id: 3, userId: 0, nome: "Agropecuária Central", tipo: "fornecedor", funcao: "Insumos", documento: null, telefone: null, email: null, observacoes: null, ativo: true, createdAt },
      { id: 4, userId: 0, nome: "Frigorífico São Paulo", tipo: "cliente", funcao: "Comprador", documento: null, telefone: null, email: null, observacoes: null, ativo: true, createdAt },
      { id: 5, userId: 0, nome: "João Silva", tipo: "funcionario", funcao: "Vaqueiro", documento: null, telefone: null, email: null, observacoes: null, ativo: true, createdAt },
    ],
  };
}

function reviveDates(raw: StoreData): StoreData {
  for (const f of raw.fazendas) {
    if (f.createdAt) f.createdAt = new Date(f.createdAt);
  }
  for (const e of raw.estoque) {
    if (e.createdAt) e.createdAt = new Date(e.createdAt);
    if (e.updatedAt) e.updatedAt = new Date(e.updatedAt);
  }
  if (!raw.produtosCatalogo) raw.produtosCatalogo = [];
  if (!raw.nextProdutoCatalogoId) {
    raw.nextProdutoCatalogoId =
      Math.max(0, ...raw.produtosCatalogo.map(p => p.id), ...raw.estoque.map(e => e.produtoId ?? 0)) + 1;
  }
  for (const p of raw.produtosCatalogo) {
    if (p.createdAt) p.createdAt = new Date(p.createdAt);
    if (p.updatedAt) p.updatedAt = new Date(p.updatedAt);
  }
  // Backfill produtoId + catálogo a partir do estoque legado
  const chaveToId = new Map<string, number>();
  for (const p of raw.produtosCatalogo) {
    const chave = [
      (p.nome ?? "").trim().toLowerCase(),
      (p.unidade ?? "").trim().toLowerCase(),
      (p.categoria ?? "").trim().toLowerCase(),
    ].join("|");
    chaveToId.set(chave, p.id);
  }
  for (const e of raw.estoque) {
    if (e.produtoId) continue;
    const chave = [
      (e.nome ?? "").trim().toLowerCase(),
      (e.unidade ?? "").trim().toLowerCase(),
      (e.categoria ?? "").trim().toLowerCase(),
    ].join("|");
    let produtoId = chaveToId.get(chave);
    if (!produtoId) {
      produtoId = raw.nextProdutoCatalogoId++;
      const createdAt = e.createdAt ?? now();
      raw.produtosCatalogo.push({
        id: produtoId,
        nome: e.nome,
        categoria: e.categoria,
        subcategoria: e.subcategoria,
        unidade: e.unidade,
        fabricante: e.fabricante,
        identificadorUnico: e.identificadorUnico,
        produzidoNaFazenda: e.produzidoNaFazenda,
        monitorarEstoque: e.monitorarEstoque,
        situacao: e.situacao,
        embalagens: e.embalagens,
        possuiCarencia: e.possuiCarencia,
        carenciaAbateDias: e.carenciaAbateDias,
        carenciaAbateUnidade: e.carenciaAbateUnidade,
        carenciaLeiteDias: e.carenciaLeiteDias,
        observacoesCarencia: e.observacoesCarencia,
        observacoes: e.observacoes,
        createdAt,
        updatedAt: createdAt,
      });
      chaveToId.set(chave, produtoId);
    }
    e.produtoId = produtoId;
  }
  for (const m of raw.movimentacoes) {
    if (m.createdAt) m.createdAt = new Date(m.createdAt);
  }
  for (const c of raw.contas ?? []) {
    if (c.createdAt) c.createdAt = new Date(c.createdAt);
  }
  for (const m of raw.financeiroMovimentacoes ?? []) {
    if (m.createdAt) m.createdAt = new Date(m.createdAt);
  }
  for (const m of raw.movimentacoes ?? []) {
    if (m.createdAt) m.createdAt = new Date(m.createdAt);
    if (m.updatedAt) m.updatedAt = new Date(m.updatedAt as string | Date);
    if (m.grupoId === undefined) m.grupoId = null;
    if (m.userId === undefined) m.userId = null;
    if (m.registradoPor === undefined) m.registradoPor = null;
    if (m.status === undefined || m.status === null) m.status = "ativa";
    if (m.originalGrupoId === undefined) m.originalGrupoId = null;
    if (m.motivoEstorno === undefined) m.motivoEstorno = null;
    if (m.updatedAt === undefined) m.updatedAt = null;
    if (m.updatedByUserId === undefined) m.updatedByUserId = null;
    if (m.updatedByNome === undefined) m.updatedByNome = null;
  }
  for (const a of raw.animais ?? []) {
    if (a.createdAt) a.createdAt = new Date(a.createdAt);
  }
  for (const l of raw.lotes ?? []) {
    if (l.createdAt) l.createdAt = new Date(l.createdAt);
  }
  for (const p of raw.pessoas ?? []) {
    if (p.createdAt) p.createdAt = new Date(p.createdAt);
    if (p.documento === undefined) p.documento = null;
    if (p.endereco === undefined) p.endereco = null;
  }
  if (!raw.contas) raw.contas = [];
  if (!raw.financeiroMovimentacoes) raw.financeiroMovimentacoes = [];
  if (!raw.pessoas) raw.pessoas = [];
  if (!raw.animais) raw.animais = [];
  if (!raw.lotes) raw.lotes = [];
  if (!raw.nextContaId) raw.nextContaId = raw.contas.length + 1;
  if (!raw.nextFinMovId) raw.nextFinMovId = raw.financeiroMovimentacoes.length + 1;
  if (!raw.nextPessoaId) raw.nextPessoaId = raw.pessoas.length + 1;
  if (!raw.nextAnimalId) raw.nextAnimalId = raw.animais.length + 1;
  if (!raw.nextLoteId) raw.nextLoteId = raw.lotes.length + 1;
  return raw;
}

function ensurePessoasSeed(data: StoreData): boolean {
  if (data.pessoas?.length) return false;
  const seed = defaultStore();
  data.pessoas = seed.pessoas;
  data.nextPessoaId = seed.nextPessoaId;
  return true;
}

function loadStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const seed = defaultStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
  const data = reviveDates(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as StoreData);
  if (ensurePessoasSeed(data)) saveStore(data);
  return data;
}

function saveStore(data: StoreData) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function ensureRebanhoSeed(data: StoreData) {
  if (data.rebanhoSeedVersion === REBANHO_SEED_VERSION && data.animais.length > 0) return false;
  const rebanho = buildDevRebanhoSeed(0);
  data.animais = rebanho.animais;
  data.lotes = rebanho.lotes;
  data.nextAnimalId = rebanho.nextAnimalId;
  data.nextLoteId = rebanho.nextLoteId;
  data.rebanhoSeedVersion = REBANHO_SEED_VERSION;
  return true;
}

function withStore<T>(fn: (data: StoreData) => T): T {
  const data = loadStore();
  const result = fn(data);
  saveStore(data);
  return result;
}

function getItem(data: StoreData, id: number) {
  return data.estoque.find(e => e.id === id);
}

function configLocalParaFazenda(
  input: Record<string, unknown>,
  fazendaId: number,
  fallback?: {
    produzidoNaFazenda?: boolean;
    monitorarEstoque?: boolean;
    quantidadeMinima?: string | null;
    quantidadeMaxima?: string | null;
  }
) {
  const configs = input.estoquesConfig as
    | {
        fazendaId: number;
        produzidoNaFazenda?: boolean;
        monitorarEstoque?: boolean;
        quantidadeMinima?: string | null;
        quantidadeMaxima?: string | null;
      }[]
    | undefined;
  const cfg = (configs ?? []).find(c => Number(c.fazendaId) === fazendaId);
  const monitorar =
    cfg?.monitorarEstoque ??
    fallback?.monitorarEstoque ??
    (typeof input.monitorarEstoque === "boolean" ? input.monitorarEstoque : false);
  const produzido =
    cfg?.produzidoNaFazenda ??
    fallback?.produzidoNaFazenda ??
    (typeof input.produzidoNaFazenda === "boolean" ? input.produzidoNaFazenda : false);
  let quantidadeMinima: string | null = null;
  let quantidadeMaxima: string | null = null;
  if (monitorar) {
    quantidadeMinima =
      cfg?.quantidadeMinima ??
      fallback?.quantidadeMinima ??
      (input.quantidadeMinima as string | undefined) ??
      "0";
    quantidadeMaxima =
      cfg?.quantidadeMaxima ??
      fallback?.quantidadeMaxima ??
      (input.quantidadeMaxima as string | null | undefined) ??
      null;
    if (quantidadeMinima === "") quantidadeMinima = "0";
    if (quantidadeMaxima === "") quantidadeMaxima = null;
  }
  return {
    produzidoNaFazenda: !!produzido,
    monitorarEstoque: !!monitorar,
    quantidadeMinima,
    quantidadeMaxima,
  };
}

function joinMov(data: StoreData, mov: DevMovimentacao) {
  const item = getItem(data, mov.estoqueId);
  return {
    ...mov,
    produtoFazendaId: item?.fazendaId ?? null,
    nome: item?.nome ?? "",
    categoria: item?.categoria ?? null,
    subcategoria: item?.subcategoria ?? null,
    fabricante: item?.fabricante ?? null,
    identificadorUnico: item?.identificadorUnico ?? null,
    unidade: item?.unidade ?? null,
    embalagens: item?.embalagens ?? null,
    situacao: item?.situacao ?? "ativo",
  };
}

export function devStoreEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export const devLocalStore = {
  init() {
    const data = loadStore();
    let changed = false;
    if (data.financeiroMovimentacoes.length === 0 || data.movimentacoes.length === 0) {
      const seed = defaultStore();
      if (data.financeiroMovimentacoes.length === 0) {
        data.contas = seed.contas;
        data.financeiroMovimentacoes = seed.financeiroMovimentacoes;
        data.nextContaId = seed.nextContaId;
        data.nextFinMovId = seed.nextFinMovId;
        changed = true;
      }
      if (data.movimentacoes.length === 0) {
        data.movimentacoes = seed.movimentacoes;
        data.nextMovId = seed.nextMovId;
        changed = true;
      }
    }
    if (ensureRebanhoSeed(data)) changed = true;
    if (ensurePessoasSeed(data)) changed = true;
    if (changed) saveStore(data);
    console.log("[dev] Estoque local em .dev-data/local.json (sem MySQL)");
  },

  listFazendas(userId: number) {
    const data = loadStore();
    return data.fazendas
      .filter(f => f.userId === userId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  },

  listEstoque() {
    return loadStore().estoque.sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    );
  },

  getEstoque(id: number) {
    return getItem(loadStore(), id) ?? null;
  },

  createEstoque(input: Record<string, unknown>) {
    return withStore(data => {
      const id = data.nextEstoqueId++;
      const createdAt = now();
      const embalagens = input.embalagens as unknown[] | undefined;
      let produtoId = (input.produtoId as number | undefined) ?? null;
      if (!produtoId) {
        produtoId = data.nextProdutoCatalogoId++;
        data.produtosCatalogo.push({
          id: produtoId,
          nome: String(input.nome),
          categoria: (input.categoria as string) ?? null,
          subcategoria: (input.subcategoria as string) ?? null,
          unidade: (input.unidade as string) ?? null,
          fabricante: (input.fabricante as string | undefined) ?? null,
          identificadorUnico: (input.identificadorUnico as string | undefined) ?? null,
          produzidoNaFazenda: (input.produzidoNaFazenda as boolean | undefined) ?? false,
          monitorarEstoque: (input.monitorarEstoque as boolean | undefined) ?? false,
          situacao: (input.situacao as string | undefined) ?? "ativo",
          embalagens: embalagens?.length ? JSON.stringify(embalagens) : null,
          possuiCarencia: (input.possuiCarencia as boolean | undefined) ?? false,
          carenciaAbateDias: (input.carenciaAbateDias as number | null | undefined) ?? null,
          carenciaAbateUnidade: (input.carenciaAbateUnidade as string | undefined) ?? "d",
          carenciaLeiteDias: (input.carenciaLeiteDias as number | null | undefined) ?? null,
          observacoesCarencia: (input.observacoesCarencia as string | null | undefined) ?? null,
          observacoes: (input.observacoes as string | undefined) ?? null,
          createdAt,
          updatedAt: createdAt,
        });
      }
      const row: DevEstoque = {
        id,
        produtoId,
        fazendaId: (input.fazendaId as number | undefined) ?? 1,
        nome: String(input.nome),
        categoria: (input.categoria as string) ?? null,
        subcategoria: (input.subcategoria as string) ?? null,
        unidade: (input.unidade as string) ?? null,
        quantidade: (input.quantidade as string | undefined) ?? "0",
        quantidadeMinima: (input.quantidadeMinima as string | undefined) ?? "0",
        quantidadeMaxima: (input.quantidadeMaxima as string | undefined) ?? null,
        fabricante: (input.fabricante as string | undefined) ?? null,
        identificadorUnico: (input.identificadorUnico as string | undefined) ?? null,
        produzidoNaFazenda: (input.produzidoNaFazenda as boolean | undefined) ?? false,
        monitorarEstoque: (input.monitorarEstoque as boolean | undefined) ?? false,
        situacao: (input.situacao as string | undefined) ?? "ativo",
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : null,
        possuiCarencia: (input.possuiCarencia as boolean | undefined) ?? false,
        carenciaAbateDias: (input.carenciaAbateDias as number | null | undefined) ?? null,
        carenciaAbateUnidade: (input.carenciaAbateUnidade as string | undefined) ?? "d",
        carenciaLeiteDias: (input.carenciaLeiteDias as number | null | undefined) ?? null,
        observacoesCarencia: (input.observacoesCarencia as string | null | undefined) ?? null,
        valorUnitario: (input.valorUnitario as string | undefined) ?? null,
        localizacao: (input.localizacao as string | undefined) ?? null,
        observacoes: (input.observacoes as string | undefined) ?? null,
        createdAt,
        updatedAt: createdAt,
      };
      data.estoque.push(row);
      return { success: true, id, produtoId };
    });
  },

  createProdutoComEstoques(input: Record<string, unknown> & { fazendaIds: number[] }) {
    return withStore(data => {
      const createdAt = now();
      const embalagens = input.embalagens as unknown[] | undefined;
      const produtoId = data.nextProdutoCatalogoId++;
      const monitorarAlguma = (input.estoquesConfig as { monitorarEstoque?: boolean }[] | undefined)?.some(
        c => c.monitorarEstoque
      );
      data.produtosCatalogo.push({
        id: produtoId,
        nome: String(input.nome),
        categoria: (input.categoria as string) ?? null,
        subcategoria: (input.subcategoria as string) ?? null,
        unidade: (input.unidade as string) ?? null,
        fabricante: (input.fabricante as string | undefined) ?? null,
        identificadorUnico: (input.identificadorUnico as string | undefined) ?? null,
        produzidoNaFazenda: false,
        monitorarEstoque: monitorarAlguma || !!(input.monitorarEstoque as boolean | undefined),
        situacao: (input.situacao as string | undefined) ?? "ativo",
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : null,
        possuiCarencia: (input.possuiCarencia as boolean | undefined) ?? false,
        carenciaAbateDias: (input.carenciaAbateDias as number | null | undefined) ?? null,
        carenciaAbateUnidade: (input.carenciaAbateUnidade as string | undefined) ?? "d",
        carenciaLeiteDias: (input.carenciaLeiteDias as number | null | undefined) ?? null,
        observacoesCarencia: (input.observacoesCarencia as string | null | undefined) ?? null,
        observacoes: (input.observacoes as string | undefined) ?? null,
        createdAt,
        updatedAt: createdAt,
      });
      let firstId: number | null = null;
      for (const fazendaId of input.fazendaIds) {
        const id = data.nextEstoqueId++;
        if (!firstId) firstId = id;
        const cfg = configLocalParaFazenda(input, fazendaId);
        data.estoque.push({
          id,
          produtoId,
          fazendaId,
          nome: String(input.nome),
          categoria: (input.categoria as string) ?? null,
          subcategoria: (input.subcategoria as string) ?? null,
          unidade: (input.unidade as string) ?? null,
          quantidade:
            fazendaId === input.fazendaIds[0]
              ? ((input.quantidade as string | undefined) ?? "0")
              : "0",
          quantidadeMinima: cfg.quantidadeMinima ?? "0",
          quantidadeMaxima: cfg.quantidadeMaxima,
          fabricante: (input.fabricante as string | undefined) ?? null,
          identificadorUnico: (input.identificadorUnico as string | undefined) ?? null,
          produzidoNaFazenda: cfg.produzidoNaFazenda,
          monitorarEstoque: cfg.monitorarEstoque,
          situacao: (input.situacao as string | undefined) ?? "ativo",
          embalagens: embalagens?.length ? JSON.stringify(embalagens) : null,
          possuiCarencia: (input.possuiCarencia as boolean | undefined) ?? false,
          carenciaAbateDias: (input.carenciaAbateDias as number | null | undefined) ?? null,
          carenciaAbateUnidade: (input.carenciaAbateUnidade as string | undefined) ?? "d",
          carenciaLeiteDias: (input.carenciaLeiteDias as number | null | undefined) ?? null,
          observacoesCarencia: (input.observacoesCarencia as string | null | undefined) ?? null,
          valorUnitario: (input.valorUnitario as string | undefined) ?? null,
          localizacao: (input.localizacao as string | undefined) ?? null,
          observacoes: (input.observacoes as string | undefined) ?? null,
          createdAt,
          updatedAt: createdAt,
        });
      }
      return { success: true, id: firstId!, produtoId };
    });
  },

  listFazendaIdsDoProduto(produtoId: number | null, fallbackFazendaId?: number | null) {
    const data = loadStore();
    if (!produtoId) {
      return fallbackFazendaId ? [fallbackFazendaId] : [];
    }
    return [
      ...new Set(
        data.estoque
          .filter(e => e.produtoId === produtoId && e.fazendaId != null)
          .map(e => e.fazendaId as number)
      ),
    ];
  },

  listEstoquesVinculados(
    produtoId: number | null,
    fallback?: Pick<
      DevEstoque,
      | "id"
      | "fazendaId"
      | "produzidoNaFazenda"
      | "monitorarEstoque"
      | "quantidadeMinima"
      | "quantidadeMaxima"
      | "quantidade"
    > | null
  ) {
    const data = loadStore();
    const mapRow = (e: DevEstoque) => ({
      fazendaId: e.fazendaId as number,
      estoqueId: e.id,
      produzidoNaFazenda: !!e.produzidoNaFazenda,
      monitorarEstoque: !!e.monitorarEstoque,
      quantidadeMinima: e.quantidadeMinima != null ? String(e.quantidadeMinima) : null,
      quantidadeMaxima: e.quantidadeMaxima != null ? String(e.quantidadeMaxima) : null,
      quantidade: e.quantidade != null ? String(e.quantidade) : null,
    });
    if (!produtoId) {
      if (fallback?.fazendaId) {
        return [
          {
            fazendaId: fallback.fazendaId,
            estoqueId: fallback.id,
            produzidoNaFazenda: !!fallback.produzidoNaFazenda,
            monitorarEstoque: !!fallback.monitorarEstoque,
            quantidadeMinima:
              fallback.quantidadeMinima != null ? String(fallback.quantidadeMinima) : null,
            quantidadeMaxima:
              fallback.quantidadeMaxima != null ? String(fallback.quantidadeMaxima) : null,
            quantidade: fallback.quantidade != null ? String(fallback.quantidade) : null,
          },
        ];
      }
      return [];
    }
    return data.estoque
      .filter(e => e.produtoId === produtoId && e.fazendaId != null && e.fazendaId > 0)
      .map(mapRow);
  },

  updateProdutoComEstoques(input: Record<string, unknown> & { id: number }) {
    return withStore(data => {
      const row = getItem(data, input.id);
      if (!row) throw new Error("Produto não encontrado");
      const embalagens = input.embalagens as unknown[] | undefined;
      const embalagensStr = embalagens?.length ? JSON.stringify(embalagens) : row.embalagens;
      let produtoId = row.produtoId;
      const monitorarAlguma = (input.estoquesConfig as { monitorarEstoque?: boolean }[] | undefined)?.some(
        c => c.monitorarEstoque
      );
      if (!produtoId) {
        produtoId = data.nextProdutoCatalogoId++;
        row.produtoId = produtoId;
        data.produtosCatalogo.push({
          id: produtoId,
          nome: String(input.nome ?? row.nome),
          categoria: (input.categoria as string) ?? row.categoria,
          subcategoria: (input.subcategoria as string) ?? row.subcategoria,
          unidade: (input.unidade as string) ?? row.unidade,
          fabricante: (input.fabricante as string | undefined) ?? row.fabricante,
          identificadorUnico: (input.identificadorUnico as string | undefined) ?? row.identificadorUnico,
          produzidoNaFazenda: false,
          monitorarEstoque:
            monitorarAlguma ??
            ((input.monitorarEstoque as boolean | undefined) ?? row.monitorarEstoque),
          situacao: (input.situacao as string | undefined) ?? row.situacao,
          embalagens: embalagensStr,
          possuiCarencia: (input.possuiCarencia as boolean | undefined) ?? row.possuiCarencia,
          carenciaAbateDias: (input.carenciaAbateDias as number | null | undefined) ?? row.carenciaAbateDias,
          carenciaAbateUnidade: (input.carenciaAbateUnidade as string | undefined) ?? row.carenciaAbateUnidade,
          carenciaLeiteDias: (input.carenciaLeiteDias as number | null | undefined) ?? row.carenciaLeiteDias,
          observacoesCarencia: (input.observacoesCarencia as string | null | undefined) ?? row.observacoesCarencia,
          observacoes: (input.observacoes as string | undefined) ?? row.observacoes,
          createdAt: now(),
          updatedAt: now(),
        });
      } else {
        const catalogo = data.produtosCatalogo.find(p => p.id === produtoId);
        if (catalogo) {
          Object.assign(catalogo, {
            nome: input.nome ?? catalogo.nome,
            categoria: input.categoria ?? catalogo.categoria,
            subcategoria: input.subcategoria ?? catalogo.subcategoria,
            unidade: input.unidade ?? catalogo.unidade,
            fabricante: input.fabricante !== undefined ? input.fabricante : catalogo.fabricante,
            identificadorUnico:
              input.identificadorUnico !== undefined ? input.identificadorUnico : catalogo.identificadorUnico,
            monitorarEstoque:
              monitorarAlguma != null
                ? monitorarAlguma
                : input.monitorarEstoque !== undefined
                  ? input.monitorarEstoque
                  : catalogo.monitorarEstoque,
            situacao: input.situacao ?? catalogo.situacao,
            embalagens: embalagens ? embalagensStr : catalogo.embalagens,
            possuiCarencia: input.possuiCarencia !== undefined ? input.possuiCarencia : catalogo.possuiCarencia,
            carenciaAbateDias:
              input.carenciaAbateDias !== undefined ? input.carenciaAbateDias : catalogo.carenciaAbateDias,
            carenciaAbateUnidade:
              input.carenciaAbateUnidade !== undefined
                ? input.carenciaAbateUnidade
                : catalogo.carenciaAbateUnidade,
            carenciaLeiteDias:
              input.carenciaLeiteDias !== undefined ? input.carenciaLeiteDias : catalogo.carenciaLeiteDias,
            observacoesCarencia:
              input.observacoesCarencia !== undefined
                ? input.observacoesCarencia
                : catalogo.observacoesCarencia,
            observacoes: input.observacoes !== undefined ? input.observacoes : catalogo.observacoes,
            updatedAt: now(),
          });
        }
      }

      // Ficha compartilhada — sem produzido/monitorar/min/max/situacao (são por fazenda ou catálogo)
      const syncFields = {
        nome: String(input.nome ?? row.nome),
        categoria: (input.categoria as string) ?? row.categoria,
        subcategoria: (input.subcategoria as string) ?? row.subcategoria,
        unidade: (input.unidade as string) ?? row.unidade,
        fabricante: (input.fabricante as string | undefined) ?? row.fabricante,
        identificadorUnico: (input.identificadorUnico as string | undefined) ?? row.identificadorUnico,
        embalagens: embalagens ? embalagensStr : row.embalagens,
        possuiCarencia: (input.possuiCarencia as boolean | undefined) ?? row.possuiCarencia,
        carenciaAbateDias: (input.carenciaAbateDias as number | null | undefined) ?? row.carenciaAbateDias,
        carenciaAbateUnidade: (input.carenciaAbateUnidade as string | undefined) ?? row.carenciaAbateUnidade,
        carenciaLeiteDias: (input.carenciaLeiteDias as number | null | undefined) ?? row.carenciaLeiteDias,
        observacoesCarencia:
          (input.observacoesCarencia as string | null | undefined) ?? row.observacoesCarencia,
        observacoes: (input.observacoes as string | undefined) ?? row.observacoes,
        valorUnitario: (input.valorUnitario as string | undefined) ?? row.valorUnitario,
        localizacao: (input.localizacao as string | undefined) ?? row.localizacao,
        updatedAt: now(),
      };

      const fazendaIds = [
        ...new Set([
          ...((input.fazendaIds as unknown[] | undefined) ?? []),
          ...(input.fazendaId != null ? [input.fazendaId] : []),
          ...((input.estoquesConfig as { fazendaId: unknown }[] | undefined)?.map(c => c.fazendaId) ?? []),
        ]),
      ]
        .map(v => {
          const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        })
        .filter((id): id is number => id != null);
      const desired = new Set(fazendaIds);

      for (const item of data.estoque.filter(e => e.produtoId === produtoId)) {
        const itemFarm = item.fazendaId != null ? Number(item.fazendaId) : null;
        if (itemFarm != null && Number.isFinite(itemFarm) && !desired.has(itemFarm)) {
          const qty = Number(item.quantidade ?? 0);
          const hasMov = data.movimentacoes.some(m => m.estoqueId === item.id);
          if (hasMov || (!Number.isNaN(qty) && qty !== 0)) {
            throw new Error(
              "Este produto possui movimentações ou estoque nesta Fazenda. Não é possível desvincular diretamente. Inative o produto para esta Fazenda ou ajuste o estoque antes."
            );
          }
          data.estoque = data.estoque.filter(e => e.id !== item.id);
          continue;
        }
        Object.assign(item, syncFields);
        if (itemFarm != null && Number.isFinite(itemFarm)) {
          const cfg = configLocalParaFazenda(input, itemFarm, {
            produzidoNaFazenda: !!item.produzidoNaFazenda,
            monitorarEstoque: !!item.monitorarEstoque,
            quantidadeMinima: item.quantidadeMinima,
            quantidadeMaxima: item.quantidadeMaxima,
          });
          item.produzidoNaFazenda = cfg.produzidoNaFazenda;
          item.monitorarEstoque = cfg.monitorarEstoque;
          item.quantidadeMinima = cfg.quantidadeMinima ?? "0";
          item.quantidadeMaxima = cfg.quantidadeMaxima;
        }
      }

      // Situação operacional é por fazenda — não cascatear situacao do catálogo

      const linked = new Set(
        data.estoque
          .filter(e => e.produtoId === produtoId && e.fazendaId != null)
          .map(e => Number(e.fazendaId))
          .filter(id => Number.isFinite(id) && id > 0)
      );
      for (const fazendaId of fazendaIds) {
        if (linked.has(fazendaId)) continue;
        const cfg = configLocalParaFazenda(input, fazendaId);
        const id = data.nextEstoqueId++;
        data.estoque.push({
          id,
          produtoId,
          fazendaId,
          ...syncFields,
          produzidoNaFazenda: cfg.produzidoNaFazenda,
          monitorarEstoque: cfg.monitorarEstoque,
          quantidadeMinima: cfg.quantidadeMinima ?? "0",
          quantidadeMaxima: cfg.quantidadeMaxima,
          situacao: "ativo",
          quantidade: "0",
          createdAt: now(),
        } as DevEstoque);
      }
      return { success: true, produtoId };
    });
  },

  vincularFazenda(input: {
    produtoId: number;
    fazendaId: number;
    produzidoNaFazenda?: boolean;
    monitorarEstoque?: boolean;
    quantidadeMinima?: string;
    quantidadeMaxima?: string;
  }) {
    return withStore(data => {
      const catalogo = data.produtosCatalogo.find(p => p.id === input.produtoId);
      if (!catalogo) throw new Error("Produto do catálogo não encontrado");
      const existing = data.estoque.find(
        e => e.produtoId === input.produtoId && e.fazendaId === input.fazendaId
      );
      if (existing) {
        if (input.produzidoNaFazenda != null) existing.produzidoNaFazenda = input.produzidoNaFazenda;
        if (input.monitorarEstoque != null) existing.monitorarEstoque = input.monitorarEstoque;
        if (input.quantidadeMinima !== undefined) existing.quantidadeMinima = input.quantidadeMinima;
        if (input.quantidadeMaxima !== undefined) existing.quantidadeMaxima = input.quantidadeMaxima ?? null;
        existing.updatedAt = now();
        return { id: existing.id, alreadyLinked: true };
      }
      const id = data.nextEstoqueId++;
      const createdAt = now();
      data.estoque.push({
        id,
        produtoId: input.produtoId,
        fazendaId: input.fazendaId,
        nome: catalogo.nome,
        categoria: catalogo.categoria,
        subcategoria: catalogo.subcategoria,
        unidade: catalogo.unidade,
        quantidade: "0",
        quantidadeMinima: input.quantidadeMinima ?? "0",
        quantidadeMaxima: input.quantidadeMaxima ?? null,
        fabricante: catalogo.fabricante,
        identificadorUnico: catalogo.identificadorUnico,
        produzidoNaFazenda: input.produzidoNaFazenda ?? false,
        monitorarEstoque: input.monitorarEstoque ?? false,
        situacao: catalogo.situacao,
        embalagens: catalogo.embalagens,
        possuiCarencia: catalogo.possuiCarencia,
        carenciaAbateDias: catalogo.carenciaAbateDias,
        carenciaAbateUnidade: catalogo.carenciaAbateUnidade,
        carenciaLeiteDias: catalogo.carenciaLeiteDias,
        observacoesCarencia: catalogo.observacoesCarencia,
        valorUnitario: null,
        localizacao: null,
        observacoes: catalogo.observacoes,
        createdAt,
        updatedAt: createdAt,
      });
      return { id, alreadyLinked: false };
    });
  },

  updateEstoque(input: Record<string, unknown> & { id: number }) {
    return withStore(data => {
      const row = getItem(data, input.id);
      if (!row) throw new Error("Produto não encontrado");
      const embalagens = input.embalagens as unknown[] | undefined;
      Object.assign(row, {
        fazendaId: input.fazendaId !== undefined ? input.fazendaId : row.fazendaId,
        nome: input.nome ?? row.nome,
        categoria: input.categoria ?? row.categoria,
        subcategoria: input.subcategoria ?? row.subcategoria,
        unidade: input.unidade ?? row.unidade,
        quantidadeMinima: input.quantidadeMinima ?? row.quantidadeMinima,
        quantidadeMaxima: input.quantidadeMaxima ?? row.quantidadeMaxima,
        fabricante: input.fabricante ?? row.fabricante,
        identificadorUnico: input.identificadorUnico ?? row.identificadorUnico,
        produzidoNaFazenda: input.produzidoNaFazenda ?? row.produzidoNaFazenda,
        monitorarEstoque: input.monitorarEstoque ?? row.monitorarEstoque,
        situacao: input.situacao ?? row.situacao,
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : row.embalagens,
        possuiCarencia: input.possuiCarencia ?? row.possuiCarencia,
        carenciaAbateDias: input.carenciaAbateDias ?? row.carenciaAbateDias,
        carenciaAbateUnidade: input.carenciaAbateUnidade ?? row.carenciaAbateUnidade,
        carenciaLeiteDias: input.carenciaLeiteDias ?? row.carenciaLeiteDias,
        observacoesCarencia: input.observacoesCarencia ?? row.observacoesCarencia,
        valorUnitario: input.valorUnitario ?? row.valorUnitario,
        localizacao: input.localizacao ?? row.localizacao,
        observacoes: input.observacoes ?? row.observacoes,
        updatedAt: now(),
      });
      return { success: true };
    });
  },

  /**
   * Remove vínculo de estoque.
   * - fazenda: só a linha informada (outras fazendas e catálogo permanecem, se houver mais vínculos)
   * - catalogo: remove produto do catálogo e todos os estoques/movimentações
   */
  deleteEstoque(id: number, escopo: "fazenda" | "catalogo" = "fazenda") {
    return withStore(data => {
      const row = getItem(data, id);
      if (!row) return { success: true, escopo };

      if (escopo === "fazenda") {
        const qty = Number(row.quantidade ?? 0);
        const hasMov = data.movimentacoes.some(m => m.estoqueId === id);
        if (hasMov || (!Number.isNaN(qty) && qty !== 0)) {
          throw new Error(
            "Este produto possui movimentações ou estoque nesta Fazenda. Não é possível desvincular diretamente. Inative o produto para esta Fazenda ou ajuste o estoque antes."
          );
        }
        const produtoId = row.produtoId ?? null;
        data.movimentacoes = data.movimentacoes.filter(m => m.estoqueId !== id);
        data.estoque = data.estoque.filter(e => e.id !== id);
        if (produtoId) {
          const aindaVinculado = data.estoque.some(e => e.produtoId === produtoId);
          if (!aindaVinculado) {
            data.produtosCatalogo = data.produtosCatalogo.filter(p => p.id !== produtoId);
          }
        }
        return { success: true, escopo };
      }

      const produtoId = row.produtoId ?? null;
      const idsParaRemover = new Set<number>([id]);
      if (produtoId) {
        for (const e of data.estoque) {
          if (e.produtoId === produtoId) idsParaRemover.add(e.id);
        }
      } else if (row.nome) {
        const chave = [
          (row.nome ?? "").trim().toLowerCase(),
          (row.unidade ?? "").trim().toLowerCase(),
          (row.categoria ?? "").trim().toLowerCase(),
        ].join("|");
        for (const e of data.estoque) {
          const k = [
            (e.nome ?? "").trim().toLowerCase(),
            (e.unidade ?? "").trim().toLowerCase(),
            (e.categoria ?? "").trim().toLowerCase(),
          ].join("|");
          if (k === chave) idsParaRemover.add(e.id);
        }
      }

      data.movimentacoes = data.movimentacoes.filter(m => !idsParaRemover.has(m.estoqueId));
      data.estoque = data.estoque.filter(e => !idsParaRemover.has(e.id));
      if (produtoId) {
        data.produtosCatalogo = data.produtosCatalogo.filter(p => p.id !== produtoId);
      }
      return { success: true, escopo };
    });
  },

  inativarProdutos(ids: number[], escopo: "fazenda" | "catalogo" = "fazenda") {
    return withStore(data => {
      const idsAlvo = new Set<number>(ids);
      const produtoIds = new Set<number>();
      if (escopo === "catalogo") {
        for (const id of ids) {
          const row = getItem(data, id);
          if (row?.produtoId) produtoIds.add(row.produtoId);
        }
        for (const e of data.estoque) {
          if (e.produtoId != null && produtoIds.has(e.produtoId)) idsAlvo.add(e.id);
        }
        for (const p of data.produtosCatalogo) {
          if (produtoIds.has(p.id)) {
            p.situacao = "inativo";
            p.updatedAt = now();
          }
        }
      }
      let count = 0;
      for (const id of idsAlvo) {
        const row = getItem(data, id);
        if (row) {
          row.situacao = "inativo";
          row.updatedAt = now();
          count++;
        }
      }
      return { success: true, count, escopo };
    });
  },

  ativarProdutos(ids: number[], escopo: "fazenda" | "catalogo" = "fazenda") {
    return withStore(data => {
      const idsAlvo = new Set<number>(ids);
      const produtoIds = new Set<number>();
      if (escopo === "catalogo") {
        for (const id of ids) {
          const row = getItem(data, id);
          if (row?.produtoId) produtoIds.add(row.produtoId);
        }
        for (const e of data.estoque) {
          if (e.produtoId != null && produtoIds.has(e.produtoId)) idsAlvo.add(e.id);
        }
        for (const p of data.produtosCatalogo) {
          if (produtoIds.has(p.id)) {
            p.situacao = "ativo";
            p.updatedAt = now();
          }
        }
      }
      let count = 0;
      for (const id of idsAlvo) {
        const row = getItem(data, id);
        if (row) {
          row.situacao = "ativo";
          row.updatedAt = now();
          count++;
        }
      }
      return { success: true, count, escopo };
    });
  },

  resumo() {
    const itens = loadStore().estoque;
    const monitorados = itens.filter(i => i.monitorarEstoque);
    const abaixoLimite = monitorados.filter(i => {
      const q = Number(i.quantidade ?? 0);
      const min = Number(i.quantidadeMinima ?? 0);
      return min > 0 && q <= min;
    });
    return { totalMonitorados: monitorados.length, totalAbaixoLimite: abaixoLimite.length };
  },

  listMovimentacoes() {
    const data = loadStore();
    return data.movimentacoes
      .map(m => joinMov(data, m))
      .sort((a, b) => {
        const da = a.dataMovimentacao.localeCompare(b.dataMovimentacao);
        return da !== 0 ? -da : b.id - a.id;
      });
  },

  getMovimentacao(id: number) {
    const data = loadStore();
    const mov = data.movimentacoes.find(m => m.id === id);
    return mov ? joinMov(data, mov) : null;
  },

  createMovimentacao(input: Record<string, unknown>) {
    return withStore(data => {
      const estoqueId = input.estoqueId as number;
      const item = getItem(data, estoqueId);
      if (!item) throw new Error("Produto não encontrado");

      const fazendaId = (input.fazendaId as number | undefined) ?? item.fazendaId;
      if (!fazendaId) throw new Error("Informe a fazenda da movimentação.");

      const qty = parseFloat(String(input.quantidade).replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) throw new Error("Informe uma quantidade válida.");

      const atual = Number(item.quantidade ?? 0);
      const novo = atual + qty;
      if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");

      let observacoes = input.observacoes as string | undefined;
      if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
        observacoes = JSON.stringify({
          modo: input.modo,
          sinal: input.sinal,
          unidades: input.quantidadeUnidades,
          porUnidade: input.quantidadePorUnidade,
          unidade: input.unidadeLancamento,
          total: qty,
        });
      }

      const id = data.nextMovId++;
      data.movimentacoes.push({
        id,
        grupoId: (input.grupoId as string | undefined)?.trim() || null,
        estoqueId,
        fazendaId,
        userId: (input.userId as number | undefined) ?? null,
        registradoPor: (input.registradoPor as string | undefined)?.trim() || null,
        tipo: (input.tipo as string | undefined) ?? null,
        dataMovimentacao: String(input.dataMovimentacao).slice(0, 10),
        quantidade: String(qty),
        dataValidade: input.dataValidade ? String(input.dataValidade).slice(0, 10) : null,
        destino: (input.destino as string | undefined) ?? null,
        manejo: (input.manejo as string | undefined) ?? null,
        notaFiscal: (input.notaFiscal as string | undefined) ?? null,
        frete: (input.frete as string | undefined) ?? null,
        fornecedor: (input.fornecedor as string | undefined) ?? null,
        valor: (input.valor as string | undefined) ?? null,
        observacoes: observacoes ?? null,
        status: ((input.status as string | undefined) as DevMovimentacao["status"]) || "ativa",
        originalGrupoId: (input.originalGrupoId as string | undefined)?.trim() || null,
        motivoEstorno: (input.motivoEstorno as string | undefined)?.trim() || null,
        createdAt: now(),
        updatedAt: null,
        updatedByUserId: null,
        updatedByNome: null,
      });
      item.quantidade = String(novo);
      item.updatedAt = now();
      return { success: true, id };
    });
  },

  updateMovimentacao(input: Record<string, unknown> & { id: number }) {
    return withStore(data => {
      const mov = data.movimentacoes.find(m => m.id === input.id);
      if (!mov) throw new Error("Movimentação não encontrada");
      const status = mov.status || "ativa";
      if (status === "estornada" || status === "estorno") {
        throw new Error("Movimentação estornada não pode ser editada.");
      }

      const qty = parseFloat(String(input.quantidade).replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) throw new Error("Informe uma quantidade válida.");

      const oldQty = Number(mov.quantidade);
      const oldEstoqueId = mov.estoqueId;
      const newEstoqueId = input.estoqueId as number;

      if (oldEstoqueId === newEstoqueId) {
        const item = getItem(data, newEstoqueId);
        if (!item) throw new Error("Produto não encontrado");
        const base = Number(item.quantidade ?? 0) - oldQty;
        const novo = base + qty;
        if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
        item.quantidade = String(novo);
        item.updatedAt = now();
      } else {
        const oldItem = getItem(data, oldEstoqueId);
        const newItem = getItem(data, newEstoqueId);
        if (!oldItem || !newItem) throw new Error("Produto não encontrado");
        const oldStock = Number(oldItem.quantidade ?? 0) - oldQty;
        const newStock = Number(newItem.quantidade ?? 0) + qty;
        if (newStock < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
        oldItem.quantidade = String(oldStock);
        newItem.quantidade = String(newStock);
        oldItem.updatedAt = now();
        newItem.updatedAt = now();
      }

      Object.assign(mov, {
        estoqueId: newEstoqueId,
        fazendaId: (input.fazendaId as number | undefined) ?? mov.fazendaId,
        tipo: (input.tipo as string | undefined) ?? mov.tipo,
        dataMovimentacao: String(input.dataMovimentacao).slice(0, 10),
        quantidade: String(qty),
        dataValidade: input.dataValidade ? String(input.dataValidade).slice(0, 10) : null,
        destino: (input.destino as string | undefined) ?? null,
        manejo: (input.manejo as string | undefined) ?? null,
        notaFiscal: (input.notaFiscal as string | undefined) ?? null,
        frete: (input.frete as string | undefined) ?? null,
        fornecedor: (input.fornecedor as string | undefined) ?? null,
        valor: (input.valor as string | undefined) ?? null,
        observacoes: (input.observacoes as string | undefined) ?? mov.observacoes,
        updatedAt: now(),
        updatedByUserId: (input.updatedByUserId as number | undefined) ?? mov.updatedByUserId,
        updatedByNome: (input.updatedByNome as string | undefined)?.trim() || mov.updatedByNome,
      });
      return { success: true };
    });
  },

  /**
   * Estorna uma movimentação administrativa completa (todos os itens do grupo).
   * Cria lançamentos inversos e marca a original como estornada.
   */
  validarEstorno(itemIds: number[]) {
    const data = loadStore();
    const seeds = data.movimentacoes.filter(m => itemIds.includes(m.id));
    if (!seeds.length) {
      return {
        podeEstornar: false,
        jaEstornada: false,
        insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
        mensagem: "Movimentação não encontrada.",
      };
    }

    const grupoId = seeds[0]!.grupoId?.trim() || null;
    const originais = grupoId
      ? data.movimentacoes.filter(m => m.grupoId === grupoId)
      : seeds;

    for (const mov of originais) {
      const st = mov.status || "ativa";
      if (st === "estornada") {
        return {
          podeEstornar: false,
          jaEstornada: true,
          insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
          mensagem: "Esta movimentação já foi estornada.",
        };
      }
      if (st === "estorno") {
        return {
          podeEstornar: false,
          jaEstornada: true,
          insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
          mensagem: "Não é possível estornar um lançamento de estorno.",
        };
      }
    }

    const saldos = new Map<number, { quantidade: number; nome: string; unidade?: string | null }>();
    for (const mov of originais) {
      const item = getItem(data, mov.estoqueId);
      if (!item) continue;
      saldos.set(mov.estoqueId, {
        quantidade: Number(item.quantidade ?? 0),
        nome: item.nome,
        unidade: item.unidade,
      });
    }

    const insuficientes = avaliarEstornoEstoque(
      originais.map(o => {
        const item = getItem(data, o.estoqueId);
        return {
          estoqueId: o.estoqueId,
          quantidade: o.quantidade,
          nome: item?.nome,
          unidade: item?.unidade,
        };
      }),
      saldos,
    );

    return {
      podeEstornar: insuficientes.length === 0,
      jaEstornada: false,
      insuficientes,
      mensagem:
        insuficientes.length > 0
          ? "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão."
          : null,
    };
  },

  estornarMovimentacaoGrupo(input: {
    itemIds: number[];
    motivo: string;
    userId: number;
    registradoPor: string;
  }) {
    return withStore(data => {
      const motivo = input.motivo.trim();
      if (!motivo) throw new Error("Informe o motivo do estorno.");
      if (!input.userId || !input.registradoPor?.trim()) {
        throw new Error("Usuário autenticado inválido para registrar o estorno.");
      }

      const seeds = data.movimentacoes.filter(m => input.itemIds.includes(m.id));
      if (!seeds.length) throw new Error("Movimentação não encontrada.");

      const grupoId = seeds[0]!.grupoId?.trim() || null;
      const originais = grupoId
        ? data.movimentacoes.filter(m => m.grupoId === grupoId)
        : seeds;

      for (const mov of originais) {
        const st = mov.status || "ativa";
        if (st === "estornada") {
          throw new Error("Esta movimentação já foi estornada.");
        }
        if (st === "estorno") {
          throw new Error("Não é possível estornar um lançamento de estorno.");
        }
      }

      const saldos = new Map<number, { quantidade: number; nome: string; unidade?: string | null }>();
      for (const mov of originais) {
        const item = getItem(data, mov.estoqueId);
        if (!item) throw new Error("Produto não encontrado.");
        saldos.set(mov.estoqueId, {
          quantidade: Number(item.quantidade ?? 0),
          nome: item.nome,
          unidade: item.unidade,
        });
      }
      const insuficientes = avaliarEstornoEstoque(
        originais.map(o => {
          const item = getItem(data, o.estoqueId);
          return {
            estoqueId: o.estoqueId,
            quantidade: o.quantidade,
            nome: item?.nome,
            unidade: item?.unidade,
          };
        }),
        saldos,
      );
      if (insuficientes.length > 0) {
        throw new Error(
          "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão.",
        );
      }

      const originalGrupoId =
        grupoId ||
        (() => {
          const novo = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
          for (const mov of originais) mov.grupoId = novo;
          return novo;
        })();

      const estornoGrupoId = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      const hoje = new Date().toISOString().slice(0, 10);
      const idsCriados: number[] = [];

      for (const mov of originais) {
        const qty = Number(mov.quantidade);
        const qtyInversa = -qty;
        const item = getItem(data, mov.estoqueId);
        if (!item) throw new Error("Produto não encontrado.");
        const atual = Number(item.quantidade ?? 0);
        const novo = atual + qtyInversa;
        if (novo < 0) {
          throw new Error(
            "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão.",
          );
        }
        item.quantidade = String(novo);
        item.updatedAt = now();

        const id = data.nextMovId++;
        idsCriados.push(id);
        data.movimentacoes.push({
          id,
          grupoId: estornoGrupoId,
          estoqueId: mov.estoqueId,
          fazendaId: mov.fazendaId,
          userId: input.userId,
          registradoPor: input.registradoPor.trim(),
          tipo: mov.tipo,
          dataMovimentacao: hoje,
          quantidade: String(qtyInversa),
          dataValidade: mov.dataValidade,
          destino: mov.destino,
          manejo: mov.manejo,
          notaFiscal: mov.notaFiscal,
          frete: mov.frete,
          fornecedor: mov.fornecedor,
          valor: mov.valor,
          observacoes: mov.observacoes,
          status: "estorno",
          originalGrupoId,
          motivoEstorno: motivo,
          createdAt: now(),
          updatedAt: null,
          updatedByUserId: null,
          updatedByNome: null,
        });

        mov.status = "estornada";
        mov.motivoEstorno = motivo;
        mov.updatedAt = now();
        mov.updatedByUserId = input.userId;
        mov.updatedByNome = input.registradoPor.trim();
        if (!mov.grupoId) mov.grupoId = originalGrupoId;
      }

      return {
        success: true,
        originalGrupoId,
        estornoGrupoId,
        ids: idsCriados,
      };
    });
  },

  deleteMovimentacao(id: number) {
    return withStore(data => {
      const mov = data.movimentacoes.find(m => m.id === id);
      if (!mov) throw new Error("Movimentação não encontrada");
      const status = mov.status || "ativa";
      if (status === "estornada" || status === "estorno") {
        throw new Error("Movimentação estornada não pode ser excluída. Use o histórico para consulta.");
      }
      const item = getItem(data, mov.estoqueId);
      if (item) {
        const atual = Number(item.quantidade ?? 0);
        const qtyMov = Number(mov.quantidade);
        const revertido = atual - qtyMov;
        if (qtyMov > 0 && revertido < 0) {
          throw new Error(
            `Não é possível remover este item: o estoque atual de "${item.nome}" é insuficiente para reverter a entrada (necessário ${qtyMov}, saldo ${atual}). Estorne a movimentação ou ajuste o estoque antes.`,
          );
        }
        item.quantidade = String(revertido);
        item.updatedAt = now();
      }
      data.movimentacoes = data.movimentacoes.filter(m => m.id !== id);
      return { success: true };
    });
  },

  listMovimentacoesByProduto(estoqueId: number) {
    const data = loadStore();
    return data.movimentacoes
      .filter(m => m.estoqueId === estoqueId)
      .map(m => joinMov(data, m))
      .sort((a, b) => {
        const da = a.dataMovimentacao.localeCompare(b.dataMovimentacao);
        return da !== 0 ? -da : b.id - a.id;
      });
  },

  deleteAllMovimentacoesByProduto(estoqueId: number) {
    return withStore(data => {
      data.movimentacoes = data.movimentacoes.filter(m => m.estoqueId !== estoqueId);
      const item = getItem(data, estoqueId);
      if (item) {
        item.quantidade = "0";
        item.updatedAt = now();
      }
      return { success: true };
    });
  },

  listByCategories(categorias: string[]) {
    return loadStore()
      .estoque.filter(e => e.categoria && categorias.includes(e.categoria))
      .map(e => ({
        id: e.id,
        nome: e.nome,
        categoria: e.categoria,
        subcategoria: e.subcategoria,
        unidade: e.unidade,
        quantidade: e.quantidade,
        valorUnitario: e.valorUnitario,
        fabricante: e.fabricante,
      }))
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
  },

  listContasFinanceiras() {
    return loadStore().contas.sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    );
  },

  createContaFinanceira(input: { nome: string; tipo?: string; banco?: string; saldoInicial?: string }) {
    return withStore(data => {
      const id = data.nextContaId++;
      const createdAt = now();
      const saldo = input.saldoInicial || "0";
      data.contas.push({
        id,
        nome: input.nome,
        tipo: input.tipo ?? null,
        banco: input.banco ?? null,
        saldoInicial: saldo,
        saldoAtual: saldo,
        ativa: true,
        createdAt,
      });
      return { success: true, id };
    });
  },

  listMovimentacoesFinanceiras() {
    return loadStore().financeiroMovimentacoes.sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    );
  },

  createMovimentacaoFinanceira(input: {
    contaId?: number;
    tipo: "receita" | "despesa";
    descricao: string;
    valor: string;
    data: string;
    status?: "pendente" | "confirmado" | "cancelado";
    observacoes?: string;
  }) {
    return withStore(data => {
      const id = data.nextFinMovId++;
      data.financeiroMovimentacoes.push({
        id,
        contaId: input.contaId ?? null,
        categoriaId: null,
        tipo: input.tipo,
        descricao: input.descricao,
        valor: input.valor,
        data: input.data.slice(0, 10),
        status: input.status ?? "confirmado",
        observacoes: input.observacoes ?? null,
        createdAt: now(),
      });
      return { success: true, id };
    });
  },

  deleteMovimentacaoFinanceira(id: number) {
    return withStore(data => {
      data.financeiroMovimentacoes = data.financeiroMovimentacoes.filter(m => m.id !== id);
      return { success: true };
    });
  },

  financeiroSummary() {
    const movs = loadStore().financeiroMovimentacoes.filter(m => m.status !== "cancelado");
    const totalReceitas = movs.filter(m => m.tipo === "receita").reduce((s, m) => s + Number(m.valor), 0);
    const totalDespesas = movs.filter(m => m.tipo === "despesa").reduce((s, m) => s + Number(m.valor), 0);
    return { totalReceitas, totalDespesas, saldoTotal: totalReceitas - totalDespesas };
  },

  listLotes(userId: number) {
    const data = loadStore();
    return data.lotes
      .filter(l => l.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .map(lote => {
        const qtdAnimais = data.animais.filter(
          a => a.userId === userId && a.loteId === lote.id && a.status === "ativo"
        ).length;
        return {
          ...lote,
          qtdAnimais,
          pastoNome: null,
          pastoCapacidade: null,
          fazendaNome: data.fazendas.find(f => f.id === lote.fazendaId)?.nome ?? null,
          diasNoPasto: null,
        };
      });
  },

  listAnimais(userId: number, input?: Record<string, unknown>) {
    const data = loadStore();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const loteMap = new Map(data.lotes.filter(l => l.userId === userId).map(l => [l.id, l.nome]));

    let lista = data.animais.filter(a => a.userId === userId);

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
    if (input?.somenteSisbov) lista = [];
    if (input?.marcadores && Array.isArray(input.marcadores) && input.marcadores.length > 0) {
      lista = [];
    }
    if (input?.search && String(input.search).trim()) {
      const q = String(input.search).trim().toLowerCase();
      lista = lista.filter(a =>
        (a.brinco ?? "").toLowerCase().includes(q) ||
        (a.brincoEletronico ?? "").toLowerCase().includes(q) ||
        (a.nome ?? "").toLowerCase().includes(q) ||
        (a.raca ?? "").toLowerCase().includes(q)
      );
    }
    if (input?.brincoEletronico && String(input.brincoEletronico).trim()) {
      const q = String(input.brincoEletronico).trim().toLowerCase();
      lista = lista.filter(a => (a.brincoEletronico ?? "").toLowerCase().includes(q));
    }

    const resultado = lista.map(animal => {
      const loteNome = animal.loteId ? (loteMap.get(animal.loteId) ?? null) : null;
      let idadeMeses: number | null = animal.idadeMesesFix ?? null;
      if (idadeMeses === null && animal.dataNascimento) {
        const nasc = new Date(animal.dataNascimento);
        idadeMeses = Math.floor((hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      }
      let diasNaFazenda: number | null = animal.diasNaFazendaFix ?? null;
      if (diasNaFazenda === null) {
        if (animal.dataNascimento) {
          const nasc = new Date(animal.dataNascimento);
          diasNaFazenda = Math.floor((hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24));
        } else if (animal.dataEntrada) {
          const entrada = new Date(animal.dataEntrada);
          diasNaFazenda = Math.floor((hoje.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      const ultimoPeso = animal.pesoAtual
        ? Number(animal.pesoAtual)
        : (animal.pesoEntrada ? Number(animal.pesoEntrada) : null);
      return {
        ...animal,
        loteNome,
        pastoNome: null,
        idadeMeses,
        diasNaFazenda,
        ultimoPeso,
        ganhoKg: animal.ganhoKgFix ?? null,
        gmd: animal.gmdFix ?? null,
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

    return filtered.sort((a, b) => {
      const ba = Number(a.brinco ?? 0);
      const bb = Number(b.brinco ?? 0);
      if (!Number.isNaN(ba) && !Number.isNaN(bb) && ba !== bb) return ba - bb;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  },

  rebanhoOverview(_userId: number, _fazendaId?: number) {
    return REBANHO_OVERVIEW_DEMO;
  },

  listPessoas(userId: number, tipo?: DevPessoaTipo) {
    const data = loadStore();
    const matched = data.pessoas
      .filter(p => p.userId === userId && p.ativo)
      .filter(p => !tipo || p.tipo === tipo);
    const visible =
      matched.length > 0
        ? matched
        : data.pessoas.filter(p => p.ativo).filter(p => !tipo || p.tipo === tipo);
    return visible.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  createPessoa(userId: number, input: Omit<DevPessoa, "id" | "userId" | "createdAt" | "ativo">) {
    return withStore(data => {
      const nome = input.nome.trim();
      if (!nome) throw new Error("Informe o nome.");
      const documento = input.documento?.trim();
      if (!documento) throw new Error("Informe o CPF/CNPJ.");
      const id = data.nextPessoaId++;
      const row: DevPessoa = {
        id,
        userId,
        nome,
        tipo: input.tipo,
        funcao: input.funcao?.trim() || null,
        documento,
        endereco: input.endereco?.trim() || null,
        telefone: input.telefone?.trim() || null,
        email: input.email?.trim() || null,
        observacoes: input.observacoes?.trim() || null,
        ativo: true,
        createdAt: now(),
      };
      data.pessoas.push(row);
      return row;
    });
  },

  updatePessoa(
    userId: number,
    id: number,
    input: Partial<Omit<DevPessoa, "id" | "userId" | "createdAt">>
  ) {
    return withStore(data => {
      const row = data.pessoas.find(p => p.id === id && (p.userId === userId || p.userId === 0));
      if (!row) throw new Error("Pessoa não encontrada.");
      if (input.nome !== undefined) {
        const nome = input.nome.trim();
        if (!nome) throw new Error("Informe o nome.");
        row.nome = nome;
      }
      if (input.tipo !== undefined) row.tipo = input.tipo;
      if (input.funcao !== undefined) row.funcao = input.funcao?.trim() || null;
      if (input.documento !== undefined) {
        const documento = input.documento?.trim();
        if (!documento) throw new Error("Informe o CPF/CNPJ.");
        row.documento = documento;
      }
      if (input.endereco !== undefined) row.endereco = input.endereco?.trim() || null;
      if (input.telefone !== undefined) row.telefone = input.telefone?.trim() || null;
      if (input.email !== undefined) row.email = input.email?.trim() || null;
      if (input.observacoes !== undefined) row.observacoes = input.observacoes?.trim() || null;
      if (input.ativo !== undefined) row.ativo = input.ativo;
      return row;
    });
  },

  deletePessoa(userId: number, id: number) {
    return withStore(data => {
      const row = data.pessoas.find(p => p.id === id && (p.userId === userId || p.userId === 0));
      if (!row) throw new Error("Pessoa não encontrada.");
      row.ativo = false;
      return { success: true };
    });
  },
};
