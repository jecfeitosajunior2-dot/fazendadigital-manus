import { arredondarKg } from "./nutricaoDietas";
import { type NutricaoCochoRef } from "./nutricaoCochos";
import { normalizarHoraFornecimento } from "./nutricaoFornecimentos";
import {
  diasCivisEntre,
  normalizarDataCivil,
  type NutricaoPlanLoteRef,
} from "./nutricaoPlanejamento";

export { formatarDataHoraFornecimento as formatarDataHoraLeitura } from "./nutricaoFornecimentos";
export { normalizarHoraFornecimento };

/**
 * Não existe escala oficial de escore de cocho neste projeto.
 * O único "escore" cadastrado é de condição corporal (outro módulo).
 * Por isso `escore` é texto operacional opcional — sem enum zootécnico
 * e sem conversão para kg.
 */
export const NUTRICAO_LEITURA_STATUS = ["ativa", "cancelada"] as const;
export type NutricaoLeituraStatus = (typeof NUTRICAO_LEITURA_STATUS)[number];

export const MSG_LEITURA_FAZENDA = "Selecione a fazenda da leitura.";
export const MSG_LEITURA_COCHO = "Selecione o cocho da leitura.";
export const MSG_LEITURA_COCHO_FAZENDA = "Este cocho não pertence à fazenda selecionada.";
export const MSG_LEITURA_COCHO_INATIVO = "Este cocho está inativo e não pode receber nova leitura.";
export const MSG_LEITURA_DATA = "Informe a data da leitura.";
export const MSG_LEITURA_DATA_FUTURA = "A data da leitura não pode ser futura.";
export const MSG_LEITURA_HORA = "Informe a hora no formato HH:MM.";
export const MSG_LEITURA_VAZIA =
  "Informe pelo menos a sobra, o escore ou uma observação.";
export const MSG_LEITURA_SOBRA = "A sobra, quando informada, precisa ser zero ou maior, em kg.";
export const MSG_LEITURA_LOTE_FAZENDA = "Este lote não pertence à fazenda selecionada.";
export const MSG_LEITURA_FORN = "O fornecimento de referência não é válido para esta leitura.";
export const MSG_LEITURA_FORN_ESTORNADO = "Não é possível vincular a leitura a um fornecimento estornado.";
export const MSG_LEITURA_FORN_COCHO = "O fornecimento de referência precisa ser do mesmo cocho.";
export const MSG_LEITURA_FORN_LOTE = "O lote da leitura precisa ser o mesmo do fornecimento vinculado.";
export const MSG_LEITURA_FORN_TEMPO =
  "A leitura não pode ser anterior ao fornecimento de referência.";
export const MSG_LEITURA_NAO_ENCONTRADA = "Leitura não encontrada.";
export const MSG_LEITURA_CANCELADA = "Esta leitura já foi cancelada.";
export const MSG_LEITURA_NAO_EDITAR = "Leitura cancelada não pode ser editada.";

export const MSG_CONS_SOBRA_INICIAL = "Saldo inicial do cocho não determinado.";
export const MSG_CONS_SEM_FORN = "Não há fornecimento quantitativo compatível no período.";
export const MSG_CONS_TROCA_LOTE = "Houve troca de lote no intervalo.";
export const MSG_CONS_TROCA_ALIMENTO = "Houve troca de alimento no intervalo.";
export const MSG_CONS_ORDEM = "Ordem temporal insuficiente para calcular.";
export const MSG_CONS_SO_ESCORE = "Leitura possui apenas escore visual.";
export const MSG_CONS_AVULSA = "Não há fornecimento quantitativo de referência.";
export const MSG_CONS_CANCELADA = "Leitura cancelada não fecha ciclo quantitativo.";
export const MSG_CONS_ANTES = "A leitura é anterior ao fornecimento de referência.";

export type NutricaoLeituraInput = {
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

export type NutricaoLeituraFornRef = {
  id: number;
  userId: number;
  fazendaId: number;
  cochoId: number | null;
  loteId: number;
  tipoOrigem: string;
  produtoId: number | null;
  dietaId: number | null;
  origemNomeSnapshot: string | null;
  quantidadeFornecidaKg: number;
  status: string;
  data: string;
  hora: string | null;
  populacaoSnapshot: number;
  batidaId: number | null;
  planejamentoId: number | null;
};

export type LeituraCicloRef = {
  id: number;
  cochoId: number;
  loteId: number | null;
  fornecimentoId: number | null;
  data: string;
  hora: string | null;
  sobraKg: number | null;
  status: string;
};

export type RelacaoTemporal = "antes" | "depois" | "igual" | "ambiguo";

export function normalizarEscore(value?: string | null): string | null {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, 40) : null;
}

export function parseSobraKg(value: unknown): number | null | typeof NaN {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function leituraTemConteudo(input: {
  sobraKg?: number | null;
  escore?: string | null;
  observacoes?: string | null;
}): boolean {
  if (input.sobraKg != null && Number.isFinite(input.sobraKg) && input.sobraKg >= 0) return true;
  if (normalizarEscore(input.escore)) return true;
  if (String(input.observacoes ?? "").trim()) return true;
  return false;
}

export function compararMomentos(
  a: { data: string; hora?: string | null },
  b: { data: string; hora?: string | null },
): RelacaoTemporal {
  const da = normalizarDataCivil(a.data);
  const db = normalizarDataCivil(b.data);
  if (!da || !db) return "ambiguo";
  if (da < db) return "antes";
  if (da > db) return "depois";
  const ha = normalizarHoraFornecimento(a.hora ?? null);
  const hb = normalizarHoraFornecimento(b.hora ?? null);
  if (ha && hb) {
    if (ha < hb) return "antes";
    if (ha > hb) return "depois";
    return "igual";
  }
  if (!ha && !hb) return "igual";
  return "ambiguo";
}

export function chaveAlimento(forn: Pick<NutricaoLeituraFornRef, "tipoOrigem" | "produtoId" | "dietaId">): string {
  return forn.tipoOrigem === "dieta" ? `dieta:${forn.dietaId ?? 0}` : `produto:${forn.produtoId ?? 0}`;
}

export function validarLeituraInput(
  input: NutricaoLeituraInput,
  ctx: {
    cocho?: NutricaoCochoRef | null;
    lote?: NutricaoPlanLoteRef | null;
    fornecimento?: NutricaoLeituraFornRef | null;
    hojeISO: string;
    novaLeitura?: boolean;
  },
): { ok: true } | { ok: false; message: string } {
  if (!(input.fazendaId > 0)) return { ok: false, message: MSG_LEITURA_FAZENDA };
  if (!(input.cochoId > 0) || !ctx.cocho) return { ok: false, message: MSG_LEITURA_COCHO };
  if (ctx.cocho.userId != null && ctx.cocho.fazendaId !== input.fazendaId) {
    return { ok: false, message: MSG_LEITURA_COCHO_FAZENDA };
  }
  if (ctx.cocho.fazendaId !== input.fazendaId) return { ok: false, message: MSG_LEITURA_COCHO_FAZENDA };
  if (ctx.novaLeitura !== false && ctx.cocho.status !== "ativo") {
    return { ok: false, message: MSG_LEITURA_COCHO_INATIVO };
  }

  const data = normalizarDataCivil(input.data);
  if (!data) return { ok: false, message: MSG_LEITURA_DATA };
  if (data > ctx.hojeISO) return { ok: false, message: MSG_LEITURA_DATA_FUTURA };
  if (input.hora && !normalizarHoraFornecimento(input.hora)) {
    return { ok: false, message: MSG_LEITURA_HORA };
  }

  if (input.sobraKg != null) {
    if (!Number.isFinite(input.sobraKg) || input.sobraKg < 0) {
      return { ok: false, message: MSG_LEITURA_SOBRA };
    }
  }
  if (!leituraTemConteudo(input)) return { ok: false, message: MSG_LEITURA_VAZIA };

  if (Number(input.loteId) > 0) {
    if (!ctx.lote || ctx.lote.fazendaId !== input.fazendaId) {
      return { ok: false, message: MSG_LEITURA_LOTE_FAZENDA };
    }
  }

  if (Number(input.fornecimentoId) > 0) {
    const forn = ctx.fornecimento;
    if (!forn || forn.id !== Number(input.fornecimentoId)) return { ok: false, message: MSG_LEITURA_FORN };
    if (forn.fazendaId !== input.fazendaId) return { ok: false, message: MSG_LEITURA_FORN };
    if (forn.status === "estornado") return { ok: false, message: MSG_LEITURA_FORN_ESTORNADO };
    if (forn.status !== "confirmado") return { ok: false, message: MSG_LEITURA_FORN };
    if (!forn.cochoId || forn.cochoId !== input.cochoId) return { ok: false, message: MSG_LEITURA_FORN_COCHO };
    if (Number(input.loteId) > 0 && Number(input.loteId) !== Number(forn.loteId)) {
      return { ok: false, message: MSG_LEITURA_FORN_LOTE };
    }
    const rel = compararMomentos(
      { data, hora: input.hora },
      { data: forn.data, hora: forn.hora },
    );
    if (rel === "antes") return { ok: false, message: MSG_LEITURA_FORN_TEMPO };
  }

  return { ok: true };
}

export type ConsumoAparente = {
  calculavel: boolean;
  motivo: string | null;
  sobraInicialKg: number | null;
  fornecidoKg: number | null;
  sobraFinalKg: number | null;
  consumoAparenteKg: number | null;
  intervaloLabel: string | null;
  duracaoHoras: number | null;
  duracaoDias: number | null;
  kgPorCabeca: number | null;
  kgPorCabecaDia: number | null;
  fornecimentoIds: number[];
  formula: string | null;
};

function indisponivel(motivo: string): ConsumoAparente {
  return {
    calculavel: false,
    motivo,
    sobraInicialKg: null,
    fornecidoKg: null,
    sobraFinalKg: null,
    consumoAparenteKg: null,
    intervaloLabel: null,
    duracaoHoras: null,
    duracaoDias: null,
    kgPorCabeca: null,
    kgPorCabecaDia: null,
    fornecimentoIds: [],
    formula: null,
  };
}

function fornConfirmadoNoCocho(f: NutricaoLeituraFornRef, cochoId: number): boolean {
  return f.status === "confirmado" && f.cochoId === cochoId;
}

function posicionarNoIntervalo(
  item: { data: string; hora?: string | null },
  inicio: { data: string; hora?: string | null },
  fim: { data: string; hora?: string | null },
): "dentro" | "fora" | "ambiguo" {
  const vsIni = compararMomentos(item, inicio);
  const vsFim = compararMomentos(item, fim);
  if (vsIni === "ambiguo" || vsFim === "ambiguo") return "ambiguo";
  if (vsIni === "depois" && (vsFim === "antes" || vsFim === "igual")) return "dentro";
  return "fora";
}

function lotesDoCiclo(
  prev: LeituraCicloRef | null,
  atual: LeituraCicloRef,
  forns: NutricaoLeituraFornRef[],
): number[] {
  const ids = new Set<number>();
  if (prev?.loteId) ids.add(prev.loteId);
  if (atual.loteId) ids.add(atual.loteId);
  for (const f of forns) ids.add(f.loteId);
  return [...ids];
}

function duracaoCiclo(
  inicio: { data: string; hora?: string | null },
  fim: { data: string; hora?: string | null },
): { horas: number | null; dias: number | null; label: string | null } {
  const di = normalizarDataCivil(inicio.data);
  const df = normalizarDataCivil(fim.data);
  if (!di || !df) return { horas: null, dias: null, label: null };
  const hi = normalizarHoraFornecimento(inicio.hora ?? null);
  const hf = normalizarHoraFornecimento(fim.hora ?? null);
  if (hi && hf) {
    const [iy, im, id] = di.split("-").map(Number);
    const [fy, fm, fd] = df.split("-").map(Number);
    const [ih, iMin] = hi.split(":").map(Number);
    const [fh, fMin] = hf.split(":").map(Number);
    const a = new Date(iy, im - 1, id, ih, iMin);
    const b = new Date(fy, fm - 1, fd, fh, fMin);
    const horas = (b.getTime() - a.getTime()) / 3_600_000;
    if (!(horas > 0)) return { horas: null, dias: null, label: null };
    return {
      horas: Math.round(horas * 10) / 10,
      dias: arredondarKg(horas / 24),
      label: horas >= 24
        ? `${Math.round((horas / 24) * 10) / 10} dia(s)`
        : `${Math.round(horas * 10) / 10} hora(s)`,
    };
  }
  if (!hi && !hf) {
    const dias = diasCivisEntre(di, df);
    if (dias == null || dias <= 0) return { horas: null, dias: null, label: null };
    return { horas: dias * 24, dias, label: `${dias} dia(s)` };
  }
  return { horas: null, dias: null, label: null };
}

function montarConsumo(input: {
  sobraInicialKg: number | null;
  fornecidoKg: number;
  sobraFinalKg: number;
  forns: NutricaoLeituraFornRef[];
  inicio: { data: string; hora?: string | null } | null;
  fim: { data: string; hora?: string | null };
}): ConsumoAparente {
  const inicial = input.sobraInicialKg ?? 0;
  const consumo = arredondarKg(inicial + input.fornecidoKg - input.sobraFinalKg);
  const dur = input.inicio
    ? duracaoCiclo(input.inicio, input.fim)
    : { horas: null, dias: null, label: null };
  const pops = [...new Set(input.forns.map(f => f.populacaoSnapshot).filter(p => p > 0))];
  const pop = input.forns.length === 1 && input.forns[0]!.populacaoSnapshot > 0
    ? input.forns[0]!.populacaoSnapshot
    : pops.length === 1
      ? pops[0]!
      : null;
  const kgCab = pop != null ? arredondarKg(consumo / pop) : null;
  const kgCabDia = kgCab != null && dur.dias != null && dur.dias > 0
    ? arredondarKg(consumo / pop! / dur.dias)
    : null;
  const iniTxt = input.sobraInicialKg != null
    ? `${input.sobraInicialKg.toLocaleString("pt-BR")} kg`
    : "0 kg (sem sobra inicial determinada — ciclo vinculado)";
  return {
    calculavel: true,
    motivo: null,
    sobraInicialKg: input.sobraInicialKg,
    fornecidoKg: arredondarKg(input.fornecidoKg),
    sobraFinalKg: arredondarKg(input.sobraFinalKg),
    consumoAparenteKg: consumo,
    intervaloLabel: dur.label,
    duracaoHoras: dur.horas,
    duracaoDias: dur.dias,
    kgPorCabeca: kgCab,
    kgPorCabecaDia: kgCabDia,
    fornecimentoIds: input.forns.map(f => f.id),
    formula: `${iniTxt} + ${arredondarKg(input.fornecidoKg).toLocaleString("pt-BR")} kg − ${arredondarKg(input.sobraFinalKg).toLocaleString("pt-BR")} kg = ${consumo.toLocaleString("pt-BR")} kg`,
  };
}

export function calcularConsumoAparente(input: {
  leitura: LeituraCicloRef;
  leiturasCocho: LeituraCicloRef[];
  fornecimentosCocho: NutricaoLeituraFornRef[];
  fornecimentoVinculado?: NutricaoLeituraFornRef | null;
}): ConsumoAparente {
  const atual = input.leitura;
  if (atual.status === "cancelada") return indisponivel(MSG_CONS_CANCELADA);
  if (atual.sobraKg == null) {
    return indisponivel(MSG_CONS_SO_ESCORE);
  }

  const ativas = input.leiturasCocho.filter(
    l => l.cochoId === atual.cochoId && l.status === "ativa" && l.id !== atual.id,
  );
  const anterioresQuant = ativas
    .filter(l => l.sobraKg != null)
    .filter(l => {
      const rel = compararMomentos(l, atual);
      return rel === "antes";
    })
    .sort((a, b) => {
      const r = compararMomentos(a, b);
      if (r === "depois") return -1;
      if (r === "antes") return 1;
      return b.id - a.id;
    });

  const ambiguas = ativas.filter(l => l.sobraKg != null && compararMomentos(l, atual) === "ambiguo");
  if (ambiguas.length > 0) return indisponivel(MSG_CONS_ORDEM);

  const prev = anterioresQuant[0] ?? null;
  const fornsCocho = input.fornecimentosCocho.filter(f => fornConfirmadoNoCocho(f, atual.cochoId));

  if (prev) {
    const noIntervalo: NutricaoLeituraFornRef[] = [];
    for (const f of fornsCocho) {
      const pos = posicionarNoIntervalo(f, prev, atual);
      if (pos === "ambiguo") return indisponivel(MSG_CONS_ORDEM);
      if (pos === "dentro") noIntervalo.push(f);
    }
    if (noIntervalo.length === 0) return indisponivel(MSG_CONS_SEM_FORN);
    if (lotesDoCiclo(prev, atual, noIntervalo).length > 1) return indisponivel(MSG_CONS_TROCA_LOTE);
    const alimentos = new Set(noIntervalo.map(chaveAlimento));
    if (alimentos.size > 1) return indisponivel(MSG_CONS_TROCA_ALIMENTO);
    const fornecido = noIntervalo.reduce((acc, f) => acc + f.quantidadeFornecidaKg, 0);
    return montarConsumo({
      sobraInicialKg: prev.sobraKg,
      fornecidoKg: fornecido,
      sobraFinalKg: atual.sobraKg,
      forns: noIntervalo,
      inicio: prev,
      fim: atual,
    });
  }

  const vinculo = input.fornecimentoVinculado
    && input.fornecimentoVinculado.id === atual.fornecimentoId
    ? input.fornecimentoVinculado
    : atual.fornecimentoId
      ? fornsCocho.find(f => f.id === atual.fornecimentoId) ?? null
      : null;

  if (!vinculo) {
    return indisponivel(atual.fornecimentoId ? MSG_CONS_SEM_FORN : MSG_CONS_AVULSA);
  }
  if (vinculo.status !== "confirmado") return indisponivel(MSG_CONS_SEM_FORN);
  if (vinculo.cochoId !== atual.cochoId) return indisponivel(MSG_CONS_SEM_FORN);

  const relVinc = compararMomentos(atual, vinculo);
  if (relVinc === "antes") return indisponivel(MSG_CONS_ANTES);
  if (relVinc === "ambiguo") return indisponivel(MSG_CONS_ORDEM);

  const anterioresAoVinculo = fornsCocho.filter(f => {
    if (f.id === vinculo.id) return false;
    const rel = compararMomentos(f, vinculo);
    return rel === "antes";
  });
  const ambiguosAntes = fornsCocho.filter(f => {
    if (f.id === vinculo.id) return false;
    return compararMomentos(f, vinculo) === "ambiguo";
  });
  if (ambiguosAntes.length > 0 || anterioresAoVinculo.length > 0) {
    return indisponivel(MSG_CONS_SOBRA_INICIAL);
  }

  const noCiclo: NutricaoLeituraFornRef[] = [];
  for (const f of fornsCocho) {
    if (f.id === vinculo.id) {
      noCiclo.push(f);
      continue;
    }
    const pos = posicionarNoIntervalo(f, vinculo, atual);
    if (pos === "ambiguo") return indisponivel(MSG_CONS_ORDEM);
    if (pos === "dentro") noCiclo.push(f);
  }
  if (lotesDoCiclo(null, atual, noCiclo).length > 1) return indisponivel(MSG_CONS_TROCA_LOTE);
  if (new Set(noCiclo.map(chaveAlimento)).size > 1) return indisponivel(MSG_CONS_TROCA_ALIMENTO);
  const fornecido = noCiclo.reduce((acc, f) => acc + f.quantidadeFornecidaKg, 0);
  if (atual.sobraKg > fornecido + 1e-9) return indisponivel(MSG_CONS_SOBRA_INICIAL);
  return montarConsumo({
    sobraInicialKg: null,
    fornecidoKg: fornecido,
    sobraFinalKg: atual.sobraKg,
    forns: noCiclo,
    inicio: vinculo,
    fim: atual,
  });
}

export function labelStatusLeitura(status: string): string {
  return status === "cancelada" ? "Cancelada" : "Ativa";
}

export function formatarConsumoLista(consumo: ConsumoAparente): string {
  if (!consumo.calculavel || consumo.consumoAparenteKg == null) return "—";
  return `${consumo.consumoAparenteKg.toLocaleString("pt-BR")} kg`;
}
