import { describe, expect, it } from "vitest";
import {
  formatReproPipelineConfigResumo,
  mergeReproPipelineConfig,
  parseReproPipelineConfigJson,
  serializeReproPipelineConfigJson,
} from "./reproPipelineConfig";

describe("reproPipelineConfig", () => {
  it("usa defaults quando JSON vazio", () => {
    expect(parseReproPipelineConfigJson(null).diasParaDgAposInseminacao).toBe(30);
  });

  it("mescla e limita valores", () => {
    const merged = mergeReproPipelineConfig({
      diasParaDgAposInseminacao: 999,
      diasParaDgAposMonta: 10,
    });
    expect(merged.diasParaDgAposInseminacao).toBe(120);
    expect(merged.diasParaDgAposMonta).toBe(30);
  });

  it("serializa e parseia", () => {
    const raw = serializeReproPipelineConfigJson(
      mergeReproPipelineConfig({ diasParaDgAposMonta: 75 }),
    );
    expect(parseReproPipelineConfigJson(raw).diasParaDgAposMonta).toBe(75);
  });

  it("formata resumo para curral", () => {
    expect(formatReproPipelineConfigResumo(mergeReproPipelineConfig(null))).toContain(
      "DG 30 / 60 dias",
    );
    expect(formatReproPipelineConfigResumo(mergeReproPipelineConfig(null))).toContain(
      "máx. 2 IATF",
    );
  });
});
