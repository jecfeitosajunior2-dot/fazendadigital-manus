export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Simple login URL for the local auth system
export const getLoginUrl = (returnPath?: string) => {
  const path = returnPath ? `?returnTo=${encodeURIComponent(returnPath)}` : "";
  return `/entrar${path}`;
};
