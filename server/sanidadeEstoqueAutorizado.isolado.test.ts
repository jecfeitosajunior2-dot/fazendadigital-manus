import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MSG_SAUDE_ESTORNO_DUPLO } from "../shared/saudeEstoque";
import {
  baixarEEspelharAnimal,
  type ConsultaBaixaAnimal,
  type IoBaixaAnimal,
  type PedidoBaixaAnimal,
} from "./baixarAnimalAutorizado";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import type { ConsultaAnimaisLote, IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";
import {
  pesarEEspelharAnimal,
  type ConsultaPesagemAnimal,
  type IoPesagemAnimal,
  type PedidoPesagem,
} from "./pesarAnimalAutorizado";
import {
  MSG_ESTOQUE_INSUFICIENTE,
  MSG_PRODUTO_OUTRA_FAZENDA,
  estornarSanidadeAutorizado,
  lancarSanidadeAutorizado,
  type ConsultaSanidade,
  type EstoqueSanidadeLinha,
  type IoSanidade,
  type PedidoEstornoSanidade,
  type PedidoSanidade,
} from "./sanidadeEstoqueAutorizado";
import {
  transferirEEspelharAnimalFazenda,
  type PedidoTransferenciaFazenda,
} from "./transferirAnimalFazendaAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4x-sanidade";
const PORTA = 3349;
const SENHA = "isolado-h4x";
const BANCO = "fd_h4x";
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
  dataNascimento date NULL, pesoAtual decimal(8,2) NULL, categoria varchar(50) NULL,
  sexo varchar(20) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque (
  id int NOT NULL, fazenda_id int NULL, nome varchar(100) NOT NULL,
  categoria varchar(50) NULL, unidade varchar(20) NULL, quantidade decimal(12,2) NULL,
  valor_unitario decimal(18,6) NULL, valor_total_estoque decimal(14,2) NULL,
  capital_inicializado_em timestamp NULL, situacao varchar(20) NULL,
  embalagens text NULL, controlar_saldo tinyint(1) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE estoque_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, grupo_id varchar(40) NULL, estoque_id int NOT NULL,
  fazenda_id int NULL, user_id int NULL, registrado_por varchar(150) NULL,
  tipo varchar(40) NULL, manejo varchar(150) NULL, data_movimentacao date NOT NULL,
  quantidade decimal(12,2) NOT NULL, destino varchar(150) NULL, valor decimal(12,2) NULL,
  valor_estoque_movimentado decimal(14,2) NULL, observacoes text NULL,
  status varchar(20) NULL, original_grupo_id varchar(40) NULL, motivo_estorno varchar(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE saude_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  tipo varchar(50) NOT NULL, descricao text NULL, medicamento varchar(200) NULL,
  dosagem varchar(100) NULL, viaAplicacao varchar(80) NULL, estoqueId int NULL,
  quantidadeConsumo decimal(12,4) NULL, valorUnitario decimal(10,2) NULL,
  veterinario varchar(200) NULL, custo decimal(10,2) NULL, dataRegistro date NOT NULL,
  proximaData date NULL, observacoes text NULL, estoqueMovimentacaoId int NULL,
  status varchar(20) NULL, estornadoEm timestamp NULL, motivoEstorno text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, observacoes text NULL,
  compraRecebimentoId int NULL, PRIMARY KEY (id)
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

describe.sequential("sanidade integrada ao estoque em MySQL isolado", () => {
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
    await conn.query(`
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (3, 10, 1), (5, 20, 1)
    `);
    await conn.query(`
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'saude.criar', 1), (2, 1, 'saude.inativar', 1),
        (3, 1, 'saude.visualizar', 1),
        (5, 1, 'saude.criar', 1), (5, 1, 'saude.inativar', 1)
    `);
    await conn.query(`
      INSERT INTO pastos (id, userId, fazendaId, nome, status) VALUES
        (1000, 1, 10, 'Curral', 'ativo'), (2000, 1, 20, 'Retiro', 'ativo'), (4000, 4, 40, 'Alheio', 'ativo')
    `);
    await conn.query(`
      INSERT INTO estoque (id, fazenda_id, nome, categoria, unidade, quantidade, valor_unitario, situacao, controlar_saldo) VALUES
        (500, 10, 'Ivomec', 'Farmácia', 'ml', 10.00, 5.000000, 'ativo', 1),
        (501, 20, 'Ivomec Retiro', 'Farmácia', 'ml', 10.00, 5.000000, 'ativo', 1),
        (502, 10, 'Pouca Dose', 'Farmácia', 'ml', 1.00, 5.000000, 'ativo', 1),
        (503, 10, 'Vencido', 'Farmácia', 'ml', 10.00, 5.000000, 'inativo', 1),
        (504, 10, 'Racao', 'Nutrição', 'kg', 10.00, 5.000000, 'ativo', 1),
        (506, 10, 'Vacina', 'Farmácia', 'ml', 10.00, 4.000000, 'ativo', 1)
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
    await pool.query("DELETE FROM saude_registros");
    await pool.query("DELETE FROM estoque_movimentacoes");
    await pool.query("DELETE FROM pesagens");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query("UPDATE estoque SET quantidade = 10.00 WHERE id IN (500, 501, 503, 504, 506)");
    await pool.query("UPDATE estoque SET quantidade = 1.00 WHERE id = 502");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, ativo) VALUES
        (100, 1, 'Lote da sede', 10, 1000, 1),
        (200, 1, 'Lote do retiro', 20, 2000, 1),
        (400, 4, 'Lote alheio', 40, 4000, 1)
    `);
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco, categoria, sexo, pesoAtual) VALUES
        (70, 1, 100, 10, 1000, 'ativo', 'BR-70', 'Boi', 'macho', 420),
        (71, 1, 100, 10, 1000, 'ativo', 'BR-71', 'Vaca', 'femea', 430),
        (72, 1, 100, 10, 1000, 'vendido', 'BR-72', 'Boi', 'macho', 400),
        (73, 4, 400, 40, 4000, 'ativo', 'BR-73', 'Boi', 'macho', 390),
        (74, 1, 100, 10, 1000, 'ativo', 'BR-74', 'Boi', 'macho', 410),
        (75, 1, 100, 10, 1000, 'ativo', 'BR-75', 'Vaca', 'femea', 440),
        (76, 1, 100, 10, 1000, 'ativo', 'BR-76', 'Boi', 'macho', 415),
        (77, 1, 100, 10, 1000, 'ativo', 'BR-77', 'Boi', 'macho', 405),
        (78, 1, 100, 10, 1000, 'ativo', 'BR-78', 'Vaca', 'femea', 435),
        (81, 1, 100, 10, 1000, 'vendido', 'BR-81', 'Vaca', 'femea', 420)
    `);
    await pool.query(`
      INSERT INTO animal_baixas (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, vendaId, status) VALUES
        (1, 72, 10, 'venda', '2026-11-01', 'Venda', 'caixa', 1, 'ativa'),
        (1, 81, 10, 'venda', '2026-11-10', 'Venda', 'caixa', 2, 'ativa')
    `);
    await pool.query(`
      INSERT INTO saude_registros (userId, animalId, tipo, dataRegistro, status, medicamento, proximaData)
      VALUES (1, 77, 'Vacina', '2026-10-01', 'ativo', 'Antiga', '2026-10-15')
    `);
  });

  function io(ganchos: Partial<IoSanidade> = {}): IoSanidade {
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

  function pedido(executorId: number, sessionVersion: number, extra: Partial<PedidoSanidade["input"]> = {}, extras: Partial<PedidoSanidade> = {}): PedidoSanidade {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 1 ? "Administrador da conta" : "Funcionario Curral",
      input: {
        animalId: 70,
        fazendaId: 10,
        tipo: "Vermífugo",
        dataRegistro: DATA,
        estoqueId: 500,
        doseValor: "2",
        doseUnidade: "mL",
        observacoes: "curral",
        proximaData: "2026-12-01",
        ...extra,
      },
      ...extras,
    };
  }

  function pedidoEstorno(executorId: number, sessionVersion: number, id: number): PedidoEstornoSanidade {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 1 ? "Administrador da conta" : "Funcionario Curral",
      hojeISO: "2026-11-19",
      input: { id, motivo: "aplicado em outro" },
    };
  }

  async function saude(animalId?: number) {
    const filtro = animalId == null ? "" : " WHERE animalId = ?";
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM saude_registros${filtro} ORDER BY id`,
      animalId == null ? [] : [animalId],
    );
    return linhas;
  }

  async function saldo(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT quantidade FROM estoque WHERE id = ?", [id]);
    return String(linhas[0]?.quantidade);
  }

  async function movimentos(estoqueId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM estoque_movimentacoes WHERE estoque_id = ? ORDER BY id",
      [estoqueId],
    );
    return linhas;
  }

  it("1. principal sem estoque e funcionário com consumo", async () => {
    const sem = await lancarSanidadeAutorizado(io(), pedido(1, 3, {
      tipo: "Outro",
      descricao: "curativo",
      estoqueId: undefined,
      doseValor: undefined,
      doseUnidade: undefined,
      animalId: 70,
    }, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(sem).toMatchObject({ ok: true, userId: 1, executorUserId: 1, movimentacaoId: null });
    const livre = await saude(70);
    expect(livre).toHaveLength(1);
    expect(String(livre[0]?.tipo)).toBe("Outro");
    expect(String(livre[0]?.proximaData).slice(0, 10)).toBe("2026-12-01");
    expect(livre[0]?.estoqueId).toBeNull();
    expect(await saldo(500)).toBe("10.00");

    const com = await lancarSanidadeAutorizado(io(), pedido(2, 1, { animalId: 71 }));
    expect(com).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(await saldo(500)).toBe("8.00");
    const linha = (await saude(71))[0];
    expect(String(linha?.medicamento)).toBe("Ivomec");
    expect(String(linha?.dosagem)).toContain("2");
    expect(String(linha?.proximaData).slice(0, 10)).toBe("2026-12-01");
    expect(Number(linha?.userId)).toBe(1);
    expect(String(linha?.status)).toBe("ativo");
    const mov = await movimentos(500);
    expect(mov).toHaveLength(1);
    expect(Number(mov[0]?.user_id)).toBe(1);
    expect(String(mov[0]?.registrado_por)).toBe("Funcionario Curral");
    expect(Number(mov[0]?.fazenda_id)).toBe(10);
    expect(Number(mov[0]?.quantidade)).toBe(-2);
  });

  it("2. recusa sem permissão, fazenda, outro titular, ausente, vendido e produto errado", async () => {
    expect(await lancarSanidadeAutorizado(io(), pedido(3, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await lancarSanidadeAutorizado(io(), pedido(5, 1))).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(await lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 73 }))).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 999 }))).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    const depois = await lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 72, tipo: "Outro", descricao: "tarde", estoqueId: undefined }));
    expect(depois.ok).toBe(false);
    if (!depois.ok) expect(depois.mensagem).toContain("baixado");
    const noDia = await lancarSanidadeAutorizado(io(), pedido(1, 3, {
      animalId: 81, tipo: "Outro", descricao: "no dia", estoqueId: undefined, doseValor: undefined, doseUnidade: undefined,
    }));
    expect(noDia.ok).toBe(true);
    expect(await lancarSanidadeAutorizado(io(), pedido(1, 3, { estoqueId: 501 }))).toMatchObject({
      ok: false, mensagem: MSG_PRODUTO_OUTRA_FAZENDA,
    });
    expect(await lancarSanidadeAutorizado(io(), pedido(1, 3, { estoqueId: 502, doseValor: "5" }))).toMatchObject({
      ok: false, mensagem: MSG_ESTOQUE_INSUFICIENTE,
    });
    expect(await lancarSanidadeAutorizado(io(), pedido(1, 3, { estoqueId: 503 }))).toMatchObject({
      ok: false, mensagem: "O produto selecionado está inativo no estoque.",
    });
    expect(await lancarSanidadeAutorizado(io(), pedido(1, 3, { estoqueId: 504 }))).toMatchObject({
      ok: false, mensagem: "Selecione um produto da categoria Farmácia.",
    });
    expect(await saldo(500)).toBe("10.00");
    expect(await saldo(502)).toBe("1.00");
    expect(await saude(70)).toHaveLength(0);
  });

  it("3. preserva o histórico, a carência e devolve o saldo uma só vez", async () => {
    const criado = await lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 77 }));
    expect(criado.ok).toBe(true);
    const antes = await saude(77);
    expect(antes).toHaveLength(2);
    expect(String(antes[0]?.medicamento)).toBe("Antiga");
    expect(String(antes[1]?.proximaData).slice(0, 10)).toBe("2026-12-01");
    expect(await saldo(500)).toBe("8.00");
    const sem = await estornarSanidadeAutorizado(io(), pedidoEstorno(3, 1, Number(antes[1]?.id)));
    expect(sem).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await saldo(500)).toBe("8.00");
    const estorno = await estornarSanidadeAutorizado(io(), pedidoEstorno(2, 1, Number(antes[1]?.id)));
    expect(estorno).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(await saldo(500)).toBe("10.00");
    const depois = await saude(77);
    expect(depois).toHaveLength(2);
    expect(String(depois[0]?.status)).toBe("ativo");
    expect(String(depois[0]?.medicamento)).toBe("Antiga");
    expect(String(depois[1]?.status)).toBe("estornado");
    expect(String(depois[1]?.proximaData).slice(0, 10)).toBe("2026-12-01");
    expect(String(depois[1]?.motivoEstorno)).toBe("aplicado em outro");
    const movs = await movimentos(500);
    expect(movs).toHaveLength(2);
    expect(String(movs[0]?.status)).toBe("estornada");
    expect(Number(movs[1]?.quantidade)).toBe(2);
    expect(Number(movs[1]?.fazenda_id)).toBe(10);
    const deNovo = await estornarSanidadeAutorizado(io(), pedidoEstorno(1, 3, Number(antes[1]?.id)));
    expect(deNovo).toMatchObject({ ok: false, mensagem: MSG_SAUDE_ESTORNO_DUPLO });
    expect(await saldo(500)).toBe("10.00");
    expect(await movimentos(500)).toHaveLength(2);
  });

  it("4. falha no meio devolve saldo e histórico", async () => {
    await expect(lancarSanidadeAutorizado(io({
      async aposRegistro() { throw new Error("estoque fora"); },
    }), pedido(1, 3))).rejects.toThrow("estoque fora");
    expect(await saldo(500)).toBe("10.00");
    expect(await saude(70)).toHaveLength(0);
    expect(await movimentos(500)).toHaveLength(0);
    const criado = await lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 71 }));
    expect(criado.ok).toBe(true);
    const id = Number((await saude(71))[0]?.id);
    await expect(estornarSanidadeAutorizado(io({
      async aposRegistro() { throw new Error("estorno fora"); },
    }), pedidoEstorno(1, 3, id))).rejects.toThrow("estorno fora");
    expect(await saldo(500)).toBe("8.00");
    expect(String((await saude(71))[0]?.status)).toBe("ativo");
  });

  it("5. dois tratamentos e dois consumos do mesmo saldo", async () => {
    const [ida, volta] = await Promise.all([
      lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 78, estoqueId: 506, doseValor: "2" })),
      lancarSanidadeAutorizado(io(), pedido(2, 1, { animalId: 78, estoqueId: 506, doseValor: "2" })),
    ]);
    expect([ida, volta].filter((item) => item.ok)).toHaveLength(2);
    expect(await saude(78)).toHaveLength(2);
    expect(await saldo(506)).toBe("6.00");

    await pool.query("UPDATE estoque SET quantidade = 10.00 WHERE id = 506");
    await pool.query("DELETE FROM saude_registros WHERE animalId = 78");
    await pool.query("DELETE FROM estoque_movimentacoes WHERE estoque_id = 506");
    const [alto, baixo] = await Promise.all([
      lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 70, estoqueId: 506, doseValor: "6" })),
      lancarSanidadeAutorizado(io(), pedido(2, 1, { animalId: 71, estoqueId: 506, doseValor: "6" })),
    ]);
    const sucessos = [alto, baixo].filter((item) => item.ok);
    const recusas = [alto, baixo].filter((item) => !item.ok);
    expect(sucessos).toHaveLength(1);
    expect(recusas[0]).toMatchObject({ mensagem: MSG_ESTOQUE_INSUFICIENTE });
    expect(await saldo(506)).toBe("4.00");
    expect((await saude(70)).length + (await saude(71)).length).toBe(1);
  });

  it("6. concorrência com baixa, pesagem e transferência", async () => {
    const baixaPedido: PedidoBaixaAnimal = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: { fazendaId: 10, animalId: 74, dataBaixa: DATA, tipo: "morte", motivo: "doenca" },
    };
    const [tratamento, baixa] = await Promise.all([
      lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 74, estoqueId: 500, doseValor: "2" })),
      baixarEEspelharAnimal(ioBaixa(), baixaPedido, { async baixar() {} }),
    ]);
    const [animal] = await pool.query<RowDataPacket[]>("SELECT status, userId FROM animais WHERE id = 74");
    expect(animal[0]).toBeTruthy();
    expect(Number(animal[0]?.userId)).toBe(1);
    const registros = await saude(74);
    if (tratamento.ok) {
      expect(registros).toHaveLength(1);
      expect(await saldo(500)).toBe("8.00");
    } else {
      expect(registros).toHaveLength(0);
      expect(await saldo(500)).toBe("10.00");
    }
    if (baixa.ok) expect(String(animal[0]?.status)).toBe("morto");

    const pesoPedido: PedidoPesagem = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { animalId: 76, peso: "455", data: DATA },
    };
    const [diag, pesagem] = await Promise.all([
      lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 76, tipo: "Outro", descricao: "junto", estoqueId: undefined })),
      pesarEEspelharAnimal(ioPesagem(), pesoPedido, { async pesar() {} }),
    ]);
    expect((await saude(76)).length).toBe(diag.ok ? 1 : 0);
    const [pesos] = await pool.query<RowDataPacket[]>("SELECT id FROM pesagens WHERE animalId = 76");
    expect(pesos).toHaveLength(pesagem.ok ? 1 : 0);

    const mudancaPedido: PedidoTransferenciaFazenda = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: {
        fazendaOrigemId: 10, fazendaDestinoId: 20, animalId: 75,
        loteDestinoId: 200, pastoDestinoId: 2000, dataTransferencia: DATA,
      },
    };
    const saldoAntes = await saldo(506);
    const [sanidade, mudanca] = await Promise.all([
      lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 75, estoqueId: 506, doseValor: "1" })),
      transferirEEspelharAnimalFazenda(ioMovimento(), mudancaPedido, { async transferir() {} }),
    ]);
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT fazendaId, status FROM animais WHERE id = 75");
    const linha = linhas[0];
    expect(String(linha?.status)).toBe("ativo");
    expect(Number(linha?.fazendaId)).toBe(mudanca.ok ? 20 : 10);
    if (sanidade.ok) expect(Number(await saldo(506))).toBe(Number(saldoAntes) - 1);
    else expect(await saldo(506)).toBe(saldoAntes);
    expect(await saude(75)).toHaveLength(sanidade.ok ? 1 : 0);
  });

  it("7. dois estornos do mesmo lançamento e banco indisponível", async () => {
    const criado = await lancarSanidadeAutorizado(io(), pedido(1, 3, { animalId: 70, estoqueId: 500, doseValor: "3" }));
    expect(criado.ok).toBe(true);
    const id = Number((await saude(70))[0]?.id);
    const [ida, volta] = await Promise.all([
      estornarSanidadeAutorizado(io(), pedidoEstorno(1, 3, id)),
      estornarSanidadeAutorizado(io(), pedidoEstorno(2, 1, id)),
    ]);
    expect([ida, volta].filter((item) => item.ok)).toHaveLength(1);
    expect(await saldo(500)).toBe("10.00");
    expect(String((await saude(70))[0]?.status)).toBe("estornado");
    expect(await movimentos(500)).toHaveLength(2);
    await expect(lancarSanidadeAutorizado({
      async emTransacao() {
        const erro = new Error("connect ECONNREFUSED 127.0.0.1:3306");
        (erro as { code?: string }).code = "ECONNREFUSED";
        throw erro;
      },
    }, pedido(1, 3, { animalId: 71 }))).rejects.toThrow(/ECONNREFUSED/);
    expect(await saude(71)).toHaveLength(0);
  });

  it("8. deadlock repete a transação inteira", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = lancarSanidadeAutorizado(io({
      aposIdentidade: async () => {
        avisou();
        await segue;
      },
    }), pedido(1, 3, { animalId: 70, estoqueId: 500, doseValor: "2" }));
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
    expect(await saude(70)).toHaveLength(1);
    expect(await saldo(500)).toBe("8.00");
    expect(await movimentos(500)).toHaveLength(1);
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

  function ioBaixa(): IoBaixaAnimal {
    return transacao((conn) => consultasBaixa(conn));
  }

  function ioPesagem(): IoPesagemAnimal {
    return transacao((conn) => consultasPesagem(conn));
  }

  function ioMovimento(): IoAnimaisLote {
    return transacao((conn) => consultasMovimento(conn));
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

function mapearEstoque(linha: RowDataPacket): EstoqueSanidadeLinha {
  return {
    id: Number(linha.id),
    nome: linha.nome == null ? null : String(linha.nome),
    quantidade: linha.quantidade == null ? null : String(linha.quantidade),
    unidade: linha.unidade == null ? null : String(linha.unidade),
    valorUnitario: linha.valor_unitario == null ? null : String(linha.valor_unitario),
    valorTotalEstoque: linha.valor_total_estoque == null ? null : String(linha.valor_total_estoque),
    capitalInicializadoEm: linha.capital_inicializado_em ?? null,
    fazendaId: linha.fazenda_id == null ? null : Number(linha.fazenda_id),
    categoria: linha.categoria == null ? null : String(linha.categoria),
    situacao: linha.situacao == null ? null : String(linha.situacao),
    embalagens: linha.embalagens == null ? null : String(linha.embalagens),
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaSanidade {
  return {
    ...autenticacao(conn),
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      if (!linha) return null;
      return { id: Number(linha.id), userId: Number(linha.userId), fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId) };
    },
    async pasto(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT id, userId, fazendaId FROM pastos WHERE id = ? FOR UPDATE", [id]);
      const linha = linhas[0];
      if (!linha) return null;
      return { id: Number(linha.id), userId: Number(linha.userId), fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId) };
    },
    async espiarAnimal(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais WHERE id = ?",
        [id],
      );
      return linhas[0] ? mapearAnimal(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais WHERE id = ? AND userId = ? FOR UPDATE",
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
    async espiarEstoque(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM estoque WHERE id = ?", [id]);
      return linhas[0] ? mapearEstoque(linhas[0]) : null;
    },
    async travarEstoque(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM estoque WHERE id = ? FOR UPDATE", [id]);
      return linhas[0] ? mapearEstoque(linhas[0]) : null;
    },
    async espiarRegistro(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, animalId, estoqueId, status FROM saude_registros WHERE id = ?",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        animalId: Number(linha.animalId),
        estoqueId: linha.estoqueId == null ? null : Number(linha.estoqueId),
        status: linha.status == null ? null : String(linha.status),
      };
    },
    async travarRegistro(id) {
      await conn.query("SELECT id FROM saude_registros WHERE id = ? FOR UPDATE", [id]);
    },
    async insertRegistro(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO saude_registros
          (userId, animalId, tipo, descricao, medicamento, dosagem, viaAplicacao, estoqueId, quantidadeConsumo, valorUnitario, veterinario, custo, dataRegistro, proximaData, observacoes, estoqueMovimentacaoId, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.animalId, row.tipo, row.descricao ?? null, row.medicamento ?? null, row.dosagem ?? null, row.viaAplicacao ?? null, row.estoqueId ?? null, row.quantidadeConsumo ?? null, row.valorUnitario ?? null, row.veterinario ?? null, row.custo ?? null, row.dataRegistro, row.proximaData ?? null, row.observacoes ?? null, row.estoqueMovimentacaoId ?? null, row.status],
      );
      return Number(resultado.insertId);
    },
    async updateRegistro(id, patch) {
      const campos: string[] = [];
      const valores: unknown[] = [];
      if (patch.estoqueMovimentacaoId !== undefined) {
        campos.push("estoqueMovimentacaoId = ?");
        valores.push(patch.estoqueMovimentacaoId);
      }
      if (patch.custo !== undefined) {
        campos.push("custo = ?");
        valores.push(patch.custo);
      }
      if (patch.status !== undefined) {
        campos.push("status = ?");
        valores.push(patch.status);
      }
      if (patch.motivoEstorno !== undefined) {
        campos.push("motivoEstorno = ?");
        valores.push(patch.motivoEstorno);
      }
      if (patch.estornadoEmAgora) campos.push("estornadoEm = CURRENT_TIMESTAMP");
      if (campos.length === 0) return;
      await conn.query(`UPDATE saude_registros SET ${campos.join(", ")} WHERE id = ?`, [...valores, id]);
    },
    async findRegistro(userId, id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM saude_registros WHERE id = ? AND userId = ?",
        [id, userId],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        animalId: Number(linha.animalId),
        tipo: String(linha.tipo),
        estoqueId: linha.estoqueId == null ? null : Number(linha.estoqueId),
        quantidadeConsumo: linha.quantidadeConsumo,
        estoqueMovimentacaoId: linha.estoqueMovimentacaoId == null ? null : Number(linha.estoqueMovimentacaoId),
        status: linha.status == null ? null : String(linha.status),
        dataRegistro: String(linha.dataRegistro),
      };
    },
    async findMovimentacao(id) {
      const [linhas] = await conn.query<RowDataPacket[]>("SELECT * FROM estoque_movimentacoes WHERE id = ?", [id]);
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        estoqueId: Number(linha.estoque_id),
        fazendaId: linha.fazenda_id == null ? null : Number(linha.fazenda_id),
        quantidade: linha.quantidade,
        valorEstoqueMovimentado: linha.valor_estoque_movimentado,
        valor: linha.valor,
        grupoId: linha.grupo_id == null ? null : String(linha.grupo_id),
        tipo: linha.tipo == null ? null : String(linha.tipo),
        manejo: linha.manejo == null ? null : String(linha.manejo),
        status: linha.status == null ? null : String(linha.status),
        destino: linha.destino == null ? null : String(linha.destino),
      };
    },
    async marcarMovimentacaoEstornada(id, motivo) {
      await conn.query(
        "UPDATE estoque_movimentacoes SET status = 'estornada', motivo_estorno = ? WHERE id = ?",
        [motivo, id],
      );
    },
    async findEstoque(id) {
      const linha = await this.espiarEstoque(id);
      if (!linha) return null;
      return {
        id: linha.id,
        fazendaId: linha.fazendaId,
        quantidade: linha.quantidade,
        controlarSaldo: true,
        valorUnitario: linha.valorUnitario,
        valorTotalEstoque: linha.valorTotalEstoque ?? null,
        capitalInicializadoEm: linha.capitalInicializadoEm ?? null,
        nome: linha.nome,
      };
    },
    async insertMovimentacao(values) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO estoque_movimentacoes
          (grupo_id, estoque_id, fazenda_id, user_id, registrado_por, tipo, manejo, data_movimentacao, quantidade, destino, valor, valor_estoque_movimentado, observacoes, status, original_grupo_id, motivo_estorno)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [values.grupoId ?? null, values.estoqueId, values.fazendaId ?? null, values.userId, values.registradoPor, values.tipo ?? null, values.manejo ?? null, values.dataMovimentacao, values.quantidade, values.destino ?? null, values.valor ?? null, values.valorEstoqueMovimentado ?? null, values.observacoes ?? null, values.status, values.originalGrupoId ?? null, values.motivoEstorno ?? null],
      );
      return Number(resultado.insertId);
    },
    async updateEstoque(id, patch) {
      const campos = ["quantidade = ?"];
      const valores: unknown[] = [patch.quantidade];
      if (patch.valorUnitario != null) {
        campos.push("valor_unitario = ?");
        valores.push(patch.valorUnitario);
      }
      if (patch.valorTotalEstoque != null) {
        campos.push("valor_total_estoque = ?");
        valores.push(patch.valorTotalEstoque);
      }
      await conn.query(`UPDATE estoque SET ${campos.join(", ")} WHERE id = ?`, [...valores, id]);
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

function consultasPesagem(conn: mysql.PoolConnection): ConsultaPesagemAnimal {
  const base = consultas(conn);
  return {
    ...autenticacao(conn),
    lote: base.lote,
    pasto: base.pasto,
    async espiar(id) {
      const linha = await base.espiarAnimal(id);
      return linha ? { ...linha, dataDesmama: null, dataNascimento: null, pesoAtual: null, categoria: null } : null;
    },
    async animal(id, titularUserId) {
      const linha = await base.animal(id, titularUserId);
      return linha ? { ...linha, dataDesmama: null, dataNascimento: null, pesoAtual: null, categoria: null } : null;
    },
    baixaAtiva: base.baixaAtiva,
    async eventosDesmama() { return []; },
    async pesagensDoAnimal() { return []; },
    async inserirPesagem(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        "INSERT INTO pesagens (userId, animalId, peso, data, observacoes, compraRecebimentoId) VALUES (?, ?, ?, ?, ?, NULL)",
        [row.userId, row.animalId, row.peso, row.data, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPeso(id, titularUserId, peso) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        "UPDATE animais SET pesoAtual = ? WHERE id = ? AND userId = ?",
        [peso, id, titularUserId],
      );
      return resultado.affectedRows > 0;
    },
    async atualizarDesmama() { return false; },
    async atualizarObservacaoPesagem() {},
  };
}

function consultasBaixa(conn: mysql.PoolConnection): ConsultaBaixaAnimal {
  const base = consultas(conn);
  return {
    ...autenticacao(conn),
    lote: base.lote,
    pasto: base.pasto,
    async espiar(id) {
      const linha = await base.espiarAnimal(id);
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
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY id`,
        ids,
      );
      return linhas.map(mapearAnimal);
    },
    async animais(ids, titularUserId) {
      if (ids.length === 0) return [];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais
         WHERE userId = ? AND id IN (${ids.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`,
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
