import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { comporListaPastos, deveUsarEspelhoQuandoBancoCai } from "./routers";

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
const fazendas = [
  { id: 10, userId: 1 },
  { id: 20, userId: 1 },
  { id: 30, userId: 9 },
];
const norte = {
  id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
  tipoPastagem: "Braquiária", area: "12.50", incluirArea: true, capacidade: 40,
  status: "ativo", coordenadas: "-15.1,-47.2", observacoes: null,
  createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z",
};
const sul = { ...norte, id: 8, fazendaId: 20, nome: "Pasto Sul", sigla: "PS", createdAt: "2026-11-01T00:00:00.000Z" };
const alheio = { ...norte, id: 9, userId: 9, fazendaId: 30, nome: "Pasto Alheio", coordenadas: "secreto" };

function listar(parcial: Partial<Parameters<typeof comporListaPastos>[0]> = {}) {
  return comporListaPastos({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: fazendas,
    pastos: [norte, sul],
    consultaMysqlConcluida: true,
    ...parcial,
  });
}

function blocoDasListas() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const inicio = fonte.indexOf("const pastosRouter");
  return fonte.slice(inicio, fonte.indexOf("const brincosRouter"));
}

describe("pastos.list e pastos.listByFazenda", () => {
  it("1. Principal lista pastos das duas fazendas", () => {
    const resultado = listar();
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.id)).toEqual([7, 8]);
  });

  it("2. Principal não lista pasto de outra conta", () => {
    const resultado = listar({ pastos: [norte, alheio] });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.id)).toEqual([7]);
  });

  it("3. Secundário lista pasto da fazenda concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte"]);
  });

  it("4. Secundário não lista pasto de fazenda não concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pastos: [sul],
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("5. Comum autorizado lista pastos", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
      pastos: [sul],
    });
    expect(resultado.ok && resultado.pastos[0]?.id).toBe(8);
  });

  it("6. Comum sem permissão não recebe a lista", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["pastos.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(blocoDasListas()).toContain('code: motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN"');
    expect(JSON.stringify(resultado)).not.toContain("Pasto Norte");
  });

  it("7. Usuário inativo não lista", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("8. Usuário convidado não lista", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["pastos.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Sessão inválida não lista", () => {
    expect(listar({ identidade: null, papelInformadoPeloCliente: "principal" }))
      .toEqual({ ok: false, motivo: "sem_identidade" });
    expect(blocoDasListas()).toContain('code: "UNAUTHORIZED"');
  });

  it("10. Permissão revogada bloqueia nova consulta", () => {
    const com = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = listar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok && com.pastos).toHaveLength(1);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("11. Vínculo revogado tira o pasto da nova consulta", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [],
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("12. sessionVersion divergente não abre a lista", () => {
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, { ...principal, sessionVersion: 2 }, false)).toBeNull();
    expect(listar({ identidade: null })).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("13. Listagem geral sem pastos", () => {
    const resultado = listar({ pastos: [] });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("14. Listagem por fazenda sem pastos", () => {
    const resultado = listar({ pastos: [], filtroFazendaId: 10 });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("15. Fazenda do titular devolve só os pastos dela", () => {
    const resultado = listar({ filtroFazendaId: 10 });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte"]);
  });

  it("16. Fazenda de outra conta não devolve pasto", () => {
    const resultado = listar({ filtroFazendaId: 30, pastos: [norte, alheio] });
    expect(resultado.ok && resultado.pastos).toEqual([]);
    expect(JSON.stringify(resultado.ok && resultado.pastos)).not.toContain("Pasto Alheio");
  });

  it("17. Fazenda não concedida não devolve pasto", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroFazendaId: 20,
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("18. Pasto de outra conta não aparece", () => {
    const resultado = listar({ pastos: [alheio] });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("19. Pasto com fazenda de outra conta fica de fora", () => {
    const cruzado = { ...norte, id: 15, fazendaId: 30, nome: "Cruzado" };
    const dono = listar({ pastos: [cruzado] });
    const delegado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pastos: [cruzado],
    });
    expect(dono.ok && dono.pastos).toEqual([]);
    expect(delegado.ok && delegado.pastos).toEqual([]);
  });

  it("20. Pasto com fazenda inexistente fica de fora", () => {
    const solto = { ...norte, id: 16, fazendaId: 999, nome: "Sem Fazenda" };
    const dono = listar({ pastos: [solto] });
    const delegado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pastos: [solto],
    });
    expect(dono.ok && dono.pastos).toEqual([]);
    expect(delegado.ok && delegado.pastos).toEqual([]);
  });

  it("21. A ordenação recebida permanece", () => {
    const resultado = listar();
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.createdAt)).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
    ]);
    expect(blocoDasListas()).toContain("orderBy(desc(pastos.createdAt))");
  });

  it("22. A resposta continua sendo um array", () => {
    const resultado = listar();
    expect(resultado.ok && Array.isArray(resultado.pastos)).toBe(true);
    expect(blocoDasListas()).toContain("return await consultarPastosAutorizados(identidade)");
    expect(blocoDasListas()).toContain("return await consultarPastosAutorizados(identidade, input.fazendaId)");
  });

  it("23. Os campos completos permanecem", () => {
    const resultado = listar({ pastos: [norte] });
    expect(resultado.ok && resultado.pastos[0]).toMatchObject({
      id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
      tipoPastagem: "Braquiária", area: "12.50", incluirArea: true, capacidade: 40,
      status: "ativo", observacoes: null,
    });
  });

  it("24. Os tipos dos campos permanecem", () => {
    const resultado = listar({ pastos: [norte] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const pasto = resultado.pastos[0]!;
    expect(typeof pasto.id).toBe("number");
    expect(typeof pasto.nome).toBe("string");
    expect(typeof pasto.fazendaId).toBe("number");
    expect(typeof pasto.capacidade).toBe("number");
    expect(typeof pasto.incluirArea).toBe("boolean");
  });

  it("25. As coordenadas permanecem", () => {
    const resultado = listar({ pastos: [norte] });
    expect(resultado.ok && resultado.pastos[0]?.coordenadas).toBe("-15.1,-47.2");
  });

  it("26. Datas e valores nulos permanecem", () => {
    const resultado = listar({ pastos: [norte] });
    expect(resultado.ok && resultado.pastos[0]?.createdAt).toBe("2026-11-02T00:00:00.000Z");
    expect(resultado.ok && resultado.pastos[0]?.observacoes).toBeNull();
  });

  it("27. Pasto só do espelho não reaparece", () => {
    const resultado = listar({
      locais: [{ ...norte, id: 99, nome: "Só Espelho" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.id)).toEqual([7, 8]);
  });

  it("28. MySQL vazio não recupera o arquivo", () => {
    const resultado = listar({
      pastos: [],
      locais: [norte],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("29. Fallback do Principal devolve pasto da própria fazenda", () => {
    const resultado = listar({
      pastos: [],
      locais: [norte, alheio],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.id)).toEqual([7]);
  });

  it("30. Fallback não incorpora pasto de outro proprietário", () => {
    const resultado = listar({
      pastos: [],
      locais: [alheio, { ...norte, id: 70, userId: 9, nome: "Invasor" }],
      consultaMysqlConcluida: false,
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("31. Secundário não usa o espelho", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pastos: [],
      locais: [norte],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("32. Comum não usa o espelho", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      pastos: [],
      locais: [norte],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("33. Erro que não é queda de banco continua sendo erro", () => {
    const bloco = blocoDasListas();
    expect(bloco).toContain("if (!isDatabaseUnavailable(error)) throw error");
    expect(bloco).toContain("if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error");
    expect(bloco).toContain("eq(pastos.userId, identidade.titularUserId)");
  });

  it("34. O cadastro de animais continua recebendo o pasto inteiro da fazenda", () => {
    const resultado = listar({ filtroFazendaId: 10 });
    expect(resultado.ok && resultado.pastos[0]).toMatchObject({ id: 7, nome: "Pasto Norte", fazendaId: 10 });
    expect(blocoDasListas()).toContain(".input(z.object({ fazendaId: z.number() }))");
  });

  it("35. Edição de lote e seletores continuam com id, nome e fazenda", () => {
    const resultado = listar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    for (const pasto of resultado.pastos) {
      expect(pasto).toHaveProperty("id");
      expect(pasto).toHaveProperty("nome");
      expect(pasto).toHaveProperty("fazendaId");
      expect(pasto).toHaveProperty("coordenadas");
    }
  });
});
