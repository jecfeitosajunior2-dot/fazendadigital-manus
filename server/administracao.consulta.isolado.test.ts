import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarConsultasAdministrativas } from "./administracaoConsultaDb";
import { CATALOGO_PERMISSOES } from "./catalogoPermissoes";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CONTAINER = "fd-admin-784d";
const PORTA = 3319;
const BANCO = "fd_784d";
const SENHA_ROOT = "isolado-784d";
const USUARIO_LEITURA = "fd_leitura";
const SENHA_LEITURA = "leitura-784d";
const alvo = { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

async function conectar(usuario: string, senha: string, banco?: string) {
  return mysql.createConnection({
    host: "127.0.0.1",
    port: PORTA,
    user: usuario,
    password: senha,
    database: banco,
    multipleStatements: true,
  });
}

async function esperarMysql() {
  const prazo = Date.now() + 90_000;
  let ultimo = "";
  while (Date.now() < prazo) {
    try {
      const conn = await conectar("root", SENHA_ROOT);
      await conn.query("SELECT 1 AS ok");
      await conn.end();
      return;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
      await new Promise((resolver) => setTimeout(resolver, 1500));
    }
  }
  throw new Error(`MySQL isolado não respondeu. ${ultimo}`);
}

describe.sequential("consultas administrativas em MySQL isolado", () => {
  let raiz: mysql.Connection;
  let leitura: mysql.Pool;
  let consultas: ReturnType<typeof criarConsultasAdministrativas>;

  beforeAll(async () => {
    expect(PORTA).not.toBe(3306);
    expect(BANCO).not.toBe("fazenda_digital");
    expect(CONTAINER).not.toBe("fazenda-digital-mysql");
    expect(() => criarConsultasAdministrativas({} as mysql.Pool, { ...alvo, database: "fazenda_digital" })).toThrow(/operacional/);
    expect(() => criarConsultasAdministrativas({} as mysql.Pool, { ...alvo, port: 3306 })).toThrow(/porta/);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA_ROOT}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
    );
    await esperarMysql();
    raiz = await conectar("root", SENHA_ROOT, BANCO);
    const [banco] = await raiz.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    expect(banco[0]?.nome).toBe(BANCO);
    await raiz.query(readFileSync(resolve(here, "administracao.isolado.sql"), "utf8"));
    await raiz.query(
      `CREATE USER '${USUARIO_LEITURA}'@'%' IDENTIFIED BY '${SENHA_LEITURA}';
       GRANT SELECT ON ${BANCO}.* TO '${USUARIO_LEITURA}'@'%';`,
    );
    leitura = mysql.createPool({
      host: "127.0.0.1",
      port: PORTA,
      database: BANCO,
      user: USUARIO_LEITURA,
      password: SENHA_LEITURA,
      connectionLimit: 4,
    });
    consultas = criarConsultasAdministrativas(leitura, alvo);
  }, 120_000);

  beforeEach(async () => {
    await raiz.query("DELETE FROM auditoria_eventos");
    await raiz.query("DELETE FROM revisoes_reativacao");
    await raiz.query("DELETE FROM usuario_permissoes");
    await raiz.query("DELETE FROM usuario_fazendas");
    await raiz.query("DELETE FROM perfil_permissoes");
    await raiz.query("DELETE FROM perfis_acesso");
    await raiz.query("DELETE FROM users");
    await raiz.query("DELETE FROM fazendas");
    await raiz.query(
      `INSERT INTO fazendas (id, userId, nome) VALUES
       (10, 1, 'Pasto Norte A'), (20, 1, 'Pasto Sul A'), (30, 9, 'Pasto Conta B')`,
    );
    await raiz.query(
      `INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion, passwordHash) VALUES
       (1, 'ficticio-openid-1', 'Ana Principal', 'ana-principal@teste.isolado', 'admin', 'principal', 1, 'ativo', 0, 'hash-falso-nao-retornar'),
       (3, 'ficticio-openid-3', 'Ana Secundaria', 'ana-secundaria@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, 'hash-falso-nao-retornar'),
       (4, 'ficticio-openid-4', 'Ana Comum', 'ana-comum@teste.isolado', 'user', 'comum', 1, 'ativo', 0, 'hash-falso-nao-retornar'),
       (5, 'ficticio-openid-5', 'Ana Inativa', 'ana-inativa@teste.isolado', 'user', 'comum', 1, 'inativo', 1, 'hash-falso-nao-retornar'),
       (6, 'ficticio-openid-6', 'Ana Bloqueada', 'ana-bloqueada@teste.isolado', 'user', 'secundario', 1, 'inativo', 0, 'hash-falso-nao-retornar'),
       (12, 'ficticio-openid-12', 'Ana Sem Permissao', 'ana-sem@teste.isolado', 'user', 'secundario', 1, 'ativo', 0, 'hash-falso-nao-retornar'),
       (14, 'ficticio-openid-14', 'Ana Convidada', 'ana-convidada@teste.isolado', 'user', 'comum', 1, 'convidado', 0, 'hash-falso-nao-retornar'),
       (9, 'ficticio-openid-9', 'Beto Principal', 'beto-principal@teste.isolado', 'admin', 'principal', 9, 'ativo', 0, 'hash-falso-nao-retornar'),
       (8, 'ficticio-openid-8', 'Beto Secundario', 'beto-secundario@teste.isolado', 'user', 'secundario', 9, 'ativo', 0, 'hash-falso-nao-retornar'),
       (7, 'ficticio-openid-7', 'Beto Comum', 'beto-comum@teste.isolado', 'user', 'comum', 9, 'ativo', 0, 'hash-falso-nao-retornar')`,
    );
    await raiz.query(
      `INSERT INTO perfis_acesso (id, titularUserId, nome, situacao, criadoPorUserId) VALUES
       (1, 1, 'Curral A', 'ativo', 1),
       (2, 1, 'Curral Velho', 'inativo', 1),
       (3, 9, 'Curral B', 'ativo', 9)`,
    );
    await raiz.query(
      `INSERT INTO perfil_permissoes (perfilId, permissao) VALUES
       (1, 'animais.visualizar'), (2, 'animais.visualizar'), (3, 'pesagens.criar')`,
    );
    await raiz.query(
      `INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId) VALUES
       (3, 1, 'usuarios.criar', 1, NULL),
       (3, 1, 'usuarios.inativar', 1, NULL),
       (3, 1, 'usuarios.gerenciar_permissoes', 1, NULL),
       (3, 1, 'usuarios.gerenciar_acessos', 1, NULL),
       (3, 1, 'animais.visualizar', 1, NULL),
       (4, 1, 'animais.visualizar', 1, 1),
       (4, 1, 'usuarios.alterar_papel', 1, NULL),
       (5, 1, 'animais.visualizar', 1, NULL),
       (5, 1, 'usuarios.alterar_papel', 1, NULL),
       (8, 9, 'usuarios.criar', 9, NULL),
       (8, 9, 'usuarios.inativar', 9, NULL),
       (8, 9, 'usuarios.gerenciar_permissoes', 9, NULL),
       (8, 9, 'usuarios.gerenciar_acessos', 9, NULL),
       (8, 9, 'animais.visualizar', 9, NULL),
       (7, 9, 'animais.editar', 9, NULL)`,
    );
    await raiz.query(
      `INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
       (3, 10, 1), (4, 10, 1), (4, 30, 1), (5, 10, 1), (5, 30, 1), (8, 30, 9), (7, 30, 9)`,
    );
    await raiz.query(
      `INSERT INTO auditoria_eventos
        (executorUserId, executorNome, titularUserId, modulo, operacao, registroTipo, registroId, dadosAnteriores, dadosPosteriores, criadoEm)
       VALUES
        (1, 'Ana Principal', 1, 'usuarios', 'usuario.inativar', 'users', 5, NULL,
         '{"situacao":"inativo","papel":"comum","passwordHash":"hash-falso-nao-retornar","openId":"ficticio-openid-5","token":"segredo-token"}',
         '2026-03-01 12:00:00'),
        (5, 'Ana Inativa', 1, 'usuarios', 'usuario.editar', 'users', 4, NULL,
         '{"id":4,"name":"Ana Comum","papel":"comum","situacao":"ativo","sessionVersion":0}',
         '2026-03-02 12:00:00'),
        (1, 'Ana Principal', 1, 'usuarios', 'fazenda.conceder', 'usuario_fazendas', 4, NULL,
         '{"userId":4,"fazendaId":10,"concedidoPorUserId":1,"senha":"segredo-bruto"}',
         '2026-03-02 12:00:00'),
        (1, 'Ana Principal', 1, 'usuarios', 'permissao.conceder', 'usuario_permissoes', 4,
         '{"permissoes":["animais.visualizar"]}',
         '{"permissoes":["animais.visualizar","pesagens.criar"],"senha":"segredo-bruto"}',
         '2026-03-03 12:00:00'),
        (1, 'Ana Principal', 1, 'usuarios', 'perfil.editar', 'perfis_acesso', 1, NULL,
         '{"id":1,"nome":"Curral A","permissoes":["animais.visualizar"]}',
         '2026-03-03 12:00:01'),
        (1, 'Ana Principal', 1, 'usuarios', 'legado.op', 'desconhecido', 4, NULL,
         '{"senha":"segredo-bruto","marca":"nao-mostrar-bruto"}',
         '2026-03-04 12:00:00'),
        (9, 'Beto Principal', 9, 'usuarios', 'usuario.inativar', 'users', 7, NULL,
         '{"situacao":"inativo","marca":"conta-b-secreta"}',
         '2026-03-05 12:00:00')`,
    );
  });

  afterAll(async () => {
    await leitura?.end().catch(() => undefined);
    await raiz?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  async function retrato() {
    const [linhas] = await raiz.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users) AS usuarios,
         (SELECT COALESCE(SUM(sessionVersion), 0) FROM users) AS sessoes,
         (SELECT COUNT(*) FROM usuario_permissoes) AS permissoes,
         (SELECT COUNT(*) FROM usuario_fazendas) AS fazendas,
         (SELECT COUNT(*) FROM perfis_acesso) AS perfis,
         (SELECT COUNT(*) FROM auditoria_eventos) AS auditorias,
         (SELECT COUNT(*) FROM revisoes_reativacao) AS revisoes`,
    );
    return linhas[0];
  }

  function semSegredo(valor: unknown) {
    const texto = JSON.stringify(valor);
    expect(texto).not.toContain("hash-falso");
    expect(texto).not.toContain("ficticio-openid");
    expect(texto).not.toContain("conta-b-secreta");
    expect(texto).not.toContain("openId");
    expect(texto).not.toContain("passwordHash");
    expect(texto.toLowerCase()).not.toContain("beto");
  }

  it("isola o banco e não escreve nas consultas", async () => {
    const [banco] = await raiz.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    expect(banco[0]?.nome).toBe("fd_784d");
    const fonte = readFileSync(resolve(here, "administracaoConsultaDb.ts"), "utf8");
    expect(fonte.includes("INSERT INTO")).toBe(false);
    expect(fonte.includes("UPDATE ")).toBe(false);
    expect(fonte.includes("DELETE FROM")).toBe(false);
    expect(fonte.includes("./db")).toBe(false);
    expect(fonte.includes("administracaoDb")).toBe(false);
    const roteador = readFileSync(resolve(here, "routers.ts"), "utf8");
    expect(roteador.includes("administracaoConsultaDb")).toBe(false);
    const leitura = await conectar(USUARIO_LEITURA, SENHA_LEITURA, BANCO);
    await expect(leitura.query("INSERT INTO fazendas (userId, nome) VALUES (1, 'Nao pode')")).rejects.toThrow();
    await leitura.end();
  });

  it("recusa executor inativo, convidado, inexistente, comum e secundário sem permissão", async () => {
    expect(await consultas.listarUsuarios(6)).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await consultas.listarUsuarios(14)).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await consultas.listarUsuarios(99)).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await consultas.listarUsuarios(4)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await consultas.listarUsuarios(12)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await consultas.listarPerfis(4)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await consultas.listarPerfis(12)).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("lista só a própria conta e não revela a outra nem na página", async () => {
    const principal = await consultas.listarUsuarios(1, { pagina: 1, tamanho: 1 });
    expect(principal.ok).toBe(true);
    if (!principal.ok) return;
    expect(principal.total).toBe(7);
    expect(principal.itens.map((item) => item.id)).toEqual([1]);
    expect(principal.itens.every((item) => item.titularUserId === 1)).toBe(true);
    const segunda = await consultas.listarUsuarios(1, { pagina: 2, tamanho: 1 });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.itens.map((item) => item.id)).toEqual([3]);
    const ativos = await consultas.listarUsuarios(1, { situacao: "ativo", tamanho: 100 });
    expect(ativos.ok).toBe(true);
    if (!ativos.ok) return;
    expect(ativos.total).toBe(4);
    expect(ativos.itens.map((item) => item.id).sort((a, b) => a - b)).toEqual([1, 3, 4, 12]);
    expect(await consultas.listarUsuarios(1, { papel: "principal' OR '1'='1" })).toMatchObject({ ok: false, motivo: "alvo_invalido" });

    const secundaria = await consultas.listarUsuarios(3, { tamanho: 100 });
    expect(secundaria.ok).toBe(true);
    if (!secundaria.ok) return;
    expect(secundaria.itens.map((item) => item.id).sort((a, b) => a - b)).toEqual([4, 5, 14]);
    expect(secundaria.total).toBe(3);

    const contaB = await consultas.listarUsuarios(9, { tamanho: 100 });
    expect(contaB.ok).toBe(true);
    if (!contaB.ok) return;
    expect(contaB.total).toBe(3);
    expect(contaB.itens.map((item) => item.id).sort((a, b) => a - b)).toEqual([7, 8, 9]);
    semSegredo(principal);
    semSegredo(secundaria);
  });

  it("detalha usuário da conta e recusa o de fora sem contar o segredo", async () => {
    const propria = await consultas.detalharUsuario(1, 1);
    expect(propria).toMatchObject({ ok: true, usuario: { id: 1, name: "Ana Principal", papel: "principal", situacao: "ativo" } });
    semSegredo(propria);
    expect(await consultas.detalharUsuario(3, 4)).toMatchObject({ ok: true, usuario: { id: 4, papel: "comum" } });
    expect(await consultas.detalharUsuario(3, 1)).toMatchObject({ ok: false, motivo: "alvo_protegido" });
    expect(await consultas.detalharUsuario(3, 12)).toMatchObject({ ok: false, motivo: "reservado_ao_principal" });
    const fora = await consultas.detalharUsuario(1, 7);
    expect(fora).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    semSegredo(fora);
    expect(await consultas.detalharUsuario(3, 7)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    expect(await consultas.detalharUsuario(8, 4)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    expect(await consultas.detalharUsuario(1, 123)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
  });

  it("lista perfil da conta, inclusive inativo, e esconde o da outra", async () => {
    const lista = await consultas.listarPerfis(1, { tamanho: 1, pagina: 1 });
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.total).toBe(2);
    expect(lista.itens.map((item) => item.nome)).toEqual(["Curral A"]);
    const velho = await consultas.detalharPerfil(1, 2);
    expect(velho).toMatchObject({ ok: true, perfil: { nome: "Curral Velho", situacao: "inativo", permissoes: ["animais.visualizar"] } });
    const alheio = await consultas.detalharPerfil(1, 3);
    expect(alheio).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    semSegredo(alheio);
    expect(await consultas.listarPerfis(3)).toMatchObject({ ok: true, total: 2 });
    expect(await consultas.detalharPerfil(8, 1)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
  });

  it("separa permissão possuída, efetiva e delegável", async () => {
    const tetoPrincipal = await consultas.consultarDelegacao(1);
    expect(tetoPrincipal.ok).toBe(true);
    if (!tetoPrincipal.ok) return;
    expect(tetoPrincipal.alterarPapelDelegavel).toBe(false);
    expect(tetoPrincipal.motivoAlterarPapel).toBe("reservado_ao_principal");
    expect(tetoPrincipal.delegaveis).not.toContain("usuarios.alterar_papel");
    expect(tetoPrincipal.delegaveis).toContain("animais.editar");
    expect(tetoPrincipal.possuirNaoAutorizaConcessao).toBe(true);

    const proprio = await consultas.consultarPermissoes(1, 1);
    expect(proprio.ok).toBe(true);
    if (!proprio.ok) return;
    expect(proprio.implicitas).toBe(true);
    expect(proprio.efetivas).toContain("usuarios.alterar_papel");
    expect(tetoPrincipal.delegaveis).not.toContain("usuarios.alterar_papel");

    const comum = await consultas.consultarPermissoes(1, 4);
    expect(comum.ok).toBe(true);
    if (!comum.ok) return;
    expect(comum.implicitas).toBe(false);
    expect(comum.individuais).toContainEqual({ permissao: "animais.visualizar", origemPerfilId: 1 });
    expect(comum.efetivas.sort()).toEqual(["animais.visualizar", "usuarios.alterar_papel"]);

    const tetoSecundario = await consultas.consultarDelegacao(3);
    expect(tetoSecundario.ok).toBe(true);
    if (!tetoSecundario.ok) return;
    expect(tetoSecundario.delegaveis).toContain("animais.visualizar");
    expect(tetoSecundario.delegaveis).not.toContain("animais.editar");
    expect(tetoSecundario.delegaveis).not.toContain("usuarios.alterar_papel");
    expect(await consultas.consultarDelegacao(12)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await consultas.consultarPermissoes(3, 7)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    expect(await consultas.consultarPermissoes(8, 4)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
  });

  it("mostra fazenda da conta e marca vínculo inconsistente só para o principal", async () => {
    const principal = await consultas.consultarFazendasDoExecutor(1);
    expect(principal).toMatchObject({ ok: true, origem: "implicita", fazendaIds: [10, 20], acessoOperacional: true });
    const secundaria = await consultas.consultarFazendasDoExecutor(3);
    expect(secundaria).toMatchObject({ ok: true, origem: "concedida", fazendaIds: [10] });
    expect(await consultas.consultarFazendasDoUsuario(3, 4)).toMatchObject({ ok: true, fazendaIds: [10], acessoOperacional: true });
    expect(await consultas.consultarFazendasDoUsuario(1, 4)).toMatchObject({ ok: true, fazendaIds: [10] });
    expect(await consultas.consultarVinculosInconsistentes(1, 4)).toEqual({
      ok: true,
      vinculos: [{ fazendaId: 30, acessoOperacional: false }],
    });
    expect(await consultas.consultarVinculosInconsistentes(3, 4)).toMatchObject({ ok: false, motivo: "reservado_ao_principal" });
    expect(await consultas.consultarVinculosInconsistentes(1, 7)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    const conceder = await consultas.consultarFazendasParaConcessao(1, 4);
    expect(conceder.ok).toBe(true);
    if (!conceder.ok) return;
    expect(conceder.fazendas).toEqual([
      { fazendaId: 10, jaVinculada: true },
      { fazendaId: 20, jaVinculada: false },
    ]);
    expect(await consultas.consultarFazendasParaConcessao(3, 4)).toMatchObject({
      ok: true,
      fazendas: [{ fazendaId: 10, jaVinculada: true }],
    });
    expect(await consultas.consultarFazendasDoExecutor(8)).toMatchObject({ ok: true, fazendaIds: [30] });
    expect(await consultas.consultarFazendasDoUsuario(1, 7)).toMatchObject({ ok: false, motivo: "alvo_invalido" });
  });

  it("monta a pré-revisão sem gravar e só o principal vê a irregularidade", async () => {
    const antes = await retrato();
    const principal = await consultas.preRevisaoReativacao(1, 5);
    expect(principal.ok).toBe(true);
    if (!principal.ok) return;
    expect(principal.altera).toBe(false);
    expect(principal.confirmacaoRevalidaNaTransacao).toBe(true);
    expect(principal.usuario.situacao).toBe("inativo");
    expect(principal.irregulares).toEqual(["usuarios.alterar_papel"]);
    expect(principal.inconsistentes).toEqual([{ fazendaId: 30, acessoOperacional: false }]);
    expect(principal.podeManter.permissoes).toContain("animais.visualizar");
    expect(principal.podeManter.permissoes).not.toContain("usuarios.alterar_papel");
    expect(principal.podeConceder.permissoes).not.toContain("usuarios.alterar_papel");
    expect(principal.podeConceder.fazendas).toEqual([10, 20]);

    const secundaria = await consultas.preRevisaoReativacao(3, 5);
    expect(secundaria.ok).toBe(true);
    if (!secundaria.ok) return;
    expect(secundaria.irregulares).toEqual([]);
    expect(secundaria.inconsistentes).toEqual([]);
    expect(secundaria.permissoesAtuais.map((item) => item.permissao)).toEqual(["animais.visualizar"]);
    expect(secundaria.fazendasAtuais).toEqual([{ fazendaId: 10, acessoOperacional: true }]);
    expect(secundaria.podeConceder.permissoes).not.toContain("animais.editar");
    expect(secundaria.podeConceder.permissoes).not.toContain("usuarios.alterar_papel");
    expect(secundaria.podeConceder.fazendas).toEqual([10]);
    semSegredo(secundaria);

    expect(await consultas.preRevisaoReativacao(1, 4)).toMatchObject({ ok: false, motivo: "nao_inativo" });
    const fora = await consultas.preRevisaoReativacao(1, 7);
    expect(fora).toMatchObject({ ok: false, motivo: "alvo_invalido" });
    semSegredo(fora);
    expect(await retrato()).toEqual(antes);
  });

  it("só o principal consulta a auditoria da própria conta", async () => {
    const definicao = CATALOGO_PERMISSOES.find((item) => item.id === "auditoria.visualizar");
    expect(definicao?.exclusivaDoPrincipal).toBe(false);
    expect(await consultas.consultarEventos(6)).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await consultas.consultarEventos(14)).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await consultas.consultarEventos(99)).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await consultas.consultarEventos(4)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    await raiz.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (4, 1, 'auditoria.visualizar', 1)",
    );
    expect(await consultas.consultarEventos(4)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await consultas.consultarEventos(3)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await consultas.consultarEventos(12)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    await raiz.query(
      "INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (3, 1, 'auditoria.visualizar', 1)",
    );
    const bloqueado = await consultas.consultarEventos(3);
    expect(bloqueado).toEqual({ ok: false, motivo: "AUDITORIA_HISTORICA_INDISPONIVEL" });
    semSegredo(bloqueado);

    const contaA = await consultas.consultarEventos(1, { tamanho: 100 });
    expect(contaA.ok).toBe(true);
    if (!contaA.ok) return;
    expect(contaA.total).toBe(6);
    expect(contaA.itens.every((item) => item.titularUserId === 1)).toBe(true);
    semSegredo(contaA);
    const contaB = await consultas.consultarEventos(9, { tamanho: 100 });
    expect(contaB.ok).toBe(true);
    if (!contaB.ok) return;
    expect(contaB.total).toBe(1);
    expect(contaB.itens.map((item) => item.registroId)).toEqual([7]);
    expect(JSON.stringify(contaA)).not.toContain("conta-b-secreta");
  });

  it("filtra, pagina e projeta a auditoria sem misturar a outra conta", async () => {
    const pagina = await consultas.consultarEventos(1, { pagina: 1, tamanho: 1 });
    expect(pagina.ok).toBe(true);
    if (!pagina.ok) return;
    expect(pagina.total).toBe(6);
    expect(pagina.itens.map((item) => item.operacao)).toEqual(["legado.op"]);
    const segunda = await consultas.consultarEventos(1, { pagina: 2, tamanho: 1 });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.itens.map((item) => item.operacao)).toEqual(["perfil.editar"]);
    const teto = await consultas.consultarEventos(1, { tamanho: 10000 });
    expect(teto.ok).toBe(true);
    if (!teto.ok) return;
    expect(teto.tamanho).toBe(100);
    expect(teto.total).toBe(6);
    expect(teto.itens.map((item) => item.operacao)).toEqual([
      "legado.op",
      "perfil.editar",
      "permissao.conceder",
      "fazenda.conceder",
      "usuario.editar",
      "usuario.inativar",
    ]);

    const periodo = await consultas.consultarEventos(1, {
      de: "2026-03-03 00:00:00",
      ate: "2026-03-03 23:59:59",
      tamanho: 20,
    });
    expect(periodo.ok).toBe(true);
    if (!periodo.ok) return;
    expect(periodo.itens.map((item) => item.operacao)).toEqual(["perfil.editar", "permissao.conceder"]);
    const operacao = await consultas.consultarEventos(1, { operacao: "usuario.inativar", tamanho: 20 });
    expect(operacao.ok).toBe(true);
    if (!operacao.ok) return;
    expect(operacao.total).toBe(1);
    expect(operacao.itens[0]?.registroId).toBe(5);
    const afetado = await consultas.consultarEventos(1, { usuarioAfetadoId: 4, tamanho: 20 });
    expect(afetado.ok).toBe(true);
    if (!afetado.ok) return;
    expect(afetado.itens.map((item) => item.operacao)).toEqual(["permissao.conceder", "fazenda.conceder", "usuario.editar"]);
    const perfilNaoEUsuario = await consultas.consultarEventos(1, { usuarioAfetadoId: 1, tamanho: 20 });
    expect(perfilNaoEUsuario.ok).toBe(true);
    if (!perfilNaoEUsuario.ok) return;
    expect(perfilNaoEUsuario.total).toBe(0);
    const executorNaoEAlvo = await consultas.consultarEventos(1, { usuarioAfetadoId: 5, tamanho: 20 });
    expect(executorNaoEAlvo.ok).toBe(true);
    if (!executorNaoEAlvo.ok) return;
    expect(executorNaoEAlvo.itens.map((item) => item.operacao)).toEqual(["usuario.inativar"]);
    const outraConta = await consultas.consultarEventos(1, { usuarioAfetadoId: 7, tamanho: 20 });
    expect(outraConta.ok).toBe(true);
    if (!outraConta.ok) return;
    expect(outraConta.total).toBe(0);
    semSegredo(outraConta);
    expect(await consultas.consultarEventos(1, { operacao: "usuario.inativar; drop" })).toMatchObject({ ok: false, motivo: "alvo_invalido" });
  });

  it("esconde instantâneo desconhecido e campo sensível sem alterar o evento gravado", async () => {
    const [antes] = await raiz.query<RowDataPacket[]>(
      "SELECT dadosPosteriores FROM auditoria_eventos WHERE operacao = 'legado.op' AND titularUserId = 1",
    );
    const lista = await consultas.consultarEventos(1, { tamanho: 100 });
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    const desconhecido = lista.itens.find((item) => item.operacao === "legado.op");
    expect(desconhecido?.conteudoOculto).toBe(true);
    expect(desconhecido?.posterior).toBeNull();
    expect(JSON.stringify(desconhecido)).not.toContain("segredo-bruto");
    expect(JSON.stringify(desconhecido)).not.toContain("nao-mostrar-bruto");
    const conhecido = lista.itens.find((item) => item.operacao === "usuario.inativar");
    expect(conhecido?.conteudoOculto).toBe(false);
    expect(conhecido?.posterior).toMatchObject({ situacao: "inativo", papel: "comum" });
    expect(JSON.stringify(conhecido)).not.toContain("hash-falso");
    expect(JSON.stringify(conhecido)).not.toContain("segredo-token");
    expect(JSON.stringify(conhecido)).not.toContain("openId");
    const concessao = lista.itens.find((item) => item.operacao === "permissao.conceder");
    expect(concessao?.posterior).toMatchObject({ permissoes: ["animais.visualizar", "pesagens.criar"] });
    expect(JSON.stringify(concessao)).not.toContain("segredo-bruto");
    const [depois] = await raiz.query<RowDataPacket[]>(
      "SELECT dadosPosteriores FROM auditoria_eventos WHERE operacao = 'legado.op' AND titularUserId = 1",
    );
    expect(depois?.dadosPosteriores).toBe(antes?.dadosPosteriores);
  });

  it("nenhuma consulta muda sessão, permissão, fazenda, revisão ou auditoria", async () => {
    const antes = await retrato();
    await consultas.listarUsuarios(1, { tamanho: 100 });
    await consultas.detalharUsuario(1, 4);
    await consultas.listarPerfis(1);
    await consultas.detalharPerfil(1, 2);
    await consultas.consultarDelegacao(1);
    await consultas.consultarPermissoes(1, 4);
    await consultas.consultarFazendasDoExecutor(1);
    await consultas.consultarFazendasDoUsuario(1, 4);
    await consultas.consultarFazendasParaConcessao(1, 4);
    await consultas.consultarVinculosInconsistentes(1, 4);
    await consultas.preRevisaoReativacao(1, 5);
    await consultas.consultarEventos(1, { tamanho: 20 });
    expect(await retrato()).toEqual(antes);
    expect(Number(antes?.sessoes)).toBe(1);
    expect(Number(antes?.revisoes)).toBe(0);
    expect(Number(antes?.auditorias)).toBe(7);
  });
});
