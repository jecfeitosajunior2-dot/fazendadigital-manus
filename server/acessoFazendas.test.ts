import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectDatabaseSchemaRequirements } from "./databaseSchemaRequirements";
import { decidirSessao, type IdentidadeUsuario } from "./_core/identidadeSessao";
import {
  avaliarAcessoFazenda,
  montarAcesso,
  type FazendaConhecida,
} from "./acessoFazendas";

const here = dirname(fileURLToPath(import.meta.url));
const FAZENDA_J = 10;
const FAZENDA_B = 20;
const FAZENDA_ALHEIA = 30;

const fazendasDoPrincipal: FazendaConhecida[] = [
  { id: FAZENDA_J, userId: 1 },
  { id: FAZENDA_B, userId: 1 },
];

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel">): IdentidadeUsuario {
  return {
    openId: `pessoa-${parcial.id}`,
    name: "Pessoa fictícia",
    email: `pessoa-${parcial.id}@isolado.local`,
    role: parcial.papel === "comum" ? "user" : "admin",
    titularUserId: 1,
    situacao: "ativo",
    sessionVersion: 0,
    ...parcial,
  };
}

describe("resolvedor de acesso às fazendas", () => {
  it("o principal vê as duas fazendas sem vínculo individual", () => {
    const origem = fazendasDoPrincipal.map(fazenda => ({ ...fazenda }));
    const acesso = montarAcesso({
      identidade: pessoa({ id: 1, papel: "principal", titularUserId: 1 }),
      fazendasDoTitular: origem,
      vinculos: [],
    });
    expect(acesso).toMatchObject({
      executorUserId: 1,
      titularUserId: 1,
      papel: "principal",
      fazendasAutorizadas: [FAZENDA_J, FAZENDA_B],
    });
    expect(origem).toEqual(fazendasDoPrincipal);
    expect(avaliarAcessoFazenda(acesso, { id: FAZENDA_J, userId: 1 })).toBe("permitido");
    expect(avaliarAcessoFazenda(acesso, { id: FAZENDA_B, userId: 1 })).toBe("permitido");
  });

  it("o funcionário autorizado só na Fazenda J não entra na Fazenda B", () => {
    const acesso = montarAcesso({
      identidade: pessoa({ id: 2, papel: "comum" }),
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [{ userId: 2, fazendaId: FAZENDA_J }],
    });
    expect(acesso?.executorUserId).toBe(2);
    expect(acesso?.titularUserId).toBe(1);
    expect(acesso?.fazendasAutorizadas).toEqual([FAZENDA_J]);
    expect(avaliarAcessoFazenda(acesso, { id: FAZENDA_B, userId: 1 })).toBe("sem_autorizacao");
  });

  it("funcionário sem fazenda autorizada não consulta nenhuma", () => {
    const acesso = montarAcesso({
      identidade: pessoa({ id: 2, papel: "comum" }),
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [],
    });
    expect(acesso?.fazendasAutorizadas).toEqual([]);
    expect(avaliarAcessoFazenda(acesso, { id: FAZENDA_J, userId: 1 })).toBe("sem_autorizacao");
  });

  it("recusa fazenda inexistente e fazenda de outro titular", () => {
    const acesso = montarAcesso({
      identidade: pessoa({ id: 2, papel: "comum" }),
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [
        { userId: 2, fazendaId: FAZENDA_J },
        { userId: 2, fazendaId: FAZENDA_ALHEIA },
      ],
    });
    expect(acesso?.fazendasAutorizadas).toEqual([FAZENDA_J]);
    expect(avaliarAcessoFazenda(acesso, null)).toBe("inexistente");
    expect(avaliarAcessoFazenda(acesso, { id: FAZENDA_ALHEIA, userId: 9 })).toBe("outro_titular");
  });

  it("administrador secundário também fica limitado à fazenda concedida", () => {
    const acesso = montarAcesso({
      identidade: pessoa({ id: 3, papel: "secundario", role: "admin" }),
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [{ userId: 3, fazendaId: FAZENDA_J }],
    });
    expect(acesso?.papel).toBe("secundario");
    expect(acesso?.fazendasAutorizadas).toEqual([FAZENDA_J]);
    expect(avaliarAcessoFazenda(acesso, { id: FAZENDA_B, userId: 1 })).toBe("sem_autorizacao");
  });

  it("usuário inativo e sessão revogada não resolvem acesso", () => {
    const inativo = montarAcesso({
      identidade: pessoa({ id: 2, papel: "comum", situacao: "inativo" }),
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [{ userId: 2, fazendaId: FAZENDA_J }],
    });
    expect(inativo).toBeNull();
    expect(avaliarAcessoFazenda(inativo, { id: FAZENDA_J, userId: 1 })).toBe("sem_identidade");

    const registro = pessoa({ id: 2, papel: "comum", sessionVersion: 2 });
    const sessao = decidirSessao({ id: 2, sessionVersion: 0 }, registro, false);
    expect(sessao).toBeNull();
    expect(montarAcesso({
      identidade: sessao,
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [{ userId: 2, fazendaId: FAZENDA_J }],
    })).toBeNull();
  });

  it("identificadores enviados pelo cliente não mudam titular nem fazendas", () => {
    const acesso = montarAcesso({
      identidade: pessoa({ id: 2, papel: "comum", titularUserId: 1 }),
      fazendasDoTitular: fazendasDoPrincipal,
      vinculos: [{ userId: 2, fazendaId: FAZENDA_J }],
      titularInformadoPeloCliente: 9,
      fazendasInformadasPeloCliente: [FAZENDA_B, FAZENDA_ALHEIA],
    });
    expect(acesso?.titularUserId).toBe(1);
    expect(acesso?.executorUserId).toBe(2);
    expect(acesso?.fazendasAutorizadas).toEqual([FAZENDA_J]);
  });

  it("a migração da tabela não entra no boot nem roda sozinha", () => {
    const requisitos = collectDatabaseSchemaRequirements();
    expect(requisitos.tables).not.toContain("usuario_fazendas");
    const sql = readFileSync(resolve(here, "../drizzle/migrations/0063_usuario_fazendas.sql"), "utf8");
    expect(sql).toContain("NÃO EXECUTAR nesta etapa");
    expect(sql).toContain("NÃO usar db:push");
    expect(sql.indexOf("-- CALL fd_76_usuario_fazendas();")).toBeGreaterThan(-1);
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
    expect(sql).not.toMatch(/UPDATE\s+`?(animais|fazendas|users|estoque|compras|vendas)`?/i);
  });
});
