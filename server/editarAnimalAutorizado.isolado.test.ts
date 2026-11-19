import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LinhaAnimalAtivo, LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  MSG_EDICAO_ESTRUTURAL,
  MSG_EDICAO_IDENTIFICACAO,
  MSG_EDICAO_PESO_ATUAL,
  MSG_STATUS_ALTERACAO_DIRETA,
  editarEEspelharAnimal,
  evidenciasDe,
  type AnimalParaEdicao,
  type ConsultaEdicaoAnimal,
  type EdicaoAnimalInput,
  type EspelhoEdicaoAnimal,
  type IoEdicaoAnimal,
  type PedidoEdicaoAnimal,
} from "./editarAnimalAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4m-edicao";
const PORTA = 3338;
const SENHA = "isolado-h4m";
const BANCO = "fd_h4m";

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
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lotes (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(100) NOT NULL,
  fazendaId int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animais (
  id int NOT NULL,
  userId int NOT NULL,
  brinco varchar(50) NULL,
  brincoEletronico varchar(80) NULL,
  nome varchar(100) NULL,
  raca varchar(100) NULL,
  sexo enum('macho','femea') NOT NULL,
  dataNascimento date NULL,
  pesoAtual decimal(8,2) NULL,
  status enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
  loteId int NULL,
  fazendaId int NULL,
  pastoId int NULL,
  categoria varchar(50) NULL,
  pelagem varchar(80) NULL,
  marca varchar(80) NULL,
  dataDesmama date NULL,
  castrado tinyint(1) NULL,
  dataEntrada date NULL,
  pesoEntrada decimal(8,2) NULL,
  produtorOrigem varchar(200) NULL,
  precoKg decimal(10,2) NULL,
  frete decimal(10,2) NULL,
  sisbov varchar(50) NULL,
  dataRnd date NULL,
  rgn varchar(50) NULL,
  rgd varchar(50) NULL,
  rastreadoNascimento tinyint(1) NULL,
  maeId int NULL,
  paiId int NULL,
  pai varchar(200) NULL,
  mae varchar(200) NULL,
  observacoes text NULL,
  PRIMARY KEY (id),
  CONSTRAINT animais_pasto_fk FOREIGN KEY (pastoId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL,
  animalId int NOT NULL,
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

function pedido(executorId: number, sessionVersion: number, input: EdicaoAnimalInput, extras: Partial<PedidoEdicaoAnimal> = {}): PedidoEdicaoAnimal {
  return { executorId, sessionVersionDaSessao: sessionVersion, input, ...extras };
}

describe.sequential("animais.update autorizado em MySQL isolado", () => {
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
        (4, 'outro-titular-isolado', 'Outro Titular', 'outro@isolado.local', 'admin', 'principal', 4, 'ativo', 1);
      INSERT INTO fazendas (id, userId, nome) VALUES (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia');
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES (2, 10, 1), (3, 10, 1);
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'animais.editar', 1), (3, 1, 'animais.visualizar', 1);
      INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
        (1000, 1, 10, 'Piquete da sede'), (2000, 1, 20, 'Piquete do retiro'), (4000, 4, 40, 'Piquete alheio');
      INSERT INTO lotes (id, userId, nome, fazendaId) VALUES
        (100, 1, 'Lote da sede', 10), (200, 1, 'Lote do retiro', 20);
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1", port: PORTA, user: "root", password: SENHA, database: BANCO,
      dateStrings: true, connectionLimit: 4,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query(`
      INSERT INTO animais (id, userId, brinco, nome, sexo, status, fazendaId, loteId, pastoId, pesoAtual, categoria, raca) VALUES
        (50, 1, 'BR-50', 'Original', 'femea', 'ativo', 10, 100, 1000, 300.00, 'Novilha', 'Nelore'),
        (60, 1, 'BR-60', 'Retiro', 'macho', 'ativo', 20, 200, 2000, 280.00, 'Bezerro', 'Angus'),
        (70, 4, 'BR-70', 'Alheio', 'femea', 'ativo', 40, NULL, 4000, 250.00, 'Vaca', 'Guzera');
    `);
  });

  function io(hook?: () => Promise<void>): IoEdicaoAnimal {
    return {
      aposAtualizar: hook,
      async emTransacao(fn) {
        afirmarBancoDescartavel(alvo());
        const conn = await pool.getConnection();
        try {
          const [banco] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
          if (String(banco[0]?.nome) !== BANCO) throw new Error("Conexão recusada: banco inesperado.");
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

  async function editar(corpo: PedidoEdicaoAnimal, hook?: () => Promise<void>) {
    const chamadas: number[] = [];
    const espelho: EspelhoEdicaoAnimal = {
      async atualizar(userId) {
        chamadas.push(userId);
      },
    };
    const resultado = await editarEEspelharAnimal(io(hook), corpo, espelho);
    return { resultado, chamadas };
  }

  async function linha(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  it("1. principal edita o animal da própria fazenda", async () => {
    const { resultado, chamadas } = await editar(pedido(1, 3, {
      id: 50, observacoes: "Ajuste do cadastro", fazendaId: 10,
    }));
    expect(resultado.ok).toBe(true);
    expect(texto((await linha(50))?.observacoes)).toBe("Ajuste do cadastro");
    expect(Number((await linha(50))?.fazendaId)).toBe(10);
    expect(chamadas).toEqual([1]);
  });

  it("2. funcionário autorizado edita animal da fazenda concedida", async () => {
    const { resultado, chamadas } = await editar(pedido(2, 1, {
      id: 50, marca: "C1",
    }, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: ["animais.criar"],
      fazendasInformadasPeloCliente: [20],
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(2);
    expect(texto((await linha(50))?.marca)).toBe("C1");
    expect(chamadas).toEqual([1]);
  });

  it("3. funcionário sem permissão é recusado", async () => {
    const { resultado, chamadas } = await editar(pedido(3, 1, {
      id: 50, observacoes: "nao",
    }, { permissoesInformadasPeloCliente: ["animais.editar"] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect((await linha(50))?.observacoes).toBeNull();
    expect(chamadas).toEqual([]);
  });

  it("4. animal de outro titular não é editado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 70, nome: "Invasao" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    expect(texto((await linha(70))?.nome)).toBe("Alheio");
  });

  it("5. animal de fazenda não concedida é recusado", async () => {
    const { resultado } = await editar(pedido(2, 1, { id: 60, nome: "Invasao" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(texto((await linha(60))?.nome)).toBe("Retiro");
  });

  it("6. animal inexistente é recusado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 99999, nome: "Ninguem" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "nao_encontrado" });
  });

  it("7. altera campos cadastrais e mantém fazenda, lote, pasto e status", async () => {
    const { resultado } = await editar(pedido(1, 3, {
      id: 50,
      nome: "Mimosa",
      raca: "Tabapua",
      categoria: "Vaca",
      observacoes: "Cadastro revisto",
      pelagem: "Amarela",
      marca: "M9",
      sexo: "macho",
      dataNascimento: "2024-01-15",
      dataEntrada: "2025-02-01",
      dataRnd: "2024-03-01",
      pesoEntrada: "280.00",
      produtorOrigem: "Sitio Esperanca",
      precoKg: "12.50",
      frete: "150.00",
      sisbov: "105000000000001",
      rgn: "RGN1",
      rgd: "RGD1",
      rastreadoNascimento: true,
      pai: "Pai texto",
      mae: "Mae texto",
      fazendaId: 10,
    }));
    expect(resultado.ok).toBe(true);
    const gravado = await linha(50);
    expect(texto(gravado?.nome)).toBe("Mimosa");
    expect(texto(gravado?.raca)).toBe("Tabapua");
    expect(texto(gravado?.categoria)).toBe("Vaca");
    expect(texto(gravado?.observacoes)).toBe("Cadastro revisto");
    expect(texto(gravado?.pelagem)).toBe("Amarela");
    expect(texto(gravado?.marca)).toBe("M9");
    expect(texto(gravado?.sexo)).toBe("macho");
    expect(texto(gravado?.dataNascimento)).toBe("2024-01-15");
    expect(texto(gravado?.dataEntrada)).toBe("2025-02-01");
    expect(texto(gravado?.pesoEntrada)).toBe("280.00");
    expect(texto(gravado?.produtorOrigem)).toBe("Sitio Esperanca");
    expect(texto(gravado?.sisbov)).toBe("105000000000001");
    expect(texto(gravado?.pai)).toBe("Pai texto");
    expect(texto(gravado?.mae)).toBe("Mae texto");
    expect(Number(gravado?.rastreadoNascimento)).toBe(1);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.loteId)).toBe(100);
    expect(Number(gravado?.pastoId)).toBe(1000);
    expect(texto(gravado?.status)).toBe("ativo");
    expect(texto(gravado?.brinco)).toBe("BR-50");
    expect(texto(gravado?.pesoAtual)).toBe("300.00");
  });

  it("8. trocar a fazenda pela edição é recusado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 50, fazendaId: 20, nome: "Mudou" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "alteracao_estrutural", campo: "fazendaId" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_EDICAO_ESTRUTURAL);
    const gravado = await linha(50);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(texto(gravado?.nome)).toBe("Original");
  });

  it("9. trocar o lote é recusado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 50, loteId: 200 }));
    expect(resultado).toMatchObject({ ok: false, motivo: "alteracao_estrutural", campo: "loteId" });
    expect(Number((await linha(50))?.loteId)).toBe(100);
  });

  it("10. trocar o pasto é recusado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 50, pastoId: 2000 }));
    expect(resultado).toMatchObject({ ok: false, motivo: "alteracao_estrutural", campo: "pastoId" });
    expect(Number((await linha(50))?.pastoId)).toBe(1000);
  });

  it("11. status, peso atual e brinco não mudam por esta edição", async () => {
    const status = await editar(pedido(1, 3, { id: 50, status: "vendido" }));
    expect(status.resultado).toMatchObject({ ok: false, motivo: "situacao_preservada" });
    expect(status.resultado.ok ? "" : status.resultado.mensagem).toBe(MSG_STATUS_ALTERACAO_DIRETA);
    const peso = await editar(pedido(1, 3, { id: 50, pesoAtual: "999" }));
    expect(peso.resultado).toMatchObject({ ok: false, campo: "pesoAtual" });
    expect(peso.resultado.ok ? "" : peso.resultado.mensagem).toBe(MSG_EDICAO_PESO_ATUAL);
    const brinco = await editar(pedido(1, 3, { id: 50, brinco: "OUTRO" }));
    expect(brinco.resultado).toMatchObject({ ok: false, campo: "brinco" });
    expect(brinco.resultado.ok ? "" : brinco.resultado.mensagem).toBe(MSG_EDICAO_IDENTIFICACAO);
    const gravado = await linha(50);
    expect(texto(gravado?.status)).toBe("ativo");
    expect(texto(gravado?.pesoAtual)).toBe("300.00");
    expect(texto(gravado?.brinco)).toBe("BR-50");
  });

  it("12. o histórico anterior permanece", async () => {
    await pool.query(
      "INSERT INTO animal_lote_movimentacoes (id, animalId, observacoes) VALUES (1, 50, 'entrada antiga')",
    );
    const { resultado } = await editar(pedido(1, 3, { id: 50, observacoes: "So o cadastro" }));
    expect(resultado.ok).toBe(true);
    const [historico] = await pool.query<RowDataPacket[]>("SELECT observacoes FROM animal_lote_movimentacoes");
    expect(historico).toHaveLength(1);
    expect(historico[0]?.observacoes).toBe("entrada antiga");
    expect(texto((await linha(50))?.observacoes)).toBe("So o cadastro");
  });

  it("13. falha no meio desfaz a edição e não chama o espelho", async () => {
    const chamadas: number[] = [];
    await expect(editarEEspelharAnimal(io(async () => {
      throw new Error("falha simulada na edicao");
    }), pedido(1, 3, { id: 50, nome: "Quebrado" }), {
      async atualizar(userId) {
        chamadas.push(userId);
      },
    })).rejects.toThrow("falha simulada na edicao");
    expect(chamadas).toEqual([]);
    expect(texto((await linha(50))?.nome)).toBe("Original");
  });

  it("14. duas edições no mesmo animal não se misturam", async () => {
    const trava = await pool.getConnection();
    try {
      await trava.beginTransaction();
      await trava.query("SELECT id FROM animais WHERE id = 50 FOR UPDATE");
      const pendente = editar(pedido(1, 3, { id: 50, observacoes: "segunda" }));
      await new Promise((resolver) => setTimeout(resolver, 400));
      await trava.query("UPDATE animais SET nome = 'Travado' WHERE id = 50");
      await trava.commit();
      const { resultado } = await pendente;
      expect(resultado.ok).toBe(true);
      const gravado = await linha(50);
      expect(texto(gravado?.nome)).toBe("Travado");
      expect(texto(gravado?.observacoes)).toBe("segunda");
    } finally {
      await trava.release();
    }
  });

  it("15. o salvamento da tela, com a fazenda atual reenviada, continua válido", async () => {
    const { resultado } = await editar(pedido(1, 3, {
      id: 50,
      nome: "BR-50",
      sexo: "femea",
      categoria: "Novilha",
      raca: "Nelore",
      pelagem: null,
      marca: null,
      dataNascimento: "2023-06-01",
      dataEntrada: "2024-01-10",
      pesoEntrada: "210",
      produtorOrigem: null,
      precoKg: null,
      frete: null,
      sisbov: null,
      dataRnd: null,
      rgn: null,
      rgd: null,
      rastreadoNascimento: false,
      pai: null,
      mae: null,
      observacoes: "Salvo pela tela",
      fazendaId: 10,
    }));
    expect(resultado.ok).toBe(true);
    const gravado = await linha(50);
    expect(texto(gravado?.observacoes)).toBe("Salvo pela tela");
    expect(texto(gravado?.dataNascimento)).toBe("2023-06-01");
    expect(texto(gravado?.pesoEntrada)).toBe("210.00");
    expect(gravado?.pelagem).toBeNull();
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.loteId)).toBe(100);
    expect(texto(gravado?.brinco)).toBe("BR-50");
  });

  it("16. administrador principal edita sem vínculo e sem permissão gravada", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 50, categoria: "Bezerra" }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.executorUserId).toBe(1);
    expect(resultado.userId).toBe(1);
    expect(texto((await linha(50))?.categoria)).toBe("Bezerra");
  });

  it("sexo com castração registrada continua bloqueado", async () => {
    await pool.query("UPDATE animais SET castrado = 1 WHERE id = 60");
    const { resultado } = await editar(pedido(1, 3, { id: 60, sexo: "femea" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sexo_bloqueado" });
    expect(texto((await linha(60))?.sexo)).toBe("macho");
  });
});

function consultas(conn: mysql.PoolConnection): ConsultaEdicaoAnimal {
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
    async animal(id): Promise<AnimalParaEdicao | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, userId, fazendaId, loteId, pastoId, status, sexo, castrado, brinco,
                brincoEletronico, pesoAtual, dataDesmama, maeId, paiId
         FROM animais WHERE id = ? FOR UPDATE`,
        [id],
      );
      const linha = linhas[0];
      if (!linha || (linha.sexo !== "macho" && linha.sexo !== "femea")) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        loteId: linha.loteId == null ? null : Number(linha.loteId),
        pastoId: linha.pastoId == null ? null : Number(linha.pastoId),
        status: linha.status == null ? null : String(linha.status),
        sexo: linha.sexo,
        castrado: linha.castrado == null ? null : Number(linha.castrado),
        brinco: linha.brinco == null ? null : String(linha.brinco),
        brincoEletronico: linha.brincoEletronico == null ? null : String(linha.brincoEletronico),
        pesoAtual: linha.pesoAtual == null ? null : String(linha.pesoAtual),
        dataDesmama: linha.dataDesmama == null ? null : String(linha.dataDesmama),
        maeId: linha.maeId == null ? null : Number(linha.maeId),
        paiId: linha.paiId == null ? null : Number(linha.paiId),
      };
    },
    async loteFazenda(loteId, titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT fazendaId FROM lotes WHERE id = ? AND userId = ? FOR UPDATE",
        [loteId, titularUserId],
      );
      const valor = linhas[0]?.fazendaId;
      return valor == null ? null : Number(valor);
    },
    async animaisAtivos(titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id, brinco, brincoEletronico, status, fazendaId, loteId
         FROM animais WHERE userId = ? AND status = 'ativo'`,
        [titularUserId],
      );
      return linhas.map((linha): LinhaAnimalAtivo => ({
        id: Number(linha.id),
        brinco: linha.brinco == null ? null : String(linha.brinco),
        brincoEletronico: linha.brincoEletronico == null ? null : String(linha.brincoEletronico),
        status: linha.status == null ? null : String(linha.status),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        loteId: linha.loteId == null ? null : Number(linha.loteId),
      }));
    },
    async lotesDoTitular(titularUserId) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, fazendaId FROM lotes WHERE userId = ?",
        [titularUserId],
      );
      return linhas.map((linha) => ({
        id: Number(linha.id),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
      }));
    },
    async evidenciasSexo(_titularUserId, animalId, castradoAtual) {
      return evidenciasDe({ animalId, castradoAtual });
    },
    async atualizarAnimal(id, titularUserId, patch) {
      const permitidas = new Set([
        "nome", "raca", "categoria", "observacoes", "pelagem", "marca", "sexo",
        "dataNascimento", "dataEntrada", "dataRnd", "pesoEntrada", "produtorOrigem",
        "precoKg", "frete", "sisbov", "rgn", "rgd", "rastreadoNascimento", "pai", "mae",
      ]);
      const pares = Object.entries(patch);
      if (pares.length === 0) return;
      for (const [coluna] of pares) {
        if (!permitidas.has(coluna)) throw new Error(`Coluna recusada: ${coluna}`);
      }
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      await conn.query(
        `UPDATE animais SET ${atribuicao} WHERE id = ? AND userId = ?`,
        [...pares.map(([, valor]) => valor), id, titularUserId],
      );
    },
  };
}
