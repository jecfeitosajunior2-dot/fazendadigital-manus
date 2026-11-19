import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MSG_BAIXA_ANIMAL_INATIVO, MSG_BAIXA_FAZENDA_DIVERGENTE, MSG_SAIDA_MORTE_DUPLICADA, MSG_VENDA_VIA_MANEJO_BLOQUEADA } from "../shared/animalBaixa";
import { MSG_ANIMAL_EXCLUSAO_BLOQUEADA } from "../shared/animalExclusao";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  baixarAnimalAutorizado,
  baixarEEspelharAnimal,
  excluirEEspelharAnimal,
  MSG_ANIMAL_BAIXA_AUSENTE,
  type ConsultaBaixaAnimal,
  type IoBaixaAnimal,
  type PedidoBaixaAnimal,
  type PedidoExclusaoAnimal,
} from "./baixarAnimalAutorizado";
import {
  transferirEEspelharAnimalFazenda,
  type PedidoTransferenciaFazenda,
} from "./transferirAnimalFazendaAutorizado";
import type { ConsultaAnimaisLote, IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4t-baixa";
const PORTA = 3345;
const SENHA = "isolado-h4t";
const BANCO = "fd_h4t";
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
  pastoId int NULL, status varchar(20) NOT NULL, brinco varchar(50) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_baixas (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  fazendaId int NOT NULL, tipo varchar(20) NOT NULL, dataBaixa date NOT NULL,
  destino varchar(255) NULL, motivo varchar(255) NULL, observacoes text NULL,
  usuarioNome varchar(200) NULL, vendaId int NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY animal_baixas_animal_ativa_uq ((CASE WHEN status = 'ativa' THEN animalId END))
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  loteOrigemId int NULL, loteDestinoId int NOT NULL, pastoOrigemId int NULL,
  pastoDestinoId int NULL, fazendaId int NULL, fazendaOrigemId int NULL,
  dataMovimentacao date NOT NULL, usuarioNome varchar(200) NULL, observacoes text NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE pesagens (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  peso decimal(8,2) NOT NULL, data date NOT NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE compra_recebimentos (
  id int NOT NULL AUTO_INCREMENT, user_id int NOT NULL, animal_id int NOT NULL,
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

describe.sequential("baixas e exclusão de animais em MySQL isolado", () => {
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
        (2, 1, 'animais.inativar', 1),
        (3, 1, 'animais.visualizar', 1),
        (5, 1, 'animais.inativar', 1)
    `);
    await conn.query(`
      INSERT INTO pastos (id, userId, fazendaId, nome, status) VALUES
        (1000, 1, 10, 'Curral', 'ativo'),
        (1100, 1, 10, 'Mangueiro', 'descanso'),
        (1200, 1, 10, 'Brejo', 'ativo'),
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
    await pool.query("DELETE FROM pesagens");
    await pool.query("DELETE FROM compra_recebimentos");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query(`
      INSERT INTO lotes (id, userId, nome, fazendaId, pastoAtualId, ativo) VALUES
        (100, 1, 'Lote da sede', 10, 1000, 1),
        (110, 1, 'Lote do mangueiro', 10, 1100, 1),
        (200, 1, 'Lote do retiro', 20, 2000, 1),
        (400, 4, 'Lote alheio', 40, 4000, 1)
    `);
    await pool.query(`
      INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES
        (50, 1, NULL, 10, NULL, 'ativo', 'BR-50'),
        (51, 1, 100, 10, 1000, 'ativo', 'BR-51'),
        (52, 1, 100, 10, 1000, 'vendido', 'BR-52'),
        (53, 1, 100, 10, 1000, 'ativo', 'BR-53'),
        (54, 4, 400, 40, 4000, 'ativo', 'BR-54'),
        (56, 1, 100, 10, 1200, 'ativo', 'BR-56'),
        (58, 1, NULL, 10, NULL, 'ativo', 'BR-58'),
        (59, 1, NULL, 10, NULL, 'ativo', 'BR-59')
    `);
    await pool.query(`
      INSERT INTO animal_baixas
        (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, vendaId, status)
      VALUES (1, 53, 10, 'morte', '2026-11-01', 'doenca', 'antes', NULL, 'ativa')
    `);
    await pool.query("INSERT INTO pesagens (userId, animalId, peso, data) VALUES (1, 58, 320, '2026-11-01')");
    await pool.query("INSERT INTO compra_recebimentos (user_id, animal_id) VALUES (1, 59)");
    await pool.query("UPDATE pastos SET status = 'ativo' WHERE id IN (1000, 1200, 2000, 4000)");
    await pool.query("UPDATE pastos SET status = 'descanso' WHERE id = 1100");
  });

  function io(ganchos: Partial<IoBaixaAnimal> = {}): IoBaixaAnimal {
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

  function pedido(executorId: number, sessionVersion: number, input: Partial<PedidoBaixaAnimal["input"]> = {}, extras: Partial<PedidoBaixaAnimal> = {}): PedidoBaixaAnimal {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 2 ? "Funcionario Curral" : "Administrador da conta",
      input: {
        fazendaId: 10,
        animalId: 51,
        dataBaixa: DATA,
        tipo: "morte",
        motivo: "doenca",
        ...input,
      },
      ...extras,
    };
  }

  function pedidoExcluir(executorId: number, sessionVersion: number, animalId: number, extras: Partial<PedidoExclusaoAnimal> = {}): PedidoExclusaoAnimal {
    return { executorId, sessionVersionDaSessao: sessionVersion, animalId, ...extras };
  }

  async function baixar(corpo: PedidoBaixaAnimal, ganchos: Partial<IoBaixaAnimal> = {}) {
    const chamadas: number[] = [];
    const resultado = await baixarEEspelharAnimal(io(ganchos), corpo, {
      async baixar(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function excluir(corpo: PedidoExclusaoAnimal, ganchos: Partial<IoBaixaAnimal> = {}) {
    const chamadas: number[] = [];
    const resultado = await excluirEEspelharAnimal(io(ganchos), corpo, {
      async excluir(userId) { chamadas.push(userId); },
    });
    return { resultado, chamadas };
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function baixas(animalId?: number) {
    const filtro = animalId == null ? "" : " WHERE animalId = ?";
    const [linhas] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM animal_baixas${filtro} ORDER BY id`,
      animalId == null ? [] : [animalId],
    );
    return linhas;
  }

  it("1. principal registra morte", async () => {
    const { resultado, chamadas } = await baixar(pedido(1, 3));
    expect(resultado).toMatchObject({ ok: true, status: "morto" });
    expect(chamadas).toEqual([1]);
    const linha = await animal(51);
    expect(String(linha?.status)).toBe("morto");
    expect(Number(linha?.userId)).toBe(1);
    expect(Number(linha?.loteId)).toBe(100);
    expect(Number(linha?.pastoId)).toBe(1000);
    expect(Number(linha?.fazendaId)).toBe(10);
    expect(String(linha?.brinco)).toBe("BR-51");
    const evento = (await baixas(51))[0];
    expect(Number(evento?.userId)).toBe(1);
    expect(String(evento?.tipo)).toBe("morte");
    expect(evento?.vendaId).toBeNull();
  });

  it("2. funcionário autorizado", async () => {
    const { resultado } = await baixar(pedido(2, 1));
    expect(resultado.ok).toBe(true);
    expect(String((await baixas(51))[0]?.usuarioNome)).toBe("Funcionario Curral");
    expect(Number((await baixas(51))[0]?.userId)).toBe(1);
  });

  it("3. funcionário sem permissão", async () => {
    const { resultado, chamadas } = await baixar(pedido(3, 1));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(chamadas).toEqual([]);
    expect(String((await animal(51))?.status)).toBe("ativo");
  });

  it("4. fazenda não concedida", async () => {
    const { resultado } = await baixar(pedido(5, 1));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(await baixas(51)).toHaveLength(0);
  });

  it("5. animal de outro titular", async () => {
    const { resultado } = await baixar(pedido(1, 3, { animalId: 54, fazendaId: 40 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_BAIXA_AUSENTE });
    expect(String((await animal(54))?.status)).toBe("ativo");
  });

  it("6. animal inexistente", async () => {
    const { resultado } = await baixar(pedido(1, 3, { animalId: 999 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_BAIXA_AUSENTE });
  });

  it("7. animal com baixa anterior", async () => {
    const { resultado } = await baixar(pedido(1, 3, { animalId: 53 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_SAIDA_MORTE_DUPLICADA });
    expect(await baixas(53)).toHaveLength(1);
    expect(String((await animal(53))?.status)).toBe("ativo");
  });

  it("8. animal vendido", async () => {
    const { resultado } = await baixar(pedido(1, 3, { animalId: 52 }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_BAIXA_ANIMAL_INATIVO });
    expect(await baixas(52)).toHaveLength(0);
  });

  it("9. transferência externa e fazenda manipulada", async () => {
    const externa = await baixar(pedido(1, 3, { animalId: 50, tipo: "transferencia", destino: "Sítio do vizinho", motivo: null }));
    expect(externa.resultado).toMatchObject({ ok: true, status: "transferido" });
    expect(String((await animal(50))?.status)).toBe("transferido");
    expect(String((await baixas(50))[0]?.destino)).toBe("Sítio do vizinho");
    expect((await baixas(50))[0]?.vendaId).toBeNull();
    const fazenda = await baixar(pedido(1, 3, { fazendaId: 20 }));
    expect(fazenda.resultado).toMatchObject({ ok: false, mensagem: MSG_BAIXA_FAZENDA_DIVERGENTE });
    expect(String((await animal(51))?.status)).toBe("ativo");
  });

  it("10. venda pelo manejo não grava baixa nem título", async () => {
    const { resultado, chamadas } = await baixar(pedido(1, 3, { tipo: "venda", destino: "Comprador" }));
    expect(resultado).toMatchObject({ ok: false, mensagem: MSG_VENDA_VIA_MANEJO_BLOQUEADA });
    expect(chamadas).toEqual([]);
    expect(await baixas(51)).toHaveLength(0);
    expect(String((await animal(51))?.status)).toBe("ativo");
  });

  it("11. duas baixas ao mesmo tempo", async () => {
    const [ida, volta] = await Promise.all([
      baixar(pedido(1, 3)),
      baixar(pedido(1, 3)),
    ]);
    const sucessos = [ida, volta].filter((item) => item.resultado.ok);
    expect(sucessos).toHaveLength(1);
    expect(await baixas(51)).toHaveLength(1);
    expect(String((await animal(51))?.status)).toBe("morto");
  });

  it("12. falha na gravação desfaz a baixa", async () => {
    await expect(baixarAnimalAutorizado(io({
      async aposRegistro() { throw new Error("registro fora"); },
    }), pedido(1, 3))).rejects.toThrow("registro fora");
    expect(String((await animal(51))?.status)).toBe("ativo");
    expect(await baixas(51)).toHaveLength(0);
  });

  it("13. falha na ocupação também volta tudo", async () => {
    await expect(baixarAnimalAutorizado(io({
      async aposOcupacao() { throw new Error("ocupacao fora"); },
    }), pedido(1, 3, { animalId: 56 }))).rejects.toThrow("ocupacao fora");
    expect(String((await animal(56))?.status)).toBe("ativo");
    expect(await baixas(56)).toHaveLength(0);
  });

  it("14. concorrência com transferência entre fazendas", async () => {
    const pedidoTransferencia: PedidoTransferenciaFazenda = {
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
    const [baixa, mudanca] = await Promise.all([
      baixar(pedido(1, 3)),
      transferirEEspelharAnimalFazenda(ioMovimento(), pedidoTransferencia, { async transferir() {} }),
    ]);
    const linha = await animal(51);
    if (baixa.resultado.ok) {
      expect(mudanca.ok).toBe(false);
      expect(String(linha?.status)).toBe("morto");
      expect(Number(linha?.fazendaId)).toBe(10);
      expect(await baixas(51)).toHaveLength(1);
    } else {
      expect(mudanca.ok).toBe(true);
      expect(String(linha?.status)).toBe("ativo");
      expect(Number(linha?.fazendaId)).toBe(20);
      expect(await baixas(51)).toHaveLength(0);
    }
    expect(Number(linha?.userId)).toBe(1);
  });

  it("15. uma venda que entra no meio não deixa duas baixas", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = baixar(pedido(1, 3), {
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
      await externa.query("UPDATE animais SET status = 'vendido' WHERE id = 51");
      await externa.query(`
        INSERT INTO animal_baixas
          (userId, animalId, fazendaId, tipo, dataBaixa, destino, motivo, usuarioNome, vendaId, status)
        VALUES (1, 51, 10, 'venda', '2026-11-10', 'Comprador', 'Venda #9', 'caixa', 9, 'ativa')
      `);
      await externa.commit();
    } finally {
      externa.release();
    }
    liberar();
    const { resultado } = await operacao;
    expect(resultado.ok).toBe(false);
    expect(String((await animal(51))?.status)).toBe("vendido");
    const linhas = await baixas(51);
    expect(linhas).toHaveLength(1);
    expect(String(linhas[0]?.tipo)).toBe("venda");
    expect(Number(linhas[0]?.vendaId)).toBe(9);
  });

  it("16. preserva o histórico de lote e não mexe em financeiro", async () => {
    await pool.query(`
      INSERT INTO animal_lote_movimentacoes
        (id, userId, animalId, loteOrigemId, loteDestinoId, pastoOrigemId, pastoDestinoId, fazendaId, dataMovimentacao, usuarioNome)
      VALUES (4, 1, 51, NULL, 100, NULL, 1000, 10, '2026-01-01', 'antes')
    `);
    await baixar(pedido(1, 3));
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animal_lote_movimentacoes WHERE id = 4");
    expect(String(linhas[0]?.dataMovimentacao).slice(0, 10)).toBe("2026-01-01");
    expect(Number(linhas[0]?.loteDestinoId)).toBe(100);
    expect((await baixas(51))[0]?.vendaId).toBeNull();
    expect(Number((await animal(58))?.id)).toBe(58);
    expect(Number((await animal(59))?.id)).toBe(59);
  });

  it("17. espelho só depois da confirmação", async () => {
    const ok = await baixar(pedido(1, 3));
    expect(ok.chamadas).toEqual([1]);
    await pool.query("UPDATE animais SET status = 'ativo' WHERE id = 51");
    await pool.query("DELETE FROM animal_baixas WHERE animalId = 51");
    await expect(baixarEEspelharAnimal(io(), pedido(1, 3), {
      async baixar() { throw new Error("espelho fora"); },
    })).resolves.toMatchObject({ ok: true, status: "morto" });
    expect(String((await animal(51))?.status)).toBe("morto");
    expect(await baixas(51)).toHaveLength(1);
  });

  it("18. administrador principal ignora o titular da tela", async () => {
    const { resultado } = await baixar(pedido(1, 3, {}, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(resultado.ok).toBe(true);
    expect(Number((await baixas(51))[0]?.userId)).toBe(1);
  });

  it("19. pasto deixa de contar o animal baixado", async () => {
    const { resultado } = await baixar(pedido(1, 3, { animalId: 56 }));
    expect(resultado.ok).toBe(true);
    const [pasto] = await pool.query<RowDataPacket[]>("SELECT status FROM pastos WHERE id = 1200");
    expect(String(pasto[0]?.status)).toBe("descanso");
    const [curral] = await pool.query<RowDataPacket[]>("SELECT status FROM pastos WHERE id = 1000");
    expect(String(curral[0]?.status)).toBe("ativo");
    expect(Number((await animal(56))?.loteId)).toBe(100);
    expect(Number((await animal(56))?.pastoId)).toBe(1200);
  });

  it("20. exclusão do cadastro limpo", async () => {
    const principal = await excluir(pedidoExcluir(1, 3, 50));
    expect(principal.resultado).toMatchObject({ ok: true, userId: 1 });
    expect(principal.chamadas).toEqual([1]);
    expect(await animal(50)).toBeNull();
    const funcionario = await excluir(pedidoExcluir(2, 1, 58));
    expect(funcionario.resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_EXCLUSAO_BLOQUEADA });
    expect(Number((await animal(58))?.id)).toBe(58);
  });

  it("21. exclusão sem permissão, com compra e de animal vendido", async () => {
    const sem = await excluir(pedidoExcluir(3, 1, 50));
    expect(sem.resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    const compra = await excluir(pedidoExcluir(1, 3, 59));
    expect(compra.resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_EXCLUSAO_BLOQUEADA });
    const vendido = await excluir(pedidoExcluir(1, 3, 52));
    expect(vendido.resultado).toMatchObject({ ok: false, mensagem: MSG_ANIMAL_EXCLUSAO_BLOQUEADA });
    expect(await animal(50)).not.toBeNull();
    expect(await animal(59)).not.toBeNull();
    expect(await animal(52)).not.toBeNull();
  });

  it("22. concorrência com a edição cadastral", async () => {
    let liberar: () => void = () => undefined;
    const segue = new Promise<void>((resolver) => { liberar = resolver; });
    let avisou: () => void = () => undefined;
    const travou = new Promise<void>((resolver) => { avisou = resolver; });
    const operacao = baixar(pedido(1, 3), {
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
    expect(await baixas(51)).toHaveLength(1);
  });

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
    brinco: linha.brinco == null ? null : String(linha.brinco),
  };
}

function consultas(conn: mysql.PoolConnection): ConsultaBaixaAnimal {
  return {
    ...autenticacao(conn),
    async lote(id) {
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
    async espiar(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, loteId, pastoId, status, brinco FROM animais WHERE id = ?",
        [id],
      );
      return linhas[0] ? mapear(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, loteId, pastoId, status, brinco FROM animais WHERE id = ? AND userId = ? FOR UPDATE",
        [id, titularUserId],
      );
      return linhas[0] ? mapear(linhas[0]) : null;
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
      await conn.query(
        "UPDATE animais SET status = ? WHERE id = ? AND userId = ? AND status = 'ativo'",
        [status, id, titularUserId],
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
      await conn.query("UPDATE pastos SET status = ? WHERE id = ? AND userId = ?", [ocupa ? "ativo" : "descanso", pastoId, titularUserId]);
    },
    async temRastro(animalId, titularUserId) {
      const tabelas = [
        ["SELECT id FROM pesagens WHERE userId = ? AND animalId = ? LIMIT 1", [titularUserId, animalId]],
        ["SELECT id FROM animal_lote_movimentacoes WHERE userId = ? AND animalId = ? LIMIT 1", [titularUserId, animalId]],
        ["SELECT id FROM animal_baixas WHERE userId = ? AND animalId = ? LIMIT 1", [titularUserId, animalId]],
        ["SELECT id FROM compra_recebimentos WHERE user_id = ? AND animal_id = ? LIMIT 1", [titularUserId, animalId]],
      ] as const;
      for (const [sqlTexto, params] of tabelas) {
        const [linhas] = await conn.query<RowDataPacket[]>(sqlTexto, [...params]);
        if (linhas.length > 0) return true;
      }
      return false;
    },
    async excluirAnimal(id, titularUserId) {
      await conn.query("DELETE FROM animais WHERE id = ? AND userId = ?", [id, titularUserId]);
    },
  };
}

function consultasMovimento(conn: mysql.PoolConnection): ConsultaAnimaisLote {
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
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY id`,
        ids,
      );
      return linhas.map((linha) => ({ ...mapear(linha), brinco: null }));
    },
    async animais(ids, titularUserId) {
      if (ids.length === 0) return [];
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status FROM animais
         WHERE userId = ? AND id IN (${ids.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`,
        [titularUserId, ...ids],
      );
      return linhas.map((linha) => ({ ...mapear(linha), brinco: null }));
    },
    async baixaAtiva(animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1",
        [animalId],
      );
      return linhas[0]?.dataBaixa == null ? null : String(linhas[0].dataBaixa);
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
    async sincronizarStatusPasto(pastoId, titularUserId) {
      await consultas(conn).sincronizarStatusPasto(pastoId, titularUserId);
    },
  };
}
