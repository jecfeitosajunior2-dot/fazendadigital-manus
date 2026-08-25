export type ShouldLoadSemenPartidasInput = {
  tipoReprodutivo: string;
  fazendaId: number;
  origemReprodutor: "" | "interno" | "externo";
  machoId?: number | null;
  reprodutorTextoExterno?: string | null;
};

/** Condição de execução da query `semen.listDisponiveisParaInseminacao` — sempre boolean. */
export function shouldLoadSemenPartidasParaInseminacao(
  input: ShouldLoadSemenPartidasInput,
): boolean {
  if (input.tipoReprodutivo.trim() !== "Inseminação") return false;

  const fazendaId = Number(input.fazendaId);
  if (!Number.isInteger(fazendaId) || fazendaId <= 0) return false;

  if (input.origemReprodutor === "interno") {
    const machoId = Number(input.machoId);
    return Number.isInteger(machoId) && machoId > 0;
  }

  if (input.origemReprodutor === "externo") {
    return (input.reprodutorTextoExterno ?? "").trim().length > 0;
  }

  return false;
}
