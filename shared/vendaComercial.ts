/** Regras puras da Venda comercial (Venda + Itens). */

export const FORMAS_PRECIFICACAO_VENDA = ["kg", "cabeca"] as const;
export type FormaPrecificacaoVenda = (typeof FORMAS_PRECIFICACAO_VENDA)[number];

export const FORMA_PRECIFICACAO_VENDA_LABEL: Record<FormaPrecificacaoVenda, string> = {
  kg: "R$/kg",
  cabeca: "R$/cabeça",
};

export const MSG_VENDA_SEM_FAZENDA = "Selecione a Fazenda.";
export const MSG_VENDA_SEM_COMPRADOR = "Selecione o comprador.";
export const MSG_VENDA_SEM_DATA = "Informe a data da venda.";
export const MSG_VENDA_DATA_INVALIDA = "Data da venda inválida.";
export const MSG_VENDA_SEM_ITENS = "Inclua pelo menos um animal na venda.";
export const MSG_VENDA_ANIMAL_DUPLICADO = "Este animal já está incluído nesta Venda.";
export const MSG_VENDA_ANIMAL_OUTRA_FAZENDA = "O animal selecionado não pertence à Fazenda da venda.";
export const MSG_VENDA_ANIMAL_INDISPONIVEL =
  "Um ou mais animais selecionados não estão mais disponíveis para Venda.";
export const MSG_VENDA_PESO_OBRIGATORIO = "Informe o peso da venda para precificação em R$/kg.";
export const MSG_VENDA_PRECO_OBRIGATORIO = "Informe o preço do item.";
export const MSG_VENDA_FORMA_INVALIDA = "Selecione a forma de precificação.";
export const MSG_VENDA_RENDIMENTO_INVALIDO =
  "Informe um rendimento de carcaça entre 0 e 100, ou deixe em branco para vender no peso vivo.";

export function isFormaPrecificacaoVenda(value: unknown): value is FormaPrecificacaoVenda {
  return value === "kg" || value === "cabeca";
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

/** Vazio = sem conversão. Preenchido precisa estar entre 0 e 100. */
export function parseRendimentoCarcaca(
  raw: unknown,
): { ok: true; valor: number | null } | { ok: false; message: string } {
  if (raw == null) return { ok: true, valor: null };
  const texto = String(raw).trim().replace("%", "");
  if (!texto) return { ok: true, valor: null };
  const n = Number(texto.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    return { ok: false, message: MSG_VENDA_RENDIMENTO_INVALIDO };
  }
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

/** Sem rendimento, o peso cobrado é o peso vivo. */
export function calcularPesoCarne(pesoVivo: number, rendimentoCarcaca?: number | null): number {
  if (rendimentoCarcaca == null) return Math.round(pesoVivo * 100) / 100;
  return Math.round(pesoVivo * (rendimentoCarcaca / 100) * 100) / 100;
}

export function calcularValorItem(input: {
  forma: FormaPrecificacaoVenda;
  pesoVenda?: number | null;
  precoUnitario: number;
  rendimentoCarcaca?: number | null;
}): { ok: true; valor: number; pesoCobrado: number | null } | { ok: false; message: string } {
  const preco = parsePrecoVenda(input.precoUnitario);
  if (preco == null) return { ok: false, message: MSG_VENDA_PRECO_OBRIGATORIO };
  if (input.forma === "cabeca") {
    return { ok: true, valor: arredondarMoeda(preco), pesoCobrado: parsePesoVenda(input.pesoVenda) };
  }
  const pesoVivo = parsePesoVenda(input.pesoVenda);
  if (pesoVivo == null) return { ok: false, message: MSG_VENDA_PESO_OBRIGATORIO };
  const pesoCobrado = calcularPesoCarne(pesoVivo, input.rendimentoCarcaca);
  if (pesoCobrado <= 0) return { ok: false, message: MSG_VENDA_PESO_OBRIGATORIO };
  return { ok: true, valor: arredondarMoeda(pesoCobrado * preco), pesoCobrado };
}

export type ItemVendaResumo = {
  pesoVenda?: number | null;
  valorItem: number;
};

export function resumirItensVenda(
  itens: ReadonlyArray<ItemVendaResumo>,
  opts?: { rendimentoCarcaca?: number | null },
): {
  quantidade: number;
  pesoTotal: number | null;
  valorTotal: number;
  precoMedioKg: number | null;
} {
  const quantidade = itens.length;
  const valorTotal = arredondarMoeda(itens.reduce((acc, item) => acc + item.valorItem, 0));
  const pesos = itens
    .map(i => parsePesoVenda(i.pesoVenda))
    .filter((n): n is number => n != null)
    .map(peso => calcularPesoCarne(peso, opts?.rendimentoCarcaca));
  const pesoTotal = pesos.length ? Math.round(pesos.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const precoMedioKg =
    pesoTotal != null && pesoTotal > 0 ? arredondarMoeda(valorTotal / pesoTotal) : null;
  return { quantidade, pesoTotal, valorTotal, precoMedioKg };
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
