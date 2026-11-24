/**
 * O push do Drizzle só cria o modelo num banco vazio e descartável.
 * Se já existe tabela, ou se o comando remove estrutura, nada é aplicado.
 * O banco da fazenda fica fora deste caminho.
 */
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";

export function avaliarPush(
  alvo: AlvoMysql,
  comandos: string[],
  tabelasExistentes: number,
): { aplicar: boolean; motivo: string } {
  try {
    afirmarBancoDescartavel(alvo);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "Conexão recusada.";
    return { aplicar: false, motivo };
  }
  if (tabelasExistentes > 0) {
    return {
      aplicar: false,
      motivo: "O banco já tem tabelas. O push não altera estrutura existente.",
    };
  }
  const removem = comandos.filter((comando) => /\bdrop\b/i.test(comando));
  if (removem.length > 0) {
    return {
      aplicar: false,
      motivo: "O push removeria estrutura. Nada foi aplicado.",
    };
  }
  return { aplicar: true, motivo: "Banco vazio, sem remoção. O modelo pode ser criado." };
}
