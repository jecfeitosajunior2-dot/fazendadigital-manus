import { isCategoriaValidaParaSexo } from "./animal-types";
import { arredondarMoeda } from "./vendaComercial";

export const FORMAS_PRECIFICACAO_COMPRA = ["kg", "cabeca"] as const;
export type FormaPrecificacaoCompra = (typeof FORMAS_PRECIFICACAO_COMPRA)[number];

export const MODOS_IDENTIFICACAO_COMPRA = ["nao_identificados", "individuais"] as const;
export type ModoIdentificacaoCompra = (typeof MODOS_IDENTIFICACAO_COMPRA)[number];

export const FORMA_PRECIFICACAO_COMPRA_LABEL: Record<FormaPrecificacaoCompra, string> = {
  kg: "R$/kg vivo",
  cabeca: "R$/cabeça",
};

export const MSG_COMPRA_SEM_FAZENDA = "Selecione a fazenda de destino.";
export const MSG_COMPRA_SEM_FORNECEDOR = "Selecione o fornecedor.";
export const MSG_COMPRA_FORNECEDOR_INVALIDO = "Selecione um fornecedor ativo.";
export const MSG_COMPRA_SEM_DATA = "Informe a data da compra.";
export const MSG_COMPRA_DATA_INVALIDA = "Data da compra inválida.";
export const MSG_COMPRA_FORMA_INVALIDA = "Selecione a forma de precificação.";
export const MSG_COMPRA_PRECO_INVALIDO = "Informe um preço maior que zero.";
export const MSG_COMPRA_SEM_GRUPOS = "Inclua pelo menos um grupo de animais.";
export const MSG_COMPRA_QUANTIDADE_INVALIDA = "Informe uma quantidade maior que zero.";
export const MSG_COMPRA_PESO_OBRIGATORIO = "Informe o peso total do grupo para compra em R$/kg vivo.";
export const MSG_COMPRA_PESO_INVALIDO = "Informe um peso maior que zero.";
export const MSG_COMPRA_VALOR_NEGATIVO = "Valores não podem ser negativos.";
export const MSG_COMPRA_CATEGORIA_SEXO = "Informe uma categoria compatível com o sexo.";
export const MSG_COMPRA_LOTE_OUTRA_FAZENDA = "O lote de destino não pertence à fazenda escolhida.";
export const MSG_COMPRA_PASTO_OUTRA_FAZENDA = "O pasto de destino não pertence à fazenda escolhida.";
export const MSG_COMPRA_MODO_INDIVIDUAL =
  "A identificação individual ainda não está disponível nesta etapa.";
export const MSG_COMPRA_MODO_INVALIDO = "Selecione como os animais serão registrados.";

export type SexoAnimalCompra = "macho" | "femea";

export type GrupoCompraInput = {
  categoria: string;
  sexo: string;
  quantidade: unknown;
  pesoTotal?: unknown;
};

export type GrupoCompraValido = {
  categoria: string;
  sexo: SexoAnimalCompra;
  quantidade: number;
  pesoTotal: number | null;
};

function sexoPersistivel(value: unknown): SexoAnimalCompra | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "macho") return "macho";
  if (v === "femea" || v === "fêmea") return "femea";
  return null;
}

function sexoParaCategoria(sexo: SexoAnimalCompra): "Macho" | "Fêmea" {
  return sexo === "femea" ? "Fêmea" : "Macho";
}

export function isFormaPrecificacaoCompra(value: unknown): value is FormaPrecificacaoCompra {
  return value === "kg" || value === "cabeca";
}

export function isModoIdentificacaoCompra(value: unknown): value is ModoIdentificacaoCompra {
  return value === "nao_identificados" || value === "individuais";
}

export function pesoObrigatorioNaCompra(forma: FormaPrecificacaoCompra): boolean {
  return forma === "kg";
}

/** Número decimal: aceita 4400, 4400.5 e 4.400,50. Rejeita NaN. */
export function parseNumeroDecimal(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseQuantidadeGrupo(raw: unknown): number | null {
  const n = parseNumeroDecimal(raw);
  if (n == null || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export function parsePesoGrupo(raw: unknown): number | null {
  const n = parseNumeroDecimal(raw);
  if (n == null || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function parsePrecoCompra(raw: unknown): number | null {
  const n = parseNumeroDecimal(raw);
  if (n == null || n <= 0) return null;
  return arredondarMoeda(n);
}

/** Frete/outros: vazio = 0. Negativo ou NaN = inválido. */
export function parseCustoOpcional(raw: unknown): { ok: true; valor: number } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, valor: 0 };
  const n = parseNumeroDecimal(raw);
  if (n == null || n < 0) return { ok: false };
  return { ok: true, valor: arredondarMoeda(n) };
}

export function avaliarGrupoCompra(
  grupo: GrupoCompraInput,
  forma: FormaPrecificacaoCompra,
): { ok: true; grupo: GrupoCompraValido } | { ok: false; message: string } {
  const sexo = sexoPersistivel(grupo.sexo);
  const categoria = String(grupo.categoria ?? "").trim();
  if (!sexo || !categoria || !isCategoriaValidaParaSexo(sexoParaCategoria(sexo), categoria)) {
    return { ok: false, message: MSG_COMPRA_CATEGORIA_SEXO };
  }
  const quantidade = parseQuantidadeGrupo(grupo.quantidade);
  if (quantidade == null) return { ok: false, message: MSG_COMPRA_QUANTIDADE_INVALIDA };

  const pesoVazio = grupo.pesoTotal == null || String(grupo.pesoTotal).trim() === "";
  if (pesoObrigatorioNaCompra(forma) && pesoVazio) {
    return { ok: false, message: MSG_COMPRA_PESO_OBRIGATORIO };
  }
  if (pesoVazio) {
    return { ok: true, grupo: { categoria, sexo, quantidade, pesoTotal: null } };
  }
  const pesoTotal = parsePesoGrupo(grupo.pesoTotal);
  if (pesoTotal == null) return { ok: false, message: MSG_COMPRA_PESO_INVALIDO };
  return { ok: true, grupo: { categoria, sexo, quantidade, pesoTotal } };
}

export function somarGruposCompra(grupos: ReadonlyArray<GrupoCompraValido>): {
  quantidadeTotal: number;
  pesoTotal: number | null;
} {
  const quantidadeTotal = grupos.reduce((acc, g) => acc + g.quantidade, 0);
  const pesos = grupos.map(g => g.pesoTotal).filter((n): n is number => n != null);
  const pesoTotal = pesos.length
    ? Math.round(pesos.reduce((a, b) => a + b, 0) * 100) / 100
    : null;
  return { quantidadeTotal, pesoTotal };
}

export function calcularValorAnimaisCompra(input: {
  forma: FormaPrecificacaoCompra;
  precoUnitario: number;
  quantidadeTotal: number;
  pesoTotal: number | null;
}): { ok: true; valor: number } | { ok: false; message: string } {
  const preco = parsePrecoCompra(input.precoUnitario);
  if (preco == null) return { ok: false, message: MSG_COMPRA_PRECO_INVALIDO };
  if (input.forma === "cabeca") {
    if (input.quantidadeTotal <= 0) return { ok: false, message: MSG_COMPRA_QUANTIDADE_INVALIDA };
    return { ok: true, valor: arredondarMoeda(input.quantidadeTotal * preco) };
  }
  if (input.pesoTotal == null || input.pesoTotal <= 0) {
    return { ok: false, message: MSG_COMPRA_PESO_OBRIGATORIO };
  }
  return { ok: true, valor: arredondarMoeda(input.pesoTotal * preco) };
}

export function calcularCustoTotalCompra(input: {
  valorAnimais: number;
  frete?: number | null;
  outrosCustos?: number | null;
}): number {
  return arredondarMoeda((input.valorAnimais ?? 0) + (input.frete ?? 0) + (input.outrosCustos ?? 0));
}

export function calcularCustoMedioCabeca(custoTotal: number, quantidade: number): number | null {
  if (quantidade <= 0) return null;
  return arredondarMoeda(custoTotal / quantidade);
}

export function calcularCustoMedioKg(custoTotal: number, pesoTotal: number | null): number | null {
  if (pesoTotal == null || pesoTotal <= 0) return null;
  return arredondarMoeda(custoTotal / pesoTotal);
}

export type CompraConfirmacaoCalculada = {
  forma: FormaPrecificacaoCompra;
  grupos: GrupoCompraValido[];
  quantidadeTotal: number;
  pesoTotal: number | null;
  precoUnitario: number;
  valorAnimais: number;
  frete: number;
  outrosCustos: number;
  custoTotal: number;
  custoMedioCabeca: number | null;
  custoMedioKg: number | null;
};

export function avaliarConfirmacaoCompraNaoIdentificados(input: {
  fazendaId?: unknown;
  fornecedorId?: unknown;
  data?: unknown;
  formaPrecificacao?: unknown;
  precoUnitario?: unknown;
  frete?: unknown;
  outrosCustos?: unknown;
  modoIdentificacao?: unknown;
  grupos?: ReadonlyArray<GrupoCompraInput>;
}): { ok: true; calculado: CompraConfirmacaoCalculada } | { ok: false; message: string } {
  const modo = input.modoIdentificacao;
  if (modo === "individuais") return { ok: false, message: MSG_COMPRA_MODO_INDIVIDUAL };
  if (modo !== "nao_identificados") return { ok: false, message: MSG_COMPRA_MODO_INVALIDO };

  const fazendaId = Number(input.fazendaId);
  if (!Number.isInteger(fazendaId) || fazendaId <= 0) {
    return { ok: false, message: MSG_COMPRA_SEM_FAZENDA };
  }
  const fornecedorId = Number(input.fornecedorId);
  if (!Number.isInteger(fornecedorId) || fornecedorId <= 0) {
    return { ok: false, message: MSG_COMPRA_SEM_FORNECEDOR };
  }
  if (!String(input.data ?? "").trim()) return { ok: false, message: MSG_COMPRA_SEM_DATA };
  if (!isFormaPrecificacaoCompra(input.formaPrecificacao)) {
    return { ok: false, message: MSG_COMPRA_FORMA_INVALIDA };
  }

  const gruposIn = input.grupos ?? [];
  if (!gruposIn.length) return { ok: false, message: MSG_COMPRA_SEM_GRUPOS };

  const grupos: GrupoCompraValido[] = [];
  for (const grupo of gruposIn) {
    const avaliado = avaliarGrupoCompra(grupo, input.formaPrecificacao);
    if (!avaliado.ok) return avaliado;
    grupos.push(avaliado.grupo);
  }

  const { quantidadeTotal, pesoTotal } = somarGruposCompra(grupos);
  const precoUnitario = parsePrecoCompra(input.precoUnitario);
  if (precoUnitario == null) return { ok: false, message: MSG_COMPRA_PRECO_INVALIDO };

  const valorAnimais = calcularValorAnimaisCompra({
    forma: input.formaPrecificacao,
    precoUnitario,
    quantidadeTotal,
    pesoTotal,
  });
  if (!valorAnimais.ok) return valorAnimais;

  const frete = parseCustoOpcional(input.frete);
  const outros = parseCustoOpcional(input.outrosCustos);
  if (!frete.ok || !outros.ok) return { ok: false, message: MSG_COMPRA_VALOR_NEGATIVO };

  const custoTotal = calcularCustoTotalCompra({
    valorAnimais: valorAnimais.valor,
    frete: frete.valor,
    outrosCustos: outros.valor,
  });

  return {
    ok: true,
    calculado: {
      forma: input.formaPrecificacao,
      grupos,
      quantidadeTotal,
      pesoTotal,
      precoUnitario,
      valorAnimais: valorAnimais.valor,
      frete: frete.valor,
      outrosCustos: outros.valor,
      custoTotal,
      custoMedioCabeca: calcularCustoMedioCabeca(custoTotal, quantidadeTotal),
      custoMedioKg: calcularCustoMedioKg(custoTotal, pesoTotal),
    },
  };
}
