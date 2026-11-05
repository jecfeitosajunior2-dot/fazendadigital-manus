import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { IdentidadeUsuario, PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { loginPermitido } from "./_core/identidadeSessao";
import type { FazendaConhecida, VinculoFazenda } from "./acessoFazendas";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";
import {
  criarServicoRebanho,
  type AnimalPersistido,
  type ConsultaPaginada,
  type ExtrasCliente,
  type LotePersistido,
  type RepositorioRebanho,
  type SessaoRebanho,
} from "./rebanhoTitularidade";

/**
 * Persistência do serviço de animal e lote no banco que o chamador já isolou.
 * A leitura de autorização é repetida dentro da transação, com a ordem de
 * bloqueio documentada. Isso não liga as rotas oficiais e não prova corrida
 * no servidor de produção.
 */

type Sql = Pick<Pool, "query">;

const PAPEIS = new Set(["principal", "secundario", "comum"]);

function idsSeguros(ids: number[]) {
  return ids.filter((id) => Number.isInteger(id) && id > 0);
}

export function criarRebanhoTitularidadeDb(pool: Pool, alvo: AlvoMysql) {
  afirmarBancoDescartavel(alvo);

  async function afirmarBanco(sql: Sql) {
    afirmarBancoDescartavel(alvo);
    const [banco] = await sql.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    const nome = String(banco[0]?.nome ?? "");
    if (nome.toLowerCase() !== alvo.database.toLowerCase() || nome.toLowerCase() === "fazenda_digital") {
      throw new Error("Conexão recusada: banco inesperado.");
    }
  }

  function repositorio(sql: Sql, travar: boolean): RepositorioRebanho {
    const trava = travar ? " FOR UPDATE" : "";

    return {
      async carregar(executorId, extras?: ExtrasCliente): Promise<SessaoRebanho | null> {
        if (!Number.isInteger(executorId) || executorId <= 0) return null;
        const [usuarios] = await sql.query<RowDataPacket[]>(
          `SELECT id, name, papel, role, titularUserId, situacao, sessionVersion
           FROM users WHERE id = ?${trava}`,
          [executorId],
        );
        const linha = usuarios[0];
        if (!linha || linha.titularUserId == null) return null;
        const papel = String(linha.papel);
        const situacao = String(linha.situacao) as SituacaoUsuario;
        if (!PAPEIS.has(papel) || !loginPermitido(situacao)) return null;
        const identidade: IdentidadeUsuario = {
          id: Number(linha.id),
          openId: "",
          name: null,
          email: null,
          role: linha.role === "admin" ? "admin" : "user",
          papel: papel as PapelConta,
          titularUserId: Number(linha.titularUserId),
          situacao,
          sessionVersion: Number(linha.sessionVersion),
        };
        const [permissoes] = await sql.query<RowDataPacket[]>(
          `SELECT permissao FROM usuario_permissoes
           WHERE userId = ? AND titularUserId = ?
           ORDER BY permissao${trava}`,
          [identidade.id, identidade.titularUserId],
        );
        const [vinculos] = await sql.query<RowDataPacket[]>(
          `SELECT uf.userId, uf.fazendaId
           FROM usuario_fazendas uf
           JOIN users u ON u.id = uf.userId
           WHERE uf.userId = ? AND u.titularUserId = ?
           ORDER BY uf.fazendaId${trava}`,
          [identidade.id, identidade.titularUserId],
        );
        const [fazendas] = await sql.query<RowDataPacket[]>(
          "SELECT id, userId, nome FROM fazendas WHERE userId = ? ORDER BY id",
          [identidade.titularUserId],
        );
        return {
          identidade,
          permissoes: permissoes.map((item) => String(item.permissao)),
          fazendasDoTitular: fazendas.map((item) => ({
            id: Number(item.id),
            userId: Number(item.userId),
            nome: String(item.nome ?? ""),
          })),
          vinculos: vinculos.map((item): VinculoFazenda => ({
            userId: Number(item.userId),
            fazendaId: Number(item.fazendaId),
          })),
          executorNome: String(linha.name ?? ""),
        };
      },

      async obterFazenda(id): Promise<FazendaConhecida | null> {
        if (!Number.isInteger(id) || id <= 0) return null;
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId FROM fazendas WHERE id = ? LIMIT 1${trava}`,
          [id],
        );
        const linha = linhas[0];
        if (!linha) return null;
        return { id: Number(linha.id), userId: Number(linha.userId) };
      },

      async listarAnimais(consulta: ConsultaPaginada) {
        const fazendaIds = idsSeguros(consulta.fazendaIds);
        if (fazendaIds.length === 0) return { itens: [], total: 0 };
        const marcas = fazendaIds.map(() => "?").join(", ");
        const params = [consulta.titularUserId, ...fazendaIds];
        const [contagem] = await sql.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM animais WHERE userId = ? AND fazendaId IN (${marcas})`,
          params,
        );
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId, fazendaId, loteId, brinco, brincoEletronico, nome, sexo, status
           FROM animais
           WHERE userId = ? AND fazendaId IN (${marcas})
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
          [...params, consulta.limit, consulta.offset],
        );
        return { itens: linhas.map(animalDe), total: Number(contagem[0]?.total ?? 0) };
      },

      async obterAnimal(titularId, id) {
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId, fazendaId, loteId, brinco, brincoEletronico, nome, sexo, status
           FROM animais WHERE id = ? AND userId = ? LIMIT 1`,
          [id, titularId],
        );
        return linhas[0] ? animalDe(linhas[0]) : null;
      },

      async animaisAtivos(titularId) {
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId, fazendaId, loteId, brinco, brincoEletronico, nome, sexo, status
           FROM animais WHERE userId = ? AND status = 'ativo'`,
          [titularId],
        );
        return linhas.map(animalDe);
      },

      async lotesDoTitular(titularId) {
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId, fazendaId, nome, sigla, descricao, ativo
           FROM lotes WHERE userId = ?`,
          [titularId],
        );
        return linhas.map(loteDe);
      },

      async listarLotes(consulta: ConsultaPaginada) {
        const fazendaIds = idsSeguros(consulta.fazendaIds);
        if (fazendaIds.length === 0) return { itens: [], total: 0 };
        const marcas = fazendaIds.map(() => "?").join(", ");
        const params = [consulta.titularUserId, ...fazendaIds];
        const [contagem] = await sql.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM lotes WHERE userId = ? AND fazendaId IN (${marcas})`,
          params,
        );
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId, fazendaId, nome, sigla, descricao, ativo
           FROM lotes
           WHERE userId = ? AND fazendaId IN (${marcas})
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
          [...params, consulta.limit, consulta.offset],
        );
        return { itens: linhas.map(loteDe), total: Number(contagem[0]?.total ?? 0) };
      },

      async obterLote(titularId, id) {
        const [linhas] = await sql.query<RowDataPacket[]>(
          `SELECT id, userId, fazendaId, nome, sigla, descricao, ativo
           FROM lotes WHERE id = ? AND userId = ? LIMIT 1`,
          [id, titularId],
        );
        return linhas[0] ? loteDe(linhas[0]) : null;
      },

      async inserirAnimal(row) {
        const [resultado] = await sql.query<RowDataPacket[]>(
          `INSERT INTO animais (userId, fazendaId, loteId, brinco, brincoEletronico, nome, sexo, status, pesoEntrada)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo', ?)`,
          [row.userId, row.fazendaId, row.loteId, row.brinco, row.brincoEletronico, row.nome, row.sexo, row.pesoEntrada],
        );
        return Number((resultado as unknown as { insertId: number }).insertId);
      },

      async atualizarAnimal(id, titularId, patch) {
        const campos: string[] = [];
        const params: unknown[] = [];
        if (patch.nome !== undefined) {
          campos.push("nome = ?");
          params.push(patch.nome);
        }
        if (patch.brinco !== undefined) {
          campos.push("brinco = ?");
          params.push(patch.brinco);
        }
        if (patch.brincoEletronico !== undefined) {
          campos.push("brincoEletronico = ?");
          params.push(patch.brincoEletronico);
        }
        if (patch.fazendaId !== undefined) {
          campos.push("fazendaId = ?");
          params.push(patch.fazendaId);
        }
        if (patch.pesoEntrada !== undefined) {
          campos.push("pesoEntrada = ?");
          params.push(patch.pesoEntrada);
        }
        if (campos.length === 0) return;
        await sql.query(
          `UPDATE animais SET ${campos.join(", ")} WHERE id = ? AND userId = ?`,
          [...params, id, titularId],
        );
      },

      async inserirLote(row) {
        const [resultado] = await sql.query<RowDataPacket[]>(
          `INSERT INTO lotes (userId, fazendaId, nome, sigla, descricao, ativo)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [row.userId, row.fazendaId, row.nome, row.sigla, row.descricao],
        );
        return Number((resultado as unknown as { insertId: number }).insertId);
      },

      async atualizarLote(id, titularId, patch) {
        const campos: string[] = [];
        const params: unknown[] = [];
        if (patch.nome !== undefined) {
          campos.push("nome = ?");
          params.push(patch.nome);
        }
        if (patch.sigla !== undefined) {
          campos.push("sigla = ?");
          params.push(patch.sigla);
        }
        if (patch.descricao !== undefined) {
          campos.push("descricao = ?");
          params.push(patch.descricao);
        }
        if (campos.length === 0) return;
        await sql.query(
          `UPDATE lotes SET ${campos.join(", ")} WHERE id = ? AND userId = ?`,
          [...params, id, titularId],
        );
      },

      async inserirMovimento(row) {
        const [resultado] = await sql.query<RowDataPacket[]>(
          `INSERT INTO animal_lote_movimentacoes
             (userId, animalId, loteOrigemId, loteDestinoId, fazendaId, dataMovimentacao, usuarioNome)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
          [row.userId, row.animalId, row.loteDestinoId, row.fazendaId, row.dataMovimentacao, row.usuarioNome],
        );
        return Number((resultado as unknown as { insertId: number }).insertId);
      },
    };
  }

  async function emTransacao<T>(fn: (tx: RepositorioRebanho) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();
    try {
      await afirmarBanco(conn);
      await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await conn.beginTransaction();
      const resultado = await fn(repositorio(conn, true));
      await conn.commit();
      return resultado;
    } catch (erro) {
      await conn.rollback();
      throw erro;
    } finally {
      conn.release();
    }
  }

  return {
    servico: criarServicoRebanho({
      ler: repositorio(pool, false),
      emTransacao,
    }),
    async contar(tabela: "animais" | "lotes" | "animal_lote_movimentacoes") {
      await afirmarBanco(pool);
      const [linhas] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${tabela}`);
      return Number(linhas[0]?.total ?? 0);
    },
  };
}

function animalDe(linha: RowDataPacket): AnimalPersistido {
  return {
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    loteId: linha.loteId == null ? null : Number(linha.loteId),
    brinco: linha.brinco == null ? null : String(linha.brinco),
    brincoEletronico: linha.brincoEletronico == null ? null : String(linha.brincoEletronico),
    nome: linha.nome == null ? null : String(linha.nome),
    sexo: linha.sexo === "femea" ? "femea" : "macho",
    status: String(linha.status),
  };
}

function loteDe(linha: RowDataPacket): LotePersistido {
  return {
    id: Number(linha.id),
    userId: Number(linha.userId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    nome: String(linha.nome),
    sigla: linha.sigla == null ? null : String(linha.sigla),
    descricao: linha.descricao == null ? null : String(linha.descricao),
    ativo: Number(linha.ativo) === 1,
  };
}

export type { PoolConnection };
