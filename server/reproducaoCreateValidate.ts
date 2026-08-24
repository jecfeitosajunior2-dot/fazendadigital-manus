import { TRPCError } from "@trpc/server";
import { assertAnimalNaFazenda, assertFazendaDoUsuario } from "./manejoContexto";

/** Mesma mensagem usada no frontend (`ManejoPages.tsx`). */
export const MSG_REPRO_DATA_FUTURA =
  "A data do manejo reprodutivo não pode ser futura.";

export const MSG_REPRO_DATA_INVALIDA = "Data do manejo reprodutivo inválida.";

export const MSG_REPRO_FAZENDA_OBRIGATORIA = "Selecione uma Fazenda.";

/** Data civil local no formato YYYY-MM-DD. */
export function getLocalDateISO(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
}

export function parseReproDataISO(value: string): string | null {
  const dataISO = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return null;
  return dataISO;
}

/** Comparação por dia civil local — mesma estratégia de Pesagem/Sanitário. */
export function validateReproDataCoberturaNaoFutura(
  dataCobertura: string,
  refDate?: Date,
): { ok: true; dataISO: string } | { ok: false; message: string } {
  const dataISO = parseReproDataISO(dataCobertura);
  if (!dataISO) {
    return { ok: false, message: MSG_REPRO_DATA_INVALIDA };
  }
  const hojeISO = getLocalDateISO(refDate);
  if (dataISO > hojeISO) {
    return { ok: false, message: MSG_REPRO_DATA_FUTURA };
  }
  return { ok: true, dataISO };
}

export type ReproducaoCreatePreconditionsInput = {
  animalId: number;
  fazendaId?: number;
  dataCobertura: string;
};

/** Valida fazenda × animal principal e data do evento antes de persistir. */
export async function validateReproducaoCreatePreconditions(
  userId: number,
  input: ReproducaoCreatePreconditionsInput,
  refDate?: Date,
) {
  const fazendaId = input.fazendaId;
  if (fazendaId == null || !Number.isFinite(fazendaId) || fazendaId <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: MSG_REPRO_FAZENDA_OBRIGATORIA,
    });
  }

  await assertFazendaDoUsuario(userId, fazendaId);
  const animal = await assertAnimalNaFazenda(userId, input.animalId, fazendaId);

  const dataCheck = validateReproDataCoberturaNaoFutura(input.dataCobertura, refDate);
  if (!dataCheck.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: dataCheck.message });
  }

  return { animal, dataISO: dataCheck.dataISO, fazendaId };
}
