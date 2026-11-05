/**
 * Projeção dos instantâneos de auditoria.
 * Só saem campos administrativos conhecidos. O texto original fica no banco.
 */

const OPERACOES_USUARIO = [
  "usuario.criar",
  "usuario.editar",
  "usuario.inativar",
  "usuario.reativar",
  "usuario.alterar_papel",
] as const;

const OPERACOES_PERMISSAO = ["permissao.conceder", "permissao.revogar", "permissao.sanear"] as const;
const OPERACOES_FAZENDA = ["fazenda.conceder", "fazenda.revogar", "fazenda.sanear"] as const;

export const OPERACOES_USUARIO_AFETADO = {
  users: OPERACOES_USUARIO,
  usuario_permissoes: OPERACOES_PERMISSAO,
  usuario_fazendas: OPERACOES_FAZENDA,
} as const;

type Campo =
  | "id"
  | "name"
  | "email"
  | "papel"
  | "role"
  | "titularUserId"
  | "situacao"
  | "sessionVersion"
  | "inativadoPorUserId"
  | "permissoes"
  | "fazendas"
  | "saneamento"
  | "perfilId"
  | "nome"
  | "descricao"
  | "criadoPorUserId"
  | "removida"
  | "userId"
  | "fazendaId"
  | "concedidoPorUserId"
  | "inconsistente"
  | "alvoUserId"
  | "expiraEmMs";

const USUARIO: readonly Campo[] = [
  "id", "name", "email", "papel", "role", "titularUserId", "situacao", "sessionVersion", "inativadoPorUserId",
];

const PERFIL: readonly Campo[] = ["id", "titularUserId", "nome", "descricao", "situacao", "criadoPorUserId", "permissoes"];

const POR_OPERACAO: Record<string, { anterior: readonly Campo[]; posterior: readonly Campo[] }> = {
  "usuario.criar": { anterior: [], posterior: USUARIO },
  "usuario.editar": { anterior: USUARIO, posterior: USUARIO },
  "usuario.inativar": { anterior: USUARIO, posterior: USUARIO },
  "usuario.reativar": {
    anterior: [...USUARIO, "permissoes", "fazendas"],
    posterior: [...USUARIO, "permissoes", "fazendas", "saneamento"],
  },
  "usuario.alterar_papel": { anterior: USUARIO, posterior: USUARIO },
  "usuario.revisar": { anterior: [], posterior: ["alvoUserId", "expiraEmMs"] },
  "perfil.criar": { anterior: [], posterior: PERFIL },
  "perfil.editar": { anterior: ["id", "nome", "permissoes"], posterior: PERFIL },
  "perfil.inativar": { anterior: ["id", "nome", "situacao"], posterior: PERFIL },
  "perfil.aplicar": { anterior: ["perfilId", "permissoes"], posterior: ["perfilId", "permissoes"] },
  "permissao.conceder": { anterior: ["permissoes"], posterior: ["permissoes"] },
  "permissao.revogar": { anterior: ["permissoes"], posterior: ["permissoes"] },
  "permissao.sanear": { anterior: ["permissoes"], posterior: ["removida", "permissoes", "titularUserId"] },
  "fazenda.conceder": { anterior: [], posterior: ["userId", "fazendaId", "concedidoPorUserId"] },
  "fazenda.revogar": { anterior: ["userId", "fazendaId"], posterior: [] },
  "fazenda.sanear": { anterior: ["userId", "fazendaId", "inconsistente"], posterior: ["removida", "titularUserId"] },
};

export type InstantaneoVisivel = Record<string, unknown> | null;

export type EventoProjetado = {
  anterior: InstantaneoVisivel;
  posterior: InstantaneoVisivel;
  conteudoOculto: boolean;
};

function textoCurto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto || texto.length > limite) return null;
  if (/[\u0000-\u001f]/.test(texto)) return null;
  return texto;
}

function inteiro(valor: unknown, minimo: number): number | null {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < minimo) return null;
  return valor;
}

function listaTextos(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const saida: string[] = [];
  for (const item of valor) {
    const texto = textoCurto(item, 80);
    if (!texto || !/^[a-z0-9_.]+$/.test(texto)) return null;
    saida.push(texto);
  }
  return saida;
}

function listaNumeros(valor: unknown): number[] | null {
  if (!Array.isArray(valor)) return null;
  const saida: number[] = [];
  for (const item of valor) {
    const numero = inteiro(item, 1);
    if (numero == null) return null;
    saida.push(numero);
  }
  return saida;
}

function campoPermitido(chave: Campo, valor: unknown): unknown | undefined {
  if (chave === "name" || chave === "nome") return textoCurto(valor, 255) ?? undefined;
  if (chave === "email" || chave === "descricao") {
    if (valor == null) return null;
    return textoCurto(valor, 255) ?? undefined;
  }
  if (chave === "papel") {
    return valor === "principal" || valor === "secundario" || valor === "comum" ? valor : undefined;
  }
  if (chave === "role") return valor === "admin" || valor === "user" ? valor : undefined;
  if (chave === "situacao") {
    return valor === "convidado" || valor === "ativo" || valor === "inativo" ? valor : undefined;
  }
  if (chave === "sessionVersion") return inteiro(valor, 0) ?? undefined;
  if (chave === "inconsistente") return typeof valor === "boolean" ? valor : undefined;
  if (chave === "permissoes" || chave === "removida") {
    if (chave === "removida") {
      const texto = textoCurto(valor, 80);
      if (texto && /^[a-z0-9_.]+$/.test(texto)) return texto;
      const numero = inteiro(valor, 1);
      return numero ?? undefined;
    }
    return listaTextos(valor) ?? undefined;
  }
  if (chave === "fazendas") return listaNumeros(valor) ?? undefined;
  if (chave === "saneamento") {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
    const origem = valor as Record<string, unknown>;
    const permissoes = listaTextos(origem.permissoes);
    const fazendas = listaNumeros(origem.fazendas);
    if (!permissoes || !fazendas) return undefined;
    return { permissoes, fazendas };
  }
  return inteiro(valor, 1) ?? undefined;
}

function projetarObjeto(valor: unknown, campos: readonly Campo[]): InstantaneoVisivel {
  if (valor == null) return null;
  let origem = valor;
  if (typeof origem === "string") {
    try {
      origem = JSON.parse(origem) as unknown;
    } catch {
      return null;
    }
  }
  if (!origem || typeof origem !== "object" || Array.isArray(origem)) return null;
  const registro = origem as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const campo of campos) {
    if (!Object.prototype.hasOwnProperty.call(registro, campo)) continue;
    const projetado = campoPermitido(campo, registro[campo]);
    if (projetado !== undefined) saida[campo] = projetado;
  }
  return saida;
}

export function projetarEventoAdministrativo(
  operacao: string,
  anterior: unknown,
  posterior: unknown,
): EventoProjetado {
  const modelo = POR_OPERACAO[operacao];
  if (!modelo) return { anterior: null, posterior: null, conteudoOculto: true };
  return {
    anterior: projetarObjeto(anterior, modelo.anterior),
    posterior: projetarObjeto(posterior, modelo.posterior),
    conteudoOculto: false,
  };
}
