import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import type { FazendaConhecida } from "./acessoFazendas";
import { CATALOGO_PERMISSOES } from "./catalogoPermissoes";
import { autorizarOperacao, CONTRATO_REVALIDACAO_OPERACIONAL, type EntradaOperacional } from "./contextoOperacional";

const FAZENDA_NORTE: FazendaConhecida = { id: 10, userId: 1 };
const FAZENDA_SUL: FazendaConhecida = { id: 20, userId: 1 };
const FAZENDA_ALHEIA: FazendaConhecida = { id: 30, userId: 9 };
const FAZENDAS = [FAZENDA_NORTE, FAZENDA_SUL];

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel">): IdentidadeUsuario {
  return {
    openId: `pessoa-${parcial.id}`,
    name: `Pessoa ${parcial.id}`,
    email: `pessoa-${parcial.id}@teste.isolado`,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: 1,
    situacao: "ativo",
    sessionVersion: 0,
    ...parcial,
  };
}

const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1 });
const secundario = pessoa({ id: 3, papel: "secundario", role: "user" });
const comum = pessoa({ id: 2, papel: "comum" });

function entrada(parcial: Partial<EntradaOperacional> & Pick<EntradaOperacional, "identidade" | "permissaoId">): EntradaOperacional {
  return {
    permissoes: [],
    fazendasDoTitular: FAZENDAS,
    vinculos: [],
    fazendaId: 10,
    fazenda: FAZENDA_NORTE,
    titularInformadoPeloCliente: 9,
    papelInformadoPeloCliente: "principal",
    permissoesInformadasPeloCliente: CATALOGO_PERMISSOES.map((item) => item.id),
    fazendasInformadasPeloCliente: [10, 20, 30],
    ...parcial,
  };
}

describe("contexto operacional", () => {
  it("autoriza o principal ativo na fazenda da própria conta", () => {
    const resultado = autorizarOperacao(entrada({ identidade: principal, permissaoId: "animais.criar" }));
    expect(resultado).toEqual({
      ok: true,
      contexto: {
        executorUserId: 1,
        titularUserId: 1,
        papel: "principal",
        fazendaId: 10,
        permissao: "animais.criar",
      },
    });
  });

  it("recusa o principal na fazenda de outra conta", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: principal,
      permissaoId: "animais.visualizar",
      fazendaId: 30,
      fazenda: FAZENDA_ALHEIA,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "outro_titular" });
  });

  it("autoriza o secundário com a permissão e a fazenda concedidas", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "pesagens.criar",
      permissoes: ["pesagens.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    }));
    expect(resultado).toEqual({
      ok: true,
      contexto: {
        executorUserId: 3,
        titularUserId: 1,
        papel: "secundario",
        fazendaId: 10,
        permissao: "pesagens.criar",
      },
    });
  });

  it("recusa o secundário sem a permissão pedida", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "animais.criar",
      permissoes: ["usuarios.criar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("recusa o secundário sem acesso à fazenda", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "animais.visualizar",
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      fazendaId: 20,
      fazenda: FAZENDA_SUL,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_fazenda" });
  });

  it("autoriza o comum com a permissão e a fazenda concedidas", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "pesagens.criar",
      permissoes: ["pesagens.criar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.contexto.papel).toBe("comum");
  });

  it("recusa o comum sem a permissão", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "vendas.confirmar",
      permissoes: ["vendas.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("recusa o comum em operação administrativa", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "usuarios.criar",
      permissoes: ["usuarios.criar"],
      fazendaId: null,
      fazenda: null,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("recusa usuário inativo", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: pessoa({ id: 2, papel: "comum", situacao: "inativo" }),
      permissaoId: "animais.visualizar",
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("recusa usuário convidado", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: pessoa({ id: 2, papel: "comum", situacao: "convidado" }),
      permissaoId: "animais.visualizar",
      permissoes: ["animais.visualizar"],
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("recusa usuário inexistente", () => {
    const resultado = autorizarOperacao(entrada({ identidade: null, permissaoId: "animais.visualizar" }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("recusa fazenda inexistente", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: principal,
      permissaoId: "animais.visualizar",
      fazendaId: 99,
      fazenda: null,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_inexistente" });
  });

  it("recusa fazenda de outra conta sem descrever a fazenda", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "estoque.criar",
      permissoes: ["estoque.criar"],
      vinculos: [{ userId: 3, fazendaId: 30 }],
      fazendaId: 30,
      fazenda: FAZENDA_ALHEIA,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "outro_titular" });
    expect(JSON.stringify(resultado)).not.toContain("Pasto");
    expect(JSON.stringify(resultado)).not.toContain("nome");
  });

  it("autoriza operação que não exige fazenda", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: principal,
      permissaoId: "usuarios.criar",
      fazendaId: null,
      fazenda: null,
    }));
    expect(resultado).toEqual({
      ok: true,
      contexto: {
        executorUserId: 1,
        titularUserId: 1,
        papel: "principal",
        permissao: "usuarios.criar",
      },
    });
  });

  it("recusa operação com fazenda obrigatória sem identificador", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: principal,
      permissaoId: "vendas.confirmar",
      fazendaId: null,
      fazenda: null,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_ausente" });
  });

  it("recusa permissão fora do catálogo", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: principal,
      permissaoId: "animais.destruir",
    }));
    expect(resultado).toEqual({ ok: false, motivo: "permissao_invalida" });
  });

  it("resolve o titular pela identidade do servidor", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: { ...principal, titularUserId: 1 },
      permissaoId: "lotes.visualizar",
      titularInformadoPeloCliente: 9,
    }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.contexto.titularUserId).toBe(1);
  });

  it("preserva o executor separado do titular", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "animais.visualizar",
      permissoes: ["animais.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.contexto.executorUserId).toBe(3);
    expect(resultado.contexto.titularUserId).toBe(1);
    expect(resultado.contexto.executorUserId).not.toBe(resultado.contexto.titularUserId);
  });

  it("ignora titularidade forjada pelo cliente", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: principal,
      permissaoId: "animais.visualizar",
      titularInformadoPeloCliente: 9,
      fazendasInformadasPeloCliente: [30],
    }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.contexto.titularUserId).toBe(1);
      expect(resultado.contexto.fazendaId).toBe(10);
    }
  });

  it("ignora papel forjado pelo cliente", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "animais.criar",
      permissoes: [],
      papelInformadoPeloCliente: "principal",
      vinculos: [{ userId: 2, fazendaId: 10 }],
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("ignora permissão forjada pelo cliente", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "estoque.estornar",
      permissoes: [],
      permissoesInformadasPeloCliente: ["estoque.estornar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    }));
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("recusa permissão que já não está na lista efetiva", () => {
    const concedida = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "vendas.cancelar",
      permissoes: ["vendas.cancelar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    }));
    const revogada = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "vendas.cancelar",
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    }));
    expect(concedida.ok).toBe(true);
    expect(revogada).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("recusa fazenda que já não está no acesso do executor", () => {
    const concedida = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "manutencoes.estornar",
      permissoes: ["manutencoes.estornar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    }));
    const revogada = autorizarOperacao(entrada({
      identidade: comum,
      permissaoId: "manutencoes.estornar",
      permissoes: ["manutencoes.estornar"],
      vinculos: [],
    }));
    expect(concedida.ok).toBe(true);
    expect(revogada).toEqual({ ok: false, motivo: "sem_fazenda" });
  });

  it("mantém a auditoria histórica fechada para o secundário", () => {
    const resultado = autorizarOperacao(entrada({
      identidade: secundario,
      permissaoId: "auditoria.visualizar",
      permissoes: ["auditoria.visualizar"],
      fazendaId: null,
      fazenda: null,
    }));
    expect(resultado).toEqual({ ok: false, motivo: "AUDITORIA_HISTORICA_INDISPONIVEL" });
  });

  it("deixa registrado que a checagem anterior à transação não basta", () => {
    expect(CONTRATO_REVALIDACAO_OPERACIONAL.consultaAnteriorNaoEliminaCorrida).toBe(true);
    expect(CONTRATO_REVALIDACAO_OPERACIONAL.revalidarDentroDaTransacao).toBe(true);
    expect(CONTRATO_REVALIDACAO_OPERACIONAL.ordemDeBloqueio[0]).toBe("users do executor");
  });

  it("não liga esta camada às rotas nem ao banco operacional", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fonte = readFileSync(resolve(here, "contextoOperacional.ts"), "utf8");
    const banco = readFileSync(resolve(here, "contextoOperacionalDb.ts"), "utf8");
    expect(fonte).not.toContain("routers");
    expect(fonte).not.toContain("fazenda_digital");
    expect(banco).not.toContain("from \"./db\"");
    expect(banco).not.toContain("DATABASE_URL");
    expect(banco).not.toContain("auditoria_eventos");
    expect(CATALOGO_PERMISSOES).toHaveLength(92);
  });
});
