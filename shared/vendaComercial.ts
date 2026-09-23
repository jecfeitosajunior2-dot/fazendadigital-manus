import { compareBrincoCrescente } from "./animalAutocomplete";

/** Regras puras da Venda comercial (Venda + Itens). */

export const FORMAS_PRECIFICACAO_VENDA = ["kg", "cabeca", "arroba"] as const;
export type FormaPrecificacaoVenda = (typeof FORMAS_PRECIFICACAO_VENDA)[number];

/** Enum atual do MySQL — sem migration não dá para gravar `arroba`. */
export const FORMAS_PRECIFICACAO_VENDA_PERSISTIVEIS = ["kg", "cabeca"] as const;
export type FormaPrecificacaoVendaPersistivel = (typeof FORMAS_PRECIFICACAO_VENDA_PERSISTIVEIS)[number];

export const FORMA_PRECIFICACAO_VENDA_LABEL: Record<FormaPrecificacaoVenda, string> = {
  kg: "R$/kg vivo",
  cabeca: "R$/cabeça",
  arroba: "R$/@ de carcaça",
};

export const KG_POR_ARROBA = 15;
export type OrigemPesoEmbarque = "manual" | "balanca";

export const MSG_VENDA_SEM_FAZENDA = "Selecione a Fazenda.";
export const MSG_VENDA_SEM_COMPRADOR = "Selecione o comprador.";
export const MSG_VENDA_SEM_DATA = "Informe a data da venda.";
export const MSG_VENDA_DATA_INVALIDA = "Data da venda inválida.";
export const MSG_VENDA_SEM_ITENS = "Inclua pelo menos um animal na venda.";
export const MSG_VENDA_ANIMAL_DUPLICADO = "Este animal já está incluído nesta Venda.";
export const MSG_VENDA_ANIMAL_OUTRA_FAZENDA = "O animal selecionado não pertence à Fazenda da venda.";
export const MSG_VENDA_ANIMAL_INDISPONIVEL =
  "Um ou mais animais selecionados não estão mais disponíveis para Venda.";
export const MSG_VENDA_PESO_OBRIGATORIO = "Informe o peso do embarque.";
export const MSG_VENDA_PRECO_OBRIGATORIO = "Informe o preço do item.";
export const MSG_VENDA_FORMA_INVALIDA = "Selecione a forma de precificação.";
export const MSG_VENDA_RENDIMENTO_INVALIDO =
  "Informe um rendimento de carcaça maior que 0 e até 100.";
export const MSG_VENDA_RENDIMENTO_OBRIGATORIO =
  "Informe o rendimento de carcaça para venda em R$/@.";
export const MSG_VENDA_ARROBA_REQUER_MIGRATION =
  "A forma R$/@ de carcaça ainda não pode ser gravada: o banco só aceita R$/kg vivo e R$/cabeça. A fórmula já está pronta na tela; falta autorizar a migration.";

export function isFormaPrecificacaoVenda(value: unknown): value is FormaPrecificacaoVenda {
  return value === "kg" || value === "cabeca" || value === "arroba";
}

export function isFormaPrecificacaoVendaPersistivel(
  value: unknown,
): value is FormaPrecificacaoVendaPersistivel {
  return value === "kg" || value === "cabeca";
}

export function pesoEmbarqueObrigatorio(forma: FormaPrecificacaoVenda): boolean {
  return forma === "kg" || forma === "arroba";
}

export function rendimentoObrigatorio(forma: FormaPrecificacaoVenda): boolean {
  return forma === "arroba";
}

export function arredondarMoeda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function parsePrecoVenda(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return arredondarMoeda(n);
}

export function parsePesoVenda(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Vazio = sem rendimento. Preenchido precisa estar entre 0 e 100, exclusive 0. */
export function parseRendimentoCarcaca(
  raw: unknown,
  opts?: { obrigatorio?: boolean },
): { ok: true; valor: number | null } | { ok: false; message: string } {
  if (raw == null) {
    return opts?.obrigatorio
      ? { ok: false, message: MSG_VENDA_RENDIMENTO_OBRIGATORIO }
      : { ok: true, valor: null };
  }
  const texto = String(raw).trim().replace("%", "");
  if (!texto) {
    return opts?.obrigatorio
      ? { ok: false, message: MSG_VENDA_RENDIMENTO_OBRIGATORIO }
      : { ok: true, valor: null };
  }
  const n = Number(texto.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    return { ok: false, message: MSG_VENDA_RENDIMENTO_INVALIDO };
  }
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

/** Peso estimado de carcaça = peso vivo × rendimento%. */
export function calcularPesoCarcacaKg(pesoVivo: number, rendimentoCarcaca: number): number {
  return Math.round(pesoVivo * (rendimentoCarcaca / 100) * 100) / 100;
}

/** Arrobas = carcaça kg ÷ 15. */
export function calcularArrobas(pesoCarcacaKg: number): number {
  return Math.round((pesoCarcacaKg / KG_POR_ARROBA) * 100) / 100;
}

/** Legado: kg de carne a partir do rendimento. Novas vendas em R$/kg vivo não usam isto. */
export function calcularPesoCarne(pesoVivo: number, rendimentoCarcaca?: number | null): number {
  if (rendimentoCarcaca == null) return Math.round(pesoVivo * 100) / 100;
  return calcularPesoCarcacaKg(pesoVivo, rendimentoCarcaca);
}

export type ValorItemVendaOk = {
  ok: true;
  valor: number;
  pesoCobrado: number | null;
  pesoVivo: number | null;
  pesoCarcaca: number | null;
  arrobas: number | null;
};

export function calcularValorItem(input: {
  forma: FormaPrecificacaoVenda;
  pesoVenda?: number | null;
  precoUnitario: number;
  rendimentoCarcaca?: number | null;
}): ValorItemVendaOk | { ok: false; message: string } {
  const preco = parsePrecoVenda(input.precoUnitario);
  if (preco == null) return { ok: false, message: MSG_VENDA_PRECO_OBRIGATORIO };

  if (input.forma === "cabeca") {
    const pesoVivo = parsePesoVenda(input.pesoVenda);
    return {
      ok: true,
      valor: arredondarMoeda(preco),
      pesoCobrado: pesoVivo,
      pesoVivo,
      pesoCarcaca: null,
      arrobas: null,
    };
  }

  const pesoVivo = parsePesoVenda(input.pesoVenda);
  if (pesoVivo == null) return { ok: false, message: MSG_VENDA_PESO_OBRIGATORIO };

  if (input.forma === "kg") {
    return {
      ok: true,
      valor: arredondarMoeda(pesoVivo * preco),
      pesoCobrado: pesoVivo,
      pesoVivo,
      pesoCarcaca: null,
      arrobas: null,
    };
  }

  const rend = parseRendimentoCarcaca(input.rendimentoCarcaca, { obrigatorio: true });
  if (!rend.ok) return rend;
  const pesoCarcaca = calcularPesoCarcacaKg(pesoVivo, rend.valor!);
  if (pesoCarcaca <= 0) return { ok: false, message: MSG_VENDA_PESO_OBRIGATORIO };
  const arrobas = calcularArrobas(pesoCarcaca);
  return {
    ok: true,
    valor: arredondarMoeda(arrobas * preco),
    pesoCobrado: pesoVivo,
    pesoVivo,
    pesoCarcaca,
    arrobas,
  };
}

export type ItemVendaResumo = {
  pesoVenda?: number | null;
  valorItem: number;
  arrobas?: number | null;
};

export function resumirItensVenda(
  itens: ReadonlyArray<ItemVendaResumo>,
  opts?: { forma?: FormaPrecificacaoVenda; rendimentoCarcaca?: number | null },
): {
  quantidade: number;
  pesoTotal: number | null;
  valorTotal: number;
  precoMedioKg: number | null;
  precoMedioCabeca: number | null;
  precoMedioArroba: number | null;
} {
  const quantidade = itens.length;
  const valorTotal = arredondarMoeda(itens.reduce((acc, item) => acc + item.valorItem, 0));
  const pesos = itens.map(i => parsePesoVenda(i.pesoVenda)).filter((n): n is number => n != null);
  const pesoTotal = pesos.length ? Math.round(pesos.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const forma = opts?.forma;
  const precoMedioKg =
    forma !== "cabeca" && forma !== "arroba" && pesoTotal != null && pesoTotal > 0
      ? arredondarMoeda(valorTotal / pesoTotal)
      : null;
  const precoMedioCabeca =
    forma === "cabeca" && quantidade > 0 ? arredondarMoeda(valorTotal / quantidade) : null;
  let precoMedioArroba: number | null = null;
  if (forma === "arroba") {
    const arrobasItens = itens
      .map(i => (i.arrobas != null && Number.isFinite(i.arrobas) && i.arrobas > 0 ? i.arrobas : null));
    if (arrobasItens.length && arrobasItens.every((n): n is number => n != null)) {
      const totalArrobas = Math.round(arrobasItens.reduce((a, b) => a + b, 0) * 100) / 100;
      precoMedioArroba = totalArrobas > 0 ? arredondarMoeda(valorTotal / totalArrobas) : null;
    } else if (pesoTotal != null && pesoTotal > 0 && opts?.rendimentoCarcaca != null) {
      const carcaca = calcularPesoCarcacaKg(pesoTotal, opts.rendimentoCarcaca);
      const arrobas = calcularArrobas(carcaca);
      precoMedioArroba = arrobas > 0 ? arredondarMoeda(valorTotal / arrobas) : null;
    }
  }
  return { quantidade, pesoTotal, valorTotal, precoMedioKg, precoMedioCabeca, precoMedioArroba };
}

export function aplicarPadraoEmLinhas<T>(
  itens: readonly T[],
  usaExcecao: (item: T) => boolean,
  aplicar: (item: T) => T,
): T[] {
  return itens.map(item => (usaExcecao(item) ? item : aplicar(item)));
}

/** Listagem / PDF — brinco crescente. A grade da Nova Venda usa a ordem da lida. */
export function ordenarItensVendaPorBrinco<T extends { brinco?: string | null; animalId: number }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort((a, b) =>
    compareBrincoCrescente({ brinco: a.brinco, id: a.animalId }, { brinco: b.brinco, id: b.animalId }),
  );
}

/** Nova Venda: fila da lida. Quem entra por último fica embaixo. */
export function anexarItensVendaNaOrdemDaLida<T extends { animalId: number }>(
  atuais: readonly T[],
  novos: readonly T[],
): T[] {
  const jaTem = new Set(atuais.map(i => i.animalId));
  const unique = novos.filter(n => !jaTem.has(n.animalId));
  return unique.length ? [...atuais, ...unique] : [...atuais];
}

function pesoEmbarqueVazio(peso?: string | null): boolean {
  return !String(peso ?? "").trim();
}

export function escolherAlvoPesoBalanca(
  itens: ReadonlyArray<{ animalId: number; pesoVenda?: string | null }>,
  preferidoId?: number | null,
): number | null {
  const vazio = itens.find(i => pesoEmbarqueVazio(i.pesoVenda));
  const preferido = preferidoId
    ? itens.find(i => i.animalId === preferidoId)
    : undefined;
  if (preferido && pesoEmbarqueVazio(preferido.pesoVenda)) return preferido.animalId;
  if (vazio) return vazio.animalId;
  if (preferido) return preferido.animalId;
  return itens.length ? itens[itens.length - 1]!.animalId : null;
}

/** Visor da S3 para o animal atual. Não herda o peso travado do animal anterior. */
export function pesoBalancaVendaNaIdentificacao(opts: {
  kg: number;
  alvoId: number;
  ultimoBalanca?: { animalId: number; kg: number } | null;
}): number | null {
  const peso = parsePesoVenda(opts.kg);
  if (peso == null) return null;
  if (
    opts.ultimoBalanca &&
    opts.ultimoBalanca.animalId !== opts.alvoId &&
    Math.abs(peso - opts.ultimoBalanca.kg) < 0.05
  ) {
    return null;
  }
  return peso;
}

export type EstadoAnimalAtualVenda = {
  animalId: number;
  brinco: string;
  pesoKg: number | null;
  recebeProximoPeso: boolean;
  aguardandoPesoBalanca: boolean;
};

/** Estado operacional do animal atual — só o que a venda já sabe associar. */
export function estadoAnimalAtualVenda(input: {
  animalAtualId?: number | null;
  itens: ReadonlyArray<{ animalId: number; brinco?: string | null; pesoVenda?: string | null }>;
  balancaConectada: boolean;
}): EstadoAnimalAtualVenda | null {
  const id = input.animalAtualId;
  if (id == null || id <= 0) return null;
  const item = input.itens.find(i => i.animalId === id);
  if (!item) return null;
  const pesoKg = parsePesoVenda(item.pesoVenda);
  const recebeProximoPeso = escolherAlvoPesoBalanca(input.itens, id) === id;
  return {
    animalId: id,
    brinco: String(item.brinco ?? "").trim() || `#${id}`,
    pesoKg,
    recebeProximoPeso,
    aguardandoPesoBalanca: Boolean(input.balancaConectada && recebeProximoPeso && pesoKg == null),
  };
}

export function mensagemAnimaisIndisponiveis(brincos: string[]): string {
  const lista = brincos.filter(Boolean);
  if (!lista.length) return MSG_VENDA_ANIMAL_INDISPONIVEL;
  if (lista.length === 1) {
    return `O animal ${lista[0]} não está mais disponível para Venda.`;
  }
  return `Os animais ${lista.join(", ")} não estão mais disponíveis para Venda.`;
}

export const MSG_VENDA_RFID_SEM_FAZENDA = "Selecione a Fazenda antes de adicionar animais.";
export const MSG_VENDA_RFID_NAO_ENCONTRADO = "RFID não encontrado no rebanho.";

export function rotuloStatusAnimalVenda(status?: string | null): string {
  const key = String(status ?? "").trim().toLowerCase();
  if (key === "ativo") return "Ativo";
  if (key === "vendido") return "Vendido";
  if (key === "morto") return "Morto";
  if (key === "transferido") return "Transferido";
  return String(status ?? "").trim();
}

export function identificacaoAnimalVenda(animal: { brinco?: string | null; id: number }): string {
  const brinco = String(animal.brinco ?? "").trim();
  return brinco || `#${animal.id}`;
}

export type AnimalRfidVendaRef = {
  id: number;
  brinco?: string | null;
  fazendaId?: number | null;
  fazendaNome?: string | null;
  status?: string | null;
};

export function avaliarInclusaoAnimalVenda(input: {
  animal: AnimalRfidVendaRef | null;
  fazendaId: number;
  idsNaVenda: ReadonlyArray<number>;
}): { ok: true; brinco: string } | { ok: false; message: string; detalhe?: string } {
  if (!input.fazendaId || input.fazendaId <= 0) {
    return { ok: false, message: MSG_VENDA_RFID_SEM_FAZENDA };
  }
  if (!input.animal) {
    return { ok: false, message: MSG_VENDA_RFID_NAO_ENCONTRADO };
  }
  const brinco = identificacaoAnimalVenda(input.animal);
  if (input.idsNaVenda.includes(input.animal.id)) {
    return { ok: false, message: `O animal ${brinco} já está incluído nesta Venda.` };
  }
  const fazendaAnimal = input.animal.fazendaId != null ? Number(input.animal.fazendaId) : 0;
  if (fazendaAnimal !== input.fazendaId) {
    const nome = String(input.animal.fazendaNome ?? "").trim();
    return {
      ok: false,
      message: nome
        ? `O animal ${brinco} pertence à ${nome}.`
        : `O animal ${brinco} pertence a outra Fazenda.`,
    };
  }
  const status = String(input.animal.status ?? "").trim().toLowerCase();
  if (status !== "ativo") {
    const rotulo = rotuloStatusAnimalVenda(input.animal.status);
    return {
      ok: false,
      message: `O animal ${brinco} não está disponível para Venda.`,
      detalhe: rotulo ? `Status atual: ${rotulo}.` : undefined,
    };
  }
  return { ok: true, brinco };
}

export const COMPRA_VENDA_VENDA_NOVA_PATH = "/compra-venda/vendas/nova";

export function compraVendaVendaDetalhePath(id: number): string {
  return `/compra-venda/vendas/${id}`;
}
