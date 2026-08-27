import { describe, expect, it } from "vitest";
import {
  resolveReproReprodutorDisplay,
  SEMEN_REPRODUTOR_NAO_INFORMADO_KEY,
  SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
} from "../shared/reproReprodutorDisplay";

describe("resolveReproReprodutorDisplay", () => {
  it("legado com partida no campo r vira Não informado", () => {
    const r = resolveReproReprodutorDisplay({
      reprodutorSemen: "P-10FAZ",
      partidaSemen: "P-10FAZ",
    });
    expect(r.reprodutorDisplay).toBe(SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL);
    expect(r.reprodutorKey).toBe(SEMEN_REPRODUTOR_NAO_INFORMADO_KEY);
    expect(r.conhecido).toBe(false);
  });

  it("externo válido permanece GSC-7117", () => {
    const r = resolveReproReprodutorDisplay({
      reprodutorSemen: "GSC-7117",
      partidaSemen: "Sem lote",
    });
    expect(r.reprodutorDisplay).toBe("GSC-7117");
    expect(r.conhecido).toBe(true);
    expect(r.reprodutorDisplay).not.toMatch(/Sem lote/i);
  });

  it("interno usa brinco humano e ignora partida", () => {
    const r = resolveReproReprodutorDisplay({
      machoId: 16,
      reprodutorSemen: "P-10FAZ",
      partidaSemen: "P-10FAZ",
      macho: { brinco: "16", nome: "Touro Teste" },
    });
    expect(r.reprodutorDisplay).toBe("16");
    expect(r.machoId).toBe(16);
    expect(r.origem).toBe("interno");
    expect(r.reprodutorDisplay).not.toBe("P-10FAZ");
    expect(r.reprodutorDisplay).not.toContain("#");
  });

  it("não infere touro 16 só porque a partida é P-10FAZ", () => {
    const legado = resolveReproReprodutorDisplay({
      reprodutorSemen: "P-10FAZ",
      partidaSemen: "P-10FAZ",
    });
    const interno = resolveReproReprodutorDisplay({
      machoId: 16,
      partidaSemen: "P-10FAZ",
      macho: { brinco: "16" },
    });
    expect(legado.reprodutorDisplay).toBe(SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL);
    expect(interno.reprodutorDisplay).toBe("16");
    expect(legado.reprodutorKey).not.toBe(interno.reprodutorKey);
  });

  it("nunca devolve a partida como label de Reprodutor", () => {
    const casos = [
      resolveReproReprodutorDisplay({ reprodutorSemen: "P-10FAZ", partidaSemen: "P-10FAZ" }),
      resolveReproReprodutorDisplay({
        machoId: 16,
        reprodutorSemen: "P-10FAZ",
        partidaSemen: "P-10FAZ",
        macho: { brinco: "16" },
      }),
      resolveReproReprodutorDisplay({
        reprodutorSemen: "P-10FAZ",
        partidaSemen: "P-10FAZ",
        cadastro: { reprodutorTexto: "P-10FAZ" },
      }),
    ];
    for (const r of casos) {
      expect(r.reprodutorDisplay).not.toBe("P-10FAZ");
    }
  });
});
