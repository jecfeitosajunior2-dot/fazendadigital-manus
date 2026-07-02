import type { CookieOptions, Request, Response } from "express";
import * as jose from "jose";
import { env } from "./env";
import type { UserContext } from "./context";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: env.NODE_ENV === "production",
  };
}

export async function createSession(user: UserContext): Promise<string> {
  return await new jose.SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySession(req: Request): Promise<UserContext | null> {
  const token = req.cookies?.session;
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as UserContext;
  } catch {
    return null;
  }
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie("session", sessionCookieOptions());
}
