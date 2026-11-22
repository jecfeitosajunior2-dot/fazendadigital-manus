import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { env } from "./_core/env";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { analisarPlanilhaParaImportar, importarPlanilhaMaquinas } from "./maquinasImportacao";
import {
  definirBancoMaquinas,
  definirGanchoTravaMaquina,
  maquinasOperacao,
  MSG_MAQUINA_COM_VINCULOS,
  MSG_MAQUINA_FAZENDA,
  MSG_MAQUINA_INATIVA,
  MSG_MAQUINA_NAO_ENCONTRADA,
  MSG_MAQUINA_NOME,
  MSG_MAQUINA_SEM_MYSQL,
  MSG_MAQUINA_SEM_PERMISSAO,
  MSG_MAQUINA_TRANSFERENCIA,
  type SessaoOperacao,
} from "./maquinasOperacao";

if (!env.DATABASE_URL || env.DATABASE_URL.includes(":3306") || env.DATABASE_URL.includes("fazenda_digital")) {
  throw new Error("Este teste não usa o banco da fazenda.");
}

const exec = promisify(execFile);
const CONTAINER = "fd-h4bp-maquina";
const PORTA = 3394;
const SENHA = "isolado-h4bp";
const BANCO = "fd_h4bp";

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

function sessao(executorId: number, permissaoId: SessaoOperacao["permissaoId"], versao: number | null = 1): SessaoOperacao {
  return { executorId, sessionVersionDaSessao: versao, permissaoId };
}

function linhaPlanilha(nome: string, placa: string, extra: Record<string, string> = {}) {
  return {
    nome,
    tipo: "Máquinas",
    marca: "Massey Ferguson",
    tipoMedidor: "Horímetro",
    leituraInicial: "10",
    placa,
    ...extra,
  };
}

function pausa() {
  return new Promise((resolver) => setTimeout(resolver, 450));
}

describe("contrato da importação e da exclusão", () => {
  it("a tela não anuncia importação concluída quando há linha rejeitada", () => {
    const tela = readFileSync(new URL("../client/src/components/ImportarMaquinariosModal.tsx", import.meta.url), "utf8");
    expect(tela).toContain("A importação não foi concluída.");
    expect(tela).not.toContain("Importação concluída com avisos");
  });

  it("a importação grava o lote inteiro e a conferência da máquina não usa arquivo local", () => {
    const rotas = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const inicio = rotas.indexOf("Importa maquinários em lote");
    const fim = rotas.indexOf("ABASTECIMENTOS ROUTER", inicio);
    const bloco = rotas.slice(inicio, fim);
    expect(bloco).toContain("importarPlanilhaMaquinas");
    expect(bloco).toContain("rejeitados: 0");
    expect(bloco).not.toContain("já gravadas permanecem");
    const confere = rotas.slice(rotas.indexOf("async function assertMaquinaAtivaParaOperacao"), rotas.indexOf("const MSG_MAQUINA_COM_VINCULOS"));
    expect(confere).not.toContain("getLocalMaquina");
    expect(confere).toContain("afirmarOperavel");
  });
});

describe.sequential("importação e exclusão de máquinas no mysql descartável", () => {
  let pool: mysql.Pool;
  let banco: ReturnType<typeof drizzle<typeof schema>>;

  async function contar(tabela = "maquinas", where = "") {
    const [linhas] = await pool.query(`SELECT COUNT(*) AS n FROM ${tabela} ${where}`);
    return Number((linhas as Array<{ n: number }>)[0]?.n);
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
        (2, 1, 'abastecimentos.criar', 1),
        (2, 1, 'manutencoes.criar', 1),
        (5, 1, 'maquinas.criar', 1),
        (5, 1, 'maquinas.visualizar', 1)
    `);
    await pool.query("DELETE FROM usuario_fazendas");
    await pool.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (5, 10, 1)
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
            (5, 'f5', 'Uma', 'user', 'comum', 1, 'ativo', 1);
          INSERT INTO fazendas (id, userId, nome) VALUES
            (10, 1, 'Norte'), (20, 1, 'Sul'), (30, 3, 'Alheia');
        `);
        await conn.end();
        pool = mysql.createPool({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO, connectionLimit: 8,
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

  it("dez máquinas entram juntas e ficam no nome do titular", async () => {
    await limpar();
    const linhas = Array.from({ length: 10 }, (_, i) => linhaPlanilha(`Maquina ${i + 1}`, `PLC${i + 1}`));
    const gravado = await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, linhas);
    expect(gravado.importados).toBe(10);
    expect(gravado.rejeitados).toBe(0);
    expect(gravado.userId).toBe(1);
    expect(await contar()).toBe(10);
    const [donos] = await pool.query("SELECT DISTINCT userId AS id, fazendaId FROM maquinas");
    expect(donos).toEqual([{ id: 1, fazendaId: 10 }]);
  });

  it("a sexta máquina com erro impede o lote inteiro", async () => {
    await limpar();
    const linhas = Array.from({ length: 10 }, (_, i) => linhaPlanilha(`Maquina ${i + 1}`, `PLC${i + 1}`));
    linhas[5] = linhaPlanilha("Maquina 6", "PLC6", { marca: "" });
    await expect(importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, linhas)).rejects.toMatchObject({
      message: expect.stringContaining("linha 7"),
    });
    expect(await contar()).toBe(0);
    const previa = analisarPlanilhaParaImportar(linhas);
    expect(previa.erros[0]?.linha).toBe(7);
    expect(previa.prontas).toHaveLength(9);
  });

  it("nome repetido e placa repetida são restrições separadas", async () => {
    await limpar();
    await expect(importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, [
      linhaPlanilha("Trator Norte", "AAA"),
      linhaPlanilha("trator norte", "BBB"),
    ])).rejects.toThrow(MSG_MAQUINA_NOME);
    expect(await contar()).toBe(0);
    await expect(importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, [
      linhaPlanilha("Um", "abc 1"),
      linhaPlanilha("Dois", "ABC1"),
    ])).rejects.toThrow(/identificação/i);
    expect(await contar()).toBe(0);
    const gravado = await importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, [
      linhaPlanilha("Sem Placa A", ""),
      linhaPlanilha("Sem Placa B", ""),
    ]);
    expect(gravado.importados).toBe(2);
  });

  it("o reenvio da mesma planilha não cria outra máquina", async () => {
    await limpar();
    const linhas = [linhaPlanilha("Trator Norte", "TRT10"), linhaPlanilha("Grade", "GRD1")];
    await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, linhas);
    await expect(importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, linhas)).rejects.toThrow(MSG_MAQUINA_NOME);
    expect(await contar()).toBe(2);
    const outras = await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("Plantadeira", "PLT1")]);
    expect(outras.importados).toBe(1);
    expect(await contar()).toBe(3);
  });

  it("funcionário sem a fazenda e outra conta não importam o lote", async () => {
    await limpar();
    await expect(importarPlanilhaMaquinas(sessao(5, "maquinas.criar"), 20, [linhaPlanilha("Sul", "S1")])).rejects.toMatchObject({
      message: MSG_MAQUINA_FAZENDA,
    });
    await expect(importarPlanilhaMaquinas(sessao(3, "maquinas.criar"), 10, [linhaPlanilha("Alheia", "A1")])).rejects.toMatchObject({
      message: MSG_MAQUINA_NAO_ENCONTRADA,
    });
    const daOutra = await importarPlanilhaMaquinas(sessao(3, "maquinas.criar"), 30, [linhaPlanilha("Da Outra", "O1")]);
    expect(daOutra.userId).toBe(3);
    const [lista] = await pool.query("SELECT userId, fazendaId, nome FROM maquinas");
    expect(lista).toEqual([{ userId: 3, fazendaId: 30, nome: "Da Outra" }]);
  });

  it("duas importações diferentes na mesma fazenda passam juntas", async () => {
    await limpar();
    let segunda: Promise<{ importados: number }> = Promise.resolve({ importados: 0 });
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      segunda = importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, [linhaPlanilha("Segunda", "S2")]);
      await pausa();
      expect(await contar()).toBe(0);
    });
    const primeira = await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("Primeira", "P1")]);
    const outra = await segunda;
    definirGanchoTravaMaquina(null);
    expect(primeira.importados).toBe(1);
    expect(outra.importados).toBe(1);
    expect(await contar()).toBe(2);
  }, 20_000);

  it("importação e cadastro do mesmo nome deixam uma máquina", async () => {
    await limpar();
    let cadastro: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      cadastro = maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
        fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "10", placa: "TRT10",
      });
      await pausa();
      expect(await contar()).toBe(0);
    });
    await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("Trator Norte", "OUTRA")]);
    await expect(cadastro).rejects.toThrow(MSG_MAQUINA_NOME);
    definirGanchoTravaMaquina(null);
    expect(await contar()).toBe(1);
  }, 20_000);

  it("importação contra reativação deixa um nome ativo", async () => {
    await limpar();
    const antiga = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    await maquinasOperacao.inativar(sessao(1, "maquinas.inativar"), antiga.id);
    let reativar: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      reativar = maquinasOperacao.reativar(sessao(2, "maquinas.inativar"), antiga.id);
      await pausa();
      expect(await contar("maquinas", "WHERE status = 'ativo'")).toBe(0);
    });
    await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("Trator Norte", "NOVA")]);
    await expect(reativar).rejects.toThrow(MSG_MAQUINA_NOME);
    definirGanchoTravaMaquina(null);
    expect(await contar("maquinas", "WHERE status = 'ativo'")).toBe(1);
    expect(await contar()).toBe(2);
  }, 20_000);

  it("importação contra edição do mesmo nome deixa um cadastro", async () => {
    await limpar();
    const atual = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    let edicao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      edicao = maquinasOperacao.editar(
        sessao(2, "maquinas.editar"),
        atual.id,
        { nome: "Plantadeira" },
        { nome: "Plantadeira", placa: "TRT10", fazendaId: 10 },
      );
      await pausa();
      expect((await pool.query("SELECT nome FROM maquinas WHERE id = ?", [atual.id]))[0]).toEqual([{ nome: "Trator Norte" }]);
    });
    await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("Plantadeira", "PLT")]);
    await expect(edicao).rejects.toThrow(MSG_MAQUINA_NOME);
    definirGanchoTravaMaquina(null);
    expect(await contar()).toBe(2);
    const [nomes] = await pool.query("SELECT nome FROM maquinas ORDER BY nome");
    expect((nomes as Array<{ nome: string }>).map((item) => item.nome)).toEqual(["Plantadeira", "Trator Norte"]);
  }, 20_000);

  it("duas fazendas recebem lotes diferentes ao mesmo tempo", async () => {
    await limpar();
    let sul: Promise<{ userId: number }> = Promise.resolve({ userId: 0 });
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      sul = importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 20, [linhaPlanilha("Sul", "SUL")]);
      await pausa();
    });
    const norte = await importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("Norte", "NOR")]);
    const outra = await sul;
    definirGanchoTravaMaquina(null);
    expect(norte.userId).toBe(1);
    expect(outra.userId).toBe(1);
    expect(await contar()).toBe(2);
  }, 20_000);

  it("permissão, fazenda e sessão revogadas impedem a importação", async () => {
    await limpar();
    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2 AND permissao = 'maquinas.criar'");
    await expect(importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("A", "A1")])).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_PERMISSAO,
    });
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'maquinas.criar', 1)");
    await pool.query("DELETE FROM usuario_fazendas WHERE userId = 2 AND fazendaId = 20");
    await expect(importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 20, [linhaPlanilha("B", "B1")])).rejects.toMatchObject({
      message: MSG_MAQUINA_FAZENDA,
    });
    await pool.query("UPDATE users SET sessionVersion = 4 WHERE id = 2");
    await expect(importarPlanilhaMaquinas(sessao(2, "maquinas.criar"), 10, [linhaPlanilha("C", "C1")])).rejects.toMatchObject({
      message: "Sessão inválida.",
    });
    expect(await contar()).toBe(0);
  });

  it("falha antes do commit e erro na última linha não gravam máquina", async () => {
    await limpar();
    const linhas = [linhaPlanilha("Um", "U1"), linhaPlanilha("Dois", "D1"), linhaPlanilha("Tres", "T1", { tipo: "Tipo Inventado" })];
    await expect(importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, linhas)).rejects.toMatchObject({
      message: expect.stringContaining("linha 4"),
    });
    expect(await contar()).toBe(0);
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      throw new Error("falha antes do commit");
    });
    await expect(importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, [linhaPlanilha("Quatro", "Q1")])).rejects.toThrow("falha antes do commit");
    definirGanchoTravaMaquina(null);
    expect(await contar()).toBe(0);
  });

  it("histórico gravado com outro identificador impede a exclusão", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    await pool.query(
      "INSERT INTO abastecimentos (userId, maquinaId, data, combustivel, litros, fazendaId) VALUES (99, ?, '2026-11-22', 'diesel', 8, 10)",
      [gravado.id],
    );
    await expect(maquinasOperacao.excluir(sessao(1, "maquinas.inativar"), gravado.id)).rejects.toMatchObject({
      message: MSG_MAQUINA_COM_VINCULOS,
    });
    expect((await maquinasOperacao.podeExcluir(sessao(2, "maquinas.visualizar"), gravado.id)).podeExcluir).toBe(false);
    expect(await maquinasOperacao.idsComVinculo(sessao(5, "maquinas.visualizar"))).toEqual([gravado.id]);
    expect(await contar()).toBe(1);
    expect(await contar("abastecimentos")).toBe(1);
  });

  it("exclusão e manutenção não deixam lançamento órfão", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    let lancamento: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      lancamento = maquinasOperacao.lancarManutencao(sessao(2, "manutencoes.criar"), {
        maquinaId: gravado.id, data: "2026-11-22", tipo: "preventiva", custo: "40",
      });
      await pausa();
      expect(await contar()).toBe(1);
    });
    await maquinasOperacao.excluir(sessao(1, "maquinas.inativar"), gravado.id);
    await expect(lancamento).rejects.toMatchObject({ message: MSG_MAQUINA_NAO_ENCONTRADA });
    definirGanchoTravaMaquina(null);
    expect(await contar()).toBe(0);
    expect(await contar("manutencoes")).toBe(0);
  }, 20_000);

  it("manutenção iniciada impede a exclusão da máquina", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    let exclusao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      exclusao = maquinasOperacao.excluir(sessao(1, "maquinas.inativar"), gravado.id);
      await pausa();
      expect(await contar("manutencoes")).toBe(0);
    });
    const os = await maquinasOperacao.lancarManutencao(sessao(2, "manutencoes.criar"), {
      maquinaId: gravado.id, data: "2026-11-22", tipo: "corretiva", custo: "15",
    });
    await expect(exclusao).rejects.toMatchObject({ message: MSG_MAQUINA_COM_VINCULOS });
    definirGanchoTravaMaquina(null);
    expect(os.userId).toBe(1);
    expect(os.fazendaId).toBe(10);
    expect(await contar()).toBe(1);
    expect(await contar("manutencoes")).toBe(1);
  }, 20_000);

  it("exclusão e abastecimento não deixam lançamento órfão", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    let abastecer: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      abastecer = maquinasOperacao.lancarAbastecimento(sessao(2, "abastecimentos.criar"), {
        maquinaId: gravado.id, fazendaId: 10, litros: "20", data: "2026-11-22", combustivel: "diesel",
      });
      await pausa();
    });
    await maquinasOperacao.excluir(sessao(2, "maquinas.inativar"), gravado.id);
    await expect(abastecer).rejects.toMatchObject({ message: MSG_MAQUINA_NAO_ENCONTRADA });
    definirGanchoTravaMaquina(null);
    expect(await contar()).toBe(0);
    expect(await contar("abastecimentos")).toBe(0);

    const outra = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Grade", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "sem_medidor", placa: "GRD",
    });
    let exclusao: Promise<unknown> = Promise.resolve();
    definirGanchoTravaMaquina(async () => {
      definirGanchoTravaMaquina(null);
      exclusao = maquinasOperacao.excluir(sessao(1, "maquinas.inativar"), outra.id);
      await pausa();
    });
    const posto = await maquinasOperacao.lancarAbastecimento(sessao(2, "abastecimentos.criar"), {
      maquinaId: outra.id, fazendaId: 20, litros: "5", data: "2026-11-22", combustivel: "diesel",
    });
    await expect(exclusao).rejects.toMatchObject({ message: MSG_MAQUINA_COM_VINCULOS });
    definirGanchoTravaMaquina(null);
    expect(posto.userId).toBe(1);
    const [ab] = await pool.query("SELECT fazendaId, userId FROM abastecimentos WHERE maquinaId = ?", [outra.id]);
    expect(Number((ab as Array<{ fazendaId: number }>)[0]?.fazendaId)).toBe(20);
    expect(await contar()).toBe(1);
  }, 20_000);

  it("máquina inativa e de outra conta não recebem lançamento", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(1, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "1", placa: "TRT10",
    });
    await maquinasOperacao.inativar(sessao(1, "maquinas.inativar"), gravado.id);
    await expect(maquinasOperacao.lancarManutencao(sessao(2, "manutencoes.criar"), {
      maquinaId: gravado.id, data: "2026-11-22", tipo: "preventiva", custo: "1",
    })).rejects.toMatchObject({ message: MSG_MAQUINA_INATIVA });
    await expect(maquinasOperacao.lancarAbastecimento(sessao(3, "abastecimentos.criar"), {
      maquinaId: gravado.id, fazendaId: 30, litros: "1", data: "2026-11-22", combustivel: "diesel",
    })).rejects.toMatchObject({ message: MSG_MAQUINA_NAO_ENCONTRADA });
    expect(await contar("manutencoes")).toBe(0);
    expect(await contar("abastecimentos")).toBe(0);
  });

  it("manutenção sem fazenda própria bloqueia a transferência e preserva o custo", async () => {
    await limpar();
    const gravado = await maquinasOperacao.criar(sessao(2, "maquinas.criar"), {
      fazendaId: 10, nome: "Trator Norte", tipo: "Máquinas", marca: "Massey Ferguson", tipoMedidor: "horimetro", horimetro: "8", placa: "TRT10",
    });
    await maquinasOperacao.lancarManutencao(sessao(2, "manutencoes.criar"), {
      maquinaId: gravado.id, data: "2026-11-22", tipo: "preventiva", custo: "80",
    });
    await expect(maquinasOperacao.editar(
      sessao(2, "maquinas.editar"),
      gravado.id,
      { fazendaId: 20 },
      { nome: "Trator Norte", placa: "TRT10", fazendaId: 20 },
    )).rejects.toMatchObject({ message: MSG_MAQUINA_TRANSFERENCIA });
    const [maquina] = await pool.query("SELECT fazendaId FROM maquinas WHERE id = ?", [gravado.id]);
    const [os] = await pool.query("SELECT custo FROM manutencoes WHERE maquinaId = ?", [gravado.id]);
    expect(Number((maquina as Array<{ fazendaId: number }>)[0]?.fazendaId)).toBe(10);
    expect(Number((os as Array<{ custo: string }>)[0]?.custo)).toBe(80);
  });

  it("banco fora do ar não importa nem exclui", async () => {
    await limpar();
    const fechado = mysql.createPool({
      host: "127.0.0.1", port: 9, user: "root", password: "fechada", database: "fd_teste_nao_conectar",
      connectionLimit: 1, connectTimeout: 800,
    });
    definirBancoMaquinas(drizzle(fechado, { schema, mode: "default" }));
    await expect(importarPlanilhaMaquinas(sessao(1, "maquinas.criar"), 10, [linhaPlanilha("A", "A1")])).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_MYSQL,
    });
    await expect(maquinasOperacao.excluir(sessao(1, "maquinas.inativar"), 1)).rejects.toMatchObject({
      message: MSG_MAQUINA_SEM_MYSQL,
    });
    definirBancoMaquinas(banco);
    await fechado.end();
    expect(await contar()).toBe(0);
  });
});
