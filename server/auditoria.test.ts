import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { collectDatabaseSchemaRequirements } from "./databaseSchemaRequirements";
import {
  consultarAuditoria,
  prepararEvento,
  sanitizarAuditoria,
  serializarDados,
  type EventoAuditoria,
  type LinhaAuditoria,
} from "./auditoria";
import {
  concederAcessoComAuditoria,
  concluirTransacao,
  type GravacaoConcessao,
  type VinculoFazendaNovo,
} from "./auditoriaTransacao";

const here = dirname(fileURLToPath(import.meta.url));
const FAZENDA_J = 10;
const FAZENDA_B = 20;

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel">): IdentidadeUsuario {
  return {
    openId: `pessoa-${parcial.id}`,
    name: `Pessoa ${parcial.id}`,
    email: `pessoa-${parcial.id}@isolado.local`,
    role: parcial.papel === "comum" ? "user" : "admin",
    titularUserId: 1,
    situacao: "ativo",
    sessionVersion: 0,
    ...parcial,
  };
}

function evento(parcial: Partial<EventoAuditoria> & Pick<EventoAuditoria, "id" | "criadoEm">): EventoAuditoria {
  return {
    executorUserId: 1,
    executorNome: "Pessoa 1",
    titularUserId: 1,
    fazendaId: FAZENDA_J,
    modulo: "rebanho",
    operacao: "registrar",
    registroTipo: "animal",
    registroId: 100,
    dadosAnteriores: null,
    dadosPosteriores: { brinco: "J1" },
    ...parcial,
  };
}

function transacao(opcoes?: { falharVinculo?: boolean; falharEvento?: boolean }) {
  const aberto = { vinculos: [] as VinculoFazendaNovo[], eventos: [] as LinhaAuditoria[] };
  const publicado = { vinculos: [] as VinculoFazendaNovo[], eventos: [] as LinhaAuditoria[] };
  let chamadasEvento = 0;
  const tx: GravacaoConcessao & { commit(): Promise<void>; rollback(): Promise<void> } = {
    async inserirVinculo(vinculo) {
      if (opcoes?.falharVinculo) throw new Error("concessao falhou");
      aberto.vinculos.push(vinculo);
    },
    async inserirEvento(linha) {
      chamadasEvento += 1;
      if (opcoes?.falharEvento) throw new Error("auditoria falhou");
      aberto.eventos.push(linha);
    },
    async commit() {
      publicado.vinculos = [...aberto.vinculos];
      publicado.eventos = [...aberto.eventos];
    },
    async rollback() {
      aberto.vinculos = [];
      aberto.eventos = [];
    },
  };
  return { tx, publicado, chamadasEvento: () => chamadasEvento };
}

describe("auditoria de atividades", () => {
  it("registra evento válido com executor, titular e fazenda da identidade", async () => {
    const memoria = transacao();
    const linha = await concluirTransacao(memoria.tx, () => concederAcessoComAuditoria(
      memoria.tx,
      pessoa({ id: 2, papel: "comum", name: "Funcionário J" }),
      {
        userId: 2,
        fazendaId: FAZENDA_J,
        modulo: "administrativo",
        operacao: "conceder_acesso_fazenda",
        registroTipo: "usuario_fazendas",
        executorUserId: 99,
        titularUserId: 77,
        executorNome: "Nome enviado pelo navegador",
        criadoEm: "1999-01-01T00:00:00.000Z",
        dadosPosteriores: { userId: 2, fazendaId: FAZENDA_J, senha: "nao-gravar" },
      },
    ));
    expect(linha.executorUserId).toBe(2);
    expect(linha.executorNome).toBe("Funcionário J");
    expect(linha.titularUserId).toBe(1);
    expect(linha.fazendaId).toBe(FAZENDA_J);
    expect(linha.dadosPosteriores).toEqual({ userId: 2, fazendaId: FAZENDA_J });
    expect(JSON.stringify(linha)).not.toContain("nao-gravar");
    expect(memoria.publicado.vinculos).toEqual([{ userId: 2, fazendaId: FAZENDA_J, concedidoPorUserId: 2 }]);
    expect(memoria.publicado.eventos).toHaveLength(1);
  });

  it("aceita evento administrativo sem fazenda", () => {
    const linha = prepararEvento(pessoa({ id: 1, papel: "principal", titularUserId: 1 }), {
      modulo: "administrativo",
      operacao: "consultar_historico",
      fazendaId: null,
    });
    expect(linha?.fazendaId).toBeNull();
    expect(linha?.titularUserId).toBe(1);
    expect(linha?.executorUserId).toBe(1);
  });

  it("remove segredos em objeto, lista e nomes alternativos", () => {
    const limpo = sanitizarAuditoria({
      nome: "Pessoa fictícia",
      senha: "nao-gravar",
      passwordHash: "nao-gravar",
      refresh_token: "nao-gravar",
      cookie: "nao-gravar",
      api_key: "nao-gravar",
      usuario: { email: "a@isolado.local", Password: "nao-gravar", clientSecret: "nao-gravar" },
      itens: [{ quantidade: 2, accessToken: "nao-gravar" }, { credentials: { chave: "nao-gravar" }, brinco: "J1" }],
    });
    expect(limpo).toEqual({
      nome: "Pessoa fictícia",
      usuario: { email: "a@isolado.local" },
      itens: [{ quantidade: 2 }, { brinco: "J1" }],
    });
    expect(serializarDados(limpo)).not.toContain("nao-gravar");
  });

  it("desfaz a concessão quando a auditoria falha", async () => {
    const memoria = transacao({ falharEvento: true });
    await expect(concluirTransacao(memoria.tx, () => concederAcessoComAuditoria(
      memoria.tx,
      pessoa({ id: 1, papel: "principal" }),
      { userId: 2, fazendaId: FAZENDA_J },
    ))).rejects.toThrow("auditoria falhou");
    expect(memoria.publicado.vinculos).toEqual([]);
    expect(memoria.publicado.eventos).toEqual([]);
  });

  it("não grava evento quando a concessão falha", async () => {
    const memoria = transacao({ falharVinculo: true });
    await expect(concluirTransacao(memoria.tx, () => concederAcessoComAuditoria(
      memoria.tx,
      pessoa({ id: 1, papel: "principal" }),
      { userId: 2, fazendaId: FAZENDA_J },
    ))).rejects.toThrow("concessao falhou");
    expect(memoria.chamadasEvento()).toBe(0);
    expect(memoria.publicado.eventos).toEqual([]);
    expect(memoria.publicado.vinculos).toEqual([]);
  });

  it("mantém o histórico quando o executor é inativado", () => {
    const antigo = evento({
      id: 5,
      criadoEm: "2026-11-04T12:00:00.000Z",
      executorUserId: 2,
      executorNome: "Funcionário J",
    });
    const consulta = consultarAuditoria(
      [antigo],
      { titularUserId: 1, papel: "principal", fazendasAutorizadas: [FAZENDA_J, FAZENDA_B] },
    );
    expect(consulta.itens).toEqual([antigo]);
    expect(prepararEvento(pessoa({ id: 2, papel: "comum", situacao: "inativo" }), {
      modulo: "rebanho",
      operacao: "registrar",
      fazendaId: FAZENDA_J,
    })).toBeNull();
  });

  it("limita a consulta ao titular, à fazenda e ao papel", () => {
    const lista = [
      evento({ id: 1, criadoEm: "2026-11-04T10:00:00.000Z", fazendaId: FAZENDA_J, modulo: "rebanho" }),
      evento({ id: 2, criadoEm: "2026-11-04T11:00:00.000Z", fazendaId: FAZENDA_B, modulo: "estoque" }),
      evento({ id: 3, criadoEm: "2026-11-04T12:00:00.000Z", fazendaId: null, modulo: "administrativo", operacao: "consultar_historico" }),
      evento({ id: 4, criadoEm: "2026-11-04T13:00:00.000Z", titularUserId: 9, fazendaId: 30 }),
    ];
    const principal = consultarAuditoria(lista, {
      titularUserId: 1,
      papel: "principal",
      fazendasAutorizadas: [FAZENDA_J, FAZENDA_B],
    }, { titularInformadoPeloCliente: 9 });
    expect(principal.itens.map(item => item.id)).toEqual([3, 2, 1]);

    const secundario = consultarAuditoria(lista, {
      titularUserId: 1,
      papel: "secundario",
      fazendasAutorizadas: [FAZENDA_J],
    });
    expect(secundario.itens.map(item => item.id)).toEqual([1]);

    const secundarioComSinal = consultarAuditoria(lista, {
      titularUserId: 1,
      papel: "secundario",
      fazendasAutorizadas: [FAZENDA_J],
    }, { autorizaEventosSemFazenda: true });
    expect(secundarioComSinal.itens.map(item => item.id)).toEqual([3, 1]);

    const comum = consultarAuditoria(lista, {
      titularUserId: 1,
      papel: "comum",
      fazendasAutorizadas: [FAZENDA_J, FAZENDA_B],
    }, { autorizaEventosSemFazenda: true });
    expect(comum.itens).toEqual([]);
    expect(consultarAuditoria(lista, null).itens).toEqual([]);
  });

  it("pagina e filtra sem mexer na lista original", () => {
    const lista = [1, 2, 3, 4, 5].map(id => evento({
      id,
      criadoEm: `2026-11-0${id}T00:00:00.000Z`,
      modulo: id % 2 === 0 ? "estoque" : "rebanho",
      fazendaId: id > 3 ? FAZENDA_B : FAZENDA_J,
    }));
    const copia = lista.map(item => ({ ...item }));
    const pagina = consultarAuditoria(lista, {
      titularUserId: 1,
      papel: "principal",
      fazendasAutorizadas: [FAZENDA_J, FAZENDA_B],
    }, { modulo: "rebanho", pagina: 1, tamanho: 1 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map(item => item.id)).toEqual([5]);
    expect(lista).toEqual(copia);

    const segunda = consultarAuditoria(lista, {
      titularUserId: 1,
      papel: "principal",
      fazendasAutorizadas: [FAZENDA_J, FAZENDA_B],
    }, { fazendaId: FAZENDA_J, de: "2026-11-02T00:00:00.000Z", ate: "2026-11-03T00:00:00.000Z", pagina: 1, tamanho: 10 });
    expect(segunda.itens.map(item => item.id)).toEqual([3, 2]);
  });

  it("não oferece edição nem exclusão e fica fora do boot", () => {
    const fontes = ["auditoria.ts", "auditoriaTransacao.ts"].map(nome => readFileSync(resolve(here, nome), "utf8")).join("\n");
    const routers = readFileSync(resolve(here, "routers.ts"), "utf8");
    const sql = readFileSync(resolve(here, "../drizzle/migrations/0064_auditoria_eventos.sql"), "utf8");
    expect(fontes).not.toMatch(/\.(update|delete)\s*\(/);
    expect(fontes).not.toMatch(/DELETE\s+FROM|UPDATE\s+`?auditoria_eventos/i);
    expect(routers).not.toContain("auditoria_eventos");
    expect(routers).not.toContain("registrarEvento");
    const requisitos = collectDatabaseSchemaRequirements();
    expect(requisitos.tables).not.toContain("auditoria_eventos");
    expect(sql).toContain("NÃO EXECUTAR nesta etapa");
    expect(sql).toContain("NÃO usar db:push");
    expect(sql.indexOf("-- CALL fd_77_auditoria_eventos();")).toBeGreaterThan(-1);
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
    expect(sql).not.toMatch(/UPDATE\s+`?(animais|fazendas|users|estoque|compras|vendas|usuario_fazendas)`?/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });
});
