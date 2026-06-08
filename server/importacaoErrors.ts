/**
 * Converte erros brutos do Drizzle/MySQL em mensagens amigáveis para importação em massa.
 */

function extractErrorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  const cause = (err as Error & { cause?: { message?: string; sqlMessage?: string; errno?: number } }).cause;
  if (cause?.sqlMessage) parts.push(cause.sqlMessage);
  if (cause?.message) parts.push(cause.message);
  return parts.join(' ');
}

function errno(err: unknown): number | undefined {
  const cause = (err as Error & { cause?: { errno?: number } })?.cause;
  return cause?.errno;
}

export function formatImportDbError(
  err: unknown,
  context?: { campo?: string }
): string {
  const full = extractErrorText(err).toLowerCase();
  const code = errno(err);
  const campo = context?.campo ?? 'informado';

  if (
    code === 1452 ||
    full.includes('foreign key') ||
    full.includes('cannot add or update a child row')
  ) {
    return 'A Fazenda informada não foi encontrada ou não pertence ao seu cadastro.';
  }

  if (code === 1054 || full.includes('unknown column')) {
    return 'Erro de estrutura do banco de dados. Atualize o sistema e tente novamente.';
  }

  if (code === 1062 || full.includes('duplicate entry')) {
    return 'Já existe um registro com estes dados.';
  }

  if (code === 1406 || full.includes('data too long')) {
    return `O campo ${campo} excede o tamanho máximo permitido.`;
  }

  if (
    full.includes('incorrect') ||
    full.includes('truncated') ||
    full.includes('enum') ||
    full.includes('out of range')
  ) {
    if (full.includes('status')) {
      return 'O campo Status possui um valor inválido.';
    }
    if (full.includes('anoconstrucao') || full.includes('ano')) {
      return 'O campo Ano deve conter um número válido.';
    }
    if (full.includes('valor')) {
      return 'O campo Valor (R$) possui um formato inválido.';
    }
    return `O campo ${campo} possui um valor inválido.`;
  }

  if (process.env.NODE_ENV === 'development') {
    return extractErrorText(err).slice(0, 600);
  }

  return 'Não foi possível salvar o registro. Verifique os dados e tente novamente.';
}
