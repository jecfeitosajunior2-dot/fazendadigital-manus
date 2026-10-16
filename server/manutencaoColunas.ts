import { getTableColumns } from "drizzle-orm";
import { manutencoes } from "../drizzle/schema";

/**
 * Colunas da OS que já existem no MySQL do produtor.
 * Exclui chaveOperacao até a migration 0060 ser autorizada.
 */
export function colunasManutencaoSemChaveOperacao() {
  const { chaveOperacao: _aindaNaoMigrada, ...colunas } = getTableColumns(manutencoes);
  return colunas;
}
