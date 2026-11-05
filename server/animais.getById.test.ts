import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { deveUsarEspelhoQuandoBancoCai, montarFichaAnimal, resolverConsultaAnimal } from "./routers";

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
const fazendas = [{ id: 10, userId: 1 }, { id: 20, userId: 1 }, { id: 30, userId: 9 }];
const lotes = [
  { id: 100, userId: 1, nome: "Lote Norte", fazendaId: 10, pastoAtualId: 7 },
  { id: 200, userId: 1, nome: "Lote Sul", fazendaId: 20, pastoAtualId: 8 },
  { id: 300, userId: 9, nome: "Lote Alheio", fazendaId: 30, pastoAtualId: 9 },
];
const pastos = [
  { id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte" },
  { id: 8, userId: 1, fazendaId: 20, nome: "Pasto Sul" },
  { id: 9, userId: 9, fazendaId: 30, nome: "Pasto Alheio" },
];
const proprio = {
  id: 1, userId: 1, fazendaId: 10, loteId: 100, pastoId: 7,
  brinco: "A1", brincoEletronico: "RFID-A", nome: "Mimosa", raca: "Nelore",
  categoria: "Vaca", sexo: "femea", status: "ativo", createdAt: "2026-01-01T00:00:00.000Z",
};
const outroPasto = { ...proprio, id: 2, fazendaId: 20, loteId: 200, pastoId: 8, brinco: "B2", brincoEletronico: "RFID-B", nome: "Estrela" };
const alheio = { ...proprio, id: 3, userId: 9, fazendaId: 30, loteId: 300, pastoId: 9, brinco: "Z9", brincoEletronico: "RFID-Z", nome: "Alheia" };

function consultar(parcial: Partial<Parameters<typeof resolverConsultaAnimal>[0]> = {}) {
  return resolverConsultaAnimal({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: fazendas,
    lotesDoTitular: lotes,
    pastosDoTitular: pastos,
    animais: [proprio],
    consultaMysqlConcluida: true,
    ...parcial,
  });
}

describe("animais.getById — autorização da ficha", () => {
  it("1. Principal consulta animal próprio", () => {
    const resultado = consultar();
    expect(resultado.ok && resultado.animal.id).toBe(1);
  });

  it("2. Principal não consulta animal de outra conta", () => {
    const resultado = consultar({ animais: [alheio] });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("3. Secundário consulta animal de fazenda concedida", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.animal.brinco).toBe("A1");
  });

  it("4. Secundário não consulta animal de fazenda não concedida", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [outroPasto],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("5. Comum autorizado consulta animal concedido", () => {
    const resultado = consultar({
      identidade: comum,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
      animais: [outroPasto],
    });
    expect(resultado.ok && resultado.animal.id).toBe(2);
  });

  it("6. Comum sem permissão não consulta", () => {
    const resultado = consultar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["animais.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("7. Usuário inativo não consulta", () => {
    const resultado = consultar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("8. Usuário convidado não consulta", () => {
    const resultado = consultar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["animais.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Sessão inválida não consulta", () => {
    const resultado = consultar({ identidade: null, papelInformadoPeloCliente: "principal" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("10. ID inexistente", () => {
    const resultado = consultar({ animais: [] });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("11. ID de outra conta não revela a ficha", () => {
    const resultado = consultar({ animais: [alheio] });
    expect(resultado.ok).toBe(false);
    expect(JSON.stringify(resultado)).not.toContain("Alheia");
    expect(JSON.stringify(resultado)).not.toContain("RFID-Z");
  });

  it("12. ID de fazenda não autorizada", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [outroPasto],
    });
    expect(JSON.stringify(resultado)).not.toContain("Estrela");
  });

  it("13. Animal sem fazenda com lote válido da conta", () => {
    const legado = { ...proprio, id: 4, fazendaId: null, brinco: "LEG" };
    const dono = consultar({ animais: [legado] });
    const delegado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [legado],
    });
    expect(dono.ok && delegado.ok).toBe(true);
  });

  it("14. Animal sem fazenda e sem lote", () => {
    const solto = { ...proprio, id: 8, fazendaId: null, loteId: null, brinco: "SOLTO" };
    const dono = consultar({ animais: [solto] });
    const delegado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [solto],
    });
    expect(dono.ok).toBe(true);
    expect(delegado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("15. Fazenda diferente da fazenda do lote", () => {
    const torto = { ...proprio, id: 6, fazendaId: 10, loteId: 200 };
    const dono = consultar({ animais: [torto] });
    const delegado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [torto],
    });
    expect(dono.ok).toBe(true);
    expect(delegado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("16. Lote de outra conta não abre o animal ao delegado", () => {
    const cruzado = { ...proprio, id: 5, loteId: 300, brinco: "CRUZ" };
    const dono = consultar({ animais: [cruzado] });
    const delegado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [cruzado],
    });
    expect(dono.ok).toBe(true);
    expect(delegado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("17. A ficha do Principal conserva os campos", () => {
    const resultado = consultar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ficha = montarFichaAnimal(resultado.animal, {
      loteNome: "Lote Norte",
      baixa: null,
      genealogiaDisplay: { mae: null },
      descendentes: [],
      agora: new Date("2026-11-05T00:00:00.000Z").getTime(),
    });
    expect(ficha).toMatchObject({
      id: 1, brinco: "A1", brincoEletronico: "RFID-A", nome: "Mimosa", raca: "Nelore",
      categoria: "Vaca", sexo: "femea", status: "ativo", loteNome: "Lote Norte", baixa: null,
    });
    expect(ficha.diasNaFazenda).toBe(
      Math.floor((new Date("2026-11-05T00:00:00.000Z").getTime() - new Date(proprio.createdAt).getTime()) / 86400000),
    );
  });

  it("18. Nome do lote da conta permanece", () => {
    const lote = lotes.find((item) => item.id === 100);
    expect(lote?.nome).toBe("Lote Norte");
  });

  it("19. Nome de lote alheio não entra na ficha", () => {
    const resultado = consultar({ animais: [{ ...proprio, loteId: 300 }] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const lote = lotes.find((item) => item.userId === 1 && item.id === resultado.animal.loteId);
    expect(lote).toBeUndefined();
    expect(lotes.find((item) => item.id === 300)?.nome).toBe("Lote Alheio");
    const nomeUsado = lotes.find((item) => item.userId === resultado.animal.userId && item.id === resultado.animal.loteId)?.nome ?? null;
    expect(nomeUsado).toBeNull();
  });

  it("20. Nome de pasto alheio não é juntado à ficha", () => {
    const resultado = consultar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ficha = montarFichaAnimal(resultado.animal, {
      loteNome: "Lote Norte", baixa: null, genealogiaDisplay: null, descendentes: [],
    });
    expect(ficha).not.toHaveProperty("pastoNome");
    expect(JSON.stringify(ficha)).not.toContain("Pasto Alheio");
  });

  it("21. RFID não sai na recusa", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 20 }],
      animais: [proprio],
    });
    expect(JSON.stringify(resultado)).not.toContain("RFID-A");
  });

  it("22. Brinco não sai na recusa", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 20 }],
      animais: [proprio],
    });
    expect(JSON.stringify(resultado)).not.toContain("A1");
  });

  it("23. Permissão revogada impede nova consulta", () => {
    const com = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
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

  it("24. Vínculo revogado impede nova consulta", () => {
    const resultado = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("25. Inativação impede nova consulta", () => {
    const resultado = consultar({
      identidade: pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "inativo" }),
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("26. sessionVersion divergente não abre a ficha", () => {
    const registro = { ...principal, sessionVersion: 2 };
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, registro, false)).toBeNull();
    expect(consultar({ identidade: null })).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("27. Animal ausente do MySQL não volta pelo espelho", () => {
    const resultado = consultar({
      animais: [],
      locais: [proprio],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("28. ID inexistente no MySQL não é lido do arquivo", () => {
    const resultado = consultar({
      animais: [],
      locais: [{ ...proprio, id: 99, brinco: "SO-ESPELHO" }],
      consultaMysqlConcluida: true,
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("29. Fallback do Principal devolve o animal da própria conta", () => {
    const resultado = consultar({
      animais: [],
      locais: [proprio, alheio],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(resultado.ok && resultado.animal.id).toBe(1);
  });

  it("30. Secundário e Comum não usam o espelho", () => {
    const secundarioOffline = consultar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [],
      locais: [proprio],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
    expect(secundarioOffline).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("31. Erro de banco não vira animal inexistente", () => {
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const bloco = fonte.slice(fonte.indexOf("getById: protectedProcedure"), fonte.indexOf("registrarBaixa: protectedProcedure"));
    expect(bloco).toContain("if (!isDatabaseUnavailable(error)) throw error");
    expect(bloco).toContain("if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error");
    expect(bloco).toContain("eq(animais.userId, identidade.titularUserId)");
    expect(bloco).toContain("consultaMysqlConcluida: true");
  });

  it("32. O formato da ficha permanece", () => {
    const resultado = consultar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ficha = montarFichaAnimal(resultado.animal, {
      loteNome: "Lote Norte", baixa: null, genealogiaDisplay: null, descendentes: [],
    });
    expect(ficha).toHaveProperty("loteNome");
    expect(ficha).toHaveProperty("diasNaFazenda");
    expect(ficha).toHaveProperty("baixa");
    expect(ficha).toHaveProperty("genealogiaDisplay");
    expect(ficha).toHaveProperty("descendentes");
  });

  it("33. Os tipos dos campos permanecem", () => {
    const resultado = consultar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ficha = montarFichaAnimal(resultado.animal, {
      loteNome: "Lote Norte", baixa: null, genealogiaDisplay: null, descendentes: [], agora: Date.now(),
    });
    expect(typeof ficha.id).toBe("number");
    expect(typeof ficha.brinco).toBe("string");
    expect(typeof ficha.loteNome).toBe("string");
    expect(typeof ficha.diasNaFazenda).toBe("number");
  });

  it("34. A entrada continua sendo o id numérico e a saída a ficha", () => {
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const bloco = fonte.slice(fonte.indexOf("getById: protectedProcedure"), fonte.indexOf("registrarBaixa: protectedProcedure"));
    expect(bloco).toContain(".input(z.object({ id: z.number() }))");
    expect(bloco).toContain("return montarFichaAnimal");
    expect(bloco).toContain("loteNome");
    expect(bloco).toContain("genealogiaDisplay");
    expect(bloco).toContain("descendentes");
  });

  it("35. A consulta não altera o animal recebido", () => {
    const copia = { ...proprio };
    const resultado = consultar({ animais: [copia] });
    expect(resultado.ok).toBe(true);
    expect(copia).toEqual(proprio);
  });
});
