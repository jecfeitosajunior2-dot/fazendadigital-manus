import type { Request } from "express";
import * as jose from "jose";
import { env } from "./env";
import type { UserContext } from "./context";

const secret = new TextEncoder().encode(env.JWT_SECRET);

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

export function clearAuthCookie(res: import("express").Response): void {
  res.clearCookie("session", { httpOnly: true, sameSite: "lax" });
}
