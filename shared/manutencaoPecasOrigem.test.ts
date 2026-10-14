import { describe, expect, it } from "vitest";
import { decidirEstornoManutencao } from "./manutencaoEstoque";
import { resolverValorMaoObraManutencao } from "./manutencaoTipoExecucao";
import { MSG_MANUT_EDICAO_PATRIMONIAL } from "./manutencaoEstoque";
import {
  calcularCustosManutencaoCompletos,
  classificarPecasManutencao,
  estornoCompletoSemMovimentacao,
  MSG_MANUT_OFICINA_SEM_ESTOQUE,
  MSG_MANUT_OFICINA_SO_TERCEIRIZADA,
  MSG_MANUT_ORIGEM_IMUTAVEL,
  pecasParaEstornoPatrimonial,
  validarEdicaoOrigemPecas,
  validarPecaOficina,
  validarPecasOficinaNaExecucao,
  valorPecasEstoqueCongelado,
} from "./manutencaoPecasOrigem";

const pecaEstoque = {
  nome: "Parafuso do Eixo",
  quantidade: 1,
  valorUnitario: 25,
  estoqueId: 33,
};

const pecaOficina = {
  nome: "Retentor",
  quantidade: 2,
  valorUnitario: 40,
  origem: "oficina" as const,
};

describe("classificação de origem das peças", () => {
  it("OS só com peças do estoque", () => {
    const c = classificarPecasManutencao([pecaEstoque]);
    expect(c.estoque).toHaveLength(1);
    expect(c.oficina).toHaveLength(0);
    expect(c.semOrigemSemEstoque).toHaveLength(0);
  });

  it("OS só com peças da oficina", () => {
    const c = classificarPecasManutencao([pecaOficina]);
    expect(c.estoque).toHaveLength(0);
    expect(c.oficina).toHaveLength(1);
    expect(c.semOrigemSemEstoque).toHaveLength(0);
  });

  it("OS com as duas origens", () => {
    const c = classificarPecasManutencao([pecaEstoque, pecaOficina]);
    expect(c.estoque).toHaveLength(1);
    expect(c.oficina).toHaveLength(1);
  });

  it("não converte peça histórica sem origem em oficina", () => {
    const c = classificarPecasManutencao([
      { nome: "Parafuso do Eixo", quantidade: 1, estoqueId: 33 },
      { nome: "Peça avulsa antiga", quantidade: 1, valorUnitario: 10 },
    ]);
    expect(c.estoque).toHaveLength(1);
    expect(c.oficina).toHaveLength(0);
    expect(c.semOrigemSemEstoque).toHaveLength(1);
  });
});

describe("validações da peça da oficina", () => {
  it("rejeita peça da oficina em OS interna", () => {
    expect(validarPecasOficinaNaExecucao("interna", [pecaOficina])).toEqual({
      ok: false,
      message: MSG_MANUT_OFICINA_SO_TERCEIRIZADA,
    });
    expect(validarPecasOficinaNaExecucao(null, [pecaOficina]).ok).toBe(false);
  });

  it("aceita peça da oficina em OS terceirizada", () => {
    expect(validarPecasOficinaNaExecucao("externa", [pecaOficina])).toEqual({ ok: true });
  });

  it("rejeita oficina com estoqueId", () => {
    expect(validarPecaOficina({ ...pecaOficina, estoqueId: 33 })).toEqual({
      ok: false,
      message: MSG_MANUT_OFICINA_SEM_ESTOQUE,
    });
  });

  it("calcula o total no servidor", () => {
    const r = validarPecaOficina(pecaOficina);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.peca.valorTotal).toBe(80);
    expect(r.peca.origem).toBe("oficina");
  });
});

describe("cálculo separado dos custos", () => {
  it("separa estoque, oficina, mão de obra e valor cobrado", () => {
    const c = calcularCustosManutencaoCompletos({
      pecasEstoque: [{ quantidade: 1, valorUnitario: 25 }],
      pecasOficina: [{ quantidade: 2, valorUnitario: 40 }],
      valorMaoObra: 250,
    });
    expect(c.valorPecasEstoque).toBe(25);
    expect(c.valorPecasOficina).toBe(80);
    expect(c.valorMaoObra).toBe(250);
    expect(c.valorPecas).toBe(105);
    expect(c.valorTotal).toBe(355);
    expect(c.valorCobradoOficina).toBe(330);
  });

  it("OS interna com peças do estoque mantém mão de obra zero", () => {
    const mao = resolverValorMaoObraManutencao({ tipoExecucao: "interna", valorMaoObra: 0 });
    expect(mao.ok).toBe(true);
    if (!mao.ok) return;
    const c = calcularCustosManutencaoCompletos({
      pecasEstoque: [{ quantidade: 1, valorUnitario: 25 }],
      pecasOficina: [],
      valorMaoObra: mao.valorMaoObra,
    });
    expect(c.valorMaoObra).toBe(0);
    expect(c.valorTotal).toBe(25);
    expect(c.valorCobradoOficina).toBe(0);
  });
});

describe("estorno patrimonial ignora peça da oficina", () => {
  it("devolve só a movimentação oficial", () => {
    const pecas = [
      { nome: "Parafuso", estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
      { nome: "Retentor", origem: "oficina", quantidade: 2, estoqueMovimentacaoId: null },
    ];
    expect(pecasParaEstornoPatrimonial(pecas).map((p) => p.estoqueMovimentacaoId)).toEqual([156]);

    const decisao = decidirEstornoManutencao({
      status: "concluida",
      pecas,
    });
    expect(decisao).toEqual({ kind: "com_vinculo", movimentacaoIds: [156] });
  });

  it("OS só com oficina não gera consumo patrimonial e permite estorno de registro", () => {
    const kind = decidirEstornoManutencao({
      status: "concluida",
      pecas: [{ nome: "Retentor", origem: "oficina", quantidade: 2, estoqueId: null }],
    }).kind;
    expect(kind).toBe("sem_consumo");
    expect(estornoCompletoSemMovimentacao(kind)).toBe(true);
  });
});

describe("edição não converte origem nem repreça estoque", () => {
  it("congela o total das peças do estoque pelo snapshot gravado", () => {
    expect(valorPecasEstoqueCongelado([
      { origem: "estoque", estoqueId: 33, valorTotal: "25.00", estoqueMovimentacaoId: 156 },
      { origem: "oficina", valorTotal: "80.00" },
    ])).toBe(25);
  });

  it("rejeita converter peça do estoque em oficina", () => {
    expect(validarEdicaoOrigemPecas({
      pecasAntigas: [
        { origem: "estoque", estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
      ],
      pecasEstoqueNovas: [],
      pecasOficinaNovas: [{ origem: "oficina", estoqueId: 33 }],
    })).toEqual({ ok: false, message: MSG_MANUT_ORIGEM_IMUTAVEL, kind: "origem" });
  });

  it("rejeita incluir estoque numa OS que só tinha oficina", () => {
    expect(validarEdicaoOrigemPecas({
      pecasAntigas: [{ origem: "oficina", quantidade: 2 }],
      pecasEstoqueNovas: [{ estoqueId: 33, quantidade: 1 }],
      pecasOficinaNovas: [],
    })).toEqual({ ok: false, message: MSG_MANUT_ORIGEM_IMUTAVEL, kind: "origem" });
  });

  it("bloqueia mudança da quantidade já consumida do estoque", () => {
    expect(validarEdicaoOrigemPecas({
      pecasAntigas: [
        { origem: "estoque", estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
      ],
      pecasEstoqueNovas: [{ estoqueId: 33, quantidade: 2 }],
      pecasOficinaNovas: [{ origem: "oficina" }],
    })).toEqual({ ok: false, message: MSG_MANUT_EDICAO_PATRIMONIAL, kind: "patrimonial" });
  });

  it("aceita editar só a oficina sem mexer no estoque", () => {
    expect(validarEdicaoOrigemPecas({
      pecasAntigas: [
        { origem: "estoque", estoqueId: 33, quantidade: 1, estoqueMovimentacaoId: 156 },
        { origem: "oficina", quantidade: 2 },
      ],
      pecasEstoqueNovas: [{ estoqueId: 33, quantidade: 1 }],
      pecasOficinaNovas: [{ origem: "oficina" }],
    })).toEqual({ ok: true });
  });
});
