import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { unpackReproObservacoes } from "../shared/reproRegistroMeta";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_REPRO_MATRIZ_INELEGIVEL } from "../shared/reproCoberturaAlvo";
import {
  MSG_INSEMINACAO_COLETIVA,
  MSG_OPERACAO_DIVERGENTE,
  MSG_OPERACAO_OBRIGATORIA,
  registrarReproducaoColetivaAutorizada,
  type AnimalColetivoLinha,
  type ConsultaColetiva,
  type IoColetiva,
  type PedidoColetivo,
} from "./registrarReproducaoColetivaAutorizado";

const exec = promisify(execFile);
const raiz = dirname(fileURLToPath(import.meta.url));
const SQL_OPERACOES = readFileSync(join(raiz, "../drizzle/migrations/0067_reproducao_operacoes.sql"), "utf8")
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("--"))
  .join("\n");
const CONTAINER = "fd-h4ag-estacao";
const PORTA = 3357;
const SENHA = "isolado-h4ag";
const BANCO = "fd_h4ag";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL,
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL, concedidoPorUserId int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  fazendaId int NULL, pastoAtualId int NULL, ativo tinyint NOT NULL DEFAULT 1, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, loteId int NULL, pastoId int NULL,
  status varchar(20) NOT NULL, brinco varchar(40) NOT NULL, nome varchar(80) NULL,
  sexo varchar(10) NULL, categoria varchar(40) NULL, dataNascimento date NULL, castrado tinyint NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL, machoId int NULL,
  tipo varchar(40) NOT NULL, dataCobertura date NOT NULL, resultado varchar(40) NULL,
  observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

describe.sequential("estação e cobertura no MySQL isolado", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker("run", "-d", "--name", CONTAINER, "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`, "-e", `MYSQL_DATABASE=${BANCO}`, "-p", `127.0.0.1:${PORTA}:3306`, "mysql:8.4");
    const prazo = Date.now() + 90_000;
    let ultimo = "";
    while (Date.now() < prazo) {
      try {
        const conn = await mysql.createConnection({
          host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
          multipleStatements: true, dateStrings: true,
        });
        await conn.query("SELECT 1 AS ok");
        await conn.query(ESQUEMA);
        await conn.query(`
          INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (1, 'principal-isolado', 'Administrador da conta', NULL, 'admin', 'principal', 1, 'ativo', 3),
            (2, 'funcionario-isolado', 'Funcionario Curral', NULL, 'user', 'comum', 1, 'ativo', 1),
            (3, 'sem-repro-isolado', 'So cadastra animal', NULL, 'user', 'comum', 1, 'ativo', 1),
            (4, 'outro-titular-isolado', 'Outra Conta', NULL, 'admin', 'principal', 4, 'ativo', 1),
            (5, 'outra-fazenda-isolado', 'So a outra fazenda', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
        await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (5, 20, 1)");
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'reproducao.criar', 1), (3, 1, 'animais.criar', 1), (5, 1, 'reproducao.criar', 1)
        `);
        await conn.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, ativo) VALUES (100, 1, 'Maternidade', 10, 1000, 1), (200, 1, 'Retiro', 20, 2000, 1), (300, 1, 'Fechado', 10, 1000, 0)");
        await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral'), (2000, 1, 20, 'Retiro')");
        await conn.query(`
          INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
            (6, 'colega-isolado', 'Colega Curral', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (6, 10, 1)");
        await conn.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (6, 1, 'reproducao.criar', 1)");
        await conn.query(
          "INSERT INTO reproducao_registros (id, userId, femeaId, machoId, tipo, dataCobertura, resultado, observacoes) VALUES (900, 1, 80, 80, 'Estação de monta', '2020-01-01', 'Realizado', 'historica')",
        );
        await conn.query(SQL_OPERACOES);
        const [indice] = await conn.query<RowDataPacket[]>(
          "SHOW INDEX FROM reproducao_operacoes WHERE Key_name = 'reproducao_operacoes_titular_chave_uq'",
        );
        if (indice.length < 2) throw new Error("A chave única da operação não foi criada.");
        const [colunas] = await conn.query<RowDataPacket[]>("SHOW COLUMNS FROM reproducao_registros");
        if (colunas.some((coluna) => String(coluna.Field) === "chave")) throw new Error("A migração alterou o histórico.");
        const [antiga] = await conn.query<RowDataPacket[]>("SELECT id, observacoes FROM reproducao_registros WHERE id = 900");
        if (antiga[0]?.observacoes !== "historica") throw new Error("O lançamento antigo não foi preservado.");
        const [vazia] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM reproducao_operacoes");
        if (Number(vazia[0]?.n) !== 0) throw new Error("A migração inventou chave para o passado.");
        await conn.end();
        break;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : String(erro);
        await new Promise((resolver) => setTimeout(resolver, 1500));
      }
    }
    try {
      pool = mysql.createPool({
        host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
        dateStrings: true, connectionLimit: 8,
      });
      await pool.query("SELECT 1 AS ok");
    } catch (erro) {
      throw new Error(`MySQL isolado não respondeu. ${ultimo} ${erro instanceof Error ? erro.message : ""}`);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM reproducao_operacoes");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM animais");
    await pool.query(`
      INSERT INTO animais
        (id, userId, fazendaId, loteId, pastoId, status, brinco, sexo, categoria, dataNascimento, castrado) VALUES
        (17, 1, 10, 100, 1000, 'ativo', 'V17', 'femea', 'Vaca', '2018-01-01', 0),
        (18, 1, 10, 100, 1000, 'morto', 'V18', 'femea', 'Vaca', '2018-01-01', 0),
        (19, 1, 10, 100, 1000, 'ativo', 'V19', 'femea', 'Bezerra', '2026-01-01', 0),
        (21, 1, 10, 100, 1000, 'ativo', 'V21', 'femea', 'Vaca', '2018-01-01', 0),
        (33, 1, 20, 200, 2000, 'ativo', 'V33', 'femea', 'Vaca', '2018-01-01', 0),
        (80, 1, 10, 100, 1000, 'ativo', 'T80', 'macho', 'Boi', '2016-01-01', 0),
        (81, 1, 10, 100, 1000, 'ativo', 'T81', 'macho', 'Boi', '2016-01-01', 0),
        (82, 1, 10, 100, 1000, 'ativo', 'T82', 'macho', 'Boi', '2016-01-01', 1),
        (90, 4, 40, NULL, NULL, 'ativo', 'A90', 'macho', 'Boi', '2016-01-01', 0)
    `);
    await pool.query("INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, status) VALUES (1, 18, 10, 'morte', '2026-11-01', 'ativa')");
  });

  function io(extra?: Partial<Pick<ConsultaColetiva, "aposTravas" | "aposPrincipal" | "aposEspelho">>): IoColetiva {
    return {
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          const tx = consultas(conn);
          Object.assign(tx, extra);
          const resultado = await fn(tx);
          await conn.commit();
          return resultado;
        } catch (erro) {
          await conn.rollback();
          throw erro;
        } finally {
          conn.release();
        }
      },
    };
  }

  it("grava estação, segundo touro, cobertura e ignora quem já entrou no dia", async () => {
    const principal = await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3));
    expect(principal).toMatchObject({ ok: true, titularUserId: 1, espelhosMatriz: 2, matrizesIgnoradas: 0 });
    if (!principal.ok) return;
    const [estacao] = (await pool.query<RowDataPacket[]>("SELECT userId, femeaId, machoId, tipo, observacoes FROM reproducao_registros WHERE id = ?", [principal.id]))[0];
    expect(estacao).toMatchObject({ userId: 1, femeaId: 80, machoId: 80, tipo: "Estação de monta" });
    expect(unpackReproObservacoes(String(estacao?.observacoes)).coberturaAlvo?.loteId).toBe(100);
    const copias = (await pool.query<RowDataPacket[]>("SELECT userId, femeaId, machoId, tipo, observacoes FROM reproducao_registros WHERE tipo = 'Exposição à monta' ORDER BY femeaId"))[0];
    expect(copias).toHaveLength(2);
    expect(copias.every((linha) => linha.userId === 1 && linha.machoId === 80)).toBe(true);
    expect(copias.map((linha) => unpackReproObservacoes(String(linha.observacoes)).registroOrigemId)).toEqual([principal.id, principal.id]);

    const outroTouro = await registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, { animalId: 81, coberturaMatrizIds: [21] }));
    expect(outroTouro).toMatchObject({ ok: true, titularUserId: 1, espelhosMatriz: 1 });
    const cobertura = await registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, {
      animalId: 80, tipo: "Cobertura realizada", coberturaSelecaoModo: "individual", coberturaLoteId: undefined, coberturaMatrizIds: [17],
    }));
    expect(cobertura).toMatchObject({ ok: true, espelhosMatriz: 1 });
    if (cobertura.ok) expect(cobertura.copias[0]).toMatchObject({ tipo: "Cobertura", femeaId: 17, machoId: 80 });
    const repetida = await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [17, 21] }));
    expect(repetida).toMatchObject({ ok: true, espelhosMatriz: 0, matrizesIgnoradas: 2 });
    expect(await contar("reproducao_registros WHERE tipo = 'Exposição à monta' AND femeaId = 17 AND machoId = 80")).toBe(1);
  });

  it("recusa permissão, fazenda, titular, situação, data e sêmen sem gravar nada", async () => {
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(3, 1))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(5, 1))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { animalId: 90, fazendaId: 40, coberturaMatrizIds: [17] }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { animalId: 999 }))).ok).toBe(false);
    const matrizAlheia = await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [90] }));
    expect(matrizAlheia).toMatchObject({ mensagem: MSG_REPRO_MATRIZ_INELEGIVEL });
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [999] }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [18] }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [19] }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { animalId: 82 }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [17, 33] }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaLoteId: 200 }))).ok).toBe(false);
    expect((await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaLoteId: 300 }))).ok).toBe(false);
    await expect(registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { dataCobertura: "2099-01-01" }))).rejects.toThrow(/futura/);
    await expect(registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { dataCobertura: "ontem" }))).rejects.toThrow(/inválida/);
    await expect(registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, {
      tipo: "Inseminação", semenPartidaId: 4, coberturaMatrizIds: [17],
    }))).rejects.toMatchObject({ message: MSG_INSEMINACAO_COLETIVA });
    expect(await contar("reproducao_registros")).toBe(0);
  });

  it("serializa duas estações, a baixa, a transferência e a mesma matriz", async () => {
    const paralelas = await Promise.all([
      registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [17] })),
      registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, { animalId: 81, coberturaMatrizIds: [21] })),
    ]);
    expect(paralelas.filter((item) => item.ok)).toHaveLength(2);

    const mesma = await Promise.all([
      registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, {
        tipo: "Cobertura realizada", coberturaSelecaoModo: "individual", coberturaLoteId: undefined, coberturaMatrizIds: [17],
      })),
      registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, {
        tipo: "Cobertura realizada", coberturaSelecaoModo: "individual", coberturaLoteId: undefined, coberturaMatrizIds: [17],
      })),
    ]);
    expect(mesma.filter((item) => item.ok)).toHaveLength(1);
    expect(await contar("reproducao_registros WHERE tipo = 'Cobertura' AND femeaId = 17 AND machoId = 80")).toBe(1);

    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const estacao = registrarReproducaoColetivaAutorizada(io({ aposTravas: async () => { avisou(); await segue; } }), pedido(2, 1, { coberturaMatrizIds: [21] }));
    await travou;
    const baixa = await pool.getConnection();
    try {
      await baixa.query("SET innodb_lock_wait_timeout = 8");
      await baixa.beginTransaction();
      const espera = baixa.query("SELECT id FROM animais WHERE id = 21 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberar();
      await espera;
      await baixa.query("UPDATE animais SET status = 'morto' WHERE id = 21");
      await baixa.commit();
    } finally {
      baixa.release();
    }
    expect((await estacao).ok).toBe(true);
    expect(await contar("reproducao_registros WHERE tipo = 'Exposição à monta' AND femeaId = 21 AND userId = 1")).toBe(2);

    await pool.query("UPDATE animais SET status = 'ativo' WHERE id = 21");
    let liberarFazenda: () => void = () => undefined;
    const segueFazenda = new Promise<void>((resolver) => { liberarFazenda = resolver; });
    let avisouFazenda: () => void = () => undefined;
    const travouFazenda = new Promise<void>((resolver) => { avisouFazenda = resolver; });
    const transferida = registrarReproducaoColetivaAutorizada(io({ aposTravas: async () => { avisouFazenda(); await segueFazenda; } }), pedido(1, 3, {
      animalId: 81, coberturaMatrizIds: [17],
    }));
    await travouFazenda;
    const transf = await pool.getConnection();
    try {
      await transf.query("SET innodb_lock_wait_timeout = 8");
      await transf.beginTransaction();
      const espera = transf.query("SELECT id FROM animais WHERE id = 17 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberarFazenda();
      await espera;
      await transf.query("UPDATE animais SET fazendaId = 20 WHERE id = 17");
      await transf.commit();
    } finally {
      transf.release();
    }
    expect((await transferida).ok).toBe(true);
    const [copia] = (await pool.query<RowDataPacket[]>("SELECT userId, machoId FROM reproducao_registros WHERE tipo = 'Exposição à monta' AND femeaId = 17 AND machoId = 81"))[0];
    expect(copia).toMatchObject({ userId: 1, machoId: 81 });
  });

  it("desfaz o touro e as cópias quando uma etapa falha", async () => {
    await expect(registrarReproducaoColetivaAutorizada(io({ aposPrincipal: async () => { throw new Error("falha no touro"); } }), pedido(1, 3))).rejects.toThrow("falha no touro");
    await expect(registrarReproducaoColetivaAutorizada(io({
      aposEspelho: async (indice) => { if (indice === 1) throw new Error("falha na matriz"); },
    }), pedido(1, 3))).rejects.toThrow("falha na matriz");
    expect(await contar("reproducao_registros")).toBe(0);
    const depois = await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { coberturaMatrizIds: [17] }));
    expect(depois).toMatchObject({ ok: true, titularUserId: 1, espelhosMatriz: 1 });
    expect(await contar("reproducao_operacoes")).toBe(1);
  });

  it("segura a mesma chave, libera outro manejo e desfaz a chave junto com o touro", async () => {
    const chave = "33333333-3333-4333-8333-333333333333";
    const primeiro = await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { operacaoId: chave, responsavel: "Capataz" }));
    expect(primeiro).toMatchObject({ ok: true, repetida: false, espelhosMatriz: 2 });
    if (!primeiro.ok) return;
    const reenvio = await registrarReproducaoColetivaAutorizada(io(), pedido(6, 1, { operacaoId: chave, responsavel: "Capataz" }));
    expect(reenvio).toMatchObject({ ok: true, repetida: true, id: primeiro.id, espelhosMatriz: 2, matrizesIgnoradas: 0 });
    expect(await contar("reproducao_registros WHERE tipo = 'Estação de monta'")).toBe(1);
    expect(await contar("reproducao_registros WHERE tipo = 'Exposição à monta'")).toBe(2);
    expect(await contar("reproducao_operacoes")).toBe(1);

    const paralelo = await Promise.all([
      registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, { operacaoId: chave, responsavel: "Capataz" })),
      registrarReproducaoColetivaAutorizada(io(), pedido(6, 1, { operacaoId: chave, responsavel: "Capataz" })),
    ]);
    expect(paralelo.every((item) => item.ok && item.repetida && item.id === primeiro.id)).toBe(true);
    expect(await contar("reproducao_registros WHERE tipo = 'Estação de monta'")).toBe(1);

    const divergente = await registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, {
      operacaoId: chave, observacoes: "texto diferente",
    }));
    expect(divergente).toMatchObject({ mensagem: MSG_OPERACAO_DIVERGENTE });
    expect(await contar("reproducao_registros WHERE tipo = 'Estação de monta'")).toBe(1);

    const outroDiaLogico = await registrarReproducaoColetivaAutorizada(io(), pedido(2, 1, { animalId: 81, coberturaMatrizIds: [21] }));
    expect(outroDiaLogico).toMatchObject({ ok: true, repetida: false });
    expect(await contar("reproducao_registros WHERE tipo = 'Estação de monta'")).toBe(2);

    const chaveCorrida = "55555555-5555-4555-8555-555555555555";
    const corrida = await Promise.all([
      registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { operacaoId: chaveCorrida, animalId: 81, coberturaMatrizIds: [21] })),
      registrarReproducaoColetivaAutorizada(io(), pedido(6, 1, { operacaoId: chaveCorrida, animalId: 81, coberturaMatrizIds: [21] })),
    ]);
    expect(corrida.filter((item) => item.ok)).toHaveLength(2);
    const idCorrida = corrida.find((item) => item.ok && !item.repetida)?.id;
    expect(idCorrida).toBeTruthy();
    expect(corrida.every((item) => item.ok && item.id === idCorrida)).toBe(true);
    expect(await contar("reproducao_registros WHERE tipo = 'Estação de monta' AND femeaId = 81")).toBe(2);
    expect(await contar(`reproducao_operacoes WHERE chave = '${chaveCorrida}' AND registroPrincipalId = ${idCorrida}`)).toBe(1);

    await pool.query(
      "INSERT INTO reproducao_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash) VALUES (4, ?, 40, 4, 'abc')",
      [chave],
    );
    expect(await contar(`reproducao_operacoes WHERE chave = '${chave}'`)).toBe(2);
    await expect(pool.query(
      "INSERT INTO reproducao_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash) VALUES (1, ?, 10, 1, 'abc')",
      [chave],
    )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });

    const chaveFalha = "44444444-4444-4444-8444-444444444444";
    await expect(registrarReproducaoColetivaAutorizada(io({
      aposPrincipal: async () => { throw new Error("falha no touro"); },
    }), pedido(1, 3, { operacaoId: chaveFalha, animalId: 81, coberturaMatrizIds: [17] }))).rejects.toThrow("falha no touro");
    expect(await contar("reproducao_operacoes WHERE chave = '" + chaveFalha + "'")).toBe(0);
    const refeita = await registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, {
      operacaoId: chaveFalha, animalId: 81, coberturaMatrizIds: [17],
    }));
    expect(refeita).toMatchObject({ ok: true, repetida: false });
    expect(await contar("reproducao_operacoes WHERE chave = '" + chaveFalha + "'")).toBe(1);

    await expect(registrarReproducaoColetivaAutorizada(io(), pedido(1, 3, { operacaoId: "nao-e-uuid" }))).rejects.toMatchObject({
      message: MSG_OPERACAO_OBRIGATORIA,
    });

    const chaveDeadlock = "66666666-6666-4666-8666-666666666666";
    let tentativas = 0;
    const aposDeadlock = await registrarReproducaoColetivaAutorizada(io({
      aposPrincipal: async () => {
        tentativas += 1;
        if (tentativas === 1) {
          throw Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213, code: "ER_LOCK_DEADLOCK" });
        }
      },
    }), pedido(2, 1, { operacaoId: chaveDeadlock, coberturaMatrizIds: [17] }));
    expect(aposDeadlock).toMatchObject({ ok: true, repetida: false });
    expect(tentativas).toBe(2);
    expect(await contar(`reproducao_operacoes WHERE chave = '${chaveDeadlock}' AND registroPrincipalId IS NOT NULL`)).toBe(1);
  });

  async function contar(where: string) {
    const [linhas] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${where}`);
    return Number(linhas[0]?.n ?? 0);
  }
});

let chaveIsolada = 0;
function pedido(executorId: number, session: number, extra: Partial<PedidoColetivo["input"]> = {}): PedidoColetivo {
  chaveIsolada += 1;
  return {
    executorId,
    sessionVersionDaSessao: session,
    input: {
      animalId: 80,
      fazendaId: 10,
      tipo: "Estação de monta",
      dataCobertura: "2026-11-10",
      coberturaSelecaoModo: "lote",
      coberturaLoteId: 100,
      coberturaMatrizIds: [17, 21],
      responsavel: "Capataz",
      operacaoId: `00000000-0000-4000-8000-${String(chaveIsolada).padStart(12, "0")}`,
      ...extra,
    },
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaColetiva {
  return {
    async usuario(id): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id), openId: String(linha.openId), name: linha.name, email: linha.email,
        role: linha.role === "admin" ? "admin" : "user", papel: linha.papel,
        titularUserId: Number(linha.titularUserId), situacao: linha.situacao, sessionVersion: Number(linha.sessionVersion),
      };
    },
    async permissoes(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
        [userId, titularUserId],
      );
      return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
    },
    async fazendasDoTitular(titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE userId = ?", [titularUserId]);
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId) } : null;
    },
    async espiarAnimal(id) { return lerAnimal(conn, id, false); },
    async travaLote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, pastoAtualId, ativo, nome FROM lotes WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id), userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        pastoAtualId: linha.pastoAtualId == null ? null : Number(linha.pastoAtualId),
        ativo: Number(linha.ativo), nome: linha.nome == null ? null : String(linha.nome),
      };
    },
    async travaPasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: Number(linhas[0].fazendaId) } : null;
    },
    async travaAnimal(id) { return lerAnimal(conn, id, true); },
    async baixaAtiva(userId, animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE userId = ? AND animalId = ? AND status = 'ativa' FOR UPDATE",
        [userId, animalId],
      );
      return linhas[0] ? { dataBaixa: linhas[0].dataBaixa } : null;
    },
    async travaRegistros(userId, femeaIds) {
      if (femeaIds.length === 0) return [];
      const marcas = femeaIds.map(() => "?").join(", ");
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, femeaId, machoId, tipo, dataCobertura, observacoes, resultado
         FROM reproducao_registros WHERE userId = ? AND femeaId IN (${marcas}) ORDER BY id FOR UPDATE`,
        [userId, ...femeaIds],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        femeaId: Number(linha.femeaId),
        machoId: linha.machoId == null ? null : Number(linha.machoId),
        tipo: String(linha.tipo),
        dataCobertura: linha.dataCobertura,
        observacoes: linha.observacoes == null ? null : String(linha.observacoes),
        resultado: linha.resultado == null ? null : String(linha.resultado),
      }));
    },
    async inserirRegistro(row) {
      const [resultado] = await conn.query(
        `INSERT INTO reproducao_registros (userId, femeaId, machoId, tipo, dataCobertura, resultado, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.femeaId, row.machoId, row.tipo, row.dataCobertura, row.resultado ?? null, row.observacoes ?? null],
      );
      return Number((resultado as ResultSetHeader).insertId);
    },
    async atualizarObservacoes(id, userId, observacoes) {
      await conn.query("UPDATE reproducao_registros SET observacoes = ? WHERE id = ? AND userId = ?", [observacoes, id, userId]);
    },
    async reservarOperacao(row) {
      try {
        await conn.query(
          `INSERT INTO reproducao_operacoes
            (userId, chave, fazendaId, executorUserId, conteudoHash, espelhosMatriz, matrizesIgnoradas)
           VALUES (?, ?, ?, ?, ?, 0, 0)`,
          [row.userId, row.chave, row.fazendaId, row.executorUserId, row.conteudoHash],
        );
        return { situacao: "nova" as const };
      } catch (error) {
        const item = error as { errno?: number; code?: string };
        if (item.errno !== 1062 && item.code !== "ER_DUP_ENTRY") throw error;
        const [linhas] = await conn.query<RowDataPacket[]>(
          `SELECT conteudoHash, registroPrincipalId, espelhosMatriz, matrizesIgnoradas
           FROM reproducao_operacoes WHERE userId = ? AND chave = ? FOR UPDATE`,
          [row.userId, row.chave],
        );
        const linha = linhas[0];
        if (!linha || linha.registroPrincipalId == null || String(linha.conteudoHash) !== row.conteudoHash) {
          return { situacao: "divergente" as const };
        }
        return {
          situacao: "repetida" as const,
          registroPrincipalId: Number(linha.registroPrincipalId),
          espelhosMatriz: Number(linha.espelhosMatriz),
          matrizesIgnoradas: Number(linha.matrizesIgnoradas),
        };
      }
    },
    async concluirOperacao(row) {
      const [resultado] = await conn.query<ResultSetHeader>(
        `UPDATE reproducao_operacoes
         SET registroPrincipalId = ?, espelhosMatriz = ?, matrizesIgnoradas = ?
         WHERE userId = ? AND chave = ? AND registroPrincipalId IS NULL`,
        [row.registroPrincipalId, row.espelhosMatriz, row.matrizesIgnoradas, row.userId, row.chave],
      );
      if (resultado.affectedRows !== 1) throw new Error("operação reprodutiva não vinculada");
    },
  };
}

async function lerAnimal(conn: mysql.PoolConnection, id: number, travar: boolean): Promise<AnimalColetivoLinha | null> {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT id, userId, fazendaId, loteId, pastoId, sexo, categoria, status, dataNascimento, castrado, brinco, nome
     FROM animais WHERE id = ?${travar ? " FOR UPDATE" : ""}`,
    [id],
  );
  const linha = linhas[0];
  if (!linha) return null;
  return {
    id: Number(linha.id), userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    sexo: linha.sexo == null ? null : String(linha.sexo),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    status: linha.status == null ? null : String(linha.status),
    dataNascimento: linha.dataNascimento, castrado: linha.castrado == null ? null : Number(linha.castrado),
    brinco: linha.brinco == null ? null : String(linha.brinco), nome: linha.nome == null ? null : String(linha.nome),
  };
}
