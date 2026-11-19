import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MSG_CASTRACAO_DUPLICADA, MSG_CASTRACAO_INATIVO } from "../shared/castracaoManejo";
import { excluirEEspelharAnimal, baixarEEspelharAnimal, type ConsultaBaixaAnimal, type IoBaixaAnimal, type PedidoBaixaAnimal, type PedidoExclusaoAnimal } from "./baixarAnimalAutorizado";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import type { ConsultaAnimaisLote, IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";
import { pesarEEspelharAnimal, type ConsultaPesagemAnimal, type IoPesagemAnimal, type PedidoPesagem } from "./pesarAnimalAutorizado";
import {
  MSG_ANIMAL_MANEJO_AUSENTE,
  MSG_SEM_FAZENDA_MANEJO,
  castrarAnimalAutorizado,
  castrarEEspelharAnimal,
  registrarReproducaoSimplesAutorizado,
  registrarReproducaoSimplesEEspelhar,
  type ConsultaManejo,
  type IoManejo,
  type PedidoCastracao,
  type PedidoReproducaoSimples,
} from "./registrarManejoAutorizado";
import { transferirEEspelharAnimalFazenda, type PedidoTransferenciaFazenda } from "./transferirAnimalFazendaAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4w-sanidade";
const PORTA = 3348;
const SENHA = "isolado-h4w";
const BANCO = "fd_h4w";
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
  categoria varchar(50) NULL, sexo varchar(20) NULL, castrado tinyint(1) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE saude_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, animalId int NOT NULL,
  tipo varchar(50) NOT NULL, descricao text NULL, medicamento varchar(200) NULL,
  veterinario varchar(200) NULL, dataRegistro date NOT NULL, observacoes text NULL,
  status varchar(20) NULL, PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE reproducao_registros (
  id int NOT NULL AUTO_INCREMENT, userId int NOT NULL, femeaId int NOT NULL,
  machoId int NULL, tipo varchar(50) NOT NULL, dataCobertura date NOT NULL,
  dataPrevistoParto date NULL, resultado varchar(50) NULL, observacoes text NULL,
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
  usuarioNome varchar(200) NULL, vendaId int NULL, status varchar(20) NOT NULL,
  PRIMARY KEY (id)
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

describe.sequential("sanidade e reprodução em MySQL isolado", () => {
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
        (2, 1, 'saude.criar', 1),
        (2, 1, 'reproducao.criar', 1),
        (3, 1, 'saude.visualizar', 1),
        (3, 1, 'reproducao.visualizar', 1),
        (5, 1, 'saude.criar', 1),
        (5, 1, 'reproducao.criar', 1)
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
    await pool.query("DELETE FROM saude_registros");
    await pool.query("DELETE FROM reproducao_registros");
    await pool.query("DELETE FROM pesagens");
    await pool.query("DELETE FROM animal_baixas");
    await pool.query("DELETE FROM animal_lote_movimentacoes");
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
        (id, userId, loteId, fazendaId, pastoId, status, brinco, dataNascimento, categoria, sexo, castrado, pesoAtual)
      VALUES
        (70, 1, 100, 10, 1000, 'ativo', 'BR-70', '2024-01-10', 'Boi', 'macho', NULL, 420),
        (71, 1, 100, 10, 1000, 'ativo', 'BR-71', '2024-01-10', 'Vaca', 'femea', NULL, 430),
        (72, 1, 100, 10, 1000, 'vendido', 'BR-72', '2024-01-10', 'Boi', 'macho', NULL, 400),
        (73, 4, 400, 40, 4000, 'ativo', 'BR-73', '2024-01-10', 'Boi', 'macho', NULL, 390),
        (74, 1, 100, 10, 1000, 'ativo', 'BR-74', '2024-01-10', 'Boi', 'macho', NULL, 410),
        (75, 1, 100, 10, 1000, 'ativo', 'BR-75', '2024-01-10', 'Vaca', 'femea', NULL, 440),
        (76, 1, 100, 10, 1000, 'ativo', 'BR-76', '2024-01-10', 'Boi', 'macho', NULL, 415),
        (77, 1, 100, 10, 1000, 'ativo', 'BR-77', '2024-01-10', 'Boi', 'macho', NULL, 405),
        (78, 1, 100, 10, 1000, 'ativo', 'BR-78', '2024-01-10', 'Vaca', 'femea', NULL, 435),
        (79, 1, NULL, 10, NULL, 'ativo', 'BR-79', '2024-01-10', 'Boi', 'macho', NULL, 400),
        (80, 1, 100, 10, 1000, 'vendido', 'BR-80', '2024-01-10', 'Vaca', 'femea', NULL, 420),
        (81, 1, 100, 10, 1000, 'vendido', 'BR-81', '2024-01-10', 'Vaca', 'femea', NULL, 420)
    `);
    await pool.query(`
      INSERT INTO animal_baixas
        (userId, animalId, fazendaId, tipo, dataBaixa, motivo, usuarioNome, vendaId, status)
      VALUES
        (1, 72, 10, 'venda', '2026-11-01', 'Venda', 'caixa', 1, 'ativa'),
        (1, 80, 10, 'venda', '2026-11-01', 'Venda', 'caixa', 2, 'ativa'),
        (1, 81, 10, 'venda', '2026-11-10', 'Venda', 'caixa', 3, 'ativa')
    `);
    await pool.query(`
      INSERT INTO saude_registros (userId, animalId, tipo, dataRegistro, status, veterinario)
      VALUES (1, 77, 'Vacina', '2026-10-01', 'ativo', 'Veterinario antigo')
    `);
    await pool.query(`
      INSERT INTO reproducao_registros (userId, femeaId, tipo, dataCobertura, resultado, observacoes)
      VALUES (1, 78, 'Cio', '2026-10-01', 'Realizado', 'registro antigo')
    `);
  });

  function io(ganchos: Partial<IoManejo> = {}): IoManejo {
    return {
      ...ganchos,
      async emTransacao(fn) {
        afirmarBancoDescartavel(alvo());
        const conn = await pool.getConnection();
        try {
          await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
          await conn.beginTransaction();
          try {
            const resultado = await fn(consultasManejo(conn));
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

  function pedidoCastracao(executorId: number, sessionVersion: number, animalId = 70, extras: Partial<PedidoCastracao> = {}): PedidoCastracao {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 1 ? "Administrador da conta" : "Funcionario Curral",
      input: { fazendaId: 10, animalId, dataCastracao: DATA, metodo: "cirurgica" },
      ...extras,
    };
  }

  function pedidoRepro(executorId: number, sessionVersion: number, animalId = 71, extras: Partial<PedidoReproducaoSimples> = {}): PedidoReproducaoSimples {
    return {
      executorId,
      sessionVersionDaSessao: sessionVersion,
      executorNome: executorId === 1 ? "Administrador da conta" : "Funcionario Curral",
      input: {
        animalId,
        fazendaId: 10,
        tipo: "Diagnóstico de prenhez",
        dataCobertura: DATA,
        resultado: "Prenha",
        responsavel: "Responsavel da tela",
        observacoes: "toque",
      },
      ...extras,
    };
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  async function saude(animalId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM saude_registros WHERE animalId = ? ORDER BY id",
      [animalId],
    );
    return linhas;
  }

  async function repro(animalId: number) {
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM reproducao_registros WHERE femeaId = ? ORDER BY id",
      [animalId],
    );
    return linhas;
  }

  it("1. principal castra e o funcionário autorizado também", async () => {
    const principal = await castrarEEspelharAnimal(io(), pedidoCastracao(1, 3), { async castrar() {} });
    expect(principal).toMatchObject({ ok: true, userId: 1, executorUserId: 1 });
    const linha = await animal(70);
    expect(Number(linha?.castrado)).toBe(1);
    expect(String(linha?.status)).toBe("ativo");
    const registros = await saude(70);
    expect(registros).toHaveLength(1);
    expect(String(registros[0]?.tipo)).toBe("Castração");
    expect(Number(registros[0]?.userId)).toBe(1);
    expect(String(registros[0]?.veterinario)).toBe("Administrador da conta");
    expect(String(registros[0]?.dataRegistro).slice(0, 10)).toBe(DATA);

    const funcionario = await castrarEEspelharAnimal(io(), pedidoCastracao(2, 1, 74), { async castrar(userId) {
      expect(userId).toBe(1);
    } });
    expect(funcionario).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    expect(Number((await saude(74))[0]?.userId)).toBe(1);
    expect(String((await saude(74))[0]?.veterinario)).toBe("Funcionario Curral");
  });

  it("2. sem permissão, fazenda não concedida, outro titular, animal ausente e vendido", async () => {
    expect(await castrarAnimalAutorizado(io(), pedidoCastracao(3, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await castrarAnimalAutorizado(io(), pedidoCastracao(5, 1))).toMatchObject({
      ok: false,
      motivo: "sem_fazenda",
      mensagem: MSG_SEM_FAZENDA_MANEJO,
    });
    expect(await castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 73))).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(await castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 999))).toMatchObject({
      ok: false,
      motivo: "nao_encontrado",
      mensagem: MSG_ANIMAL_MANEJO_AUSENTE,
    });
    expect(await castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 72))).toMatchObject({
      ok: false,
      mensagem: MSG_CASTRACAO_INATIVO,
    });
    expect(await saude(72)).toHaveLength(0);
    expect(Number((await animal(72))?.castrado ?? 0)).toBe(0);
  });

  it("3. histórico anterior permanece e a segunda castração não duplica", async () => {
    const resultado = await castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 77, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "comum",
      permissoesInformadasPeloCliente: [],
      fazendasInformadasPeloCliente: [40],
    }));
    expect(resultado).toMatchObject({ ok: true, userId: 1 });
    const registros = await saude(77);
    expect(registros).toHaveLength(2);
    expect(String(registros[0]?.tipo)).toBe("Vacina");
    expect(String(registros[0]?.veterinario)).toBe("Veterinario antigo");
    expect(String(registros[1]?.tipo)).toBe("Castração");
    const deNovo = await castrarAnimalAutorizado(io(), pedidoCastracao(2, 1, 77));
    expect(deNovo).toMatchObject({ ok: false, mensagem: MSG_CASTRACAO_DUPLICADA });
    expect(await saude(77)).toHaveLength(2);
  });

  it("4. diagnóstico grava no titular e preserva o registro antigo", async () => {
    const principal = await registrarReproducaoSimplesEEspelhar(io(), pedidoRepro(1, 3), { async reproduzir() {} });
    expect(principal).toMatchObject({ ok: true, userId: 1, executorUserId: 1 });
    const novo = await repro(71);
    expect(novo).toHaveLength(1);
    expect(String(novo[0]?.tipo)).toBe("Diagnóstico de prenhez");
    expect(String(novo[0]?.resultado)).toBe("Prenha");
    expect(Number(novo[0]?.userId)).toBe(1);
    expect(String(novo[0]?.dataCobertura).slice(0, 10)).toBe(DATA);
    expect(String(novo[0]?.observacoes)).toContain("Responsavel da tela");

    const funcionario = await registrarReproducaoSimplesAutorizado(io(), pedidoRepro(2, 1, 78));
    expect(funcionario).toMatchObject({ ok: true, userId: 1, executorUserId: 2 });
    const historico = await repro(78);
    expect(historico).toHaveLength(2);
    expect(String(historico[0]?.tipo)).toBe("Cio");
    expect(String(historico[0]?.observacoes)).toBe("registro antigo");
    expect(String(historico[1]?.tipo)).toBe("Diagnóstico de prenhez");

    expect(await registrarReproducaoSimplesAutorizado(io(), pedidoRepro(3, 1))).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(await repro(71)).toHaveLength(1);
  });

  it("5. vaca vendida só aceita diagnóstico até a data da baixa", async () => {
    const depois = await registrarReproducaoSimplesAutorizado(io(), pedidoRepro(1, 3, 80));
    expect(depois.ok).toBe(false);
    if (!depois.ok) expect(depois.mensagem).toContain("baixado");
    expect(await repro(80)).toHaveLength(0);
    const noDia = await registrarReproducaoSimplesAutorizado(io(), pedidoRepro(1, 3, 81));
    expect(noDia.ok).toBe(true);
    expect(await repro(81)).toHaveLength(1);
    expect(String((await animal(81))?.status)).toBe("vendido");
  });

  it("6. falha no meio desfaz castração e diagnóstico", async () => {
    await expect(castrarAnimalAutorizado(io({
      async aposRegistro() { throw new Error("saude fora"); },
    }), pedidoCastracao(1, 3))).rejects.toThrow("saude fora");
    expect(await saude(70)).toHaveLength(0);
    expect(await animal(70)).toMatchObject({ castrado: null, status: "ativo" });
    await expect(registrarReproducaoSimplesAutorizado(io({
      async aposRegistro() { throw new Error("repro fora"); },
    }), pedidoRepro(1, 3))).rejects.toThrow("repro fora");
    expect(await repro(71)).toHaveLength(0);
    expect(String((await animal(71))?.status)).toBe("ativo");
  });

  it("7. castração concorrente com baixa não deixa histórico órfão", async () => {
    const baixaPedido: PedidoBaixaAnimal = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: { fazendaId: 10, animalId: 74, dataBaixa: DATA, tipo: "morte", motivo: "doenca" },
    };
    const [castracao, baixa] = await Promise.all([
      castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 74)),
      baixarEEspelharAnimal(ioBaixa(), baixaPedido, { async baixar() {} }),
    ]);
    const linha = await animal(74);
    const registros = await saude(74);
    expect(linha).not.toBeNull();
    expect(registros.length).toBeLessThanOrEqual(1);
    if (!castracao.ok) expect(registros).toHaveLength(0);
    if (castracao.ok) expect(Number(linha?.castrado)).toBe(1);
    if (baixa.ok) expect(String(linha?.status)).toBe("morto");
    expect(Number(linha?.userId)).toBe(1);
  });

  it("8. diagnóstico concorrente com pesagem e transferência", async () => {
    const pesoPedido: PedidoPesagem = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { animalId: 75, peso: "455", data: DATA },
    };
    const [diagnostico, pesagem] = await Promise.all([
      registrarReproducaoSimplesAutorizado(io(), pedidoRepro(1, 3, 75)),
      pesarEEspelharAnimal(ioPesagem(), pesoPedido, { async pesar() {} }),
    ]);
    const linha = await animal(75);
    expect(linha).not.toBeNull();
    expect(Number(linha?.userId)).toBe(1);
    expect(await repro(75)).toHaveLength(diagnostico.ok ? 1 : 0);
    const [pesos] = await pool.query<RowDataPacket[]>("SELECT id FROM pesagens WHERE animalId = 75");
    expect(pesos).toHaveLength(pesagem.ok ? 1 : 0);
    if (pesagem.ok) expect(String(linha?.pesoAtual)).toBe("455.00");

    const mudancaPedido: PedidoTransferenciaFazenda = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: {
        fazendaOrigemId: 10,
        fazendaDestinoId: 20,
        animalId: 76,
        loteDestinoId: 200,
        pastoDestinoId: 2000,
        dataTransferencia: DATA,
      },
    };
    const [castracao, mudanca] = await Promise.all([
      castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 76)),
      transferirEEspelharAnimalFazenda(ioMovimento(), mudancaPedido, { async transferir() {} }),
    ]);
    const transferido = await animal(76);
    expect(transferido).not.toBeNull();
    expect(await saude(76)).toHaveLength(castracao.ok ? 1 : 0);
    if (castracao.ok) expect(Number(transferido?.castrado)).toBe(1);
    expect(Number(transferido?.fazendaId)).toBe(mudanca.ok ? 20 : 10);
    expect(String(transferido?.status)).toBe("ativo");
  });

  it("9. exclusão física antiga não deixa castração órfã", async () => {
    const exclusao: PedidoExclusaoAnimal = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      animalId: 79,
    };
    const [castracao, apagou] = await Promise.all([
      castrarAnimalAutorizado(io(), pedidoCastracao(1, 3, 79)),
      excluirEEspelharAnimal(ioExclusao(), exclusao, { async excluir() {} }),
    ]);
    const linha = await animal(79);
    const registros = await saude(79);
    if (linha == null) {
      expect(registros).toHaveLength(0);
      expect(apagou.ok).toBe(true);
    } else {
      expect(Number(linha.userId)).toBe(1);
      expect(registros).toHaveLength(castracao.ok ? 1 : 0);
    }
  });

  it("10. duas castrações ao mesmo tempo e banco indisponível", async () => {
    const [ida, volta] = await Promise.all([
      castrarAnimalAutorizado(io(), pedidoCastracao(1, 3)),
      castrarAnimalAutorizado(io(), pedidoCastracao(2, 1)),
    ]);
    expect([ida, volta].filter((item) => item.ok)).toHaveLength(1);
    expect(await saude(70)).toHaveLength(1);
    expect(Number((await animal(70))?.castrado)).toBe(1);
    await expect(castrarAnimalAutorizado({
      async emTransacao() {
        const erro = new Error("connect ECONNREFUSED 127.0.0.1:3306");
        (erro as { code?: string }).code = "ECONNREFUSED";
        throw erro;
      },
    }, pedidoCastracao(1, 3, 76))).rejects.toThrow(/ECONNREFUSED/);
    expect(await saude(76)).toHaveLength(0);
  });

  function ioBaixa(): IoBaixaAnimal {
    return transacao((conn) => consultasBaixa(conn, true));
  }

  function ioExclusao(): IoBaixaAnimal {
    return transacao((conn) => consultasBaixa(conn, false));
  }

  function ioPesagem(): IoPesagemAnimal {
    return transacao((conn) => consultasPesagem(conn));
  }

  function ioMovimento(): IoAnimaisLote {
    return transacao((conn) => consultasMovimento(conn));
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

function consultasManejo(conn: mysql.PoolConnection): ConsultaManejo {
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
        `SELECT id, userId, fazendaId, loteId, pastoId, status, sexo, castrado, categoria, dataNascimento
         FROM animais WHERE id = ?`,
        [id],
      );
      return linhas[0] ? mapearManejo(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status, sexo, castrado, categoria, dataNascimento
         FROM animais WHERE id = ? AND userId = ? FOR UPDATE`,
        [id, titularUserId],
      );
      return linhas[0] ? mapearManejo(linhas[0]) : null;
    },
    async baixaAtiva(animalId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT dataBaixa FROM animal_baixas WHERE animalId = ? AND status = 'ativa' LIMIT 1 FOR UPDATE",
        [animalId],
      );
      if (!linhas[0]) return null;
      return { dataBaixa: linhas[0].dataBaixa == null ? null : String(linhas[0].dataBaixa).slice(0, 10) };
    },
    async tiposSaude(animalId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT tipo FROM saude_registros WHERE userId = ? AND animalId = ?",
        [titularUserId, animalId],
      );
      return linhas.map((linha) => ({ tipo: linha.tipo == null ? null : String(linha.tipo) }));
    },
    async inserirSaude(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO saude_registros
          (userId, animalId, tipo, descricao, medicamento, veterinario, dataRegistro, observacoes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo')`,
        [row.userId, row.animalId, row.tipo, row.descricao ?? null, row.medicamento ?? null, row.veterinario ?? null, row.dataRegistro, row.observacoes ?? null],
      );
      return Number(resultado.insertId);
    },
    async marcarCastrado(id, titularUserId) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `UPDATE animais SET castrado = 1
         WHERE id = ? AND userId = ? AND status = 'ativo' AND (castrado IS NULL OR castrado = 0)`,
        [id, titularUserId],
      );
      return resultado.affectedRows > 0;
    },
    async inserirReproducao(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO reproducao_registros
          (userId, femeaId, machoId, tipo, dataCobertura, dataPrevistoParto, resultado, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.userId, row.femeaId, row.machoId ?? null, row.tipo, row.dataCobertura, row.dataPrevistoParto ?? null, row.resultado ?? null, row.observacoes ?? null],
      );
      return Number(resultado.insertId);
    },
  };
}

function mapearManejo(linha: RowDataPacket) {
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

function consultasPesagem(conn: mysql.PoolConnection): ConsultaPesagemAnimal {
  const base = consultasManejo(conn);
  return {
    ...autenticacao(conn),
    lote: base.lote,
    pasto: base.pasto,
    async espiar(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status, dataDesmama, dataNascimento, pesoAtual, categoria
         FROM animais WHERE id = ?`,
        [id],
      );
      return linhas[0] ? mapearPesagem(linhas[0]) : null;
    },
    async animal(id, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status, dataDesmama, dataNascimento, pesoAtual, categoria
         FROM animais WHERE id = ? AND userId = ? FOR UPDATE`,
        [id, titularUserId],
      );
      return linhas[0] ? mapearPesagem(linhas[0]) : null;
    },
    async baixaAtiva(animalId) {
      return base.baixaAtiva(animalId);
    },
    async eventosDesmama() { return []; },
    async pesagensDoAnimal() { return []; },
    async inserirPesagem(row) {
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO pesagens (userId, animalId, peso, data, observacoes, compraRecebimentoId)
         VALUES (?, ?, ?, ?, ?, NULL)`,
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

function mapearPesagem(linha: RowDataPacket) {
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

function consultasBaixa(conn: mysql.PoolConnection, gravar: boolean): ConsultaBaixaAnimal {
  const base = consultasManejo(conn);
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
      if (!gravar) throw new Error("a exclusão não grava baixa");
      const [resultado] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO animal_baixas
          (userId, animalId, fazendaId, tipo, dataBaixa, destino, motivo, observacoes, usuarioNome, vendaId, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ativa')`,
        [row.userId, row.animalId, row.fazendaId, row.tipo, row.dataBaixa, row.destino, row.motivo, row.observacoes, row.usuarioNome],
      );
      return Number(resultado.insertId);
    },
    async atualizarStatus(id, titularUserId, status) {
      if (!gravar) throw new Error("a exclusão não muda status");
      await conn.query("UPDATE animais SET status = ? WHERE id = ? AND userId = ?", [status, id, titularUserId]);
    },
    async sincronizarStatusPasto() {},
    async temRastro(animalId, titularUserId) {
      const [saude] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM saude_registros WHERE userId = ? AND animalId = ? LIMIT 1",
        [titularUserId, animalId],
      );
      const [repro] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM reproducao_registros WHERE userId = ? AND (femeaId = ? OR machoId = ?) LIMIT 1",
        [titularUserId, animalId, animalId],
      );
      const [pesos] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM pesagens WHERE userId = ? AND animalId = ? LIMIT 1",
        [titularUserId, animalId],
      );
      return saude.length + repro.length + pesos.length > 0;
    },
    async excluirAnimal(id, titularUserId) {
      await conn.query("DELETE FROM animais WHERE id = ? AND userId = ?", [id, titularUserId]);
    },
  };
}

function consultasMovimento(conn: mysql.PoolConnection): ConsultaAnimaisLote {
  const base = consultasManejo(conn);
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
