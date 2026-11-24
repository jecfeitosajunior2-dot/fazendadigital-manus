import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { avaliarPush } from "./pushDrizzleSeguro";

const raiz = dirname(fileURLToPath(import.meta.url));

describe("push do Drizzle protegido", () => {
  it("recusa o banco e a porta da fazenda", () => {
    expect(avaliarPush({
      host: "127.0.0.1",
      port: 3306,
      database: "fd_ensaio",
    }, ["CREATE TABLE exemplo (id int)"], 0).aplicar).toBe(false);
    expect(avaliarPush({
      host: "127.0.0.1",
      port: 3413,
      database: "fazenda_digital",
    }, ["CREATE TABLE exemplo (id int)"], 0).aplicar).toBe(false);
  });

  it("recusa remoção e banco que já tem tabela", () => {
    const alvo = { host: "127.0.0.1", port: 3413, database: "fd_h4ch_vazio" };
    expect(avaliarPush(alvo, ["DROP TABLE animais"], 0).motivo).toContain("removeria");
    expect(avaliarPush(alvo, ["CREATE TABLE exemplo (id int)"], 62).motivo).toContain("já tem tabelas");
  });

  it("aceita criação num banco vazio descartável", () => {
    const plano = avaliarPush({
      host: "127.0.0.1",
      port: 3413,
      database: "fd_h4ch_vazio",
    }, ["CREATE TABLE exemplo (id int)"], 0);
    expect(plano.aplicar).toBe(true);
  });

  it("o arranque não migra e a prontidão extra depende da variável", () => {
    const boot = readFileSync(join(raiz, "prepareDatabaseBoot.ts"), "utf8");
    const pacote = readFileSync(join(raiz, "../package.json"), "utf8");
    expect(boot).toContain('FD_PRONTIDAO_DEFINITIVA === "1"');
    expect(boot).not.toMatch(/ensureSchema\s*\(/);
    expect(boot).not.toContain("aplicarProposta");
    expect(boot).not.toContain("aplicarModeloVazio");
    expect(pacote).toContain('"db:push": "tsx scripts/db-push-seguro.ts"');
  });
});
