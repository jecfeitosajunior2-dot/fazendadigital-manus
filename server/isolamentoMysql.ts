/** Barreira do banco descartável. O operacional não entra nesta conexão. */

export const BANCO_OPERACIONAL = "fazenda_digital";
export const PORTA_OPERACIONAL = 3306;
export const CONTAINER_OPERACIONAL = "fazenda-digital-mysql";

export type AlvoMysql = {
  host: string;
  port: number;
  database: string;
  container?: string;
};

export function afirmarBancoDescartavel(alvo: AlvoMysql): void {
  const banco = alvo.database.trim().toLowerCase();
  if (!banco || banco === BANCO_OPERACIONAL) {
    throw new Error("Conexão recusada: banco operacional.");
  }
  if (alvo.port === PORTA_OPERACIONAL) {
    throw new Error("Conexão recusada: porta do banco operacional.");
  }
  if (alvo.container === CONTAINER_OPERACIONAL) {
    throw new Error("Conexão recusada: instância operacional.");
  }
  if (alvo.host !== "127.0.0.1") {
    throw new Error("Conexão recusada: host fora do teste local.");
  }
}
