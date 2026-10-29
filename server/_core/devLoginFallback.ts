import type { Response } from "express";

/**
 * A sessão de demonstração foi desligada.
 * E-mail conhecido, senha fixa ou localhost não abrem sessão no servidor.
 */
export async function tryDevLoginFallback(
  _username: string,
  _password: string,
  _res: Response,
  _hostname?: string,
): Promise<null> {
  return null;
}

export async function tryDevPreviewSession(
  _email: string,
  _res: Response,
  _hostname?: string,
): Promise<null> {
  return null;
}
