import { describe, expect, it } from "vitest";
import {
  calcPrevisaoParto283,
  compareReproEventosAsc,
  compareReproEventosFemeaSituacaoAsc,
  deriveSituacaoReprodutivaAtual,
  getReproFemeaSameDayStagePriority,
  isReproResultadoRequiredManejo,
  reproDataToInputISO,
  validateReproResultadoForSave,
  type ReproRegistroSituacaoInput,
} from "../shared/reproRegistroMeta";

const FEMEA = "femea" as const;

type RegOpts = {
  resultado?: string | null;
  dataCobertura?: string;
  dataPrevistoParto?: string | null;
  createdAt?: string;
};

function reg(
  id: number,
  tipo: string,
  opts: RegOpts = {},
): ReproRegistroSituacaoInput {
  const data = opts.dataCobertura ?? "2026-01-01";
  return {
    id,
    tipo,
    dataCobertura: data,
    resultado: opts.resultado ?? null,
    dataPrevistoParto: opts.dataPrevistoParto ?? null,
    createdAt: opts.createdAt ?? `${data}T12:00:00.000Z`,
  };
}

function concepcao(
  id: number,
  tipo: "Cobertura" | "Inseminação",
  dataCobertura: string,
  createdAt?: string,
): ReproRegistroSituacaoInput {
  return reg(id, tipo, {
    dataCobertura,
    dataPrevistoParto: calcPrevisaoParto283(dataCobertura),
    createdAt,
  });
}

function situacao(registros: ReproRegistroSituacaoInput[]) {
  return deriveSituacaoReprodutivaAtual(registros, FEMEA);
}

describe("deriveSituacaoReprodutivaAtual — comportamento aprovado", () => {
  it("Cobertura sem diagnóstico → Aguardando diagnóstico (não Prenha)", () => {
    const r = situacao([concepcao(1, "Cobertura", "2026-01-01")]);
    expect(r?.situacao).toBe("Aguardando diagnóstico");
    expect(r?.situacao).not.toBe("Prenha");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Inseminação sem diagnóstico → Aguardando diagnóstico (não Prenha)", () => {
    const r = situacao([concepcao(1, "Inseminação", "2026-03-15")]);
    expect(r?.situacao).toBe("Aguardando diagnóstico");
    expect(r?.situacao).not.toBe("Prenha");
  });

  it("Cobertura → Diagnóstico Prenha → Prenha", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
  });

  it("Diagnóstico Prenha → Diagnóstico Vazia → Vazia", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Diagnóstico de prenhez", {
        resultado: "Vazia",
        dataCobertura: "2026-03-01",
      }),
    ]);
    expect(r?.situacao).toBe("Vazia");
    expect(r?.situacao).not.toBe("Prenha");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Diagnóstico Prenha → Aborto Confirmado → Aborto registrado", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Aborto", {
        resultado: "Confirmado",
        dataCobertura: "2026-04-01",
      }),
    ]);
    expect(r?.situacao).toBe("Aborto registrado");
    expect(r?.situacao).not.toBe("Prenha");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Diagnóstico Prenha → Parto → Parto registrado", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Parto", {
        resultado: "Normal",
        dataCobertura: "2026-10-11",
      }),
    ]);
    expect(r?.situacao).toBe("Parto registrado");
    expect(r?.situacao).not.toBe("Prenha");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Diagnóstico Repetir → Diagnóstico Prenha → Prenha", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Repetir",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-03-01",
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
  });

  it("mesma data de manejo — createdAt posterior define estado final", () => {
    const mesmaData = "2026-06-01";
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      reg(3, "Diagnóstico de prenhez", {
        resultado: "Vazia",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T18:00:00.000Z`,
      }),
    ]);
    expect(r?.situacao).toBe("Vazia");
  });

  it("ciclo antigo encerrado → nova concepção → previsão do ciclo atual", () => {
    const r = situacao([
      concepcao(1, "Inseminação", "2025-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Vazia",
        dataCobertura: "2025-02-01",
      }),
      concepcao(3, "Cobertura", "2026-01-01"),
      reg(4, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
    expect(r?.previsaoPartoISO).not.toBe("2025-10-11");
  });

  it("histórico vazio → null", () => {
    expect(deriveSituacaoReprodutivaAtual([], FEMEA)).toBeNull();
  });

  it("sexo não fêmea → null mesmo com registros", () => {
    expect(
      deriveSituacaoReprodutivaAtual([concepcao(1, "Cobertura", "2026-01-01")], "macho"),
    ).toBeNull();
  });

  it("Diagnóstico Prenha → Aborto Suspeito → Aborto suspeito com previsão mantida", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Aborto", {
        resultado: "Suspeito",
        dataCobertura: "2026-04-01",
      }),
    ]);
    expect(r?.situacao).toBe("Aborto suspeito");
    expect(r?.situacao).not.toBe("Aborto registrado");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
  });

  it("Prenha → Aborto Suspeito → Diagnóstico Prenha → Prenha", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Aborto", {
        resultado: "Suspeito",
        dataCobertura: "2026-04-01",
      }),
      reg(4, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-05-01",
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
  });

  it("Prenha → Aborto Suspeito → Diagnóstico Vazia → Vazia", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Aborto", {
        resultado: "Suspeito",
        dataCobertura: "2026-04-01",
      }),
      reg(4, "Diagnóstico de prenhez", {
        resultado: "Vazia",
        dataCobertura: "2026-05-01",
      }),
    ]);
    expect(r?.situacao).toBe("Vazia");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Prenha → Aborto Suspeito → Aborto Confirmado → Aborto registrado", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Aborto", {
        resultado: "Suspeito",
        dataCobertura: "2026-04-01",
      }),
      reg(4, "Aborto", {
        resultado: "Confirmado",
        dataCobertura: "2026-05-01",
      }),
    ]);
    expect(r?.situacao).toBe("Aborto registrado");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Diagnóstico Outro após Prenha preserva Prenha e previsão", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Diagnóstico de prenhez", {
        resultado: "Outro",
        dataCobertura: "2026-03-01",
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
  });

  it("Aborto Outro encerra gestação (comportamento legado mantido)", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Aborto", {
        resultado: "Outro",
        dataCobertura: "2026-04-01",
      }),
    ]);
    expect(r?.situacao).toBe("Aborto registrado");
    expect(r?.previsaoPartoISO).toBeNull();
  });

  it("Cio após Prenha não encerra gestação (evento irrelevante)", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2026-02-01",
      }),
      reg(3, "Cio", {
        dataCobertura: "2026-05-01",
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-10-11");
  });
});

describe("deriveSituacaoReprodutivaAtual — prioridade semântica no mesmo dia", () => {
  const mesmaData = "2025-11-14";
  const previsao = calcPrevisaoParto283(mesmaData);

  it("Diagnóstico Prenha criado primeiro, Cobertura criada depois → Prenha", () => {
    const r = situacao([
      reg(1, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      concepcao(2, "Cobertura", mesmaData, `${mesmaData}T18:00:00.000Z`),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.situacao).not.toBe("Aguardando diagnóstico");
    expect(r?.previsaoPartoISO).toBe(previsao);
  });

  it("Cobertura criada primeiro, Diagnóstico Prenha criado depois → Prenha", () => {
    const r = situacao([
      concepcao(1, "Cobertura", mesmaData, `${mesmaData}T08:00:00.000Z`),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T18:00:00.000Z`,
      }),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe(previsao);
  });

  it("Diagnóstico Prenha criado primeiro, Inseminação criada depois → Prenha", () => {
    const r = situacao([
      reg(1, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      concepcao(2, "Inseminação", mesmaData, `${mesmaData}T18:00:00.000Z`),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe(previsao);
  });

  it("mesma data — Diagnóstico Prenha + Parto → Parto registrado", () => {
    const r = situacao([
      concepcao(1, "Cobertura", mesmaData, `${mesmaData}T07:00:00.000Z`),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      reg(3, "Parto", {
        resultado: "Normal",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T18:00:00.000Z`,
      }),
    ]);
    expect(r?.situacao).toBe("Parto registrado");
  });

  it("mesma data — Diagnóstico Prenha + Aborto Confirmado → Aborto registrado", () => {
    const r = situacao([
      concepcao(1, "Cobertura", mesmaData, `${mesmaData}T07:00:00.000Z`),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      reg(3, "Aborto", {
        resultado: "Confirmado",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T18:00:00.000Z`,
      }),
    ]);
    expect(r?.situacao).toBe("Aborto registrado");
  });

  it("mesma data — Diagnóstico Prenha + Aborto Suspeito → Aborto suspeito", () => {
    const r = situacao([
      concepcao(1, "Cobertura", mesmaData, `${mesmaData}T07:00:00.000Z`),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      reg(3, "Aborto", {
        resultado: "Suspeito",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T18:00:00.000Z`,
      }),
    ]);
    expect(r?.situacao).toBe("Aborto suspeito");
    expect(r?.previsaoPartoISO).toBe(previsao);
  });

  it("dois diagnósticos na mesma data — createdAt posterior em Vazia prevalece", () => {
    const r = situacao([
      concepcao(1, "Cobertura", mesmaData, `${mesmaData}T07:00:00.000Z`),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T08:00:00.000Z`,
      }),
      reg(3, "Diagnóstico de prenhez", {
        resultado: "Vazia",
        dataCobertura: mesmaData,
        createdAt: `${mesmaData}T18:00:00.000Z`,
      }),
    ]);
    expect(r?.situacao).toBe("Vazia");
  });

  it("dois diagnósticos — mesmo createdAt, id maior prevalece", () => {
    const mesmoCreatedAt = `${mesmaData}T12:00:00.000Z`;
    const a = reg(1, "Diagnóstico de prenhez", {
      resultado: "Prenha",
      dataCobertura: mesmaData,
      createdAt: mesmoCreatedAt,
    });
    const b = reg(2, "Diagnóstico de prenhez", {
      resultado: "Vazia",
      dataCobertura: mesmaData,
      createdAt: mesmoCreatedAt,
    });
    expect(compareReproEventosFemeaSituacaoAsc(a, b)).toBeLessThan(0);

    const r = situacao([a, b]);
    expect(r?.situacao).toBe("Vazia");
  });

  it("data posterior real — Cobertura após Diagnóstico Prenha inicia novo ciclo", () => {
    const r = situacao([
      concepcao(1, "Cobertura", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: mesmaData,
      }),
      concepcao(3, "Cobertura", "2025-11-15"),
    ]);
    expect(r?.situacao).toBe("Aguardando diagnóstico");
    expect(r?.situacao).not.toBe("Prenha");
  });

  it("caso real fêmea 58 — Cobertura e Diagnóstico Prenha em 14/11/2025", () => {
    const r = situacao([
      reg(10, "Diagnóstico de prenhez", {
        resultado: "Prenha",
        dataCobertura: "2025-11-14",
        createdAt: "2025-11-14T09:00:00.000Z",
      }),
      concepcao(20, "Cobertura", "2025-11-14", "2025-11-20T15:00:00.000Z"),
    ]);
    expect(r?.situacao).toBe("Prenha");
    expect(r?.previsaoPartoISO).toBe("2026-08-24");
  });
});

describe("getReproFemeaSameDayStagePriority", () => {
  it("ordena estágios conforme regra aprovada", () => {
    expect(getReproFemeaSameDayStagePriority("Cio")).toBeLessThan(
      getReproFemeaSameDayStagePriority("Cobertura"),
    );
    expect(getReproFemeaSameDayStagePriority("Cobertura")).toBeLessThan(
      getReproFemeaSameDayStagePriority("Inseminação"),
    );
    expect(getReproFemeaSameDayStagePriority("Inseminação")).toBeLessThan(
      getReproFemeaSameDayStagePriority("Diagnóstico de prenhez"),
    );
    expect(getReproFemeaSameDayStagePriority("Diagnóstico de prenhez")).toBeLessThan(
      getReproFemeaSameDayStagePriority("Aborto"),
    );
    expect(getReproFemeaSameDayStagePriority("Aborto")).toBeLessThan(
      getReproFemeaSameDayStagePriority("Parto"),
    );
  });
});

describe("isReproResultadoRequiredManejo — Parto e Aborto", () => {
  it("Parto exige resultado", () => {
    expect(isReproResultadoRequiredManejo("Parto", "femea")).toBe(true);
  });

  it("Aborto exige resultado", () => {
    expect(isReproResultadoRequiredManejo("Aborto", "femea")).toBe(true);
  });
});

describe("validateReproResultadoForSave — Parto e Aborto (backend/UI)", () => {
  const base = { sexo: "femea" as const };

  it("rejeita Parto sem resultado", () => {
    const r = validateReproResultadoForSave({ ...base, tipo: "Parto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Informe o resultado do manejo reprodutivo.");
  });

  it("rejeita Aborto sem resultado", () => {
    const r = validateReproResultadoForSave({ ...base, tipo: "Aborto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Informe o resultado do manejo reprodutivo.");
  });

  it("aceita Parto com resultado válido", () => {
    const r = validateReproResultadoForSave({
      ...base,
      tipo: "Parto",
      resultado: "Normal",
    });
    expect(r.ok).toBe(true);
  });

  it("aceita Aborto Confirmado", () => {
    const r = validateReproResultadoForSave({
      ...base,
      tipo: "Aborto",
      resultado: "Confirmado",
    });
    expect(r.ok).toBe(true);
  });

  it("aceita Aborto Suspeito", () => {
    const r = validateReproResultadoForSave({
      ...base,
      tipo: "Aborto",
      resultado: "Suspeito",
    });
    expect(r.ok).toBe(true);
  });

  it("rejeita resultado inválido fora da lista", () => {
    const r = validateReproResultadoForSave({
      ...base,
      tipo: "Aborto",
      resultado: "ResultadoInexistente",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("incompatível");
  });
});

describe("compareReproEventosAsc", () => {
  it("mesma data e mesmo createdAt — desempate por id crescente", () => {
    const mesmaData = "2026-06-01";
    const mesmoCreatedAt = `${mesmaData}T12:00:00.000Z`;
    const a = reg(1, "Diagnóstico de prenhez", {
      resultado: "Prenha",
      dataCobertura: mesmaData,
      createdAt: mesmoCreatedAt,
    });
    const b = reg(2, "Diagnóstico de prenhez", {
      resultado: "Vazia",
      dataCobertura: mesmaData,
      createdAt: mesmoCreatedAt,
    });
    expect(compareReproEventosAsc(a, b)).toBeLessThan(0);
    expect(compareReproEventosAsc(b, a)).toBeGreaterThan(0);

    const r = situacao([a, b]);
    expect(r?.situacao).toBe("Vazia");
  });
});

describe("calcPrevisaoParto283", () => {
  it("soma 283 dias com virada de ano (24/08/2026 → 03/06/2027)", () => {
    expect(calcPrevisaoParto283("2026-08-24")).toBe("2027-06-03");
  });

  it("ano bissexto: 29/02/2024 + 283 dias", () => {
    expect(calcPrevisaoParto283("2024-02-29")).toBe("2024-12-08");
  });

  it("virada de ano a partir de dezembro", () => {
    expect(calcPrevisaoParto283("2025-12-31")).toBe("2026-10-10");
  });
});

describe("reproDataToInputISO — parsing de datas (caracterização timezone)", () => {
  it("extrai YYYY-MM-DD de string ISO sem deslocar o dia", () => {
    expect(reproDataToInputISO("2026-10-11")).toBe("2026-10-11");
    expect(reproDataToInputISO("2026-10-11T00:00:00.000Z")).toBe("2026-10-11");
  });

  it("calcPrevisaoParto283 usa aritmética local — previsão estável para entrada YYYY-MM-DD", () => {
    const concepcaoData = "2026-08-24";
    const prev = calcPrevisaoParto283(concepcaoData);
    expect(prev).toBe("2027-06-03");
    expect(reproDataToInputISO(prev!)).toBe(prev);
  });
});
