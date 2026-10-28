import type { Response } from "express";
import { createSession, setAuthCookie } from "./cookies";
import { isProductionDeploy } from "./isProductionDeploy";
import { isLocalHomologHost } from "./localHomologHost";

const DEV_USERS = [
  { email: "pngomes1@gmail.com", password: "123456", name: "Paulo Gomes", id: 1 },
  { email: "pngomes1@teste.com", password: "12345678", name: "Paulo Gomes", id: 1 },
  { email: "demo@fazenda-digital.com", password: "demo123", name: "Paulo Gomes", id: 1 },
  { email: "admin@fazendadigital.local", password: "admin123", name: "Administrador", id: 1 },
] as const;

export type DevPreviewSession = {
  success: true;
  user: { id: number; openId: string; name: string; email: string; role: "admin" };
  localFallback: true;
};

function findDevUserByEmail(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  return DEV_USERS.find(user => user.email.toLowerCase() === normalizedUsername) ?? null;
}

function bloqueiaPreviewForaDoLocalhost(host?: string | null) {
  if (process.env.VERCEL === "1") return true;
  if (isLocalHomologHost(host)) return false;
  return isProductionDeploy();
}

async function openDevPreviewSession(
  matchedDevUser: (typeof DEV_USERS)[number],
  res: Response,
): Promise<DevPreviewSession> {
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

export async function tryDevLoginFallback(
  username: string,
  password: string,
  res: Response,
  host?: string | null,
): Promise<DevPreviewSession | null> {
  if (bloqueiaPreviewForaDoLocalhost(host ?? res.req?.hostname)) return null;

  const matchedDevUser = findDevUserByEmail(username);
  if (!matchedDevUser || matchedDevUser.password !== password) return null;

  return openDevPreviewSession(matchedDevUser, res);
}

/** Religa cookie da sessão local quando o login no banco não rolou, mas o e-mail já é conhecido. */
export async function tryDevPreviewSession(
  email: string,
  res: Response,
  host?: string | null,
): Promise<DevPreviewSession | null> {
  if (bloqueiaPreviewForaDoLocalhost(host ?? res.req?.hostname)) return null;

  const matchedDevUser = findDevUserByEmail(email);
  if (!matchedDevUser) return null;

  return openDevPreviewSession(matchedDevUser, res);
}
