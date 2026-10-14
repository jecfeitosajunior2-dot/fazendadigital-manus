import { describe, expect, it } from "vitest";
import {
  confirmarFazendaDoUsuario,
  decidirFazendaPersistenciaOs,
  deveExibirNomeHistoricoPrestador,
  fazendaIdOficial,
  identificarFazendaMaquina,
  lerPrestadorPessoaId,
  MSG_MANUT_FAZENDA_ACESSO,
  MSG_MANUT_FAZENDA_MAQUINA_ESTOQUE,
  MSG_MANUT_FAZENDA_MAQUINA_INVALIDA,
  MSG_MANUT_MAQUINA_NAO_ENCONTRADA,
  MSG_MANUT_PRESTADOR_INATIVO,
  MSG_MANUT_PRESTADOR_INVALIDO,
  MSG_MANUT_PRESTADOR_TIPO,
  prestadorPessoaIdDoPayload,
  resolverPrestadorPessoaIdPersistido,
  validarPrestadorPessoaParaOs,
} from "./manutencaoIdentificacaoOperacional";

const userA = 910001;
const userB = 910002;

const fornecedorAtivo = {
  id: 7,
  userId: userA,
  tipo: "fornecedor" as const,
  ativo: true,
};

describe("fornecedor oficial da OS", () => {
  it("aceita fornecedor válido e ativo do usuário", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: "externa",
      prestadorPessoaId: 7,
      pessoa: fornecedorAtivo,
    });
    expect(r).toEqual({ ok: true, prestadorPessoaId: 7 });
  });

  it("recusa fornecedor inexistente", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: "externa",
      prestadorPessoaId: 99,
      pessoa: null,
    });
    expect(r).toEqual({ ok: false, message: MSG_MANUT_PRESTADOR_INVALIDO });
  });

  it("recusa fornecedor inativo", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: "externa",
      prestadorPessoaId: 7,
      pessoa: { ...fornecedorAtivo, ativo: false },
    });
    expect(r).toEqual({ ok: false, message: MSG_MANUT_PRESTADOR_INATIVO });
  });

  it("recusa fornecedor de outro usuário sem revelar o cadastro", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: "externa",
      prestadorPessoaId: 7,
      pessoa: { ...fornecedorAtivo, userId: userB },
    });
    expect(r).toEqual({ ok: false, message: MSG_MANUT_PRESTADOR_INVALIDO });
  });

  it("dois fornecedores com o mesmo nome: grava só o id escolhido", () => {
    const homonimos = [
      { id: 7, nome: "Oficina Central" },
      { id: 8, nome: "Oficina Central" },
    ];
    expect(resolverPrestadorPessoaIdPersistido({
      prestadorPessoaId: 8,
      prestadorNome: "Oficina Central",
      candidatos: homonimos,
    })).toBe(8);
    expect(resolverPrestadorPessoaIdPersistido({
      prestadorNome: "Oficina Central",
      candidatos: homonimos,
    })).toBeNull();
  });

  it("manutenção interna não grava pessoaId de fornecedor", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: "interna",
      prestadorPessoaId: 7,
      pessoa: fornecedorAtivo,
    });
    expect(r).toEqual({ ok: true, prestadorPessoaId: null });
    expect(prestadorPessoaIdDoPayload({ tipoExecucao: "interna", fornecedorId: 7 })).toBeNull();
  });

  it("recusa funcionário no lugar do fornecedor", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: "externa",
      prestadorPessoaId: 7,
      pessoa: { ...fornecedorAtivo, tipo: "funcionario" },
    });
    expect(r).toEqual({ ok: false, message: MSG_MANUT_PRESTADOR_TIPO });
  });
});

describe("fazenda oficial da máquina", () => {
  it("máquina com fazenda válida do usuário", () => {
    const maquina = identificarFazendaMaquina({
      userId: userA,
      maquina: { id: 4, userId: userA, fazendaId: 12 },
    });
    expect(maquina).toEqual({ ok: true, fazendaId: 12 });
    const fazenda = confirmarFazendaDoUsuario({
      userId: userA,
      fazendaId: 12,
      fazenda: { id: 12, userId: userA },
    });
    expect(fazenda).toEqual({ ok: true, fazendaId: 12 });
  });

  it("máquina sem fazenda válida (0, vazio ou ausente)", () => {
    expect(fazendaIdOficial(0)).toBeNull();
    expect(fazendaIdOficial(null)).toBeNull();
    expect(identificarFazendaMaquina({
      userId: userA,
      maquina: { id: 4, userId: userA, fazendaId: 0 },
    })).toEqual({
      ok: false,
      motivo: "fazenda_invalida",
      message: MSG_MANUT_FAZENDA_MAQUINA_INVALIDA,
    });
    expect(identificarFazendaMaquina({
      userId: userA,
      maquina: { id: 4, userId: userA, fazendaId: null },
    }).ok).toBe(false);
  });

  it("máquina de outro usuário não entrega fazenda", () => {
    expect(identificarFazendaMaquina({
      userId: userA,
      maquina: { id: 4, userId: userB, fazendaId: 12 },
    })).toEqual({
      ok: false,
      motivo: "maquina_outro_usuario",
      message: MSG_MANUT_MAQUINA_NAO_ENCONTRADA,
    });
  });

  it("fazenda de outro usuário não é aceita", () => {
    expect(confirmarFazendaDoUsuario({
      userId: userA,
      fazendaId: 12,
      fazenda: { id: 12, userId: userB },
    })).toEqual({
      ok: false,
      motivo: "fazenda_acesso",
      message: MSG_MANUT_FAZENDA_ACESSO,
    });
  });
});

describe("persistência por tipo de peça — fazenda nunca vira 0", () => {
  const fazendaOk = identificarFazendaMaquina({
    userId: userA,
    maquina: { id: 4, userId: userA, fazendaId: 12 },
  });
  const semFazenda = identificarFazendaMaquina({
    userId: userA,
    maquina: { id: 4, userId: userA, fazendaId: 0 },
  });

  it("manutenção só com peças da oficina usa a fazenda da máquina, sem 0", () => {
    const r = decidirFazendaPersistenciaOs({
      temPecasEstoque: false,
      identificacao: fazendaOk,
    });
    expect(r).toEqual({ ok: true, fazendaId: 12, financeiraPronta: true });
  });

  it("manutenção com peças do estoque exige fazenda oficial", () => {
    const ok = decidirFazendaPersistenciaOs({
      temPecasEstoque: true,
      identificacao: fazendaOk,
    });
    expect(ok).toEqual({ ok: true, fazendaId: 12, financeiraPronta: true });
    const bloqueio = decidirFazendaPersistenciaOs({
      temPecasEstoque: true,
      identificacao: semFazenda,
    });
    expect(bloqueio).toEqual({ ok: false, message: MSG_MANUT_FAZENDA_MAQUINA_ESTOQUE });
  });

  it("manutenção mista segue a mesma regra do estoque", () => {
    const r = decidirFazendaPersistenciaOs({
      temPecasEstoque: true,
      identificacao: fazendaOk,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fazendaId).toBe(12);
  });

  it("oficina sem fazenda na máquina não inventa 0 e não bloqueia a OS", () => {
    const r = decidirFazendaPersistenciaOs({
      temPecasEstoque: false,
      identificacao: semFazenda,
    });
    expect(r).toEqual({ ok: true, fazendaId: null, financeiraPronta: false });
  });
});

describe("compatibilidade com OS antigas", () => {
  it("OS sem pessoaId permanece sem vínculo automático, mesmo com nome igual", () => {
    expect(resolverPrestadorPessoaIdPersistido({
      prestadorPessoaId: null,
      prestadorNome: "Oficina Central",
      candidatos: [{ id: 7, nome: "Oficina Central" }],
    })).toBeNull();
    expect(lerPrestadorPessoaId(undefined)).toBeNull();
    expect(deveExibirNomeHistoricoPrestador({
      tipoExecucao: "externa",
      prestadorPessoaId: null,
      prestadorNome: "Oficina Central",
    })).toBe(true);
  });

  it("OS antiga sem tipo de execução não exige fornecedor", () => {
    const r = validarPrestadorPessoaParaOs({
      userId: userA,
      tipoExecucao: null,
      prestadorPessoaId: null,
      pessoa: null,
    });
    expect(r).toEqual({ ok: true, prestadorPessoaId: null });
  });
});
