import fs from "node:fs";
import path from "node:path";
import { buildDevRebanhoSeed, REBANHO_SEED_VERSION, type DevAnimal, type DevLote } from "./devAnimaisSeed";
import { REBANHO_OVERVIEW_DEMO } from "../shared/rebanhoOverviewDemo";

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

type DevMovimentacao = {
  id: number;
  estoqueId: number;
  fazendaId: number | null;
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
  createdAt: Date | null;
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

type StoreData = {
  nextFazendaId: number;
  nextEstoqueId: number;
  nextMovId: number;
  nextContaId: number;
  nextFinMovId: number;
  nextAnimalId: number;
  nextLoteId: number;
  fazendas: DevFazenda[];
  estoque: DevEstoque[];
  movimentacoes: DevMovimentacao[];
  contas: DevContaFinanceira[];
  financeiroMovimentacoes: DevMovimentacaoFinanceira[];
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
    nextMovId: 4,
    nextContaId: 4,
    nextFinMovId: 9,
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
    estoque: [
      {
        id: 1,
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
        estoqueId: 1,
        fazendaId: 1,
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
        createdAt,
      },
      {
        id: 2,
        estoqueId: 1,
        fazendaId: 1,
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
        createdAt,
      },
      {
        id: 3,
        estoqueId: 2,
        fazendaId: 1,
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
        createdAt,
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
  for (const m of raw.movimentacoes) {
    if (m.createdAt) m.createdAt = new Date(m.createdAt);
  }
  for (const c of raw.contas ?? []) {
    if (c.createdAt) c.createdAt = new Date(c.createdAt);
  }
  for (const m of raw.financeiroMovimentacoes ?? []) {
    if (m.createdAt) m.createdAt = new Date(m.createdAt);
  }
  for (const a of raw.animais ?? []) {
    if (a.createdAt) a.createdAt = new Date(a.createdAt);
  }
  for (const l of raw.lotes ?? []) {
    if (l.createdAt) l.createdAt = new Date(l.createdAt);
  }
  if (!raw.contas) raw.contas = [];
  if (!raw.financeiroMovimentacoes) raw.financeiroMovimentacoes = [];
  if (!raw.animais) raw.animais = [];
  if (!raw.lotes) raw.lotes = [];
  if (!raw.nextContaId) raw.nextContaId = raw.contas.length + 1;
  if (!raw.nextFinMovId) raw.nextFinMovId = raw.financeiroMovimentacoes.length + 1;
  if (!raw.nextAnimalId) raw.nextAnimalId = raw.animais.length + 1;
  if (!raw.nextLoteId) raw.nextLoteId = raw.lotes.length + 1;
  return raw;
}

function loadStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const seed = defaultStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
  return reviveDates(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as StoreData);
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
      const row: DevEstoque = {
        id,
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
      return { success: true, id };
    });
  },

  updateEstoque(input: Record<string, unknown> & { id: number }) {
    return withStore(data => {
      const row = getItem(data, input.id);
      if (!row) throw new Error("Produto não encontrado");
      const embalagens = input.embalagens as unknown[] | undefined;
      Object.assign(row, {
        fazendaId: input.fazendaId ?? row.fazendaId,
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

  deleteEstoque(id: number) {
    return withStore(data => {
      data.movimentacoes = data.movimentacoes.filter(m => m.estoqueId !== id);
      data.estoque = data.estoque.filter(e => e.id !== id);
      return { success: true };
    });
  },

  inativarProdutos(ids: number[]) {
    return withStore(data => {
      for (const id of ids) {
        const row = getItem(data, id);
        if (row) row.situacao = "inativo";
      }
      return { success: true, count: ids.length };
    });
  },

  ativarProdutos(ids: number[]) {
    return withStore(data => {
      for (const id of ids) {
        const row = getItem(data, id);
        if (row) row.situacao = "ativo";
      }
      return { success: true, count: ids.length };
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
        estoqueId,
        fazendaId: (input.fazendaId as number | undefined) ?? item.fazendaId,
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
        createdAt: now(),
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
      });
      return { success: true };
    });
  },

  deleteMovimentacao(id: number) {
    return withStore(data => {
      const mov = data.movimentacoes.find(m => m.id === id);
      if (!mov) throw new Error("Movimentação não encontrada");
      const item = getItem(data, mov.estoqueId);
      if (item) {
        item.quantidade = String(Number(item.quantidade ?? 0) - Number(mov.quantidade));
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
};
