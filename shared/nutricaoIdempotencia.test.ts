import { describe, expect, it } from "vitest";
import {
  chaveNutricaoValida,
  conteudoCanonicoBatida,
  conteudoCanonicoFornecimento,
  decidirChaveNutricao,
} from "./nutricaoIdempotencia";

describe("chave da confirmação de nutrição", () => {
  it("mantém a chave quando o conteúdo comercial não muda", () => {
    const conteudo = conteudoCanonicoFornecimento({
      fazendaId: 10, loteId: 1, tipoOrigem: "produto", produtoId: 101,
      data: "2026-11-01", quantidadeFornecidaKg: 10,
    });
    const estado = { chave: "forn-11111111-1111-1111-1111-111111111111", conteudo };
    const deNovo = decidirChaveNutricao(estado, conteudo, "forn", () => "forn-22222222-2222-2222-2222-222222222222");
    expect(deNovo.chave).toBe(estado.chave);
  });

  it("gera outra chave quando a quantidade muda", () => {
    const antes = conteudoCanonicoFornecimento({
      fazendaId: 10, loteId: 1, tipoOrigem: "produto", produtoId: 101,
      data: "2026-11-01", quantidadeFornecidaKg: 10,
    });
    const depois = conteudoCanonicoFornecimento({
      fazendaId: 10, loteId: 1, tipoOrigem: "produto", produtoId: 101,
      data: "2026-11-01", quantidadeFornecidaKg: 12,
    });
    const estado = { chave: "forn-11111111-1111-1111-1111-111111111111", conteudo: antes };
    const nova = decidirChaveNutricao(estado, depois, "forn", () => "forn-22222222-2222-2222-2222-222222222222");
    expect(nova.chave).toBe("forn-22222222-2222-2222-2222-222222222222");
  });

  it("trata 10 e 10.0 como a mesma quantidade", () => {
    const inteiro = conteudoCanonicoFornecimento({
      fazendaId: 10, loteId: 1, tipoOrigem: "produto", produtoId: 101,
      data: "2026-11-01", quantidadeFornecidaKg: 10,
    });
    const decimal = conteudoCanonicoFornecimento({
      fazendaId: 10, loteId: 1, tipoOrigem: "produto", produtoId: 101,
      data: "2026-11-01", quantidadeFornecidaKg: 10.0,
    });
    expect(inteiro).toBe(decimal);
  });

  it("não deixa chave de batida valer como fornecimento", () => {
    expect(chaveNutricaoValida("forn", "bat-11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(chaveNutricaoValida("bat", "bat-11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("a batida ignora a ordem dos campos soltos e considera a quantidade", () => {
    const base = {
      fazendaId: 10, dietaId: 1, data: "2026-11-01", hora: " 08:00 ", quantidadePreparadaKg: 20,
    };
    const outraHora = { ...base, hora: "09:00" };
    expect(conteudoCanonicoBatida(base)).toContain("08:00");
    expect(conteudoCanonicoBatida(base)).not.toBe(conteudoCanonicoBatida(outraHora));
  });
});
