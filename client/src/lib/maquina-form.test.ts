import { describe, it, expect } from "vitest";
import {
  sugerirTipoMedidor,
  labelIdentificadorMaquina,
} from "@shared/maquina-types";

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
  dataAquisicao?: string | null;
  vidaUtil?: string | null;
  estado?: string | null;
  tipoMedidor?: string | null;
  horimetro?: string | null;
  observacoes?: string | null;
}) {
  return {
    tipo: maquina.tipo || "",
    fazendaId: maquina.fazendaId != null ? String(maquina.fazendaId) : "",
    marca: maquina.marca || "",
    nome: maquina.nome || "",
    modelo: maquina.modelo || "",
    placa: maquina.placa || "",
    anoFabricacao: maquina.ano ? String(maquina.ano) : "",
    dataAquisicao: maquina.dataAquisicao || "",
    vidaUtil: maquina.vidaUtil ? String(maquina.vidaUtil).replace(/[^\d]/g, "") : "",
    estado: maquina.estado === "usado" ? "usado" : "novo",
    tipoMedidor: maquina.tipoMedidor || "",
    leituraInicial: maquina.horimetro || "",
    observacoes: maquina.observacoes || "",
  };
}

describe("Maquina Form Initialization", () => {
  it("deve preencher tipo, fazendaId e marca quando editar máquina", () => {
    const maquina = {
      tipo: "Máquinas",
      fazendaId: 123,
      marca: "Case",
      nome: "Trator Principal",
      valor: "150000",
      modelo: "MX 240",
      placa: "ABC1234",
      ano: 2020,
      dataAquisicao: "2020-06-15",
      vidaUtil: "10",
      estado: "novo",
      tipoMedidor: "horimetro",
      horimetro: "1250.5",
      observacoes: "Em perfeito estado",
    };

    const form = mapMaquinaToFormState(maquina);

    expect(form.tipo).toBe("Máquinas");
    expect(form.fazendaId).toBe("123");
    expect(form.marca).toBe("Case");
    expect(form.nome).toBe("Trator Principal");
    expect(form.modelo).toBe("MX 240");
    expect(form.placa).toBe("ABC1234");
    expect(form.anoFabricacao).toBe("2020");
    expect(form.dataAquisicao).toBe("2020-06-15");
    expect(form.estado).toBe("novo");
    expect(form.tipoMedidor).toBe("horimetro");
    expect(form.leituraInicial).toBe("1250.5");
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
    expect(form.nome).toBe("");
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
    expect(mapMaquinaToFormState({ estado: "usado" }).estado).toBe("usado");
    expect(mapMaquinaToFormState({ estado: "novo" }).estado).toBe("novo");
    expect(mapMaquinaToFormState({}).estado).toBe("novo");
  });
});

describe("sugestão de medidor e label de identificador", () => {
  it("sugere quilometragem para veículos", () => {
    expect(sugerirTipoMedidor("Veículos")).toBe("quilometragem");
  });

  it("sugere horímetro para máquinas", () => {
    expect(sugerirTipoMedidor("Máquinas")).toBe("horimetro");
  });

  it("usa label Placa para veículos", () => {
    expect(labelIdentificadorMaquina("Veículos")).toBe("Placa");
  });

  it("usa número de série para máquinas agrícolas", () => {
    expect(labelIdentificadorMaquina("Máquinas")).toBe("Número de série");
  });
});
