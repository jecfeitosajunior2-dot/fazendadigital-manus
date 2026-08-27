export type ShouldLoadSemenPartidasInput = {
  tipoReprodutivo: string;
  fazendaId: number;
  origemReprodutor: "" | "interno" | "externo";
  machoId?: number | null;
  reprodutorKeyExterno?: string | null;
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
    const key = (input.reprodutorKeyExterno ?? "").trim();
    return key.startsWith("e:") && key.length > 2;
  }

  return false;
}
