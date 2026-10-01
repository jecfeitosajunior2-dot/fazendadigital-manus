import {
  arredondarKg,
  arredondarMoeda,
  MSG_DIETA_PRODUTO_FAZENDA,
} from "./nutricaoDietas";
import { mensagemConversaoKg, resolverConversaoParaKg } from "./estoqueConversaoKg";
import {
  montarBaixasDieta,
  normalizarHoraFornecimento,
  type BaixaPrevista,
  type NutricaoFornEstoqueRef,
} from "./nutricaoFornecimentos";
import {
  normalizarDataCivil,
  type NutricaoPlanDietaRef,
} from "./nutricaoPlanejamento";

export { formatarDataHoraFornecimento as formatarDataHoraBatida } from "./nutricaoFornecimentos";
export { normalizarHoraFornecimento };

/**
 * Distinção de custo (Etapa 5):
 * - CUSTO INCORRIDO: nasce na Batida confirmada (baixa dos ingredientes).
 * - CUSTO ALOCADO AO LOTE: no Fornecimento originado da Batida (proporcional ao kg
 *   distribuído). Não é nova despesa nem nova baixa. Dashboards futuros NÃO podem
 *   somar os dois como duas despesas.
 */
export const NUTRICAO_BATIDA_STATUS = ["confirmado", "estornado"] as const;
export type NutricaoBatidaStatus = (typeof NUTRICAO_BATIDA_STATUS)[number];

export const NUTRICAO_BATIDA_SITUACOES = ["disponivel", "parcial", "total"] as const;
export type NutricaoBatidaSituacao = (typeof NUTRICAO_BATIDA_SITUACOES)[number];

export const NUTRICAO_BATIDA_TIPO_SAIDA = "Consumo interno";
export const NUTRICAO_BATIDA_MANEJO = "Batida nutricional";

export const NUTRICAO_BATIDA_MOTIVOS_ESTORNO = [
  { value: "erro_lancamento", label: "Erro de lançamento" },
  { value: "quantidade_incorreta", label: "Quantidade incorreta" },
  { value: "dieta_incorreta", label: "Dieta incorreta" },
  { value: "outro", label: "Outro" },
] as const;

export const MSG_BATIDA_FAZENDA = "Selecione a fazenda da batida.";
export const MSG_BATIDA_DIETA = "Selecione uma dieta ativa desta fazenda.";
export const MSG_BATIDA_DIETA_FAZENDA = "A dieta precisa pertencer à mesma fazenda da batida.";
export const MSG_BATIDA_DATA = "Informe a data da batida.";
export const MSG_BATIDA_DATA_FUTURA = "A data da batida não pode ser futura.";
export const MSG_BATIDA_HORA = "Informe a hora no formato HH:MM.";
export const MSG_BATIDA_QTD = "Informe a quantidade a preparar em kg, maior que zero.";
export const MSG_BATIDA_FORMULACAO =
  "A formulação desta dieta não permite um cálculo seguro da batida.";
export const MSG_BATIDA_SALDO =
  "Saldo insuficiente em um ou mais ingredientes. Nenhum item será baixado.";
export const MSG_BATIDA_PRODUTO = "Um ou mais ingredientes não estão vinculados a esta fazenda.";
export const MSG_BATIDA_NAO_ENCONTRADA = "Batida não encontrada.";
export const MSG_BATIDA_MOTIVO = "Informe o motivo do estorno.";
export const MSG_BATIDA_JA_ESTORNADA = "Esta batida já foi estornada.";
export const MSG_BATIDA_COM_FORN =
  "Não é possível estornar esta batida porque há fornecimentos confirmados vinculados.";
export const MSG_BATIDA_ESTORNADA_DIST =
  "Esta batida foi estornada e não pode ser distribuída.";

export type NutricaoBatidaInput = {
  fazendaId: number;
  dietaId: number;
  data: string;
  hora?: string | null;
  quantidadePreparadaKg: number;
  observacoes?: string | null;
};

export type NutricaoBatidaFornecimentoRef = {
  quantidadeFornecidaKg: number;
  status: string;
};

export function quantidadePreparadaValida(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function calcularQuantidadeDistribuidaKg(
  fornecimentos: NutricaoBatidaFornecimentoRef[],
): number {
  const soma = fornecimentos
    .filter(f => f.status === "confirmado")
    .reduce((acc, f) => acc + Number(f.quantidadeFornecidaKg || 0), 0);
  return arredondarKg(soma);
}

export function calcularSaldoBatida(preparadaKg: number, distribuidaKg: number): number {
  return arredondarKg(Math.max(0, Number(preparadaKg || 0) - Number(distribuidaKg || 0)));
}

export function situacaoDistribuicaoBatida(
  preparadaKg: number,
  distribuidaKg: number,
): NutricaoBatidaSituacao {
  if (!(preparadaKg > 0) || distribuidaKg <= 1e-9) return "disponivel";
  if (distribuidaKg + 1e-9 >= preparadaKg) return "total";
  return "parcial";
}

export function labelSituacaoBatida(situacao: NutricaoBatidaSituacao): string {
  if (situacao === "parcial") return "Parcialmente distribuída";
  if (situacao === "total") return "Totalmente distribuída";
  return "Disponível";
}

export function labelStatusBatida(status: string): string {
  return status === "estornado" ? "Estornada" : "Confirmada";
}

export function podeEstornarBatida(
  status: string,
  fornecimentosConfirmados: number,
): { ok: true } | { ok: false; message: string } {
  if (status === "estornado") return { ok: false, message: MSG_BATIDA_JA_ESTORNADA };
  if (fornecimentosConfirmados > 0) return { ok: false, message: MSG_BATIDA_COM_FORN };
  return { ok: true };
}

export function batidaDisponivelParaDistribuicao(input: {
  status: string;
  saldoDisponivelKg: number;
}): boolean {
  return input.status === "confirmado" && input.saldoDisponivelKg > 1e-9;
}

export function escalarIngredientesDieta(
  dieta: NutricaoPlanDietaRef,
  quantidadePreparadaKg: number,
): { produtoId: number; quantidadeKg: number; proporcao: number }[] {
  const base = dieta.baseQuantidade;
  if (!(base > 0) || !quantidadePreparadaValida(quantidadePreparadaKg)) return [];
  return dieta.ingredientes.map(ing => {
    const proporcao = ing.quantidadeKg / base;
    return {
      produtoId: ing.produtoId,
      quantidadeKg: arredondarKg(quantidadePreparadaKg * proporcao),
      proporcao: arredondarKg(proporcao),
    };
  });
}

export function validarFormulacaoDietaParaBatida(
  dieta: NutricaoPlanDietaRef | null | undefined,
  fazendaId: number,
  produtosPorId: Map<number, NutricaoFornEstoqueRef>,
): { ok: true } | { ok: false; message: string } {
  if (!dieta || dieta.status !== "ativa") return { ok: false, message: MSG_BATIDA_DIETA };
  if (dieta.fazendaId !== fazendaId) return { ok: false, message: MSG_BATIDA_DIETA_FAZENDA };
  if (!(dieta.baseQuantidade > 0) || dieta.ingredientes.length === 0) {
    return { ok: false, message: MSG_BATIDA_FORMULACAO };
  }
  const soma = dieta.ingredientes.reduce((acc, i) => acc + Number(i.quantidadeKg || 0), 0);
  if (!(soma > 0)) return { ok: false, message: MSG_BATIDA_FORMULACAO };
  for (const ing of dieta.ingredientes) {
    if (!(ing.quantidadeKg > 0) || !Number.isFinite(ing.quantidadeKg)) {
      return { ok: false, message: MSG_BATIDA_FORMULACAO };
    }
    const produto = produtosPorId.get(ing.produtoId);
    if (!produto?.vinculadoFazenda) {
      return { ok: false, message: produto ? MSG_BATIDA_PRODUTO : MSG_DIETA_PRODUTO_FAZENDA };
    }
    const resolucao = resolverConversaoParaKg(produto.unidade, produto.embalagens);
    if (!resolucao.ok) return { ok: false, message: mensagemConversaoKg(resolucao) };
  }
  return { ok: true };
}

export function validarBatidaInput(
  input: NutricaoBatidaInput,
  ctx: {
    dieta?: NutricaoPlanDietaRef | null;
    produtosPorId?: Map<number, NutricaoFornEstoqueRef>;
    hojeISO: string;
  },
): { ok: true } | { ok: false; message: string } {
  if (!(input.fazendaId > 0)) return { ok: false, message: MSG_BATIDA_FAZENDA };
  const data = normalizarDataCivil(input.data);
  if (!data) return { ok: false, message: MSG_BATIDA_DATA };
  if (data > ctx.hojeISO) return { ok: false, message: MSG_BATIDA_DATA_FUTURA };
  if (input.hora && !normalizarHoraFornecimento(input.hora)) {
    return { ok: false, message: MSG_BATIDA_HORA };
  }
  if (!quantidadePreparadaValida(input.quantidadePreparadaKg)) {
    return { ok: false, message: MSG_BATIDA_QTD };
  }
  if (!(input.dietaId > 0) || !ctx.dieta) return { ok: false, message: MSG_BATIDA_DIETA };
  return validarFormulacaoDietaParaBatida(
    ctx.dieta,
    input.fazendaId,
    ctx.produtosPorId ?? new Map(),
  );
}

export type PreviewBatida = {
  quantidadePreparadaKg: number;
  dietaNome: string;
  baixas: BaixaPrevista[];
  podeConfirmar: boolean;
  motivoBloqueio: string | null;
  custo: {
    completo: boolean;
    custoTotal: number | null;
    custoPorKg: number | null;
    mensagem: string | null;
  };
};

export function calcularPreviewBatida(input: {
  quantidadePreparadaKg: number;
  dieta?: NutricaoPlanDietaRef | null;
  produtosPorId?: Map<number, NutricaoFornEstoqueRef>;
}): PreviewBatida {
  const dieta = input.dieta ?? null;
  const produtosPorId = input.produtosPorId ?? new Map();
  const quantidade = input.quantidadePreparadaKg;
  if (!quantidadePreparadaValida(quantidade) || !dieta) {
    return {
      quantidadePreparadaKg: Number.isFinite(quantidade) ? arredondarKg(quantidade) : 0,
      dietaNome: dieta?.nome ?? "",
      baixas: [],
      podeConfirmar: false,
      motivoBloqueio: !quantidadePreparadaValida(quantidade) ? MSG_BATIDA_QTD : MSG_BATIDA_DIETA,
      custo: { completo: false, custoTotal: null, custoPorKg: null, mensagem: "Custo incompleto" },
    };
  }

  const form = validarFormulacaoDietaParaBatida(dieta, dieta.fazendaId, produtosPorId);
  if (!form.ok) {
    return {
      quantidadePreparadaKg: arredondarKg(quantidade),
      dietaNome: dieta.nome,
      baixas: [],
      podeConfirmar: false,
      motivoBloqueio: form.message,
      custo: { completo: false, custoTotal: null, custoPorKg: null, mensagem: "Custo incompleto" },
    };
  }

  const out = montarBaixasDieta(dieta, produtosPorId, quantidade);
  const motivoBloqueio = out.bloqueado ? (out.motivo ?? MSG_BATIDA_SALDO) : null;
  const conhecidos = out.baixas.filter(b => b.custoConhecido);
  const completo = out.baixas.length > 0 && out.baixas.every(b => b.custoConhecido);
  const custoTotal = completo
    ? arredondarMoeda(conhecidos.reduce((acc, b) => acc + (b.custoTotal ?? 0), 0))
    : null;

  return {
    quantidadePreparadaKg: arredondarKg(quantidade),
    dietaNome: dieta.nome,
    baixas: out.baixas,
    podeConfirmar: motivoBloqueio == null,
    motivoBloqueio,
    custo: {
      completo,
      custoTotal,
      custoPorKg: completo && quantidade > 0 && custoTotal != null
        ? arredondarMoeda(custoTotal / quantidade)
        : null,
      mensagem: completo ? null : "Custo incompleto",
    },
  };
}

export function labelMotivoEstornoBatida(value: string | null | undefined): string {
  return NUTRICAO_BATIDA_MOTIVOS_ESTORNO.find(m => m.value === value)?.label ?? value ?? "—";
}

export function alocarCustoBatidaNoFornecimento(
  batida: { custoCompleto: boolean; custoPorKgSnapshot?: number | null },
  quantidadeKg: number,
): {
  completo: boolean;
  custoTotal: number | null;
  custoPorKg: number | null;
  mensagem: string | null;
} {
  if (!batida.custoCompleto || batida.custoPorKgSnapshot == null || !Number.isFinite(batida.custoPorKgSnapshot)) {
    return { completo: false, custoTotal: null, custoPorKg: null, mensagem: "Custo incompleto" };
  }
  return {
    completo: true,
    custoTotal: arredondarMoeda(quantidadeKg * batida.custoPorKgSnapshot),
    custoPorKg: batida.custoPorKgSnapshot,
    mensagem: null,
  };
}
