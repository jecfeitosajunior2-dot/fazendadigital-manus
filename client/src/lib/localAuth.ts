export type LocalAuthUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  loginMode: "local-preview";
  signedInAt: string;
};

export const LOCAL_AUTH_STORAGE_KEY = "fd-local-session";

const LOCAL_USERS = [
  {
    email: "pngomes1@gmail.com",
    password: "123456",
    name: "Paulo Gomes",
    role: "admin" as const,
  },
  {
    email: "pngomes1@teste.com",
    password: "12345678",
    name: "Paulo Gomes",
    role: "admin" as const,
  },
  {
    email: "demo@fazenda-digital.com",
    password: "demo123",
    name: "Paulo Gomes",
    role: "admin" as const,
  },
  {
    email: "admin@fazendadigital.local",
    password: "admin123",
    name: "Administrador",
    role: "admin" as const,
  },
];

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function getLocalAuthUser(): LocalAuthUser | null {
  if (!canUseLocalStorage()) return null;

  try {
    const stored = window.localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as LocalAuthUser) : null;
  } catch {
    window.localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
    return null;
  }
}

export function signInLocal(username: string, password: string): LocalAuthUser | null {
  if (!canUseLocalStorage()) return null;

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const account = LOCAL_USERS.find(
    candidate =>
      candidate.email.toLowerCase() === normalizedUsername &&
      candidate.password === normalizedPassword,
  );

  if (!account) return null;

  const session: LocalAuthUser = {
    id: 1,
    name: account.name,
    email: account.email,
    role: account.role,
    loginMode: "local-preview",
    signedInAt: new Date().toISOString(),
  };

  window.localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearLocalAuthSession() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
}
