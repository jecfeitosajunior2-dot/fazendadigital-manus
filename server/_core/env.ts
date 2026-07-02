import { config } from "dotenv";
config({ path: ".env.local" });
config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET || "fallback-secret-for-dev",
  VITE_APP_ID: process.env.VITE_APP_ID || "",
  OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL || "",
  VITE_OAUTH_PORTAL_URL: process.env.VITE_OAUTH_PORTAL_URL || "",
  OWNER_OPEN_ID: process.env.OWNER_OPEN_ID || "",
  OWNER_NAME: process.env.OWNER_NAME || "",
  BUILT_IN_FORGE_API_URL: process.env.BUILT_IN_FORGE_API_URL || "",
  BUILT_IN_FORGE_API_KEY: process.env.BUILT_IN_FORGE_API_KEY || "",
  NODE_ENV: process.env.NODE_ENV || "development",
};
