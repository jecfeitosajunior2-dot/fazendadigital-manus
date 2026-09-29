import { describe, expect, it } from "vitest";
import {
  enriquecerComprasListagem,
  mensagemBloqueioExclusaoCompra,
  MSG_COMPRA_CANCELAR_COM_ANIMAIS,
  MSG_COMPRA_CANCELAR_COM_ANIMAIS_DETALHE,
  MSG_COMPRA_CANCELAR_JA_CANCELADA,
  MSG_COMPRA_CANCELAR_MOTIVO,
  MSG_COMPRA_CANCELAR_NAO_CONCLUIDA,
  MSG_COMPRA_EXCLUIR_COM_ANIMAIS,
  MSG_COMPRA_EXCLUIR_CONCLUIDA,
  MSG_COMPRA_IDENTIFICACAO_ENCERRADA,
  normalizarMotivoCancelamentoCompra,
  operacaoComercialEntraNoTotal,
  exibirBotaoCancelarCompraFicha,
  motivoBloqueioCancelarCompra,
  podeCancelarCompraComercial,
  podeExcluirCompraFisicamente,
} from "./compraCancelamento";

describe("cancelamento comercial da compra", () => {
  it("compra concluída + 0 identificados pode cancelar", () => {
    expect(podeCancelarCompraComercial({ status: "concluido", identificados: 0 })).toBe(true);
  });

  it("motivo obrigatório e espaços bloqueados", () => {
    expect(normalizarMotivoCancelamentoCompra("")).toBeNull();
    expect(normalizarMotivoCancelamentoCompra("   ")).toBeNull();
    expect(normalizarMotivoCancelamentoCompra("Compra lançada em duplicidade")).toBe(
      "Compra lançada em duplicidade",
    );
    expect(MSG_COMPRA_CANCELAR_MOTIVO).toMatch(/motivo/i);
  });

  it("ficha mostra Cancelar bloqueado quando há identificados; some só se já cancelada", () => {
    expect(exibirBotaoCancelarCompraFicha("concluido")).toBe(true);
    expect(exibirBotaoCancelarCompraFicha("pendente")).toBe(true);
    expect(exibirBotaoCancelarCompraFicha("cancelado")).toBe(false);
    expect(motivoBloqueioCancelarCompra({ status: "concluido", identificados: 0 })).toBeNull();
    expect(motivoBloqueioCancelarCompra({ status: "concluido", identificados: 2 })).toContain(
      MSG_COMPRA_CANCELAR_COM_ANIMAIS,
    );
    expect(motivoBloqueioCancelarCompra({ status: "concluido", identificados: 2 })).toContain(
      MSG_COMPRA_CANCELAR_COM_ANIMAIS_DETALHE,
    );
    expect(motivoBloqueioCancelarCompra({ status: "pendente", identificados: 0 })).toBe(
      MSG_COMPRA_CANCELAR_NAO_CONCLUIDA,
    );
    expect(motivoBloqueioCancelarCompra({ status: "cancelado", identificados: 0 })).toBe(
      MSG_COMPRA_CANCELAR_JA_CANCELADA,
    );
  });

  it("1 ou vários vinculados bloqueiam cancelamento e exclusão", () => {
    expect(podeCancelarCompraComercial({ status: "concluido", identificados: 1 })).toBe(false);
    expect(podeCancelarCompraComercial({ status: "concluido", identificados: 7 })).toBe(false);
    expect(podeExcluirCompraFisicamente({ status: "concluido", temGrupos: true, identificados: 1 })).toBe(false);
    expect(mensagemBloqueioExclusaoCompra({ status: "concluido", temGrupos: true, identificados: 1 })).toBe(
      MSG_COMPRA_EXCLUIR_COM_ANIMAIS,
    );
    expect(MSG_COMPRA_CANCELAR_COM_ANIMAIS).toMatch(/identificados/);
  });

  it("compra já cancelada não cancela nem exclui", () => {
    expect(podeCancelarCompraComercial({ status: "cancelado", identificados: 0 })).toBe(false);
    expect(podeExcluirCompraFisicamente({ status: "cancelado", temGrupos: true, identificados: 0 })).toBe(false);
  });

  it("compra concluída com grupos não tem exclusão física", () => {
    expect(podeExcluirCompraFisicamente({ status: "concluido", temGrupos: true, identificados: 0 })).toBe(false);
    expect(mensagemBloqueioExclusaoCompra({ status: "concluido", temGrupos: true, identificados: 0 })).toBe(
      MSG_COMPRA_EXCLUIR_CONCLUIDA,
    );
  });

  it("compra cancelada não entra no total efetivo", () => {
    expect(operacaoComercialEntraNoTotal("concluido")).toBe(true);
    expect(operacaoComercialEntraNoTotal(null)).toBe(true);
    expect(operacaoComercialEntraNoTotal("cancelado")).toBe(false);
  });

  it("listagem mantém compra cancelada e ignora animal de outra compra ou sem compra", () => {
    const linhas = enriquecerComprasListagem(
      [
        { id: 9001, status: "concluido" },
        { id: 9002, status: "cancelado" },
      ],
      [
        { compraId: 9003 },
        { compraId: null },
      ],
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ id: 9001, identificados: 0, podeCancelar: true });
    expect(linhas[1]).toMatchObject({ id: 9002, identificados: 0, podeCancelar: false });
    expect(MSG_COMPRA_IDENTIFICACAO_ENCERRADA).toMatch(/identificação encerrada/);
  });
});
