import { describe, expect, it, vi } from "vitest";

vi.mock("./isProductionDeploy", () => ({
  isProductionDeploy: () => false,
}));

vi.mock("./cookies", () => ({
  createSession: vi.fn(async (user: { id: number }) => `token-${user.id}`),
  setAuthCookie: vi.fn(),
}));

import { setAuthCookie } from "./cookies";
import { tryDevLoginFallback, tryDevPreviewSession } from "./devLoginFallback";

describe("login local de preview", () => {
  it("abre sessão quando o e-mail conhecido não está no banco", async () => {
    const res = {} as never;
    const session = await tryDevLoginFallback("pngomes1@gmail.com", "123456", res);
    expect(session?.user.id).toBe(1);
    expect(session?.user.name).toBe("Paulo Gomes");
    expect(setAuthCookie).toHaveBeenCalled();
  });

  it("religa a sessão pelo e-mail já autenticado no preview", async () => {
    const res = {} as never;
    const session = await tryDevPreviewSession("pngomes1@gmail.com", res);
    expect(session?.success).toBe(true);
    expect(session?.user.id).toBe(1);
  });

  it("não abre sessão para e-mail desconhecido", async () => {
    const res = {} as never;
    await expect(tryDevPreviewSession("outro@fazenda.local", res)).resolves.toBeNull();
  });

  it("religa preview em localhost mesmo com NODE_ENV production", async () => {
    const res = { req: { hostname: "localhost" } } as never;
    const session = await tryDevPreviewSession("admin@fazendadigital.local", res, "localhost");
    expect(session?.success).toBe(true);
  });
});
