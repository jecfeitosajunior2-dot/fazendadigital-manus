import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { invalidarConsultasAposSessaoHttp, sessaoHttpConfirmada } from "./sessaoHttpAuth";

const here = dirname(fileURLToPath(import.meta.url));

describe("sessaoHttpAuth", () => {
  it("só aceita usuário de auth.me com id", () => {
    expect(sessaoHttpConfirmada(undefined)).toBe(false);
    expect(sessaoHttpConfirmada(null)).toBe(false);
    expect(sessaoHttpConfirmada({ id: 0 })).toBe(false);
    expect(sessaoHttpConfirmada({ id: 1 })).toBe(true);
  });

  it("invalida auth, fazendas e financeiro V2 uma vez", async () => {
    const utils = {
      auth: { me: { invalidate: vi.fn(async () => undefined) } },
      fazendas: { list: { invalidate: vi.fn(async () => undefined) } },
      financeiroV2: { invalidate: vi.fn(async () => undefined) },
    };
    await invalidarConsultasAposSessaoHttp(utils);
    expect(utils.auth.me.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.fazendas.list.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.financeiroV2.invalidate).toHaveBeenCalledTimes(1);
  });

  it("Relatórios esperam auth.me e não usam localStorage", () => {
    const page = readFileSync(resolve(here, "../pages/FinanceiroRelatoriosPage.tsx"), "utf8");
    expect(page).toContain("trpc.auth.me.useQuery");
    expect(page).toContain("sessaoHttpConfirmada");
    expect(page).toContain("enabled: autenticado");
    expect(page).not.toContain("getLocalAuthUser");
    expect(page).toContain("Carregando relatórios oficiais");
  });

  it("AuthGuard não libera o app só com localStorage", () => {
    const layout = readFileSync(resolve(here, "../components/AppLayout.tsx"), "utf8");
    expect(layout).toContain("if (!user) return null");
    expect(layout).toContain("clearLocalAuthSession");
    expect(layout).not.toContain("ensureLocalPreviewSession");
    expect(layout).not.toContain("getLocalAuthUser");
    expect(layout).not.toContain("aguardandoSessao");
  });

  it("cabeçalho e useAuth não tratam localStorage como sessão", () => {
    const topbar = readFileSync(resolve(here, "../components/Topbar.tsx"), "utf8");
    const auth = readFileSync(resolve(here, "../_core/hooks/useAuth.ts"), "utf8");
    expect(topbar).not.toContain("getLocalAuthUser");
    expect(topbar).not.toContain("localUser");
    expect(auth).toContain("isAuthenticated: !!user");
    expect(auth).not.toContain("getLocalAuthUser");
    expect(auth).not.toContain("localUser");
  });
});
