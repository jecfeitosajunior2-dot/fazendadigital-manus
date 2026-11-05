import { permissaoPorId } from "./catalogoPermissoes";

export type SituacaoPerfil = "ativo" | "inativo";

export type LinhaPermissaoUsuario = {
  userId: number;
  titularUserId: number;
  permissao: string;
  concedidoPorUserId: number;
  origemPerfilId: number | null;
};

export type MotivoPerfil =
  | "nome_invalido"
  | "nome_duplicado"
  | "outro_titular"
  | "permissao_invalida"
  | "permissao_duplicada"
  | "perfil_inativo"
  | "concessao_duplicada";

export type PerfilPlanejado = {
  titularUserId: number;
  nome: string;
  descricao: string | null;
  criadoPorUserId: number;
  permissoes: string[];
};

type Falha = { ok: false; motivo: MotivoPerfil; permissao?: string };
type OkPerfil = { ok: true; perfil: PerfilPlanejado };
type OkCopia = { ok: true; novas: LinhaPermissaoUsuario[]; efetivas: LinhaPermissaoUsuario[] };

/** Tira espaço sobrando. A collation do banco ainda junta maiúsculas e acentos. */
export function normalizarNomePerfil(nome: string): string | null {
  const texto = nome.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!texto || texto.length > 80) return null;
  return texto;
}

/** Chave da conta para recusar nome repetido antes mesmo do banco. */
export function chaveNomePerfil(nome: string): string {
  return nome.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

function idsDoCatalogo(permissoes: readonly string[]): Falha | { ok: true; permissoes: string[] } {
  const vistos = new Set<string>();
  for (const id of permissoes) {
    if (!permissaoPorId(id)) return { ok: false, motivo: "permissao_invalida", permissao: id };
    if (vistos.has(id)) return { ok: false, motivo: "permissao_duplicada", permissao: id };
    vistos.add(id);
  }
  return { ok: true, permissoes: [...vistos] };
}

export function planejarPerfil(entrada: {
  titularUserId: number;
  nome: string;
  descricao?: string | null;
  criadoPorUserId: number;
  criadorTitularUserId: number;
  existentes: readonly { titularUserId: number; nome: string }[];
  permissoes: readonly string[];
}): OkPerfil | Falha {
  if (entrada.criadorTitularUserId !== entrada.titularUserId) return { ok: false, motivo: "outro_titular" };
  const nome = normalizarNomePerfil(entrada.nome);
  if (!nome) return { ok: false, motivo: "nome_invalido" };
  const chave = chaveNomePerfil(nome);
  const repetido = entrada.existentes.some(
    (perfil) => perfil.titularUserId === entrada.titularUserId && chaveNomePerfil(normalizarNomePerfil(perfil.nome) ?? perfil.nome) === chave,
  );
  if (repetido) return { ok: false, motivo: "nome_duplicado" };
  const catalogo = idsDoCatalogo(entrada.permissoes);
  if (!catalogo.ok) return catalogo;
  const descricao = entrada.descricao?.trim() ? entrada.descricao.trim() : null;
  return {
    ok: true,
    perfil: {
      titularUserId: entrada.titularUserId,
      nome,
      descricao,
      criadoPorUserId: entrada.criadoPorUserId,
      permissoes: catalogo.permissoes,
    },
  };
}

/**
 * Copia o que o perfil tem hoje. A lista devolvida não acompanha mudança futura do modelo.
 * A autorização lê só essas linhas, nunca perfil_permissoes.
 */
export function copiarPermissoesDoPerfil(entrada: {
  perfil: { id: number; titularUserId: number; situacao: SituacaoPerfil; permissoes: readonly string[] };
  usuario: { id: number; titularUserId: number; permissoes: readonly LinhaPermissaoUsuario[] };
  concedidoPorUserId: number;
  concedenteTitularUserId: number;
}): OkCopia | Falha {
  if (entrada.perfil.titularUserId !== entrada.usuario.titularUserId) return { ok: false, motivo: "outro_titular" };
  if (entrada.concedenteTitularUserId !== entrada.usuario.titularUserId) return { ok: false, motivo: "outro_titular" };
  if (entrada.perfil.situacao !== "ativo") return { ok: false, motivo: "perfil_inativo" };
  const catalogo = idsDoCatalogo(entrada.perfil.permissoes);
  if (!catalogo.ok) return catalogo;
  const jaTem = new Set(entrada.usuario.permissoes.map((linha) => linha.permissao));
  const novas: LinhaPermissaoUsuario[] = [];
  for (const permissao of catalogo.permissoes) {
    if (jaTem.has(permissao)) return { ok: false, motivo: "concessao_duplicada", permissao };
    novas.push({
      userId: entrada.usuario.id,
      titularUserId: entrada.usuario.titularUserId,
      permissao,
      concedidoPorUserId: entrada.concedidoPorUserId,
      origemPerfilId: entrada.perfil.id,
    });
  }
  return { ok: true, novas, efetivas: [...entrada.usuario.permissoes, ...novas] };
}

export function concederPermissaoAvulsa(entrada: {
  usuario: { id: number; titularUserId: number; permissoes: readonly LinhaPermissaoUsuario[] };
  permissao: string;
  concedidoPorUserId: number;
  concedenteTitularUserId: number;
}): OkCopia | Falha {
  if (entrada.concedenteTitularUserId !== entrada.usuario.titularUserId) return { ok: false, motivo: "outro_titular" };
  const catalogo = idsDoCatalogo([entrada.permissao]);
  if (!catalogo.ok) return catalogo;
  if (entrada.usuario.permissoes.some((linha) => linha.permissao === entrada.permissao)) {
    return { ok: false, motivo: "concessao_duplicada", permissao: entrada.permissao };
  }
  const nova: LinhaPermissaoUsuario = {
    userId: entrada.usuario.id,
    titularUserId: entrada.usuario.titularUserId,
    permissao: entrada.permissao,
    concedidoPorUserId: entrada.concedidoPorUserId,
    origemPerfilId: null,
  };
  return { ok: true, novas: [nova], efetivas: [...entrada.usuario.permissoes, nova] };
}

/** Lista que a autorização pode ler. Não recebe o perfil. */
export function permissoesEfetivas(linhas: readonly LinhaPermissaoUsuario[]): string[] {
  return [...new Set(linhas.map((linha) => linha.permissao))];
}
