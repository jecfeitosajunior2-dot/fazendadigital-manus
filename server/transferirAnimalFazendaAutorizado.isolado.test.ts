import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  alocarEEspelharAnimais,
  incluirEEspelharAnimais,
  movimentarEEspelharAnimais,
  MSG_FAZENDA_ALOCACAO,
  retirarEEspelharAnimais,
  type ConsultaAnimaisLote,
  type IoAnimaisLote,
  type PedidoAlocacaoAnimais,
  type PedidoInclusaoAnimais,
  type PedidoRetiradaAnimais,
  type PedidoTrocaAnimais,
} from "./movimentarAnimaisLoteAutorizado";
import {
  movimentarEEspelharLote,
  type ConsultaMovimentacaoLote,
  type IoMovimentacaoLote,
  type PedidoMovimentacaoLote,
} from "./movimentarLotePastoAutorizado";
import { MSG_BAIXA_ANIMAL_INATIVO, MSG_BAIXA_FAZENDA_DIVERGENTE, MSG_SAIDA_TRANSFERENCIA_DUPLICADA } from "../shared/animalBaixa";
import {
  MSG_TRANSFERENCIA_LOTE_FAZENDA,
  MSG_TRANSFERENCIA_LOTE_INATIVO,
  MSG_TRANSFERENCIA_PASTO_FAZENDA,
} from "../shared/transferenciaInternaAnimal";
import {
  MSG_ANIMAL_TRANSFERENCIA_AUSENTE,
  MSG_LOTE_TRANSFERENCIA_AUSENTE,
  transferirAnimalFazendaAutorizado,
  transferirEEspelharAnimalFazenda,
  type EspelhoTransferenciaFazenda,
  type PedidoTransferenciaFazenda,
} from "./transferirAnimalFazendaAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4s-transferencia";
const PORTA = 3344;
const SENHA = "isolado-h4s";
const BANCO = "fd_h4s";
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
  localizacao varchar(200) NULL, fazendaId int NULL, pastoAtualId int NULL,
  dataEntradaPasto date NULL, ativo tinyint(1) NOT NULL DEFAULT 1, PRIMARY KEY (id),
  CONSTRAINT lotes_pasto_fk FOREIGN KEY (pastoAtualId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL, fazendaId int NULL,
  pastoId int NULL, status varchar(20) NOT NULL, brinco varchar(50) NULL, PRIMARY KEY (id),
  CONSTRAINT animais_pasto_fk FOREIGN KEY (pastoId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  dataBaixa date NULL, status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteOrigemId int NULL, loteDestinoId int NOT NULL, pastoOrigemId int NULL,
  pastoDestinoId int NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, usuarioNome varchar(200) NULL, observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lote_pasto_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, loteId int NOT NULL,
  pastoOrigemId int NULL, pastoDestinoId int NULL, dataEntrada date NOT NULL,
  dataSaida date NULL, diasNoPasto int NULL, qtdAnimais int NULL,
  observacoes varchar(200) NULL, PRIMARY KEY (id)
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

describe.sequential("transferência de animais entre fazendas em MySQL isolado", () => {
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
        (5, 'so-origem-isolado', 'So Origem', 'origem@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (6, 'so-destino-isolado', 'So Destino', 'destino@isolado.local', 'user', 'comum', 1, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (2, 20, 1), (3, 10, 1), (3, 20, 1), (5, 10, 1), (6, 20, 1)
    `);
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'animais.transferir', 1),
        (2, 1, 'lotes.editar', 1),
        (3, 1, 'animais.visualizar', 1),
        (3, 1, 'lotes.editar', 1),
        (5, 1, 'animais.transferir', 1),
        (6, 1, 'animais.transferir', 1)
    `);
    await conn.query(`
      INSERT INTO pastos (id, userId, fazendaId, nome, status) VALUES
        (1000, 1, 10, 'Curral', 'ativo'),
        (1100, 1, 10, 'Mangueiro', 'descanso'),
        (1200, 1, 10, 'Brejo', 'descanso'),
        (2000, 1, 20, 'Retiro', 'ativo'),
        (4000, 4, 40, 'Alheio', 'ativo')
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
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, localizacao, fazendaId, pastoAtualId, dataEntradaPasto, ativo) VALUES
        (100, 1, 'Lote da sede', 'Curral', 10, 1000, '2026-11-01', 1),
        (110, 1, 'Lote do mangueiro', 'Mangueiro', 10, 1100, '2026-11-01', 1),
        (200, 1, 'Lote do retiro', 'Retiro', 20, 2000, '2026-11-01', 1),
        (210, 1, 'Retiro solto', NULL, 20, NULL, NULL, 1),
        (220, 1, 'Retiro parado', 'Retiro', 20, 2000, '2026-11-01', 0),
        (400, 4, 'Lote alheio', 'Alheio', 40, 4000, '2026-11-01', 1)
    `);
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (50, 1, NULL, 10, NULL, 'ativo', 'BR-50'),
        (51, 1, 100, 10, 1000, 'ativo', 'BR-51'),
        (52, 1, 100, 10, 1000, 'vendido', 'BR-52'),
        (53, 1, 100, 10, 1000, 'ativo', 'BR-53'),
        (54, 4, 400, 40, 4000, 'ativo', 'BR-54'),
        (56, 1, 100, 10, 1200, 'ativo', 'BR-56')
    `);
    await pool.query("INSERT INTO animal_baixas (userId, animalId, dataBaixa, status) VALUES (1, 53, '2026-11-01', 'ativa')");
    await pool.query(`
      INSERT INTO lote_pasto_movimentacoes
        (id, userId, loteId, pastoOrigemId, pastoDestinoId, dataEntrada, dataSaida, qtdAnimais)
      VALUES (1, 1, 100, NULL, 1000, '2026-11-01', NULL, 2)
    `);
    await pool.query("UPDATE pastos SET status = 'ativo' WHERE id IN (1000, 2000, 4000)");
    await pool.query("UPDATE pastos SET status = 'descanso' WHERE id IN (1100, 1200)");
  });

  function io(ganchos: Partial<IoAnimaisLote> = {}): IoAnimaisLote {
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

  function ioPasto(ganchos: Partial<IoMovimentacaoLote> = {}): IoMovimentacaoLote {
    return {
      ...ganchos,
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultasPasto(conn));
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

  function pedido(
    executorId: number,
    sessionVersion: number,
    input: Partial<PedidoTransferenciaFazenda["input"]> = {},
    extras: Partial<PedidoTransferenciaFazenda> = {},
  ): PedidoTransferenciaFazenda {
    const nomes: Record<number, string> = {
      1: "Administrador da conta",
      2: "Funcionario Curral",
      5: "So Origem",
      6: "So Destino",
    };
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: nomes[executorId] ?? "Sem Permissao",
      input: {
        fazendaOrigemId: 10,
        fazendaDestinoId: 20,
        animalId: 51,
        loteDestinoId: 200,
        pastoDestinoId: 2000,
        dataTransferencia: DATA,
        ...input,
      },
      ...extras,
    };
  }

  async function transferir(corpo: PedidoTransferenciaFazenda, ganchos: Partial<IoAnimaisLote> = {}) {
    const chamadas: number[] = [];
    const resultado = await transferirEEspelharAnimalFazenda(io(ganchos), corpo, {
      async transferir(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function historico(animalId?: number) {
    const filtro = animalId == null ? "" : " WHERE animalId = ?";
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM animal_lote_movimentacoes${filtro} ORDER BY id`,
      animalId == null ? [] : [animalId],
    );
    return linhas;
  }

  async function statusPasto(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT status FROM pastos WHERE id = ?", [id]);
    return String(linhas[0]?.status ?? "");
  }

  it("1. principal transfere entre fazendas próprias", async () => {
    const { resultado, chamadas } = await transferir(pedido(1, 3));
    expect(resultado).toMatchObject({ ok: true, status: "ativo", fazendaId: 20, loteId: 200, loteDestinoNome: "Lote do retiro" });
    expect(chamadas).toEqual([1]);
    const linha = await animal(51);
    expect(Number(linha?.userId)).toBe(1);
    expect(Number(linha?.fazendaId)).toBe(20);
    expect(Number(linha?.loteId)).toBe(200);
    expect(Number(linha?.pastoId)).toBe(2000);
    expect(String(linha?.brinco)).toBe("BR-51");
    expect(String(linha?.status)).toBe("ativo");
  });

  it("2. funcionário autorizado nas duas fazendas", async () => {
    const { resultado } = await transferir(pedido(2, 1));
    expect(resultado.ok).toBe(true);
    const linhas = await historico(51);
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0]?.userId)).toBe(1);
    expect(String(linhas[0]?.usuarioNome)).toBe("Funcionario Curral");
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
  });

  it("3. funcionário autorizado só na origem", async () => {
    const { resultado, chamadas } = await transferir(pedido(5, 1));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(chamadas).toEqual([]);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(await historico()).toHaveLength(0);
  });

  it("4. funcionário autorizado só no destino", async () => {
    const { resultado } = await transferir(pedido(6, 1));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(Number((await animal(51))?.loteId)).toBe(100);
  });

  it("5. funcionário sem a permissão de transferir", async () => {
    const { resultado } = await transferir(pedido(3, 1));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await historico()).toHaveLength(0);
  });

  it("6. fazenda de outro titular", async () => {
    const { resultado } = await transferir(pedido(1, 3, { fazendaDestinoId: 40, loteDestinoId: 400, pastoDestinoId: 4000 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_LOTE_TRANSFERENCIA_AUSENTE });
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(Number((await animal(54))?.fazendaId)).toBe(40);
  });

  it("7. animal de outro titular", async () => {
    const { resultado } = await transferir(pedido(1, 3, { animalId: 54, fazendaOrigemId: 40 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_TRANSFERENCIA_AUSENTE });
    expect(Number((await animal(54))?.loteId)).toBe(400);
    expect(await historico()).toHaveLength(0);
  });

  it("8. animal sem lote", async () => {
    const { resultado } = await transferir(pedido(1, 3, { animalId: 50, pastoDestinoId: 2000 }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(50))?.loteId)).toBe(200);
    expect(Number((await animal(50))?.fazendaId)).toBe(20);
    const linhas = await historico(50);
    expect(linhas[0]?.loteOrigemId).toBeNull();
    expect(Number(linhas[0]?.loteDestinoId)).toBe(200);
  });

  it("9. animal com lote", async () => {
    const { resultado } = await transferir(pedido(1, 3));
    expect(resultado.ok).toBe(true);
    expect(Number((await historico(51))[0]?.loteOrigemId)).toBe(100);
    expect(Number((await animal(51))?.loteId)).toBe(200);
  });

  it("10. animal com pasto", async () => {
    const { resultado } = await transferir(pedido(1, 3, { animalId: 56 }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(56))?.pastoId)).toBe(2000);
    expect(Number((await historico(56))[0]?.pastoOrigemId)).toBe(1200);
    expect(Number((await historico(56))[0]?.pastoDestinoId)).toBe(2000);
    expect(await statusPasto(1200)).toBe("descanso");
    expect(await statusPasto(1000)).toBe("ativo");
  });

  it("11. destino sem lote não apaga o vínculo atual", async () => {
    const { resultado, chamadas } = await transferir(pedido(1, 3, { loteDestinoId: null }));
    expect(resultado.ok).toBe(false);
    expect(chamadas).toEqual([]);
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(await historico()).toHaveLength(0);
  });

  it("12. destino com lote autorizado", async () => {
    const { resultado } = await transferir(pedido(1, 3, { loteDestinoId: 200 }));
    expect(resultado).toMatchObject({ ok: true, loteDestinoNome: "Lote do retiro" });
    expect(Number((await animal(51))?.loteId)).toBe(200);
  });

  it("13. destino com pasto e destino sem pasto", async () => {
    const comPasto = await transferir(pedido(1, 3));
    expect(comPasto.resultado.ok).toBe(true);
    expect(Number((await animal(51))?.pastoId)).toBe(2000);
    const semPasto = await transferir(pedido(1, 3, { animalId: 50, loteDestinoId: 210, pastoDestinoId: 2000 }));
    expect(semPasto.resultado.ok).toBe(true);
    expect((await animal(50))?.pastoId).toBeNull();
    expect((await historico(50))[0]?.pastoDestinoId).toBeNull();
  });

  it("14. não mantém o lote da fazenda anterior", async () => {
    const { resultado } = await transferir(pedido(1, 3, { loteDestinoId: 100, pastoDestinoId: 1000 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_TRANSFERENCIA_LOTE_FAZENDA });
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(Number((await animal(51))?.loteId)).toBe(100);
  });

  it("15. animal vendido ou com baixa não segue", async () => {
    const vendido = await transferir(pedido(1, 3, { animalId: 52 }));
    expect(vendido.resultado).toMatchObject({ ok: false, mensagem: MSG_BAIXA_ANIMAL_INATIVO });
    const baixado = await transferir(pedido(1, 3, { animalId: 53 }));
    expect(baixado.resultado).toMatchObject({ ok: false, mensagem: MSG_SAIDA_TRANSFERENCIA_DUPLICADA });
    expect(String((await animal(52))?.status)).toBe("vendido");
    expect(Number((await animal(53))?.fazendaId)).toBe(10);
    expect(await historico()).toHaveLength(0);
  });

  it("16. histórico guarda origem e destino", async () => {
    await transferir(pedido(1, 3, { observacoes: "mudou de sede" }));
    const linha = (await historico(51))[0];
    expect(Number(linha?.userId)).toBe(1);
    expect(Number(linha?.fazendaOrigemId)).toBe(10);
    expect(Number(linha?.fazendaId)).toBe(20);
    expect(Number(linha?.loteOrigemId)).toBe(100);
    expect(Number(linha?.loteDestinoId)).toBe(200);
    expect(Number(linha?.pastoOrigemId)).toBe(1000);
    expect(Number(linha?.pastoDestinoId)).toBe(2000);
    expect(String(linha?.dataMovimentacao).slice(0, 10)).toBe(DATA);
    expect(String(linha?.observacoes)).toBe("mudou de sede");
    expect(String(linha?.usuarioNome)).toBe("Administrador da conta");
  });

  it("17. titularidade permanece no dono da conta", async () => {
    const { resultado } = await transferir(pedido(2, 1, {}, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["animais.transferir"],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(51))?.userId)).toBe(1);
    expect(Number((await historico(51))[0]?.userId)).toBe(1);
  });

  it("18. falha no histórico desfaz a transferência", async () => {
    await expect(transferirAnimalFazendaAutorizado(io({
      async aposHistorico() { throw new Error("historico fora"); },
    }), pedido(1, 3))).rejects.toThrow("historico fora");
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(await historico()).toHaveLength(0);
  });

  it("19. falha na ocupação também volta tudo", async () => {
    await expect(transferirAnimalFazendaAutorizado(io({
      async aposOcupacao() { throw new Error("ocupacao fora"); },
    }), pedido(1, 3))).rejects.toThrow("ocupacao fora");
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(await historico()).toHaveLength(0);
    expect(await statusPasto(2000)).toBe("ativo");
  });

  it("20. duas transferências do mesmo animal", async () => {
    const [ida, volta] = await Promise.all([
      transferir(pedido(1, 3, { loteDestinoId: 200, pastoDestinoId: 2000 })),
      transferir(pedido(1, 3, { loteDestinoId: 210, pastoDestinoId: null })),
    ]);
    const sucessos = [ida, volta].filter((item) => item.resultado.ok);
    expect(sucessos).toHaveLength(1);
    const loteId = Number((await animal(51))?.loteId);
    expect([200, 210]).toContain(loteId);
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
    expect(await historico(51)).toHaveLength(1);
    expect(Number((await historico(51))[0]?.loteDestinoId)).toBe(loteId);
  });

  it("21. concorrência com a movimentação do lote", async () => {
    const pedidoPasto: PedidoMovimentacaoLote = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { loteId: 100, pastoId: 1100, dataEntrada: DATA },
    };
    const [mudou, andou] = await Promise.all([
      transferir(pedido(1, 3)),
      movimentarEEspelharLote(ioPasto(), pedidoPasto, { async mover() {} }),
    ]);
    expect(mudou.resultado.ok).toBe(true);
    expect(andou.ok).toBe(true);
    const linha = await animal(51);
    expect(Number(linha?.fazendaId)).toBe(20);
    expect(Number(linha?.loteId)).toBe(200);
    expect(Number(linha?.pastoId)).toBe(2000);
    expect(await historico(51)).toHaveLength(1);
    const [lote] = await pool.query<RowDataPacket[]>("SELECT pastoAtualId, fazendaId FROM lotes WHERE id = 100");
    expect([1000, 1100]).toContain(Number(lote[0]?.pastoAtualId));
    expect(Number(lote[0]?.fazendaId)).toBe(10);
  });

  it("22. concorrência com a edição cadastral", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = transferir(pedido(1, 3), {
      aposIdentidade: async () => {
        avisou();
        await segue;
      },
    });
    await travou;
    const externa = await pool.getConnection();
    let deadlock = false;
    try {
      await externa.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await externa.beginTransaction();
      await externa.query("SELECT id FROM animais WHERE id = 51 FOR UPDATE");
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
    const { resultado } = await operacao;
    expect(deadlock).toBe(true);
    expect(resultado.ok).toBe(true);
    expect(await historico(51)).toHaveLength(1);
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
  });

  it("23. fazenda e pasto manipulados na requisição", async () => {
    const origem = await transferir(pedido(1, 3, { fazendaOrigemId: 40 }));
    expect(origem.resultado).toMatchObject({ ok: false, mensagem: MSG_BAIXA_FAZENDA_DIVERGENTE });
    const destino = await transferir(pedido(1, 3, { fazendaDestinoId: 40 }));
    expect(destino.resultado).toMatchObject({ ok: false, mensagem: MSG_TRANSFERENCIA_LOTE_FAZENDA });
    const pasto = await transferir(pedido(1, 3, { pastoDestinoId: 1000 }));
    expect(pasto.resultado).toMatchObject({ ok: false, mensagem: MSG_TRANSFERENCIA_PASTO_FAZENDA });
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(await historico()).toHaveLength(0);
  });

  it("24. preserva o histórico que já existia", async () => {
    await pool.query(`
      INSERT INTO animal_lote_movimentacoes
        (id, userId, animalId, loteOrigemId, loteDestinoId, pastoOrigemId, pastoDestinoId, fazendaId, fazendaOrigemId, dataMovimentacao, usuarioNome)
      VALUES (9, 1, 51, NULL, 100, NULL, 1000, 10, NULL, '2026-01-01', 'antes')
    `);
    await transferir(pedido(1, 3));
    const linhas = await historico(51);
    expect(linhas).toHaveLength(2);
    expect(Number(linhas[0]?.id)).toBe(9);
    expect(String(linhas[0]?.dataMovimentacao).slice(0, 10)).toBe("2026-01-01");
    expect(Number(linhas[1]?.fazendaOrigemId)).toBe(10);
    expect(String((await animal(51))?.brinco)).toBe("BR-51");
  });

  it("25. espelho local só depois da confirmação", async () => {
    const ok = await transferir(pedido(1, 3));
    expect(ok.chamadas).toEqual([1]);
    await pool.query("UPDATE animais SET fazendaId = 10, loteId = 100, pastoId = 1000 WHERE id = 51");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    const espelhos: EspelhoTransferenciaFazenda[] = [];
    await expect(transferirEEspelharAnimalFazenda(io(), pedido(1, 3), {
      async transferir(_userId, dados) {
        espelhos.push(dados);
        throw new Error("espelho fora");
      },
    })).resolves.toMatchObject({ ok: true, fazendaId: 20 });
    expect(espelhos[0]?.fazendaOrigemId).toBe(10);
    expect(espelhos[0]?.fazendaDestinoId).toBe(20);
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
    expect(await historico()).toHaveLength(1);
  });

  it("26. telas de alocação e de transferência", async () => {
    const manejo = await transferir(pedido(1, 3, {
      fazendaOrigemId: 10,
      fazendaDestinoId: 20,
      animalId: 51,
      loteDestinoId: 200,
      pastoDestinoId: 2000,
      dataTransferencia: DATA,
    }));
    expect(manejo.resultado).toMatchObject({
      ok: true,
      status: "ativo",
      fazendaId: 20,
      loteId: 200,
      loteDestinoNome: "Lote do retiro",
    });
    const alocacao: PedidoAlocacaoAnimais = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: {
        animalIds: [56],
        loteDestinoId: 200,
        pastoDestinoId: 2000,
        fazendaDestinoId: 20,
        dataMovimentacao: DATA,
      },
    };
    const cruzada = await alocarEEspelharAnimais(io(), alocacao, { async mover() {} });
    expect(cruzada).toMatchObject({ ok: false, mensagem: MSG_FAZENDA_ALOCACAO });
    expect(Number((await animal(56))?.fazendaId)).toBe(10);
    expect(Number((await animal(56))?.loteId)).toBe(100);
    expect(await historico(56)).toHaveLength(0);
  });

  it("27. inclusão, retirada e troca no mesmo instante", async () => {
    const inclusao: PedidoInclusaoAnimais = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: { loteId: 100, animalIds: [50] },
    };
    const junto = await Promise.all([
      transferir(pedido(1, 3)),
      incluirEEspelharAnimais(io(), inclusao, { async incluir() {} }),
    ]);
    expect(junto[0].resultado.ok).toBe(true);
    expect(junto[1].ok).toBe(true);
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);

    await pool.query("UPDATE animais SET fazendaId = 10, loteId = 100, pastoId = 1000 WHERE id = 51");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    const retirada: PedidoRetiradaAnimais = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: { loteId: 100, animalIds: [51] },
    };
    await Promise.all([
      transferir(pedido(1, 3)),
      retirarEEspelharAnimais(io(), retirada, { async retirar() {} }),
    ]);
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
    expect(Number((await animal(51))?.loteId)).toBe(200);
    expect(await historico(51)).toHaveLength(1);

    await pool.query("UPDATE animais SET fazendaId = 10, loteId = 100, pastoId = 1000 WHERE id = 51");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    const troca: PedidoTrocaAnimais = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: { loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA },
    };
    await Promise.all([
      transferir(pedido(1, 3)),
      movimentarEEspelharAnimais(io(), troca, { async mover() {} }),
    ]);
    const final = await animal(51);
    expect(Number(final?.userId)).toBe(1);
    expect(Number(final?.fazendaId)).toBe(20);
    expect(Number(final?.loteId)).toBe(200);
    const linhas = await historico(51);
    expect(linhas.length).toBeGreaterThan(0);
    expect(Number(linhas[linhas.length - 1]?.fazendaId)).toBe(20);
    expect(Number(linhas[linhas.length - 1]?.loteDestinoId)).toBe(200);
  });

  it("28. lote inativo não recebe o animal", async () => {
    const { resultado } = await transferir(pedido(1, 3, { loteDestinoId: 220, pastoDestinoId: 2000 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_TRANSFERENCIA_LOTE_INATIVO });
    expect(Number((await animal(51))?.loteId)).toBe(100);
  });

  it("29. administrador principal ignora o titular enviado pela tela", async () => {
    const { resultado } = await transferir(pedido(1, 3, {}, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(resultado.ok).toBe(true);
    expect(Number((await historico(51))[0]?.userId)).toBe(1);
    expect(Number((await animal(51))?.userId)).toBe(1);
  });
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
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE userId = ?",
        [titularUserId],
      );
      return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
    },
    async fazenda(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      return linha ? { id: Number(linha.id), userId: Number(linha.userId) } : null;
    },
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaAnimaisLote {
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
    async pasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
      };
    },
    async espiar(ids) {
      if (ids.length === 0) return [];
      const marcas = ids.map(() => "?").join(", ");
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais WHERE id IN (${marcas}) ORDER BY id`,
        ids,
      );
      return linhas.map(mapearAnimal);
    },
    async animais(ids, titularUserId) {
      if (ids.length === 0) return [];
      const marcas = ids.map(() => "?").join(", ");
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais
         WHERE userId = ? AND id IN (${marcas}) ORDER BY id FOR UPDATE`,
        [titularUserId, ...ids],
      );
      return linhas.map(mapearAnimal);
    },
    async baixaAtiva(animalId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE userId = ? AND animalId = ? AND status = 'ativa' LIMIT 1",
        [titularUserId, animalId],
      );
      return linhas[0]?.dataBaixa == null ? null : String(linhas[0].dataBaixa);
    },
    async atualizarAnimais(ids, titularUserId, patch) {
      if (ids.length === 0) return;
      const pares = Object.entries(patch);
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      const marcas = ids.map(() => "?").join(", ");
      await conn.query(
        `UPDATE animais SET ${atribuicao} WHERE userId = ? AND id IN (${marcas})`,
        [...pares.map(([, valor]) => valor), titularUserId, ...ids],
      );
    },
    async inserirHistorico(rows) {
      for (const row of rows) {
        await conn.query(
          `INSERT INTO animal_lote_movimentacoes
            (userId, animalId, loteOrigemId, loteDestinoId, pastoOrigemId, pastoDestinoId, fazendaId, fazendaOrigemId, dataMovimentacao, usuarioNome, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.userId, row.animalId, row.loteOrigemId, row.loteDestinoId, row.pastoOrigemId,
            row.pastoDestinoId, row.fazendaId, row.fazendaOrigemId ?? null, row.dataMovimentacao,
            row.usuarioNome, row.observacoes,
          ],
        );
      }
    },
    async sincronizarStatusPasto(pastoId, titularUserId) {
      const [lotesOcupando] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS quantidade FROM lotes WHERE pastoAtualId = ? AND userId = ?",
        [pastoId, titularUserId],
      );
      const [animaisOcupando] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS quantidade FROM animais WHERE pastoId = ? AND userId = ? AND status = 'ativo'",
        [pastoId, titularUserId],
      );
      const ocupa = Number(lotesOcupando[0]?.quantidade ?? 0) > 0 || Number(animaisOcupando[0]?.quantidade ?? 0) > 0;
      await conn.query(
        "UPDATE pastos SET status = ? WHERE id = ? AND userId = ?",
        [ocupa ? "ativo" : "descanso", pastoId, titularUserId],
      );
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
  };
}

function consultasPasto(conn: mysql.PoolConnection): ConsultaMovimentacaoLote {
  return {
    ...autenticacao(conn),
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, pastoAtualId, dataEntradaPasto FROM lotes WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        pastoAtualId: linha.pastoAtualId == null ? null : Number(linha.pastoAtualId),
        dataEntradaPasto: linha.dataEntradaPasto == null ? null : String(linha.dataEntradaPasto).slice(0, 10),
      };
    },
    async pasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, nome FROM pastos WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        nome: linha.nome == null ? null : String(linha.nome),
      };
    },
    async animaisAtivos(loteId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, fazendaId, pastoId, status FROM animais
         WHERE userId = ? AND loteId = ? AND status = 'ativo' ORDER BY id FOR UPDATE`,
        [titularUserId, loteId],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
        status: linha.status == null ? null : String(linha.status),
      }));
    },
    async contarAtivos(loteId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS quantidade FROM animais WHERE userId = ? AND loteId = ? AND status = 'ativo'",
        [titularUserId, loteId],
      );
      return Number(linhas[0]?.quantidade ?? 0);
    },
    async estadiaAberta(loteId, pastoDestinoId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, dataEntrada FROM lote_pasto_movimentacoes
         WHERE loteId = ? AND pastoDestinoId = ? AND dataSaida IS NULL ORDER BY id FOR UPDATE`,
        [loteId, pastoDestinoId],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return { id: Number(linha.id), dataEntrada: String(linha.dataEntrada).slice(0, 10) };
    },
    async fecharEstadia(id, dataSaida, diasNoPasto) {
      await conn.query(
        "UPDATE lote_pasto_movimentacoes SET dataSaida = ?, diasNoPasto = ? WHERE id = ?",
        [dataSaida, diasNoPasto, id],
      );
    },
    async inserirMovimento(row) {
      await conn.query(
        `INSERT INTO lote_pasto_movimentacoes
          (userId, loteId, pastoOrigemId, pastoDestinoId, dataEntrada, dataSaida, diasNoPasto, qtdAnimais, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.loteId, row.pastoOrigemId, row.pastoDestinoId, row.dataEntrada, row.dataSaida ?? null, row.diasNoPasto ?? null, row.qtdAnimais, row.observacoes ?? null],
      );
    },
    async atualizarLote(id, titularUserId, patch) {
      const pares = Object.entries(patch);
      if (pares.length === 0) return;
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      await conn.query(
        `UPDATE lotes SET ${atribuicao} WHERE id = ? AND userId = ?`,
        [...pares.map(([, valor]) => valor), id, titularUserId],
      );
    },
    async atualizarAnimais(ids, titularUserId, patch) {
      if (ids.length === 0) return;
      const pares = Object.entries(patch);
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      const marcas = ids.map(() => "?").join(", ");
      await conn.query(
        `UPDATE animais SET ${atribuicao} WHERE userId = ? AND status = 'ativo' AND id IN (${marcas})`,
        [...pares.map(([, valor]) => valor), titularUserId, ...ids],
      );
    },
    async sincronizarStatusPasto(pastoId, titularUserId) {
      await consultas(conn).sincronizarStatusPasto(pastoId, titularUserId);
    },
    async marcarPastoAtivo(pastoId, titularUserId) {
      await conn.query("UPDATE pastos SET status = 'ativo' WHERE id = ? AND userId = ?", [pastoId, titularUserId]);
    },
  };
}
