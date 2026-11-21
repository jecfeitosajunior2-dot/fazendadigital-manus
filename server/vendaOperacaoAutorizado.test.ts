import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";
import { autorizarRotaConfirmacaoVenda } from "../shared/vendaIntegracao";
import {
  MSG_SEM_PERMISSAO_CANCELAR_VENDA,
  MSG_SEM_PERMISSAO_CONFIRMAR_VENDA,
  PERMISSAO_VENDAS_CANCELAR,
  PERMISSAO_VENDAS_CONFIRMAR,
  cancelarVendaAutorizada,
  confirmarVendaAutorizada,
  type ConsultaVendaOperacao,
  type IoVendaOperacao,
  type VendaEspiada,
} from "./vendaOperacaoAutorizado";

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

function mundo(opcoes?: { falha?: "conexao" | "deadlock"; deadlocks?: number }) {
  const usuarios = [
    usuario({ id: 1, papel: "principal", sessionVersion: 3 }),
    usuario({ id: 2, papel: "comum", titularUserId: 1, sessionVersion: 1 }),
    usuario({ id: 3, papel: "comum", titularUserId: 1, sessionVersion: 1 }),
    usuario({ id: 5, papel: "comum", titularUserId: 1, sessionVersion: 1 }),
  ];
  const permissoes = [
    { userId: 2, titularUserId: 1, permissao: PERMISSAO_VENDAS_CONFIRMAR },
    { userId: 2, titularUserId: 1, permissao: PERMISSAO_VENDAS_CANCELAR },
    { userId: 3, titularUserId: 1, permissao: "vendas.visualizar" },
    { userId: 5, titularUserId: 1, permissao: PERMISSAO_VENDAS_CONFIRMAR },
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
  const vendas: VendaEspiada[] = [
    { id: 500, userId: 1, fazendaId: 10, status: "concluido" },
    { id: 505, userId: 4, fazendaId: 40, status: "concluido" },
    { id: 509, userId: 1, fazendaId: null, status: "concluido" },
  ];
  let transacoes = 0;
  let gravou = 0;
  const consultas: ConsultaVendaOperacao = {
    async usuario(id) {
      return usuarios.find((item) => item.id === id) ?? null;
    },
    async permissoes(userId, titularUserId) {
      return permissoes
        .filter((item) => item.userId === userId && item.titularUserId === titularUserId)
        .map((item) => item.permissao);
    },
    async vinculos(userId) {
      return vinculos.filter((item) => item.userId === userId);
    },
    async fazendasDoTitular(titularUserId) {
      return fazendas.filter((item) => item.userId === titularUserId);
    },
    async fazenda(id) {
      return fazendas.find((item) => item.id === id) ?? null;
    },
    async espiarVenda(id) {
      return vendas.find((item) => item.id === id) ?? null;
    },
  };
  const io: IoVendaOperacao = {
    async emTransacao(fn) {
      transacoes += 1;
      if (opcoes?.falha === "conexao") {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      }
      if (opcoes?.falha === "deadlock" && transacoes <= (opcoes.deadlocks ?? 1)) {
        throw Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213 });
      }
      return fn(consultas);
    },
  };
  return {
    io,
    transacoes: () => transacoes,
    gravou: () => gravou,
    marcar() { gravou += 1; },
  };
}

describe("venda autorizada — decisão e contrato", () => {
  it("usa as permissões que já existem e não pede baixa de manejo", () => {
    const confirmar = permissaoPorId(PERMISSAO_VENDAS_CONFIRMAR);
    const cancelar = permissaoPorId(PERMISSAO_VENDAS_CANCELAR);
    expect(confirmar?.descricao).toMatch(/confirmar venda/i);
    expect(confirmar?.sensivel).toBe(true);
    expect(cancelar?.descricao).toMatch(/cancelar venda confirmada/i);
    expect(permissaoPorId("animais.inativar")).not.toBeNull();
    const fonte = readFileSync(join(raiz, "vendaOperacaoAutorizado.ts"), "utf8");
    expect(fonte).toContain("não exige animais.inativar");
    expect(fonte).not.toContain('PERMISSAO_VENDAS_CONFIRMAR = "animais.inativar"');
    expect(fonte).not.toContain("from \"./db\"");
    expect(fonte).not.toContain("localFallback");
  });

  it("a rota viva é a integrada; a comercial antiga continua bloqueada", () => {
    expect(autorizarRotaConfirmacaoVenda("integrada").ok).toBe(true);
    expect(autorizarRotaConfirmacaoVenda("comercial").ok).toBe(false);
    const router = readFileSync(join(raiz, "routers.ts"), "utf8");
    const vendas = router.slice(router.indexOf("const vendasRouter"));
    const confirmar = vendas.slice(
      vendas.indexOf("confirmar: protectedProcedure"),
      vendas.indexOf("cancelar: protectedProcedure"),
    );
    expect(confirmar).toContain("confirmarVendaAutorizada");
    expect(confirmar).toContain("confirmarVendaComercialSePermitida(titularUserId");
    expect(confirmar).not.toContain("confirmarVendaComercial(");
    expect(confirmar).not.toContain("idempotencyKey");
    expect(confirmar).toContain("Banco de dados indisponível.");
    const cancelar = vendas.slice(
      vendas.indexOf("cancelar: protectedProcedure"),
      vendas.indexOf("integracaoConfirmacaoAtiva"),
    );
    expect(cancelar).toContain("cancelarVendaAutorizada");
    expect(cancelar).toContain("cancelar(titularUserId");
    expect(cancelar).toContain("canceladoPorUserId: ctx.user.id");
    const integrada = vendas.slice(vendas.indexOf("confirmarIntegrada: protectedProcedure"));
    expect(integrada).toContain("confirmarVendaAutorizada");
    expect(integrada).toContain("confirmarVendaIntegradaSeAtiva");
    expect(integrada).toContain("titularUserId");
    expect(integrada).not.toContain("confirmarVendaIntegradaSeAtiva(\n        createConfirmarVendaFinanceiroMysqlStore(db),\n        ctx.user.id");
  });

  it("as telas continuam nas mesmas mutações", () => {
    const nova = readFileSync(join(raiz, "../client/src/pages/NovaVendaPage.tsx"), "utf8");
    const detalhe = readFileSync(join(raiz, "../client/src/pages/VendaDetalhePage.tsx"), "utf8");
    expect(nova).toContain("trpc.vendas.confirmar.useMutation");
    expect(nova).toContain("trpc.vendas.confirmarIntegrada.useMutation");
    expect(detalhe).toContain("trpc.vendas.cancelar.useMutation");
  });

  it("devolve o resultado da gravação e ignora a lista enviada pela tela", async () => {
    const base = mundo();
    const resultado = await confirmarVendaAutorizada(base.io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      fazendaId: 10,
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [],
    }, async (titularUserId) => {
      base.marcar();
      return { success: true as const, vendaId: 91, tituloId: 7, titularUserId };
    });
    expect(resultado).toEqual({ success: true, vendaId: 91, tituloId: 7, titularUserId: 1 });
    expect(base.gravou()).toBe(1);
  });

  it("funcionário sem permissão ou sem a fazenda não grava", async () => {
    const semPermissao = mundo();
    await expect(confirmarVendaAutorizada(semPermissao.io, {
      executorId: 3,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
      permissoesInformadasPeloCliente: [PERMISSAO_VENDAS_CONFIRMAR],
    }, async () => {
      semPermissao.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: MSG_SEM_PERMISSAO_CONFIRMAR_VENDA });
    expect(semPermissao.gravou()).toBe(0);

    const outraFazenda = mundo();
    await expect(confirmarVendaAutorizada(outraFazenda.io, {
      executorId: 5,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    }, async () => {
      outraFazenda.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: MSG_SEM_FAZENDA_MANEJO });
    expect(outraFazenda.gravou()).toBe(0);
  });

  it("sessão divergente e banco fora não gravam", async () => {
    const sessao = mundo();
    await expect(confirmarVendaAutorizada(sessao.io, {
      executorId: 1,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    }, async () => {
      sessao.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: "Sessão inválida." });
    expect(sessao.gravou()).toBe(0);

    const fora = mundo({ falha: "conexao" });
    await expect(confirmarVendaAutorizada(fora.io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      fazendaId: 10,
    }, async () => {
      fora.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: "Banco de dados indisponível." });
    expect(fora.gravou()).toBe(0);
    expect(fora.transacoes()).toBe(1);
  });

  it("deadlock refaz a autorização e grava uma vez", async () => {
    const base = mundo({ falha: "deadlock", deadlocks: 1 });
    const resultado = await confirmarVendaAutorizada(base.io, {
      executorId: 2,
      sessionVersionDaSessao: 1,
      fazendaId: 10,
    }, async (titularUserId) => {
      base.marcar();
      return { success: true as const, vendaId: 3, titularUserId };
    });
    expect(resultado.titularUserId).toBe(1);
    expect(base.gravou()).toBe(1);
    expect(base.transacoes()).toBe(2);
  });

  it("cancelamento usa o titular da venda e recusa motivo vazio, outro dono e fazenda vazia", async () => {
    const vazio = mundo();
    await expect(cancelarVendaAutorizada(vazio.io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      vendaId: 500,
      motivo: "   ",
    }, async () => {
      vazio.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: "Informe o motivo do cancelamento." });
    expect(vazio.transacoes()).toBe(0);

    const ok = mundo();
    const resultado = await cancelarVendaAutorizada(ok.io, {
      executorId: 2,
      sessionVersionDaSessao: 1,
      vendaId: 500,
      motivo: "Cliente desistiu",
      titularInformadoPeloCliente: 4,
    }, async (titularUserId) => ({ success: true as const, titularUserId }));
    expect(resultado.titularUserId).toBe(1);

    const alheia = mundo();
    await expect(cancelarVendaAutorizada(alheia.io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      vendaId: 505,
      motivo: "Não é minha",
    }, async () => {
      alheia.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: "Venda não encontrada." });
    expect(alheia.gravou()).toBe(0);

    const semFazenda = mundo();
    await expect(cancelarVendaAutorizada(semFazenda.io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      vendaId: 509,
      motivo: "Sem fazenda",
    }, async () => {
      semFazenda.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: "Venda não encontrada." });
    expect(semFazenda.gravou()).toBe(0);

    const semPermissao = mundo();
    await expect(cancelarVendaAutorizada(semPermissao.io, {
      executorId: 3,
      sessionVersionDaSessao: 1,
      vendaId: 500,
      motivo: "Queria cancelar",
      permissoesInformadasPeloCliente: [PERMISSAO_VENDAS_CANCELAR],
    }, async () => {
      semPermissao.marcar();
      return { success: true };
    })).rejects.toMatchObject({ message: MSG_SEM_PERMISSAO_CANCELAR_VENDA });
    expect(semPermissao.gravou()).toBe(0);
  });
});
