import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { deveUsarEspelhoQuandoBancoCai, resolverConsultaLote } from "./routers";

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
  id: 100, userId: 1, nome: "Lote Norte", sigla: "LN", descricao: "Bezerros",
  fazendaId: 10, pastoAtualId: 7, capacidade: 40, ativo: true,
  localizacao: "Norte", dataCriacao: "2026-01-01",
  dataEntradaPasto: "2026-11-01", createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};
const sul = { ...norte, id: 200, nome: "Lote Sul", sigla: "LS", fazendaId: 20, pastoAtualId: 8 };
const alheio = { ...norte, id: 300, userId: 9, nome: "Lote Alheio", fazendaId: 30, pastoAtualId: 9 };

function consultar(parcial: Partial<Parameters<typeof resolverConsultaLote>[0]> = {}) {
  return resolverConsultaLote({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: fazendas,
    pastosDoTitular: pastos,
    lotes: [norte],
    contagemPorLote: [{ loteId: 100, quantidade: 2 }],
    consultaMysqlConcluida: true,
    ...parcial,
  });
}

function blocoDaRota() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const marca = "getById: protectedProcedure\n    .input(z.object({ id: z.number() }))";
  const inicio = fonte.lastIndexOf(marca);
  return fonte.slice(inicio, fonte.indexOf("create: protectedProcedure", inicio));
}

describe("lotes.getById — autorização da ficha", () => {
  it("1. Principal consulta lote próprio", () => {
    const resultado = consultar();
    expect(resultado.ok && resultado.lote.id).toBe(100);
  });

  it("2. Principal não consulta lote de outra conta", () => {
    expect(consultar({ lotes: [alheio] })).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("3. Secundário consulta lote de fazenda concedida", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.lote.nome).toBe("Lote Norte");
  });

  it("4. Secundário não consulta lote de fazenda não concedida", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [sul],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("5. Comum autorizado consulta lote", () => {
    const resultado = consultar({
      identidade: comum,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
      lotes: [sul],
    });
    expect(resultado.ok && resultado.lote.id).toBe(200);
  });

  it("6. Comum sem permissão não consulta", () => {
    const resultado = consultar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["lotes.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(JSON.stringify(resultado)).not.toContain("Lote Norte");
  });

  it("7. Usuário inativo não consulta", () => {
    const resultado = consultar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("8. Usuário convidado não consulta", () => {
    const resultado = consultar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["lotes.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Sessão inválida não consulta", () => {
    expect(consultar({ identidade: null, papelInformadoPeloCliente: "principal" }))
      .toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("10. ID inexistente", () => {
    expect(consultar({ lotes: [] })).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("11. ID de outra conta não revela a ficha", () => {
    const resultado = consultar({ lotes: [alheio] });
    expect(JSON.stringify(resultado)).not.toContain("Lote Alheio");
    expect(JSON.stringify(resultado)).not.toContain("Pasto Alheio");
  });

  it("12. ID de fazenda não autorizada", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 20 }],
      lotes: [norte],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(JSON.stringify(resultado)).not.toContain("Lote Norte");
  });

  it("13. Lote sem fazenda fica com o Principal", () => {
    const solto = { ...norte, id: 8, fazendaId: null, pastoAtualId: null, nome: "Sem Fazenda" };
    const dono = consultar({ lotes: [solto] });
    const delegado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [solto],
    });
    expect(dono.ok && dono.lote.nome).toBe("Sem Fazenda");
    expect(delegado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("14. Lote com fazenda de outra conta não leva o nome dela", () => {
    const cruzado = { ...norte, id: 5, fazendaId: 30, pastoAtualId: null, nome: "Cruzado" };
    const dono = consultar({ lotes: [cruzado] });
    const delegado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [cruzado],
    });
    expect(dono.ok && dono.lote.nome).toBe("Cruzado");
    expect(dono.ok && dono.ficha.fazendaNome).toBeNull();
    expect(delegado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("15. Pasto de outra fazenda não entra no nome da ficha", () => {
    const resultado = consultar({ lotes: [{ ...norte, pastoAtualId: 8 }] });
    expect(resultado.ok && resultado.ficha.pastoNome).toBeNull();
    expect(resultado.ok && resultado.ficha.fazendaNome).toBeNull();
    expect(JSON.stringify(resultado.ok && resultado.ficha)).not.toContain("Pasto Sul");
  });

  it("16. Pasto de outra conta não revela o nome", () => {
    const resultado = consultar({ lotes: [{ ...norte, pastoAtualId: 9 }] });
    expect(resultado.ok && resultado.ficha.pastoNome).toBeNull();
    expect(JSON.stringify(resultado)).not.toContain("Pasto Alheio");
  });

  it("17. Pasto inexistente preserva o lote", () => {
    const resultado = consultar({ lotes: [{ ...norte, pastoAtualId: 999 }] });
    expect(resultado.ok && resultado.lote.nome).toBe("Lote Norte");
    expect(resultado.ok && resultado.ficha.pastoNome).toBeNull();
  });

  it("18. Lote sem pasto preserva nome e capacidade do lote", () => {
    const resultado = consultar({ lotes: [{ ...norte, pastoAtualId: null }] });
    expect(resultado.ok && resultado.lote).toMatchObject({
      nome: "Lote Norte", capacidade: 40, pastoAtualId: null,
    });
    expect(resultado.ok && resultado.ficha.pastoNome).toBeNull();
  });

  it("19. A ficha do Principal conserva os campos do lote", () => {
    const resultado = consultar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lote).toMatchObject({
      id: 100, userId: 1, nome: "Lote Norte", sigla: "LN", descricao: "Bezerros",
      fazendaId: 10, pastoAtualId: 7, capacidade: 40, ativo: true,
      localizacao: "Norte", dataCriacao: "2026-01-01",
      createdAt: "2026-11-02T00:00:00.000Z",
    });
    expect(resultado.lote).not.toHaveProperty("qtdAnimais");
  });

  it("20. O enriquecimento coerente conserva pasto, fazenda e contagem", () => {
    const resultado = consultar();
    expect(resultado.ok && resultado.ficha).toMatchObject({
      nome: "Lote Norte", pastoNome: "Pasto Norte", pastoCapacidade: 40,
      fazendaNome: "Pasto Norte", qtdAnimais: 2,
    });
  });

  it("21. Nome de fazenda alheia não aparece", () => {
    const resultado = consultar({ lotes: [{ ...norte, fazendaId: 30, pastoAtualId: 9 }] });
    expect(JSON.stringify(resultado)).not.toContain("Fazenda Alheia");
  });

  it("22. Nome de pasto alheio não aparece", () => {
    const resultado = consultar({ lotes: [{ ...norte, pastoAtualId: 9 }] });
    expect(JSON.stringify(resultado)).not.toContain("Pasto Alheio");
  });

  it("23. A contagem não inclui animal de outra conta", () => {
    const resultado = consultar({ contagemPorLote: [{ loteId: 100, quantidade: 2 }] });
    expect(resultado.ok && resultado.ficha.qtdAnimais).toBe(2);
    expect(resultado.ok && resultado.lote).not.toHaveProperty("qtdAnimais");
  });

  it("24. Permissão revogada bloqueia nova consulta", () => {
    const com = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = consultar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok).toBe(true);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("25. Vínculo revogado bloqueia nova consulta", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("26. Inativação bloqueia nova consulta", () => {
    const resultado = consultar({
      identidade: pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "inativo" }),
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("27. sessionVersion divergente não abre a ficha", () => {
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, { ...principal, sessionVersion: 2 }, false)).toBeNull();
    expect(consultar({ identidade: null })).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("28. Lote ausente do MySQL não volta pelo espelho", () => {
    const resultado = consultar({
      lotes: [],
      locais: [{ ...norte, id: 99, nome: "Só Espelho" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("29. ID inexistente no MySQL não é lido do arquivo", () => {
    const resultado = consultar({ lotes: [], locais: [norte], consultaMysqlConcluida: true });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("30. Fallback do Principal devolve o lote da própria conta", () => {
    const resultado = consultar({
      lotes: [],
      locais: [norte, alheio],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(resultado.ok && resultado.lote.id).toBe(100);
  });

  it("31. Secundário e Comum não usam o espelho", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["lotes.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      lotes: [],
      locais: [norte],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("32. Erro real de banco continua sendo erro", () => {
    const bloco = blocoDaRota();
    expect(bloco).toContain("if (!isDatabaseUnavailable(error)) throw error");
    expect(bloco).toContain("if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error");
    expect(bloco.indexOf("getLocalLote")).toBeGreaterThan(bloco.indexOf("isDatabaseUnavailable"));
    expect(bloco).toContain("eq(lotes.userId, identidade.titularUserId)");
  });

  it("33. Lote ausente continua como não encontrado", () => {
    const bloco = blocoDaRota();
    expect(bloco).toContain('code: "NOT_FOUND"');
    expect(bloco).toContain('message: "Lote não encontrado."');
    expect(bloco).not.toContain("return null");
    expect(consultar({ lotes: [] })).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("34. A entrada continua sendo o id e a saída o lote", () => {
    const bloco = blocoDaRota();
    expect(bloco).toContain(".input(z.object({ id: z.number() }))");
    expect(bloco).toContain("return resolvido.lote");
    expect(bloco).toContain("consultaMysqlConcluida: true");
    expect(bloco).toContain('permissao: usuarioPermissoes.permissao');
  });

  it("35. A consulta não altera o lote recebido", () => {
    const copia = { ...norte };
    const resultado = consultar({ lotes: [copia] });
    expect(resultado.ok).toBe(true);
    expect(copia).toEqual(norte);
  });
});
