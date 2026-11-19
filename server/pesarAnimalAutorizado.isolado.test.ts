import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MSG_MANEJO_BAIXA_LEGADA } from "../shared/animalBaixa";
import { MSG_DESMAMA_DUPLICADA, MSG_DESMAMA_IDADE_ABSOLUTA, MSG_DESMAMA_INATIVO } from "../shared/desmamaManejo";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { excluirEEspelharAnimal, type PedidoExclusaoAnimal } from "./baixarAnimalAutorizado";
import type { ConsultaBaixaAnimal, IoBaixaAnimal } from "./baixarAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import type { ConsultaAnimaisLote, IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";
import {
  MSG_ANIMAL_PESAGEM_AUSENTE,
  MSG_SEM_FAZENDA_PESAGEM,
  desmamarEEspelharAnimal,
  pesarAnimalAutorizado,
  pesarEEspelharAnimal,
  type IoPesagemAnimal,
  type PedidoDesmama,
  type PedidoPesagem,
} from "./pesarAnimalAutorizado";
import {
  transferirEEspelharAnimalFazenda,
  type PedidoTransferenciaFazenda,
} from "./transferirAnimalFazendaAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4u-pesagem";
const PORTA = 3346;
const SENHA = "isolado-h4u";
const BANCO = "fd_h4u";
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
  fazendaId int NULL, pastoAtualId int NULL, ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL, userId int NOT NULL, loteId int NULL, fazendaId int NULL,
  pastoId int NULL, status varchar(20) NOT NULL, brinco varchar(50) NULL,
  dataNascimento date NULL, dataDesmama date NULL, pesoAtual decimal(8,2) NULL,
  categoria varchar(50) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, observacoes text NULL,
  compraRecebimentoId int NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  destino varchar(255) NULL, motivo varchar(255) NULL, usuarioNome varchar(200) NULL,
  vendaId int NULL, status varchar(20) NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteOrigemId int NULL, loteDestinoId int NOT NULL, pastoOrigemId int NULL,
  pastoDestinoId int NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, usuarioNome varchar(200) NULL, observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL,
  tipo varchar(50) NOT NULL, dataCobertura date NOT NULL, PRIMARY KEY (id)
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

describe.sequential("pesagens e desmama em MySQL isolado", () => {
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
        (2, 1, 'pesagens.criar', 1),
        (3, 1, 'pesagens.visualizar', 1),
        (5, 1, 'pesagens.criar', 1)
    `);
    await conn.query(`
      INSERT INTO pastos (id, userId, fazendaId, nome, status) VALUES
        (1000, 1, 10, 'Curral', 'ativo'),
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
    await pool.query("DELETE FROM pesagens");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, ativo) VALUES
        (100, 1, 'Lote da sede', 10, 1000, 1),
        (200, 1, 'Lote do retiro', 20, 2000, 1),
        (400, 4, 'Lote alheio', 40, 4000, 1)
    `);
    await pool.query(`
      INSERT INTO animais
        (id, userId, loteId, fazendaId, pastoId, status, brinco, dataNascimento, dataDesmama, pesoAtual, categoria)
      VALUES
        (50, 1, NULL, 10, NULL, 'ativo', 'BR-50', '2026-05-10', NULL, 200, 'Bezerro'),
        (51, 1, 100, 10, 1000, 'ativo', 'BR-51', '2026-05-10', NULL, 210, 'Bezerro'),
        (52, 1, 100, 10, 1000, 'vendido', 'BR-52', '2026-05-10', NULL, 300, 'Bezerro'),
        (53, 1, 100, 10, 1000, 'morto', 'BR-53', '2026-05-10', NULL, 300, 'Bezerro'),
        (54, 4, 400, 40, 4000, 'ativo', 'BR-54', '2026-05-10', NULL, 180, 'Bezerro'),
        (56, 1, 100, 10, 1000, 'ativo', 'BR-56', '2026-05-10', NULL, 190, 'Bezerro'),
        (59, 1, NULL, 10, NULL, 'ativo', 'BR-59', '2026-10-20', NULL, 80, 'Bezerro'),
        (60, 1, NULL, 10, NULL, 'ativo', 'BR-60', NULL, NULL, 400, 'Boi'),
        (61, 1, NULL, 10, NULL, 'ativo', 'BR-61', NULL, NULL, 160, 'Bezerro'),
        (62, 1, NULL, 10, NULL, 'ativo', 'BR-62', '2026-05-10', NULL, 200, 'Bezerro'),
        (63, 1, NULL, 10, NULL, 'ativo', 'BR-63', '2026-05-10', NULL, 200, 'Bezerra')
    `);
    await pool.query(`
      INSERT INTO animal_baixas
        (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, vendaId, status)
      VALUES (1, 52, 10, 'venda', '2026-11-01', 'Venda #1', 'caixa', 1, 'ativa')
    `);
    await pool.query(`
      INSERT INTO pesagens (id, userId, animalId, peso, data, observacoes, compraRecebimentoId)
      VALUES (8, 1, 51, 180.00, '2026-10-01', 'entrada', NULL)
    `);
    await pool.query("UPDATE animais SET pesoAtual = 180 WHERE id = 51");
    await pool.query(`
      INSERT INTO reproducao_registros (userId, femeaId, tipo, dataCobertura)
      VALUES (1, 62, 'Desmama', '2026-10-01')
    `);
  });

  function io(ganchos: Partial<IoPesagemAnimal> = {}): IoPesagemAnimal {
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

  function pedido(executorId: number, sessionVersion: number, input: Partial<PedidoPesagem["input"]> = {}, extras: Partial<PedidoPesagem> = {}): PedidoPesagem {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      input: { animalId: 51, peso: "320,5", data: DATA, ...input },
      ...extras,
    };
  }

  function pedidoDesmama(executorId: number, sessionVersion: number, input: Partial<PedidoDesmama["input"]> = {}, extras: Partial<PedidoDesmama> = {}): PedidoDesmama {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      input: { fazendaId: 10, animalId: 56, dataDesmama: DATA, pesoKg: "220", ...input },
      ...extras,
    };
  }

  async function pesar(corpo: PedidoPesagem, ganchos: Partial<IoPesagemAnimal> = {}) {
    const chamadas: number[] = [];
    const resultado = await pesarEEspelharAnimal(io(ganchos), corpo, {
      async pesar(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function desmamar(corpo: PedidoDesmama, ganchos: Partial<IoPesagemAnimal> = {}) {
    const chamadas: number[] = [];
    const resultado = await desmamarEEspelharAnimal(io(ganchos), corpo, {
      async desmamar(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function pesos(animalId?: number) {
    const filtro = animalId == null ? "" : " WHERE animalId = ?";
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM pesagens${filtro} ORDER BY id`,
      animalId == null ? [] : [animalId],
    );
    return linhas;
  }

  it("1. principal registra a pesagem e atualiza o peso atual", async () => {
    const { resultado, chamadas } = await pesar(pedido(1, 3));
    expect(resultado).toMatchObject({ ok: true, userId: 1, executorUserId: 1, peso: "320.50" });
    expect(chamadas).toEqual([1]);
    const linha = await animal(51);
    expect(String(linha?.pesoAtual)).toBe("320.50");
    expect(String(linha?.status)).toBe("ativo");
    expect(Number(linha?.loteId)).toBe(100);
    expect(Number(linha?.fazendaId)).toBe(10);
    expect(String(linha?.categoria)).toBe("Bezerro");
    const linhas = await pesos(51);
    expect(linhas).toHaveLength(2);
    expect(String(linhas[0]?.peso)).toBe("180.00");
    expect(String(linhas[0]?.observacoes)).toBe("entrada");
    expect(linhas[1]?.compraRecebimentoId).toBeNull();
    expect(String(linhas[1]?.data).slice(0, 10)).toBe(DATA);
  });

  it("2. funcionário autorizado grava na conta do titular", async () => {
    const { resultado } = await pesar(pedido(2, 1, { peso: "330" }));
    expect(resultado).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(Number((await pesos(51)).at(-1)?.userId)).toBe(1);
  });

  it("3. funcionário sem permissão, fazenda não concedida, outro titular e inexistente", async () => {
    const sem = await pesar(pedido(3, 1));
    expect(sem.resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    const fazenda = await pesar(pedido(5, 1));
    expect(fazenda.resultado).toMatchObject({ ok: false, motivo: "sem_fazenda", mensagem: MSG_SEM_FAZENDA_PESAGEM });
    const outro = await pesar(pedido(1, 3, { animalId: 54 }));
    expect(outro.resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_PESAGEM_AUSENTE });
    const ausente = await pesar(pedido(1, 3, { animalId: 999 }));
    expect(ausente.resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_PESAGEM_AUSENTE });
    expect(await pesos(51)).toHaveLength(1);
    expect(String((await animal(54))?.pesoAtual)).toBe("180.00");
  });

  it("4. animal vendido ou morto segue a regra do manejo", async () => {
    const depois = await pesar(pedido(1, 3, { animalId: 52, data: "2026-11-18", peso: "310" }));
    expect(depois.resultado.ok).toBe(false);
    expect(String((await animal(52))?.pesoAtual)).toBe("300.00");
    const antes = await pesar(pedido(1, 3, { animalId: 52, data: "2026-10-15", peso: "290" }));
    expect(antes.resultado.ok).toBe(true);
    expect(String((await animal(52))?.pesoAtual)).toBe("290.00");
    expect(String((await animal(52))?.status)).toBe("vendido");
    const legado = await pesar(pedido(1, 3, { animalId: 53, peso: "310" }));
    expect(legado.resultado).toMatchObject({ ok: false, mensagem: MSG_MANEJO_BAIXA_LEGADA });
  });

  it("5. duas pesagens ao mesmo tempo preservam as duas", async () => {
    const [ida, volta] = await Promise.all([
      pesar(pedido(1, 3, { peso: "321" })),
      pesar(pedido(2, 1, { peso: "322" })),
    ]);
    expect(ida.resultado.ok && volta.resultado.ok).toBe(true);
    const linhas = await pesos(51);
    expect(linhas).toHaveLength(3);
    const atual = String((await animal(51))?.pesoAtual);
    expect(["321.00", "322.00"]).toContain(atual);
  });

  it("6. pesagem concorrente com a exclusão não deixa peso órfão", async () => {
    const exclusao: PedidoExclusaoAnimal = { executorId: 1, sessionVersionDaSessao: 3, animalId: 50 };
    const [peso, saida] = await Promise.all([
      pesar(pedido(1, 3, { animalId: 50, peso: "210" })),
      excluirEEspelharAnimal(ioBaixa(), exclusao, { async excluir() {} }),
    ]);
    const linha = await animal(50);
    const registros = await pesos(50);
    if (!linha) {
      expect(registros).toHaveLength(0);
      expect(peso.resultado.ok).toBe(false);
    } else {
      expect(saida.ok).toBe(false);
      expect(registros).toHaveLength(1);
      expect(String(linha.pesoAtual)).toBe("210.00");
      expect(String(linha.status)).toBe("ativo");
    }
    expect(peso.resultado.ok === !saida.ok || (!linha && registros.length === 0)).toBe(true);
  });

  it("7. pesagem que chega depois da baixa não grava", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = pesar(pedido(1, 3, { animalId: 56, data: "2026-11-18", peso: "240" }), {
      aposIdentidade: async () => {
        avisou();
        await segue;
      },
    });
    await travou;
    const externa = await pool.getConnection();
    try {
      await externa.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await externa.beginTransaction();
      await externa.query("UPDATE animais SET status = 'morto' WHERE id = 56");
      await externa.query(`
        INSERT INTO animal_baixas
          (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, vendaId, status)
        VALUES (1, 56, 10, 'morte', '2026-11-10', 'doenca', 'curral', NULL, 'ativa')
      `);
      await externa.commit();
    } finally {
      externa.release();
    }
    liberar();
    const { resultado } = await operacao;
    expect(resultado.ok).toBe(false);
    expect(await pesos(56)).toHaveLength(0);
    expect(String((await animal(56))?.status)).toBe("morto");
    expect(String((await animal(56))?.pesoAtual)).toBe("190.00");
  });

  it("8. pesagem concorrente com transferência entre fazendas", async () => {
    const mudancaPedido: PedidoTransferenciaFazenda = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: {
        fazendaOrigemId: 10,
        fazendaDestinoId: 20,
        animalId: 51,
        loteDestinoId: 200,
        pastoDestinoId: 2000,
        dataTransferencia: DATA,
      },
    };
    let mudanca: { ok: boolean } = { ok: false };
    const [peso] = await Promise.all([
      pesar(pedido(1, 3, { peso: "330" })),
      transferirEEspelharAnimalFazenda(ioMovimento(), mudancaPedido, { async transferir() {} })
        .then((resultado) => { mudanca = resultado; })
        .catch(() => { mudanca = { ok: false }; }),
    ]);
    const linha = await animal(51);
    const registros = (await pesos(51)).filter((item) => Number(item.id) !== 8);
    const [historico] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM animal_lote_movimentacoes WHERE animalId = 51",
    );
    expect(String(linha?.status)).toBe("ativo");
    expect(Number(linha?.userId)).toBe(1);
    expect(registros.length).toBeLessThanOrEqual(1);
    if (peso.resultado.ok) expect(String(linha?.pesoAtual)).toBe("330.00");
    else expect(String(linha?.pesoAtual)).toBe("180.00");
    if (mudanca.ok) expect(Number(linha?.fazendaId)).toBe(20);
    else expect(Number(linha?.fazendaId)).toBe(10);
    expect(historico).toHaveLength(mudanca.ok ? 1 : 0);
  });

  it("9. desmama válida grava a data e a pesagem na mesma transação", async () => {
    const { resultado, chamadas } = await desmamar(pedidoDesmama(1, 3));
    expect(resultado).toMatchObject({
      ok: true,
      userId: 1,
      executorUserId: 1,
      pesagemCriada: true,
      pesagemReutilizada: false,
    });
    expect(chamadas).toEqual([1]);
    const linha = await animal(56);
    expect(String(linha?.dataDesmama).slice(0, 10)).toBe(DATA);
    expect(String(linha?.pesoAtual)).toBe("220.00");
    expect(String(linha?.categoria)).toBe("Bezerro");
    expect(Number(linha?.loteId)).toBe(100);
    expect(Number(linha?.fazendaId)).toBe(10);
    const linhas = await pesos(56);
    expect(linhas).toHaveLength(1);
    expect(String(linhas[0]?.observacoes)).toBe("Desmama");
    expect(linhas[0]?.compraRecebimentoId).toBeNull();
  });

  it("10. desmama sem autorização, duplicada, nova e já marcada no curral", async () => {
    const sem = await desmamar(pedidoDesmama(3, 1));
    expect(sem.resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    const vendido = await desmamar(pedidoDesmama(1, 3, { animalId: 52 }));
    expect(vendido.resultado).toMatchObject({ ok: false, mensagem: MSG_DESMAMA_INATIVO });
    const novo = await desmamar(pedidoDesmama(1, 3, { animalId: 59 }));
    expect(novo.resultado).toMatchObject({ ok: false, mensagem: MSG_DESMAMA_IDADE_ABSOLUTA });
    const semIdade = await desmamar(pedidoDesmama(1, 3, { animalId: 60 }));
    expect(semIdade.resultado.ok).toBe(false);
    const evento = await desmamar(pedidoDesmama(1, 3, { animalId: 62 }));
    expect(evento.resultado).toMatchObject({ ok: false, mensagem: MSG_DESMAMA_DUPLICADA });
    await pesar(pedido(1, 3, { animalId: 56, peso: "215", observacoes: "curral" }));
    const curral = await desmamar(pedidoDesmama(2, 1, { animalId: 56, pesoKg: undefined }));
    expect(curral.resultado).toMatchObject({
      ok: true,
      pesagemCriada: false,
      pesagemReutilizada: true,
      pesagemVinculada: true,
      executorUserId: 2,
    });
    expect(await pesos(56)).toHaveLength(1);
    expect(String((await pesos(56))[0]?.observacoes)).toContain("Desmama");
    expect(String((await animal(56))?.pesoAtual)).toBe("215.00");
    const deNovo = await desmamar(pedidoDesmama(1, 3, { animalId: 56 }));
    expect(deNovo.resultado).toMatchObject({ ok: false, mensagem: MSG_DESMAMA_DUPLICADA });
  });

  it("11. duas desmamas ao mesmo tempo deixam um só registro", async () => {
    const [ida, volta] = await Promise.all([
      desmamar(pedidoDesmama(1, 3, { animalId: 63, pesoKg: "230" })),
      desmamar(pedidoDesmama(2, 1, { animalId: 63, pesoKg: "231" })),
    ]);
    const sucessos = [ida, volta].filter((item) => item.resultado.ok);
    expect(sucessos).toHaveLength(1);
    expect(await pesos(63)).toHaveLength(1);
    expect(String((await animal(63))?.dataDesmama).slice(0, 10)).toBe(DATA);
    expect(String((await animal(63))?.categoria)).toBe("Bezerra");
  });

  it("12. falha no meio desfaz pesagem e desmama", async () => {
    await expect(pesarAnimalAutorizado(io({
      async aposRegistro() { throw new Error("peso fora"); },
    }), pedido(1, 3, { peso: "340" }))).rejects.toThrow("peso fora");
    expect(String((await animal(51))?.pesoAtual)).toBe("180.00");
    expect(await pesos(51)).toHaveLength(1);
    await expect(desmamar(pedidoDesmama(1, 3), {
      async aposRegistro() { throw new Error("desmama fora"); },
    })).rejects.toThrow("desmama fora");
    expect((await animal(56))?.dataDesmama).toBeNull();
    expect(await pesos(56)).toHaveLength(0);
    expect(String((await animal(56))?.pesoAtual)).toBe("190.00");
  });

  it("13. idade aproximada, espelho e administrador principal", async () => {
    const idade = await desmamar(pedidoDesmama(1, 3, { animalId: 61, idadeMeses: 8, pesoKg: "210" }));
    expect(idade.resultado.ok).toBe(true);
    expect(String((await animal(61))?.dataNascimento).slice(0, 10)).toBe("2026-03-10");
    expect(String((await animal(61))?.categoria)).toBe("Bezerro");
    await pool.query("UPDATE animais SET pesoAtual = 180, dataDesmama = NULL WHERE id = 51");
    await pool.query("DELETE FROM pesagens WHERE animalId = 51 AND id <> 8");
    await expect(pesarEEspelharAnimal(io(), pedido(1, 3, { peso: "325" }), {
      async pesar() { throw new Error("espelho fora"); },
    })).resolves.toMatchObject({ ok: true, peso: "325.00" });
    expect(String((await animal(51))?.pesoAtual)).toBe("325.00");
    const principal = await pesar(pedido(1, 3, { animalId: 50, peso: "205" }, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(principal.resultado).toMatchObject({ ok: true, userId: 1, executorUserId: 1 });
  });

  it("14. concorrência com a edição cadastral", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = pesar(pedido(1, 3, { peso: "333" }), {
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
    expect((await pesos(51)).length).toBe(2);
  });

  function ioBaixa(): IoBaixaAnimal {
    return {
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultasBaixa(conn));
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

  function ioMovimento(): IoAnimaisLote {
    return {
      async emTransacao(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultasMovimento(conn));
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

function mapear(linha: RowDataPacket) {
  return {
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
    status: linha.status == null ? null : String(linha.status),
    dataDesmama: linha.dataDesmama == null ? null : String(linha.dataDesmama).slice(0, 10),
    dataNascimento: linha.dataNascimento == null ? null : String(linha.dataNascimento).slice(0, 10),
    pesoAtual: linha.pesoAtual == null ? null : String(linha.pesoAtual),
    categoria: linha.categoria == null ? null : String(linha.categoria),
  };
}

function consultas(conn: mysql.PoolConnection) {
  return {
    ...autenticacao(conn),
    async lote(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId FROM lotes WHERE id = ? FOR UPDATE",
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
    async pasto(id: number) {
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
    async espiar(id: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status, dataDesmama, dataNascimento, pesoAtual, categoria
         FROM animais WHERE id = ?`,
        [id],
      );
      return linhas[0] ? mapear(linhas[0]) : null;
    },
    async animal(id: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status, dataDesmama, dataNascimento, pesoAtual, categoria
         FROM animais WHERE id = ? AND userId = ? FOR UPDATE`,
        [id, titularUserId],
      );
      return linhas[0] ? mapear(linhas[0]) : null;
    },
    async baixaAtiva(animalId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1 FOR UPDATE",
        [animalId],
      );
      if (!linhas[0]) return null;
      return { dataBaixa: linhas[0].dataBaixa == null ? null : String(linhas[0].dataBaixa).slice(0, 10) };
    },
    async eventosDesmama(animalId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT tipo FROM reproducao_registros WHERE userId = ? AND femeaId = ?",
        [titularUserId, animalId],
      );
      return linhas.map((linha) => ({ tipo: linha.tipo == null ? null : String(linha.tipo) }));
    },
    async pesagensDoAnimal(animalId: number, titularUserId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, data, peso, observacoes FROM pesagens WHERE userId = ? AND animalId = ?",
        [titularUserId, animalId],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        data: linha.data == null ? null : String(linha.data).slice(0, 10),
        peso: linha.peso == null ? null : String(linha.peso),
        observacoes: linha.observacoes == null ? null : String(linha.observacoes),
      }));
    },
    async inserirPesagem(row: { userId: number; animalId: number; peso: string; data: string; observacoes: string | null }) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO pesagens (userId, animalId, peso, data, observacoes, compraRecebimentoId)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [row.userId, row.animalId, row.peso, row.data, row.observacoes],
      );
      return Number(resultado.insertId);
    },
    async atualizarPeso(id: number, titularUserId: number, peso: string) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        "UPDATE animais SET pesoAtual = ? WHERE id = ? AND userId = ?",
        [peso, id, titularUserId],
      );
      return resultado.affectedRows > 0;
    },
    async atualizarDesmama(id: number, titularUserId: number, patch: { dataDesmama: string; dataNascimento?: string; pesoAtual?: string }) {
      const campos = ["dataDesmama = ?"];
      const valores: Array<string | number> = [patch.dataDesmama];
      if (patch.dataNascimento) {
        campos.push("dataNascimento = ?");
        valores.push(patch.dataNascimento);
      }
      if (patch.pesoAtual) {
        campos.push("pesoAtual = ?");
        valores.push(patch.pesoAtual);
      }
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `UPDATE animais SET ${campos.join(", ")} WHERE id = ? AND userId = ? AND status = 'ativo' AND dataDesmama IS NULL`,
        [...valores, id, titularUserId],
      );
      return resultado.affectedRows > 0;
    },
    async atualizarObservacaoPesagem(id: number, animalId: number, titularUserId: number, observacoes: string) {
      await conn.query(
        "UPDATE pesagens SET observacoes = ? WHERE id = ? AND animalId = ? AND userId = ?",
        [observacoes, id, animalId, titularUserId],
      );
    },
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
    async inserirBaixa() {
      throw new Error("a exclusão não grava baixa");
    },
    async atualizarStatus() {
      throw new Error("a exclusão não muda status");
    },
    async sincronizarStatusPasto() {},
    async temRastro(animalId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM pesagens WHERE userId = ? AND animalId = ? LIMIT 1",
        [titularUserId, animalId],
      );
      return linhas.length > 0;
    },
    async excluirAnimal(id, titularUserId) {
      await conn.query("DELETE FROM animais WHERE id = ? AND userId = ?", [id, titularUserId]);
    },
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
      return linhas.map((linha) => ({
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        loteId: linha.loteId == null ? null : Number(linha.loteId),
        pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
        status: linha.status == null ? null : String(linha.status),
      }));
    },
    async animais(ids, titularUserId) {
      if (ids.length === 0) return [];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais
         WHERE userId = ? AND id IN (${ids.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`,
        [titularUserId, ...ids],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        loteId: linha.loteId == null ? null : Number(linha.loteId),
        pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
        status: linha.status == null ? null : String(linha.status),
      }));
    },
    async baixaAtiva(animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1",
        [animalId],
      );
      return linhas[0]?.dataBaixa == null ? null : String(linhas[0].dataBaixa).slice(0, 10);
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
