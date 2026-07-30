import { formatDataBr, formatQuantidadeMov, siglaUnidade, sinalDoTipo } from "@/lib/produto-types";
import { formatCurrencyBrl } from "@/lib/utils";
import {
  classificarMotivoEstornoAbastecimento,
  MOTIVO_ESTORNO_ABASTECIMENTO,
  MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA,
  rotuloMotivoEstornoAbastecimento,
  textoMotivoEstornoAbastecimentoDetalhe,
} from "@shared/estoqueEstornoMotivos";

export {
  classificarMotivoEstornoAbastecimento,
  MOTIVO_ESTORNO_ABASTECIMENTO,
  MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA,
  rotuloMotivoEstornoAbastecimento,
  textoMotivoEstornoAbastecimentoDetalhe,
};

export type StatusMovimentacao = "ativa" | "estornada" | "estorno";

export type MovimentacaoItemRaw = {
  id: number;
  grupoId?: string | null;
  estoqueId?: number | null;
  fazendaId?: number | null;
  produtoFazendaId?: number | null;
  tipo?: string | null;
  dataMovimentacao?: string | Date | null;
  quantidade?: string | number | null;
  dataValidade?: string | Date | null;
  destino?: string | null;
  manejo?: string | null;
  notaFiscal?: string | null;
  frete?: string | number | null;
  fornecedor?: string | null;
  valor?: string | number | null;
  registradoPor?: string | null;
  status?: string | null;
  originalGrupoId?: string | null;
  motivoEstorno?: string | null;
  abastecimentoId?: number | null;
  nome?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  unidade?: string | null;
  situacao?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  updatedByNome?: string | null;
  [key: string]: unknown;
};

export type ItemEstornoRevertido = {
  nome: string;
  quantidade: number;
  unidade: string | null;
};

export type InfoEstornoMovimentacao = {
  dataHora: string | null;
  dataHoraLabel: string;
  usuario: string | null;
  motivo: string | null;
  observacao: string | null;
  /**
   * Identificador técnico do grupo da movimentação inversa (auditoria).
   * Não exibir na interface operacional padrão.
   */
  grupoIdInverso: string | null;
  /**
   * ID numérico persistido da movimentação inversa, somente quando o vínculo
   * foi validado. Nunca derivado de índice/posição/ID técnico textual.
   */
  idInverso: number | null;
  /**
   * Estado da referência amigável para a UI operacional.
   * - ok: exibir "Nº {idInverso}"
   * - registrada: existe efeito, sem ID amigável válido
   * - nao_localizada: original estornada sem inversa válida vinculada
   */
  referenciaDevolucao: "ok" | "registrada" | "nao_localizada";
  itensRevertidos: ItemEstornoRevertido[];
  /** Texto quantitativo do efeito no estoque (sem o prefixo "Resultado no estoque:"). */
  resultado: string;
};

export type MovimentacaoResumo = {
  /** Identificador estável da movimentação administrativa (grupoId ou solo:id). */
  movimentacaoId: string;
  /** Id de um item para abrir edição (preferencialmente o menor id do grupo). */
  editId: number;
  itemIds: number[];
  dataMovimentacao: string;
  tipo: string;
  origemDestino: string;
  documento: string;
  qtdItens: number;
  /** Soma dos valores dos itens (já inclui frete rateado, quando houver). */
  valorTotal: number | null;
  /** Soma dos fretes rateados nos itens. */
  freteTotal: number;
  /** Soma dos valores sem frete. */
  subtotalItens: number | null;
  registradoPor: string;
  status: StatusMovimentacao;
  motivoEstorno: string | null;
  originalGrupoId: string | null;
  /** Grupo administrativo da movimentação (quando existir). */
  grupoId: string | null;
  /** Abastecimento que gerou esta saída (quando aplicável). */
  abastecimentoId: number | null;
  /** Nome da máquina (manejo), quando gerada por abastecimento. */
  maquinaNome: string | null;
  /** Detalhes do estorno vinculado (somente quando status = estornada). */
  infoEstorno: InfoEstornoMovimentacao | null;
  /** Frete total repetido em cada item (lançamento legado). */
  freteLegado?: boolean;
  itens: MovimentacaoItemRaw[];
};

function toDateKey(raw: string | Date | null | undefined): string {
  if (!raw) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

export function normalizarStatusMov(status?: string | null): StatusMovimentacao {
  const s = (status || "ativa").toLowerCase();
  if (s === "estornada") return "estornada";
  if (s === "estorno") return "estorno";
  return "ativa";
}

export function isMovimentacaoEstornoTecnico(item: MovimentacaoItemRaw): boolean {
  return normalizarStatusMov(item.status) === "estorno";
}

export function rotuloStatusMov(status: StatusMovimentacao): string {
  if (status === "estornada") return "Estornada";
  if (status === "estorno") return "Estorno";
  return "Ativa";
}

export function statusBadgeClassMov(status: StatusMovimentacao): string {
  if (status === "estornada") return "bg-slate-100 text-slate-600";
  if (status === "estorno") return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-700";
}

export function tipoExibicaoMov(mov: {
  tipo?: string | null;
  quantidade?: string | number | null;
}): string {
  if (mov.tipo) return mov.tipo;
  const q = Number(mov.quantidade);
  return q >= 0 ? "Compra" : "Consumo interno";
}

export function chaveGrupoMovimentacao(m: MovimentacaoItemRaw): string {
  const g = m.grupoId?.trim();
  if (g) return `g:${g}`;

  const fazenda = String(m.fazendaId ?? m.produtoFazendaId ?? "");
  const data = toDateKey(m.dataMovimentacao);
  const tipo = tipoExibicaoMov(m).trim().toLowerCase();
  const fornecedor = String(m.fornecedor ?? "").trim().toLowerCase();
  const destino = String(m.destino ?? "").trim().toLowerCase();
  const manejo = String(m.manejo ?? "").trim().toLowerCase();
  const nf = String(m.notaFiscal ?? "").trim().toLowerCase();
  const created = m.createdAt
    ? toDateKey(m.createdAt) + String(m.createdAt).slice(11, 16)
    : "";

  if (!fornecedor && !nf && !destino && !manejo) {
    return `solo:${m.id}`;
  }

  return `leg:${fazenda}|${data}|${tipo}|${fornecedor}|${nf}|${destino}|${manejo}|${created}`;
}

export function rotuloOrigemDestino(m: MovimentacaoItemRaw): string {
  const tipo = tipoExibicaoMov(m).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const fornecedor = m.fornecedor?.trim();
  const destino = m.destino?.trim();
  const manejo = m.manejo?.trim();

  if (m.abastecimentoId != null || destino?.toLowerCase().includes("abastecimento de máquina")) {
    return destino || "Abastecimento de máquina";
  }
  if (tipo.includes("compra") || (tipo.includes("entrada") && fornecedor)) {
    return fornecedor || destino || "—";
  }
  if (tipo.includes("transfer")) {
    return destino || "—";
  }
  if (tipo.includes("consumo") || tipo.includes("saida") || tipo.includes("venda")) {
    return destino || manejo || "—";
  }
  if (tipo.includes("ajuste")) {
    return destino || manejo || tipoExibicaoMov(m);
  }
  if (tipo.includes("entrada") || tipo.includes("producao")) {
    return destino || fornecedor || "—";
  }
  return destino || fornecedor || manejo || "—";
}

export function isMovimentacaoDeAbastecimento(m: MovimentacaoItemRaw | MovimentacaoResumo): boolean {
  if ("abastecimentoId" in m && m.abastecimentoId != null) return true;
  if ("itens" in m && Array.isArray(m.itens)) {
    return m.itens.some(i => i.abastecimentoId != null);
  }
  return false;
}

export function rotuloDocumentoMov(m: MovimentacaoItemRaw): string {
  const doc = m.notaFiscal?.trim();
  if (!doc) return "—";
  const soDigitos = /^\d+$/.test(doc);
  return soDigitos ? `NF ${doc}` : doc;
}

function numValor(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Alguns lançamentos antigos gravaram o frete total da nota em cada item
 * (em vez do rateio) e deixaram `valor` só com o total do produto.
 * Já o formato atual inclui o frete rateado dentro de `valor`.
 */
export function freteLegadoDuplicadoNosItens(
  itens: Array<{ valor?: string | number | null; frete?: string | number | null }>,
): boolean {
  if (itens.length < 2) return false;
  const fretes = itens.map(i => numValor(i.frete));
  if (fretes.some(f => f <= 0)) return false;
  const primeiro = fretes[0]!;
  const todosIguais = fretes.every(f => Math.abs(f - primeiro) < 0.005);
  if (!todosIguais) return false;
  // No formato atual o frete de cada linha é menor que o valor da linha.
  // No legado, o frete "cheio" se repete e a soma dos fretes fica artificialmente alta.
  const somaFrete = fretes.reduce((s, f) => s + f, 0);
  const somaValor = itens.reduce((s, i) => s + numValor(i.valor), 0);
  return somaFrete >= somaValor * 0.35 || somaFrete >= primeiro * (itens.length - 0.5);
}

export function valorProdutoLinha(
  item: { valor?: string | number | null; frete?: string | number | null },
  opts?: { freteLegado?: boolean },
): number | null {
  const total = numValor(item.valor);
  if (!Number.isFinite(total) || total === 0) return null;
  if (opts?.freteLegado) return total;
  const frete = numValor(item.frete);
  if (frete > 0 && frete < Math.abs(total)) return total - frete;
  return total;
}

export function valorUnitarioProdutoLinha(
  item: {
    valor?: string | number | null;
    frete?: string | number | null;
    quantidade?: string | number | null;
  },
  opts?: { freteLegado?: boolean },
): number | null {
  const base = valorProdutoLinha(item, opts);
  if (base == null) return null;
  const qtd = Math.abs(numValor(item.quantidade));
  if (!qtd) return base;
  return base / qtd;
}

/**
 * Movimentações que ainda compõem o custo médio do estoque:
 * entradas ativas (ignora estornada, estorno técnico e quantidades ≤ 0).
 */
export function movimentacaoContaNoPrecoMedio(mv: {
  status?: string | null;
  tipo?: string | null;
  quantidade?: string | number | null;
  valor?: string | number | null;
}): boolean {
  const status = normalizarStatusMov(mv.status);
  if (status === "estornada" || status === "estorno") return false;
  const qtd = numValor(mv.quantidade);
  if (!(qtd > 0)) return false;
  const val = numValor(mv.valor);
  return val > 0;
}

export function separarMotivoObservacaoEstorno(raw: string | null | undefined): {
  motivo: string | null;
  observacao: string | null;
} {
  const text = raw?.trim() || "";
  if (!text) return { motivo: null, observacao: null };
  const sep = " — ";
  const idx = text.indexOf(sep);
  if (idx === -1) return { motivo: text, observacao: null };
  const motivo = text.slice(0, idx).trim();
  const observacao = text.slice(idx + sep.length).trim();
  return {
    motivo: motivo || text,
    observacao: observacao || null,
  };
}

export function formatDataHoraEstorno(raw: string | Date | null | undefined): string {
  if (!raw) return "—";
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    const soData = formatDataBr(String(raw).slice(0, 10));
    return soData || "—";
  }
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

/**
 * Texto quantitativo do efeito no estoque, baseado na quantidade efetivamente revertida
 * (itens do lançamento inverso), não na quantidade original da movimentação.
 */
export function textoResultadoEstornoNoEstoque(
  itensRevertidos: ItemEstornoRevertido[],
): string {
  if (!itensRevertidos.length) {
    return "devolução registrada ao estoque da Fazenda.";
  }

  const partes = itensRevertidos.map(it => {
    const qtd = Number.isFinite(it.quantidade) ? Math.abs(it.quantidade) : 0;
    const sigla = siglaUnidade(it.unidade) || "un";
    return `${formatQuantidadeMov(qtd)} ${sigla}`;
  });

  // Frase neutra evita erro de concordância por unidade (L/un/kg).
  if (partes.length === 1) {
    return `devolução de ${partes[0]} ao estoque da Fazenda.`;
  }
  return `devolução de ${partes.join(" + ")} ao estoque da Fazenda.`;
}

function numIdPersistido(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * Valida se o lançamento técnico de estorno é coerente com a movimentação original.
 * O vínculo principal já vem de originalGrupoId ↔ grupoId; aqui reforçamos integridade.
 */
export function estornoInversoCompativel(
  estorno: MovimentacaoItemRaw,
  originais: MovimentacaoItemRaw[],
): boolean {
  if (normalizarStatusMov(estorno.status) !== "estorno") return false;

  const original =
    originais.find(
      o =>
        o.estoqueId != null &&
        estorno.estoqueId != null &&
        Number(o.estoqueId) === Number(estorno.estoqueId),
    ) ?? (originais.length === 1 ? originais[0] : null);

  if (!original) return false;

  if (
    original.fazendaId != null &&
    estorno.fazendaId != null &&
    Number(original.fazendaId) !== Number(estorno.fazendaId)
  ) {
    return false;
  }

  if (original.abastecimentoId != null) {
    if (
      estorno.abastecimentoId == null ||
      Number(estorno.abastecimentoId) !== Number(original.abastecimentoId)
    ) {
      return false;
    }
  }

  const qOrig = Number(original.quantidade ?? 0);
  const qEst = Number(estorno.quantidade ?? 0);
  if (!Number.isFinite(qEst) || Math.abs(qEst) < 1e-12) return false;

  const tipoOrig = String(original.tipo ?? "").toLowerCase();
  const pareceSaida =
    qOrig < 0 ||
    tipoOrig.includes("saída") ||
    tipoOrig.includes("saida") ||
    tipoOrig.includes("consumo");
  const pareceEntrada =
    qOrig > 0 ||
    tipoOrig.includes("compra") ||
    tipoOrig.includes("entrada") ||
    tipoOrig.includes("produção") ||
    tipoOrig.includes("producao");

  // Sentido inverso: saída estornada devolve (qtd > 0); entrada estornada retira (qtd < 0).
  if (pareceSaida && !(qEst > 0)) return false;
  if (pareceEntrada && !pareceSaida && !(qEst < 0)) return false;

  return true;
}

function filtrarEstornosValidos(
  originais: MovimentacaoItemRaw[],
  estornos: MovimentacaoItemRaw[],
): MovimentacaoItemRaw[] {
  return estornos.filter(e => estornoInversoCompativel(e, originais));
}

function montarInfoEstorno(
  originais: MovimentacaoItemRaw[],
  estornos: MovimentacaoItemRaw[],
): InfoEstornoMovimentacao | null {
  if (!estornos.length && !originais.some(o => normalizarStatusMov(o.status) === "estornada")) {
    return null;
  }

  const originaisEstornada = originais.some(o => normalizarStatusMov(o.status) === "estornada");
  const estornosValidos = filtrarEstornosValidos(originais, estornos);

  if (estornos.length > 0 && estornosValidos.length === 0) {
    console.warn("[movimentacoes] vínculo de estorno inconsistente — inversa descartada", {
      originalIds: originais.map(o => o.id),
      estornoIds: estornos.map(e => e.id),
      originalGrupoIds: estornos.map(e => e.originalGrupoId),
    });
  }

  if (originaisEstornada && estornos.length === 0) {
    console.warn("[movimentacoes] movimentação estornada sem lançamento inverso vinculado", {
      originalIds: originais.map(o => o.id),
      grupoId: originais.map(o => o.grupoId).find(Boolean) ?? null,
      abastecimentoId:
        originais.map(o => o.abastecimentoId).find(v => v != null) ?? null,
    });
  }

  const headEstorno = [...estornosValidos].sort((a, b) => a.id - b.id)[0];
  const headOriginal = originais[0];
  const motivoRaw =
    estornosValidos.map(e => e.motivoEstorno?.trim()).find(Boolean) ||
    estornos.map(e => e.motivoEstorno?.trim()).find(Boolean) ||
    originais.map(o => o.motivoEstorno?.trim()).find(Boolean) ||
    null;
  const { motivo: motivoSeparado, observacao } = separarMotivoObservacaoEstorno(motivoRaw);
  const motivo =
    textoMotivoEstornoAbastecimentoDetalhe(motivoSeparado || motivoRaw) ||
    rotuloMotivoEstornoAbastecimento(motivoSeparado || motivoRaw) ||
    motivoSeparado;

  const dataRaw =
    headEstorno?.createdAt ||
    headEstorno?.dataMovimentacao ||
    headOriginal?.updatedAt ||
    null;

  const usuario =
    headEstorno?.registradoPor?.trim() ||
    headOriginal?.updatedByNome?.trim() ||
    null;

  const grupoIdInverso =
    estornosValidos.map(e => e.grupoId?.trim()).find(Boolean) ||
    estornos.map(e => e.grupoId?.trim()).find(Boolean) ||
    null;

  const idInverso = numIdPersistido(headEstorno?.id);

  const unidadeFallback =
    originais.map(o => o.unidade).find(u => Boolean(u?.trim())) ?? null;

  // Quantidade exibida vem apenas da inversa real validada — nunca da original como fallback.
  const itensRevertidos: ItemEstornoRevertido[] = estornosValidos.map(it => ({
    nome: it.nome?.trim() || `Produto #${it.estoqueId ?? it.id}`,
    quantidade: Math.abs(Number(it.quantidade ?? 0)),
    unidade: it.unidade?.trim() || unidadeFallback,
  }));

  let referenciaDevolucao: InfoEstornoMovimentacao["referenciaDevolucao"];
  if (idInverso != null) {
    referenciaDevolucao = "ok";
  } else if (originaisEstornada && estornosValidos.length === 0) {
    referenciaDevolucao = "nao_localizada";
  } else {
    referenciaDevolucao = "registrada";
  }

  return {
    dataHora: dataRaw ? String(dataRaw) : null,
    dataHoraLabel: formatDataHoraEstorno(dataRaw),
    usuario,
    motivo,
    observacao,
    grupoIdInverso,
    idInverso: referenciaDevolucao === "ok" ? idInverso : null,
    referenciaDevolucao,
    itensRevertidos,
    resultado: textoResultadoEstornoNoEstoque(itensRevertidos),
  };
}

/**
 * Agrupa itens em movimentações administrativas para a listagem.
 * Registros técnicos com status "estorno" não viram linha própria —
 * ficam vinculados ao detalhe da original (status "estornada").
 */
export function agruparMovimentacoes(itens: MovimentacaoItemRaw[]): MovimentacaoResumo[] {
  const operacionais = itens.filter(i => !isMovimentacaoEstornoTecnico(i));
  const estornosTecnicos = itens.filter(i => isMovimentacaoEstornoTecnico(i));

  const estornosPorOriginal = new Map<string, MovimentacaoItemRaw[]>();
  for (const e of estornosTecnicos) {
    const key = e.originalGrupoId?.trim();
    if (!key) continue;
    const list = estornosPorOriginal.get(key);
    if (list) list.push(e);
    else estornosPorOriginal.set(key, [e]);
  }

  const map = new Map<string, MovimentacaoItemRaw[]>();
  for (const item of operacionais) {
    const key = chaveGrupoMovimentacao(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }

  const resumos: MovimentacaoResumo[] = [];
  for (const [movimentacaoId, grupo] of map) {
    const ordenados = [...grupo].sort((a, b) => a.id - b.id);
    const head = ordenados[0]!;
    const freteLegado = freteLegadoDuplicadoNosItens(ordenados);
    let valorSum = 0;
    let freteSum = 0;
    let temValor = false;
    for (const it of ordenados) {
      const v = numValor(it.valor);
      const f = numValor(it.frete);
      if (v !== 0) {
        valorSum += v;
        temValor = true;
      }
      if (freteLegado) {
        // no legado o frete total está repetido; conta uma vez só
        if (freteSum === 0 && f > 0) freteSum = f;
      } else {
        freteSum += f;
      }
    }

    const registrado =
      ordenados.map(i => i.registradoPor?.trim()).find(Boolean) || "—";

    const produtosDistintos = new Set(
      ordenados.map(i => i.estoqueId ?? i.id).filter(v => v != null),
    );

    // Formato atual: valor já inclui frete rateado → subtotal = valor - frete
    // Legado: valor é só produto → subtotal = valor; total nota = valor + frete
    const subtotalItens = temValor
      ? (freteLegado ? valorSum : freteSum > 0 ? valorSum - freteSum : valorSum)
      : null;
    const valorTotalNota = temValor
      ? (freteLegado ? valorSum + freteSum : valorSum)
      : freteSum > 0
        ? freteSum
        : null;

    const grupoId = ordenados.map(i => i.grupoId?.trim()).find(Boolean) || null;
    const status = normalizarStatusMov(
      ordenados.map(i => i.status).find(s => normalizarStatusMov(s) === "estornada") ||
        head.status,
    );

    const abastecimentoId =
      ordenados.map(i => (i.abastecimentoId != null ? Number(i.abastecimentoId) : null)).find(v => v != null) ??
      null;
    const maquinaNome =
      abastecimentoId != null
        ? ordenados.map(i => i.manejo?.trim()).find(Boolean) || null
        : null;

    // Vínculo persistido: originalGrupoId da inversa ↔ grupoId (ou chave solo) da original.
    const chavesVinculo = new Set<string>();
    if (grupoId) chavesVinculo.add(grupoId);
    chavesVinculo.add(movimentacaoId);
    const estornosVinculados = [
      ...new Map(
        [...chavesVinculo]
          .flatMap(k => estornosPorOriginal.get(k) ?? [])
          .map(e => [e.id, e] as const),
      ).values(),
    ];
    const infoEstorno =
      status === "estornada" || estornosVinculados.length > 0
        ? montarInfoEstorno(ordenados, estornosVinculados)
        : null;

    // Mantém o código/texto bruto gravado (ex.: origem_combustivel_alterada).
    const motivoEstorno =
      estornosVinculados.map(e => e.motivoEstorno?.trim()).find(Boolean) ||
      ordenados.map(i => i.motivoEstorno?.trim()).find(Boolean) ||
      null;

    resumos.push({
      movimentacaoId,
      editId: head.id,
      itemIds: ordenados.map(i => i.id),
      dataMovimentacao: toDateKey(head.dataMovimentacao),
      tipo: tipoExibicaoMov(head),
      origemDestino: rotuloOrigemDestino(head),
      documento: rotuloDocumentoMov(head),
      qtdItens: produtosDistintos.size || ordenados.length,
      valorTotal: valorTotalNota,
      freteTotal: freteSum,
      subtotalItens: temValor ? subtotalItens : null,
      registradoPor: registrado,
      status: status === "estorno" ? "ativa" : status,
      motivoEstorno,
      originalGrupoId: head.originalGrupoId?.trim() || null,
      grupoId,
      abastecimentoId,
      maquinaNome,
      infoEstorno: status === "estornada" ? infoEstorno : null,
      itens: ordenados,
      freteLegado,
    });
  }

  return resumos;
}

export function formatItensLabel(qtd: number): string {
  return qtd === 1 ? "1 produto" : `${qtd} produtos`;
}

export function formatValorResumo(valor: number | null): string {
  if (valor == null) return "—";
  return formatCurrencyBrl(String(Math.round(Math.abs(valor) * 100)));
}

export function formatDataResumo(data: string): string {
  return formatDataBr(data) || "—";
}

export function formatQtdItem(qtd: string | number | null | undefined): string {
  return formatQuantidadeMov(Math.abs(Number(qtd ?? 0)));
}

export function formatUnidadeItem(unidade?: string | null): string {
  return siglaUnidade(unidade) || "—";
}

/**
 * Classifica o sentido financeiro/operacional do tipo exibido na lista.
 * Cobre rótulos como "Saída" (abastecimento) além dos TIPOS_MOVIMENTACAO.
 */
export function sinalResumoMovimentacao(tipo: string): "entrada" | "saida" {
  const norm = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (norm.includes("ajuste") && norm.includes("saida")) return "saida";
  if (norm.includes("ajuste") && norm.includes("entrada")) return "entrada";
  if (
    norm.includes("saida") ||
    norm.includes("consumo") ||
    norm.includes("venda") ||
    norm.includes("perda") ||
    norm.includes("descarte") ||
    norm.includes("transfer")
  ) {
    return "saida";
  }
  if (
    norm.includes("compra") ||
    norm.includes("entrada") ||
    norm.includes("producao")
  ) {
    return "entrada";
  }

  return sinalDoTipo(tipo);
}

export function tipoBadgeClassMov(tipo: string): string {
  const norm = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (norm.includes("ajuste")) return "bg-slate-100 text-slate-600";
  if (norm.includes("transfer")) return "bg-sky-100 text-sky-800";
  if (norm.includes("compra")) return "bg-teal-100 text-teal-800";
  if (norm.includes("consumo")) return "bg-amber-100 text-amber-800";
  if (norm.includes("entrada")) return "bg-green-100 text-green-700";
  if (
    norm.includes("saida") ||
    norm.includes("venda") ||
    norm.includes("perda") ||
    norm.includes("descarte")
  ) {
    return "bg-amber-100 text-amber-800";
  }
  if (norm.includes("producao")) return "bg-green-100 text-green-700";

  return sinalResumoMovimentacao(tipo) === "entrada"
    ? "bg-green-100 text-green-700"
    : "bg-amber-100 text-amber-800";
}
