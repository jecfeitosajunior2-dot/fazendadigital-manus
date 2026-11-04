import type { IdentidadeUsuario, PapelConta } from "./_core/identidadeSessao";
import { loginPermitido } from "./_core/identidadeSessao";

export type FazendaConhecida = {
  id: number;
  userId: number;
};

export type VinculoFazenda = {
  userId: number;
  fazendaId: number;
};

export type AcessoResolvido = {
  executorUserId: number;
  titularUserId: number;
  papel: PapelConta;
  fazendasAutorizadas: number[];
};

export type DecisaoFazenda =
  | "permitido"
  | "sem_identidade"
  | "inexistente"
  | "outro_titular"
  | "sem_autorizacao";

export type EntradaAcesso = {
  identidade: IdentidadeUsuario | null;
  fazendasDoTitular: FazendaConhecida[];
  vinculos: VinculoFazenda[];
  /** Ignorado. O titular vem da identidade confirmada no banco. */
  titularInformadoPeloCliente?: number | null;
  /** Ignorado. A lista autorizada não vem do navegador. */
  fazendasInformadasPeloCliente?: number[] | null;
};

function idsValidos(ids: number[]): number[] {
  return [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

/** Monta o acesso a partir da identidade do banco. Não altera as fazendas recebidas. */
export function montarAcesso(entrada: EntradaAcesso): AcessoResolvido | null {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return null;
  if (!Number.isInteger(identidade.titularUserId) || identidade.titularUserId <= 0) return null;
  if (!Number.isInteger(identidade.id) || identidade.id <= 0) return null;

  const doTitular = idsValidos(
    entrada.fazendasDoTitular
      .filter(fazenda => fazenda.userId === identidade.titularUserId)
      .map(fazenda => fazenda.id),
  );

  if (identidade.papel === "principal") {
    return {
      executorUserId: identidade.id,
      titularUserId: identidade.titularUserId,
      papel: identidade.papel,
      fazendasAutorizadas: doTitular,
    };
  }

  const concedidas = new Set(
    entrada.vinculos
      .filter(vinculo => vinculo.userId === identidade.id)
      .map(vinculo => vinculo.fazendaId),
  );
  return {
    executorUserId: identidade.id,
    titularUserId: identidade.titularUserId,
    papel: identidade.papel,
    fazendasAutorizadas: doTitular.filter(id => concedidas.has(id)),
  };
}

export function avaliarAcessoFazenda(
  acesso: AcessoResolvido | null,
  fazenda: FazendaConhecida | null,
): DecisaoFazenda {
  if (!acesso) return "sem_identidade";
  if (!fazenda || !Number.isInteger(fazenda.id) || fazenda.id <= 0) return "inexistente";
  if (fazenda.userId !== acesso.titularUserId) return "outro_titular";
  if (acesso.papel === "principal") return "permitido";
  if (acesso.fazendasAutorizadas.includes(fazenda.id)) return "permitido";
  return "sem_autorizacao";
}
