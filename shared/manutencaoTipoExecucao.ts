export const MANUT_TIPO_EXECUCAO_INTERNA = "interna";
export const MANUT_TIPO_EXECUCAO_EXTERNA = "externa";

export const MSG_MANUT_INTERNA_SEM_MAO_OBRA =
  "Manutenção interna não aceita custo de mão de obra.";

export type TipoExecucaoManutencao =
  | typeof MANUT_TIPO_EXECUCAO_INTERNA
  | typeof MANUT_TIPO_EXECUCAO_EXTERNA;

/** Lê só o valor persistido. Não infere pelo nome do prestador nem pela mão de obra. */
export function lerTipoExecucaoManutencao(raw: unknown): TipoExecucaoManutencao | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === MANUT_TIPO_EXECUCAO_INTERNA) return MANUT_TIPO_EXECUCAO_INTERNA;
  if (v === MANUT_TIPO_EXECUCAO_EXTERNA) return MANUT_TIPO_EXECUCAO_EXTERNA;
  return null;
}

export function resolverValorMaoObraManutencao(input: {
  tipoExecucao?: string | null;
  valorMaoObra?: number | null;
}): { ok: true; valorMaoObra: number } | { ok: false; message: string } {
  const tipo = lerTipoExecucaoManutencao(input.tipoExecucao);
  const bruto = Number(input.valorMaoObra);
  const valor = Number.isFinite(bruto) && bruto > 0 ? bruto : 0;

  if (tipo === MANUT_TIPO_EXECUCAO_INTERNA) {
    if (Number.isFinite(bruto) && bruto > 0) {
      return { ok: false, message: MSG_MANUT_INTERNA_SEM_MAO_OBRA };
    }
    return { ok: true, valorMaoObra: 0 };
  }

  return { ok: true, valorMaoObra: valor };
}
