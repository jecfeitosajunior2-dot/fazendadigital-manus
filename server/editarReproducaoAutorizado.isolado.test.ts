import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { packReproObservacoes, unpackReproObservacoes } from "../shared/reproRegistroMeta";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  MSG_REPRO_DATA_COM_HISTORICO,
  MSG_REPRO_DATA_COM_SEMEN,
  MSG_REPRO_EDICAO_ESTRUTURAL,
  MSG_REPRO_EXCLUSAO_DOSE,
  MSG_REPRO_EXCLUSAO_ESPELHO,
  MSG_REPRO_EXCLUSAO_ESTACAO,
  MSG_REPRO_EXCLUSAO_PARTO,
  MSG_REPRO_EXCLUSAO_POSTERIOR,
  MSG_REPRO_MUDAR_MATRIZ,
  MSG_REPRO_MUDAR_PARTIDA,
  MSG_REPRO_NAO_ENCONTRADO,
  MSG_SEM_PERMISSAO_EDITAR_REPRO,
  MSG_SEM_PERMISSAO_EXCLUIR_REPRO,
  editarReproducaoAutorizada,
  excluirReproducaoAutorizada,
  type ConsultaEditarReproducao,
  type IoEditarReproducao,
  type PedidoEditarReproducao,
  type RegistroReproLinha,
} from "./editarReproducaoAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4ae-repro";
const PORTA = 3355;
const SENHA = "isolado-h4ae";
const BANCO = "fd_h4ae";

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
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, status varchar(20) NOT NULL,
  brinco varchar(50) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_partidas (
  id int NOT NULL, user_id int NOT NULL, fazenda_id int NOT NULL,
  saldo_doses int NOT NULL, custo_unitario decimal(12,2) NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, partida_id int NOT NULL, user_id int NOT NULL,
  fazenda_id int NOT NULL, tipo varchar(20) NOT NULL, data_entrada date NOT NULL,
  quantidade_doses int NOT NULL, custo_total decimal(12,2) NOT NULL,
  custo_unitario decimal(12,2) NOT NULL, observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL, userId int NOT NULL, femeaId int NOT NULL, machoId int NULL,
  tipo varchar(50) NOT NULL, dataCobertura date NOT NULL, dataPrevistoParto date NULL,
  resultado varchar(50) NULL, observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE parto_crias (
  id int NOT NULL, userId int NOT NULL, partoRegistroId int NOT NULL,
  criaAnimalId int NOT NULL, ordem int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL, userId int NOT NULL, animalId int NOT NULL,
  loteDestinoId int NOT NULL, dataMovimentacao date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function alvo() {
  return { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };
}

function notaIa() {
  return packReproObservacoes("aplicada", "Touro 80", "João", null, null, {
    semenPartidaId: 500,
    partidaSemen: "L23081",
    inseminador: "João",
    custoDoseSemen: 100,
  }) ?? null;
}

function notaEspelho() {
  return packReproObservacoes("cópia", null, null, null, null, { registroOrigemId: 209, espelhoAutomatico: true }) ?? null;
}

function notaEstacao() {
  return packReproObservacoes("lote das vacas", null, null, null, {
    selectionMode: "lote",
    animalIds: [35, 36],
    labelsBrinco: ["35", "36"],
    loteId: 1,
    labelLoteNome: "Vacas",
  }) ?? null;
}

describe.sequential("edição e exclusão reprodutiva no MySQL isolado", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel(alvo());
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker(
      "run", "-d", "--name", CONTAINER,
      "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`,
      "-e", `MYSQL_DATABASE=${BANCO}`,
      "-p", `127.0.0.1:${PORTA}:3306`,
      "mysql:8.4",
    );
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
            (3, 'sem-permissao-isolado', 'Sem Permissao', NULL, 'user', 'comum', 1, 'ativo', 1),
            (4, 'outro-titular-isolado', 'Outra Conta', NULL, 'admin', 'principal', 4, 'ativo', 1),
            (5, 'outra-fazenda-isolado', 'So a outra fazenda', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
        await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (5, 20, 1)");
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'reproducao.editar', 1),
            (2, 1, 'reproducao.inativar', 1),
            (3, 1, 'reproducao.visualizar', 1),
            (5, 1, 'reproducao.editar', 1),
            (5, 1, 'reproducao.inativar', 1)
        `);
        await conn.query(`
          INSERT INTO animais (id, userId, fazendaId, status, brinco) VALUES
            (17, 1, 10, 'ativo', 'M17'), (30, 1, 10, 'ativo', 'M30'), (31, 1, 10, 'ativo', 'M31'),
            (32, 1, 10, 'ativo', 'M32'), (33, 1, 10, 'ativo', 'M33'), (34, 1, 10, 'ativo', 'T34'),
            (35, 1, 10, 'ativo', 'M35'), (36, 1, 10, 'ativo', 'M36'), (38, 1, 10, 'ativo', 'C38'),
            (80, 1, 10, 'ativo', 'T80'), (90, 4, 40, 'ativo', 'A90')
        `);
        await conn.query("INSERT INTO semen_partidas (id, user_id, fazenda_id, saldo_doses, custo_unitario, status) VALUES (500, 1, 10, 4, 100.00, 'disponivel')");
        await conn.query("INSERT INTO animal_lote_movimentacoes (id, userId, animalId, loteDestinoId, dataMovimentacao) VALUES (1, 1, 17, 100, '2026-11-01')");
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
    await pool.query("DELETE FROM semen_movimentacoes");
    await pool.query("DELETE FROM parto_crias");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 4, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    await pool.query("UPDATE animais SET status = 'ativo'");
    await pool.query(
      `INSERT INTO reproducao_registros
        (id, userId, femeaId, machoId, tipo, dataCobertura, dataPrevistoParto, resultado, observacoes) VALUES
        (201, 1, 17, 80, 'Inseminação', '2026-11-10', '2027-08-17', NULL, ?),
        (202, 1, 17, NULL, 'Diagnóstico de prenhez', '2026-11-01', NULL, 'Vazia', 'antes da dose'),
        (203, 1, 30, NULL, 'Diagnóstico de prenhez', '2026-11-01', NULL, 'Vazia', 'sozinha'),
        (204, 1, 31, NULL, 'Diagnóstico de prenhez', '2026-11-05', NULL, 'Vazia', 'duplicada A'),
        (205, 1, 31, NULL, 'Diagnóstico de prenhez', '2026-11-05', NULL, 'Vazia', 'duplicada B'),
        (206, 1, 32, NULL, 'Cio', '2026-11-06', NULL, NULL, 'cio unico'),
        (207, 1, 33, NULL, 'Parto', '2026-11-08', NULL, NULL, 'nasceu'),
        (208, 1, 34, NULL, 'Estação de monta', '2026-11-02', NULL, NULL, ?),
        (209, 1, 35, NULL, 'Cobertura', '2026-11-03', NULL, NULL, 'origem do lote'),
        (210, 1, 36, NULL, 'Cobertura', '2026-11-03', NULL, NULL, ?),
        (301, 4, 90, NULL, 'Diagnóstico de prenhez', '2026-11-01', NULL, NULL, 'alheia')`,
      [notaIa(), notaEstacao(), notaEspelho()],
    );
    await pool.query(
      `INSERT INTO semen_movimentacoes
        (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
       VALUES (500, 1, 10, 'SAIDA_IA', '2026-11-10', 1, 100.00, 100.00, ?)`,
      ["Inseminação — matriz #17 · registro repro #201"],
    );
    await pool.query("INSERT INTO parto_crias (id, userId, partoRegistroId, criaAnimalId, ordem) VALUES (1, 1, 207, 38, 1)");
  });

  function io(extra?: { aposTravas?: () => Promise<void> }): IoEditarReproducao {
    return {
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          const tx = consultas(conn);
          if (extra?.aposTravas) tx.aposTravas = extra.aposTravas;
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

  it("corrige observação e data simples e preserva a dose aplicada", async () => {
    const obs = await editarReproducaoAutorizada(io(), pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      dataPrevistoParto: "2027-08-17",
      observacoes: "conferida no curral",
      responsavel: "João",
      reprodutorSemen: "Touro 80",
    }));
    expect(obs).toMatchObject({ ok: true, titularUserId: 1 });
    const ia = await linha(201);
    const meta = unpackReproObservacoes(String(ia?.observacoes));
    expect(meta.observacoes).toBe("conferida no curral");
    expect(meta.semenPartidaId).toBe(500);
    expect(meta.inseminador).toBe("João");
    expect(String(ia?.dataCobertura)).toBe("2026-11-10");
    expect(await saldo()).toBe(4);
    expect(await saidas()).toBe(1);

    const funcionario = await editarReproducaoAutorizada(io(), pedido(2, 1, 203, {
      observacoes: "revista",
      responsavel: "Maria",
    }));
    expect(funcionario.ok).toBe(true);
    const data = await editarReproducaoAutorizada(io(), pedido(2, 1, 203, {
      dataCobertura: "2026-11-04",
      observacoes: "revista",
    }));
    expect(data.ok).toBe(true);
    expect(String((await linha(203))?.dataCobertura)).toBe("2026-11-04");
    expect(await historicoLote()).toBe(1);

    const dataDose = await editarReproducaoAutorizada(io(), pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-12",
    }));
    expect(dataDose).toMatchObject({ mensagem: MSG_REPRO_DATA_COM_SEMEN });
    const matriz = await editarReproducaoAutorizada(io(), pedido(1, 3, 203, { femeaId: 31 }));
    expect(matriz).toMatchObject({ mensagem: MSG_REPRO_MUDAR_MATRIZ });
    const partida = await editarReproducaoAutorizada(io(), pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      semenPartidaId: 501,
    }));
    expect(partida).toMatchObject({ mensagem: MSG_REPRO_MUDAR_PARTIDA });
    const touro = await editarReproducaoAutorizada(io(), pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      reprodutorSemen: "Outro touro",
    }));
    expect(touro).toMatchObject({ mensagem: MSG_REPRO_EDICAO_ESTRUTURAL });
    expect(String((await linha(201))?.dataCobertura)).toBe("2026-11-10");
    expect(await saldo()).toBe(4);
    expect(await saidas()).toBe(1);
  });

  it("separa exclusão simples da dose aplicada, do parto, da estação e do espelho", async () => {
    const semPermissao = await excluirReproducaoAutorizada(io(), pedido(3, 1, 206));
    expect(semPermissao).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_EXCLUIR_REPRO });
    const editarSem = await editarReproducaoAutorizada(io(), pedido(3, 1, 203, {
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["reproducao.editar"],
      fazendasInformadasPeloCliente: [10],
      titularInformadoPeloCliente: 1,
    }));
    expect(editarSem).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_EDITAR_REPRO });
    const fazenda = await editarReproducaoAutorizada(io(), pedido(5, 1, 203));
    expect(fazenda).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    const outro = await excluirReproducaoAutorizada(io(), pedido(1, 3, 301));
    expect(outro).toMatchObject({ mensagem: MSG_REPRO_NAO_ENCONTRADO });

    const posterior = await excluirReproducaoAutorizada(io(), pedido(2, 1, 202));
    expect(posterior).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_POSTERIOR });
    const dose = await excluirReproducaoAutorizada(io(), pedido(1, 3, 201));
    expect(dose).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_DOSE });
    const parto = await excluirReproducaoAutorizada(io(), pedido(1, 3, 207));
    expect(parto).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_PARTO });
    const estacao = await excluirReproducaoAutorizada(io(), pedido(2, 1, 208));
    expect(estacao).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_ESTACAO });
    const espelho = await excluirReproducaoAutorizada(io(), pedido(1, 3, 210));
    expect(espelho).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_ESPELHO });
    const origem = await excluirReproducaoAutorizada(io(), pedido(1, 3, 209));
    expect(origem).toMatchObject({ mensagem: MSG_REPRO_EXCLUSAO_ESPELHO });

    const duplicada = await excluirReproducaoAutorizada(io(), pedido(2, 1, 204));
    expect(duplicada).toMatchObject({ ok: true, registroId: 204 });
    expect(await linha(205)).toBeTruthy();
    expect(await linha(204)).toBeUndefined();
    expect(await linha(201)).toBeTruthy();
    expect(await linha(207)).toBeTruthy();
    expect(await crias()).toBe(1);
    expect(await saldo()).toBe(4);
    expect(await saidas()).toBe(1);
    expect(await historicoLote()).toBe(1);

    const dataComHistorico = await editarReproducaoAutorizada(io(), pedido(1, 3, 202, { dataCobertura: "2026-10-01" }));
    expect(dataComHistorico).toMatchObject({ mensagem: MSG_REPRO_DATA_COM_HISTORICO });
  });

  it("segura a corrida com entrada, outra inseminação, baixa e duas exclusões", async () => {
    let liberarEntrada: () => void = () => undefined;
    const segueEntrada = new Promise<void>((resolver) => { liberarEntrada = resolver; });
    let avisouEntrada: () => void = () => undefined;
    const travouEntrada = new Promise<void>((resolver) => { avisouEntrada = resolver; });
    const edicao = editarReproducaoAutorizada(io({
      aposTravas: async () => { avisouEntrada(); await segueEntrada; },
    }), pedido(2, 1, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      observacoes: "durante a entrada",
      responsavel: "João",
      reprodutorSemen: "Touro 80",
    }));
    await travouEntrada;
    const entrada = await pool.getConnection();
    try {
      await entrada.query("SET innodb_lock_wait_timeout = 8");
      await entrada.beginTransaction();
      const espera = entrada.query("SELECT id FROM semen_partidas WHERE id = 500 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberarEntrada();
      await espera;
      await entrada.query("UPDATE semen_partidas SET saldo_doses = saldo_doses + 2 WHERE id = 500");
      await entrada.query(
        `INSERT INTO semen_movimentacoes
          (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
         VALUES (500, 1, 10, 'ENTRADA', '2026-11-18', 2, 200.00, 100.00, 'entrada concorrente')`,
      );
      await entrada.commit();
    } finally {
      entrada.release();
    }
    expect((await edicao).ok).toBe(true);
    expect(await saldo()).toBe(6);
    expect(unpackReproObservacoes(String((await linha(201))?.observacoes)).semenPartidaId).toBe(500);
    expect(await saidas()).toBe(1);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 4 WHERE id = 500");
    let liberarIa: () => void = () => undefined;
    const segueIa = new Promise<void>((resolver) => { liberarIa = resolver; });
    let avisouIa: () => void = () => undefined;
    const travouIa = new Promise<void>((resolver) => { avisouIa = resolver; });
    const outraEdicao = editarReproducaoAutorizada(io({
      aposTravas: async () => { avisouIa(); await segueIa; },
    }), pedido(1, 3, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      observacoes: "durante outra ia",
      responsavel: "João",
      reprodutorSemen: "Touro 80",
    }));
    await travouIa;
    const ia = await pool.getConnection();
    try {
      await ia.query("SET innodb_lock_wait_timeout = 8");
      await ia.beginTransaction();
      const esperaAnimal = ia.query("SELECT id FROM animais WHERE id = 17 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberarIa();
      await esperaAnimal;
      await ia.query("SELECT id FROM semen_partidas WHERE id = 500 FOR UPDATE");
      await ia.query("UPDATE semen_partidas SET saldo_doses = saldo_doses - 1 WHERE id = 500");
      await ia.query(
        `INSERT INTO semen_movimentacoes
          (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
         VALUES (500, 1, 10, 'SAIDA_IA', '2026-11-18', 1, 100.00, 100.00, 'Inseminação — matriz #17 · registro repro #999')`,
      );
      await ia.commit();
    } finally {
      ia.release();
    }
    expect((await outraEdicao).ok).toBe(true);
    expect(await saldo()).toBe(3);
    expect(await saidas()).toBe(2);
    expect(await linha(201)).toBeTruthy();

    let liberarBaixa: () => void = () => undefined;
    const segueBaixa = new Promise<void>((resolver) => { liberarBaixa = resolver; });
    let avisouBaixa: () => void = () => undefined;
    const travouBaixa = new Promise<void>((resolver) => { avisouBaixa = resolver; });
    const edicaoBaixa = editarReproducaoAutorizada(io({
      aposTravas: async () => { avisouBaixa(); await segueBaixa; },
    }), pedido(2, 1, 203, { observacoes: "antes da baixa" }));
    await travouBaixa;
    const baixa = await pool.getConnection();
    try {
      await baixa.query("SET innodb_lock_wait_timeout = 8");
      await baixa.beginTransaction();
      const espera = baixa.query("SELECT id FROM animais WHERE id = 30 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberarBaixa();
      await espera;
      await baixa.query("UPDATE animais SET status = 'morto' WHERE id = 30");
      await baixa.commit();
    } finally {
      baixa.release();
    }
    expect((await edicaoBaixa).ok).toBe(true);
    const [animal] = (await pool.query<RowDataPacket[]>("SELECT status FROM animais WHERE id = 30"))[0];
    expect(String(animal?.status)).toBe("morto");
    expect(String((await linha(203))?.observacoes)).toBe("antes da baixa");

    const duas = await Promise.all([
      excluirReproducaoAutorizada(io(), pedido(1, 3, 206)),
      excluirReproducaoAutorizada(io(), pedido(2, 1, 206)),
    ]);
    expect(duas.filter((item) => item.ok)).toHaveLength(1);
    expect(duas.filter((item) => !item.ok)[0]).toMatchObject({ mensagem: MSG_REPRO_NAO_ENCONTRADO });
    expect(await linha(206)).toBeUndefined();
    expect(await saldo()).toBe(3);
  });

  it("desfaz a edição inteira se a gravação ou o passo do estoque falhar", async () => {
    await expect(editarReproducaoAutorizada(io({
      aposTravas: async () => { throw new Error("falha na atualização"); },
    }), pedido(1, 3, 203, { observacoes: "nao pode gravar" }))).rejects.toThrow("falha na atualização");
    expect(String((await linha(203))?.observacoes)).toBe("sozinha");

    await expect(editarReproducaoAutorizada(io({
      aposTravas: async () => { throw new Error("falha no estoque"); },
    }), pedido(2, 1, 201, {
      tipo: "Inseminação",
      dataCobertura: "2026-11-10",
      observacoes: "nao mexe na dose",
      responsavel: "João",
      reprodutorSemen: "Touro 80",
    }))).rejects.toThrow("falha no estoque");
    expect(unpackReproObservacoes(String((await linha(201))?.observacoes)).observacoes).toBe("aplicada");
    expect(await saldo()).toBe(4);
    expect(await saidas()).toBe(1);
    const [tipos] = await pool.query<RowDataPacket[]>("SELECT tipo FROM semen_movimentacoes");
    expect(tipos.map((item) => String(item.tipo))).toEqual(["SAIDA_IA"]);

    const deNovo = await editarReproducaoAutorizada(io(), pedido(1, 3, 203, { observacoes: "administrador segue" }));
    expect(deNovo).toMatchObject({ ok: true, titularUserId: 1 });
    expect(await historicoLote()).toBe(1);
  });

  async function saldo() {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT saldo_doses FROM semen_partidas WHERE id = 500");
    return Number(linhas[0]?.saldo_doses);
  }

  async function saidas() {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM semen_movimentacoes WHERE tipo = 'SAIDA_IA'");
    return Number(linhas[0]?.n);
  }

  async function linha(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM reproducao_registros WHERE id = ?", [id]);
    return linhas[0];
  }

  async function crias() {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM parto_crias");
    return Number(linhas[0]?.n);
  }

  async function historicoLote() {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM animal_lote_movimentacoes");
    return Number(linhas[0]?.n);
  }
});

function pedido(executorId: number, sessionVersion: number, registroId: number, extra: Partial<PedidoEditarReproducao> = {}): PedidoEditarReproducao {
  return {
    executorId,
    sessionVersionDaSessao: sessionVersion,
    registroId,
    tipo: "Diagnóstico de prenhez",
    dataCobertura: "2026-11-01",
    ...extra,
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaEditarReproducao {
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
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel, titularUserId: Number(linha.titularUserId),
        situacao: linha.situacao, sessionVersion: Number(linha.sessionVersion),
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
         JOIN users u ON u.id = uf.userId
         WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
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
    async espiarRegistro(id) { return lerRegistro(conn, id, false); },
    async espiarAnimal(id) { return lerAnimal(conn, id, false); },
    async travaRegistro(id) { return lerRegistro(conn, id, true); },
    async travaAnimal(id) { return lerAnimal(conn, id, true); },
    async registrosDoAnimal(userId, animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM reproducao_registros
         WHERE userId = ? AND (femeaId = ? OR machoId = ?) ORDER BY id FOR UPDATE`,
        [userId, animalId, animalId],
      );
      return linhas.map(mapRegistro);
    },
    async espiarSaidasIa(userId, registroId) { return lerSaidas(conn, userId, registroId, false); },
    async saidasIaDoRegistro(userId, registroId) { return lerSaidas(conn, userId, registroId, true); },
    async espelhosDoRegistro(userId, registroId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM reproducao_registros WHERE userId = ? AND observacoes LIKE ? ORDER BY id FOR UPDATE",
        [userId, `%"roid":${registroId}%`],
      );
      return linhas.map(mapRegistro);
    },
    async travaPartida(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, user_id AS userId, fazenda_id AS fazendaId, saldo_doses AS saldoDoses FROM semen_partidas WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id), userId: Number(linha.userId), fazendaId: Number(linha.fazendaId), saldoDoses: Number(linha.saldoDoses),
      };
    },
    async partoTemCrias(registroId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM parto_crias WHERE partoRegistroId = ?", [registroId]);
      return Number(linhas[0]?.n ?? 0) > 0;
    },
    async atualizarRegistro(input) {
      const [resultado] = await conn.query(
        `UPDATE reproducao_registros
         SET tipo = ?, dataCobertura = ?, dataPrevistoParto = ?, resultado = ?, observacoes = ?
         WHERE id = ? AND userId = ?`,
        [input.tipo, input.dataCobertura, input.dataPrevistoParto, input.resultado, input.observacoes, input.id, input.userId],
      );
      return Number((resultado as ResultSetHeader).affectedRows ?? 0);
    },
    async excluirRegistro(id, userId) {
      const [resultado] = await conn.query(
        "DELETE FROM reproducao_registros WHERE id = ? AND userId = ?",
        [id, userId],
      );
      return Number((resultado as ResultSetHeader).affectedRows ?? 0);
    },
  };
}

async function lerRegistro(conn: mysql.PoolConnection, id: number, travar: boolean): Promise<RegistroReproLinha | null> {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT * FROM reproducao_registros WHERE id = ?${travar ? " FOR UPDATE" : ""}`,
    [id],
  );
  return linhas[0] ? mapRegistro(linhas[0]) : null;
}

async function lerAnimal(conn: mysql.PoolConnection, id: number, travar: boolean) {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT id, userId, fazendaId FROM animais WHERE id = ?${travar ? " FOR UPDATE" : ""}`,
    [id],
  );
  const linha = linhas[0];
  if (!linha) return null;
  return { id: Number(linha.id), userId: Number(linha.userId), fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId) };
}

async function lerSaidas(conn: mysql.PoolConnection, userId: number, registroId: number, travar: boolean) {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT id, partida_id AS partidaId, quantidade_doses AS quantidadeDoses
     FROM semen_movimentacoes
     WHERE user_id = ? AND tipo = 'SAIDA_IA' AND observacoes LIKE ?${travar ? " FOR UPDATE" : ""}`,
    [userId, `%registro repro #${registroId}`],
  );
  return linhas.map((linha) => ({
    id: Number(linha.id), partidaId: Number(linha.partidaId), quantidadeDoses: Number(linha.quantidadeDoses),
  }));
}

function mapRegistro(linha: RowDataPacket): RegistroReproLinha {
  return {
    id: Number(linha.id),
    userId: Number(linha.userId),
    femeaId: Number(linha.femeaId),
    machoId: linha.machoId == null ? null : Number(linha.machoId),
    tipo: String(linha.tipo),
    dataCobertura: linha.dataCobertura,
    dataPrevistoParto: linha.dataPrevistoParto,
    resultado: linha.resultado == null ? null : String(linha.resultado),
    observacoes: linha.observacoes == null ? null : String(linha.observacoes),
  };
}
