import { TRPCError } from "@trpc/server";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoReprodutivamenteMaduro,
  MSG_REPRO_INELEGIVEL,
} from "../shared/reproElegibilidade";
import { assertAnimalNaFazenda } from "./manejoContexto";
import { assertManejoPermitidoNaData } from "./animalBaixa";

export const MSG_REPRO_MACHO_ID_TIPO_INVALIDO =
  "Reprodutor estruturado só se aplica a Cobertura ou Inseminação.";
export const MSG_REPRO_MACHO_IGUAL_MATRIZ =
  "O reprodutor não pode ser a mesma matriz do evento.";
export const MSG_REPRO_MACHO_NAO_E_MACHO = "O reprodutor selecionado não é macho.";
export const MSG_REPRO_MACHO_INATIVO =
  "O reprodutor selecionado deve estar ativo para registro operacional.";

const TIPOS_COM_MACHO_ESTRUTURADO = new Set(["Cobertura", "Inseminação"]);

export async function validateReproMachoIdForFemeaEvent(
  userId: number,
  input: {
    matrizId: number;
    fazendaId: number;
    machoId: number;
    tipo: string;
    dataEvento?: string;
  },
): Promise<void> {
  const tipo = input.tipo.trim();
  if (!TIPOS_COM_MACHO_ESTRUTURADO.has(tipo)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MACHO_ID_TIPO_INVALIDO });
  }

  if (input.machoId === input.matrizId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MACHO_IGUAL_MATRIZ });
  }

  const macho = await assertAnimalNaFazenda(userId, input.machoId, input.fazendaId);

  if (macho.sexo !== "macho") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MACHO_NAO_E_MACHO });
  }

  if (input.dataEvento) {
    await assertManejoPermitidoNaData(userId, input.machoId, input.dataEvento);
  } else if (macho.status !== "ativo") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MACHO_INATIVO });
  }

  const elegInput = buildReproAnimalElegibilidadeInput(macho);
  if (!isMachoReprodutivamenteMaduro(elegInput)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_INELEGIVEL });
  }
}
