import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { InseminacaoAindaPendente, textoMovimentoInseminacao } from "./inseminacaoSemenAutorizado";

export const SQL_TABELA_REPRODUCAO_OPERACOES = `
CREATE TABLE reproducao_operacoes (
  id int NOT NULL AUTO_INCREMENT,
  userId int NOT NULL,
  chave varchar(64) NOT NULL,
  fazendaId int NOT NULL,
  executorUserId int NOT NULL,
  conteudoHash varchar(64) NOT NULL,
  registroPrincipalId int NULL,
  espelhosMatriz int NOT NULL DEFAULT 0,
  matrizesIgnoradas int NOT NULL DEFAULT 0,
  criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY reproducao_operacoes_titular_chave_uq (userId, chave)
) ENGINE=InnoDB;
`;

function chaveDuplicada(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const item = atual as { errno?: number; code?: string; cause?: unknown };
    if (item.errno === 1062 || item.code === "ER_DUP_ENTRY") return true;
    atual = item.cause;
  }
  return false;
}

export function metodosOperacaoRepro(conn: PoolConnection) {
  return {
    async reservarOperacao(row: { userId: number; chave: string; fazendaId: number; executorUserId: number; conteudoHash: string }) {
      try {
        await conn.query(
          `INSERT INTO reproducao_operacoes (userId, chave, fazendaId, executorUserId, conteudoHash)
           VALUES (?, ?, ?, ?, ?)`,
          [row.userId, row.chave, row.fazendaId, row.executorUserId, row.conteudoHash],
        );
        return { situacao: "nova" as const };
      } catch (erro) {
        if (!chaveDuplicada(erro)) throw erro;
        const [linhas] = await conn.query<RowDataPacket[]>(
          `SELECT conteudoHash, registroPrincipalId FROM reproducao_operacoes WHERE userId = ? AND chave = ? FOR UPDATE`,
          [row.userId, row.chave],
        );
        const linha = linhas[0];
        if (!linha || String(linha.conteudoHash) !== row.conteudoHash) return { situacao: "divergente" as const };
        if (linha.registroPrincipalId == null) throw new InseminacaoAindaPendente();
        return { situacao: "repetida" as const, registroPrincipalId: Number(linha.registroPrincipalId) };
      }
    },
    async concluirOperacao(row: { userId: number; chave: string; registroPrincipalId: number }) {
      const [resultado] = await conn.query<ResultSetHeader>(
        `UPDATE reproducao_operacoes SET registroPrincipalId = ? WHERE userId = ? AND chave = ? AND registroPrincipalId IS NULL`,
        [row.registroPrincipalId, row.userId, row.chave],
      );
      if (Number(resultado.affectedRows) !== 1) throw new Error("inseminação não vinculada");
    },
    async movimentoDaInseminacao(userId: number, registroId: number, animalId: number) {
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM semen_movimentacoes WHERE user_id = ? AND tipo = 'SAIDA_IA' AND observacoes = ? LIMIT 2`,
        [userId, textoMovimentoInseminacao(animalId, registroId)],
      );
      return linhas.length === 1 ? Number(linhas[0]?.id) : null;
    },
  };
}
