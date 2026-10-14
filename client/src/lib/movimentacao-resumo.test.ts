import { describe, expect, it } from "vitest";
import {
  agruparMovimentacoes,
  chaveGrupoMovimentacao,
  podeOferecerEstornoGenerico,
  rotuloMovimentacaoEstorno,
  textoResultadoEstornoNoEstoque,
} from "./movimentacao-resumo";

describe("listagem insumos — novo × legado", () => {
  it("CASO V — novo agrupa por operacao_id; legado por grupo_id", () => {
    expect(chaveGrupoMovimentacao({ id: 1, operacaoId: 82, grupoId: "abc" })).toBe("op:82");
    expect(chaveGrupoMovimentacao({ id: 2, operacaoId: null, grupoId: "abc" })).toBe("g:abc");

    const grupos = agruparMovimentacoes([
      { id: 10, operacaoId: 5, grupoId: "op5", tipo: "Compra", quantidade: 1, valor: "8.00", frete: "0", status: "ativa" },
      { id: 11, operacaoId: 5, grupoId: "op5", tipo: "Compra", quantidade: 1, valor: "2.00", frete: "0", status: "ativa" },
      { id: 20, operacaoId: null, grupoId: "legado-1", tipo: "Compra", quantidade: 1, valor: "50.00", frete: "0", status: "ativa" },
    ]);
    const novo = grupos.find(g => g.movimentacaoId === "op:5");
    const legado = grupos.find(g => g.movimentacaoId === "g:legado-1");
    expect(novo?.itemIds).toEqual([10, 11]);
    expect(legado?.itemIds).toEqual([20]);
  });

  it("CASO U / R — histórico sem operacao_id continua carregando", () => {
    const grupos = agruparMovimentacoes([
      {
        id: 3,
        operacaoId: null,
        grupoId: null,
        tipo: "Compra",
        quantidade: 1,
        valor: "10.00",
        fornecedor: "Premix antigo",
        notaFiscal: "NF-1",
        fazendaId: 1,
        dataMovimentacao: "2024-01-01",
        status: "ativa",
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.movimentacaoId.startsWith("op:")).toBe(false);
  });
});

describe("texto do resultado do estorno", () => {
  it("CASO A — Entrada 1 sc estornada indica retirada", () => {
    expect(
      textoResultadoEstornoNoEstoque([{ nome: "Sal", quantidade: 1, unidade: "sc" }], "entrada"),
    ).toBe("retirada de 1,00 sc do estoque da Fazenda.");

    const grupos = agruparMovimentacoes([
      {
        id: 55,
        operacaoId: 7,
        grupoId: "op7",
        tipo: "Compra",
        quantidade: 1,
        unidade: "sc",
        nome: "Sal Nitrogenado 40 Flex LA",
        status: "estornada",
        estoqueId: 1,
        fazendaId: 1,
      },
      {
        id: 56,
        grupoId: "est7",
        originalGrupoId: "op7",
        tipo: "Compra",
        quantidade: -1,
        unidade: "sc",
        nome: "Sal Nitrogenado 40 Flex LA",
        status: "estorno",
        estoqueId: 1,
        fazendaId: 1,
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.infoEstorno?.resultado).toBe("retirada de 1,00 sc do estoque da Fazenda.");
  });

  it("CASO B — Saída 1 sc estornada indica devolução", () => {
    expect(
      textoResultadoEstornoNoEstoque([{ nome: "Sal", quantidade: 1, unidade: "sc" }], "saida"),
    ).toBe("devolução de 1,00 sc ao estoque da Fazenda.");

    const grupos = agruparMovimentacoes([
      {
        id: 80,
        grupoId: "saida-1",
        tipo: "Consumo interno",
        quantidade: -1,
        unidade: "sc",
        nome: "Sal Nitrogenado 40 Flex LA",
        status: "estornada",
        estoqueId: 1,
        fazendaId: 1,
      },
      {
        id: 81,
        grupoId: "est-saida-1",
        originalGrupoId: "saida-1",
        tipo: "Consumo interno",
        quantidade: 1,
        unidade: "sc",
        nome: "Sal Nitrogenado 40 Flex LA",
        status: "estorno",
        estoqueId: 1,
        fazendaId: 1,
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.infoEstorno?.resultado).toBe("devolução de 1,00 sc ao estoque da Fazenda.");
  });

  it("Sanitário ativo não oferece estorno genérico; genérica ativa oferece", () => {
    const sanitario = agruparMovimentacoes([
      {
        id: 121,
        grupoId: "saude-26",
        tipo: "Saída",
        manejo: "Sanitário",
        quantidade: -1,
        status: "ativa",
      },
    ]);
    expect(podeOferecerEstornoGenerico(sanitario[0]!)).toBe(false);

    const generica = agruparMovimentacoes([
      {
        id: 50,
        grupoId: "consumo-1",
        tipo: "Consumo interno",
        manejo: "Consumo interno",
        quantidade: -2,
        status: "ativa",
      },
    ]);
    expect(podeOferecerEstornoGenerico(generica[0]!)).toBe(true);

    const estornada = agruparMovimentacoes([
      {
        id: 121,
        grupoId: "saude-26",
        tipo: "Saída",
        manejo: "Sanitário",
        quantidade: -1,
        status: "estornada",
      },
      {
        id: 126,
        grupoId: "e-saude-26",
        originalGrupoId: "saude-26",
        tipo: "Saída",
        manejo: "Sanitário",
        quantidade: 1,
        status: "estorno",
        createdAtCivil: "2026-10-13 19:25:37",
      },
    ]);
    expect(podeOferecerEstornoGenerico(estornada[0]!)).toBe(false);
    expect(estornada[0]?.infoEstorno?.dataHoraLabel).toBe("13/10/2026 às 19:25");
  });

  it("Manutenção ativa não oferece estorno genérico", () => {
    const manutencao = agruparMovimentacoes([
      {
        id: 201,
        grupoId: "manutencao-12-peca-3",
        tipo: "Saída",
        manejo: "Manutenção",
        quantidade: -2,
        status: "ativa",
      },
    ]);
    expect(podeOferecerEstornoGenerico(manutencao[0]!)).toBe(false);
  });

  it("rótulo da movimentação inversa usa estorno, não devolução", () => {
    expect(rotuloMovimentacaoEstorno(56)).toBe("Movimentação de estorno: Nº 56");
  });

  it("horário do estorno usa relógio civil, não Date/UTC", () => {
    const grupos = agruparMovimentacoes([
      {
        id: 121,
        grupoId: "saude-26",
        tipo: "Saída",
        quantidade: -1,
        status: "estornada",
        createdAt: "2026-10-13T19:25:37.000Z",
      },
      {
        id: 126,
        grupoId: "e-saude-26",
        originalGrupoId: "saude-26",
        tipo: "Saída",
        quantidade: 1,
        status: "estorno",
        createdAt: "2026-10-13T19:25:37.000Z",
        createdAtCivil: "2026-10-13 19:25:37",
      },
    ]);
    expect(grupos[0]?.infoEstorno?.dataHoraLabel).toBe("13/10/2026 às 19:25");
    expect(grupos[0]?.infoEstorno?.dataHora).toBe("2026-10-13 19:25:37");
  });
});
