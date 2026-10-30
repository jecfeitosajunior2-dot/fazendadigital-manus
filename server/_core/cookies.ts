import type { Request, Response } from "express";
import * as jose from "jose";
import { env } from "./env";
import type { UserContext } from "./context";
import { isLocalHomologHost } from "./localHomologHost";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export const SESSION_COOKIE_NAME = "session";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function atributosCookie(host?: string | null) {
  const exigeHttps = env.NODE_ENV === "production" && !isLocalHomologHost(host);
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    ...(exigeHttps ? { secure: true as const } : {}),
  };
}

export function sessionCookieOptions(host?: string | null) {
  return {
    ...atributosCookie(host),
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export const SESSION_COOKIE_OPTIONS = sessionCookieOptions();

export async function createSession(user: UserContext): Promise<string> {
  return await new jose.SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

function valorDoCookie(bruto: string): string {
  const aparado = bruto.trim();
  if (!aparado) return "";
  try {
    return decodeURIComponent(aparado);
  } catch {
    return aparado;
  }
}

/** Lê todos os cookies `session`. O vazio do caminho legado não esconde o válido. */
function tokensDeSessao(req: Request): string[] {
  const encontrados: string[] = [];
  const header = req.headers?.cookie;
  if (typeof header === "string") {
    for (const parte of header.split(";")) {
      const eq = parte.indexOf("=");
      if (eq <= 0) continue;
      if (parte.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue;
      const valor = valorDoCookie(parte.slice(eq + 1));
      if (valor) encontrados.push(valor);
    }
  }
  const unico = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof unico === "string" && unico && !encontrados.includes(unico)) {
    encontrados.push(unico);
  }
  return encontrados;
}

export async function verifySession(req: Request): Promise<UserContext | null> {
  for (const token of tokensDeSessao(req)) {
    try {
      const { payload } = await jose.jwtVerify(token, secret);
      return payload as unknown as UserContext;
    } catch {
      // Valor inválido ou vencido não autentica. Outro cookie ainda pode ser o válido.
    }
  }
  return null;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(res.req?.hostname));
}

export function clearAuthCookie(res: Response): void {
  const atributos = atributosCookie(res.req?.hostname);
  res.clearCookie(SESSION_COOKIE_NAME, { ...atributos, path: "/" });
  res.clearCookie(SESSION_COOKIE_NAME, { ...atributos, path: "/api/trpc" });
}
