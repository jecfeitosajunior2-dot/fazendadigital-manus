export type ReprodutorOrigemFemea = "" | "interno" | "externo";

export type BuildReproReprodutorPayloadInput = {
  tipo: string;
  animalSexo?: string | null;
  machoId?: number | null;
  /** Brinco (ou label legível) do macho selecionado — nunca PK interna. */
  machoLabel?: string | null;
  textoExterno?: string | null;
  origem?: ReprodutorOrigemFemea;
};

export type ReproReprodutorPayload = {
  machoId?: number;
  reprodutorSemen?: string;
};

/** Monta machoId + reprodutorSemen para Cobertura/Inseminação feminina. */
export function buildReproReprodutorPayload(
  input: BuildReproReprodutorPayloadInput,
): ReproReprodutorPayload {
  if (input.animalSexo !== "femea") return {};

  const tipo = input.tipo.trim();
  if (tipo !== "Cobertura" && tipo !== "Inseminação") return {};

  const machoId =
    input.machoId != null && input.machoId > 0 ? input.machoId : undefined;

  if (machoId) {
    const label = input.machoLabel?.trim();
    return {
      machoId,
      ...(label ? { reprodutorSemen: label } : {}),
    };
  }

  if (tipo === "Inseminação" && input.origem === "externo") {
    const texto = input.textoExterno?.trim();
    return texto ? { reprodutorSemen: texto } : {};
  }

  return {};
}
