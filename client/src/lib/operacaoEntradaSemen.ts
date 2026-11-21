const CHAVES = {
  livre: "fd-semen-entrada-op",
  prefill: "fd-semen-entrada-op-prefill",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memoria = new Map<string, RascunhoEntradaSemen>();

export type SlotEntradaSemen = keyof typeof CHAVES;

export type RascunhoEntradaSemen = {
  id: string;
  fazendaId: number;
  assinatura: string;
  origem: string;
  partida: string;
  quantidadeDoses: string;
  custoUnitario: string;
  dataEntrada: string;
  reprodutorTexto: string;
  centralOrigem: string;
  machoId: number | null;
};

function lerBruto(slot: SlotEntradaSemen): RascunhoEntradaSemen | null {
  const naMemoria = memoria.get(slot);
  if (naMemoria) return naMemoria;
  try {
    const texto = sessionStorage.getItem(CHAVES[slot]);
    if (!texto) return null;
    const lido = JSON.parse(texto) as RascunhoEntradaSemen;
    if (!lido || !UUID.test(String(lido.id)) || !lido.assinatura) return null;
    memoria.set(slot, lido);
    return lido;
  } catch {
    return null;
  }
}

function gravar(slot: SlotEntradaSemen, rascunho: RascunhoEntradaSemen) {
  memoria.set(slot, rascunho);
  try {
    sessionStorage.setItem(CHAVES[slot], JSON.stringify(rascunho));
  } catch {
    /* a memória da aba segura o reenvio se o navegador recusar a sessão */
  }
}

/** Rascunho pendente da mesma fazenda, para recuperar depois de atualizar a página. */
export function lerRascunhoEntradaSemen(slot: SlotEntradaSemen, fazendaId: number): RascunhoEntradaSemen | null {
  const atual = lerBruto(slot);
  if (!atual || atual.fazendaId !== fazendaId || !atual.assinatura) return null;
  return atual;
}

/**
 * A mesma entrada, o segundo clique e o reenvio depois de falha usam esta chave.
 * Um formulário vazio não chama esta função.
 * Conteúdo diferente da mesma tentativa mantém a chave: o servidor recusa se a primeira já gravou.
 */
export function operacaoEntradaSemenAtual(
  slot: SlotEntradaSemen,
  rascunho: Omit<RascunhoEntradaSemen, "id">,
): string {
  if (!rascunho.assinatura.trim()) {
    descartarOperacaoEntradaSemen(slot);
    throw new Error("entrada vazia");
  }
  const atual = lerBruto(slot);
  const id = atual && atual.fazendaId === rascunho.fazendaId ? atual.id : crypto.randomUUID();
  gravar(slot, { ...rascunho, id });
  return id;
}

/** Depois do sucesso confirmado, a próxima entrada recebe outra chave. */
export function concluirOperacaoEntradaSemen(slot: SlotEntradaSemen) {
  descartarOperacaoEntradaSemen(slot);
}

/** Formulário vazio não reaproveita a chave da entrada anterior. */
export function descartarOperacaoEntradaSemen(slot: SlotEntradaSemen) {
  memoria.delete(slot);
  try {
    sessionStorage.removeItem(CHAVES[slot]);
  } catch {
    /* sem sessão, a memória já foi limpa */
  }
}
