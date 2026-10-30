import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import * as jose from "jose";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { env } from "./env";
import { senhaConfereComHash } from "./loginSenha";
import bcrypt from "bcryptjs";
import {
  clearAuthCookie,
  createSession,
  SESSION_COOKIE_NAME,
  setAuthCookie,
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

  it("o logout limpa os dois caminhos sem prazo positivo", () => {
    const res = { clearCookie: vi.fn(), req: { hostname: "localhost" } } as unknown as Response;
    clearAuthCookie(res);
    const chamadas = vi.mocked(res.clearCookie).mock.calls;
    expect(chamadas.map(chamada => chamada[0])).toEqual([SESSION_COOKIE_NAME, SESSION_COOKIE_NAME]);
    expect(chamadas.map(chamada => (chamada[1] as { path?: string }).path)).toEqual(["/", "/api/trpc"]);
    for (const [, opcoes] of chamadas) {
      expect(opcoes).not.toHaveProperty("maxAge");
    }

    const routers = readFileSync(resolve(here, "../routers.ts"), "utf8");
    const logout = routers.slice(routers.indexOf("logout: publicProcedure"), routers.indexOf("ensureLocalPreviewSession"));
    expect(logout).toContain("clearAuthCookie");
    const rotas = readFileSync(resolve(here, "../index.ts"), "utf8");
    expect(rotas).toContain('app.get("/api/auth/logout"');
    expect(rotas).toContain("clearAuthCookie");
  });
});

type CookieLido = {
  valor: string;
  path: string;
  maxAge: number | null;
  expires: Date | null;
};

function lerCookie(header: string): CookieLido {
  const [par, ...atributos] = header.split(";").map(parte => parte.trim());
  const eq = par.indexOf("=");
  const mapa = new Map(atributos.map(atributo => {
    const corte = atributo.indexOf("=");
    if (corte === -1) return [atributo.toLowerCase(), ""] as const;
    return [atributo.slice(0, corte).toLowerCase(), atributo.slice(corte + 1)] as const;
  }));
  const maxAge = mapa.get("max-age");
  const expires = mapa.get("expires");
  return {
    valor: par.slice(eq + 1),
    path: mapa.get("path") ?? "/",
    maxAge: maxAge == null ? null : Number(maxAge),
    expires: expires ? new Date(expires) : null,
  };
}

function cookieExpirado(cookie: CookieLido) {
  if (cookie.maxAge != null && cookie.maxAge <= 0) return true;
  return cookie.expires != null && cookie.expires.getTime() <= Date.now();
}

function usuarioFicticio() {
  return {
    id: 42,
    openId: "usuario-ficticio",
    name: "Usuário fictício",
    email: "teste@isolado.local",
    role: "user" as const,
  };
}

async function comServidor(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(cookieParser());
  app.post("/login", async (_req, res) => {
    const hash = await bcrypt.hash("senha-ficticia-isolada", 4);
    const senhaOk = await senhaConfereComHash(hash, "senha-ficticia-isolada");
    if (!senhaOk) {
      res.status(401).json({ ok: false });
      return;
    }
    setAuthCookie(res, await createSession(usuarioFicticio()));
    res.json({ ok: true });
  });
  app.post("/logout", (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });
  app.get("/protegida", async (req, res) => {
    const user = await verifySession(req);
    if (!user) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true, id: user.id });
  });

  const server = await new Promise<Server>(resolve => {
    const iniciado = app.listen(0, "127.0.0.1", () => resolve(iniciado));
  });
  const endereco = server.address();
  const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
  try {
    await fn(`http://127.0.0.1:${porta}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(erro => (erro ? reject(erro) : resolve()));
    });
  }
}

describe("logout e novo login isolados", () => {
  it("login, saída e novo login não deixam cookie vazio persistente", async () => {
    await comServidor(async base => {
      const entrada = await fetch(`${base}/login`, { method: "POST" });
      expect(entrada.status).toBe(200);
      const cookiesLogin = (entrada.headers.getSetCookie?.() ?? []).map(lerCookie);
      expect(cookiesLogin).toHaveLength(1);
      expect(cookiesLogin[0]?.path).toBe("/");
      expect(cookiesLogin[0]?.valor.length).toBeGreaterThan(20);
      expect(cookiesLogin.some(cookie => cookie.path === "/api/trpc")).toBe(false);

      const protegida = await fetch(`${base}/protegida`, {
        headers: { cookie: `session=${cookiesLogin[0]?.valor}` },
      });
      expect(protegida.status).toBe(200);

      const saida = await fetch(`${base}/logout`, { method: "POST" });
      const cookiesSaida = (saida.headers.getSetCookie?.() ?? []).map(lerCookie);
      expect(cookiesSaida.map(cookie => cookie.path).sort()).toEqual(["/", "/api/trpc"]);
      for (const cookie of cookiesSaida) {
        expect(cookie.valor).toBe("");
        expect(cookieExpirado(cookie)).toBe(true);
        expect(cookie.maxAge == null || cookie.maxAge <= 0).toBe(true);
      }

      const semSessao = await fetch(`${base}/protegida`);
      expect(semSessao.status).toBe(401);

      const novaEntrada = await fetch(`${base}/login`, { method: "POST" });
      const novoCookie = (novaEntrada.headers.getSetCookie?.() ?? []).map(lerCookie)[0];
      const deNovo = await fetch(`${base}/protegida`, {
        headers: { cookie: `session=; session=${novoCookie?.valor}` },
      });
      expect(deNovo.status).toBe(200);
      await expect(deNovo.json()).resolves.toMatchObject({ ok: true, id: 42 });
    });
  });

  it("cookie inválido ou vencido não abre a rota protegida", async () => {
    await comServidor(async base => {
      const invalido = await fetch(`${base}/protegida`, {
        headers: { cookie: "session=isso-nao-e-um-token" },
      });
      expect(invalido.status).toBe(401);

      const vencido = await new jose.SignJWT(usuarioFicticio())
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(env.JWT_SECRET));
      const expirado = await fetch(`${base}/protegida`, {
        headers: { cookie: `session=${vencido}` },
      });
      expect(expirado.status).toBe(401);
    });
  });
});
