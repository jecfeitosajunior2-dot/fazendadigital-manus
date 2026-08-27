import { toDateOnlyISO } from "./carenciaAnimal";
import {
  applySemenEntradaAgregacao,
  applySemenSaidaIa,
  calcSemenCustoUnitarioEntrada,
  deriveSemenStatus,
  parseSemenCustoTotal,
  parseSemenDataEntrada,
  parseSemenQuantidadeDoses,
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  type SemenStatus,
} from "./semenEstoque";
import { SEMEN_MOV_TIPO_AJUSTE_ESTOQUE } from "./semenEstoqueAjuste";

export const MSG_SEMEN_CORRECAO_SAIDA_IA =
  "Esta movimentação está vinculada a uma inseminação. A correção deve ser feita no fluxo reprodutivo.";
export const MSG_SEMEN_CORRECAO_TIPO =
  "Só é possível corrigir uma entrada de sêmen por este fluxo.";
export const MSG_SEMEN_CORRECAO_JA_CORRIGIDA = "Este lançamento já foi corrigido.";
export const MSG_SEMEN_CORRECAO_CONSUMO =
  "Esta entrada possui movimentações posteriores e não pode ser corrigida automaticamente. Use “Ajustar estoque” para corrigir o saldo ou valor atual sem alterar o histórico.";
export const MSG_SEMEN_CORRECAO_MOTIVO = "Informe o motivo da correção.";
export const MSG_SEMEN_CORRECAO_MOTIVO_OUTRO = MSG_SEMEN_CORRECAO_MOTIVO;
export const MSG_SEMEN_CORRECAO_SEM_ALTERACAO = "Nenhuma alteração realizada.";
export const MSG_SEMEN_CORRECAO_NAO_ENCONTRADA = "Movimentação de entrada não encontrada.";
export const MSG_SEMEN_CORRECAO_LEDGER =
  "Esta entrada possui movimentações posteriores e não pode ser corrigida automaticamente. Use “Ajustar estoque” para corrigir o saldo ou valor atual sem alterar o histórico.";

export const SEMEN_CORRECAO_MOTIVO_OUTRO = "outro" as const;

export const SEMEN_CORRECAO_MOTIVOS = [
  {
    codigo: "quantidade_digitada_incorretamente",
    label: "Quantidade digitada incorretamente",
  },
  {
    codigo: "valor_nota_informado_errado",
    label: "Valor da nota informado errado",
  },
  { codigo: "lancamento_duplicado", label: "Lançamento duplicado" },
  {
    codigo: "data_informada_incorretamente",
    label: "Data informada incorretamente",
  },
  { codigo: SEMEN_CORRECAO_MOTIVO_OUTRO, label: "Outro" },
] as const;

export type SemenCorrecaoMotivoCodigo = (typeof SEMEN_CORRECAO_MOTIVOS)[number]["codigo"];

export type SemenCorrecaoLinkFields = {
  movimentacaoOrigemId: number | null;
  grupoCorrecaoId: string | null;
  motivoCorrecao: string | null;
};

export type SemenLedgerMovimento = {
  id: number;
  tipo: string;
  quantidadeDoses: number;
  custoTotal: string | number;
  custoUnitario?: string | number | null;
  dataEntrada?: string;
  createdAt?: string | Date | null;
  movimentacaoOrigemId?: number | null;
  grupoCorrecaoId?: string | null;
  motivoCorrecao?: string | null;
  observacoes?: string | null;
};

export const SEMEN_CORRECAO_LINK_VAZIO: SemenCorrecaoLinkFields = {
  movimentacaoOrigemId: null,
  grupoCorrecaoId: null,
  motivoCorrecao: null,
};

export function withSemenCorrecaoFields<T extends object>(
  row: T,
): T & SemenCorrecaoLinkFields {
  const r = row as T & Partial<SemenCorrecaoLinkFields>;
  return {
    ...row,
    movimentacaoOrigemId: r.movimentacaoOrigemId ?? null,
    grupoCorrecaoId: r.grupoCorrecaoId ?? null,
    motivoCorrecao: r.motivoCorrecao ?? null,
  };
}

function createdAtKey(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value);
}

function parseCustoLedger(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function collectIdsEntradasCorrigidas(
  movimentacoes: ReadonlyArray<Pick<SemenLedgerMovimento, "tipo" | "movimentacaoOrigemId">>,
): Set<number> {
  const ids = new Set<number>();
  for (const mov of movimentacoes) {
    if (mov.tipo !== SEMEN_MOV_TIPO_ESTORNO_ENTRADA) continue;
    const origemId = Number(mov.movimentacaoOrigemId);
    if (Number.isInteger(origemId) && origemId > 0) ids.add(origemId);
  }
  return ids;
}

export function isSemenEntradaJaCorrigida(
  movimentacaoId: number,
  movimentacoes: ReadonlyArray<Pick<SemenLedgerMovimento, "tipo" | "movimentacaoOrigemId">>,
): boolean {
  return collectIdsEntradasCorrigidas(movimentacoes).has(movimentacaoId);
}

/**
 * Movimentações que entram no replay econômico.
 * ENTRADA já corrigida e ESTORNO_ENTRADA são pulados.
 * Nova entrada corrigida ocupa o lugar cronológico da original (createdAt/id da origem).
 */
export function selectSemenLedgerMovimentosAplicaveis<T extends SemenLedgerMovimento>(
  movimentacoes: readonly T[],
): T[] {
  const corrigidas = collectIdsEntradasCorrigidas(movimentacoes);
  const byId = new Map(movimentacoes.map(m => [m.id, m]));

  const aplicaveis = movimentacoes.filter(mov => {
    if (mov.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA) return false;
    if (mov.tipo === SEMEN_MOV_TIPO_ENTRADA && corrigidas.has(mov.id)) return false;
    return true;
  });

  return [...aplicaveis].sort((a, b) => {
    const ka = replaySortKey(a, byId);
    const kb = replaySortKey(b, byId);
    if (ka.createdAt !== kb.createdAt) return ka.createdAt.localeCompare(kb.createdAt);
    return ka.id - kb.id;
  });
}

/**
 * Replay do livro-razão.
 * ENTRADA já corrigida e ESTORNO_ENTRADA são pulados.
 * Nova entrada corrigida ocupa o lugar cronológico da original (createdAt/id da origem).
 */
export function replaySemenPartidaLedger(
  movimentacoes: ReadonlyArray<SemenLedgerMovimento>,
):
  | { ok: true; saldoDoses: number; custoUnitario: string | null; status: SemenStatus }
  | { ok: false; message: string } {
  const ordered = selectSemenLedgerMovimentosAplicaveis(movimentacoes);

  let saldo = 0;
  let custoUnitario: string | null = null;

  for (const mov of ordered) {
    if (mov.tipo === SEMEN_MOV_TIPO_ENTRADA) {
      const agreg = applySemenEntradaAgregacao({
        saldoAnterior: saldo,
        custoUnitarioAnterior: custoUnitario,
        quantidadeEntrada: mov.quantidadeDoses,
        custoTotalEntrada: parseCustoLedger(mov.custoTotal),
      });
      saldo = agreg.novoSaldo;
      custoUnitario = agreg.novoCustoUnitario;
      continue;
    }

    if (mov.tipo === SEMEN_MOV_TIPO_SAIDA_IA) {
      try {
        const saida = applySemenSaidaIa({
          saldoAnterior: saldo,
          custoUnitario,
          quantidadeSaida: mov.quantidadeDoses,
        });
        saldo = saida.novoSaldo;
        custoUnitario = saida.novoCustoUnitario;
      } catch {
        return { ok: false, message: MSG_SEMEN_CORRECAO_LEDGER };
      }
      continue;
    }

    if (mov.tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE) {
      const novoSaldo = Math.max(0, Math.trunc(Number(mov.quantidadeDoses) || 0));
      saldo = novoSaldo;
      if (novoSaldo === 0) {
        custoUnitario = "0.00";
        continue;
      }
      const fromUnit = mov.custoUnitario != null && mov.custoUnitario !== ""
        ? parseCustoLedger(mov.custoUnitario)
        : 0;
      if (fromUnit > 0) {
        custoUnitario = fromUnit.toFixed(2);
      } else {
        const valor = parseCustoLedger(mov.custoTotal);
        custoUnitario = valor > 0 ? (valor / novoSaldo).toFixed(2) : "0.00";
      }
      continue;
    }
  }

  return {
    ok: true,
    saldoDoses: saldo,
    custoUnitario,
    status: deriveSemenStatus(saldo),
  };
}

function replaySortKey(
  mov: SemenLedgerMovimento,
  byId: ReadonlyMap<number, SemenLedgerMovimento>,
): { createdAt: string; id: number } {
  if (mov.tipo === SEMEN_MOV_TIPO_ENTRADA && mov.movimentacaoOrigemId) {
    const original = byId.get(mov.movimentacaoOrigemId);
    if (original) {
      return { createdAt: createdAtKey(original.createdAt), id: original.id };
    }
  }
  return { createdAt: createdAtKey(mov.createdAt), id: mov.id };
}

export function assertSemenEntradaElegivelParaCorrecao(params: {
  original: Pick<SemenLedgerMovimento, "id" | "tipo" | "quantidadeDoses"> | null | undefined;
  movimentacoes: ReadonlyArray<Pick<SemenLedgerMovimento, "tipo" | "movimentacaoOrigemId">>;
  saldoAtual: number;
}): { ok: true } | { ok: false; message: string } {
  const original = params.original;
  if (!original) {
    return { ok: false, message: MSG_SEMEN_CORRECAO_NAO_ENCONTRADA };
  }
  if (original.tipo === SEMEN_MOV_TIPO_SAIDA_IA) {
    return { ok: false, message: MSG_SEMEN_CORRECAO_SAIDA_IA };
  }
  if (original.tipo !== SEMEN_MOV_TIPO_ENTRADA) {
    return { ok: false, message: MSG_SEMEN_CORRECAO_TIPO };
  }
  if (isSemenEntradaJaCorrigida(original.id, params.movimentacoes)) {
    return { ok: false, message: MSG_SEMEN_CORRECAO_JA_CORRIGIDA };
  }
  const saldo = Math.max(0, Number(params.saldoAtual) || 0);
  if (saldo < original.quantidadeDoses) {
    return { ok: false, message: MSG_SEMEN_CORRECAO_CONSUMO };
  }
  return { ok: true };
}

export function validateSemenCorrecaoMotivo(
  codigo: unknown,
  descricaoOutro?: unknown,
): { ok: true; texto: string; codigo: SemenCorrecaoMotivoCodigo } | { ok: false; message: string } {
  const raw = String(codigo ?? "").trim();
  const found = SEMEN_CORRECAO_MOTIVOS.find(m => m.codigo === raw);
  if (!found) return { ok: false, message: MSG_SEMEN_CORRECAO_MOTIVO };
  if (found.codigo === SEMEN_CORRECAO_MOTIVO_OUTRO) {
    const desc = String(descricaoOutro ?? "").trim();
    if (!desc) return { ok: false, message: MSG_SEMEN_CORRECAO_MOTIVO_OUTRO };
    return { ok: true, texto: desc, codigo: found.codigo };
  }
  return { ok: true, texto: found.label, codigo: found.codigo };
}

export function validateSemenCorrecaoDados(
  input: {
    quantidadeDoses: unknown;
    custoTotal: unknown;
    dataEntrada?: unknown;
  },
  refDate: Date = new Date(),
):
  | {
      ok: true;
      value: { quantidadeDoses: number; custoTotal: number; custoUnitario: string; dataEntrada: string };
    }
  | { ok: false; message: string } {
  const quantidadeDoses = parseSemenQuantidadeDoses(input.quantidadeDoses);
  if (quantidadeDoses == null) {
    return {
      ok: false,
      message:
        input.quantidadeDoses == null || input.quantidadeDoses === ""
          ? "Informe a quantidade de doses."
          : "A quantidade de doses deve ser um inteiro positivo.",
    };
  }
  const custoTotal = parseSemenCustoTotal(input.custoTotal);
  if (custoTotal == null) {
    return {
      ok: false,
      message:
        input.custoTotal == null || input.custoTotal === ""
          ? "Informe o custo total da entrada."
          : "O custo total deve ser maior que zero.",
    };
  }
  const dataEntrada = parseSemenDataEntrada(input.dataEntrada, refDate);
  if (!dataEntrada) {
    const raw = String(input.dataEntrada ?? "").trim();
    if (raw && raw > toDateOnlyISO(refDate)) {
      return { ok: false, message: "A data de entrada não pode ser futura." };
    }
    return { ok: false, message: "Informe uma data de entrada válida." };
  }
  return {
    ok: true,
    value: {
      quantidadeDoses,
      custoTotal,
      custoUnitario: calcSemenCustoUnitarioEntrada(quantidadeDoses, custoTotal),
      dataEntrada,
    },
  };
}

function custoCorrecaoEmCentavos(n: number): number {
  return Math.round(n * 100);
}

/** Normaliza data de correção para YYYY-MM-DD (aceita ISO e DD/MM/AAAA). */
export function normalizeSemenCorrecaoDataComparacao(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!br) return null;
  return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
}

function parseQuantidadeCorrecaoComparacao(raw: unknown): number | null {
  if (typeof raw === "number") return parseSemenQuantidadeDoses(raw);
  const s = String(raw ?? "")
    .trim()
    .replace(/\s*doses?\b/gi, "")
    .trim();
  return parseSemenQuantidadeDoses(s);
}

/**
 * Comparação semântica dos campos corrigíveis.
 * Máscara, "doses" e formato de data não contam como alteração.
 * Motivo não entra nesta comparação.
 */
export function hasSemenCorrecaoAlteracaoReal(
  original: { quantidadeDoses: unknown; custoTotal: unknown; dataEntrada: unknown },
  corrigido: { quantidadeDoses: unknown; custoTotal: unknown; dataEntrada: unknown },
): boolean {
  const qtdOrig = parseQuantidadeCorrecaoComparacao(original.quantidadeDoses);
  const qtdNova = parseQuantidadeCorrecaoComparacao(corrigido.quantidadeDoses);
  const custoOrig = parseSemenCustoTotal(original.custoTotal);
  const custoNova = parseSemenCustoTotal(corrigido.custoTotal);
  const dataOrig = normalizeSemenCorrecaoDataComparacao(original.dataEntrada);
  const dataNova = normalizeSemenCorrecaoDataComparacao(corrigido.dataEntrada);

  if (
    qtdOrig == null ||
    qtdNova == null ||
    custoOrig == null ||
    custoNova == null ||
    dataOrig == null ||
    dataNova == null
  ) {
    return true;
  }

  return (
    qtdOrig !== qtdNova ||
    custoCorrecaoEmCentavos(custoOrig) !== custoCorrecaoEmCentavos(custoNova) ||
    dataOrig !== dataNova
  );
}

export type SemenCorrecaoMovimentacaoDraft = {
  tipo: typeof SEMEN_MOV_TIPO_ESTORNO_ENTRADA | typeof SEMEN_MOV_TIPO_ENTRADA;
  dataEntrada: string;
  quantidadeDoses: number;
  custoTotal: string;
  custoUnitario: string;
  movimentacaoOrigemId: number;
  grupoCorrecaoId: string;
  motivoCorrecao: string | null;
  observacoes: null;
};

export function buildSemenCorrecaoMovimentacoes(params: {
  original: {
    id: number;
    quantidadeDoses: number;
    custoTotal: string | number;
    custoUnitario: string | number;
  };
  dadosNovos: {
    quantidadeDoses: number;
    custoTotal: number;
    custoUnitario: string;
    dataEntrada: string;
  };
  dataCorrecao: string;
  grupoCorrecaoId: string;
  motivoTexto: string;
}): { estorno: SemenCorrecaoMovimentacaoDraft; novaEntrada: SemenCorrecaoMovimentacaoDraft } {
  const custoTotalOrig = Number(parseCustoLedger(params.original.custoTotal)).toFixed(2);
  const custoUnitOrig =
    typeof params.original.custoUnitario === "number"
      ? params.original.custoUnitario.toFixed(2)
      : String(params.original.custoUnitario);

  return {
    estorno: {
      tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
      dataEntrada: params.dataCorrecao,
      quantidadeDoses: params.original.quantidadeDoses,
      custoTotal: custoTotalOrig,
      custoUnitario: custoUnitOrig,
      movimentacaoOrigemId: params.original.id,
      grupoCorrecaoId: params.grupoCorrecaoId,
      motivoCorrecao: params.motivoTexto,
      observacoes: null,
    },
    novaEntrada: {
      tipo: SEMEN_MOV_TIPO_ENTRADA,
      dataEntrada: params.dadosNovos.dataEntrada,
      quantidadeDoses: params.dadosNovos.quantidadeDoses,
      custoTotal: params.dadosNovos.custoTotal.toFixed(2),
      custoUnitario: params.dadosNovos.custoUnitario,
      movimentacaoOrigemId: params.original.id,
      grupoCorrecaoId: params.grupoCorrecaoId,
      motivoCorrecao: null,
      observacoes: null,
    },
  };
}

export function evaluateSemenCorrecaoEntrada(params: {
  original: SemenLedgerMovimento & {
    quantidadeDoses: number;
    custoTotal: string | number;
    custoUnitario: string | number;
  };
  movimentacoes: SemenLedgerMovimento[];
  saldoAtual: number;
  dadosNovos: {
    quantidadeDoses: number;
    custoTotal: number;
    custoUnitario: string;
    dataEntrada: string;
  };
  dataCorrecao: string;
  nowIso: string;
  nextEstornoId: number;
  nextEntradaId: number;
  grupoCorrecaoId: string;
  motivoTexto: string;
}):
  | {
      ok: true;
      estorno: SemenCorrecaoMovimentacaoDraft;
      novaEntrada: SemenCorrecaoMovimentacaoDraft;
      estadoFinal: { saldoDoses: number; custoUnitario: string | null; status: SemenStatus };
    }
  | { ok: false; message: string } {
  const elegivel = assertSemenEntradaElegivelParaCorrecao({
    original: params.original,
    movimentacoes: params.movimentacoes,
    saldoAtual: params.saldoAtual,
  });
  if (!elegivel.ok) return elegivel;

  if (
    params.original.dataEntrada != null &&
    String(params.original.dataEntrada).trim() !== "" &&
    !hasSemenCorrecaoAlteracaoReal(
      {
        quantidadeDoses: params.original.quantidadeDoses,
        custoTotal: params.original.custoTotal,
        dataEntrada: params.original.dataEntrada,
      },
      params.dadosNovos,
    )
  ) {
    return { ok: false, message: MSG_SEMEN_CORRECAO_SEM_ALTERACAO };
  }

  const drafts = buildSemenCorrecaoMovimentacoes({
    original: params.original,
    dadosNovos: params.dadosNovos,
    dataCorrecao: params.dataCorrecao,
    grupoCorrecaoId: params.grupoCorrecaoId,
    motivoTexto: params.motivoTexto,
  });

  const hipoteticas: SemenLedgerMovimento[] = [
    ...params.movimentacoes.map(withSemenCorrecaoFields),
    {
      id: params.nextEstornoId,
      tipo: drafts.estorno.tipo,
      quantidadeDoses: drafts.estorno.quantidadeDoses,
      custoTotal: drafts.estorno.custoTotal,
      createdAt: params.nowIso,
      movimentacaoOrigemId: drafts.estorno.movimentacaoOrigemId,
      grupoCorrecaoId: drafts.estorno.grupoCorrecaoId,
      motivoCorrecao: drafts.estorno.motivoCorrecao,
    },
    {
      id: params.nextEntradaId,
      tipo: drafts.novaEntrada.tipo,
      quantidadeDoses: drafts.novaEntrada.quantidadeDoses,
      custoTotal: drafts.novaEntrada.custoTotal,
      createdAt: params.nowIso,
      movimentacaoOrigemId: drafts.novaEntrada.movimentacaoOrigemId,
      grupoCorrecaoId: drafts.novaEntrada.grupoCorrecaoId,
      motivoCorrecao: null,
    },
  ];

  const replay = replaySemenPartidaLedger(hipoteticas);
  if (!replay.ok) return replay;

  return {
    ok: true,
    estorno: drafts.estorno,
    novaEntrada: drafts.novaEntrada,
    estadoFinal: {
      saldoDoses: replay.saldoDoses,
      custoUnitario: replay.custoUnitario,
      status: replay.status,
    },
  };
}

export type SemenMovimentacaoHistoricoFlags = {
  jaCorrigida: boolean;
  ehEstornoCorrecao: boolean;
  ehNovaEntradaCorrigida: boolean;
  podeCorrigir: boolean;
  acaoDesabilitadaMotivo: string | null;
  motivoCorrecaoLabel: string | null;
};

export function annotateSemenMovimentacoesHistorico<T extends SemenLedgerMovimento>(
  movimentacoes: T[],
): Array<T & SemenMovimentacaoHistoricoFlags> {
  const corrigidas = collectIdsEntradasCorrigidas(movimentacoes);
  const motivoByOrigem = new Map<number, string>();
  for (const mov of movimentacoes) {
    if (mov.tipo !== SEMEN_MOV_TIPO_ESTORNO_ENTRADA) continue;
    const origemId = Number(mov.movimentacaoOrigemId);
    const motivo = String(mov.motivoCorrecao ?? "").trim();
    if (origemId > 0 && motivo) motivoByOrigem.set(origemId, motivo);
  }

  return movimentacoes.map(mov => {
    const ehEstornoCorrecao = mov.tipo === SEMEN_MOV_TIPO_ESTORNO_ENTRADA;
    const ehNovaEntradaCorrigida =
      mov.tipo === SEMEN_MOV_TIPO_ENTRADA && Number(mov.movimentacaoOrigemId) > 0;
    const jaCorrigida = mov.tipo === SEMEN_MOV_TIPO_ENTRADA && corrigidas.has(mov.id);
    const isSaidaIa = mov.tipo === SEMEN_MOV_TIPO_SAIDA_IA;
    const podeCorrigir = mov.tipo === SEMEN_MOV_TIPO_ENTRADA && !jaCorrigida;

    let acaoDesabilitadaMotivo: string | null = null;
    if (isSaidaIa) acaoDesabilitadaMotivo = MSG_SEMEN_CORRECAO_SAIDA_IA;
    else if (ehEstornoCorrecao) acaoDesabilitadaMotivo = MSG_SEMEN_CORRECAO_TIPO;
    else if (jaCorrigida) acaoDesabilitadaMotivo = MSG_SEMEN_CORRECAO_JA_CORRIGIDA;

    const motivoCorrecaoLabel =
      (ehEstornoCorrecao ? String(mov.motivoCorrecao ?? "").trim() : "") ||
      (jaCorrigida ? motivoByOrigem.get(mov.id) ?? null : null) ||
      null;

    return {
      ...mov,
      jaCorrigida,
      ehEstornoCorrecao,
      ehNovaEntradaCorrigida,
      podeCorrigir,
      acaoDesabilitadaMotivo,
      motivoCorrecaoLabel,
    };
  });
}
