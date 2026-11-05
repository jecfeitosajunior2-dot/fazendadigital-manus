import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { appRouter } from "./routers";

const here = dirname(fileURLToPath(import.meta.url));
const MENSAGEM = "A exclusão de pastos está temporariamente indisponível para preservar os vínculos com lotes, animais e históricos.";

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel" | "titularUserId">): IdentidadeUsuario {
  return {
    openId: `ficticio-openid-${parcial.id}`,
    name: "Teste",
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    situacao: "ativo",
    sessionVersion: 0,
    ...parcial,
  };
}

const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1 });
const secundario = pessoa({ id: 3, papel: "secundario", titularUserId: 1 });
const comum = pessoa({ id: 2, papel: "comum", titularUserId: 1 });

function chamar(user: IdentidadeUsuario | null) {
  return appRouter.createCaller({ user, req: {} as never, res: {} as never });
}

function blocoDaExclusao() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const router = fonte.indexOf("const pastosRouter");
  const inicio = fonte.indexOf("delete: protectedProcedure", router);
  return fonte.slice(inicio, fonte.indexOf("importarCoordenadas: protectedProcedure", inicio));
}

describe("pastos.delete bloqueada", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Usuário autenticado recebe a recusa e nada é apagado", async () => {
    const escrita = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    await expect(chamar(principal).pastos.delete({ id: 7 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: MENSAGEM,
    });
    expect(escrita).not.toHaveBeenCalled();
  });

  it("2. Pasto inexistente recebe a mesma recusa", async () => {
    await expect(chamar(principal).pastos.delete({ id: 404 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: MENSAGEM,
    });
  });

  it("3. Pasto de outra conta recebe a mesma recusa, sem consulta", async () => {
    await expect(chamar(principal).pastos.delete({ id: 9 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: MENSAGEM,
    });
    const bloco = blocoDaExclusao();
    expect(bloco).not.toContain("db.select");
    expect(bloco).not.toContain("db.delete");
    expect(bloco).not.toContain("outra conta");
  });

  it("4. Secundário e Comum também são recusados, sem espelho", async () => {
    await expect(chamar(secundario).pastos.delete({ id: 7 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: MENSAGEM,
    });
    await expect(chamar(comum).pastos.delete({ id: 7 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: MENSAGEM,
    });
    expect(blocoDaExclusao()).not.toContain("deleteLocalPasto");
    expect(blocoDaExclusao()).not.toContain("localFallback");
  });

  it("5. Sessão inválida continua na autenticação", async () => {
    const escrita = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    await expect(chamar(null).pastos.delete({ id: 7 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(escrita).not.toHaveBeenCalled();
    expect(blocoDaExclusao().startsWith("delete: protectedProcedure")).toBe(true);
  });

  it("6. A recusa acontece antes de qualquer fallback de conexão", async () => {
    const bloco = blocoDaExclusao();
    expect(bloco).not.toContain("isDatabaseUnavailable");
    expect(bloco).not.toContain("deleteLocalPasto");
    await expect(chamar(principal).pastos.delete({ id: 7 })).rejects.toBeInstanceOf(TRPCError);
    await expect(chamar(principal).pastos.delete({ id: 7 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: MENSAGEM,
    });
  });

  it("7. Não há escrita, delete nem update", async () => {
    const escrita = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    await expect(chamar(principal).pastos.delete({ id: 7 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(escrita).not.toHaveBeenCalled();
    const bloco = blocoDaExclusao();
    expect(bloco).not.toContain("db.delete");
    expect(bloco).not.toContain("db.update");
    expect(bloco).not.toContain("deleteLocalPasto");
    expect(bloco).not.toContain("writePastos");
    expect(bloco).not.toContain("success: true");
  });

  it("8. A entrada continua sendo só o número do pasto", async () => {
    expect(blocoDaExclusao()).toContain(".input(z.object({ id: z.number() }))");
    await expect(chamar(principal).pastos.delete({} as { id: number })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("9. As duas telas mostram a mensagem do servidor e os botões continuam", () => {
    const painel = readFileSync(resolve(here, "../client/src/components/FazendaSubdivisoesPanel.tsx"), "utf8");
    const folha = readFileSync(resolve(here, "../client/src/components/FarmPastosSheet.tsx"), "utf8");
    expect(painel).toContain("trpc.pastos.delete.useMutation");
    expect(painel).toContain("onError: e => toast.error(e.message)");
    expect(folha).toContain("trpc.pastos.delete.useMutation");
    expect(folha).toContain("onError: e => toast.error(e.message)");
    expect(painel).toContain('label="Excluir"');
    expect(folha).toContain('confirm("Remover este pasto?")');
  });
});
