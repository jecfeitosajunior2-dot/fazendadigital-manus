import { describe, expect, it } from "vitest";
import {
  buildRebanhoVisaoGeralRetorno,
  listaAnimaisComRetornoVisaoGeral,
  mapaRebanhoComRetornoVisaoGeral,
  parseRetornoRebanhoVisaoGeral,
} from "./rebanhoRoutes";

describe("rebanhoRoutes", () => {
  it("monta retorno com fazenda", () => {
    expect(buildRebanhoVisaoGeralRetorno("3")).toBe("/rebanho/visao-geral?fazendaId=3");
  });

  it("anexa retorno à lista de animais", () => {
    const path = listaAnimaisComRetornoVisaoGeral(
      "/rebanho/lista-animais?dataNascimentoDe=2026-09-01&dataNascimentoAte=2026-09-30&fazendaId=3",
      "3",
    );
    expect(path).toContain("retorno=");
    expect(parseRetornoRebanhoVisaoGeral(new URL(path, "http://local").searchParams.get("retorno"))).toBe(
      "/rebanho/visao-geral?fazendaId=3",
    );
  });

  it("anexa retorno ao mapa do rebanho", () => {
    const path = mapaRebanhoComRetornoVisaoGeral(
      "/rebanho/mapa-rebanho?fazendaId=3&superlotados=true",
      "3",
    );
    expect(path).toContain("retorno=");
    expect(parseRetornoRebanhoVisaoGeral(new URL(path, "http://local").searchParams.get("retorno"))).toBe(
      "/rebanho/visao-geral?fazendaId=3",
    );
  });

  it("rejeita retorno fora da visão geral", () => {
    expect(parseRetornoRebanhoVisaoGeral("/rebanho/lista-animais")).toBeNull();
    expect(parseRetornoRebanhoVisaoGeral(null)).toBeNull();
  });
});
