import { z } from "zod";

/** Enum real de `compras.status` — o frontend envia estes valores, não os rótulos. */
export const COMPRA_STATUS_LISTAGEM = ["pendente", "concluido", "cancelado"] as const;
export type StatusComprasList = (typeof COMPRA_STATUS_LISTAGEM)[number];

export const comprasListInputSchema = z
  .object({
    fazendaId: z.number().int().positive().optional(),
    status: z.enum(COMPRA_STATUS_LISTAGEM).optional(),
  })
  .optional();

/** `Todos` / vazio / rótulo visual não entram no WHERE. */
export function statusWhereComprasList(status?: string | null): StatusComprasList | undefined {
  if (status === "pendente" || status === "concluido" || status === "cancelado") return status;
  return undefined;
}

export function whereListagemCompras(
  userId: number,
  filtro?: { fazendaId?: number; status?: string | null },
): { userId: number; fazendaId?: number; status?: StatusComprasList } {
  const fazendaId =
    filtro?.fazendaId != null && Number.isInteger(filtro.fazendaId) && filtro.fazendaId > 0
      ? filtro.fazendaId
      : undefined;
  return {
    userId,
    fazendaId,
    status: statusWhereComprasList(filtro?.status),
  };
}
