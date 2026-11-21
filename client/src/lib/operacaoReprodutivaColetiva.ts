const PREFIXO = "fd-repro-operacao:";
const memoria = new Map<string, string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function lerSessao(chave: string): string | null {
  try {
    const salva = sessionStorage.getItem(chave);
    return salva && UUID.test(salva) ? salva : null;
  } catch {
    return null;
  }
}

/** A mesma operação, o segundo clique e o reenvio depois de falha usam esta chave. */
export function operacaoColetivaAtual(tela: "manejo" | "curral"): string {
  const guardada = memoria.get(tela);
  if (guardada) return guardada;
  const chave = PREFIXO + tela;
  const salva = lerSessao(chave);
  const id = salva ?? crypto.randomUUID();
  memoria.set(tela, id);
  try {
    sessionStorage.setItem(chave, id);
  } catch {
    /* a memória da aba segura o reenvio se o navegador recusar a sessão */
  }
  return id;
}

/** Depois do sucesso, o próximo manejo recebe outra chave. */
export function concluirOperacaoColetiva(tela: "manejo" | "curral"): void {
  memoria.delete(tela);
  try {
    sessionStorage.removeItem(PREFIXO + tela);
  } catch {
    /* sem sessão, a memória já foi limpa */
  }
}
