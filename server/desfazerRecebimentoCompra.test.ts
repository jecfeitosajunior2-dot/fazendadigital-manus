import { describe, expect, it } from "vitest";
import {
  MSG_BLOQUEIO_ESTORNO_RECEBIMENTO,
  MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO,
  MSG_ESTORNO_RECEBIMENTO_OBSERVACAO_OUTRO,
  type AnimalEstornoSnap,
  type RecebimentoEstornoSnap,
} from "../shared/compraRecebimentoEstorno";
import {
  createDesfazerRecebimentoCompraService,
  type DesfazerRecebimentoCompraStore,
  type DesfazerRecebimentoCompraTx,
} from "./desfazerRecebimentoCompra";

type RecebimentoMem = RecebimentoEstornoSnap & {
  motivoEstorno?: string | null;
  observacaoEstorno?: string | null;
  estornadoPorUserId?: number | null;
  estornadoEm?: Date | null;
};

type PesagemMem = { id: number; animalId: number; compraRecebimentoId: number | null; peso: string };
type MovMem = { id: number; animalId: number; compraRecebimentoId: number | null };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const animalBase: AnimalEstornoSnap = {
  id: 8801,
  userId: 7,
  status: "ativo",
  brinco: "810",
  brincoEletronico: null,
  loteId: null,
  pastoId: null,
  sexo: "macho",
  categoria: "Bezerro",
  compraId: 9001,
  compraGrupoId: 9101,
  castrado: null,
  dataDesmama: null,
  pesoAtual: null,
};

const recebimentoBase: RecebimentoMem = {
  id: 7701,
  userId: 7,
  compraId: 9001,
  compraGrupoId: 9101,
  animalId: 8801,
  brincoVisual: "810",
  rfid: null,
  sexo: "macho",
  categoria: "Bezerro",
  pesoRecebimento: null,
  loteDestinoId: null,
  pastoDestinoId: null,
  status: "confirmado",
};

function criarStore(seed?: {
  animais?: AnimalEstornoSnap[];
  recebimentos?: RecebimentoMem[];
  pesagens?: PesagemMem[];
  movimentacoes?: MovMem[];
  historicoBrincos?: number[];
  saude?: number[];
  reproFemea?: number[];
  reproMacho?: number[];
  filhosMae?: number[];
  filhosPai?: number[];
  partoCrias?: number[];
  semen?: number[];
  baixas?: number[];
  vendaItens?: number[];
  compraUserId?: number;
  falharDeleteAnimal?: boolean;
  inserirPesagemAposLock?: boolean;
}): DesfazerRecebimentoCompraStore & {
  animais: AnimalEstornoSnap[];
  recebimentos: RecebimentoMem[];
  pesagens: PesagemMem[];
  movimentacoes: MovMem[];
} {
  const state = {
    compras: [{ id: 9001, userId: seed?.compraUserId ?? 7, status: "concluido" }],
    grupos: [{ id: 9101, userId: 7, compraId: 9001 }],
    animais: clone(seed?.animais ?? [animalBase]),
    recebimentos: clone(seed?.recebimentos ?? [recebimentoBase]),
    pesagens: clone(seed?.pesagens ?? []),
    movimentacoes: clone(seed?.movimentacoes ?? []),
    historicoBrincos: new Set(seed?.historicoBrincos ?? []),
    saude: new Set(seed?.saude ?? []),
    reproFemea: new Set(seed?.reproFemea ?? []),
    reproMacho: new Set(seed?.reproMacho ?? []),
    filhosMae: new Set(seed?.filhosMae ?? []),
    filhosPai: new Set(seed?.filhosPai ?? []),
    partoCrias: new Set(seed?.partoCrias ?? []),
    semen: new Set(seed?.semen ?? []),
    baixas: new Set(seed?.baixas ?? []),
    vendaItens: new Set(seed?.vendaItens ?? []),
    nextPesagem: 50,
    lock: Promise.resolve(),
  };

  const tx: DesfazerRecebimentoCompraTx = {
    async lockRecebimento(userId, recebimentoId) {
      return state.recebimentos.find(r => r.id === recebimentoId && r.userId === userId) ?? null;
    },
    async lockAnimal(userId, animalId) {
      if (seed?.inserirPesagemAposLock) {
        state.pesagens.push({
          id: state.nextPesagem++,
          animalId,
          compraRecebimentoId: null,
          peso: "199",
        });
      }
      return state.animais.find(a => a.id === animalId && a.userId === userId) ?? null;
    },
    async lockGrupo(userId, compraId, grupoId) {
      return (
        state.grupos.find(g => g.id === grupoId && g.userId === userId && g.compraId === compraId) ??
        null
      );
    },
    async getCompra(userId, compraId) {
      return state.compras.find(c => c.id === compraId && c.userId === userId) ?? null;
    },
    async listPesagens(_userId, animalId) {
      return state.pesagens.filter(p => p.animalId === animalId);
    },
    async listMovimentacoes(_userId, animalId) {
      return state.movimentacoes.filter(m => m.animalId === animalId);
    },
    async temHistoricoBrincos(_u, animalId) {
      return state.historicoBrincos.has(animalId);
    },
    async temSaude(_u, animalId) {
      return state.saude.has(animalId);
    },
    async temReproducaoFemea(_u, animalId) {
      return state.reproFemea.has(animalId);
    },
    async temReproducaoMacho(_u, animalId) {
      return state.reproMacho.has(animalId);
    },
    async temFilhoComoMae(_u, animalId) {
      return state.filhosMae.has(animalId);
    },
    async temFilhoComoPai(_u, animalId) {
      return state.filhosPai.has(animalId);
    },
    async temPartoCria(_u, animalId) {
      return state.partoCrias.has(animalId);
    },
    async temSemenPartida(_u, animalId) {
      return state.semen.has(animalId);
    },
    async temBaixa(_u, animalId) {
      return state.baixas.has(animalId);
    },
    async temVendaItem(_u, animalId) {
      return state.vendaItens.has(animalId);
    },
    async deletePesagensDoRecebimento(_u, recebimentoId, animalId) {
      state.pesagens = state.pesagens.filter(
        p => !(p.animalId === animalId && p.compraRecebimentoId === recebimentoId),
      );
    },
    async deleteMovimentacoesDoRecebimento(_u, recebimentoId, animalId) {
      state.movimentacoes = state.movimentacoes.filter(
        m => !(m.animalId === animalId && m.compraRecebimentoId === recebimentoId),
      );
    },
    async deleteAnimal(_u, animalId) {
      if (seed?.falharDeleteAnimal) throw new Error("falha delete animal");
      state.animais = state.animais.filter(a => a.id !== animalId);
    },
    async marcarRecebimentoEstornado(row) {
      const rec = state.recebimentos.find(r => r.id === row.recebimentoId && r.userId === row.userId);
      if (!rec) throw new Error("recebimento ausente");
      rec.status = "estornado";
      rec.motivoEstorno = row.motivo;
      rec.observacaoEstorno = row.observacao;
      rec.estornadoPorUserId = row.estornadoPorUserId;
      rec.estornadoEm = row.estornadoEm;
    },
  };

  const store: DesfazerRecebimentoCompraStore = {
    async transaction(fn) {
      const run = state.lock.then(async () => {
        const snap = {
          animais: clone(state.animais),
          recebimentos: clone(state.recebimentos),
          pesagens: clone(state.pesagens),
          movimentacoes: clone(state.movimentacoes),
        };
        try {
          return await fn(tx);
        } catch (error) {
          state.animais = snap.animais;
          state.recebimentos = snap.recebimentos;
          state.pesagens = snap.pesagens;
          state.movimentacoes = snap.movimentacoes;
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
    get recebimentos() {
      return state.recebimentos;
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
  recebimentoId: 7701,
  motivo: "lancamento_incorreto" as const,
};

function snapshotIntacto(store: ReturnType<typeof criarStore>) {
  expect(store.animais).toHaveLength(1);
  expect(store.recebimentos[0]?.status).toBe("confirmado");
  expect(store.recebimentos[0]?.motivoEstorno).toBeUndefined();
}

describe("desfazerRecebimentoCompra", () => {
  it("estorna recebimento limpo sem peso", async () => {
    const store = criarStore();
    const out = await createDesfazerRecebimentoCompraService(store)(7, inputBase);
    expect(out).toMatchObject({
      success: true,
      recebimentoId: 7701,
      animalId: 8801,
      compraId: 9001,
      status: "estornado",
      motivo: "lancamento_incorreto",
    });
    expect(store.animais).toHaveLength(0);
    expect(store.pesagens).toHaveLength(0);
    expect(store.movimentacoes).toHaveLength(0);
    expect(store.recebimentos).toHaveLength(1);
    expect(store.recebimentos[0]).toMatchObject({
      status: "estornado",
      animalId: 8801,
      brincoVisual: "810",
      pesoRecebimento: null,
      motivoEstorno: "lancamento_incorreto",
      estornadoPorUserId: 7,
    });
    expect(store.recebimentos[0]?.estornadoEm).toBeInstanceOf(Date);
  });

  it("remove pesagem estrutural e preserva snapshot de peso", async () => {
    const store = criarStore({
      animais: [{ ...animalBase, pesoAtual: "218" }],
      recebimentos: [{ ...recebimentoBase, pesoRecebimento: "218" }],
      pesagens: [{ id: 51, animalId: 8801, compraRecebimentoId: 7701, peso: "218" }],
    });
    await createDesfazerRecebimentoCompraService(store)(7, inputBase);
    expect(store.pesagens).toHaveLength(0);
    expect(store.animais).toHaveLength(0);
    expect(store.recebimentos[0]).toMatchObject({
      status: "estornado",
      pesoRecebimento: "218",
    });
  });

  it("remove movimentação inicial e preserva lote/pasto no snapshot", async () => {
    const store = criarStore({
      animais: [{ ...animalBase, loteId: 31, pastoId: 41 }],
      recebimentos: [{ ...recebimentoBase, loteDestinoId: 31, pastoDestinoId: 41 }],
      movimentacoes: [{ id: 61, animalId: 8801, compraRecebimentoId: 7701 }],
    });
    await createDesfazerRecebimentoCompraService(store)(7, inputBase);
    expect(store.movimentacoes).toHaveLength(0);
    expect(store.animais).toHaveLength(0);
    expect(store.recebimentos[0]).toMatchObject({
      status: "estornado",
      loteDestinoId: 31,
      pastoDestinoId: 41,
    });
  });

  it("aceita motivo outro com observação", async () => {
    const store = criarStore();
    const out = await createDesfazerRecebimentoCompraService(store)(7, {
      recebimentoId: 7701,
      motivo: "outro",
      observacao: "Brinco digitado duas vezes",
    });
    expect(out.observacao).toBe("Brinco digitado duas vezes");
    expect(store.recebimentos[0]?.observacaoEstorno).toBe("Brinco digitado duas vezes");
  });

  it("rejeita motivo outro sem observação", async () => {
    const store = criarStore();
    await expect(
      createDesfazerRecebimentoCompraService(store)(7, {
        recebimentoId: 7701,
        motivo: "outro",
        observacao: "  ",
      }),
    ).rejects.toMatchObject({ message: MSG_ESTORNO_RECEBIMENTO_OBSERVACAO_OUTRO });
    snapshotIntacto(store);
  });

  it("bloqueia pesagem posterior sem apagar nada", async () => {
    const store = criarStore({
      pesagens: [{ id: 52, animalId: 8801, compraRecebimentoId: null, peso: "199" }],
    });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.PESAGEM_POSTERIOR,
    });
    expect(store.pesagens).toHaveLength(1);
    snapshotIntacto(store);
  });

  it("bloqueia segunda movimentação sem apagar nada", async () => {
    const store = criarStore({
      animais: [{ ...animalBase, loteId: 31, pastoId: 41 }],
      recebimentos: [{ ...recebimentoBase, loteDestinoId: 31, pastoDestinoId: 41 }],
      movimentacoes: [
        { id: 61, animalId: 8801, compraRecebimentoId: 7701 },
        { id: 62, animalId: 8801, compraRecebimentoId: null },
      ],
    });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.MOVIMENTACAO_POSTERIOR,
    });
    expect(store.movimentacoes).toHaveLength(2);
    snapshotIntacto(store);
  });

  it("bloqueia localização alterada", async () => {
    const store = criarStore({ animais: [{ ...animalBase, loteId: 99 }] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.LOCALIZACAO_ALTERADA,
    });
    snapshotIntacto(store);
  });

  it("bloqueia histórico de brincos", async () => {
    const store = criarStore({ historicoBrincos: [8801] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.IDENTIFICACAO_ALTERADA,
    });
    snapshotIntacto(store);
  });

  it("bloqueia brinco diferente", async () => {
    const store = criarStore({ animais: [{ ...animalBase, brinco: "811" }] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.IDENTIFICACAO_ALTERADA,
    });
    snapshotIntacto(store);
  });

  it("bloqueia RFID diferente", async () => {
    const store = criarStore({
      recebimentos: [{ ...recebimentoBase, rfid: "TAG-810" }],
      animais: [{ ...animalBase, brincoEletronico: "OUTRO" }],
    });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.IDENTIFICACAO_ALTERADA,
    });
    snapshotIntacto(store);
  });

  it("bloqueia saúde", async () => {
    const store = criarStore({ saude: [8801] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.MANEJO_SANITARIO,
    });
    snapshotIntacto(store);
  });

  it("bloqueia castração", async () => {
    const store = criarStore({ animais: [{ ...animalBase, castrado: true }] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.MANEJO_SANITARIO,
    });
    snapshotIntacto(store);
  });

  it("bloqueia reprodução fêmea e macho", async () => {
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ reproFemea: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.MANEJO_REPRODUTIVO });
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ reproMacho: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.MANEJO_REPRODUTIVO });
  });

  it("bloqueia desmama", async () => {
    const store = criarStore({ animais: [{ ...animalBase, dataDesmama: "2026-08-01" }] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.MANEJO_REPRODUTIVO,
    });
    snapshotIntacto(store);
  });

  it("bloqueia genealogia e parto_crias", async () => {
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ filhosMae: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.GENEALOGIA_EXISTENTE });
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ filhosPai: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.GENEALOGIA_EXISTENTE });
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ partoCrias: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.GENEALOGIA_EXISTENTE });
  });

  it("bloqueia sêmen, baixa e venda", async () => {
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ semen: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.SEMEN_EXISTENTE });
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ baixas: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.BAIXA_EXISTENTE });
    await expect(
      createDesfazerRecebimentoCompraService(criarStore({ vendaItens: [8801] }))(7, inputBase),
    ).rejects.toMatchObject({ message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.VENDA_EXISTENTE });
  });

  it("bloqueia status vendido, morto e transferido", async () => {
    for (const status of ["vendido", "morto", "transferido"] as const) {
      const store = criarStore({ animais: [{ ...animalBase, status }] });
      await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
        message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.STATUS_INCOMPATIVEL,
      });
      snapshotIntacto(store);
    }
  });

  it("bloqueia recebimento já estornado", async () => {
    const store = criarStore({
      recebimentos: [{ ...recebimentoBase, status: "estornado" }],
    });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.RECEBIMENTO_JA_ESTORNADO,
    });
    expect(store.animais).toHaveLength(1);
  });

  it("não revela recebimento de outro usuário", async () => {
    const store = criarStore();
    await expect(createDesfazerRecebimentoCompraService(store)(99, inputBase)).rejects.toMatchObject({
      message: MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO,
    });
    snapshotIntacto(store);
  });

  it("bloqueia inconsistência entre recebimento e animal", async () => {
    const store = criarStore({ animais: [{ ...animalBase, compraId: 9002 }] });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.INCONSISTENCIA_DADOS,
    });
    snapshotIntacto(store);
  });

  it("revalida elegibilidade depois dos locks", async () => {
    const store = criarStore({ inserirPesagemAposLock: true });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toMatchObject({
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.PESAGEM_POSTERIOR,
    });
    snapshotIntacto(store);
  });

  it("faz rollback se falhar depois de remover a pesagem", async () => {
    const store = criarStore({
      animais: [{ ...animalBase, pesoAtual: "218" }],
      recebimentos: [{ ...recebimentoBase, pesoRecebimento: "218" }],
      pesagens: [{ id: 51, animalId: 8801, compraRecebimentoId: 7701, peso: "218" }],
      movimentacoes: [],
      falharDeleteAnimal: true,
    });
    await expect(createDesfazerRecebimentoCompraService(store)(7, inputBase)).rejects.toThrow(
      /falha delete animal/,
    );
    expect(store.pesagens).toHaveLength(1);
    expect(store.animais).toHaveLength(1);
    expect(store.recebimentos[0]?.status).toBe("confirmado");
  });

  it("duas confirmações simultâneas: só uma estorna", async () => {
    const store = criarStore();
    const desfazer = createDesfazerRecebimentoCompraService(store);
    const [a, b] = await Promise.allSettled([desfazer(7, inputBase), desfazer(7, inputBase)]);
    const ok = [a, b].filter(r => r.status === "fulfilled");
    const fail = [a, b].filter(r => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(store.animais).toHaveLength(0);
    expect(store.recebimentos[0]?.status).toBe("estornado");
  });

  it("não usa fixtures da Compra 1 nem dos animais 998/999", () => {
    expect(JSON.stringify(recebimentoBase)).not.toContain('"compraId":1');
    expect(JSON.stringify(animalBase)).not.toMatch(/998|999/);
  });
});
