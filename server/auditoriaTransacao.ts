import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import {
  prepararEvento,
  type EntradaEventoAuditoria,
  type LinhaAuditoria,
} from "./auditoria";

export class AuditoriaRecusada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "AuditoriaRecusada";
  }
}

export type ControleTransacao = {
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

export type GravacaoAuditoria = {
  inserirEvento(linha: LinhaAuditoria): Promise<void>;
};

export type VinculoFazendaNovo = {
  userId: number;
  fazendaId: number;
  concedidoPorUserId: number;
};

export type GravacaoConcessao = GravacaoAuditoria & {
  inserirVinculo(vinculo: VinculoFazendaNovo): Promise<void>;
};

/** Confirma as duas gravações juntas. Se uma falha, desfaz as duas. */
export async function concluirTransacao<T>(
  controle: ControleTransacao,
  trabalho: () => Promise<T>,
): Promise<T> {
  try {
    const resultado = await trabalho();
    await controle.commit();
    return resultado;
  } catch (erro) {
    await controle.rollback();
    throw erro;
  }
}

export async function registrarEvento(
  tx: GravacaoAuditoria,
  identidade: IdentidadeUsuario | null,
  entrada: EntradaEventoAuditoria,
): Promise<LinhaAuditoria> {
  const linha = prepararEvento(identidade, entrada);
  if (!linha) throw new AuditoriaRecusada("Auditoria recusada: identidade ou evento inválido.");
  await tx.inserirEvento(linha);
  return linha;
}

/**
 * Exemplo do padrão: o vínculo e o evento usam a mesma transação.
 * Não concede acesso sozinho; quem chama entrega o gravador da transação aberta.
 */
export async function concederAcessoComAuditoria(
  tx: GravacaoConcessao,
  identidade: IdentidadeUsuario | null,
  entrada: EntradaEventoAuditoria & { userId?: number; fazendaId?: number | null },
): Promise<LinhaAuditoria> {
  const userId = entrada.userId;
  const fazendaId = entrada.fazendaId;
  if (!Number.isInteger(userId) || !userId || userId <= 0) {
    throw new AuditoriaRecusada("Concessão recusada: usuário inválido.");
  }
  if (!Number.isInteger(fazendaId) || !fazendaId || fazendaId <= 0) {
    throw new AuditoriaRecusada("Concessão recusada: fazenda inválida.");
  }
  if (!identidade) throw new AuditoriaRecusada("Concessão recusada: sem executor.");

  await tx.inserirVinculo({
    userId,
    fazendaId,
    concedidoPorUserId: identidade.id,
  });
  return registrarEvento(tx, identidade, {
    ...entrada,
    fazendaId,
    modulo: entrada.modulo || "administrativo",
    operacao: entrada.operacao || "conceder_acesso_fazenda",
    registroTipo: entrada.registroTipo ?? "usuario_fazendas",
    dadosPosteriores: entrada.dadosPosteriores ?? {
      userId,
      fazendaId,
      concedidoPorUserId: identidade.id,
    },
  });
}
