import { createHash } from "node:crypto";
import { loginPermitido, type IdentidadeUsuario, type PapelConta, type SituacaoUsuario } from "./_core/identidadeSessao";
import type { AcessoResolvido, FazendaConhecida, VinculoFazenda } from "./acessoFazendas";
import { prepararEvento, type EntradaEventoAuditoria, type LinhaAuditoria } from "./auditoria";
import {
  podeAdministrarUsuario,
  podeAlterarPapel,
  podeConcederFazenda,
  podeConcederPermissao,
  podeCriarUsuario,
  podeDelegarPermissao,
  podeExecutarOperacao,
  type AlvoUsuario,
  type DecisaoAutorizacao,
  type PedidoAutorizacao,
} from "./autorizacao";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  chaveNomePerfil,
  concederPermissaoAvulsa,
  copiarPermissoesDoPerfil,
  permissoesEfetivas,
  planejarPerfil,
  type LinhaPermissaoUsuario,
  type MotivoPerfil,
  type SituacaoPerfil,
} from "./perfisAcesso";

/**
 * Planos administrativos. Não abre banco, não grava sessão e não cria usuário real.
 * A transação única fica marcada para a etapa de persistência.
 */

export const OPERACOES_QUE_INVALIDAM_SESSAO = [
  "usuario.inativar",
  "usuario.reativar",
  "usuario.alterar_papel",
  "usuario.alterar_senha",
  "permissao.conceder",
  "permissao.revogar",
  "perfil.aplicar",
  "fazenda.conceder",
  "fazenda.revogar",
  "permissao.sanear",
  "fazenda.sanear",
] as const;

export type OperacaoAdministrativa =
  | (typeof OPERACOES_QUE_INVALIDAM_SESSAO)[number]
  | "usuario.criar"
  | "usuario.editar"
  | "perfil.criar"
  | "perfil.editar"
  | "perfil.inativar";

export type MotivoAdministracao =
  | DecisaoAutorizacao
  | MotivoPerfil
  | "email_invalido"
  | "email_duplicado"
  | "ja_inativo"
  | "nao_inativo"
  | "sem_alteracao"
  | "revisao_ausente"
  | "revisao_desatualizada"
  | "permissao_ausente"
  | "vinculo_existente"
  | "vinculo_ausente"
  | "proposta_duplicada"
  | "irregular_mantida"
  | "saneamento_recusado"
  | "revisao_outro_executor";

export type ContextoAdministracao = {
  identidade: IdentidadeUsuario;
  acesso: AcessoResolvido | null;
  permissoes: readonly string[];
  /** Ignorados. O navegador não escolhe quem executa nem o que pode. */
  permissoesInformadasPeloCliente?: readonly string[] | null;
  papelInformadoPeloCliente?: string | null;
  executorInformadoPeloCliente?: number | null;
  titularInformadoPeloCliente?: number | null;
};

export type UsuarioAdministravel = AlvoUsuario & {
  name: string;
  email: string | null;
  role: "admin" | "user";
  sessionVersion: number;
  openId?: string | null;
  passwordHash?: string | null;
};

export type UsuarioVisivel = {
  id: number;
  name: string;
  email: string | null;
  papel: PapelConta;
  role: "admin" | "user";
  titularUserId: number;
  situacao: SituacaoUsuario;
  sessionVersion: number;
};

export type PerfilConhecido = {
  id: number;
  titularUserId: number;
  nome: string;
  descricao: string | null;
  situacao: SituacaoPerfil;
  criadoPorUserId: number;
  permissoes: readonly string[];
};

export type AuditoriaPlanejada = {
  entrada: EntradaEventoAuditoria;
  evento: LinhaAuditoria;
};

export type SessaoPlanejada = {
  userId: number | null;
  invalidar: boolean;
  sessionVersionAtual: number | null;
  sessionVersionPrevista: number;
};

type PlanoBase = {
  operacao: OperacaoAdministrativa;
  transacao: "unica";
  sessao: SessaoPlanejada;
  auditoria: AuditoriaPlanejada;
};

export type FalhaAdministracao = {
  ok: false;
  motivo: MotivoAdministracao;
  permissao?: string;
  fazendaId?: number;
};

type Ok<T> = { ok: true; plano: T };

const CONSULTA_USUARIOS = [
  "usuarios.criar",
  "usuarios.inativar",
  "usuarios.gerenciar_acessos",
  "usuarios.gerenciar_permissoes",
] as const;

function falha(
  motivo: MotivoAdministracao,
  extra?: { permissao?: string; fazendaId?: number },
): FalhaAdministracao {
  return extra ? { ok: false, motivo, ...extra } : { ok: false, motivo };
}

function pedidoDe(ctx: ContextoAdministracao): PedidoAutorizacao {
  return {
    acesso: ctx.acesso,
    permissoes: ctx.permissoes,
    permissoesInformadasPeloCliente: ctx.permissoesInformadasPeloCliente ?? null,
    papelInformadoPeloCliente: ctx.papelInformadoPeloCliente ?? null,
  };
}

function contextoCoerente(ctx: ContextoAdministracao): DecisaoAutorizacao | null {
  const acesso = ctx.acesso;
  const identidade = ctx.identidade;
  if (!acesso || !loginPermitido(identidade.situacao)) return "sem_identidade";
  if (acesso.executorUserId !== identidade.id) return "sem_identidade";
  if (acesso.titularUserId !== identidade.titularUserId) return "sem_identidade";
  if (acesso.papel !== identidade.papel) return "sem_identidade";
  return null;
}

function exigirContexto(ctx: ContextoAdministracao): FalhaAdministracao | null {
  const motivo = contextoCoerente(ctx);
  return motivo ? falha(motivo) : null;
}

function alvoDe(usuario: UsuarioAdministravel): AlvoUsuario {
  return {
    id: usuario.id,
    titularUserId: usuario.titularUserId,
    papel: usuario.papel,
    situacao: usuario.situacao,
  };
}

function versaoValida(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 0;
}

function preverVersao(operacao: OperacaoAdministrativa, atual: number): SessaoPlanejada | null {
  if (!versaoValida(atual)) return null;
  const invalidar = (OPERACOES_QUE_INVALIDAM_SESSAO as readonly string[]).includes(operacao);
  return {
    userId: null,
    invalidar,
    sessionVersionAtual: atual,
    sessionVersionPrevista: invalidar ? atual + 1 : atual,
  };
}

/** Regra da versão de sessão. Alterar senha já entra na lista, mas ainda não existe operação de senha. */
export function preverSessao(operacao: string, sessionVersion: number): SessaoPlanejada | null {
  if (!(OPERACOES_QUE_INVALIDAM_SESSAO as readonly string[]).includes(operacao)
    && operacao !== "usuario.criar"
    && operacao !== "usuario.editar"
    && operacao !== "perfil.criar"
    && operacao !== "perfil.editar"
    && operacao !== "perfil.inativar") {
    return null;
  }
  return preverVersao(operacao as OperacaoAdministrativa, sessionVersion);
}

function sessaoDoAlvo(operacao: OperacaoAdministrativa, usuario: UsuarioAdministravel): SessaoPlanejada | null {
  const sessao = preverVersao(operacao, usuario.sessionVersion);
  if (!sessao) return null;
  return { ...sessao, userId: usuario.id };
}

function textoCurto(valor: string, limite: number): string | null {
  const texto = valor.trim();
  if (!texto || texto.length > limite) return null;
  return texto;
}

function chaveEmail(email: string): string {
  return chaveNomePerfil(email.trim());
}

function emailLivre(
  email: string,
  ignorarId: number | null,
  existentes: readonly { id: number; email: string | null }[],
): FalhaAdministracao | null {
  const chave = chaveEmail(email);
  const repetido = existentes.some((pessoa) => pessoa.id !== ignorarId && pessoa.email && chaveEmail(pessoa.email) === chave);
  return repetido ? falha("email_duplicado") : null;
}

function snapshotUsuario(
  usuario: Pick<UsuarioAdministravel, "id" | "name" | "email" | "papel" | "titularUserId" | "situacao" | "sessionVersion">,
  extra?: { situacao?: SituacaoUsuario; sessionVersion?: number; papel?: PapelConta },
) {
  const papel = extra?.papel ?? usuario.papel;
  return {
    id: usuario.id,
    name: usuario.name.trim(),
    email: usuario.email,
    papel,
    role: papel === "principal" ? "admin" as const : "user" as const,
    titularUserId: usuario.titularUserId,
    situacao: extra?.situacao ?? usuario.situacao,
    sessionVersion: extra?.sessionVersion ?? usuario.sessionVersion,
  };
}

function auditar(
  ctx: ContextoAdministracao,
  entrada: EntradaEventoAuditoria,
): AuditoriaPlanejada | null {
  const evento = prepararEvento(ctx.identidade, {
    ...entrada,
    dadosAnteriores: entrada.dadosAnteriores ?? null,
    dadosPosteriores: entrada.dadosPosteriores ?? null,
  });
  if (!evento) return null;
  if (evento.executorUserId !== ctx.identidade.id) return null;
  if (evento.titularUserId !== ctx.identidade.titularUserId) return null;
  return { entrada, evento };
}

function exigirOperacao(ctx: ContextoAdministracao, permissaoId: string): FalhaAdministracao | null {
  const decisao = podeExecutarOperacao(pedidoDe(ctx), permissaoId);
  return decisao === "permitido" ? null : falha(decisao);
}

function exigirAlvo(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  permissaoId: string,
): FalhaAdministracao | null {
  const base = exigirContexto(ctx);
  if (base) return base;
  const administracao = podeAdministrarUsuario(pedidoDe(ctx), alvoDe(usuario));
  if (administracao !== "permitido") return falha(administracao);
  return exigirOperacao(ctx, permissaoId);
}

function exigirAtivo(usuario: UsuarioAdministravel): FalhaAdministracao | null {
  if (usuario.situacao === "inativo") return falha("ja_inativo");
  if (usuario.situacao !== "ativo") return falha("alvo_invalido");
  if (!versaoValida(usuario.sessionVersion)) return falha("alvo_invalido");
  return null;
}

function fecharPlano<T extends PlanoBase>(
  ctx: ContextoAdministracao,
  operacao: OperacaoAdministrativa,
  registroTipo: string,
  registroId: number | null,
  fazendaId: number | null,
  sessao: SessaoPlanejada,
  anterior: unknown,
  posterior: unknown,
  extra: Omit<T, keyof PlanoBase>,
): Ok<T> | FalhaAdministracao {
  const auditoria = auditar(ctx, {
    modulo: "usuarios",
    operacao,
    registroTipo,
    registroId,
    fazendaId,
    dadosAnteriores: anterior,
    dadosPosteriores: posterior,
  });
  if (!auditoria) return falha("sem_identidade");
  return {
    ok: true,
    plano: {
      operacao,
      transacao: "unica",
      sessao,
      auditoria,
      ...extra,
    } as T,
  };
}

export function consultarUsuarios(
  ctx: ContextoAdministracao,
  usuarios: readonly UsuarioAdministravel[],
): { ok: true; usuarios: UsuarioVisivel[] } | FalhaAdministracao {
  const base = exigirContexto(ctx);
  if (base) return base;
  const pedido = pedidoDe(ctx);
  const permitido = CONSULTA_USUARIOS.some((id) => podeExecutarOperacao(pedido, id) === "permitido");
  if (!permitido) return falha(podeExecutarOperacao(pedido, "usuarios.criar"));
  const titular = ctx.acesso?.titularUserId;
  const visiveis = usuarios
    .filter((usuario) => usuario.titularUserId === titular)
    .map((usuario) => snapshotUsuario(usuario))
    .sort((a, b) => a.id - b.id);
  return { ok: true, usuarios: visiveis };
}

export function consultarUsuario(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
): { ok: true; usuario: UsuarioVisivel } | FalhaAdministracao {
  const lista = consultarUsuarios(ctx, [usuario]);
  if (!lista.ok) return lista;
  const achado = lista.usuarios[0];
  if (!achado) return falha("outro_titular");
  return { ok: true, usuario: achado };
}

export function planejarCriacaoUsuario(
  ctx: ContextoAdministracao,
  entrada: {
    name: string;
    email: string;
    papel: string;
    senha?: string | null;
    passwordHash?: string | null;
    openId?: string | null;
    token?: string | null;
    role?: string | null;
    titularUserId?: number | null;
    executorUserId?: number | null;
  },
  emailsExistentes: readonly { id: number; email: string | null }[],
): Ok<PlanoBase & { usuario: UsuarioVisivel & { sessionVersion: 0 } }> | FalhaAdministracao {
  const base = exigirContexto(ctx);
  if (base) return base;
  const decisao = podeCriarUsuario(pedidoDe(ctx), entrada.papel);
  if (decisao !== "permitido") return falha(decisao);
  const name = textoCurto(entrada.name, 255);
  if (!name) return falha("nome_invalido");
  const email = textoCurto(entrada.email, 255);
  if (!email) return falha("email_invalido");
  const duplicado = emailLivre(email, null, emailsExistentes);
  if (duplicado) return duplicado;
  const papel = entrada.papel as "comum" | "secundario";
  const usuario = {
    id: 0,
    name,
    email,
    papel,
    role: "user" as const,
    titularUserId: ctx.identidade.titularUserId,
    situacao: "ativo" as const,
    sessionVersion: 0 as const,
  };
  return fecharPlano(ctx, "usuario.criar", "users", null, null, {
    userId: null,
    invalidar: false,
    sessionVersionAtual: null,
    sessionVersionPrevista: 0,
  }, null, usuario, { usuario });
}

export function planejarEdicaoUsuario(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  entrada: { name?: string; email?: string; titularUserId?: number | null; senha?: string | null; openId?: string | null },
  emailsExistentes: readonly { id: number; email: string | null }[],
): Ok<PlanoBase & { usuario: UsuarioVisivel; titularPreservado: true }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.criar");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  const name = entrada.name == null ? usuario.name.trim() : textoCurto(entrada.name, 255);
  if (!name) return falha("nome_invalido");
  const email = entrada.email == null ? usuario.email : textoCurto(entrada.email, 255);
  if (!email) return falha("email_invalido");
  const emailMudou = !usuario.email || chaveEmail(usuario.email) !== chaveEmail(email);
  if (emailMudou) {
    const duplicado = emailLivre(email, usuario.id, emailsExistentes);
    if (duplicado) return duplicado;
  }
  if (name === usuario.name.trim() && !emailMudou) return falha("sem_alteracao");
  const posterior = snapshotUsuario({ ...usuario, name, email });
  const sessao = sessaoDoAlvo("usuario.editar", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "usuario.editar", "users", usuario.id, null, sessao, snapshotUsuario(usuario), posterior, {
    usuario: posterior,
    titularPreservado: true as const,
  });
}

export function planejarInativacaoUsuario(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
): Ok<PlanoBase & {
  usuario: UsuarioVisivel;
  permissoesPreservadas: true;
  fazendasPreservadas: true;
  historicoPreservado: true;
}> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.inativar");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  const sessao = sessaoDoAlvo("usuario.inativar", usuario);
  if (!sessao) return falha("alvo_invalido");
  const posterior = snapshotUsuario(usuario, { situacao: "inativo", sessionVersion: sessao.sessionVersionPrevista });
  return fecharPlano(ctx, "usuario.inativar", "users", usuario.id, null, sessao, snapshotUsuario(usuario), {
    ...posterior,
    inativadoPorUserId: ctx.identidade.id,
  }, {
    usuario: posterior,
    permissoesPreservadas: true as const,
    fazendasPreservadas: true as const,
    historicoPreservado: true as const,
  });
}

type EstadoRevisao = {
  executorUserId: number;
  userId: number;
  titularUserId: number;
  papel: PapelConta;
  situacao: SituacaoUsuario;
  sessionVersion: number;
  permissoesAtuais: string[];
  fazendasAtuais: number[];
  permissoesPropostas: string[];
  fazendasPropostas: number[];
};

export type RevisaoReativacao = {
  /**
   * Hash do estado e do executor. Não autentica a confirmação:
   * quem conhece esses dados consegue recalcular o mesmo hash.
   * Com rota real, a revisão precisa ficar guardada no servidor ou o selo precisa de assinatura.
   * A transação futura relê o estado e valida de novo.
   */
  selo: string;
  autenticacao: "nao_autenticada";
  estado: EstadoRevisao;
};

function listaUnica(valores: readonly string[]): { ok: true; valores: string[] } | FalhaAdministracao {
  const vistos = new Set<string>();
  for (const valor of valores) {
    if (vistos.has(valor)) return falha("proposta_duplicada", { permissao: valor });
    vistos.add(valor);
  }
  return { ok: true, valores: [...vistos].sort() };
}

function numerosUnicos(valores: readonly number[]): { ok: true; valores: number[] } | FalhaAdministracao {
  const vistos = new Set<number>();
  for (const valor of valores) {
    if (!Number.isInteger(valor) || valor <= 0) return falha("alvo_invalido", { fazendaId: valor });
    if (vistos.has(valor)) return falha("proposta_duplicada", { fazendaId: valor });
    vistos.add(valor);
  }
  return { ok: true, valores: [...vistos].sort((a, b) => a - b) };
}

function permissoesDoUsuario(
  usuario: UsuarioAdministravel,
  linhas: readonly LinhaPermissaoUsuario[],
): { ok: true; valores: string[] } | FalhaAdministracao {
  const ids: string[] = [];
  for (const linha of linhas) {
    if (linha.userId !== usuario.id || linha.titularUserId !== usuario.titularUserId) return falha("outro_titular");
    ids.push(linha.permissao);
  }
  return listaUnica(ids);
}

/**
 * Impressão determinística. Detecta mudança de estado ou de executor.
 * Não serve como autorização: o hash não prova que o servidor emitiu a revisão.
 */
export function seloDaRevisao(estado: EstadoRevisao): string {
  const texto = [
    estado.executorUserId,
    estado.userId,
    estado.titularUserId,
    estado.papel,
    estado.situacao,
    estado.sessionVersion,
    estado.permissoesAtuais.join(","),
    estado.fazendasAtuais.join(","),
    estado.permissoesPropostas.join(","),
    estado.fazendasPropostas.join(","),
  ].join("|");
  return createHash("sha256").update(texto).digest("hex");
}

function permissaoIrregular(permissao: string): boolean {
  const definicao = permissaoPorId(permissao);
  return !definicao || definicao.exclusivaDoPrincipal;
}

function fazendaDaConta(
  fazendas: readonly FazendaConhecida[],
  titularUserId: number,
  fazendaId: number,
): FazendaConhecida | null {
  return fazendas.find((fazenda) => fazenda.id === fazendaId && fazenda.userId === titularUserId) ?? null;
}

type DiffReativacao = {
  estado: EstadoRevisao;
  manterPermissoes: string[];
  concederPermissoes: string[];
  revogarPermissoes: string[];
  sanearPermissoes: string[];
  manterFazendas: number[];
  concederFazendas: number[];
  revogarFazendas: number[];
  sanearFazendas: number[];
  revalidarNaTransacao: true;
};

function validarPropostaReativacao(
  ctx: ContextoAdministracao,
  entrada: {
    usuario: UsuarioAdministravel;
    permissoesAtuais: readonly LinhaPermissaoUsuario[];
    fazendasAtuais: readonly number[];
    fazendasConhecidas: readonly FazendaConhecida[];
    permissoesPropostas: readonly string[];
    fazendasPropostas: readonly number[];
  },
): DiffReativacao | FalhaAdministracao {
  const atuaisPerm = permissoesDoUsuario(entrada.usuario, entrada.permissoesAtuais);
  if (!atuaisPerm.ok) return atuaisPerm;
  const atuaisFaz = numerosUnicos(entrada.fazendasAtuais);
  if (!atuaisFaz.ok) return atuaisFaz;
  const propostasPerm = listaUnica(entrada.permissoesPropostas);
  if (!propostasPerm.ok) return propostasPerm;
  const propostasFaz = numerosUnicos(entrada.fazendasPropostas);
  if (!propostasFaz.ok) return propostasFaz;

  const pedido = pedidoDe(ctx);
  const alvo = alvoDe(entrada.usuario);
  const principal = ctx.acesso?.papel === "principal";
  const conjuntoAtual = new Set(atuaisPerm.valores);
  const conjuntoProposto = new Set(propostasPerm.valores);
  const titular = entrada.usuario.titularUserId;

  for (const permissao of propostasPerm.valores) {
    if (conjuntoAtual.has(permissao) && permissaoIrregular(permissao)) {
      return falha("irregular_mantida", { permissao });
    }
    const decisao = podeConcederPermissao(pedido, alvo, permissao);
    if (decisao !== "permitido") return falha(decisao, { permissao });
  }
  const sanearPermissoes: string[] = [];
  const revogarPermissoes: string[] = [];
  for (const permissao of atuaisPerm.valores) {
    if (conjuntoProposto.has(permissao)) continue;
    if (permissaoIrregular(permissao)) {
      if (!principal) return falha("reservado_ao_principal", { permissao });
      sanearPermissoes.push(permissao);
      continue;
    }
    const decisao = podeConcederPermissao(pedido, alvo, permissao);
    if (decisao !== "permitido") return falha(decisao, { permissao });
    revogarPermissoes.push(permissao);
  }

  const sanearFazendas: number[] = [];
  const revogarFazendas: number[] = [];
  const conjuntoFazendaProposta = new Set(propostasFaz.valores);
  for (const fazendaId of propostasFaz.valores) {
    const daConta = fazendaDaConta(entrada.fazendasConhecidas, titular, fazendaId);
    if (!daConta) {
      if (atuaisFaz.valores.includes(fazendaId)) return falha("irregular_mantida", { fazendaId });
      const decisao = podeConcederFazenda(pedido, alvo, entrada.fazendasConhecidas.find((fazenda) => fazenda.id === fazendaId) ?? null);
      return falha(decisao === "permitido" ? "sem_fazenda" : decisao, { fazendaId });
    }
    const decisao = podeConcederFazenda(pedido, alvo, daConta);
    if (decisao !== "permitido") return falha(decisao, { fazendaId });
  }
  for (const fazendaId of atuaisFaz.valores) {
    if (conjuntoFazendaProposta.has(fazendaId)) continue;
    const daConta = fazendaDaConta(entrada.fazendasConhecidas, titular, fazendaId);
    if (!daConta) {
      if (!principal) return falha("reservado_ao_principal", { fazendaId });
      sanearFazendas.push(fazendaId);
      continue;
    }
    const decisao = podeConcederFazenda(pedido, alvo, daConta);
    if (decisao !== "permitido") return falha(decisao, { fazendaId });
    revogarFazendas.push(fazendaId);
  }

  return {
    estado: {
      executorUserId: ctx.identidade.id,
      userId: entrada.usuario.id,
      titularUserId: entrada.usuario.titularUserId,
      papel: entrada.usuario.papel,
      situacao: entrada.usuario.situacao,
      sessionVersion: entrada.usuario.sessionVersion,
      permissoesAtuais: atuaisPerm.valores,
      fazendasAtuais: atuaisFaz.valores,
      permissoesPropostas: propostasPerm.valores,
      fazendasPropostas: propostasFaz.valores,
    },
    manterPermissoes: propostasPerm.valores.filter((permissao) => conjuntoAtual.has(permissao)),
    concederPermissoes: propostasPerm.valores.filter((permissao) => !conjuntoAtual.has(permissao)),
    revogarPermissoes,
    sanearPermissoes,
    manterFazendas: propostasFaz.valores.filter((fazendaId) => atuaisFaz.valores.includes(fazendaId)),
    concederFazendas: propostasFaz.valores.filter((fazendaId) => !atuaisFaz.valores.includes(fazendaId)),
    revogarFazendas,
    sanearFazendas,
    revalidarNaTransacao: true,
  };
}

function podeRevisarReativacao(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
): FalhaAdministracao | null {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.inativar");
  if (alvo) return alvo;
  if (usuario.situacao !== "inativo") return falha("nao_inativo");
  if (!versaoValida(usuario.sessionVersion)) return falha("alvo_invalido");
  if (usuario.titularUserId !== ctx.identidade.titularUserId) return falha("outro_titular");
  return null;
}

export function emitirRevisaoReativacao(
  ctx: ContextoAdministracao,
  entrada: {
    usuario: UsuarioAdministravel;
    permissoesAtuais: readonly LinhaPermissaoUsuario[];
    fazendasAtuais: readonly number[];
    fazendasConhecidas: readonly FazendaConhecida[];
    permissoesPropostas: readonly string[];
    fazendasPropostas: readonly number[];
    confirmado?: boolean | null;
  },
): { ok: true; revisao: RevisaoReativacao } | FalhaAdministracao {
  const porta = podeRevisarReativacao(ctx, entrada.usuario);
  if (porta) return porta;
  const proposta = validarPropostaReativacao(ctx, entrada);
  if ("motivo" in proposta) return proposta;
  return {
    ok: true,
    revisao: {
      selo: seloDaRevisao(proposta.estado),
      autenticacao: "nao_autenticada",
      estado: proposta.estado,
    },
  };
}

export function planejarReativacao(
  ctx: ContextoAdministracao,
  entrada: {
    usuario: UsuarioAdministravel;
    permissoesAtuais: readonly LinhaPermissaoUsuario[];
    fazendasAtuais: readonly number[];
    fazendasConhecidas: readonly FazendaConhecida[];
    permissoesPropostas: readonly string[];
    fazendasPropostas: readonly number[];
    selo?: string | null;
    confirmado?: boolean | null;
    /** Ignorado como autorização. Só revela se a revisão foi emitida por outra pessoa. */
    executorDaRevisao?: number | null;
    executorUserId?: number | null;
    titularUserId?: number | null;
  },
): Ok<PlanoBase & DiffReativacao & {
  usuario: UsuarioVisivel;
  historicoPreservado: true;
}> | FalhaAdministracao {
  const porta = podeRevisarReativacao(ctx, entrada.usuario);
  if (porta) return porta;
  if (!entrada.selo) return falha("revisao_ausente");
  if (entrada.executorDaRevisao != null && entrada.executorDaRevisao !== ctx.identidade.id) {
    return falha("revisao_outro_executor");
  }
  const atuaisPerm = permissoesDoUsuario(entrada.usuario, entrada.permissoesAtuais);
  if (!atuaisPerm.ok) return atuaisPerm;
  const atuaisFaz = numerosUnicos(entrada.fazendasAtuais);
  if (!atuaisFaz.ok) return atuaisFaz;
  const propostasPerm = listaUnica(entrada.permissoesPropostas);
  if (!propostasPerm.ok) return propostasPerm;
  const propostasFaz = numerosUnicos(entrada.fazendasPropostas);
  if (!propostasFaz.ok) return propostasFaz;
  const estadoConferido: EstadoRevisao = {
    executorUserId: ctx.identidade.id,
    userId: entrada.usuario.id,
    titularUserId: entrada.usuario.titularUserId,
    papel: entrada.usuario.papel,
    situacao: entrada.usuario.situacao,
    sessionVersion: entrada.usuario.sessionVersion,
    permissoesAtuais: atuaisPerm.valores,
    fazendasAtuais: atuaisFaz.valores,
    permissoesPropostas: propostasPerm.valores,
    fazendasPropostas: propostasFaz.valores,
  };
  if (seloDaRevisao(estadoConferido) !== entrada.selo) return falha("revisao_desatualizada");
  const proposta = validarPropostaReativacao(ctx, entrada);
  if ("motivo" in proposta) return proposta;
  const sessao = sessaoDoAlvo("usuario.reativar", entrada.usuario);
  if (!sessao) return falha("alvo_invalido");
  const posterior = snapshotUsuario(entrada.usuario, { situacao: "ativo", sessionVersion: sessao.sessionVersionPrevista });
  return fecharPlano(
    ctx,
    "usuario.reativar",
    "users",
    entrada.usuario.id,
    null,
    sessao,
    {
      ...snapshotUsuario(entrada.usuario),
      permissoes: proposta.estado.permissoesAtuais,
      fazendas: proposta.estado.fazendasAtuais,
    },
    {
      ...posterior,
      permissoes: proposta.estado.permissoesPropostas,
      fazendas: proposta.estado.fazendasPropostas,
      saneamento: {
        permissoes: proposta.sanearPermissoes,
        fazendas: proposta.sanearFazendas,
      },
    },
    { ...proposta, usuario: posterior, historicoPreservado: true as const },
  );
}

export function planejarAlteracaoPapel(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  papelNovo: string,
): Ok<PlanoBase & { usuario: UsuarioVisivel; titularPreservado: true }> | FalhaAdministracao {
  const base = exigirContexto(ctx);
  if (base) return base;
  const decisao = podeAlterarPapel(pedidoDe(ctx), alvoDe(usuario), papelNovo);
  if (decisao !== "permitido") return falha(decisao);
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  if (papelNovo === usuario.papel) return falha("sem_alteracao");
  const sessao = sessaoDoAlvo("usuario.alterar_papel", usuario);
  if (!sessao) return falha("alvo_invalido");
  const posterior = snapshotUsuario(usuario, {
    papel: papelNovo as PapelConta,
    sessionVersion: sessao.sessionVersionPrevista,
  });
  return fecharPlano(ctx, "usuario.alterar_papel", "users", usuario.id, null, sessao, snapshotUsuario(usuario), posterior, {
    usuario: posterior,
    titularPreservado: true as const,
  });
}

function exigirGestaoDePermissoes(ctx: ContextoAdministracao): FalhaAdministracao | null {
  const base = exigirContexto(ctx);
  if (base) return base;
  return exigirOperacao(ctx, "usuarios.gerenciar_permissoes");
}

function delegarLista(ctx: ContextoAdministracao, permissoes: readonly string[]): FalhaAdministracao | null {
  const pedido = pedidoDe(ctx);
  for (const permissao of permissoes) {
    const decisao = podeDelegarPermissao(pedido, permissao);
    if (decisao !== "permitido") return falha(decisao, { permissao });
  }
  return null;
}

export function planejarCriacaoPerfil(
  ctx: ContextoAdministracao,
  entrada: {
    nome: string;
    descricao?: string | null;
    permissoes: readonly string[];
    titularUserId?: number | null;
  },
  existentes: readonly { titularUserId: number; nome: string }[],
): Ok<PlanoBase & { perfil: { titularUserId: number; nome: string; descricao: string | null; situacao: "ativo"; permissoes: string[] } }> | FalhaAdministracao {
  const gestao = exigirGestaoDePermissoes(ctx);
  if (gestao) return gestao;
  const teto = delegarLista(ctx, entrada.permissoes);
  if (teto) return teto;
  const planejado = planejarPerfil({
    titularUserId: ctx.identidade.titularUserId,
    nome: entrada.nome,
    descricao: entrada.descricao,
    criadoPorUserId: ctx.identidade.id,
    criadorTitularUserId: ctx.identidade.titularUserId,
    existentes,
    permissoes: entrada.permissoes,
  });
  if (!planejado.ok) return falha(planejado.motivo, { permissao: planejado.permissao });
  const perfil = { ...planejado.perfil, situacao: "ativo" as const };
  return fecharPlano(ctx, "perfil.criar", "perfis_acesso", null, null, {
    userId: null,
    invalidar: false,
    sessionVersionAtual: null,
    sessionVersionPrevista: 0,
  }, null, perfil, { perfil });
}

export function planejarEdicaoPerfil(
  ctx: ContextoAdministracao,
  perfil: PerfilConhecido,
  entrada: { nome: string; descricao?: string | null; permissoes: readonly string[] },
  existentes: readonly { id: number; titularUserId: number; nome: string }[],
): Ok<PlanoBase & {
  perfil: PerfilConhecido;
  copiasExistentes: "preservadas";
}> | FalhaAdministracao {
  const gestao = exigirGestaoDePermissoes(ctx);
  if (gestao) return gestao;
  if (perfil.titularUserId !== ctx.identidade.titularUserId) return falha("outro_titular");
  if (perfil.situacao !== "ativo") return falha("perfil_inativo");
  const teto = delegarLista(ctx, entrada.permissoes);
  if (teto) return teto;
  const planejado = planejarPerfil({
    titularUserId: perfil.titularUserId,
    nome: entrada.nome,
    descricao: entrada.descricao,
    criadoPorUserId: perfil.criadoPorUserId,
    criadorTitularUserId: ctx.identidade.titularUserId,
    existentes: existentes.filter((item) => item.id !== perfil.id),
    permissoes: entrada.permissoes,
  });
  if (!planejado.ok) return falha(planejado.motivo, { permissao: planejado.permissao });
  const posterior: PerfilConhecido = {
    ...perfil,
    nome: planejado.perfil.nome,
    descricao: planejado.perfil.descricao,
    permissoes: planejado.perfil.permissoes,
    criadoPorUserId: perfil.criadoPorUserId,
  };
  return fecharPlano(ctx, "perfil.editar", "perfis_acesso", perfil.id, null, {
    userId: null,
    invalidar: false,
    sessionVersionAtual: null,
    sessionVersionPrevista: 0,
  }, { id: perfil.id, nome: perfil.nome, permissoes: [...perfil.permissoes] }, posterior, {
    perfil: posterior,
    copiasExistentes: "preservadas" as const,
  });
}

export function planejarInativacaoPerfil(
  ctx: ContextoAdministracao,
  perfil: PerfilConhecido,
): Ok<PlanoBase & { perfil: PerfilConhecido; copiasExistentes: "preservadas" }> | FalhaAdministracao {
  const gestao = exigirGestaoDePermissoes(ctx);
  if (gestao) return gestao;
  if (perfil.titularUserId !== ctx.identidade.titularUserId) return falha("outro_titular");
  if (perfil.situacao !== "ativo") return falha("perfil_inativo");
  const posterior: PerfilConhecido = { ...perfil, situacao: "inativo", permissoes: [...perfil.permissoes] };
  return fecharPlano(ctx, "perfil.inativar", "perfis_acesso", perfil.id, null, {
    userId: null,
    invalidar: false,
    sessionVersionAtual: null,
    sessionVersionPrevista: 0,
  }, { id: perfil.id, nome: perfil.nome, situacao: perfil.situacao }, posterior, {
    perfil: posterior,
    copiasExistentes: "preservadas" as const,
  });
}

export function consultarPerfis(
  ctx: ContextoAdministracao,
  perfis: readonly PerfilConhecido[],
): { ok: true; perfis: PerfilConhecido[] } | FalhaAdministracao {
  const gestao = exigirGestaoDePermissoes(ctx);
  if (gestao) return gestao;
  return {
    ok: true,
    perfis: perfis.filter((perfil) => perfil.titularUserId === ctx.identidade.titularUserId),
  };
}

function linha(usuario: UsuarioAdministravel, permissao: string, origemPerfilId: number | null, concedidoPorUserId: number): LinhaPermissaoUsuario {
  return {
    userId: usuario.id,
    titularUserId: usuario.titularUserId,
    permissao,
    concedidoPorUserId,
    origemPerfilId,
  };
}

export function planejarConcessaoPermissao(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  linhasAtuais: readonly LinhaPermissaoUsuario[],
  permissao: string,
): Ok<PlanoBase & { novas: LinhaPermissaoUsuario[] }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_permissoes");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  const decisao = podeConcederPermissao(pedidoDe(ctx), alvoDe(usuario), permissao);
  if (decisao !== "permitido") return falha(decisao, { permissao });
  const copia = concederPermissaoAvulsa({
    usuario: { id: usuario.id, titularUserId: usuario.titularUserId, permissoes: linhasAtuais },
    permissao,
    concedidoPorUserId: ctx.identidade.id,
    concedenteTitularUserId: ctx.identidade.titularUserId,
  });
  if (!copia.ok) return falha(copia.motivo, { permissao: copia.permissao });
  const sessao = sessaoDoAlvo("permissao.conceder", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "permissao.conceder", "usuario_permissoes", usuario.id, null, sessao, {
    permissoes: permissoesEfetivas(linhasAtuais),
  }, { permissoes: permissoesEfetivas(copia.efetivas) }, { novas: copia.novas });
}

function exigirSaneamento(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
): FalhaAdministracao | null {
  const base = exigirContexto(ctx);
  if (base) return base;
  if (ctx.acesso?.papel === "comum") return falha("sem_permissao");
  if (ctx.acesso?.papel !== "principal") return falha("reservado_ao_principal");
  if (usuario.id === ctx.identidade.id) return falha("auto_modificacao");
  if (usuario.papel === "principal") return falha("alvo_protegido");
  if (usuario.titularUserId !== ctx.identidade.titularUserId) return falha("outro_titular");
  if (!Number.isInteger(usuario.id) || usuario.id <= 0 || !versaoValida(usuario.sessionVersion)) return falha("alvo_invalido");
  return null;
}

/** Exceção só de remoção. Não passa por podeDelegarPermissao e não concede nada. */
export function planejarSaneamentoPermissao(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  linhasAtuais: readonly LinhaPermissaoUsuario[],
  permissao: string,
): Ok<PlanoBase & {
  revogada: string;
  restantes: string[];
  titularPreservado: true;
  concessao: false;
}> | FalhaAdministracao {
  const porta = exigirSaneamento(ctx, usuario);
  if (porta) return porta;
  const possuiLinha = linhasAtuais.some((item) => item.userId === usuario.id && item.titularUserId === usuario.titularUserId && item.permissao === permissao);
  if (!possuiLinha) return falha("permissao_ausente", { permissao });
  if (!permissaoIrregular(permissao)) return falha("saneamento_recusado", { permissao });
  const restantes = linhasAtuais.filter((item) => item.permissao !== permissao);
  const sessao = sessaoDoAlvo("permissao.sanear", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "permissao.sanear", "usuario_permissoes", usuario.id, null, sessao, {
    permissoes: permissoesEfetivas(linhasAtuais),
  }, {
    removida: permissao,
    permissoes: permissoesEfetivas(restantes),
    titularUserId: usuario.titularUserId,
  }, {
    revogada: permissao,
    restantes: permissoesEfetivas(restantes),
    titularPreservado: true as const,
    concessao: false as const,
  });
}

export function planejarRevogacaoPermissao(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  linhasAtuais: readonly LinhaPermissaoUsuario[],
  permissao: string,
): Ok<PlanoBase & { revogada: string; restantes: string[] }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_permissoes");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  const possuiLinha = linhasAtuais.some((item) => item.userId === usuario.id && item.permissao === permissao);
  if (!possuiLinha) return falha("permissao_ausente", { permissao });
  const decisao = podeConcederPermissao(pedidoDe(ctx), alvoDe(usuario), permissao);
  if (decisao !== "permitido") return falha(decisao, { permissao });
  const restantes = linhasAtuais.filter((item) => item.permissao !== permissao);
  const sessao = sessaoDoAlvo("permissao.revogar", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "permissao.revogar", "usuario_permissoes", usuario.id, null, sessao, {
    permissoes: permissoesEfetivas(linhasAtuais),
  }, { permissoes: permissoesEfetivas(restantes) }, {
    revogada: permissao,
    restantes: permissoesEfetivas(restantes),
  });
}

export function planejarConjuntoPermissoes(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  linhasAtuais: readonly LinhaPermissaoUsuario[],
  permissoes: readonly string[],
): Ok<PlanoBase & { novas: LinhaPermissaoUsuario[] }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_permissoes");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  if (permissoes.length === 0) return falha("permissao_invalida");
  const unicas = listaUnica(permissoes);
  if (!unicas.ok) return unicas;
  const pedido = pedidoDe(ctx);
  for (const permissao of unicas.valores) {
    const decisao = podeConcederPermissao(pedido, alvoDe(usuario), permissao);
    if (decisao !== "permitido") return falha(decisao, { permissao });
    if (linhasAtuais.some((item) => item.permissao === permissao)) return falha("concessao_duplicada", { permissao });
  }
  const novas = unicas.valores.map((permissao) => linha(usuario, permissao, null, ctx.identidade.id));
  const sessao = sessaoDoAlvo("permissao.conceder", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "permissao.conceder", "usuario_permissoes", usuario.id, null, sessao, {
    permissoes: permissoesEfetivas(linhasAtuais),
  }, { permissoes: permissoesEfetivas([...linhasAtuais, ...novas]) }, { novas });
}

export function consultarPermissoesEfetivas(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  linhas: readonly LinhaPermissaoUsuario[],
): { ok: true; permissoes: string[] } | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_permissoes");
  if (alvo) return alvo;
  const proprias = permissoesDoUsuario(usuario, linhas);
  if (!proprias.ok) return proprias;
  return { ok: true, permissoes: permissoesEfetivas(linhas.filter((item) => item.userId === usuario.id)) };
}

export function planejarAplicacaoPerfil(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  linhasAtuais: readonly LinhaPermissaoUsuario[],
  perfil: PerfilConhecido,
): Ok<PlanoBase & { novas: LinhaPermissaoUsuario[]; perfilInalterado: true }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_permissoes");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  if (perfil.titularUserId !== usuario.titularUserId) return falha("outro_titular");
  const pedido = pedidoDe(ctx);
  for (const permissao of perfil.permissoes) {
    const decisao = podeConcederPermissao(pedido, alvoDe(usuario), permissao);
    if (decisao !== "permitido") return falha(decisao, { permissao });
  }
  const copia = copiarPermissoesDoPerfil({
    perfil,
    usuario: { id: usuario.id, titularUserId: usuario.titularUserId, permissoes: linhasAtuais },
    concedidoPorUserId: ctx.identidade.id,
    concedenteTitularUserId: ctx.identidade.titularUserId,
  });
  if (!copia.ok) return falha(copia.motivo, { permissao: copia.permissao });
  const sessao = sessaoDoAlvo("perfil.aplicar", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "perfil.aplicar", "usuario_permissoes", usuario.id, null, sessao, {
    perfilId: perfil.id,
    permissoes: permissoesEfetivas(linhasAtuais),
  }, {
    perfilId: perfil.id,
    permissoes: permissoesEfetivas(copia.efetivas),
  }, { novas: copia.novas, perfilInalterado: true as const });
}

export function fazendasDoExecutor(
  ctx: ContextoAdministracao,
): { ok: true; origem: "implicita" | "concedida"; fazendaIds: number[]; criarVinculo: false } | FalhaAdministracao {
  const base = exigirContexto(ctx);
  if (base) return base;
  const acesso = ctx.acesso;
  if (!acesso) return falha("sem_identidade");
  return {
    ok: true,
    origem: acesso.papel === "principal" ? "implicita" : "concedida",
    fazendaIds: [...acesso.fazendasAutorizadas],
    criarVinculo: false,
  };
}

export function consultarFazendasDoUsuario(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  fazendasConhecidas: readonly FazendaConhecida[],
  vinculos: readonly VinculoFazenda[],
): { ok: true; origem: "concedida"; fazendaIds: number[]; criarVinculo: false } | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_acessos");
  if (alvo) return alvo;
  const daConta = new Set(
    fazendasConhecidas.filter((fazenda) => fazenda.userId === ctx.identidade.titularUserId).map((fazenda) => fazenda.id),
  );
  const ids = vinculos
    .filter((vinculo) => vinculo.userId === usuario.id && daConta.has(vinculo.fazendaId))
    .map((vinculo) => vinculo.fazendaId)
    .sort((a, b) => a - b);
  return { ok: true, origem: "concedida", fazendaIds: [...new Set(ids)], criarVinculo: false };
}

function vinculoExiste(vinculos: readonly VinculoFazenda[], userId: number, fazendaId: number): boolean {
  return vinculos.some((vinculo) => vinculo.userId === userId && vinculo.fazendaId === fazendaId);
}

export function planejarConcessaoFazenda(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  fazenda: FazendaConhecida | null,
  vinculos: readonly VinculoFazenda[],
): Ok<PlanoBase & { vinculo: { userId: number; fazendaId: number; concedidoPorUserId: number } }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_acessos");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  const decisao = podeConcederFazenda(pedidoDe(ctx), alvoDe(usuario), fazenda);
  if (decisao !== "permitido" || !fazenda) return falha(decisao === "permitido" ? "sem_fazenda" : decisao, { fazendaId: fazenda?.id });
  if (vinculoExiste(vinculos, usuario.id, fazenda.id)) return falha("vinculo_existente", { fazendaId: fazenda.id });
  const sessao = sessaoDoAlvo("fazenda.conceder", usuario);
  if (!sessao) return falha("alvo_invalido");
  const vinculo = { userId: usuario.id, fazendaId: fazenda.id, concedidoPorUserId: ctx.identidade.id };
  return fecharPlano(ctx, "fazenda.conceder", "usuario_fazendas", usuario.id, fazenda.id, sessao, null, {
    ...vinculo,
    concedidoPorUserId: ctx.identidade.id,
  }, { vinculo });
}

/** Tira vínculo cuja fazenda já não é da conta. Não muda o dono da fazenda nem o movimento operacional. */
export function planejarSaneamentoFazenda(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  fazendaId: number,
  vinculos: readonly VinculoFazenda[],
  fazendasConhecidas: readonly FazendaConhecida[],
): Ok<PlanoBase & {
  fazendaId: number;
  proprietarioInalterado: true;
  registrosOperacionaisInalterados: true;
  concessao: false;
}> | FalhaAdministracao {
  const porta = exigirSaneamento(ctx, usuario);
  if (porta) return porta;
  if (!Number.isInteger(fazendaId) || fazendaId <= 0) return falha("alvo_invalido", { fazendaId });
  if (!vinculoExiste(vinculos, usuario.id, fazendaId)) return falha("vinculo_ausente", { fazendaId });
  if (fazendaDaConta(fazendasConhecidas, usuario.titularUserId, fazendaId)) {
    return falha("saneamento_recusado", { fazendaId });
  }
  const sessao = sessaoDoAlvo("fazenda.sanear", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "fazenda.sanear", "usuario_fazendas", usuario.id, fazendaId, sessao, {
    userId: usuario.id,
    fazendaId,
    inconsistente: true,
  }, {
    removida: fazendaId,
    titularUserId: usuario.titularUserId,
  }, {
    fazendaId,
    proprietarioInalterado: true as const,
    registrosOperacionaisInalterados: true as const,
    concessao: false as const,
  });
}

export function planejarRevogacaoFazenda(
  ctx: ContextoAdministracao,
  usuario: UsuarioAdministravel,
  fazenda: FazendaConhecida | null,
  vinculos: readonly VinculoFazenda[],
): Ok<PlanoBase & { fazendaId: number }> | FalhaAdministracao {
  const alvo = exigirAlvo(ctx, usuario, "usuarios.gerenciar_acessos");
  if (alvo) return alvo;
  const ativo = exigirAtivo(usuario);
  if (ativo) return ativo;
  const decisao = podeConcederFazenda(pedidoDe(ctx), alvoDe(usuario), fazenda);
  if (decisao !== "permitido" || !fazenda) return falha(decisao === "permitido" ? "sem_fazenda" : decisao, { fazendaId: fazenda?.id });
  if (!vinculoExiste(vinculos, usuario.id, fazenda.id)) return falha("vinculo_ausente", { fazendaId: fazenda.id });
  const sessao = sessaoDoAlvo("fazenda.revogar", usuario);
  if (!sessao) return falha("alvo_invalido");
  return fecharPlano(ctx, "fazenda.revogar", "usuario_fazendas", usuario.id, fazenda.id, sessao, {
    userId: usuario.id,
    fazendaId: fazenda.id,
  }, null, { fazendaId: fazenda.id });
}
