import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { comporListaLotes, deveUsarEspelhoQuandoBancoCai } from "./routers";

const here = dirname(fileURLToPath(import.meta.url));
const hoje = new Date(2026, 10, 5, 12, 0, 0);

function blocoDaLista() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8").replace(/\r\n/g, "\n");
  const inicio = fonte.indexOf("list: protectedProcedure\n    .input(z.object({ somenteAtivos:");
  return fonte.slice(inicio, fonte.indexOf("listByPasto:", inicio));
}

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
  { id: 10, userId: 1, nome: "Pasto Norte" },
  { id: 20, userId: 1, nome: "Pasto Sul" },
  { id: 30, userId: 9, nome: "Fazenda Alheia" },
];
const pastos = [
  { id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", capacidade: 40 },
  { id: 8, userId: 1, fazendaId: 20, nome: "Pasto Sul", capacidade: 25 },
  { id: 9, userId: 9, fazendaId: 30, nome: "Pasto Alheio", capacidade: 10 },
];
const norte = {
  id: 100, userId: 1, nome: "Lote Norte", fazendaId: 10, pastoAtualId: 7, ativo: true,
  capacidade: 40, sigla: "LN", descricao: "Bezerros", dataCriacao: "2026-01-01",
  localizacao: "Norte", dataEntradaPasto: new Date(2026, 10, 1, 12, 0, 0),
  createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z",
};
const sul = {
  ...norte, id: 200, nome: "Lote Sul", fazendaId: 20, pastoAtualId: 8, sigla: "LS",
  createdAt: "2026-11-01T00:00:00.000Z",
};
const alheio = { ...norte, id: 300, userId: 9, nome: "Lote Alheio", fazendaId: 30, pastoAtualId: 9 };

function listar(parcial: Partial<Parameters<typeof comporListaLotes>[0]> = {}) {
  return comporListaLotes({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: fazendas,
    pastosDoTitular: pastos,
    lotes: [norte, sul],
    contagemPorLote: [{ loteId: 100, quantidade: 3 }],
    consultaMysqlConcluida: true,
    hoje,
    ...parcial,
  });
}

describe("lotes.list — autorização da listagem", () => {
  it("1. Principal lista lotes próprios", () => {
    const resultado = listar();
    expect(resultado.ok && resultado.lotes.map((lote) => lote.id)).toEqual([100, 200]);
  });

  it("2. Principal não lista lote de outra conta", () => {
    const resultado = listar({ lotes: [norte, alheio] });
    expect(resultado.ok && resultado.lotes.map((lote) => lote.id)).toEqual([100]);
  });

  it("3. Principal visualiza lotes das duas fazendas", () => {
    const resultado = listar();
    expect(resultado.ok && resultado.lotes.map((lote) => lote.fazendaId)).toEqual([10, 20]);
  });

  it("4. Secundário lista o lote da fazenda concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.lotes.map((lote) => lote.nome)).toEqual(["Lote Norte"]);
  });

  it("5. Secundário não lista lote de fazenda não concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [sul],
    });
    expect(resultado.ok && resultado.lotes).toEqual([]);
  });

  it("6. Comum autorizado lista lotes", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
      lotes: [sul],
    });
    expect(resultado.ok && resultado.lotes[0]?.id).toBe(200);
  });

  it("7. Comum sem permissão não lista", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["lotes.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("8. Usuário inativo não lista", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Usuário convidado não lista", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["lotes.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("10. Sessão inválida não lista", () => {
    const resultado = listar({ identidade: null, papelInformadoPeloCliente: "principal" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("11. Permissão revogada bloqueia nova consulta", () => {
    const com = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = listar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok && com.lotes).toHaveLength(1);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("12. Vínculo revogado bloqueia nova consulta", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [],
    });
    expect(resultado.ok && resultado.lotes).toEqual([]);
  });

  it("13. sessionVersion divergente não abre a lista", () => {
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, { ...principal, sessionVersion: 2 }, false)).toBeNull();
    expect(listar({ identidade: null })).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("14. Filtro de fazenda autorizada só reduz a lista", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }, { userId: 3, fazendaId: 20 }],
      filtroFazendaId: 10,
    });
    expect(resultado.ok && resultado.lotes.map((lote) => lote.id)).toEqual([100]);
  });

  it("15. Filtro de fazenda não autorizada não revela lote", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroFazendaId: 20,
    });
    expect(resultado.ok && resultado.lotes).toEqual([]);
  });

  it("16. Filtro de situação preserva ativos e inativos", () => {
    const inativo = { ...sul, id: 201, ativo: false, nome: "Lote Parado" };
    const todos = listar({ lotes: [norte, inativo], somenteAtivos: false });
    const ativos = listar({ lotes: [norte, inativo], somenteAtivos: true });
    expect(todos.ok && todos.lotes.map((lote) => lote.nome)).toEqual(["Lote Norte", "Lote Parado"]);
    expect(ativos.ok && ativos.lotes.map((lote) => lote.nome)).toEqual(["Lote Norte"]);
  });

  it("17. A ordenação recebida permanece", () => {
    const resultado = listar({ lotes: [norte, sul] });
    expect(resultado.ok && resultado.lotes.map((lote) => lote.createdAt)).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
    ]);
  });

  it("18. A resposta continua sendo um array", () => {
    const resultado = listar();
    expect(resultado.ok && Array.isArray(resultado.lotes)).toBe(true);
  });

  it("19. Os campos da ficha permanecem", () => {
    const resultado = listar({ lotes: [norte] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lotes[0]).toMatchObject({
      id: 100, nome: "Lote Norte", sigla: "LN", descricao: "Bezerros",
      fazendaId: 10, pastoAtualId: 7, capacidade: 40, ativo: true,
      localizacao: "Norte", dataCriacao: "2026-01-01",
      qtdAnimais: 3, pastoNome: "Pasto Norte", pastoCapacidade: 40, fazendaNome: "Pasto Norte",
    });
    expect(resultado.lotes[0]?.diasNoPasto).toBe(4);
  });

  it("20. Os tipos dos campos permanecem", () => {
    const resultado = listar({ lotes: [norte] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const lote = resultado.lotes[0]!;
    expect(typeof lote.id).toBe("number");
    expect(typeof lote.nome).toBe("string");
    expect(typeof lote.qtdAnimais).toBe("number");
    expect(typeof lote.pastoNome).toBe("string");
    expect(typeof lote.diasNoPasto).toBe("number");
    expect(typeof lote.ativo).toBe("boolean");
  });

  it("21. Lote sem fazenda fica com o Principal e some para o delegado", () => {
    const solto = { ...norte, id: 8, fazendaId: null, pastoAtualId: null, nome: "Sem Fazenda" };
    const dono = listar({ lotes: [solto] });
    const delegado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [solto],
    });
    expect(dono.ok && dono.lotes[0]?.nome).toBe("Sem Fazenda");
    expect(delegado.ok && delegado.lotes).toEqual([]);
  });

  it("22. Lote apontando fazenda de outra conta não leva o nome dela", () => {
    const cruzado = { ...norte, id: 5, fazendaId: 30, pastoAtualId: null, nome: "Cruzado" };
    const dono = listar({ lotes: [cruzado] });
    const delegado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [cruzado],
    });
    expect(dono.ok && dono.lotes[0]?.fazendaNome).toBeNull();
    expect(JSON.stringify(dono)).not.toContain("Fazenda Alheia");
    expect(delegado.ok && delegado.lotes).toEqual([]);
  });

  it("23. Pasto de outra fazenda não entra na ficha", () => {
    const torto = { ...norte, pastoAtualId: 8 };
    const resultado = listar({ lotes: [torto] });
    expect(resultado.ok && resultado.lotes[0]).toMatchObject({
      pastoNome: null, pastoCapacidade: null, fazendaNome: null,
    });
    expect(JSON.stringify(resultado)).not.toContain("Pasto Sul");
  });

  it("24. Pasto inexistente não inventa nome", () => {
    const resultado = listar({ lotes: [{ ...norte, pastoAtualId: 999 }] });
    expect(resultado.ok && resultado.lotes[0]).toMatchObject({ pastoNome: null, pastoCapacidade: null, fazendaNome: null });
  });

  it("25. Lote sem pasto mantém a ficha sem nome de pasto", () => {
    const resultado = listar({ lotes: [{ ...norte, pastoAtualId: null }] });
    expect(resultado.ok && resultado.lotes[0]).toMatchObject({
      nome: "Lote Norte", pastoNome: null, pastoCapacidade: null, fazendaNome: null, qtdAnimais: 3,
    });
  });

  it("26. A contagem usa os animais da própria conta", () => {
    const resultado = listar({ contagemPorLote: [{ loteId: 100, quantidade: 4 }] });
    expect(resultado.ok && resultado.lotes[0]?.qtdAnimais).toBe(4);
  });

  it("27. Animal de outra conta não entra na contagem", () => {
    const resultado = listar({ contagemPorLote: [{ loteId: 300, quantidade: 9 }] });
    expect(resultado.ok && resultado.lotes.find((lote) => lote.id === 100)?.qtdAnimais).toBe(0);
  });

  it("28. O enriquecimento não revela fazenda alheia", () => {
    const resultado = listar({ lotes: [{ ...norte, fazendaId: 30, pastoAtualId: 9 }] });
    expect(resultado.ok && resultado.lotes[0]?.fazendaNome).toBeNull();
    expect(JSON.stringify(resultado)).not.toContain("Fazenda Alheia");
  });

  it("29. O enriquecimento não revela pasto alheio", () => {
    const resultado = listar({ lotes: [{ ...norte, pastoAtualId: 9 }] });
    expect(resultado.ok && resultado.lotes[0]?.pastoNome).toBeNull();
    expect(JSON.stringify(resultado)).not.toContain("Pasto Alheio");
  });

  it("30. Lote só do espelho não reaparece quando o MySQL responde", () => {
    const resultado = listar({
      lotes: [norte],
      locais: [{ ...norte, id: 99, nome: "Só Espelho" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.lotes.map((lote) => lote.id)).toEqual([100]);
  });

  it("31. Lista vazia no MySQL não busca o arquivo", () => {
    const resultado = listar({
      lotes: [],
      locais: [norte],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok && resultado.lotes).toEqual([]);
  });

  it("32. Erro real de banco continua sendo erro", () => {
    const bloco = blocoDaLista();
    expect(bloco).toContain("if (error instanceof TRPCError) throw error");
    expect(bloco).toContain("if (isDatabaseUnavailable(error)) recusarLoteSemMysql()");
    expect(bloco).not.toContain("deveUsarEspelhoQuandoBancoCai");
    expect(bloco).not.toContain("listLocalLotes");
    expect(bloco).toContain("eq(lotes.userId, identidade.titularUserId)");
    expect(bloco).toContain("eq(animais.userId, identidade.titularUserId)");
  });

  it("33. Fallback do Principal devolve lote da própria conta", () => {
    const resultado = listar({
      lotes: [],
      locais: [norte, alheio],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(resultado.ok && resultado.lotes.map((lote) => lote.id)).toEqual([100]);
  });

  it("34. Secundário e Comum não usam o espelho", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [],
      locais: [norte],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
    expect(resultado.ok && resultado.lotes).toEqual([]);
  });

  it("35. O contrato da rota permanece um array enriquecido", () => {
    const bloco = blocoDaLista();
    expect(bloco).toContain(".input(z.object({ somenteAtivos: z.boolean().optional() }).optional())");
    expect(bloco).toContain("orderBy(desc(lotes.createdAt))");
    expect(bloco).toContain("return resultado.lotes");
    expect(bloco).toContain("comporListaLotes");
    expect(readFileSync(resolve(here, "routers.ts"), "utf8")).toContain('permissaoId: "lotes.visualizar"');
    expect(bloco).toContain("consultaMysqlConcluida: true");
    expect(bloco).not.toContain("consultaMysqlConcluida: false");
  });
});
