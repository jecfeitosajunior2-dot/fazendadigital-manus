import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { comporListaFazendas, deveUsarEspelhoQuandoBancoCai } from "./routers";

type Ficha = {
  id: number;
  userId: number;
  nome: string;
  cidade: string;
  areaTotal: string;
  createdAt: Date;
  sigla?: string;
};

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

const fazendaA: Ficha = {
  id: 10, userId: 1, nome: "Pasto Norte", cidade: "Norte", areaTotal: "120", createdAt: new Date("2026-03-02"),
};
const fazendaB: Ficha = {
  id: 20, userId: 1, nome: "Pasto Sul", cidade: "Sul", areaTotal: "80", createdAt: new Date("2026-01-15"),
};
const fazendaAlheia: Ficha = {
  id: 30, userId: 9, nome: "Pasto Alheio", cidade: "Longe", areaTotal: "10", createdAt: new Date("2026-04-01"),
};

function listar(entrada: Parameters<typeof comporListaFazendas<Ficha>>[0]) {
  return comporListaFazendas(entrada);
}

describe("fazendas.list — contrato e autorização", () => {
  it("1. Principal lista as fazendas da própria conta", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA, fazendaB],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10, 20]);
  });

  it("2. Principal não lista fazenda de outra conta", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA, fazendaAlheia],
      locais: [],
      titularInformadoPeloCliente: 9,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10]);
  });

  it("3. Secundário autorizado lista a fazenda concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [fazendaA, fazendaB],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([fazendaA]);
  });

  it("4. Secundário não lista fazenda não concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [fazendaA, fazendaB],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.some((f) => f.id === 20)).toBe(false);
  });

  it("5. Comum autorizado lista a fazenda concedida", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
      registros: [fazendaA, fazendaB],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([20]);
  });

  it("6. Comum sem permissão não recebe dados", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [],
      permissoesInformadasPeloCliente: ["fazendas.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("7. Usuário inativo não recebe dados", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("8. Usuário convidado não recebe dados", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Sessão inválida não recebe dados", () => {
    const resultado = listar({
      identidade: null,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [],
      papelInformadoPeloCliente: "principal",
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("10. Fazenda inexistente não aparece", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.some((f) => f.id === 999)).toBe(false);
  });

  it("11. Lista vazia não libera acesso global", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaAlheia],
      locais: [{ ...fazendaAlheia }],
      fazendasInformadasPeloCliente: [30],
    } as Parameters<typeof listar>[0]);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([]);
  });

  it("12. Espelho local não contorna a autorização", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [
        { ...fazendaB, cidade: "Espelho" },
        { ...fazendaAlheia },
      ],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10]);
  });

  it("13. Espelho local não duplica fazendas", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA],
      locais: [{ ...fazendaA, cidade: "Cidade do espelho", sigla: "PN" }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toHaveLength(1);
    expect(resultado.fazendas[0]?.sigla).toBe("PN");
    expect(resultado.fazendas[0]?.nome).toBe("Pasto Norte");
  });

  it("14. Todos os campos da resposta são preservados", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas[0]).toEqual(fazendaA);
    expect(Object.keys(resultado.fazendas[0] ?? {}).sort()).toEqual(
      ["areaTotal", "cidade", "createdAt", "id", "nome", "userId"].sort(),
    );
  });

  it("15. Ordenação permanece a da consulta", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA, fazendaB],
      locais: [{ ...fazendaB, id: 21, nome: "Só no espelho", createdAt: new Date("2025-01-01") }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10, 20]);
  });

  it("16. Nenhum dado de outra conta aparece", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }, { userId: 3, fazendaId: 30 }],
      registros: [fazendaA, fazendaAlheia],
      locais: [fazendaAlheia],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(JSON.stringify(resultado.fazendas)).not.toContain("Pasto Alheio");
    expect(JSON.stringify(resultado.fazendas)).not.toContain("\"userId\":9");
  });

  it("17. Permissão revogada impede nova listagem", () => {
    const comPermissao = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [],
    });
    const revogada = listar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [fazendaA],
      locais: [],
    });
    expect(comPermissao.ok).toBe(true);
    expect(revogada).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("18. Fazenda revogada deixa de aparecer", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [],
      registros: [fazendaA, fazendaB],
      locais: [fazendaA],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([]);
  });

  it("19. Falha de banco não vira lista vazia silenciosa", () => {
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
    expect(deveUsarEspelhoQuandoBancoCai(null)).toBe(false);
    expect(deveUsarEspelhoQuandoBancoCai(pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "inativo" }))).toBe(false);
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const lista = fonte.slice(fonte.indexOf("const fazendasRouter"), fonte.indexOf("const pastosRouter"));
    expect(lista).toContain("if (!isDatabaseUnavailable(error)) throw error");
    expect(lista).toContain("if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error");
    expect(lista).not.toContain("return []");
    expect(lista).not.toContain("isProductionDeploy");
  });

  it("20. O contrato continua sendo a ficha completa em array", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA, fazendaB],
      locais: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(Array.isArray(resultado.fazendas)).toBe(true);
    expect(resultado.fazendas[0]).toHaveProperty("cidade");
    expect(resultado.fazendas[0]).toHaveProperty("areaTotal");
    expect(resultado.fazendas[0]).not.toEqual({ id: 10, nome: "Pasto Norte" });
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const lista = fonte.slice(fonte.indexOf("const fazendasRouter"), fonte.indexOf("const pastosRouter"));
    expect(lista).toContain("return resultado.fazendas");
    expect(lista).toContain("eq(fazendas.userId, identidade.titularUserId)");
    expect(lista).toContain("orderBy(desc(fazendas.createdAt))");
    expect(lista).toContain("montar(rows, locais, permissoes, vinculos, true)");
    expect(lista).toContain("montar([], locais, [], [], false)");
  });

  it("A. Fazenda excluída do banco não volta pelo espelho", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaB],
      locais: [fazendaA, fazendaB],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([20]);
  });

  it("B. Banco vazio não recupera fazenda antiga do espelho", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [],
      locais: [fazendaA],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([]);
  });

  it("C. A mesma fazenda no banco e no espelho aparece uma vez", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA],
      locais: [{ ...fazendaA, cidade: "Cidade do espelho", sigla: "PN" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toHaveLength(1);
    expect(resultado.fazendas[0]?.id).toBe(10);
    expect(resultado.fazendas[0]?.userId).toBe(1);
    expect(resultado.fazendas[0]?.nome).toBe("Pasto Norte");
    expect(resultado.fazendas[0]?.cidade).toBe("Norte");
    expect(resultado.fazendas[0]?.sigla).toBe("PN");
  });

  it("D. Espelho de outra conta não aparece", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA],
      locais: [fazendaAlheia],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10]);
  });

  it("E. Secundário vê só a fazenda concedida que está no banco", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [fazendaA, fazendaB],
      locais: [fazendaA, fazendaB],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10]);
  });

  it("F. Vínculo removido tira a fazenda da lista", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [],
      registros: [fazendaA],
      locais: [fazendaA],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas).toEqual([]);
  });

  it("G. Fallback do Principal usa o espelho quando a consulta não concluiu", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [],
      locais: [fazendaA, fazendaAlheia],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10]);
    const secundarioOffline = listar({
      identidade: secundario,
      permissoes: ["fazendas.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      registros: [],
      locais: [fazendaA],
      consultaMysqlConcluida: false,
    });
    expect(secundarioOffline.ok).toBe(true);
    if (!secundarioOffline.ok) return;
    expect(secundarioOffline.fazendas).toEqual([]);
  });

  it("H. Erro que não é queda de banco não busca o espelho", () => {
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const lista = fonte.slice(fonte.indexOf("const fazendasRouter"), fonte.indexOf("const pastosRouter"));
    expect(lista).toContain("if (!isDatabaseUnavailable(error)) throw error");
    const vazio = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [],
      locais: [fazendaA],
      consultaMysqlConcluida: true,
    });
    expect(vazio.ok).toBe(true);
    if (!vazio.ok) return;
    expect(vazio.fazendas).toEqual([]);
  });

  it("I. O seletor continua recebendo array completo na ordem da consulta", () => {
    const resultado = listar({
      identidade: principal,
      permissoes: [],
      vinculos: [],
      registros: [fazendaA, fazendaB],
      locais: [fazendaB, fazendaA],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(Array.isArray(resultado.fazendas)).toBe(true);
    expect(resultado.fazendas.map((f) => f.id)).toEqual([10, 20]);
    expect(resultado.fazendas[0]).toMatchObject({
      id: 10, userId: 1, nome: "Pasto Norte", cidade: "Norte", areaTotal: "120",
    });
  });
});
