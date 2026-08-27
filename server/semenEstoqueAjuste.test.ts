import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_STATUS_DISPONIVEL,
} from "../shared/semenEstoque";
import {
  MSG_SEMEN_AJUSTE_SALDO_NEGATIVO,
  MSG_SEMEN_AJUSTE_SEM_ALTERACAO,
  MSG_SEMEN_AJUSTE_VALOR_NEGATIVO,
  MSG_SEMEN_AJUSTE_VALOR_ZERO,
  SEMEN_AJUSTE_MODO_AMBOS,
  SEMEN_AJUSTE_MODO_QUANTIDADE,
  SEMEN_AJUSTE_MODO_VALOR,
  SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
  evaluateSemenAjusteEstoque,
  packSemenAjusteObservacoes,
  unpackSemenAjusteObservacoes,
  buildSemenAjusteResumoTela,
} from "../shared/semenEstoqueAjuste";
import { MSG_SEMEN_CORRECAO_CONSUMO } from "../shared/semenEstoqueLedger";
import { calcularValorAtualEstoqueSemen } from "../shared/semenEstoqueValor";
import { buildSemenHistoricoVisual } from "../shared/semenMovimentacaoDisplay";
import { packReproObservacoes } from "../shared/reproRegistroMeta";

vi.mock("./validateSemenMachoId", () => ({
  validateSemenMachoInterno: vi.fn(async () => {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Macho inválido." });
  }),
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: vi.fn(async () => undefined),
}));

vi.mock("./localFallbackStore", () => ({
  createLocalReproducaoRegistro: vi.fn(async () => ({ id: 9001 })),
  listLocalReproducaoRegistros: vi.fn(async () => []),
  listLocalAnimais: vi.fn(async () => []),
}));

import {
  __resetSemenLocalStoreForTests,
  __seedSemenLocalStoreForTests,
  ajustarEstoqueSemenLocal,
  corrigirEntradaSemenLocal,
  getSemenPartidaByIdLocal,
  registrarInseminacaoComSemenLocal,
} from "./semenEstoqueLocal";

const USER_ID = 1;
const FAZENDA_ID = 1;

function packIaObs(
  observacoes: string | null | undefined,
  extras: { partidaSemen: string; inseminador?: string; ecc?: number; semenPartidaId: number; custoDoseSemen: number | null; centralOrigem?: string | null },
) {
  return packReproObservacoes(observacoes, undefined, undefined, undefined, undefined, {
    partidaSemen: extras.partidaSemen,
    inseminador: extras.inseminador,
    ecc: extras.ecc,
    semenPartidaId: extras.semenPartidaId,
    custoDoseSemen: extras.custoDoseSemen,
    centralOrigem: extras.centralOrigem,
  }) ?? null;
}

function seedPartidaComConsumo(overrides?: { saldo?: number; custo?: string; valorEntrada?: string }) {
  const saldo = overrides?.saldo ?? 6;
  const custo = overrides?.custo ?? "138.89";
  const valorEntrada = overrides?.valorEntrada ?? "1250.01";
  __seedSemenLocalStoreForTests({
    partidas: [
      {
        id: 1,
        userId: USER_ID,
        fazendaId: FAZENDA_ID,
        origemReprodutor: SEMEN_ORIGEM_EXTERNO,
        reprodutorKey: "e:ajuste teste",
        machoId: null,
        reprodutorTexto: "AJUSTE TESTE",
        partida: "P-AJU",
        centralOrigem: null,
        saldoDoses: saldo,
        custoUnitario: custo,
        status: SEMEN_STATUS_DISPONIVEL,
        observacoes: null,
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
        updatedAt: new Date("2026-08-26T10:00:00.000Z"),
      },
    ],
    movimentacoes: [
      {
        id: 1,
        partidaId: 1,
        userId: USER_ID,
        fazendaId: FAZENDA_ID,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        dataEntrada: "2026-08-20",
        quantidadeDoses: 9,
        custoTotal: valorEntrada,
        custoUnitario: custo,
        observacoes: null,
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
      },
      {
        id: 2,
        partidaId: 1,
        userId: USER_ID,
        fazendaId: FAZENDA_ID,
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        dataEntrada: "2026-08-26",
        quantidadeDoses: 1,
        custoTotal: custo,
        custoUnitario: custo,
        observacoes: "Inseminação — matriz #58 · registro repro #27",
        createdAt: new Date("2026-08-26T11:00:00.000Z"),
      },
      {
        id: 3,
        partidaId: 1,
        userId: USER_ID,
        fazendaId: FAZENDA_ID,
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        dataEntrada: "2026-08-26",
        quantidadeDoses: 1,
        custoTotal: custo,
        custoUnitario: custo,
        observacoes: "Inseminação — matriz #59 · registro repro #28",
        createdAt: new Date("2026-08-26T12:00:00.000Z"),
      },
      {
        id: 4,
        partidaId: 1,
        userId: USER_ID,
        fazendaId: FAZENDA_ID,
        tipo: SEMEN_MOV_TIPO_SAIDA_IA,
        dataEntrada: "2026-08-26",
        quantidadeDoses: 1,
        custoTotal: custo,
        custoUnitario: custo,
        observacoes: "Inseminação — matriz #60 · registro repro #29",
        createdAt: new Date("2026-08-26T13:00:00.000Z"),
      },
    ],
    nextPartidaId: 2,
    nextMovId: 5,
  });
}

describe("evaluateSemenAjusteEstoque", () => {
  it("A) ajusta só o valor: 6 doses 138,89 → 90,00 e R$ 540,00", () => {
    const r = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "138.89",
      valorAtual: 833.34,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 540,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.saldoNovo).toBe(6);
    expect(r.value.custoMedioNovo).toBe("90.00");
    expect(r.value.valorNovo).toBe(540);
  });

  it("B) ajusta só a quantidade: 6 → 5 e mantém custo médio", () => {
    const r = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "138.89",
      valorAtual: 833.34,
      modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
      saldoNovo: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.saldoNovo).toBe(5);
    expect(r.value.custoMedioNovo).toBe("138.89");
    expect(r.value.valorNovo).toBe(694.45);
  });

  it("C) quantidade + valor: 6 / 833,34 → 5 / 450 = 90,00", () => {
    const r = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "138.89",
      valorAtual: 833.34,
      modo: SEMEN_AJUSTE_MODO_AMBOS,
      saldoNovo: 5,
      valorNovo: 450,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.saldoNovo).toBe(5);
    expect(r.value.valorNovo).toBe(450);
    expect(r.value.custoMedioNovo).toBe("90.00");
  });

  it("D) sem alteração é bloqueado", () => {
    const r = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "90.00",
      valorAtual: 540,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 540,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_SEMEN_AJUSTE_SEM_ALTERACAO);
  });

  it("E) negativos são bloqueados", () => {
    expect(
      evaluateSemenAjusteEstoque({
        saldoAtual: 6,
        custoMedioAtual: "90.00",
        valorAtual: 540,
        modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
        saldoNovo: -1,
      }).ok,
    ).toBe(false);
    const saldo = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "90.00",
      valorAtual: 540,
      modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
      saldoNovo: -1,
    });
    if (!saldo.ok) expect(saldo.message).toBe(MSG_SEMEN_AJUSTE_SALDO_NEGATIVO);

    const valor = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "90.00",
      valorAtual: 540,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: -1,
    });
    expect(valor.ok).toBe(false);
    if (!valor.ok) expect(valor.message).toBe(MSG_SEMEN_AJUSTE_VALOR_NEGATIVO);
  });

  it("F) saldo zero zera o valor", () => {
    const r = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "90.00",
      valorAtual: 540,
      modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
      saldoNovo: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.saldoNovo).toBe(0);
    expect(r.value.valorNovo).toBe(0);
    expect(r.value.custoMedioNovo).toBe("0.00");
  });

  it("bloqueia valor zero com saldo positivo", () => {
    const r = evaluateSemenAjusteEstoque({
      saldoAtual: 6,
      custoMedioAtual: "90.00",
      valorAtual: 540,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_SEMEN_AJUSTE_VALOR_ZERO);
  });

  it("pack/unpack preserva snapshots sem JSON cru na leitura", () => {
    const packed = packSemenAjusteObservacoes({
      saldoAnterior: 6,
      saldoNovo: 6,
      custoMedioAnterior: "138.89",
      custoMedioNovo: "90.00",
      valorAnterior: 833.34,
      valorNovo: 540,
      observacao: "Entrada de teste com valor R$ 200,00",
    });
    expect(packed).not.toMatch(/^\s*\{/);
    const snap = unpackSemenAjusteObservacoes(packed);
    expect(snap?.custoMedioNovo).toBe("90.00");
    expect(snap?.observacao).toContain("R$ 200,00");
  });
});

describe("buildSemenAjusteResumoTela", () => {
  it("ajuste só de custo omite saldo igual e valor em estoque", () => {
    const r = buildSemenAjusteResumoTela({
      saldoAnterior: 6,
      saldoNovo: 6,
      custoMedioAnterior: "100.00",
      custoMedioNovo: "90.00",
      valorAnterior: 2800,
      valorNovo: 540,
      observacao: null,
    });
    expect(r.linhaMudancas).toBe("Custo/dose: R$ 100,00 → R$ 90,00");
    expect(r.mudancas.join(" ")).not.toContain("Saldo");
    expect(r.mudancas.join(" ")).not.toContain("2.800");
    expect(r.mudancas.join(" ")).not.toContain("Valor");
  });

  it("ajuste só de quantidade omite custo igual", () => {
    const r = buildSemenAjusteResumoTela({
      saldoAnterior: 6,
      saldoNovo: 5,
      custoMedioAnterior: "90.00",
      custoMedioNovo: "90",
      valorAnterior: 540,
      valorNovo: 450,
      observacao: null,
    });
    expect(r.linhaMudancas).toBe("Saldo: 6 → 5 doses");
    expect(r.mudancas.join(" ")).not.toContain("Custo");
  });

  it("quantidade + custo na mesma linha", () => {
    const r = buildSemenAjusteResumoTela({
      saldoAnterior: 6,
      saldoNovo: 5,
      custoMedioAnterior: "100.00",
      custoMedioNovo: "90.00",
      valorAnterior: 600,
      valorNovo: 450,
      observacao: null,
    });
    expect(r.linhaMudancas).toBe("Saldo: 6 → 5 doses · Custo/dose: R$ 100,00 → R$ 90,00");
  });

  it("90, 90.00 e R$ 90,00 não geram diferença falsa de custo", () => {
    const r = buildSemenAjusteResumoTela({
      saldoAnterior: 6,
      saldoNovo: 6,
      custoMedioAnterior: "90",
      custoMedioNovo: "90.00",
      valorAnterior: 540,
      valorNovo: 540,
      observacao: null,
    });
    expect(r.linhaMudancas).toBeNull();
  });
});

describe("ajustarEstoqueSemenLocal", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-26T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("A/G) registra ajuste de valor, preserva IA antiga e não edita histórico", async () => {
    seedPartidaComConsumo();
    await expect(
      corrigirEntradaSemenLocal(USER_ID, {
        movimentacaoId: 1,
        quantidadeDoses: 6,
        custoTotal: 540,
        dataEntrada: "2026-08-20",
        motivoCodigo: "valor_nota_informado_errado",
      }),
    ).rejects.toThrow(MSG_SEMEN_CORRECAO_CONSUMO);

    const result = await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 540,
      motivoCodigo: "correcao_valor_historico",
      observacao: "Entrada de teste com valor R$ 200,00",
    });

    expect(result.saldoAtual).toBe(6);
    expect(result.custoMedioAtual).toBe("90.00");
    expect(result.valorAtualEstoque).toBe(540);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    expect(detalhe?.saldoDoses).toBe(6);
    expect(detalhe?.custoUnitario).toBe("90.00");
    expect(detalhe?.valorAtualEstoque).toBe(540);

    const iaAntiga = detalhe?.movimentacoes.find(m => m.id === 2);
    expect(iaAntiga?.custoUnitario).toBe("138.89");
    expect(iaAntiga?.tipo).toBe(SEMEN_MOV_TIPO_SAIDA_IA);

    const entrada = detalhe?.movimentacoes.find(m => m.id === 1);
    expect(entrada?.custoTotal).toBe("1250.01");
    expect(entrada?.quantidadeDoses).toBe(9);

    const ajuste = detalhe?.movimentacoes.find(m => m.tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE);
    expect(ajuste?.tipoLabel).toBe("Ajuste de estoque");
    expect(ajuste?.motivoCorrecao).toBe("Correção de valor histórico");
    expect(String(ajuste?.observacoes)).not.toContain("FIFO");
    expect(calcularValorAtualEstoqueSemen(detalhe?.movimentacoes ?? [])).toBe(540);
  });

  it("B) ajusta quantidade sem apagar histórico", async () => {
    seedPartidaComConsumo();
    const result = await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
      saldoNovo: 5,
      motivoCodigo: "conferencia_fisica_estoque",
    });
    expect(result.saldoAtual).toBe(5);
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    expect(detalhe?.movimentacoes).toHaveLength(5);
    expect(detalhe?.movimentacoes.some(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA)).toBe(true);
  });

  it("C) quantidade + valor persiste custo médio 90,00", async () => {
    seedPartidaComConsumo();
    const result = await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_AMBOS,
      saldoNovo: 5,
      valorNovo: 450,
      motivoCodigo: "divergencia_inventario",
    });
    expect(result.saldoAtual).toBe(5);
    expect(result.custoMedioAtual).toBe("90.00");
    expect(result.valorAtualEstoque).toBe(450);
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    const entrada = detalhe?.movimentacoes.find(m => m.id === 1);
    expect(entrada?.quantidadeDoses).toBe(9);
    expect(entrada?.custoTotal).toBe("1250.01");
  });

  it("H) IA nova após ajuste usa o novo custo médio", async () => {
    seedPartidaComConsumo();
    await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 540,
      motivoCodigo: "correcao_valor_historico",
    });
    await registrarInseminacaoComSemenLocal(
      USER_ID,
      {
        fazendaId: FAZENDA_ID,
        femeaId: 15,
        machoId: null,
        dataCobertura: new Date("2026-08-26T18:00:00.000Z"),
        semenPartidaId: 1,
        origemReprodutor: SEMEN_ORIGEM_EXTERNO,
        reprodutorTextoExterno: "AJUSTE TESTE",
        inseminador: "João",
      },
      packIaObs,
    );
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    const ias = (detalhe?.movimentacoes.filter(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA) ?? []).sort(
      (a, b) => a.id - b.id,
    );
    expect(ias[0]?.custoUnitario).toBe("138.89");
    expect(ias[ias.length - 1]?.custoUnitario).toBe("90.00");
    expect(detalhe?.saldoDoses).toBe(5);
  });

  it("J) tela DESC coloca o ajuste mais recente no topo", async () => {
    seedPartidaComConsumo();
    await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 540,
      motivoCodigo: "correcao_valor_historico",
    });
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    const visuais = buildSemenHistoricoVisual(detalhe?.movimentacoes ?? [], { ordem: "desc" });
    expect(visuais[0]?.tipo).toBe(SEMEN_MOV_TIPO_AJUSTE_ESTOQUE);
    expect(visuais.some(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA && m.custoUnitario === "138.89")).toBe(
      true,
    );
  });

  it("I) Excel ASC coloca o ajuste na posição cronológica", async () => {
    seedPartidaComConsumo();
    await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 540,
      motivoCodigo: "correcao_valor_historico",
    });
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    const visuais = buildSemenHistoricoVisual(detalhe?.movimentacoes ?? [], { ordem: "asc" });
    expect(visuais[0]?.tipo).toBe(SEMEN_MOV_TIPO_ENTRADA);
    expect(visuais[visuais.length - 1]?.tipo).toBe(SEMEN_MOV_TIPO_AJUSTE_ESTOQUE);
  });
});
