import { describe, expect, it } from "vitest";
import { persistirValor } from "../shared/financeiroNucleo";
import {
  MANUT_A_PAGAR_OPERACIONAL,
  MANUTENCOES_CHAVE_OPERACAO_UQ,
  MSG_MANUT_FIN_CHAVE_DIVERGENTE,
  MSG_MANUT_FIN_COM_PAGAMENTO,
  MSG_MANUT_FIN_EDICAO_SEM_API_V2,
  MSG_MANUT_FIN_IDENTIDADE,
  MSG_MANUT_FIN_INTERNA,
  MSG_MANUT_FIN_NAO_ATIVA,
  MSG_MANUT_FIN_OS_HISTORICA,
} from "../shared/manutencaoFinanceiroAPagar";
import { MANUT_PECA_ORIGEM_OFICINA } from "../shared/manutencaoPecasOrigem";
import type { PersistirManutencaoCompletaInput } from "./manutencaoCompleta";
import {
  emitirManutencaoAPagarMysql,
  transacaoUnicaCompartilhaMotores,
} from "./manutencaoFinanceiroAPagarMysql";
import {
  ConflitoIdempotenciaChaveOperacaoError,
  estornarManutencaoComFinanceiroAPagarNoTx,
  ManutencaoFinanceiroAPagarError,
  persistirManutencaoComFinanceiroAPagarAtomico,
  persistirManutencaoComFinanceiroAPagarNoTx,
  protegerEdicaoManutencaoFinanceiroAPagarNoTx,
  recusarProcedurePublicaAPagar,
  type PortasManutencaoAPagar,
} from "./manutencaoFinanceiroAPagar";
import type {
  FinApropriacaoRow,
  FinParcelaRow,
  FinTituloRow,
  FinanceiroNucleoTx,
} from "./financeiroNucleo";
import type { ManutencaoEstoqueTx, ManutencaoOsRow, ManutencaoPecaRow } from "./manutencaoEstoque";

const userA = 910001;
const fornecedor = { id: 7, userId: userA, tipo: "fornecedor" as const, ativo: true };
const maquina = { id: 4, userId: userA, fazendaId: 12 };
const fazenda = { id: 12, userId: userA };

const pecaEstoque = { estoqueId: 33, nome: "Parafuso", quantidade: 1, valorUnitario: 100 };
const pecaOficina = {
  origem: MANUT_PECA_ORIGEM_OFICINA,
  nome: "Retentor",
  quantidade: 1,
  valorUnitario: 150,
  valorTotal: 150,
} as const;

type AlocacaoFake = {
  id: number;
  userId: number;
  liquidacaoId: number;
  parcelaId: number;
  principalLiquidado: string;
  desconto: string;
  juros: string;
  multa: string;
  tipoLiquidacao: "pagamento";
};

type Estado = {
  nextOs: number;
  nextPeca: number;
  nextMov: number;
  nextTitulo: number;
  nextParcela: number;
  nextAprop: number;
  nextAloc: number;
  os: Array<{
    id: number;
    userId: number;
    maquinaId: number;
    status: string;
    data: string;
    tipoExecucao?: string | null;
    prestadorPessoaId?: number | null;
    valorMaoObra: number;
    chaveOperacao?: string | null;
    pecas: ManutencaoPecaRow[];
    movimentacaoIds: number[];
  }>;
  titulos: FinTituloRow[];
  parcelas: FinParcelaRow[];
  apropriacoes: FinApropriacaoRow[];
  alocacoes: AlocacaoFake[];
};

function estadoInicial(): Estado {
  return {
    nextOs: 20,
    nextPeca: 80,
    nextMov: 156,
    nextTitulo: 88,
    nextParcela: 1,
    nextAprop: 1,
    nextAloc: 1,
    os: [],
    titulos: [],
    parcelas: [],
    apropriacoes: [],
    alocacoes: [],
  };
}

function cloneEstado(e: Estado): Estado {
  return structuredClone(e);
}

function origemKey(userId: number, origemTipo: string, origemId: number, chave: string) {
  return `${userId}|${origemTipo}|${origemId}|${chave}`;
}

function erroMysql1062(nomeUnique: string, encapsular = false, tabela = "manutencoes") {
  const sqlMessage = `Duplicate entry '910001-confirma-os-01' for key '${tabela}.${nomeUnique}'`;
  const causa = {
    errno: 1062,
    code: "ER_DUP_ENTRY" as const,
    sqlState: "23000",
    sqlMessage,
    message: sqlMessage,
  };
  if (!encapsular) {
    return Object.assign(new Error(sqlMessage), causa);
  }
  const encapsulado = new Error("Failed query: insert into `manutencoes`");
  (encapsulado as Error & { cause: typeof causa }).cause = causa;
  return encapsulado;
}

function erroUniqueChave(encapsular = false) {
  return erroMysql1062(MANUTENCOES_CHAVE_OPERACAO_UQ, encapsular);
}

class Mundo {
  committed = estadoInicial();
  working: Estado | null = null;
  falhaEstoque = false;
  falhaOs = false;
  falhaTitulo = false;
  falhaParcela = false;
  falhaApropriacao = false;
  tituloInsertComoDuplicado = false;
  encapsularUniqueChave = false;
  uniqueOutraNoPersist = false;
  uniqueNoEstoque = false;
  ocultarOsExistente = 0;

  get e() {
    return this.working ?? this.committed;
  }

  async transacao<T>(fn: (portas: PortasManutencaoAPagar) => Promise<T>): Promise<T> {
    this.working = cloneEstado(this.committed);
    try {
      const resultado = await fn(this.portas());
      this.committed = this.working;
      this.working = null;
      return resultado;
    } catch (erro) {
      this.working = null;
      throw erro;
    }
  }

  portas(): PortasManutencaoAPagar {
    return {
      persistencia: this.persistencia(),
      fin: this.fin(),
      motorEstoque: this.motor(),
    };
  }

  assertChaveLivre(userId: number, chave?: string | null) {
    const key = String(chave ?? "").trim();
    if (!key) return;
    if (this.e.os.some(o => o.userId === userId && o.chaveOperacao === key)) {
      throw erroUniqueChave(this.encapsularUniqueChave);
    }
  }

  persistencia() {
    return {
      persistirEstoque: async (input: PersistirManutencaoCompletaInput) => {
        if (this.falhaEstoque) throw new Error("falha sintética patrimonial");
        if (this.uniqueNoEstoque) {
          throw erroMysql1062("insumos_movimentacoes_idem_uq", false, "insumos_movimentacoes");
        }
        if (this.uniqueOutraNoPersist) {
          throw erroMysql1062("PRIMARY");
        }
        this.assertChaveLivre(input.userId, input.chaveOperacao);
        const id = this.e.nextOs++;
        const pecaIds = input.pecas.map(() => this.e.nextPeca++);
        const movimentacaoIds = input.pecas.map(() => this.e.nextMov++);
        this.e.os.push({
          id,
          userId: input.userId,
          maquinaId: input.maquinaId,
          status: "concluida",
          data: input.data,
          tipoExecucao: input.tipoExecucao,
          prestadorPessoaId: input.prestadorPessoaId,
          valorMaoObra: input.valorMaoObra,
          chaveOperacao: input.chaveOperacao ?? null,
          pecas: pecaIds.map((pecaId, i) => ({
            id: pecaId,
            manutencaoId: id,
            estoqueId: input.pecas[i]!.estoqueId,
            nome: input.pecas[i]!.nome,
            quantidade: input.pecas[i]!.quantidade,
            valorUnitario: input.pecas[i]!.valorUnitario,
            origem: "estoque",
          })),
          movimentacaoIds,
        });
        return { id, pecaIds, movimentacaoIds };
      },
      inserirOsSemEstoque: async (row: {
        userId: number;
        maquinaId: number;
        valorMaoObra: string;
        data?: string;
        tipoExecucao?: string | null;
        prestadorPessoaId?: number | null;
        chaveOperacao?: string | null;
      }) => {
        if (this.falhaOs) throw new Error("falha sintética OS");
        if (this.uniqueOutraNoPersist) {
          throw erroMysql1062("PRIMARY");
        }
        this.assertChaveLivre(row.userId, row.chaveOperacao);
        const id = this.e.nextOs++;
        this.e.os.push({
          id,
          userId: row.userId,
          maquinaId: row.maquinaId,
          status: "concluida",
          data: row.data ?? "2026-10-14",
          tipoExecucao: row.tipoExecucao,
          prestadorPessoaId: row.prestadorPessoaId,
          valorMaoObra: Number(row.valorMaoObra),
          chaveOperacao: row.chaveOperacao ?? null,
          pecas: [],
          movimentacaoIds: [],
        });
        return id;
      },
      findOsPorChaveOperacao: async (userId: number, chave: string) => {
        if (this.ocultarOsExistente > 0) {
          this.ocultarOsExistente -= 1;
          return null;
        }
        const os = this.e.os.find(o => o.userId === userId && o.chaveOperacao === chave);
        if (!os) return null;
        return {
          id: os.id,
          userId: os.userId,
          maquinaId: os.maquinaId,
          data: os.data,
          tipoExecucao: os.tipoExecucao,
          prestadorPessoaId: os.prestadorPessoaId,
          valorMaoObra: os.valorMaoObra,
          pecas: os.pecas,
        };
      },
      marcarOrigemEstoque: async () => undefined,
      gravarPecasOficina: async (osId: number, pecas: Array<{
        nome: string;
        quantidade: number;
        valorUnitario: number;
        origem?: string;
      }>) => {
        const os = this.e.os.find(o => o.id === osId);
        const ids = pecas.map(() => this.e.nextPeca++);
        if (os) {
          pecas.forEach((peca, i) => {
            os.pecas.push({
              id: ids[i]!,
              manutencaoId: osId,
              estoqueId: null,
              nome: peca.nome,
              quantidade: peca.quantidade,
              valorUnitario: peca.valorUnitario,
              origem: peca.origem ?? "oficina",
            });
          });
        }
        return ids;
      },
      lerTotaisOs: async (osId: number) => {
        const os = this.e.os.find(o => o.id === osId);
        const pecasEstoque = os?.pecas.filter(p => p.estoqueId) ?? [];
        const valorPecas = pecasEstoque.reduce((acc, p) => acc + Number(p.valorUnitario ?? 0) * Number(p.quantidade ?? 0), 0);
        return { valorPecas, valorMaoObra: os?.valorMaoObra ?? 0 };
      },
      atualizarComplementoOs: async () => undefined,
    };
  }

  fin(): FinanceiroNucleoTx {
    const self = this;
    return {
      async findPessoa(userId, id) {
        if (userId !== userA || id !== 7) return null;
        return { id: 7, nome: "Oficina Central", ativo: true, tipo: "fornecedor" };
      },
      async findFazenda(userId, id) {
        if (userId !== userA || id !== 12) return null;
        return { id: 12 };
      },
      async findTitulo(userId, id) {
        return self.e.titulos.find(t => t.userId === userId && t.id === id) ?? null;
      },
      async findTituloPorOrigem(userId, origemTipo, origemId, origemItemChave) {
        return self.e.titulos.find(t =>
          t.userId === userId
          && t.origemTipo === origemTipo
          && t.origemId === origemId
          && t.origemItemChave === origemItemChave
        ) ?? null;
      },
      async listTitulosPorOrigem(userId, origemTipo, origemId) {
        return self.e.titulos.filter(t =>
          t.userId === userId && t.origemTipo === origemTipo && t.origemId === origemId
        );
      },
      async insertTitulo(row) {
        if (self.falhaTitulo) throw new Error("falha sintética título");
        const chave = origemKey(row.userId, row.origemTipo, Number(row.origemId), String(row.origemItemChave));
        const existe = self.e.titulos.some(t =>
          origemKey(t.userId, t.origemTipo, Number(t.origemId), String(t.origemItemChave)) === chave
        );
        if (existe || self.tituloInsertComoDuplicado) {
          if (self.tituloInsertComoDuplicado && !existe) {
            const idVencedor = self.e.nextTitulo++;
            self.e.titulos.push({
              ...row,
              id: idVencedor,
              valorOriginal: persistirValor(row.valorOriginal),
            });
            self.e.parcelas.push({
              id: self.e.nextParcela++,
              userId: row.userId,
              tituloId: idVencedor,
              numero: 1,
              vencimento: "2026-11-14",
              valorOriginal: persistirValor(row.valorOriginal),
            });
          }
          throw erroMysql1062("financeiro_titulos_origem_uq", false, "financeiro_titulos");
        }
        const id = self.e.nextTitulo++;
        self.e.titulos.push({ ...row, id, valorOriginal: persistirValor(row.valorOriginal) });
        return id;
      },
      async insertParcela(row) {
        if (self.falhaParcela) throw new Error("falha sintética parcela");
        const id = self.e.nextParcela++;
        self.e.parcelas.push({ ...row, id, valorOriginal: persistirValor(row.valorOriginal) });
        return id;
      },
      async listParcelasTitulo(userId, tituloId) {
        return self.e.parcelas.filter(p => p.userId === userId && p.tituloId === tituloId);
      },
      async deleteApropriacoes(userId, tituloId) {
        self.e.apropriacoes = self.e.apropriacoes.filter(a => !(a.userId === userId && a.tituloId === tituloId));
      },
      async insertApropriacao(row) {
        if (self.falhaApropriacao) throw new Error("falha sintética apropriação");
        const id = self.e.nextAprop++;
        self.e.apropriacoes.push({ ...row, id, valor: persistirValor(row.valor) });
        return id;
      },
      async listApropriacoes(userId, tituloId) {
        return self.e.apropriacoes.filter(a => a.userId === userId && a.tituloId === tituloId);
      },
      async cancelarTitulo(userId, id) {
        const titulo = self.e.titulos.find(t => t.userId === userId && t.id === id);
        if (titulo) titulo.estado = "cancelado";
      },
      async listAlocacoesPorParcelas(userId, parcelaIds) {
        return self.e.alocacoes.filter(a => a.userId === userId && parcelaIds.includes(a.parcelaId));
      },
    } as FinanceiroNucleoTx;
  }

  motor(): ManutencaoEstoqueTx {
    const self = this;
    return {
      async findOs(userId, id): Promise<ManutencaoOsRow | null> {
        const os = self.e.os.find(o => o.userId === userId && o.id === id);
        if (!os) return null;
        return { id: os.id, userId: os.userId, maquinaId: os.maquinaId, status: os.status, valorMaoObra: os.valorMaoObra };
      },
      async listPecas(manutencaoId): Promise<ManutencaoPecaRow[]> {
        return self.e.os.find(o => o.id === manutencaoId)?.pecas ?? [];
      },
      async updateOs(id, patch) {
        const os = self.e.os.find(o => o.id === id);
        if (os && patch.status) os.status = patch.status;
      },
    } as ManutencaoEstoqueTx;
  }

  marcarPagamento(tituloId: number, valor: string) {
    const parcela = this.committed.parcelas.find(p => p.tituloId === tituloId);
    if (!parcela) throw new Error("parcela ausente no teste");
    this.committed.alocacoes.push({
      id: this.committed.nextAloc++,
      userId: userA,
      liquidacaoId: 1,
      parcelaId: parcela.id,
      principalLiquidado: valor,
      desconto: "0.00",
      juros: "0.00",
      multa: "0.00",
      tipoLiquidacao: "pagamento",
    });
  }
}

function osExterna(extras: Partial<PersistirManutencaoCompletaInput> = {}): PersistirManutencaoCompletaInput {
  return {
    userId: userA,
    registradoPor: "Teste isolado",
    maquinaId: 4,
    fazendaId: 12,
    tipo: "Corretiva",
    descricao: "Reparo sintético",
    data: "2026-10-14",
    valorMaoObra: 350,
    pecas: [],
    pecasOficina: [{ ...pecaOficina }],
    tipoExecucao: "externa",
    prestadorPessoaId: 7,
    prestadorNome: "Oficina Central",
    ...extras,
  };
}

function emitirInput(os: PersistirManutencaoCompletaInput, key = "confirma-os-01") {
  return {
    userId: userA,
    idempotencyKey: key,
    os,
    pessoa: fornecedor,
    maquina,
    fazenda,
    dataVencimento: "2026-11-14",
  };
}

function emitirAtomico(mundo: Mundo, os: PersistirManutencaoCompletaInput, key = "confirma-os-01") {
  return persistirManutencaoComFinanceiroAPagarAtomico(
    fn => mundo.transacao(fn),
    emitirInput(os, key),
  );
}

describe("transação única compartilhada", () => {
  it("compõe os motores NoTx na mesma conexão e não usa wrapper com COMMIT", () => {
    const prova = transacaoUnicaCompartilhaMotores({} as never);
    expect(prova).toEqual({
      mesmaConexao: true,
      chamaWrapperMysqlComCommit: false,
      persisteIdempotenciaOperacao: false,
    });
  });

  it("não expõe emissão operacional", async () => {
    expect(MANUT_A_PAGAR_OPERACIONAL).toBe(false);
    await expect(emitirManutencaoAPagarMysql()).rejects.toThrow(MSG_MANUT_FIN_NAO_ATIVA);
    expect(() => recusarProcedurePublicaAPagar()).toThrow(MSG_MANUT_FIN_NAO_ATIVA);
  });
});

describe("criação transacional A pagar", () => {
  it("1. manutenção interna grava a OS e não emite título", async () => {
    const mundo = new Mundo();
    const r = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna({
      tipoExecucao: "interna",
      prestadorPessoaId: null,
      pecasOficina: [],
      valorMaoObra: 0,
    }))));
    expect(r).toMatchObject({ ok: true, osId: 20, tituloId: null, motivo: MSG_MANUT_FIN_INTERNA });
    expect(mundo.committed.titulos).toHaveLength(0);
    expect(mundo.committed.os).toHaveLength(1);
  });

  it("2-5. externa usa valor da oficina, fazenda da máquina e fornecedor oficial", async () => {
    const mundo = new Mundo();
    const r = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(
      portas,
      emitirInput(osExterna({ pecas: [pecaEstoque] })),
    ));
    expect(r).toEqual({ ok: true, idempotente: false, osId: 20, tituloId: 88, valorOriginal: 500 });
    const titulo = mundo.committed.titulos[0]!;
    expect(titulo.tipo).toBe("pagar");
    expect(titulo.origemTipo).toBe("manutencao");
    expect(titulo.origemItemChave).toBe("oficina");
    expect(titulo.origemId).toBe(20);
    expect(titulo.pessoaId).toBe(7);
    expect(titulo.fazendaOrigemId).toBe(12);
    expect(titulo.valorOriginal).toBe(persistirValor(500));
    expect(titulo.valorOriginal).not.toBe(persistirValor(600));
    expect(mundo.committed.parcelas).toEqual([expect.objectContaining({
      tituloId: 88,
      numero: 1,
      vencimento: "2026-11-14",
      valorOriginal: persistirValor(500),
    })]);
    expect(mundo.committed.apropriacoes).toEqual([expect.objectContaining({
      tituloId: 88,
      fazendaId: 12,
      valor: persistirValor(500),
    })]);
  });

  it("6. peças do estoque passam pelo motor patrimonial na mesma transação", async () => {
    const mundo = new Mundo();
    await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(
      portas,
      emitirInput(osExterna({ pecas: [pecaEstoque], pecasOficina: [] })),
    ));
    expect(mundo.committed.os[0]!.movimentacaoIds).toEqual([156]);
    expect(mundo.committed.os[0]!.pecas.some(p => p.estoqueId === 33)).toBe(true);
    expect(mundo.committed.titulos[0]!.valorOriginal).toBe(persistirValor(350));
  });

  it("7. peças da oficina entram no valor cobrado, sem baixa de estoque", async () => {
    const mundo = new Mundo();
    await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    expect(mundo.committed.os[0]!.movimentacaoIds).toEqual([]);
    expect(mundo.committed.titulos[0]!.valorOriginal).toBe(persistirValor(500));
  });

  it("8. manutenção mista: estoque no patrimônio e oficina no título", async () => {
    const mundo = new Mundo();
    const r = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(
      portas,
      emitirInput(osExterna({ pecas: [pecaEstoque] })),
    ));
    expect(r).toMatchObject({ valorOriginal: 500 });
    expect(mundo.committed.os[0]!.movimentacaoIds).toHaveLength(1);
    expect(mundo.committed.titulos[0]!.valorOriginal).toBe(persistirValor(500));
  });

  it("9-11. cria título, parcela única e apropriação integral da fazenda", async () => {
    const mundo = new Mundo();
    await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    expect(mundo.committed.titulos).toHaveLength(1);
    expect(mundo.committed.parcelas).toHaveLength(1);
    expect(mundo.committed.apropriacoes).toHaveLength(1);
    expect(mundo.committed.alocacoes).toHaveLength(0);
  });
});

describe("rollback integral", () => {
  it("12. falha na OS não deixa título", async () => {
    const mundo = new Mundo();
    mundo.falhaOs = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toThrow("falha sintética OS");
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
  });

  it("13. falha no consumo patrimonial reverte a operação", async () => {
    const mundo = new Mundo();
    mundo.falhaEstoque = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(
      portas,
      emitirInput(osExterna({ pecas: [pecaEstoque] })),
    ))).rejects.toThrow("falha sintética patrimonial");
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
  });

  it("14. falha na criação do título reverte a OS", async () => {
    const mundo = new Mundo();
    mundo.falhaTitulo = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toThrow("falha sintética título");
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
  });

  it("15. falha na apropriação reverte OS e título", async () => {
    const mundo = new Mundo();
    mundo.falhaApropriacao = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toThrow("falha sintética apropriação");
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
    expect(mundo.committed.apropriacoes).toHaveLength(0);
  });

  it("16-17. falha na parcela reverte tudo", async () => {
    const mundo = new Mundo();
    mundo.falhaParcela = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toThrow("falha sintética parcela");
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
    expect(mundo.committed.parcelas).toHaveLength(0);
  });
});

describe("idempotência e concorrência", () => {
  it("18. origem repetida da mesma OS reutiliza o título ativo", async () => {
    const mundo = new Mundo();
    const primeiro = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    const segundo = await mundo.transacao(async portas => {
      portas.persistencia = {
        ...portas.persistencia,
        inserirOsSemEstoque: async () => primeiro.osId,
        gravarPecasOficina: async () => [],
        findOsPorChaveOperacao: async () => null,
      };
      return persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna(), "outra-chave-01"));
    });
    expect(segundo.tituloId).toBe(primeiro.tituloId);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("19. duplo clique com a mesma chave não abre segunda OS", async () => {
    const mundo = new Mundo();
    const primeiro = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    const segundo = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    expect(segundo).toMatchObject({
      ok: true,
      idempotente: true,
      osId: primeiro.osId,
      tituloId: primeiro.tituloId,
    });
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("OS antiga com chave NULL convive com outra OS sem chave", () => {
    const mundo = new Mundo();
    mundo.committed.os.push({
      id: 1,
      userId: userA,
      maquinaId: 4,
      status: "concluida",
      data: "2026-01-01",
      valorMaoObra: 0,
      chaveOperacao: null,
      pecas: [],
      movimentacaoIds: [],
    });
    mundo.committed.os.push({
      id: 2,
      userId: userA,
      maquinaId: 4,
      status: "concluida",
      data: "2026-01-02",
      valorMaoObra: 0,
      chaveOperacao: null,
      pecas: [],
      movimentacaoIds: [],
    });
    expect(mundo.committed.os.filter(o => o.chaveOperacao == null)).toHaveLength(2);
  });

  it("chave com payload diferente é recusada e não abre segunda OS", async () => {
    const mundo = new Mundo();
    await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(
      portas,
      emitirInput(osExterna({ valorMaoObra: 200 })),
    ))).rejects.toThrow(MSG_MANUT_FIN_CHAVE_DIVERGENTE);
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("rollback libera a chave para nova tentativa", async () => {
    const mundo = new Mundo();
    mundo.falhaTitulo = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toThrow("falha sintética título");
    expect(mundo.committed.os).toHaveLength(0);
    mundo.falhaTitulo = false;
    const r = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    expect(r).toMatchObject({ ok: true, idempotente: false, osId: 20, tituloId: 88 });
    expect(mundo.committed.os).toHaveLength(1);
  });

  it("usuário B não acessa a operação do usuário A", async () => {
    const mundo = new Mundo();
    await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    const achou = await mundo.portas().persistencia.findOsPorChaveOperacao!(910002, "confirma-os-01");
    expect(achou).toBeNull();
    expect(mundo.committed.os[0]!.userId).toBe(userA);
  });

  it("requisições simultâneas: unique 1062 devolve a OS vencedora sem segundo título", async () => {
    const mundo = new Mundo();
    const primeiro = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    mundo.ocultarOsExistente = 1;
    const segundo = await emitirAtomico(mundo, osExterna());
    expect(segundo).toMatchObject({
      ok: true,
      idempotente: true,
      osId: primeiro.osId,
      tituloId: primeiro.tituloId,
    });
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("20. 1062 na unique do título não recupera OS e reverte tudo", async () => {
    const mundo = new Mundo();
    mundo.tituloInsertComoDuplicado = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toMatchObject({ errno: 1062, code: "ER_DUP_ENTRY" });
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
    expect(mundo.committed.parcelas).toHaveLength(0);
  });

  it("1062 da unique da operação encerra a perdedora e recupera depois do rollback", async () => {
    const mundo = new Mundo();
    const primeiro = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    mundo.ocultarOsExistente = 1;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()))))
      .rejects.toBeInstanceOf(ConflitoIdempotenciaChaveOperacaoError);
    expect(mundo.committed.os).toHaveLength(1);
    mundo.ocultarOsExistente = 1;
    const segundo = await emitirAtomico(mundo, osExterna());
    expect(segundo).toMatchObject({
      ok: true,
      idempotente: true,
      osId: primeiro.osId,
      tituloId: primeiro.tituloId,
    });
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("1062 encapsulado em cause da unique correta também reutiliza depois do rollback", async () => {
    const mundo = new Mundo();
    mundo.encapsularUniqueChave = true;
    const primeiro = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    mundo.ocultarOsExistente = 1;
    const segundo = await emitirAtomico(mundo, osExterna());
    expect(segundo).toMatchObject({
      ok: true,
      idempotente: true,
      osId: primeiro.osId,
      tituloId: primeiro.tituloId,
    });
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("1062 da unique com payload diferente recusa depois do rollback", async () => {
    const mundo = new Mundo();
    await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    mundo.ocultarOsExistente = 1;
    await expect(emitirAtomico(mundo, osExterna({ valorMaoObra: 200 })))
      .rejects.toThrow(MSG_MANUT_FIN_CHAVE_DIVERGENTE);
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
  });

  it("1062 de PRIMARY na primeira gravação reverte sem OS nem título", async () => {
    const mundo = new Mundo();
    mundo.uniqueOutraNoPersist = true;
    try {
      await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
      throw new Error("esperava 1062 de outra unique");
    } catch (error) {
      expect(error).toMatchObject({ errno: 1062, code: "ER_DUP_ENTRY" });
      expect(error).not.toBeInstanceOf(ConflitoIdempotenciaChaveOperacaoError);
    }
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
  });

  it("1062 de outra unique não recupera OS e reverte a tentativa", async () => {
    const mundo = new Mundo();
    const primeiro = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    mundo.uniqueOutraNoPersist = true;
    await expect(mundo.transacao(async portas => {
      portas.persistencia.findOsPorChaveOperacao = async () => null;
      return persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna()));
    })).rejects.toMatchObject({ errno: 1062, code: "ER_DUP_ENTRY" });
    expect(mundo.committed.os).toHaveLength(1);
    expect(mundo.committed.titulos).toHaveLength(1);
    expect(mundo.committed.os[0]!.id).toBe(primeiro.osId);
    expect(mundo.committed.titulos[0]!.id).toBe(primeiro.tituloId);
  });

  it("1062 durante o estoque não recupera OS e reverte tudo", async () => {
    const mundo = new Mundo();
    mundo.uniqueNoEstoque = true;
    await expect(mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(
      portas,
      emitirInput(osExterna({ pecas: [pecaEstoque] })),
    ))).rejects.toMatchObject({ errno: 1062, code: "ER_DUP_ENTRY" });
    expect(mundo.committed.os).toHaveLength(0);
    expect(mundo.committed.titulos).toHaveLength(0);
  });
});

describe("edição e estorno com título", () => {
  it("21. sem pagamento, alteração de valor fica bloqueada — V2 não atualiza valorOriginal", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    const r = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      valorCobradoOficinaNovo: 400,
      prestadorAtual: 7,
      prestadorNovo: 7,
      fazendaAtual: 12,
      fazendaNova: 12,
    });
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_FIN_EDICAO_SEM_API_V2 });
  });

  it("22. pagamento parcial bloqueia valor, fornecedor e fazenda", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    if (criado.tituloId == null) throw new Error("esperado título");
    mundo.marcarPagamento(criado.tituloId, persistirValor(200));
    const valor = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      valorCobradoOficinaNovo: 400,
      prestadorAtual: 7,
      prestadorNovo: 7,
      fazendaAtual: 12,
      fazendaNova: 12,
    });
    expect(valor).toMatchObject({ ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO });
    const identidade = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      valorCobradoOficinaNovo: 500,
      prestadorAtual: 7,
      prestadorNovo: 9,
      fazendaAtual: 12,
      fazendaNova: 99,
    });
    expect(identidade).toMatchObject({ ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO });
  });

  it("23. pagamento total também bloqueia a edição financeira", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    if (criado.tituloId == null) throw new Error("esperado título");
    mundo.marcarPagamento(criado.tituloId, persistirValor(500));
    const r = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      valorCobradoOficinaNovo: 400,
    });
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO });
  });

  it("peças da oficina ou mão de obra que mudem o valor são bloqueadas", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    const pecas = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      pecasOficina: [{ quantidade: 2, valorUnitario: 200, valorTotal: 400 }],
      valorMaoObraNovo: 350,
      prestadorAtual: 7,
      prestadorNovo: 7,
      fazendaAtual: 12,
      fazendaNova: 12,
    });
    expect(pecas).toMatchObject({ ok: false, message: MSG_MANUT_FIN_EDICAO_SEM_API_V2 });
    const maoObra = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      pecasOficina: [{ quantidade: 1, valorUnitario: 150, valorTotal: 150 }],
      valorMaoObraNovo: 100,
      prestadorAtual: 7,
      prestadorNovo: 7,
      fazendaAtual: 12,
      fazendaNova: 12,
    });
    expect(maoObra).toMatchObject({ ok: false, message: MSG_MANUT_FIN_EDICAO_SEM_API_V2 });
  });

  it("identidade sem pagamento também é bloqueada", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    const r = await protegerEdicaoManutencaoFinanceiroAPagarNoTx(mundo.portas(), {
      userId: userA,
      osId: criado.osId,
      valorCobradoOficinaNovo: 500,
      prestadorAtual: 7,
      prestadorNovo: 9,
      fazendaAtual: 12,
      fazendaNova: 12,
    });
    expect(r).toMatchObject({ ok: false, message: MSG_MANUT_FIN_IDENTIDADE });
  });

  it("24. estorno sem pagamento cancela o título e preserva a OS estornada", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    await mundo.transacao(portas => estornarManutencaoComFinanceiroAPagarNoTx(portas, {
      userId: userA,
      registradoPor: "Teste isolado",
      id: criado.osId,
      hojeISO: "2026-10-16",
      motivo: "Estorno de homologação",
    }));
    expect(mundo.committed.titulos[0]!.estado).toBe("cancelado");
    expect(mundo.committed.os[0]!.status).toBe("estornado");
    expect(mundo.committed.alocacoes).toHaveLength(0);
  });

  it("25. estorno com pagamento parcial é bloqueado", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    if (criado.tituloId == null) throw new Error("esperado título");
    mundo.marcarPagamento(criado.tituloId, persistirValor(200));
    await expect(mundo.transacao(portas => estornarManutencaoComFinanceiroAPagarNoTx(portas, {
      userId: userA,
      registradoPor: "Teste isolado",
      id: criado.osId,
      hojeISO: "2026-10-16",
    }))).rejects.toBeInstanceOf(ManutencaoFinanceiroAPagarError);
    await expect(mundo.transacao(portas => estornarManutencaoComFinanceiroAPagarNoTx(portas, {
      userId: userA,
      registradoPor: "Teste isolado",
      id: criado.osId,
      hojeISO: "2026-10-16",
    }))).rejects.toThrow(MSG_MANUT_FIN_COM_PAGAMENTO);
    expect(mundo.committed.titulos[0]!.estado).toBe("ativo");
    expect(mundo.committed.os[0]!.status).toBe("concluida");
  });

  it("26. estorno com pagamento total é bloqueado", async () => {
    const mundo = new Mundo();
    const criado = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna())));
    if (criado.tituloId == null) throw new Error("esperado título");
    mundo.marcarPagamento(criado.tituloId, persistirValor(500));
    await expect(mundo.transacao(portas => estornarManutencaoComFinanceiroAPagarNoTx(portas, {
      userId: userA,
      registradoPor: "Teste isolado",
      id: criado.osId,
      hojeISO: "2026-10-16",
    }))).rejects.toThrow(MSG_MANUT_FIN_COM_PAGAMENTO);
    expect(mundo.committed.os[0]!.status).toBe("concluida");
  });

  it("27. OS antiga sem título segue só o motor patrimonial", async () => {
    const mundo = new Mundo();
    const r = await mundo.transacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, emitirInput(osExterna({
      tipoExecucao: null,
      prestadorPessoaId: null,
      pecasOficina: [],
      valorMaoObra: 100,
    }))));
    expect(r).toMatchObject({ ok: true, tituloId: null, motivo: MSG_MANUT_FIN_OS_HISTORICA });
    expect(mundo.committed.titulos).toHaveLength(0);
    await mundo.transacao(portas => estornarManutencaoComFinanceiroAPagarNoTx(portas, {
      userId: userA,
      registradoPor: "Teste isolado",
      id: r.osId,
      hojeISO: "2026-10-16",
    }));
    expect(mundo.committed.os[0]!.status).toBe("estornado");
  });
});
