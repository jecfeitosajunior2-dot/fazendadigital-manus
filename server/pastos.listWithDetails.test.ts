import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { comporPainelPastos } from "./routers";

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

function dias(inicio: string, fim: string) {
  const a = new Date(inicio);
  const b = new Date(fim);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

const hoje = "2026-11-05";
const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "ativo" });
const secundario = pessoa({ id: 3, papel: "secundario", titularUserId: 1, situacao: "ativo" });
const comum = pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "ativo" });
const fazendas = [
  { id: 10, userId: 1 },
  { id: 20, userId: 1 },
  { id: 30, userId: 9 },
];
const nomesFazendas = [
  { id: 10, userId: 1, nome: "Fazenda Norte" },
  { id: 20, userId: 1, nome: "Fazenda Sul" },
  { id: 30, userId: 9, nome: "Fazenda Alheia" },
];
const norte = {
  id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
  tipoPastagem: "Braquiária", area: "12.50", incluirArea: true, capacidade: 40,
  status: "ativo", coordenadas: "-15.1,-47.2", observacoes: null,
  createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z",
};
const sul = {
  ...norte, id: 8, fazendaId: 20, nome: "Pasto Sul", sigla: "PS", capacidade: 25,
  createdAt: "2026-11-01T00:00:00.000Z",
};
const alheio = { ...norte, id: 9, userId: 9, fazendaId: 30, nome: "Pasto Alheio", coordenadas: "secreto" };
const loteNorte = {
  id: 100, userId: 1, nome: "Lote Norte", fazendaId: 10, pastoAtualId: 7,
  dataEntradaPasto: "2026-11-01", ativo: true,
};
const loteSul = {
  id: 101, userId: 1, nome: "Lote Sul", fazendaId: 20, pastoAtualId: 8,
  dataEntradaPasto: "2026-10-20", ativo: true,
};
const loteAlheio = {
  id: 102, userId: 9, nome: "Lote Alheio", fazendaId: 30, pastoAtualId: 7,
  dataEntradaPasto: "2026-11-01", ativo: true,
};

function painel(parcial: Partial<Parameters<typeof comporPainelPastos>[0]> = {}) {
  return comporPainelPastos({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: fazendas,
    nomesFazendas,
    pastos: [norte, sul],
    lotesDoTitular: [loteNorte, loteSul, loteAlheio],
    contagemPorLote: [
      { loteId: 100, quantidade: 10, userId: 1 },
      { loteId: 100, quantidade: 4, userId: 9 },
      { loteId: 102, quantidade: 7, userId: 9 },
    ],
    consultaMysqlConcluida: true,
    hoje,
    ...parcial,
  });
}

function blocoDoPainel() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const inicio = fonte.indexOf("listWithDetails: protectedProcedure");
  return fonte.slice(inicio, fonte.indexOf("type PastoListaMinimo"));
}

describe("pastos.listWithDetails", () => {
  it("1. Principal consulta pastos das duas fazendas", () => {
    const resultado = painel();
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.fazendaId)).toEqual([10, 20]);
  });

  it("2. Principal não consulta pasto de outra conta", () => {
    const resultado = painel({ pastos: [norte, alheio] });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.id)).toEqual([7]);
  });

  it("3. Secundário consulta a fazenda concedida", () => {
    const resultado = painel({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte"]);
  });

  it("4. Secundário não consulta fazenda não concedida", () => {
    const resultado = painel({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      pastos: [sul],
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("5. Comum autorizado consulta o painel", () => {
    const resultado = painel({
      identidade: comum,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
      pastos: [sul],
    });
    expect(resultado.ok && resultado.pastos[0]?.fazendaNome).toBe("Fazenda Sul");
  });

  it("6. Comum sem permissão recebe recusa", () => {
    const resultado = painel({
      identidade: comum,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["pastos.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(blocoDoPainel()).toContain("consultarPastosAutorizados");
    expect(readFileSync(resolve(here, "routers.ts"), "utf8")).toContain('code: motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN"');
    expect(JSON.stringify(resultado)).not.toContain("Pasto Norte");
  });

  it("7. Usuário inativo não consulta", () => {
    const resultado = painel({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("8. Usuário convidado não consulta", () => {
    const resultado = painel({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Sessão inválida não consulta", () => {
    expect(painel({ identidade: null, papelInformadoPeloCliente: "principal" }))
      .toEqual({ ok: false, motivo: "sem_identidade" });
    expect(blocoDoPainel()).toContain('code: "UNAUTHORIZED"');
  });

  it("10. Permissão revogada bloqueia a consulta seguinte", () => {
    const com = painel({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = painel({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok && com.pastos).toHaveLength(1);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("11. Vínculo revogado tira os pastos da consulta seguinte", () => {
    const resultado = painel({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [],
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("12. sessionVersion divergente bloqueia", () => {
    expect(decidirSessao({ id: 1, sessionVersion: 1 }, { ...principal, sessionVersion: 2 }, false)).toBeNull();
    expect(painel({ identidade: null })).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("13. Filtro de fazenda autorizada devolve só ela", () => {
    const resultado = painel({ filtroFazendaId: 10 });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte"]);
  });

  it("14. Filtro de fazenda alheia não devolve pasto", () => {
    const resultado = painel({ filtroFazendaId: 30, pastos: [norte, alheio] });
    expect(resultado.ok && resultado.pastos).toEqual([]);
    expect(JSON.stringify(resultado.ok && resultado.pastos)).not.toContain("Fazenda Alheia");
  });

  it("15. Sem filtro, as fazendas autorizadas entram juntas", () => {
    const resultado = painel();
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.nome)).toEqual(["Pasto Norte", "Pasto Sul"]);
  });

  it("16. Pasto de outra conta fica de fora", () => {
    const resultado = painel({ pastos: [alheio] });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("17. Pasto com fazenda de outra conta fica de fora", () => {
    const cruzado = { ...norte, id: 15, fazendaId: 30, nome: "Cruzado" };
    const resultado = painel({ pastos: [cruzado, norte] });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.id)).toEqual([7]);
  });

  it("18. Pasto com fazenda inexistente fica de fora", () => {
    const solto = { ...norte, id: 16, fazendaId: 999, nome: "Sem Fazenda" };
    const resultado = painel({ pastos: [solto] });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("19. O registro completo do pasto permanece", () => {
    const resultado = painel({ pastos: [norte], lotesDoTitular: [] });
    expect(resultado.ok && resultado.pastos[0]).toMatchObject({
      id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN", tipo: "Pasto",
      tipoPastagem: "Braquiária", area: "12.50", incluirArea: true, capacidade: 40,
      status: "ativo", observacoes: null,
    });
  });

  it("20. Os campos enriquecidos permanecem", () => {
    const resultado = painel({ pastos: [norte], lotesDoTitular: [loteNorte] });
    expect(resultado.ok && resultado.pastos[0]).toMatchObject({
      fazendaNome: "Fazenda Norte",
      qtdAnimais: 10,
      qtdLotes: 1,
      pctOcupacao: 25,
      diasPastejo: dias("2026-11-01", hoje),
      diasDescanso: null,
    });
    expect(resultado.ok && resultado.pastos[0]?.lotes[0]).toMatchObject({
      id: 100, nome: "Lote Norte", qtdAnimais: 10, pastoNome: "Pasto Norte", pastoCapacidade: 40,
    });
  });

  it("21. Tipos e valores nulos permanecem", () => {
    const resultado = painel({ pastos: [norte], lotesDoTitular: [] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const pasto = resultado.pastos[0]!;
    expect(typeof pasto.id).toBe("number");
    expect(typeof pasto.nome).toBe("string");
    expect(pasto.observacoes).toBeNull();
    expect(pasto.coordenadas).toBe("-15.1,-47.2");
    expect(pasto.diasPastejo).toBeNull();
    expect(pasto.diasDescanso).toBeNull();
    expect(pasto.lotes).toEqual([]);
  });

  it("22. O nome da fazenda é o da própria conta", () => {
    const resultado = painel();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos.map((pasto) => pasto.fazendaNome)).toEqual(["Fazenda Norte", "Fazenda Sul"]);
    expect(JSON.stringify(resultado.pastos)).not.toContain("Fazenda Alheia");
  });

  it("23. Animal de outra conta não entra na ocupação", () => {
    const resultado = painel({ pastos: [norte], lotesDoTitular: [loteNorte] });
    expect(resultado.ok && resultado.pastos[0]?.qtdAnimais).toBe(10);
  });

  it("24. Lote de outra conta não entra na contagem", () => {
    const resultado = painel({ pastos: [norte], lotesDoTitular: [loteNorte, loteAlheio] });
    expect(resultado.ok && resultado.pastos[0]?.qtdLotes).toBe(1);
  });

  it("25. A coleção de lotes não traz outra conta", () => {
    const trocado = { ...loteNorte, id: 104, nome: "Lote da Conta", fazendaId: 30, dataEntradaPasto: "2026-11-03" };
    const resultado = painel({ pastos: [norte], lotesDoTitular: [loteNorte, loteAlheio, trocado] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const nomes = resultado.pastos[0]?.lotes.map((lote) => lote.nome);
    expect(nomes).toEqual(["Lote Norte"]);
    expect(resultado.pastos[0]?.lotes.every((lote) => lote.fazendaNome === "Fazenda Norte")).toBe(true);
    expect(resultado.pastos[0]?.qtdLotes).toBe(resultado.pastos[0]?.lotes.length);
  });

  it("26. qtdLotes acompanha a coleção", () => {
    const resultado = painel();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    for (const pasto of resultado.pastos) expect(pasto.qtdLotes).toBe(pasto.lotes.length);
  });

  it("27. A ocupação mantém a fórmula", () => {
    const cheio = { ...norte, capacidade: 40 };
    const estourado = { ...norte, id: 70, capacidade: 40 };
    const fracao = { ...norte, id: 71, capacidade: 3 };
    const base = painel({
      pastos: [cheio],
      lotesDoTitular: [loteNorte],
      contagemPorLote: [{ loteId: 100, quantidade: 10, userId: 1 }],
    });
    const topo = painel({
      pastos: [estourado],
      lotesDoTitular: [{ ...loteNorte, pastoAtualId: 70 }],
      contagemPorLote: [{ loteId: 100, quantidade: 50, userId: 1 }],
    });
    const terco = painel({
      pastos: [fracao],
      lotesDoTitular: [{ ...loteNorte, pastoAtualId: 71 }],
      contagemPorLote: [{ loteId: 100, quantidade: 1, userId: 1 }],
    });
    expect(base.ok && base.pastos[0]?.pctOcupacao).toBe(Math.min(100, Math.round((10 / 40) * 100)));
    expect(topo.ok && topo.pastos[0]?.pctOcupacao).toBe(100);
    expect(terco.ok && terco.pastos[0]?.pctOcupacao).toBe(Math.min(100, Math.round((1 / 3) * 100)));
  });

  it("28. Capacidade zero não inventa percentual", () => {
    const resultado = painel({
      pastos: [{ ...sul, capacidade: 0 }],
      lotesDoTitular: [],
    });
    const semCapacidade = painel({
      pastos: [{ ...sul, capacidade: null }],
      lotesDoTitular: [],
    });
    expect(resultado.ok && resultado.pastos[0]?.pctOcupacao).toBeNull();
    expect(semCapacidade.ok && semCapacidade.pastos[0]?.pctOcupacao).toBeNull();
  });

  it("29. Data ausente continua nula", () => {
    const semEntrada = { ...loteNorte, dataEntradaPasto: null };
    const resultado = painel({
      pastos: [norte],
      lotesDoTitular: [semEntrada],
      movimentacoes: [{ userId: 1, pastoOrigemId: 7, dataSaida: null }],
    });
    expect(resultado.ok && resultado.pastos[0]?.lotes[0]?.diasNoPasto).toBeNull();
    expect(resultado.ok && resultado.pastos[0]?.diasPastejo).toBe(0);
    expect(resultado.ok && resultado.pastos[0]?.diasDescanso).toBeNull();
  });

  it("30. Os dias de pastejo seguem a entrada do lote", () => {
    const resultado = painel({ pastos: [norte, sul] });
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.diasPastejo)).toEqual([
      dias("2026-11-01", hoje),
      dias("2026-10-20", hoje),
    ]);
  });

  it("31. Os dias de descanso seguem a última saída", () => {
    const vazio = { ...norte, id: 17, nome: "Pasto Vazio", capacidade: 10, status: "descanso" };
    const resultado = painel({
      pastos: [vazio, norte],
      lotesDoTitular: [loteNorte],
      movimentacoes: [
        { userId: 9, pastoOrigemId: 17, dataSaida: "2026-11-04" },
        { userId: 1, pastoOrigemId: 17, dataSaida: "2026-10-26" },
        { userId: 1, pastoOrigemId: 7, dataSaida: "2026-10-01" },
      ],
    });
    expect(resultado.ok && resultado.pastos[0]?.diasDescanso).toBe(dias("2026-10-26", hoje));
    expect(resultado.ok && resultado.pastos[1]?.diasDescanso).toBeNull();
  });

  it("32. A ordenação dos pastos permanece", () => {
    const resultado = painel();
    expect(resultado.ok && resultado.pastos.map((pasto) => pasto.createdAt)).toEqual([
      norte.createdAt,
      sul.createdAt,
    ]);
    expect(readFileSync(resolve(here, "routers.ts"), "utf8")).toContain("orderBy(desc(pastos.createdAt))");
  });

  it("33. Queda de banco continua sendo erro", () => {
    const bloco = blocoDoPainel();
    expect(bloco).not.toContain("isDatabaseUnavailable");
    expect(bloco).not.toContain("catch");
  });

  it("34. O painel não usa o espelho local", () => {
    const bloco = blocoDoPainel();
    expect(bloco).not.toContain("pastosDoEspelhoDoPrincipal");
    expect(bloco).not.toContain("listLocal");
    expect(bloco).not.toContain("enrichLote");
  });

  it("35. O painel da tela continua recebendo pasto, ocupação e lotes", () => {
    const resultado = painel();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(Array.isArray(resultado.pastos)).toBe(true);
    const pasto = resultado.pastos[0]!;
    expect(pasto).toMatchObject({ nome: "Pasto Norte", area: "12.50", capacidade: 40, status: "ativo" });
    expect(pasto.lotes[0]).toMatchObject({ nome: "Lote Norte", qtdAnimais: 10, pastoAtualId: 7 });
    expect(blocoDoPainel()).toContain(".input(z.object({ fazendaId: z.number().optional() }).optional())");
  });
});

describe("pastos.listWithDetails — lote na mesma fazenda", () => {
  const loteTrocado = {
    ...loteNorte, id: 104, nome: "Lote da Outra", fazendaId: 20, pastoAtualId: 7, dataEntradaPasto: "2026-11-03",
  };
  const contagem = [
    { loteId: 100, quantidade: 10, userId: 1 },
    { loteId: 104, quantidade: 6, userId: 1 },
    { loteId: 102, quantidade: 7, userId: 9 },
  ];

  function doNorte(parcial: Partial<Parameters<typeof comporPainelPastos>[0]> = {}) {
    return painel({
      pastos: [norte],
      lotesDoTitular: [loteNorte, loteTrocado, loteAlheio],
      contagemPorLote: contagem,
      ...parcial,
    });
  }

  it("1. Lote da mesma fazenda aparece", () => {
    const resultado = doNorte();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos[0]?.lotes.map((lote) => lote.nome)).toEqual(["Lote Norte"]);
  });

  it("2. Lote de outra fazenda do mesmo titular não aparece", () => {
    const resultado = doNorte();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos[0]?.lotes.some((lote) => lote.id === 104)).toBe(false);
  });

  it("3. Lote de outro titular não aparece", () => {
    const resultado = doNorte();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(JSON.stringify(resultado.pastos)).not.toContain("Lote Alheio");
  });

  it("4. Principal não recebe o lote incompatível", () => {
    const resultado = doNorte();
    expect(resultado.ok && resultado.pastos[0]?.fazendaId).toBe(10);
    expect(resultado.ok && resultado.pastos[0]?.lotes.every((lote) => lote.fazendaId === 10)).toBe(true);
  });

  it("5. Secundário da Fazenda A não recebe o lote da Fazenda B", () => {
    const resultado = doNorte({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos.map((pasto) => pasto.id)).toEqual([7]);
    expect(resultado.pastos[0]?.lotes.map((lote) => lote.nome)).toEqual(["Lote Norte"]);
  });

  it("6. Comum autorizado recebe só o lote da fazenda concedida", () => {
    const resultado = doNorte({
      identidade: comum,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos[0]?.lotes.map((lote) => lote.id)).toEqual([100]);
  });

  it("7. Sem a fazenda concedida, o pasto não entra", () => {
    const resultado = doNorte({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 20 }],
    });
    expect(resultado.ok && resultado.pastos).toEqual([]);
  });

  it("8. A contagem de lotes ignora o incompatível", () => {
    const resultado = doNorte();
    expect(resultado.ok && resultado.pastos[0]?.qtdLotes).toBe(1);
    expect(resultado.ok && resultado.pastos[0]?.qtdLotes).toBe(resultado.ok ? resultado.pastos[0]?.lotes.length : 0);
  });

  it("9. Animais do lote incompatível não entram na ocupação", () => {
    const resultado = doNorte();
    expect(resultado.ok && resultado.pastos[0]?.qtdAnimais).toBe(10);
    expect(resultado.ok && resultado.pastos[0]?.pctOcupacao).toBe(Math.min(100, Math.round((10 / 40) * 100)));
  });

  it("10. Pasto sem lote válido continua na resposta, vazio", () => {
    const resultado = painel({
      pastos: [norte],
      lotesDoTitular: [loteTrocado],
      contagemPorLote: [{ loteId: 104, quantidade: 6, userId: 1 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const pasto = resultado.pastos[0]!;
    expect(pasto.id).toBe(7);
    expect(pasto.lotes).toEqual([]);
    expect(pasto.qtdLotes).toBe(0);
    expect(pasto.qtdAnimais).toBe(0);
    expect(pasto.diasPastejo).toBeNull();
    expect(pasto.diasDescanso).toBeNull();
    expect(pasto.pctOcupacao).toBe(0);
  });

  it("11. A saída do próprio pasto continua valendo e não traz o lote alheio", () => {
    const resultado = painel({
      pastos: [{ ...norte, id: 17, nome: "Pasto Vazio", capacidade: 10, status: "descanso" }],
      lotesDoTitular: [],
      movimentacoes: [
        { userId: 9, pastoOrigemId: 17, dataSaida: "2026-11-04" },
        { userId: 1, pastoOrigemId: 17, dataSaida: "2026-10-26" },
      ],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos[0]?.diasDescanso).toBe(dias("2026-10-26", hoje));
    expect(resultado.pastos[0]?.lotes).toEqual([]);
    expect(JSON.stringify(resultado.pastos)).not.toContain("Lote Alheio");
  });

  it("12. O contrato do painel permanece", () => {
    const resultado = doNorte();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pastos[0]).toMatchObject({
      id: 7, fazendaId: 10, fazendaNome: "Fazenda Norte", qtdLotes: 1, qtdAnimais: 10,
    });
    expect(resultado.pastos[0]?.lotes[0]).toMatchObject({
      id: 100, nome: "Lote Norte", qtdAnimais: 10, pastoNome: "Pasto Norte", fazendaNome: "Fazenda Norte",
    });
  });

  it("13. A consulta SQL exige a mesma fazenda e o mesmo titular", () => {
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const inicio = fonte.indexOf("async function enriquecerPainelPastos");
    const bloco = fonte.slice(inicio, fonte.indexOf("type StatusNovoPasto"));
    expect(bloco).toContain("eq(lotes.userId, identidade.titularUserId)");
    expect(bloco).toContain("eq(pastos.userId, identidade.titularUserId)");
    expect(bloco).toContain("eq(lotes.fazendaId, pastos.fazendaId)");
    expect(bloco).toContain("innerJoin(pastos");
  });
});
