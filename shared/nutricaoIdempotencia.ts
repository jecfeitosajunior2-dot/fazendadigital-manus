import { normalizarEscore } from "./nutricaoCochoLeituras";
import { normalizarHoraFornecimento } from "./nutricaoFornecimentos";

export const MSG_NUTRICAO_SEM_IDEMPOTENCIA =
  "A confirmação precisa da identidade gravada no banco. Nada foi consumido.";
export const MSG_NUTRICAO_CHAVE_DIFERENTE =
  "Esta chave já foi usada em outra operação. Nada foi consumido de novo.";
export const MSG_NUTRICAO_CHAVE_ANDAMENTO =
  "Esta confirmação ainda está em andamento. Nada foi consumido de novo.";
export const MSG_NUTRICAO_CHAVE_INVALIDA =
  "A confirmação precisa de uma chave válida.";
export const MSG_BATIDA_ANTIGA_CADASTRO =
  "O cadastro antigo de batida está bloqueado. Nada foi gravado.";
export const MSG_BATIDA_ANTIGA_EXCLUSAO =
  "A exclusão antiga de batida está bloqueada. O histórico não foi apagado.";
export const MSG_BATIDA_ANTIGA_LISTA =
  "A consulta antiga de batida não tem fazenda. Só o titular da conta pode vê-la.";

export type TipoChaveNutricao = "forn" | "bat" | "lei";

const CHAVE = /^(forn|bat|lei)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarChaveNutricao(tipo: TipoChaveNutricao): string {
  return `${tipo}-${globalThis.crypto.randomUUID()}`;
}

export function chaveNutricaoValida(tipo: TipoChaveNutricao, chave: string): boolean {
  return CHAVE.test(chave) && chave.toLowerCase().startsWith(`${tipo}-`);
}

function numOuNulo(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ConteudoFornecimento = {
  fazendaId: number;
  loteId: number;
  planejamentoId?: number | null;
  cochoId?: number | null;
  tipoOrigem: string;
  produtoId?: number | null;
  dietaId?: number | null;
  origemOperacional?: string | null;
  batidaId?: number | null;
  data: string;
  hora?: string | null;
  quantidadeFornecidaKg: number;
};

export function conteudoCanonicoFornecimento(input: ConteudoFornecimento): string {
  const origem = input.origemOperacional === "batida" ? "batida" : "direta";
  const tipo = input.tipoOrigem === "dieta" || origem === "batida" ? "dieta" : "produto";
  return JSON.stringify({
    fazendaId: Number(input.fazendaId),
    loteId: Number(input.loteId),
    planejamentoId: numOuNulo(input.planejamentoId),
    cochoId: numOuNulo(input.cochoId),
    tipoOrigem: tipo,
    produtoId: tipo === "produto" ? numOuNulo(input.produtoId) : null,
    dietaId: tipo === "dieta" ? numOuNulo(input.dietaId) : null,
    origemOperacional: origem,
    batidaId: origem === "batida" ? numOuNulo(input.batidaId) : null,
    data: String(input.data).slice(0, 10),
    hora: input.hora?.trim() || null,
    quantidadeFornecidaKg: Number(input.quantidadeFornecidaKg).toFixed(3),
  });
}

export type ConteudoBatida = {
  fazendaId: number;
  dietaId: number;
  data: string;
  hora?: string | null;
  quantidadePreparadaKg: number;
};

export function conteudoCanonicoBatida(input: ConteudoBatida): string {
  return JSON.stringify({
    fazendaId: Number(input.fazendaId),
    dietaId: Number(input.dietaId),
    data: String(input.data).slice(0, 10),
    hora: input.hora?.trim() || null,
    quantidadePreparadaKg: Number(input.quantidadePreparadaKg).toFixed(3),
  });
}

export type ConteudoLeitura = {
  fazendaId: number;
  cochoId: number;
  loteId?: number | null;
  fornecimentoId?: number | null;
  data: string;
  hora?: string | null;
  sobraKg?: number | null;
  escore?: string | null;
  observacoes?: string | null;
};

export function conteudoCanonicoLeitura(input: ConteudoLeitura): string {
  const bruto = input.sobraKg == null || input.sobraKg === ("" as unknown) ? null : Number(input.sobraKg);
  return JSON.stringify({
    fazendaId: Number(input.fazendaId),
    cochoId: Number(input.cochoId),
    loteId: numOuNulo(input.loteId),
    fornecimentoId: numOuNulo(input.fornecimentoId),
    data: String(input.data).slice(0, 10),
    hora: normalizarHoraFornecimento(input.hora ?? null),
    sobraKg: bruto == null || !Number.isFinite(bruto) ? null : bruto.toFixed(3),
    escore: normalizarEscore(input.escore),
    observacoes: String(input.observacoes ?? "").trim() || null,
  });
}

export type EstadoChaveNutricao = { chave: string; conteudo: string };

export function decidirChaveNutricao(
  estado: EstadoChaveNutricao | null,
  conteudo: string,
  tipo: TipoChaveNutricao,
  criar: (tipo: TipoChaveNutricao) => string = criarChaveNutricao,
): EstadoChaveNutricao {
  if (estado && estado.conteudo === conteudo && chaveNutricaoValida(tipo, estado.chave)) {
    return estado;
  }
  return { chave: criar(tipo), conteudo };
}
