/** Normaliza data para coluna MySQL DATE (YYYY-MM-DD). */
export function normalizeBenfeitoriaDate(input: string | undefined): string | null {
  if (!input?.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export type BenfeitoriaWriteInput = {
  fazendaId: number;
  nome: string;
  anoConstrucao: number;
  tipo?: string;
  vidaUtil?: string;
  percentualAtividade?: number;
  localizacao?: string;
  status?: "ativo" | "manutencao" | "inativo";
  dataInstalacao?: string;
  valorEstimado?: string;
  observacoes?: string;
};

/**
 * Monta o objeto de insert/update com null explícito em campos opcionais.
 * Evita que o Drizzle desloque parâmetros (ex.: valor indo para dataInstalacao).
 */
export function toBenfeitoriaRow(
  userId: number,
  data: BenfeitoriaWriteInput,
  images: [string | null, string | null, string | null],
) {
  const [imagem1, imagem2, imagem3] = images;
  const row: Record<string, unknown> = {
    userId,
    fazendaId: data.fazendaId,
    nome: data.nome.trim(),
    anoConstrucao: data.anoConstrucao,
    status: data.status ?? "ativo",
  };

  const tipo = data.tipo?.trim();
  if (tipo) row.tipo = tipo;

  const vidaUtil = data.vidaUtil?.trim();
  if (vidaUtil) row.vidaUtil = vidaUtil;

  if (data.percentualAtividade != null) {
    row.percentualAtividade = String(data.percentualAtividade);
  }

  const localizacao = data.localizacao?.trim();
  if (localizacao) row.localizacao = localizacao;

  const dataInstalacao = normalizeBenfeitoriaDate(data.dataInstalacao);
  if (dataInstalacao) row.dataInstalacao = dataInstalacao;

  if (data.valorEstimado) row.valorEstimado = data.valorEstimado;

  const observacoes = data.observacoes?.trim();
  if (observacoes) row.observacoes = observacoes;

  if (imagem1) row.imagem1 = imagem1;
  if (imagem2) row.imagem2 = imagem2;
  if (imagem3) row.imagem3 = imagem3;

  return row;
}

export function toBenfeitoriaUpdateRow(
  data: BenfeitoriaWriteInput,
  images: [string | null, string | null, string | null],
) {
  const row = toBenfeitoriaRow(0, data, images);
  const { userId: _userId, ...update } = row;
  return update;
}
