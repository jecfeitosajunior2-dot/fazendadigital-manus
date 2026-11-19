import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  cadastrarEEspelharLote,
  type ConsultaCadastroLote,
  type EspelhoCadastroLote,
  type IoCadastroLote,
  type LinhaInsercaoLote,
  type LoteFormInput,
  type PedidoCadastroLote,
  type ResultadoCadastroLote,
} from "./cadastroLoteAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4l-lote";
const PORTA = 3337;
const SENHA = "isolado-h4l";
const BANCO = "fd_h4l";

const ESQUEMA = `
CREATE TABLE users (
  id int NOT NULL,
  openId varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  email varchar(255) NULL,
  role enum('admin','user') NOT NULL DEFAULT 'user',
  papel enum('principal','secundario','comum') NOT NULL,
  titularUserId int NULL,
  situacao enum('convidado','ativo','inativo') NOT NULL,
  sessionVersion int NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fazendas (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(200) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fazendas_user_fk FOREIGN KEY (userId) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuario_fazendas (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pastos (
  id int NOT NULL,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  nome varchar(100) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT pastos_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lotes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  nome varchar(100) NOT NULL,
  sigla varchar(20) NULL,
  dataCriacao date NULL,
  descricao text NULL,
  localizacao varchar(200) NULL,
  capacidade int NULL,
  fazendaId int NULL,
  pastoAtualId int NULL,
  dataEntradaPasto date NULL,
  ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT lotes_user_fk FOREIGN KEY (userId) REFERENCES users (id),
  CONSTRAINT lotes_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id),
  CONSTRAINT lotes_pasto_atual_fk FOREIGN KEY (pastoAtualId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lote_pasto_movimentacoes (
  id int NOT NULL AUTO_INCREMENT,
  loteId int NOT NULL,
  pastoDestinoId int NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
    host: "127.0.0.1",
    port: PORTA,
    user: "root",
    password: SENHA,
    database: banco,
    multipleStatements: true,
    dateStrings: true,
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

type EspelhoObservado = EspelhoCadastroLote & { userIds: number[]; linhas: LinhaInsercaoLote[] };

function espelho(): EspelhoObservado {
  const observado: EspelhoObservado = {
    userIds: [],
    linhas: [],
    async criar(userId, row) {
      observado.userIds.push(userId);
      observado.linhas.push(row);
    },
  };
  return observado;
}

function pedido(
  executorId: number,
  sessionVersion: number,
  input: LoteFormInput,
  extras: Partial<PedidoCadastroLote> = {},
): PedidoCadastroLote {
  return { executorId, sessionVersionDaSessao: sessionVersion, input, ...extras };
}

describe.sequential("lotes.create autorizado em MySQL isolado", () => {
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
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
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
      INSERT INTO fazendas (id, userId, nome) VALUES
        (10, 1, 'Sede'), (20, 1, 'Retiro'), (40, 4, 'Alheia');
      INSERT INTO usuario_fazendas (userId, fazendaId, concedidoPorUserId) VALUES
        (2, 10, 1), (3, 10, 1);
      INSERT INTO usuario_permissoes (userId, titularUserId, permissao, concedidoPorUserId) VALUES
        (2, 1, 'lotes.criar', 1),
        (2, 1, 'lotes.visualizar', 1),
        (3, 1, 'lotes.visualizar', 1);
      INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
        (1000, 1, 10, 'Piquete da sede'),
        (2000, 1, 20, 'Piquete do retiro'),
        (4000, 4, 40, 'Piquete alheio');
    `);
    await conn.end();
    pool = mysql.createPool({
      host: "127.0.0.1",
      port: PORTA,
      user: "root",
      password: SENHA,
      database: BANCO,
      dateStrings: true,
      connectionLimit: 4,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await docker("rm", "-f", CONTAINER).catch(() => undefined);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("DELETE FROM lotes");
  });

  function io(hook?: () => Promise<void>): IoCadastroLote {
    return {
      aposInserirLote: hook,
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

  async function cadastrar(corpo: PedidoCadastroLote, hook?: () => Promise<void>) {
    const local = espelho();
    const resultado = await cadastrarEEspelharLote(io(hook), corpo, local);
    return { resultado, local };
  }

  async function contar() {
    const [lotes] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS qtd FROM lotes");
    const [movimentos] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS qtd FROM lote_pasto_movimentacoes");
    return { lotes: Number(lotes[0]?.qtd), movimentos: Number(movimentos[0]?.qtd) };
  }

  async function lote(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM lotes WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  it("1. principal cadastra lote na própria fazenda, com pasto da mesma fazenda", async () => {
    const { resultado, local } = await cadastrar(pedido(1, 3, {
      nome: "Bezerras da sede",
      sigla: " bs ",
      dataCriacao: "2026-11-19",
      descricao: "Lote novo",
      fazendaId: 10,
      pastoAtualId: 1000,
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(1);
    const gravado = await lote(resultado.id);
    expect(Number(gravado?.userId)).toBe(1);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.pastoAtualId)).toBe(1000);
    expect(texto(gravado?.sigla)).toBe("bs");
    expect(local.userIds).toEqual([1]);
    expect(await contar()).toEqual({ lotes: 1, movimentos: 0 });
  });

  it("2. funcionário autorizado cadastra lote na fazenda concedida", async () => {
    const { resultado, local } = await cadastrar(pedido(2, 1, {
      nome: "Lote do curral",
      fazendaId: 10,
      dataCriacao: "2026-11-19",
    }, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["animais.criar"],
      fazendasInformadasPeloCliente: [20, 40],
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(2);
    const gravado = await lote(resultado.id);
    expect(Number(gravado?.userId)).toBe(1);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(local.userIds).toEqual([1]);
  });

  it("3. funcionário sem a permissão é recusado antes de gravar", async () => {
    const { resultado, local } = await cadastrar(pedido(3, 1, {
      nome: "Nao pode",
      fazendaId: 10,
    }, { permissoesInformadasPeloCliente: ["lotes.criar"] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(local.userIds).toEqual([]);
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("4. fazenda da conta que não foi concedida é recusada", async () => {
    const { resultado, local } = await cadastrar(pedido(2, 1, {
      nome: "Retiro",
      fazendaId: 20,
    }, { fazendasInformadasPeloCliente: [20] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(local.userIds).toEqual([]);
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("5. fazenda de outro titular é recusada", async () => {
    const { resultado, local } = await cadastrar(pedido(2, 1, {
      nome: "Alheio",
      fazendaId: 40,
      pastoAtualId: 4000,
    }, { titularInformadoPeloCliente: 4 }));
    expect(resultado).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(local.userIds).toEqual([]);
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("6. pasto de outra fazenda não entra no lote", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      nome: "Cruzado",
      fazendaId: 10,
      pastoAtualId: 2000,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_incompativel" });
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("7. pasto de outro titular não entra no lote", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      nome: "Pasto alheio",
      fazendaId: 10,
      pastoAtualId: 4000,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_outro_titular" });
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("8. pasto inexistente é recusado", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      nome: "Pasto sumido",
      fazendaId: 10,
      pastoAtualId: 99999,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_inexistente" });
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("9. cadastro sem pasto continua permitido", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      nome: "Sem pasto",
      fazendaId: 10,
      dataCriacao: "2026-04-02",
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await lote(resultado.id);
    expect(gravado?.pastoAtualId).toBeNull();
    expect(gravado?.dataEntradaPasto).toBeNull();
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.ativo)).toBe(1);
    expect(await contar()).toEqual({ lotes: 1, movimentos: 0 });
  });

  it("10. preserva os campos do formulário", async () => {
    const formulario: LoteFormInput = {
      nome: "Novilhas",
      sigla: "NV",
      dataCriacao: "2026-05-10",
      descricao: "Apartação da manhã",
      localizacao: "Perto do curral",
      capacidade: 80,
      fazendaId: 10,
      pastoAtualId: 1000,
    };
    const { resultado } = await cadastrar(pedido(1, 3, formulario));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await lote(resultado.id);
    expect(texto(gravado?.nome)).toBe("Novilhas");
    expect(texto(gravado?.sigla)).toBe("NV");
    expect(texto(gravado?.dataCriacao)).toBe("2026-05-10");
    expect(texto(gravado?.descricao)).toBe("Apartação da manhã");
    expect(texto(gravado?.localizacao)).toBe("Perto do curral");
    expect(Number(gravado?.capacidade)).toBe(80);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.pastoAtualId)).toBe(1000);
    expect(Number(gravado?.ativo)).toBe(1);
    expect(Number(gravado?.userId)).toBe(1);
  });

  it("11. o vínculo gravado é a fazenda conferida no servidor", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      nome: "Da sede",
      fazendaId: 10,
      dataCriacao: "2026-06-01",
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await lote(resultado.id);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.userId)).toBe(1);
  });

  it("12. falha no meio da gravação não deixa lote parcial nem espelho", async () => {
    const local = espelho();
    await expect(cadastrarEEspelharLote(io(async () => {
      throw new Error("falha simulada na gravacao");
    }), pedido(1, 3, {
      nome: "Quebrado",
      fazendaId: 10,
      pastoAtualId: 1000,
    }), local)).rejects.toThrow("falha simulada na gravacao");
    expect(local.userIds).toEqual([]);
    expect(await contar()).toEqual({ lotes: 0, movimentos: 0 });
  });

  it("13. lote do funcionário fica na conta do titular", async () => {
    const { resultado } = await cadastrar(pedido(2, 1, {
      nome: "Da conta",
      fazendaId: 10,
      dataCriacao: "2026-07-01",
    }));
    expect(resultado.ok).toBe(true);
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT nome FROM lotes WHERE userId = 1 AND fazendaId = 10",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.nome).toBe("Da conta");
    const [doExecutor] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS qtd FROM lotes WHERE userId = 2",
    );
    expect(Number(doExecutor[0]?.qtd)).toBe(0);
  });

  it("14. funcionário não acessa lote de fazenda não concedida", async () => {
    const criado = await cadastrar(pedido(1, 3, {
      nome: "Lote do retiro",
      fazendaId: 20,
      pastoAtualId: 2000,
      dataCriacao: "2026-08-01",
    }));
    expect(criado.resultado.ok).toBe(true);
    const leitura = await io().emTransacao((tx) => autorizarOperacaoPersistida(tx, {
      executorId: 2,
      sessionVersionDaSessao: 1,
      permissaoId: "lotes.visualizar",
      fazendaId: 20,
      fazendasInformadasPeloCliente: [20],
    }));
    expect(leitura).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    const sede = await io().emTransacao((tx) => autorizarOperacaoPersistida(tx, {
      executorId: 2,
      sessionVersionDaSessao: 1,
      permissaoId: "lotes.visualizar",
      fazendaId: 10,
    }));
    expect(sede.ok).toBe(true);
    const tentativa = await cadastrar(pedido(2, 1, { nome: "Invasao", fazendaId: 20 }));
    expect(tentativa.resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    const [retiro] = await pool.query<RowDataPacket[]>("SELECT userId FROM lotes WHERE fazendaId = 20");
    expect(retiro).toHaveLength(1);
    expect(Number(retiro[0]?.userId)).toBe(1);
  });

  it("15. administrador principal cadastra sem vínculo e sem permissão gravada", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      nome: "Lote rápido",
      fazendaId: 10,
      dataCriacao: "2026-09-01",
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await lote(resultado.id);
    expect(texto(gravado?.nome)).toBe("Lote rápido");
    expect(Number(gravado?.userId)).toBe(1);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(gravado?.pastoAtualId).toBeNull();
    expect(Number(gravado?.ativo)).toBe(1);
    expect(resultado.executorUserId).toBe(1);
  });
});

function consultas(conn: mysql.PoolConnection): ConsultaCadastroLote {
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
        `SELECT uf.userId, uf.fazendaId
         FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId
         WHERE uf.userId = ? AND u.titularUserId = ?
         FOR UPDATE`,
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
    async inserirLote(row) {
      const permitidas = new Set([
        "userId", "nome", "sigla", "dataCriacao", "descricao", "localizacao",
        "capacidade", "fazendaId", "pastoAtualId",
      ]);
      const pares = Object.entries(row).filter(([, valor]) => valor !== undefined);
      for (const [coluna] of pares) {
        if (!permitidas.has(coluna)) throw new Error(`Coluna recusada: ${coluna}`);
      }
      const colunas = pares.map(([coluna]) => `\`${coluna}\``).join(", ");
      const marcas = pares.map(() => "?").join(", ");
      const [resultado] = await conn.query<ResultSetHeader>(
        `INSERT INTO lotes (${colunas}) VALUES (${marcas})`,
        pares.map(([, valor]) => valor),
      );
      return Number(resultado.insertId);
    },
  };
}
