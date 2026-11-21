import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  MSG_SEM_PERMISSAO_VER_VENDAS,
  fazendasDaConsultaVenda,
  recusarVendaSemMysql,
  vendaVisivelNoEscopo,
} from "./consultaVendaAutorizada";
import { excluirRascunhoVenda, type TxExcluirVenda } from "./excluirVendaAutorizada";

const here = dirname(fileURLToPath(import.meta.url));

function ler(nome: string) {
  return readFileSync(resolve(here, nome), "utf8").replace(/\r\n/g, "\n");
}

function fatia(texto: string, inicio: string, fim: string) {
  const de = texto.indexOf(inicio);
  const ate = texto.indexOf(fim, de + inicio.length);
  return texto.slice(de, ate);
}

function usuario(parcial: Partial<LinhaUsuarioCadastro> & Pick<LinhaUsuarioCadastro, "id" | "papel">): LinhaUsuarioCadastro {
  return {
    openId: `u-${parcial.id}`,
    name: "Pessoa",
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: parcial.titularUserId ?? 1,
    situacao: "ativo",
    sessionVersion: 1,
    ...parcial,
  };
}

function mundo(opcoes?: { pausa?: () => Promise<void> }) {
  const pessoas = new Map<number, LinhaUsuarioCadastro>([
    [1, usuario({ id: 1, papel: "principal", titularUserId: 1, sessionVersion: 3 })],
    [2, usuario({ id: 2, papel: "comum", titularUserId: 1 })],
    [3, usuario({ id: 3, papel: "comum", titularUserId: 1 })],
    [4, usuario({ id: 4, papel: "principal", titularUserId: 4, sessionVersion: 1 })],
  ]);
  const fazendas = [
    { id: 10, userId: 1 },
    { id: 20, userId: 1 },
    { id: 40, userId: 4 },
  ];
  const vinculos = [
    { userId: 2, fazendaId: 10 },
    { userId: 3, fazendaId: 10 },
  ];
  const permissoes = [
    { userId: 2, permissao: "vendas.visualizar" },
    { userId: 2, permissao: "vendas.inativar" },
    { userId: 3, permissao: "vendas.visualizar" },
  ];
  const vendas = [
    { id: 1, userId: 1, fazendaId: 10 as number | null, status: "pendente" },
    { id: 2, userId: 1, fazendaId: 10 as number | null, status: "concluido" },
    { id: 3, userId: 1, fazendaId: 20 as number | null, status: "pendente" },
    { id: 4, userId: 1, fazendaId: null, status: "pendente" },
    { id: 5, userId: 4, fazendaId: 40 as number | null, status: "pendente" },
    { id: 6, userId: 1, fazendaId: 10 as number | null, status: "pendente" },
  ];
  const itens = new Set([6]);
  const titulos = new Set<number>();
  const concedidas = vinculos;

  function tx(): TxExcluirVenda {
    return {
      async usuario(id) {
        if (opcoes?.pausa) await opcoes.pausa();
        return pessoas.get(id) ?? null;
      },
      async permissoes(userId) {
        return permissoes.filter((item) => item.userId === userId).map((item) => item.permissao);
      },
      async vinculos(userId) {
        return concedidas.filter((item) => item.userId === userId);
      },
      async fazendasDoTitular(titularUserId) {
        return fazendas.filter((item) => item.userId === titularUserId);
      },
      async fazenda(id) {
        return fazendas.find((item) => item.id === id) ?? null;
      },
      async espiarVenda(id) {
        const venda = vendas.find((item) => item.id === id);
        return venda ? { userId: venda.userId, fazendaId: venda.fazendaId } : null;
      },
      async travarVenda(id, titularUserId) {
        return vendas.find((item) => item.id === id && item.userId === titularUserId) ?? null;
      },
      async temItem(_titular, vendaId) {
        return itens.has(vendaId);
      },
      async temTitulo(_titular, vendaId) {
        return titulos.has(vendaId);
      },
      async apagarRascunho(id, titularUserId) {
        const indice = vendas.findIndex((item) => (
          item.id === id && item.userId === titularUserId && item.status === "pendente"
        ));
        if (indice < 0) return 0;
        vendas.splice(indice, 1);
        return 1;
      },
    };
  }

  return {
    pessoas,
    vendas,
    concedidas,
    io: {
      emTransacao: async <T>(fn: (tx: TxExcluirVenda) => Promise<T>) => fn(tx()),
    },
    consulta(executorId: number, sessionVersion: number | null = 1) {
      return fazendasDaConsultaVenda({
        emTransacao: async (fn) => fn(tx()),
      }, { executorId, sessionVersionDaSessao: sessionVersion });
    },
  };
}

describe("vendas homologação multiusuário", () => {
  const routers = ler("routers.ts");
  const vendas = fatia(routers, "const vendasRouter = router({", "const fazendaFields = {");
  const confirmar = fatia(vendas, "confirmar:", "cancelar:");
  const integrada = fatia(vendas, "confirmarIntegrada:", "documentosAnexar:");
  const create = fatia(vendas, "create:", "delete:");
  const excluir = fatia(vendas, "delete:", "});");

  it("as doze rotas continuam no roteador de vendas", () => {
    for (const nome of [
      "list:", "get:", "porAnimal:", "confirmar:", "cancelar:",
      "integracaoConfirmacaoAtiva:", "estadoConfirmacaoVenda:", "confirmarIntegrada:",
      "documentosAnexar:", "documentosExcluir:", "create:", "delete:",
    ]) {
      expect(vendas).toContain(nome);
    }
  });

  it("consultas usam o titular e a fazenda da venda", () => {
    expect(vendas).toContain("fazendasDaConsultaVendaNoBanco");
    expect(vendas).toContain("eq(vendas.userId, acesso.titularUserId)");
    expect(vendas).toContain("vendaVisivelNoEscopo");
    expect(vendas).not.toContain("eq(vendas.userId, ctx.user.id)");
    expect(vendas).not.toContain("eq(vendaItens.userId, ctx.user.id)");
    expect(fatia(vendas, "porAnimal:", "confirmar:")).not.toContain("animais.fazendaId");
  });

  it("cadastro antigo sem fazenda não grava", () => {
    expect(create).toContain("MSG_CADASTRO_VENDA_SEM_FAZENDA");
    expect(create).not.toContain("db.insert");
  });

  it("a exclusão do rascunho entra numa função só", () => {
    expect(excluir).toContain("excluirRascunhoVendaAutorizado(");
    expect(excluir).not.toContain("db.delete");
    expect(excluir).not.toContain(".select(");
    const corpo = ler("excluirVendaAutorizada.ts");
    const inicio = corpo.indexOf("return io.emTransacao");
    const fim = corpo.indexOf("afetadas !== 1");
    const bloco = corpo.slice(inicio, fim);
    expect(bloco).toContain("travarVenda");
    expect(bloco).toContain("temItem");
    expect(bloco).toContain("temTitulo");
    expect(bloco).toContain("apagarRascunho");
  });

  it("confirmação e cancelamento continuam com o titular da conta", () => {
    expect(confirmar).toContain("confirmarVendaAutorizada");
    expect(confirmar).toContain("confirmarVendaComercialSePermitida(titularUserId");
    expect(confirmar).toContain("fazendaJaAutorizada: true");
    expect(confirmar).not.toContain("confirmarVendaComercial(");
    expect(vendas).toContain("cancelarVendaAutorizada");
    expect(integrada).toContain("confirmarVendaIntegradaSeAtiva");
    expect(integrada).toContain("titularUserId");
    expect(integrada).not.toContain("confirmarVendaIntegradaSeAtiva(\n          createConfirmarVendaFinanceiroMysqlStore(db),\n          ctx.user.id");
  });

  it("documento e download reconfiram a sessão no banco", () => {
    expect(vendas).toContain("sessionVersionDaSessao: ctx.user.sessionVersion ?? null");
    expect(ler("vendaDocumentosHttp.ts")).toContain(
      "carregarArquivo(user.id, documentoId, user.sessionVersion ?? null)",
    );
  });

  it("o roteador de vendas não devolve sucesso pelo arquivo local", () => {
    expect(vendas).not.toContain("localFallback");
    expect(vendas).not.toContain("withDbFallback");
    expect(vendas).not.toContain("buildLocal");
    expect(vendas).not.toContain("getLocal");
    expect(vendas).toContain("recusarVendaSemMysql");
    expect(ler("confirmarVenda.ts")).toContain("if (!opcoes?.fazendaJaAutorizada)");
  });

  it("a fazenda gravada na venda decide a consulta, não o pasto atual do animal", () => {
    const principal = { titularUserId: 1, fazendaIds: [10], papel: "principal" };
    const curral = { titularUserId: 1, fazendaIds: [10], papel: "comum" };
    const retiro = { titularUserId: 1, fazendaIds: [20], papel: "comum" };
    expect(vendaVisivelNoEscopo(10, curral)).toBe(true);
    expect(vendaVisivelNoEscopo(20, curral)).toBe(false);
    expect(vendaVisivelNoEscopo(null, curral)).toBe(false);
    expect(vendaVisivelNoEscopo(null, principal)).toBe(true);
    expect(vendaVisivelNoEscopo(10, retiro)).toBe(false);
  });

  it("funcionário vê as fazendas concedidas e não a conta vizinha", async () => {
    const base = mundo();
    const funcionario = await base.consulta(2);
    expect(funcionario).toMatchObject({ ok: true, titularUserId: 1, fazendaIds: [10], papel: "comum" });
    const principal = await base.consulta(1, 3);
    expect(principal).toMatchObject({ ok: true, titularUserId: 1, fazendaIds: [10, 20] });
    const outra = await base.consulta(4);
    expect(outra).toMatchObject({ ok: true, titularUserId: 4, fazendaIds: [40] });
  });

  it("sessão trocada recusa e fazenda revogada deixa a lista vazia", async () => {
    const base = mundo();
    base.pessoas.get(2)!.sessionVersion = 9;
    await expect(base.consulta(2, 1)).resolves.toMatchObject({ ok: false, motivo: "sem_identidade" });
    base.pessoas.get(2)!.sessionVersion = 1;
    base.concedidas.splice(0, base.concedidas.length);
    const semFazenda = await base.consulta(2);
    expect(semFazenda).toMatchObject({ ok: true, titularUserId: 1, fazendaIds: [] });
    if (semFazenda.ok) {
      const visiveis = base.vendas.filter((venda) => (
        venda.userId === semFazenda.titularUserId
        && venda.fazendaId != null
        && semFazenda.fazendaIds.includes(venda.fazendaId)
      ));
      expect(visiveis).toEqual([]);
    }
  });

  it("quem não pode consultar recebe a recusa da venda", async () => {
    const base = mundo();
    base.pessoas.set(3, usuario({ id: 3, papel: "comum", titularUserId: 1 }));
    const recusa = await fazendasDaConsultaVenda({
      emTransacao: async (fn) => fn({
        usuario: async (id) => (id === 3 ? base.pessoas.get(3)! : null),
        permissoes: async () => [],
        vinculos: async () => [{ userId: 3, fazendaId: 10 }],
        fazendasDoTitular: async () => [{ id: 10, userId: 1 }],
        fazenda: async (id) => (id === 10 ? { id: 10, userId: 1 } : null),
      }),
    }, { executorId: 3, sessionVersionDaSessao: 1 });
    expect(recusa).toMatchObject({ ok: false, motivo: "sem_permissao", mensagem: MSG_SEM_PERMISSAO_VER_VENDAS });
  });

  it("rascunho vazio sai; venda com efeito permanece", async () => {
    const base = mundo();
    await expect(excluirRascunhoVenda(base.io, 2, 1, 1)).resolves.toEqual({ success: true });
    expect(base.vendas.some((venda) => venda.id === 1)).toBe(false);
    await expect(excluirRascunhoVenda(base.io, 2, 1, 2)).rejects.toMatchObject({
      message: "Esta venda já tem animais, título ou status comercial. Nada foi apagado.",
    });
    await expect(excluirRascunhoVenda(base.io, 2, 1, 6)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(excluirRascunhoVenda(base.io, 2, 1, 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(excluirRascunhoVenda(base.io, 2, 1, 4)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(base.vendas.map((venda) => venda.id)).toEqual([2, 3, 4, 5, 6]);
  });

  it("banco indisponível não consulta venda no arquivo", () => {
    expect(() => recusarVendaSemMysql()).toThrow(
      "O banco de dados está indisponível. Nenhuma venda foi consultada ou alterada.",
    );
  });
});
