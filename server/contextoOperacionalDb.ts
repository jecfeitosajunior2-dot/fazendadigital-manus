import type { Pool, RowDataPacket } from "mysql2/promise";
import type { IdentidadeUsuario, PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { loginPermitido } from "./_core/identidadeSessao";
import type { FazendaConhecida, VinculoFazenda } from "./acessoFazendas";
import { autorizarOperacao, type EntradaOperacional, type ResultadoOperacional } from "./contextoOperacional";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";

/**
 * Lê identidade, permissões e fazenda no banco que o chamador já isolou.
 * Não usa o banco operacional e não abre rota.
 */

export type PedidoContextoPersistido = {
  permissaoId: string;
  fazendaId?: number | null;
  sessionVersionDaSessao?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

function afirmarSqlDeLeitura(sql: string): void {
  const texto = sql.trim().toLowerCase();
  if (!texto.startsWith("select ") || texto.includes(";")) {
    throw new Error("Somente leitura é aceita neste contexto.");
  }
}

export function criarContextoOperacionalDb(pool: Pool, alvo: AlvoMysql) {
  afirmarBancoDescartavel(alvo);

  async function ler<T extends RowDataPacket[]>(sql: string, params: readonly unknown[] = []): Promise<T> {
    afirmarBancoDescartavel(alvo);
    afirmarSqlDeLeitura(sql);
    const [banco] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    const nome = String(banco[0]?.nome ?? "");
    if (nome.toLowerCase() !== alvo.database.toLowerCase() || nome.toLowerCase() === "fazenda_digital") {
      throw new Error("Conexão recusada: banco inesperado.");
    }
    const [linhas] = await pool.query<T>(sql, params as unknown[]);
    return linhas;
  }

  async function carregar(executorId: number, pedido: PedidoContextoPersistido): Promise<EntradaOperacional | null> {
    if (!Number.isInteger(executorId) || executorId <= 0) return null;
    const linhas = await ler<RowDataPacket[]>(
      `SELECT id, papel, role, titularUserId, situacao, sessionVersion
       FROM users WHERE id = ?`,
      [executorId],
    );
    const linha = linhas[0];
    if (!linha || linha.titularUserId == null) return null;
    const papel = String(linha.papel) as PapelConta;
    const situacao = String(linha.situacao) as SituacaoUsuario;
    if (!loginPermitido(situacao)) return null;
    const identidade: IdentidadeUsuario = {
      id: Number(linha.id),
      openId: "",
      name: null,
      email: null,
      role: linha.role === "admin" ? "admin" : "user",
      papel,
      titularUserId: Number(linha.titularUserId),
      situacao,
      sessionVersion: Number(linha.sessionVersion),
    };
    const permissoes = await ler<RowDataPacket[]>(
      `SELECT permissao FROM usuario_permissoes
       WHERE userId = ? AND titularUserId = ?
       ORDER BY permissao`,
      [identidade.id, identidade.titularUserId],
    );
    const fazendasDoTitular = await ler<RowDataPacket[]>(
      "SELECT id, userId FROM fazendas WHERE userId = ? ORDER BY id",
      [identidade.titularUserId],
    );
    const vinculos = identidade.papel === "principal"
      ? []
      : await ler<RowDataPacket[]>(
        `SELECT uf.userId, uf.fazendaId
         FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId
         WHERE uf.userId = ? AND u.titularUserId = ?
         ORDER BY uf.fazendaId`,
        [identidade.id, identidade.titularUserId],
      );
    let fazenda: FazendaConhecida | null = null;
    if (pedido.fazendaId != null) {
      const achadas = await ler<RowDataPacket[]>(
        "SELECT id, userId FROM fazendas WHERE id = ? LIMIT 1",
        [pedido.fazendaId],
      );
      const row = achadas[0];
      if (row) fazenda = { id: Number(row.id), userId: Number(row.userId) };
    }
    return {
      identidade,
      permissoes: permissoes.map((item) => String(item.permissao)),
      permissaoId: pedido.permissaoId,
      fazendasDoTitular: fazendasDoTitular.map((item) => ({ id: Number(item.id), userId: Number(item.userId) })),
      vinculos: vinculos.map((item): VinculoFazenda => ({
        userId: Number(item.userId),
        fazendaId: Number(item.fazendaId),
      })),
      fazendaId: pedido.fazendaId,
      fazenda,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    };
  }

  return {
    async resolver(executorId: number, pedido: PedidoContextoPersistido): Promise<ResultadoOperacional> {
      const entrada = await carregar(executorId, pedido);
      if (!entrada) return { ok: false, motivo: "sem_identidade" };
      return autorizarOperacao(entrada);
    },
  };
}
