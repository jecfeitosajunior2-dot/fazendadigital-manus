import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MSG_SEMEN_QUANTIDADE_INVALIDA } from "../shared/semenEstoque";
import { applySemenEntradaAgregacao, applySemenSaidaIa } from "../shared/semenEstoque";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  EntradaAindaPendente,
  registrarEntradaSemenAutorizado,
  registrarEntradaSemenEEspelhar,
  type ConsultaEntradaSemen,
  type IoEntradaSemen,
  type PedidoEntradaSemen,
} from "./entradaSemenAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import { metodosOperacaoRepro } from "./reproducaoOperacaoIsolado";
import {
  lancarInseminacaoSemenAutorizado,
  type ConsultaInseminacao,
  type IoInseminacao,
  type PartidaSemenLinha,
  type PedidoInseminacao,
} from "./inseminacaoSemenAutorizado";
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
const CONTAINER = "fd-h4z-entrada";
const PORTA = 3351;
const SENHA = "isolado-h4z";
const BANCO = "fd_h4z";
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
  custo_unitario decimal(12,2) NOT NULL, observacoes text NULL, PRIMARY KEY (id)
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

describe.sequential("entrada de sêmen em MySQL isolado", () => {
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
        (6, 'g', 'Segundo Curral', 'g@isolado.local', 'user', 'comum', 1, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1), (5, 20, 1), (6, 10, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'semen.criar', 1), (2, 1, 'reproducao.criar', 1),
        (3, 1, 'semen.visualizar', 1),
        (5, 1, 'semen.criar', 1),
        (6, 1, 'semen.criar', 1)
    `);
    await conn.query("INSERT INTO pastos (id, userId, fazendaId, nome) VALUES (1000, 1, 10, 'Curral'), (2000, 1, 20, 'Retiro')");
    await conn.query(`
      INSERT INTO semen_partidas
        (id, user_id, fazenda_id, origem_reprodutor, reprodutor_key, macho_id, reprodutor_texto, partida, saldo_doses, custo_unitario, status)
      VALUES
        (500, 1, 10, 'interno', 'm:80', 80, 'TO-80', 'L23081', 5, 100.00, 'disponivel'),
        (501, 1, 20, 'interno', 'm:80', 80, 'TO-80', 'L23081', 9, 100.00, 'disponivel'),
        (502, 1, 10, 'interno', 'm:80', 80, 'TO-80', 'ESGOTADA', 0, 100.00, 'esgotado'),
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
    await pool.query("DELETE FROM semen_partidas WHERE id > 503");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 9, status = 'disponivel' WHERE id = 501");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 0, custo_unitario = 100.00, status = 'esgotado' WHERE id = 502");
    await pool.query("UPDATE semen_partidas SET saldo_doses = 8 WHERE id = 503");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query("INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId) VALUES (100, 1, 'Sede', 10, 1000), (200, 1, 'Retiro', 20, 2000)");
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, categoria, sexo, castrado) VALUES
        (70, 1, 100, 10, 1000, 'ativo', 'BR-70', 'Vaca', 'femea', 0),
        (71, 1, 100, 10, 1000, 'ativo', 'BR-71', 'Vaca', 'femea', 0),
        (80, 1, 100, 10, 1000, 'ativo', 'TO-80', 'Boi', 'macho', 0),
        (82, 1, 100, 10, 1000, 'vendido', 'TO-82', 'Boi', 'macho', 0)
    `);
  });

  function io(ganchos: Partial<IoEntradaSemen> = {}): IoEntradaSemen {
    return { ...ganchos, emTransacao: transacao((conn) => consultasEntrada(conn)).emTransacao };
  }
  function ioIa(ganchos: Partial<IoInseminacao> = {}): IoInseminacao {
    return { ...ganchos, emTransacao: transacao((conn) => consultasIa(conn)).emTransacao };
  }
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

  function pedido(executorId: number, sessionVersion: number, extra: Partial<PedidoEntradaSemen["input"]> = {}, extras: Partial<PedidoEntradaSemen> = {}): PedidoEntradaSemen {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      fazendaId: 10,
      input: {
        origemReprodutor: "interno", machoId: 80, partida: "L23081",
        quantidadeDoses: 2, custoTotal: 300, dataEntrada: DATA,
        operacaoId: chaveEntrada(),
        ...extra,
      },
      ...extras,
    };
  }
  function pedidoIa(executorId: number, sessionVersion: number, animalId: number): PedidoInseminacao {
    return {
      executorId, sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 1 ? "Administrador da conta" : "Funcionario Curral",
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
  function conferirLivro(inicial: number, custo: string | null, movs: RowDataPacket[]) {
    let saldoAtual = inicial;
    let custoAtual: string | null = custo;
    for (const mov of movs) {
      if (String(mov.tipo) === "ENTRADA") {
        const agreg = applySemenEntradaAgregacao({
          saldoAnterior: saldoAtual, custoUnitarioAnterior: custoAtual,
          quantidadeEntrada: Number(mov.quantidade_doses), custoTotalEntrada: Number(mov.custo_total),
        });
        saldoAtual = agreg.novoSaldo;
        custoAtual = agreg.novoCustoUnitario;
      } else {
        const saida = applySemenSaidaIa({ saldoAnterior: saldoAtual, custoUnitario: custoAtual, quantidadeSaida: Number(mov.quantidade_doses) });
        saldoAtual = saida.novoSaldo;
        custoAtual = saida.novoCustoUnitario;
      }
    }
    return { saldoAtual, custoAtual };
  }

  it("1. principal e funcionário somam na partida do titular", async () => {
    const espelhos: Array<{ userId: number; saldo: number }> = [];
    const principal = await registrarEntradaSemenEEspelhar(io(), pedido(1, 3, {}, {
      titularInformadoPeloCliente: 4, papelInformadoPeloCliente: "comum", permissoesInformadasPeloCliente: [], fazendasInformadasPeloCliente: [40],
    }), { async registrar(userId, confirmado) { espelhos.push({ userId, saldo: confirmado.saldoAtual }); } });
    expect(principal).toMatchObject({ ok: true, userId: 1, executorUserId: 1, novaEntrada: false, saldoAtual: 7, custoMedioAtual: "114.29" });
    expect(espelhos).toEqual([{ userId: 1, saldo: 7 }]);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(7);
    expect(String((await saldo(500))?.custo_unitario)).toBe("114.29");
    expect(Number((await saldo(500))?.user_id)).toBe(1);
    expect(Number((await saldo(501))?.saldo_doses)).toBe(9);
    const mov = await movimentos(500);
    expect(mov).toHaveLength(1);
    expect(Number(mov[0]?.quantidade_doses)).toBe(2);
    expect(Number(mov[0]?.user_id)).toBe(1);
    expect(String(mov[0]?.tipo)).toBe("ENTRADA");

    const funcionario = await registrarEntradaSemenAutorizado(io(), pedido(2, 1, { quantidadeDoses: 1, custoTotal: 100 }));
    expect(funcionario).toMatchObject({ ok: true, userId: 1, executorUserId: 2, saldoAtual: 8 });
    expect(await movimentos(500)).toHaveLength(2);
  });

  it("2. recusa permissão, fazenda, quantidade, touro inativo e não mexe na partida alheia", async () => {
    expect(await registrarEntradaSemenAutorizado(io(), pedido(3, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await registrarEntradaSemenAutorizado(io(), pedido(5, 1))).toMatchObject({ ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_MANEJO });
    expect(await registrarEntradaSemenAutorizado(io(), pedido(1, 99))).toMatchObject({ ok: false, motivo: "sem_identidade" });
    expect(await registrarEntradaSemenAutorizado(io(), pedido(1, 3, { quantidadeDoses: "abc" }))).toMatchObject({ ok: false, mensagem: MSG_SEMEN_QUANTIDADE_INVALIDA });
    expect(await registrarEntradaSemenAutorizado(io(), pedido(1, 3, { machoId: 82 }))).toMatchObject({ ok: false, motivo: "animal_invalido" });
    expect(await registrarEntradaSemenAutorizado(io(), pedido(1, 3, { fazendaId: 40 } as Partial<PedidoEntradaSemen["input"]>, { fazendaId: 40 }))).toMatchObject({ ok: false, motivo: "outro_titular" });
    const esgotada = await registrarEntradaSemenAutorizado(io(), pedido(1, 3, { partida: "ESGOTADA", quantidadeDoses: 2, custoTotal: 200 }));
    expect(esgotada).toMatchObject({ ok: true, novaEntrada: false, saldoAtual: 2 });
    expect(String((await saldo(502))?.status)).toBe("disponivel");
    const nova = await registrarEntradaSemenAutorizado(io(), pedido(1, 3, { partida: "NOVA-1", quantidadeDoses: 3, custoTotal: 150 }));
    expect(nova).toMatchObject({ ok: true, novaEntrada: true, saldoAtual: 3, userId: 1 });
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(Number((await saldo(501))?.saldo_doses)).toBe(9);
    expect(Number((await saldo(503))?.saldo_doses)).toBe(8);
    expect(await movimentos(500)).toHaveLength(0);
  });

  it("3. falha no meio não deixa saldo nem movimento", async () => {
    await expect(registrarEntradaSemenAutorizado(io({ async aposSaldo() { throw new Error("saldo fora"); } }), pedido(1, 3))).rejects.toThrow("saldo fora");
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(String((await saldo(500))?.custo_unitario)).toBe("100.00");
    expect(await movimentos(500)).toHaveLength(0);
    await expect(registrarEntradaSemenAutorizado(io({ async aposRegistro() { throw new Error("entrada fora"); } }), pedido(1, 3))).rejects.toThrow("entrada fora");
    expect(Number((await saldo(500))?.saldo_doses)).toBe(5);
    expect(await movimentos(500)).toHaveLength(0);
  });

  it("4. entrada e inseminação disputam a mesma partida", async () => {
    let liberarEntrada: () => void = () => undefined;
    const segueEntrada = new Promise<void>((resolver) => { liberarEntrada = resolver; });
    let entradaTravou: () => void = () => undefined;
    const partidaTravada = new Promise<void>((resolver) => { entradaTravou = resolver; });
    const entrada = registrarEntradaSemenAutorizado(io({
      aposPartida: async () => { entradaTravou(); await segueEntrada; },
    }), pedido(2, 1, { quantidadeDoses: 2, custoTotal: 300 }));
    await partidaTravada;
    const inseminacao = lancarInseminacaoSemenAutorizado(ioIa(), pedidoIa(1, 3, 70));
    await new Promise((resolver) => setTimeout(resolver, 200));
    liberarEntrada();
    const [entradaOk, iaOk] = await Promise.all([entrada, inseminacao]);
    expect(entradaOk.ok).toBe(true);
    expect(iaOk.ok).toBe(true);
    const livro = conferirLivro(5, "100.00", await movimentos(500));
    const linha = await saldo(500);
    expect(Number(linha?.saldo_doses)).toBe(6);
    expect(Number(linha?.saldo_doses)).toBe(livro.saldoAtual);
    expect(String(linha?.custo_unitario)).toBe(livro.custoAtual);
    expect(await movimentos(500)).toHaveLength(2);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    await pool.query("DELETE FROM semen_movimentacoes");
    await pool.query("DELETE FROM reproducao_registros");
    let liberarIa: () => void = () => undefined;
    const segueIa = new Promise<void>((resolver) => { liberarIa = resolver; });
    let iaTravou: () => void = () => undefined;
    const iaPronta = new Promise<void>((resolver) => { iaTravou = resolver; });
    const iaPrimeiro = lancarInseminacaoSemenAutorizado(ioIa({
      aposHistorico: async () => { iaTravou(); await segueIa; },
    }), pedidoIa(1, 3, 71));
    await iaPronta;
    const entradaDepois = registrarEntradaSemenAutorizado(io(), pedido(6, 1, { quantidadeDoses: 2, custoTotal: 300 }));
    await new Promise((resolver) => setTimeout(resolver, 200));
    liberarIa();
    const [iaResultado, entradaResultado] = await Promise.all([iaPrimeiro, entradaDepois]);
    expect(iaResultado.ok && entradaResultado.ok).toBe(true);
    const livroB = conferirLivro(5, "100.00", await movimentos(500));
    expect(Number((await saldo(500))?.saldo_doses)).toBe(6);
    expect(String((await saldo(500))?.custo_unitario)).toBe(livroB.custoAtual);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00, status = 'disponivel' WHERE id = 500");
    await pool.query("DELETE FROM semen_movimentacoes");
    await pool.query("DELETE FROM reproducao_registros");
    const juntos = await Promise.all([
      registrarEntradaSemenAutorizado(io(), pedido(6, 1, { quantidadeDoses: 4, custoTotal: 400 })),
      lancarInseminacaoSemenAutorizado(ioIa(), pedidoIa(1, 3, 70)),
      lancarInseminacaoSemenAutorizado(ioIa(), pedidoIa(2, 1, 71)),
    ]);
    expect(juntos.every((item) => item.ok)).toBe(true);
    const movs = await movimentos(500);
    expect(movs).toHaveLength(3);
    const livroC = conferirLivro(5, "100.00", movs);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(7);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(livroC.saldoAtual);
    expect(String((await saldo(500))?.custo_unitario)).toBe(livroC.custoAtual);
    expect(movs.filter((item) => String(item.tipo) === "ENTRADA")).toHaveLength(1);
    expect(movs.filter((item) => String(item.tipo) === "SAIDA_IA")).toHaveLength(2);
  }, 30_000);

  it("5. duas entradas simultâneas e deadlock sem duplicar", async () => {
    const [ida, volta] = await Promise.all([
      registrarEntradaSemenAutorizado(io(), pedido(2, 1, { quantidadeDoses: 2, custoTotal: 200 })),
      registrarEntradaSemenAutorizado(io(), pedido(6, 1, { quantidadeDoses: 3, custoTotal: 300 })),
    ]);
    expect(ida.ok && volta.ok).toBe(true);
    expect(Number((await saldo(500))?.saldo_doses)).toBe(10);
    const movs = await movimentos(500);
    expect(movs).toHaveLength(2);
    const livro = conferirLivro(5, "100.00", movs);
    expect(String((await saldo(500))?.custo_unitario)).toBe(livro.custoAtual);

    await pool.query("UPDATE semen_partidas SET saldo_doses = 5, custo_unitario = 100.00 WHERE id = 500");
    await pool.query("DELETE FROM semen_movimentacoes");
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = registrarEntradaSemenAutorizado(io({
      aposIdentidade: async () => { avisou(); await segue; },
    }), pedido(2, 1, { quantidadeDoses: 2, custoTotal: 300 }));
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
    expect(Number((await saldo(500))?.saldo_doses)).toBe(7);
    expect(await movimentos(500)).toHaveLength(1);
  }, 30_000);

  it("6. mesma chave não soma de novo e outra chave soma", async () => {
    const chave = chaveEntrada();
    const primeira = await registrarEntradaSemenEEspelhar(io(), pedido(1, 3, {
      partida: "IDEM-1", quantidadeDoses: 4, custoTotal: 400, operacaoId: chave,
    }), { async registrar() { throw new Error("espelho da primeira"); } });
    expect(primeira).toMatchObject({ ok: true, novaEntrada: true, saldoAtual: 4, repetida: false });
    let espelhos = 0;
    const repetida = await registrarEntradaSemenEEspelhar(io(), pedido(2, 1, {
      partida: "IDEM-1", quantidadeDoses: 4, custoTotal: 400, operacaoId: chave,
    }), { async registrar() { espelhos += 1; } });
    expect(repetida).toMatchObject({
      ok: true, repetida: true, partidaId: primeira.ok ? primeira.partidaId : 0, saldoAtual: 4, custoMedioAtual: "100.00",
    });
    expect(espelhos).toBe(0);
    const [partidas] = await pool.query<RowDataPacket[]>("SELECT id, saldo_doses FROM semen_partidas WHERE partida = 'IDEM-1' AND user_id = 1 AND fazenda_id = 10");
    expect(partidas).toHaveLength(1);
    expect(Number(partidas[0]?.saldo_doses)).toBe(4);
    expect(await movimentos(Number(partidas[0]?.id))).toHaveLength(1);
    const divergente = await registrarEntradaSemenAutorizado(io(), pedido(1, 3, {
      partida: "IDEM-1", quantidadeDoses: 9, custoTotal: 900, operacaoId: chave,
    }));
    expect(divergente).toMatchObject({ ok: false, motivo: "invalido" });
    expect(Number(partidas.length && (await saldo(Number(partidas[0]?.id)))?.saldo_doses)).toBe(4);
    const depois = await registrarEntradaSemenAutorizado(io(), pedido(1, 3, {
      partida: "IDEM-1", quantidadeDoses: 1, custoTotal: 200,
    }));
    expect(depois).toMatchObject({ ok: true, repetida: false, novaEntrada: false, saldoAtual: 5 });
    const livro = conferirLivro(0, null, await movimentos(Number(partidas[0]?.id)));
    expect(Number((await saldo(Number(partidas[0]?.id)))?.saldo_doses)).toBe(livro.saldoAtual);
    expect(String((await saldo(Number(partidas[0]?.id)))?.custo_unitario)).toBe(livro.custoAtual);
  });

  it("7. criação simultânea, reenvio e falha antes do commit", async () => {
    let esperas = 0;
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const criaA = registrarEntradaSemenAutorizado(io({
      aposSaldo: async () => {
        esperas += 1;
        if (esperas === 1) {
          avisou();
          await segue;
        }
      },
    }), pedido(2, 1, { partida: "CORRIDA", quantidadeDoses: 2, custoTotal: 200 }));
    await travou;
    const criaB = registrarEntradaSemenAutorizado(io(), pedido(6, 1, { partida: "CORRIDA", quantidadeDoses: 3, custoTotal: 450 }));
    await new Promise((resolver) => setTimeout(resolver, 300));
    liberar();
    const [a, b] = await Promise.all([criaA, criaB]);
    expect(a.ok && b.ok).toBe(true);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT id, saldo_doses, custo_unitario FROM semen_partidas WHERE user_id = 1 AND fazenda_id = 10 AND partida = 'CORRIDA'",
    );
    expect(linhas).toHaveLength(1);
    const corridaId = Number(linhas[0]?.id);
    const movs = await movimentos(corridaId);
    expect(movs).toHaveLength(2);
    const livro = conferirLivro(0, null, movs);
    expect(Number(linhas[0]?.saldo_doses)).toBe(5);
    expect(Number(linhas[0]?.saldo_doses)).toBe(livro.saldoAtual);
    expect(String(linhas[0]?.custo_unitario)).toBe(livro.custoAtual);

    const distintas = await Promise.all([
      registrarEntradaSemenAutorizado(io(), pedido(1, 3, { partida: "LEGA-A", quantidadeDoses: 1, custoTotal: 10 })),
      registrarEntradaSemenAutorizado(io(), pedido(1, 3, { partida: "LEGA-B", quantidadeDoses: 1, custoTotal: 20 })),
    ]);
    expect(distintas[0].ok && distintas[1].ok).toBe(true);
    if (distintas[0].ok && distintas[1].ok) expect(distintas[0].partidaId).not.toBe(distintas[1].partidaId);

    const chave = chaveEntrada();
    let reenvios = 0;
    let liberarReenvio: () => void = () => undefined;
    const segueReenvio = new Promise<void>((resolver) => { liberarReenvio = resolver; });
    let reenvioTravou: () => void = () => undefined;
    const reenvioPronto = new Promise<void>((resolver) => { reenvioTravou = resolver; });
    const reenvioA = registrarEntradaSemenAutorizado(io({
      aposPartida: async () => {
        reenvios += 1;
        if (reenvios === 1) {
          reenvioTravou();
          await segueReenvio;
        }
      },
    }), pedido(2, 1, { partida: "CORRIDA", quantidadeDoses: 1, custoTotal: 100, operacaoId: chave }));
    await reenvioPronto;
    const reenvioB = registrarEntradaSemenAutorizado(io(), pedido(6, 1, { partida: "CORRIDA", quantidadeDoses: 1, custoTotal: 100, operacaoId: chave }));
    await new Promise((resolver) => setTimeout(resolver, 300));
    liberarReenvio();
    const [r1, r2] = await Promise.all([reenvioA, reenvioB]);
    expect(r1.ok && r2.ok).toBe(true);
    const repetida = [r1, r2].filter((item) => item.ok && item.repetida);
    expect(repetida).toHaveLength(1);
    expect(await movimentos(corridaId)).toHaveLength(3);
    expect(Number((await saldo(corridaId))?.saldo_doses)).toBe(6);

    const chaveFalha = chaveEntrada();
    await expect(registrarEntradaSemenAutorizado(io({
      async aposSaldo() { throw new Error("antes do commit"); },
    }), pedido(1, 3, { partida: "CORRIDA", quantidadeDoses: 4, custoTotal: 400, operacaoId: chaveFalha }))).rejects.toThrow("antes do commit");
    expect(Number((await saldo(corridaId))?.saldo_doses)).toBe(6);
    const retomada = await registrarEntradaSemenAutorizado(io(), pedido(1, 3, {
      partida: "CORRIDA", quantidadeDoses: 4, custoTotal: 400, operacaoId: chaveFalha,
    }));
    expect(retomada).toMatchObject({ ok: true, repetida: false, saldoAtual: 10 });
    const livroFinal = conferirLivro(0, null, await movimentos(corridaId));
    expect(Number((await saldo(corridaId))?.saldo_doses)).toBe(livroFinal.saldoAtual);
    expect(String((await saldo(corridaId))?.custo_unitario)).toBe(livroFinal.custoAtual);
  }, 30_000);
});

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
        `SELECT uf.userId, uf.fazendaId FROM usuario_fazendas uf JOIN users u ON u.id = uf.userId WHERE uf.userId = ? AND u.titularUserId = ? FOR UPDATE`,
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
  return {
    ...autenticacao(conn),
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
    async inserirPartida(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_partidas
          (user_id, fazenda_id, origem_reprodutor, reprodutor_key, macho_id, reprodutor_texto, partida, central_origem, saldo_doses, custo_unitario, status, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.fazendaId, row.origemReprodutor, row.reprodutorKey, row.machoId, row.reprodutorTexto, row.partida, row.centralOrigem, row.saldoDoses, row.custoUnitario, row.status, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPartida(id, patch) {
      await conn.query(
        "UPDATE semen_partidas SET saldo_doses = ?, custo_unitario = ?, status = ?, central_origem = ?, reprodutor_texto = ? WHERE id = ?",
        [patch.saldoDoses, patch.custoUnitario, patch.status, patch.centralOrigem, patch.reprodutorTexto, id],
      );
    },
    async inserirMovimento(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO semen_movimentacoes (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.partidaId, row.userId, row.fazendaId, row.tipo, row.dataEntrada, row.quantidadeDoses, row.custoTotal, row.custoUnitario, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    ...metodosOperacao(conn),
  };
}

function consultasIa(conn: mysql.PoolConnection): ConsultaInseminacao {
  const base = consultasEntrada(conn);
  return {
    ...autenticacao(conn),
    lote: base.lote, pasto: base.pasto, espiar: base.espiar, animal: base.animal,
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
        `INSERT INTO semen_movimentacoes (partida_id, user_id, fazenda_id, tipo, data_entrada, quantidade_doses, custo_total, custo_unitario, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
