import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  MSG_ANIMAL_OUTRA_FAZENDA,
  MSG_DATA_FUTURA,
  MSG_LOTE_MUDOU,
  MSG_PASTO_AUSENTE,
  MSG_PASTO_OUTRA_FAZENDA,
  diasEntrePasto,
  hojeMovimentacaoLote,
  movimentarEEspelharLote,
  type ConsultaMovimentacaoLote,
  type EspelhoMovimentacao,
  type IoMovimentacaoLote,
  type MovimentacaoLoteInput,
  type PedidoMovimentacaoLote,
} from "./movimentarLotePastoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4o-mover-lote";
const PORTA = 3340;
const SENHA = "isolado-h4o";
const BANCO = "fd_h4o";
const DATA = "2026-11-10";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL,
  openId varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  email varchar(255) NULL,
  role enum('admin','user') NOT NULL,
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL,
  situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE fazendas (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(200) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pastos (
  id int NOT NULL,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  nome varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ativo',
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(100) NOT NULL,
  localizacao varchar(200) NULL,
  fazendaId int NULL,
  pastoAtualId int NULL,
  dataEntradaPasto date NULL,
  ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT lotes_pasto_fk FOREIGN KEY (pastoAtualId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL,
  userId int NOT NULL,
  loteId int NULL,
  fazendaId int NULL,
  pastoId int NULL,
  status varchar(20) NOT NULL,
  brinco varchar(50) NULL,
  PRIMARY KEY (id),
  CONSTRAINT animais_pasto_fk FOREIGN KEY (pastoId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE lote_pasto_movimentacoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  loteId int NOT NULL,
  pastoOrigemId int NULL,
  pastoDestinoId int NULL,
  dataEntrada date NOT NULL,
  dataSaida date NULL,
  diasNoPasto int NULL,
  qtdAnimais int NULL,
  observacoes varchar(200) NULL,
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

function texto(valor: unknown): string | null {
  return valor == null ? null : String(valor);
}

function pedido(
  executorId: number,
  sessionVersion: number,
  input: MovimentacaoLoteInput,
  extras: Partial<PedidoMovimentacaoLote> = {},
): PedidoMovimentacaoLote {
  return { executorId, sessionVersionDaSessao: sessionVersion, input, ...extras };
}

describe.sequential("lotes.moveToPasto autorizado em MySQL isolado", () => {
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
    const [banco] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    expect(banco[0]?.nome).toBe(BANCO);
    await conn.query(ESQUEMA);
    await conn.query(`
      INSERT INTO users (id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion) VALUES
        (1, 'principal-isolado', 'Administrador da conta', 'principal@isolado.local', 'admin', 'principal', 1, 'ativo', 3),
        (2, 'funcionario-isolado', 'Funcionario Curral', 'curral@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (3, 'sem-permissao-isolado', 'Sem Permissao', 'sem@isolado.local', 'user', 'comum', 1, 'ativo', 1),
        (4, 'outro-titular-isolado', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1)
    `);
    await conn.query(`
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia')
    `);
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
      dateStrings: true, connectionLimit: 6,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, localizacao, fazendaId, pastoAtualId, dataEntradaPasto, ativo) VALUES
        (100, 1, 'Lote da sede', 'Curral', 10, 1000, '2026-11-01', 1),
        (200, 1, 'Lote do retiro', 'Retiro', 20, 2000, '2026-11-01', 1),
        (400, 4, 'Lote alheio', 'Alheio', 40, 4000, '2026-11-01', 1)
    `);
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (50, 1, 100, 10, 1000, 'ativo', 'BR-50')
    `);
    await pool.query(`
      INSERT INTO lote_pasto_movimentacoes
        (id, userId, loteId, pastoOrigemId, pastoDestinoId, dataEntrada, dataSaida, qtdAnimais)
      VALUES (1, 1, 100, NULL, 1000, '2026-11-01', NULL, 1)
    `);
    await pool.query("UPDATE pastos SET status = 'ativo' WHERE id = 1000");
    await pool.query("UPDATE pastos SET status = 'descanso' WHERE id IN (1100, 1200)");
  });

  function io(ganchos: Partial<IoMovimentacaoLote> = {}): IoMovimentacaoLote {
    return {
      ...ganchos,
      async emTransacao(fn) {
        afirmarBancoDescartavel(alvo());
        const conn = await pool.getConnection();
        try {
          const [banco] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
          if (String(banco[0]?.nome) !== BANCO) throw new Error("Conexão recusada: banco inesperado.");
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

  async function mover(corpo: PedidoMovimentacaoLote, ganchos: Partial<IoMovimentacaoLote> = {}) {
    const chamadas: Array<{ userId: number; pastoId: number | null }> = [];
    const espelho: EspelhoMovimentacao = {
      async mover(userId, dados) {
        chamadas.push({ userId, pastoId: dados.pastoId });
      },
    };
    const resultado = await movimentarEEspelharLote(io(ganchos), corpo, espelho);
    return { resultado, chamadas };
  }

  async function lote(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM lotes WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function historico() {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM lote_pasto_movimentacoes ORDER BY id",
    );
    return linhas;
  }

  it("1. principal movimenta o lote da própria fazenda", async () => {
    const { resultado, chamadas } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1100);
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(chamadas).toEqual([{ userId: 1, pastoId: 1100 }]);
  });

  it("2. funcionário autorizado movimenta o lote da fazenda concedida", async () => {
    const { resultado, chamadas } = await mover(pedido(2, 1, {
      loteId: 100, pastoId: 1100, dataEntrada: DATA,
    }, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: ["lotes.criar"],
      fazendasInformadasPeloCliente: [20],
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(2);
    const linhas = await historico();
    const aberta = linhas.find((linha) => linha.dataSaida == null);
    expect(Number(aberta?.userId)).toBe(1);
    expect(Number(aberta?.pastoDestinoId)).toBe(1100);
    expect(chamadas).toEqual([{ userId: 1, pastoId: 1100 }]);
  });

  it("3. funcionário sem permissão é recusado", async () => {
    const { resultado, chamadas } = await mover(pedido(3, 1, {
      loteId: 100, pastoId: 1100, dataEntrada: DATA,
    }, { permissoesInformadasPeloCliente: ["lotes.editar"] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(chamadas).toEqual([]);
  });

  it("4. lote de fazenda não concedida é recusado", async () => {
    const { resultado } = await mover(pedido(2, 1, { loteId: 200, pastoId: 2000, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(Number((await lote(200))?.pastoAtualId)).toBe(2000);
  });

  it("5. lote de outro titular não é movimentado", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 400, pastoId: 4000, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    expect(texto((await lote(400))?.nome)).toBe("Lote alheio");
  });

  it("6. pasto de outro titular é recusado", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 4000, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_outro_titular" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_PASTO_AUSENTE);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
  });

  it("7. pasto de outra fazenda é recusado e a fazenda do lote fica", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 2000, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_incompativel" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_PASTO_OUTRA_FAZENDA);
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
  });

  it("8. pasto inexistente é recusado", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 99999, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_inexistente", mensagem: MSG_PASTO_AUSENTE });
  });

  it("9. lote inexistente é recusado", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 99999, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "nao_encontrado" });
  });

  it("10. lote sem animais muda de pasto e o histórico registra zero", async () => {
    await pool.query("DELETE FROM animais");
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1100);
    const aberta = (await historico()).find((linha) => linha.dataSaida == null);
    expect(Number(aberta?.qtdAnimais)).toBe(0);
  });

  it("11. lote com um animal leva esse animal", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    const aberta = (await historico()).find((linha) => linha.dataSaida == null);
    expect(Number(aberta?.qtdAnimais)).toBe(1);
  });

  it("12. lote com vários animais leva todos os ativos", async () => {
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (51, 1, 100, 10, 1000, 'ativo', 'BR-51'),
        (52, 1, 100, 10, 1000, 'ativo', 'BR-52')
    `);
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    for (const id of [50, 51, 52]) {
      expect(Number((await animal(id))?.pastoId)).toBe(1100);
      expect(Number((await animal(id))?.fazendaId)).toBe(10);
    }
    const aberta = (await historico()).find((linha) => linha.dataSaida == null);
    expect(Number(aberta?.qtdAnimais)).toBe(3);
  });

  it("13. animal inativo não acompanha o lote", async () => {
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (53, 1, 100, 10, 1000, 'vendido', 'BR-53')
    `);
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
    expect(Number((await animal(53))?.pastoId)).toBe(1000);
    expect(texto((await animal(53))?.status)).toBe("vendido");
    expect(Number((await animal(53))?.loteId)).toBe(100);
  });

  it("14. o mesmo pasto não gera outra estadia", async () => {
    const { resultado, chamadas } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1000, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: true, movimentou: false });
    const linhas = await historico();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.dataSaida).toBeNull();
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(chamadas).toEqual([]);
  });

  it("15. o histórico fecha a origem e abre o destino", async () => {
    const { resultado } = await mover(pedido(1, 3, {
      loteId: 100, pastoId: 1100, dataEntrada: DATA, observacoes: "troca de piquete",
    }));
    expect(resultado.ok).toBe(true);
    const linhas = await historico();
    const fechada = linhas.find((linha) => Number(linha.id) === 1);
    const aberta = linhas.find((linha) => linha.dataSaida == null);
    expect(texto(fechada?.dataSaida)).toBe(DATA);
    expect(Number(fechada?.diasNoPasto)).toBe(diasEntrePasto("2026-11-01", DATA));
    expect(Number(aberta?.pastoOrigemId)).toBe(1000);
    expect(Number(aberta?.pastoDestinoId)).toBe(1100);
    expect(texto(aberta?.dataEntrada)).toBe(DATA);
    expect(texto(aberta?.observacoes)).toBe("troca de piquete");
    expect(Number(aberta?.userId)).toBe(1);
    expect(Number(aberta?.loteId)).toBe(100);
  });

  it("16. lote e animais ativos ficam no mesmo pasto e na mesma fazenda", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    const gravado = await lote(100);
    expect(Number(gravado?.pastoAtualId)).toBe(1100);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(texto(gravado?.dataEntradaPasto)).toBe(DATA);
    expect(texto(gravado?.localizacao)).toBe("Mangueiro");
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
    const [pastos] = await pool.query<RowDataPacket[]>("SELECT id, status FROM pastos WHERE id IN (1000, 1100) ORDER BY id");
    expect(texto(pastos[0]?.status)).toBe("descanso");
    expect(texto(pastos[1]?.status)).toBe("ativo");
  });

  it("17. falha ao atualizar o lote desfaz o histórico", async () => {
    await expect(mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }), {
      async aposLote() {
        throw new Error("falha no lote");
      },
    })).rejects.toThrow("falha no lote");
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    const linhas = await historico();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.dataSaida).toBeNull();
  });

  it("18. falha ao atualizar os animais desfaz o lote", async () => {
    await expect(mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }), {
      async aposAnimais() {
        throw new Error("falha nos animais");
      },
    })).rejects.toThrow("falha nos animais");
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(Number((await animal(50))?.pastoId)).toBe(1000);
  });

  it("19. falha ao gravar o histórico não muda lote nem animal", async () => {
    await expect(mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }), {
      async aposHistorico() {
        throw new Error("falha no historico");
      },
    })).rejects.toThrow("falha no historico");
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(Number((await animal(50))?.pastoId)).toBe(1000);
    expect((await historico())).toHaveLength(1);
  });

  it("20. o rollback devolve pasto, animais, histórico e status", async () => {
    const chamadas: number[] = [];
    await expect(movimentarEEspelharLote(io({
      async aposAnimais() {
        throw new Error("falha no meio");
      },
    }), pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }), {
      async mover(userId) {
        chamadas.push(userId);
      },
    })).rejects.toThrow("falha no meio");
    expect(chamadas).toEqual([]);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(texto((await lote(100))?.localizacao)).toBe("Curral");
    expect(Number((await animal(50))?.pastoId)).toBe(1000);
    expect((await historico())[0]?.dataSaida).toBeNull();
    const [destino] = await pool.query<RowDataPacket[]>("SELECT status FROM pastos WHERE id = 1100");
    expect(texto(destino[0]?.status)).toBe("descanso");
  });

  it("21. duas movimentações do mesmo lote não separam os animais", async () => {
    const [primeira, segunda] = await Promise.all([
      mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA })),
      mover(pedido(1, 3, { loteId: 100, pastoId: 1200, dataEntrada: DATA })),
    ]);
    expect(primeira.resultado.ok).toBe(true);
    expect(segunda.resultado.ok).toBe(true);
    const gravado = await lote(100);
    const pastoFinal = Number(gravado?.pastoAtualId);
    expect([1100, 1200]).toContain(pastoFinal);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number((await animal(50))?.pastoId)).toBe(pastoFinal);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
    const abertas = (await historico()).filter((linha) => linha.dataSaida == null);
    expect(abertas).toHaveLength(1);
    expect(Number(abertas[0]?.pastoDestinoId)).toBe(pastoFinal);
  });

  it("22. inclusão concorrente ou entra junto ou desfaz a movimentação", async () => {
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (51, 1, NULL, 10, 1000, 'ativo', 'BR-51')
    `);
    await expect(mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }), {
      async aposTravarAnimais() {
        await pool.query("UPDATE animais SET loteId = 100 WHERE id = 51");
      },
    })).rejects.toThrow(MSG_LOTE_MUDOU);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(Number((await animal(50))?.pastoId)).toBe(1000);
    expect(Number((await animal(51))?.loteId)).toBe(100);

    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
    expect(Number((await animal(51))?.pastoId)).toBe(1100);
  });

  it("23. animal que saiu do lote antes da trava não é arrastado", async () => {
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (51, 1, 100, 10, 1000, 'ativo', 'BR-51')
    `);
    const trava = await pool.getConnection();
    try {
      await trava.beginTransaction();
      await trava.query("SELECT id FROM lotes WHERE id = 100 FOR UPDATE");
      const pendente = mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
      await new Promise((resolver) => setTimeout(resolver, 400));
      await trava.query("UPDATE animais SET loteId = 200 WHERE id = 50");
      await trava.commit();
      const { resultado } = await pendente;
      expect(resultado.ok).toBe(true);
    } finally {
      await trava.release();
    }
    expect(Number((await animal(50))?.loteId)).toBe(200);
    expect(Number((await animal(50))?.pastoId)).toBe(1000);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
    expect(Number((await animal(51))?.pastoId)).toBe(1100);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1100);
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
  });

  it("24. a fazenda do lote e dos animais permanece", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
    expect(Number((await lote(200))?.fazendaId)).toBe(20);
  });

  it("25. o histórico anterior fechado permanece", async () => {
    await pool.query(`
      INSERT INTO lote_pasto_movimentacoes
        (id, userId, loteId, pastoOrigemId, pastoDestinoId, dataEntrada, dataSaida, diasNoPasto, qtdAnimais, observacoes)
      VALUES (2, 1, 100, NULL, 1200, '2026-10-01', '2026-10-20', 19, 1, 'estadia antiga')
    `);
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    const antiga = (await historico()).find((linha) => Number(linha.id) === 2);
    expect(texto(antiga?.observacoes)).toBe("estadia antiga");
    expect(texto(antiga?.dataSaida)).toBe("2026-10-20");
    expect(Number(antiga?.pastoDestinoId)).toBe(1200);
  });

  it("26. o espelho só corre depois do MySQL e a falha dele não desfaz o pasto", async () => {
    const recusa = await mover(pedido(3, 1, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(recusa.chamadas).toEqual([]);
    await expect(movimentarEEspelharLote(
      io(),
      pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }),
      { async mover() { throw new Error("espelho fora"); } },
    )).resolves.toMatchObject({ ok: true, movimentou: true });
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1100);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
  });

  it("27. o pedido da tela, só com lote e pasto, continua válido", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100 }));
    expect(resultado.ok).toBe(true);
    expect(texto((await lote(100))?.dataEntradaPasto)).toBe(hojeMovimentacaoLote());
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
  });

  it("28. administrador principal movimenta sem vínculo e sem permissão gravada", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1200, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.executorUserId).toBe(1);
    expect(resultado.userId).toBe(1);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1200);
    expect(Number((await animal(50))?.pastoId)).toBe(1200);
  });

  it("animal ativo de outra fazenda impede a movimentação", async () => {
    await pool.query("UPDATE animais SET fazendaId = 20 WHERE id = 50");
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado).toMatchObject({ ok: false, motivo: "animal_outra_fazenda" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_ANIMAL_OUTRA_FAZENDA);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(Number((await animal(50))?.fazendaId)).toBe(20);
    expect((await historico())[0]?.dataSaida).toBeNull();
  });

  it("lote ainda sem pasto recebe a primeira estadia sem apagar a fazenda", async () => {
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("UPDATE lotes SET pastoAtualId = NULL, dataEntradaPasto = NULL WHERE id = 100");
    await pool.query("UPDATE animais SET pastoId = NULL WHERE id = 50");
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: 1100, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    const linhas = await historico();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.pastoOrigemId).toBeNull();
    expect(Number(linhas[0]?.pastoDestinoId)).toBe(1100);
    expect(linhas[0]?.dataSaida).toBeNull();
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
  });

  it("sair do pasto tira só o pasto e conserva a fazenda", async () => {
    const { resultado } = await mover(pedido(1, 3, { loteId: 100, pastoId: null, dataEntrada: DATA }));
    expect(resultado.ok).toBe(true);
    const gravado = await lote(100);
    expect(gravado?.pastoAtualId).toBeNull();
    expect(gravado?.dataEntradaPasto).toBeNull();
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(texto(gravado?.localizacao)).toBe("Curral");
    expect((await animal(50))?.pastoId).toBeNull();
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
    const abertas = (await historico()).filter((linha) => linha.dataSaida == null);
    expect(abertas).toHaveLength(0);
  });

  it("data futura continua recusada", async () => {
    const { resultado, chamadas } = await mover(pedido(1, 3, {
      loteId: 100, pastoId: 1100, dataEntrada: "2099-01-01",
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "data_futura", mensagem: MSG_DATA_FUTURA });
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(chamadas).toEqual([]);
  });
});

function consultas(conn: mysql.PoolConnection): ConsultaMovimentacaoLote {
  return {
    async usuario(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE id = ? FOR UPDATE`,
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      const usuario: LinhaUsuarioCadastro = {
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
      return usuario;
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
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE userId = ?",
        [titularUserId],
      );
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
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, pastoAtualId, dataEntradaPasto
         FROM lotes WHERE id = ? FOR UPDATE`,
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
         WHERE userId = ? AND loteId = ? AND status = 'ativo'
         ORDER BY id FOR UPDATE`,
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
         WHERE loteId = ? AND pastoDestinoId = ? AND dataSaida IS NULL
         ORDER BY id FOR UPDATE`,
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
        [
          row.userId, row.loteId, row.pastoOrigemId, row.pastoDestinoId, row.dataEntrada,
          row.dataSaida ?? null, row.diasNoPasto ?? null, row.qtdAnimais, row.observacoes ?? null,
        ],
      );
    },
    async atualizarLote(id, titularUserId, patch) {
      const permitidas = new Set(["pastoAtualId", "dataEntradaPasto", "fazendaId", "localizacao"]);
      await gravar(conn, "lotes", permitidas, patch, id, titularUserId);
    },
    async atualizarAnimais(ids, titularUserId, patch) {
      if (ids.length === 0) return;
      const permitidas = new Set(["pastoId", "fazendaId"]);
      const pares = Object.entries(patch);
      for (const [coluna] of pares) {
        if (!permitidas.has(coluna)) throw new Error(`Coluna recusada: ${coluna}`);
      }
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      const marcas = ids.map(() => "?").join(", ");
      await conn.query(
        `UPDATE animais SET ${atribuicao} WHERE userId = ? AND status = 'ativo' AND id IN (${marcas})`,
        [...pares.map(([, valor]) => valor), titularUserId, ...ids],
      );
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
      const status = ocupa ? "ativo" : "descanso";
      await conn.query("UPDATE pastos SET status = ? WHERE id = ? AND userId = ?", [status, pastoId, titularUserId]);
    },
    async marcarPastoAtivo(pastoId, titularUserId) {
      await conn.query("UPDATE pastos SET status = 'ativo' WHERE id = ? AND userId = ?", [pastoId, titularUserId]);
    },
  };
}

async function gravar(
  conn: mysql.PoolConnection,
  tabela: string,
  permitidas: Set<string>,
  patch: Record<string, unknown>,
  id: number,
  titularUserId: number,
) {
  const pares = Object.entries(patch);
  if (pares.length === 0) return;
  for (const [coluna] of pares) {
    if (!permitidas.has(coluna)) throw new Error(`Coluna recusada: ${coluna}`);
  }
  const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
  await conn.query(
    `UPDATE \`${tabela}\` SET ${atribuicao} WHERE id = ? AND userId = ?`,
    [...pares.map(([, valor]) => valor), id, titularUserId],
  );
}
