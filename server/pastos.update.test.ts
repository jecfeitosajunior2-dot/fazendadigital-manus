import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import {
  avaliarEdicaoPasto,
  deveUsarEspelhoQuandoBancoCai,
  editarPastoNaTransacao,
  pastoLocalDoTitular,
  type TransacaoEdicaoPasto,
} from "./routers";

const here = dirname(fileURLToPath(import.meta.url));

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel" | "titularUserId" | "situacao">): IdentidadeUsuario {
  return {
    openId: `ficticio-openid-${parcial.id}`,
    name: "Teste",
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    sessionVersion: 0,
    ...parcial,
  };
}

const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "ativo" });
const secundario = pessoa({ id: 3, papel: "secundario", titularUserId: 1, situacao: "ativo" });
const comum = pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "ativo" });
const fazendaA = { id: 10, userId: 1 };
const fazendaB = { id: 20, userId: 1 };
const fazendaAlheia = { id: 30, userId: 9 };
const pastoNorte = { id: 7, userId: 1, fazendaId: 10 };
const pastoSul = { id: 8, userId: 1, fazendaId: 20 };
const pastoAlheio = { id: 9, userId: 9, fazendaId: 30 };
const campos = { id: 7, nome: "Pasto Renomeado" };

function editar(parcial: Partial<Parameters<typeof avaliarEdicaoPasto>[0]> = {}) {
  return avaliarEdicaoPasto({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: [fazendaA, fazendaB],
    pasto: pastoNorte,
    fazenda: fazendaA,
    campos,
    sessionVersionDaSessao: principal.sessionVersion,
    ...parcial,
  });
}

function blocoDaEdicao() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const router = fonte.indexOf("const pastosRouter");
  const inicio = fonte.indexOf("update: protectedProcedure", router);
  return fonte.slice(inicio, fonte.indexOf("delete: protectedProcedure", inicio));
}

function blocoDaTransacao() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const inicio = fonte.indexOf("export async function editarPastoNaTransacao");
  return fonte.slice(inicio, fonte.indexOf("function adaptadorEdicaoPasto"));
}

describe("pastos.update", () => {
  it("1. Principal edita pasto próprio", () => {
    const resultado = editar();
    expect(resultado.ok && resultado.valores).toEqual({ nome: "Pasto Renomeado" });
  });

  it("2. Principal edita pasto da outra fazenda própria", () => {
    const resultado = editar({
      pasto: pastoSul,
      fazenda: fazendaB,
      campos: { id: 8, status: "descanso" },
    });
    expect(resultado.ok && resultado.valores).toEqual({ status: "descanso" });
  });

  it("3. Principal não edita pasto de outra conta", () => {
    const resultado = editar({
      pasto: pastoAlheio,
      fazenda: fazendaAlheia,
      campos: { id: 9, nome: "Invasão" },
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("4. Principal não edita pasto inexistente", () => {
    const resultado = editar({ pasto: null, fazenda: null, campos: { id: 999, nome: "Ninguém" } });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("5. Secundário autorizado edita o pasto concedido", () => {
    const resultado = editar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.valores.nome).toBe("Pasto Renomeado");
  });

  it("6. Secundário não edita pasto de fazenda não concedida", () => {
    const resultado = editar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pasto: pastoSul,
      fazenda: fazendaB,
      campos: { id: 8, nome: "Fora" },
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("7. Secundário sem pastos.editar não edita", () => {
    const resultado = editar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["pastos.editar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("8. Comum autorizado edita", () => {
    const resultado = editar({
      identidade: comum,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado.ok).toBe(true);
  });

  it("9. Comum sem permissão não edita", () => {
    const resultado = editar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      pasto: null,
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(readFileSync(resolve(here, "routers.ts"), "utf8")).toContain('message: "Sem permissão para editar pastos."');
  });

  it("10. Usuário inativo não edita", () => {
    const resultado = editar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("11. Usuário convidado não edita", () => {
    const resultado = editar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("12. Sessão inválida não edita", () => {
    expect(editar({ identidade: null, papelInformadoPeloCliente: "principal" }))
      .toEqual({ ok: false, motivo: "sem_identidade" });
    expect(blocoDaEdicao()).toContain('code: "UNAUTHORIZED"');
  });

  it("13. Permissão revogada impede a edição seguinte", () => {
    const com = editar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = editar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok).toBe(true);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("14. Vínculo revogado impede a edição seguinte", () => {
    const resultado = editar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("15. sessionVersion divergente impede a edição", () => {
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, { ...principal, sessionVersion: 2 }, false)).toBeNull();
    expect(editar({ sessionVersionDaSessao: 4 })).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("16. Pasto de outra conta não entra na alteração", () => {
    const resultado = editar({ pasto: pastoAlheio, fazenda: fazendaAlheia, campos: { id: 9, nome: "Troca" } });
    expect(resultado.ok).toBe(false);
    expect(resultado).not.toHaveProperty("valores");
  });

  it("17. Pasto com fazenda de outra conta não é editado", () => {
    const resultado = editar({
      pasto: { id: 15, userId: 1, fazendaId: 30 },
      fazenda: fazendaAlheia,
      campos: { id: 15, nome: "Cruzado" },
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("18. Pasto com fazenda inexistente não é editado", () => {
    const resultado = editar({
      pasto: { id: 16, userId: 1, fazendaId: 999 },
      fazenda: null,
      campos: { id: 16, nome: "Solto" },
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("19. Conhecer o id não autoriza", () => {
    const resultado = editar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pasto: pastoAlheio,
      fazenda: fazendaAlheia,
      campos: { id: 9, nome: "Atalho" },
      fazendasInformadasPeloCliente: [30],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("20. userId não entra na alteração", () => {
    const resultado = editar({ campos: { id: 7, nome: "Pasto Renomeado", userId: 9 } });
    expect(resultado.ok && resultado.valores).toEqual({ nome: "Pasto Renomeado" });
    expect(resultado.ok && resultado.valores).not.toHaveProperty("userId");
  });

  it("21. fazendaId não entra na alteração", () => {
    const resultado = editar({ campos: { id: 7, nome: "Pasto Renomeado", fazendaId: 30 } });
    expect(resultado.ok && resultado.valores).not.toHaveProperty("fazendaId");
    expect(blocoDaEdicao()).not.toContain("fazendaId:");
  });

  it("22. Os opcionais do formulário permanecem", () => {
    const resultado = editar({
      campos: {
        id: 7, nome: "Norte", sigla: "PN", tipo: "Retiro", tipoPastagem: "Mombaça",
        area: "4.00", incluirArea: false, capacidade: 12, status: "reforma", observacoes: "Seco",
      },
    });
    expect(resultado.ok && resultado.valores).toEqual({
      nome: "Norte", sigla: "PN", tipo: "Retiro", tipoPastagem: "Mombaça",
      area: "4.00", incluirArea: false, capacidade: 12, status: "reforma", observacoes: "Seco",
    });
  });

  it("23. Campo omitido não vai na gravação", () => {
    const resultado = editar({ campos: { id: 7, status: "vazio" } });
    expect(resultado.ok && resultado.valores).toEqual({ status: "vazio" });
    expect(resultado.ok && resultado.valores).not.toHaveProperty("nome");
    expect(resultado.ok && resultado.valores).not.toHaveProperty("observacoes");
  });

  it("24. Omissão não vira nulo", () => {
    const resultado = editar({ campos: { id: 7, nome: "Pasto Renomeado" } });
    expect(resultado.ok && resultado.valores.observacoes).toBeUndefined();
    expect(resultado.ok && resultado.valores).not.toHaveProperty("sigla");
  });

  it("25. As situações existentes continuam aceitas", () => {
    const situacoes = ["ativo", "descanso", "vazio", "reforma", "interditado", "reserva", "sem_uso"] as const;
    for (const status of situacoes) {
      const resultado = editar({ campos: { id: 7, status } });
      expect(resultado.ok && resultado.valores.status).toBe(status);
    }
    expect(blocoDaEdicao()).toContain('"sem_uso"');
  });

  it("26. O retorno continua sendo sucesso", () => {
    expect(blocoDaEdicao()).toContain("return { success: true as const }");
    expect(blocoDaEdicao()).not.toContain("localFallback");
    expect(blocoDaEdicao().indexOf("espelharPastoDepoisDoCommit")).toBeGreaterThan(blocoDaEdicao().indexOf("await db.transaction"));
  });

  it("27. Pasto inexistente não retorna sucesso", async () => {
    const chamadas: unknown[] = [];
    await expect(editarPastoNaTransacao(principal, { id: 999, nome: "Ninguém" }, transacao({
      travarPasto: async () => null,
      atualizarPasto: async (_id, _titular, valores) => { chamadas.push(valores); },
    }))).rejects.toBeInstanceOf(TRPCError);
    expect(chamadas).toEqual([]);
  });

  it("28. Os mesmos valores, no pasto autorizado, seguem como sucesso", async () => {
    await expect(editarPastoNaTransacao(principal, { id: 7, nome: "Pasto Norte" }, transacao())).resolves.toBeUndefined();
  });

  it("29. Falha na atualização não vira sucesso", async () => {
    await expect(editarPastoNaTransacao(principal, campos, transacao({
      atualizarPasto: async () => { throw new Error("falha de atualização"); },
    }))).rejects.toThrow("falha de atualização");
  });

  it("30. Erro que não é queda de banco não abre o espelho", () => {
    const bloco = blocoDaEdicao();
    expect(bloco).toContain("if (error instanceof TRPCError) throw error");
    expect(bloco).toContain("if (!isDatabaseUnavailable(error)) throw error");
  });

  it("31. O espelho do Principal exige pasto e fazenda da própria conta", () => {
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(pastoLocalDoTitular([pastoNorte, pastoAlheio], 1, 7)?.id).toBe(7);
    expect(pastoLocalDoTitular([pastoAlheio], 1, 9)).toBeNull();
    expect(blocoDaEdicao()).not.toContain("deveUsarEspelhoQuandoBancoCai");
    expect(blocoDaEdicao()).toContain("recusarPastoSemMysql()");
  });

  it("32. Secundário não edita no espelho", () => {
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
  });

  it("33. Comum não edita no espelho", () => {
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
  });

  it("34. O espelho não acha pasto de outro proprietário", () => {
    expect(pastoLocalDoTitular([{ id: 7, userId: 9, fazendaId: 10 }], 1, 7)).toBeNull();
    const bloco = blocoDaEdicao();
    expect(bloco).toContain("updateLocalPasto(");
    expect(bloco).toContain("identidade.titularUserId");
    expect(bloco).toContain("valoresEdicaoPasto(input)");
    expect(bloco).not.toContain("updateLocalPasto(ctx.user.id");
    expect(bloco.slice(bloco.indexOf("} catch"))).not.toContain("updateLocalPasto");
  });

  it("35. Os formulários de pasto e subdivisão continuam cabendo na entrada", () => {
    const bloco = blocoDaEdicao();
    for (const campo of ["id", "nome", "sigla", "tipo", "tipoPastagem", "area", "incluirArea", "capacidade", "status", "observacoes"]) {
      expect(bloco).toContain(campo);
    }
    const ordem = blocoDaTransacao();
    expect(ordem.indexOf("travarUsuario")).toBeLessThan(ordem.indexOf("travarPermissoes"));
    expect(ordem.indexOf("travarPermissoes")).toBeLessThan(ordem.indexOf("travarVinculos"));
    expect(ordem.indexOf("travarVinculos")).toBeLessThan(ordem.indexOf("travarPasto"));
    expect(ordem.indexOf("travarPasto")).toBeLessThan(ordem.indexOf("travarFazenda"));
    expect(ordem.indexOf("travarFazenda")).toBeLessThan(ordem.indexOf("atualizarPasto"));
  });
});

function usuarioDe(identidade: IdentidadeUsuario) {
  return {
    id: identidade.id,
    openId: identidade.openId,
    name: identidade.name,
    email: identidade.email,
    role: identidade.role,
    papel: identidade.papel,
    titularUserId: identidade.titularUserId,
    situacao: identidade.situacao,
    sessionVersion: identidade.sessionVersion,
  };
}

function transacao(parcial: Partial<TransacaoEdicaoPasto> = {}): TransacaoEdicaoPasto {
  return {
    travarUsuario: async () => usuarioDe(principal),
    travarPermissoes: async () => [],
    travarVinculos: async () => [],
    travarPasto: async () => pastoNorte,
    travarFazenda: async () => fazendaA,
    atualizarPasto: async () => undefined,
    relerPasto: async () => pastoNorte,
    ...parcial,
  };
}
