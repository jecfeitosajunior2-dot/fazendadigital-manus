import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySemenEntradaAgregacao,
  buildSemenReprodutorKey,
  deriveSemenStatus,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_STATUS_DISPONIVEL,
  SEMEN_STATUS_ESGOTADO,
  validateSemenEntradaInput,
} from "../shared/semenEstoque";

const USER_ID = 1;
const FAZENDA_ID = 1;
const OUTRA_FAZENDA = 2;

const macho7 = {
  id: 7,
  sexo: "macho" as const,
  brinco: "16",
  nome: "Touro Teste",
  categoria: "Boi",
  dataNascimento: "2020-01-01",
  status: "ativo",
  fazendaId: FAZENDA_ID,
};

vi.mock("./validateSemenMachoId", () => ({
  validateSemenMachoInterno: vi.fn(async (_userId: number, _fazendaId: number, machoId: number) => {
    if (machoId === 7) {
      return { machoId: 7, reprodutorTexto: "16 — Touro Teste" };
    }
    if (machoId === 8) {
      return { machoId: 8, reprodutorTexto: "20 — Outro Touro" };
    }
    throw new TRPCError({ code: "BAD_REQUEST", message: "Macho inválido." });
  }),
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: vi.fn(async (_userId: number, fazendaId: number) => {
    if (fazendaId !== FAZENDA_ID && fazendaId !== OUTRA_FAZENDA) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso." });
    }
  }),
}));

import {
  __resetSemenLocalStoreForTests,
  __seedSemenLocalStoreForTests,
  getSemenEntradaResumoLocal,
  getSemenPartidaByIdLocal,
  listSemenPartidasLocal,
  registrarEntradaSemenLocal,
} from "./semenEstoqueLocal";

function entradaInternaBase(overrides: Record<string, unknown> = {}) {
  return validateSemenEntradaInput({
    origemReprodutor: SEMEN_ORIGEM_INTERNO,
    machoId: 7,
    partida: "L23081",
    quantidadeDoses: 10,
    custoTotal: "500",
    dataEntrada: "2026-08-20",
    ...overrides,
  });
}

function entradaExternaBase(overrides: Record<string, unknown> = {}) {
  return validateSemenEntradaInput({
    origemReprodutor: SEMEN_ORIGEM_EXTERNO,
    reprodutorTexto: "GSC-7117",
    partida: "P-889",
    quantidadeDoses: 10,
    custoTotal: 500,
    dataEntrada: "2026-08-20",
    ...overrides,
  });
}

describe("validateSemenEntradaInput", () => {
  it("aceita interno válido", () => {
    const r = entradaInternaBase();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.machoId).toBe(7);
      expect(r.value.reprodutorKey).toBe("m:7");
      expect(r.value.custoUnitario).toBe("50.00");
    }
  });

  it("aceita externo válido", () => {
    const r = entradaExternaBase();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.machoId).toBeNull();
      expect(r.value.reprodutorKey).toBe("e:gsc-7117");
    }
  });

  it("partida vazia normaliza para Sem lote", () => {
    const r = validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: "X",
      partida: "  ",
      quantidadeDoses: 1,
      custoTotal: 10,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.partida).toBe("Sem lote");
  });

  it("exige quantidade inteira positiva", () => {
    expect(validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: "X",
      partida: "A",
      quantidadeDoses: 0,
      custoTotal: 10,
    }).ok).toBe(false);

    expect(validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: "X",
      partida: "A",
      quantidadeDoses: -5,
      custoTotal: 10,
    }).ok).toBe(false);

    expect(validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: "X",
      partida: "A",
      quantidadeDoses: 1.5,
      custoTotal: 10,
    }).ok).toBe(false);
  });

  it("exige custo válido", () => {
    expect(validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: "X",
      partida: "A",
      quantidadeDoses: 5,
      custoTotal: 0,
    }).ok).toBe(false);
  });

  it("aceita entrada sem observações", () => {
    const r = validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_EXTERNO,
      reprodutorTexto: "GSC-7117",
      partida: "P-16",
      quantidadeDoses: 20,
      custoTotal: "2000",
      dataEntrada: "2026-08-25",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.observacoes).toBeNull();
      expect(r.value.custoUnitario).toBe("100.00");
    }
  });
});

describe("buildSemenReprodutorKey — PK ≠ brinco", () => {
  it("touro id=7 brinco=16 usa machoId como chave", () => {
    expect(buildSemenReprodutorKey({ origem: SEMEN_ORIGEM_INTERNO, machoId: 7 })).toBe("m:7");
    expect(buildSemenReprodutorKey({ origem: SEMEN_ORIGEM_INTERNO, machoId: 7 })).not.toBe("m:16");
  });
});

describe("applySemenEntradaAgregacao — custo médio", () => {
  it("10 doses R$ 500 → saldo 10, custo R$ 50", () => {
    const r = applySemenEntradaAgregacao({
      saldoAnterior: 0,
      custoUnitarioAnterior: null,
      quantidadeEntrada: 10,
      custoTotalEntrada: 500,
    });
    expect(r.novoSaldo).toBe(10);
    expect(r.novoCustoUnitario).toBe("50.00");
    expect(r.status).toBe(SEMEN_STATUS_DISPONIVEL);
  });

  it("nova entrada na mesma partida recalcula custo médio", () => {
    const r = applySemenEntradaAgregacao({
      saldoAnterior: 10,
      custoUnitarioAnterior: "40.00",
      quantidadeEntrada: 10,
      custoTotalEntrada: 600,
    });
    expect(r.novoSaldo).toBe(20);
    expect(r.novoCustoUnitario).toBe("50.00");
  });
});

describe("deriveSemenStatus", () => {
  it("saldo > 0 disponível, saldo 0 esgotado", () => {
    expect(deriveSemenStatus(5)).toBe(SEMEN_STATUS_DISPONIVEL);
    expect(deriveSemenStatus(0)).toBe(SEMEN_STATUS_ESGOTADO);
  });
});

describe("registrarEntradaSemenLocal", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
  });

  it("registrarEntrada retorna movimentacaoId e saldo atual", async () => {
    const v = entradaInternaBase({ quantidadeDoses: 10, custoTotal: 1000 });
    if (!v.ok) throw new Error("validação falhou");

    const result = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v.value);
    expect(result.movimentacaoId).toBeGreaterThan(0);
    expect(result.partidaId).toBeGreaterThan(0);
    expect(result.movimentacaoId).not.toBeUndefined();
    expect(result.saldoAtual).toBe(10);
    expect(result.custoMedioAtual).toBe("100.00");
  });

  it("cria partida interna com machoId=7 (não brinco 16)", async () => {
    const validacao = entradaInternaBase();
    expect(validacao.ok).toBe(true);
    if (!validacao.ok) return;

    const result = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, validacao.value);
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, result.partidaId);

    expect(detalhe?.machoId).toBe(7);
    expect(detalhe?.machoId).not.toBe(16);
    expect(detalhe?.reprodutorDisplay).toContain("16");
    expect(detalhe?.saldoDoses).toBe(10);
    expect(detalhe?.custoUnitario).toBe("50.00");
    expect(detalhe?.movimentacoes).toHaveLength(1);
  });

  it("cria partida externa sem machoId", async () => {
    const validacao = entradaExternaBase();
    if (!validacao.ok) throw new Error("validação falhou");

    const result = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, validacao.value);
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, result.partidaId);

    expect(detalhe?.machoId).toBeNull();
    expect(detalhe?.reprodutorDisplay).toBe("GSC-7117");
    expect(detalhe?.partida).toBe("P-889");
  });

  it("agrega nova entrada na mesma partida com histórico de 2 movimentos", async () => {
    const v1 = entradaInternaBase({ quantidadeDoses: 10, custoTotal: 400 });
    const v2 = entradaInternaBase({ quantidadeDoses: 10, custoTotal: 600 });
    if (!v1.ok || !v2.ok) throw new Error("validação falhou");

    await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v1.value);
    const r2 = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v2.value);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, r2.partidaId);
    expect(detalhe?.saldoDoses).toBe(20);
    expect(detalhe?.custoUnitario).toBe("50.00");
    expect(detalhe?.movimentacoes).toHaveLength(2);
    expect(r2.novaEntrada).toBe(false);
  });

  it("agrega entradas sem partida informada na mesma linha Sem lote", async () => {
    const v1 = entradaInternaBase({ partida: "", quantidadeDoses: 5, custoTotal: 100 });
    const v2 = entradaInternaBase({ partida: "  ", quantidadeDoses: 5, custoTotal: 100 });
    if (!v1.ok || !v2.ok) throw new Error("validação falhou");
    expect(v1.value.partida).toBe("Sem lote");
    expect(v2.value.partida).toBe("Sem lote");

    const r1 = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v1.value);
    const r2 = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v2.value);

    expect(r1.partidaId).toBe(r2.partidaId);
    expect(r2.novaEntrada).toBe(false);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, r1.partidaId);
    expect(detalhe?.partida).toBe("Sem lote");
    expect(detalhe?.saldoDoses).toBe(10);
  });

  it("partidas diferentes do mesmo touro permanecem separadas", async () => {
    const vA = entradaInternaBase({ partida: "PART-A", quantidadeDoses: 5, custoTotal: 100 });
    const vB = entradaInternaBase({ partida: "PART-B", quantidadeDoses: 8, custoTotal: 200 });
    if (!vA.ok || !vB.ok) throw new Error("validação falhou");

    await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, vA.value);
    await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, vB.value);

    const lista = await listSemenPartidasLocal(USER_ID, { fazendaId: FAZENDA_ID });
    expect(lista).toHaveLength(2);
    expect(lista.map(p => p.partida).sort()).toEqual(["PART-A", "PART-B"]);
  });

  it("mesma partida em touros diferentes não se mistura", async () => {
    const vA = entradaInternaBase({ machoId: 7, partida: "001" });
    const vB = validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_INTERNO,
      machoId: 8,
      partida: "001",
      quantidadeDoses: 5,
      custoTotal: 250,
      dataEntrada: "2026-08-20",
    });
    if (!vA.ok || !vB.ok) throw new Error("validação falhou");

    await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, vA.value);
    await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, vB.value);

    const lista = await listSemenPartidasLocal(USER_ID, { fazendaId: FAZENDA_ID });
    expect(lista).toHaveLength(2);
    expect(lista.every(p => p.partida === "001")).toBe(true);
    expect(new Set(lista.map(p => p.machoId))).toEqual(new Set([7, 8]));
  });

  it("rejeita macho inválido no backend", async () => {
    const v = validateSemenEntradaInput({
      origemReprodutor: SEMEN_ORIGEM_INTERNO,
      machoId: 999,
      partida: "X",
      quantidadeDoses: 1,
      custoTotal: 10,
      dataEntrada: "2026-08-20",
    });
    if (!v.ok) throw new Error("validação falhou");

    await expect(registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v.value)).rejects.toThrow(
      "Macho inválido",
    );
  });

  it("partida esgotada continua visível na listagem", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        {
          id: 1,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          origemReprodutor: SEMEN_ORIGEM_EXTERNO,
          reprodutorKey: "e:teste",
          machoId: null,
          reprodutorTexto: "Teste",
          partida: "ESGOT",
          centralOrigem: null,
          saldoDoses: 0,
          custoUnitario: "30.00",
          status: SEMEN_STATUS_ESGOTADO,
          observacoes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      movimentacoes: [
        {
          id: 1,
          partidaId: 1,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          tipo: "ENTRADA",
          dataEntrada: "2026-01-01",
          quantidadeDoses: 5,
          custoTotal: "150.00",
          custoUnitario: "30.00",
          observacoes: "Nota histórica preservada",
          createdAt: new Date(),
        },
      ],
      nextPartidaId: 2,
      nextMovId: 2,
    });

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    expect(detalhe?.movimentacoes[0]?.observacoes).toBe("Nota histórica preservada");

    const todos = await listSemenPartidasLocal(USER_ID, { fazendaId: FAZENDA_ID });
    expect(todos).toHaveLength(1);
    expect(todos[0]?.status).toBe(SEMEN_STATUS_ESGOTADO);

    const disp = await listSemenPartidasLocal(USER_ID, {
      fazendaId: FAZENDA_ID,
      status: SEMEN_STATUS_DISPONIVEL,
    });
    expect(disp).toHaveLength(0);

    const esg = await listSemenPartidasLocal(USER_ID, {
      fazendaId: FAZENDA_ID,
      status: SEMEN_STATUS_ESGOTADO,
    });
    expect(esg).toHaveLength(1);
  });

  it("não expõe partidas de outro usuário", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        {
          id: 99,
          userId: 999,
          fazendaId: FAZENDA_ID,
          origemReprodutor: SEMEN_ORIGEM_EXTERNO,
          reprodutorKey: "e:outro",
          machoId: null,
          reprodutorTexto: "Outro user",
          partida: "X",
          centralOrigem: null,
          saldoDoses: 5,
          custoUnitario: "10.00",
          status: SEMEN_STATUS_DISPONIVEL,
          observacoes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      movimentacoes: [],
      nextPartidaId: 100,
      nextMovId: 1,
    });

    const lista = await listSemenPartidasLocal(USER_ID, { fazendaId: FAZENDA_ID });
    expect(lista).toHaveLength(0);
  });
});

describe("getSemenEntradaResumoLocal", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
  });

  it("retorna resumo da movimentação recém-criada", async () => {
    const v = entradaInternaBase({
      partida: "P-16",
      quantidadeDoses: 10,
      custoTotal: 1000,
      centralOrigem: "GE",
    });
    if (!v.ok) throw new Error("validação falhou");

    const { movimentacaoId } = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v.value);
    const resumo = await getSemenEntradaResumoLocal(USER_ID, movimentacaoId);

    expect(resumo).not.toBeNull();
    expect(resumo?.quantidadeDoses).toBe(10);
    expect(resumo?.custoTotal).toBe("1000.00");
    expect(resumo?.custoUnitario).toBe("100.00");
    expect(resumo?.reprodutorDisplay).toContain("16");
    expect(resumo?.partida).toBe("P-16");
    expect(resumo?.centralOrigem).toBe("GE");
    expect(resumo?.saldoAtual).toBe(10);
    expect(resumo?.custoMedioAtual).toBe("100.00");
  });

  it("externo funciona no resumo", async () => {
    const v = entradaExternaBase();
    if (!v.ok) throw new Error("validação falhou");

    const { movimentacaoId } = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v.value);
    const resumo = await getSemenEntradaResumoLocal(USER_ID, movimentacaoId);

    expect(resumo?.reprodutorDisplay).toBe("GSC-7117");
    expect(resumo?.partida).toBe("P-889");
  });

  it("sem lote mostra normalização no resumo", async () => {
    const v = entradaInternaBase({ partida: "" });
    if (!v.ok) throw new Error("validação falhou");

    const { movimentacaoId } = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v.value);
    const resumo = await getSemenEntradaResumoLocal(USER_ID, movimentacaoId);

    expect(resumo?.partida).toBe("Sem lote");
  });

  it("outro usuário não acessa movimentação", async () => {
    const v = entradaInternaBase();
    if (!v.ok) throw new Error("validação falhou");

    const { movimentacaoId } = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v.value);
    const resumo = await getSemenEntradaResumoLocal(999, movimentacaoId);

    expect(resumo).toBeNull();
  });

  it("agregação reflete saldo consolidado após segunda entrada", async () => {
    const v1 = entradaInternaBase({ quantidadeDoses: 5, custoTotal: 1000 });
    const v2 = entradaInternaBase({ quantidadeDoses: 10, custoTotal: 1000 });
    if (!v1.ok || !v2.ok) throw new Error("validação falhou");

    await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v1.value);
    const r2 = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, v2.value);

    const resumo = await getSemenEntradaResumoLocal(USER_ID, r2.movimentacaoId);
    expect(resumo?.quantidadeDoses).toBe(10);
    expect(resumo?.custoUnitario).toBe("100.00");
    expect(resumo?.saldoAtual).toBe(15);
    expect(resumo?.custoMedioAtual).toBe("133.33");
  });
});
