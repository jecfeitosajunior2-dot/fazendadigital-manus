import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { permissaoPorId } from "./catalogoPermissoes";
import { unpackReproObservacoes } from "../shared/reproRegistroMeta";
import {
  MSG_COLETIVA_SOMENTE,
  MSG_INSEMINACAO_COLETIVA,
  MSG_OPERACAO_DIVERGENTE,
  MSG_OPERACAO_OBRIGATORIA,
  MSG_REPRODUTOR_COLETIVO_AUSENTE,
  ORDEM_BLOQUEIO_COLETIVA,
  PERMISSAO_COLETIVA,
  registrarReproducaoColetivaAutorizada,
  type AnimalColetivoLinha,
  type ConsultaColetiva,
  type IoColetiva,
  type LoteColetivoLinha,
  type PedidoColetivo,
  type RegistroColetivoLinha,
} from "./registrarReproducaoColetivaAutorizado";
import { MSG_SEM_FAZENDA_MANEJO, MSG_SEM_PERMISSAO_REPRODUCAO } from "./registrarManejoAutorizado";
import { MSG_REPRO_LOTE_INELEGIVEL, MSG_REPRO_MATRIZ_INELEGIVEL } from "../shared/reproCoberturaAlvo";
import { formatMsgMatrizJaRegistradaNesteTouro } from "../shared/reproEspelhoDuplicata";

const raiz = dirname(fileURLToPath(import.meta.url));

function usuario(parcial: Partial<LinhaUsuarioCadastro> & Pick<LinhaUsuarioCadastro, "id" | "papel">): LinhaUsuarioCadastro {
  return {
    openId: `u-${parcial.id}`, name: parcial.papel === "principal" ? "Administrador da conta" : "Funcionario Curral",
    email: null, role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: parcial.papel === "principal" ? parcial.id : 1, situacao: "ativo", sessionVersion: 1, ...parcial,
  };
}

function animal(parcial: Partial<AnimalColetivoLinha> & Pick<AnimalColetivoLinha, "id">): AnimalColetivoLinha {
  return {
    userId: 1, fazendaId: 10, loteId: 100, pastoId: 1000, sexo: "femea", categoria: "Vaca",
    status: "ativo", dataNascimento: "2018-01-01", castrado: false, brinco: `B${parcial.id}`, nome: null, ...parcial,
  };
}

function mundo(opcoes?: { falha?: "conexao"; estourarEspelho?: number; estourarUmaVez?: boolean }) {
  const usuarios = [
    usuario({ id: 1, papel: "principal", sessionVersion: 3 }),
    usuario({ id: 2, papel: "comum", titularUserId: 1 }),
    usuario({ id: 3, papel: "comum", titularUserId: 1 }),
    usuario({ id: 5, papel: "comum", titularUserId: 1 }),
  ];
  const permissoes = [
    { userId: 2, permissao: PERMISSAO_COLETIVA },
    { userId: 3, permissao: "animais.criar" },
    { userId: 5, permissao: PERMISSAO_COLETIVA },
  ];
  const animais = [
    animal({ id: 80, sexo: "macho", categoria: "Boi", brinco: "TOURO" }),
    animal({ id: 81, sexo: "macho", categoria: "Boi", brinco: "TOURO2" }),
    animal({ id: 82, sexo: "macho", categoria: "Boi", castrado: true, brinco: "CASTRADO" }),
    animal({ id: 83, sexo: "macho", categoria: "Bezerro", dataNascimento: "2026-01-01", brinco: "JOVEM" }),
    animal({ id: 17, brinco: "V17" }),
    animal({ id: 21, brinco: "V21" }),
    animal({ id: 19, categoria: "Bezerra", dataNascimento: "2026-01-01", brinco: "BEZ" }),
    animal({ id: 33, fazendaId: 20, loteId: 200, brinco: "OUTRA" }),
    animal({ id: 90, userId: 4, fazendaId: 40, brinco: "ALHEIA" }),
    animal({ id: 18, status: "morto", brinco: "MORTA" }),
  ];
  const lotes: LoteColetivoLinha[] = [
    { id: 100, userId: 1, fazendaId: 10, pastoAtualId: 1000, ativo: true, nome: "Maternidade" },
    { id: 200, userId: 1, fazendaId: 20, pastoAtualId: 2000, ativo: true, nome: "Outra" },
    { id: 300, userId: 1, fazendaId: 10, pastoAtualId: 1000, ativo: false, nome: "Inativo" },
  ];
  const registros: RegistroColetivoLinha[] = [];
  const operacoes: Array<{
    userId: number;
    chave: string;
    conteudoHash: string;
    registroPrincipalId: number | null;
    espelhosMatriz: number;
    matrizesIgnoradas: number;
  }> = [];
  let seq = 1;
  let estouros = 0;
  const consultas: ConsultaColetiva = {
    async usuario(id) { return usuarios.find((item) => item.id === id) ?? null; },
    async permissoes(userId) { return permissoes.filter((item) => item.userId === userId).map((item) => item.permissao); },
    async vinculos(userId) { return userId === 5 ? [{ userId: 5, fazendaId: 20 }] : userId === 2 || userId === 3 ? [{ userId, fazendaId: 10 }] : []; },
    async fazendasDoTitular(titularUserId) { return titularUserId === 1 ? [{ id: 10, userId: 1 }, { id: 20, userId: 1 }] : [{ id: 40, userId: 4 }]; },
    async fazenda(id) { return id === 40 ? { id: 40, userId: 4 } : { id, userId: 1 }; },
    async espiarAnimal(id) { return animais.find((item) => item.id === id) ?? null; },
    async travaLote(id) { return lotes.find((item) => item.id === id) ?? null; },
    async travaPasto(id) { return { id, userId: 1, fazendaId: id === 2000 ? 20 : 10 }; },
    async travaAnimal(id) { return animais.find((item) => item.id === id) ?? null; },
    async baixaAtiva(_userId, animalId) { return animalId === 18 ? { dataBaixa: "2026-11-01" } : null; },
    async travaRegistros() { return registros.map((item) => ({ ...item })); },
    async inserirRegistro(row) {
      const id = seq++;
      registros.push({ id, ...row });
      return id;
    },
    async atualizarObservacoes(id, _userId, observacoes) {
      const row = registros.find((item) => item.id === id);
      if (row) row.observacoes = observacoes;
    },
    async reservarOperacao(row) {
      const existe = operacoes.find((item) => item.userId === row.userId && item.chave === row.chave);
      if (existe) {
        if (existe.conteudoHash !== row.conteudoHash || existe.registroPrincipalId == null) return { situacao: "divergente" };
        return {
          situacao: "repetida",
          registroPrincipalId: existe.registroPrincipalId,
          espelhosMatriz: existe.espelhosMatriz,
          matrizesIgnoradas: existe.matrizesIgnoradas,
        };
      }
      operacoes.push({
        userId: row.userId,
        chave: row.chave,
        conteudoHash: row.conteudoHash,
        registroPrincipalId: null,
        espelhosMatriz: 0,
        matrizesIgnoradas: 0,
      });
      return { situacao: "nova" };
    },
    async concluirOperacao(row) {
      const existe = operacoes.find((item) => item.userId === row.userId && item.chave === row.chave && item.registroPrincipalId == null);
      if (!existe) throw new Error("operação reprodutiva não vinculada");
      existe.registroPrincipalId = row.registroPrincipalId;
      existe.espelhosMatriz = row.espelhosMatriz;
      existe.matrizesIgnoradas = row.matrizesIgnoradas;
    },
    async aposEspelho(indice) {
      if (opcoes?.estourarEspelho !== indice) return;
      if (opcoes.estourarUmaVez && estouros > 0) return;
      estouros += 1;
      throw new Error("falha na segunda matriz");
    },
  };
  const io: IoColetiva = {
    async emTransacao(fn) {
      if (opcoes?.falha === "conexao") throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      const foto = registros.map((item) => ({ ...item }));
      const fotoOps = operacoes.map((item) => ({ ...item }));
      const seqAntes = seq;
      try {
        return await fn(consultas);
      } catch (erro) {
        registros.splice(0, registros.length, ...foto);
        operacoes.splice(0, operacoes.length, ...fotoOps);
        seq = seqAntes;
        throw erro;
      }
    },
  };
  return { io, registros, operacoes };
}

let chaveTeste = 0;
function pedido(executorId: number, session: number, extra: Partial<PedidoColetivo["input"]> = {}, spoof: Partial<PedidoColetivo> = {}): PedidoColetivo {
  chaveTeste += 1;
  return {
    executorId,
    sessionVersionDaSessao: session,
    ...spoof,
    input: {
      animalId: 80,
      fazendaId: 10,
      tipo: "Estação de monta",
      dataCobertura: "2026-11-10",
      coberturaSelecaoModo: "lote",
      coberturaLoteId: 100,
      coberturaMatrizIds: [17, 21],
      operacaoId: `00000000-0000-4000-8000-${String(chaveTeste).padStart(12, "0")}`,
      ...extra,
    },
  };
}

describe("estação e cobertura em grupo", () => {
  it("usa reproducao.criar e preserva os caminhos individuais", () => {
    expect(permissaoPorId(PERMISSAO_COLETIVA)?.descricao).toMatch(/parto|reprodução/i);
    const fonte = readFileSync(join(raiz, "registrarReproducaoColetivaAutorizado.ts"), "utf8");
    const rota = readFileSync(join(raiz, "routers.ts"), "utf8");
    const tela = readFileSync(join(raiz, "../client/src/pages/ManejoPages.tsx"), "utf8");
    const curral = readFileSync(join(raiz, "../client/src/components/curral/CurralReprodutivoPanel.tsx"), "utf8");
    const edicao = readFileSync(join(raiz, "editarReproducaoAutorizado.ts"), "utf8");
    expect(fonte).toContain(ORDEM_BLOQUEIO_COLETIVA);
    expect(fonte).not.toContain('from "./db"');
    expect(fonte).not.toContain("localFallback");
    expect(fonte).not.toContain("semenMovimentacoes");
    const create = rota.slice(rota.indexOf("create: protectedProcedure", rota.indexOf("REPRODUCAO ROUTER")), rota.indexOf("registrarPartoComCrias:"));
    expect(create).toContain("lancarInseminacaoSemenEEspelhar");
    expect(create).toContain("registrarReproducaoSimplesEEspelhar");
    expect(create).toContain("registrarReproducaoColetivaAutorizada");
    expect(create).not.toContain("registrarInseminacaoComSemenLocal");
    expect(create).not.toContain("localFallback");
    expect(rota).toContain("registrarPartoAutorizado");
    expect(rota).toContain("editarReproducaoAutorizada");
    expect(rota).toContain("excluirReproducaoAutorizada");
    expect(edicao).toContain("Estação de monta");
    expect(edicao).toContain("espelhoAutomatico");
    expect(tela).toContain("trpc.reproducao.create.useMutation");
    expect(tela).toContain("coberturaMatrizIds");
    expect(tela).toContain("operacaoColetivaAtual");
    expect(curral).toContain("trpc.reproducao.create.useMutation");
    expect(curral).toContain("substituirEspelhosMatrizIds");
    expect(curral).toContain("operacaoColetivaAtual");
    expect(create).toContain("repetida");
  });

  it("o administrador e o funcionário gravam a estação no titular, com cópia por matriz", async () => {
    const base = mundo();
    const principal = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, {}, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: [],
    }));
    expect(principal).toMatchObject({ ok: true, titularUserId: 1, espelhosMatriz: 2, matrizesIgnoradas: 0 });
    if (!principal.ok) return;
    expect(principal.principal).toMatchObject({ femeaId: 80, machoId: 80, tipo: "Estação de monta" });
    expect(unpackReproObservacoes(principal.principal.observacoes).coberturaAlvo?.animalIds).toEqual([17, 21]);
    expect(principal.copias.map((copia) => copia.tipo)).toEqual(["Exposição à monta", "Exposição à monta"]);
    expect(principal.copias.every((copia) => copia.machoId === 80 && unpackReproObservacoes(copia.observacoes).espelhoAutomatico)).toBe(true);
    expect(base.registros.filter((item) => item.userId === 1)).toHaveLength(3);

    const funcionario = await registrarReproducaoColetivaAutorizada(base.io, pedido(2, 1, {
      tipo: "Cobertura realizada",
      coberturaSelecaoModo: "individual",
      coberturaLoteId: undefined,
      coberturaMatrizIds: [17],
      animalId: 81,
    }));
    expect(funcionario).toMatchObject({ ok: true, titularUserId: 1, espelhosMatriz: 1 });
    if (funcionario.ok) expect(funcionario.copias[0]).toMatchObject({ tipo: "Cobertura", machoId: 81, femeaId: 17 });
  });

  it("recusa quem não pode, animal ruim, outra fazenda, duplicata e sêmen coletivo", async () => {
    const base = mundo();
    const sem = await registrarReproducaoColetivaAutorizada(base.io, pedido(3, 1, {}, {
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: [PERMISSAO_COLETIVA],
    }));
    expect(sem).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_REPRODUCAO });
    const fazenda = await registrarReproducaoColetivaAutorizada(base.io, pedido(5, 1));
    expect(fazenda).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    const alheio = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { animalId: 90, fazendaId: 40, coberturaMatrizIds: [17] }));
    expect(alheio).toMatchObject({ mensagem: MSG_REPRODUTOR_COLETIVO_AUSENTE });
    const matrizAlheia = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [90] }));
    expect(matrizAlheia).toMatchObject({ mensagem: MSG_REPRO_MATRIZ_INELEGIVEL });
    const sumida = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { animalId: 999 }));
    expect(sumida).toMatchObject({ mensagem: MSG_REPRODUTOR_COLETIVO_AUSENTE });
    const matrizSumida = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [999] }));
    expect(matrizSumida).toMatchObject({ mensagem: MSG_REPRO_MATRIZ_INELEGIVEL });
    const morta = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [18] }));
    expect(morta.ok).toBe(false);
    const bezerra = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [19] }));
    expect(bezerra).toMatchObject({ mensagem: MSG_REPRO_MATRIZ_INELEGIVEL });
    const outraFazenda = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [33], coberturaLoteId: 200, fazendaId: 20 }));
    expect(outraFazenda.ok).toBe(false);
    const loteRuim = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaLoteId: 200 }));
    expect(loteRuim).toMatchObject({ mensagem: MSG_REPRO_LOTE_INELEGIVEL });
    const castrado = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { animalId: 82 }));
    expect(castrado.ok).toBe(false);
    const jovem = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { animalId: 83 }));
    expect(jovem.ok).toBe(false);
    await expect(registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, {
      tipo: "Inseminação", semenPartidaId: 7, coberturaMatrizIds: [17],
    }))).rejects.toMatchObject({ message: MSG_INSEMINACAO_COLETIVA });
    await expect(registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { tipo: "Diagnóstico de prenhez" }))).rejects.toBeInstanceOf(TRPCError);
    await expect(registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { tipo: "Diagnóstico de prenhez" }))).rejects.toMatchObject({ message: MSG_COLETIVA_SOMENTE });
    expect(base.registros).toHaveLength(0);
    await expect(registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { operacaoId: "" }))).rejects.toMatchObject({
      message: MSG_OPERACAO_OBRIGATORIA,
    });
    expect(base.registros).toHaveLength(0);
    expect(base.operacoes).toHaveLength(0);
  });

  it("ignora duplicata de lote, recusa a individual, substitui, desfaz e segura o banco", async () => {
    const base = mundo();
    await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [17] }));
    const segunda = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { coberturaMatrizIds: [17, 21] }));
    expect(segunda).toMatchObject({ ok: true, espelhosMatriz: 1, matrizesIgnoradas: 1 });
    const individual = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, {
      tipo: "Cobertura realizada",
      coberturaSelecaoModo: "individual",
      coberturaLoteId: undefined,
      coberturaMatrizIds: [17],
    }));
    expect(individual.ok).toBe(true);
    const repetida = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, {
      tipo: "Cobertura realizada",
      coberturaSelecaoModo: "individual",
      coberturaLoteId: undefined,
      coberturaMatrizIds: [17],
    }));
    expect(repetida).toMatchObject({ mensagem: formatMsgMatrizJaRegistradaNesteTouro("V17") });
    const antes = base.registros.length;
    const troca = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, {
      tipo: "Cobertura realizada",
      coberturaSelecaoModo: "individual",
      coberturaLoteId: undefined,
      coberturaMatrizIds: [17],
      substituirEspelhosMatrizIds: [17],
    }));
    expect(troca).toMatchObject({ ok: true, espelhosMatriz: 1, matrizesIgnoradas: 0 });
    expect(base.registros.some((item) => unpackReproObservacoes(item.observacoes).anulado)).toBe(true);
    expect(base.registros.length).toBe(antes + 2);

    const falha = mundo({ estourarEspelho: 1 });
    await expect(registrarReproducaoColetivaAutorizada(falha.io, pedido(1, 3))).rejects.toThrow(/segunda matriz/);
    expect(falha.registros).toHaveLength(0);
    await expect(registrarReproducaoColetivaAutorizada(mundo({ falha: "conexao" }).io, pedido(1, 3))).rejects.toMatchObject({
      message: "Banco de dados indisponível.",
    });
  });

  it("a mesma chave devolve o original e outra chave no mesmo dia grava de novo", async () => {
    const base = mundo();
    const chave = "11111111-1111-4111-8111-111111111111";
    const primeiro = await registrarReproducaoColetivaAutorizada(base.io, pedido(2, 1, { operacaoId: chave, responsavel: "Capataz" }));
    expect(primeiro).toMatchObject({ ok: true, repetida: false, espelhosMatriz: 2 });
    if (!primeiro.ok) return;
    const segundoClique = await registrarReproducaoColetivaAutorizada(base.io, pedido(1, 3, { operacaoId: chave, responsavel: "Capataz" }));
    expect(segundoClique).toMatchObject({
      ok: true,
      repetida: true,
      id: primeiro.id,
      espelhosMatriz: 2,
      matrizesIgnoradas: 0,
    });
    expect(base.registros.filter((item) => item.tipo === "Estação de monta")).toHaveLength(1);
    expect(base.operacoes).toHaveLength(1);

    const outroConteudo = await registrarReproducaoColetivaAutorizada(base.io, pedido(2, 1, {
      operacaoId: chave,
      observacoes: "outro lote mental",
    }));
    expect(outroConteudo).toMatchObject({ mensagem: MSG_OPERACAO_DIVERGENTE });
    expect(base.registros.filter((item) => item.tipo === "Estação de monta")).toHaveLength(1);

    const legitimo = await registrarReproducaoColetivaAutorizada(base.io, pedido(2, 1, { animalId: 81, coberturaMatrizIds: [21] }));
    expect(legitimo).toMatchObject({ ok: true, repetida: false });
    expect(base.registros.filter((item) => item.tipo === "Estação de monta")).toHaveLength(2);

    const chaveFalha = "22222222-2222-4222-8222-222222222222";
    const falha = mundo({ estourarEspelho: 1, estourarUmaVez: true });
    await expect(registrarReproducaoColetivaAutorizada(falha.io, pedido(1, 3, { operacaoId: chaveFalha }))).rejects.toThrow(/segunda matriz/);
    expect(falha.operacoes).toHaveLength(0);
    const deNovo = await registrarReproducaoColetivaAutorizada(falha.io, pedido(1, 3, { operacaoId: chaveFalha }));
    expect(deNovo).toMatchObject({ ok: true, repetida: false, espelhosMatriz: 2 });
    expect(falha.registros.filter((item) => item.tipo === "Estação de monta")).toHaveLength(1);
  });
});
