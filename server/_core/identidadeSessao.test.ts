import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  avaliarPrecondicaoIdentidade,
  decidirSessao,
  loginPermitido,
  resolverIdentidadeDaRequisicao,
  type IdentidadeUsuario,
} from "./identidadeSessao";
import { OAUTH_CALLBACK_HABILITADO, recusarOAuthDesabilitado } from "./oauthAcesso";

const here = dirname(fileURLToPath(import.meta.url));

function principal(): IdentidadeUsuario {
  return {
    id: 7,
    openId: "principal-ficticio",
    name: "Administrador fictício",
    email: "principal@isolado.local",
    role: "admin",
    papel: "principal",
    titularUserId: 7,
    situacao: "ativo",
    sessionVersion: 0,
  };
}

describe("identidade e sessão", () => {
  it("aceita o principal ativo quando a versão confere, mesmo com cookie antigo", () => {
    const registro = principal();
    const sessao = decidirSessao({ id: 7, role: "user", papel: "comum" }, registro, false);
    expect(sessao).toEqual(registro);
    expect(loginPermitido("ativo")).toBe(true);
  });

  it("rejeita login quando a situação não está ativa", () => {
    expect(loginPermitido("inativo")).toBe(false);
    expect(loginPermitido("convidado")).toBe(false);
    expect(loginPermitido(undefined)).toBe(false);
  });

  it("rejeita cookie adulterado e usuário inexistente", () => {
    expect(decidirSessao(null, principal(), false)).toBeNull();
    expect(decidirSessao({ id: 7, sessionVersion: 0 }, null, false)).toBeNull();
    expect(decidirSessao({ id: 8, sessionVersion: 0 }, principal(), false)).toBeNull();
  });

  it("rejeita usuário inativo ainda que o cookie diga administrador", () => {
    const inativo = { ...principal(), situacao: "inativo" as const };
    expect(decidirSessao({ id: 7, role: "admin", papel: "principal", sessionVersion: 0 }, inativo, false)).toBeNull();
  });

  it("rejeita sessão revogada e versão divergente", () => {
    const revogada = { ...principal(), sessionVersion: 1 };
    expect(decidirSessao({ id: 7, sessionVersion: 0 }, revogada, false)).toBeNull();
    const divergente = { ...principal(), sessionVersion: 2 };
    expect(decidirSessao({ id: 7, sessionVersion: 4 }, divergente, false)).toBeNull();
  });

  it("ignora papel administrativo desatualizado no cookie", () => {
    const comum = { ...principal(), role: "user" as const, papel: "comum" as const };
    const sessao = decidirSessao({ id: 7, role: "admin", papel: "principal", sessionVersion: 0 }, comum, false);
    expect(sessao?.role).toBe("user");
    expect(sessao?.papel).toBe("comum");
  });

  it("não autentica quando o banco não confirma a identidade", async () => {
    const payload = { id: 7, role: "admin", papel: "principal", sessionVersion: 0 };
    expect(decidirSessao(payload, principal(), true)).toBeNull();
    await expect(resolverIdentidadeDaRequisicao(payload, async () => {
      throw new Error("banco indisponível");
    })).resolves.toBeNull();
    await expect(resolverIdentidadeDaRequisicao(payload, async () => null)).resolves.toBeNull();
  });

  it("preserva o administrador principal na pré-condição conferida", () => {
    expect(avaliarPrecondicaoIdentidade({
      total: 1,
      admins: 1,
      emailsNulos: 0,
      gruposDuplicados: 0,
      colunaPapel: 0,
    })).toEqual({ ok: true });
  });

  it("interrompe e-mail duplicado, e-mail nulo e mais de um administrador", () => {
    expect(avaliarPrecondicaoIdentidade({
      total: 2,
      admins: 1,
      emailsNulos: 0,
      gruposDuplicados: 1,
      colunaPapel: 0,
    }).ok).toBe(false);
    expect(avaliarPrecondicaoIdentidade({
      total: 1,
      admins: 1,
      emailsNulos: 1,
      gruposDuplicados: 0,
      colunaPapel: 0,
    }).ok).toBe(false);
    expect(avaliarPrecondicaoIdentidade({
      total: 2,
      admins: 2,
      emailsNulos: 0,
      gruposDuplicados: 0,
      colunaPapel: 0,
    }).ok).toBe(false);
  });
});

describe("bloqueio do OAuth e textos do login", () => {
  it("recusa o callback sem criar usuário", () => {
    expect(OAUTH_CALLBACK_HABILITADO).toBe(false);
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    expect(recusarOAuthDesabilitado(res as unknown as Response)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "oauth_desabilitado" });

    const oauth = readFileSync(resolve(here, "oauth.ts"), "utf8");
    const corpo = oauth.slice(oauth.indexOf("export async function handleOAuthCallback"));
    expect(corpo.indexOf("recusarOAuthDesabilitado")).toBeLessThan(corpo.indexOf("fetch("));
    expect(corpo).toContain("db.insert(users)");
    expect(oauth).toContain("export async function handleOAuthCallback");
  });

  it("auth.me não devolve o cookie quando o banco falha ou o usuário some", () => {
    const routers = readFileSync(resolve(here, "../routers.ts"), "utf8");
    const me = routers.slice(routers.indexOf("me: publicProcedure"), routers.indexOf("login: publicProcedure"));
    expect(me).not.toContain("return ctx.user");
    expect(me).not.toContain("isDatabaseUnavailable");
    expect(me).toContain("return null");

    const login = routers.slice(routers.indexOf("login: publicProcedure"), routers.indexOf("logout: publicProcedure"));
    expect(login).toContain("loginPermitido");
    expect(login).toContain("sessionVersion");
    expect(login).toContain("MSG_LOGIN_INVALIDO");
    expect(login).not.toContain("passwordHash:");
  });

  it("a migração preparada não roda sozinha e não mexe no userId dos módulos", () => {
    const sql = readFileSync(resolve(here, "../../drizzle/migrations/0062_usuarios_identidade_sessao.sql"), "utf8");
    expect(sql).toContain("NÃO EXECUTAR nesta etapa");
    expect(sql).toContain("NÃO usar db:push");
    expect(sql).toContain("CALL fd_75_identidade_sessao();");
    expect(sql.indexOf("-- CALL fd_75_identidade_sessao();")).toBeGreaterThan(-1);
    expect(sql).toContain("`papel` = 'principal'");
    expect(sql).toContain("`titularUserId` = `id`");
    expect(sql).toContain("`situacao` = 'ativo'");
    expect(sql).toContain("users_email_uq");
    expect(sql).toContain("SET acao = 'reparar'");
    expect(sql).toContain("SET acao = 'nada'");
    expect(sql).toContain("START TRANSACTION");
    expect(sql).toContain("ROLLBACK");
    expect(sql).not.toContain("a coluna papel ja existe");
    expect(sql).not.toMatch(/UPDATE\s+`?(animais|fazendas|estoque|compras|vendas)`?/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("o papel do cookie não libera procedimento administrativo", () => {
    const trpc = readFileSync(resolve(here, "trpc.ts"), "utf8");
    const bloco = trpc.slice(trpc.indexOf("export const adminProcedure"));
    expect(bloco).toContain('ctx.user.papel !== "principal"');
    expect(bloco).toContain('ctx.user.role !== "admin"');
  });
});
