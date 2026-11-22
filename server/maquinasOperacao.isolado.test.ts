import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { MSG_ESTOQUE_DISPUTADO } from "./estoqueConcorrencia";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  definirBancoMaquinas,
  definirGanchoTravaMaquina,
  maquinasOperacao,
  MSG_MAQUINA_COM_VINCULOS,
  MSG_MAQUINA_FAZENDA,
  MSG_MAQUINA_NAO_ENCONTRADA,
  MSG_MAQUINA_NOME,
  MSG_MAQUINA_PLACA,
  MSG_MAQUINA_SEM_MYSQL,
  MSG_MAQUINA_SEM_PERMISSAO,
  type SessaoMaquina,
} from "./maquinasOperacao";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bo-maquina";
const PORTA = 3393;
const SENHA = "isolado-h4bo";
const BANCO = "fd_h4bo";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY openId (openId)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL,
  concedidoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE maquinas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NULL,
  nome varchar(100) NOT NULL, tipo varchar(50) NULL, marca varchar(100) NULL,
  modelo varchar(100) NULL, ano int NULL, anoAquisicao int NULL, dataAquisicao date NULL,
  placa varchar(50) NULL, horimetro varchar(50) NULL, tipoMedidor varchar(30) NULL,
  valor decimal(12,2) NULL, vidaUtil varchar(50) NULL, dataDesativacao date NULL,
  estado varchar(20) NULL, status enum('ativo','manutencao','inativo') DEFAULT 'ativo',
  imagem1 text NULL, imagem2 text NULL, imagem3 text NULL, observacoes text NULL,
  createdAt timestamp NULL, updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE abastecimentos (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, maquinaId int NOT NULL,
  data date NOT NULL, combustivel enum('diesel','gasolina','etanol','arla') NOT NULL,
  litros decimal(8,2) NOT NULL, valorLitro decimal(8,3) NULL, valorTotal decimal(10,2) NULL,
  horimetro varchar(50) NULL, responsavel varchar(200) NULL, abastecidoNaFazenda tinyint(1) NULL,
  fazendaId int NULL, movimentacaoEstoqueId int NULL, status varchar(20) NULL,
  fornecedor varchar(200) NULL, observacoes text NULL, createdAt timestamp NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE manutencoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, maquinaId int NOT NULL,
  tipo varchar(50) NOT NULL, descricao text NULL, data date NOT NULL,
  custo decimal(10,2) NULL, oficina varchar(200) NULL, horimetro varchar(50) NULL,
  proximaManutencao date NULL, status varchar(50) NULL, prestadorNome varchar(200) NULL,
  prestadorContato varchar(100) NULL, prestadorPessoaId int NULL, tipoExecucao varchar(20) NULL,
  valorMaoObra decimal(10,2) NULL, valorPecas decimal(10,2) NULL,
  valorPecasOficina decimal(10,2) NULL, valorCobradoOficina decimal(10,2) NULL,
  valorTotal decimal(10,2) NULL, chaveOperacao varchar(80) NULL, observacoes text NULL,
  estornadoEm timestamp NULL, motivoEstorno text NULL, createdAt timestamp NULL,
  updatedAt timestamp NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

type Banco = ReturnType<typeof drizzle<typeof schema>>;

function sessao(
  executorId: number,
  permissaoId: SessaoMaquina["permissaoId"],
  versao: number | null = 1,
): SessaoMaquina {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function ficha(extra: Record<string, unknown> = {}) {
  return {
    fazendaId: 10,
    nome: "Trator Norte",
    tipo: "trator",
    marca: "Massey",
    modelo: "275",
    tipoMedidor: "horimetro",
    horimetro: "100",
    placa: "TRT10",
    ano: 2018,
    ...extra,
  };
}

function pausa() {
  return new Promise((resolver) => setTimeout(resolver, 450));
}

describe("contrato das telas de máquinas", () => {
  it("a listagem avisa quando o banco não devolve as máquinas", () => {
    const tela = readFileSync(new URL("../client/src/pages/MaquinasListPage.tsx", import.meta.url), "utf8");
    expect(tela).toContain("listErro");
    expect(tela).toContain("As máquinas não puderam ser carregadas.");
  });

  it("as rotas de máquinas não aceitam sucesso pelo arquivo local", () => {
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const inicio = rotas.indexOf("const maquinasRouter = router({");
    const fim = rotas.indexOf("// ─── ABASTECIMENTOS ROUTER", inicio);
    const bloco = rotas.slice(inicio, fim);
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("createLocalMaquina");
    expect(bloco).not.toContain("listLocalMaquinas");
    expect(bloco).not.toContain("getLocalMaquina");
  });
});

describe.sequential("máquinas no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: Banco;

  async function contar(tabela = "maquinas") {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
  }

  async function linha(id: number) {
    const [linhas] = await pool.query(
      "SELECT id, userId, fazendaId, nome, placa, horimetro, status, dataDesativacao FROM maquinas WHERE id = ?",
      [id],
    );
    return (linhas as Array<Record<string, unknown>>)[0];
  }

  async function limpar() {
    definirGanchoTravaMaquina(null);
    await pool.query("DELETE FROM abastecimentos");
    await pool.query("DELETE FROM manutencoes");
    await pool.query("DELETE FROM maquinas");
    await pool.query("UPDATE users SET sessionVersion = 1, situacao = 'ativo'");
    await pool.query("DELETE FROM usuario_permissoes");
    await pool.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'maquinas.visualizar', 1),
        (2, 1, 'maquinas.criar', 1),
        (2, 1, 'maquinas.editar', 1),
        (2, 1, 'maquinas.inativar', 1),
        (4, 1, 'maquinas.visualizar', 1),
        (5, 1, 'maquinas.visualizar', 1),
        (5, 1, 'maquinas.criar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (4, 10, 1), (5, 10, 1), (6, 10, 1)
    `);
  }

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
    await exec("docker", [
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    ], { windowsHide: true });
    const prazo = Date.now() + 90_000;
    let ultimo = "";
    while (Date.now() < prazo) {
      try {
        const conn = await mysql.createConnection({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          multipleStatements: true,
        });
        await conn.query("SELECT 1 AS ok");
        await conn.query(ESQUEMA);
        await conn.query(`
          INSERT INTO users (id, openId, name, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'p1', 'Principal', 'user', 'principal', 1, 'ativo', 1),
            (2, 'f2', 'Ambos', 'user', 'comum', 1, 'ativo', 1),
            (3, 'p3', 'Outro', 'user', 'principal', 3, 'ativo', 1),
            (4, 'f4', 'Olho', 'user', 'comum', 1, 'ativo', 1),
            (5, 'f5', 'Uma', 'user', 'comum', 1, 'ativo', 1),
            (6, 'f6', 'Nada', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          connectionLimit: 8,
        });
        banco = drizzle(pool, { schema, mode: "default" });
        definirBancoMaquinas(banco);
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    throw new Error(ultimo || "MySQL descartável não subiu.");
  }, 120_000);

  afterAll(async () => {
    definirGanchoTravaMaquina(null);
    definirBancoMaquinas(null);
    await pool?.end();
    await exec("docker", ["rm", "-f", CONTAINER], { windowsHide: true }).catch(() => undefined);
  });

  it("administrador principal grava a máquina no próprio nome", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha());
    const detalhe = await maquinasOperacao.obter(sessao(1, "maquinas.visualizar"), gravado.id);
    expect(gravado.userId).toBe(1);
    expect(detalhe?.userId).toBe(1);
    expect(detalhe?.fazendaId).toBe(10);
    expect(detalhe?.nome).toBe("Trator Norte");
    expect(detalhe?.tipo).toBe("trator");
    expect(detalhe?.marca).toBe("Massey");
    expect(detalhe?.modelo).toBe("275");
    expect(detalhe?.ano).toBe(2018);
    expect(detalhe?.placa).toBe("TRT10");
    expect(detalhe?.horimetro).toBe("100");
    expect(detalhe?.tipoMedidor).toBe("horimetro");
    expect(detalhe?.status).toBe("ativo");
  });

  it("funcionário autorizado grava no titular e na fazenda concedida", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ nome: "Colheitadeira", placa: "COL20", fazendaId: 20 }));
    const detalhe = await maquinasOperacao.obter(sessao(2, "maquinas.visualizar"), gravado.id);
    expect(gravado.userId).toBe(1);
    expect(detalhe?.userId).toBe(1);
    expect(detalhe?.fazendaId).toBe(20);
    expect(detalhe?.nome).toBe("Colheitadeira");
  });

  it("funcionário sem permissão não cadastra", async () => {
    await limpar();
    await expect(maquinasOperacao.criar(sessao(6, "maquinas.criar"), ficha())).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_PERMISSAO,
    });
    expect(await contar()).toBe(0);
  });

  it("permissão de consulta não cadastra", async () => {
    await limpar();
    await expect(maquinasOperacao.criar(sessao(4, "maquinas.criar"), ficha())).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_PERMISSAO,
    });
    expect(await contar()).toBe(0);
  });

  it("fazenda não concedida fica de fora do cadastro e da lista", async () => {
    await limpar();
    await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ nome: "Sul", placa: "SUL20", fazendaId: 20 }));
    await expect(maquinasOperacao.criar(sessao(5, "maquinas.criar"), ficha({ nome: "Sul", placa: "SUL20", fazendaId: 20 }))).rejects.toMatchObject({
      message: MSG_MAQUINA_FAZENDA,
    });
    const lista = await maquinasOperacao.listar(sessao(5, "maquinas.visualizar"));
    expect(lista).toHaveLength(0);
  });

  it("outra conta não vê nem grava a máquina", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha());
    await pool.query(
      "INSERT INTO maquinas (userId, fazendaId, nome, status) VALUES (3, 30, 'Alheia', 'ativo')",
    );
    const lista = await maquinasOperacao.listar(sessao(3, "maquinas.visualizar"));
    expect(lista.map((item) => item.nome)).toEqual(["Alheia"]);
    expect(await maquinasOperacao.obter(sessao(3, "maquinas.visualizar"), gravado.id)).toBeNull();
    await expect(maquinasOperacao.criar(sessao(3, "maquinas.criar"), ficha({ fazendaId: 10 }))).rejects.toMatchObject({
      message: MSG_MAQUINA_NAO_ENCONTRADA,
    });
  });

  it("a listagem do funcionário traz só a fazenda concedida", async () => {
    await limpar();
    await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha({ nome: "Norte", placa: "N1" }));
    await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha({ nome: "Sul", placa: "S1", fazendaId: 20 }));
    await pool.query("INSERT INTO maquinas (userId, fazendaId, nome, status) VALUES (1, NULL, 'Sem Terra', 'ativo')");
    const doFuncionario = await maquinasOperacao.listar(sessao(5, "maquinas.visualizar"));
    expect(doFuncionario.map((item) => item.nome)).toEqual(["Norte"]);
    const doPrincipal = await maquinasOperacao.listar(sessao(1, "maquinas.visualizar"));
    expect(doPrincipal.map((item) => item.nome).sort()).toEqual(["Norte", "Sem Terra", "Sul"]);
  });

  it("o detalhe de outra fazenda vem vazio", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha({ fazendaId: 20, nome: "Sul", placa: "S1" }));
    expect(await maquinasOperacao.obter(sessao(5, "maquinas.visualizar"), gravado.id)).toBeNull();
    expect((await maquinasOperacao.obter(sessao(2, "maquinas.visualizar"), gravado.id))?.nome).toBe("Sul");
  });

  it("nome ativo repetido na mesma fazenda é recusado", async () => {
    await limpar();
    await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await expect(maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ placa: "OUTRA" }))).rejects.toMatchObject({
      message: MSG_MAQUINA_NOME,
    });
    expect(await contar()).toBe(1);
  });

  it("placa ativa repetida na mesma fazenda é recusada", async () => {
    await limpar();
    await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ placa: "abc 1" }));
    await expect(maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ nome: "Outra", placa: "ABC1" }))).rejects.toMatchObject({
      message: MSG_MAQUINA_PLACA,
    });
    expect(await contar()).toBe(1);
  });

  it("máquina inativa libera o nome e a placa", async () => {
    await limpar();
    const antiga = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await maquinasOperacao.inativar(sessao(2, "maquinas.inativar"), antiga.id);
    const nova = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    expect(nova.id).not.toBe(antiga.id);
    expect(await contar()).toBe(2);
    expect((await linha(antiga.id))?.status).toBe("inativo");
    expect((await linha(nova.id))?.status).toBe("ativo");
  });

  it("dois cadastros iguais ao mesmo tempo deixam uma máquina", async () => {
    await limpar();
    let segunda: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      segunda = maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
      await pausa();
      expect(await contar()).toBe(0);
    });
    const primeira = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha());
    await expect(segunda).rejects.toMatchObject({ message: MSG_MAQUINA_NOME });
    definirGanchoTravaMaquina(null);
    expect(primeira.userId).toBe(1);
    expect(await contar()).toBe(1);
  }, 20_000);

  it("dois cadastros diferentes passam juntos", async () => {
    await limpar();
    let segunda: Promise<{ id: number; userId: number }> = Promise.resolve({ id: 0, userId: 0 });
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      segunda = maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ nome: "Plantadeira", placa: "PLT2" }));
      await pausa();
      expect(await contar()).toBe(0);
    });
    const primeira = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha());
    const outra = await segunda;
    definirGanchoTravaMaquina(null);
    expect(outra.id).not.toBe(primeira.id);
    expect(outra.userId).toBe(1);
    expect(await contar()).toBe(2);
  }, 20_000);

  it("a edição troca o nome e o hodômetro sem trocar o titular", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ tipoMedidor: "quilometragem", horimetro: "10" }));
    const editado = await maquinasOperacao.editar(
      sessao(2, "maquinas.editar"),
      gravado.id,
      { nome: "Trator Revisado", horimetro: "25", tipoMedidor: "quilometragem", userId: 2 },
      { nome: "Trator Revisado", placa: "TRT10", fazendaId: 10 },
    );
    expect(editado.maquina.userId).toBe(1);
    expect(editado.maquina.nome).toBe("Trator Revisado");
    expect(editado.maquina.horimetro).toBe("25");
    expect(editado.maquina.fazendaId).toBe(10);
  });

  it("mudar de fazenda exige as duas e preserva abastecimento e manutenção", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId, horimetro, valorTotal) VALUES (1, ?, '2026-11-22', 'diesel', 40, 10, '100', 200)",
      [gravado.id],
    );
    await pool.query(
      "INSERT INTO manutencoes (userId, maquinaId, tipo, data, custo, horimetro, valorTotal) VALUES (1, ?, 'preventiva', '2026-11-22', 80, '100', 80)",
      [gravado.id],
    );
    await expect(maquinasOperacao.editar(
      sessao(5, "maquinas.editar"),
      gravado.id,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: "TRT10", fazendaId: 20 },
    )).rejects.toMatchObject({ message: MSG_MAQUINA_SEM_PERMISSAO });
    const mudou = await maquinasOperacao.editar(
      sessao(2, "maquinas.editar"),
      gravado.id,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: "TRT10", fazendaId: 20 },
    );
    expect(mudou.maquina.fazendaId).toBe(20);
    expect(mudou.maquina.userId).toBe(1);
    const [ab] = await pool.query("SELECT fazendaId, valorTotal, horimetro FROM abastecimentos WHERE maquinaId = ?", [gravado.id]);
    const [man] = await pool.query("SELECT custo, horimetro FROM manutencoes WHERE maquinaId = ?", [gravado.id]);
    expect(Number((ab as Array<{ fazendaId: number }>)[0]?.fazendaId)).toBe(10);
    expect(Number((ab as Array<{ valorTotal: string }>)[0]?.valorTotal)).toBe(200);
    expect((ab as Array<{ horimetro: string }>)[0]?.horimetro).toBe("100");
    expect(Number((man as Array<{ custo: string }>)[0]?.custo)).toBe(80);
    expect((man as Array<{ horimetro: string }>)[0]?.horimetro).toBe("100");
    expect((await linha(gravado.id))?.fazendaId).toBe(20);
  });

  it("edição e inativação juntas deixam um cadastro coerente", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    let edicao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      edicao = maquinasOperacao.editar(
        sessao(2, "maquinas.editar"),
        gravado.id,
        { nome: "Trator Parado" },
        { nome: "Trator Parado", placa: "TRT10", fazendaId: 10 },
      );
      await pausa();
      expect((await linha(gravado.id))?.status).toBe("ativo");
    });
    await maquinasOperacao.inativar(sessao(2, "maquinas.inativar"), gravado.id);
    await edicao;
    definirGanchoTravaMaquina(null);
    const final = await linha(gravado.id);
    expect(final?.status).toBe("inativo");
    expect(final?.nome).toBe("Trator Parado");
    expect(final?.userId).toBe(1);
    expect(await contar()).toBe(1);
  }, 20_000);

  it("reativar devolve a máquina ativa sem apagar o abastecimento", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId) VALUES (1, ?, '2026-11-22', 'diesel', 10, 10)",
      [gravado.id],
    );
    await maquinasOperacao.inativar(sessao(2, "maquinas.inativar"), gravado.id);
    await maquinasOperacao.reativar(sessao(2, "maquinas.inativar"), gravado.id);
    const final = await linha(gravado.id);
    expect(final?.id).toBe(gravado.id);
    expect(final?.status).toBe("ativo");
    expect(final?.dataDesativacao).toBeNull();
    expect(await contar("abastecimentos")).toBe(1);
  });

  it("exclusão sem histórico apaga só o cadastro", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    const pode = await maquinasOperacao.podeExcluir(sessao(2, "maquinas.visualizar"), gravado.id);
    expect(pode.podeExcluir).toBe(true);
    await maquinasOperacao.excluir(sessao(2, "maquinas.inativar"), gravado.id);
    expect(await contar()).toBe(0);
  });

  it("exclusão com abastecimento ou manutenção é recusada", async () => {
    await limpar();
    const comAbastecimento = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId) VALUES (1, ?, '2026-11-22', 'diesel', 10, 10)",
      [comAbastecimento.id],
    );
    await expect(maquinasOperacao.excluir(sessao(2, "maquinas.inativar"), comAbastecimento.id)).rejects.toMatchObject({
      message: MSG_MAQUINA_COM_VINCULOS,
    });
    expect((await maquinasOperacao.podeExcluir(sessao(2, "maquinas.visualizar"), comAbastecimento.id)).podeExcluir).toBe(false);
    const comManutencao = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ nome: "Grade", placa: "GRD2" }));
    await pool.query(
      "INSERT INTO manutencoes (userId, maquinaId, tipo, data, custo) VALUES (1, ?, 'corretiva', '2026-11-22', 15)",
      [comManutencao.id],
    );
    await expect(maquinasOperacao.excluir(sessao(1, "maquinas.inativar"), comManutencao.id)).rejects.toMatchObject({
      message: MSG_MAQUINA_COM_VINCULOS,
    });
    expect(await contar()).toBe(2);
    expect(await contar("abastecimentos")).toBe(1);
    expect(await contar("manutencoes")).toBe(1);
  });

  it("consulta de vínculo não entrega máquina de outra fazenda", async () => {
    await limpar();
    const norte = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha({ nome: "Norte", placa: "N1" }));
    const sul = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha({ nome: "Sul", placa: "S1", fazendaId: 20 }));
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId) VALUES (1, ?, '2026-11-22', 'diesel', 5, 20)",
      [sul.id],
    );
    const ids = await maquinasOperacao.idsComVinculo(sessao(5, "maquinas.visualizar"));
    expect(ids).not.toContain(sul.id);
    expect(ids).not.toContain(norte.id);
    const doAmbos = await maquinasOperacao.idsComVinculo(sessao(2, "maquinas.visualizar"));
    expect(doAmbos).toEqual([sul.id]);
    await expect(maquinasOperacao.podeExcluir(sessao(5, "maquinas.visualizar"), sul.id)).rejects.toMatchObject({
      message: MSG_MAQUINA_NAO_ENCONTRADA,
    });
  });

  it("duas leituras de horímetro ao mesmo tempo deixam um valor", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ horimetro: "100" }));
    let segunda: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      segunda = maquinasOperacao.editar(
        sessao(2, "maquinas.editar"),
        gravado.id,
        { horimetro: "300" },
        { nome: "Trator Norte", placa: "TRT10", fazendaId: 10 },
      );
      await pausa();
      expect((await linha(gravado.id))?.horimetro).toBe("100");
    });
    await maquinasOperacao.editar(
      sessao(1, "maquinas.editar"),
      gravado.id,
      { horimetro: "200" },
      { nome: "Trator Norte", placa: "TRT10", fazendaId: 10 },
    );
    await segunda;
    definirGanchoTravaMaquina(null);
    expect((await linha(gravado.id))?.horimetro).toBe("300");
    expect(await contar()).toBe(1);
  }, 20_000);

  it("permissão revogada impede a próxima gravação", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'maquinas.editar'");
    await expect(maquinasOperacao.editar(
      sessao(2, "maquinas.editar"),
      gravado.id,
      { nome: "Sumiu" },
      { nome: "Sumiu", placa: "TRT10", fazendaId: 10 },
    )).rejects.toMatchObject({ message: MSG_MAQUINA_SEM_PERMISSAO });
    expect((await linha(gravado.id))?.nome).toBe("Trator Norte");
  });

  it("fazenda revogada impede a próxima gravação", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha({ fazendaId: 20, placa: "SUL" }));
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
    await expect(maquinasOperacao.inativar(sessao(2, "maquinas.inativar"), gravado.id)).rejects.toMatchObject({
      message: MSG_MAQUINA_FAZENDA,
    });
    expect((await linha(gravado.id))?.status).toBe("ativo");
  });

  it("sessão revogada impede a próxima gravação", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha());
    await pool.query("UPDATE users SET sessionVersion = 2 WHERE id = 2");
    await expect(maquinasOperacao.reativar(sessao(2, "maquinas.inativar"), gravado.id)).rejects.toMatchObject({
      message: "Sessão inválida.",
    });
    expect((await linha(gravado.id))?.status).toBe("ativo");
  });

  it("falha antes do commit não deixa máquina", async () => {
    await limpar();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      throw new Error("falha antes do commit");
    });
    await expect(maquinasOperacao.criar(sessao(2, "maquinas.criar"), ficha())).rejects.toThrow("falha antes do commit");
    definirGanchoTravaMaquina(null);
    expect(await contar()).toBe(0);
  });

  it("deadlock desfaz a operação disputada", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha({ horimetro: "100" }));
    let erroOutra = "";
    let outra: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      outra = (async () => {
        const conn = await mysql.createConnection({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
        });
        try {
          await conn.beginTransaction();
          await conn.query("SELECT id FROM maquinas WHERE id = ? FOR UPDATE", [gravado.id]);
          await conn.query("SELECT id FROM fazendas WHERE id = 10 FOR UPDATE");
          await conn.rollback();
        } catch (erro) {
          erroOutra = erro instanceof Error ? erro.message : String(erro);
          await conn.rollback().catch(() => undefined);
        } finally {
          await conn.end();
        }
      })();
      await pausa();
    });
    let erroServico = "";
    try {
      await maquinasOperacao.editar(
        sessao(1, "maquinas.editar"),
        gravado.id,
        { horimetro: "999" },
        { nome: "Trator Norte", placa: "TRT10", fazendaId: 10 },
      );
    } catch (erro) {
      erroServico = erro instanceof Error ? erro.message : String(erro);
    }
    await outra;
    definirGanchoTravaMaquina(null);
    const final = await linha(gravado.id);
    expect(final?.userId).toBe(1);
    expect(final?.fazendaId).toBe(10);
    expect(["100", "999"]).toContain(final?.horimetro);
    expect(erroServico === MSG_ESTOQUE_DISPUTADO || erroOutra.length > 0).toBe(true);
    expect(await contar()).toBe(1);
  }, 20_000);

  it("banco fora do ar recusa consulta e cadastro", async () => {
    await limpar();
    const fechado = mysql.createPool({
      host: "127.0.0.1",
      port: 9,
      user: "root",
      password: "fechada",
      database: "fd_teste_nao_conectar",
      connectionLimit: 1,
      connectTimeout: 800,
    });
    definirBancoMaquinas(drizzle(fechado, { schema, mode: "default" }));
    await expect(maquinasOperacao.listar(sessao(1, "maquinas.visualizar"))).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_MYSQL,
    });
    await expect(maquinasOperacao.criar(sessao(1, "maquinas.criar"), ficha())).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_MYSQL,
    });
    await expect(maquinasOperacao.inativar(sessao(1, "maquinas.inativar"), 1)).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_MYSQL,
    });
    definirBancoMaquinas(banco);
    await fechado.end();
    expect(await contar()).toBe(0);
  });

  it("o modelo e a conferência de fazenda usam a permissão de cadastro", async () => {
    await limpar();
    const acesso = await maquinasOperacao.exigirFazenda(sessao(2, "maquinas.criar"), 10);
    expect(acesso.titularUserId).toBe(1);
    expect(acesso.executorUserId).toBe(2);
    await maquinasOperacao.exigirPermissao(sessao(5, "maquinas.criar"));
    await expect(maquinasOperacao.exigirPermissao(sessao(6, "maquinas.criar"))).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_PERMISSAO,
    });
    await expect(maquinasOperacao.exigirFazenda(sessao(5, "maquinas.criar"), 20)).rejects.toMatchObject({
      message: MSG_MAQUINA_FAZENDA,
    });
  });
});
