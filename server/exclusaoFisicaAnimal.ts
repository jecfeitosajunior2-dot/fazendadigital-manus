import { TRPCError } from "@trpc/server";
import { MSG_EXCLUSAO_FISICA_INDISPONIVEL } from "../shared/animalExclusao";

/**
 * A rota animais.delete para aqui.
 * O serviço excluirAnimalAutorizado continua no código para revisão futura
 * e não é chamado por esta entrada.
 */
export function recusarExclusaoFisicaAnimal(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: MSG_EXCLUSAO_FISICA_INDISPONIVEL,
  });
}
