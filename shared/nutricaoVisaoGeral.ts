import { arredondarKg, arredondarMoeda } from "./nutricaoDietas";
import {
  calcularConsumoAparente,
  chaveAlimento,
  formatarConsumoLista,
  type ConsumoAparente,
  type LeituraCicloRef,
  type NutricaoLeituraFornRef,
} from "./nutricaoCochoLeituras";
import {
  calcularAutonomiaDieta,
  calcularAutonomiaProduto,
  calcularProjecaoPlanejamento,
  diasCivisEntre,
  formatarDataCivilBR,
  formatarMetaPlan,
  hojeISODateLocal,
  metaKgPorCabecaDia,
  normalizarDataCivil,
  parseDiasSemana,
  situacaoTemporal,
  type NutricaoPlanDietaRef,
  type NutricaoPlanPesagemRef,
  type NutricaoPlanProdutoRef,
} from "./nutricaoPlanejamento";
import { calcularQuantidadeDistribuidaKg, calcularSaldoBatida } from "./nutricaoBatidas";

export const MSG_VG_POPULACAO =
  "População observada: soma das populações estáveis dos lotes atendidos. Um lote só entra se todos os fornecimentos confirmados do período tiverem o mesmo snapshot. Não é contagem de brincos únicos.";
export const MSG_VG_ANIMAL_DIA =
  "Animal-dia só é usado quando o lote tem população estável no período. Não reconstruímos ocupação diária nem usamos a população atual.";
export const MSG_VG_CUSTO_INCOMPLETO = "Custo incompleto";
export const MSG_VG_SEM_MOVIMENTO = "Ainda não há movimentação nutricional no período selecionado.";
export const MSG_VG_CONSUMO_APARENTE = "Consumo aparente";
export const MSG_VG_NAO_REAL = "Não é consumo real.";

export type PeriodoCivil = { de: string; ate: string };

export type VgForn = {
  id: number;
  fazendaId: number;
  loteId: number;
  planejamentoId: number | null;
  cochoId: number | null;
  cochoNomeSnapshot: string | null;
  tipoOrigem: string;
  produtoId: number | null;
  dietaId: number | null;
  origemOperacional: string;
  batidaId: number | null;
  data: string;
  hora: string | null;
  quantidadeFornecidaKg: number;
  populacaoSnapshot: number;
  origemNomeSnapshot: string | null;
  custoTotalSnapshot: number | null;
  custoPorKgSnapshot: number | null;
  custoCompleto: boolean;
  status: string;
  planejamentoMetaSnapshot: string | null;
};

export type VgPlan = {
  id: number;
  fazendaId: number;
  loteId: number;
  tipoOrigem: string;
  produtoId: number | null;
  dietaId: number | null;
  modalidadeMeta: string;
  valorMeta: number | null;
  frequencia: string;
  tratosPorDia: number | null;
  frequenciaIntervaloDias: number | null;
  frequenciaDiasSemana: number[];
  dataInicio: string;
  dataFim: string | null;
  status: string;
  origemNome: string | null;
};

export type VgLeitura = LeituraCicloRef & {
  fazendaId: number;
  escore?: string | null;
  cochoNomeSnapshot?: string | null;
  loteNomeSnapshot?: string | null;
};

export type VgBatida = {
  id: number;
  fazendaId: number;
  dietaId: number;
  dietaNomeSnapshot: string | null;
  data: string;
  quantidadePreparadaKg: number;
  status: string;
};

export type VgLote = { id: number; nome: string; fazendaId: number };

export function diaSeguinteCivil(iso: string): string | null {
  const data = normalizarDataCivil(iso);
  if (!data) return null;
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return hojeISODateLocal(dt);
}

export function enumerarDiasCivis(de: string, ate: string): string[] {
  const a = normalizarDataCivil(de);
  const b = normalizarDataCivil(ate);
  if (!a || !b || a > b) return [];
  const out: string[] = [];
  let cur: string | null = a;
  while (cur && cur <= b) {
    out.push(cur);
    const next = diaSeguinteCivil(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return out;
}

export function diaSemanaIso(iso: string): number | null {
  const data = normalizarDataCivil(iso);
  if (!data) return null;
  const [y, m, d] = data.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

export function intersecaoPeriodo(
  a: PeriodoCivil,
  b: { de: string; ate: string | null },
): PeriodoCivil | null {
  const a0 = normalizarDataCivil(a.de);
  const a1 = normalizarDataCivil(a.ate);
  const b0 = normalizarDataCivil(b.de);
  const b1 = normalizarDataCivil(b.ate) ?? "9999-12-31";
  if (!a0 || !a1 || !b0) return null;
  const de = a0 > b0 ? a0 : b0;
  const ate = a1 < b1 ? a1 : b1;
  if (de > ate) return null;
  return { de, ate };
}

export function planejamentoAplicaNoDia(plan: VgPlan, dia: string): boolean {
  if (plan.status === "cancelado") return false;
  const data = normalizarDataCivil(dia);
  const ini = normalizarDataCivil(plan.dataInicio);
  const fim = normalizarDataCivil(plan.dataFim);
  if (!data || !ini) return false;
  if (data < ini) return false;
  if (fim && data > fim) return false;
  if (plan.frequencia === "conforme_necessidade") return false;
  if (plan.frequencia === "diaria") return true;
  if (plan.frequencia === "dias_semana") {
    const wd = diaSemanaIso(data);
    return wd != null && plan.frequenciaDiasSemana.includes(wd);
  }
  if (plan.frequencia === "a_cada_x_dias") {
    const passo = Number(plan.frequenciaIntervaloDias);
    if (!(passo >= 1)) return false;
    const dist = diasCivisEntre(ini, data);
    return dist != null && dist >= 0 && dist % passo === 0;
  }
  return false;
}

export function periodoRapido(
  tipo: "hoje" | "7d" | "30d" | "mes" | "personalizado",
  hojeISO: string,
  personalizado?: PeriodoCivil,
): PeriodoCivil {
  const hoje = normalizarDataCivil(hojeISO) ?? hojeISO;
  if (tipo === "hoje") return { de: hoje, ate: hoje };
  if (tipo === "7d") {
    const [y, m, d] = hoje.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 6);
    return { de: hojeISODateLocal(dt), ate: hoje };
  }
  if (tipo === "30d") {
    const [y, m, d] = hoje.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 29);
    return { de: hojeISODateLocal(dt), ate: hoje };
  }
  if (tipo === "mes") {
    const [y, m] = hoje.split("-").map(Number);
    const de = `${y}-${String(m).padStart(2, "0")}-01`;
    const last = new Date(y, m, 0).getDate();
    return { de, ate: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
  }
  return {
    de: normalizarDataCivil(personalizado?.de) ?? hoje,
    ate: normalizarDataCivil(personalizado?.ate) ?? hoje,
  };
}

export function fornsConfirmados(forns: VgForn[], periodo: PeriodoCivil, loteId?: number | null): VgForn[] {
  const de = normalizarDataCivil(periodo.de) ?? "";
  const ate = normalizarDataCivil(periodo.ate) ?? "";
  return forns.filter(f => {
    if (f.status !== "confirmado") return false;
    if (loteId && f.loteId !== loteId) return false;
    return f.data >= de && f.data <= ate;
  });
}

export function populacaoEstavelLote(fornsLote: VgForn[]): { estavel: boolean; populacao: number | null } {
  const snaps = [...new Set(fornsLote.map(f => f.populacaoSnapshot).filter(n => n > 0))];
  if (snaps.length === 1) return { estavel: true, populacao: snaps[0]! };
  return { estavel: false, populacao: null };
}

export function animalDiaLote(fornsLote: VgForn[]): { animalDia: number | null; motivo: string | null } {
  const pop = populacaoEstavelLote(fornsLote);
  if (!pop.estavel || pop.populacao == null) {
    return { animalDia: null, motivo: MSG_VG_ANIMAL_DIA };
  }
  const dias = new Set(fornsLote.map(f => f.data));
  if (dias.size === 0) return { animalDia: null, motivo: MSG_VG_ANIMAL_DIA };
  return { animalDia: pop.populacao * dias.size, motivo: null };
}

export function agregarCustoFornecimentos(forns: VgForn[]): {
  custoConhecido: number;
  kgComCusto: number;
  kgSemCusto: number;
  completo: boolean;
  eventosIncompletos: number;
} {
  let custoConhecido = 0;
  let kgComCusto = 0;
  let kgSemCusto = 0;
  let incompletos = 0;
  for (const f of forns) {
    if (f.custoCompleto && f.custoTotalSnapshot != null && Number.isFinite(f.custoTotalSnapshot)) {
      custoConhecido = arredondarMoeda(custoConhecido + f.custoTotalSnapshot);
      kgComCusto = arredondarKg(kgComCusto + f.quantidadeFornecidaKg);
    } else {
      kgSemCusto = arredondarKg(kgSemCusto + f.quantidadeFornecidaKg);
      incompletos += 1;
    }
  }
  return {
    custoConhecido,
    kgComCusto,
    kgSemCusto,
    completo: incompletos === 0,
    eventosIncompletos: incompletos,
  };
}

export function custoPorKgFornecido(custo: ReturnType<typeof agregarCustoFornecimentos>): number | null {
  if (!custo.completo || !(custo.kgComCusto > 0)) return null;
  return arredondarMoeda(custo.custoConhecido / custo.kgComCusto);
}

function origemChave(item: { tipoOrigem: string; produtoId?: number | null; dietaId?: number | null }): string {
  return item.tipoOrigem === "dieta" ? `dieta:${item.dietaId ?? 0}` : `produto:${item.produtoId ?? 0}`;
}

export function planosVigentesNoDia(planos: VgPlan[], dia: string, loteId: number, origem: string): VgPlan[] {
  const candidatos = planos.filter(p =>
    p.loteId === loteId && origemChave(p) === origem && planejamentoAplicaNoDia(p, dia),
  );
  if (candidatos.length <= 1) return candidatos;
  const escolhido = [...candidatos].sort((a, b) => {
    if (a.dataInicio !== b.dataInicio) return a.dataInicio < b.dataInicio ? 1 : -1;
    return b.id - a.id;
  })[0]!;
  return [escolhido];
}

export function planejadoNoPeriodo(input: {
  plan: VgPlan;
  periodo: PeriodoCivil;
  populacao: number | null;
  todosPlanos: VgPlan[];
}): {
  planejadoKg: number | null;
  diasAplicaveis: number;
  motivo: string | null;
  adLibitum: boolean;
} {
  if (input.plan.status === "cancelado") {
    return { planejadoKg: null, diasAplicaveis: 0, motivo: "Planejamento cancelado.", adLibitum: false };
  }
  const inter = intersecaoPeriodo(input.periodo, { de: input.plan.dataInicio, ate: input.plan.dataFim });
  if (!inter) return { planejadoKg: null, diasAplicaveis: 0, motivo: "Fora da validade do planejamento.", adLibitum: false };

  const adLib = input.plan.modalidadeMeta === "ad_libitum" || input.plan.frequencia === "conforme_necessidade";
  const dias = enumerarDiasCivis(inter.de, inter.ate).filter(dia =>
    planosVigentesNoDia(input.todosPlanos, dia, input.plan.loteId, origemChave(input.plan)).some(p => p.id === input.plan.id),
  );
  if (adLib) {
    return { planejadoKg: null, diasAplicaveis: dias.length, motivo: "Ad libitum / conforme necessidade — sem quantidade planejada.", adLibitum: true };
  }
  const metaCab = metaKgPorCabecaDia({
    modalidadeMeta: input.plan.modalidadeMeta,
    valorMeta: input.plan.valorMeta,
    pesoMedioKg: null,
  });
  if (metaCab == null) {
    return { planejadoKg: null, diasAplicaveis: dias.length, motivo: "Meta quantitativa não determinada.", adLibitum: false };
  }
  if (input.populacao == null || !(input.populacao > 0)) {
    return { planejadoKg: null, diasAplicaveis: dias.length, motivo: "População histórica do lote não determinada.", adLibitum: false };
  }
  const needDia = arredondarKg(metaCab * input.populacao);
  return {
    planejadoKg: arredondarKg(needDia * dias.length),
    diasAplicaveis: dias.length,
    motivo: null,
    adLibitum: false,
  };
}

export type PontoEvolucao = {
  chave: string;
  label: string;
  kg: number;
  custoConhecido: number;
  custoIncompleto: boolean;
};

export function agregarEvolucao(forns: VgForn[], periodo: PeriodoCivil): {
  granularidade: "hora" | "dia" | "semana" | "mes";
  pontos: PontoEvolucao[];
} {
  const dias = enumerarDiasCivis(periodo.de, periodo.ate).length;
  const todosComHora = forns.length > 0 && forns.every(f => Boolean(f.hora));
  let granularidade: "hora" | "dia" | "semana" | "mes" = "dia";
  if (dias <= 1 && todosComHora) granularidade = "hora";
  else if (dias > 180) granularidade = "mes";
  else if (dias > 60) granularidade = "semana";

  const mapa = new Map<string, PontoEvolucao>();
  const chaveDe = (f: VgForn): { chave: string; label: string } => {
    if (granularidade === "hora") return { chave: `${f.data}T${f.hora}`, label: f.hora ?? f.data };
    if (granularidade === "mes") return { chave: f.data.slice(0, 7), label: f.data.slice(0, 7) };
    if (granularidade === "semana") {
      const [y, m, d] = f.data.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const day = dt.getDay() || 7;
      dt.setDate(dt.getDate() - day + 1);
      const key = hojeISODateLocal(dt);
      return { chave: key, label: formatarDataCivilBR(key) };
    }
    return { chave: f.data, label: formatarDataCivilBR(f.data) };
  };
  for (const f of forns) {
    const { chave, label } = chaveDe(f);
    const atual = mapa.get(chave) ?? { chave, label, kg: 0, custoConhecido: 0, custoIncompleto: false };
    atual.kg = arredondarKg(atual.kg + f.quantidadeFornecidaKg);
    if (f.custoCompleto && f.custoTotalSnapshot != null) {
      atual.custoConhecido = arredondarMoeda(atual.custoConhecido + f.custoTotalSnapshot);
    } else {
      atual.custoIncompleto = true;
    }
    mapa.set(chave, atual);
  }
  return { granularidade, pontos: [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave)) };
}

export function consumoAparenteDoPainel(input: {
  leiturasPeriodo: VgLeitura[];
  leiturasCocho: VgLeitura[];
  fornecimentosCocho: NutricaoLeituraFornRef[];
}): {
  linhas: Array<{
    leituraId: number;
    cochoId: number;
    cochoNome: string;
    loteNome: string | null;
    data: string;
    hora: string | null;
    fornecidoKg: number | null;
    sobraInicialKg: number | null;
    sobraFinalKg: number | null;
    consumoAparenteKg: number | null;
    kgPorCabeca: number | null;
    kgPorCabecaDia: number | null;
    calculavel: boolean;
    motivo: string | null;
    intervaloLabel: string | null;
  }>;
  totalAparenteKg: number | null;
  ciclosQuantitativos: number;
  ciclosCalculaveis: number;
  coberturaTexto: string;
} {
  const linhas = [];
  let total = 0;
  let quant = 0;
  let calc = 0;
  for (const leitura of input.leiturasPeriodo.filter(l => l.status === "ativa")) {
    if (leitura.sobraKg != null) quant += 1;
    const consumo = calcularConsumoAparente({
      leitura,
      leiturasCocho: input.leiturasCocho.filter(l => l.cochoId === leitura.cochoId),
      fornecimentosCocho: input.fornecimentosCocho.filter(f => f.cochoId === leitura.cochoId),
    });
    if (consumo.calculavel && consumo.consumoAparenteKg != null) {
      calc += 1;
      total = arredondarKg(total + consumo.consumoAparenteKg);
    }
    linhas.push({
      leituraId: leitura.id,
      cochoId: leitura.cochoId,
      cochoNome: leitura.cochoNomeSnapshot ?? `Cocho #${leitura.cochoId}`,
      loteNome: leitura.loteNomeSnapshot ?? null,
      data: leitura.data,
      hora: leitura.hora,
      fornecidoKg: consumo.fornecidoKg,
      sobraInicialKg: consumo.sobraInicialKg,
      sobraFinalKg: consumo.sobraFinalKg,
      consumoAparenteKg: consumo.consumoAparenteKg,
      kgPorCabeca: consumo.kgPorCabeca,
      kgPorCabecaDia: consumo.kgPorCabecaDia,
      calculavel: consumo.calculavel,
      motivo: consumo.motivo,
      intervaloLabel: consumo.intervaloLabel,
    });
  }
  return {
    linhas,
    totalAparenteKg: calc > 0 ? total : null,
    ciclosQuantitativos: quant,
    ciclosCalculaveis: calc,
    coberturaTexto: quant > 0
      ? `${calc} de ${quant} ciclos quantitativos calculáveis.`
      : "Nenhum ciclo quantitativo no período.",
  };
}

export function formatarIndicadorNumero(valor: number | null, opts?: { sufixo?: string; inteiro?: boolean }): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  const n = opts?.inteiro ? Math.round(valor).toLocaleString("pt-BR") : valor.toLocaleString("pt-BR");
  return opts?.sufixo ? `${n} ${opts.sufixo}` : n;
}

export function formatarMoedaIndicador(valor: number | null): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export { formatarConsumoLista, chaveAlimento };

export type PainelNutricao = ReturnType<typeof montarPainelNutricao>;

export function montarPainelNutricao(input: {
  periodo: PeriodoCivil;
  hojeISO: string;
  loteId?: number | null;
  fornecimentos: VgForn[];
  planejamentos: VgPlan[];
  leituras: VgLeitura[];
  batidas: VgBatida[];
  lotes: VgLote[];
  produtos: NutricaoPlanProdutoRef[];
  dietas: NutricaoPlanDietaRef[];
  animaisPorLote: Map<number, number[]>;
  pesagens: NutricaoPlanPesagemRef[];
}) {
  const loteFiltro = Number(input.loteId) > 0 ? Number(input.loteId) : null;
  const forns = fornsConfirmados(input.fornecimentos, input.periodo, loteFiltro);
  const leiturasPeriodo = input.leituras.filter(l => {
    if (l.status !== "ativa") return false;
    if (loteFiltro && l.loteId && l.loteId !== loteFiltro) return false;
    return l.data >= input.periodo.de && l.data <= input.periodo.ate;
  });
  const planos = input.planejamentos.filter(p => {
    if (p.status === "cancelado") return false;
    if (loteFiltro && p.loteId !== loteFiltro) return false;
    return intersecaoPeriodo(input.periodo, { de: p.dataInicio, ate: p.dataFim }) != null;
  });
  const nomeLote = (id: number) => input.lotes.find(l => l.id === id)?.nome ?? `Lote #${id}`;

  const porLote = new Map<number, VgForn[]>();
  for (const f of forns) {
    const arr = porLote.get(f.loteId) ?? [];
    arr.push(f);
    porLote.set(f.loteId, arr);
  }

  let populacaoObservada = 0;
  let lotesPopulacaoEstavel = 0;
  const lotesAtendidos = [...porLote.keys()];
  for (const [, arr] of porLote) {
    const pop = populacaoEstavelLote(arr);
    if (pop.estavel && pop.populacao != null) {
      populacaoObservada += pop.populacao;
      lotesPopulacaoEstavel += 1;
    }
  }
  const populacaoCompleta = lotesAtendidos.length > 0 && lotesPopulacaoEstavel === lotesAtendidos.length;
  const kgFornecido = arredondarKg(forns.reduce((acc, f) => acc + f.quantidadeFornecidaKg, 0));
  const custo = agregarCustoFornecimentos(forns);

  let animalDiaTotal = 0;
  let lotesComAnimalDia = 0;
  let kgComAnimalDia = 0;
  let custoComAnimalDia = 0;
  let custoAnimalDiaCompleto = true;
  for (const [, arr] of porLote) {
    const ad = animalDiaLote(arr);
    if (ad.animalDia == null) continue;
    lotesComAnimalDia += 1;
    animalDiaTotal += ad.animalDia;
    kgComAnimalDia = arredondarKg(kgComAnimalDia + arr.reduce((s, f) => s + f.quantidadeFornecidaKg, 0));
    const cLote = agregarCustoFornecimentos(arr);
    if (!cLote.completo) custoAnimalDiaCompleto = false;
    else custoComAnimalDia = arredondarMoeda(custoComAnimalDia + cLote.custoConhecido);
  }
  const fornecidoCabDia = lotesComAnimalDia > 0 && animalDiaTotal > 0
    ? arredondarKg(kgComAnimalDia / animalDiaTotal)
    : null;
  const custoCabDia = lotesComAnimalDia > 0 && animalDiaTotal > 0 && custoAnimalDiaCompleto
    ? arredondarMoeda(custoComAnimalDia / animalDiaTotal)
    : null;

  const fornRefs: NutricaoLeituraFornRef[] = input.fornecimentos
    .filter(f => f.status === "confirmado")
    .map(f => ({
      id: f.id,
      userId: 0,
      fazendaId: f.fazendaId,
      cochoId: f.cochoId,
      loteId: f.loteId,
      tipoOrigem: f.tipoOrigem,
      produtoId: f.produtoId,
      dietaId: f.dietaId,
      origemNomeSnapshot: f.origemNomeSnapshot,
      quantidadeFornecidaKg: f.quantidadeFornecidaKg,
      status: f.status,
      data: f.data,
      hora: f.hora,
      populacaoSnapshot: f.populacaoSnapshot,
      batidaId: f.batidaId,
      planejamentoId: f.planejamentoId,
    }));

  const consumo = consumoAparenteDoPainel({
    leiturasPeriodo,
    leiturasCocho: input.leituras,
    fornecimentosCocho: fornRefs,
  });

  const planejadoLinhas = planos.map(plan => {
    const fornsLote = porLote.get(plan.loteId) ?? [];
    const fornsFonte = fornsLote.filter(f => origemChave(f) === origemChave(plan));
    const pop = populacaoEstavelLote(fornsLote.length ? fornsLote : fornsFonte);
    const calc = planejadoNoPeriodo({
      plan,
      periodo: input.periodo,
      populacao: pop.estavel ? pop.populacao : null,
      todosPlanos: input.planejamentos.filter(p => p.status !== "cancelado"),
    });
    const fornecido = arredondarKg(fornsFonte.reduce((s, f) => s + f.quantidadeFornecidaKg, 0));
    const desvioKg = calc.planejadoKg != null ? arredondarKg(fornecido - calc.planejadoKg) : null;
    const desvioPct = calc.planejadoKg != null && calc.planejadoKg > 0
      ? Math.round((desvioKg! / calc.planejadoKg) * 1000) / 10
      : null;
    return {
      planejamentoId: plan.id,
      loteId: plan.loteId,
      loteNome: nomeLote(plan.loteId),
      fonte: plan.origemNome ?? (plan.tipoOrigem === "dieta" ? `Dieta #${plan.dietaId}` : `Produto #${plan.produtoId}`),
      meta: formatarMetaPlan(plan.modalidadeMeta, plan.valorMeta),
      planejadoKg: calc.planejadoKg,
      fornecidoKg: fornecido,
      desvioKg,
      desvioPct,
      adLibitum: calc.adLibitum,
      motivo: calc.motivo,
      diasAplicaveis: calc.diasAplicaveis,
    };
  });

  const produtosPorId = new Map(input.produtos.map(p => [p.produtoId, p]));
  const dietasPorId = new Map(input.dietas.map(d => [d.id, d]));
  const necessidadePorProduto = new Map<number, { nome: string; necessidadeKgDia: number }>();
  const autonomiasVigentes: Array<{ dias: number | null; nome: string; calculavel: boolean; motivo: string | null }> = [];

  const vigentes = input.planejamentos.filter(p => {
    if (loteFiltro && p.loteId !== loteFiltro) return false;
    return situacaoTemporal({
      status: p.status,
      dataInicio: p.dataInicio,
      dataFim: p.dataFim,
      hojeISO: input.hojeISO,
    }) === "vigente";
  });

  for (const plan of vigentes) {
    const animalIds = input.animaisPorLote.get(plan.loteId) ?? [];
    const dieta = plan.dietaId ? dietasPorId.get(plan.dietaId) : null;
    const produto = plan.produtoId ? produtosPorId.get(plan.produtoId) : null;
    const proj = calcularProjecaoPlanejamento({
      modalidadeMeta: plan.modalidadeMeta,
      valorMeta: plan.valorMeta,
      tratosPorDia: plan.tratosPorDia,
      tipoOrigem: plan.tipoOrigem,
      animalIds,
      pesagens: input.pesagens.filter(p => animalIds.includes(p.animalId)),
      hojeISO: input.hojeISO,
      produto: produto ?? undefined,
      dieta: dieta ?? undefined,
      produtosPorId,
    });
    if (plan.tipoOrigem === "produto") {
      const aut = proj.autonomiaProduto ?? calcularAutonomiaProduto({
        produto, necessidadeKgDia: proj.necessidadeKgDia,
      });
      autonomiasVigentes.push({
        dias: aut.autonomiaDias,
        nome: produto?.nome ?? plan.origemNome ?? "Produto",
        calculavel: aut.calculavel,
        motivo: aut.motivo,
      });
      if (proj.necessidadeKgDia != null && plan.produtoId) {
        const atual = necessidadePorProduto.get(plan.produtoId);
        necessidadePorProduto.set(plan.produtoId, {
          nome: produto?.nome ?? plan.origemNome ?? `Produto #${plan.produtoId}`,
          necessidadeKgDia: arredondarKg((atual?.necessidadeKgDia ?? 0) + proj.necessidadeKgDia),
        });
      }
    } else {
      const aut = proj.autonomiaDieta ?? calcularAutonomiaDieta({
        dieta: dieta ?? undefined, produtosPorId, necessidadeKgDia: proj.necessidadeKgDia,
      });
      autonomiasVigentes.push({
        dias: aut.autonomiaDias,
        nome: dieta?.nome ?? plan.origemNome ?? "Dieta",
        calculavel: aut.calculavel,
        motivo: aut.motivo,
      });
      if (proj.necessidadeKgDia != null && dieta) {
        const base = dieta.baseQuantidade;
        if (base > 0) {
          for (const ing of dieta.ingredientes) {
            const need = arredondarKg(proj.necessidadeKgDia * (ing.quantidadeKg / base));
            const p = produtosPorId.get(ing.produtoId);
            const atual = necessidadePorProduto.get(ing.produtoId);
            necessidadePorProduto.set(ing.produtoId, {
              nome: p?.nome ?? `Produto #${ing.produtoId}`,
              necessidadeKgDia: arredondarKg((atual?.necessidadeKgDia ?? 0) + need),
            });
          }
        }
      }
    }
  }

  const autonomiasCalc = autonomiasVigentes.filter(a => a.calculavel && a.dias != null);
  const menorAutonomia = autonomiasCalc.length
    ? autonomiasCalc.reduce((acc, a) => (a.dias! < acc.dias! ? a : acc))
    : null;

  const estoqueAutonomia = [...necessidadePorProduto.entries()].map(([produtoId, need]) => {
    const produto = produtosPorId.get(produtoId);
    const aut = calcularAutonomiaProduto({ produto, necessidadeKgDia: need.necessidadeKgDia });
    return {
      produtoId,
      produtoNome: need.nome,
      saldoKg: aut.saldoKg,
      necessidadeKgDia: need.necessidadeKgDia,
      autonomiaDias: aut.autonomiaDias,
      calculavel: aut.calculavel,
      motivo: aut.motivo,
    };
  }).sort((a, b) => (a.autonomiaDias ?? 1e12) - (b.autonomiaDias ?? 1e12));

  const lotesTabela = lotesAtendidos.map(loteId => {
    const arr = porLote.get(loteId) ?? [];
    const pop = populacaoEstavelLote(arr);
    const ad = animalDiaLote(arr);
    const kg = arredondarKg(arr.reduce((s, f) => s + f.quantidadeFornecidaKg, 0));
    const cLote = agregarCustoFornecimentos(arr);
    const fontesVig = vigentes.filter(p => p.loteId === loteId);
    const fontesNomes = [...new Set(fontesVig.map(p => p.origemNome ?? (p.tipoOrigem === "dieta" ? `Dieta #${p.dietaId}` : `Produto #${p.produtoId}`)))];
    const metas = [...new Set(fontesVig.map(p => formatarMetaPlan(p.modalidadeMeta, p.valorMeta)))];
    const consLote = consumo.linhas.filter(l => arr.some(f => f.loteId === loteId) && l.loteNome === nomeLote(loteId) && l.calculavel);
    const consFallback = consumo.linhas.filter(l => l.calculavel && input.leituras.find(x => x.id === l.leituraId)?.loteId === loteId);
    const cons = consLote.length ? consLote : consFallback;
    const consTotal = cons.length ? arredondarKg(cons.reduce((s, l) => s + (l.consumoAparenteKg ?? 0), 0)) : null;
    return {
      loteId,
      loteNome: nomeLote(loteId),
      animais: pop.estavel ? pop.populacao : null,
      fontes: fontesNomes,
      meta: metas.length === 1 ? metas[0]! : (metas.length > 1 ? metas.join(" · ") : "—"),
      fornecidoKg: kg,
      fornecidoCabDia: ad.animalDia != null && ad.animalDia > 0 ? arredondarKg(kg / ad.animalDia) : null,
      custo: cLote.completo ? cLote.custoConhecido : null,
      custoIncompleto: !cLote.completo && arr.length > 0,
      custoCabDia: ad.animalDia != null && ad.animalDia > 0 && cLote.completo
        ? arredondarMoeda(cLote.custoConhecido / ad.animalDia)
        : null,
      consumoAparenteKg: consTotal,
    };
  });

  const batidasSaldo = input.batidas
    .filter(b => b.status === "confirmado")
    .map(b => {
      const dist = calcularQuantidadeDistribuidaKg(
        input.fornecimentos
          .filter(f => f.batidaId === b.id)
          .map(f => ({ id: f.id, quantidadeFornecidaKg: f.quantidadeFornecidaKg, status: f.status })),
      );
      const saldo = calcularSaldoBatida(b.quantidadePreparadaKg, dist);
      return {
        id: b.id,
        dietaNome: b.dietaNomeSnapshot ?? `Dieta #${b.dietaId}`,
        data: b.data,
        preparadaKg: b.quantidadePreparadaKg,
        distribuidaKg: dist,
        saldoKg: saldo,
      };
    })
    .filter(b => b.saldoKg > 1e-9);

  const recentesForns = [...forns].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return b.id - a.id;
  }).slice(0, 8).map(f => ({
    id: f.id,
    data: f.data,
    hora: f.hora,
    loteNome: nomeLote(f.loteId),
    origemNome: f.origemNomeSnapshot,
    origemOperacional: f.origemOperacional === "batida" ? "Batida" : "Direto",
    cochoNome: f.cochoNomeSnapshot,
    quantidadeKg: f.quantidadeFornecidaKg,
    custo: f.custoCompleto ? f.custoTotalSnapshot : null,
    custoIncompleto: !f.custoCompleto,
    status: f.status,
  }));

  const recentesLeituras = [...leiturasPeriodo].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return b.id - a.id;
  }).slice(0, 8).map(l => {
    const cons = consumo.linhas.find(x => x.leituraId === l.id);
    return {
      id: l.id,
      data: l.data,
      hora: l.hora,
      cochoNome: l.cochoNomeSnapshot ?? `Cocho #${l.cochoId}`,
      loteNome: l.loteNomeSnapshot ?? null,
      sobraKg: l.sobraKg,
      escore: l.escore ?? null,
      consumoAparenteKg: cons?.consumoAparenteKg ?? null,
    };
  });

  const alertas: Array<{ tipo: string; titulo: string; texto: string; destino?: string }> = [];
  for (const plan of vigentes) {
    if (plan.frequencia === "conforme_necessidade") continue;
    const inter = intersecaoPeriodo(input.periodo, { de: plan.dataInicio, ate: plan.dataFim });
    if (!inter) continue;
    const ateLimite = inter.ate < input.hojeISO ? inter.ate : input.hojeISO;
    const diasEsp = enumerarDiasCivis(inter.de, ateLimite).filter(d => planejamentoAplicaNoDia(plan, d));
    if (diasEsp.length === 0) continue;
    const teve = forns.some(f => f.loteId === plan.loteId && origemChave(f) === origemChave(plan));
    if (!teve) {
      alertas.push({
        tipo: "planejamento_sem_fornecimento",
        titulo: "Planejamento vigente sem fornecimento",
        texto: `${nomeLote(plan.loteId)} · ${plan.origemNome ?? "fonte"} não teve fornecimento confirmado no período esperado.`,
        destino: `/nutricao/fornecimentos?fazendaId=${plan.fazendaId}`,
      });
    }
  }
  if (custo.eventosIncompletos > 0 && forns.length > 0) {
    alertas.push({
      tipo: "custo_incompleto",
      titulo: MSG_VG_CUSTO_INCOMPLETO,
      texto: `${custo.eventosIncompletos} fornecimento(s) sem custo conhecido. O total não é exato.`,
    });
  }
  for (const linha of consumo.linhas) {
    if (linha.sobraFinalKg != null && !linha.calculavel) {
      alertas.push({
        tipo: "ciclo_nao_calculavel",
        titulo: "Leitura quantitativa sem ciclo calculável",
        texto: `${linha.cochoNome}: ${linha.motivo ?? "consumo aparente indisponível."}`,
        destino: `/nutricao/cochos/leituras/${linha.leituraId}`,
      });
    }
  }
  for (const row of estoqueAutonomia) {
    if (row.calculavel && row.saldoKg != null && row.necessidadeKgDia > 0 && row.saldoKg + 1e-9 < row.necessidadeKgDia) {
      alertas.push({
        tipo: "estoque_insuficiente",
        titulo: "Estoque abaixo da necessidade projetada de 1 dia",
        texto: `${row.produtoNome}: saldo ${row.saldoKg.toLocaleString("pt-BR")} kg para ${row.necessidadeKgDia.toLocaleString("pt-BR")} kg/dia.`,
      });
    }
  }
  if (batidasSaldo.length > 0) {
    alertas.push({
      tipo: "batida_com_saldo",
      titulo: "Batida com saldo ainda não distribuído",
      texto: `${batidasSaldo.length} batida(s) confirmada(s) com preparação ainda disponível. Isso não é estoque da fazenda.`,
      destino: "/nutricao/batidas",
    });
  }

  const vazio = forns.length === 0 && leiturasPeriodo.length === 0 && planos.length === 0 && batidasSaldo.length === 0;

  return {
    vazio,
    mensagemVazio: vazio ? MSG_VG_SEM_MOVIMENTO : null,
    cards: {
      populacaoObservada: populacaoCompleta || lotesPopulacaoEstavel > 0 ? populacaoObservada : null,
      populacaoIncompleta: lotesAtendidos.length > 0 && !populacaoCompleta,
      populacaoMotivo: MSG_VG_POPULACAO,
      kgFornecido,
      fornecidoCabDia,
      fornecidoCabDiaMotivo: fornecidoCabDia == null ? MSG_VG_ANIMAL_DIA : null,
      lotesAtendidos: lotesAtendidos.length,
      custoConhecido: forns.length === 0 ? 0 : (custo.custoConhecido > 0 || custo.completo ? custo.custoConhecido : null),
      custoCompleto: forns.length === 0 ? true : custo.completo,
      custoIncompleto: forns.length > 0 && !custo.completo,
      custoCabDia,
      custoPorKg: custoPorKgFornecido(custo),
      menorAutonomiaDias: menorAutonomia?.dias ?? null,
      menorAutonomiaNome: menorAutonomia?.nome ?? null,
      coberturaCusto: forns.length > 0
        ? `${custo.kgComCusto.toLocaleString("pt-BR")} kg com custo conhecido de ${kgFornecido.toLocaleString("pt-BR")} kg fornecidos.`
        : null,
      coberturaAnimalDia: lotesAtendidos.length > 0
        ? `${lotesComAnimalDia} de ${lotesAtendidos.length} lote(s) com animal-dia válido.`
        : null,
    },
    planejado: planejadoLinhas,
    evolucao: agregarEvolucao(forns, input.periodo),
    consumo: {
      ...consumo,
      rotulo: MSG_VG_CONSUMO_APARENTE,
      aviso: MSG_VG_NAO_REAL,
    },
    estoqueAutonomia,
    autonomiasVigentes,
    lotes: lotesTabela,
    batidasSaldo,
    recentesForns,
    recentesLeituras,
    alertas,
  };
}
