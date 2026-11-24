import mysql from "mysql2/promise";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";

/** Consultas só de leitura. Não há INSERT, UPDATE, DELETE nem ALTER. */
export const CONSULTAS_LEITURA_ESQUEMA = [
  "SELECT @@version AS versao",
  `SELECT TABLE_NAME AS tabela FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
  `SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo
   FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
  `SELECT TABLE_NAME AS tabela, INDEX_NAME AS indice, NON_UNIQUE AS naoUnico, COLUMN_NAME AS coluna
   FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`,
  `SELECT TABLE_NAME AS tabela, CONSTRAINT_NAME AS chave, REFERENCED_TABLE_NAME AS referencia
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
] as const;

export function consultasSaoSomenteLeitura(consultas: readonly string[]): boolean {
  return consultas.every(consulta => /^\s*select\b/i.test(consulta) && !/\b(insert|update|delete|alter|drop|create|truncate)\b/i.test(consulta));
}

export async function lerEsquemaDescartavel(alvo: AlvoMysql & { user: string; password: string }) {
  afirmarBancoDescartavel(alvo);
  if (!consultasSaoSomenteLeitura(CONSULTAS_LEITURA_ESQUEMA)) {
    throw new Error("O roteiro de leitura deixou de ser somente consulta.");
  }
  const conn = await mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    database: alvo.database,
  });
  try {
    const [versao] = await conn.query<mysql.RowDataPacket[]>(CONSULTAS_LEITURA_ESQUEMA[0]);
    const [tabelas] = await conn.query<mysql.RowDataPacket[]>(CONSULTAS_LEITURA_ESQUEMA[1]);
    return {
      versao: String(versao[0]?.versao ?? ""),
      tabelas: tabelas.map(linha => String(linha.tabela)),
      situacaoOperacional: "NÃO VERIFICADO NO OPERACIONAL" as const,
    };
  } finally {
    await conn.end();
  }
}
