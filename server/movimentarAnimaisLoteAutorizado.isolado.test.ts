import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  incluirEEspelharAnimais,
  movimentarEEspelharAnimais,
  MSG_ANIMAL_JA_TEM_LOTE,
  MSG_FAZENDAS_DIFERENTES,
  MSG_LOTE_INCLUSAO_AUSENTE,
  MSG_SAIDA_NAO_SUPORTADA,
  type ConsultaAnimaisLote,
  type IoAnimaisLote,
  type PedidoInclusaoAnimais,
  type PedidoTrocaAnimais,
} from "./movimentarAnimaisLoteAutorizado";
import {
  movimentarEEspelharLote,
  type ConsultaMovimentacaoLote,
  type IoMovimentacaoLote,
  type PedidoMovimentacaoLote,
} from "./movimentarLotePastoAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4q-animais-lote";
const PORTA = 3342;
const SENHA = "isolado-h4q";
const BANCO = "fd_h4q";
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

describe.sequential("entrada e troca de animais entre lotes em MySQL isolado", () => {
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

  it("1. principal inclui animal no lote", async () => {
    const { resultado, chamadas } = await incluir(pedidoInclusao(1, 3, [50]));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.count).toBe(1);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(Number((await animal(50))?.pastoId)).toBe(1000);
    expect(chamadas).toEqual([1]);
  });

  it("2. funcionário autorizado inclui animal", async () => {
    const { resultado } = await incluir(pedidoInclusao(2, 1, [50]));
    expect(resultado.ok).toBe(true);
    expect(Number((await historico())[0]?.userId)).toBe(1);
    expect(texto((await historico())[0]?.usuarioNome)).toBe("Funcionario Curral");
  });

  it("3. funcionário sem permissão", async () => {
    const { resultado, chamadas } = await incluir(pedidoInclusao(3, 1, [50]));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect((await animal(50))?.loteId).toBeNull();
    expect(chamadas).toEqual([]);
  });

  it("4. fazenda não concedida", async () => {
    const { resultado } = await incluir(pedidoInclusao(2, 1, [53], 200));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect((await animal(53))?.loteId).toBeNull();
  });

  it("5. animal de outro titular", async () => {
    const { resultado } = await incluir(pedidoInclusao(1, 3, [54]));
    expect(resultado.ok).toBe(false);
    expect(Number((await animal(54))?.loteId)).toBe(400);
    expect(await historico()).toHaveLength(0);
  });

  it("6. lote de outro titular", async () => {
    const { resultado } = await incluir(pedidoInclusao(1, 3, [50], 400));
    expect(resultado).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect((await animal(50))?.loteId).toBeNull();
  });

  it("7. inclusão de animal sem lote anterior", async () => {
    await incluir(pedidoInclusao(1, 3, [50]));
    const linha = (await historico())[0];
    expect(linha?.loteOrigemId).toBeNull();
    expect(Number(linha?.loteDestinoId)).toBe(100);
    expect(Number(linha?.pastoDestinoId)).toBe(1000);
  });

  it("8. inclusão de vários animais", async () => {
    const { resultado } = await incluir(pedidoInclusao(1, 3, [50, 55]));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.count).toBe(2);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(Number((await animal(55))?.loteId)).toBe(100);
    expect(Number((await animal(55))?.fazendaId)).toBe(10);
    expect(await historico()).toHaveLength(2);
  });

  it("9. retirada sem outro lote não é feita por estas rotas", async () => {
    const { resultado } = await incluir(pedidoInclusao(1, 3, [51]));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_JA_TEM_LOTE });
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(await historico()).toHaveLength(0);
    expect(MSG_SAIDA_NAO_SUPORTADA).toContain("não retiram");
  });

  it("10. troca entre dois lotes", async () => {
    const { resultado } = await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.loteDestinoNome).toBe("Lote do mangueiro");
    expect(Number((await animal(51))?.loteId)).toBe(110);
    expect(Number((await animal(51))?.pastoId)).toBe(1100);
  });

  it("11. lote de origem sem pasto", async () => {
    await pool.query("UPDATE animais SET loteId = 120, pastoId = NULL WHERE id = 50");
    await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 120, loteDestinoId: 110, animalIds: [50], dataMovimentacao: DATA,
    }));
    expect(Number((await animal(50))?.loteId)).toBe(110);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
    expect((await historico())[0]?.pastoOrigemId).toBeNull();
  });

  it("12. lote de destino sem pasto", async () => {
    await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 120, animalIds: [51], dataMovimentacao: DATA,
    }));
    expect(Number((await animal(51))?.loteId)).toBe(120);
    expect((await animal(51))?.pastoId).toBeNull();
    expect(await statusPasto(1000)).toBe("ativo");
  });

  it("13. lote de destino com pasto", async () => {
    await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }));
    expect(Number((await animal(51))?.pastoId)).toBe(1100);
    expect(await statusPasto(1100)).toBe("ativo");
    expect(await statusPasto(1000)).toBe("ativo");
  });

  it("14. lotes de fazendas diferentes", async () => {
    const { resultado } = await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 200, animalIds: [51], dataMovimentacao: DATA,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "fazendas_diferentes", mensagem: MSG_FAZENDAS_DIFERENTES });
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(await historico()).toHaveLength(0);
  });

  it("15. animais ativos e inativos", async () => {
    const entrada = await incluir(pedidoInclusao(1, 3, [50, 52]));
    expect(entrada.resultado.ok).toBe(true);
    if (entrada.resultado.ok) expect(entrada.resultado.count).toBe(1);
    expect(Number((await animal(52))?.loteId)).toBe(100);
    const troca = await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51, 52], dataMovimentacao: DATA,
    }));
    expect(troca.resultado.ok).toBe(true);
    if (troca.resultado.ok) expect(troca.resultado.count).toBe(2);
    expect(Number((await animal(52))?.loteId)).toBe(110);
    expect(Number((await animal(52))?.pastoId)).toBe(1100);
    expect(await statusPasto(1100)).toBe("ativo");
  });

  it("16. tentativa de movimentação duplicada", async () => {
    await incluir(pedidoInclusao(1, 3, [50, 50]));
    expect(await historico()).toHaveLength(1);
    const deNovo = await incluir(pedidoInclusao(1, 3, [50]));
    expect(deNovo.resultado.ok).toBe(false);
    expect(await historico()).toHaveLength(1);
  });

  it("17. histórico de entrada", async () => {
    await incluir(pedidoInclusao(1, 3, [50]));
    const linha = (await historico())[0];
    expect(Number(linha?.userId)).toBe(1);
    expect(Number(linha?.animalId)).toBe(50);
    expect(linha?.loteOrigemId).toBeNull();
    expect(Number(linha?.loteDestinoId)).toBe(100);
    expect(linha?.pastoOrigemId).toBeNull();
    expect(Number(linha?.pastoDestinoId)).toBe(1000);
    expect(texto(linha?.usuarioNome)).toBe("Administrador da conta");
  });

  it("18. histórico de saída do lote de origem", async () => {
    await pool.query("INSERT INTO animal_lote_movimentacoes (userId, animalId, loteOrigemId, loteDestinoId, dataMovimentacao, observacoes) VALUES (1, 51, NULL, 100, '2026-10-01', 'entrada antiga')");
    await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA, observacoes: "curral",
    }));
    const linhas = await historico();
    expect(linhas).toHaveLength(2);
    expect(texto(linhas[0]?.observacoes)).toBe("entrada antiga");
    expect(Number(linhas[1]?.loteOrigemId)).toBe(100);
    expect(Number(linhas[1]?.loteDestinoId)).toBe(110);
    expect(Number(linhas[1]?.pastoOrigemId)).toBe(1000);
    expect(Number(linhas[1]?.pastoDestinoId)).toBe(1100);
    expect(texto(linhas[1]?.observacoes)).toBe("curral");
  });

  it("19. preservação da fazenda", async () => {
    await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }));
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    await incluir(pedidoInclusao(1, 3, [55]));
    expect(Number((await animal(55))?.fazendaId)).toBe(10);
    expect(Number((await animal(53))?.fazendaId)).toBe(20);
  });

  it("20. preservação dos registros anteriores", async () => {
    await pool.query("INSERT INTO animal_lote_movimentacoes (id, userId, animalId, loteOrigemId, loteDestinoId, dataMovimentacao, observacoes) VALUES (7, 1, 51, NULL, 100, '2026-10-01', 'nao apagar')");
    await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }));
    const linhas = await historico();
    expect(texto(linhas.find((linha) => Number(linha.id) === 7)?.observacoes)).toBe("nao apagar");
    expect(linhas).toHaveLength(2);
  });

  it("21. falha durante atualização dos animais", async () => {
    await expect(incluir(pedidoInclusao(1, 3, [50]), {
      aposAnimais: async () => { throw new Error("animais"); },
    })).rejects.toThrow("animais");
    expect((await animal(50))?.loteId).toBeNull();
    expect(await historico()).toHaveLength(0);
  });

  it("22. falha durante gravação do histórico", async () => {
    await expect(trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }), {
      aposHistorico: async () => { throw new Error("historico"); },
    })).rejects.toThrow("historico");
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(await historico()).toHaveLength(0);
  });

  it("23. rollback completo", async () => {
    await expect(trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }), {
      aposOcupacao: async () => { throw new Error("ocupacao"); },
    })).rejects.toThrow("ocupacao");
    expect(Number((await animal(51))?.loteId)).toBe(100);
    expect(Number((await animal(51))?.pastoId)).toBe(1000);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
    expect(await historico()).toHaveLength(0);
    expect(await statusPasto(1000)).toBe("ativo");
    expect(await statusPasto(1100)).toBe("descanso");
  });

  it("24. duas movimentações simultâneas", async () => {
    const [uma, outra] = await Promise.all([
      incluir(pedidoInclusao(1, 3, [50])),
      incluir(pedidoInclusao(1, 3, [55])),
    ]);
    expect(uma.resultado.ok).toBe(true);
    expect(outra.resultado.ok).toBe(true);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(Number((await animal(55))?.loteId)).toBe(100);
    expect(await historico()).toHaveLength(2);
  });

  it("25. movimentação simultânea do lote para outro pasto", async () => {
    const pedidoPasto: PedidoMovimentacaoLote = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { loteId: 100, pastoId: 1100, dataEntrada: DATA },
    };
    const [entrada, pasto] = await Promise.all([
      incluir(pedidoInclusao(1, 3, [50])),
      movimentarEEspelharLote(ioPasto(), pedidoPasto, { async mover() {} }),
    ]);
    expect(entrada.resultado.ok).toBe(true);
    expect(pasto.ok).toBe(true);
    const [lote] = await pool.query<RowDataPacket[]>("SELECT pastoAtualId FROM lotes WHERE id = 100");
    expect(Number(lote[0]?.pastoAtualId)).toBe(1100);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(Number((await animal(50))?.pastoId)).toBe(1100);
    expect(await historico()).toHaveLength(1);
  });

  it("26. movimentação simultânea do mesmo animal", async () => {
    const [ida, volta] = await Promise.all([
      trocar(pedidoTroca(1, 3, { loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA })),
      trocar(pedidoTroca(1, 3, { loteOrigemId: 100, loteDestinoId: 120, animalIds: [51], dataMovimentacao: DATA })),
    ]);
    const sucessos = [ida, volta].filter((item) => item.resultado.ok);
    expect(sucessos).toHaveLength(1);
    const loteId = Number((await animal(51))?.loteId);
    expect([110, 120]).toContain(loteId);
    expect(await historico()).toHaveLength(1);
    expect(Number((await historico())[0]?.loteDestinoId)).toBe(loteId);
    expect(Number((await animal(51))?.fazendaId)).toBe(10);
  });

  it("27. concorrência com edição cadastral", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const inclusao = incluir(pedidoInclusao(1, 3, [50]), {
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
      await externa.query("SELECT id FROM animais WHERE id = 50 FOR UPDATE");
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
    const { resultado } = await inclusao;
    expect(deadlock).toBe(true);
    expect(resultado.ok).toBe(true);
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(await historico()).toHaveLength(1);
  });

  it("28. espelho local após confirmação do MySQL", async () => {
    const falhou = await incluir(pedidoInclusao(1, 3, [50]), {});
    expect(falhou.chamadas).toEqual([1]);
    await pool.query("UPDATE animais SET loteId = NULL, pastoId = NULL WHERE id = 50");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await expect(incluirEEspelharAnimais(io(), pedidoInclusao(1, 3, [50]), {
      async incluir() { throw new Error("espelho fora"); },
    })).resolves.toMatchObject({ ok: true });
    expect(Number((await animal(50))?.loteId)).toBe(100);
    expect(await historico()).toHaveLength(1);
  });

  it("29. compatibilidade com as telas", async () => {
    const telaIncluir = await incluir(pedidoInclusao(1, 3, [50]));
    expect(telaIncluir.resultado).toMatchObject({ ok: true, count: 1 });
    const telaLote = await trocar(pedidoTroca(1, 3, {
      loteOrigemId: 100, loteDestinoId: 110, animalIds: [51], dataMovimentacao: DATA,
    }));
    expect(telaLote.resultado).toMatchObject({ ok: true, count: 1, loteDestinoNome: "Lote do mangueiro" });
    const manejo = await trocar(pedidoTroca(1, 3, {
      loteDestinoId: 120, animalIds: [50], dataMovimentacao: DATA,
    }));
    expect(manejo.resultado.ok).toBe(true);
    expect(Number((await animal(50))?.loteId)).toBe(120);
    expect(MSG_LOTE_INCLUSAO_AUSENTE.endsWith(".")).toBe(true);
  });

  it("30. administrador principal", async () => {
    const { resultado } = await incluir(pedidoInclusao(1, 3, [50], 100, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(resultado.ok).toBe(true);
    expect(Number((await historico())[0]?.userId)).toBe(1);
    expect(Number((await animal(50))?.fazendaId)).toBe(10);
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
