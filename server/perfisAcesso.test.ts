import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectDatabaseSchemaRequirements } from "./databaseSchemaRequirements";
import {
  concederPermissaoAvulsa,
  copiarPermissoesDoPerfil,
  normalizarNomePerfil,
  permissoesEfetivas,
  planejarPerfil,
  type LinhaPermissaoUsuario,
} from "./perfisAcesso";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(here, "../drizzle/migrations/0065_perfis_permissoes.sql"), "utf8");

const MODELO = ["animais.visualizar", "pesagens.criar", "saude.criar"] as const;

function perfilBase(permissoes: readonly string[] = MODELO) {
  return planejarPerfil({
    titularUserId: 1,
    nome: "  Funcionário   de Curral ",
    descricao: " Modelo do curral ",
    criadoPorUserId: 1,
    criadorTitularUserId: 1,
    existentes: [],
    permissoes,
  });
}

describe("perfis e permissões efetivas", () => {
  it("cria perfil válido e recusa nome repetido na mesma conta", () => {
    const criado = perfilBase();
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    expect(criado.perfil.nome).toBe("Funcionário de Curral");
    expect(criado.perfil.permissoes).toEqual([...MODELO]);
    expect(criado.perfil.criadoPorUserId).toBe(1);
    const repetido = planejarPerfil({
      titularUserId: 1,
      nome: "funcionario de curral",
      criadoPorUserId: 1,
      criadorTitularUserId: 1,
      existentes: [{ titularUserId: 1, nome: criado.perfil.nome }],
      permissoes: [...MODELO],
    });
    expect(repetido).toMatchObject({ ok: false, motivo: "nome_duplicado" });
    expect(normalizarNomePerfil("   ")).toBeNull();
  });

  it("isola titulares e aceita o mesmo nome em outra conta", () => {
    const outraConta = planejarPerfil({
      titularUserId: 9,
      nome: "Funcionário de Curral",
      criadoPorUserId: 9,
      criadorTitularUserId: 9,
      existentes: [{ titularUserId: 1, nome: "Funcionário de Curral" }],
      permissoes: ["animais.visualizar"],
    });
    expect(outraConta.ok).toBe(true);
    const cruzado = copiarPermissoesDoPerfil({
      perfil: { id: 30, titularUserId: 9, situacao: "ativo", permissoes: ["animais.visualizar"] },
      usuario: { id: 2, titularUserId: 1, permissoes: [] },
      concedidoPorUserId: 1,
      concedenteTitularUserId: 1,
    });
    expect(cruzado).toMatchObject({ ok: false, motivo: "outro_titular" });
  });

  it("aceita permissão do catálogo e recusa inexistente ou repetida", () => {
    expect(perfilBase().ok).toBe(true);
    expect(perfilBase(["vendas.estornar"])).toMatchObject({ ok: false, motivo: "permissao_invalida" });
    expect(perfilBase(["animais.visualizar", "animais.visualizar"])).toMatchObject({
      ok: false,
      motivo: "permissao_duplicada",
    });
  });

  it("copia o perfil para o usuário e ignora edição posterior do modelo", () => {
    const perfil = { id: 4, titularUserId: 1, situacao: "ativo" as const, permissoes: [...MODELO] };
    const copia = copiarPermissoesDoPerfil({
      perfil,
      usuario: { id: 2, titularUserId: 1, permissoes: [] },
      concedidoPorUserId: 1,
      concedenteTitularUserId: 1,
    });
    expect(copia.ok).toBe(true);
    if (!copia.ok) return;
    expect(copia.novas.map((linha) => linha.permissao)).toEqual([...MODELO]);
    expect(copia.novas.every((linha) => linha.origemPerfilId === 4)).toBe(true);
    perfil.permissoes = ["vendas.confirmar"];
    expect(permissoesEfetivas(copia.efetivas)).toEqual([...MODELO]);
    expect(permissoesEfetivas(copia.efetivas)).not.toContain("vendas.confirmar");
  });

  it("concede permissão avulsa sem perfil e recusa duplicata", () => {
    const avulsa = concederPermissaoAvulsa({
      usuario: { id: 2, titularUserId: 1, permissoes: [] },
      permissao: "lotes.visualizar",
      concedidoPorUserId: 1,
      concedenteTitularUserId: 1,
    });
    expect(avulsa.ok).toBe(true);
    if (!avulsa.ok) return;
    expect(avulsa.novas[0]).toMatchObject({ origemPerfilId: null, permissao: "lotes.visualizar" });
    const deNovo = concederPermissaoAvulsa({
      usuario: { id: 2, titularUserId: 1, permissoes: avulsa.efetivas },
      permissao: "lotes.visualizar",
      concedidoPorUserId: 1,
      concedenteTitularUserId: 1,
    });
    expect(deNovo).toMatchObject({ ok: false, motivo: "concessao_duplicada" });
    expect(new Set(permissoesEfetivas(avulsa.efetivas)).size).toBe(avulsa.efetivas.length);
  });

  it("perfil inativado não apaga a cópia já feita e não gera cópia nova", () => {
    const perfil = { id: 4, titularUserId: 1, situacao: "ativo" as const, permissoes: ["pesagens.criar"] };
    const copia = copiarPermissoesDoPerfil({
      perfil,
      usuario: { id: 2, titularUserId: 1, permissoes: [] },
      concedidoPorUserId: 1,
      concedenteTitularUserId: 1,
    });
    expect(copia.ok).toBe(true);
    if (!copia.ok) return;
    const guardadas: LinhaPermissaoUsuario[] = copia.efetivas.map((linha) => ({ ...linha }));
    perfil.situacao = "inativo";
    expect(permissoesEfetivas(guardadas)).toEqual(["pesagens.criar"]);
    expect(copiarPermissoesDoPerfil({
      perfil,
      usuario: { id: 3, titularUserId: 1, permissoes: [] },
      concedidoPorUserId: 1,
      concedenteTitularUserId: 1,
    })).toMatchObject({ ok: false, motivo: "perfil_inativo" });
  });

  it("a chamada da migration continua comentada e o boot exige as tabelas", () => {
    expect(sql).toContain("NÃO EXECUTAR nesta etapa");
    expect(sql).toContain("NÃO usar db:push");
    expect(sql.indexOf("-- CALL fd_78_perfis_permissoes();")).toBeGreaterThan(-1);
    expect(sql).not.toMatch(/^\s*CALL\s+fd_78_perfis_permissoes/m);
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).not.toContain("CASCADE");
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
    expect(sql).toContain("ADD UNIQUE KEY `users_id_titular_uq` (`id`, `titularUserId`)");
    expect(sql).toContain("usuario_permissoes_usuario_titular_fk");
    expect(sql).not.toMatch(/\bUPDATE\s+`?users`/i);
    const alters = sql.match(/\bALTER\s+TABLE\s+`?[A-Za-z0-9_]+/gi) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    expect(alters.every((comando) => /`?users$/i.test(comando.replace(/\bALTER\s+TABLE\s+/i, "")))).toBe(true);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toContain("USE ");
    const requisitos = collectDatabaseSchemaRequirements();
    expect(requisitos.tables).toEqual(expect.arrayContaining([
      "perfis_acesso",
      "perfil_permissoes",
      "usuario_permissoes",
      "usuario_fazendas",
      "auditoria_eventos",
    ]));
    expect(requisitos.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "users",
        name: "users_id_titular_uq",
        unique: true,
        columns: ["id", "titularUserId"],
      }),
    ]));
    const roteador = readFileSync(resolve(here, "routers.ts"), "utf8");
    expect(roteador).not.toContain("perfisAcesso");
    expect(roteador).not.toContain("usuario_permissoes");
  });
});
