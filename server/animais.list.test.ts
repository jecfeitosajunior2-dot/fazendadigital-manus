import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { buildFimCarenciaPorAnimal, toDateOnlyISO } from "../shared/carenciaAnimal";
import { computeIndicadoresPeso } from "../shared/pesoEntrada";
import { buildLoteFazendaContext } from "./animaisPorFazenda";
import {
  calcularFimCarenciaNoEscopo,
  deveUsarEspelhoQuandoBancoCai,
  enriquecerAnimalParaLista,
  fazendaDoAnimalParaCarencia,
  filtrarAnimaisDaLista,
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

const fazendas = [
  { id: 10, userId: 1 },
  { id: 20, userId: 1 },
  { id: 30, userId: 9 },
];
const lotes = [
  { id: 100, userId: 1, fazendaId: 10, pastoAtualId: 7, nome: "Lote Norte" },
  { id: 200, userId: 1, fazendaId: 20, pastoAtualId: 8, nome: "Lote Sul" },
  { id: 300, userId: 9, fazendaId: 30, pastoAtualId: 9, nome: "Lote Alheio" },
];
const pastos = [
  { id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte" },
  { id: 8, userId: 1, fazendaId: 20, nome: "Pasto Sul" },
  { id: 9, userId: 9, fazendaId: 30, nome: "Pasto Alheio" },
];

const naFazendaA = {
  id: 1, userId: 1, fazendaId: 10, loteId: 100, pastoId: 7,
  brinco: "A1", brincoEletronico: "RFID-A", nome: "Mimosa", raca: "Nelore", sisbov: "SIS-A",
  categoria: "Vaca", sexo: "femea", status: "ativo", createdAt: "2026-03-02",
};
const naFazendaB = {
  id: 2, userId: 1, fazendaId: 20, loteId: 200, pastoId: 8,
  brinco: "B2", brincoEletronico: "RFID-B", nome: "Estrela", raca: "Angus", sisbov: "SIS-B",
  categoria: "Novilha", sexo: "femea", status: "ativo", createdAt: "2026-01-01",
};
const deOutraConta = {
  id: 3, userId: 9, fazendaId: 30, loteId: 300, pastoId: 9,
  brinco: "Z9", brincoEletronico: "RFID-Z", nome: "Alheia", raca: "Guzerá", sisbov: "SIS-Z",
  categoria: "Vaca", sexo: "femea", status: "ativo", createdAt: "2026-04-01",
};

function listar(parcial: Partial<Parameters<typeof filtrarAnimaisDaLista>[0]> = {}) {
  return filtrarAnimaisDaLista({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: fazendas,
    lotesDoTitular: lotes,
    pastosDoTitular: pastos,
    animais: [naFazendaA, naFazendaB, deOutraConta],
    consultaMysqlConcluida: true,
    ...parcial,
  });
}

describe("animais.list — autorização e contrato", () => {
  it("1. Principal visualiza os animais da própria conta", () => {
    const resultado = listar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.id)).toEqual([1, 2]);
  });

  it("2. Principal não visualiza animal de outra conta", () => {
    const resultado = listar({ titularInformadoPeloCliente: 9 });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.some((a) => a.userId === 9)).toBe(false);
  });

  it("3. Secundário autorizado visualiza o animal concedido", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.id)).toEqual([1]);
  });

  it("4. Secundário não visualiza animal de fazenda não concedida", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.some((a) => a.id === 2)).toBe(false);
  });

  it("5. Comum autorizado visualiza o animal concedido", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 20 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.id)).toEqual([2]);
  });

  it("6. Comum sem permissão não recebe dados", () => {
    const resultado = listar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["animais.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("7. Usuário inativo não recebe dados", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "inativo" }),
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("8. Usuário convidado não recebe dados", () => {
    const resultado = listar({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "convidado" }),
      permissoes: ["animais.visualizar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("9. Sessão inválida não recebe dados", () => {
    const resultado = listar({ identidade: null, papelInformadoPeloCliente: "principal" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("10. Fazenda de outra conta não aparece", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }, { userId: 3, fazendaId: 30 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(JSON.stringify(resultado.animais)).not.toContain("Alheia");
  });

  it("11. Filtro de fazenda não amplia a autorização", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroFazendaId: 20,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("12. Filtro de lote não amplia a autorização", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroLoteId: 200,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("13. Filtro de pasto não amplia a autorização", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroPastoId: 8,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("14. Busca textual não revela animal proibido", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      busca: "Estrela",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("15. RFID não revela animal proibido", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroRfid: "RFID-B",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("16. Brinco não revela animal proibido", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroBrinco: "B2",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("17. Lista vazia permanece vazia", () => {
    const resultado = listar({
      animais: [],
      locais: [naFazendaA],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("18. A resposta não carrega contagem de animal proibido", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toHaveLength(1);
    expect(resultado).not.toHaveProperty("total");
  });

  it("19. Animal legado segue a fazenda do lote da conta", () => {
    const legado = { ...naFazendaA, id: 4, fazendaId: null, brinco: "LEG" };
    const principalVe = listar({ animais: [legado, naFazendaB] });
    const secundarioVe = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [legado, naFazendaB],
    });
    expect(principalVe.ok && secundarioVe.ok).toBe(true);
    if (!principalVe.ok || !secundarioVe.ok) return;
    expect(principalVe.animais.map((a) => a.id)).toEqual([4, 2]);
    expect(secundarioVe.animais.map((a) => a.id)).toEqual([4]);
  });

  it("20. Lote de outra conta não abre o animal ao delegado", () => {
    const cruzado = { ...naFazendaA, id: 5, loteId: 300, brinco: "CRUZ" };
    const delegado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [cruzado],
    });
    const dono = listar({ animais: [cruzado] });
    expect(delegado.ok && dono.ok).toBe(true);
    if (!delegado.ok || !dono.ok) return;
    expect(delegado.animais).toEqual([]);
    expect(dono.animais.map((a) => a.id)).toEqual([5]);
  });

  it("21. Fazenda diferente da fazenda do lote não contorna a autorização", () => {
    const torto = { ...naFazendaA, id: 6, fazendaId: 10, loteId: 200, brinco: "TORTO" };
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [torto],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("22. Os campos do animal permanecem", () => {
    const resultado = listar({ animais: [naFazendaA] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais[0]).toMatchObject({
      id: 1, brinco: "A1", brincoEletronico: "RFID-A", categoria: "Vaca", sexo: "femea",
    });
  });

  it("23. GMD usa o mesmo cálculo de antes", () => {
    const pesos = [
      { peso: "300", data: "2026-01-01" },
      { peso: "330", data: "2026-02-01" },
    ];
    const animal = enriquecerAnimalParaLista(
      { dataNascimento: null, dataEntrada: "2026-01-01", pesoEntrada: "300", status: "ativo" },
      { loteNome: null, pastoNome: null, pesos, fimCarencia: null, temHistoricoOperacional: false, hoje: new Date("2026-11-05T00:00:00") },
    );
    expect(animal.gmd).toBe(computeIndicadoresPeso(pesos, { pesoEntrada: "300", dataEntrada: "2026-01-01" }).gmd);
  });

  it("24. Idade em meses permanece a conta de 30,44 dias", () => {
    const hoje = new Date("2026-11-05T00:00:00");
    const animal = enriquecerAnimalParaLista(
      { dataNascimento: "2024-11-05", status: "ativo" },
      { loteNome: null, pastoNome: null, pesos: [], fimCarencia: null, temHistoricoOperacional: false, hoje },
    );
    const esperado = Math.floor((hoje.getTime() - new Date("2024-11-05").getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    expect(animal.idadeMeses).toBe(esperado);
  });

  it("25. Carência permanece a data calculada", () => {
    const hoje = new Date("2026-11-05T00:00:00");
    const mapa = buildFimCarenciaPorAnimal(
      [{ animalId: 1, medicamento: "Vacina", dataRegistro: "2026-11-01", proximaData: null }],
      new Map([["vacina", 10]]),
      hoje,
    );
    const fim = mapa.get(1) ?? null;
    const animal = enriquecerAnimalParaLista(
      { dataNascimento: null, status: "ativo" },
      { loteNome: null, pastoNome: null, pesos: [], fimCarencia: fim, temHistoricoOperacional: false, hoje },
    );
    expect(animal.emCarencia).toBe(true);
    expect(animal.fimCarenciaAte).toBe(fim ? toDateOnlyISO(fim) : null);
  });

  it("26. O nome do lote da conta permanece", () => {
    const animal = enriquecerAnimalParaLista(
      { dataNascimento: null, status: "ativo" },
      { loteNome: "Lote Norte", pastoNome: null, pesos: [], fimCarencia: null, temHistoricoOperacional: false, hoje: new Date("2026-11-05T00:00:00") },
    );
    expect(animal.loteNome).toBe("Lote Norte");
  });

  it("27. O nome do pasto da conta permanece", () => {
    const animal = enriquecerAnimalParaLista(
      { dataNascimento: null, status: "ativo" },
      { loteNome: null, pastoNome: "Pasto Norte", pesos: [], fimCarencia: null, temHistoricoOperacional: false, hoje: new Date("2026-11-05T00:00:00") },
    );
    expect(animal.pastoNome).toBe("Pasto Norte");
  });

  it("28. A ordenação recebida permanece", () => {
    const resultado = listar({ animais: [naFazendaB, naFazendaA] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.id)).toEqual([2, 1]);
  });

  it("29. O formato continua sendo array", () => {
    const resultado = listar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(Array.isArray(resultado.animais)).toBe(true);
  });

  it("30. Permissão revogada impede nova consulta", () => {
    const com = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    const sem = listar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(com.ok).toBe(true);
    expect(sem).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("31. Fazenda revogada impede nova consulta", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("32. Espelho não devolve animal ausente do MySQL", () => {
    const resultado = listar({
      animais: [naFazendaB],
      locais: [naFazendaA],
      consultaMysqlConcluida: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.id)).toEqual([2]);
  });

  it("33. Fallback não entrega animal ao delegado", () => {
    const resultado = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      animais: [],
      locais: [naFazendaA, naFazendaB],
      consultaMysqlConcluida: false,
    });
    expect(deveUsarEspelhoQuandoBancoCai(secundario)).toBe(false);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais).toEqual([]);
  });

  it("34. Falha de banco não vira lista vazia", () => {
    expect(deveUsarEspelhoQuandoBancoCai(principal)).toBe(true);
    expect(deveUsarEspelhoQuandoBancoCai(comum)).toBe(false);
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const lista = fonte.slice(fonte.indexOf("list: protectedProcedure\n    .input(animaisListInput)"), fonte.indexOf("getById: protectedProcedure"));
    expect(lista).toContain("if (!isDatabaseUnavailable(error)) throw error");
    expect(lista).toContain("if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error");
    expect(lista).toContain("eq(animais.userId, identidade.titularUserId)");
    expect(lista).toContain("orderBy(desc(animais.createdAt))");
  });

  it("35. O Principal mantém os animais legítimos, na ordem e com a ficha", () => {
    const semFazenda = { ...naFazendaA, id: 8, fazendaId: null, loteId: null, brinco: "SOLTO" };
    const resultado = listar({ animais: [naFazendaA, semFazenda, naFazendaB, deOutraConta] });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.animais.map((a) => a.id)).toEqual([1, 8, 2]);
    expect(resultado.animais[0]).toMatchObject({ brinco: "A1", raca: "Nelore", categoria: "Vaca" });
  });
});

describe("animais.list — carência no escopo da fazenda", () => {
  const hoje = new Date("2026-11-05T00:00:00");
  const fazendasTitular = [10, 20];
  const produto = (
    id: number,
    fazendaId: number | null,
    dias: number,
    nome = "Ivermectina",
  ) => ({ id, nome, fazendaId, carenciaAbateDias: dias, possuiCarencia: true as const });

  function fimDoAnimal(
    fazendaId: number | null,
    produtos: ReturnType<typeof produto>[],
    registro: { medicamento?: string; estoqueId?: number | null; proximaData?: string | null; dataRegistro?: string } = {},
  ) {
    return calcularFimCarenciaNoEscopo({
      animais: [{ id: 1, fazendaId }],
      registros: [{
        animalId: 1,
        medicamento: registro.medicamento ?? "Ivermectina",
        dataRegistro: registro.dataRegistro ?? "2026-11-01",
        proximaData: registro.proximaData ?? null,
        estoqueId: registro.estoqueId ?? null,
      }],
      produtos,
      fazendasDoTitular: fazendasTitular,
      hoje,
    }).get(1) ?? null;
  }

  function ficha(fim: Date | null) {
    return enriquecerAnimalParaLista(
      { dataNascimento: null, status: "ativo" },
      { loteNome: null, pastoNome: null, pesos: [], fimCarencia: fim, temHistoricoOperacional: false, hoje },
    );
  }

  it("1. Mesma fazenda continua somando os dias do produto", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10)]);
    expect(ficha(fim).emCarencia).toBe(true);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
    const repetidoComOsMesmosDias = fimDoAnimal(10, [produto(1, 10, 10), produto(5, 10, 10)]);
    expect(ficha(repetidoComOsMesmosDias).fimCarenciaAte).toBe("2026-11-11");
  });

  it("2. Produto de outro titular não entra na conta", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(9, 30, 40)]);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
  });

  it("3. Produto da outra fazenda do mesmo titular não entra", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(2, 20, 40)]);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
    const vinculoDaOutraFazenda = fimDoAnimal(10, [produto(1, 10, 10), produto(2, 20, 40)], { estoqueId: 2 });
    expect(ficha(vinculoDaOutraFazenda).fimCarenciaAte).toBe("2026-11-11");
  });

  it("4. Principal consulta o animal da própria fazenda com a carência dela", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(2, 20, 40)]);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
    const lista = listar();
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.animais.some((animal) => animal.id === 1)).toBe(true);
  });

  it("5. Secundário autorizado recebe a mesma carência desse animal", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(2, 20, 40)]);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
    const lista = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.animais.map((animal) => animal.id)).toEqual([1]);
  });

  it("6. Comum autorizado recebe a mesma carência, sem permissão de estoque", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(2, 20, 40)]);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
    const lista = listar({
      identidade: comum,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.animais.map((animal) => animal.id)).toEqual([1]);
  });

  it("7. Sem a fazenda concedida, o animal não aparece na lista", () => {
    const lista = listar({
      identidade: secundario,
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      filtroFazendaId: 20,
    });
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.animais).toEqual([]);
  });

  it("8. Nome repetido com dias diferentes não escolhe o último", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(3, 10, 30)]);
    expect(fim).toBeNull();
    const peloVinculo = fimDoAnimal(10, [produto(1, 10, 10), produto(3, 10, 30)], { estoqueId: 1 });
    expect(ficha(peloVinculo).fimCarenciaAte).toBe("2026-11-11");
    const vinculoFora = fimDoAnimal(
      10,
      [produto(1, 10, 10), produto(3, 10, 30), produto(2, 20, 40)],
      { estoqueId: 2 },
    );
    expect(vinculoFora).toBeNull();
  });

  it("9. Produto sem fazenda não é compartilhado", () => {
    const fim = fimDoAnimal(10, [produto(1, 10, 10), produto(4, null, 90)]);
    expect(ficha(fim).fimCarenciaAte).toBe("2026-11-11");
    const soSemFazenda = fimDoAnimal(10, [produto(4, null, 90)]);
    expect(soSemFazenda).toBeNull();
  });

  it("10. O filtro de carência usa só o resultado do escopo", () => {
    const naA = ficha(fimDoAnimal(10, [produto(1, 10, 10), produto(2, 20, 40)]));
    const naB = ficha(fimDoAnimal(20, [produto(1, 10, 10), produto(2, 20, 2)]));
    const emCarencia = [naA, naB].filter((animal) => animal.emCarencia === true);
    expect(emCarencia).toHaveLength(1);
    expect(emCarencia[0].fimCarenciaAte).toBe("2026-11-11");
  });

  it("11. Sem produto correspondente, não inventa dias", () => {
    expect(fimDoAnimal(10, [])).toBeNull();
    const pelaProxima = fimDoAnimal(10, [], { proximaData: "2026-11-20", medicamento: "Sem estoque" });
    expect(ficha(pelaProxima).fimCarenciaAte).toBe("2026-11-20");
  });

  it("12. A fazenda do lote vale quando o animal não tem fazenda própria", () => {
    const { loteFazendaById } = buildLoteFazendaContext(lotes, pastos);
    expect(fazendaDoAnimalParaCarencia({ fazendaId: null, loteId: 100 }, loteFazendaById)).toBe(10);
    expect(fazendaDoAnimalParaCarencia({ fazendaId: null, loteId: null }, loteFazendaById)).toBeNull();
    expect(fimDoAnimal(null, [produto(1, 10, 10)])).toBeNull();
  });

  it("13. A consulta da lista não lê o estoque inteiro", () => {
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const lista = fonte.slice(
      fonte.indexOf("list: protectedProcedure\n    .input(animaisListInput)"),
      fonte.indexOf("getById: protectedProcedure"),
    );
    expect(lista).toContain("calcularFimCarenciaNoEscopo");
    expect(lista).toContain("eq(fazendas.userId, identidade.titularUserId)");
    expect(lista).toContain("innerJoin(fazendas, eq(fazendas.id, estoque.fazendaId))");
    expect(lista).toContain("estoqueId: saudeRegistros.estoqueId");
    expect(lista).not.toContain("filtra apenas por possuiCarencia");
    expect(lista).not.toContain("estoque.visualizar");
    expect(lista).toContain("orderBy(desc(animais.createdAt))");
    const formula = readFileSync(resolve(here, "../shared/carenciaAnimal.ts"), "utf8");
    expect(formula).toContain("fim.setDate(fim.getDate() + dias)");
  });
});
