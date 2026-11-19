import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPayloadCadastroSuperficialCurral } from "../shared/curralCadastroAnimal";
import type { AnimalFormInput, LinhaInsercaoAnimal } from "./animalInsertRow";
import { afirmarBancoDescartavel } from "./isolamentoMysql";
import {
  autorizarOperacaoDoExecutor,
  cadastrarEEspelhar,
  type ConsultaCadastroAnimal,
  type EspelhoCadastroAnimal,
  type IoCadastroAnimal,
  type LinhaAnimalAtivo,
  type LinhaUsuarioCadastro,
  type PedidoCadastroAnimal,
  type ResultadoCadastroAnimal,
} from "./cadastroAnimalAutorizado";

const exec = promisify(execFile);
const CONTAINER = "fd-h4k-cadastro";
const PORTA = 3336;
const SENHA = "isolado-h4k";
const BANCO = "fd_h4k";

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
  PRIMARY KEY (id),
  CONSTRAINT usuario_fazendas_user_fk FOREIGN KEY (userId) REFERENCES users (id),
  CONSTRAINT usuario_fazendas_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuario_permissoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  titularUserId int NOT NULL,
  permissao varchar(80) NOT NULL,
  concedidoPorUserId int NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT usuario_permissoes_user_fk FOREIGN KEY (userId) REFERENCES users (id),
  CONSTRAINT usuario_permissoes_titular_fk FOREIGN KEY (titularUserId) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pastos (
  id int NOT NULL,
  userId int NOT NULL,
  fazendaId int NOT NULL,
  nome varchar(100) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT pastos_user_fk FOREIGN KEY (userId) REFERENCES users (id),
  CONSTRAINT pastos_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lotes (
  id int NOT NULL,
  userId int NOT NULL,
  nome varchar(100) NOT NULL,
  fazendaId int NULL,
  ativo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT lotes_user_fk FOREIGN KEY (userId) REFERENCES users (id),
  CONSTRAINT lotes_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE animais (
  id int NOT NULL AUTO_INCREMENT,
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
  CONSTRAINT animais_user_fk FOREIGN KEY (userId) REFERENCES users (id),
  CONSTRAINT animais_fazenda_fk FOREIGN KEY (fazendaId) REFERENCES fazendas (id),
  CONSTRAINT animais_lote_fk FOREIGN KEY (loteId) REFERENCES lotes (id),
  CONSTRAINT animais_pasto_fk FOREIGN KEY (pastoId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  animalId int NOT NULL,
  loteOrigemId int NULL,
  loteDestinoId int NOT NULL,
  pastoOrigemId int NULL,
  pastoDestinoId int NULL,
  fazendaId int NULL,
  dataMovimentacao date NOT NULL,
  usuarioNome varchar(200) NULL,
  observacoes text NULL,
  PRIMARY KEY (id),
  CONSTRAINT animal_lote_mov_animal_fk FOREIGN KEY (animalId) REFERENCES animais (id),
  CONSTRAINT animal_lote_mov_pasto_destino_fk FOREIGN KEY (pastoDestinoId) REFERENCES pastos (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
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

type EspelhoObservado = EspelhoCadastroAnimal & {
  animais: Array<{ userId: number; id: number; row: LinhaInsercaoAnimal }>;
  historicos: number;
};

function espelho(): EspelhoObservado {
  const observado: EspelhoObservado = {
    animais: [],
    historicos: 0,
    async atualizar(userId, id, row) {
      observado.animais.push({ userId, id, row });
    },
    async historico() {
      observado.historicos += 1;
    },
  };
  return observado;
}

function pedido(
  executorId: number,
  sessionVersion: number,
  input: AnimalFormInput,
  extras: Partial<PedidoCadastroAnimal> = {},
): PedidoCadastroAnimal {
  return { executorId, sessionVersionDaSessao: sessionVersion, input, ...extras };
}

describe.sequential("animais.create autorizado em MySQL isolado", () => {
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
        (2, 1, 'animais.criar', 1),
        (2, 1, 'animais.visualizar', 1),
        (3, 1, 'animais.visualizar', 1);
      INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
        (1000, 1, 10, 'Piquete da sede'),
        (2000, 1, 20, 'Piquete do retiro'),
        (4000, 4, 40, 'Piquete alheio');
      INSERT INTO lotes (id, userId, nome, fazendaId, ativo) VALUES
        (100, 1, 'Lote da sede', 10, 1),
        (200, 1, 'Lote do retiro', 20, 1),
        (400, 4, 'Lote alheio', 40, 1);
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
    await pool.query("DELETE FROM animal_lote_movimentacoes");
    await pool.query("DELETE FROM animais");
  });

  function io(hook?: () => Promise<void>): IoCadastroAnimal {
    return {
      aposInserirAnimal: hook,
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

  async function cadastrar(
    corpo: PedidoCadastroAnimal,
    hook?: () => Promise<void>,
  ): Promise<{ resultado: ResultadoCadastroAnimal; local: EspelhoObservado }> {
    const local = espelho();
    const resultado = await cadastrarEEspelhar(io(hook), corpo, local);
    return { resultado, local };
  }

  async function contar(): Promise<{ animais: number; movimentos: number }> {
    const [animais] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS qtd FROM animais");
    const [movimentos] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS qtd FROM animal_lote_movimentacoes");
    return { animais: Number(animais[0]?.qtd), movimentos: Number(movimentos[0]?.qtd) };
  }

  async function animal(id: number) {
    const [linhas] = await pool.query<RowDataPacket[]>("SELECT * FROM animais WHERE id = ?", [id]);
    return linhas[0] ?? null;
  }

  it("1. principal cadastra na própria fazenda sem vínculo e sem permissão gravada", async () => {
    const { resultado, local } = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "P-1", loteId: 100, pastoId: 1000,
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(1);
    expect(resultado.usuarioNome).toBe("Administrador da conta");
    const gravado = await animal(resultado.id);
    expect(Number(gravado?.userId)).toBe(1);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(local.animais.map((item) => item.userId)).toEqual([1]);
    const [movimento] = await pool.query<RowDataPacket[]>(
      "SELECT userId, usuarioNome, loteDestinoId, pastoDestinoId FROM animal_lote_movimentacoes",
    );
    expect(Number(movimento[0]?.userId)).toBe(1);
    expect(movimento[0]?.usuarioNome).toBe("Administrador da conta");
    expect(Number(movimento[0]?.loteDestinoId)).toBe(100);
    expect(Number(movimento[0]?.pastoDestinoId)).toBe(1000);
  });

  it("2. funcionário autorizado cadastra e o animal fica na conta do titular", async () => {
    const { resultado, local } = await cadastrar(pedido(2, 1, {
      fazendaId: 10, sexo: "macho", brinco: "F-2", loteId: 100, pastoId: 1000,
    }, {
      titularInformadoPeloCliente: 4,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["vendas.cancelar"],
      fazendasInformadasPeloCliente: [20, 40],
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(2);
    expect(resultado.usuarioNome).toBe("Funcionario Curral");
    const [linhas] = await pool.query<RowDataPacket[]>(
      "SELECT userId, fazendaId FROM animais WHERE id = ?",
      [resultado.id],
    );
    expect(Number(linhas[0]?.userId)).toBe(1);
    expect(Number(linhas[0]?.fazendaId)).toBe(10);
    const [doExecutor] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS qtd FROM animais WHERE userId = 2",
    );
    expect(Number(doExecutor[0]?.qtd)).toBe(0);
    expect(local.animais[0]?.userId).toBe(1);
    expect(local.historicos).toBe(1);
  });

  it("3. funcionário sem a permissão é recusado antes de gravar", async () => {
    const { resultado, local } = await cadastrar(pedido(3, 1, {
      fazendaId: 10, sexo: "femea", brinco: "S-3",
    }, { permissoesInformadasPeloCliente: ["animais.criar"] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(local.animais).toEqual([]);
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("4. funcionário não usa fazenda da conta que não lhe foi concedida", async () => {
    const { resultado, local } = await cadastrar(pedido(2, 1, {
      fazendaId: 20, sexo: "macho", brinco: "F-20",
    }, { fazendasInformadasPeloCliente: [20] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(local.animais).toEqual([]);
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("5. fazenda de outro titular é recusada mesmo se o cliente informar esse titular", async () => {
    const { resultado, local } = await cadastrar(pedido(2, 1, {
      fazendaId: 40, sexo: "femea", brinco: "X-40", loteId: 400, pastoId: 4000,
    }, { titularInformadoPeloCliente: 4 }));
    expect(resultado).toMatchObject({ ok: false, motivo: "outro_titular" });
    expect(local.animais).toEqual([]);
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("6. lote de outra fazenda não entra no cadastro", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "L-6", loteId: 200, pastoId: 1000,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "lote_incompativel" });
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("7. pasto de outra fazenda não entra no cadastro", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "macho", brinco: "P-7", loteId: 100, pastoId: 2000,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_incompativel" });
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("8. pasto inexistente é recusado e a chave estrangeira não chega a ser violada", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "P-8", pastoId: 99999,
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "pasto_inexistente" });
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("9. fazenda inexistente é recusada", async () => {
    const { resultado } = await cadastrar(pedido(1, 3, {
      fazendaId: 99999, sexo: "macho", brinco: "F-9",
    }));
    expect(resultado).toMatchObject({ ok: false, motivo: "fazenda_inexistente" });
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("10. cadastro sem lote e sem pasto continua permitido", async () => {
    const { resultado, local } = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "S-10", nome: "Sem lote",
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await animal(resultado.id);
    expect(gravado?.loteId).toBeNull();
    expect(gravado?.pastoId).toBeNull();
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect((await contar()).movimentos).toBe(0);
    expect(local.historicos).toBe(0);
  });

  it("11. preserva os campos do formulário", async () => {
    const formulario: AnimalFormInput = {
      brinco: "BR-77",
      brincoEletronico: "RFID-77",
      nome: "Mimosa",
      raca: "Nelore",
      sexo: "femea",
      dataNascimento: "2024-01-15",
      pesoAtual: "320.50",
      loteId: 100,
      categoria: "Novilha",
      observacoes: "Obs completa",
      pelagem: "Amarela",
      marca: "M1",
      dataDesmama: "2024-08-01",
      castrado: false,
      dataEntrada: "2025-02-01",
      pesoEntrada: "280.00",
      produtorOrigem: "Sitio Esperanca",
      precoKg: "12.50",
      frete: "150.00",
      sisbov: "105000000000001",
      dataRnd: "2024-03-01",
      rgn: "RGN1",
      rgd: "RGD1",
      rastreadoNascimento: true,
      maeId: null,
      paiId: null,
      pai: "Pai texto",
      mae: "Mae texto",
      fazendaId: 10,
      pastoId: 1000,
    };
    const { resultado } = await cadastrar(pedido(1, 3, formulario));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await animal(resultado.id);
    expect(texto(gravado?.brinco)).toBe("BR-77");
    expect(texto(gravado?.brincoEletronico)).toBe("RFID-77");
    expect(texto(gravado?.nome)).toBe("Mimosa");
    expect(texto(gravado?.raca)).toBe("Nelore");
    expect(texto(gravado?.sexo)).toBe("femea");
    expect(texto(gravado?.dataNascimento)).toBe("2024-01-15");
    expect(texto(gravado?.pesoAtual)).toBe("320.50");
    expect(Number(gravado?.loteId)).toBe(100);
    expect(texto(gravado?.categoria)).toBe("Novilha");
    expect(texto(gravado?.observacoes)).toBe("Obs completa");
    expect(texto(gravado?.pelagem)).toBe("Amarela");
    expect(texto(gravado?.marca)).toBe("M1");
    expect(texto(gravado?.dataDesmama)).toBe("2024-08-01");
    expect(Number(gravado?.castrado)).toBe(0);
    expect(texto(gravado?.dataEntrada)).toBe("2025-02-01");
    expect(texto(gravado?.pesoEntrada)).toBe("280.00");
    expect(texto(gravado?.produtorOrigem)).toBe("Sitio Esperanca");
    expect(texto(gravado?.precoKg)).toBe("12.50");
    expect(texto(gravado?.frete)).toBe("150.00");
    expect(texto(gravado?.sisbov)).toBe("105000000000001");
    expect(texto(gravado?.dataRnd)).toBe("2024-03-01");
    expect(texto(gravado?.rgn)).toBe("RGN1");
    expect(texto(gravado?.rgd)).toBe("RGD1");
    expect(Number(gravado?.rastreadoNascimento)).toBe(1);
    expect(gravado?.maeId).toBeNull();
    expect(gravado?.paiId).toBeNull();
    expect(texto(gravado?.pai)).toBe("Pai texto");
    expect(texto(gravado?.mae)).toBe("Mae texto");
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.pastoId)).toBe(1000);
    expect(texto(gravado?.status)).toBe("ativo");
    expect(Number(gravado?.userId)).toBe(1);
  });

  it("12. preserva o cadastro superficial do curral", async () => {
    const formulario = buildPayloadCadastroSuperficialCurral({
      fazendaId: 10,
      dataEntrada: "2026-11-19",
      brinco: "CURRAL-1",
      sexo: "macho",
      categoria: "Bezerro",
      brincoEletronico: "RFID-CURRAL",
      loteId: 100,
      pesoEntrada: "180",
      dataNascimento: "2026-01-01",
      observacoes: "na manga",
    });
    const { resultado } = await cadastrar(pedido(2, 1, formulario));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const gravado = await animal(resultado.id);
    expect(texto(gravado?.nome)).toBe("CURRAL-1");
    expect(texto(gravado?.brinco)).toBe("CURRAL-1");
    expect(texto(gravado?.brincoEletronico)).toBe("RFID-CURRAL");
    expect(texto(gravado?.sexo)).toBe("macho");
    expect(texto(gravado?.categoria)).toBe("Bezerro");
    expect(texto(gravado?.observacoes)).toBe("Cadastro curral. na manga");
    expect(texto(gravado?.dataEntrada)).toBe("2026-11-19");
    expect(texto(gravado?.dataNascimento)).toBe("2026-01-01");
    expect(texto(gravado?.pesoEntrada)).toBe("180.00");
    expect(Number(gravado?.loteId)).toBe(100);
    expect(gravado?.pastoId).toBeNull();
    expect(Number(gravado?.userId)).toBe(1);
    const [movimento] = await pool.query<RowDataPacket[]>(
      "SELECT usuarioNome, pastoDestinoId, loteDestinoId FROM animal_lote_movimentacoes",
    );
    expect(movimento[0]?.usuarioNome).toBe("Funcionario Curral");
    expect(movimento[0]?.pastoDestinoId).toBeNull();
    expect(Number(movimento[0]?.loteDestinoId)).toBe(100);
  });

  it("13. falha no meio da gravação desfaz o animal e não chama o espelho", async () => {
    const local = espelho();
    await expect(cadastrarEEspelhar(io(async () => {
      throw new Error("falha simulada na gravacao");
    }), pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "R-13", loteId: 100, pastoId: 1000,
    }), local)).rejects.toThrow("falha simulada na gravacao");
    expect(local.animais).toEqual([]);
    expect(await contar()).toEqual({ animais: 0, movimentos: 0 });
  });

  it("14. animal do funcionário aparece na conta do titular", async () => {
    const { resultado } = await cadastrar(pedido(2, 1, {
      fazendaId: 10, sexo: "femea", brinco: "T-14", nome: "Da conta",
    }));
    expect(resultado.ok).toBe(true);
    const [daConta] = await pool.query<RowDataPacket[]>(
      "SELECT id, brinco FROM animais WHERE userId = 1 AND fazendaId = 10",
    );
    expect(daConta).toHaveLength(1);
    expect(daConta[0]?.brinco).toBe("T-14");
  });

  it("15. funcionário não acessa animal de fazenda que não lhe foi concedida", async () => {
    const criado = await cadastrar(pedido(1, 3, {
      fazendaId: 20, sexo: "macho", brinco: "R-15", loteId: 200, pastoId: 2000,
    }));
    expect(criado.resultado.ok).toBe(true);
    const leituraRetiro = await autorizarOperacaoDoExecutor(io(), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      permissaoId: "animais.visualizar",
      fazendaId: 20,
      fazendasInformadasPeloCliente: [20],
    });
    expect(leituraRetiro).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    const leituraSede = await autorizarOperacaoDoExecutor(io(), {
      executorId: 2,
      sessionVersionDaSessao: 1,
      permissaoId: "animais.visualizar",
      fazendaId: 10,
    });
    expect(leituraSede.ok).toBe(true);
    const tentativa = await cadastrar(pedido(2, 1, {
      fazendaId: 20, sexo: "macho", brinco: "R-15B",
    }));
    expect(tentativa.resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    const [retiro] = await pool.query<RowDataPacket[]>(
      "SELECT userId FROM animais WHERE fazendaId = 20",
    );
    expect(retiro).toHaveLength(1);
    expect(Number(retiro[0]?.userId)).toBe(1);
  });

  it("mantém brinco, RFID e peso de entrada", async () => {
    const primeiro = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "DUP", brincoEletronico: "CHIP-1",
    }));
    expect(primeiro.resultado.ok).toBe(true);
    const brinco = await cadastrar(pedido(2, 1, {
      fazendaId: 10, sexo: "macho", brinco: " dup ",
    }));
    expect(brinco.resultado).toMatchObject({ ok: false, motivo: "brinco_duplicado" });
    const rfid = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "macho", brinco: "OUTRO", brincoEletronico: "CHIP-1",
    }));
    expect(rfid.resultado).toMatchObject({ ok: false, motivo: "rfid_duplicado" });
    const peso = await cadastrar(pedido(1, 3, {
      fazendaId: 10, sexo: "femea", brinco: "PESO", pesoEntrada: "0",
    }));
    expect(peso.resultado).toMatchObject({ ok: false, motivo: "peso_invalido" });
    expect((await contar()).animais).toBe(1);
  });
});

function consultas(conn: mysql.PoolConnection): ConsultaCadastroAnimal {
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
        `SELECT permissao FROM usuario_permissoes
         WHERE userId = ? AND titularUserId = ? FOR UPDATE`,
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
    async lote(id) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, ativo FROM lotes WHERE id = ? FOR UPDATE",
        [id],
      );
      const linha = linhas[0];
      if (!linha) return null;
      return {
        id: Number(linha.id),
        userId: Number(linha.userId),
        fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
        ativo: Number(linha.ativo) === 1,
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
    async inserirAnimal(row) {
      const permitidas = new Set([
        "userId", "brinco", "brincoEletronico", "nome", "raca", "sexo", "dataNascimento",
        "pesoAtual", "loteId", "categoria", "observacoes", "pelagem", "marca", "dataDesmama",
        "castrado", "dataEntrada", "pesoEntrada", "produtorOrigem", "precoKg", "frete",
        "sisbov", "dataRnd", "rgn", "rgd", "rastreadoNascimento", "maeId", "paiId", "pai",
        "mae", "fazendaId", "pastoId",
      ]);
      const pares = Object.entries(row).filter(([, valor]) => valor !== undefined);
      for (const [coluna] of pares) {
        if (!permitidas.has(coluna)) throw new Error(`Coluna recusada: ${coluna}`);
      }
      const colunas = pares.map(([coluna]) => `\`${coluna}\``).join(", ");
      const marcas = pares.map(() => "?").join(", ");
      const [resultado] = await conn.query<ResultSetHeader>(
        `INSERT INTO animais (${colunas}) VALUES (${marcas})`,
        pares.map(([, valor]) => valor),
      );
      return Number(resultado.insertId);
    },
    async inserirMovimento(row) {
      await conn.query(
        `INSERT INTO animal_lote_movimentacoes
          (userId, animalId, loteOrigemId, loteDestinoId, pastoOrigemId, pastoDestinoId, fazendaId, dataMovimentacao, usuarioNome, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.userId, row.animalId, row.loteOrigemId, row.loteDestinoId, row.pastoOrigemId,
          row.pastoDestinoId, row.fazendaId, row.dataMovimentacao, row.usuarioNome, row.observacoes,
        ],
      );
    },
  };
}
