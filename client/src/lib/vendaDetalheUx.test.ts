import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_VENDA_CANCELAR_COM_RECEBIMENTO_UI,
  deveExibirAvisoCancelamentoRecebimento,
  podeExibirCancelarVenda,
} from "./vendaDetalheUx";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/VendaDetalhePage.tsx"), "utf8");
const router = readFileSync(resolve(here, "../../../server/routers.ts"), "utf8");

describe("venda detalhe — cancelar com recebimento", () => {
  it("esconde o botão só quando há recebimento efetivo", () => {
    expect(podeExibirCancelarVenda({
      status: "concluido",
      temItens: true,
      temRecebimentoEfetivo: false,
    })).toBe(true);
    expect(podeExibirCancelarVenda({
      status: "concluido",
      temItens: true,
      temRecebimentoEfetivo: true,
    })).toBe(false);
    expect(podeExibirCancelarVenda({
      status: "cancelado",
      temItens: true,
      temRecebimentoEfetivo: true,
    })).toBe(false);
    expect(podeExibirCancelarVenda({
      status: "concluido",
      temItens: false,
      temRecebimentoEfetivo: false,
    })).toBe(false);
  });

  it("mostra o aviso só na venda concluída com recebimento", () => {
    expect(deveExibirAvisoCancelamentoRecebimento({
      status: "concluido",
      temRecebimentoEfetivo: true,
    })).toBe(true);
    expect(deveExibirAvisoCancelamentoRecebimento({
      status: "concluido",
      temRecebimentoEfetivo: false,
    })).toBe(false);
    expect(deveExibirAvisoCancelamentoRecebimento({
      status: "cancelado",
      temRecebimentoEfetivo: true,
    })).toBe(false);
    expect(MSG_VENDA_CANCELAR_COM_RECEBIMENTO_UI).toBe(
      "Cancelamento indisponível: esta venda possui recebimento financeiro.",
    );
  });

  it("a tela e o get usam a flag oficial, sem recalcular saldo no cliente", () => {
    expect(page).toContain("podeExibirCancelarVenda");
    expect(page).toContain("deveExibirAvisoCancelamentoRecebimento");
    expect(page).toContain("MSG_VENDA_CANCELAR_COM_RECEBIMENTO_UI");
    expect(page).not.toContain("principalLiquidado");
    expect(page).not.toContain("derivarSaldoParcela");
    expect(router).toContain("temRecebimentoEfetivo");
    expect(router).toContain("vendaTemRecebimentoEfetivo");
  });
});
