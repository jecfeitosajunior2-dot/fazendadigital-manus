import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApiApp } from "../server/createApp";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApiApp();
  return app(req, res);
}
