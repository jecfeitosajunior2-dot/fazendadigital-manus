import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getLocalAuthUser, signInLocal } from "./localAuth";

const here = dirname(fileURLToPath(import.meta.url));

describe("sessão local no navegador", () => {
  it("e-mail e senha de demonstração não criam sessão", () => {
    expect(signInLocal("pngomes1@gmail.com", "123456")).toBeNull();
    expect(signInLocal("admin@fazendadigital.local", "admin123")).toBeNull();
    expect(getLocalAuthUser()).toBeNull();
  });

  it("a tela de login e o guarda não contornam o servidor", () => {
    const login = readFileSync(resolve(here, "../pages/LoginPage.tsx"), "utf8");
    const layout = readFileSync(resolve(here, "../components/AppLayout.tsx"), "utf8");
    const auth = readFileSync(resolve(here, "localAuth.ts"), "utf8");

    expect(login).not.toContain("signInLocal");
    expect(login).not.toContain("getLocalAuthUser");
    expect(login).toContain("Usuário ou senha inválidos.");
    expect(login).toContain("trpc.auth.login");
    expect(login).toContain("trpc.auth.me");

    expect(layout).not.toContain("ensureLocalPreviewSession");
    expect(layout).not.toContain("getLocalAuthUser");
    expect(layout).toContain("if (!user) return null");
    expect(layout).toContain("clearLocalAuthSession");

    expect(auth).not.toContain("localStorage.setItem");
    expect(auth).not.toContain("123456");
    expect(auth).not.toContain("admin123");
  });
});