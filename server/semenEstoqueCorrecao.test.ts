import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_STATUS_DISPONIVEL,
  validateSemenEntradaInput,
} from "../shared/semenEstoque";
import { MSG_SEMEN_CORRECAO_CONSUMO, MSG_SEMEN_CORRECAO_JA_CORRIGIDA, MSG_SEMEN_CORRECAO_SEM_ALTERACAO } from "../shared/semenEstoqueLedger";
import { calcularValorEstoqueSemen } from "../shared/semenEstoqueValor";

const USER_ID = 1;
const FAZENDA_ID = 1;

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
  corrigirEntradaSemenLocal,
  getSemenPartidaByIdLocal,
  registrarEntradaSemenLocal,
} from "./semenEstoqueLocal";

function entradaExterna(overrides: Record<string, unknown> = {}) {
  const r = validateSemenEntradaInput({
    origemReprodutor: SEMEN_ORIGEM_EXTERNO,
    reprodutorTexto: "GSC-7117",
    partida: "P-CORR",
    quantidadeDoses: 10,
    custoTotal: 1500,
    dataEntrada: "2026-08-25",
    ...overrides,
  });
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

describe("corrigirEntradaSemenLocal", () => {
  beforeEach(() => {
    __resetSemenLocalStoreForTests();
  });

  it("corrige 10 doses R$ 1.500 para 8 doses R$ 1.200 sem editar a original", async () => {
    const entrada = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entradaExterna());
    const originalId = entrada.movimentacaoId;

    const result = await corrigirEntradaSemenLocal(USER_ID, {
      movimentacaoId: originalId,
      quantidadeDoses: 8,
      custoTotal: 1200,
      dataEntrada: "2026-08-25",
      motivoCodigo: "quantidade_digitada_incorretamente",
    });

    expect(result.saldoAtual).toBe(8);
    expect(result.custoMedioAtual).toBe("150.00");
    expect(calcularValorEstoqueSemen(result.saldoAtual, result.custoMedioAtual)).toBe(1200);

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, result.partidaId);
    expect(detalhe?.saldoDoses).toBe(8);
    const original = detalhe?.movimentacoes.find(m => m.id === originalId);
    expect(original?.tipo).toBe(SEMEN_MOV_TIPO_ENTRADA);
    expect(original?.quantidadeDoses).toBe(10);
    expect(original?.custoTotal).toBe("1500.00");
    expect(original?.dataEntrada).toBe("2026-08-25");
    expect(original?.jaCorrigida).toBe(true);
    expect(original?.podeCorrigir).toBe(false);

    const estorno = detalhe?.movimentacoes.find(m => m.id === result.estornoId);
    expect(estorno?.tipo).toBe(SEMEN_MOV_TIPO_ESTORNO_ENTRADA);
    expect(estorno?.tipoLabel).toBe("Correção de lançamento");
    expect(estorno?.quantidadeDoses).toBe(10);
    expect(estorno?.movimentacaoOrigemId).toBe(originalId);
    expect(estorno?.motivoCorrecao).toBe("Quantidade digitada incorretamente");
    expect(String(estorno?.tipoLabel)).not.toContain("ESTORNO");

    const nova = detalhe?.movimentacoes.find(m => m.id === result.novaEntradaId);
    expect(nova?.tipo).toBe(SEMEN_MOV_TIPO_ENTRADA);
    expect(nova?.tipoLabel).toBe("Entrada corrigida");
    expect(nova?.quantidadeDoses).toBe(8);
    expect(nova?.custoTotal).toBe("1200.00");
    expect(nova?.movimentacaoOrigemId).toBe(originalId);
    expect(nova?.grupoCorrecaoId).toBe(estorno?.grupoCorrecaoId);
  });

  it("recalcula custo quando só o valor muda", async () => {
    const entrada = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entradaExterna());
    const result = await corrigirEntradaSemenLocal(USER_ID, {
      movimentacaoId: entrada.movimentacaoId,
      quantidadeDoses: 10,
      custoTotal: 1300,
      dataEntrada: "2026-08-25",
      motivoCodigo: "valor_nota_informado_errado",
    });
    expect(result.saldoAtual).toBe(10);
    expect(result.custoMedioAtual).toBe("130.00");
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, result.partidaId);
    const original = detalhe?.movimentacoes.find(m => m.id === entrada.movimentacaoId);
    expect(original?.custoTotal).toBe("1500.00");
    expect(original?.quantidadeDoses).toBe(10);
  });

  it("grava a data operacional correta na nova entrada e não altera a original", async () => {
    const entrada = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entradaExterna());
    const result = await corrigirEntradaSemenLocal(USER_ID, {
      movimentacaoId: entrada.movimentacaoId,
      quantidadeDoses: 10,
      custoTotal: 1500,
      dataEntrada: "2026-08-24",
      motivoCodigo: "data_informada_incorretamente",
    });
    const detalhe = await getSemenPartidaByIdLocal(USER_ID, result.partidaId);
    const original = detalhe?.movimentacoes.find(m => m.id === entrada.movimentacaoId);
    const nova = detalhe?.movimentacoes.find(m => m.id === result.novaEntradaId);
    expect(original?.dataEntrada).toBe("2026-08-25");
    expect(nova?.dataEntrada).toBe("2026-08-24");
  });

  it("não permite correção quando quantidade, custo e data permanecem iguais", async () => {
    const entrada = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entradaExterna());
    await expect(
      corrigirEntradaSemenLocal(USER_ID, {
        movimentacaoId: entrada.movimentacaoId,
        quantidadeDoses: 10,
        custoTotal: 1500,
        dataEntrada: "2026-08-25",
        motivoCodigo: "quantidade_digitada_incorretamente",
      }),
    ).rejects.toThrow(MSG_SEMEN_CORRECAO_SEM_ALTERACAO);
  });

  it("não permite corrigir a mesma entrada duas vezes", async () => {
    const entrada = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entradaExterna());
    await corrigirEntradaSemenLocal(USER_ID, {
      movimentacaoId: entrada.movimentacaoId,
      quantidadeDoses: 8,
      custoTotal: 1200,
      dataEntrada: "2026-08-25",
      motivoCodigo: "quantidade_digitada_incorretamente",
    });
    await expect(
      corrigirEntradaSemenLocal(USER_ID, {
        movimentacaoId: entrada.movimentacaoId,
        quantidadeDoses: 7,
        custoTotal: 1050,
        dataEntrada: "2026-08-25",
        motivoCodigo: "quantidade_digitada_incorretamente",
      }),
    ).rejects.toThrow(MSG_SEMEN_CORRECAO_JA_CORRIGIDA);
  });

  it("bloqueia correção sem motivo", async () => {
    const entrada = await registrarEntradaSemenLocal(USER_ID, FAZENDA_ID, entradaExterna());
    await expect(
      corrigirEntradaSemenLocal(USER_ID, {
        movimentacaoId: entrada.movimentacaoId,
        quantidadeDoses: 8,
        custoTotal: 1200,
        dataEntrada: "2026-08-25",
        motivoCodigo: "",
      }),
    ).rejects.toThrow("Informe o motivo da correção.");
  });

  it("bloqueia correção quando a entrada já foi consumida e o saldo é insuficiente", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        {
          id: 1,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          origemReprodutor: SEMEN_ORIGEM_EXTERNO,
          reprodutorKey: "e:gsc-7117",
          machoId: null,
          reprodutorTexto: "GSC-7117",
          partida: "P-CONS",
          centralOrigem: null,
          saldoDoses: 0,
          custoUnitario: "100.00",
          status: "esgotado",
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
          quantidadeDoses: 5,
          custoTotal: "500.00",
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
          quantidadeDoses: 5,
          custoTotal: "500.00",
          custoUnitario: "100.00",
          observacoes: "Inseminação — matriz #1 · registro repro #9",
          createdAt: new Date("2026-08-21T10:00:00.000Z"),
        },
      ],
      nextPartidaId: 2,
      nextMovId: 3,
    });

    await expect(
      corrigirEntradaSemenLocal(USER_ID, {
        movimentacaoId: 1,
        quantidadeDoses: 3,
        custoTotal: 300,
        dataEntrada: "2026-08-20",
        motivoCodigo: "quantidade_digitada_incorretamente",
      }),
    ).rejects.toThrow(MSG_SEMEN_CORRECAO_CONSUMO);
  });

  it("recalcula custo médio ao corrigir a segunda entrada", async () => {
    await registrarEntradaSemenLocal(
      USER_ID,
      FAZENDA_ID,
      entradaExterna({ quantidadeDoses: 10, custoTotal: 1000, partida: "P-MEDIO" }),
    );
    const b = await registrarEntradaSemenLocal(
      USER_ID,
      FAZENDA_ID,
      entradaExterna({ quantidadeDoses: 10, custoTotal: 2000, partida: "P-MEDIO" }),
    );
    expect(b.custoMedioAtual).toBe("150.00");

    const result = await corrigirEntradaSemenLocal(USER_ID, {
      movimentacaoId: b.movimentacaoId,
      quantidadeDoses: 10,
      custoTotal: 1800,
      dataEntrada: "2026-08-25",
      motivoCodigo: "valor_nota_informado_errado",
    });
    expect(result.saldoAtual).toBe(20);
    expect(result.custoMedioAtual).toBe("140.00");
    expect(result.custoMedioAtual).not.toBe("180.00");
  });

  it("não oferece correção para uso em inseminação", async () => {
    __seedSemenLocalStoreForTests({
      partidas: [
        {
          id: 1,
          userId: USER_ID,
          fazendaId: FAZENDA_ID,
          origemReprodutor: SEMEN_ORIGEM_EXTERNO,
          reprodutorKey: "e:gsc-7117",
          machoId: null,
          reprodutorTexto: "GSC-7117",
          partida: "P-IA",
          centralOrigem: null,
          saldoDoses: 9,
          custoUnitario: "150.00",
          status: SEMEN_STATUS_DISPONIVEL,
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
          quantidadeDoses: 10,
          custoTotal: "1500.00",
          custoUnitario: "150.00",
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
          custoTotal: "150.00",
          custoUnitario: "150.00",
          observacoes: "Inseminação — matriz #15 · registro repro #27",
          createdAt: new Date("2026-08-21T10:00:00.000Z"),
        },
      ],
      nextPartidaId: 2,
      nextMovId: 3,
    });

    const detalhe = await getSemenPartidaByIdLocal(USER_ID, 1);
    const saida = detalhe?.movimentacoes.find(m => m.tipo === SEMEN_MOV_TIPO_SAIDA_IA);
    expect(saida?.tipoLabel).toBe("Uso em inseminação");
    expect(saida?.podeCorrigir).toBe(false);
  });
});
