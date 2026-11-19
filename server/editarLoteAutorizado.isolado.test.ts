import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import {
  MSG_EDICAO_LOTE_FAZENDA,
  MSG_EDICAO_LOTE_PASTO,
  MSG_EDICAO_LOTE_SITUACAO,
  editarEEspelharLote,
  type ConsultaEdicaoLote,
  type EdicaoLoteInput,
  type EspelhoEdicaoLote,
  type IoEdicaoLote,
  type LoteParaEdicao,
  type PedidoEdicaoLote,
} from "./editarLoteAutorizado";
import { afirmarBancoDescartavel } from "./isolamentoMysql";

const exec = promisify(execFile);
const CONTAINER = "fd-h4n-edicao-lote";
const PORTA = 3339;
const SENHA = "isolado-h4n";
const BANCO = "fd_h4n";

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
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE lote_pasto_movimentacoes (
  id int NOT NULL,
  loteId int NOT NULL,
  observacoes varchar(200) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
CREATE TABLE animal_lote_movimentacoes (
  id int NOT NULL,
  animalId int NOT NULL,
  loteDestinoId int NULL,
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

function pedido(executorId: number, sessionVersion: number, input: EdicaoLoteInput, extras: Partial<PedidoEdicaoLote> = {}): PedidoEdicaoLote {
  return { executorId, sessionVersionDaSessao: sessionVersion, input, ...extras };
}

describe.sequential("lotes.update autorizado em MySQL isolado", () => {
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
        (2, 1, 'lotes.editar', 1), (2, 1, 'lotes.visualizar', 1), (3, 1, 'lotes.visualizar', 1);
      INSERT INTO pastos (id, userId, fazendaId, nome) VALUES
        (1000, 1, 10, 'Piquete da sede'), (2000, 1, 20, 'Piquete do retiro'), (4000, 4, 40, 'Piquete alheio');
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
    await pool.query("DELETE FROM lote_pasto_movimentacoes");
    await pool.query("DELETE FROM animais");
    await pool.query("DELETE FROM lotes");
    await pool.query(`
      INSERT INTO lotes (
        id, userId, nome, sigla, dataCriacao, descricao, localizacao, capacidade,
        fazendaId, pastoAtualId, dataEntradaPasto, ativo
      ) VALUES
        (100, 1, 'Lote da sede', 'SED', '2024-01-01', 'Original', 'Curral', 50, 10, 1000, '2024-01-02', 1),
        (200, 1, 'Lote do retiro', 'RET', '2024-02-01', 'Retiro', 'Baixada', 30, 20, 2000, '2024-02-02', 1),
        (400, 4, 'Lote alheio', 'ALH', '2024-03-01', 'Outro', 'Longe', 10, 40, 4000, '2024-03-02', 1)
    `);
    await pool.query(
      "INSERT INTO animais (id, userId, loteId, fazendaId, pastoId, status, brinco) VALUES (50, 1, 100, 10, 1000, 'ativo', 'BR-50')",
    );
  });

  function io(hook?: () => Promise<void>): IoEdicaoLote {
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

  async function editar(corpo: PedidoEdicaoLote, hook?: () => Promise<void>) {
    const chamadas: Array<{ userId: number; id: number; patch: Record<string, unknown> }> = [];
    const espelho: EspelhoEdicaoLote = {
      async atualizar(userId, id, patch) {
        chamadas.push({ userId, id, patch });
      },
    };
    const resultado = await editarEEspelharLote(io(hook), corpo, espelho);
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

  it("1. principal edita o lote da própria fazenda", async () => {
    const { resultado, chamadas } = await editar(pedido(1, 3, {
      id: 100, nome: "Sede revisada", fazendaId: 10,
    }));
    expect(resultado.ok).toBe(true);
    expect(texto((await lote(100))?.nome)).toBe("Sede revisada");
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(chamadas.map((item) => item.userId)).toEqual([1]);
  });

  it("2. funcionário autorizado edita o lote da fazenda concedida", async () => {
    const { resultado, chamadas } = await editar(pedido(2, 1, {
      id: 100, descricao: "Ajuste do curral",
    }, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: ["lotes.criar"],
      fazendasInformadasPeloCliente: [20],
    }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(1);
    expect(resultado.executorUserId).toBe(2);
    expect(texto((await lote(100))?.descricao)).toBe("Ajuste do curral");
    expect(chamadas).toEqual([{ userId: 1, id: 100, patch: { descricao: "Ajuste do curral" } }]);
  });

  it("3. funcionário sem permissão é recusado", async () => {
    const { resultado, chamadas } = await editar(pedido(3, 1, {
      id: 100, nome: "Nao",
    }, { permissoesInformadasPeloCliente: ["lotes.editar"] }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(texto((await lote(100))?.nome)).toBe("Lote da sede");
    expect(chamadas).toEqual([]);
  });

  it("4. lote de fazenda não concedida é recusado", async () => {
    const { resultado } = await editar(pedido(2, 1, { id: 200, nome: "Invasao" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(texto((await lote(200))?.nome)).toBe("Lote do retiro");
  });

  it("5. lote de outro titular não é editado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 400, nome: "Invasao" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    expect(texto((await lote(400))?.nome)).toBe("Lote alheio");
  });

  it("6. lote inexistente é recusado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 99999, nome: "Ninguem" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "nao_encontrado" });
  });

  it("7. altera o nome", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, nome: "Lote revisado" }));
    expect(resultado.ok).toBe(true);
    expect(texto((await lote(100))?.nome)).toBe("Lote revisado");
    expect(texto((await lote(100))?.sigla)).toBe("SED");
  });

  it("8. altera a sigla e aceita sigla vazia como nula", async () => {
    const primeira = await editar(pedido(1, 3, { id: 100, sigla: "  lt1 " }));
    expect(primeira.resultado.ok).toBe(true);
    expect(texto((await lote(100))?.sigla)).toBe("lt1");
    const segunda = await editar(pedido(1, 3, { id: 100, sigla: "   " }));
    expect(segunda.resultado.ok).toBe(true);
    expect((await lote(100))?.sigla).toBeNull();
  });

  it("9. altera a descrição", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, descricao: "Cadastro revisto" }));
    expect(resultado.ok).toBe(true);
    expect(texto((await lote(100))?.descricao)).toBe("Cadastro revisto");
  });

  it("10. altera a localização", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, localizacao: "Mangueiro" }));
    expect(resultado.ok).toBe(true);
    expect(texto((await lote(100))?.localizacao)).toBe("Mangueiro");
  });

  it("11. altera a capacidade", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, capacidade: 80 }));
    expect(resultado.ok).toBe(true);
    expect(Number((await lote(100))?.capacidade)).toBe(80);
  });

  it("12. os demais campos cadastrais e os vínculos permanecem", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, nome: "So o nome" }));
    expect(resultado.ok).toBe(true);
    const gravado = await lote(100);
    expect(texto(gravado?.sigla)).toBe("SED");
    expect(texto(gravado?.dataCriacao)).toBe("2024-01-01");
    expect(texto(gravado?.descricao)).toBe("Original");
    expect(texto(gravado?.localizacao)).toBe("Curral");
    expect(Number(gravado?.capacidade)).toBe(50);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.pastoAtualId)).toBe(1000);
    expect(texto(gravado?.dataEntradaPasto)).toBe("2024-01-02");
    expect(Number(gravado?.ativo)).toBe(1);
    const vinculado = await animal(50);
    expect(Number(vinculado?.loteId)).toBe(100);
    expect(Number(vinculado?.fazendaId)).toBe(10);
    expect(Number(vinculado?.pastoId)).toBe(1000);
  });

  it("13. fazenda reenviada sem alteração é aceita", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, nome: "Com a mesma fazenda", fazendaId: 10 }));
    expect(resultado.ok).toBe(true);
    expect(Number((await lote(100))?.fazendaId)).toBe(10);
    expect(texto((await lote(100))?.nome)).toBe("Com a mesma fazenda");
  });

  it("14. pasto reenviado sem alteração não mexe nos animais", async () => {
    const { resultado } = await editar(pedido(1, 3, {
      id: 100, localizacao: "Mesmo pasto", pastoAtualId: 1000,
    }));
    expect(resultado.ok).toBe(true);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(texto((await lote(100))?.dataEntradaPasto)).toBe("2024-01-02");
    const vinculado = await animal(50);
    expect(Number(vinculado?.pastoId)).toBe(1000);
    expect(Number(vinculado?.fazendaId)).toBe(10);
    expect(Number(vinculado?.loteId)).toBe(100);
  });

  it("15. trocar a fazenda é recusado por inteiro", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, fazendaId: 20, nome: "Mudou" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "alteracao_estrutural", campo: "fazendaId" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_EDICAO_LOTE_FAZENDA);
    const gravado = await lote(100);
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(texto(gravado?.nome)).toBe("Lote da sede");
  });

  it("16. trocar o pasto é recusado e os animais ficam", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, pastoAtualId: 2000, nome: "Mudou" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "alteracao_estrutural", campo: "pastoAtualId" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_EDICAO_LOTE_PASTO);
    expect(Number((await lote(100))?.pastoAtualId)).toBe(1000);
    expect(texto((await lote(100))?.nome)).toBe("Lote da sede");
    const vinculado = await animal(50);
    expect(Number(vinculado?.pastoId)).toBe(1000);
    expect(Number(vinculado?.fazendaId)).toBe(10);
    const data = await editar(pedido(1, 3, { id: 100, dataEntradaPasto: "2024-08-01", nome: "Mudou" }));
    expect(data.resultado).toMatchObject({ ok: false, motivo: "alteracao_estrutural", campo: "dataEntradaPasto" });
    expect(texto((await lote(100))?.dataEntradaPasto)).toBe("2024-01-02");
    expect(texto((await lote(100))?.nome)).toBe("Lote da sede");
  });

  it("17. mudar a situação é recusado", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, ativo: false, nome: "Inativo" }));
    expect(resultado).toMatchObject({ ok: false, motivo: "situacao_preservada", campo: "ativo" });
    expect(resultado.ok ? "" : resultado.mensagem).toBe(MSG_EDICAO_LOTE_SITUACAO);
    expect(Number((await lote(100))?.ativo)).toBe(1);
    expect(texto((await lote(100))?.nome)).toBe("Lote da sede");
  });

  it("18. os animais vinculados permanecem no lote", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, capacidade: 55 }));
    expect(resultado.ok).toBe(true);
    const vinculado = await animal(50);
    expect(Number(vinculado?.loteId)).toBe(100);
    expect(Number(vinculado?.userId)).toBe(1);
    expect(texto(vinculado?.status)).toBe("ativo");
    expect(texto(vinculado?.brinco)).toBe("BR-50");
  });

  it("19. os históricos anteriores permanecem", async () => {
    await pool.query(
      "INSERT INTO lote_pasto_movimentacoes (id, loteId, observacoes) VALUES (1, 100, 'entrada antiga')",
    );
    await pool.query(
      "INSERT INTO animal_lote_movimentacoes (id, animalId, loteDestinoId, observacoes) VALUES (1, 50, 100, 'troca antiga')",
    );
    const { resultado } = await editar(pedido(1, 3, { id: 100, descricao: "So o cadastro" }));
    expect(resultado.ok).toBe(true);
    const [pastosHist] = await pool.query<RowDataPacket[]>("SELECT observacoes FROM lote_pasto_movimentacoes");
    const [animaisHist] = await pool.query<RowDataPacket[]>("SELECT observacoes FROM animal_lote_movimentacoes");
    expect(pastosHist).toEqual([{ observacoes: "entrada antiga" }]);
    expect(animaisHist).toEqual([{ observacoes: "troca antiga" }]);
    expect(texto((await lote(100))?.descricao)).toBe("So o cadastro");
  });

  it("20. falha no meio desfaz a edição e não chama o espelho", async () => {
    const chamadas: number[] = [];
    await expect(editarEEspelharLote(io(async () => {
      throw new Error("falha simulada na edicao");
    }), pedido(1, 3, { id: 100, nome: "Quebrado" }), {
      async atualizar(userId) {
        chamadas.push(userId);
      },
    })).rejects.toThrow("falha simulada na edicao");
    expect(chamadas).toEqual([]);
    expect(texto((await lote(100))?.nome)).toBe("Lote da sede");
  });

  it("21. duas edições no mesmo lote não se misturam", async () => {
    const trava = await pool.getConnection();
    try {
      await trava.beginTransaction();
      await trava.query("SELECT id FROM lotes WHERE id = 100 FOR UPDATE");
      const pendente = editar(pedido(1, 3, { id: 100, descricao: "segunda" }));
      await new Promise((resolver) => setTimeout(resolver, 400));
      await trava.query("UPDATE lotes SET nome = 'Travado' WHERE id = 100");
      await trava.commit();
      const { resultado } = await pendente;
      expect(resultado.ok).toBe(true);
      const gravado = await lote(100);
      expect(texto(gravado?.nome)).toBe("Travado");
      expect(texto(gravado?.descricao)).toBe("segunda");
    } finally {
      await trava.release();
    }
  });

  it("22. o espelho só corre depois do MySQL e a falha dele não apaga o lote", async () => {
    const recusa = await editar(pedido(3, 1, { id: 100, nome: "Nao" }));
    expect(recusa.chamadas).toEqual([]);
    const ok = await editar(pedido(1, 3, { id: 100, nome: "No mysql" }));
    expect(ok.chamadas).toEqual([{ userId: 1, id: 100, patch: { nome: "No mysql" } }]);
    await expect(editarEEspelharLote(io(), pedido(1, 3, { id: 100, localizacao: "Depois do commit" }), {
      async atualizar() {
        throw new Error("espelho fora");
      },
    })).resolves.toMatchObject({ ok: true });
    expect(texto((await lote(100))?.nome)).toBe("No mysql");
    expect(texto((await lote(100))?.localizacao)).toBe("Depois do commit");
  });

  it("23. o salvamento da tela, só com nome, sigla e data, continua válido", async () => {
    const { resultado } = await editar(pedido(1, 3, {
      id: 100,
      nome: "Lote da sede",
      sigla: "SEDE",
      dataCriacao: "2024-01-01",
    }));
    expect(resultado.ok).toBe(true);
    const gravado = await lote(100);
    expect(texto(gravado?.nome)).toBe("Lote da sede");
    expect(texto(gravado?.sigla)).toBe("SEDE");
    expect(texto(gravado?.dataCriacao)).toBe("2024-01-01");
    expect(Number(gravado?.fazendaId)).toBe(10);
    expect(Number(gravado?.pastoAtualId)).toBe(1000);
    expect(Number(gravado?.ativo)).toBe(1);
    expect(Number((await animal(50))?.loteId)).toBe(100);
  });

  it("24. administrador principal edita sem vínculo e sem permissão gravada", async () => {
    const { resultado } = await editar(pedido(1, 3, { id: 100, localizacao: "Escritorio" }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.executorUserId).toBe(1);
    expect(resultado.userId).toBe(1);
    expect(texto((await lote(100))?.localizacao)).toBe("Escritorio");
  });
});

function consultas(conn: mysql.PoolConnection): ConsultaEdicaoLote {
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
    async lote(id): Promise<LoteParaEdicao | null> {
      const [linhas] = await conn.query<RowDataPacket[]>(
        "SELECT id, userId, fazendaId, pastoAtualId, dataEntradaPasto, ativo FROM lotes WHERE id = ? FOR UPDATE",
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
        ativo: linha.ativo == null ? null : Number(linha.ativo),
      };
    },
    async atualizarLote(id, titularUserId, patch) {
      const permitidas = new Set(["nome", "sigla", "dataCriacao", "descricao", "localizacao", "capacidade"]);
      const pares = Object.entries(patch);
      if (pares.length === 0) return;
      for (const [coluna] of pares) {
        if (!permitidas.has(coluna)) throw new Error(`Coluna recusada: ${coluna}`);
      }
      const atribuicao = pares.map(([coluna]) => `\`${coluna}\` = ?`).join(", ");
      await conn.query(
        `UPDATE lotes SET ${atribuicao} WHERE id = ? AND userId = ?`,
        [...pares.map(([, valor]) => valor), id, titularUserId],
      );
    },
  };
}
