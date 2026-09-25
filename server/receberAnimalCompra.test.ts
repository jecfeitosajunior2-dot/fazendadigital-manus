import { describe, expect, it } from "vitest";
import { buildBrincoAtivoConflitoMessage } from "../shared/brincoAtivo";
import {
  MSG_RECEBIMENTO_COMPRA_CANCELADA,
  MSG_RECEBIMENTO_COMPRA_NAO_CONCLUIDA,
  MSG_RECEBIMENTO_COMPRA_NAO_ENCONTRADA,
  MSG_RECEBIMENTO_GRUPO_ESGOTADO,
  MSG_RECEBIMENTO_GRUPO_NAO_ENCONTRADO,
  MSG_RECEBIMENTO_LOTE_FAZENDA,
  MSG_RECEBIMENTO_PASTO_FAZENDA,
  observacaoRecebimentoCompra,
} from "../shared/compraRecebimento";
import { buildRfidConflitoMessage } from "../shared/rfidUnicidade";
import {
  createReceberAnimalCompraService,
  type ReceberAnimalCompraCompra,
  type ReceberAnimalCompraGrupo,
  type ReceberAnimalCompraLote,
  type ReceberAnimalCompraPasto,
  type ReceberAnimalCompraStore,
  type ReceberAnimalCompraTx,
  type ReceberAnimalInsertRow,
} from "./receberAnimalCompra";

type AnimalMem = ReceberAnimalInsertRow & { id: number };
type PesagemMem = { id: number; animalId: number; peso: string; data: string; observacoes: string };
type MovMem = {
  id: number;
  animalId: number;
  loteOrigemId: null;
  loteDestinoId: number;
  pastoOrigemId: null;
  pastoDestinoId: number | null;
  observacoes: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function criarStore(seed?: {
  compras?: ReceberAnimalCompraCompra[];
  grupos?: ReceberAnimalCompraGrupo[];
  lotes?: ReceberAnimalCompraLote[];
  pastos?: ReceberAnimalCompraPasto[];
  animais?: AnimalMem[];
  falharPesagem?: boolean;
}): ReceberAnimalCompraStore & {
  animais: AnimalMem[];
  pesagens: PesagemMem[];
  movimentacoes: MovMem[];
} {
  const state = {
    compras: seed?.compras ?? [
      { id: 9001, userId: 7, fazendaId: 1, status: "concluido", pesoTotal: "8400.00" },
    ],
    grupos: seed?.grupos ?? [
      { id: 9101, userId: 7, compraId: 9001, categoria: "Bezerro", sexo: "macho" as const, quantidade: 20 },
      { id: 9102, userId: 7, compraId: 9001, categoria: "Bezerra", sexo: "femea" as const, quantidade: 20 },
    ],
    lotes: seed?.lotes ?? [
      { id: 31, userId: 7, fazendaId: 1, nome: "Bezerros", ativo: true, pastoAtualId: 41 },
      { id: 32, userId: 7, fazendaId: 2, nome: "Outra fazenda", ativo: true, pastoAtualId: null },
    ],
    pastos: seed?.pastos ?? [
      { id: 41, userId: 7, fazendaId: 1, nome: "B01" },
      { id: 42, userId: 7, fazendaId: 2, nome: "Pasto alheio" },
    ],
    animais: seed?.animais ? clone(seed.animais) : ([] as AnimalMem[]),
    pesagens: [] as PesagemMem[],
    movimentacoes: [] as MovMem[],
    nextAnimal: (seed?.animais?.reduce((m, a) => Math.max(m, a.id), 800) ?? 800) + 1,
    nextPesagem: 1,
    nextMov: 1,
    lock: Promise.resolve(),
  };

  const tx: ReceberAnimalCompraTx = {
    async getCompra(userId, compraId) {
      return state.compras.find(c => c.id === compraId && c.userId === userId) ?? null;
    },
    async lockGrupo(userId, compraId, grupoId) {
      return (
        state.grupos.find(g => g.id === grupoId && g.userId === userId && g.compraId === compraId) ??
        null
      );
    },
    async countIdentificadosNoGrupo(userId, compraId, grupoId) {
      return state.animais.filter(
        a => a.userId === userId && a.compraId === compraId && a.compraGrupoId === grupoId,
      ).length;
    },
    async findBrincoAtivoConflito(userId, brinco, fazendaId) {
      const key = brinco.trim().toLowerCase();
      return (
        state.animais.find(
          a =>
            a.userId === userId &&
            a.status === "ativo" &&
            a.fazendaId === fazendaId &&
            a.brinco.trim().toLowerCase() === key,
        ) ?? null
      );
    },
    async findRfidConflito(userId, rfid) {
      const key = rfid.trim();
      const found = state.animais.find(
        a => a.userId === userId && (a.brincoEletronico ?? "").trim() === key,
      );
      return found ? { id: found.id, status: found.status } : null;
    },
    async findLote(userId, loteId) {
      return state.lotes.find(l => l.id === loteId && l.userId === userId) ?? null;
    },
    async findPasto(userId, pastoId) {
      return state.pastos.find(p => p.id === pastoId && p.userId === userId) ?? null;
    },
    async insertAnimal(row) {
      const id = state.nextAnimal++;
      state.animais.push({ ...row, id });
      return id;
    },
    async insertPesagem(row) {
      if (seed?.falharPesagem) throw new Error("falha pesagem");
      const id = state.nextPesagem++;
      state.pesagens.push({ id, ...row });
      return id;
    },
    async insertMovimentacao(row) {
      const id = state.nextMov++;
      state.movimentacoes.push({ id, ...row });
      return id;
    },
  };

  const store: ReceberAnimalCompraStore = {
    async transaction(fn) {
      const run = state.lock.then(async () => {
        const snap = {
          animais: clone(state.animais),
          pesagens: clone(state.pesagens),
          movimentacoes: clone(state.movimentacoes),
          nextAnimal: state.nextAnimal,
          nextPesagem: state.nextPesagem,
          nextMov: state.nextMov,
        };
        try {
          return await fn(tx);
        } catch (error) {
          state.animais = snap.animais;
          state.pesagens = snap.pesagens;
          state.movimentacoes = snap.movimentacoes;
          state.nextAnimal = snap.nextAnimal;
          state.nextPesagem = snap.nextPesagem;
          state.nextMov = snap.nextMov;
          throw error;
        }
      });
      state.lock = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  return {
    transaction: store.transaction,
    get animais() {
      return state.animais;
    },
    get pesagens() {
      return state.pesagens;
    },
    get movimentacoes() {
      return state.movimentacoes;
    },
  };
}

const inputBase = {
  compraId: 9001,
  compraGrupoId: 9101,
  brincoVisual: "805",
  dataRecebimento: "2026-09-24",
};

describe("receberAnimalCompra", () => {
  it("recebe sem RFID e sem peso", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    const out = await receber(7, inputBase, { usuarioNome: "Pedro" });
    expect(out.animalId).toBeGreaterThan(800);
    expect(out.brinco).toBe("805");
    expect(out.pesoKg).toBeNull();
    expect(store.pesagens).toHaveLength(0);
    expect(store.animais[0]?.pesoAtual).toBeNull();
    expect(store.animais[0]?.brincoEletronico).toBeNull();
  });

  it("recebe com RFID", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    await receber(7, { ...inputBase, rfid: "  RFID-805  " });
    expect(store.animais[0]?.brincoEletronico).toBe("RFID-805");
  });

  it("peso cria pesagem real e atualiza pesoAtual, sem ratear o grupo", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    const out = await receber(7, { ...inputBase, pesoEntrada: "218" });
    expect(out.pesoKg).toBe(218);
    expect(store.pesagens).toHaveLength(1);
    expect(store.pesagens[0]?.peso).toBe("218");
    expect(store.pesagens[0]?.observacoes).toBe(observacaoRecebimentoCompra(9001));
    expect(store.animais[0]?.pesoAtual).toBe("218");
    expect(store.animais[0]?.pesoAtual).not.toBe("220");
    expect(JSON.stringify(store.animais)).not.toContain("4400");
  });

  it("herda sexo, categoria, fazenda, userId e vínculos", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    const out = await receber(7, { ...inputBase, compraGrupoId: 9102, brincoVisual: "806" });
    expect(out.sexo).toBe("femea");
    expect(out.categoria).toBe("Bezerra");
    expect(out.fazendaId).toBe(1);
    expect(out.userId).toBe(7);
    expect(out.compraId).toBe(9001);
    expect(out.compraGrupoId).toBe(9102);
    expect(out.statusCompra).toBe("concluido");
    expect(store.animais[0]).toMatchObject({
      sexo: "femea",
      categoria: "Bezerra",
      fazendaId: 1,
      userId: 7,
      compraId: 9001,
      compraGrupoId: 9102,
      status: "ativo",
      nome: "806",
    });
  });

  it("bloqueia brinco ativo duplicado na fazenda", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    await receber(7, inputBase);
    await expect(receber(7, { ...inputBase, brincoVisual: "805" })).rejects.toMatchObject({
      message: buildBrincoAtivoConflitoMessage("805"),
    });
  });

  it("bloqueia RFID já usado", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    await receber(7, { ...inputBase, rfid: "TAG-1" });
    await expect(
      receber(7, { ...inputBase, brincoVisual: "806", rfid: "TAG-1" }),
    ).rejects.toMatchObject({
      message: buildRfidConflitoMessage({ id: 1, status: "ativo" }),
    });
  });

  it("bloqueia lote de outra fazenda e pasto incompatível", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    await expect(receber(7, { ...inputBase, loteId: 32 })).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_LOTE_FAZENDA,
    });
    await expect(receber(7, { ...inputBase, pastoId: 42 })).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_PASTO_FAZENDA,
    });
    expect(store.animais).toHaveLength(0);
  });

  it("grupo de outra compra e compra de outro usuário bloqueiam", async () => {
    const store = criarStore({
      compras: [
        { id: 9001, userId: 7, fazendaId: 1, status: "concluido" },
        { id: 9003, userId: 99, fazendaId: 1, status: "concluido" },
      ],
      grupos: [
        { id: 9101, userId: 7, compraId: 9001, categoria: "Bezerro", sexo: "macho", quantidade: 20 },
        { id: 9301, userId: 99, compraId: 9003, categoria: "Bezerro", sexo: "macho", quantidade: 20 },
      ],
    });
    const receber = createReceberAnimalCompraService(store);
    await expect(receber(7, { ...inputBase, compraGrupoId: 9301 })).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_GRUPO_NAO_ENCONTRADO,
    });
    await expect(receber(7, { ...inputBase, compraId: 9003, compraGrupoId: 9301 })).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_COMPRA_NAO_ENCONTRADA,
    });
  });

  it("compra cancelada ou não concluída bloqueia", async () => {
    const cancelada = criarStore({
      compras: [{ id: 9001, userId: 7, fazendaId: 1, status: "cancelado" }],
    });
    const pendente = criarStore({
      compras: [{ id: 9001, userId: 7, fazendaId: 1, status: "pendente" }],
    });
    await expect(createReceberAnimalCompraService(cancelada)(7, inputBase)).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_COMPRA_CANCELADA,
    });
    await expect(createReceberAnimalCompraService(pendente)(7, inputBase)).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_COMPRA_NAO_CONCLUIDA,
    });
  });

  it("bloqueia o 21º animal do grupo de 20", async () => {
    const jaVinte: AnimalMem[] = Array.from({ length: 20 }, (_, i) => ({
      id: 801 + i,
      userId: 7,
      fazendaId: 1,
      sexo: "macho",
      categoria: "Bezerro",
      brinco: String(801 + i),
      nome: String(801 + i),
      brincoEletronico: null,
      raca: null,
      status: "ativo",
      dataEntrada: "2026-09-24",
      observacoes: null,
      compraId: 9001,
      compraGrupoId: 9101,
      loteId: null,
      pastoId: null,
      pesoAtual: null,
    }));
    const store = criarStore({ animais: jaVinte });
    const receber = createReceberAnimalCompraService(store);
    await expect(receber(7, { ...inputBase, brincoVisual: "900" })).rejects.toMatchObject({
      message: MSG_RECEBIMENTO_GRUPO_ESGOTADO,
    });
    expect(store.animais).toHaveLength(20);
  });

  it("duas confirmações no último lugar: só uma passa", async () => {
    const dezenove: AnimalMem[] = Array.from({ length: 19 }, (_, i) => ({
      id: 801 + i,
      userId: 7,
      fazendaId: 1,
      sexo: "macho",
      categoria: "Bezerro",
      brinco: String(801 + i),
      nome: String(801 + i),
      brincoEletronico: null,
      raca: null,
      status: "ativo",
      dataEntrada: "2026-09-24",
      observacoes: null,
      compraId: 9001,
      compraGrupoId: 9101,
      loteId: null,
      pastoId: null,
      pesoAtual: null,
    }));
    const store = criarStore({ animais: dezenove });
    const receber = createReceberAnimalCompraService(store);
    const [a, b] = await Promise.allSettled([
      receber(7, { ...inputBase, brincoVisual: "900" }),
      receber(7, { ...inputBase, brincoVisual: "901" }),
    ]);
    const ok = [a, b].filter(r => r.status === "fulfilled");
    const fail = [a, b].filter(r => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(store.animais).toHaveLength(20);
  });

  it("falha na pesagem faz rollback do animal", async () => {
    const store = criarStore({ falharPesagem: true });
    const receber = createReceberAnimalCompraService(store);
    await expect(receber(7, { ...inputBase, pesoEntrada: "200" })).rejects.toThrow(/falha pesagem/);
    expect(store.animais).toHaveLength(0);
    expect(store.pesagens).toHaveLength(0);
  });

  it("sem lote/pasto entra; com lote/pasto registra histórico de entrada", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    await receber(7, { ...inputBase, brincoVisual: "807" });
    expect(store.movimentacoes).toHaveLength(0);
    await receber(7, { ...inputBase, brincoVisual: "808", loteId: 31, pastoId: 41 });
    expect(store.movimentacoes).toHaveLength(1);
    expect(store.movimentacoes[0]).toMatchObject({
      loteOrigemId: null,
      loteDestinoId: 31,
      pastoOrigemId: null,
      pastoDestinoId: 41,
      observacoes: observacaoRecebimentoCompra(9001),
    });
    expect(store.animais[1]).toMatchObject({ loteId: 31, pastoId: 41 });
  });

  it("contadores derivados e status comercial intacto", async () => {
    const store = criarStore();
    const receber = createReceberAnimalCompraService(store);
    const out = await receber(7, inputBase);
    const noGrupo = store.animais.filter(a => a.compraGrupoId === 9101).length;
    const naCompra = store.animais.filter(a => a.compraId === 9001).length;
    expect(noGrupo).toBe(1);
    expect(naCompra).toBe(1);
    expect(20 - noGrupo).toBe(19);
    expect(40 - naCompra).toBe(39);
    expect(out.statusCompra).toBe("concluido");
  });
});
