import type { Response } from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { tryDevLoginFallback, tryDevPreviewSession } from "./devLoginFallback";

const here = dirname(fileURLToPath(import.meta.url));

function respostaVazia() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
  };
}

describe("sessão de demonstração desligada", () => {
  it("o servidor não aceita login automático de demonstração", async () => {
    const res = respostaVazia();
    await expect(
      tryDevLoginFallback("pngomes1@gmail.com", "123456", res, "localhost"),
    ).resolves.toBeNull();
    await expect(
      tryDevLoginFallback("admin@fazendadigital.local", "admin123", res, "127.0.0.1"),
    ).resolves.toBeNull();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("informar apenas o e-mail não gera sessão", async () => {
    const res = respostaVazia();
    await expect(tryDevPreviewSession("pngomes1@gmail.com", res, "localhost")).resolves.toBeNull();
    await expect(tryDevPreviewSession("admin@fazendadigital.local", res, "localhost")).resolves.toBeNull();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("localhost em produção também não concede administrador", async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = respostaVazia();
      await expect(tryDevPreviewSession("pngomes1@gmail.com", res, "localhost")).resolves.toBeNull();
      await expect(tryDevLoginFallback("pngomes1@gmail.com", "123456", res, "localhost")).resolves.toBeNull();
      expect(res.cookie).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });

  it("o arquivo não guarda mais senhas de demonstração", () => {
    const fonte = readFileSync(resolve(here, "devLoginFallback.ts"), "utf8");
    expect(fonte).not.toContain("openDevPreviewSession");
    expect(fonte).not.toContain("setAuthCookie");
    expect(fonte).not.toContain("role: \"admin\"");
    expect(fonte).not.toContain("123456");
    expect(fonte).not.toContain("admin123");
  });
});
