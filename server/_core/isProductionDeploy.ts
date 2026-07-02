import { env } from "./env";

export function isProductionDeploy(): boolean {
  return env.NODE_ENV === "production" || process.env.VERCEL === "1";
}
