import {
  arredondarKg,
  arredondarMoeda,
  calcularCustoEstimadoDieta,
  custoMedioVigentePorKg,
  quantidadeParaKg,
} from "./nutricaoDietas";
import { mensagemConversaoKg, resolverConversaoParaKg } from "./estoqueConversaoKg";

export const NUTRICAO_PLAN_ORIGENS = ["produto", "dieta"] as const;
export type NutricaoPlanTipoOrigem = (typeof NUTRICAO_PLAN_ORIGENS)[number];

export const NUTRICAO_PLAN_MODALIDADES = [
  { value: "g_cab_dia", label: "g/cabeça/dia" },
  { value: "kg_cab_dia", label: "kg/cabeça/dia" },
  { value: "pct_pv_dia", label: "% do peso vivo/dia" },
  { value: "ad_libitum", label: "Ad libitum" },
] as const;
export type NutricaoPlanModalidade = (typeof NUTRICAO_PLAN_MODALIDADES)[number]["value"];

export const NUTRICAO_PLAN_FREQUENCIAS = [
  { value: "diaria", label: "Diariamente" },
  { value: "dias_semana", label: "Dias específicos da semana" },
  { value: "a_cada_x_dias", label: "A cada X dias" },
  { value: "conforme_necessidade", label: "Conforme necessidade" },
] as const;
export type NutricaoPlanFrequencia = (typeof NUTRICAO_PLAN_FREQUENCIAS)[number]["value"];

export const NUTRICAO_PLAN_STATUS_ADMIN = ["ativo", "encerrado", "cancelado"] as const;
export type NutricaoPlanStatusAdmin = (typeof NUTRICAO_PLAN_STATUS_ADMIN)[number];

export const NUTRICAO_PLAN_SITUACOES = ["programado", "vigente", "encerrado", "cancelado"] as const;
export type NutricaoPlanSituacao = (typeof NUTRICAO_PLAN_SITUACOES)[number];

export const NUTRICAO_PLAN_DIAS_SEMANA = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
] as const;

/** Aviso informativo — não existe regra rígida de validade de peso no projeto. */
export const DIAS_PESO_REFERENCIA_AVISO = 30;

export const MSG_PLAN_FAZENDA = "Selecione a fazenda do planejamento.";
export const MSG_PLAN_LOTE = "Selecione o lote do planejamento.";
export const MSG_PLAN_LOTE_FAZENDA = "Este lote não pertence à fazenda selecionada.";
export const MSG_PLAN_LOTE_INATIVO = "Selecione um lote ativo.";
export const MSG_PLAN_ORIGEM = "Escolha produto pronto ou dieta — exatamente um.";
export const MSG_PLAN_ORIGEM_AMBOS = "O planejamento não pode ter produto e dieta ao mesmo tempo.";
export const MSG_PLAN_ORIGEM_NENHUM = "Informe um produto pronto ou uma dieta.";
export const MSG_PLAN_PRODUTO = "Selecione um produto válido vinculado a esta fazenda.";
export const MSG_PLAN_DIETA = "Selecione uma dieta ativa desta fazenda.";
export const MSG_PLAN_DIETA_FAZENDA = "Esta dieta não pertence a esta fazenda.";
export const MSG_PLAN_DIETA_INATIVA = "Só é possível planejar com dieta ativa.";
export const MSG_PLAN_DIETA_VIGENCIA =
  "O período do planejamento precisa ficar dentro da vigência da dieta.";
export const MSG_PLAN_MODALIDADE = "Selecione a modalidade da meta.";
export const MSG_PLAN_VALOR_META = "Informe um valor de meta maior que zero.";
export const MSG_PLAN_ADLIB_VALOR = "Ad libitum não leva valor de meta.";
export const MSG_PLAN_UNIDADE =
  "Meta em gramas, quilos ou % do peso vivo só aceita produto em kg, g ou saco com uma única embalagem de massa (ex.: 30 kg/sc).";
export const MSG_PLAN_INICIO = "Informe a data inicial do planejamento.";
export const MSG_PLAN_DATAS = "A data final não pode ser anterior à data inicial.";
export const MSG_PLAN_FREQUENCIA = "Selecione a frequência do planejamento.";
export const MSG_PLAN_DIAS_SEMANA = "Marque pelo menos um dia da semana.";
export const MSG_PLAN_INTERVALO = "Informe de quantos em quantos dias.";
export const MSG_PLAN_TRATOS = "O número de tratos por dia deve ser pelo menos 1.";
export const MSG_PLAN_CONFLITO =
  "Já existe planejamento da mesma origem neste lote com período sobreposto. Encerre o anterior antes de criar outro.";
export const MSG_PLAN_OWNERSHIP = "Você não tem acesso a este planejamento.";
export const MSG_PLAN_NAO_ENCONTRADO = "Planejamento não encontrado.";
export const MSG_PLAN_MATERIAL_INICIADO =
  "Este planejamento já começou. Troca de lote, origem, meta ou data inicial cria um novo período — o anterior é encerrado. O histórico não é reescrito.";
export const MSG_PLAN_LOTE_VAZIO = "Este lote não possui animais ativos no momento.";

export type NutricaoPlanInput = {
  fazendaId: number;
  loteId: number;
  tipoOrigem: string;
  produtoId?: number | null;
  dietaId?: number | null;
  modalidadeMeta: string;
  valorMeta?: number | null;
  frequencia: string;
  tratosPorDia?: number | null;
  frequenciaIntervaloDias?: number | null;
  frequenciaDiasSemana?: number[] | null;
  nome?: string | null;
  observacoes?: string | null;
  dataInicio: string;
  dataFim?: string | null;
};

export type NutricaoPlanLoteRef = {
  id: number;
  userId: number;
  fazendaId: number | null;
  ativo: boolean;
  nome: string;
};

export type NutricaoPlanProdutoRef = {
  produtoId: number;
  nome: string;
  unidade?: string | null;
  valorUnitario?: string | number | null;
  quantidade?: string | number | null;
  controlarSaldo?: boolean;
  embalagens?: unknown;
  vinculadoFazenda: boolean;
};

export type NutricaoPlanDietaRef = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  status: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  baseQuantidade: number;
  ingredientes: Array<{
    produtoId: number;
    quantidadeKg: number;
  }>;
};

export type NutricaoPlanPesagemRef = {
  animalId: number;
  peso: number;
  data: string;
};

export function normalizarDataCivil(value?: string | Date | null): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const iso = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return null;
  }
  return iso;
}

export function hojeISODateLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Formata YYYY-MM-DD → dd/mm/yyyy sem passar por Date UTC. */
export function formatarDataCivilBR(iso: string | null | undefined): string {
  const data = normalizarDataCivil(iso ?? null);
  if (!data) return "—";
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}`;
}

export function diasCivisEntre(inicio: string, fim: string): number | null {
  const a = normalizarDataCivil(inicio);
  const b = normalizarDataCivil(fim);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad);
  const db = new Date(by, bm - 1, bd);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function diaAnteriorCivil(iso: string): string | null {
  const data = normalizarDataCivil(iso);
  if (!data) return null;
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return hojeISODateLocal(dt);
}

export function periodosSobrepostos(
  aInicio: string,
  aFim: string | null | undefined,
  bInicio: string,
  bFim: string | null | undefined,
): boolean {
  const a0 = normalizarDataCivil(aInicio);
  const b0 = normalizarDataCivil(bInicio);
  if (!a0 || !b0) return false;
  const a1 = normalizarDataCivil(aFim ?? null) ?? "9999-12-31";
  const b1 = normalizarDataCivil(bFim ?? null) ?? "9999-12-31";
  return a0 <= b1 && b0 <= a1;
}

export function mesmaOrigemNutricional(
  a: { tipoOrigem: string; produtoId?: number | null; dietaId?: number | null },
  b: { tipoOrigem: string; produtoId?: number | null; dietaId?: number | null },
): boolean {
  if (a.tipoOrigem !== b.tipoOrigem) return false;
  if (a.tipoOrigem === "produto") {
    return Number(a.produtoId) > 0 && Number(a.produtoId) === Number(b.produtoId);
  }
  if (a.tipoOrigem === "dieta") {
    return Number(a.dietaId) > 0 && Number(a.dietaId) === Number(b.dietaId);
  }
  return false;
}

export function situacaoTemporal(input: {
  status: string;
  dataInicio: string;
  dataFim?: string | null;
  hojeISO: string;
}): NutricaoPlanSituacao {
  if (input.status === "cancelado") return "cancelado";
  const inicio = normalizarDataCivil(input.dataInicio) ?? "";
  const fim = normalizarDataCivil(input.dataFim ?? null);
  const hoje = normalizarDataCivil(input.hojeISO) ?? input.hojeISO;
  if (input.status === "encerrado" || (fim != null && hoje > fim)) return "encerrado";
  if (inicio && hoje < inicio) return "programado";
  return "vigente";
}

export function labelSituacaoPlan(situacao: NutricaoPlanSituacao): string {
  if (situacao === "programado") return "Programado";
  if (situacao === "vigente") return "Vigente";
  if (situacao === "encerrado") return "Encerrado";
  return "Cancelado";
}

export function labelModalidadePlan(value: string | null | undefined): string {
  return NUTRICAO_PLAN_MODALIDADES.find(m => m.value === value)?.label ?? value ?? "—";
}

export function labelFrequenciaPlan(value: string | null | undefined): string {
  return NUTRICAO_PLAN_FREQUENCIAS.find(f => f.value === value)?.label ?? value ?? "—";
}

export function parseDiasSemana(value: string | number[] | null | undefined): number[] {
  if (Array.isArray(value)) {
    return value.filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
  }
  if (!value) return [];
  return String(value)
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
}

export function serializarDiasSemana(dias: number[] | null | undefined): string | null {
  const list = parseDiasSemana(dias);
  return list.length ? list.join(",") : null;
}

export function origemNormalizada(input: Pick<NutricaoPlanInput, "tipoOrigem" | "produtoId" | "dietaId">): {
  tipoOrigem: NutricaoPlanTipoOrigem | null;
  produtoId: number | null;
  dietaId: number | null;
} {
  const tipo = NUTRICAO_PLAN_ORIGENS.includes(input.tipoOrigem as NutricaoPlanTipoOrigem)
    ? (input.tipoOrigem as NutricaoPlanTipoOrigem)
    : null;
  const produtoId = Number(input.produtoId) > 0 ? Number(input.produtoId) : null;
  const dietaId = Number(input.dietaId) > 0 ? Number(input.dietaId) : null;
  if (tipo === "produto") return { tipoOrigem: "produto", produtoId, dietaId: null };
  if (tipo === "dieta") return { tipoOrigem: "dieta", produtoId: null, dietaId };
  return { tipoOrigem: tipo, produtoId, dietaId };
}

export function camposMateriaisPlan(input: NutricaoPlanInput) {
  const origem = origemNormalizada(input);
  return {
    loteId: input.loteId,
    tipoOrigem: origem.tipoOrigem,
    produtoId: origem.produtoId,
    dietaId: origem.dietaId,
    modalidadeMeta: input.modalidadeMeta,
    valorMeta: input.valorMeta ?? null,
    dataInicio: normalizarDataCivil(input.dataInicio),
  };
}

export function mudouCampoMaterial(
  atual: {
    loteId: number;
    tipoOrigem: string;
    produtoId?: number | null;
    dietaId?: number | null;
    modalidadeMeta: string;
    valorMeta?: number | string | null;
    dataInicio: string;
  },
  proximo: NutricaoPlanInput,
): boolean {
  const next = camposMateriaisPlan(proximo);
  const valorAtual = proximo.valorMeta == null && atual.valorMeta == null
    ? true
    : Number(atual.valorMeta) === Number(proximo.valorMeta);
  return !(
    atual.loteId === next.loteId
    && atual.tipoOrigem === next.tipoOrigem
    && Number(atual.produtoId ?? 0) === Number(next.produtoId ?? 0)
    && Number(atual.dietaId ?? 0) === Number(next.dietaId ?? 0)
    && atual.modalidadeMeta === next.modalidadeMeta
    && valorAtual
    && normalizarDataCivil(atual.dataInicio) === next.dataInicio
  );
}

/** Edição material in-place só antes do início ou no próprio dia de início (nada transcorrido). */
export function podeEditarMaterialmente(dataInicio: string, hojeISO: string): boolean {
  const inicio = normalizarDataCivil(dataInicio);
  const hoje = normalizarDataCivil(hojeISO);
  if (!inicio || !hoje) return false;
  return inicio >= hoje;
}

export function dietaCabeNoPeriodo(
  dieta: Pick<NutricaoPlanDietaRef, "dataInicio" | "dataFim">,
  planInicio: string,
  planFim?: string | null,
): boolean {
  const p0 = normalizarDataCivil(planInicio);
  if (!p0) return false;
  const p1 = normalizarDataCivil(planFim ?? null) ?? "9999-12-31";
  const d0 = normalizarDataCivil(dieta.dataInicio ?? null);
  const d1 = normalizarDataCivil(dieta.dataFim ?? null);
  if (d0 && p0 < d0) return false;
  if (d1 && p1 > d1) return false;
  return true;
}

export function validarPlanejamentoInput(
  input: NutricaoPlanInput,
  ctx: {
    lote?: NutricaoPlanLoteRef | null;
    produto?: NutricaoPlanProdutoRef | null;
    dieta?: NutricaoPlanDietaRef | null;
  },
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(input.fazendaId) || input.fazendaId <= 0) {
    return { ok: false, message: MSG_PLAN_FAZENDA };
  }
  if (!Number.isFinite(input.loteId) || input.loteId <= 0) {
    return { ok: false, message: MSG_PLAN_LOTE };
  }
  if (!ctx.lote || ctx.lote.id !== input.loteId) {
    return { ok: false, message: MSG_PLAN_LOTE };
  }
  if (ctx.lote.fazendaId !== input.fazendaId) {
    return { ok: false, message: MSG_PLAN_LOTE_FAZENDA };
  }
  if (!ctx.lote.ativo) return { ok: false, message: MSG_PLAN_LOTE_INATIVO };

  if (!NUTRICAO_PLAN_ORIGENS.includes(input.tipoOrigem as NutricaoPlanTipoOrigem)) {
    return { ok: false, message: MSG_PLAN_ORIGEM };
  }
  const origem = origemNormalizada(input);
  const idsProdutoDieta =
    Number(input.produtoId) > 0 && Number(input.dietaId) > 0;
  if (idsProdutoDieta) {
    return { ok: false, message: MSG_PLAN_ORIGEM_AMBOS };
  }
  const temProduto = origem.produtoId != null;
  const temDieta = origem.dietaId != null;
  if (origem.tipoOrigem === "produto" && !temProduto) {
    return { ok: false, message: MSG_PLAN_ORIGEM_NENHUM };
  }
  if (origem.tipoOrigem === "dieta" && !temDieta) {
    return { ok: false, message: MSG_PLAN_ORIGEM_NENHUM };
  }
  if (!origem.tipoOrigem || (!temProduto && !temDieta)) {
    return { ok: false, message: MSG_PLAN_ORIGEM_NENHUM };
  }

  if (!NUTRICAO_PLAN_MODALIDADES.some(m => m.value === input.modalidadeMeta)) {
    return { ok: false, message: MSG_PLAN_MODALIDADE };
  }
  const adLib = input.modalidadeMeta === "ad_libitum";
  if (adLib) {
    if (input.valorMeta != null && input.valorMeta !== 0 && Number.isFinite(input.valorMeta)) {
      return { ok: false, message: MSG_PLAN_ADLIB_VALOR };
    }
  } else if (!(Number(input.valorMeta) > 0)) {
    return { ok: false, message: MSG_PLAN_VALOR_META };
  }

  if (origem.tipoOrigem === "produto") {
    if (!ctx.produto || !ctx.produto.vinculadoFazenda) {
      return { ok: false, message: MSG_PLAN_PRODUTO };
    }
    if (!adLib) {
      const resolucao = resolverConversaoParaKg(ctx.produto.unidade, ctx.produto.embalagens);
      if (!resolucao.ok) return { ok: false, message: mensagemConversaoKg(resolucao) };
    }
  }
  if (origem.tipoOrigem === "dieta") {
    if (!ctx.dieta || ctx.dieta.id !== origem.dietaId) {
      return { ok: false, message: MSG_PLAN_DIETA };
    }
    if (ctx.dieta.fazendaId !== input.fazendaId) {
      return { ok: false, message: MSG_PLAN_DIETA_FAZENDA };
    }
    if (ctx.dieta.status !== "ativa") return { ok: false, message: MSG_PLAN_DIETA_INATIVA };
    if (!dietaCabeNoPeriodo(ctx.dieta, input.dataInicio, input.dataFim)) {
      return { ok: false, message: MSG_PLAN_DIETA_VIGENCIA };
    }
  }

  const inicio = normalizarDataCivil(input.dataInicio);
  if (!inicio) return { ok: false, message: MSG_PLAN_INICIO };
  const fim = normalizarDataCivil(input.dataFim ?? null);
  if (input.dataFim && !fim) return { ok: false, message: MSG_PLAN_DATAS };
  if (fim && fim < inicio) return { ok: false, message: MSG_PLAN_DATAS };

  if (!NUTRICAO_PLAN_FREQUENCIAS.some(f => f.value === input.frequencia)) {
    return { ok: false, message: MSG_PLAN_FREQUENCIA };
  }
  if (input.frequencia === "dias_semana" && parseDiasSemana(input.frequenciaDiasSemana).length === 0) {
    return { ok: false, message: MSG_PLAN_DIAS_SEMANA };
  }
  if (input.frequencia === "a_cada_x_dias" && !(Number(input.frequenciaIntervaloDias) >= 1)) {
    return { ok: false, message: MSG_PLAN_INTERVALO };
  }
  if (input.tratosPorDia != null && !(Number(input.tratosPorDia) >= 1)) {
    return { ok: false, message: MSG_PLAN_TRATOS };
  }

  return { ok: true };
}

export type PesoReferenciaLote = {
  animaisAtuais: number;
  animaisComPeso: number;
  pesoMedioKg: number | null;
  dataReferencia: string | null;
  fonte: string;
  avisoAtualidade: string | null;
  coberturaTexto: string;
};

export function calcularPesoReferenciaLote(input: {
  animalIds: number[];
  pesagens: NutricaoPlanPesagemRef[];
  hojeISO: string;
}): PesoReferenciaLote {
  const animaisAtuais = input.animalIds.length;
  const porAnimal = new Map<number, { peso: number; data: string }>();
  const ordenadas = input.pesagens
    .filter(p => input.animalIds.includes(p.animalId) && p.peso > 0 && normalizarDataCivil(p.data))
    .slice()
    .sort((a, b) => {
      const da = normalizarDataCivil(a.data)!;
      const db = normalizarDataCivil(b.data)!;
      if (da !== db) return da < db ? 1 : -1;
      return 0;
    });
  for (const p of ordenadas) {
    if (!porAnimal.has(p.animalId)) {
      porAnimal.set(p.animalId, { peso: p.peso, data: normalizarDataCivil(p.data)! });
    }
  }
  const usados = [...porAnimal.values()];
  const animaisComPeso = usados.length;
  const coberturaTexto = `${animaisComPeso}/${animaisAtuais} animais com peso válido`;
  if (animaisComPeso === 0) {
    return {
      animaisAtuais,
      animaisComPeso: 0,
      pesoMedioKg: null,
      dataReferencia: null,
      fonte: "Últimas pesagens dos animais ativos do lote",
      avisoAtualidade: null,
      coberturaTexto,
    };
  }
  const soma = usados.reduce((acc, u) => acc + u.peso, 0);
  const pesoMedioKg = arredondarKg(soma / animaisComPeso);
  const dataReferencia = usados.reduce((acc, u) => (u.data > acc ? u.data : acc), usados[0]!.data);
  const dias = diasCivisEntre(dataReferencia, input.hojeISO);
  const avisoAtualidade =
    dias != null && dias > DIAS_PESO_REFERENCIA_AVISO
      ? `Esta referência tem mais de ${DIAS_PESO_REFERENCIA_AVISO} dias. Use como estimativa — não é um bloqueio.`
      : null;
  return {
    animaisAtuais,
    animaisComPeso,
    pesoMedioKg,
    dataReferencia,
    fonte: "Últimas pesagens dos animais ativos do lote",
    avisoAtualidade,
    coberturaTexto,
  };
}

/** kg/cabeça/dia derivado da meta. Null = não determinado (ad libitum ou %PV sem peso). */
export function metaKgPorCabecaDia(input: {
  modalidadeMeta: string;
  valorMeta?: number | null;
  pesoMedioKg?: number | null;
}): number | null {
  if (input.modalidadeMeta === "ad_libitum") return null;
  const valor = Number(input.valorMeta);
  if (!(valor > 0)) return null;
  if (input.modalidadeMeta === "g_cab_dia") return arredondarKg(valor / 1000);
  if (input.modalidadeMeta === "kg_cab_dia") return arredondarKg(valor);
  if (input.modalidadeMeta === "pct_pv_dia") {
    if (input.pesoMedioKg == null || !(input.pesoMedioKg > 0)) return null;
    return arredondarKg(input.pesoMedioKg * (valor / 100));
  }
  return null;
}

export function necessidadeKgDia(metaCabKg: number | null, animaisAtuais: number): number | null {
  if (metaCabKg == null) return null;
  if (!(animaisAtuais >= 0)) return null;
  return arredondarKg(metaCabKg * animaisAtuais);
}

export type AutonomiaProduto = {
  calculavel: boolean;
  saldoKg: number | null;
  autonomiaDias: number | null;
  motivo: string | null;
};

export function calcularAutonomiaProduto(input: {
  produto?: NutricaoPlanProdutoRef | null;
  necessidadeKgDia: number | null;
}): AutonomiaProduto {
  if (input.necessidadeKgDia == null) {
    return { calculavel: false, saldoKg: null, autonomiaDias: null, motivo: "Necessidade diária não determinada." };
  }
  if (!(input.necessidadeKgDia > 0)) {
    return { calculavel: false, saldoKg: null, autonomiaDias: null, motivo: "Sem necessidade diária atual para projetar autonomia." };
  }
  const produto = input.produto;
  if (!produto) {
    return { calculavel: false, saldoKg: null, autonomiaDias: null, motivo: "Produto indisponível." };
  }
  if (produto.controlarSaldo === false) {
    return { calculavel: false, saldoKg: null, autonomiaDias: null, motivo: "Este produto não controla saldo." };
  }
  const saldoRaw = Number(produto.quantidade);
  if (!Number.isFinite(saldoRaw)) {
    return { calculavel: false, saldoKg: null, autonomiaDias: null, motivo: "Saldo indisponível." };
  }
  const saldoKg = quantidadeParaKg(saldoRaw, produto.unidade, produto.embalagens);
  if (saldoKg == null) {
    return { calculavel: false, saldoKg: null, autonomiaDias: null, motivo: "Unidade do saldo não conversível para kg." };
  }
  return {
    calculavel: true,
    saldoKg,
    autonomiaDias: arredondarKg(saldoKg / input.necessidadeKgDia),
    motivo: null,
  };
}

export type AutonomiaDieta = {
  calculavel: boolean;
  autonomiaDias: number | null;
  limitanteProdutoId: number | null;
  limitanteNome?: string | null;
  ingredientes: Array<{
    produtoId: number;
    necessidadeKgDia: number;
    saldoKg: number | null;
    autonomiaDias: number | null;
    calculavel: boolean;
  }>;
  motivo: string | null;
};

export function calcularAutonomiaDieta(input: {
  dieta?: NutricaoPlanDietaRef | null;
  produtosPorId: Map<number, NutricaoPlanProdutoRef>;
  necessidadeKgDia: number | null;
}): AutonomiaDieta {
  if (input.necessidadeKgDia == null || !(input.necessidadeKgDia > 0) || !input.dieta) {
    return {
      calculavel: false,
      autonomiaDias: null,
      limitanteProdutoId: null,
      ingredientes: [],
      motivo: "Autonomia da dieta não calculável com os dados atuais.",
    };
  }
  const base = input.dieta.baseQuantidade;
  if (!(base > 0) || input.dieta.ingredientes.length === 0) {
    return {
      calculavel: false,
      autonomiaDias: null,
      limitanteProdutoId: null,
      ingredientes: [],
      motivo: "Formulação da dieta incompleta para estimar autonomia.",
    };
  }
  const linhas = input.dieta.ingredientes.map(ing => {
    const fracao = ing.quantidadeKg / base;
    const need = arredondarKg(input.necessidadeKgDia! * fracao);
    const produto = input.produtosPorId.get(ing.produtoId);
    if (!produto || produto.controlarSaldo === false) {
      return {
        produtoId: ing.produtoId,
        necessidadeKgDia: need,
        saldoKg: null,
        autonomiaDias: null,
        calculavel: false,
      };
    }
    const saldoRaw = Number(produto.quantidade);
    const saldoKg = Number.isFinite(saldoRaw)
      ? quantidadeParaKg(saldoRaw, produto.unidade, produto.embalagens)
      : null;
    if (saldoKg == null || !(need > 0)) {
      return {
        produtoId: ing.produtoId,
        necessidadeKgDia: need,
        saldoKg,
        autonomiaDias: null,
        calculavel: false,
      };
    }
    return {
      produtoId: ing.produtoId,
      necessidadeKgDia: need,
      saldoKg,
      autonomiaDias: arredondarKg(saldoKg / need),
      calculavel: true,
    };
  });
  if (linhas.some(l => !l.calculavel)) {
    return {
      calculavel: false,
      autonomiaDias: null,
      limitanteProdutoId: null,
      ingredientes: linhas,
      motivo: "Autonomia da dieta não calculável — falta saldo ou unidade em algum ingrediente.",
    };
  }
  const limitante = linhas.reduce((acc, l) =>
    acc == null || (l.autonomiaDias ?? Infinity) < (acc.autonomiaDias ?? Infinity) ? l : acc,
  linhas[0]!);
  return {
    calculavel: true,
    autonomiaDias: limitante.autonomiaDias,
    limitanteProdutoId: limitante.produtoId,
    ingredientes: linhas,
    motivo: null,
  };
}

export type ProjecaoPlanejamento = {
  animaisAtuais: number;
  loteVazio: boolean;
  avisoLoteVazio: string | null;
  peso: PesoReferenciaLote;
  metaKgPorCabecaDia: number | null;
  kgPorCabecaPorTrato: number | null;
  necessidadeKgDia: number | null;
  necessidadeKg30d: number | null;
  mensagemNecessidade: string | null;
  custo: {
    completo: boolean;
    custoMedioPorKg: number | null;
    custoDia: number | null;
    custoCabecaDia: number | null;
    custo30d: number | null;
    mensagem: string | null;
  };
  autonomiaProduto: AutonomiaProduto | null;
  autonomiaDieta: AutonomiaDieta | null;
};

export function calcularProjecaoPlanejamento(input: {
  modalidadeMeta: string;
  valorMeta?: number | null;
  tratosPorDia?: number | null;
  tipoOrigem: string;
  animalIds: number[];
  pesagens: NutricaoPlanPesagemRef[];
  hojeISO: string;
  produto?: NutricaoPlanProdutoRef | null;
  dieta?: NutricaoPlanDietaRef | null;
  produtosPorId?: Map<number, NutricaoPlanProdutoRef>;
}): ProjecaoPlanejamento {
  const peso = calcularPesoReferenciaLote({
    animalIds: input.animalIds,
    pesagens: input.pesagens,
    hojeISO: input.hojeISO,
  });
  const animaisAtuais = peso.animaisAtuais;
  const loteVazio = animaisAtuais === 0;
  const metaCab = metaKgPorCabecaDia({
    modalidadeMeta: input.modalidadeMeta,
    valorMeta: input.valorMeta,
    pesoMedioKg: peso.pesoMedioKg,
  });
  const needDia = necessidadeKgDia(metaCab, animaisAtuais);
  let mensagemNecessidade: string | null = null;
  if (input.modalidadeMeta === "ad_libitum") {
    mensagemNecessidade = "Oferta à vontade — necessidade diária não determinada pela meta.";
  } else if (input.modalidadeMeta === "pct_pv_dia" && metaCab == null) {
    mensagemNecessidade = "Peso de referência indisponível";
  }
  const tratos = Number(input.tratosPorDia);
  const kgPorCabecaPorTrato =
    metaCab != null && tratos >= 1 ? arredondarKg(metaCab / tratos) : null;

  let custoMedioPorKg: number | null = null;
  let custoCompleto = false;
  let mensagemCusto: string | null = null;
  if (input.tipoOrigem === "produto") {
    custoMedioPorKg = custoMedioVigentePorKg(
      input.produto?.valorUnitario ?? null,
      input.produto?.unidade ?? "kg",
      input.produto?.embalagens,
    );
    if (custoMedioPorKg == null) {
      mensagemCusto = "Custo não disponível";
      custoCompleto = false;
    } else {
      custoCompleto = true;
    }
  } else if (input.tipoOrigem === "dieta" && input.dieta) {
    const produtos = input.produtosPorId ?? new Map<number, NutricaoPlanProdutoRef>();
    const estimado = calcularCustoEstimadoDieta({
      baseQuantidade: input.dieta.baseQuantidade,
      ingredientes: input.dieta.ingredientes.map(ing => {
        const p = produtos.get(ing.produtoId);
        return {
          produtoId: ing.produtoId,
          quantidade: ing.quantidadeKg,
          unidade: p?.unidade ?? "kg",
          valorUnitario: p?.valorUnitario ?? null,
          embalagens: p?.embalagens,
        };
      }),
    });
    if (!estimado.completo || estimado.custoPorKg == null) {
      mensagemCusto = "Custo da dieta incompleto";
      custoCompleto = false;
      custoMedioPorKg = null;
    } else {
      custoCompleto = true;
      custoMedioPorKg = estimado.custoPorKg;
    }
  }

  const custoDia =
    custoCompleto && custoMedioPorKg != null && needDia != null
      ? arredondarMoeda(needDia * custoMedioPorKg)
      : null;
  const custoCabecaDia =
    custoCompleto && custoMedioPorKg != null && metaCab != null
      ? arredondarMoeda(metaCab * custoMedioPorKg)
      : null;
  const custo30d = custoDia != null ? arredondarMoeda(custoDia * 30) : null;

  const autonomiaProduto =
    input.tipoOrigem === "produto"
      ? calcularAutonomiaProduto({ produto: input.produto, necessidadeKgDia: needDia })
      : null;
  const autonomiaDieta =
    input.tipoOrigem === "dieta"
      ? calcularAutonomiaDieta({
          dieta: input.dieta,
          produtosPorId: input.produtosPorId ?? new Map(),
          necessidadeKgDia: needDia,
        })
      : null;

  return {
    animaisAtuais,
    loteVazio,
    avisoLoteVazio: loteVazio ? MSG_PLAN_LOTE_VAZIO : null,
    peso,
    metaKgPorCabecaDia: metaCab,
    kgPorCabecaPorTrato,
    necessidadeKgDia: needDia,
    necessidadeKg30d: needDia != null ? arredondarKg(needDia * 30) : null,
    mensagemNecessidade,
    custo: {
      completo: custoCompleto,
      custoMedioPorKg,
      custoDia,
      custoCabecaDia,
      custo30d,
      mensagem: mensagemCusto,
    },
    autonomiaProduto,
    autonomiaDieta,
  };
}

export function formatarCustoProjetado(valor: number | null, completo: boolean, vazio = "Custo não disponível"): string {
  if (!completo || valor == null) return vazio;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMetaPlan(modalidade: string, valor?: number | null): string {
  if (modalidade === "ad_libitum") return "Ad libitum";
  if (valor == null) return labelModalidadePlan(modalidade);
  const n = Number(valor);
  if (modalidade === "g_cab_dia") return `${n.toLocaleString("pt-BR")} g/cab/dia`;
  if (modalidade === "kg_cab_dia") return `${n.toLocaleString("pt-BR")} kg/cab/dia`;
  if (modalidade === "pct_pv_dia") return `${n.toLocaleString("pt-BR")}% PV/dia`;
  return String(valor);
}
