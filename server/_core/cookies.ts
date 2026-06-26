import type { Request, Response } from "express";
import * as jose from "jose";
import { env } from "./env";
import type { UserContext } from "./context";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export const SESSION_COOKIE_NAME = "session";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_MS,
};

export async function createSession(user: UserContext): Promise<string> {
  return await new jose.SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySession(req: Request): Promise<UserContext | null> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as UserContext;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export function clearAuthCookie(res: Response): void {
  const base = { httpOnly: true, sameSite: "lax" as const };
  // path "/" para cookies novos; "/api/trpc" para sessões criadas antes da correção
  res.clearCookie(SESSION_COOKIE_NAME, { ...base, path: "/" });
  res.clearCookie(SESSION_COOKIE_NAME, { ...base, path: "/api/trpc" });
}
