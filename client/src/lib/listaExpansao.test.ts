import { describe, expect, it } from "vitest";
import { acoesMenuManutencao } from "@shared/manutencaoAcoes";
import { rotuloOrigemPeca } from "@shared/manutencaoPecasFormulario";
import { ordenarManutencoesListagem, paginarManutencoesListagem } from "./manutencaoListagem";
import {
  acoesAbastecimentoLista,
  camposOpcionaisDetalheManutencao,
  rotuloStatusAbastecimentoLista,
  rotuloStatusManutencaoLista,
  rotuloTipoExecucaoLista,
  toggleExpandedId,
} from "./listaExpansao";

describe("expansão da lista", () => {
  it("abre, fecha e mantém várias linhas abertas", () => {
    let ids = new Set<number>();
    ids = toggleExpandedId(ids, 54);
    ids = toggleExpandedId(ids, 13);
    expect([...ids]).toEqual([54, 13]);
    ids = toggleExpandedId(ids, 54);
    expect([...ids]).toEqual([13]);
  });

  it("não altera ordenação nem paginação", () => {
    const rows = [
      { id: 1, data: "2026-10-10", createdAt: "2026-10-10T08:00:00.000Z" },
      { id: 3, data: "2026-10-14", createdAt: "2026-10-14T16:00:00.000Z" },
      { id: 2, data: "2026-10-14", createdAt: "2026-10-14T09:00:00.000Z" },
    ];
    const ordenadas = ordenarManutencoesListagem(rows);
    toggleExpandedId(new Set([2, 3]), 1);
    expect(ordenadas.map(r => r.id)).toEqual([3, 2, 1]);
    expect(paginarManutencoesListagem(ordenadas, 1, 2).map(r => r.id)).toEqual([3, 2]);
  });
});

describe("detalhes da manutenção", () => {
  it("interna esconde mão de obra e valor cobrado", () => {
    const c = camposOpcionaisDetalheManutencao({ tipoExecucao: "interna" });
    expect(c.maoObra).toBe(false);
    expect(c.valorCobradoOficina).toBe(false);
    expect(rotuloTipoExecucaoLista("interna")).toBe("Interna");
    expect(acoesMenuManutencao("concluida")).toEqual({ podeEstornar: true, podeExcluir: false });
  });

  it("terceirizada mostra mão de obra e valor cobrado", () => {
    const c = camposOpcionaisDetalheManutencao({
      tipoExecucao: "externa",
      prestadorContato: "(99) 98789-0998",
    });
    expect(c.maoObra).toBe(true);
    expect(c.valorCobradoOficina).toBe(true);
    expect(c.telefone).toBe(true);
    expect(rotuloTipoExecucaoLista("externa")).toBe("Prestador externo");
  });

  it("identifica origem das peças", () => {
    expect(rotuloOrigemPeca({ nome: "Parafuso", quantidade: 1, valorUnitario: 25, estoqueId: 33 })).toBe(
      "Estoque",
    );
    expect(rotuloOrigemPeca({ nome: "Rolamento", quantidade: 1, valorUnitario: 55, origem: "oficina" })).toBe(
      "Oficina",
    );
  });

  it("OS estornada só consulta", () => {
    expect(rotuloStatusManutencaoLista("estornado")).toBe("Estornada");
    expect(acoesMenuManutencao("estornado")).toEqual({ podeEstornar: false, podeExcluir: false });
  });
});

describe("ações do abastecimento", () => {
  it("estoque da fazenda oferece estorno", () => {
    expect(
      acoesAbastecimentoLista({ abastecidoNaFazenda: true, fazendaId: 1, status: "registrado" }),
    ).toEqual({ podeEditar: true, podeEstornar: true, podeExcluir: false });
  });

  it("externo oferece exclusão definitiva", () => {
    expect(
      acoesAbastecimentoLista({ abastecidoNaFazenda: false, fazendaId: null, status: "registrado" }),
    ).toEqual({ podeEditar: true, podeEstornar: false, podeExcluir: true });
  });

  it("estornado fica só consulta", () => {
    expect(
      acoesAbastecimentoLista({ abastecidoNaFazenda: true, fazendaId: 1, status: "estornado" }),
    ).toEqual({ podeEditar: false, podeEstornar: false, podeExcluir: false });
    expect(rotuloStatusAbastecimentoLista("estornado")).toBe("Estornado");
  });
});
