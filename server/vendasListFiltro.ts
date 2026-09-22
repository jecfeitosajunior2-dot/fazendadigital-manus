import { z } from "zod";

/** Enum real de `vendas.status` — o frontend envia estes valores, não os rótulos. */
export const VENDA_STATUS_LISTAGEM = ["pendente", "concluido", "cancelado"] as const;
export type StatusVendasList = (typeof VENDA_STATUS_LISTAGEM)[number];

export const vendasListInputSchema = z
  .object({
    fazendaId: z.number().int().positive().optional(),
    status: z.enum(VENDA_STATUS_LISTAGEM).optional(),
  })
  .optional();

/** `Todos` / vazio / rótulo visual não entram no WHERE. */
export function statusWhereVendasList(status?: string | null): StatusVendasList | undefined {
  if (status === "pendente" || status === "concluido" || status === "cancelado") return status;
  return undefined;
}
