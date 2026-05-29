import type { Request, Response } from "express";
import { verifySession } from "./cookies";

export type UserContext = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
};

export type Context = {
  req: Request;
  res: Response;
  user: UserContext | null;
};

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const user = await verifySession(req).catch(() => null);
  return { req, res, user };
}
