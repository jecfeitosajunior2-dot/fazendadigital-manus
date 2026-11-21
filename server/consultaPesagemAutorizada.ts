import { TRPCError } from "@trpc/server";
import { isObservacaoPesagemOrigemDesmama } from "../shared/desmamaManejo";
import { autorizarOperacaoPersistida, type ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * A pesagem não tem fazenda própria. A fazenda do dia sai do animal e das
 * transferências. No mesmo dia da mudança, as duas fazendas precisam estar
 * concedidas, porque a coluna só guarda a data, sem a hora.
 * Sem transferência registrada, só existe a fazenda atual do animal.
 */
export const PERMISSAO_CONSULTAR_PESAGEM = "pesagens.visualizar";

export const MSG_SEM_PERMISSAO_CONSULTA_PESAGEM = "Sem permissão para consultar as pesagens.";

export const MSG_EXCLUSAO_FISICA_PESAGEM =
  "A exclusão da pesagem está bloqueada. Apagar a linha deixaria o peso do animal, a desmama, o nascimento ou a compra sem o histórico. Para corrigir um número, registre uma nova pesagem.";

export function recusarPesagemSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhuma pesagem foi consultada ou alterada.",
  });
}

export function recusarExclusaoFisicaPesagem(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: MSG_EXCLUSAO_FISICA_PESAGEM,
  });
}

export type VinculoPesagem = "comum" | "desmama" | "nascimento" | "compra";

export function vinculoDaPesagem(row: {
  observacoes?: string | null;
  compraRecebimentoId?: number | null;
}): VinculoPesagem {
  if (row.compraRecebimentoId != null) return "compra";
  const texto = (row.observacoes ?? "").trim().toLowerCase();
  if (texto === "peso ao nascimento") return "nascimento";
  if (isObservacaoPesagemOrigemDesmama(row.observacoes)) return "desmama";
  return "comum";
}

export type MovimentoFazendaPesagem = {
  data: string | null;
  fazendaOrigemId: number | null;
  fazendaDestinoId: number | null;
};

export function fazendasDaPesagem(entrada: {
  data: string;
  fazendaAtualId: number | null;
  movimentos: readonly MovimentoFazendaPesagem[];
}): number[] {
  const data = String(entrada.data ?? "").slice(0, 10);
  const movimentos = entrada.movimentos
    .map((movimento) => ({
      data: movimento.data ? String(movimento.data).slice(0, 10) : null,
      fazendaOrigemId: movimento.fazendaOrigemId,
      fazendaDestinoId: movimento.fazendaDestinoId,
    }))
    .filter((movimento) => movimento.data)
    .sort((a, b) => a.data!.localeCompare(b.data!));
  if (movimentos.length === 0) {
    return entrada.fazendaAtualId != null ? [entrada.fazendaAtualId] : [];
  }
  const noDia = movimentos.filter((movimento) => movimento.data === data);
  if (noDia.length > 0) {
    const ids = new Set<number>();
    for (const movimento of noDia) {
      if (movimento.fazendaOrigemId != null) ids.add(movimento.fazendaOrigemId);
      if (movimento.fazendaDestinoId != null) ids.add(movimento.fazendaDestinoId);
    }
    if (ids.size > 0) return [...ids];
  }
  const anteriores = movimentos.filter((movimento) => movimento.data! < data);
  if (anteriores.length > 0) {
    const ultimo = anteriores[anteriores.length - 1]!;
    const fazenda = ultimo.fazendaDestinoId ?? ultimo.fazendaOrigemId ?? entrada.fazendaAtualId;
    return fazenda != null ? [fazenda] : [];
  }
  const primeiro = movimentos[0]!;
  const origem = primeiro.fazendaOrigemId ?? primeiro.fazendaDestinoId ?? entrada.fazendaAtualId;
  return origem != null ? [origem] : [];
}

export type AnimalDaPesagem = {
  id: number;
  userId: number;
  fazendaId: number | null;
};

export function filtrarPesagensVisiveis<T extends { animalId: number; data: string }>(entrada: {
  pesagens: readonly T[];
  animais: readonly AnimalDaPesagem[];
  movimentos: readonly (MovimentoFazendaPesagem & { animalId: number })[];
  titularUserId: number;
  principal: boolean;
  fazendasAutorizadas: readonly number[];
}): T[] {
  const animais = new Map(entrada.animais.map((animal) => [animal.id, animal]));
  const movimentos = new Map<number, MovimentoFazendaPesagem[]>();
  for (const movimento of entrada.movimentos) {
    const lista = movimentos.get(movimento.animalId) ?? [];
    lista.push(movimento);
    movimentos.set(movimento.animalId, lista);
  }
  const concedidas = new Set(entrada.fazendasAutorizadas);
  return entrada.pesagens.filter((pesagem) => {
    const animal = animais.get(pesagem.animalId);
    if (!animal || animal.userId !== entrada.titularUserId) return entrada.principal;
    if (entrada.principal) return true;
    const exigidas = fazendasDaPesagem({
      data: pesagem.data,
      fazendaAtualId: animal.fazendaId,
      movimentos: movimentos.get(animal.id) ?? [],
    });
    if (exigidas.length === 0) return false;
    return exigidas.every((fazendaId) => concedidas.has(fazendaId));
  });
}

export type PesagemLista = {
  id: number;
  userId: number;
  animalId: number;
  peso: string;
  data: string;
  observacoes: string | null;
  createdAt: Date | string | null;
  compraRecebimentoId: number | null;
};

export type ConsultaListaPesagens = ConsultaAutorizacaoPersistida & {
  pesagens(titularUserId: number, animalId?: number): Promise<PesagemLista[]>;
  animaisDasPesagens(titularUserId: number, ids: number[]): Promise<AnimalDaPesagem[]>;
  movimentosDosAnimais(
    titularUserId: number,
    ids: number[],
  ): Promise<Array<MovimentoFazendaPesagem & { animalId: number }>>;
};

export type IoListaPesagens = {
  emTransacao<T>(fn: (tx: ConsultaListaPesagens) => Promise<T>): Promise<T>;
};

export type PedidoListaPesagens = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  animalId?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type RecusaListaPesagens = {
  ok: false;
  motivo: MotivoOperacional | "sem_permissao";
  mensagem?: string;
};

export async function listarPesagensAutorizadas(
  io: IoListaPesagens,
  pedido: PedidoListaPesagens,
): Promise<{ ok: true; pesagens: PesagemLista[] } | RecusaListaPesagens> {
  return io.emTransacao(async (tx) => {
    const usuario = await tx.usuario(pedido.executorId);
    if (!usuario || usuario.titularUserId == null || usuario.situacao !== "ativo") {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    if (
      pedido.sessionVersionDaSessao != null
      && pedido.sessionVersionDaSessao !== usuario.sessionVersion
    ) {
      return { ok: false, motivo: "sem_identidade", mensagem: "Sessão inválida." };
    }
    const titularUserId = usuario.titularUserId;
    const principal = usuario.papel === "principal";
    const fazendas = await tx.fazendasDoTitular(titularUserId);
    const autorizadas: number[] = [];
    if (!principal) {
      const permissoes = await tx.permissoes(usuario.id, titularUserId);
      if (!permissoes.includes(PERMISSAO_CONSULTAR_PESAGEM)) {
        return { ok: false, motivo: "sem_permissao", mensagem: MSG_SEM_PERMISSAO_CONSULTA_PESAGEM };
      }
    }
    for (const fazenda of fazendas) {
      const deciso = await autorizarOperacaoPersistida(tx, {
        executorId: pedido.executorId,
        sessionVersionDaSessao: pedido.sessionVersionDaSessao,
        permissaoId: PERMISSAO_CONSULTAR_PESAGEM,
        fazendaId: fazenda.id,
        titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
        papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
        permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
        fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
      });
      if (!deciso.ok) {
        if (deciso.motivo === "sem_identidade" || deciso.motivo === "sem_permissao") {
          return {
            ok: false,
            motivo: deciso.motivo,
            mensagem: deciso.motivo === "sem_permissao"
              ? MSG_SEM_PERMISSAO_CONSULTA_PESAGEM
              : "Sessão inválida.",
          };
        }
        continue;
      }
      autorizadas.push(fazenda.id);
    }
    const animalId = pedido.animalId != null && pedido.animalId > 0 ? pedido.animalId : undefined;
    const pesagens = await tx.pesagens(titularUserId, animalId);
    if (pesagens.length === 0) return { ok: true, pesagens: [] };
    const ids = [...new Set(pesagens.map((pesagem) => pesagem.animalId))];
    const animais = await tx.animaisDasPesagens(titularUserId, ids);
    const movimentos = await tx.movimentosDosAnimais(titularUserId, ids);
    return {
      ok: true,
      pesagens: filtrarPesagensVisiveis({
        pesagens,
        animais,
        movimentos,
        titularUserId,
        principal,
        fazendasAutorizadas: autorizadas,
      }),
    };
  });
}
