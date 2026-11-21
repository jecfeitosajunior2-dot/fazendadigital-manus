import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { packReproObservacoes, unpackReproObservacoes } from "../shared/reproRegistroMeta";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  MSG_REPRO_DATA_COM_SEMEN,
  MSG_REPRO_DATA_INVALIDA,
  MSG_REPRO_EDICAO_ESTRUTURAL,
  MSG_REPRO_EXCLUSAO_DOSE,
  MSG_REPRO_EXCLUSAO_ESTACAO,
  MSG_REPRO_EXCLUSAO_PARTO,
  MSG_REPRO_MUDAR_MATRIZ,
  MSG_REPRO_MUDAR_PARTIDA,
  MSG_REPRO_NAO_ENCONTRADO,
  MSG_SEM_PERMISSAO_EDITAR_REPRO,
  MSG_SEM_PERMISSAO_EXCLUIR_REPRO,
  ORDEM_BLOQUEIO_REPRO_EDICAO,
  PERMISSAO_REPRO_EDITAR,
  PERMISSAO_REPRO_INATIVAR,
  editarReproducaoAutorizada,
  erroEditarReproducao,
  excluirReproducaoAutorizada,
  type ConsultaEditarReproducao,
  type IoEditarReproducao,
  type PedidoEditarReproducao,
  type RegistroReproLinha,
  type SaidaIaLinha,
} from "./editarReproducaoAutorizado";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const raiz = dirname(fileURLToPath(import.meta.url));

function usuario(parcial: Partial<LinhaUsuarioCadastro> & Pick<LinhaUsuarioCadastro, "id" | "papel">): LinhaUsuarioCadastro {
  return {
    openId: `u-${parcial.id}`,
    name: parcial.papel === "principal" ? "Administrador da conta" : "Funcionario Curral",
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: parcial.papel === "principal" ? parcial.id : 1,
    situacao: "ativo",
    sessionVersion: 1,
    ...parcial,
  };
}

function registro(parcial: Partial<RegistroReproLinha> & Pick<RegistroReproLinha, "id" | "tipo">): RegistroReproLinha {
  return {
    userId: 1,
    femeaId: 17,
    machoId: null,
    dataCobertura: "2026-11-01",
    dataPrevistoParto: null,
    resultado: null,
    observacoes: "nota antiga",
    ...parcial,
  };
}

function mundo(opcoes?: { falha?: "conexao"; estourar?: boolean }) {
  const usuarios = [
    usuario({ id: 1, papel: "principal", sessionVersion: 3 }),
    usuario({ id: 2, papel: "comum", titularUserId: 1 }),
    usuario({ id: 3, papel: "comum", titularUserId: 1 }),
    usuario({ id: 4, papel: "principal", titularUserId: 4 }),
    usuario({ id: 5, papel: "comum", titularUserId: 1 }),
  ];
  const permissoes = [
    { userId: 2, permissao: PERMISSAO_REPRO_EDITAR },
    { userId: 2, permissao: PERMISSAO_REPRO_INATIVAR },
    { userId: 3, permissao: "reproducao.visualizar" },
    { userId: 5, permissao: PERMISSAO_REPRO_EDITAR },
    { userId: 5, permissao: PERMISSAO_REPRO_INATIVAR },
  ];
  const vinculos = [
    { userId: 2, fazendaId: 10 },
    { userId: 3, fazendaId: 10 },
    { userId: 5, fazendaId: 20 },
  ];
  const fazendas = [
    { id: 10, userId: 1 },
    { id: 20, userId: 1 },
    { id: 40, userId: 4 },
  ];
  const animais = [
    { id: 17, userId: 1, fazendaId: 10 },
    { id: 30, userId: 1, fazendaId: 10 },
    { id: 80, userId: 1, fazendaId: 10 },
    { id: 90, userId: 4, fazendaId: 40 },
    { id: 40, userId: 1, fazendaId: 10 },
  ];
  const notaIa = packReproObservacoes("aplicada", "Touro 80", "João", null, null, {
    semenPartidaId: 500,
    partidaSemen: "L23081",
    inseminador: "João",
  });
  let registros: RegistroReproLinha[] = [
    registro({ id: 201, tipo: "Inseminação", dataCobertura: "2026-11-10", observacoes: notaIa ?? null, machoId: 80 }),
    registro({ id: 202, tipo: "Diagnóstico de prenhez", observacoes: "vazia" }),
    registro({ id: 220, tipo: "Diagnóstico de prenhez", femeaId: 40, observacoes: "sozinho" }),
    registro({ id: 207, tipo: "Parto", femeaId: 30, observacoes: "nasceu" }),
    registro({ id: 208, tipo: "Estação de monta", femeaId: 80, observacoes: "lote" }),
    registro({ id: 301, tipo: "Diagnóstico de prenhez", userId: 4, femeaId: 90, observacoes: "alheia" }),
  ];
  const saidas: SaidaIaLinha[] = [{ id: 1, partidaId: 500, quantidadeDoses: 1 }];
  const partidas = [{ id: 500, userId: 1, fazendaId: 10, saldoDoses: 4 }];
  let saldo = 4;
  let atualizou = 0;
  let excluiu = 0;
  const consultas: ConsultaEditarReproducao = {
    async usuario(id) { return usuarios.find((item) => item.id === id) ?? null; },
    async permissoes(userId) {
      return permissoes.filter((item) => item.userId === userId).map((item) => item.permissao);
    },
    async vinculos(userId) { return vinculos.filter((item) => item.userId === userId); },
    async fazendasDoTitular(titularUserId) { return fazendas.filter((item) => item.userId === titularUserId); },
    async fazenda(id) { return fazendas.find((item) => item.id === id) ?? null; },
    async espiarRegistro(id) { return registros.find((item) => item.id === id) ?? null; },
    async espiarAnimal(id) { return animais.find((item) => item.id === id) ?? null; },
    async travaRegistro(id) { return registros.find((item) => item.id === id) ?? null; },
    async travaAnimal(id) { return animais.find((item) => item.id === id) ?? null; },
    async registrosDoAnimal(userId, animalId) {
      return registros.filter((item) => item.userId === userId && (item.femeaId === animalId || item.machoId === animalId));
    },
    async espiarSaidasIa(_userId, registroId) { return registroId === 201 ? saidas : []; },
    async saidasIaDoRegistro(_userId, registroId) { return registroId === 201 ? saidas : []; },
    async espelhosDoRegistro() { return []; },
    async travaPartida(id) { return partidas.find((item) => item.id === id) ?? null; },
    async partoTemCrias(registroId) { return registroId === 207; },
    async atualizarRegistro(input) {
      atualizou += 1;
      registros = registros.map((item) => item.id === input.id ? { ...item, ...input, dataCobertura: input.dataCobertura } : item);
      return 1;
    },
    async excluirRegistro(id) {
      excluiu += 1;
      registros = registros.filter((item) => item.id !== id);
      return 1;
    },
    async aposTravas() {
      if (opcoes?.estourar) throw new Error("falha na atualização");
    },
  };
  const io: IoEditarReproducao = {
    async emTransacao(fn) {
      if (opcoes?.falha === "conexao") {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      }
      const copia = registros.map((item) => ({ ...item }));
      const saldoAntes = saldo;
      try {
        return await fn(consultas);
      } catch (erro) {
        registros = copia;
        saldo = saldoAntes;
        throw erro;
      }
    },
  };
  return {
    io,
    registros: () => registros,
    saldo: () => saldo,
    atualizou: () => atualizou,
    excluiu: () => excluiu,
    saidas: () => saidas.length,
  };
}

function pedido(executorId: number, sessionVersion: number, registroId: number, extra: Partial<PedidoEditarReproducao> = {}): PedidoEditarReproducao {
  return {
    executorId,
    sessionVersionDaSessao: sessionVersion,
    registroId,
    tipo: "Diagnóstico de prenhez",
    dataCobertura: "2026-11-01",
    observacoes: "corrigida",
    ...extra,
  };
}

describe("edição e exclusão reprodutiva", () => {
  it("usa as permissões que já existem e não mexe no estoque por conta própria", () => {
    expect(permissaoPorId(PERMISSAO_REPRO_EDITAR)?.descricao).toMatch(/alterar reprodução/i);
    expect(permissaoPorId(PERMISSAO_REPRO_INATIVAR)?.descricao).toMatch(/excluir lançamento/i);
    expect(permissaoPorId("semen.estornar")).toBeNull();
    const fonte = readFileSync(join(raiz, "editarReproducaoAutorizado.ts"), "utf8");
    const banco = readFileSync(join(raiz, "editarReproducaoAutorizadoDb.ts"), "utf8");
    const rotas = readFileSync(join(raiz, "routers.ts"), "utf8");
    const tela = readFileSync(join(raiz, "../client/src/pages/ReproductionManagementPage.tsx"), "utf8");
    expect(fonte).not.toContain('from "./db"');
    expect(fonte).not.toContain("localFallback");
    expect(fonte).not.toContain("AJUSTE_ESTOQUE");
    expect(fonte).not.toContain("semenMovimentacoes");
    expect(fonte).not.toContain("saldo_doses");
    expect(fonte).toContain(ORDEM_BLOQUEIO_REPRO_EDICAO);
    expect(banco).toContain('isolationLevel: "read committed"');
    expect(banco).toContain('.for("update")');
    const chamada = rotas.lastIndexOf("editarReproducaoAutorizada");
    const bloco = rotas.slice(rotas.lastIndexOf("update: protectedProcedure", chamada), rotas.indexOf("MAQUINAS ROUTER"));
    expect(bloco).toContain("editarReproducaoAutorizada");
    expect(bloco).toContain("excluirReproducaoAutorizada");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("femeaId");
    expect(bloco).not.toContain("semenPartidaId");
    expect(tela).toContain("trpc.reproducao.delete.useMutation");
    expect(tela).toContain("Registro removido!");
    expect(tela).not.toContain("trpc.reproducao.update");
  });

  it("o administrador e o funcionário autorizado corrigem observação sem abrir o estoque", async () => {
    const base = mundo();
    const principal = await editarReproducaoAutorizada(base.io, pedido(1, 3, 202, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [],
    }));
    expect(principal).toMatchObject({ ok: true, titularUserId: 1 });
    const funcionario = await editarReproducaoAutorizada(base.io, pedido(2, 1, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      observacoes: "conferida no curral",
      responsavel: "João",
    }));
    expect(funcionario.ok).toBe(true);
    const ia = base.registros().find((item) => item.id === 201);
    expect(unpackReproObservacoes(ia?.observacoes).semenPartidaId).toBe(500);
    expect(unpackReproObservacoes(ia?.observacoes).observacoes).toBe("conferida no curral");
    expect(base.saldo()).toBe(4);
    expect(base.saidas()).toBe(1);
  });

  it("recusa quem não pode, fazenda não concedida, outro titular e sessão trocada", async () => {
    const base = mundo();
    const semPermissao = await editarReproducaoAutorizada(base.io, pedido(3, 1, 202, {
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: [PERMISSAO_REPRO_EDITAR],
      fazendasInformadasPeloCliente: [10],
    }));
    expect(semPermissao).toMatchObject({ ok: false, mensagem: MSG_SEM_PERMISSAO_EDITAR_REPRO });
    const semExcluir = await excluirReproducaoAutorizada(base.io, pedido(3, 1, 202));
    expect(semExcluir).toMatchObject({ ok: false, mensagem: MSG_SEM_PERMISSAO_EXCLUIR_REPRO });
    const outraFazenda = await editarReproducaoAutorizada(base.io, pedido(5, 1, 202));
    expect(outraFazenda).toMatchObject({ ok: false, mensagem: MSG_SEM_FAZENDA_MANEJO });
    const outroRegistro = await editarReproducaoAutorizada(base.io, pedido(1, 3, 301, { tipo: "Diagnóstico de prenhez" }));
    expect(outroRegistro).toMatchObject({ ok: false, mensagem: MSG_REPRO_NAO_ENCONTRADO });
    const outroAnimal = await excluirReproducaoAutorizada(base.io, pedido(2, 1, 301));
    expect(outroAnimal).toMatchObject({ ok: false, mensagem: MSG_REPRO_NAO_ENCONTRADO });
    const sessao = await editarReproducaoAutorizada(base.io, pedido(1, 9, 202));
    expect(sessao.ok).toBe(false);
    if (!sessao.ok) expect(erroEditarReproducao(sessao).code).toBe("UNAUTHORIZED");
    expect(base.atualizou()).toBe(0);
    expect(base.excluiu()).toBe(0);
  });

  it("não troca matriz, partida, tipo, resultado nem a data de uma dose já aplicada", async () => {
    const base = mundo();
    const matriz = await editarReproducaoAutorizada(base.io, pedido(1, 3, 202, { femeaId: 30 }));
    expect(matriz).toMatchObject({ mensagem: MSG_REPRO_MUDAR_MATRIZ });
    const partida = await editarReproducaoAutorizada(base.io, pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      semenPartidaId: 999,
    }));
    expect(partida).toMatchObject({ mensagem: MSG_REPRO_MUDAR_PARTIDA });
    const tipo = await editarReproducaoAutorizada(base.io, pedido(1, 3, 202, { tipo: "Aborto" }));
    expect(tipo).toMatchObject({ mensagem: MSG_REPRO_EDICAO_ESTRUTURAL });
    const resultado = await editarReproducaoAutorizada(base.io, pedido(1, 3, 202, { resultado: "Prenhe" }));
    expect(resultado).toMatchObject({ mensagem: MSG_REPRO_EDICAO_ESTRUTURAL });
    const data = await editarReproducaoAutorizada(base.io, pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-12",
    }));
    expect(data).toMatchObject({ mensagem: MSG_REPRO_DATA_COM_SEMEN });
    expect(base.atualizou()).toBe(0);
    expect(base.saldo()).toBe(4);
  });

  it("apaga diagnóstico simples e segura dose, parto, estação, falha e banco fora", async () => {
    const base = mundo();
    const simples = await excluirReproducaoAutorizada(base.io, pedido(1, 3, 220));
    expect(simples).toMatchObject({ ok: true, registroId: 220 });
    expect(base.registros().some((item) => item.id === 220)).toBe(false);
    expect(base.registros().some((item) => item.id === 202)).toBe(true);
    expect(base.registros().some((item) => item.id === 201)).toBe(true);
    const dose = await excluirReproducaoAutorizada(base.io, pedido(2, 1, 201));
    expect(dose).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_DOSE });
    const parto = await excluirReproducaoAutorizada(base.io, pedido(1, 3, 207));
    expect(parto).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_PARTO });
    const estacao = await excluirReproducaoAutorizada(base.io, pedido(1, 3, 208));
    expect(estacao).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_ESTACAO });
    expect(base.saldo()).toBe(4);
    expect(base.saidas()).toBe(1);

    const quebrado = mundo({ estourar: true });
    await expect(editarReproducaoAutorizada(quebrado.io, pedido(1, 3, 202))).rejects.toThrow("falha na atualização");
    expect(quebrado.atualizou()).toBe(0);
    expect(quebrado.registros().find((item) => item.id === 202)?.observacoes).toBe("vazia");

    const fora = mundo({ falha: "conexao" });
    await expect(excluirReproducaoAutorizada(fora.io, pedido(1, 3, 202))).rejects.toBeInstanceOf(TRPCError);
    await expect(editarReproducaoAutorizada(fora.io, pedido(1, 3, 202))).rejects.toMatchObject({
      message: "Banco de dados indisponível.",
    });
    await expect(editarReproducaoAutorizada(base.io, pedido(1, 3, 202, { dataCobertura: "31/11/2026" }))).rejects.toMatchObject({
      message: MSG_REPRO_DATA_INVALIDA,
    });
  });
});
