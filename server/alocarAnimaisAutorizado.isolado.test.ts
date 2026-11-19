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
  MSG_LOTE_FORA_SUBDIVISAO,
  MSG_NENHUM_ALOCACAO,
  MSG_NENHUM_NO_LOTE,
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

const exec = promisify(execFile);
const CONTAINER = "fd-h4r-alocacao";
const PORTA = 3343;
const SENHA = "isolado-h4r";
const BANCO = "fd_h4r";
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
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteOrigemId int NULL, loteDestinoId int NOT NULL, pastoOrigemId int NULL,
  pastoDestinoId int NULL, fazendaId int NULL, dataMovimentacao date NOT NULL,
  usuarioNome varchar(200) NULL, observacoes text NULL, PRIMARY KEY (id)
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

function texto(valor: unknown): string | null {
  return valor == null ? null : String(valor);
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

describe.sequential("retirada e alocação de animais em MySQL isolado", () => {
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
        (4, 'outro-titular-isolado', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1)
    `);
    await conn.query("INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')");
    await conn.query("INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1)");
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'lotes.editar', 1), (3, 1, 'lotes.visualizar', 1)
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
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, localizacao, fazendaId, pastoAtualId, dataEntradaPasto, ativo) VALUES
        (100, 1, 'Lote da sede', 'Curral', 10, 1000, '2026-11-01', 1),
        (110, 1, 'Lote do mangueiro', 'Mangueiro', 10, 1100, '2026-11-01', 1),
        (120, 1, 'Lote solto', NULL, 10, NULL, NULL, 1),
        (130, 1, 'Lote parado', 'Curral', 10, 1000, '2026-11-01', 0),
        (200, 1, 'Lote do retiro', 'Retiro', 20, 2000, '2026-11-01', 1),
        (400, 4, 'Lote alheio', 'Alheio', 40, 4000, '2026-11-01', 1)
    `);
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (50, 1, NULL, 10, NULL, 'ativo', 'BR-50'),
        (51, 1, 100, 10, 1000, 'ativo', 'BR-51'),
        (52, 1, 100, 10, 1000, 'inativo', 'BR-52'),
        (53, 1, NULL, 20, NULL, 'ativo', 'BR-53'),
        (54, 4, 400, 40, 4000, 'ativo', 'BR-54'),
        (55, 1, NULL, NULL, NULL, 'ativo', 'BR-55')
    `);
    await pool.query(`
      INSERT INTO lote_pasto_movimentacoes
        (id, userId, loteId, pastoOrigemId, pastoDestinoId, dataEntrada, dataSaida, qtdAnimais)
      VALUES (1, 1, 100, NULL, 1000, '2026-11-01', NULL, 1)
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

  function pedidoInclusao(executorId: number, sessionVersion: number, animalIds: number[], loteId = 100, extras: Partial<PedidoInclusaoAnimais> = {}): PedidoInclusaoAnimais {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 2 ? "Funcionario Curral" : "Administrador da conta",
      input: { loteId, animalIds },
      ...extras,
    };
  }

  function pedidoTroca(executorId: number, sessionVersion: number, input: PedidoTrocaAnimais["input"], extras: Partial<PedidoTrocaAnimais> = {}): PedidoTrocaAnimais {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 2 ? "Funcionario Curral" : "Administrador da conta",
      input,
      ...extras,
    };
  }

  async function incluir(corpo: PedidoInclusaoAnimais, ganchos: Partial<IoAnimaisLote> = {}) {
    const chamadas: number[] = [];
    const resultado = await incluirEEspelharAnimais(io(ganchos), corpo, {
      async incluir(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function trocar(corpo: PedidoTrocaAnimais, ganchos: Partial<IoAnimaisLote> = {}) {
    const chamadas: number[] = [];
    const resultado = await movimentarEEspelharAnimais(io(ganchos), corpo, {
      async mover(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  function pedidoRetirada(executorId: number, sessionVersion: number, animalIds: number[], loteId = 100, extras: Partial<PedidoRetiradaAnimais> = {}): PedidoRetiradaAnimais {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 2 ? "Funcionario Curral" : "Administrador da conta",
      input: { loteId, animalIds },
      ...extras,
    };
  }

  function pedidoAlocacao(
    executorId: number,
    sessionVersion: number,
    input: Partial<PedidoAlocacaoAnimais["input"]> & Pick<PedidoAlocacaoAnimais["input"], "animalIds" | "loteDestinoId">,
    extras: Partial<PedidoAlocacaoAnimais> = {},
  ): PedidoAlocacaoAnimais {
    const pasto = input.loteDestinoId === 120 ? 1000 : input.loteDestinoId === 110 ? 1100 : input.loteDestinoId === 200 ? 2000 : 1000;
    const fazenda = input.loteDestinoId === 200 ? 20 : 10;
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 2 ? "Funcionario Curral" : "Administrador da conta",
      input: {
        pastoDestinoId: input.pastoDestinoId ?? pasto,
        fazendaDestinoId: input.fazendaDestinoId ?? fazenda,
        dataMovimentacao: input.dataMovimentacao ?? DATA,
        animalIds: input.animalIds,
        loteDestinoId: input.loteDestinoId,
      },
      ...extras,
    };
  }

  async function retirar(corpo: PedidoRetiradaAnimais, ganchos: Partial<IoAnimaisLote> = {}) {
    const chamadas: number[] = [];
    const resultado = await retirarEEspelharAnimais(io(ganchos), corpo, {
      async retirar(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function alocar(corpo: PedidoAlocacaoAnimais, ganchos: Partial<IoAnimaisLote> = {}) {
    const chamadas: number[] = [];
    const resultado = await alocarEEspelharAnimais(io(ganchos), corpo, {
      async mover(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function historico() {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animal_lote_movimentacoes ORDER BY id");
    return linhas;
  }

  async function statusPasto(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT status FROM pastos WHERE id = ?", [id]);
    return texto(linhas[0]?.status);
  }

  it("1. principal retirando animal", async () => {
    const { resultado, chamadas } = await retirar(pedidoRetirada(1, 3, [51]));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.count).toBe(1);
    expect((await animal(51))?.loteId).toBeNull();
    expect(chamadas).toEqual([1]);
  });

  it("2. funcionário autorizado", async () => {
    const { resultado } = await retirar(pedidoRetirada(2, 1, [51]));
    expect(resultado.ok).toBe(true);
    expect((await animal(51))?.loteId).toBeNull();
  });

  it("3. funcionário sem permissão", async () => {
    const { resultado, chamadas } = await retirar(pedidoRetirada(3, 1, [51]));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(chamadas).toEqual([]);
  });

  it("4. fazenda não concedida", async () => {
    await pool.query("UPDATE animais SET loteId = 200, fazendaId = 20, pastoId = 2000 WHERE id = 53");
    const { resultado } = await retirar(pedidoRetirada(2, 1, [53], 200));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(Number((await animal(53))?.loteId)).toBe(200);
  });

  it("5. animal de outro titular", async () => {
    const { resultado } = await retirar(pedidoRetirada(1, 3, [54]));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_NENHUM_NO_LOTE });
    expect(Number((await animal(54))?.loteId)).toBe(400);
  });

  it("6. lote de outro titular", async () => {
    const { resultado } = await retirar(pedidoRetirada(1, 3, [54], 400));
    expect(resultado).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(Number((await animal(54))?.loteId)).toBe(400);
  });

  it("7. animal sem lote", async () => {
    const { resultado } = await retirar(pedidoRetirada(1, 3, [50]));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_NENHUM_NO_LOTE });
    expect((await animal(50))?.loteId).toBeNull();
    expect(await historico()).toHaveLength(0);
  });

  it("8. retirada de vários animais", async () => {
    const { resultado } = await retirar(pedidoRetirada(1, 3, [51, 52]));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.count).toBe(2);
    expect((await animal(51))?.loteId).toBeNull();
    expect((await animal(52))?.loteId).toBeNull();
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(Number((await animal(52))?.pastoId)).toBe(1000);
  });

  it("9. preservação da fazenda", async () => {
    await retirar(pedidoRetirada(1, 3, [51]));
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
  });

  it("10. tratamento correto do pasto", async () => {
    await retirar(pedidoRetirada(1, 3, [51]));
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(await statusPasto(1000)).toBe("ativo");
  });

  it("11. histórico da retirada", async () => {
    await pool.query("INSERT INTO animal_lote_movimentacoes (userId, animalId, loteOrigemId, loteDestinoId, dataMovimentacao, observacoes) VALUES (1, 51, NULL, 100, '2026-10-01', 'entrada antiga')");
    await retirar(pedidoRetirada(1, 3, [51]));
    const linhas = await historico();
    expect(linhas).toHaveLength(1);
    expect(texto(linhas[0]?.observacoes)).toBe("entrada antiga");
    expect((await animal(51))?.loteId).toBeNull();
  });

  it("12. transferência entre lotes da mesma fazenda", async () => {
    const { resultado } = await alocar(pedidoAlocacao(1, 3, { animalIds: [51], loteDestinoId: 110 }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.loteDestinoNome).toBe("Lote do mangueiro");
    expect(Number((await animal(51))?.loteId)).toBe(110);
    expect(Number((await animal(51))?.pastoId)).toBe(1100);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(Number((await historico())[0]?.userId)).toBe(1);
    expect(Number((await historico())[0]?.loteOrigemId)).toBe(100);
  });

  it("13. transferência para lote sem pasto", async () => {
    const { resultado } = await alocar(pedidoAlocacao(1, 3, {
      animalIds: [51], loteDestinoId: 120, pastoDestinoId: 1000, fazendaDestinoId: 10,
    }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(51))?.loteId)).toBe(120);
    expect((await animal(51))?.pastoId).toBeNull();
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
  });

  it("14. transferência para lote com pasto", async () => {
    await alocar(pedidoAlocacao(1, 3, { animalIds: [51, 52], loteDestinoId: 110 }));
    expect(Number((await animal(52))?.loteId)).toBe(110);
    expect(Number((await animal(52))?.pastoId)).toBe(1100);
    expect(await statusPasto(1100)).toBe("ativo");
    expect(await statusPasto(1000)).toBe("ativo");
  });

  it("15. tentativa de transferir entre fazendas", async () => {
    const { resultado } = await alocar(pedidoAlocacao(1, 3, {
      animalIds: [51], loteDestinoId: 200, pastoDestinoId: 2000, fazendaDestinoId: 20,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "fazendas_diferentes", mensagem: MSG_FAZENDA_ALOCACAO });
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(await historico()).toHaveLength(0);
  });

  it("16. fazenda manipulada na requisição", async () => {
    const { resultado } = await alocar(pedidoAlocacao(1, 3, {
      animalIds: [51], loteDestinoId: 110, pastoDestinoId: 1100, fazendaDestinoId: 20,
    }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_FAZENDA_ALOCACAO });
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
  });

  it("17. pasto manipulado na requisição", async () => {
    const { resultado } = await alocar(pedidoAlocacao(1, 3, {
      animalIds: [51], loteDestinoId: 110, pastoDestinoId: 1200, fazendaDestinoId: 10,
    }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_LOTE_FORA_SUBDIVISAO });
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(Number((await animal(51))?.loteId)).toBe(100);
  });

  it("18. movimentações simultâneas", async () => {
    await pool.query("UPDATE animais SET loteId = 100, pastoId = 1000, fazendaId = 10 WHERE id = 55");
    const [uma, outra] = await Promise.all([
      alocar(pedidoAlocacao(1, 3, { animalIds: [51], loteDestinoId: 110 })),
      alocar(pedidoAlocacao(1, 3, { animalIds: [55], loteDestinoId: 120, pastoDestinoId: 1000 })),
    ]);
    expect(uma.resultado.ok).toBe(true);
    expect(outra.resultado.ok).toBe(true);
    expect(Number((await animal(51))?.loteId)).toBe(110);
    expect(Number((await animal(55))?.loteId)).toBe(120);
    expect(await historico()).toHaveLength(2);
  });

  it("19. concorrência com a movimentação de pasto do lote", async () => {
    const pedidoPasto: PedidoMovimentacaoLote = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { loteId: 100, pastoId: 1100, dataEntrada: DATA },
    };
    const [saida, pasto] = await Promise.all([
      retirar(pedidoRetirada(1, 3, [51])),
      movimentarEEspelharLote(ioPasto(), pedidoPasto, { async mover() {} }),
    ]);
    expect(saida.resultado.ok === true || pasto.ok === true).toBe(true);
    const gravado = await animal(51);
    expect(Number(gravado?.fazendaId)).toBe(10);
    if (gravado?.loteId == null) {
      expect([1000, 1100]).toContain(Number(gravado?.pastoId));
    } else {
      expect(Number(gravado?.loteId)).toBe(100);
      expect(Number(gravado?.pastoId)).toBe(1100);
    }
  });

  it("20. concorrência com a inclusão", async () => {
    const [saida, entrada] = await Promise.all([
      retirar(pedidoRetirada(1, 3, [51])),
      incluir(pedidoInclusao(1, 3, [50])),
    ]);
    expect(saida.resultado.ok).toBe(true);
    expect(entrada.resultado.ok).toBe(true);
    expect((await animal(51))?.loteId).toBeNull();
    expect(Number((await animal(50))?.loteId)).toBe(100);
  });

  it("21. concorrência com a troca de lote", async () => {
    const [saida, troca] = await Promise.all([
      retirar(pedidoRetirada(1, 3, [51])),
      trocar(pedidoTroca(1, 3, { loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA })),
    ]);
    const gravado = await animal(51);
    const linhas = await historico();
    if (troca.resultado.ok) {
      expect(Number(gravado?.loteId)).toBe(110);
      expect(linhas).toHaveLength(1);
      expect(saida.resultado.ok).toBe(false);
    } else {
      expect(saida.resultado.ok).toBe(true);
      expect(gravado?.loteId).toBeNull();
      expect(linhas).toHaveLength(0);
    }
    expect(Number(gravado?.fazendaId)).toBe(10);
  });

  it("22. falha na gravação do histórico", async () => {
    await expect(alocar(pedidoAlocacao(1, 3, { animalIds: [51], loteDestinoId: 110 }), {
      aposHistorico: async () => { throw new Error("historico"); },
    })).rejects.toThrow("historico");
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(await historico()).toHaveLength(0);
  });

  it("23. rollback integral", async () => {
    await expect(retirar(pedidoRetirada(1, 3, [51]), {
      aposOcupacao: async () => { throw new Error("ocupacao"); },
    })).rejects.toThrow("ocupacao");
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(await statusPasto(1000)).toBe("ativo");
  });

  it("24. ausência de duplicidade", async () => {
    await alocar(pedidoAlocacao(1, 3, { animalIds: [51, 51], loteDestinoId: 110 }));
    expect(await historico()).toHaveLength(1);
    const deNovo = await alocar(pedidoAlocacao(1, 3, { animalIds: [51], loteDestinoId: 110 }));
    expect(deNovo.resultado).toMatchObject({ ok: false, mensagem: MSG_NENHUM_ALOCACAO });
    expect(await historico()).toHaveLength(1);
  });

  it("25. preservação dos registros existentes", async () => {
    await pool.query("INSERT INTO animal_lote_movimentacoes (id, userId, animalId, loteOrigemId, loteDestinoId, dataMovimentacao, observacoes) VALUES (9, 1, 51, NULL, 100, '2026-10-01', 'nao apagar')");
    await alocar(pedidoAlocacao(1, 3, { animalIds: [51], loteDestinoId: 110 }));
    const linhas = await historico();
    expect(linhas).toHaveLength(2);
    expect(texto(linhas.find((linha) => Number(linha.id) === 9)?.observacoes)).toBe("nao apagar");
  });

  it("26. funcionamento do espelho local", async () => {
    const ok = await retirar(pedidoRetirada(1, 3, [51]));
    expect(ok.chamadas).toEqual([1]);
    await pool.query("UPDATE animais SET loteId = 100 WHERE id = 51");
    await expect(retirarEEspelharAnimais(io(), pedidoRetirada(1, 3, [51]), {
      async retirar() { throw new Error("espelho fora"); },
    })).resolves.toMatchObject({ ok: true });
    expect((await animal(51))?.loteId).toBeNull();
  });

  it("27. compatibilidade com as telas", async () => {
    const tela = await alocar(pedidoAlocacao(1, 3, {
      animalIds: [51],
      loteDestinoId: 110,
      pastoDestinoId: 1100,
      fazendaDestinoId: 10,
      dataMovimentacao: DATA,
    }));
    expect(tela.resultado).toMatchObject({ ok: true, count: 1, loteDestinoNome: "Lote do mangueiro" });
    const retirada = await retirar(pedidoRetirada(1, 3, [52]));
    expect(retirada.resultado).toMatchObject({ ok: true, count: 1 });
  });

  it("28. administrador principal", async () => {
    const { resultado } = await retirar(pedidoRetirada(1, 3, [51], 100, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(resultado.ok).toBe(true);
    expect((await animal(51))?.loteId).toBeNull();
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
  });

  it("transferência de fazenda concorrente não vira alocação", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const corrida = alocar(pedidoAlocacao(1, 3, { animalIds: [51], loteDestinoId: 110 }), {
      aposIdentidade: async () => {
        avisou();
        await segue;
      },
    });
    await travou;
    await pool.query("UPDATE animais SET fazendaId = 20 WHERE id = 51");
    liberar();
    const { resultado } = await corrida;
    expect(resultado.ok).toBe(false);
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.fazendaId)).toBe(20);
    expect(await historico()).toHaveLength(0);
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
    async baixaAtiva() {
      return null;
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
            (userId, animalId, loteOrigemId, loteDestinoId, pastoOrigemId, pastoDestinoId, fazendaId, dataMovimentacao, usuarioNome, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.userId, row.animalId, row.loteOrigemId, row.loteDestinoId, row.pastoOrigemId,
            row.pastoDestinoId, row.fazendaId, row.dataMovimentacao, row.usuarioNome, row.observacoes,
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
