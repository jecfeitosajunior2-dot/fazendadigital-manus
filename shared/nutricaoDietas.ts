import { todasAsCategorias } from "./animal-types";
import {
  conversaoDisponivelParaKg,
  custoEstoqueParaCustoKg,
  kgParaQuantidadeEstoque,
  mensagemConversaoKg,
  quantidadeEstoqueParaKg,
  resolverConversaoParaKg,
} from "./estoqueConversaoKg";

export const NUTRICAO_DIETA_STATUS = ["ativa", "inativa"] as const;
export type NutricaoDietaStatus = (typeof NUTRICAO_DIETA_STATUS)[number];

export const NUTRICAO_DIETA_TIPOS = [
  { value: "mineral", label: "Mineral" },
  { value: "mineral_proteico", label: "Mineral proteico" },
  { value: "proteinado", label: "Proteinado" },
  { value: "racao_concentrada", label: "Ração concentrada" },
  { value: "dieta_completa", label: "Dieta completa" },
  { value: "outro", label: "Outro" },
] as const;
export type NutricaoDietaTipo = (typeof NUTRICAO_DIETA_TIPOS)[number]["value"];

/** Objetivos classificatórios — alinhados às atividades da fazenda, sem enum rígido no banco. */
export const NUTRICAO_DIETA_OBJETIVOS = [
  { value: "manutencao", label: "Manutenção" },
  { value: "cria", label: "Cria" },
  { value: "recria", label: "Recria" },
  { value: "engorda", label: "Engorda" },
  { value: "reproducao", label: "Reprodução" },
  { value: "outro", label: "Outro" },
] as const;
export type NutricaoDietaObjetivo = (typeof NUTRICAO_DIETA_OBJETIVOS)[number]["value"];

export const NUTRICAO_DIETA_BASE_UNIDADE = "kg";

export const MSG_DIETA_FAZENDA = "Selecione a fazenda da dieta.";
export const MSG_DIETA_NOME = "Informe o nome da dieta.";
export const MSG_DIETA_TIPO = "Selecione o tipo da dieta.";
export const MSG_DIETA_BASE = "Informe uma base da formulação maior que zero.";
export const MSG_DIETA_INGREDIENTE = "Inclua pelo menos um ingrediente.";
export const MSG_DIETA_QTD = "A quantidade de cada ingrediente deve ser maior que zero.";
export const MSG_DIETA_PRODUTO = "Selecione um produto válido para cada ingrediente.";
export const MSG_DIETA_DUPLICADO = "O mesmo produto não pode aparecer duas vezes na formulação.";
export const MSG_DIETA_UNIDADE =
  "Só é possível formular com produtos em kg, g ou saco com uma única embalagem de massa (ex.: 30 kg/sc). Saco sem conteúdo, litro e unidade não são convertidos.";
export const MSG_DIETA_PRODUTO_FAZENDA =
  "Este produto não está vinculado a esta fazenda. Vincule-o em Insumos antes de usar na dieta.";
export const MSG_DIETA_TOTAL =
  "A soma das quantidades precisa ser igual à base da formulação.";
export const MSG_DIETA_DATAS = "A data final não pode ser anterior à data inicial.";
export const MSG_DIETA_CATEGORIA = "Categoria animal inválida.";
export const MSG_DIETA_OBJETIVO = "Selecione um objetivo válido.";
export const MSG_DIETA_OWNERSHIP = "Você não tem acesso a esta dieta.";
export const MSG_DIETA_NAO_ENCONTRADA = "Dieta não encontrada.";
export const MSG_DIETA_INSUMOS =
  "Se o produto ainda não existe, cadastre-o em Insumos e vincule à fazenda.";

export type NutricaoDietaIngredienteInput = {
  produtoId: number;
  quantidade: number;
};

export type NutricaoDietaInput = {
  fazendaId: number;
  nome: string;
  tipo: string;
  descricao?: string | null;
  categoriaAnimal?: string | null;
  objetivo?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  baseQuantidade: number;
  ingredientes: NutricaoDietaIngredienteInput[];
};

export type NutricaoDietaProdutoRef = {
  produtoId: number;
  unidade?: string | null;
  valorUnitario?: string | number | null;
  embalagens?: unknown;
  vinculadoFazenda: boolean;
};

export function labelTipoDieta(tipo: string | null | undefined): string {
  return NUTRICAO_DIETA_TIPOS.find(t => t.value === tipo)?.label ?? tipo ?? "—";
}

export function labelObjetivoDieta(objetivo: string | null | undefined): string {
  if (!objetivo) return "—";
  return NUTRICAO_DIETA_OBJETIVOS.find(t => t.value === objetivo)?.label ?? objetivo;
}

export function categoriasAnimalDieta(): string[] {
  return todasAsCategorias();
}

export function parseQuantidadeDieta(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function arredondarKg(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

export function normalizarUnidadeMassaDieta(unidade: string | null | undefined): string {
  return String(unidade ?? "").trim();
}

export function unidadeCompativelFormulacaoKg(
  unidade: string | null | undefined,
  embalagens?: unknown,
): boolean {
  return conversaoDisponivelParaKg(unidade, embalagens);
}

export function quantidadeParaKg(
  quantidade: number,
  unidade: string | null | undefined,
  embalagens?: unknown,
): number | null {
  return quantidadeEstoqueParaKg(quantidade, unidade, embalagens);
}

/** Converte kg da formulação/fornecimento para a unidade de estoque do produto. */
export function kgParaQuantidadeUnidade(
  quantidadeKg: number,
  unidade: string | null | undefined,
  embalagens?: unknown,
): number | null {
  return kgParaQuantidadeEstoque(quantidadeKg, unidade, embalagens);
}

/** Custo médio vigente por kg. Null = desconhecido (não é R$ 0). */
export function custoMedioVigentePorKg(
  valorUnitario: string | number | null | undefined,
  unidadeProduto: string | null | undefined,
  embalagens?: unknown,
): number | null {
  return custoEstoqueParaCustoKg(valorUnitario, unidadeProduto, embalagens);
}

export function percentualSobreBase(quantidadeKg: number, baseKg: number): number | null {
  if (!(baseKg > 0)) return null;
  return Math.round((quantidadeKg / baseKg) * 10000) / 100;
}

export type CustoIngredienteEstimado = {
  produtoId: number;
  quantidadeKg: number;
  percentual: number | null;
  custoMedioPorKg: number | null;
  custoEstimado: number | null;
  custoConhecido: boolean;
};

export type CustoDietaEstimado = {
  baseKg: number;
  totalKg: number;
  diferencaKg: number;
  custoTotal: number | null;
  custoPorKg: number | null;
  completo: boolean;
  ingredientes: CustoIngredienteEstimado[];
};

export function calcularCustoEstimadoDieta(input: {
  baseQuantidade: number;
  ingredientes: Array<{
    produtoId: number;
    quantidade: number;
    unidade?: string | null;
    valorUnitario?: string | number | null;
    embalagens?: unknown;
  }>;
}): CustoDietaEstimado {
  const baseKg = arredondarKg(input.baseQuantidade);
  const ingredientes = input.ingredientes.map(ing => {
    const quantidadeKg = arredondarKg(ing.quantidade);
    const custoMedioPorKg = custoMedioVigentePorKg(
      ing.valorUnitario ?? null,
      ing.unidade ?? "kg",
      ing.embalagens,
    );
    const custoConhecido = custoMedioPorKg != null;
    return {
      produtoId: ing.produtoId,
      quantidadeKg,
      percentual: percentualSobreBase(quantidadeKg, baseKg),
      custoMedioPorKg,
      custoEstimado: custoConhecido ? arredondarMoeda(quantidadeKg * custoMedioPorKg) : null,
      custoConhecido,
    };
  });
  const totalKg = arredondarKg(ingredientes.reduce((acc, i) => acc + i.quantidadeKg, 0));
  const completo = ingredientes.length > 0 && ingredientes.every(i => i.custoConhecido);
  const custoTotal = completo
    ? arredondarMoeda(ingredientes.reduce((acc, i) => acc + (i.custoEstimado ?? 0), 0))
    : null;
  return {
    baseKg,
    totalKg,
    diferencaKg: arredondarKg(totalKg - baseKg),
    custoTotal,
    custoPorKg: completo && baseKg > 0 && custoTotal != null ? arredondarMoeda(custoTotal / baseKg) : null,
    completo,
    ingredientes,
  };
}

export function arredondarMoeda(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function formatarCustoEstimadoDieta(
  valor: number | null,
  completo: boolean,
): string {
  if (!completo || valor == null) return "Custo incompleto";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function validarDietaInput(
  input: NutricaoDietaInput,
  produtosPorId: Map<number, NutricaoDietaProdutoRef>,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(input.fazendaId) || input.fazendaId <= 0) {
    return { ok: false, message: MSG_DIETA_FAZENDA };
  }
  const nome = input.nome.trim();
  if (!nome) return { ok: false, message: MSG_DIETA_NOME };
  if (!NUTRICAO_DIETA_TIPOS.some(t => t.value === input.tipo)) {
    return { ok: false, message: MSG_DIETA_TIPO };
  }
  if (input.categoriaAnimal) {
    if (!categoriasAnimalDieta().includes(input.categoriaAnimal)) {
      return { ok: false, message: MSG_DIETA_CATEGORIA };
    }
  }
  if (input.objetivo) {
    if (!NUTRICAO_DIETA_OBJETIVOS.some(o => o.value === input.objetivo)) {
      return { ok: false, message: MSG_DIETA_OBJETIVO };
    }
  }
  if (!(input.baseQuantidade > 0)) return { ok: false, message: MSG_DIETA_BASE };
  if (!input.ingredientes.length) return { ok: false, message: MSG_DIETA_INGREDIENTE };

  const vistos = new Set<number>();
  let soma = 0;
  for (const ing of input.ingredientes) {
    if (!Number.isFinite(ing.produtoId) || ing.produtoId <= 0) {
      return { ok: false, message: MSG_DIETA_PRODUTO };
    }
    if (vistos.has(ing.produtoId)) return { ok: false, message: MSG_DIETA_DUPLICADO };
    vistos.add(ing.produtoId);
    if (!(ing.quantidade > 0)) return { ok: false, message: MSG_DIETA_QTD };
    const produto = produtosPorId.get(ing.produtoId);
    if (!produto) return { ok: false, message: MSG_DIETA_PRODUTO };
    if (!produto.vinculadoFazenda) return { ok: false, message: MSG_DIETA_PRODUTO_FAZENDA };
    const resolucao = resolverConversaoParaKg(produto.unidade, produto.embalagens);
    if (!resolucao.ok) {
      return { ok: false, message: mensagemConversaoKg(resolucao) };
    }
    soma += ing.quantidade;
  }

  if (arredondarKg(soma) !== arredondarKg(input.baseQuantidade)) {
    const falta = arredondarKg(input.baseQuantidade - soma);
    const detalhe =
      falta > 0
        ? ` Faltam ${falta.toLocaleString("pt-BR")} kg.`
        : ` Há ${Math.abs(falta).toLocaleString("pt-BR")} kg a mais.`;
    return { ok: false, message: `${MSG_DIETA_TOTAL}${detalhe}` };
  }

  const inicio = input.dataInicio?.trim() || "";
  const fim = input.dataFim?.trim() || "";
  if (inicio && fim && fim < inicio) return { ok: false, message: MSG_DIETA_DATAS };

  return { ok: true };
}

export function objetivoDietaMessage(objetivo: string | null | undefined): string | null {
  if (!objetivo) return null;
  if (!NUTRICAO_DIETA_OBJETIVOS.some(o => o.value === objetivo)) {
    return "Selecione um objetivo válido.";
  }
  return null;
}
