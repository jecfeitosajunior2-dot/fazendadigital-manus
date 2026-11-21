import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO } from "../shared/reproInseminacao";
import {
  MSG_SEMEN_PARTIDA_INCOMPATIVEL,
  MSG_SEMEN_PARTIDA_NAO_ENCONTRADA,
  MSG_SEMEN_SEM_DOSES,
} from "../shared/semenEstoque";
import {
  baixarEEspelharAnimal,
  type ConsultaBaixaAnimal,
  type IoBaixaAnimal,
  type PedidoBaixaAnimal,
} from "./baixarAnimalAutorizado";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  lancarInseminacaoSemenAutorizado,
  lancarInseminacaoSemenEEspelhar,
  type ConsultaInseminacao,
  type IoInseminacao,
  type PartidaSemenLinha,
  type PedidoInseminacao,
} from "./inseminacaoSemenAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import type { ConsultaAnimaisLote, IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";
import {
  MSG_REPRODUTOR_AUSENTE,
  MSG_REPRODUTOR_OUTRA_FAZENDA,
  MSG_SEM_FAZENDA_MANEJO,
  registrarReproducaoSimplesAutorizado,
  type ConsultaManejo,
  type IoManejo,
  type PedidoReproducaoSimples,
} from "./registrarManejoAutorizado";
import {
  transferirEEspelharAnimalFazenda,
  type PedidoTransferenciaFazenda,
} from "./transferirAnimalFazendaAutorizado";
import { MSG_REPRO_MACHO_CASTRADO_REPRODUTOR } from "../shared/reproElegibilidade";
import { metodosOperacaoRepro } from "./reproducaoOperacaoIsolado";

const exec = promisify(execFile);
let seqIa = 0;
function chaveIa() {
  seqIa += 1;
  return `00000000-0000-4000-8000-${seqIa.toString(16).padStart(12, "0")}`;
}
const CONTAINER = "fd-h4y-semen";
const PORTA = 3350;
const SENHA = "isolado-h4y";
const BANCO = "fd_h4y";
const DATA = "2026-11-10";

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
CREATE TABLE pastos (
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL,
  nome varchar(100) NOT NULL, status varchar(20) NOT NULL DEFAULT 'ativo', PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  fazendaId int NULL, pastoAtualId int NULL, ativo tinyint(1) NOT NULL DEFAULT 1, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL, fazendaId int NULL,
  pastoId int NULL, status varchar(20) NOT NULL, brinco varchar(50) NULL,
  dataNascimento date NULL, categoria varchar(50) NULL, sexo varchar(20) NULL,
  castrado tinyint(1) NULL, pesoAtual decimal(8,2) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_partidas (
  id int NOT NULL, user_id int NOT NULL, fazenda_id int NOT NULL,
  origem_reprodutor varchar(20) NOT NULL, reprodutor_key varchar(120) NOT NULL,
  macho_id int NULL, reprodutor_texto varchar(500) NULL, partida varchar(120) NOT NULL,
  central_origem varchar(150) NULL, saldo_doses int NOT NULL, custo_unitario decimal(12,2) NULL,
  status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, partida_id int NOT NULL, user_id int NOT NULL,
  fazenda_id int NOT NULL, tipo varchar(20) NOT NULL, data_entrada date NOT NULL,
  quantidade_doses int NOT NULL, custo_total decimal(12,2) NOT NULL,
  custo_unitario decimal(12,2) NOT NULL, observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_operacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, chave varchar(64) NOT NULL,
  fazendaId int NOT NULL, executorUserId int NOT NULL, conteudoHash varchar(64) NOT NULL,
  registroPrincipalId int NULL, espelhosMatriz int NOT NULL DEFAULT 0,
  matrizesIgnoradas int NOT NULL DEFAULT 0, criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY reproducao_operacoes_titular_chave_uq (userId, chave)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL,
  machoId int NULL, tipo varchar(50) NOT NULL, dataCobertura date NOT NULL,
  dataPrevistoParto date NULL, resultado varchar(50) NULL, observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  destino varchar(255) NULL, motivo varchar(255) NULL, observacoes text NULL,
  usuarioNome varchar(200) NULL, vendaId int NULL, status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteOrigemId int NULL, loteDestinoId int NOT NULL, pastoOrigemId int NULL,
  pastoDestinoId int NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, usuarioNome varchar(200) NULL, observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;

async function docker(...args: string[]) {
  return exec("docker", args, { windowsHide: true });
}

function alvo() {
  return { host: "127.0.0.1", port: PORTA, database: BANCO, container: CONTAINER };
}

async function conectar(banco?: string) {
  afirmarBancoDescartavel(alvo());
  return mysql.createConnection({
    host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: banco,
    multipleStatements: true, dateStrings: true,
  });
}

async function esperarMysql() {
  const prazo = Date.now() + 90_000;
  let ultimo = "";
  while (Date.now() < prazo) {
    try {
      const conn = await conectar();
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

function ehDeadlock(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const candidato = atual as { errno?: number; code?: string; cause?: unknown };
    if (candidato.errno === 1213 || candidato.code === "ER_LOCK_DEADLOCK") return true;
    atual = candidato.cause;
  }
  return false;
}

describe.sequential("inseminação com sêmen em MySQL isolado", () => {
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
    await esperarMysql();
    const conn = await conectar(BANCO);
    await conn.query(ESQUEMA);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'principal-isolado', 'Administrador da conta', 'principal@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'funcionario-isolado', 'Funcionario Curral', 'curral@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (3, 'sem-permissao-isolado', 'Sem Permissao', 'sem@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (4, 'outro-titular-isolado', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1),
        (5, 'so-outra-isolado', 'So Outra Fazenda', 'outra@isolado.local', 'user', 'comum', 1, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (5, 20, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'reproducao.criar', 1),
        (3, 1, 'reproducao.visualizar', 1),
        (5, 1, 'reproducao.criar', 1)
    `);
    await conn.query(`
      INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
        (1000, 1, 10, 'Curral'), (2000, 1, 20, 'Retiro'), (4000, 4, 40, 'Alheio')
    `);
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, macho_id, reprodutor_texto, partida, central_origem, saldo_doses, custo_unitario, status)
      VALUES
        (500, 1, 10, 'interno', 'm:80', 80, 'Touro 80', 'L23081', 'Central A', 5, 100.00, 'disponivel'),
        (501, 1, 20, 'interno', 'm:81', 81, 'Touro 81', 'RETIRO', 'Central B', 5, 80.00, 'disponivel'),
        (502, 1, 10, 'interno', 'm:80', 80, 'Touro 80', 'POUCA', 'Central A', 0, 100.00, 'esgotado'),
        (503, 4, 40, 'interno', 'm:90', 90, 'Alheio', 'ALHEIA', NULL, 5, 10.00, 'disponivel'),
        (504, 1, 10, 'externo', 'e:gsc-7117', NULL, 'GSC-7117', 'SEM-LOTE', 'ABS', 4, 50.00, 'disponivel'),
        (505, 1, 10, 'interno', 'm:89', 89, 'Touro 89', 'OUTRO', 'Central A', 3, 90.00, 'disponivel')
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      dateStrings: true, connectionLimit: 8,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM semen_movimentacoes");
    await pool.query("DELETE FROM reproducao_operacoes");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, status = 'disponivel' WHERE id IN (500, 501, 503)");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 0, status = 'esgotado' WHERE id = 502");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 4, status = 'disponivel' WHERE id = 504");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 3, status = 'disponivel' WHERE id = 505");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, ativo) VALUES
        (100, 1, 'Lote da sede', 10, 1000, 1),
        (200, 1, 'Lote do retiro', 20, 2000, 1),
        (400, 4, 'Lote alheio', 40, 4000, 1)
    `);
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, categoria, sexo, castrado) VALUES
        (70, 1, 100, 10, 1000, 'ativo', 'BR-70', 'Vaca', 'femea', 0),
        (71, 1, 100, 10, 1000, 'ativo', 'BR-71', 'Vaca', 'femea', 0),
        (72, 1, 100, 10, 1000, 'vendido', 'BR-72', 'Vaca', 'femea', 0),
        (73, 4, 400, 40, 4000, 'ativo', 'BR-73', 'Vaca', 'femea', 0),
        (74, 1, 100, 10, 1000, 'ativo', 'BR-74', 'Vaca', 'femea', 0),
        (75, 1, 100, 10, 1000, 'ativo', 'BR-75', 'Vaca', 'femea', 0),
        (76, 1, 100, 10, 1000, 'ativo', 'BR-76', 'Vaca', 'femea', 0),
        (77, 1, 100, 10, 1000, 'ativo', 'BR-77', 'Vaca', 'femea', 0),
        (78, 1, 100, 10, 1000, 'ativo', 'BR-78', 'Vaca', 'femea', 0),
        (83, 1, 100, 10, 1000, 'ativo', 'BR-83', 'Bezerra', 'femea', 0),
        (85, 1, 100, 10, 1000, 'ativo', 'BR-85', 'Boi', 'macho', 0),
        (86, 1, 100, 10, 1000, 'vendido', 'BR-86', 'Vaca', 'femea', 0),
        (80, 1, 100, 10, 1000, 'ativo', 'TO-80', 'Boi', 'macho', 0),
        (81, 1, 200, 20, 2000, 'ativo', 'TO-81', 'Boi', 'macho', 0),
        (82, 1, 100, 10, 1000, 'ativo', 'TO-82', 'Boi', 'macho', 1),
        (89, 1, 100, 10, 1000, 'ativo', 'TO-89', 'Boi', 'macho', 0)
    `);
    await pool.query(`
      INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, status) VALUES
        (1, 72, 10, 'venda', '2026-11-01', 'Venda', 'caixa', 'ativa'),
        (1, 86, 10, 'venda', '2026-11-10', 'Venda', 'caixa', 'ativa')
    `);
    await pool.query(`
      INSERT INTO reproducao_registros (userId, femeaId, tipo, dataCobertura, resultado, observacoes)
      VALUES (1, 77, 'Diagnóstico de prenhez', '2026-10-01', 'Prenha', 'anterior')
    `);
  });

  function io(ganchos: Partial<IoInseminacao> = {}): IoInseminacao {
    return {
      ...ganchos,
      async emTransacao(fn) {
        afirmarBancoDescartavel(alvo());
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultas(conn));
            await conn.commit();
            return resultado;
          } catch (erro) {
            await conn.rollback();
            throw erro;
          }
        } finally {
          conn.release();
        }
      },
    };
  }

  function pedido(executorId: number, sessionVersion: number, extra: Partial<PedidoInseminacao["input"]> = {}, extras: Partial<PedidoInseminacao> = {}): PedidoInseminacao {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 1 ? "Administrador da conta" : "Funcionario Curral",
      input: {
        animalId: 70,
        fazendaId: 10,
        tipo: "Inseminação",
        dataCobertura: DATA,
        machoId: 80,
        semenPartidaId: 500,
        inseminador: "João do curral",
        observacoes: "curral",
        operacaoId: chaveIa(),
        ...extra,
      },
      ...extras,
    };
  }

  async function repro(femeaId?: number) {
    const filtro = femeaId == null ? "" : " WHERE femeaId = ?";
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM reproducao_registros${filtro} ORDER BY id`,
      femeaId == null ? [] : [femeaId],
    );
    return linhas;
  }

  async function saldo(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT saldo_doses, status FROM semen_partidas WHERE id = ?", [id]);
    return linhas[0];
  }

  async function movimentos(partidaId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM semen_movimentacoes WHERE partida_id = ? ORDER BY id",
      [partidaId],
    );
    return linhas;
  }

  it("1. principal e funcionário consomem uma dose no nome do titular", async () => {
    const espelhos: number[] = [];
    const principal = await lancarInseminacaoSemenEEspelhar(io(), pedido(1, 3, {}, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }), {
      async inseminar(userId) { espelhos.push(userId); },
    });
    expect(principal).toMatchObject({ ok: true, userId: 1, executorUserId: 1 });
    expect(espelhos).toEqual([1]);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    const linha = (await repro(70))[0];
    expect(Number(linha?.userId)).toBe(1);
    expect(Number(linha?.machoId)).toBe(80);
    expect(String(linha?.tipo)).toBe("Inseminação");
    expect(String(linha?.observacoes)).toContain("João do curral");
    expect(String(linha?.observacoes)).not.toContain("Administrador da conta");
    const mov = await movimentos(500);
    expect(mov).toHaveLength(1);
    expect(Number(mov[0]?.quantidade_doses)).toBe(1);
    expect(Number(mov[0]?.user_id)).toBe(1);
    expect(Number(mov[0]?.fazenda_id)).toBe(10);

    const segunda = await lancarInseminacaoSemenAutorizado(io(), pedido(2, 1, { animalId: 71 }));
    expect(segunda).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(3);
    expect(await movimentos(500)).toHaveLength(2);
    const anterior = await repro(77);
    expect(anterior).toHaveLength(1);
    expect(String(anterior[0]?.observacoes)).toBe("anterior");
  });

  it("2. recusa permissão, fazenda, titular, matriz, touro e saldo", async () => {
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(3, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(5, 1))).toMatchObject({
      ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_MANEJO,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 99))).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 73 }))).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 999 }))).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 85 }))).toMatchObject({ ok: false, motivo: "animal_invalido" });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 83 }))).toMatchObject({ ok: false, motivo: "animal_invalido" });
    const vendida = await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 72 }));
    expect(vendida.ok).toBe(false);
    if (!vendida.ok) expect(vendida.mensagem).toContain("baixado");
    const noDia = await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 86 }));
    expect(noDia.ok).toBe(true);
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { semenPartidaId: 501 }))).toMatchObject({
      ok: false, mensagem: MSG_SEMEN_PARTIDA_INCOMPATIVEL,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { semenPartidaId: 502 }))).toMatchObject({
      ok: false, mensagem: MSG_SEMEN_SEM_DOSES,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { semenPartidaId: 503 }))).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { semenPartidaId: 999 }))).toMatchObject({
      ok: false, mensagem: MSG_SEMEN_PARTIDA_NAO_ENCONTRADA,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { machoId: 999 }))).toMatchObject({
      ok: false, mensagem: MSG_REPRODUTOR_AUSENTE,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { machoId: 81 }))).toMatchObject({
      ok: false, mensagem: MSG_REPRODUTOR_OUTRA_FAZENDA,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { machoId: 82 }))).toMatchObject({
      ok: false, mensagem: MSG_REPRO_MACHO_CASTRADO_REPRODUTOR,
    });
    expect(await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { machoId: 89, semenPartidaId: 500 }))).toMatchObject({
      ok: false, mensagem: MSG_SEMEN_PARTIDA_INCOMPATIVEL,
    });
    const externa = await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, {
      machoId: undefined, semenPartidaId: 504, reprodutorSemen: "GSC-7117",
    }));
    expect(externa).toMatchObject({ ok: false, mensagem: MSG_REPRO_CUSTO_DOSE_EXTERNO_OBRIGATORIO });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    expect(Number((await saldo(502))?.saldo_doses)).toBe(0);
    expect(Number((await saldo(504))?.saldo_doses)).toBe(4);
  });

  it("3. sêmen externo grava o inseminador e o custo da partida", async () => {
    const criada = await lancarInseminacaoSemenAutorizado(io(), pedido(2, 1, {
      animalId: 78,
      machoId: undefined,
      semenPartidaId: 504,
      reprodutorSemen: "GSC-7117",
      custoDoseSemen: 80,
      inseminador: "João do curral",
    }));
    expect(criada).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(Number((await saldo(504))?.saldo_doses)).toBe(3);
    const linha = (await repro(78))[0];
    expect(linha?.machoId).toBeNull();
    expect(String(linha?.observacoes)).toContain("João do curral");
    expect(String(linha?.observacoes)).toContain("50");
    expect(String(linha?.observacoes)).not.toContain("Funcionario Curral");
    expect(Number((await movimentos(504))[0]?.quantidade_doses)).toBe(1);
    expect(String((await saldo(504))?.status)).toBe("disponivel");
  });

  it("4. falha no histórico ou na dose desfaz tudo", async () => {
    await expect(lancarInseminacaoSemenAutorizado(io({
      async aposHistorico() { throw new Error("historico fora"); },
    }), pedido(1, 3))).rejects.toThrow("historico fora");
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(await repro(70)).toHaveLength(0);
    expect(await movimentos(500)).toHaveLength(0);
    await expect(lancarInseminacaoSemenAutorizado(io({
      async aposRegistro() { throw new Error("dose fora"); },
    }), pedido(1, 3))).rejects.toThrow("dose fora");
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(await repro(70)).toHaveLength(0);
    const anterior = await repro(77);
    expect(String(anterior[0]?.observacoes)).toBe("anterior");
  });

  it("5. duas inseminações e duas matrizes no mesmo saldo", async () => {
    const [ida, volta] = await Promise.all([
      lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 70 })),
      lancarInseminacaoSemenAutorizado(io(), pedido(2, 1, { animalId: 70 })),
    ]);
    expect([ida, volta].filter((item) => item.ok)).toHaveLength(2);
    expect(await repro(70)).toHaveLength(2);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(3);
    expect(await movimentos(500)).toHaveLength(2);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 1, status = 'disponivel' WHERE id = 500");
    await pool.query("DELETE FROM reproducao_registros WHERE femeaId IN (70, 71)");
    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500");
    const [alto, baixo] = await Promise.all([
      lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 70 })),
      lancarInseminacaoSemenAutorizado(io(), pedido(2, 1, { animalId: 71 })),
    ]);
    expect([alto, baixo].filter((item) => item.ok)).toHaveLength(1);
    expect([alto, baixo].find((item) => !item.ok)).toMatchObject({ mensagem: MSG_SEMEN_SEM_DOSES });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(0);
    expect(String((await saldo(500))?.status)).toBe("esgotado");
    expect((await repro(70)).length + (await repro(71)).length).toBe(1);
    expect(await movimentos(500)).toHaveLength(1);
  });

  it("6. concorrência com baixa, transferência, prenhez e estorno antigo", async () => {
    const [ia, baixa] = await Promise.all([
      lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 74 })),
      baixarEEspelharAnimal(ioBaixa(), {
        executorId: 1,
        sessionVersionDaSessao: 3,
        executorNome: "Administrador da conta",
        input: { fazendaId: 10, animalId: 74, dataBaixa: DATA, tipo: "morte", motivo: "doenca" },
      } satisfies PedidoBaixaAnimal, { async baixar() {} }),
    ]);
    const dosesBaixa = Number((await saldo(500))?.saldo_doses);
    expect(dosesBaixa).toBe(ia.ok ? 4 : 5);
    expect(await repro(74)).toHaveLength(ia.ok ? 1 : 0);
    expect(await movimentos(500)).toHaveLength(ia.ok ? 1 : 0);
    if (baixa.ok) {
      const [animal] = await pool.query<RowDataPacket[]>("SELECT status FROM animais WHERE id = 74");
      expect(String(animal[0]?.status)).toBe("morto");
    }

    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, status = 'disponivel' WHERE id = 500");
    await pool.query("DELETE FROM semen_movimentacoes");
    const saldoAntes = 5;
    const [sanidade, mudanca] = await Promise.all([
      lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 75 })),
      transferirEEspelharAnimalFazenda(ioMovimento(), {
        executorId: 1,
        sessionVersionDaSessao: 3,
        executorNome: "Administrador da conta",
        input: {
          fazendaOrigemId: 10, fazendaDestinoId: 20, animalId: 75,
          loteDestinoId: 200, pastoDestinoId: 2000, dataTransferencia: DATA,
        },
      } satisfies PedidoTransferenciaFazenda, { async transferir() {} }),
    ]);
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT fazendaId, status FROM animais WHERE id = 75");
    expect(String(linhas[0]?.status)).toBe("ativo");
    expect(Number(linhas[0]?.fazendaId)).toBe(mudanca.ok ? 20 : 10);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(sanidade.ok ? saldoAntes - 1 : saldoAntes);
    expect(await repro(75)).toHaveLength(sanidade.ok ? 1 : 0);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, status = 'disponivel' WHERE id = 500");
    await pool.query("DELETE FROM semen_movimentacoes");
    const diagnostico: PedidoReproducaoSimples = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { animalId: 76, fazendaId: 10, tipo: "Diagnóstico de prenhez", dataCobertura: DATA, resultado: "Prenha" },
    };
    const [inseminacao, prenhez] = await Promise.all([
      lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 76 })),
      registrarReproducaoSimplesAutorizado(ioManejo(), diagnostico),
    ]);
    expect(inseminacao.ok).toBe(true);
    expect(prenhez.ok).toBe(true);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    const eventos = await repro(76);
    expect(eventos.map((item) => String(item.tipo)).sort()).toEqual(["Diagnóstico de prenhez", "Inseminação"]);

    const antigo = Number((await repro(77))[0]?.id);
    const [nova, apagada] = await Promise.all([
      lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 77 })),
      pool.query("DELETE FROM reproducao_registros WHERE id = ?", [antigo]),
    ]);
    expect(nova.ok).toBe(true);
    expect(apagada).toBeTruthy();
    const ficou = await repro(77);
    expect(ficou.some((item) => String(item.observacoes) === "anterior")).toBe(false);
    expect(ficou.some((item) => String(item.tipo) === "Inseminação")).toBe(true);
    expect(await movimentos(500)).toHaveLength(2);
  });

  it("7. diagnóstico sem sêmen não mexe na dose e o deadlock não duplica", async () => {
    const diagnostico = await registrarReproducaoSimplesAutorizado(ioManejo(), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      input: { animalId: 71, fazendaId: 10, tipo: "Diagnóstico de prenhez", dataCobertura: DATA, resultado: "Vazia" },
    });
    expect(diagnostico).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(await movimentos(500)).toHaveLength(0);

    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = lancarInseminacaoSemenAutorizado(io({
      aposIdentidade: async () => {
        avisou();
        await segue;
      },
    }), pedido(1, 3, { animalId: 70 }));
    await travou;
    const externa = await pool.getConnection();
    let deadlock = false;
    try {
      await externa.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await externa.beginTransaction();
      await externa.query("SELECT id FROM animais WHERE id = 70 FOR UPDATE");
      const esperaUsuario = externa.query("SELECT id FROM users WHERE id = 1 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberar();
      try {
        await esperaUsuario;
      } catch (erro) {
        deadlock = ehDeadlock(erro);
      }
      await externa.rollback();
    } finally {
      externa.release();
    }
    const resultado = await operacao;
    expect(deadlock).toBe(true);
    expect(resultado.ok).toBe(true);
    expect(await repro(70)).toHaveLength(1);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    expect(await movimentos(500)).toHaveLength(1);
  });

  it("8. a mesma chave não consome outra dose", async () => {
    const chave = chaveIa();
    let espelhos = 0;
    const primeira = await lancarInseminacaoSemenEEspelhar(io(), pedido(1, 3, { operacaoId: chave }), {
      async inseminar() { espelhos += 1; },
    });
    expect(primeira).toMatchObject({ ok: true, repetida: false, userId: 1 });
    expect(espelhos).toBe(1);
    const repetida = await lancarInseminacaoSemenEEspelhar(io(), pedido(2, 1, { operacaoId: chave }), {
      async inseminar() { espelhos += 1; },
    });
    expect(repetida).toMatchObject({
      ok: true,
      repetida: true,
      id: primeira.ok ? primeira.id : 0,
      movimentacaoId: primeira.ok ? primeira.movimentacaoId : 0,
    });
    expect(espelhos).toBe(1);
    expect(await repro(70)).toHaveLength(1);
    expect(await movimentos(500)).toHaveLength(1);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    const [custo] = await pool.query<RowDataPacket[]>("SELECT custo_unitario FROM semen_partidas WHERE id = 500");
    expect(String(custo[0]?.custo_unitario)).toBe("100.00");
    expect(String((await movimentos(500))[0]?.custo_total)).toBe("100.00");

    const divergente = await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { operacaoId: chave, observacoes: "outro texto" }));
    expect(divergente).toMatchObject({ ok: false, motivo: "invalido" });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);

    const legítima = await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { observacoes: "segunda" }));
    expect(legítima).toMatchObject({ ok: true, repetida: false });
    expect(await repro(70)).toHaveLength(2);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(3);

    await pool.query("DELETE FROM usuario_permissoes WHERE userId = 2");
    const semPermissao = await lancarInseminacaoSemenAutorizado(io(), pedido(2, 1, { operacaoId: chave }));
    expect(semPermissao).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(3);
    await pool.query("INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES (2, 1, 'reproducao.criar', 1)");

    await pool.query("INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, categoria, sexo, castrado) VALUES (90, 4, 400, 40, 4000, 'ativo', 'TO-90', 'Boi', 'macho', 0)");
    const outroTitular = await lancarInseminacaoSemenAutorizado(io(), pedido(4, 1, {
      animalId: 73, fazendaId: 40, machoId: 90, semenPartidaId: 503, operacaoId: chave,
    }));
    expect(outroTitular.ok).toBe(true);
    expect(Number((await saldo(503))?.saldo_doses)).toBe(4);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(3);
    const [chaves] = await pool.query<RowDataPacket[]>("SELECT userId FROM reproducao_operacoes WHERE chave = ?", [chave]);
    expect(chaves).toHaveLength(2);

    const chaveFalha = chaveIa();
    await expect(lancarInseminacaoSemenAutorizado(io({
      async aposHistorico() { throw new Error("antes do commit"); },
    }), pedido(1, 3, { animalId: 71, operacaoId: chaveFalha }))).rejects.toThrow("antes do commit");
    expect(await repro(71)).toHaveLength(0);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(3);
    const retomada = await lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 71, operacaoId: chaveFalha }));
    expect(retomada).toMatchObject({ ok: true, repetida: false });
    expect(await repro(71)).toHaveLength(1);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(2);

    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const chavePar = chaveIa();
    const ida = lancarInseminacaoSemenAutorizado(io({
      aposHistorico: async () => { avisou(); await segue; },
    }), pedido(2, 1, { animalId: 74, operacaoId: chavePar }));
    await travou;
    const volta = lancarInseminacaoSemenAutorizado(io(), pedido(1, 3, { animalId: 74, operacaoId: chavePar }));
    await new Promise((resolver) => setTimeout(resolver, 250));
    liberar();
    const [a, b] = await Promise.all([ida, volta]);
    expect(a.ok && b.ok).toBe(true);
    expect([a, b].filter((item) => item.ok && item.repetida)).toHaveLength(1);
    expect(await repro(74)).toHaveLength(1);
    expect(await movimentos(500)).toHaveLength(4);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(1);
  }, 30_000);

  function transacao<TConsulta>(montar: (conn: mysql.PoolConnection) => TConsulta) {
    return {
      async emTransacao<T>(fn: (tx: TConsulta) => Promise<T>) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(montar(conn));
            await conn.commit();
            return resultado;
          } catch (erro) {
            await conn.rollback();
            throw erro;
          }
        } finally {
          conn.release();
        }
      },
    };
  }

  function ioBaixa(): IoBaixaAnimal {
    return transacao((conn) => consultasBaixa(conn));
  }

  function ioMovimento(): IoAnimaisLote {
    return transacao((conn) => consultasMovimento(conn));
  }

  function ioManejo(): IoManejo {
    return transacao((conn) => consultasManejo(conn));
  }
});

function autenticacao(conn: mysql.PoolConnection) {
  return {
    async usuario(id: number): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE id = ? FOR UPDATE`,
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        openId: String(linha.openId),
        name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email),
        role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel,
        titularUserId: linha.titularUserId == null ? null : Number(linha.titularUserId),
        situacao: linha.situacao,
        sessionVersion: Number(linha.sessionVersion),
      };
    },
    async permissoes(userId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE",
        [userId, titularUserId],
      );
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId
         WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
        [userId, titularUserId],
      );
      return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
    },
    async fazendasDoTitular(titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE userId = ?", [titularUserId]);
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
    },
  };
}

function mapearAnimal(linha: RowDataPacket) {
  return {
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    status: linha.status == null ? null : String(linha.status),
    sexo: linha.sexo == null ? null : String(linha.sexo),
    castrado: linha.castrado == null ? null : Number(linha.castrado),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    dataNascimento: linha.dataNascimento == null ? null : String(linha.dataNascimento).slice(0, 10),
  };
}

function mapearPartida(linha: RowDataPacket): PartidaSemenLinha {
  return {
    id: Number(linha.id),
    userId: Number(linha.user_id),
    fazendaId: Number(linha.fazenda_id),
    origemReprodutor: String(linha.origem_reprodutor),
    reprodutorKey: String(linha.reprodutor_key),
    machoId: linha.macho_id == null ? null : Number(linha.macho_id),
    reprodutorTexto: linha.reprodutor_texto == null ? null : String(linha.reprodutor_texto),
    partida: String(linha.partida),
    centralOrigem: linha.central_origem == null ? null : String(linha.central_origem),
    saldoDoses: Number(linha.saldo_doses),
    custoUnitario: linha.custo_unitario == null ? null : String(linha.custo_unitario),
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaInseminacao {
  return {
    ...autenticacao(conn),
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      return linha ? { id: Number(linha.id), userId: Number(linha.userId), fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId) } : null;
    },
    async pasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      return linha ? { id: Number(linha.id), userId: Number(linha.userId), fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId) } : null;
    },
    async espiar(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM animais WHERE id = ? AND userId = ? FOR UPDATE",
        [id, titularUserId],
      );
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async baixaAtiva(animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1 FOR UPDATE",
        [animalId],
      );
      if (!linhas[0]) return null;
      return { dataBaixa: linhas[0].dataBaixa == null ? null : String(linhas[0].dataBaixa).slice(0, 10) };
    },
    async espiarPartida(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ?", [id]);
      return linhas[0] ? mapearPartida(linhas[0]) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM semen_partidas WHERE id = ? AND user_id = ? FOR UPDATE",
        [id, titularUserId],
      );
      return linhas[0] ? mapearPartida(linhas[0]) : null;
    },
    async inserirReproducao(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO reproducao_registros (userId, femeaId, machoId, tipo, dataCobertura, dataPrevistoParto, resultado, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.femeaId, row.machoId ?? null, row.tipo, row.dataCobertura, row.dataPrevistoParto ?? null, row.resultado ?? null, row.observacoes ?? null],
      );
      return Number(resultado.insertId);
    },
    async inserirMovimento(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_movimentacoes
          (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.partidaId, row.userId, row.fazendaId, row.tipo, row.dataEntrada, row.quantidadeDoses, row.custoTotal, row.custoUnitario, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPartida(id, patch) {
      await conn.query(
        "UPDATE semen_partidas SET saldo_doses = ?, custo_unitario = ?, status = ? WHERE id = ?",
        [patch.saldoDoses, patch.custoUnitario, patch.status, id],
      );
    },
    ...metodosOperacaoRepro(conn),
  };
}

function consultasManejo(conn: mysql.PoolConnection): ConsultaManejo {
  const base = consultas(conn);
  return {
    ...autenticacao(conn),
    lote: base.lote,
    pasto: base.pasto,
    espiar: base.espiar,
    animal: base.animal,
    baixaAtiva: base.baixaAtiva,
    async tiposSaude() { return []; },
    async inserirSaude() { return 0; },
    async marcarCastrado() { return false; },
    inserirReproducao: base.inserirReproducao,
  };
}

function consultasBaixa(conn: mysql.PoolConnection): ConsultaBaixaAnimal {
  const base = consultas(conn);
  return {
    ...autenticacao(conn),
    lote: base.lote,
    pasto: base.pasto,
    async espiar(id) {
      const linha = await base.espiar(id);
      return linha ? { ...linha, brinco: null } : null;
    },
    async animal(id, titularUserId) {
      const linha = await base.animal(id, titularUserId);
      return linha ? { ...linha, brinco: null } : null;
    },
    async baixaAtiva(animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, vendaId FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1 FOR UPDATE",
        [animalId],
      );
      if (!linhas[0]) return null;
      return { id: Number(linhas[0].id), vendaId: linhas[0].vendaId == null ? null : Number(linhas[0].vendaId) };
    },
    async inserirBaixa(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO animal_baixas
          (userId, animalId, fazendaId, tipo, dataBaixa, destino, motivo, observacoes, usuarioNome, vendaId, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ativa')`,
        [row.userId, row.animalId, row.fazendaId, row.tipo, row.dataBaixa, row.destino, row.motivo, row.observacoes, row.usuarioNome],
      );
      return Number(resultado.insertId);
    },
    async atualizarStatus(id, titularUserId, status) {
      await conn.query("UPDATE animais SET status = ? WHERE id = ? AND userId = ?", [status, id, titularUserId]);
    },
    async sincronizarStatusPasto() {},
    async temRastro() { return false; },
    async excluirAnimal() { throw new Error("a baixa não apaga"); },
  };
}

function consultasMovimento(conn: mysql.PoolConnection): ConsultaAnimaisLote {
  const base = consultas(conn);
  return {
    ...autenticacao(conn),
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, nome, fazendaId, pastoAtualId, ativo FROM lotes WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        nome: String(linha.nome),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        pastoAtualId: linha.pastoAtualId == null ? null : Number(linha.pastoAtualId),
        ativo: linha.ativo == null ? null : Number(linha.ativo),
      };
    },
    pasto: base.pasto,
    async espiar(ids) {
      if (ids.length === 0) return [];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM animais WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY id`,
        ids,
      );
      return linhas.map(mapearAnimal);
    },
    async animais(ids, titularUserId) {
      if (ids.length === 0) return [];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM animais WHERE userId = ? AND id IN (${ids.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`,
        [titularUserId, ...ids],
      );
      return linhas.map(mapearAnimal);
    },
    async baixaAtiva(animalId) {
      const baixa = await base.baixaAtiva(animalId);
      return baixa?.dataBaixa ?? null;
    },
    async atualizarAnimais(ids, titularUserId, patch) {
      if (ids.length === 0) return;
      const pares = Object.entries(patch);
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      await conn.query(
        `UPDATE animais SET ${atribuicao} WHERE userId = ? AND id IN (${ids.map(() => "?").join(", ")})`,
        [...pares.map(([, valor]) => valor), titularUserId, ...ids],
      );
    },
    async inserirHistorico(rows) {
      for (const row of rows) {
        await conn.query(
          `INSERT INTO animal_lote_movimentacoes
            (userId, animalId, loteOrigemId, loteDestinoId, pastoOrigemId, pastoDestinoId, fazendaId, fazendaOrigemId, dataMovimentacao, usuarioNome, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.userId, row.animalId, row.loteOrigemId, row.loteDestinoId, row.pastoOrigemId, row.pastoDestinoId, row.fazendaId, row.fazendaOrigemId ?? null, row.dataMovimentacao, row.usuarioNome, row.observacoes],
        );
      }
    },
    async sincronizarStatusPasto() {},
  };
}
