import { describe, expect, it } from "vitest";
import { LEITURA_OPERACIONAL_HABILITADA, avaliarPedido } from "./leituraAutorizada";
import {
  CONTA_AUDITORIA,
  FRASE_AUDITORIA_OPERACIONAL,
  avaliarAuditoria,
  executarAuditoriaOperacional,
  grantsSaoSomenteSelect,
  origemDeConexaoSegura,
  tabelasDoModelo,
} from "./auditoriaOperacional";

const destino = { host: "127.0.0.1", porta: 3306, banco: "fazenda_digital", servidor: "fazenda-digital-mysql" };

function pedido(parcial: Record<string, unknown> = {}) {
  return {
    autorizacao: FRASE_AUDITORIA_OPERACIONAL,
    destino,
    esperado: { ...destino },
    credencial: { usuario: CONTA_AUDITORIA, senha: "nao-gravar", papel: "leitura" },
    ...parcial,
  };
}

describe("auditoria operacional limitada", () => {
  it("mantém a trava geral fechada", () => {
    expect(LEITURA_OPERACIONAL_HABILITADA).toBe(false);
    const geral = avaliarPedido({
      autorizacao: "AUTORIZO_LEITURA_ESTRUTURAL_DA_FAZENDA",
      destino,
      esperado: { ...destino },
      credencial: { usuario: CONTA_AUDITORIA, senha: "nao-gravar", papel: "leitura" },
      limiteConsultas: 8,
    });
    expect(geral.aceito).toBe(false);
  });

  it("recusa root, a conta da aplicação e outro destino", () => {
    expect(avaliarAuditoria(pedido({ credencial: { usuario: "root", senha: "x", papel: "leitura" } })).aceito).toBe(false);
    expect(avaliarAuditoria(pedido({ credencial: { usuario: "fazenda", senha: "x", papel: "leitura" } })).aceito).toBe(false);
    expect(avaliarAuditoria(pedido({ destino: { ...destino, banco: "outro" } })).aceito).toBe(false);
    expect(avaliarAuditoria(pedido({ autorizacao: "" })).aceito).toBe(false);
  });

  it("não conecta quando o pedido é recusado", async () => {
    const resultado = await executarAuditoriaOperacional(
      pedido({ credencial: { usuario: "root", senha: "x", papel: "leitura" } }),
      async () => { throw new Error("CONECTOU"); },
    );
    expect(resultado.aceito).toBe(false);
  });

  it("reconhece só SELECT no banco da fazenda", () => {
    const bom = grantsSaoSomenteSelect([
      "GRANT USAGE ON *.* TO `fd_auditoria_ro`@`172.19.0.1`",
      "GRANT SELECT ON `fazenda_digital`.* TO `fd_auditoria_ro`@`172.19.0.1`",
    ]);
    expect(bom.ok).toBe(true);
    const escrita = grantsSaoSomenteSelect([
      "GRANT USAGE ON *.* TO `fd_auditoria_ro`@`172.19.0.1`",
      "GRANT SELECT, INSERT ON `fazenda_digital`.* TO `fd_auditoria_ro`@`172.19.0.1`",
    ]);
    expect(escrita.ok).toBe(false);
    expect(origemDeConexaoSegura("%")).toBe(false);
    expect(origemDeConexaoSegura("172.19.0.1")).toBe(true);
    expect(tabelasDoModelo()).toHaveLength(62);
  });
});
