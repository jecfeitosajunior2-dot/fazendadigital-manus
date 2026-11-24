import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { Pool } from "mysql2/promise";
import { avaliarRecuperacao, avaliarTrocaSenha } from "./senhaConta";
import { criarSenhaContaDb } from "./senhaContaDb";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(here, "..");

describe("troca e recuperação de senha", () => {
  it("aceita a troca quando a sessão e a senha atual conferem", () => {
    expect(avaliarTrocaSenha({
      sessaoConfere: true,
      atualConfere: true,
      nova: "nova-senha-segura",
      confirmacao: "nova-senha-segura",
      novaRepeteAtual: false,
    })).toEqual({ ok: true });
  });

  it("recusa a senha atual incorreta", () => {
    expect(avaliarTrocaSenha({
      sessaoConfere: true,
      atualConfere: false,
      nova: "nova-senha-segura",
      confirmacao: "nova-senha-segura",
      novaRepeteAtual: false,
    })).toMatchObject({ ok: false, motivo: "senha_atual_incorreta" });
  });

  it("recusa senha fora da política", () => {
    expect(avaliarTrocaSenha({
      sessaoConfere: true,
      atualConfere: true,
      nova: "curta",
      confirmacao: "curta",
      novaRepeteAtual: false,
    })).toMatchObject({ ok: false, motivo: "senha_invalida" });
  });

  it("recusa confirmação diferente", () => {
    expect(avaliarTrocaSenha({
      sessaoConfere: true,
      atualConfere: true,
      nova: "nova-senha-segura",
      confirmacao: "outra-senha-segura",
      novaRepeteAtual: false,
    })).toMatchObject({ ok: false, motivo: "confirmacao_diferente" });
  });

  it("recusa sessão inválida", () => {
    expect(avaliarTrocaSenha({
      sessaoConfere: false,
      atualConfere: true,
      nova: "nova-senha-segura",
      confirmacao: "nova-senha-segura",
      novaRepeteAtual: false,
    })).toMatchObject({ ok: false, motivo: "sessao_invalida" });
  });

  it("recusa repetir a senha atual", () => {
    expect(avaliarTrocaSenha({
      sessaoConfere: true,
      atualConfere: true,
      nova: "nova-senha-segura",
      confirmacao: "nova-senha-segura",
      novaRepeteAtual: true,
    })).toMatchObject({ ok: false, motivo: "senha_reutilizada" });
  });

  it("recusa recuperação sem autorização", () => {
    expect(avaliarRecuperacao({
      banco: "fd_h4cl",
      acessoAdministrativo: false,
      confirmouProcedimento: false,
      titularAutorizou: false,
      email: "pessoa@teste.isolado",
      senhaInformada: true,
      senhaTamanho: 16,
    })).toMatchObject({ ok: false, motivo: "autorizacao_ausente" });
  });

  it("recusa o banco da fazenda", () => {
    expect(avaliarRecuperacao({
      banco: "fazenda_digital",
      acessoAdministrativo: true,
      confirmouProcedimento: true,
      titularAutorizou: true,
      email: "pessoa@teste.isolado",
      senhaInformada: true,
      senhaTamanho: 16,
    })).toMatchObject({ ok: false, motivo: "banco_operacional" });
    expect(() => criarSenhaContaDb({} as Pool, {
      host: "127.0.0.1",
      port: 3306,
      database: "fd_h4cl",
    })).toThrow(/porta/);
    expect(() => criarSenhaContaDb({} as Pool, {
      host: "127.0.0.1",
      port: 3319,
      database: "fazenda_digital",
    })).toThrow(/operacional/);
  });

  it("a tela de entrar não simula o envio de e-mail", () => {
    const tela = readFileSync(resolve(raiz, "client/src/pages/LoginPage.tsx"), "utf8");
    expect(tela).toContain("Recuperar acesso");
    expect(tela).toContain("procedimento administrativo autorizado");
    expect(tela).not.toContain("Solicitação de recuperação registrada.");
    expect(tela).not.toContain("Enviar instruções");
    expect(tela).not.toContain("recoveryEmail");
  });

  it("o roteador troca a senha só de quem está na sessão", () => {
    const roteador = readFileSync(resolve(here, "acessoContaRouter.ts"), "utf8");
    const inicio = roteador.indexOf("alterarMinhaSenha:");
    const fim = roteador.indexOf("inativarUsuario:", inicio);
    const trecho = roteador.slice(inicio, fim);
    expect(trecho).toContain("ctx.user.id");
    expect(trecho).not.toContain("usuarioId");
    expect(trecho).not.toContain("executorId");
    expect(trecho).not.toContain("titularUserId");
    expect(roteador).not.toContain("recuperarAcesso");
  });

  it("o comando recusa o banco da fazenda sem abrir conexão", async () => {
    const fonte = readFileSync(resolve(raiz, "scripts/recuperar-acesso.ts"), "utf8");
    const recusa = fonte.indexOf("fazenda_digital");
    const conexao = fonte.indexOf("mysql.createPool");
    expect(recusa).toBeGreaterThan(0);
    expect(recusa).toBeLessThan(conexao);
    const resultado = await exec(process.execPath, [
      resolve(raiz, "node_modules/tsx/dist/cli.mjs"),
      resolve(raiz, "scripts/recuperar-acesso.ts"),
      "--confirmo-recuperacao",
    ], {
      cwd: raiz,
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: "mysql://root:fechada@127.0.0.1:3306/fazenda_digital",
        FD_RECUPERAR_ACESSO: "1",
        FD_RECUPERAR_AUTORIZACAO_TITULAR: "1",
        FD_RECUPERAR_EMAIL: "pessoa@teste.isolado",
        FD_RECUPERAR_SENHA: "credencial-de-teste",
      },
    }).then(
      () => ({ code: 0, stderr: "" }),
      (erro: { code?: number; stderr?: string }) => ({ code: erro.code ?? 1, stderr: String(erro.stderr ?? "") }),
    );
    expect(resultado.code).not.toBe(0);
    expect(resultado.stderr).not.toContain("credencial-de-teste");
  });
});
