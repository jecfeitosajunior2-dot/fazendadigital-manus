import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEMEN_AJUSTE_MODO_QUANTIDADE, SEMEN_AJUSTE_MODO_VALOR, unpackSemenAjusteObservacoes } from "../shared/semenEstoqueAjuste";
import { MSG_SEMEN_CORRECAO_CONSUMO, MSG_SEMEN_CORRECAO_JA_CORRIGIDA, MSG_SEMEN_CORRECAO_LEDGER, replaySemenPartidaLedger } from "../shared/semenEstoqueLedger";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  ajustarEstoqueSemenAutorizado,
  ajustarEstoqueSemenEEspelhar,
  corrigirEntradaSemenAutorizado,
  corrigirEntradaSemenEEspelhar,
  type ConsultaCorrecaoAjusteSemen,
  type IoCorrecaoAjusteSemen,
  type PedidoAjusteSemen,
  type PedidoCorrecaoSemen,
} from "./correcaoAjusteSemenAutorizado";
import { EntradaAindaPendente, registrarEntradaSemenAutorizado, type ConsultaEntradaSemen, type IoEntradaSemen, type PedidoEntradaSemen } from "./entradaSemenAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { lancarInseminacaoSemenAutorizado, type ConsultaInseminacao, type IoInseminacao, type PartidaSemenLinha, type PedidoInseminacao } from "./inseminacaoSemenAutorizado";
import { metodosOperacaoRepro } from "./reproducaoOperacaoIsolado";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const exec = promisify(execFile);
let seqEntrada = 0;
function chaveEntrada() {
  seqEntrada += 1;
  return `00000000-0000-4000-8000-${seqEntrada.toString(16).padStart(12, "0")}`;
}
let seqIa = 0;
function chaveIa() {
  seqIa += 1;
  return `10000000-0000-4000-8000-${seqIa.toString(16).padStart(12, "0")}`;
}
const CONTAINER = "fd-h4aa-ajuste";
const PORTA = 3352;
const SENHA = "isolado-h4aa";
const BANCO = "fd_h4aa";
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
  id int NOT NULL, userId int NOT NULL, fazendaId int NOT NULL, nome varchar(100) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL, userId int NOT NULL, nome varchar(100) NOT NULL,
  fazendaId int NULL, pastoAtualId int NULL, ativo tinyint(1) NOT NULL DEFAULT 1, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL, fazendaId int NULL, pastoId int NULL,
  status varchar(20) NOT NULL, brinco varchar(50) NULL, nome varchar(100) NULL,
  categoria varchar(50) NULL, sexo varchar(20) NULL, castrado tinyint(1) NULL,
  dataNascimento date NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_partidas (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, fazenda_id int NOT NULL,
  origem_reprodutor varchar(20) NOT NULL, reprodutor_key varchar(120) NOT NULL,
  macho_id int NULL, reprodutor_texto varchar(500) NULL, partida varchar(120) NOT NULL,
  central_origem varchar(150) NULL, saldo_doses int NOT NULL, custo_unitario decimal(12,2) NULL,
  status varchar(20) NOT NULL, observacoes text NULL, PRIMARY KEY (id),
  UNIQUE KEY semen_partidas_uq (user_id, fazenda_id, reprodutor_key, partida)
) ENGINE=InnoDB;
CREATE TABLE semen_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, partida_id int NOT NULL, user_id int NOT NULL,
  fazenda_id int NOT NULL, tipo varchar(20) NOT NULL, data_entrada date NOT NULL,
  quantidade_doses int NOT NULL, custo_total decimal(12,2) NOT NULL,
  custo_unitario decimal(12,2) NOT NULL, observacoes text NULL,
  movimentacao_origem_id int NULL, grupo_correcao_id varchar(40) NULL,
  motivo_correcao varchar(255) NULL, created_at datetime NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE semen_entrada_operacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, chave varchar(64) NOT NULL,
  fazendaId int NOT NULL, executorUserId int NOT NULL, conteudoHash varchar(64) NOT NULL,
  partidaId int NULL, movimentacaoId int NULL, saldoAtual int NULL,
  custoMedioAtual varchar(20) NULL, novaEntrada tinyint(1) NOT NULL DEFAULT 0,
  criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
  UNIQUE KEY semen_entrada_operacoes_titular_chave_uq (userId, chave)
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
  resultado varchar(50) NULL, observacoes text NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, animalId int NOT NULL, dataBaixa date NULL, status varchar(20) NOT NULL, PRIMARY KEY (id)
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

describe.sequential("correção e ajuste de sêmen em MySQL isolado", () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    afirmarBancoDescartavel(alvo());
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
    await docker("run", "-d", "--name", CONTAINER, "-e", `MYSQL_ROOT_PASSWORD=${SENHA}`, "-e", `MYSQL_DATABASE=${BANCO}`, "-p", `127.0.0.1:${PORTA}:3306`, "mysql:8.4");
    await esperarMysql();
    const conn = await conectar(BANCO);
    await conn.query(ESQUEMA);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'p', 'Administrador da conta', 'p@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'f', 'Funcionario Curral', 'f@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (3, 's', 'Sem Permissao', 's@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (4, 'o', 'Outro Titular', 'o@isolado.local', 'admin', 'principal', 4, 'ativo', 1),
        (5, 'x', 'So Outra Fazenda', 'x@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (6, 'g', 'Segundo Curral', 'g@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (7, 'c', 'So Entrada', 'c@isolado.local', 'user', 'comum', 1, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (5, 20, 1), (6, 10, 1), (7, 10, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'semen.editar', 1), (2, 1, 'semen.criar', 1), (2, 1, 'reproducao.criar', 1),
        (3, 1, 'semen.visualizar', 1),
        (5, 1, 'semen.editar', 1),
        (6, 1, 'semen.editar', 1),
        (7, 1, 'semen.criar', 1)
    `);
    await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral')");
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, macho_id, reprodutor_texto, partida, saldo_doses, custo_unitario, status)
      VALUES
        (500, 1, 10, 'interno', 'm:80', 80, 'TO-80', 'L23081', 5, 100.00, 'disponivel'),
        (501, 1, 20, 'interno', 'm:80', 80, 'TO-80', 'L23081', 9, 100.00, 'disponivel'),
        (503, 4, 40, 'interno', 'm:80', 80, 'TO-80', 'L23081', 8, 100.00, 'disponivel')
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
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 9, custo_unitario = 100.00, status = 'disponivel' WHERE id = 501");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 8, custo_unitario = 100.00 WHERE id = 503");
    await pool.query(`
      INSERT INTO semen_movimentacoes
        (id, partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, created_at)
      VALUES
        (900, 500, 1, 10, 'ENTRADA', ?, 5, 500.00, 100.00, '2026-11-10 12:00:00'),
        (901, 501, 1, 20, 'ENTRADA', ?, 9, 900.00, 100.00, '2026-11-10 12:00:00'),
        (903, 503, 4, 40, 'ENTRADA', ?, 8, 800.00, 100.00, '2026-11-10 12:00:00')
    `, [DATA, DATA, DATA]);
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId) VALUES (100, 1, 'Sede', 10, 1000)");
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, categoria, sexo, castrado) VALUES
        (70, 1, 100, 10, 1000, 'ativo', 'BR-70', 'Vaca', 'femea', 0),
        (71, 1, 100, 10, 1000, 'ativo', 'BR-71', 'Vaca', 'femea', 0),
        (80, 1, 100, 10, 1000, 'ativo', 'TO-80', 'Boi', 'macho', 0)
    `);
  });

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
  function io(ganchos: Partial<IoCorrecaoAjusteSemen> = {}): IoCorrecaoAjusteSemen {
    return { ...ganchos, emTransacao: transacao((conn) => consultas(conn)).emTransacao };
  }
  function ioEntrada(ganchos: Partial<IoEntradaSemen> = {}): IoEntradaSemen {
    return { ...ganchos, emTransacao: transacao((conn) => consultasEntrada(conn)).emTransacao };
  }
  function ioIa(ganchos: Partial<IoInseminacao> = {}): IoInseminacao {
    return { ...ganchos, emTransacao: transacao((conn) => consultasIa(conn)).emTransacao };
  }

  function pedidoCorrecao(executorId: number, sessionVersion: number, extra: Partial<PedidoCorrecaoSemen["input"]> = {}, extras: Partial<PedidoCorrecaoSemen> = {}): PedidoCorrecaoSemen {
    return {
      executorId, sessionVersionDaSessao: sessionVersion,
      input: {
        movimentacaoId: 900, quantidadeDoses: 4, custoTotal: 400, dataEntrada: DATA,
        motivoCodigo: "quantidade_digitada_incorretamente", ...extra,
      },
      ...extras,
    };
  }
  function pedidoAjuste(executorId: number, sessionVersion: number, extra: Partial<PedidoAjusteSemen["input"]> = {}): PedidoAjusteSemen {
    return {
      executorId, sessionVersionDaSessao: sessionVersion,
      input: {
        partidaId: 500, modo: SEMEN_AJUSTE_MODO_QUANTIDADE, saldoNovo: 8,
        motivoCodigo: "conferencia_fisica_estoque", ...extra,
      },
    };
  }
  function pedidoEntrada(executorId: number, sessionVersion: number): PedidoEntradaSemen {
    return {
      executorId, sessionVersionDaSessao: sessionVersion, fazendaId: 10,
      input: { origemReprodutor: "interno", machoId: 80, partida: "L23081", quantidadeDoses: 2, custoTotal: 300, dataEntrada: DATA, operacaoId: chaveEntrada() },
    };
  }
  function pedidoIa(executorId: number, sessionVersion: number, animalId = 70): PedidoInseminacao {
    return {
      executorId, sessionVersionDaSessao: sessionVersion,
      executorNome: "Curral",
      input: { animalId, fazendaId: 10, tipo: "Inseminação", dataCobertura: DATA, machoId: 80, semenPartidaId: 500, inseminador: "João do curral", operacaoId: chaveIa() },
    };
  }
  async function saldo(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT saldo_doses, custo_unitario, status, user_id FROM semen_partidas WHERE id = ?", [id]);
    return linhas[0];
  }
  async function movimentos(partidaId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM semen_movimentacoes WHERE partida_id = ? ORDER BY id", [partidaId]);
    return linhas;
  }
  function livro(movs: RowDataPacket[]) {
    return replaySemenPartidaLedger(movs.map((linha) => ({
      id: Number(linha.id),
      tipo: String(linha.tipo),
      quantidadeDoses: Number(linha.quantidade_doses),
      custoTotal: String(linha.custo_total),
      custoUnitario: String(linha.custo_unitario),
      createdAt: linha.created_at == null ? null : String(linha.created_at),
      movimentacaoOrigemId: linha.movimentacao_origem_id == null ? null : Number(linha.movimentacao_origem_id),
      grupoCorrecaoId: linha.grupo_correcao_id == null ? null : String(linha.grupo_correcao_id),
      motivoCorrecao: linha.motivo_correcao == null ? null : String(linha.motivo_correcao),
    })));
  }

  it("1. principal e funcionário corrigem quantidade e custo no nome do titular", async () => {
    const espelhos: number[] = [];
    const principal = await corrigirEntradaSemenEEspelhar(io(), pedidoCorrecao(1, 3, {}, {
      titularInformadoPeloCliente: 4, papelInformadoPeloCliente: "comum", permissoesInformadasPeloCliente: [], fazendasInformadasPeloCliente: [40],
    }), { async registrar(userId, confirmado) { espelhos.push(userId, confirmado.saldoAtual); } });
    expect(principal).toMatchObject({ ok: true, userId: 1, executorUserId: 1, saldoAtual: 4, custoMedioAtual: "100.00" });
    expect(espelhos).toEqual([1, 4]);
    const movs = await movimentos(500);
    expect(movs.filter((linha) => String(linha.tipo) === "ENTRADA")).toHaveLength(2);
    expect(movs.filter((linha) => String(linha.tipo) === "ESTORNO_ENTRADA")).toHaveLength(1);
    expect(Number(movs.find((linha) => Number(linha.id) === 900)?.quantidade_doses)).toBe(5);
    expect(Number(movs.find((linha) => String(linha.tipo) === "ESTORNO_ENTRADA")?.user_id)).toBe(1);
    const replay = livro(movs);
    expect(replay.ok && replay.saldoDoses).toBe(4);
    expect(Number((await saldo(501))?.saldo_doses)).toBe(9);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00 WHERE id = 500");
    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    const funcionario = await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(2, 1, { quantidadeDoses: 5, custoTotal: 700 }));
    expect(funcionario).toMatchObject({ ok: true, userId: 1, executorUserId: 2, saldoAtual: 5, custoMedioAtual: "140.00" });
  });

  it("2. recusa permissão, fazenda, sessão, outro titular e outro pasto de fazenda", async () => {
    expect(await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(3, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(7, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(5, 1))).toMatchObject({ ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_MANEJO });
    expect(await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(1, 99))).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(1, 3, { movimentacaoId: 903 }))).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(2, 1, { partidaId: 501 }))).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(Number((await saldo(501))?.saldo_doses)).toBe(9);
    expect(Number((await saldo(503))?.saldo_doses)).toBe(8);
    expect(await movimentos(500)).toHaveLength(1);
  });

  it("3. correção com movimento posterior, consumo e livro inválido", async () => {
    await pool.query(`
      INSERT INTO semen_movimentacoes
        (id, partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, created_at)
      VALUES (910, 500, 1, 10, 'ENTRADA', ?, 2, 200.00, 100.00, '2026-11-12 12:00:00')
    `, [DATA]);
    await pool.query("UPDATE semen_partidas SET saldo_doses = 7, custo_unitario = 100.00 WHERE id = 500");
    const posterior = await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(1, 3));
    expect(posterior).toMatchObject({ ok: true, saldoAtual: 6, custoMedioAtual: "100.00" });
    const movs = await movimentos(500);
    expect(Number(movs.find((linha) => Number(linha.id) === 900)?.quantidade_doses)).toBe(5);
    expect(Number(movs.find((linha) => Number(linha.id) === 910)?.quantidade_doses)).toBe(2);
    const replay = livro(movs);
    expect(replay.ok && replay.saldoDoses).toBe(Number((await saldo(500))?.saldo_doses));

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 4, custo_unitario = 100.00 WHERE id = 500");
    await pool.query(`
      INSERT INTO semen_movimentacoes
        (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, created_at)
      VALUES (500, 1, 10, 'SAIDA_IA', ?, 1, 100.00, 100.00, '2026-11-12 12:00:00')
    `, [DATA]);
    const consumida = await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(1, 3, { quantidadeDoses: 6, custoTotal: 600 }));
    expect(consumida).toMatchObject({ ok: false, mensagem: MSG_SEMEN_CORRECAO_CONSUMO });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    expect((await movimentos(500)).filter((linha) => String(linha.tipo) === "ESTORNO_ENTRADA")).toHaveLength(0);

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500");
    await pool.query(`
      INSERT INTO semen_movimentacoes
        (id, partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, created_at)
      VALUES
        (920, 500, 1, 10, 'ENTRADA', ?, 10, 1000.00, 100.00, '2026-11-01 12:00:00'),
        (921, 500, 1, 10, 'SAIDA_IA', ?, 6, 600.00, 100.00, '2026-11-02 12:00:00'),
        (922, 500, 1, 10, 'AJUSTE_ESTOQUE', ?, 10, 1000.00, 100.00, '2026-11-03 12:00:00')
    `, [DATA, DATA, DATA]);
    await pool.query("UPDATE semen_partidas SET saldo_doses = 10, custo_unitario = 100.00 WHERE id = 500");
    const livroInvalido = await corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(1, 3, {
      movimentacaoId: 920, quantidadeDoses: 4, custoTotal: 400,
    }));
    expect(livroInvalido).toMatchObject({ ok: false, mensagem: MSG_SEMEN_CORRECAO_LEDGER });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(10);
    expect(await movimentos(500)).toHaveLength(3);
  });

  it("4. ajuste positivo, negativo e saldo negativo", async () => {
    const positivo = await ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(2, 1, { saldoNovo: 8, observacao: "contagem do curral" }));
    expect(positivo).toMatchObject({ ok: true, userId: 1, executorUserId: 2, saldoAtual: 8, custoMedioAtual: "100.00", valorAtualEstoque: 800 });
    const movs = await movimentos(500);
    expect(movs.filter((linha) => String(linha.tipo) === "AJUSTE_ESTOQUE")).toHaveLength(1);
    expect(Number(movs.find((linha) => Number(linha.id) === 900)?.quantidade_doses)).toBe(5);
    const negativo = await ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(1, 3, { saldoNovo: 2 }));
    expect(negativo).toMatchObject({ ok: true, saldoAtual: 2, custoMedioAtual: "100.00" });
    const valor = await ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(1, 3, { modo: SEMEN_AJUSTE_MODO_VALOR, valorNovo: 300, saldoNovo: undefined }));
    expect(valor).toMatchObject({ ok: true, saldoAtual: 2, custoMedioAtual: "150.00", valorAtualEstoque: 300 });
    const recusado = await ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(1, 3, { saldoNovo: -1 }));
    expect(recusado.ok).toBe(false);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(2);
    expect(String((await saldo(500))?.custo_unitario)).toBe("150.00");
  });

  it("5. falha no meio não deixa saldo nem movimento novo", async () => {
    await expect(corrigirEntradaSemenAutorizado(io({ async aposMovimento() { throw new Error("movimento fora"); } }), pedidoCorrecao(1, 3))).rejects.toThrow("movimento fora");
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(await movimentos(500)).toHaveLength(1);
    await expect(ajustarEstoqueSemenAutorizado(io({ async aposSaldo() { throw new Error("saldo fora"); } }), pedidoAjuste(1, 3))).rejects.toThrow("saldo fora");
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(String((await saldo(500))?.custo_unitario)).toBe("100.00");
    expect(await movimentos(500)).toHaveLength(1);
  });

  it("6. entrada, inseminação, duas correções e dois ajustes", async () => {
    let liberarEntrada: () => void = () => undefined;
    const segueEntrada = new Promise<void>((resolver) => { liberarEntrada = resolver; });
    let entradaTravou: () => void = () => undefined;
    const partidaTravada = new Promise<void>((resolver) => { entradaTravou = resolver; });
    const entrada = registrarEntradaSemenAutorizado(ioEntrada({
      aposPartida: async () => { entradaTravou(); await segueEntrada; },
    }), pedidoEntrada(2, 1));
    await partidaTravada;
    const correcao = corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(6, 1));
    await new Promise((resolver) => setTimeout(resolver, 200));
    liberarEntrada();
    const [entradaOk, correcaoOk] = await Promise.all([entrada, correcao]);
    expect(entradaOk.ok && correcaoOk.ok).toBe(true);
    const movsEntrada = await movimentos(500);
    const replayEntrada = livro(movsEntrada);
    expect(replayEntrada.ok && replayEntrada.saldoDoses).toBe(6);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(6);
    expect(String((await saldo(500))?.custo_unitario)).toBe(replayEntrada.ok ? replayEntrada.custoUnitario : "");

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    let liberarIa: () => void = () => undefined;
    const segueIa = new Promise<void>((resolver) => { liberarIa = resolver; });
    let iaTravou: () => void = () => undefined;
    const iaPronta = new Promise<void>((resolver) => { iaTravou = resolver; });
    const iaPrimeiro = lancarInseminacaoSemenAutorizado(ioIa({
      aposHistorico: async () => { iaTravou(); await segueIa; },
    }), pedidoIa(1, 3, 70));
    await iaPronta;
    const ajusteDepois = ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(6, 1, { saldoNovo: 2 }));
    await new Promise((resolver) => setTimeout(resolver, 200));
    liberarIa();
    const [iaOk, ajusteOk] = await Promise.all([iaPrimeiro, ajusteDepois]);
    expect(iaOk.ok && ajusteOk.ok).toBe(true);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(2);
    const ajusteMov = (await movimentos(500)).find((linha) => String(linha.tipo) === "AJUSTE_ESTOQUE");
    expect(unpackSemenAjusteObservacoes(String(ajusteMov?.observacoes))?.saldoAnterior).toBe(4);
    expect((await movimentos(500)).filter((linha) => String(linha.tipo) === "SAIDA_IA")).toHaveLength(1);

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    let liberarCorrecao: () => void = () => undefined;
    const segueCorrecao = new Promise<void>((resolver) => { liberarCorrecao = resolver; });
    let correcaoTravou: () => void = () => undefined;
    const correcaoPronta = new Promise<void>((resolver) => { correcaoTravou = resolver; });
    const correcaoPrimeiro = corrigirEntradaSemenAutorizado(io({
      aposPartida: async () => { correcaoTravou(); await segueCorrecao; },
    }), pedidoCorrecao(2, 1, { quantidadeDoses: 8, custoTotal: 800 }));
    await correcaoPronta;
    const iaDepois = lancarInseminacaoSemenAutorizado(ioIa(), pedidoIa(1, 3, 71));
    await new Promise((resolver) => setTimeout(resolver, 200));
    liberarCorrecao();
    const [corrOk, iaDepoisOk] = await Promise.all([correcaoPrimeiro, iaDepois]);
    expect(corrOk.ok && iaDepoisOk.ok).toBe(true);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(7);

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    const duas = await Promise.all([
      corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(2, 1, { quantidadeDoses: 4, custoTotal: 400 })),
      corrigirEntradaSemenAutorizado(io(), pedidoCorrecao(6, 1, { quantidadeDoses: 6, custoTotal: 600 })),
    ]);
    const ok = duas.filter((item) => item.ok);
    const recusa = duas.filter((item) => !item.ok);
    expect(ok).toHaveLength(1);
    expect(recusa[0]).toMatchObject({ mensagem: MSG_SEMEN_CORRECAO_JA_CORRIGIDA });
    expect((await movimentos(500)).filter((linha) => String(linha.tipo) === "ESTORNO_ENTRADA")).toHaveLength(1);
    expect(Number(movsOriginais(await movimentos(500)))).toBe(5);

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00 WHERE id = 500");
    const ajustes = await Promise.all([
      ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(2, 1, { saldoNovo: 8 })),
      ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(6, 1, { saldoNovo: 3 })),
    ]);
    expect(ajustes.every((item) => item.ok)).toBe(true);
    const finais = await movimentos(500);
    const replayAjuste = livro(finais);
    const linha = await saldo(500);
    expect(replayAjuste.ok && replayAjuste.saldoDoses).toBe(Number(linha?.saldo_doses));
    expect([8, 3]).toContain(Number(linha?.saldo_doses));
    expect(finais.filter((item) => String(item.tipo) === "AJUSTE_ESTOQUE")).toHaveLength(2);
  }, 30_000);

  it("7. deadlock, espelho e as fases da entrada e da inseminação", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = corrigirEntradaSemenAutorizado(io({
      aposIdentidade: async () => { avisou(); await segue; },
    }), pedidoCorrecao(2, 1));
    await travou;
    const externa = await pool.getConnection();
    let deadlock = false;
    try {
      await externa.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await externa.beginTransaction();
      await externa.query("SELECT id FROM semen_partidas WHERE id = 500 FOR UPDATE");
      const espera = externa.query("SELECT id FROM users WHERE id = 2 FOR UPDATE");
      await new Promise((resolver) => setTimeout(resolver, 200));
      liberar();
      try { await espera; } catch (erro) { deadlock = ehDeadlock(erro); }
      await externa.rollback();
    } finally {
      externa.release();
    }
    const resultado = await operacao;
    expect(deadlock).toBe(true);
    expect(resultado.ok).toBe(true);
    expect((await movimentos(500)).filter((linha) => String(linha.tipo) === "ESTORNO_ENTRADA")).toHaveLength(1);

    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    const ia = await lancarInseminacaoSemenAutorizado(ioIa(), pedidoIa(1, 3, 70));
    expect(ia).toMatchObject({ ok: true, userId: 1 });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(4);
    const entrada = await registrarEntradaSemenAutorizado(ioEntrada(), pedidoEntrada(1, 3));
    expect(entrada).toMatchObject({ ok: true, userId: 1, saldoAtual: 6 });
    expect((await movimentos(500)).filter((linha) => String(linha.tipo) === "SAIDA_IA")).toHaveLength(1);
    expect((await movimentos(500)).filter((linha) => String(linha.tipo) === "ENTRADA")).toHaveLength(2);
  }, 30_000);

  it("8. entrada e ajuste disputam a mesma partida", async () => {
    await pool.query("DELETE FROM semen_movimentacoes WHERE partida_id = 500 AND id <> 900");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    let liberarEntrada: () => void = () => undefined;
    const segueEntrada = new Promise<void>((resolver) => { liberarEntrada = resolver; });
    let entradaTravou: () => void = () => undefined;
    const partidaTravada = new Promise<void>((resolver) => { entradaTravou = resolver; });
    const entrada = registrarEntradaSemenAutorizado(ioEntrada({
      aposPartida: async () => { entradaTravou(); await segueEntrada; },
    }), pedidoEntrada(2, 1));
    await partidaTravada;
    const ajuste = ajustarEstoqueSemenAutorizado(io(), pedidoAjuste(6, 1, { saldoNovo: 9 }));
    await new Promise((resolver) => setTimeout(resolver, 250));
    liberarEntrada();
    const [entradaOk, ajusteOk] = await Promise.all([entrada, ajuste]);
    expect(entradaOk.ok && ajusteOk.ok).toBe(true);
    const movs = await movimentos(500);
    expect(movs.filter((linha) => String(linha.tipo) === "ENTRADA")).toHaveLength(2);
    expect(movs.filter((linha) => String(linha.tipo) === "AJUSTE_ESTOQUE")).toHaveLength(1);
    const replay = livro(movs);
    expect(replay.ok && replay.saldoDoses).toBe(Number((await saldo(500))?.saldo_doses));
    expect(String((await saldo(500))?.custo_unitario)).toBe(replay.ok ? replay.custoUnitario : "");
  }, 30_000);
});

function movsOriginais(movs: RowDataPacket[]): number {
  return Number(movs.find((linha) => Number(linha.id) === 900)?.quantidade_doses);
}

function autenticacao(conn: mysql.PoolConnection) {
  return {
    async usuario(id: number): Promise<LinhaUsuarioCadastro | null> {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM users WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id), openId: String(linha.openId), name: linha.name == null ? null : String(linha.name),
        email: linha.email == null ? null : String(linha.email), role: linha.role === "admin" ? "admin" : "user",
        papel: linha.papel, titularUserId: linha.titularUserId == null ? null : Number(linha.titularUserId),
        situacao: linha.situacao, sessionVersion: Number(linha.sessionVersion),
      };
    },
    async permissoes(userId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT permissao FROM usuario_permissoes WHERE userId = ? AND titularUserId = ? FOR UPDATE", [userId, titularUserId]);
      return linhas.map((linha) => String(linha.permissao));
    },
    async vinculos(userId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf JOIN users u ON u.id = uf.userId WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE",
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
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId) } : null;
    },
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaCorrecaoAjusteSemen {
  return {
    ...autenticacao(conn),
    async espiarMovimento(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_movimentacoes WHERE id = ?", [id]);
      return linhas[0] ? mapearMovimento(linhas[0]) : null;
    },
    async espiarPartida(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ?", [id]);
      return linhas[0] ? mapearPartida(linhas[0]) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ? AND user_id = ? FOR UPDATE", [id, titularUserId]);
      return linhas[0] ? mapearPartida(linhas[0]) : null;
    },
    async movimentos(partidaId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_movimentacoes WHERE partida_id = ? AND user_id = ?", [partidaId, titularUserId]);
      return linhas.map(mapearMovimento);
    },
    async inserirMovimento(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_movimentacoes
          (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes, movimentacao_origem_id, grupo_correcao_id, motivo_correcao, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [row.partidaId, row.userId, row.fazendaId, row.tipo, row.dataEntrada, row.quantidadeDoses, row.custoTotal, row.custoUnitario, row.observacoes, row.movimentacaoOrigemId, row.grupoCorrecaoId, row.motivoCorrecao],
      );
      return Number(resultado.insertId);
    },
    async atualizarPartida(id, patch) {
      await conn.query("UPDATE semen_partidas SET saldo_doses = ?, custo_unitario = ?, status = ? WHERE id = ?", [patch.saldoDoses, patch.custoUnitario, patch.status, id]);
    },
  };
}

function chaveDuplicada(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; code?: string; cause?: unknown };
    if (item.errno === 1062 || item.code === "ER_DUP_ENTRY") return true;
    atual = item.cause;
  }
  return false;
}

function metodosOperacao(conn: mysql.PoolConnection) {
  return {
    async reservarOperacao(row: { userId: number; chave: string; fazendaId: number; executorUserId: number; conteudoHash: string }) {
      try {
        await conn.query(
          `INSERT INTO semen_entrada_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash, novaEntrada)
           VALUES (?, ?, ?, ?, ?, 0)`,
          [row.userId, row.chave, row.fazendaId, row.executorUserId, row.conteudoHash],
        );
        return { situacao: "nova" as const };
      } catch (erro) {
        if (!chaveDuplicada(erro)) throw erro;
        const [linhas] = await conn.query<RowDataPacket[]>(
          `SELECT conteudoHash, partidaId, movimentacaoId, saldoAtual, custoMedioAtual, novaEntrada
           FROM semen_entrada_operacoes WHERE userId = ? AND chave = ? FOR UPDATE`,
          [row.userId, row.chave],
        );
        const linha = linhas[0];
        if (!linha || String(linha.conteudoHash) !== row.conteudoHash) return { situacao: "divergente" as const };
        if (linha.partidaId == null || linha.movimentacaoId == null) throw new EntradaAindaPendente();
        return {
          situacao: "repetida" as const,
          partidaId: Number(linha.partidaId),
          movimentacaoId: Number(linha.movimentacaoId),
          saldoAtual: Number(linha.saldoAtual),
          custoMedioAtual: linha.custoMedioAtual == null ? null : String(linha.custoMedioAtual),
          novaEntrada: Number(linha.novaEntrada) === 1,
        };
      }
    },
    async concluirOperacao(row: {
      userId: number; chave: string; partidaId: number; movimentacaoId: number;
      saldoAtual: number; custoMedioAtual: string | null; novaEntrada: boolean;
    }) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `UPDATE semen_entrada_operacoes
         SET partidaId = ?, movimentacaoId = ?, saldoAtual = ?, custoMedioAtual = ?, novaEntrada = ?
         WHERE userId = ? AND chave = ? AND partidaId IS NULL`,
        [row.partidaId, row.movimentacaoId, row.saldoAtual, row.custoMedioAtual, row.novaEntrada ? 1 : 0, row.userId, row.chave],
      );
      if (Number(resultado.affectedRows) !== 1) throw new Error("entrada de sêmen não vinculada");
    },
  };
}

function consultasEntrada(conn: mysql.PoolConnection): ConsultaEntradaSemen {
  const base = autenticacao(conn);
  return {
    ...base,
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: linhas[0].fazendaId == null ? null : Number(linhas[0].fazendaId) } : null;
    },
    async pasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? { id: Number(linhas[0].id), userId: Number(linhas[0].userId), fazendaId: linhas[0].fazendaId == null ? null : Number(linhas[0].fazendaId) } : null;
    },
    async espiar(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ? AND userId = ? FOR UPDATE", [id, titularUserId]);
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async espiarPartida(titularUserId, fazendaId, reprodutorKey, partida) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM semen_partidas WHERE user_id = ? AND fazenda_id = ? AND reprodutor_key = ? AND partida = ?",
        [titularUserId, fazendaId, reprodutorKey, partida],
      );
      return linhas[0] ? mapearPartidaEntrada(linhas[0]) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ? AND user_id = ? FOR UPDATE", [id, titularUserId]);
      return linhas[0] ? mapearPartidaEntrada(linhas[0]) : null;
    },
    async inserirPartida() { throw new Error("não cria partida neste teste"); },
    async atualizarPartida(id, patch) {
      await conn.query(
        "UPDATE semen_partidas SET saldo_doses = ?, custo_unitario = ?, status = ?, central_origem = ?, reprodutor_texto = ? WHERE id = ?",
        [patch.saldoDoses, patch.custoUnitario, patch.status, patch.centralOrigem, patch.reprodutorTexto, id],
      );
    },
    async inserirMovimento(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_movimentacoes (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [row.partidaId, row.userId, row.fazendaId, row.tipo, row.dataEntrada, row.quantidadeDoses, row.custoTotal, row.custoUnitario, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    ...metodosOperacao(conn),
  };
}

function consultasIa(conn: mysql.PoolConnection): ConsultaInseminacao {
  const entrada = consultasEntrada(conn);
  return {
    ...autenticacao(conn),
    lote: entrada.lote, pasto: entrada.pasto, espiar: entrada.espiar, animal: entrada.animal,
    async baixaAtiva() { return null; },
    async espiarPartida(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ?", [id]);
      return linhas[0] ? mapearPartidaIa(linhas[0]) : null;
    },
    async travarPartida(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM semen_partidas WHERE id = ? AND user_id = ? FOR UPDATE", [id, titularUserId]);
      return linhas[0] ? mapearPartidaIa(linhas[0]) : null;
    },
    async inserirReproducao(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        "INSERT INTO reproducao_registros (userId, femeaId, machoId, tipo, dataCobertura, resultado, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [row.userId, row.femeaId, row.machoId ?? null, row.tipo, row.dataCobertura, row.resultado ?? null, row.observacoes ?? null],
      );
      return Number(resultado.insertId);
    },
    async inserirMovimento(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_movimentacoes (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [row.partidaId, row.userId, row.fazendaId, row.tipo, row.dataEntrada, row.quantidadeDoses, row.custoTotal, row.custoUnitario, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPartida(id, patch) {
      await conn.query("UPDATE semen_partidas SET saldo_doses = ?, custo_unitario = ?, status = ? WHERE id = ?", [patch.saldoDoses, patch.custoUnitario, patch.status, id]);
    },
    ...metodosOperacaoRepro(conn),
  };
}

function mapearMovimento(linha: RowDataPacket) {
  return {
    id: Number(linha.id), partidaId: Number(linha.partida_id), userId: Number(linha.user_id), fazendaId: Number(linha.fazenda_id),
    tipo: String(linha.tipo), dataEntrada: String(linha.data_entrada).slice(0, 10), quantidadeDoses: Number(linha.quantidade_doses),
    custoTotal: String(linha.custo_total), custoUnitario: String(linha.custo_unitario),
    observacoes: linha.observacoes == null ? null : String(linha.observacoes),
    movimentacaoOrigemId: linha.movimentacao_origem_id == null ? null : Number(linha.movimentacao_origem_id),
    grupoCorrecaoId: linha.grupo_correcao_id == null ? null : String(linha.grupo_correcao_id),
    motivoCorrecao: linha.motivo_correcao == null ? null : String(linha.motivo_correcao),
    createdAt: linha.created_at == null ? null : String(linha.created_at),
  };
}
function mapearPartida(linha: RowDataPacket) {
  return {
    id: Number(linha.id), userId: Number(linha.user_id), fazendaId: Number(linha.fazenda_id),
    saldoDoses: Number(linha.saldo_doses), custoUnitario: linha.custo_unitario == null ? null : String(linha.custo_unitario),
    status: String(linha.status),
  };
}
function mapearAnimal(linha: RowDataPacket) {
  return {
    id: Number(linha.id), userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    status: linha.status == null ? null : String(linha.status),
    sexo: linha.sexo == null ? null : String(linha.sexo),
    castrado: linha.castrado == null ? null : Number(linha.castrado),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    dataNascimento: linha.dataNascimento == null ? null : String(linha.dataNascimento).slice(0, 10),
    brinco: linha.brinco == null ? null : String(linha.brinco),
    nome: linha.nome == null ? null : String(linha.nome),
  };
}
function mapearPartidaEntrada(linha: RowDataPacket) {
  return {
    id: Number(linha.id), userId: Number(linha.user_id), fazendaId: Number(linha.fazenda_id),
    reprodutorKey: String(linha.reprodutor_key), partida: String(linha.partida),
    saldoDoses: Number(linha.saldo_doses), custoUnitario: linha.custo_unitario == null ? null : String(linha.custo_unitario),
    centralOrigem: linha.central_origem == null ? null : String(linha.central_origem),
    reprodutorTexto: linha.reprodutor_texto == null ? null : String(linha.reprodutor_texto),
    status: String(linha.status),
  };
}
function mapearPartidaIa(linha: RowDataPacket): PartidaSemenLinha {
  return {
    id: Number(linha.id), userId: Number(linha.user_id), fazendaId: Number(linha.fazenda_id),
    origemReprodutor: String(linha.origem_reprodutor), reprodutorKey: String(linha.reprodutor_key),
    machoId: linha.macho_id == null ? null : Number(linha.macho_id),
    reprodutorTexto: linha.reprodutor_texto == null ? null : String(linha.reprodutor_texto),
    partida: String(linha.partida), centralOrigem: linha.central_origem == null ? null : String(linha.central_origem),
    saldoDoses: Number(linha.saldo_doses), custoUnitario: linha.custo_unitario == null ? null : String(linha.custo_unitario),
  };
}
