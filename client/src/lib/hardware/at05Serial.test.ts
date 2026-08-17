import { describe, it, expect } from "vitest";
import {
  createAt05LineParser,
  normalizeAt05Rfid,
} from "./at05Serial";

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
