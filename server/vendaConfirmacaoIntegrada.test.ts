import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const comercial = vi.hoisted(() => ({ confirmar: vi.fn() }));

vi.mock("./confirmarVenda", () => ({
  confirmarVendaComercial: (...args: unknown[]) => comercial.confirmar(...args),
}));

import {
  ESTADO_CONFIRMACAO_VENDA_PRODUCAO,
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA,
  MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
  MSG_VENDA_CONFIRMACAO_MANUTENCAO,
} from "../shared/vendaIntegracao";
import {
  confirmarVendaComercialSePermitida,
  confirmarVendaIntegradaSeAtiva,
  estadoConfirmacaoVenda,
  integracaoConfirmacaoVendaAtiva,
} from "./vendaConfirmacaoIntegrada";

const raiz = dirname(fileURLToPath(import.meta.url));

const inputComercial = {
  fazendaId: 1,
  data: "2026-10-24",
  compradorId: 2,
  formaPrecificacao: "cabeca" as const,
  itens: [{ animalId: 9, precoUnitario: 1500 }],
};

const inputIntegrada = {
  idempotencyKey: "ven-3e9h-nao-deve-gravar",
  fazendaId: 1,
  data: "2026-10-24",
  compradorId: 2,
  formaPrecificacao: "cabeca" as const,
  itens: [{ animalId: 9, precoUnitario: 1500 }],
  condicao: "a_vista" as const,
};

function storeContador() {
  let transacoes = 0;
  return {
    transacoes: () => transacoes,
    store: {
      transaction: async (fn: (tx: never) => Promise<unknown>) => {
        transacoes += 1;
        return fn({} as never);
      },
    },
  };
}

describe("vendaConfirmacaoIntegrada — segurança das rotas 3E.9H", () => {
  beforeEach(() => {
    comercial.confirmar.mockReset();
    comercial.confirmar.mockResolvedValue({ vendaId: 91 });
  });

  it("produção permanece integrada", () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
    expect(ESTADO_CONFIRMACAO_VENDA_PRODUCAO).toBe("integrado");
    expect(estadoConfirmacaoVenda()).toBe("integrado");
    expect(integracaoConfirmacaoVendaAtiva()).toBe(true);
  });

  it("A — flag false + rota comercial", async () => {
    const result = await confirmarVendaComercialSePermitida(10, inputComercial, { integracaoAtiva: false });
    expect(result).toEqual({ vendaId: 91 });
    expect(comercial.confirmar).toHaveBeenCalledTimes(1);
  });

  it("B — flag false + rota integrada não abre transação", async () => {
    const { store, transacoes } = storeContador();
    await expect(confirmarVendaIntegradaSeAtiva(store, 10, inputIntegrada, { integracaoAtiva: false }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA, code: "FORBIDDEN" });
    expect(transacoes()).toBe(0);
  });

  it("C/E/F — flag true bloqueia comercial (aba antiga e API direta)", async () => {
    await expect(confirmarVendaComercialSePermitida(10, inputComercial, { integracaoAtiva: true }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA, code: "FORBIDDEN" });
    expect(comercial.confirmar).not.toHaveBeenCalled();
  });

  it("D — flag true + rota integrada passa da autorização e inicia transação", async () => {
    const { store, transacoes } = storeContador();
    await expect(confirmarVendaIntegradaSeAtiva(store, 10, inputIntegrada, { integracaoAtiva: true }))
      .rejects.toBeTruthy();
    expect(transacoes()).toBeGreaterThan(0);
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
  });

  it("C — manutenção recusa as duas rotas e não abre transação", async () => {
    const { store, transacoes } = storeContador();
    await expect(confirmarVendaComercialSePermitida(10, inputComercial, { estado: "manutencao" }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_MANUTENCAO, code: "FORBIDDEN" });
    await expect(confirmarVendaIntegradaSeAtiva(store, 10, inputIntegrada, { estado: "manutencao" }))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_MANUTENCAO, code: "FORBIDDEN" });
    expect(transacoes()).toBe(0);
    expect(comercial.confirmar).not.toHaveBeenCalled();
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
    expect(estadoConfirmacaoVenda()).toBe("integrado");
  });

  it("O — produção integrada entra na transação e a comercial continua bloqueada", async () => {
    const { store, transacoes } = storeContador();
    await expect(confirmarVendaIntegradaSeAtiva(store, 10, inputIntegrada))
      .rejects.not.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA });
    await expect(confirmarVendaComercialSePermitida(10, inputComercial))
      .rejects.toMatchObject({ message: MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA });
    expect(transacoes()).toBeGreaterThan(0);
    expect(comercial.confirmar).not.toHaveBeenCalled();
  });

  it("a rota tRPC comercial passa pela porta; a integrada continua pela flag", () => {
    const router = readFileSync(join(raiz, "routers.ts"), "utf8");
    const porta = readFileSync(join(raiz, "vendaConfirmacaoIntegrada.ts"), "utf8");
    const vendas = router.slice(router.indexOf("const vendasRouter"));
    const confirmarTrpc = vendas.slice(
      vendas.indexOf("confirmar: protectedProcedure"),
      vendas.indexOf("cancelar: protectedProcedure"),
    );
    expect(confirmarTrpc).toContain("confirmarVendaComercialSePermitida");
    expect(confirmarTrpc).not.toContain("confirmarVendaComercial(");
    expect(confirmarTrpc).not.toContain("idempotencyKey");
    expect(confirmarTrpc).not.toContain("condicao");
    expect(router).toContain("integracaoConfirmacaoAtiva");
    expect(router).toContain("estadoConfirmacaoVenda");
    expect(router).toContain("confirmarIntegrada");
    expect(router).toContain("confirmarVendaIntegradaSeAtiva");
    expect(porta).toContain("recusarSeRotaNegada(\"comercial\"");
    expect(porta).toContain("recusarSeRotaNegada(\"integrada\"");
    expect(porta).toContain("createConfirmarVendaFinanceiroService");
  });
});
