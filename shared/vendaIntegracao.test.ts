import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESTADO_CONFIRMACAO_VENDA_PRODUCAO,
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA,
  MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
  MSG_VENDA_CONFIRMACAO_MANUTENCAO,
  autorizarRotaConfirmacaoVenda,
  configuracaoConfirmacaoVenda,
  estadoConfirmacaoVenda,
  integracaoConfirmacaoVendaAtiva,
} from "./vendaIntegracao";

const raiz = dirname(fileURLToPath(import.meta.url));

describe("vendaIntegracao — seleção das rotas de confirmação", () => {
  it("a constante de produção está integrada e não lê env", () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
    expect(ESTADO_CONFIRMACAO_VENDA_PRODUCAO).toBe("integrado");
    expect(estadoConfirmacaoVenda()).toBe("integrado");
    expect(integracaoConfirmacaoVendaAtiva()).toBe(true);
    expect(configuracaoConfirmacaoVenda()).toEqual({ estado: "integrado", integracaoAtiva: true });
    const fonte = readFileSync(join(raiz, "vendaIntegracao.ts"), "utf8");
    expect(fonte).toContain("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true");
    expect(fonte).toContain('ESTADO_CONFIRMACAO_VENDA_PRODUCAO = "integrado"');
    expect(fonte).not.toContain("process.env");
  });

  it("A — flag false autoriza só a comercial", () => {
    const cfg = { integracaoAtiva: false };
    expect(autorizarRotaConfirmacaoVenda("comercial", cfg)).toEqual({ ok: true });
    expect(autorizarRotaConfirmacaoVenda("integrada", cfg)).toEqual({
      ok: false,
      message: MSG_VENDA_CONFIRMACAO_INTEGRADA_DESLIGADA,
    });
  });

  it("C — flag true autoriza só a integrada", () => {
    const cfg = { integracaoAtiva: true };
    expect(autorizarRotaConfirmacaoVenda("comercial", cfg)).toEqual({
      ok: false,
      message: MSG_VENDA_CONFIRMACAO_COMERCIAL_BLOQUEADA,
    });
    expect(autorizarRotaConfirmacaoVenda("integrada", cfg)).toEqual({ ok: true });
  });

  it("C-manutencao — bloqueia comercial e integrada", () => {
    const cfg = { estado: "manutencao" as const };
    expect(autorizarRotaConfirmacaoVenda("comercial", cfg)).toEqual({
      ok: false,
      message: MSG_VENDA_CONFIRMACAO_MANUTENCAO,
    });
    expect(autorizarRotaConfirmacaoVenda("integrada", cfg)).toEqual({
      ok: false,
      message: MSG_VENDA_CONFIRMACAO_MANUTENCAO,
    });
    expect(integracaoConfirmacaoVendaAtiva(cfg)).toBe(false);
  });

  it("injeção não altera a constante compartilhada", () => {
    expect(autorizarRotaConfirmacaoVenda("integrada", { integracaoAtiva: true }).ok).toBe(true);
    expect(autorizarRotaConfirmacaoVenda("comercial", { estado: "manutencao" }).ok).toBe(false);
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(true);
    expect(estadoConfirmacaoVenda()).toBe("integrado");
    expect(integracaoConfirmacaoVendaAtiva()).toBe(true);
  });
});
