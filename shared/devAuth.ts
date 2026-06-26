/**
 * Credenciais de desenvolvimento — edite aqui ou via .env.local (DEV_LOGIN_*)
 */
export const DEV_AUTH = {
  email: "pngomes1@gmail.com",
  password: "123456",
  name: "Pedro Gomes",
  openId: "dev-pngomes1",
  role: "admin" as const,
};

export type DevAuthCredentials = {
  email: string;
  password: string;
  name: string;
  openId: string;
  role: "admin" | "user";
};

export function getDevAuthCredentials(): DevAuthCredentials {
  const role = process.env.DEV_LOGIN_ROLE;
  return {
    email: process.env.DEV_LOGIN_EMAIL || DEV_AUTH.email,
    password: process.env.DEV_LOGIN_PASSWORD || DEV_AUTH.password,
    name: process.env.DEV_LOGIN_NAME || DEV_AUTH.name,
    openId: process.env.DEV_LOGIN_OPEN_ID || DEV_AUTH.openId,
    role: role === "user" ? "user" : "admin",
  };
}

export function shouldSeedDevUser(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_SEED_USER === "false") return false;
  return true;
}

export function validateDevAuth(username: string, password: string): DevAuthCredentials | null {
  const creds = getDevAuthCredentials();
  const userMatch = username === creds.email || username === creds.openId;
  if (userMatch && password === creds.password) return creds;
  return null;
}
