import { describe, it, expect } from "vitest";

/**
 * Função pura que mapeia dados de uma máquina para o estado do formulário.
 * Usada para validar que tipo/fazendaId/marca são preenchidos corretamente na edição.
 */
export function mapMaquinaToFormState(maquina: {
  tipo?: string | null;
  fazendaId?: number | null;
  marca?: string | null;
  nome?: string | null;
  valor?: string | number | null;
  modelo?: string | null;
  placa?: string | null;
  ano?: number | null;
  anoAquisicao?: number | null;
  vidaUtil?: string | null;
  dataDesativacao?: string | Date | null;
  estado?: string | null;
  observacoes?: string | null;
}) {
  return {
    tipo: maquina.tipo || "",
    fazendaId: maquina.fazendaId != null ? String(maquina.fazendaId) : "",
    marca: maquina.marca || "",
    apelido: maquina.nome || "",
    modelo: maquina.modelo || "",
    placa: maquina.placa || "",
    anoFabricacao: maquina.ano ? String(maquina.ano) : "",
    anoAquisicao: maquina.anoAquisicao ? String(maquina.anoAquisicao) : "",
    vidaUtil: maquina.vidaUtil || "",
    dataDesativacao: "",
    estado: maquina.estado === "usado" ? "usado" : "novo",
    observacoes: maquina.observacoes || "",
  };
}

describe("Maquina Form Initialization", () => {
  it("deve preencher tipo, fazendaId e marca quando editar maquinário", () => {
    const maquina = {
      tipo: "Trator",
      fazendaId: 123,
      marca: "Case IH",
      nome: "Trator Principal",
      valor: "150000",
      modelo: "MX 240",
      placa: "ABC1234",
      ano: 2020,
      anoAquisicao: 2020,
      vidaUtil: "10 anos",
      estado: "novo",
      observacoes: "Em perfeito estado",
    };

    const form = mapMaquinaToFormState(maquina);

    // Validar que os 3 campos críticos não ficam vazios
    expect(form.tipo).toBe("Trator");
    expect(form.fazendaId).toBe("123");
    expect(form.marca).toBe("Case IH");

    // Validar que outros campos também são preenchidos
    expect(form.apelido).toBe("Trator Principal");
    expect(form.modelo).toBe("MX 240");
    expect(form.placa).toBe("ABC1234");
    expect(form.anoFabricacao).toBe("2020");
    expect(form.estado).toBe("novo");
  });

  it("deve manter campos vazios quando valores são null/undefined", () => {
    const maquina = {
      tipo: null,
      fazendaId: null,
      marca: null,
      nome: null,
    };

    const form = mapMaquinaToFormState(maquina);

    expect(form.tipo).toBe("");
    expect(form.fazendaId).toBe("");
    expect(form.marca).toBe("");
    expect(form.apelido).toBe("");
  });

  it("deve converter fazendaId number para string", () => {
    const maquina = {
      fazendaId: 456,
    };

    const form = mapMaquinaToFormState(maquina);

    expect(form.fazendaId).toBe("456");
    expect(typeof form.fazendaId).toBe("string");
  });

  it("deve converter estado 'usado' corretamente", () => {
    const maquinaUsada = { estado: "usado" };
    const maquinaNovaOuOutro = { estado: "novo" };
    const maquinaSemEstado = {};

    expect(mapMaquinaToFormState(maquinaUsada).estado).toBe("usado");
    expect(mapMaquinaToFormState(maquinaNovaOuOutro).estado).toBe("novo");
    expect(mapMaquinaToFormState(maquinaSemEstado).estado).toBe("novo");
  });

  it("deve preencher corretamente com valores parciais", () => {
    const maquina = {
      tipo: "Colheitadeira",
      marca: "John Deere",
      // fazendaId ausente — deve ficar vazio
      nome: "Colheitadeira 1",
    };

    const form = mapMaquinaToFormState(maquina);

    expect(form.tipo).toBe("Colheitadeira");
    expect(form.marca).toBe("John Deere");
    expect(form.fazendaId).toBe(""); // Não preenchido
    expect(form.apelido).toBe("Colheitadeira 1");
  });
});
