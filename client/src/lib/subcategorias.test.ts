import { describe, it, expect } from "vitest";
import { CATEGORIAS_PRODUTO, SUBCATEGORIAS } from "./produto-types";

describe("SUBCATEGORIAS — mapeamento por categoria", () => {
  it("toda categoria principal possui uma lista de subcategorias", () => {
    for (const categoria of CATEGORIAS_PRODUTO) {
      expect(SUBCATEGORIAS[categoria], `faltam subcategorias para ${categoria}`).toBeDefined();
      expect(Array.isArray(SUBCATEGORIAS[categoria])).toBe(true);
      expect(SUBCATEGORIAS[categoria].length).toBeGreaterThan(0);
    }
  });

  it("nenhuma subcategoria é vazia ou duplicada dentro da categoria", () => {
    for (const categoria of CATEGORIAS_PRODUTO) {
      const lista = SUBCATEGORIAS[categoria];
      lista.forEach(sub => {
        expect(sub.trim().length).toBeGreaterThan(0);
      });
      const unicas = new Set(lista);
      expect(unicas.size, `subcategorias duplicadas em ${categoria}`).toBe(lista.length);
    }
  });

  it("Farmácia contém as principais subcategorias clínicas", () => {
    const lista = SUBCATEGORIAS["Farmácia"];
    ["Vacina", "Antibiótico", "Vermífugo", "Carrapaticida", "Anestesia", "Seringa"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(39);
  });

  it("Nutricionais contém suplementos e rações esperados", () => {
    const lista = SUBCATEGORIAS["Nutricionais"];
    ["Volumoso", "Concentrado", "Ração confinamento", "Suplemento proteico", "Núcleo mineral"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(18);
  });

  it("Combustíveis contém os tipos esperados", () => {
    const lista = SUBCATEGORIAS["Combustíveis"];
    ["Diesel", "Etanol", "Gasolina", "Aviação"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(4);
  });

  it("Lubrificantes contém os tipos de óleo esperados", () => {
    const lista = SUBCATEGORIAS["Lubrificantes"];
    ["Mineral", "Sintético", "Semissintético"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(3);
  });

  it("Ferramentas contém ferramentas manuais e elétricas", () => {
    const lista = SUBCATEGORIAS["Ferramentas"];
    ["Chave Philips", "Alicate", "Furadeira", "Moto-serra", "Enxada"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(18);
  });

  it("Peças contém os grupos de origem esperados", () => {
    const lista = SUBCATEGORIAS["Peças"];
    ["Máquinas", "Veículos", "Aeronave", "Implementos agrícolas", "Motos", "Canoas", "Diversos"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(7);
  });

  it("Agrícolas contém defensivos e fertilizantes esperados", () => {
    const lista = SUBCATEGORIAS["Agrícolas"];
    ["Fungicida", "Inseticida", "Herbicida", "Sementes", "Fertilizantes Foliar", "Fertilizantes Mineral"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(10);
  });

  it("Epis contém os equipamentos de proteção esperados", () => {
    const lista = SUBCATEGORIAS["Epis"];
    ["Capacete", "Óculos", "Máscara", "Luva", "Protetor auricular", "Capa protetora"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(7);
  });

  it("Outros Insumos contém itens de curral e identificação", () => {
    const lista = SUBCATEGORIAS["Outros Insumos"];
    ["Arame", "Porteira", "Cocho", "Brinco eletrônico", "Brinco SISBOV", "Peças de curral"].forEach(item => {
      expect(lista).toContain(item);
    });
    expect(lista.length).toBe(16);
  });
});
