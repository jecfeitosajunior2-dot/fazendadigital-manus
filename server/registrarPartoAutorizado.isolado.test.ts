import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildBrincoAtivoConflitoMessage } from "../shared/brincoAtivo";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  MSG_PARTO_FAZENDA_DIVERGENTE,
  MSG_PARTO_LOTE_INCOMPATIVEL,
  MSG_PARTO_MATRIZ_AUSENTE,
  MSG_PARTO_PASTO_INCOMPATIVEL,
  registrarPartoAutorizado,
  type AnimalPartoLinha,
  type ConsultaParto,
  type IoParto,
  type PedidoParto,
  type RegistroPartoLinha,
} from "./registrarPartoAutorizado";
import { MSG_SEM_FAZENDA_MANEJO, MSG_SEM_PERMISSAO_REPRODUCAO } from "./registrarManejoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4af-parto";
const PORTA = 3356;
const SENHA = "isolado-h4af";
const BANCO = "fd_h4af";

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
  fazendaId int NULL, pastoAtualId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL,
  nome varchar(100) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, fazendaId int NULL,
  loteId int NULL, pastoId int NULL, status varchar(20) NOT NULL, brinco varchar(50) NULL,
  brincoEletronico varchar(80) NULL, sexo varchar(20) NULL, categoria varchar(50) NULL,
  dataNascimento date NULL, castrado tinyint(1) NULL, pesoAtual decimal(8,2) NULL,
  maeId int NULL, paiId int NULL, rastreadoNascimento tinyint(1) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL,
  machoId int NULL, tipo varchar(50) NOT NULL, dataCobertura date NOT NULL,
  dataPrevistoParto date NULL, dataPartoReal date NULL, resultado varchar(50) NULL,
  observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE parto_crias (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, partoRegistroId int NOT NULL,
  criaAnimalId int NOT NULL, ordem int NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteOrigemId int NULL, loteDestinoId int NOT NULL, pastoDestinoId int NULL,
  fazendaId int NULL, dataMovimentacao date NOT NULL, usuarioNome varchar(200) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function alvo() {
  return { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };
}

describe.sequential("parto com crias no MySQL isolado", () => {
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
            (3, 'sem-parto-isolado', 'So cadastra animal', NULL, 'user', 'comum', 1, 'ativo', 1),
            (4, 'outro-titular-isolado', 'Outra Conta', NULL, 'admin', 'principal', 4, 'ativo', 1),
            (5, 'outra-fazenda-isolado', 'So a outra fazenda', NULL, 'user', 'comum', 1, 'ativo', 1)
        `);
        await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
        await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (5, 20, 1)");
        await conn.query(`
          INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
            (2, 1, 'reproducao.criar', 1),
            (3, 1, 'animais.criar', 1),
            (5, 1, 'reproducao.criar', 1)
        `);
        await conn.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId) VALUES (100, 1, 'Maternidade', 10, 1000), (200, 1, 'Retiro', 20, 2000)");
        await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral'), (2000, 1, 20, 'Retiro')");
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
    await pool.query("DELETE FROM pesagens");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM parto_crias");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM animais");
    await pool.query(`
      INSERT INTO animais
        (id, userId, fazendaId, loteId, pastoId, status, brinco, sexo, categoria, dataNascimento, castrado) VALUES
        (17, 1, 10, 100, 1000, 'ativo', 'M17', 'femea', 'Vaca', '2018-01-01', 0),
        (18, 1, 10, 100, 1000, 'morto', 'M18', 'femea', 'Vaca', '2018-01-01', 0),
        (19, 1, 10, 100, 1000, 'ativo', 'M19', 'femea', 'Bezerra', '2026-01-01', 0),
        (21, 1, 10, 100, 1000, 'ativo', 'M21', 'femea', 'Vaca', '2018-01-01', 0),
        (50, 1, 10, 100, 1000, 'ativo', 'EXISTE', 'femea', 'Vaca', '2019-01-01', 0),
        (80, 1, 10, 100, 1000, 'ativo', 'T80', 'macho', 'Boi', '2016-01-01', 0),
        (90, 4, 40, NULL, NULL, 'ativo', 'A90', 'femea', 'Vaca', '2018-01-01', 0)
    `);
    await pool.query("INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, status) VALUES (1, 18, 10, 'morte', '2026-11-01', 'ativa')");
    await pool.query(`
      INSERT INTO reproducao_registros
        (userId, femeaId, machoId, tipo, dataCobertura, dataPrevistoParto, resultado) VALUES
        (1, 17, 80, 'Inseminação', '2026-02-01', '2026-11-08', 'Realizado')
    `);
  });

  function io(extra?: Partial<Pick<ConsultaParto, "aposTravas" | "aposParto" | "aposCria" | "aposHistorico">>): IoParto {
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

  it("registra uma cria, gêmeos, natimorto e touro externo no nome do titular", async () => {
    const principal = await registrarPartoAutorizado(io(), pedido(1, 3));
    expect(principal).toMatchObject({ ok: true, titularUserId: 1, paiId: 80, isNatimorto: false });
    if (!principal.ok) return;
    const cria = await animalDe(principal.crias[0]!.animalId);
    expect(cria).toMatchObject({ userId: 1, fazendaId: 10, loteId: 100, pastoId: 1000, maeId: 17, paiId: 80, sexo: "femea", categoria: "Bezerra" });
    expect(Number(cria?.pesoAtual)).toBeCloseTo(32.5);
    expect(Number(cria?.rastreadoNascimento)).toBe(1);
    const [peso] = (await pool.query<RowDataPacket[]>("SELECT userId, peso, observacoes FROM pesagens"))[0];
    expect(peso).toMatchObject({ userId: 1, observacoes: "Peso ao nascimento" });
    const [hist] = (await pool.query<RowDataPacket[]>("SELECT userId, loteDestinoId, fazendaId, pastoDestinoId FROM animal_lote_movimentacoes"))[0];
    expect(hist).toMatchObject({ userId: 1, loteDestinoId: 100, fazendaId: 10, pastoDestinoId: 1000 });
    const [parto] = (await pool.query<RowDataPacket[]>("SELECT userId, femeaId, machoId, tipo FROM reproducao_registros WHERE tipo = 'Parto'"))[0];
    expect(parto).toMatchObject({ userId: 1, femeaId: 17, machoId: 80, tipo: "Parto" });
    const [previsto] = (await pool.query<RowDataPacket[]>("SELECT dataPartoReal FROM reproducao_registros WHERE tipo = 'Inseminação'"))[0];
    expect(String(previsto?.dataPartoReal).slice(0, 10)).toBe("2026-11-10");
    expect(await pool.query<RowDataPacket[]>("SELECT fazendaId, loteId, pastoId FROM animais WHERE id = 17")).toBeTruthy();
    const [matriz] = (await pool.query<RowDataPacket[]>("SELECT fazendaId, loteId, pastoId, status FROM animais WHERE id = 17"))[0];
    expect(matriz).toMatchObject({ fazendaId: 10, loteId: 100, pastoId: 1000, status: "ativo" });

    const funcionario = await registrarPartoAutorizado(io(), pedido(2, 1, { input: { femeaId: 21, crias: [{ brinco: "C21", sexo: "macho", categoria: "Bezerro" }] } }));
    expect(funcionario).toMatchObject({ ok: true, titularUserId: 1, paiId: null });
    const gemeos = await registrarPartoAutorizado(io(), pedido(1, 3, {
      input: {
        crias: [
          { brinco: "G1", sexo: "femea", categoria: "Bezerra", pesoNascimento: "30" },
          { brinco: "G2", sexo: "macho", categoria: "Bezerro", pesoNascimento: "28" },
        ],
      },
    }));
    expect(gemeos.ok && gemeos.crias).toHaveLength(2);
    if (gemeos.ok) {
      expect(new Set(gemeos.crias.map((item) => item.animalId)).size).toBe(2);
      expect(gemeos.crias.every((item) => item.fazendaId === 10)).toBe(true);
    }
    const natimorto = await registrarPartoAutorizado(io(), pedido(1, 3, { input: { femeaId: 21, resultado: "Natimorto", crias: [] } }));
    expect(natimorto).toMatchObject({ ok: true, isNatimorto: true });
    if (natimorto.ok) expect(natimorto.crias).toHaveLength(0);
  });

  it("recusa quem não pode, matriz ruim, brinco, lote e pasto de outra fazenda", async () => {
    expect(await registrarPartoAutorizado(io(), pedido(3, 1, {
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["reproducao.criar"],
      fazendasInformadasPeloCliente: [10],
    }))).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_REPRODUCAO });
    expect(await registrarPartoAutorizado(io(), pedido(5, 1))).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    expect(await registrarPartoAutorizado(io(), pedido(1, 3, { input: { femeaId: 90, fazendaId: 40 } }))).toMatchObject({ mensagem: MSG_PARTO_MATRIZ_AUSENTE });
    expect(await registrarPartoAutorizado(io(), pedido(1, 3, { input: { femeaId: 999 } }))).toMatchObject({ mensagem: MSG_PARTO_MATRIZ_AUSENTE });
    expect((await registrarPartoAutorizado(io(), pedido(1, 3, { input: { femeaId: 19 } }))).ok).toBe(false);
    expect((await registrarPartoAutorizado(io(), pedido(1, 3, { input: { femeaId: 18 } }))).ok).toBe(false);
    expect(await registrarPartoAutorizado(io(), pedido(1, 3, { input: { fazendaId: 20 } }))).toMatchObject({ mensagem: MSG_PARTO_FAZENDA_DIVERGENTE });
    expect(await registrarPartoAutorizado(io(), pedido(1, 3, {
      input: { crias: [{ brinco: "EXISTE", sexo: "femea", categoria: "Bezerra" }] },
    }))).toMatchObject({ mensagem: buildBrincoAtivoConflitoMessage("EXISTE") });
    expect(await registrarPartoAutorizado(io(), pedido(1, 3, {
      input: { crias: [{ brinco: "CX", sexo: "femea", categoria: "Bezerra", loteId: 200 }] },
    }))).toMatchObject({ mensagem: MSG_PARTO_LOTE_INCOMPATIVEL });
    expect(await registrarPartoAutorizado(io(), pedido(1, 3, {
      input: { crias: [{ brinco: "CY", sexo: "femea", categoria: "Bezerra", pastoId: 2000 }] },
    }))).toMatchObject({ mensagem: MSG_PARTO_PASTO_INCOMPATIVEL });
    expect(await contar("animais")).toBe(7);
    expect(await contar("reproducao_registros WHERE tipo = 'Parto'")).toBe(0);
  });

  it("serializa dois partos, a baixa, a transferência e o cadastro do mesmo brinco", async () => {
    const diferentes = await Promise.all([
      registrarPartoAutorizado(io(), pedido(1, 3, { input: { crias: [{ brinco: "D1", sexo: "femea", categoria: "Bezerra" }] } })),
      registrarPartoAutorizado(io(), pedido(2, 1, { input: { crias: [{ brinco: "D2", sexo: "macho", categoria: "Bezerro" }] } })),
    ]);
    expect(diferentes.filter((item) => item.ok)).toHaveLength(2);

    const iguais = await Promise.all([
      registrarPartoAutorizado(io(), pedido(1, 3, { input: { crias: [{ brinco: "IGUAL", sexo: "femea", categoria: "Bezerra" }] } })),
      registrarPartoAutorizado(io(), pedido(2, 1, { input: { crias: [{ brinco: "IGUAL", sexo: "macho", categoria: "Bezerro" }] } })),
    ]);
    expect(iguais.filter((item) => item.ok)).toHaveLength(1);
    expect(iguais.some((item) => !item.ok && item.mensagem.includes("IGUAL"))).toBe(true);
    expect(await contar("animais WHERE brinco = 'IGUAL'")).toBe(1);

    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const parto = registrarPartoAutorizado(io({ aposTravas: async () => { avisou(); await segue; } }), pedido(2, 1, {
      input: { crias: [{ brinco: "CBAIXA", sexo: "femea", categoria: "Bezerra" }] },
    }));
    await travou;
    const baixa = await pool.getConnection();
    try {
      await baixa.query("SET innodb_lock_wait_timeout = 8");
      await baixa.beginTransaction();
      const espera = baixa.query("SELECT id FROM animais WHERE id = 17 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberar();
      await espera;
      await baixa.query("UPDATE animais SET status = 'morto' WHERE id = 17");
      await baixa.commit();
    } finally {
      baixa.release();
    }
    expect((await parto).ok).toBe(true);
    const [matriz] = (await pool.query<RowDataPacket[]>("SELECT status FROM animais WHERE id = 17"))[0];
    expect(String(matriz?.status)).toBe("morto");
    expect(await contar("animais WHERE brinco = 'CBAIXA' AND userId = 1 AND maeId = 17")).toBe(1);

    let liberarFazenda: () => void = () => undefined;
    const segueFazenda = new Promise<void>((resolver) => { liberarFazenda = resolver; });
    let avisouFazenda: () => void = () => undefined;
    const travouFazenda = new Promise<void>((resolver) => { avisouFazenda = resolver; });
    const outro = registrarPartoAutorizado(io({ aposTravas: async () => { avisouFazenda(); await segueFazenda; } }), pedido(1, 3, {
      input: { femeaId: 21, crias: [{ brinco: "CTRANS", sexo: "femea", categoria: "Bezerra" }] },
    }));
    await travouFazenda;
    const transf = await pool.getConnection();
    try {
      await transf.query("SET innodb_lock_wait_timeout = 8");
      await transf.beginTransaction();
      const espera = transf.query("SELECT id FROM animais WHERE id = 21 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberarFazenda();
      await espera;
      await transf.query("UPDATE animais SET fazendaId = 20 WHERE id = 21");
      await transf.commit();
    } finally {
      transf.release();
    }
    expect((await outro).ok).toBe(true);
    const [cria] = (await pool.query<RowDataPacket[]>("SELECT fazendaId, userId FROM animais WHERE brinco = 'CTRANS'"))[0];
    expect(cria).toMatchObject({ fazendaId: 10, userId: 1 });

    await pool.query("UPDATE animais SET status = 'ativo' WHERE id = 17");
    let liberarBrinco: () => void = () => undefined;
    const segueBrinco = new Promise<void>((resolver) => { liberarBrinco = resolver; });
    let avisouBrinco: () => void = () => undefined;
    const travouBrinco = new Promise<void>((resolver) => { avisouBrinco = resolver; });
    const segurado = registrarPartoAutorizado(io({
      aposCria: async () => { avisouBrinco(); await segueBrinco; },
    }), pedido(1, 3, { input: { crias: [{ brinco: "CLOCK", sexo: "femea", categoria: "Bezerra" }] } }));
    await travouBrinco;
    const cadastro = await pool.getConnection();
    try {
      await cadastro.query("SET innodb_lock_wait_timeout = 8");
      await cadastro.beginTransaction();
      const espera = cadastro.query("SELECT id FROM animais WHERE brinco = 'CLOCK' FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberarBrinco();
      await espera;
      await cadastro.rollback();
    } finally {
      cadastro.release();
    }
    expect((await segurado).ok).toBe(true);
    expect(await contar("animais WHERE brinco = 'CLOCK'")).toBe(1);
  });

  it("desfaz parto, cria e histórico quando qualquer etapa falha", async () => {
    const antes = await contar("animais");
    await expect(registrarPartoAutorizado(io({ aposParto: async () => { throw new Error("falha no parto"); } }), pedido(1, 3))).rejects.toThrow("falha no parto");
    await expect(registrarPartoAutorizado(io({
      aposCria: async (indice) => { if (indice === 1) throw new Error("falha na cria"); },
    }), pedido(1, 3, {
      input: {
        crias: [
          { brinco: "R1", sexo: "femea", categoria: "Bezerra" },
          { brinco: "R2", sexo: "macho", categoria: "Bezerro" },
        ],
      },
    }))).rejects.toThrow("falha na cria");
    await expect(registrarPartoAutorizado(io({
      aposHistorico: async () => { throw new Error("falha no histórico"); },
    }), pedido(2, 1))).rejects.toThrow("falha no histórico");
    expect(await contar("animais")).toBe(antes);
    expect(await contar("reproducao_registros WHERE tipo = 'Parto'")).toBe(0);
    expect(await contar("parto_crias")).toBe(0);
    expect(await contar("pesagens")).toBe(0);
    expect(await contar("animal_lote_movimentacoes")).toBe(0);
    const deNovo = await registrarPartoAutorizado(io(), pedido(1, 3, { input: { crias: [{ brinco: "FINAL", sexo: "femea", categoria: "Bezerra" }] } }));
    expect(deNovo).toMatchObject({ ok: true, titularUserId: 1 });
  });

  async function animalDe(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0];
  }

  async function contar(where: string) {
    const [linhas] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${where.includes(" ") ? where : `${where}`}`);
    return Number(linhas[0]?.n);
  }
});

function pedido(
  executorId: number,
  session: number,
  extra: Partial<Omit<PedidoParto, "input">> & { input?: Partial<PedidoParto["input"]> } = {},
): PedidoParto {
  return {
    executorId,
    sessionVersionDaSessao: session,
    titularInformadoPeloCliente: extra.titularInformadoPeloCliente,
    papelInformadoPeloCliente: extra.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: extra.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: extra.fazendasInformadasPeloCliente,
    input: {
      femeaId: 17,
      fazendaId: 10,
      dataParto: "2026-11-10",
      resultado: "Normal",
      crias: [{ brinco: "C1", sexo: "femea", categoria: "Bezerra", pesoNascimento: "32.5" }],
      ...extra.input,
    },
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaParto {
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
    async espiarRegistros(userId, femeaId) { return lerRegistros(conn, userId, femeaId, false); },
    async travaLote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: linhas[0].fazendaId == null ? null : Number(linhas[0].fazendaId) } : null;
    },
    async travaPasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: Number(linhas[0].fazendaId) } : null;
    },
    async travaAnimal(id) { return lerAnimal(conn, id, true); },
    async travaRegistros(userId, femeaId) { return lerRegistros(conn, userId, femeaId, true); },
    async baixaAtiva(userId, animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE userId = ? AND animalId = ? AND status = 'ativa' FOR UPDATE",
        [userId, animalId],
      );
      return linhas[0] ? { dataBaixa: linhas[0].dataBaixa } : null;
    },
    async brincoAtivo(userId, fazendaId, brinco) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM animais WHERE userId = ? AND status = 'ativo' AND LOWER(TRIM(brinco)) = ?
         AND (fazendaId = ? OR fazendaId IS NULL) FOR UPDATE`,
        [userId, brinco.trim().toLowerCase(), fazendaId],
      );
      return linhas[0] ? { id: Number(linhas[0].id) } : null;
    },
    async rfidAtivo(userId, rfid) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM animais WHERE userId = ? AND status = 'ativo' AND TRIM(brincoEletronico) = ? FOR UPDATE",
        [userId, rfid],
      );
      return linhas[0] ? { id: Number(linhas[0].id) } : null;
    },
    async inserirParto(row) {
      const [resultado] = await conn.query(
        `INSERT INTO reproducao_registros (userId, femeaId, machoId, tipo, dataCobertura, resultado, observacoes)
         VALUES (?, ?, ?, 'Parto', ?, ?, ?)`,
        [row.userId, row.femeaId, row.machoId, row.dataCobertura, row.resultado, row.observacoes],
      );
      return Number((resultado as ResultSetHeader).insertId);
    },
    async fecharPrevisoes(userId, femeaId, dataParto) {
      await conn.query(
        `UPDATE reproducao_registros SET dataPartoReal = ?
         WHERE userId = ? AND femeaId = ? AND dataPrevistoParto IS NOT NULL AND dataPartoReal IS NULL`,
        [dataParto, userId, femeaId],
      );
    },
    async inserirAnimal(row) {
      const [resultado] = await conn.query(
        `INSERT INTO animais
          (userId, brinco, brincoEletronico, sexo, dataNascimento, pesoAtual, categoria, loteId, pastoId, fazendaId, maeId, paiId, status, rastreadoNascimento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', 1)`,
        [row.userId, row.brinco, row.brincoEletronico, row.sexo, row.dataNascimento, row.pesoAtual, row.categoria, row.loteId, row.pastoId, row.fazendaId, row.maeId, row.paiId],
      );
      return Number((resultado as ResultSetHeader).insertId);
    },
    async inserirMovimento(row) {
      await conn.query(
        `INSERT INTO animal_lote_movimentacoes
          (userId, animalId, loteDestinoId, pastoDestinoId, fazendaId, dataMovimentacao, usuarioNome)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.animalId, row.loteDestinoId, row.pastoDestinoId, row.fazendaId, row.dataMovimentacao, row.usuarioNome],
      );
    },
    async inserirVinculo(row) {
      await conn.query(
        "INSERT INTO parto_crias (userId, partoRegistroId, criaAnimalId, ordem) VALUES (?, ?, ?, ?)",
        [row.userId, row.partoRegistroId, row.criaAnimalId, row.ordem],
      );
    },
    async inserirPesagem(row) {
      const [resultado] = await conn.query(
        "INSERT INTO pesagens (userId, animalId, peso, data, observacoes) VALUES (?, ?, ?, ?, 'Peso ao nascimento')",
        [row.userId, row.animalId, row.peso, row.data],
      );
      return Number((resultado as ResultSetHeader).insertId);
    },
  };
}

async function lerAnimal(conn: mysql.PoolConnection, id: number, travar: boolean): Promise<AnimalPartoLinha | null> {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT id, userId, fazendaId, loteId, pastoId, sexo, categoria, status, dataNascimento, castrado
     FROM animais WHERE id = ?${travar ? " FOR UPDATE" : ""}`,
    [id],
  );
  const linha = linhas[0];
  if (!linha) return null;
  return {
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    sexo: linha.sexo == null ? null : String(linha.sexo),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    status: linha.status == null ? null : String(linha.status),
    dataNascimento: linha.dataNascimento,
    castrado: linha.castrado == null ? null : Number(linha.castrado),
  };
}

async function lerRegistros(conn: mysql.PoolConnection, userId: number, femeaId: number, travar: boolean): Promise<RegistroPartoLinha[]> {
  const [linhas] = await conn.query<RowDataPacket[]>(
    `SELECT id, tipo, machoId, dataCobertura, resultado FROM reproducao_registros
     WHERE userId = ? AND femeaId = ? ORDER BY id${travar ? " FOR UPDATE" : ""}`,
    [userId, femeaId],
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    tipo: String(linha.tipo),
    machoId: linha.machoId == null ? null : Number(linha.machoId),
    dataCobertura: linha.dataCobertura,
    resultado: linha.resultado == null ? null : String(linha.resultado),
  }));
}
