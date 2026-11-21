import { TRPCError } from "@trpc/server";
import { autorizarOperacaoPersistida, type ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import { fazendasDaPesagem, type MovimentoFazendaPesagem } from "./consultaPesagemAutorizada";
import type { MotivoOperacional } from "./contextoOperacional";

/**
 * O lançamento sanitário não tem fazenda própria.
 * Quando houve saída de estoque, a fazenda fica na movimentação daquele dia.
 * Sem movimentação (castração ou manejo sem produto), a fazenda do dia sai
 * do animal e das transferências. No mesmo dia da mudança, as duas fazendas
 * precisam estar concedidas, porque a coluna só guarda a data, sem a hora.
 * Sem transferência registrada, só existe a fazenda atual do animal.
 */
export const PERMISSAO_CONSULTAR_SAUDE = "saude.visualizar";

export const MSG_SEM_PERMISSAO_CONSULTA_SAUDE = "Sem permissão para consultar os lançamentos de saúde.";

export function recusarSaudeSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhum lançamento de saúde foi consultado.",
  });
}

export function fazendasDoAtendimento(entrada: {
  data: string;
  fazendaAtualId: number | null;
  fazendaDoMovimentoId: number | null;
  movimentos: readonly MovimentoFazendaPesagem[];
}): number[] {
  if (entrada.fazendaDoMovimentoId != null && entrada.fazendaDoMovimentoId > 0) {
    return [entrada.fazendaDoMovimentoId];
  }
  return fazendasDaPesagem({
    data: entrada.data,
    fazendaAtualId: entrada.fazendaAtualId,
    movimentos: entrada.movimentos,
  });
}

export type AnimalDaSaude = {
  id: number;
  userId: number;
  fazendaId: number | null;
  brinco: string | null;
  brincoEletronico: string | null;
};

export type SaudeLista = {
  id: number;
  userId: number;
  animalId: number;
  tipo: string;
  descricao: string | null;
  medicamento: string | null;
  dosagem: string | null;
  viaAplicacao: string | null;
  estoqueId: number | null;
  quantidadeConsumo: string | null;
  valorUnitario: string | null;
  veterinario: string | null;
  custo: string | null;
  dataRegistro: string;
  proximaData: string | null;
  observacoes: string | null;
  estoqueMovimentacaoId: number | null;
  status: string | null;
  estornadoEm: Date | string | null;
  motivoEstorno: string | null;
  createdAt: Date | string | null;
  brincoVisual: string | null;
  rfid: string | null;
};

type RegistroBruto = Omit<SaudeLista, "brincoVisual" | "rfid"> & {
  fazendaDoMovimentoId: number | null;
};

export function filtrarSaudeVisivel(entrada: {
  registros: readonly RegistroBruto[];
  animais: readonly AnimalDaSaude[];
  movimentos: readonly (MovimentoFazendaPesagem & { animalId: number })[];
  titularUserId: number;
  principal: boolean;
  fazendasAutorizadas: readonly number[];
}): SaudeLista[] {
  const animais = new Map(entrada.animais.map((animal) => [animal.id, animal]));
  const movimentos = new Map<number, MovimentoFazendaPesagem[]>();
  for (const movimento of entrada.movimentos) {
    const lista = movimentos.get(movimento.animalId) ?? [];
    lista.push(movimento);
    movimentos.set(movimento.animalId, lista);
  }
  const concedidas = new Set(entrada.fazendasAutorizadas);
  const visiveis: SaudeLista[] = [];
  for (const registro of entrada.registros) {
    const animal = animais.get(registro.animalId);
    if (!animal || animal.userId !== entrada.titularUserId) {
      if (!entrada.principal) continue;
    } else if (!entrada.principal) {
      const exigidas = fazendasDoAtendimento({
        data: registro.dataRegistro,
        fazendaAtualId: animal.fazendaId,
        fazendaDoMovimentoId: registro.fazendaDoMovimentoId,
        movimentos: movimentos.get(animal.id) ?? [],
      });
      if (exigidas.length === 0 || !exigidas.every((fazendaId) => concedidas.has(fazendaId))) continue;
    }
    const brincoVisual = String(animal?.brinco ?? "").trim() || null;
    const rfid = String(animal?.brincoEletronico ?? "").trim() || null;
    const { fazendaDoMovimentoId: _fazenda, ...publico } = registro;
    visiveis.push({ ...publico, brincoVisual, rfid });
  }
  return visiveis;
}

export type ConsultaListaSaude = ConsultaAutorizacaoPersistida & {
  registros(titularUserId: number, animalId?: number): Promise<RegistroBruto[]>;
  animaisDosRegistros(titularUserId: number, ids: number[]): Promise<AnimalDaSaude[]>;
  movimentosDosAnimais(
    titularUserId: number,
    ids: number[],
  ): Promise<Array<MovimentoFazendaPesagem & { animalId: number }>>;
};

export type IoListaSaude = {
  emTransacao<T>(fn: (tx: ConsultaListaSaude) => Promise<T>): Promise<T>;
};

export type PedidoListaSaude = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  animalId?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type RecusaListaSaude = {
  ok: false;
  motivo: MotivoOperacional | "sem_permissao";
  mensagem?: string;
};

export async function listarSaudeAutorizada(
  io: IoListaSaude,
  pedido: PedidoListaSaude,
): Promise<{ ok: true; registros: SaudeLista[] } | RecusaListaSaude> {
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
      if (!permissoes.includes(PERMISSAO_CONSULTAR_SAUDE)) {
        return { ok: false, motivo: "sem_permissao", mensagem: MSG_SEM_PERMISSAO_CONSULTA_SAUDE };
      }
    }
    for (const fazenda of fazendas) {
      const decisao = await autorizarOperacaoPersistida(tx, {
        executorId: pedido.executorId,
        sessionVersionDaSessao: pedido.sessionVersionDaSessao,
        permissaoId: PERMISSAO_CONSULTAR_SAUDE,
        fazendaId: fazenda.id,
        titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
        papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
        permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
        fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
      });
      if (!decisao.ok) {
        if (decisao.motivo === "sem_identidade" || decisao.motivo === "sem_permissao") {
          return {
            ok: false,
            motivo: decisao.motivo,
            mensagem: decisao.motivo === "sem_permissao"
              ? MSG_SEM_PERMISSAO_CONSULTA_SAUDE
              : "Sessão inválida.",
          };
        }
        continue;
      }
      autorizadas.push(fazenda.id);
    }
    const animalId = pedido.animalId != null && pedido.animalId > 0 ? pedido.animalId : undefined;
    const registros = await tx.registros(titularUserId, animalId);
    if (registros.length === 0) return { ok: true, registros: [] };
    const ids = [...new Set(registros.map((registro) => registro.animalId))];
    const animais = await tx.animaisDosRegistros(titularUserId, ids);
    const movimentos = await tx.movimentosDosAnimais(titularUserId, ids);
    return {
      ok: true,
      registros: filtrarSaudeVisivel({
        registros,
        animais,
        movimentos,
        titularUserId,
        principal,
        fazendasAutorizadas: autorizadas,
      }),
    };
  });
}
