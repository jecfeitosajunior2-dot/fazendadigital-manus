/**
 * Regras do Painel de Controle: escopo por fazenda, rebanho ativo e alertas.
 * Os cálculos ficam aqui para o servidor e os testes usarem a mesma conta.
 */

import { produtoControlaSaldo } from "./estoqueControle";
import { valorPatrimonialExibicao } from "./estoqueCapital";
import {
  MSG_RELATORIO_SALDO_CONSOLIDADO,
  MSG_RELATORIO_TRANSFERENCIA_FORA_RESULTADO,
} from "./financeiroRelatoriosV2";

export const MSG_PAINEL_FAZENDA_NEGADA = "Você não tem acesso a esta fazenda.";

export const PAINEL_STORAGE_KEY = "fd-painel-controle";

export const PAINEL_COMERCIAL_RECENTES = 5;
export const ROTULO_RESULTADO_MES_ATUAL = "Resultado realizado — mês atual";
export const MSG_PAINEL_SEM_ATRIBUICAO_TODAS =
  "Há títulos ou liquidações sem fazenda. Eles entram no consolidado e não em uma propriedade.";
export const MSG_PAINEL_SEM_ATRIBUICAO_FILTRO =
  "Há valores sem fazenda que não entram neste recorte.";

export const CONSULTAS_PAINEL_SUBSTITUIDAS = [
  "trpc.animais.list",
  "trpc.estoque.list",
  "trpc.estoque.listMovimentacoes",
  "trpc.saude.list",
  "trpc.reproducao.list",
  "trpc.manutencoes.list",
  "trpc.pastos.listWithDetails",
  "trpc.fazendas.list",
  "trpc.dashboard.stats",
] as const;

export type PainelFazendaRef = { id: number; nome: string; area: number };

export type PainelAlertaItem = {
  texto: string;
  detalhe: string;
  animalId?: number;
  vencido?: boolean;
};

export type PainelRebanho = {
  total: number;
  machos: number;
  femeas: number;
  pesoTotal: number;
  pesoMedio: number;
  comPeso: number;
  composicao: { name: string; value: number }[];
  idades: { name: string; value: number }[];
};

export type PainelEstoque = {
  valorTotal: number;
  totalProdutos: number;
  baixo: PainelAlertaItem[];
};

export type PainelAlertas = {
  estoqueBaixo: PainelAlertaItem[];
  validade: PainelAlertaItem[];
  sanidade: PainelAlertaItem[];
  partos: PainelAlertaItem[];
  manut: PainelAlertaItem[];
  pendentes: PainelAlertaItem[];
  total: number;
};

export type PainelOcupacao = {
  id: number;
  nome: string;
  qtdAnimais: number;
  capacidade: number | null;
  pctOcupacao: number | null;
};

export type PainelSaudeRecente = {
  id: number;
  animalId: number;
  tipo: string;
  medicamento: string | null;
  dataRegistro: string | null;
};

export type PainelFinanceiro = {
  disponivel: boolean;
  saldoCaixaBancos: number;
  saldoCaixaConsolidado: true;
  avisoCaixa: string;
  totalAReceber: number;
  totalAPagar: number;
  titulosFiltradosPorFazenda: boolean;
  avisoTitulos: string | null;
  resultadoRealizado: number;
  resultadoFiltradoPorFazenda: boolean;
  rotuloResultado: string;
  periodoDe: string;
  periodoAte: string;
  avisoResultado: string;
  avisoSemAtribuicao: string | null;
  temRegistrosSemFazenda: boolean;
};

export type PainelOperacaoRecente = {
  id: number;
  tipo: "compra" | "venda";
  data: string | null;
  parceiro: string;
  valor: number | null;
};

export type PainelComercial = {
  compras: PainelOperacaoRecente[];
  vendas: PainelOperacaoRecente[];
};

export type PainelOverview = {
  fazendas: PainelFazendaRef[];
  fazendaSelecionadaId: number | null;
  totalLotes: number;
  totalPastos: number;
  areaTotal: number;
  rebanho: PainelRebanho;
  estoque: PainelEstoque;
  alertas: PainelAlertas;
  ocupacao: PainelOcupacao[];
  saudeRecente: PainelSaudeRecente[];
  financeiro: PainelFinanceiro;
  comercial: PainelComercial;
};

export type EscopoFazendasPainel =
  | { ok: true; fazendaIds: number[]; fazendas: PainelFazendaRef[]; fazendaSelecionadaId: number | null }
  | { ok: false; motivo: "nao_autorizada" };

export function resolverEscopoFazendasPainel(input: {
  fazendaId?: number | null;
  fazendasAutorizadas: readonly PainelFazendaRef[];
}): EscopoFazendasPainel {
  const autorizadas = input.fazendasAutorizadas.filter(f => Number.isFinite(f.id) && f.id > 0);
  const solicitada = input.fazendaId;
  if (solicitada == null || !Number.isFinite(solicitada) || solicitada <= 0) {
    return {
      ok: true,
      fazendaIds: autorizadas.map(f => f.id),
      fazendas: [...autorizadas],
      fazendaSelecionadaId: null,
    };
  }
  const escolhida = autorizadas.find(f => f.id === solicitada);
  if (!escolhida) return { ok: false, motivo: "nao_autorizada" };
  return {
    ok: true,
    fazendaIds: [escolhida.id],
    fazendas: [...autorizadas],
    fazendaSelecionadaId: escolhida.id,
  };
}

export function normalizarFazendaPainelPersistida(
  valor: string | null | undefined,
  fazendasAutorizadas: readonly { id: number }[],
): number | null {
  const id = Number(String(valor ?? "").trim());
  if (!Number.isFinite(id) || id <= 0) return null;
  return fazendasAutorizadas.some(f => f.id === id) ? id : null;
}

/** Peso atual do Rebanho: só número positivo já gravado. Sem invenção. */
export function pesoAtualRebanho(peso: unknown): number | null {
  if (peso == null || peso === "") return null;
  const n = typeof peso === "number" ? peso : Number(String(peso).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function animalNasFazendasPainel(
  animal: { fazendaId?: number | null; loteId?: number | null },
  fazendaIds: readonly number[],
  loteFazendaById: ReadonlyMap<number, number | null>,
): boolean {
  const autorizadas = new Set(fazendaIds.filter(id => id > 0));
  if (autorizadas.size === 0) return false;
  if (animal.fazendaId != null && autorizadas.has(Number(animal.fazendaId))) return true;
  if (animal.loteId != null) {
    const fid = loteFazendaById.get(Number(animal.loteId));
    return fid != null && autorizadas.has(fid);
  }
  return false;
}

function parseDataPainel(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function diasAtePainel(value: string | Date | null | undefined, hoje = new Date()): number | null {
  const d = parseDataPainel(value);
  if (!d) return null;
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  const alvo = new Date(d);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - base.getTime()) / 86_400_000);
}

export function prazoRelativoPainel(value: string | Date | null | undefined, hoje = new Date()): string {
  const dias = diasAtePainel(value, hoje);
  if (dias == null) return "—";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  if (dias > 1) return `em ${dias} dias`;
  return `há ${Math.abs(dias)} dias`;
}

export function idadeAnosPainel(dataNascimento: string | Date | null | undefined, hoje = new Date()): number | null {
  const d = parseDataPainel(dataNascimento);
  if (!d) return null;
  const diff = hoje.getTime() - d.getTime();
  if (diff < 0) return null;
  return diff / (365.25 * 86_400_000);
}

export function faixaEtariaPainel(anos: number | null): string {
  if (anos == null) return "Sem idade";
  if (anos < 1) return "0–12 meses";
  if (anos < 2) return "12–24 meses";
  if (anos < 3) return "24–36 meses";
  return "+36 meses";
}

export function formatFemeaAlertaPainel(
  animalId: number,
  animal?: { brinco?: string | null; nome?: string | null } | null,
): string {
  const brinco = animal?.brinco?.trim();
  if (brinco) return `Fêmea ${brinco}`;
  const nome = animal?.nome?.trim();
  if (nome) return `Fêmea ${nome}`;
  return `Fêmea #${animalId}`;
}

export function agregarRebanhoPainel(
  animaisAtivos: readonly {
    sexo?: string | null;
    categoria?: string | null;
    dataNascimento?: string | Date | null;
    pesoAtual?: unknown;
  }[],
  hoje = new Date(),
): PainelRebanho {
  const ativos = [...animaisAtivos];
  const machos = ativos.filter(a => a.sexo === "macho").length;
  const femeas = ativos.filter(a => a.sexo === "femea").length;
  const pesos = ativos.map(a => pesoAtualRebanho(a.pesoAtual)).filter((p): p is number => p != null);
  const pesoTotal = pesos.reduce((s, p) => s + p, 0);
  const pesoMedio = pesos.length ? pesoTotal / pesos.length : 0;

  const porCategoria = new Map<string, number>();
  for (const a of ativos) {
    const cat = a.categoria?.trim() || (a.sexo === "femea" ? "Fêmeas" : "Machos");
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + 1);
  }
  const composicao = [...porCategoria.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const faixas = new Map<string, number>();
  for (const f of ["0–12 meses", "12–24 meses", "24–36 meses", "+36 meses", "Sem idade"]) {
    faixas.set(f, 0);
  }
  for (const a of ativos) {
    const f = faixaEtariaPainel(idadeAnosPainel(a.dataNascimento, hoje));
    faixas.set(f, (faixas.get(f) ?? 0) + 1);
  }

  return {
    total: ativos.length,
    machos,
    femeas,
    pesoTotal,
    pesoMedio,
    comPeso: pesos.length,
    composicao,
    idades: [...faixas.entries()].map(([name, value]) => ({ name, value })),
  };
}

export function agregarEstoquePainel(
  produtos: readonly {
    nome?: string | null;
    quantidade?: number | string | null;
    quantidadeMinima?: number | string | null;
    unidade?: string | null;
    monitorarEstoque?: boolean | null;
    controlarSaldo?: boolean | null;
    valorUnitario?: number | string | null;
    valorTotalEstoque?: number | string | null;
    capitalInicializadoEm?: Date | string | null;
  }[],
): PainelEstoque {
  let valorTotal = 0;
  const baixo: PainelAlertaItem[] = [];
  for (const p of produtos) {
    if (produtoControlaSaldo(p.controlarSaldo)) {
      valorTotal += valorPatrimonialExibicao(p);
    }
    if (
      produtoControlaSaldo(p.controlarSaldo) &&
      p.monitorarEstoque &&
      Number(p.quantidadeMinima) > 0 &&
      Number(p.quantidade) <= Number(p.quantidadeMinima)
    ) {
      baixo.push({
        texto: p.nome ?? "Produto",
        detalhe: `${Number(p.quantidade || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}/${Number(p.quantidadeMinima || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${p.unidade ?? ""}`.trim(),
      });
    }
  }
  return { valorTotal, totalProdutos: produtos.length, baixo };
}

export function agregarAlertasPainel(input: {
  estoqueBaixo: PainelAlertaItem[];
  movimentacoes: readonly { nome?: string | null; dataValidade?: string | Date | null }[];
  saude: readonly { tipo?: string | null; medicamento?: string | null; proximaData?: string | Date | null }[];
  partos: readonly {
    femeaId: number;
    dataPrevistoParto?: string | Date | null;
    dataPartoReal?: string | Date | null;
    femea?: { brinco?: string | null; nome?: string | null } | null;
  }[];
  manutencoes: readonly { tipo?: string | null; status?: string | null; proximaManutencao?: string | Date | null }[];
  hoje?: Date;
}): PainelAlertas {
  const hoje = input.hoje ?? new Date();

  const validadeOrdenada = input.movimentacoes
    .map(m => ({ m, dias: diasAtePainel(m.dataValidade, hoje) }))
    .filter(x => x.dias != null && x.dias <= 30)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  const validadeDedup: PainelAlertaItem[] = [];
  const chaves = new Set<string>();
  for (const { m, dias } of validadeOrdenada) {
    const chave = `${m.nome}|${m.dataValidade}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    validadeDedup.push({
      texto: m.nome ?? "Produto",
      detalhe: prazoRelativoPainel(m.dataValidade, hoje),
      vencido: (dias ?? 0) < 0,
    });
  }

  const sanidade = input.saude
    .map(s => ({ s, dias: diasAtePainel(s.proximaData, hoje) }))
    .filter(x => x.dias != null && x.dias <= 30)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
    .map(({ s }) => ({
      texto: `${s.tipo ?? ""}${s.medicamento ? ` · ${s.medicamento}` : ""}`,
      detalhe: prazoRelativoPainel(s.proximaData, hoje),
    }));

  const partos = input.partos
    .filter(r => !r.dataPartoReal && r.dataPrevistoParto)
    .map(r => ({ r, dias: diasAtePainel(r.dataPrevistoParto, hoje) }))
    .filter(x => x.dias != null && x.dias <= 45 && x.dias >= -15)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
    .map(({ r }) => ({
      texto: formatFemeaAlertaPainel(r.femeaId, r.femea),
      detalhe: prazoRelativoPainel(r.dataPrevistoParto, hoje),
      animalId: r.femeaId,
    }));

  const manut = input.manutencoes
    .filter(m => m.status !== "concluida" && m.proximaManutencao)
    .map(m => ({ m, dias: diasAtePainel(m.proximaManutencao, hoje) }))
    .filter(x => x.dias != null && x.dias <= 30)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
    .map(({ m }) => ({
      texto: m.tipo ?? "Manutenção",
      detalhe: prazoRelativoPainel(m.proximaManutencao, hoje),
    }));

  const estoqueBaixo = [...input.estoqueBaixo];
  return {
    estoqueBaixo,
    validade: validadeDedup,
    sanidade,
    partos,
    manut,
    pendentes: [],
    total: estoqueBaixo.length + validadeDedup.length + sanidade.length + partos.length + manut.length,
  };
}

export function agregarOcupacaoPainel(
  pastos: readonly { id: number; nome: string; capacidade?: number | null; qtdAnimais?: number | null }[],
): PainelOcupacao[] {
  return [...pastos]
    .map(p => {
      const qtd = Number(p.qtdAnimais ?? 0);
      const capacidade = p.capacidade ?? 0;
      const pctOcupacao = capacidade > 0 ? Math.min(100, Math.round((qtd / capacidade) * 100)) : null;
      return {
        id: p.id,
        nome: p.nome,
        qtdAnimais: qtd,
        capacidade: p.capacidade ?? null,
        pctOcupacao,
      };
    })
    .filter(p => (p.capacidade ?? 0) > 0 || p.qtdAnimais > 0)
    .sort((a, b) => (b.pctOcupacao ?? 0) - (a.pctOcupacao ?? 0))
    .slice(0, 6);
}

export function isoLocalPainel(referencia: Date): string {
  const y = referencia.getFullYear();
  const m = String(referencia.getMonth() + 1).padStart(2, "0");
  const d = String(referencia.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Mesmo recorte civil da tela Relatórios (`periodoMesAtual`) e do hojeISO do V2. */
export function periodoMesCorrentePainel(referencia = new Date()): { de: string; ate: string; hojeISO: string } {
  const de = isoLocalPainel(new Date(referencia.getFullYear(), referencia.getMonth(), 1));
  const ate = isoLocalPainel(new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0));
  return { de, ate, hojeISO: isoLocalPainel(referencia) };
}

export function avisoRegistrosSemFazendaPainel(
  fazendaSelecionada: boolean,
  temRegistrosSemFazenda: boolean,
): string | null {
  if (!temRegistrosSemFazenda) return null;
  return fazendaSelecionada ? MSG_PAINEL_SEM_ATRIBUICAO_FILTRO : MSG_PAINEL_SEM_ATRIBUICAO_TODAS;
}

export function haRegistrosSemFazendaNoRelatorioV2(rel: {
  receber: { linhas: ReadonlyArray<{ fazendaOrigemId: number | null }> };
  pagar: { linhas: ReadonlyArray<{ fazendaOrigemId: number | null }> };
  fluxoRealizado: { linhas: ReadonlyArray<{ fazendaOrigemId: number | null; tipo: string }> };
}): boolean {
  const titulos = [...rel.receber.linhas, ...rel.pagar.linhas].some(l => l.fazendaOrigemId == null);
  const movimentos = rel.fluxoRealizado.linhas.some(
    l => l.tipo !== "transferencia" && l.fazendaOrigemId == null,
  );
  return titulos || movimentos;
}

export function emptyPainelFinanceiro(referencia = new Date()): PainelFinanceiro {
  const periodo = periodoMesCorrentePainel(referencia);
  return {
    disponivel: false,
    saldoCaixaBancos: 0,
    saldoCaixaConsolidado: true,
    avisoCaixa: MSG_RELATORIO_SALDO_CONSOLIDADO,
    totalAReceber: 0,
    totalAPagar: 0,
    titulosFiltradosPorFazenda: false,
    avisoTitulos: null,
    resultadoRealizado: 0,
    resultadoFiltradoPorFazenda: false,
    rotuloResultado: ROTULO_RESULTADO_MES_ATUAL,
    periodoDe: periodo.de,
    periodoAte: periodo.ate,
    avisoResultado: MSG_RELATORIO_TRANSFERENCIA_FORA_RESULTADO,
    avisoSemAtribuicao: null,
    temRegistrosSemFazenda: false,
  };
}

export function emptyPainelComercial(): PainelComercial {
  return { compras: [], vendas: [] };
}

/** Só lê os totais já apurados pelo V2. Não recalcula parcela, liquidação nem transferência. */
export function indicadoresFinanceirosDoRelatorioV2(
  visao: {
    saldoCaixaBancos: number;
    totalAReceber: number;
    totalAPagar: number;
    resultadoRealizado: number;
    saldoConsolidadoSemFazenda?: boolean;
  },
  opts: {
    fazendaSelecionadaId: number | null;
    periodo: { de: string; ate: string };
    temRegistrosSemFazenda?: boolean;
  },
): PainelFinanceiro {
  const porFazenda = opts.fazendaSelecionadaId != null;
  const avisoSemAtribuicao = avisoRegistrosSemFazendaPainel(porFazenda, Boolean(opts.temRegistrosSemFazenda));
  return {
    disponivel: true,
    saldoCaixaBancos: visao.saldoCaixaBancos,
    saldoCaixaConsolidado: true,
    avisoCaixa: MSG_RELATORIO_SALDO_CONSOLIDADO,
    totalAReceber: visao.totalAReceber,
    totalAPagar: visao.totalAPagar,
    titulosFiltradosPorFazenda: porFazenda,
    avisoTitulos: avisoSemAtribuicao,
    resultadoRealizado: visao.resultadoRealizado,
    resultadoFiltradoPorFazenda: porFazenda,
    rotuloResultado: ROTULO_RESULTADO_MES_ATUAL,
    periodoDe: opts.periodo.de,
    periodoAte: opts.periodo.ate,
    avisoResultado: MSG_RELATORIO_TRANSFERENCIA_FORA_RESULTADO,
    avisoSemAtribuicao,
    temRegistrosSemFazenda: Boolean(opts.temRegistrosSemFazenda),
  };
}

export function operacaoComercialVisivelPainel(
  operacao: { fazendaId?: number | null; status?: string | null },
  fazendaSelecionadaId: number | null,
): boolean {
  if (String(operacao.status ?? "").toLowerCase() === "cancelado") return false;
  if (String(operacao.status ?? "").toLowerCase() === "cancelada") return false;
  if (fazendaSelecionadaId == null) return true;
  return Number(operacao.fazendaId) === fazendaSelecionadaId;
}

export function emptyPainelOverview(): PainelOverview {
  return {
    fazendas: [],
    fazendaSelecionadaId: null,
    totalLotes: 0,
    totalPastos: 0,
    areaTotal: 0,
    rebanho: agregarRebanhoPainel([]),
    estoque: { valorTotal: 0, totalProdutos: 0, baixo: [] },
    alertas: {
      estoqueBaixo: [],
      validade: [],
      sanidade: [],
      partos: [],
      manut: [],
      pendentes: [],
      total: 0,
    },
    ocupacao: [],
    saudeRecente: [],
    financeiro: emptyPainelFinanceiro(),
    comercial: emptyPainelComercial(),
  };
}

export function montarPainelOverview(input: {
  escopo: Extract<EscopoFazendasPainel, { ok: true }>;
  totalLotes: number;
  totalPastos: number;
  rebanho: PainelRebanho;
  estoque: PainelEstoque;
  alertas: PainelAlertas;
  ocupacao: PainelOcupacao[];
  saudeRecente: PainelSaudeRecente[];
  financeiro?: PainelFinanceiro;
  comercial?: PainelComercial;
}): PainelOverview {
  return {
    fazendas: input.escopo.fazendas,
    fazendaSelecionadaId: input.escopo.fazendaSelecionadaId,
    totalLotes: input.totalLotes,
    totalPastos: input.totalPastos,
    areaTotal: input.escopo.fazendas
      .filter(f => input.escopo.fazendaIds.includes(f.id))
      .reduce((s, f) => s + (Number(f.area) || 0), 0),
    rebanho: input.rebanho,
    estoque: input.estoque,
    alertas: input.alertas,
    ocupacao: input.ocupacao,
    saudeRecente: input.saudeRecente.slice(0, 6),
    financeiro: input.financeiro ?? emptyPainelFinanceiro(),
    comercial: input.comercial ?? emptyPainelComercial(),
  };
}

export type EstadoBlocoPainel = "carregando" | "erro" | "vazio" | "pronto";

export function estadoBlocoPainel(carregando: boolean, erro: boolean, temDado: boolean): EstadoBlocoPainel {
  if (carregando) return "carregando";
  if (erro) return "erro";
  if (!temDado) return "vazio";
  return "pronto";
}

export function statusOperacaoPainel(
  estadoAlertas: EstadoBlocoPainel,
  alertas: Pick<PainelAlertas, "total" | "estoqueBaixo">,
): { label: string; detalhe: string; tom: "ok" | "alerta" | "critico" | "neutro" } {
  if (estadoAlertas === "carregando") {
    return { label: "Carregando", detalhe: "Consultando alertas da operação", tom: "neutro" };
  }
  if (estadoAlertas === "erro") {
    return { label: "Falha na consulta", detalhe: "Não foi possível carregar os alertas", tom: "critico" };
  }
  if (alertas.total === 0) {
    return { label: "Tudo em ordem", detalhe: "Nenhuma pendência crítica", tom: "ok" };
  }
  if (alertas.estoqueBaixo.length > 0) {
    return {
      label: "Atenção no estoque",
      detalhe: `${alertas.estoqueBaixo.length} item(ns) abaixo do mínimo`,
      tom: "critico",
    };
  }
  return { label: "Pendências abertas", detalhe: `${alertas.total} ponto(s) pedindo revisão`, tom: "alerta" };
}
