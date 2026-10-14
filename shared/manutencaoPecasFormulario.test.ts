import { describe, expect, it } from "vitest";
import { MSG_MANUT_OFICINA_SO_TERCEIRIZADA } from "./manutencaoPecasOrigem";
import { validarPecasOficinaNaExecucao } from "./manutencaoPecasOrigem";
import {
  deveExibirRotuloOrigemPeca,
  payloadPecaManutencao,
  pecaItemDeRegistro,
  podeExibirOrigemOficina,
  podeMostrarFormularioEstoque,
  podeMostrarFormularioOficina,
  podeRemoverPecaNaEdicao,
  podeTrocarParaInterna,
  prepararPecaOficinaDoFormulario,
  resumoCustosFormulario,
  rotuloOrigemPeca,
} from "./manutencaoPecasFormulario";

const pecaEstoque = {
  nome: "Parafuso do Eixo",
  quantidade: 1,
  valorUnitario: 25,
  estoqueId: 33,
  origem: "estoque",
};

const pecaOficina = {
  nome: "Retentor",
  quantidade: 2,
  valorUnitario: 40,
  origem: "oficina",
};

describe("formulário — tipo de execução", () => {
  it("manutenção interna não mostra origem da oficina", () => {
    expect(podeExibirOrigemOficina("interna")).toBe(false);
    expect(podeMostrarFormularioOficina({ tipoExecucao: "interna", origemPeca: "oficina" })).toBe(false);
    expect(podeMostrarFormularioEstoque({ patrimonializada: false, origemPeca: "estoque" })).toBe(true);
  });

  it("manutenção externa mostra as duas origens", () => {
    expect(podeExibirOrigemOficina("externa")).toBe(true);
    expect(podeMostrarFormularioOficina({ tipoExecucao: "externa", origemPeca: "oficina" })).toBe(true);
    expect(podeMostrarFormularioEstoque({ patrimonializada: false, origemPeca: "estoque" })).toBe(true);
  });

  it("bloqueia mudar para interna se já existe peça da oficina", () => {
    expect(podeTrocarParaInterna([pecaOficina])).toEqual({
      ok: false,
      message: "Remova as peças da oficina antes de mudar para manutenção interna.",
    });
    expect(podeTrocarParaInterna([pecaEstoque])).toEqual({ ok: true });
  });
});

describe("formulário — peças e payload", () => {
  it("peça do estoque envia origem estoque e estoqueId", () => {
    expect(payloadPecaManutencao(pecaEstoque)).toEqual({
      nome: "Parafuso do Eixo",
      quantidade: 1,
      valorUnitario: 25,
      estoqueId: 33,
      origem: "estoque",
    });
  });

  it("peça da oficina envia origem oficina sem estoqueId", () => {
    expect(payloadPecaManutencao(pecaOficina)).toEqual({
      nome: "Retentor",
      quantidade: 2,
      valorUnitario: 40,
      origem: "oficina",
    });
    expect(payloadPecaManutencao(pecaOficina).estoqueId).toBeUndefined();
  });

  it("aceita as duas origens no mesmo payload", () => {
    const payload = [pecaEstoque, pecaOficina].map(payloadPecaManutencao);
    expect(payload.map((p) => p.origem)).toEqual(["estoque", "oficina"]);
  });

  it("valida peça da oficina no formulário", () => {
    const ok = prepararPecaOficinaDoFormulario({
      nome: "Retentor",
      quantidade: 2,
      valorUnitario: 40,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.peca.valorTotal).toBe(80);

    expect(prepararPecaOficinaDoFormulario({
      nome: "",
      quantidade: 1,
      valorUnitario: 10,
    }).ok).toBe(false);
    expect(validarPecasOficinaNaExecucao("interna", [pecaOficina])).toEqual({
      ok: false,
      message: MSG_MANUT_OFICINA_SO_TERCEIRIZADA,
    });
  });
});

describe("formulário — totais", () => {
  it("separa estoque, oficina, mão de obra e valor cobrado", () => {
    const c = resumoCustosFormulario([pecaEstoque, pecaOficina], 250);
    expect(c.valorPecasEstoque).toBe(25);
    expect(c.valorPecasOficina).toBe(80);
    expect(c.valorMaoObra).toBe(250);
    expect(c.valorTotal).toBe(355);
    expect(c.valorCobradoOficina).toBe(330);
  });

  it("manutenção interna mantém mão de obra zero e sem cobrado", () => {
    const c = resumoCustosFormulario([pecaEstoque], 0);
    expect(c.valorMaoObra).toBe(0);
    expect(c.valorTotal).toBe(25);
    expect(c.valorCobradoOficina).toBe(0);
  });
});

describe("formulário — edição e histórico", () => {
  it("permite editar peça da oficina mesmo com OS patrimonial", () => {
    expect(podeRemoverPecaNaEdicao(true, pecaOficina)).toBe(true);
    expect(podeMostrarFormularioOficina({ tipoExecucao: "externa", origemPeca: "oficina" })).toBe(true);
  });

  it("bloqueia edição patrimonial da peça do estoque", () => {
    expect(podeRemoverPecaNaEdicao(true, pecaEstoque)).toBe(false);
    expect(podeMostrarFormularioEstoque({ patrimonializada: true, origemPeca: "estoque" })).toBe(false);
  });

  it("registro antigo sem origem e com estoqueId continua estoque", () => {
    const item = pecaItemDeRegistro({
      nome: "Parafuso do Eixo",
      quantidade: "1.00",
      valorUnitario: "25.00",
      estoqueId: 33,
      origem: null,
    });
    expect(item.origem).toBe("estoque");
    expect(rotuloOrigemPeca(item)).toBe("Estoque");
    expect(payloadPecaManutencao(item).origem).toBe("estoque");
    expect(payloadPecaManutencao(item).estoqueId).toBe(33);
  });

  it("registro antigo sem origem e sem estoqueId não vira oficina", () => {
    const item = pecaItemDeRegistro({
      nome: "Peça avulsa antiga",
      quantidade: 1,
      valorUnitario: 10,
    });
    expect(item.origem).toBeNull();
    expect(rotuloOrigemPeca(item)).toBeNull();
    expect(deveExibirRotuloOrigemPeca("interna", [item])).toBe(false);
  });
});
