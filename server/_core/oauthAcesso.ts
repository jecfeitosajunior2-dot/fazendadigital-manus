import type { Response } from "express";

/**
 * O callback OAuth fica desligado.
 * Para religar, esta constante precisa ser autorizada de propósito. Variável de ambiente não liga.
 */
export const OAUTH_CALLBACK_HABILITADO = false;

export function recusarOAuthDesabilitado(res: Response): boolean {
  if (OAUTH_CALLBACK_HABILITADO) return false;
  res.status(403).json({ ok: false, error: "oauth_desabilitado" });
  return true;
}
