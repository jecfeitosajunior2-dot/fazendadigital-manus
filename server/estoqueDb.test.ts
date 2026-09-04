import { describe, expect, it } from "vitest";
import { configParaFazenda, toEstoqueInsertValues, toEstoqueSyncFromCatalogo } from "./estoqueDb";

describe("toEstoqueInsertValues", () => {
  it("mapeia cadastro básico de produto nutricional", () => {
    const row = toEstoqueInsertValues({
      fazendaId: 2,
      nome: "Sal Mineral",
      categoria: "Nutricionais",
      subcategoria: "Sal branco",
      unidade: "sc",
      quantidadeMinima: "10",
      quantidadeMaxima: "50",
      fabricante: "Outro",
      produzidoNaFazenda: false,
      monitorarEstoque: true,
      situacao: "ativo",
      possuiCarencia: false,
    });

    expect(row.nome).toBe("Sal Mineral");
    expect(row.categoria).toBe("Nutricionais");
    expect(row.subcategoria).toBe("Sal branco");
    expect(row.unidade).toBe("sc");
    expect(row.quantidade).toBe("0");
    expect(row.quantidadeMinima).toBe("10");
    expect(row.quantidadeMaxima).toBe("50");
    expect(row.fabricante).toBe("Outro");
    expect(row.fazendaId).toBe(2);
    expect(row.produtoId).toBeNull();
    expect(row.possuiCarencia).toBe(false);
    expect(row.carenciaAbateDias).toBeNull();
    expect(row.carenciaAbateUnidade).toBeNull();
    expect(row.monitorarEstoque).toBe(true);
    expect(row.controlarSaldo).toBe(true);
  });

  it("inclui carência apenas quando possuiCarencia", () => {
    const row = toEstoqueInsertValues({
      nome: "Ivermectina",
      categoria: "Farmácia",
      subcategoria: "Vermífugo",
      unidade: "ml",
      monitorarEstoque: false,
      possuiCarencia: true,
      carenciaAbateDias: 30,
      carenciaAbateUnidade: "d",
    });

    expect(row.carenciaAbateDias).toBe(30);
    expect(row.carenciaAbateUnidade).toBe("d");
  });

  it("aplica config operacional por fazenda sem copiar entre fazendas", () => {
    const input = {
      nome: "Latego de Cia",
      categoria: "Nutricionais",
      subcategoria: "",
      unidade: "kg",
      estoquesConfig: [
        {
          fazendaId: 1,
          produzidoNaFazenda: true,
          monitorarEstoque: true,
          quantidadeMinima: "10",
          quantidadeMaxima: null,
        },
        {
          fazendaId: 2,
          produzidoNaFazenda: false,
          monitorarEstoque: false,
        },
      ],
    };

    const b = configParaFazenda(input, 1);
    const j = configParaFazenda(input, 2);
    expect(b.produzidoNaFazenda).toBe(true);
    expect(b.monitorarEstoque).toBe(true);
    expect(b.quantidadeMinima).toBe("10");
    expect(j.produzidoNaFazenda).toBe(false);
    expect(j.monitorarEstoque).toBe(false);
    expect(j.quantidadeMinima).toBeNull();

    const peca = configParaFazenda(
      {
        nome: "Óleo 2T",
        categoria: "Lubrificantes",
        subcategoria: "",
        unidade: "L",
        estoquesConfig: [
          {
            fazendaId: 3,
            controlarSaldo: false,
            monitorarEstoque: true,
            quantidadeMinima: "5",
          },
        ],
      },
      3,
    );
    expect(peca.controlarSaldo).toBe(false);
    expect(peca.monitorarEstoque).toBe(false);
    expect(peca.quantidadeMinima).toBeNull();

    const sync = toEstoqueSyncFromCatalogo({
      nome: "Latego de Cia",
      categoria: "Nutricionais",
      subcategoria: null,
      unidade: "kg",
      fabricante: null,
      identificadorUnico: null,
      produzidoNaFazenda: false,
      monitorarEstoque: true,
      situacao: "ativo",
      embalagens: null,
      possuiCarencia: false,
      carenciaAbateDias: null,
      carenciaAbateUnidade: null,
      carenciaLeiteDias: null,
      observacoesCarencia: null,
      observacoes: null,
    });
    expect(sync).not.toHaveProperty("produzidoNaFazenda");
    expect(sync).not.toHaveProperty("monitorarEstoque");
    expect(sync).not.toHaveProperty("quantidadeMinima");
    expect(sync).not.toHaveProperty("situacao");
  });
});
