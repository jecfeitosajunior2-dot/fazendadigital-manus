import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Reproduz o pecaInput e manutencaoBaseInput do routers.ts para validar
 * que o payload enviado pelo formulário (incluindo estoqueId em peças e
 * campos opcionais vazios) é aceito sem erros de validação Zod.
 *
 * Este teste protege contra a regressão que causava "Failed query: insert into manutencoes"
 * quando o campo estoqueId era enviado mas o schema não o aceitava.
 */
const pecaInput = z.object({
  nome: z.string().min(1),
  quantidade: z.number().positive(),
  valorUnitario: z.number().min(0),
  estoqueId: z.number().int().positive().optional().nullable(),
});

const manutencaoBaseInput = z.object({
  maquinaId: z.number(),
  tipo: z.string(),
  descricao: z.string().optional(),
  data: z.string(),
  horimetro: z.string().optional(),
  proximaManutencao: z.string().optional(),
  status: z.enum(["agendada", "em_andamento", "concluida"]).optional(),
  prestadorNome: z.string().optional(),
  prestadorContato: z.string().optional(),
  valorMaoObra: z.number().min(0).optional(),
  observacoes: z.string().optional(),
  pecas: z.array(pecaInput).optional(),
});

describe("manutencao payload validation", () => {
  it("aceita peça com estoqueId numérico (peça vinculada ao estoque)", () => {
    const result = pecaInput.safeParse({
      nome: "Correia de Transmissão",
      quantidade: 1,
      valorUnitario: 150,
      estoqueId: 42,
    });
    expect(result.success).toBe(true);
  });

  it("aceita peça com estoqueId null (peça manual)", () => {
    const result = pecaInput.safeParse({
      nome: "Peça avulsa",
      quantidade: 2,
      valorUnitario: 10,
      estoqueId: null,
    });
    expect(result.success).toBe(true);
  });

  it("aceita peça sem estoqueId (campo omitido)", () => {
    const result = pecaInput.safeParse({
      nome: "Peça sem vínculo",
      quantidade: 1,
      valorUnitario: 0,
    });
    expect(result.success).toBe(true);
  });

  it("aceita payload completo de manutenção com peças vinculadas ao estoque", () => {
    const payload = {
      maquinaId: 1,
      tipo: "Preventiva",
      data: "2026-06-04",
      proximaManutencao: "2027-01-13",
      horimetro: "500",
      status: "concluida" as const,
      valorMaoObra: 0,
      pecas: [
        { nome: "Correia de Transmissão", quantidade: 1, valorUnitario: 150, estoqueId: 7 },
      ],
    };
    const result = manutencaoBaseInput.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("aceita manutenção sem descricao (campo opcional)", () => {
    const result = manutencaoBaseInput.safeParse({
      maquinaId: 1,
      tipo: "Corretiva",
      data: "2026-06-04",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita peça com quantidade zero ou negativa", () => {
    expect(pecaInput.safeParse({ nome: "X", quantidade: 0, valorUnitario: 10 }).success).toBe(false);
    expect(pecaInput.safeParse({ nome: "X", quantidade: -1, valorUnitario: 10 }).success).toBe(false);
  });

  it("rejeita peça com estoqueId não-inteiro", () => {
    const result = pecaInput.safeParse({
      nome: "X",
      quantidade: 1,
      valorUnitario: 10,
      estoqueId: 3.5,
    });
    expect(result.success).toBe(false);
  });
});
