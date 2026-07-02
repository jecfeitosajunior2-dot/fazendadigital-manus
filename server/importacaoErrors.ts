/**
 * Converte erros brutos do Drizzle/MySQL em mensagens amigáveis para importação em massa.
 */

type DbCause = { message?: string; sqlMessage?: string; errno?: number };

function getCause(err: unknown): DbCause | undefined {
  return (err as Error & { cause?: DbCause })?.cause;
}

function stripNoiseFromMessage(message: string): string {
  const withoutParams = message.split(/\bparams:/i)[0] ?? message;
  return withoutParams
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[imagem]")
    .trim();
}

/** Texto curto para classificar o erro (sem base64 nem lista de parâmetros). */
function extractClassificationText(err: unknown): string {
  const cause = getCause(err);
  if (cause?.sqlMessage) return cause.sqlMessage;
  if (cause?.message && !cause.message.startsWith("Failed query:")) return cause.message;
  if (err instanceof Error) return stripNoiseFromMessage(err.message);
  return String(err);
}

function extractErrorText(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) parts.push(stripNoiseFromMessage(err.message));
  const cause = getCause(err);
  if (cause?.sqlMessage) parts.push(cause.sqlMessage);
  if (cause?.message) parts.push(cause.message);
  return parts.filter(Boolean).join(" ");
}

function extractMysqlColumn(errText: string): string | undefined {
  const forColumn = errText.match(/for column [`'"]?([^`'"]+)[`'"]?/i);
  if (forColumn?.[1]) return forColumn[1].toLowerCase();

  const atRow = errText.match(/column [`'"]?([^`'"]+)[`'"]? at row/i);
  return atRow?.[1]?.toLowerCase();
}

function columnLabel(column: string): string {
  const map: Record<string, string> = {
    status: "Status",
    anoconstrucao: "Ano",
    valorestimado: "Valor (R$)",
    valor_estimado: "Valor (R$)",
    datainstalacao: "Data de instalação",
    data_construcao: "Data de construção",
    userid: "Usuário",
    fazendaid: "Fazenda",
    nome: "Nome",
    vidautil: "Vida útil",
    imagem1: "Foto 1",
    imagem2: "Foto 2",
    imagem3: "Foto 3",
  };
  return map[column] ?? column;
}

function errno(err: unknown): number | undefined {
  return getCause(err)?.errno;
}

function errorCode(err: unknown): string | undefined {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const item = current as { code?: string; cause?: unknown };
    if (item.code) return item.code;
    current = item.cause;
  }
  return undefined;
}

export function formatImportDbError(
  err: unknown,
  context?: { campo?: string }
): string {
  const full = extractClassificationText(err).toLowerCase();
  const code = errno(err);
  const campo = context?.campo ?? "informado";

  if (
    errorCode(err) === "ECONNREFUSED" ||
    full.includes("econnrefused") ||
    full.includes("protocol_connection_lost")
  ) {
    return "Banco de dados offline. Ligue o MySQL (pnpm db:up) ou tente salvar de novo — o sistema pode gravar localmente.";
  }

  if (
    code === 1452 ||
    full.includes("foreign key") ||
    full.includes("cannot add or update a child row")
  ) {
    return "A Fazenda informada não foi encontrada ou não pertence ao seu cadastro.";
  }

  if (code === 1054 || full.includes("unknown column")) {
    return "Erro de estrutura do banco de dados. Atualize o sistema e tente novamente.";
  }

  if (code === 1062 || full.includes("duplicate entry")) {
    return "Já existe um registro com estes dados.";
  }

  if (code === 1406 || full.includes("data too long")) {
    const column = extractMysqlColumn(full);
    if (column?.startsWith("imagem")) {
      return "A foto é grande demais. Use imagens de até 5 MB ou cadastre sem foto.";
    }
    return `O campo ${column ? columnLabel(column) : campo} excede o tamanho máximo permitido.`;
  }

  if (
    full.includes("incorrect") ||
    full.includes("truncated") ||
    full.includes("out of range")
  ) {
    const column = extractMysqlColumn(full);
    if (column === "status") {
      return "O campo Status possui um valor inválido.";
    }
    if (column === "anoconstrucao" || column === "ano") {
      return "O campo Ano deve conter um número válido.";
    }
    if (column === "valorestimado" || column === "valor_estimado") {
      return "O campo Valor (R$) possui um formato inválido.";
    }
    if (column === "datainstalacao" || column === "data_construcao") {
      return "O campo de data possui um valor inválido.";
    }
    if (column) {
      return `O campo ${columnLabel(column)} possui um valor inválido.`;
    }
    return `O campo ${campo} possui um valor inválido.`;
  }

  if (process.env.NODE_ENV === "development") {
    return extractErrorText(err).slice(0, 600);
  }

  return "Não foi possível salvar o registro. Verifique os dados e tente novamente.";
}
