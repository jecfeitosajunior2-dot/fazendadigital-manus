import { describe, expect, it } from "vitest";
import {
  analyzeMatrizReproPipeline,
  DEFAULT_REPRO_PIPELINE_CONFIG,
  filterMatrizesPorPipelineFlag,
  TIPO_EXPOSICAO_MONTA,
} from "./reproPipeline";
import type { ReproRegistroSituacaoInput } from "./reproRegistroMeta";

function reg(
  id: number,
  tipo: string,
  data: string,
  resultado?: string | null,
): ReproRegistroSituacaoInput {
  return {
    id,
    tipo,
    dataCobertura: data,
    resultado: resultado ?? null,
    createdAt: `${data}T12:00:00.000Z`,
  };
}

describe("reproPipeline", () => {
  it("IATF sem DG gera flag pós-IATF e DG vencido após prazo", () => {
    const snapshot = analyzeMatrizReproPipeline(
      [reg(1, "Inseminação", "2026-01-01")],
      DEFAULT_REPRO_PIPELINE_CONFIG,
      "2026-02-15",
    );
    expect(snapshot?.flags).toContain("pos_iatf_aguardando_dg");
    expect(snapshot?.flags).toContain("dg_vencido");
    expect(snapshot?.diasAteLimiteDg).toBeLessThan(0);
  });

  it("Exposição à monta sem DG gera flag em monta", () => {
    const snapshot = analyzeMatrizReproPipeline(
      [
        reg(1, "Inseminação", "2026-01-01"),
        reg(2, "Diagnóstico de prenhez", "2026-02-01", "Vazia"),
        reg(3, TIPO_EXPOSICAO_MONTA, "2026-02-05"),
      ],
      DEFAULT_REPRO_PIPELINE_CONFIG,
      "2026-03-01",
    );
    expect(snapshot?.flags).toContain("em_monta_aguardando_dg");
    expect(snapshot?.ultimoServicoTipo).toBe(TIPO_EXPOSICAO_MONTA);
  });

  it("DG vazia após monta sugere revisão de descarte", () => {
    const snapshot = analyzeMatrizReproPipeline([
      reg(1, "Inseminação", "2026-01-01"),
      reg(2, "Diagnóstico de prenhez", "2026-02-01", "Vazia"),
      reg(3, TIPO_EXPOSICAO_MONTA, "2026-02-10"),
      reg(4, "Diagnóstico de prenhez", "2026-04-15", "Vazia"),
    ]);
    expect(snapshot?.flags).toContain("candidata_revisao_descarte");
  });

  it("conta tentativas IATF desde o último parto", () => {
    const snapshot = analyzeMatrizReproPipeline([
      reg(1, "Inseminação", "2025-06-01"),
      reg(2, "Parto", "2026-01-15", "Normal"),
      reg(3, "Inseminação", "2026-03-01"),
      reg(4, "Inseminação", "2026-04-01"),
    ]);
    expect(snapshot?.tentativasIatfNoCiclo).toBe(2);
    expect(snapshot?.flags).toContain("multiplas_iatf");
  });

  it("filterMatrizesPorPipelineFlag retorna matrizes com a flag", () => {
    const items = [
      {
        femeaId: 10,
        registros: [reg(1, "Inseminação", "2026-01-01")],
      },
      {
        femeaId: 20,
        registros: [
          reg(1, TIPO_EXPOSICAO_MONTA, "2026-01-01"),
          reg(2, "Diagnóstico de prenhez", "2026-04-01", "Vazia"),
        ],
      },
    ];
    const candidatas = filterMatrizesPorPipelineFlag(items, "candidata_revisao_descarte");
    expect(candidatas.map(c => c.femeaId)).toEqual([20]);
  });
});
