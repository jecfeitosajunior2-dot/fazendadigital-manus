export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Fluxo oficial: Manejo → Registros de Manejo → Reprodutivo */
export const MANEJO_REPRODUTIVO_PATH = "/manejo/registros/cadastro?tipo=reprodutivo";

// Simple login URL for the local auth system
export const getLoginUrl = (returnPath?: string) => {
  const path = returnPath ? `?returnTo=${encodeURIComponent(returnPath)}` : "";
  return `/entrar${path}`;
};
