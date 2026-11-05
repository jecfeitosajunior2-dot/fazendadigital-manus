import type { PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { avaliarAcessoFazenda, type AcessoResolvido, type FazendaConhecida } from "./acessoFazendas";
import { permissaoExigeFazenda, permissaoPorId } from "./catalogoPermissoes";

export type DecisaoAutorizacao =
  | "permitido"
  | "sem_identidade"
  | "outro_titular"
  | "sem_permissao"
  | "sem_fazenda"
  | "auto_modificacao"
  | "acima_do_teto"
  | "reservado_ao_principal"
  | "hierarquia_recusada"
  | "alvo_protegido"
  | "permissao_invalida"
  | "alvo_invalido";

export type AlvoUsuario = {
  id: number;
  titularUserId: number;
  papel: PapelConta;
  situacao: SituacaoUsuario;
};

export type PedidoAutorizacao = {
  acesso: AcessoResolvido | null;
  /** Permissões concedidas no servidor. O principal não depende desta lista. */
  permissoes: readonly string[];
  /** Ignorado. O navegador não escolhe a autorização. */
  permissoesInformadasPeloCliente?: readonly string[] | null;
  papelInformadoPeloCliente?: string | null;
};

function possui(pedido: PedidoAutorizacao, id: string): boolean {
  if (pedido.acesso?.papel === "principal") return true;
  return pedido.permissoes.includes(id);
}

function alvoAdministravel(pedido: PedidoAutorizacao, alvo: AlvoUsuario | null): DecisaoAutorizacao | null {
  const acesso = pedido.acesso;
  if (!acesso) return "sem_identidade";
  if (!alvo || !Number.isInteger(alvo.id) || alvo.id <= 0) return "alvo_invalido";
  if (!Number.isInteger(alvo.titularUserId) || alvo.titularUserId !== acesso.titularUserId) return "outro_titular";
  if (alvo.papel === "principal") return "alvo_protegido";
  if (acesso.papel === "comum") return "sem_permissao";
  if (acesso.executorUserId === alvo.id) return "auto_modificacao";
  if (acesso.papel === "secundario" && alvo.papel !== "comum") return "reservado_ao_principal";
  return null;
}

/** Operação e fazenda são decisões separadas. Falta uma das duas e o acesso nega. */
export function podeExecutarOperacao(
  pedido: PedidoAutorizacao,
  permissaoId: string,
  fazenda?: FazendaConhecida | null,
): DecisaoAutorizacao {
  const definicao = permissaoPorId(permissaoId);
  if (!definicao) return "permissao_invalida";
  const acesso = pedido.acesso;
  if (!acesso) return "sem_identidade";
  if (definicao.exclusivaDoPrincipal && acesso.papel !== "principal") return "reservado_ao_principal";
  if (acesso.papel === "comum" && (definicao.modulo === "usuarios" || definicao.modulo === "auditoria")) return "sem_permissao";
  if (!possui(pedido, definicao.id)) return "sem_permissao";
  if (!permissaoExigeFazenda(definicao)) return "permitido";
  const fazendaDecisao = avaliarAcessoFazenda(acesso, fazenda ?? null);
  if (fazendaDecisao === "permitido") return "permitido";
  if (fazendaDecisao === "outro_titular") return "outro_titular";
  if (fazendaDecisao === "sem_identidade") return "sem_identidade";
  return "sem_fazenda";
}

export function podeAdministrarUsuario(pedido: PedidoAutorizacao, alvo: AlvoUsuario | null): DecisaoAutorizacao {
  return alvoAdministravel(pedido, alvo) ?? "permitido";
}

/** Teto para copiar uma permissão a um perfil ou a outra pessoa. Não escolhe o alvo. */
function limiteDeDelegacao(pedido: PedidoAutorizacao, permissaoId: string): DecisaoAutorizacao | null {
  const definicao = permissaoPorId(permissaoId);
  if (!definicao) return "permissao_invalida";
  if (definicao.exclusivaDoPrincipal) return "reservado_ao_principal";
  if (!pedido.acesso) return "sem_identidade";
  if (pedido.acesso.papel === "comum") return "sem_permissao";
  if (!possui(pedido, "usuarios.gerenciar_permissoes")) return "sem_permissao";
  if (pedido.acesso.papel !== "principal" && !pedido.permissoes.includes(definicao.id)) return "acima_do_teto";
  return null;
}

export function podeDelegarPermissao(pedido: PedidoAutorizacao, permissaoId: string): DecisaoAutorizacao {
  return limiteDeDelegacao(pedido, permissaoId) ?? "permitido";
}

export function podeConcederPermissao(
  pedido: PedidoAutorizacao,
  alvo: AlvoUsuario | null,
  permissaoId: string,
): DecisaoAutorizacao {
  const definicao = permissaoPorId(permissaoId);
  if (!definicao) return "permissao_invalida";
  if (definicao.exclusivaDoPrincipal) return "reservado_ao_principal";
  const administracao = alvoAdministravel(pedido, alvo);
  if (administracao) return administracao;
  return podeDelegarPermissao(pedido, permissaoId);
}

export function podeConcederFazenda(
  pedido: PedidoAutorizacao,
  alvo: AlvoUsuario | null,
  fazenda: FazendaConhecida | null,
): DecisaoAutorizacao {
  const administracao = alvoAdministravel(pedido, alvo);
  if (administracao) return administracao;
  if (!possui(pedido, "usuarios.gerenciar_acessos")) return "sem_permissao";
  const fazendaDecisao = avaliarAcessoFazenda(pedido.acesso, fazenda);
  if (fazendaDecisao === "permitido") return "permitido";
  if (fazendaDecisao === "outro_titular") return "outro_titular";
  return "sem_fazenda";
}

export function podeCriarUsuario(pedido: PedidoAutorizacao, papelNovo: string): DecisaoAutorizacao {
  if (papelNovo !== "comum" && papelNovo !== "secundario" && papelNovo !== "principal") return "alvo_invalido";
  if (!pedido.acesso) return "sem_identidade";
  if (papelNovo === "principal") return "hierarquia_recusada";
  if (papelNovo === "secundario") {
    return pedido.acesso.papel === "principal" ? "permitido" : "reservado_ao_principal";
  }
  if (pedido.acesso.papel === "comum") return "sem_permissao";
  if (!possui(pedido, "usuarios.criar")) return "sem_permissao";
  return "permitido";
}

export function podeAlterarPapel(
  pedido: PedidoAutorizacao,
  alvo: AlvoUsuario | null,
  papelNovo: string,
): DecisaoAutorizacao {
  if (papelNovo !== "comum" && papelNovo !== "secundario" && papelNovo !== "principal") return "alvo_invalido";
  if (papelNovo === "principal") return "hierarquia_recusada";
  const administracao = alvoAdministravel(pedido, alvo);
  if (administracao) return administracao;
  if (pedido.acesso?.papel !== "principal") return "reservado_ao_principal";
  return "permitido";
}
