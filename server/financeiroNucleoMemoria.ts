import {
  createFinanceiroNucleoService,
  type FinAlocacaoRow,
  type FinApropriacaoRow,
  type FinCategoriaRow,
  type FinCentroRow,
  type FinContaRow,
  type FinLiquidacaoRow,
  type FinMovimentoRow,
  type FinParcelaRow,
  type FinTituloRow,
  type FinTransferenciaRow,
  type FinanceiroNucleoStore,
  type FinanceiroNucleoTx,
} from "./financeiroNucleo";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function erroMysql(errno: number, code: string, message: string, cause?: unknown) {
  const err = new Error(message);
  (err as { errno?: number; code?: string }).errno = errno;
  (err as { code?: string }).code = code;
  if (cause !== undefined) (err as { cause?: unknown }).cause = cause;
  return err;
}

export function criarStore(opts?: { deadlocksRestantes?: number }): FinanceiroNucleoStore & {
  contas: FinContaRow[];
  titulos: FinTituloRow[];
  parcelas: FinParcelaRow[];
  liquidacoes: FinLiquidacaoRow[];
  alocacoes: FinAlocacaoRow[];
  movimentos: FinMovimentoRow[];
  transferencias: FinTransferenciaRow[];
  apropriacoes: FinApropriacaoRow[];
  categorias: FinCategoriaRow[];
  centros: FinCentroRow[];
  transacoes: number;
} {
  const state = {
    pessoas: [
      { id: 1, userId: 10, nome: "Fornecedor A", ativo: true, tipo: "fornecedor" },
      { id: 2, userId: 10, nome: "Fornecedor B", ativo: true, tipo: "fornecedor" },
      { id: 3, userId: 99, nome: "Outro usuário", ativo: true, tipo: "fornecedor" },
    ],
    fazendas: [
      { id: 1, userId: 10 },
      { id: 2, userId: 10 },
    ],
    contas: [] as FinContaRow[],
    titulos: [] as FinTituloRow[],
    parcelas: [] as FinParcelaRow[],
    liquidacoes: [] as FinLiquidacaoRow[],
    alocacoes: [] as FinAlocacaoRow[],
    movimentos: [] as FinMovimentoRow[],
    transferencias: [] as FinTransferenciaRow[],
    apropriacoes: [] as FinApropriacaoRow[],
    categorias: [] as FinCategoriaRow[],
    centros: [] as FinCentroRow[],
    next: 1,
  };

  const id = () => state.next++;
  let deadlocksRestantes = Number(opts?.deadlocksRestantes ?? 0);
  let transacoes = 0;

  const talvezDeadlock = () => {
    if (deadlocksRestantes <= 0) return;
    deadlocksRestantes -= 1;
    throw erroMysql(1213, "ER_LOCK_DEADLOCK", "Deadlock found when trying to get lock");
  };

  const makeTx = (): FinanceiroNucleoTx => ({
    async findConta(userId, contaId) {
      return state.contas.find(c => c.id === contaId && c.userId === userId) ?? null;
    },
    async lockContas(userId, ids) {
      talvezDeadlock();
      return state.contas.filter(c => c.userId === userId && ids.includes(c.id)).sort((a, b) => a.id - b.id);
    },
    async lockTitulos(userId, ids) {
      talvezDeadlock();
      return state.titulos.filter(t => t.userId === userId && ids.includes(t.id)).sort((a, b) => a.id - b.id);
    },
    async lockParcelas(userId, ids) {
      return state.parcelas.filter(p => p.userId === userId && ids.includes(p.id)).sort((a, b) => a.id - b.id);
    },
    async lockLiquidacao(userId, liquidacaoId) {
      return state.liquidacoes.find(l => l.id === liquidacaoId && l.userId === userId) ?? null;
    },
    async lockTransferencia(userId, transfId) {
      return state.transferencias.find(t => t.id === transfId && t.userId === userId) ?? null;
    },
    async insertConta(row) {
      const created: FinContaRow = { ...row, id: id(), inativadaEm: null, motivoInativacao: null };
      state.contas.push(created);
      return created.id;
    },
    async updateContaInativa(userId, contaId, motivo, em) {
      const c = state.contas.find(x => x.id === contaId && x.userId === userId);
      if (c) {
        c.ativa = false;
        c.motivoInativacao = motivo;
        c.inativadaEm = em;
      }
    },
    async listContas(userId) {
      return state.contas.filter(c => c.userId === userId);
    },
    async listContasPorIds(userId, ids) {
      return state.contas.filter(c => c.userId === userId && ids.includes(c.id));
    },
    async countMovimentosConta(userId, contaId) {
      return state.movimentos.filter(m => m.userId === userId && m.contaId === contaId).length;
    },
    async listMovimentosConta(userId, contaId) {
      return state.movimentos.filter(m => m.userId === userId && m.contaId === contaId);
    },
    async findPessoa(userId, pessoaId) {
      return state.pessoas.find(p => p.id === pessoaId && p.userId === userId) ?? null;
    },
    async findFazenda(userId, fazendaId) {
      return state.fazendas.find(f => f.id === fazendaId && f.userId === userId) ?? null;
    },
    async findTitulo(userId, tituloId) {
      return state.titulos.find(t => t.id === tituloId && t.userId === userId) ?? null;
    },
    async findTituloPorOrigem(userId, origemTipo, origemId, origemItemChave) {
      return state.titulos.find(t =>
        t.userId === userId
        && t.origemTipo === origemTipo
        && t.origemId === origemId
        && t.origemItemChave === origemItemChave,
      ) ?? null;
    },
    async listTitulosPorOrigem(userId, origemTipo, origemId) {
      return state.titulos.filter(t =>
        t.userId === userId && t.origemTipo === origemTipo && t.origemId === origemId,
      );
    },
    async insertTitulo(row) {
      const created = { ...row, id: id() };
      state.titulos.push(created);
      return created.id;
    },
    async updateTituloCondicao(userId, tituloId, condicao) {
      const t = state.titulos.find(x => x.id === tituloId && x.userId === userId);
      if (t) t.condicaoStatus = condicao;
    },
    async cancelarTitulo(userId, tituloId, _motivo, _em) {
      const t = state.titulos.find(x => x.id === tituloId && x.userId === userId);
      if (t) t.estado = "cancelado";
    },
    async listTitulos(userId) {
      return state.titulos.filter(t => t.userId === userId);
    },
    async listParcelasTitulo(userId, tituloId) {
      return state.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
    },
    async listParcelasPorIds(userId, ids) {
      return state.parcelas.filter(p => p.userId === userId && ids.includes(p.id));
    },
    async insertParcela(row) {
      const created = { ...row, id: id() };
      state.parcelas.push(created);
      return created.id;
    },
    async deleteParcelasTitulo(userId, tituloId) {
      state.parcelas = state.parcelas.filter(p => !(p.userId === userId && p.tituloId === tituloId));
    },
    async findLiquidacao(userId, liquidacaoId) {
      return state.liquidacoes.find(l => l.id === liquidacaoId && l.userId === userId) ?? null;
    },
    async listLiquidacoesPorIds(userId, ids) {
      return state.liquidacoes.filter(l => l.userId === userId && ids.includes(l.id));
    },
    async findLiquidacaoPorIdem(userId, key) {
      return state.liquidacoes.find(l => l.userId === userId && l.idempotencyKey === key) ?? null;
    },
    async findEstornoDe(userId, originalId) {
      return state.liquidacoes.find(l => l.userId === userId && l.liquidacaoOriginalId === originalId) ?? null;
    },
    async insertLiquidacao(row) {
      if (state.liquidacoes.some(l => l.userId === row.userId && l.idempotencyKey === row.idempotencyKey)) {
        throw erroMysql(1062, "ER_DUP_ENTRY", "Duplicate entry for key 'financeiro_liquidacoes.financeiro_liquidacoes_idem_uq'");
      }
      if (row.liquidacaoOriginalId != null
        && state.liquidacoes.some(l => l.liquidacaoOriginalId === row.liquidacaoOriginalId)) {
        throw erroMysql(1062, "ER_DUP_ENTRY", "Duplicate entry for key 'financeiro_liquidacoes.financeiro_liquidacoes_original_uq'");
      }
      const created = { ...row, id: id() };
      state.liquidacoes.push(created);
      return created.id;
    },
    async insertAlocacao(row) {
      const created = { ...row, id: id() };
      state.alocacoes.push(created);
      return created.id;
    },
    async listAlocacoesPorParcelas(userId, parcelaIds) {
      return state.alocacoes
        .filter(a => a.userId === userId && parcelaIds.includes(a.parcelaId))
        .map(a => {
          const liq = state.liquidacoes.find(l => l.id === a.liquidacaoId)!;
          return { ...a, tipoLiquidacao: liq.tipo };
        });
    },
    async listAlocacoesLiquidacao(userId, liquidacaoId) {
      return state.alocacoes.filter(a => a.userId === userId && a.liquidacaoId === liquidacaoId);
    },
    async insertMovimento(row) {
      const created = { ...row, id: id() };
      state.movimentos.push(created);
      return created.id;
    },
    async findMovimentoPorLiquidacao(userId, liquidacaoId) {
      return state.movimentos.find(m => m.userId === userId && m.liquidacaoId === liquidacaoId) ?? null;
    },
    async lockMovimentoPorLiquidacao(userId, liquidacaoId) {
      return state.movimentos.find(m => m.userId === userId && m.liquidacaoId === liquidacaoId) ?? null;
    },
    async listMovimentosPorTransferencia(userId, transferenciaId) {
      return state.movimentos.filter(m => m.userId === userId && m.transferenciaId === transferenciaId);
    },
    async listMovimentosFiltro(userId, contaId, de, ate) {
      return state.movimentos.filter(m => {
        if (m.userId !== userId || m.contaId !== contaId) return false;
        if (de && m.dataMovimento < de) return false;
        if (ate && m.dataMovimento > ate) return false;
        return true;
      });
    },
    async findTransferencia(userId, transfId) {
      return state.transferencias.find(t => t.id === transfId && t.userId === userId) ?? null;
    },
    async findTransferenciaPorIdem(userId, key) {
      return state.transferencias.find(t => t.userId === userId && t.idempotencyKey === key) ?? null;
    },
    async findEstornoTransferencia(userId, originalId) {
      return state.transferencias.find(t => t.userId === userId && t.transferenciaOriginalId === originalId) ?? null;
    },
    async insertTransferencia(row) {
      const created = { ...row, id: id() };
      state.transferencias.push(created);
      return created.id;
    },
    async marcarTransferenciaEstornada(userId, transfId) {
      const t = state.transferencias.find(x => x.id === transfId && x.userId === userId);
      if (t) t.estado = "estornada";
    },
    async listApropriacoes(userId, tituloId) {
      return state.apropriacoes.filter(a => a.userId === userId && a.tituloId === tituloId);
    },
    async deleteApropriacoes(userId, tituloId) {
      state.apropriacoes = state.apropriacoes.filter(a => !(a.userId === userId && a.tituloId === tituloId));
    },
    async insertApropriacao(row) {
      const created = { ...row, id: id() };
      state.apropriacoes.push(created);
      return created.id;
    },
    async findCategoria(userId, catId) {
      return state.categorias.find(c => c.id === catId && c.userId === userId) ?? null;
    },
    async findCategoriaPorChave(userId, chave) {
      return state.categorias.find(c => c.userId === userId && c.chaveSistema === chave) ?? null;
    },
    async insertCategoria(row) {
      const created = { ...row, id: id() };
      state.categorias.push(created);
      return created.id;
    },
    async updateCategoria(userId, catId, patch) {
      const c = state.categorias.find(x => x.id === catId && x.userId === userId);
      if (c) Object.assign(c, patch);
    },
    async listCategorias(userId) {
      return state.categorias.filter(c => c.userId === userId);
    },
    async findCentro(userId, centroId) {
      return state.centros.find(c => c.id === centroId && c.userId === userId) ?? null;
    },
    async insertCentro(row) {
      const created = { ...row, id: id() };
      state.centros.push(created);
      return created.id;
    },
    async updateCentro(userId, centroId, patch) {
      const c = state.centros.find(x => x.id === centroId && x.userId === userId);
      if (c) Object.assign(c, patch);
    },
    async listCentros(userId) {
      return state.centros.filter(c => c.userId === userId);
    },
  });

  return {
    get contas() { return state.contas; },
    get titulos() { return state.titulos; },
    get parcelas() { return state.parcelas; },
    get liquidacoes() { return state.liquidacoes; },
    get alocacoes() { return state.alocacoes; },
    get movimentos() { return state.movimentos; },
    get transferencias() { return state.transferencias; },
    get apropriacoes() { return state.apropriacoes; },
    get categorias() { return state.categorias; },
    get centros() { return state.centros; },
    get transacoes() { return transacoes; },
    async transaction(fn) {
      transacoes += 1;
      const snap = clone(state);
      try {
        return await fn(makeTx());
      } catch (error) {
        state.contas = snap.contas;
        state.titulos = snap.titulos;
        state.parcelas = snap.parcelas;
        state.liquidacoes = snap.liquidacoes;
        state.alocacoes = snap.alocacoes;
        state.movimentos = snap.movimentos;
        state.transferencias = snap.transferencias;
        state.apropriacoes = snap.apropriacoes;
        state.categorias = snap.categorias;
        state.centros = snap.centros;
        state.next = snap.next;
        throw error;
      }
    },
  };
}

export async function cenarioBase() {
  const store = criarStore();
  const svc = createFinanceiroNucleoService(store);
  const conta = await svc.criarContaFinanceira(10, {
    nome: "Caixa",
    tipo: "caixa",
    saldoAbertura: 50000,
    dataSaldoAbertura: "2026-01-01",
  });
  const titulo = await svc.criarTitulo(10, {
    tipo: "pagar",
    pessoaId: 1,
    descricao: "Compra teste",
    dataCompetencia: "2026-02-01",
    valorOriginal: 30000,
    parcelas: [
      { numero: 1, vencimento: "2026-03-01", valorOriginal: 10000 },
      { numero: 2, vencimento: "2026-04-01", valorOriginal: 10000 },
      { numero: 3, vencimento: "2026-05-01", valorOriginal: 10000 },
    ],
  });
  const detalhe = await svc.detalheTitulo(10, titulo.id);
  return { store, svc, contaId: conta.id, tituloId: titulo.id, parcelas: detalhe.parcelas };
}
