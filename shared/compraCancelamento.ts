export const MSG_COMPRA_CANCELAR_NAO_ENCONTRADA = "Compra não encontrada.";
export const MSG_COMPRA_CANCELAR_JA_CANCELADA = "Esta compra já está cancelada.";
export const MSG_COMPRA_CANCELAR_NAO_CONCLUIDA = "Só é possível cancelar uma compra concluída.";
export const MSG_COMPRA_CANCELAR_COM_ANIMAIS =
  "Esta compra possui animais já identificados no rebanho e não pode ser cancelada diretamente.";
export const MSG_COMPRA_CANCELAR_COM_ANIMAIS_DETALHE =
  "Para desfazer esta operação será necessário realizar o fluxo de devolução/estorno dos animais.";
export const MSG_COMPRA_CANCELAR_MOTIVO = "Informe o motivo do cancelamento.";
export const MSG_COMPRA_CANCELAR_FALHOU = "Não foi possível cancelar a compra.";
export const MSG_COMPRA_EXCLUIR_CONCLUIDA =
  "Uma compra concluída não pode ser excluída. Cancele o registro comercial.";
export const MSG_COMPRA_EXCLUIR_CANCELADA = "Uma compra cancelada não pode ser excluída.";
export const MSG_COMPRA_EXCLUIR_COM_ANIMAIS =
  "Esta compra possui animais já identificados no rebanho e não pode ser excluída.";
export const MSG_COMPRA_EXCLUIR_COM_GRUPOS =
  "Esta compra possui composição comercial e não pode ser excluída. Cancele o registro.";

export const MSG_COMPRA_IDENTIFICACAO_ENCERRADA = "Compra cancelada — identificação encerrada.";

export function normalizarMotivoCancelamentoCompra(raw: unknown): string | null {
  const texto = String(raw ?? "").trim();
  if (!texto) return null;
  return texto.slice(0, 255);
}

export function podeCancelarCompraComercial(opts: {
  status?: string | null;
  identificados: number;
}): boolean {
  return opts.status === "concluido" && (opts.identificados ?? 0) <= 0;
}

export function podeExcluirCompraFisicamente(opts: {
  status?: string | null;
  temGrupos: boolean;
  identificados: number;
}): boolean {
  if ((opts.identificados ?? 0) > 0) return false;
  if (opts.status === "concluido" || opts.status === "cancelado") return false;
  if (opts.temGrupos) return false;
  return true;
}

export function mensagemBloqueioExclusaoCompra(opts: {
  status?: string | null;
  temGrupos: boolean;
  identificados: number;
}): string {
  if ((opts.identificados ?? 0) > 0) return MSG_COMPRA_EXCLUIR_COM_ANIMAIS;
  if (opts.status === "cancelado") return MSG_COMPRA_EXCLUIR_CANCELADA;
  if (opts.status === "concluido") return MSG_COMPRA_EXCLUIR_CONCLUIDA;
  if (opts.temGrupos) return MSG_COMPRA_EXCLUIR_COM_GRUPOS;
  return MSG_COMPRA_EXCLUIR_CONCLUIDA;
}

export function operacaoComercialEntraNoTotal(status?: string | null): boolean {
  return status !== "cancelado";
}

export function enriquecerComprasListagem<T extends { id: number; status?: string | null }>(
  rows: T[],
  vinculos: ReadonlyArray<{ compraId?: number | null }>,
) {
  const identificadosPorCompra = new Map<number, number>();
  for (const row of vinculos) {
    if (row.compraId == null) continue;
    identificadosPorCompra.set(row.compraId, (identificadosPorCompra.get(row.compraId) ?? 0) + 1);
  }

  return rows.map(row => {
    const identificados = identificadosPorCompra.get(row.id) ?? 0;
    return {
      ...row,
      identificados,
      podeCancelar: podeCancelarCompraComercial({ status: row.status, identificados }),
    };
  });
}
