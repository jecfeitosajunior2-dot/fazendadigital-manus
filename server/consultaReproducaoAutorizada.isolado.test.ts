import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_REPRO_PIPELINE_CONFIG } from "../shared/reproPipeline";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  gravarPipelineAutorizado,
  lerPipelineAutorizado,
  listarReproducaoAutorizada,
  MSG_FAZENDA_REPRO_AUSENTE,
  MSG_SEM_PERMISSAO_REGUA,
  MSG_SEM_PERMISSAO_VER_REPRODUCAO,
  type ConsultaReproducao,
  type IoConsultaReproducao,
  type PedidoConsulta,
} from "./consultaReproducaoAutorizada";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4ah-consulta";
const PORTA = 3358;
const SENHA = "isolado-h4ah";
const BANCO = "fd_h4ah";

const CONFIG_SEDE = JSON.stringify({
  maxTentativasIatfAntesMonta: 3,
  diasParaDgAposInseminacao: 40,
  diasParaDgAposMonta: 75,
  sugerirDescarteAposMontaVazia: false,
});

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL, openId varchar(255) NOT NULL, name varchar(255) NOT NULL,
  email varchar(255) NULL, role enum('admin','user') NOT NULL,
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL, situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL, userId int NOT NULL, nome varchar(200) NOT NULL,
  configReproPipeline text NULL, PRIMARY KEY (id)
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
  fazendaId int NULL, pastoAtualId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, fazendaId int NULL, loteId int NULL,
  status varchar(20) NOT NULL, brinco varchar(40) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL, userId int NOT NULL, femeaId int NOT NULL, machoId int NULL,
  tipo varchar(50) NOT NULL, dataCobertura date NOT NULL, dataPrevistoParto date NULL,
  dataPartoReal date NULL, resultado varchar(50) NULL, filhotes int NULL,
  observacoes text NULL, createdAt datetime NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function pedido(executorId: number, session: number, extra: Partial<PedidoConsulta> = {}): PedidoConsulta {
  return { executorId, sessionVersionDaSessao: session, ...extra };
}

describe.sequential("consulta reprodutiva no MySQL isolado", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel({ host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER });
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
            (3, 'sem-repro-isolado', 'So cadastra animal', NULL, 'user', 'comum', 1, 'ativo', 1),
            (4, 'outro-titular-isolado', 'Outra Conta', NULL, 'admin', 'principal', 4, 'ativo', 1),
            (5, 'outra-fazenda-isolado', 'So a outra fazenda', NULL, 'user', 'comum', 1, 'ativo', 1),
            (6, 'so-consulta-isolado', 'So consulta', NULL, 'user', 'comum', 1, 'ativo', 1),
            (7, 'duas-fazendas-isolado', 'Duas fazendas', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query(
          "INSERT INTO fazendas (id, userId, nome, configReproPipeline) VALUES (10, 1, 'Sede', ?), (20, 1, 'Retiro', NULL), (40, 4, 'Alheia', NULL)",
          [CONFIG_SEDE],
        );
        await conn.query(`
          INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
            (2, 10, 1), (3, 10, 1), (5, 20, 1), (6, 10, 1), (7, 10, 1), (7, 20, 1)
        `);
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'reproducao.visualizar', 1), (2, 1, 'reproducao.editar', 1),
            (3, 1, 'animais.criar', 1),
            (5, 1, 'reproducao.visualizar', 1), (5, 1, 'reproducao.editar', 1),
            (6, 1, 'reproducao.visualizar', 1),
            (7, 1, 'reproducao.visualizar', 1), (7, 1, 'reproducao.editar', 1)
        `);
        await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral'), (2000, 1, 20, 'Retiro')");
        await conn.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId) VALUES (100, 1, 'Maternidade', 10, 1000), (200, 1, 'Retiro', 20, 2000)");
        await conn.query(`
          INSERT INTO animais (id, userId, fazendaId, loteId, status, brinco) VALUES
            (17, 1, 10, 100, 'ativo', 'M17'),
            (21, 1, 10, 100, 'ativo', 'M21'),
            (22, 1, NULL, 100, 'ativo', 'M22'),
            (33, 1, 20, 200, 'ativo', 'M33'),
            (80, 1, 10, 100, 'ativo', 'T80'),
            (90, 4, 40, NULL, 'ativo', 'A90'),
            (99, 1, 20, 100, 'ativo', 'M99')
        `);
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
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("UPDATE fazendas SET configReproPipeline = ? WHERE id = 10", [CONFIG_SEDE]);
    await pool.query("UPDATE fazendas SET configReproPipeline = NULL WHERE id IN (20, 40)");
    await pool.query(
      `INSERT INTO reproducao_registros
        (id, userId, femeaId, machoId, tipo, dataCobertura, dataPrevistoParto, dataPartoReal, resultado, filhotes, observacoes, createdAt) VALUES
        (1, 1, 17, NULL, 'Diagnóstico de prenhez', '2026-11-01', NULL, NULL, 'Prenha', NULL, 'lancado pelo funcionario 2', '2026-11-01 10:00:00'),
        (2, 1, 80, 80, 'Estação de monta', '2026-11-02', NULL, NULL, 'Realizado', NULL, 'lote das vacas', '2026-11-02 10:00:00'),
        (3, 1, 17, 80, 'Exposição à monta', '2026-11-02', NULL, NULL, 'Realizado', NULL, 'copia matriz 17', '2026-11-02 10:00:01'),
        (4, 1, 21, 80, 'Exposição à monta', '2026-11-02', NULL, NULL, 'Realizado', NULL, 'anulado', '2026-11-02 10:00:02'),
        (5, 1, 21, 80, 'Parto', '2026-11-08', NULL, '2026-11-08', 'Realizado', 1, 'nasceu', '2026-11-08 10:00:00'),
        (6, 1, 33, 80, 'Cobertura', '2026-11-09', NULL, NULL, 'Realizado', NULL, 'lancado pelo funcionario 7', '2026-11-09 10:00:00'),
        (7, 4, 90, NULL, 'Diagnóstico de prenhez', '2026-11-01', NULL, NULL, 'Vazia', NULL, 'outra conta', '2026-11-09 11:00:00'),
        (8, 1, 22, NULL, 'Diagnóstico de prenhez', '2026-11-03', NULL, NULL, 'Vazia', NULL, 'sem fazenda direta', '2026-11-03 10:00:00'),
        (9, 1, 99, NULL, 'Cio', '2026-11-04', NULL, NULL, NULL, NULL, 'fazenda e lote divergem', '2026-11-04 10:00:00')`,
    );
  });

  function consultas(conn: mysql.PoolConnection, extra?: { aposGravar?: () => Promise<void> }): ConsultaReproducao {
    return {
      async usuario(id) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion FROM users WHERE id = ? FOR UPDATE",
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return {
          id: Number(linha.id),
          openId: String(linha.openId),
          name: String(linha.name),
          email: linha.email == null ? null : String(linha.email),
          role: linha.role === "admin" ? "admin" : "user",
          papel: linha.papel,
          titularUserId: linha.titularUserId == null ? null : Number(linha.titularUserId),
          situacao: linha.situacao,
          sessionVersion: Number(linha.sessionVersion),
        } as LinhaUsuarioCadastro;
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
           INNER JOIN users u ON u.id = uf.userId
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
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE",
          [id],
        );
        const linha = linhas[0];
        return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
      },
      async lotes(titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, userId, fazendaId, pastoAtualId FROM lotes WHERE userId = ?",
          [titularUserId],
        );
        return linhas.map((linha) => ({
          id: Number(linha.id),
          userId: Number(linha.userId),
          fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
          pastoAtualId: linha.pastoAtualId == null ? null : Number(linha.pastoAtualId),
        }));
      },
      async pastos(titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id, userId, fazendaId FROM pastos WHERE userId = ?",
          [titularUserId],
        );
        return linhas.map((linha) => ({
          id: Number(linha.id),
          userId: Number(linha.userId),
          fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        }));
      },
      async registros(titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          `SELECT r.id, r.userId, r.femeaId, r.machoId, r.tipo, r.dataCobertura, r.dataPrevistoParto,
                  r.dataPartoReal, r.resultado, r.filhotes, r.observacoes, r.createdAt,
                  a.userId AS animalUserId, a.fazendaId AS animalFazendaId, a.loteId AS animalLoteId
           FROM reproducao_registros r
           LEFT JOIN animais a ON a.id = r.femeaId AND a.userId = r.userId
           WHERE r.userId = ?
           ORDER BY r.createdAt DESC, r.id DESC`,
          [titularUserId],
        );
        return linhas.map((linha) => ({
          id: Number(linha.id),
          userId: Number(linha.userId),
          femeaId: Number(linha.femeaId),
          machoId: linha.machoId == null ? null : Number(linha.machoId),
          tipo: String(linha.tipo),
          dataCobertura: String(linha.dataCobertura),
          dataPrevistoParto: linha.dataPrevistoParto == null ? null : String(linha.dataPrevistoParto),
          dataPartoReal: linha.dataPartoReal == null ? null : String(linha.dataPartoReal),
          resultado: linha.resultado == null ? null : String(linha.resultado),
          filhotes: linha.filhotes == null ? null : Number(linha.filhotes),
          observacoes: linha.observacoes == null ? null : String(linha.observacoes),
          createdAt: String(linha.createdAt),
          animalUserId: linha.animalUserId == null ? null : Number(linha.animalUserId),
          animalFazendaId: linha.animalFazendaId == null ? null : Number(linha.animalFazendaId),
          animalLoteId: linha.animalLoteId == null ? null : Number(linha.animalLoteId),
        }));
      },
      async lerConfig(fazendaId, titularUserId) {
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT configReproPipeline FROM fazendas WHERE id = ? AND userId = ?",
          [fazendaId, titularUserId],
        );
        if (!linhas[0]) return undefined;
        return linhas[0].configReproPipeline == null ? null : String(linhas[0].configReproPipeline);
      },
      async gravarConfig(fazendaId, titularUserId, serializado) {
        const [result] = await conn.query<ResultSetHeader>(
          "UPDATE fazendas SET configReproPipeline = ? WHERE id = ? AND userId = ?",
          [serializado, fazendaId, titularUserId],
        );
        if (result.affectedRows > 0) return 1;
        const [linhas] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM fazendas WHERE id = ? AND userId = ?",
          [fazendaId, titularUserId],
        );
        return linhas[0] ? 1 : 0;
      },
      aposGravar: extra?.aposGravar,
    };
  }

  function io(extra?: { aposGravar?: () => Promise<void>; falhar?: boolean }): IoConsultaReproducao {
    return {
      async emTransacao(fn) {
        if (extra?.falhar) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          const resultado = await fn(consultas(conn, extra));
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

  async function configDa(fazendaId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT configReproPipeline FROM fazendas WHERE id = ?", [fazendaId]);
    return linhas[0]?.configReproPipeline == null ? null : String(linhas[0].configReproPipeline);
  }

  it("lista o histórico do titular nas fazendas concedidas", async () => {
    const principal = await listarReproducaoAutorizada(io(), pedido(1, 3, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: [],
    }));
    expect(principal.ok).toBe(true);
    if (!principal.ok) return;
    expect(principal.titularUserId).toBe(1);
    expect(principal.registros.map((item) => item.id)).toEqual([6, 5, 9, 8, 4, 3, 2, 1]);
    expect(new Set(principal.registros.map((item) => item.id)).size).toBe(principal.registros.length);
    expect(principal.registros.find((item) => item.id === 2)?.tipo).toBe("Estação de monta");
    expect(principal.registros.filter((item) => item.tipo === "Exposição à monta").map((item) => item.id)).toEqual([4, 3]);
    expect(principal.registros.find((item) => item.id === 4)?.observacoes).toBe("anulado");
    expect(principal.registros.find((item) => item.id === 5)).toMatchObject({ tipo: "Parto", filhotes: 1, dataPartoReal: "2026-11-08" });
    expect(principal.registros.find((item) => item.id === 1)).toMatchObject({ tipo: "Diagnóstico de prenhez", observacoes: "lancado pelo funcionario 2" });
    expect(principal.registros.some((item) => item.id === 7)).toBe(false);

    const funcionario = await listarReproducaoAutorizada(io(), pedido(2, 1));
    expect(funcionario.ok).toBe(true);
    if (!funcionario.ok) return;
    expect(funcionario.registros.map((item) => item.id)).toEqual([5, 8, 4, 3, 2, 1]);
    expect(funcionario.registros.every((item) => item.userId === 1)).toBe(true);
    expect(funcionario.registros.some((item) => item.observacoes === "lancado pelo funcionario 2")).toBe(true);
    expect(funcionario.registros.some((item) => item.id === 6 || item.id === 9 || item.id === 7)).toBe(false);

    const duas = await listarReproducaoAutorizada(io(), pedido(7, 1));
    expect(duas.ok).toBe(true);
    if (!duas.ok) return;
    expect(duas.registros.map((item) => item.id)).toEqual([6, 5, 8, 4, 3, 2, 1]);
    expect(duas.registros.find((item) => item.id === 6)?.observacoes).toBe("lancado pelo funcionario 7");

    const sem = await listarReproducaoAutorizada(io(), pedido(3, 1, {
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["reproducao.visualizar"],
    }));
    expect(sem).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_VER_REPRODUCAO });
    const sessao = await listarReproducaoAutorizada(io(), pedido(2, 9));
    expect(sessao).toMatchObject({ motivo: "sem_identidade" });
  });

  it("lê a régua da fazenda autorizada e devolve o padrão quando ainda não há valor", async () => {
    const principal = await lerPipelineAutorizado(io(), pedido(1, 3, { fazendaId: 10 }));
    expect(principal.ok && principal.config).toMatchObject({ maxTentativasIatfAntesMonta: 3, diasParaDgAposInseminacao: 40, diasParaDgAposMonta: 75 });
    const funcionario = await lerPipelineAutorizado(io(), pedido(2, 1, { fazendaId: 10 }));
    expect(funcionario.ok && funcionario.config.sugerirDescarteAposMontaVazia).toBe(false);
    const padrao = await lerPipelineAutorizado(io(), pedido(5, 1, { fazendaId: 20 }));
    expect(padrao.ok && padrao.config).toEqual(DEFAULT_REPRO_PIPELINE_CONFIG);
    expect(await configDa(20)).toBeNull();
    const sem = await lerPipelineAutorizado(io(), pedido(3, 1, { fazendaId: 10 }));
    expect(sem).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_VER_REPRODUCAO });
    const outra = await lerPipelineAutorizado(io(), pedido(2, 1, { fazendaId: 20 }));
    expect(outra).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    const alheia = await lerPipelineAutorizado(io(), pedido(1, 3, { fazendaId: 40 }));
    expect(alheia).toMatchObject({ mensagem: MSG_FAZENDA_REPRO_AUSENTE });
    expect(await configDa(10)).toBe(CONFIG_SEDE);
  });

  it("grava só a fazenda autorizada e desfaz se a confirmação falha", async () => {
    const gravou = await gravarPipelineAutorizado(io(), pedido(2, 1, {
      fazendaId: 10,
      config: {
        maxTentativasIatfAntesMonta: 4,
        diasParaDgAposInseminacao: 45,
        diasParaDgAposMonta: 80,
        sugerirDescarteAposMontaVazia: true,
      },
    }));
    expect(gravou.ok && gravou.titularUserId).toBe(1);
    expect(JSON.parse(String(await configDa(10))).diasParaDgAposInseminacao).toBe(45);
    expect(await configDa(20)).toBeNull();

    const semEditar = await gravarPipelineAutorizado(io(), pedido(6, 1, {
      fazendaId: 10, config: { diasParaDgAposInseminacao: 50 },
    }));
    expect(semEditar).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_REGUA });
    const fazendaErrada = await gravarPipelineAutorizado(io(), pedido(2, 1, {
      fazendaId: 20, config: { maxTentativasIatfAntesMonta: 5 },
    }));
    expect(fazendaErrada).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    const outraConta = await gravarPipelineAutorizado(io(), pedido(1, 3, {
      fazendaId: 40, config: { diasParaDgAposInseminacao: 50 }, titularInformadoPeloCliente: 4,
    }));
    expect(outraConta).toMatchObject({ mensagem: MSG_FAZENDA_REPRO_AUSENTE });
    expect(JSON.parse(String(await configDa(10))).diasParaDgAposInseminacao).toBe(45);
    expect(await configDa(20)).toBeNull();
    expect(await configDa(40)).toBeNull();

    const antes = await configDa(10);
    await expect(gravarPipelineAutorizado(io({ aposGravar: async () => { throw new Error("falha na régua"); } }), pedido(1, 3, {
      fazendaId: 10, config: { diasParaDgAposInseminacao: 55 },
    }))).rejects.toThrow("falha na régua");
    expect(await configDa(10)).toBe(antes);
    await expect(gravarPipelineAutorizado(io({ falhar: true }), pedido(1, 3, {
      fazendaId: 10, config: { diasParaDgAposInseminacao: 55 },
    }))).rejects.toMatchObject({ message: "Banco de dados indisponível." });
    expect(await configDa(10)).toBe(antes);
  });

  it("duas gravações da mesma fazenda se sucedem e fazendas diferentes não se misturam", async () => {
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((resolver) => { soltar = resolver; });
    let segurou = false;
    const primeira = gravarPipelineAutorizado(io({
      aposGravar: async () => {
        segurou = true;
        await espera;
      },
    }), pedido(1, 3, {
      fazendaId: 10,
      config: { maxTentativasIatfAntesMonta: 4, diasParaDgAposInseminacao: 46, diasParaDgAposMonta: 81, sugerirDescarteAposMontaVazia: true },
    }));
    const prazo = Date.now() + 10_000;
    while (!segurou && Date.now() < prazo) await new Promise((resolver) => setTimeout(resolver, 30));
    expect(segurou).toBe(true);
    expect(await configDa(10)).toBe(CONFIG_SEDE);
    const segunda = gravarPipelineAutorizado(io(), pedido(2, 1, {
      fazendaId: 10,
      config: { maxTentativasIatfAntesMonta: 5, diasParaDgAposInseminacao: 47, diasParaDgAposMonta: 82, sugerirDescarteAposMontaVazia: false },
    }));
    await new Promise((resolver) => setTimeout(resolver, 200));
    expect(await configDa(10)).toBe(CONFIG_SEDE);
    soltar();
    const [a, b] = await Promise.all([primeira, segunda]);
    expect(a.ok && b.ok).toBe(true);
    expect(JSON.parse(String(await configDa(10))).diasParaDgAposInseminacao).toBe(47);
    expect(await configDa(20)).toBeNull();

    const paralelas = await Promise.all([
      gravarPipelineAutorizado(io(), pedido(2, 1, {
        fazendaId: 10,
        config: { maxTentativasIatfAntesMonta: 3, diasParaDgAposInseminacao: 41, diasParaDgAposMonta: 76, sugerirDescarteAposMontaVazia: false },
      })),
      gravarPipelineAutorizado(io(), pedido(5, 1, {
        fazendaId: 20,
        config: { maxTentativasIatfAntesMonta: 6, diasParaDgAposInseminacao: 48, diasParaDgAposMonta: 90, sugerirDescarteAposMontaVazia: true },
      })),
    ]);
    expect(paralelas.every((item) => item.ok)).toBe(true);
    expect(JSON.parse(String(await configDa(10))).diasParaDgAposInseminacao).toBe(41);
    expect(JSON.parse(String(await configDa(20))).diasParaDgAposInseminacao).toBe(48);
  });
});
