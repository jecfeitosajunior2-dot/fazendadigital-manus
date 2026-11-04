import bcrypt from "bcryptjs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashDeSenhaValido, MSG_LOGIN_INVALIDO, senhaConfereComHash } from "./loginSenha";

const here = dirname(fileURLToPath(import.meta.url));
const SENHA_FIXA_ANTIGA = "admin123";

describe("verificação de senha no login", () => {
  it("aceita senha correta quando o hash é válido", async () => {
    const hash = await bcrypt.hash("senha-correta-do-usuario", 10);
    expect(hashDeSenhaValido(hash)).toBe(true);
    await expect(senhaConfereComHash(hash, "senha-correta-do-usuario")).resolves.toBe(true);
  });

  it("rejeita senha errada quando o hash é válido", async () => {
    const hash = await bcrypt.hash("senha-correta-do-usuario", 10);
    await expect(senhaConfereComHash(hash, "senha-errada")).resolves.toBe(false);
  });

  it("rejeita a senha fixa antiga quando não há hash", async () => {
    await expect(senhaConfereComHash(null, SENHA_FIXA_ANTIGA)).resolves.toBe(false);
    await expect(senhaConfereComHash("", SENHA_FIXA_ANTIGA)).resolves.toBe(false);
    await expect(senhaConfereComHash("!", SENHA_FIXA_ANTIGA)).resolves.toBe(false);
  });

  it("usuário inexistente não autentica", async () => {
    const usuario = null as { passwordHash: string | null } | null;
    await expect(senhaConfereComHash(usuario?.passwordHash, "qualquer-senha")).resolves.toBe(false);
  });

  it("o login do servidor usa a mesma mensagem e não chama a senha fixa", () => {
    const routers = readFileSync(resolve(here, "../routers.ts"), "utf8");
    const inicio = routers.indexOf("login: publicProcedure");
    const fim = routers.indexOf("logout: publicProcedure");
    const login = routers.slice(inicio, fim);
    expect(login).toContain("senhaConfereComHash");
    expect(login).toContain("MSG_LOGIN_INVALIDO");
    expect(login).not.toContain(SENHA_FIXA_ANTIGA);
    expect(login).not.toContain("tryDevLoginFallback");
    expect(login).not.toContain("Usuário não encontrado");
    expect(login).not.toContain("Senha incorreta");
    expect(MSG_LOGIN_INVALIDO).toBe("Usuário ou senha inválidos.");

    const preview = routers.slice(
      routers.indexOf("ensureLocalPreviewSession"),
      routers.indexOf("ensureLocalPreviewSession") + 500,
    );
    expect(preview).toContain("success: false");
    expect(preview).not.toContain("setAuthCookie");
    expect(preview).not.toContain("tryDevPreviewSession");
  });

  it("não resta instrumentação temporária de diagnóstico", () => {
    expect(existsSync(resolve(here, "loginDiagnostico.ts"))).toBe(false);
    expect(existsSync(resolve(here, "loginDiagnostico.test.ts"))).toBe(false);
    const senha = readFileSync(resolve(here, "loginSenha.ts"), "utf8");
    const routers = readFileSync(resolve(here, "../routers.ts"), "utf8");
    for (const texto of [senha, routers]) {
      expect(texto).not.toContain("loginDiagnostico");
      expect(texto).not.toContain("abrirObservacaoSeArmada");
      expect(texto).not.toContain("concluirObservacao");
      expect(texto).not.toContain("observarEntradaLogin");
      expect(texto).not.toContain("anotarComparacao");
      expect(texto).not.toContain("fd-login-diag");
    }
  });
});
