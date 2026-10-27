import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DatabaseSchemaIncompatibleError } from "./verifyDatabaseSchema";
import { isDatabaseUrlConfigured, prepareDatabaseForBoot } from "./prepareDatabaseBoot";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "../shared/vendaIntegracao";

const raiz = dirname(fileURLToPath(import.meta.url));

describe("prepareDatabaseForBoot — gate de inicialização", () => {
  it("A — schema compatível libera o boot MySQL", async () => {
    const mode = await prepareDatabaseForBoot({
      databaseUrl: "mysql://user:pass@127.0.0.1:3306/fazenda_digital",
      connect: async () => ({
        query: async () => [],
        end: async () => undefined,
      }),
      verify: async () => ({ ok: true, schemaName: "fazenda_digital", issues: [] }),
    });
    expect(mode).toBe("mysql");
  });

  it("B — incompatibilidade bloqueia e não dispara correção", async () => {
    let verifyCalls = 0;
    await expect(
      prepareDatabaseForBoot({
        databaseUrl: "mysql://user:pass@127.0.0.1:3306/fazenda_digital",
        connect: async () => ({
          query: async () => [],
          end: async () => undefined,
        }),
        verify: async () => {
          verifyCalls += 1;
          return {
            ok: false,
            schemaName: "fazenda_digital",
            issues: [{ kind: "column", table: "vendas", column: "idempotency_key", message: "ausente" }],
          };
        },
      }),
    ).rejects.toBeInstanceOf(DatabaseSchemaIncompatibleError);
    expect(verifyCalls).toBe(1);
  });

  it("E — banco indisponível bloqueia sem fallback indevido", async () => {
    await expect(
      prepareDatabaseForBoot({
        databaseUrl: "mysql://user:pass@127.0.0.1:3306/fazenda_digital",
        nodeEnv: "production",
        connect: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    ).rejects.toThrow(/inicialização foi bloqueada/);
  });

  it("E — sem DATABASE_URL em desenvolvimento preserva modo local", async () => {
    const mode = await prepareDatabaseForBoot({
      databaseUrl: "",
      nodeEnv: "development",
    });
    expect(mode).toBe("offline");
  });

  it("E — sem DATABASE_URL em produção bloqueia", async () => {
    await expect(
      prepareDatabaseForBoot({
        databaseUrl: "   ",
        nodeEnv: "production",
      }),
    ).rejects.toThrow(/DATABASE_URL ausente/);
  });

  it("G — caminhos de boot não chamam ensureSchema", () => {
    const index = readFileSync(join(raiz, "index.ts"), "utf8");
    const createApp = readFileSync(join(raiz, "createApp.ts"), "utf8");
    const start = readFileSync(join(raiz, "../scripts/start.mjs"), "utf8");
    const pkg = readFileSync(join(raiz, "../package.json"), "utf8");
    expect(index).toContain("prepareDatabaseForBoot");
    expect(index).not.toMatch(/ensureSchema\s*\(/);
    expect(createApp).toContain("prepareDatabaseForBoot");
    expect(createApp).not.toMatch(/ensureSchema\s*\(/);
    expect(start).toContain("server/index.ts");
    expect(start).not.toContain("ensureSchema");
    expect(pkg).toContain('"dev": "tsx watch server/index.ts"');
    expect(pkg).toContain('"dev:server": "tsx watch server/index.ts"');
    expect(pkg).toContain('"start": "node scripts/start.mjs"');
    expect(pkg).toContain('"db:ensure-schema": "tsx scripts/ensure-schema.ts"');
  });

  it("G — não existe variável para ignorar a validação", () => {
    const boot = readFileSync(join(raiz, "prepareDatabaseBoot.ts"), "utf8");
    const verify = readFileSync(join(raiz, "verifyDatabaseSchema.ts"), "utf8");
    expect(boot).not.toMatch(/SKIP_|IGNORE_SCHEMA|BYPASS/);
    expect(verify).not.toMatch(/SKIP_|IGNORE_SCHEMA|BYPASS/);
  });

  it("H — integração financeira permanece OFF", () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
  });

  it("isDatabaseUrlConfigured não trata string vazia como MySQL configurado", () => {
    expect(isDatabaseUrlConfigured(undefined)).toBe(false);
    expect(isDatabaseUrlConfigured("")).toBe(false);
    expect(isDatabaseUrlConfigured("mysql://x")).toBe(true);
  });
});
