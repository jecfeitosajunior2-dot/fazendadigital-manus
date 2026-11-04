import type { IdentidadeUsuario, PapelConta } from "./_core/identidadeSessao";
import { loginPermitido } from "./_core/identidadeSessao";

export type LinhaAuditoria = {
  executorUserId: number;
  executorNome: string;
  titularUserId: number;
  fazendaId: number | null;
  modulo: string;
  operacao: string;
  registroTipo: string | null;
  registroId: number | null;
  dadosAnteriores: unknown;
  dadosPosteriores: unknown;
};

export type EventoAuditoria = LinhaAuditoria & {
  id: number;
  criadoEm: string;
};

export type EntradaEventoAuditoria = {
  fazendaId?: number | null;
  modulo: string;
  operacao: string;
  registroTipo?: string | null;
  registroId?: number | null;
  dadosAnteriores?: unknown;
  dadosPosteriores?: unknown;
  /** Ignorado. O executor vem da identidade confirmada. */
  executorUserId?: number | null;
  /** Ignorado. O titular vem da identidade confirmada. */
  titularUserId?: number | null;
  /** Ignorado. O nome gravado é o da identidade. */
  executorNome?: string | null;
  /** Ignorado. A data é definida na gravação. */
  criadoEm?: string | null;
};

export type FiltroAuditoria = {
  modulo?: string;
  operacao?: string;
  fazendaId?: number;
  executorUserId?: number;
  de?: string;
  ate?: string;
  pagina?: number;
  tamanho?: number;
  /** Sem este sinal explícito, evento sem fazenda fica só com o principal. */
  autorizaEventosSemFazenda?: boolean;
  /** Ignorado. A conta consultada é a do acesso resolvido. */
  titularInformadoPeloCliente?: number | null;
};

export type AcessoConsultaAuditoria = {
  titularUserId: number;
  papel: PapelConta;
  fazendasAutorizadas: number[];
};

export type PaginaAuditoria = {
  itens: EventoAuditoria[];
  total: number;
  pagina: number;
  tamanho: number;
};

const TAMANHO_PADRAO = 20;
const TAMANHO_MAXIMO = 100;

const TRECHO_SENSIVEL = /senha|password|secret|token|cookie|apikey|credential|credencial|privatekey/;

function chaveSensivel(chave: string): boolean {
  const normal = chave.toLowerCase().replace(/[^a-z0-9]/g, "");
  return TRECHO_SENSIVEL.test(normal);
}

/** Tira senha, token, cookie e segredo, inclusive dentro de listas e objetos. */
export function sanitizarAuditoria(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(item => sanitizarAuditoria(item));
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (chaveSensivel(chave)) continue;
      saida[chave] = sanitizarAuditoria(item);
    }
    return saida;
  }
  return valor;
}

export function serializarDados(valor: unknown): string | null {
  if (valor == null) return null;
  return JSON.stringify(sanitizarAuditoria(valor));
}

function textoCurto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto || texto.length > limite) return null;
  return texto;
}

function idOpcional(valor: unknown): number | null | undefined {
  if (valor == null) return null;
  if (!Number.isInteger(valor) || (valor as number) <= 0) return undefined;
  return valor as number;
}

/** Monta o evento a partir da identidade. Recusa executor inativo ou identificador inválido. */
export function prepararEvento(
  identidade: IdentidadeUsuario | null,
  entrada: EntradaEventoAuditoria,
): LinhaAuditoria | null {
  if (!identidade || !loginPermitido(identidade.situacao)) return null;
  if (!Number.isInteger(identidade.id) || identidade.id <= 0) return null;
  if (!Number.isInteger(identidade.titularUserId) || identidade.titularUserId <= 0) return null;

  const modulo = textoCurto(entrada.modulo, 80);
  const operacao = textoCurto(entrada.operacao, 80);
  if (!modulo || !operacao) return null;

  const fazendaId = idOpcional(entrada.fazendaId);
  const registroId = idOpcional(entrada.registroId);
  if (fazendaId === undefined || registroId === undefined) return null;

  const registroTipo = entrada.registroTipo == null ? null : textoCurto(entrada.registroTipo, 80);
  if (entrada.registroTipo != null && !registroTipo) return null;

  const nome = typeof identidade.name === "string" ? identidade.name.trim() : "";
  return {
    executorUserId: identidade.id,
    executorNome: nome || "Sem nome",
    titularUserId: identidade.titularUserId,
    fazendaId,
    modulo,
    operacao,
    registroTipo,
    registroId,
    dadosAnteriores: sanitizarAuditoria(entrada.dadosAnteriores ?? null),
    dadosPosteriores: sanitizarAuditoria(entrada.dadosPosteriores ?? null),
  };
}

function eventoVisivel(
  acesso: AcessoConsultaAuditoria,
  evento: EventoAuditoria,
  autorizaEventosSemFazenda: boolean,
): boolean {
  if (evento.titularUserId !== acesso.titularUserId) return false;
  if (acesso.papel === "principal") return true;
  if (acesso.papel !== "secundario") return false;
  if (evento.fazendaId == null) return autorizaEventosSemFazenda;
  return acesso.fazendasAutorizadas.includes(evento.fazendaId);
}

/** Consulta o que o papel pode ver. Não altera a lista recebida. */
export function consultarAuditoria(
  eventos: EventoAuditoria[],
  acesso: AcessoConsultaAuditoria | null,
  filtro: FiltroAuditoria = {},
): PaginaAuditoria {
  const tamanhoPedido = filtro.tamanho ?? TAMANHO_PADRAO;
  const tamanho = Math.min(TAMANHO_MAXIMO, Math.max(1, Math.floor(tamanhoPedido) || TAMANHO_PADRAO));
  const pagina = Math.max(1, Math.floor(filtro.pagina ?? 1) || 1);
  if (!acesso) return { itens: [], total: 0, pagina, tamanho };

  const autorizaSemFazenda = filtro.autorizaEventosSemFazenda === true;
  const visiveis = eventos.filter(evento => eventoVisivel(acesso, evento, autorizaSemFazenda));
  const filtrados = visiveis.filter(evento => {
    if (filtro.modulo && evento.modulo !== filtro.modulo) return false;
    if (filtro.operacao && evento.operacao !== filtro.operacao) return false;
    if (filtro.fazendaId && evento.fazendaId !== filtro.fazendaId) return false;
    if (filtro.executorUserId && evento.executorUserId !== filtro.executorUserId) return false;
    if (filtro.de && evento.criadoEm < filtro.de) return false;
    if (filtro.ate && evento.criadoEm > filtro.ate) return false;
    return true;
  });
  const ordenados = [...filtrados].sort((a, b) => {
    if (a.criadoEm === b.criadoEm) return b.id - a.id;
    return a.criadoEm < b.criadoEm ? 1 : -1;
  });
  const inicio = (pagina - 1) * tamanho;
  return {
    itens: ordenados.slice(inicio, inicio + tamanho),
    total: ordenados.length,
    pagina,
    tamanho,
  };
}
