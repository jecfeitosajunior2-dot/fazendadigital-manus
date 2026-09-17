import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  calcSemenCustoUnitarioEntrada,
  validateSemenEntradaInput,
} from "../shared/semenEstoque";
import { SEMEN_MOV_TIPO_AJUSTE_ESTOQUE, SEMEN_AJUSTE_MODO_QUANTIDADE, SEMEN_AJUSTE_MODO_VALOR } from "../shared/semenEstoqueAjuste";
import { calcularValorEstoqueSemen } from "../shared/semenEstoqueValor";
import {
  SEMEN_OP_AJUSTAR_ESTOQUE_NAO_E_ENTRADA,
  SEMEN_OP_AJUSTAR_ESTOQUE_REGRA,
  SEMEN_OP_AJUSTAR_ESTOQUE_TITULO,
  SEMEN_OP_AJUSTAR_ESTOQUE_TOOLTIP,
  SEMEN_OP_CORRIGIR_LANCAMENTO_REGRA,
  SEMEN_OP_CORRIGIR_LANCAMENTO_TITULO,
  SEMEN_OP_CORRIGIR_LANCAMENTO_TOOLTIP,
} from "../shared/semenEstoqueOperacoes";

vi.mock("./validateSemenMachoId", () => ({
  validateSemenMachoInterno: vi.fn(async () => {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Macho inválido." });
  }),
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: vi.fn(async () => undefined),
}));

import {
  __resetSemenLocalStoreForTests,
  __seedSemenLocalStoreForTests,
  ajustarEstoqueSemenLocal,
  corrigirEntradaSemenLocal,
  getSemenPartidaByIdLocal,
  registrarEntradaSemenLocal,
} from "./semenEstoqueLocal";

const USER_ID = 1;
const FAZENDA_ID = 1;
const here = dirname(fileURLToPath(import.meta.url));

function entrada(overrides: Record<string, unknown> = {}) {
  const r = validateSemenEntradaInput({
    origemReprodutor: SEMEN_ORIGEM_EXTERNO,
    reprodutorTexto: "P-10FAZ",
    partida: "P-10FAZ",
    quantidadeDoses: 6,
    custoTotal: 600,
    dataEntrada: "2026-08-20",
    ...overrides,
  });
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

describe("regras Corrigir lançamento × Ajustar estoque", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
  });

  it("as duas operações têm finalidades diferentes e não se misturam no texto", () => {
    expect(SEMEN_OP_CORRIGIR_LANCAMENTO_TITULO).toBe("Corrigir Lançamento");
    expect(SEMEN_OP_AJUSTAR_ESTOQUE_TITULO).toBe("Ajustar estoque");
    expect(SEMEN_OP_CORRIGIR_LANCAMENTO_REGRA).not.toBe(SEMEN_OP_AJUSTAR_ESTOQUE_REGRA);
    expect(SEMEN_OP_CORRIGIR_LANCAMENTO_TOOLTIP).not.toBe(SEMEN_OP_AJUSTAR_ESTOQUE_TOOLTIP);
    expect(SEMEN_OP_AJUSTAR_ESTOQUE_NAO_E_ENTRADA).toMatch(/Nova entrada/i);
  });

  it("A) corrige 2 doses R$ 200,00 para 3 doses R$ 285,00 com rastreio", async () => {
    const criado = await registrarEntradaSemenLocal(
      USER_ID,
      FAZENDA_ID,
      entrada({ quantidadeDoses: 2, custoTotal: 200 }),
    );
    expect(calcSemenCustoUnitarioEntrada(3, 285)).toBe("95.00");

    const result = await corrigirEntradaSemenLocal(USER_ID, {
      movimentacaoId: criado.movimentacaoId,
      quantidadeDoses: 3,
      custoTotal: 285,
      dataEntrada: "2026-08-20",
      motivoCodigo: "quantidade_digitada_incorretamente",
    });

    expect(result.saldoAtual).toBe(3);
    expect(result.custoMedioAtual).toBe("95.00");
    expect(calcularValorEstoqueSemen(result.saldoAtual, result.custoMedioAtual)).toBe(285);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, result.partidaId);
    const original = detalhe?.movimentacoes.find(m => m.id === criado.movimentacaoId);
    expect(original?.quantidadeDoses).toBe(2);
    expect(original?.custoTotal).toBe("200.00");
    expect(original?.jaCorrigida).toBe(true);

    expect(detalhe?.movimentacoes.some(m => m.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(true);
    expect(detalhe?.movimentacoes.some(m => m.tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE)).toBe(false);
    const nova = detalhe?.movimentacoes.find(m => m.id === result.novaEntradaId);
    expect(nova?.quantidadeDoses).toBe(3);
    expect(nova?.custoTotal).toBe("285.00");
    expect(nova?.custoUnitario).toBe("95.00");
    expect(nova?.userId).toBe(USER_ID);
  });

  it("A) correção exige motivo", async () => {
    const criado = await registrarEntradaSemenLocal(
      USER_ID,
      FAZENDA_ID,
      entrada({ quantidadeDoses: 2, custoTotal: 200 }),
    );
    await expect(
      corrigirEntradaSemenLocal(USER_ID, {
        movimentacaoId: criado.movimentacaoId,
        quantidadeDoses: 3,
        custoTotal: 285,
        dataEntrada: "2026-08-20",
        motivoCodigo: "",
      }),
    ).rejects.toThrow("Informe o motivo da correção.");
  });

  it("B) ajuste de saldo 6 → 5 cria movimentação e não reescreve a entrada", async () => {
    const criado = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entrada());
    const result = await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: criado.partidaId,
      modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
      saldoNovo: 5,
      motivoCodigo: "conferencia_fisica_estoque",
    });

    expect(result.saldoAtual).toBe(5);
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, criado.partidaId);
    const entradaOrig = detalhe?.movimentacoes.find(m => m.id === criado.movimentacaoId);
    expect(entradaOrig?.tipo).toBe(SEMEN_MOV_TIPO_ENTRADA);
    expect(entradaOrig?.quantidadeDoses).toBe(6);
    expect(entradaOrig?.custoTotal).toBe("600.00");

    const ajustes = detalhe?.movimentacoes.filter(m => m.tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE) ?? [];
    expect(ajustes).toHaveLength(1);
    expect(detalhe?.movimentacoes.some(m => m.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA)).toBe(false);
  });

  it("C) ajuste de valor 6 × R$ 100 → R$ 660,00 sem alterar a entrada", async () => {
    const criado = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entrada());
    const result = await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: criado.partidaId,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 660,
      motivoCodigo: "correcao_valor_historico",
    });

    expect(result.saldoAtual).toBe(6);
    expect(result.custoMedioAtual).toBe("110.00");
    expect(result.valorAtualEstoque).toBe(660);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, criado.partidaId);
    const entradaOrig = detalhe?.movimentacoes.find(m => m.id === criado.movimentacaoId);
    expect(entradaOrig?.custoTotal).toBe("600.00");
    expect(entradaOrig?.custoUnitario).toBe("100.00");
    expect(detalhe?.movimentacoes.some(m => m.tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE)).toBe(true);
  });

  it("D) consumo histórico não muda depois do ajuste", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        {
          id: 1,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          origemReprodutor: SEMEN_ORIGEM_EXTERNO,
          reprodutorKey: "e:p-10faz",
          machoId: null,
          reprodutorTexto: "P-10FAZ",
          partida: "P-10FAZ",
          centralOrigem: null,
          saldoDoses: 5,
          custoUnitario: "100.00",
          status: "disponivel",
          observacoes: null,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          updatedAt: new Date("2026-08-21T10:00:00.000Z"),
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
          quantidadeDoses: 6,
          custoTotal: "600.00",
          custoUnitario: "100.00",
          observacoes: null,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
        },
        {
          id: 2,
          partidaId: 1,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          tipo: SEMEN_MOV_TIPO_SAIDA_IA,
          dataEntrada: "2026-08-21",
          quantidadeDoses: 1,
          custoTotal: "100.00",
          custoUnitario: "100.00",
          observacoes: "custoDoseSemen=100",
          createdAt: new Date("2026-08-21T10:00:00.000Z"),
        },
      ],
      nextPartidaId: 2,
      nextMovId: 3,
    });

    await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: 1,
      modo: SEMEN_AJUSTE_MODO_VALOR,
      valorNovo: 550,
      motivoCodigo: "correcao_valor_historico",
    });

    const depois = await getSemenPartidaByIdLocal(USER_ID, 1);
    const ia = depois?.movimentacoes.find(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA);
    expect(ia?.custoUnitario).toBe("100.00");
    expect(ia?.custoTotal).toBe("100.00");
    expect(depois?.custoUnitario).toBe("110.00");
  });

  it("E) Nova entrada continua independente do ajuste", async () => {
    const criado = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entrada());
    await ajustarEstoqueSemenLocal(USER_ID, {
      partidaId: criado.partidaId,
      modo: SEMEN_AJUSTE_MODO_QUANTIDADE,
      saldoNovo: 5,
      motivoCodigo: "conferencia_fisica_estoque",
    });

    const nova = await registrarEntradaSemenLocal(
      USER_ID,
      FAZENDA_ID,
      entrada({ quantidadeDoses: 2, custoTotal: 200, dataEntrada: "2026-09-17" }),
    );
    expect(nova.novaEntrada).toBe(false);
    expect(nova.saldoAtual).toBe(7);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, criado.partidaId);
    const tipos = detalhe?.movimentacoes.map(m => m.tipo) ?? [];
    expect(tipos.filter(t => t === SEMEN_MOV_TIPO_ENTRADA).length).toBeGreaterThanOrEqual(2);
    expect(tipos).toContain(SEMEN_MOV_TIPO_AJUSTE_ESTOQUE);
    const primeira = detalhe?.movimentacoes.find(m => m.id === criado.movimentacaoId);
    expect(primeira?.quantidadeDoses).toBe(6);
  });

  it("UI separa o lápis (corrigir) do botão superior (ajustar)", () => {
    const page = readFileSync(resolve(here, "../client/src/pages/SemenEstoquePage.tsx"), "utf8");
    expect(page).toContain("SEMEN_OP_CORRIGIR_LANCAMENTO_TOOLTIP");
    expect(page).toContain("SEMEN_OP_AJUSTAR_ESTOQUE_TITULO");
    expect(page).toContain("SEMEN_OP_AJUSTAR_ESTOQUE_TOOLTIP");
    expect(page).toContain("setCorrigirMov");
    expect(page).toContain("setAjusteOpen(true)");
    expect(page).not.toMatch(/onCorrigir=\{\(\) => setAjusteOpen/);
  });
});
