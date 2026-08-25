import { TRPCError } from "@trpc/server";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoReprodutivamenteMaduro,
  MSG_REPRO_INELEGIVEL,
} from "../shared/reproElegibilidade";
import { resolveSemenMachoDisplayLabel } from "../shared/semenEstoque";
import { assertAnimalNaFazenda } from "./manejoContexto";

export const MSG_SEMEN_MACHO_NAO_E_MACHO = "O reprodutor selecionado não é macho.";
export const MSG_SEMEN_MACHO_INATIVO =
  "O reprodutor selecionado deve estar ativo para entrada de sêmen.";

export async function validateSemenMachoInterno(
  userId: number,
  fazendaId: number,
  machoId: number,
): Promise<{ machoId: number; reprodutorTexto: string }> {
  const macho = await assertAnimalNaFazenda(userId, machoId, fazendaId);

  if (macho.sexo !== "macho") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_SEMEN_MACHO_NAO_E_MACHO });
  }

  if (macho.status !== "ativo") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_SEMEN_MACHO_INATIVO });
  }

  const elegInput = buildReproAnimalElegibilidadeInput(macho);
  if (!isMachoReprodutivamenteMaduro(elegInput)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_INELEGIVEL });
  }

  return {
    machoId,
    reprodutorTexto: resolveSemenMachoDisplayLabel({
      brinco: macho.brinco,
      nome: macho.nome,
    }),
  };
}
