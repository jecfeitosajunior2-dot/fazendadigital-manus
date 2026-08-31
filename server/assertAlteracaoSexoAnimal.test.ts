import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertResultadoAlteracaoSexo } from "./assertAlteracaoSexoAnimal";
import {
  coletarEvidenciasAlteracaoSexo,
  precisaValidarAlteracaoSexo,
  validarAlteracaoSexoAnimal,
} from "../shared/validarAlteracaoSexoAnimal";

/** Espelha o gate do animais.update: só valida troca real; backend é autoridade. */
function avaliarUpdateSexoDireto(params: {
  sexoAtual: string;
  novoSexo?: string;
  castradoAtual?: boolean | null;
  saudeTipos?: string[];
  descendentes?: Array<{ paiId?: number | null; maeId?: number | null }>;
  reproRegistros?: Array<{
    tipo: string;
    femeaId: number;
    machoId?: number | null;
    observacoes?: string | null;
  }>;
  animalId?: number;
}) {
  if (!precisaValidarAlteracaoSexo(params.sexoAtual, params.novoSexo)) {
    return { permitido: true as const };
  }
  return validarAlteracaoSexoAnimal({
    sexoAtual: params.sexoAtual,
    novoSexo: params.novoSexo,
    evidencias: coletarEvidenciasAlteracaoSexo({
      animalId: params.animalId ?? 1,
      castradoAtual: params.castradoAtual,
      saudeTipos: params.saudeTipos,
      descendentes: params.descendentes,
      reproRegistros: params.reproRegistros,
    }),
  });
}

describe("assertAlteracaoSexoAnimal — chamada direta / API", () => {
  it("Teste P: backend bloqueia macho castrado tentando virar fêmea", () => {
    const r = avaliarUpdateSexoDireto({
      sexoAtual: "macho",
      novoSexo: "femea",
      saudeTipos: ["Castração"],
    });
    expect(r.permitido).toBe(false);
    expect(() => assertResultadoAlteracaoSexo(r)).toThrow(TRPCError);
    try {
      assertResultadoAlteracaoSexo(r);
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const trpc = err as TRPCError;
      expect(trpc.code).toBe("BAD_REQUEST");
      expect(trpc.message).toMatch(/castração/i);
    }
  });

  it("Teste P: backend bloqueia fêmea com IA tentando virar macho", () => {
    const r = avaliarUpdateSexoDireto({
      sexoAtual: "femea",
      novoSexo: "macho",
      animalId: 15,
      reproRegistros: [{ tipo: "Inseminação", femeaId: 15 }],
    });
    expect(r.permitido).toBe(false);
    expect(() => assertResultadoAlteracaoSexo(r)).toThrow(TRPCError);
  });

  it("Teste O: mesmo sexo na API não gera erro mesmo com castração", () => {
    const r = avaliarUpdateSexoDireto({
      sexoAtual: "macho",
      novoSexo: "macho",
      saudeTipos: ["Castração"],
      descendentes: [{ paiId: 1 }],
    });
    expect(r.permitido).toBe(true);
    expect(() => assertResultadoAlteracaoSexo(r)).not.toThrow();
  });

  it("Teste M: payload sem troca de sexo (categoria) não aciona bloqueio", () => {
    const r = avaliarUpdateSexoDireto({
      sexoAtual: "femea",
      novoSexo: undefined,
      reproRegistros: [{ tipo: "Parto", femeaId: 1 }],
    });
    expect(r.permitido).toBe(true);
  });

  it("eventos neutros na API não bloqueiam correção", () => {
    const macho = avaliarUpdateSexoDireto({
      sexoAtual: "macho",
      novoSexo: "femea",
      castradoAtual: null,
      saudeTipos: ["Vacinação", "Tratamento"],
    });
    const femea = avaliarUpdateSexoDireto({
      sexoAtual: "femea",
      novoSexo: "macho",
      saudeTipos: ["Vermifugação"],
      reproRegistros: [{ tipo: "Desmama", femeaId: 1 }],
    });
    expect(macho.permitido).toBe(true);
    expect(femea.permitido).toBe(true);
  });
});
