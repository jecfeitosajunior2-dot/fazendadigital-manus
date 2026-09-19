import { describe, expect, it } from "vitest";
import {
  FILTRO_TODOS,
  filtrarVendasListagem,
  isVendaStatus,
  labelStatusVenda,
  precoMedioKgVendaListagem,
  resumirVendasListagem,
  vendasParaTotaisRodape,
  VENDA_STATUS,
} from "./vendasListagem";

const vendaValidada = {
  id: 1,
  data: "2026-09-19",
  comprador: "Frigorífico São Paulo",
  fazendaNome: "Fazenda J",
  status: "concluido",
  formaPrecificacao: "kg",
  quantidadeAnimais: 2,
  pesoTotal: 450,
  valorTotalNumero: 4612.5,
};

describe("vendasListagem", () => {
  it("reconhece só os status reais do schema", () => {
    expect(VENDA_STATUS).toEqual(["pendente", "concluido", "cancelado"]);
    expect(isVendaStatus("concluido")).toBe(true);
    expect(isVendaStatus("confirmado")).toBe(false);
    expect(labelStatusVenda("concluido")).toBe("Concluída");
  });

  it("R$/kg médio usa valorTotal / pesoTotal só na modalidade kg", () => {
    expect(precoMedioKgVendaListagem(vendaValidada)).toBe(10.25);
    expect(precoMedioKgVendaListagem({ ...vendaValidada, formaPrecificacao: "cabeca" })).toBeNull();
    expect(precoMedioKgVendaListagem({ ...vendaValidada, formaPrecificacao: "arroba" })).toBeNull();
    expect(precoMedioKgVendaListagem({ ...vendaValidada, formaPrecificacao: null })).toBeNull();
    expect(precoMedioKgVendaListagem({ ...vendaValidada, pesoTotal: null })).toBeNull();
  });

  it("cards somam as vendas já filtradas, sem hardcode", () => {
    const resumo = resumirVendasListagem([vendaValidada]);
    expect(resumo.vendas).toEqual({ kind: "known", value: 1 });
    expect(resumo.animais).toEqual({ kind: "known", value: 2 });
    expect(resumo.peso).toEqual({ kind: "known", value: 450 });
    expect(resumo.valor).toEqual({ kind: "known", value: 4612.5 });
  });

  it("filtros de período, comprador, status e busca são combinados", () => {
    const outra = {
      id: 2,
      data: "2026-08-01",
      comprador: "Outro",
      fazendaNome: "Fazenda B",
      status: "pendente",
      quantidadeAnimais: 1,
      valorTotalNumero: 100,
    };
    const lista = [vendaValidada, outra];

    expect(filtrarVendasListagem(lista, { periodoDe: "2026-09-01", periodoAte: "2026-09-30" }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem(lista, { comprador: "Frigorífico São Paulo" }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem(lista, { status: "pendente" }).map(v => v.id)).toEqual([2]);
    expect(filtrarVendasListagem(lista, { busca: "frigor" }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem(lista, { comprador: FILTRO_TODOS, status: FILTRO_TODOS })).toHaveLength(2);
  });

  it("isola vendas pela fazenda e não busca mais por nome de fazenda", () => {
    const daJ = { ...vendaValidada, fazendaId: 1 };
    const daB = {
      id: 2,
      data: "2026-08-01",
      comprador: "Outro",
      fazendaId: 2,
      fazendaNome: "Fazenda B",
      status: "pendente",
      quantidadeAnimais: 1,
      valorTotalNumero: 100,
    };
    expect(filtrarVendasListagem([daJ, daB], { fazendaId: 1 }).map(v => v.id)).toEqual([1]);
    expect(filtrarVendasListagem([daJ, daB], { fazendaId: 2 }).map(v => v.id)).toEqual([2]);
    expect(filtrarVendasListagem([daJ], { busca: "fazenda" })).toEqual([]);
    expect(filtrarVendasListagem([daJ], { busca: "2026-09-19" }).map(v => v.id)).toEqual([1]);
  });

  it("rodapé exclui cancelada, mas soma quando o filtro é só canceladas", () => {
    const cancelada = {
      ...vendaValidada,
      id: 3,
      status: "cancelado",
      quantidadeAnimais: 5,
      pesoTotal: 900,
      valorTotalNumero: 1000,
    };
    expect(vendasParaTotaisRodape([vendaValidada, cancelada]).map(v => v.id)).toEqual([1]);
    expect(vendasParaTotaisRodape([cancelada]).map(v => v.id)).toEqual([3]);
    expect(vendasParaTotaisRodape([])).toEqual([]);
  });
});
