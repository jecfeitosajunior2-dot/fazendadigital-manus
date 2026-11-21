import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import {
  criarPastoNaTransacao,
  decidirCriacaoPasto,
  deveUsarEspelhoQuandoBancoCai,
  fazendaLocalDoTitular,
  type TransacaoCriacaoPasto,
  type ValoresNovoPasto,
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
const campos = { fazendaId: 10, nome: "Pasto Norte", userId: 99 };

function criar(parcial: Partial<Parameters<typeof decidirCriacaoPasto>[0]> = {}) {
  return decidirCriacaoPasto({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: [fazendaA, fazendaB],
    fazenda: fazendaA,
    campos,
    sessionVersionDaSessao: principal.sessionVersion,
    ...parcial,
  });
}

function blocoDoCadastro() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const router = fonte.indexOf("const pastosRouter");
  const inicio = fonte.indexOf("create: protectedProcedure", router);
  return fonte.slice(inicio, fonte.indexOf("update: protectedProcedure", inicio));
}

function blocoDaTransacao() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const inicio = fonte.indexOf("export async function criarPastoNaTransacao");
  return fonte.slice(inicio, fonte.indexOf("function linhasMysql"));
}

describe("pastos.create", () => {
  it("1. Principal cria pasto na fazenda própria", () => {
    const resultado = criar();
    expect(resultado.ok && resultado.valores).toMatchObject({ userId: 1, fazendaId: 10, nome: "Pasto Norte" });
  });

  it("2. Principal cria na outra fazenda própria", () => {
    const resultado = criar({ fazenda: fazendaB, campos: { fazendaId: 20, nome: "Pasto Sul" } });
    expect(resultado.ok && resultado.valores.fazendaId).toBe(20);
  });

  it("3. Principal não cria em fazenda de outra conta", () => {
    const resultado = criar({
      fazenda: fazendaAlheia,
      fazendasDoTitular: [fazendaA, fazendaB],
      campos: { fazendaId: 30, nome: "Invasão" },
      fazendasInformadasPeloCliente: [30],
    });
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_recusada" });
  });

  it("4. Principal não cria em fazenda inexistente", () => {
    const resultado = criar({ fazenda: null, campos: { fazendaId: 999, nome: "Solto" } });
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_recusada" });
  });

  it("5. Secundário autorizado cria na fazenda concedida", () => {
    const resultado = criar({
      identidade: secundario,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.valores.nome).toBe("Pasto Norte");
  });

  it("6. Secundário não cria em fazenda não concedida", () => {
    const resultado = criar({
      identidade: secundario,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      fazenda: fazendaB,
      campos: { fazendaId: 20, nome: "Pasto Sul" },
    });
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_recusada" });
  });

  it("7. Secundário sem pastos.criar não cria", () => {
    const resultado = criar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["pastos.criar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("8. Comum autorizado cria", () => {
    const resultado = criar({
      identidade: comum,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.valores.fazendaId).toBe(10);
  });

  it("9. Comum sem permissão não cria", () => {
    const resultado = criar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(readFileSync(resolve(here, "routers.ts"), "utf8")).toContain('message: "Sem permissão para cadastrar pastos."');
  });

  it("10. Usuário inativo não cria", () => {
    const resultado = criar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("11. Usuário convidado não cria", () => {
    const resultado = criar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("12. Sessão inválida não cria", () => {
    expect(criar({ identidade: null, papelInformadoPeloCliente: "principal" }))
      .toEqual({ ok: false, motivo: "sem_identidade" });
    expect(blocoDoCadastro()).toContain('code: "UNAUTHORIZED"');
  });

  it("13. Permissão revogada impede a criação seguinte", () => {
    const com = criar({
      identidade: secundario,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = criar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok).toBe(true);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("14. Vínculo revogado impede a criação seguinte", () => {
    const resultado = criar({
      identidade: secundario,
      permissoes: ["pastos.criar"],
      vinculos: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_recusada" });
  });

  it("15. sessionVersion divergente impede a criação", () => {
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, { ...principal, sessionVersion: 2 }, false)).toBeNull();
    const resultado = criar({ sessionVersionDaSessao: 4 });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("16. Pasto do Secundário fica no titular", () => {
    const resultado = criar({
      identidade: secundario,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      titularInformadoPeloCliente: 3,
    });
    expect(resultado.ok && resultado.valores.userId).toBe(1);
  });

  it("17. Pasto do Comum fica no titular", () => {
    const resultado = criar({
      identidade: comum,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      titularInformadoPeloCliente: 2,
    });
    expect(resultado.ok && resultado.valores.userId).toBe(1);
  });

  it("18. O fazendaId informado não autoriza sozinho", () => {
    const resultado = criar({
      identidade: secundario,
      permissoes: ["pastos.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      fazenda: fazendaAlheia,
      campos: { fazendaId: 30, nome: "Atalho" },
    });
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_recusada" });
  });

  it("19. O userId do navegador não escolhe o dono", () => {
    const resultado = criar({ campos: { fazendaId: 10, nome: "Pasto Norte", userId: 9 } });
    expect(resultado.ok && resultado.valores.userId).toBe(1);
    expect(resultado.ok && "userId" in resultado.valores && resultado.valores.userId).not.toBe(9);
  });

  it("20. Nome e fazenda continuam obrigatórios no esquema", () => {
    const bloco = blocoDoCadastro();
    expect(bloco).toContain("fazendaId: z.number()");
    expect(bloco).toContain("nome: z.string()");
  });

  it("21. Os opcionais do formulário permanecem", () => {
    const resultado = criar({
      campos: {
        fazendaId: 10,
        nome: "Pasto Norte",
        sigla: "PN",
        tipo: "Pasto",
        tipoPastagem: "Braquiária",
        area: "12.50",
        incluirArea: true,
        capacidade: 40,
        status: "ativo",
        observacoes: "Seco",
      },
    });
    expect(resultado.ok && resultado.valores).toMatchObject({
      sigla: "PN", tipo: "Pasto", tipoPastagem: "Braquiária", area: "12.50",
      incluirArea: true, capacidade: 40, status: "ativo", observacoes: "Seco",
    });
  });

  it("22. Opcional ausente não vira valor inventado", () => {
    const resultado = criar({ campos: { fazendaId: 10, nome: "Pasto Norte" } });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valores).not.toHaveProperty("status");
    expect(resultado.valores).not.toHaveProperty("tipo");
    expect(resultado.valores).not.toHaveProperty("incluirArea");
    expect(resultado.valores).not.toHaveProperty("capacidade");
  });

  it("23. Os tipos permanecem", () => {
    const resultado = criar({
      campos: { fazendaId: 10, nome: "Pasto Norte", capacidade: 40, incluirArea: false },
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(typeof resultado.valores.fazendaId).toBe("number");
    expect(typeof resultado.valores.nome).toBe("string");
    expect(typeof resultado.valores.capacidade).toBe("number");
    expect(typeof resultado.valores.incluirArea).toBe("boolean");
  });

  it("24. O retorno continua sendo sucesso e id", () => {
    const bloco = blocoDoCadastro();
    expect(bloco).toContain("return { success: true as const, id }");
    expect(bloco).not.toContain("criarPastoNoEspelhoDoPrincipal");
    expect(bloco).not.toContain("localFallback");
    expect(bloco.indexOf("espelharPastoDepoisDoCommit")).toBeGreaterThan(bloco.indexOf("await db.transaction"));
    expect(bloco.slice(bloco.indexOf("} catch"))).not.toContain("updateLocalPasto");
    expect(bloco.slice(bloco.indexOf("} catch"))).toContain("recusarPastoSemMysql()");
  });

  it("25. Recusa não devolve id de pasto novo", () => {
    const resultado = criar({ identidade: comum, permissoes: [], vinculos: [] });
    expect(resultado.ok).toBe(false);
    expect(resultado).not.toHaveProperty("valores");
  });

  it("26. Falha na inserção não vira sucesso", async () => {
    const tx = transacao({
      inserirPasto: async () => { throw new Error("falha de inserção"); },
    });
    await expect(criarPastoNaTransacao(principal, campos, tx)).rejects.toThrow("falha de inserção");
  });

  it("27. Erro que não é queda de banco não abre o espelho", () => {
    const bloco = blocoDoCadastro();
    expect(bloco).toContain("if (error instanceof TRPCError) throw error");
    expect(bloco).toContain("if (!isDatabaseUnavailable(error)) throw error");
  });

  it("28. O espelho do Principal exige fazenda da própria conta", () => {
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(fazendaLocalDoTitular([fazendaA, fazendaAlheia], 1, 10)?.id).toBe(10);
    expect(fazendaLocalDoTitular([fazendaAlheia], 1, 30)).toBeNull();
    expect(blocoDoCadastro()).not.toContain("deveUsarEspelhoQuandoBancoCai");
    expect(blocoDoCadastro()).toContain("recusarPastoSemMysql()");
  });

  it("29. Secundário não cria no espelho", () => {
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
  });

  it("30. Comum não cria no espelho", () => {
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
  });

  it("31. O espelho grava o userId do titular", () => {
    const bloco = blocoDoCadastro();
    expect(bloco).toContain("updateLocalPasto(");
    expect(bloco).toContain("identidade.titularUserId");
    expect(bloco).not.toContain("createLocalPasto");
    expect(bloco).not.toContain("updateLocalPasto(ctx.user.id");
  });

  it("32. O espelho não aceita fazenda de outro proprietário", () => {
    expect(fazendaLocalDoTitular(
      [{ id: 30, userId: 9 }, { id: 10, userId: 9 }],
      1,
      10,
    )).toBeNull();
  });

  it("33. Revogação vista na releitura impede a gravação", async () => {
    const gravados: ValoresNovoPasto[] = [];
    const tx = transacao({
      travarUsuario: async () => usuarioDe(secundario),
      travarPermissoes: async () => [],
      travarVinculos: async () => [{ userId: 3, fazendaId: 10 }],
      inserirPasto: async (valores) => {
        gravados.push(valores);
        return 1;
      },
    });
    await expect(criarPastoNaTransacao(secundario, campos, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(gravados).toEqual([]);
    expect(blocoDaTransacao().indexOf("travarPermissoes")).toBeLessThan(blocoDaTransacao().indexOf("inserirPasto"));
  });

  it("34. Recusa antes da inserção não grava", async () => {
    const gravados: ValoresNovoPasto[] = [];
    const tx = transacao({
      travarFazenda: async () => null,
      inserirPasto: async (valores) => {
        gravados.push(valores);
        return 1;
      },
    });
    await expect(criarPastoNaTransacao(principal, { fazendaId: 999, nome: "Solto" }, tx)).rejects.toBeInstanceOf(TRPCError);
    expect(gravados).toEqual([]);
    expect(blocoDoCadastro().slice(blocoDoCadastro().indexOf("} catch"))).not.toContain("updateLocalPasto");
  });

  it("35. Os formulários de pasto e subdivisão continuam cabendo na entrada", () => {
    const bloco = blocoDoCadastro();
    for (const campo of ["fazendaId", "nome", "sigla", "tipo", "tipoPastagem", "area", "incluirArea", "capacidade", "status", "observacoes"]) {
      expect(bloco).toContain(campo);
    }
    const resultado = criar({
      campos: {
        fazendaId: 10, nome: "Pasto 1", tipo: "Pasto", area: "3.00", capacidade: 20,
        status: "vazio", observacoes: "", incluirArea: true, sigla: "P1", tipoPastagem: "Mombaça",
      },
    });
    expect(resultado.ok).toBe(true);
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

function transacao(parcial: Partial<TransacaoCriacaoPasto> = {}): TransacaoCriacaoPasto {
  return {
    travarUsuario: async () => usuarioDe(principal),
    travarPermissoes: async () => [],
    travarVinculos: async () => [],
    travarFazenda: async () => fazendaA,
    inserirPasto: async () => 50,
    ...parcial,
  };
}
