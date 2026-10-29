export type LocalAuthUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  loginMode: "local-preview";
  signedInAt: string;
};

export const LOCAL_AUTH_STORAGE_KEY = "fd-local-session";

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

/** Não lê sessão local. O acesso só vale com o cookie confirmado pelo servidor. */
export function getLocalAuthUser(): LocalAuthUser | null {
  clearLocalAuthSession();
  return null;
}

/** Não grava sessão no navegador. Credenciais de demonstração não entram. */
export function signInLocal(_username: string, _password: string): LocalAuthUser | null {
  clearLocalAuthSession();
  return null;
}

export function clearLocalAuthSession() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
}
