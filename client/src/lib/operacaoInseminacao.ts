const PREFIXO = "fd-ia-operacao:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memoria = new Map<string, { id: string; assinatura: string }>();

export type TelaInseminacao = "manejo" | "curral";

function ler(tela: TelaInseminacao): { id: string; assinatura: string } | null {
  const naMemoria = memoria.get(tela);
  if (naMemoria) return naMemoria;
  try {
    const texto = sessionStorage.getItem(PREFIXO + tela);
    if (!texto) return null;
    const lido = JSON.parse(texto) as { id?: string; assinatura?: string };
    if (!lido?.id || !UUID.test(lido.id) || !lido.assinatura) return null;
    const guardado = { id: lido.id, assinatura: lido.assinatura };
    memoria.set(tela, guardado);
    return guardado;
  } catch {
    return null;
  }
}

function gravar(tela: TelaInseminacao, valor: { id: string; assinatura: string }) {
  memoria.set(tela, valor);
  try {
    sessionStorage.setItem(PREFIXO + tela, JSON.stringify(valor));
  } catch {
    /* a memória da aba segura o reenvio se o navegador recusar a sessão */
  }
}

/**
 * A mesma inseminação, o segundo clique e o reenvio usam esta chave.
 * Outro conteúdo é outra inseminação e recebe outra chave.
 */
export function operacaoInseminacaoAtual(tela: TelaInseminacao, assinatura: string): string {
  if (!assinatura.trim()) {
    concluirOperacaoInseminacao(tela);
    throw new Error("inseminação vazia");
  }
  const atual = ler(tela);
  if (atual && atual.assinatura === assinatura) return atual.id;
  const id = crypto.randomUUID();
  gravar(tela, { id, assinatura });
  return id;
}

/** Depois do sucesso confirmado, a próxima inseminação recebe outra chave. */
export function concluirOperacaoInseminacao(tela: TelaInseminacao) {
  memoria.delete(tela);
  try {
    sessionStorage.removeItem(PREFIXO + tela);
  } catch {
    /* sem sessão, a memória já foi limpa */
  }
}
