export const PAPEIS_CONTA = ["principal", "secundario", "comum"] as const;
export const SITUACOES_USUARIO = ["convidado", "ativo", "inativo"] as const;

export type PapelConta = (typeof PAPEIS_CONTA)[number];
export type SituacaoUsuario = (typeof SITUACOES_USUARIO)[number];

/** Identidade confirmada no banco. O cookie não preenche estes campos. */
export type IdentidadeUsuario = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
  papel: PapelConta;
  titularUserId: number;
  situacao: SituacaoUsuario;
  sessionVersion: number;
};

export type PayloadSessao = {
  id?: number;
  sessionVersion?: number;
  role?: string;
  papel?: string;
};

export type PrecondicaoIdentidade = {
  total: number;
  admins: number;
  emailsNulos: number;
  gruposDuplicados: number;
  colunaPapel: number;
};

/** Cookie antigo, sem o campo, vale como versão 0. A partir daí só a versão do banco autoriza. */
export function versaoDoPayload(payload: PayloadSessao): number {
  const valor = payload.sessionVersion;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) return 0;
  return valor;
}

export function loginPermitido(situacao: SituacaoUsuario | null | undefined): boolean {
  return situacao === "ativo";
}

/**
 * O papel e o nome que vierem no cookie são ignorados.
 * Consulta falha, usuário ausente, inativo ou versão diferente: sem acesso.
 */
export function decidirSessao(
  payload: PayloadSessao | null,
  registro: IdentidadeUsuario | null,
  consultaFalhou: boolean,
): IdentidadeUsuario | null {
  if (consultaFalhou || !payload || !registro) return null;
  if (!Number.isInteger(payload.id) || payload.id !== registro.id || registro.id <= 0) return null;
  if (!loginPermitido(registro.situacao)) return null;
  if (!Number.isInteger(registro.titularUserId) || registro.titularUserId <= 0) return null;
  if (!Number.isInteger(registro.sessionVersion) || registro.sessionVersion < 0) return null;
  if (versaoDoPayload(payload) !== registro.sessionVersion) return null;
  return {
    id: registro.id,
    openId: registro.openId,
    name: registro.name,
    email: registro.email,
    role: registro.role,
    papel: registro.papel,
    titularUserId: registro.titularUserId,
    situacao: registro.situacao,
    sessionVersion: registro.sessionVersion,
  };
}

export async function resolverIdentidadeDaRequisicao(
  payload: PayloadSessao | null,
  carregar: (id: number) => Promise<IdentidadeUsuario | null>,
): Promise<IdentidadeUsuario | null> {
  if (!payload || !Number.isInteger(payload.id) || (payload.id ?? 0) <= 0) return null;
  try {
    const registro = await carregar(payload.id as number);
    return decidirSessao(payload, registro, false);
  } catch {
    return null;
  }
}

/** A migração só segue se o banco ainda estiver no estado conferido. Não altera e-mail. */
export function avaliarPrecondicaoIdentidade(
  estado: PrecondicaoIdentidade,
): { ok: true } | { ok: false; motivo: string } {
  if (estado.total !== 1) {
    return { ok: false, motivo: "Quantidade de usuários diferente de 1." };
  }
  if (estado.admins !== 1) {
    return { ok: false, motivo: "Não há exatamente um administrador." };
  }
  if (estado.emailsNulos !== 0) {
    return { ok: false, motivo: "Existe e-mail nulo. Nenhum e-mail foi alterado." };
  }
  if (estado.gruposDuplicados !== 0) {
    return { ok: false, motivo: "E-mail duplicado. Nenhum e-mail foi alterado." };
  }
  if (estado.colunaPapel !== 0) {
    return { ok: false, motivo: "A coluna papel já existe." };
  }
  return { ok: true };
}
