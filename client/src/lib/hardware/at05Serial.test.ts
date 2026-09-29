import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  createAt05LineParser,
  normalizeAt05Rfid,
} from "./at05Serial";

const here = dirname(fileURLToPath(import.meta.url));
const serialSrc = readFileSync(resolve(here, "at05Serial.ts"), "utf8");

describe("normalizeAt05Rfid", () => {
  it("mantém RFID real como string sem alterar zeros", () => {
    expect(normalizeAt05Rfid("963000400291061")).toBe("963000400291061");
    expect(normalizeAt05Rfid("963000400650083")).toBe("963000400650083");
  });

  it("aplica trim e remove caracteres de controle", () => {
    expect(normalizeAt05Rfid("  963000400291061\t")).toBe("963000400291061");
    expect(normalizeAt05Rfid("963000400291061\x00")).toBe("963000400291061");
  });

  it("rejeita vazio ou não numérico", () => {
    expect(normalizeAt05Rfid("")).toBeNull();
    expect(normalizeAt05Rfid("   ")).toBeNull();
    expect(normalizeAt05Rfid("ABC123")).toBeNull();
    expect(normalizeAt05Rfid("96300A0400291061")).toBeNull();
  });
});

describe("createAt05LineParser", () => {
  it("parseia linha única com CRLF", () => {
    const parser = createAt05LineParser();
    expect(parser.push("963000400291061\r\n")).toEqual(["963000400291061"]);
  });

  it("parseia duas linhas com LF", () => {
    const parser = createAt05LineParser();
    expect(parser.push("963000400291061\n963000400650083\n")).toEqual([
      "963000400291061",
      "963000400650083",
    ]);
  });

  it("reconstrói leitura fragmentada em chunks", () => {
    const parser = createAt05LineParser();
    expect(parser.push("963000400")).toEqual([]);
    expect(parser.push("291061\r\n")).toEqual(["963000400291061"]);
  });

  it("aceita CR como delimitador", () => {
    const parser = createAt05LineParser();
    expect(parser.push("963000400650083\r")).toEqual(["963000400650083"]);
  });

  it("pipeline completo: chunks → normalize", () => {
    const parser = createAt05LineParser();
    const rawLines = [
      ...parser.push("963000400"),
      ...parser.push("291061\r\n"),
      ...parser.push("963000400650083\n"),
    ];
    const rfids = rawLines
      .map(normalizeAt05Rfid)
      .filter((v): v is string => v != null);
    expect(rfids).toEqual(["963000400291061", "963000400650083"]);
  });
});

describe("abertura AT05 — mesmo caminho do Diagnóstico", () => {
  it("usa 9600 8N1 none e não fecha a COM escolhida antes do open", () => {
    const diag = readFileSync(resolve(here, "../../pages/DiagnosticoAt05Page.tsx"), "utf8");
    expect(serialSrc).toContain("baudRate: 9600");
    expect(serialSrc).toContain("dataBits: 8");
    expect(serialSrc).toContain('parity: "none"');
    expect(serialSrc).toContain('flowControl: "none"');
    expect(diag).toContain("baudRate: 9600");
    expect(diag).toContain("dataBits: 8");
    expect(diag).toContain('parity: "none"');
    expect(serialSrc).toContain("await port.open(SERIAL_OPTIONS)");
    expect(serialSrc).toContain("using selected streams (no close/reopen)");
  });
});
