import type { Request, Response } from "express";
import { carregarIdentidade } from "./carregarIdentidade";
import { verifySession } from "./cookies";
import { resolverIdentidadeDaRequisicao, type IdentidadeUsuario, type PapelConta, type SituacaoUsuario } from "./identidadeSessao";

export type UserContext = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
  papel?: PapelConta;
  titularUserId?: number;
  situacao?: SituacaoUsuario;
  sessionVersion?: number;
};

export type Context = {
  req: Request;
  res: Response;
  user: IdentidadeUsuario | null;
};

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const payload = await verifySession(req).catch(() => null);
  const user = await resolverIdentidadeDaRequisicao(payload, carregarIdentidade);
  return { req, res, user };
}
