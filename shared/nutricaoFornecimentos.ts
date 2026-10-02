import {
  arredondarKg,
  arredondarMoeda,
  custoMedioVigentePorKg,
  kgParaQuantidadeUnidade,
  MSG_FORN_DIETA_EXIGE_PREPARO,
  podeDietaSerFornecidaDiretamente,
  quantidadeParaKg,
} from "./nutricaoDietas";
import {
  mensagemConversaoKg,
  montarSnapshotConversaoKg,
  resolverConversaoParaKg,
  type SnapshotConversaoKg,
} from "./estoqueConversaoKg";
import {
  formatarIdentificacaoCocho,
  type NutricaoCochoRef,
  validarCochoNoFornecimento,
} from "./nutricaoCochos";
import {
  formatarMetaPlan,
  metaKgPorCabecaDia,
  necessidadeKgDia,
  normalizarDataCivil,
  origemNormalizada,
  type NutricaoPlanDietaRef,
  type NutricaoPlanProdutoRef,
} from "./nutricaoPlanejamento";

export { formatarIdentificacaoCocho };

export const NUTRICAO_FORN_ORIGENS = ["produto", "dieta"] as const;
export type NutricaoFornTipoOrigem = (typeof NUTRICAO_FORN_ORIGENS)[number];

export const NUTRICAO_FORN_ORIGEM_OPERACIONAL = ["direta", "batida"] as const;
export type NutricaoFornOrigemOperacional = (typeof NUTRICAO_FORN_ORIGEM_OPERACIONAL)[number];

export const NUTRICAO_FORN_STATUS = ["confirmado", "estornado"] as const;
export type NutricaoFornStatus = (typeof NUTRICAO_FORN_STATUS)[number];

export const NUTRICAO_FORN_TIPO_SAIDA = "Consumo interno";
export const NUTRICAO_FORN_MANEJO = "Fornecimento nutricional";

export const NUTRICAO_FORN_MOTIVOS_ESTORNO = [
  { value: "erro_lancamento", label: "Erro de lançamento" },
  { value: "quantidade_incorreta", label: "Quantidade incorreta" },
  { value: "lote_incorreto", label: "Lote incorreto" },
  { value: "produto_incorreto", label: "Produto ou dieta incorretos" },
  { value: "outro", label: "Outro" },
] as const;

export const MSG_FORN_FAZENDA = "Selecione a fazenda do fornecimento.";
export const MSG_FORN_LOTE = "Selecione o lote do fornecimento.";
export const MSG_FORN_LOTE_FAZENDA = "Este lote não pertence à fazenda selecionada.";
export const MSG_FORN_DATA = "Informe a data do fornecimento.";
export const MSG_FORN_DATA_FUTURA = "A data do fornecimento não pode ser futura.";
export const MSG_FORN_HORA = "Informe a hora no formato HH:MM.";
export const MSG_FORN_QTD = "Informe a quantidade fornecida em kg, maior que zero.";
export const MSG_FORN_ORIGEM = "Escolha produto pronto ou dieta.";
export const MSG_FORN_ORIGEM_AMBOS = "O fornecimento não pode ter produto e dieta ao mesmo tempo.";
export const MSG_FORN_ORIGEM_NENHUM = "Informe um produto pronto ou uma dieta.";
export const MSG_FORN_PRODUTO = "Selecione um produto vinculado a esta fazenda.";
export const MSG_FORN_UNIDADE =
  "Só é possível fornecer produtos em kg, g ou saco com uma única embalagem de massa (ex.: 30 kg/sc).";
export const MSG_FORN_DIETA = "Selecione uma dieta ativa desta fazenda.";
export const MSG_FORN_SALDO = "Saldo insuficiente para confirmar o fornecimento.";
export const MSG_FORN_SALDO_DIETA =
  "Saldo insuficiente em um ou mais ingredientes. Nenhum item será baixado.";
export const MSG_FORN_PLAN = "O planejamento selecionado não é compatível com este fornecimento.";
export const MSG_FORN_OPERACIONAL = "Origem operacional inválida.";
export const MSG_FORN_BATIDA = "Selecione uma batida confirmada com saldo disponível.";
export const MSG_FORN_BATIDA_DIRETA = "Fornecimento direto não pode estar vinculado a uma batida.";
export const MSG_FORN_BATIDA_SALDO = "A quantidade informada é maior que o saldo disponível da batida.";
export const MSG_FORN_BATIDA_ESTORNADA = "Esta batida foi estornada e não pode ser distribuída.";
export const MSG_FORN_BATIDA_DIETA = "A dieta do fornecimento precisa ser a mesma da batida.";
export const MSG_FORN_MOTIVO = "Informe o motivo do estorno.";
export const MSG_FORN_JA_ESTORNADO = "Este fornecimento já foi estornado.";
export const MSG_FORN_NAO_EDITAR = "Fornecimento confirmado não pode ser editado. Use o estorno.";
export const MSG_FORN_NAO_ENCONTRADO = "Fornecimento não encontrado.";
export const MSG_FORN_LOTE_VAZIO = "Este lote não possui animais ativos no momento.";
export const MSG_FORN_SEM_PLAN = "Sem planejamento nutricional ativo";

export type NutricaoFornInput = {
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
  observacoes?: string | null;
};

export type NutricaoFornEstoqueRef = NutricaoPlanProdutoRef & {
  estoqueId: number;
};

export type NutricaoFornBatidaRef = {
  id: number;
  userId: number;
  fazendaId: number;
  dietaId: number;
  dietaNomeSnapshot: string;
  quantidadePreparadaKg: number;
  quantidadeDistribuidaKg: number;
  saldoDisponivelKg: number;
  status: string;
  custoCompleto: boolean;
  custoPorKgSnapshot: number | null;
  custoTotalSnapshot: number | null;
};

export type NutricaoFornPlanejamentoRef = {
  id: number;
  fazendaId: number;
  loteId: number;
  tipoOrigem: string;
  produtoId?: number | null;
  dietaId?: number | null;
  modalidadeMeta: string;
  valorMeta?: number | null;
  status: string;
  dataInicio: string;
  dataFim?: string | null;
};

export function normalizarHoraFornecimento(value?: string | null): string | null {
  if (value == null || String(value).trim() === "") return null;
  const s = String(value).trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? `${m[1]}:${m[2]}` : null;
}

export function formatarDataHoraFornecimento(data: string, hora?: string | null): string {
  const iso = normalizarDataCivil(data);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const h = normalizarHoraFornecimento(hora ?? null);
  return h ? `${d}/${m}/${y} ${h}` : `${d}/${m}/${y}`;
}

export function oferecidoPorCabeca(quantidadeKg: number, populacao: number): number | null {
  if (!(populacao > 0) || !(quantidadeKg >= 0)) return null;
  return arredondarKg(quantidadeKg / populacao);
}

function formatarNumeroOferecidoCabeca(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/**
 * Só apresentação. Usa o planejamentoId e a modalidade gravados no fornecimento.
 * Não busca planejamento vigente e não converte o total do lote.
 */
export function formatarOferecidoPorCabeca(input: {
  quantidadeKg: number;
  populacao: number;
  planejamentoId?: number | null;
  modalidadeSnapshot?: string | null;
}): string {
  const kgCab = oferecidoPorCabeca(input.quantidadeKg, input.populacao);
  if (kgCab == null) return "—";
  const mostrarGramas =
    fornecimentoTemVinculoPlanejamento(input.planejamentoId)
    && input.modalidadeSnapshot === "g_cab_dia";
  if (mostrarGramas) {
    return `${formatarNumeroOferecidoCabeca(arredondarKg(kgCab * 1000))} g`;
  }
  return `${formatarNumeroOferecidoCabeca(kgCab)} kg`;
}

export function validarFornecimentoInput(
  input: NutricaoFornInput,
  ctx: {
    lote?: { id: number; fazendaId: number | null } | null;
    produto?: NutricaoFornEstoqueRef | null;
    dieta?: NutricaoPlanDietaRef | null;
    planejamento?: NutricaoFornPlanejamentoRef | null;
    cocho?: NutricaoCochoRef | null;
    batida?: NutricaoFornBatidaRef | null;
    hojeISO: string;
  },
): { ok: true } | { ok: false; message: string } {
  if (!(input.fazendaId > 0)) return { ok: false, message: MSG_FORN_FAZENDA };
  if (!(input.loteId > 0) || !ctx.lote) return { ok: false, message: MSG_FORN_LOTE };
  if (ctx.lote.fazendaId !== input.fazendaId) return { ok: false, message: MSG_FORN_LOTE_FAZENDA };

  const data = normalizarDataCivil(input.data);
  if (!data) return { ok: false, message: MSG_FORN_DATA };
  if (data > ctx.hojeISO) return { ok: false, message: MSG_FORN_DATA_FUTURA };
  if (input.hora && !normalizarHoraFornecimento(input.hora)) return { ok: false, message: MSG_FORN_HORA };
  if (!(input.quantidadeFornecidaKg > 0)) return { ok: false, message: MSG_FORN_QTD };

  const op = input.origemOperacional || "direta";
  if (op !== "direta" && op !== "batida") return { ok: false, message: MSG_FORN_OPERACIONAL };

  if (!NUTRICAO_FORN_ORIGENS.includes(input.tipoOrigem as NutricaoFornTipoOrigem)) {
    return { ok: false, message: MSG_FORN_ORIGEM };
  }
  if (Number(input.produtoId) > 0 && Number(input.dietaId) > 0) {
    return { ok: false, message: MSG_FORN_ORIGEM_AMBOS };
  }
  const origem = origemNormalizada(input);
  if (origem.tipoOrigem === "produto" && !origem.produtoId) return { ok: false, message: MSG_FORN_ORIGEM_NENHUM };
  if (origem.tipoOrigem === "dieta" && !origem.dietaId) return { ok: false, message: MSG_FORN_ORIGEM_NENHUM };

  if (op === "batida") {
    if (!(Number(input.batidaId) > 0) || !ctx.batida) return { ok: false, message: MSG_FORN_BATIDA };
    if (ctx.batida.status !== "confirmado") return { ok: false, message: MSG_FORN_BATIDA_ESTORNADA };
    if (ctx.batida.fazendaId !== input.fazendaId) return { ok: false, message: MSG_FORN_BATIDA };
    if (origem.tipoOrigem !== "dieta" || Number(origem.dietaId) !== Number(ctx.batida.dietaId)) {
      return { ok: false, message: MSG_FORN_BATIDA_DIETA };
    }
    if (input.quantidadeFornecidaKg > ctx.batida.saldoDisponivelKg + 1e-9) {
      return { ok: false, message: MSG_FORN_BATIDA_SALDO };
    }
  } else {
    if (Number(input.batidaId) > 0) return { ok: false, message: MSG_FORN_BATIDA_DIRETA };
    if (origem.tipoOrigem === "produto") {
      if (!ctx.produto?.vinculadoFazenda) return { ok: false, message: MSG_FORN_PRODUTO };
      const resolucao = resolverConversaoParaKg(ctx.produto.unidade, ctx.produto.embalagens);
      if (!resolucao.ok) return { ok: false, message: mensagemConversaoKg(resolucao) };
    }
    if (origem.tipoOrigem === "dieta") {
      if (!ctx.dieta || ctx.dieta.fazendaId !== input.fazendaId || ctx.dieta.status !== "ativa") {
        return { ok: false, message: MSG_FORN_DIETA };
      }
      if (!podeDietaSerFornecidaDiretamente(ctx.dieta.formaUso)) {
        return { ok: false, message: MSG_FORN_DIETA_EXIGE_PREPARO };
      }
    }
  }

  if (input.planejamentoId) {
    const plan = ctx.planejamento;
    if (!plan || plan.id !== input.planejamentoId) return { ok: false, message: MSG_FORN_PLAN };
    if (plan.fazendaId !== input.fazendaId || plan.loteId !== input.loteId) {
      return { ok: false, message: MSG_FORN_PLAN };
    }
    if (plan.tipoOrigem !== origem.tipoOrigem) return { ok: false, message: MSG_FORN_PLAN };
    if (origem.tipoOrigem === "produto" && Number(plan.produtoId) !== Number(origem.produtoId)) {
      return { ok: false, message: MSG_FORN_PLAN };
    }
    if (origem.tipoOrigem === "dieta" && Number(plan.dietaId) !== Number(origem.dietaId)) {
      return { ok: false, message: MSG_FORN_PLAN };
    }
    if (!planejamentoVigenteNaData(plan, data)) return { ok: false, message: MSG_FORN_PLAN };
  }

  const cochoCheck = validarCochoNoFornecimento(input, ctx.cocho);
  if (!cochoCheck.ok) return cochoCheck;

  return { ok: true };
}

export type BaixaPrevista = {
  produtoId: number;
  estoqueId: number;
  nome: string;
  unidade: string | null;
  quantidadeKg: number;
  quantidadeUnidade: number;
  saldoUnidade: number;
  saldoAposUnidade: number;
  suficiente: boolean;
  custoUnitarioPorKg: number | null;
  custoTotal: number | null;
  custoConhecido: boolean;
  proporcao: number | null;
  snapshotConversao: SnapshotConversaoKg | null;
};

export function montarBaixasProduto(
  produto: NutricaoFornEstoqueRef,
  quantidadeKg: number,
): BaixaPrevista {
  const qtdUn = kgParaQuantidadeUnidade(quantidadeKg, produto.unidade, produto.embalagens) ?? 0;
  const saldo = Number(produto.quantidade ?? 0);
  const custoKg = custoMedioVigentePorKg(
    produto.valorUnitario ?? null,
    produto.unidade ?? "kg",
    produto.embalagens,
  );
  const quantidadeKgArred = arredondarKg(quantidadeKg);
  return {
    produtoId: produto.produtoId,
    estoqueId: produto.estoqueId,
    nome: produto.nome,
    unidade: produto.unidade ?? null,
    quantidadeKg: quantidadeKgArred,
    quantidadeUnidade: qtdUn,
    saldoUnidade: saldo,
    saldoAposUnidade: arredondarQuantidadeBaixa(saldo - qtdUn),
    suficiente: produto.controlarSaldo === false ? false : saldo + 1e-9 >= qtdUn,
    custoUnitarioPorKg: custoKg,
    custoTotal: custoKg != null ? arredondarMoeda(quantidadeKg * custoKg) : null,
    custoConhecido: custoKg != null,
    proporcao: 1,
    snapshotConversao: montarSnapshotConversaoKg({
      quantidadeEstoque: -Math.abs(qtdUn),
      unidadeEstoque: produto.unidade,
      embalagens: produto.embalagens,
    }),
  };
}

function arredondarQuantidadeBaixa(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

export function montarBaixasDieta(
  dieta: NutricaoPlanDietaRef,
  produtosPorId: Map<number, NutricaoFornEstoqueRef>,
  quantidadeKg: number,
): { baixas: BaixaPrevista[]; bloqueado: boolean; motivo: string | null } {
  const base = dieta.baseQuantidade;
  if (!(base > 0) || dieta.ingredientes.length === 0) {
    return { baixas: [], bloqueado: true, motivo: MSG_FORN_DIETA };
  }
  let motivoConversao: string | null = null;
  const baixas = dieta.ingredientes.map(ing => {
    const fracao = ing.quantidadeKg / base;
    const needKg = arredondarKg(quantidadeKg * fracao);
    const produto = produtosPorId.get(ing.produtoId);
    if (!produto) {
      return {
        produtoId: ing.produtoId,
        estoqueId: 0,
        nome: `Produto ${ing.produtoId}`,
        unidade: null,
        quantidadeKg: needKg,
        quantidadeUnidade: 0,
        saldoUnidade: 0,
        saldoAposUnidade: 0,
        suficiente: false,
        custoUnitarioPorKg: null,
        custoTotal: null,
        custoConhecido: false,
        proporcao: arredondarKg(fracao),
        snapshotConversao: null,
      };
    }
    const resolucao = resolverConversaoParaKg(produto.unidade, produto.embalagens);
    if (!resolucao.ok) {
      motivoConversao = motivoConversao ?? mensagemConversaoKg(resolucao);
    }
    const linha = montarBaixasProduto(produto, needKg);
    return { ...linha, proporcao: arredondarKg(fracao) };
  });
  if (motivoConversao) return { baixas, bloqueado: true, motivo: motivoConversao };
  const bloqueado = baixas.some(b => !b.suficiente);
  return { baixas, bloqueado, motivo: bloqueado ? MSG_FORN_SALDO_DIETA : null };
}

export type PreviewFornecimento = {
  animaisAtuais: number;
  loteVazio: boolean;
  avisoLoteVazio: string | null;
  quantidadeKg: number;
  oferecidoPorCabeca: number | null;
  baixas: BaixaPrevista[];
  podeConfirmar: boolean;
  motivoBloqueio: string | null;
  custo: {
    completo: boolean;
    custoTotal: number | null;
    custoPorKg: number | null;
    mensagem: string | null;
  };
  planejamento: {
    vinculado: boolean;
    metaLabel: string | null;
    modalidade: string | null;
    necessidadeKg: number | null;
    diferencaKg: number | null;
    adLibitum: boolean;
  } | null;
};

export function calcularPreviewFornecimento(input: {
  quantidadeKg: number;
  tipoOrigem: string;
  animalIds: number[];
  produto?: NutricaoFornEstoqueRef | null;
  dieta?: NutricaoPlanDietaRef | null;
  produtosPorId?: Map<number, NutricaoFornEstoqueRef>;
  planejamento?: NutricaoFornPlanejamentoRef | null;
  pesoMedioKg?: number | null;
  origemOperacional?: string | null;
  batida?: NutricaoFornBatidaRef | null;
}): PreviewFornecimento {
  const animaisAtuais = input.animalIds.length;
  const loteVazio = animaisAtuais === 0;
  const op = input.origemOperacional || "direta";
  let baixas: BaixaPrevista[] = [];
  let motivoBloqueio: string | null = null;
  let completo = false;
  let custoTotal: number | null = null;
  let custoPorKg: number | null = null;

  if (op === "batida") {
    const batida = input.batida;
    if (!batida) {
      motivoBloqueio = MSG_FORN_BATIDA;
    } else if (batida.status !== "confirmado") {
      motivoBloqueio = MSG_FORN_BATIDA_ESTORNADA;
    } else if (input.quantidadeKg > batida.saldoDisponivelKg + 1e-9) {
      motivoBloqueio = MSG_FORN_BATIDA_SALDO;
    }
    if (batida?.custoCompleto && batida.custoPorKgSnapshot != null) {
      completo = true;
      custoPorKg = batida.custoPorKgSnapshot;
      custoTotal = arredondarMoeda(input.quantidadeKg * batida.custoPorKgSnapshot);
    }
  } else if (input.tipoOrigem === "produto") {
    if (!input.produto) {
      motivoBloqueio = MSG_FORN_PRODUTO;
    } else {
      const resolucao = resolverConversaoParaKg(input.produto.unidade, input.produto.embalagens);
      if (!resolucao.ok) {
        motivoBloqueio = mensagemConversaoKg(resolucao);
      } else {
        baixas = [montarBaixasProduto(input.produto, input.quantidadeKg)];
        if (!baixas[0]!.suficiente) motivoBloqueio = MSG_FORN_SALDO;
      }
    }
  } else {
    if (input.dieta && !podeDietaSerFornecidaDiretamente(input.dieta.formaUso)) {
      motivoBloqueio = MSG_FORN_DIETA_EXIGE_PREPARO;
    } else {
      const out = input.dieta
        ? montarBaixasDieta(input.dieta, input.produtosPorId ?? new Map(), input.quantidadeKg)
        : { baixas: [], bloqueado: true, motivo: MSG_FORN_DIETA };
      baixas = out.baixas;
      if (out.bloqueado) motivoBloqueio = out.motivo;
    }
  }

  if (op !== "batida") {
    const conhecidos = baixas.filter(b => b.custoConhecido);
    completo = baixas.length > 0 && baixas.every(b => b.custoConhecido);
    custoTotal = completo
      ? arredondarMoeda(conhecidos.reduce((acc, b) => acc + (b.custoTotal ?? 0), 0))
      : null;
    custoPorKg = completo && input.quantidadeKg > 0 && custoTotal != null
      ? arredondarMoeda(custoTotal / input.quantidadeKg)
      : null;
  }

  let planejamento: PreviewFornecimento["planejamento"] = null;
  if (input.planejamento) {
    const adLibitum = input.planejamento.modalidadeMeta === "ad_libitum";
    const metaCab = metaKgPorCabecaDia({
      modalidadeMeta: input.planejamento.modalidadeMeta,
      valorMeta: input.planejamento.valorMeta,
      pesoMedioKg: input.pesoMedioKg,
    });
    const necessidadeKg = adLibitum ? null : necessidadeKgDia(metaCab, animaisAtuais);
    planejamento = {
      vinculado: true,
      metaLabel: formatarMetaPlan(input.planejamento.modalidadeMeta, input.planejamento.valorMeta),
      modalidade: input.planejamento.modalidadeMeta,
      necessidadeKg,
      diferencaKg: necessidadeKg != null ? arredondarKg(input.quantidadeKg - necessidadeKg) : null,
      adLibitum,
    };
  }

  return {
    animaisAtuais,
    loteVazio,
    avisoLoteVazio: loteVazio ? MSG_FORN_LOTE_VAZIO : null,
    quantidadeKg: arredondarKg(input.quantidadeKg),
    oferecidoPorCabeca: oferecidoPorCabeca(input.quantidadeKg, animaisAtuais),
    baixas,
    podeConfirmar: motivoBloqueio == null && input.quantidadeKg > 0,
    motivoBloqueio,
    custo: {
      completo,
      custoTotal,
      custoPorKg,
      mensagem: completo ? null : "Custo incompleto",
    },
    planejamento,
  };
}

export function labelMotivoEstornoForn(value: string | null | undefined): string {
  return NUTRICAO_FORN_MOTIVOS_ESTORNO.find(m => m.value === value)?.label ?? value ?? "—";
}

export const ROTULO_FORN_PLAN_VINCULADO = "Vinculado";
export const ROTULO_FORN_PLAN_SEM = "Sem planejamento";

/** Só o planejamentoId gravado no fornecimento. Não infere lote/produto/data. */
export function fornecimentoTemVinculoPlanejamento(planejamentoId?: number | null): boolean {
  return Number(planejamentoId) > 0;
}

export function rotuloVinculoPlanejamentoForn(planejamentoId?: number | null): string {
  return fornecimentoTemVinculoPlanejamento(planejamentoId)
    ? ROTULO_FORN_PLAN_VINCULADO
    : ROTULO_FORN_PLAN_SEM;
}

export function labelOrigemOperacionalForn(origem?: string | null): "Batida" | "Direto" {
  return origem === "batida" ? "Batida" : "Direto";
}

export function tooltipVinculoPlanejamentoForn(input: {
  planejamentoId?: number | null;
  loteNome?: string | null;
  planejamentoMetaSnapshot?: string | null;
}): string | undefined {
  if (!fornecimentoTemVinculoPlanejamento(input.planejamentoId)) return undefined;
  const partes: string[] = [];
  if (input.loteNome) partes.push(`Planejamento do lote ${input.loteNome}`);
  if (input.planejamentoMetaSnapshot) partes.push(`Meta: ${input.planejamentoMetaSnapshot}`);
  return partes.length ? partes.join(" · ") : undefined;
}

export function planejamentoVigenteNaData(
  plan: Pick<NutricaoFornPlanejamentoRef, "status" | "dataInicio" | "dataFim">,
  dataISO: string,
): boolean {
  if (plan.status === "cancelado") return false;
  const data = normalizarDataCivil(dataISO);
  const ini = normalizarDataCivil(plan.dataInicio);
  const fim = normalizarDataCivil(plan.dataFim ?? null);
  if (!data || !ini) return false;
  if (data < ini) return false;
  if (fim && data > fim) return false;
  if (plan.status === "encerrado" && !fim) return false;
  return true;
}

export { quantidadeParaKg, kgParaQuantidadeUnidade };
