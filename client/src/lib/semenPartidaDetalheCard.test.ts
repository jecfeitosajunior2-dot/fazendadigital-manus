import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEMEN_ORIGEM_EXTERNO, SEMEN_ORIGEM_INTERNO } from "@shared/semenEstoque";
import {
  calcularValorEstoqueSemen,
  formatValorAtualEstoqueSemenDisplay,
} from "@shared/semenEstoqueValor";
import {
  SEMEN_DETALHE_LABEL_CENTRAL,
  SEMEN_DETALHE_LABEL_CUSTO_DOSE,
  SEMEN_DETALHE_LABEL_PROCEDENCIA,
  SEMEN_DETALHE_LABEL_SALDO,
  SEMEN_DETALHE_LABEL_VALOR_ESTOQUE,
  buildSemenPartidaDetalheIdentidade,
  formatSemenPartidaDetalheValorEstoque,
  formatSemenPartidaProcedenciaLabel,
} from "./semenPartidaDetalheCard";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

describe("buildSemenPartidaDetalheIdentidade", () => {
  it("exibe reprodutor sem duplicidade ambígua e rotula a partida", () => {
    const mesmoTexto = buildSemenPartidaDetalheIdentidade({
      reprodutorDisplay: "P-10FAZ",
      partida: "P-10FAZ",
    });
    expect(mesmoTexto.titulo).toBe("P-10FAZ");
    expect(mesmoTexto.partidaLinha).toBe("Partida: P-10FAZ");
    expect(mesmoTexto.titulo).not.toBe(mesmoTexto.partidaLinha);
  });

  it("quando reprodutor e partida diferem, título é o reprodutor", () => {
    const distinto = buildSemenPartidaDetalheIdentidade({
      reprodutorDisplay: "GSC-7117",
      partida: "P-10FAZ",
    });
    expect(distinto.titulo).toBe("GSC-7117");
    expect(distinto.partidaLinha).toBe("Partida: P-10FAZ");
  });

  it("não inventa partida quando o cadastro não tem", () => {
    const semPartida = buildSemenPartidaDetalheIdentidade({
      reprodutorDisplay: "GSC-7117",
      partida: "  ",
    });
    expect(semPartida.titulo).toBe("GSC-7117");
    expect(semPartida.partidaLinha).toBeNull();
  });
});

describe("card de visualização da partida", () => {
  it("custo por dose e valor em estoque usam a regra da listagem", () => {
    expect(calcularValorEstoqueSemen(6, "100.00")).toBe(600);
    expect(formatSemenPartidaDetalheValorEstoque(600)).toBe("R$ 600,00");
    expect(formatSemenPartidaDetalheValorEstoque(600)).toBe(
      formatValorAtualEstoqueSemenDisplay(600),
    );
  });

  it("ausência de custo não gera valor positivo falso", () => {
    expect(calcularValorEstoqueSemen(6, null)).toBe(0);
    expect(calcularValorEstoqueSemen(6, "")).toBe(0);
    expect(formatSemenPartidaDetalheValorEstoque(0)).toBe(
      formatValorAtualEstoqueSemenDisplay(0),
    );
    expect(formatSemenPartidaDetalheValorEstoque(null)).toBe(
      formatValorAtualEstoqueSemenDisplay(null),
    );
  });

  it("valor do detalhe usa o consolidado da partida, não um recálculo local", () => {
    const page = readSrc("../pages/SemenEstoquePage.tsx");
    expect(page).toContain("formatSemenPartidaDetalheValorEstoque(detalhe.valorAtualEstoque)");
    expect(page).not.toMatch(/calcularValorEstoqueSemen\(\s*detalhe\.saldoDoses/);
  });

  it("procedência não se chama Origem e Central não se chama Origem", () => {
    expect(SEMEN_DETALHE_LABEL_CENTRAL).toBe("Central");
    expect(SEMEN_DETALHE_LABEL_PROCEDENCIA).toBe("Procedência");
    expect(SEMEN_DETALHE_LABEL_SALDO).toBe("Saldo");
    expect(SEMEN_DETALHE_LABEL_CUSTO_DOSE).toBe("Custo por dose");
    expect(SEMEN_DETALHE_LABEL_VALOR_ESTOQUE).toBe("Valor em estoque");
    expect(formatSemenPartidaProcedenciaLabel(SEMEN_ORIGEM_EXTERNO)).toBe("Externa");
    expect(formatSemenPartidaProcedenciaLabel(SEMEN_ORIGEM_INTERNO)).toBe("Rebanho");

    const page = readSrc("../pages/SemenEstoquePage.tsx");
    expect(page).toContain("SEMEN_DETALHE_LABEL_CENTRAL");
    expect(page).toContain("SEMEN_DETALHE_LABEL_PROCEDENCIA");
    expect(page).not.toContain("Central / origem");
    expect(page).not.toMatch(/>Origem</);
  });

  it("histórico usa o custo da movimentação e não o custo atual da partida", () => {
    const page = readSrc("../pages/SemenEstoquePage.tsx");
    expect(page).toContain("buildSemenHistoricoVisual(detalhe.movimentacoes");
    expect(page).toContain("formatCusto(mov.custoUnitario)");
    expect(page).toContain("formatCusto(mov.custoTotal)");
    expect(page).not.toContain("formatCusto(detalhe.custoUnitario)");
  });

  it("saldo e custo do card vêm da partida, sem recálculo de estoque", () => {
    const page = readSrc("../pages/SemenEstoquePage.tsx");
    expect(page).toContain("{detalhe.saldoDoses} doses");
    expect(page).toContain("formatCustoDisplay(detalhe.custoUnitario)");
    expect(page).toContain("SEMEN_OP_AJUSTAR_ESTOQUE_TITULO");
    expect(page).toContain("Histórico de movimentações");
    expect(page).not.toContain("applySemenEntradaAgregacao");
    expect(page).not.toContain("applySemenSaidaIa");
  });
});
