import { describe, expect, it, vi } from "vitest";
import {
  createScaleRxProcessor,
  createScaleStabilizer,
  formatPesoKgParaCampo,
  parseScaleWeightKgFromText,
} from "./scaleProtocol";

describe("parseScaleWeightKgFromText", () => {
  it("aceita decimal com ponto ou vírgula", () => {
    expect(parseScaleWeightKgFromText("425.5")).toBe(425.5);
    expect(parseScaleWeightKgFromText("425,5")).toBe(425.5);
  });

  it("aceita prefixos comuns de indicadores", () => {
    expect(parseScaleWeightKgFromText("ST,GS,+  425.5kg")).toBe(425.5);
    expect(parseScaleWeightKgFromText("+0425.5")).toBe(425.5);
    expect(parseScaleWeightKgFromText("W: 320,0 KG")).toBe(320);
  });

  it("aceita tags Tru-Test EziWeigh [WS] e [WR]", () => {
    expect(parseScaleWeightKgFromText("[WS]425.5")).toBe(425.5);
    expect(parseScaleWeightKgFromText("[WR] 380,0")).toBe(380);
  });

  it("aceita SCP Tru-Test S3 [425.5] e ignora instável [U425.5]", () => {
    expect(parseScaleWeightKgFromText("[425.5]")).toBe(425.5);
    expect(parseScaleWeightKgFromText("[U425.5]")).toBe(null);
    expect(parseScaleWeightKgFromText("[U102.5]")).toBe(null);
  });

  it("rejeita valores fora da faixa", () => {
    expect(parseScaleWeightKgFromText("0")).toBe(null);
    expect(parseScaleWeightKgFromText("99999")).toBe(null);
    expect(parseScaleWeightKgFromText("abc")).toBe(null);
  });
});

describe("formatPesoKgParaCampo", () => {
  it("formata em pt-BR", () => {
    expect(formatPesoKgParaCampo(425.5)).toBe("425,50");
  });
});

describe("createScaleStabilizer", () => {
  it("só emite após estabilizar", async () => {
    vi.useFakeTimers();
    const received: number[] = [];
    const stabilizer = createScaleStabilizer({
      stableMs: 500,
      onStableWeight: kg => received.push(kg),
    });

    stabilizer.pushCandidate(420);
    expect(received).toEqual([]);
    vi.advanceTimersByTime(500);
    expect(received).toEqual([420]);
    vi.useRealTimers();
  });

  it("deliverImmediate ignora espera", () => {
    const received: number[] = [];
    const stabilizer = createScaleStabilizer({
      onStableWeight: kg => received.push(kg),
    });
    stabilizer.deliverImmediate(380);
    expect(received).toEqual([380]);
  });
});

describe("createScaleRxProcessor", () => {
  it("processa linhas completas", () => {
    const received: number[] = [];
    const rx = createScaleRxProcessor({
      onWeightCandidate: kg => received.push(kg),
    });
    rx.pushChunk("425.5\r\n");
    expect(received).toEqual([425.5]);
  });
});
