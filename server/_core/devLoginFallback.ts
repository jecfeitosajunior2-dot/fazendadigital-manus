import type { Response } from "express";
import { createSession, setAuthCookie } from "./cookies";
import { isProductionDeploy } from "./isProductionDeploy";

const DEV_USERS = [
  { email: "pngomes1@gmail.com", password: "123456", name: "Paulo Gomes", id: 1 },
  { email: "pngomes1@teste.com", password: "12345678", name: "Paulo Gomes", id: 1 },
  { email: "demo@fazenda-digital.com", password: "demo123", name: "Paulo Gomes", id: 1 },
  { email: "admin@fazendadigital.local", password: "admin123", name: "Administrador", id: 1 },
] as const;

export async function tryDevLoginFallback(
  username: string,
  password: string,
  res: Response
): Promise<{ success: true; user: { id: number; openId: string; name: string; email: string; role: "admin" }; localFallback: true } | null> {
  if (isProductionDeploy()) return null;

  const normalizedUsername = username.trim().toLowerCase();
  const matchedDevUser = DEV_USERS.find(
    user => user.email.toLowerCase() === normalizedUsername && user.password === password
  );
  if (!matchedDevUser) return null;

  const fallbackUser = {
    id: matchedDevUser.id,
    openId: `local:${matchedDevUser.email}`,
    name: matchedDevUser.name,
    email: matchedDevUser.email,
    role: "admin" as const,
  };
  const token = await createSession(fallbackUser);
  setAuthCookie(res, token);
  return { success: true, user: fallbackUser, localFallback: true };
}
