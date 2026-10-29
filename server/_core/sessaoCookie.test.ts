import type { Request, Response } from "express";
import * as jose from "jose";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { env } from "./env";
import {
  clearAuthCookie,
  createSession,
  SESSION_COOKIE_NAME,
  verifySession,
} from "./cookies";

const here = dirname(fileURLToPath(import.meta.url));

function pedido(token?: string) {
  return { cookies: token ? { [SESSION_COOKIE_NAME]: token } : {} } as Request;
}

describe("sessão por cookie", () => {
  it("aceita token válido e mantém o papel gravado", async () => {
    const token = await createSession({
      id: 7,
      openId: "usuario-7",
      name: "Usuário",
      email: "usuario@fazenda.local",
      role: "user",
    });
    const sessao = await verifySession(pedido(token));
    expect(sessao?.id).toBe(7);
    expect(sessao?.role).toBe("user");
  });

  it("rejeita token inválido", async () => {
    await expect(verifySession(pedido("isso-nao-e-um-token"))).resolves.toBeNull();
    await expect(verifySession(pedido())).resolves.toBeNull();
  });

  it("rejeita token expirado", async () => {
    const token = await new jose.SignJWT({
      id: 1,
      openId: "expirado",
      name: "Expirado",
      email: "expirado@fazenda.local",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    await expect(verifySession(pedido(token))).resolves.toBeNull();
  });

  it("o logout limpa o cookie de sessão", () => {
    const res = { clearCookie: vi.fn(), req: { hostname: "localhost" } } as unknown as Response;
    clearAuthCookie(res);
    expect(res.clearCookie).toHaveBeenCalled();
    const nomes = vi.mocked(res.clearCookie).mock.calls.map(chamada => chamada[0]);
    expect(nomes).toContain(SESSION_COOKIE_NAME);

    const routers = readFileSync(resolve(here, "../routers.ts"), "utf8");
    const logout = routers.slice(routers.indexOf("logout: publicProcedure"), routers.indexOf("ensureLocalPreviewSession"));
    expect(logout).toContain("clearAuthCookie");
    const rotas = readFileSync(resolve(here, "../index.ts"), "utf8");
    expect(rotas).toContain('app.get("/api/auth/logout"');
    expect(rotas).toContain("clearAuthCookie");
  });
});
