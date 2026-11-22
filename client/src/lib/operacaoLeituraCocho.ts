import {
  decidirChaveNutricao,
  type EstadoChaveNutricao,
} from "@shared/nutricaoIdempotencia";

const PREFIXO = "fd-nutricao-leitura-pendente";
let memoria: EstadoChaveNutricao | null = null;

function ler(): EstadoChaveNutricao | null {
  if (memoria && memoria.chave && memoria.conteudo) return memoria;
  try {
    const texto = sessionStorage.getItem(PREFIXO);
    if (!texto) return null;
    const lido = JSON.parse(texto) as { chave?: string; conteudo?: string };
    if (!lido?.chave || !lido.conteudo) return null;
    memoria = { chave: lido.chave, conteudo: lido.conteudo };
    return memoria;
  } catch {
    return memoria;
  }
}

function gravar(estado: EstadoChaveNutricao) {
  memoria = estado;
  try {
    sessionStorage.setItem(PREFIXO, JSON.stringify(estado));
  } catch {
    /* a memória da aba segura o reenvio se o navegador recusar a sessão */
  }
}

/** A mesma tentativa, o segundo clique e o erro de rede usam esta chave. Outro conteúdo recebe outra. */
export function chaveLeituraPendente(conteudo: string): EstadoChaveNutricao {
  const estado = decidirChaveNutricao(ler(), conteudo, "lei");
  gravar(estado);
  return estado;
}

/** Só depois da resposta de sucesso. Erro de rede conserva a chave. */
export function concluirLeituraPendente() {
  memoria = null;
  try {
    sessionStorage.removeItem(PREFIXO);
  } catch {
    /* a memória já foi limpa */
  }
}
